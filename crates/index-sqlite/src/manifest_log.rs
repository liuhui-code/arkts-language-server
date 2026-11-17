//! Versioned manifest publication. Not yet wired to production facts or cataloging.
use crate::map_sqlite_error;
use arkts_index_core::{StoreError, StoreErrorKind};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use std::{fs::OpenOptions, path::Path};
#[path = "manifest_publication.rs"]
mod publication;
#[path = "manifest_read_set.rs"]
mod read_set;
pub use read_set::ManifestReadSet;
#[path = "manifest_owner.rs"]
pub(super) mod owner;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ManifestValue {
    Accepted(String),
    Rejected(String),
    Removed,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ManifestEntry {
    pub uri: String,
    pub value: ManifestValue,
}
impl ManifestEntry {
    pub fn accepted(uri: &str, version: &str) -> Self {
        Self {
            uri: uri.into(),
            value: ManifestValue::Accepted(version.into()),
        }
    }
    pub fn rejected(uri: &str, reason: &str) -> Self {
        Self {
            uri: uri.into(),
            value: ManifestValue::Rejected(reason.into()),
        }
    }
    pub fn removed(uri: &str) -> Self {
        Self {
            uri: uri.into(),
            value: ManifestValue::Removed,
        }
    }
    fn columns(&self) -> (&str, Option<&str>, Option<&str>) {
        match &self.value {
            ManifestValue::Accepted(version) => ("accepted", Some(version), None),
            ManifestValue::Rejected(reason) => ("rejected", None, Some(reason)),
            ManifestValue::Removed => ("removed", None, None),
        }
    }
    fn decode(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        let kind: String = row.get(1)?;
        let value = match kind.as_str() {
            "accepted" => ManifestValue::Accepted(row.get(2)?),
            "rejected" => ManifestValue::Rejected(row.get(3)?),
            "removed" => ManifestValue::Removed,
            _ => return Err(rusqlite::Error::InvalidQuery),
        };
        Ok(Self {
            uri: row.get(0)?,
            value,
        })
    }
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ManifestSnapshot {
    pub head: u64,
    pub entries: Vec<ManifestEntry>,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ManifestObservation {
    pub group_id: String,
    pub entry: ManifestEntry,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PublicationWork {
    pub group: String,
    pub head: u64,
    /// SQLite VM steps for the two UPDATE statements, including their triggers.
    /// Excludes preflight reads, BEGIN/COMMIT, filesystem IO and source checks.
    pub update_vm_steps: i32,
}
pub struct ManifestLog {
    pub(super) connection: Connection,
    last_work: Option<PublicationWork>,
    pub(super) owner: owner::OwnerLease,
    _reader: Option<std::fs::File>,
    _workspace: Option<crate::cache_gc::lease::CacheLease>,
}

impl ManifestLog {
    /// Most recent completed non-replayed publication on this connection.
    pub fn last_publication_work(&self) -> Option<&PublicationWork> {
        self.last_work.as_ref()
    }

    pub fn open_existing(
        path: &Path,
        workspace: &str,
        store: &str,
        domain: &str,
    ) -> Result<Self, StoreError> {
        Self::open_checked(path, workspace, store, domain, false)
    }
    pub(super) fn open_checked(
        path: &Path,
        workspace: &str,
        store: &str,
        domain: &str,
        require_facts: bool,
    ) -> Result<Self, StoreError> {
        Self::open_checked_mode(path, workspace, store, domain, require_facts, false)
    }
    pub(super) fn open_previous_for_migration(
        path: &Path,
        workspace: &str,
        store: &str,
        domain: &str,
    ) -> Result<Self, StoreError> {
        Self::open_checked_mode(path, workspace, store, domain, true, true)
    }
    fn open_checked_mode(
        path: &Path,
        workspace: &str,
        store: &str,
        domain: &str,
        require_facts: bool,
        allow_previous: bool,
    ) -> Result<Self, StoreError> {
        let workspace_lease = crate::cache_gc::lease::CacheLease::acquire(path, workspace)
            .map_err(crate::catalog_control::io_error)?;
        let reader_lease = crate::catalog_files::reader_lease(path)?;
        crate::catalog_control::safe_file(path)?;
        let connection =
            Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE)
                .map_err(map_sqlite_error)?;
        let actual: (String, String, String) = connection
            .query_row(
                "SELECT workspace,store,domain FROM manifest_identity WHERE id=1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(map_sqlite_error)?;
        if actual != (workspace.into(), store.into(), domain.into()) {
            return Err(invalid("manifest identity mismatch"));
        }
        let has_facts: bool = connection.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='file_facts_format')", [], |r|r.get(0)).map_err(map_sqlite_error)?;
        let mut previous_legacy_owner = false;
        if require_facts || has_facts {
            let format: i64 = connection
                .query_row("SELECT version FROM file_facts_format", [], |r| r.get(0))
                .map_err(map_sqlite_error)?;
            let previous = allow_previous && super::versioned_facts::is_previous_format(format);
            previous_legacy_owner = previous && format == super::versioned_facts::PREVIOUS_FORMAT;
            if format != super::versioned_facts::FORMAT && !previous {
                return Err(invalid("unsupported file facts format"));
            }
            super::versioned_facts::schema::validate_layout(&connection)?;
            super::versioned_facts::schema::validate_owner_layout(&connection, format)?;
        } else {
            super::versioned_facts::schema::validate_owner_layout(
                &connection,
                super::versioned_facts::FORMAT,
            )?;
        }
        connection
            .execute_batch("PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;")
            .map_err(map_sqlite_error)?;
        let owner = if previous_legacy_owner {
            owner::OwnerLease::acquire_previous(path, &connection)?
        } else {
            owner::OwnerLease::acquire(path, &connection)?
        };
        Ok(Self {
            connection,
            last_work: None,
            owner,
            _reader: reader_lease,
            _workspace: workspace_lease,
        })
    }

    /// Creates an exclusively owned component database, never an existing cache.
    /// Full-format assembly, facts FKs, leases and production activation follow separately.
    pub fn create(
        path: &Path,
        workspace: &str,
        store: &str,
        domain: &str,
    ) -> Result<Self, StoreError> {
        if [workspace, store, domain].iter().any(|s| s.is_empty()) {
            return Err(invalid("empty manifest identity"));
        }
        let workspace_lease = crate::cache_gc::lease::CacheLease::acquire(path, workspace)
            .map_err(crate::catalog_control::io_error)?;
        let reader_lease = crate::catalog_files::reader_lease(path)?;
        let owned = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .map_err(|e| StoreError::new(StoreErrorKind::Io, e.to_string()))?;
        drop(owned);
        let mut connection =
            Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE)
                .map_err(map_sqlite_error)?;
        connection
            .execute_batch(
                "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;",
            )
            .map_err(map_sqlite_error)?;
        let tx = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(map_sqlite_error)?;
        tx.execute_batch("CREATE TABLE manifest_identity(id INTEGER PRIMARY KEY CHECK(id=1), workspace TEXT NOT NULL, store TEXT NOT NULL, domain TEXT NOT NULL, head INTEGER NOT NULL CHECK(head>=0), namespace_epoch INTEGER NOT NULL DEFAULT 0 CHECK(namespace_epoch>=0),owner_revision INTEGER NOT NULL DEFAULT 0 CHECK(owner_revision>=0));
            CREATE TABLE manifest_owners(id TEXT PRIMARY KEY,state TEXT NOT NULL CHECK(state IN ('live','dead')),object_id TEXT NOT NULL,lock_slot TEXT NOT NULL); CREATE UNIQUE INDEX live_owner_slot ON manifest_owners(lock_slot,object_id) WHERE state='live';
            CREATE TABLE manifest_groups(id TEXT PRIMARY KEY, state TEXT NOT NULL CHECK(state IN ('staging','sealed','published','abandoned')), commit_seq INTEGER UNIQUE, owner TEXT NOT NULL, resource_owner TEXT REFERENCES manifest_owners(id), CHECK(resource_owner IS NULL OR resource_owner=owner), CHECK(resource_owner IS NOT NULL OR (state='published' AND commit_seq IS NOT NULL) OR (state='abandoned' AND commit_seq IS NULL)));
            CREATE TABLE manifest_entries(group_id TEXT NOT NULL REFERENCES manifest_groups(id), uri TEXT NOT NULL CHECK(length(uri)>0), kind TEXT NOT NULL CHECK(kind IN ('accepted','rejected','removed')), version TEXT, reason TEXT, CHECK((kind='accepted' AND version IS NOT NULL AND length(version)>0 AND reason IS NULL) OR (kind='rejected' AND version IS NULL AND reason IS NOT NULL AND length(reason)>0) OR (kind='removed' AND version IS NULL AND reason IS NULL)), PRIMARY KEY(group_id,uri));
            CREATE INDEX manifest_uri_group ON manifest_entries(uri,group_id);")
            .map_err(map_sqlite_error)?;
        tx.execute(
            "INSERT INTO manifest_identity(id,workspace,store,domain,head) VALUES(1,?1,?2,?3,0)",
            params![workspace, store, domain],
        )
        .map_err(map_sqlite_error)?;
        tx.commit().map_err(map_sqlite_error)?;
        let owner = owner::OwnerLease::acquire(path, &connection)?;
        Ok(Self {
            connection,
            last_work: None,
            owner,
            _reader: reader_lease,
            _workspace: workspace_lease,
        })
    }

    /// Append one bounded batch. Entries cannot replace earlier entries in this group.
    pub fn stage(&mut self, group: &str, entries: &[ManifestEntry]) -> Result<(), StoreError> {
        if group.is_empty() || entries.is_empty() {
            return Err(invalid("empty manifest batch"));
        }
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(map_sqlite_error)?;
        tx.execute(
            "INSERT OR IGNORE INTO manifest_groups(id,state,owner,resource_owner) VALUES(?1,'staging',?2,?2)",
            params![group, self.owner.id],
        )
        .map_err(map_sqlite_error)?;
        let state: String = tx
            .query_row(
                "SELECT state FROM manifest_groups WHERE id=?1 AND resource_owner=?2",
                params![group, self.owner.id],
                |r| r.get(0),
            )
            .map_err(map_sqlite_error)?;
        if state != "staging" {
            return Err(invalid("manifest group is immutable after seal"));
        }
        for entry in entries {
            let (kind, version, reason) = entry.columns();
            tx.execute(
                "INSERT INTO manifest_entries VALUES(?1,?2,?3,?4,?5)",
                params![group, entry.uri, kind, version, reason],
            )
            .map_err(map_sqlite_error)?;
        }
        tx.commit().map_err(map_sqlite_error)
    }

    pub fn seal(&mut self, group: &str) -> Result<(), StoreError> {
        let changed = self
            .connection
            .execute(
                "UPDATE manifest_groups SET state='sealed' WHERE id=?1 AND state='staging' AND resource_owner=?2",
                params![group,self.owner.id],
            )
            .map_err(map_sqlite_error)?;
        if changed != 1 {
            return Err(invalid("manifest group cannot be sealed"));
        }
        Ok(())
    }

    /// Point lookup retains a tombstone and its publication identity for read-set checks.
    /// It never materializes a workspace-wide active mapping.
    pub fn lookup(&self, uri: &str) -> Result<Option<ManifestObservation>, StoreError> {
        self.connection
            .query_row(
                "SELECT e.uri,e.kind,e.version,e.reason,p.id FROM manifest_entries e
             JOIN manifest_groups p ON p.id=e.group_id
             WHERE e.uri=?1 AND p.state='published'
               AND p.commit_seq<=(SELECT head FROM manifest_identity WHERE id=1)
             ORDER BY p.commit_seq DESC LIMIT 1",
                [uri],
                |row| {
                    Ok(ManifestObservation {
                        group_id: row.get(4)?,
                        entry: ManifestEntry::decode(row)?,
                    })
                },
            )
            .optional()
            .map_err(map_sqlite_error)
    }

    pub fn snapshot(&self) -> Result<ManifestSnapshot, StoreError> {
        let tx = self
            .connection
            .unchecked_transaction()
            .map_err(map_sqlite_error)?;
        let head: i64 = tx
            .query_row("SELECT head FROM manifest_identity WHERE id=1", [], |r| {
                r.get(0)
            })
            .map_err(map_sqlite_error)?;
        let entries = {
            let mut stmt = tx.prepare("SELECT e.uri,e.kind,e.version,e.reason FROM manifest_entries e JOIN manifest_groups p ON p.id=e.group_id
                WHERE p.state='published' AND p.commit_seq<=?1 AND e.kind!='removed'
                AND NOT EXISTS(SELECT 1 FROM manifest_entries n JOIN manifest_groups q ON q.id=n.group_id
                    WHERE n.uri=e.uri AND q.state='published' AND q.commit_seq<=?1 AND q.commit_seq>p.commit_seq)
                ORDER BY e.uri").map_err(map_sqlite_error)?;
            stmt.query_map([head], ManifestEntry::decode)
                .map_err(map_sqlite_error)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(map_sqlite_error)?
        };
        tx.commit().map_err(map_sqlite_error)?;
        Ok(ManifestSnapshot {
            head: head as u64,
            entries,
        })
    }
}
fn invalid(message: &str) -> StoreError {
    StoreError::new(StoreErrorKind::Incompatible, message)
}
