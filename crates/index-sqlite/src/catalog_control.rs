//! A small, FULL-synchronous SQLite transaction publishes a sealed database.
//! The publication lock also orders incremental writers in other processes.
use crate::{cache_gc::lease::CacheLease, map_sqlite_error, sqlite_generation};
use arkts_index_core::{StoreError, StoreErrorKind};
use rusqlite::{Connection, OpenFlags, TransactionBehavior, params};
use std::{
    fs::{self, File},
    path::{Path, PathBuf},
    time::Duration,
};

pub(super) struct Control {
    connection: Connection,
    pub base: PathBuf,
    _lease: Option<CacheLease>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct Publication {
    pub database: String,
    pub generation: u64,
}

pub(super) struct PublicationGuard(File);

impl Drop for PublicationGuard {
    fn drop(&mut self) {
        let _ = self.0.unlock();
    }
}

impl Control {
    /// Retirement must never recreate a workspace that has been removed meanwhile.
    pub fn open_existing(
        base: &Path,
        identity: &str,
        lease: Option<CacheLease>,
    ) -> Result<Self, StoreError> {
        let path = base.with_file_name("catalog-state.sqlite3");
        safe_file(&path)?;
        let connection = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(map_sqlite_error)?;
        connection
            .busy_timeout(Duration::from_secs(5))
            .map_err(map_sqlite_error)?;
        let actual: String = connection
            .query_row(
                "SELECT workspace_identity FROM catalog_state WHERE id=1",
                [],
                |r| r.get(0),
            )
            .map_err(map_sqlite_error)?;
        if actual != identity {
            return Err(incompatible("retired catalog identity mismatch"));
        }
        Ok(Self {
            connection,
            base: base.to_owned(),
            _lease: lease,
        })
    }

    pub fn open(base: &Path, identity: &str) -> Result<Self, StoreError> {
        if base
            .file_name()
            .is_none_or(|name| name != "symbols-v2.sqlite3")
        {
            return Err(incompatible("catalog base must be symbols-v2.sqlite3"));
        }
        let lease = CacheLease::acquire(base, identity).map_err(io_error)?;
        fs::create_dir_all(
            base.parent()
                .ok_or_else(|| incompatible("missing cache directory"))?,
        )
        .map_err(io_error)?;
        let guard = lock(base, true)?;
        let path = base.with_file_name("catalog-state.sqlite3");
        safe_file(&path)?;
        if !path.exists()
            && fs::read_dir(base.parent().unwrap())
                .map_err(io_error)?
                .filter_map(Result::ok)
                .any(|entry| entry.file_name().to_str().is_some_and(generation_database))
        {
            return Err(incompatible(
                "catalog publication state is missing; refusing to expose or discard unowned generations",
            ));
        }
        let connection = Connection::open(path).map_err(map_sqlite_error)?;
        connection
            .busy_timeout(Duration::from_secs(5))
            .map_err(map_sqlite_error)?;
        connection
            .execute_batch(
                "PRAGMA synchronous=FULL;\
             CREATE TABLE IF NOT EXISTS catalog_state(\
               id INTEGER PRIMARY KEY CHECK(id=1), workspace_identity TEXT NOT NULL,\
               database_name TEXT NOT NULL, published_generation INTEGER NOT NULL,\
               fingerprint TEXT);",
            )
            .map_err(map_sqlite_error)?;
        connection
            .execute(
                "INSERT OR IGNORE INTO catalog_state VALUES(1,?1,'symbols-v2.sqlite3',0,NULL)",
                [identity],
            )
            .map_err(map_sqlite_error)?;
        let actual: String = connection
            .query_row(
                "SELECT workspace_identity FROM catalog_state WHERE id=1",
                [],
                |r| r.get(0),
            )
            .map_err(map_sqlite_error)?;
        if actual != identity {
            return Err(StoreError::new(
                StoreErrorKind::WorkspaceMismatch,
                "catalog control identity mismatch",
            ));
        }
        drop(guard);
        let control = Self {
            connection,
            base: base.to_owned(),
            _lease: lease,
        };
        control.active()?;
        Ok(control)
    }

    pub fn shared(&self) -> Result<PublicationGuard, StoreError> {
        lock(&self.base, false)
    }
    pub fn exclusive(&self) -> Result<PublicationGuard, StoreError> {
        lock(&self.base, true)
    }

    pub fn active(&self) -> Result<Publication, StoreError> {
        let (database, generation): (String, i64) = self
            .connection
            .query_row(
                "SELECT database_name,published_generation FROM catalog_state WHERE id=1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(map_sqlite_error)?;
        if (database != "symbols-v2.sqlite3" && !generation_database(&database)) || generation < 0 {
            return Err(incompatible("invalid active catalog publication"));
        }
        Ok(Publication {
            database,
            generation: generation as u64,
        })
    }

    pub fn path(&self, publication: &Publication) -> PathBuf {
        self.base.with_file_name(&publication.database)
    }

    /// Caller holds the exclusive publication lock and has checked the base generation.
    pub fn publish(
        &mut self,
        database: &str,
        generation: u64,
        fingerprint: Option<&str>,
    ) -> Result<(), StoreError> {
        if !generation_database(database) {
            return Err(incompatible("invalid catalog database name"));
        }
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(map_sqlite_error)?;
        tx.execute(
            "UPDATE catalog_state SET database_name=?1,published_generation=?2,fingerprint=?3 WHERE id=1",
            params![database, sqlite_generation(generation)?, fingerprint],
        ).map_err(map_sqlite_error)?;
        tx.commit().map_err(map_sqlite_error)
    }

    pub fn fingerprint(&self) -> Result<Option<String>, StoreError> {
        self.connection
            .query_row(
                "SELECT fingerprint FROM catalog_state WHERE id=1",
                [],
                |r| r.get(0),
            )
            .map_err(map_sqlite_error)
    }

    /// Invalidating before an ordinary write is conservative if that write fails.
    pub fn invalidate_fingerprint(&self) -> Result<(), StoreError> {
        self.connection
            .execute(
                "UPDATE catalog_state SET fingerprint=NULL WHERE id=1 AND fingerprint IS NOT NULL",
                [],
            )
            .map(|_| ())
            .map_err(map_sqlite_error)
    }
}

fn lock(base: &Path, exclusive: bool) -> Result<PublicationGuard, StoreError> {
    let path = base.with_file_name("catalog-publication.lock");
    safe_file(&path)?;
    let file = fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(path)
        .map_err(io_error)?;
    if exclusive {
        file.lock()
    } else {
        file.lock_shared()
    }
    .map_err(io_error)?;
    Ok(PublicationGuard(file))
}

pub(super) fn generation_database(name: &str) -> bool {
    let Some(stem) = name
        .strip_prefix("catalog-")
        .and_then(|s| s.strip_suffix(".sqlite3"))
    else {
        return false;
    };
    let parts: Vec<_> = stem.split('-').collect();
    parts.len() == 3
        && parts.iter().all(|part| {
            !part.is_empty() && part.len() <= 32 && part.bytes().all(|b| b.is_ascii_hexdigit())
        })
}

pub(super) fn safe_file(path: &Path) -> Result<(), StoreError> {
    match fs::symlink_metadata(path) {
        Ok(meta) if !meta.is_file() || crate::cache_gc::files::unsafe_meta(&meta) => {
            Err(incompatible("unsafe catalog file"))
        }
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(io_error(error)),
    }
}

pub(super) fn io_error(error: impl std::fmt::Display) -> StoreError {
    StoreError::new(StoreErrorKind::Io, error.to_string())
}
pub(super) fn incompatible(message: &str) -> StoreError {
    StoreError::new(StoreErrorKind::Incompatible, message)
}
