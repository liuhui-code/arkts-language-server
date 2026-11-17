use serde::{Serialize, de::DeserializeOwned};
use std::sync::atomic::{AtomicU64, Ordering};
static NEXT_METADATA_TEMP: AtomicU64 = AtomicU64::new(0);

pub fn present_directory(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(_) => {
            directory(path, false)?;
            Ok(true)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::Path,
};

pub fn directory(path: &Path, create: bool) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(meta) => {
            if !meta.is_dir() || unsafe_meta(&meta) {
                return Err("unsafe-directory".into());
            }
            Ok(())
        }
        Err(e) if create && e.kind() == std::io::ErrorKind::NotFound => {
            // A concurrent valid creator is success only after the same no-link/type
            // validation. Never accept an existing file or redirect as a directory.
            match fs::create_dir(path) {
                Ok(()) => (),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => (),
                Err(error) => return Err(error.to_string()),
            }
            directory(path, false)
        }
        Err(e) => Err(e.to_string()),
    }
}

pub fn unsafe_meta(meta: &fs::Metadata) -> bool {
    if meta.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if meta.is_file() && meta.nlink() != 1 {
            return true;
        }
    }
    false
}

pub fn lock_file(path: &Path, create: bool) -> Result<Option<File>, String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if !meta.is_file() || unsafe_meta(&meta) => return Err("unsafe-lock-file".into()),
        Err(e) if !create && e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.to_string()),
        _ => (),
    }
    OpenOptions::new()
        .read(true)
        .write(true)
        .create(create)
        .truncate(false)
        .open(path)
        .map(Some)
        .map_err(|e| e.to_string())
}

pub fn read_json<T: DeserializeOwned>(path: &Path) -> Result<T, String> {
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !metadata.is_file() || unsafe_meta(&metadata) || metadata.len() > 65_536 {
        return Err("unsafe-metadata".into());
    }
    let mut text = String::new();
    File::open(path)
        .map_err(|e| e.to_string())?
        .take(65_537)
        .read_to_string(&mut text)
        .map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

pub fn write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let bytes = serde_json::to_vec(value).map_err(|e| e.to_string())?;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let serial = NEXT_METADATA_TEMP
        .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |n| n.checked_add(1))
        .map_err(|_| "metadata-temporary-sequence-exhausted".to_owned())?;
    let temporary = path.with_extension(format!("tmp-{}-{nonce}-{serial}", std::process::id()));
    // A failed create does not own the path and must never unlink another writer's file.
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|e| e.to_string())?;
    let owned_object = file_object_id(&file)?;
    let result = (|| {
        file.write_all(&bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        drop(file);
        if fs::symlink_metadata(path).is_ok_and(|meta| unsafe_meta(&meta)) {
            return Err("unsafe-metadata-target".into());
        }
        fs::rename(&temporary, path).map_err(|e| e.to_string())
    })();
    if result.is_err()
        && fs::symlink_metadata(&temporary).is_ok_and(|meta| {
            meta.is_file()
                && !unsafe_meta(&meta)
                && object_id(&temporary, &meta).is_ok_and(|id| id == owned_object)
        })
    {
        let _ = fs::remove_file(&temporary);
    }
    result
}

/// Pin directory identity across rename/unlink; a numeric inode cannot be reused
/// while this handle is live. Windows uses the same no-follow directory opening
/// flags as the existing object-id reader.
pub fn directory_handle(path: &Path) -> Result<File, String> {
    directory(path, false)?;
    #[cfg(unix)]
    {
        File::open(path).map_err(|e| e.to_string())
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        OpenOptions::new()
            .access_mode(0)
            .custom_flags(0x0220_0000)
            .open(path)
            .map_err(|e| e.to_string())
    }
}

#[cfg(unix)]
pub fn object_id(_path: &Path, meta: &fs::Metadata) -> Result<String, String> {
    use std::os::unix::fs::MetadataExt;
    Ok(format!("{}:{}", meta.dev(), meta.ino()))
}

#[cfg(windows)]
pub fn object_id(path: &Path, _meta: &fs::Metadata) -> Result<String, String> {
    use std::os::windows::fs::OpenOptionsExt;
    let file = OpenOptions::new()
        .access_mode(0)
        .custom_flags(0x0220_0000)
        .open(path)
        .map_err(|e| e.to_string())?;
    super::windows_identity::file_id(&file)
}

pub fn file_object_id(file: &File) -> Result<String, String> {
    #[cfg(unix)]
    {
        object_id(Path::new(""), &file.metadata().map_err(|e| e.to_string())?)
    }
    #[cfg(windows)]
    {
        super::windows_identity::file_id(file)
    }
}

pub fn snapshot(path: &Path) -> Result<Vec<(String, u64, u128, String)>, String> {
    directory(path, false)?;
    let mut result = Vec::new();
    for item in fs::read_dir(path).map_err(|e| e.to_string())? {
        let item = item.map_err(|e| e.to_string())?;
        let meta = fs::symlink_metadata(item.path()).map_err(|e| e.to_string())?;
        let name = item.file_name().to_string_lossy().to_string();
        if name.strip_suffix(".owners").is_some_and(|database| {
            database == "symbols-v2.sqlite3"
                || crate::catalog_control::generation_database(database)
        }) {
            super::owner_snapshot::append(&item.path(), &name, &mut result)?;
            continue;
        }
        if ![
            "symbols-v2.sqlite3",
            "symbols-v2.sqlite3-wal",
            "symbols-v2.sqlite3-shm",
            "symbols-v2.sqlite3-journal",
            "cache-use.json",
            "retired.json",
        ]
        .contains(&name.as_str())
            && !catalog_file(&name)
            || !meta.is_file()
            || unsafe_meta(&meta)
        {
            return Err("unsafe-cache-entry".into());
        }
        let modified = meta
            .modified()
            .map_err(|e| e.to_string())?
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos();
        result.push((name, meta.len(), modified, object_id(&item.path(), &meta)?));
    }
    result.sort();
    Ok(result)
}

// Flat generation files keep the existing workspace namespace lease and whole-group GC.
fn catalog_file(name: &str) -> bool {
    if name == "catalog-publication.lock" {
        return true;
    }
    let database = name
        .strip_suffix("-wal")
        .or_else(|| name.strip_suffix("-shm"))
        .or_else(|| name.strip_suffix("-journal"))
        .or_else(|| name.strip_suffix(".lease"))
        .unwrap_or(name);
    database == "symbols-v2.sqlite3"
        || database == "catalog-state.sqlite3"
        || crate::catalog_control::generation_database(database)
}
