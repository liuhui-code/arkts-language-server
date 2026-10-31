use crate::{
    SqliteStore,
    cache_gc::sqlite_guard::SqliteGuard,
    catalog_control::{Control, generation_database, io_error, safe_file},
};
use arkts_index_core::StoreError;
use std::{
    collections::BTreeSet,
    fs::{self, File, OpenOptions},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

static NEXT_BUILD: AtomicU64 = AtomicU64::new(0);

/// Every generation connection pins its group until sqlite3_close. The legacy
/// database joins this protocol once a publication control database exists.
pub(super) fn reader_lease(database: &Path) -> Result<Option<File>, StoreError> {
    let name = database.file_name().and_then(|s| s.to_str()).unwrap_or("");
    if !generation_database(name)
        && !(name == "symbols-v2.sqlite3"
            && database.with_file_name("catalog-state.sqlite3").exists())
    {
        return Ok(None);
    }
    let file = lease(database)?;
    file.lock_shared().map_err(io_error)?;
    Ok(Some(file))
}

fn lease(database: &Path) -> Result<File, StoreError> {
    let path = database.with_extension("sqlite3.lease");
    safe_file(&path)?;
    OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(path)
        .map_err(io_error)
}

pub(super) fn new_database(base: &Path) -> Result<PathBuf, StoreError> {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(io_error)?
        .as_nanos();
    let serial = NEXT_BUILD.fetch_add(1, Ordering::Relaxed);
    let path = base.with_file_name(format!(
        "catalog-{:x}-{nonce:x}-{serial:x}.sqlite3",
        std::process::id()
    ));
    OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&path)
        .map_err(io_error)?;
    Ok(path)
}

/// Closing a legacy WAL can be slow; retirement and pruning stay off the query loop.
pub(super) fn retire(store: SqliteStore, base: PathBuf, identity: String) {
    let lease = crate::cache_gc::lease::CacheLease::acquire(&base, &identity);
    let _ = std::thread::Builder::new()
        .name("arkts-catalog-retire".into())
        .spawn(move || {
            drop(store);
            if let Ok(lease) = lease
                && let Ok(control) = Control::open_existing(&base, &identity, lease)
                && let Ok(_guard) = control.exclusive()
            {
                prune(&control);
            }
        });
}

/// Caller holds the exclusive publication lock. Both reader leases and SQLite
/// byte locks must be free. Never remove a WAL after its DB could not be removed.
pub(super) fn prune(control: &Control) {
    let Ok(active) = control.active() else {
        return;
    };
    let Some(directory) = control.base.parent() else {
        return;
    };
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    let mut groups = BTreeSet::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        // Keep lock inodes stable for a racing low-level opener. Empty lease
        // markers are reclaimed by whole-workspace GC, not by generation pruning.
        if name.ends_with(".lease") {
            continue;
        }
        let database = name
            .strip_suffix("-wal")
            .or_else(|| name.strip_suffix("-shm"))
            .or_else(|| name.strip_suffix("-journal"))
            .or_else(|| name.strip_suffix(".lease"))
            .unwrap_or(&name);
        if generation_database(database) || database == "symbols-v2.sqlite3" {
            groups.insert(database.to_owned());
        }
    }
    for name in groups {
        if name == active.database {
            continue;
        }
        let database = directory.join(&name);
        let Ok(reader_lease) = lease(&database) else {
            continue;
        };
        if reader_lease.try_lock().is_err() {
            continue;
        }
        let files: Vec<_> = ["", "-wal", "-shm", "-journal"]
            .iter()
            .map(|suffix| directory.join(format!("{name}{suffix}")))
            .collect();
        if files.iter().any(|path| safe_file(path).is_err()) {
            continue;
        }
        let sqlite = if database.exists() {
            let Ok(guard) = SqliteGuard::acquire(&database) else {
                continue;
            };
            Some(guard)
        } else {
            None
        };
        // Windows deletion rejects a racing external opener after this release.
        #[cfg(windows)]
        drop(sqlite);
        #[cfg(unix)]
        let _sqlite = sqlite;
        let mut removed = true;
        for file in files {
            if let Err(error) = fs::remove_file(file)
                && error.kind() != std::io::ErrorKind::NotFound
            {
                removed = false;
                break;
            }
        }
        if !removed {
            eprintln!("{{\"event\":\"index.catalog.retirement.deferred\"}}");
        }
    }
}

pub(super) fn sync_parent(database: &Path) -> Result<(), StoreError> {
    #[cfg(unix)]
    File::open(database.parent().unwrap())
        .and_then(|directory| directory.sync_all())
        .map_err(io_error)?;
    #[cfg(windows)]
    let _ = database; // SQLite's FULL control transaction uses the Windows VFS sync protocol.
    Ok(())
}
