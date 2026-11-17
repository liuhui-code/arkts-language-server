//! Inventory only the producer's known immutable lock namespace. No arbitrary
//! recursive directories, symlinks, reparse points or hard-linked files qualify.
use super::files;
use std::{fs, path::Path, time::UNIX_EPOCH};

type Entry = (String, u64, u128, String);

pub(super) fn append(path: &Path, name: &str, into: &mut Vec<Entry>) -> Result<(), String> {
    files::directory(path, false)?;
    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    // A partial sweep changes directory mtime/size itself. Its stable object
    // identity plus the individually enumerated children is the actual fence.
    into.push((name.into(), 0, 0, files::object_id(path, &meta)?));
    for item in fs::read_dir(path).map_err(|e| e.to_string())? {
        let item = item.map_err(|e| e.to_string())?;
        let id = item
            .file_name()
            .into_string()
            .map_err(|_| "unsafe-owner-entry")?;
        let parts: Vec<_> = id.split('-').collect();
        let meta = fs::symlink_metadata(item.path()).map_err(|e| e.to_string())?;
        if parts.len() != 3
            || parts.iter().any(|part| {
                part.is_empty()
                    || !part
                        .bytes()
                        .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            })
            || meta.len() != 0
            || !meta.is_file()
            || files::unsafe_meta(&meta)
        {
            return Err("unsafe-owner-entry".into());
        }
        let modified = meta
            .modified()
            .map_err(|e| e.to_string())?
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos();
        into.push((
            format!("{name}/{id}"),
            meta.len(),
            modified,
            files::object_id(&item.path(), &meta)?,
        ));
    }
    Ok(())
}
