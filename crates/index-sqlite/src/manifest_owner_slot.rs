//! Reuse idle immutable lock objects; file names never identify logical leases.
use crate::catalog_control::io_error;
use arkts_index_core::StoreError;
use std::{
    fs::{File, OpenOptions},
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
static NEXT: AtomicU64 = AtomicU64::new(0);

pub(super) fn valid_name(name: &str) -> bool {
    let parts: Vec<_> = name.split('-').collect();
    parts.len() == 3
        && parts.iter().all(|p| {
            !p.is_empty()
                && p.bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        })
}
pub(super) fn acquire(directory: &Path) -> Result<(String, File), StoreError> {
    let mut entries = std::fs::read_dir(directory)
        .map_err(io_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(io_error)?;
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        if !valid_name(&name) {
            continue;
        }
        let meta = match std::fs::symlink_metadata(entry.path()) {
            Ok(meta) => meta,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(e) => return Err(io_error(e)),
        };
        if !meta.is_file() || meta.len() != 0 || crate::cache_gc::files::unsafe_meta(&meta) {
            continue;
        }
        let Some(file) =
            crate::cache_gc::files::lock_file(&entry.path(), false).map_err(io_error)?
        else {
            continue;
        };
        let object = crate::cache_gc::files::file_object_id(&file).map_err(io_error)?;
        match file.try_lock() {
            Ok(()) => {
                // Opening an existing path must not silently adopt a redirect
                // or replacement between metadata inspection and lock proof.
                crate::cache_gc::files::directory(directory, false).map_err(io_error)?;
                let now = std::fs::symlink_metadata(entry.path()).map_err(io_error)?;
                if !now.is_file()
                    || now.len() != 0
                    || crate::cache_gc::files::unsafe_meta(&now)
                    || crate::cache_gc::files::object_id(&entry.path(), &now).map_err(io_error)?
                        != object
                {
                    continue;
                }
                return Ok((name, file));
            }
            Err(std::fs::TryLockError::WouldBlock) => (),
            Err(std::fs::TryLockError::Error(e)) => return Err(io_error(e)),
        }
    }
    fresh(directory)
}

/// Previous-format parents retain their unique-file lease ABI.
pub(super) fn fresh(directory: &Path) -> Result<(String, File), StoreError> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(io_error)?
        .as_nanos();
    let name = format!(
        "{:x}-{now:x}-{:x}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    );
    let file = OpenOptions::new()
        .create_new(true)
        .read(true)
        .write(true)
        .open(directory.join(&name))
        .map_err(io_error)?;
    // A peer can observe the new object before this call. Never block while
    // claiming it: contention is an explicit retryable acquisition error.
    file.try_lock().map_err(io_error)?;
    Ok((name, file))
}
