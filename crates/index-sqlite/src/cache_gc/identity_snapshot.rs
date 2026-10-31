//! WAL-aware metadata probes use a bounded PRIVATE copy, never sqlite3_open on the user's WAL.
use super::{files, inspect};
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::Read,
    path::{Path, PathBuf},
};

const MEMBERS: [&str; 3] = [
    "snapshot.sqlite3",
    "snapshot.sqlite3-wal",
    "snapshot.sqlite3-shm",
];
#[derive(Serialize, Deserialize)]
struct Format {
    schema: String,
}

struct Snapshot {
    root: PathBuf,
    _lease: File,
}

impl Snapshot {
    fn acquire() -> Result<Self, String> {
        #[cfg(unix)]
        let suffix = format!("-{}", unsafe { libc::geteuid() });
        #[cfg(windows)]
        let suffix = "";
        let root = std::env::temp_dir().join(format!("arkts-index-cache-inspection-v1{suffix}"));
        let created = match fs::create_dir(&root) {
            Ok(()) => true,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => false,
            Err(e) => return Err(e.to_string()),
        };
        #[cfg(unix)]
        {
            use std::os::unix::fs::{MetadataExt, PermissionsExt};
            if created {
                fs::set_permissions(&root, fs::Permissions::from_mode(0o700))
                    .map_err(|e| e.to_string())?;
            }
            let meta = fs::symlink_metadata(&root).map_err(|e| e.to_string())?;
            if meta.uid() != unsafe { libc::geteuid() } || meta.mode() & 0o077 != 0 {
                return Err("unsafe-inspection-owner".into());
            }
        }
        files::directory(&root, false)?;
        let lease = files::lock_file(&root.join("lease.lock"), true)?.unwrap();
        lease.try_lock().map_err(|_| "identity-inspection-busy")?;
        for item in fs::read_dir(&root).map_err(|e| e.to_string())? {
            let item = item.map_err(|e| e.to_string())?;
            let name = item.file_name().to_string_lossy().to_string();
            let meta = fs::symlink_metadata(item.path()).map_err(|e| e.to_string())?;
            if !meta.is_file()
                || files::unsafe_meta(&meta)
                || (!MEMBERS.contains(&name.as_str())
                    && !["format.json", "lease.lock"].contains(&name.as_str()))
            {
                return Err("unsafe-inspection-entry".into());
            }
        }
        let format = root.join("format.json");
        if format.exists() {
            let format: Format = files::read_json(&format)?;
            if format.schema != "arkts.index-cache-inspection.v1" {
                return Err("unknown-inspection-format".into());
            }
        } else {
            if !created && MEMBERS.iter().any(|name| root.join(name).exists()) {
                return Err("unowned-inspection-files".into());
            }
            files::write_json(
                &format,
                &Format {
                    schema: "arkts.index-cache-inspection.v1".into(),
                },
            )?;
        }
        let snapshot = Self {
            root,
            _lease: lease,
        };
        snapshot.clean()?;
        Ok(snapshot)
    }

    fn clean(&self) -> Result<(), String> {
        for name in MEMBERS {
            let path = self.root.join(name);
            match fs::symlink_metadata(&path) {
                Ok(meta) => {
                    if !meta.is_file() || files::unsafe_meta(&meta) {
                        return Err("unsafe-inspection-member".into());
                    }
                    fs::remove_file(path).map_err(|e| e.to_string())?;
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
                Err(e) => return Err(e.to_string()),
            }
        }
        Ok(())
    }
}

impl Drop for Snapshot {
    fn drop(&mut self) {
        if let Err(error) = self.clean() {
            eprintln!("index.cache.inspection.cleanup.failed: {error}");
        }
    }
}

pub(super) fn identity(database: &Path, limit: u64) -> Result<String, String> {
    let wal = database.with_file_name(format!(
        "{}-wal",
        database.file_name().unwrap_or_default().to_string_lossy()
    ));
    let required = database
        .metadata()
        .map_err(|e| e.to_string())?
        .len()
        .checked_add(wal.metadata().map_err(|e| e.to_string())?.len())
        .ok_or("identity-snapshot-too-large")?;
    if required > limit {
        return Err("identity-snapshot-budget-exceeded".into());
    }
    let snapshot = Snapshot::acquire()?;
    let mut remaining = limit;
    for (source, target) in [(database, MEMBERS[0]), (wal.as_path(), MEMBERS[1])] {
        let mut input = File::open(source)
            .map_err(|e| e.to_string())?
            .take(remaining.saturating_add(1));
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(snapshot.root.join(target))
            .map_err(|e| e.to_string())?;
        let bytes = std::io::copy(&mut input, &mut output).map_err(|e| e.to_string())?;
        remaining = remaining
            .checked_sub(bytes)
            .ok_or("identity-snapshot-budget-exceeded")?;
    }
    let connection = Connection::open_with_flags(
        snapshot.root.join(MEMBERS[0]),
        OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|e| format!("identity-snapshot-unreadable: {e}"))?;
    let identity = inspect::metadata_identity(&connection);
    drop(connection);
    identity
}
