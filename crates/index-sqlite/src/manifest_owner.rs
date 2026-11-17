//! Stable OS lock slots and non-reused, data-store-local logical owner identities.
use crate::{catalog_control::io_error, map_sqlite_error};
use arkts_index_core::StoreError;
use rusqlite::Connection;
use std::{
    fs::File,
    path::{Path, PathBuf},
};
#[path = "manifest_owner_slot.rs"]
mod slot;

pub(in crate::catalog_api) struct OwnerLease {
    pub id: String,
    directory: PathBuf,
    _file: File,
}
impl OwnerLease {
    pub fn acquire(database: &Path, c: &Connection) -> Result<Self, StoreError> {
        let mut name = database
            .file_name()
            .ok_or_else(|| io_error("missing database name"))?
            .to_os_string();
        name.push(".owners");
        let directory = database.with_file_name(name);
        match crate::cache_gc::files::directory(&directory, true) {
            Ok(()) => (),
            Err(_) => crate::cache_gc::files::directory(&directory, false).map_err(io_error)?,
        }
        // Nonblocking OS acquisition precedes every SQLite transaction. Slots
        // are never unlinked or renamed; each new lease gets a distinct SQL ID.
        let (lock_slot, file) = slot::acquire(&directory)?;
        let object = crate::cache_gc::files::file_object_id(&file).map_err(io_error)?;
        let tx = c.unchecked_transaction().map_err(map_sqlite_error)?;
        let changed = tx.execute("UPDATE manifest_identity SET owner_revision=owner_revision+1 WHERE id=1 AND owner_revision<9223372036854775807", []).map_err(map_sqlite_error)?;
        if changed != 1 {
            return Err(io_error("owner identity sequence exhausted"));
        }
        let revision: i64 = tx
            .query_row(
                "SELECT owner_revision FROM manifest_identity WHERE id=1",
                [],
                |r| r.get(0),
            )
            .map_err(map_sqlite_error)?;
        let id = format!("0-{revision:x}-0");
        // The held exclusive lock proves earlier incarnations on this exact
        // object ended. A replaced inode never proves death of its predecessor.
        tx.execute("UPDATE manifest_owners SET state='dead' WHERE lock_slot=?1 AND object_id=?2 AND state='live'", rusqlite::params![lock_slot,object]).map_err(map_sqlite_error)?;
        tx.execute(
            "INSERT INTO manifest_owners(id,state,object_id,lock_slot) VALUES(?1,'live',?2,?3)",
            rusqlite::params![id, object, lock_slot],
        )
        .map_err(map_sqlite_error)?;
        tx.commit().map_err(map_sqlite_error)?;
        Ok(Self {
            id,
            directory,
            _file: file,
        })
    }
    /// Known previous layout only: a fresh unique filename is the logical ID.
    /// Never write slot/counter columns that do not exist in that layout.
    pub fn acquire_previous(database: &Path, c: &Connection) -> Result<Self, StoreError> {
        let mut name = database
            .file_name()
            .ok_or_else(|| io_error("missing database name"))?
            .to_os_string();
        name.push(".owners");
        let directory = database.with_file_name(name);
        crate::cache_gc::files::directory(&directory, true).map_err(io_error)?;
        let (id, file) = slot::fresh(&directory)?;
        let object = crate::cache_gc::files::file_object_id(&file).map_err(io_error)?;
        c.execute(
            "INSERT INTO manifest_owners(id,state,object_id) VALUES(?1,'live',?2)",
            rusqlite::params![id, object],
        )
        .map_err(map_sqlite_error)?;
        Ok(Self {
            id,
            directory,
            _file: file,
        })
    }
    /// Missing, unsafe or replaced slots are not evidence of death. A guard
    /// remains held through the caller's SQL transaction, excluding new leases.
    pub fn try_dead(
        &self,
        lock_slot: &str,
        expected_object: &str,
    ) -> Result<Option<File>, StoreError> {
        if !slot::valid_name(lock_slot) {
            return Err(io_error("invalid owner slot identity"));
        }
        crate::cache_gc::files::directory(&self.directory, false).map_err(io_error)?;
        let Some(file) = crate::cache_gc::files::lock_file(&self.directory.join(lock_slot), false)
            .map_err(io_error)?
        else {
            return Ok(None);
        };
        if crate::cache_gc::files::file_object_id(&file).map_err(io_error)? != expected_object {
            return Ok(None);
        }
        match file.try_lock() {
            Ok(()) => Ok(Some(file)),
            Err(std::fs::TryLockError::WouldBlock) => Ok(None),
            Err(std::fs::TryLockError::Error(e)) => Err(io_error(e)),
        }
    }
}
