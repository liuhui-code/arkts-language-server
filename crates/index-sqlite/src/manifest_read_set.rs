//! Opaque observations bind expected entries to one physical store and namespace.
use super::{ManifestLog, ManifestObservation, invalid};
use crate::map_sqlite_error;
use arkts_index_core::StoreError;
use std::collections::BTreeSet;
#[derive(Clone, Debug)]
pub struct ManifestReadSet {
    identity: (String, String, String),
    namespace_epoch: i64,
    entries: Vec<(String, Option<ManifestObservation>)>,
}
impl ManifestReadSet {
    pub(in crate::catalog_api) fn observations(&self) -> &[(String, Option<ManifestObservation>)] {
        &self.entries
    }
}
fn identity(c: &rusqlite::Connection) -> Result<(String, String, String), StoreError> {
    c.query_row(
        "SELECT workspace,store,domain FROM manifest_identity WHERE id=1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )
    .map_err(map_sqlite_error)
}
impl ManifestLog {
    pub fn observe_read_set(&self, uris: &[String]) -> Result<ManifestReadSet, StoreError> {
        let tx = self
            .connection
            .unchecked_transaction()
            .map_err(map_sqlite_error)?;
        let result = self.capture_in_snapshot(uris)?;
        tx.commit().map_err(map_sqlite_error)?;
        Ok(result)
    }
    pub(in crate::catalog_api) fn capture_in_snapshot(
        &self,
        uris: &[String],
    ) -> Result<ManifestReadSet, StoreError> {
        if self.connection.is_autocommit()
            || uris.is_empty()
            || uris.iter().any(|u| u.is_empty())
            || uris.iter().collect::<BTreeSet<_>>().len() != uris.len()
        {
            return Err(invalid("invalid manifest read set"));
        }
        let identity = identity(&self.connection)?;
        let namespace_epoch = self
            .connection
            .query_row(
                "SELECT namespace_epoch FROM manifest_identity WHERE id=1",
                [],
                |r| r.get(0),
            )
            .map_err(map_sqlite_error)?;
        let entries = uris
            .iter()
            .map(|u| Ok((u.clone(), self.lookup(u)?)))
            .collect::<Result<_, StoreError>>()?;
        Ok(ManifestReadSet {
            identity,
            namespace_epoch,
            entries,
        })
    }
    /// Rebase only after verifying every observed entry and namespace identity.
    /// All written URIs must be observed. Callers must also include any source
    /// dependencies used for their output; this is not a filesystem witness.
    pub fn publish_checked(
        &mut self,
        group: &str,
        read_set: &ManifestReadSet,
    ) -> Result<u64, StoreError> {
        self.publish_checked_with(group, read_set, || Ok(()))
    }
    pub(in crate::catalog_api) fn publish_checked_with<G>(
        &mut self,
        group: &str,
        read_set: &ManifestReadSet,
        permit: impl FnOnce() -> Result<G, StoreError>,
    ) -> Result<u64, StoreError> {
        let tx = self
            .connection
            .unchecked_transaction()
            .map_err(map_sqlite_error)?;
        if identity(&tx)? != read_set.identity {
            return Err(invalid("read set belongs to another store/domain"));
        }
        if let Some(head) = super::publication::committed(&tx, group)? {
            return Ok(head);
        }
        let head = self.matching_entries(read_set)?;
        let observed: BTreeSet<_> = read_set.entries.iter().map(|(u, _)| u.as_str()).collect();
        {
            let mut statement = tx
                .prepare("SELECT uri FROM manifest_entries WHERE group_id=?1")
                .map_err(map_sqlite_error)?;
            let rows = statement
                .query_map([group], |r| r.get::<_, String>(0))
                .map_err(map_sqlite_error)?;
            for uri in rows {
                if !observed.contains(uri.map_err(map_sqlite_error)?.as_str()) {
                    return Err(invalid("written URI missing from read set"));
                }
            }
        }
        tx.commit().map_err(map_sqlite_error)?;
        // If another writer publishes after the read transaction, the ordinary
        // head CAS rejects. No unbounded retry or automatic source replay.
        self.publish_with(group, head, permit)
    }
    fn matching_entries(&self, read_set: &ManifestReadSet) -> Result<u64, StoreError> {
        let (head, namespace): (i64, i64) = self
            .connection
            .query_row(
                "SELECT head,namespace_epoch FROM manifest_identity WHERE id=1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(map_sqlite_error)?;
        if namespace != read_set.namespace_epoch {
            return Err(invalid("manifest namespace changed"));
        }
        for (uri, expected) in &read_set.entries {
            if &self.lookup(uri)? != expected {
                return Err(invalid("manifest read set changed"));
            }
        }
        Ok(head as u64)
    }
    pub(in crate::catalog_api) fn verify_checked_with<G>(
        &self,
        read_set: &ManifestReadSet,
        permit: impl FnOnce() -> Result<G, StoreError>,
    ) -> Result<u64, StoreError> {
        let tx = self
            .connection
            .unchecked_transaction()
            .map_err(map_sqlite_error)?;
        if identity(&tx)? != read_set.identity {
            return Err(invalid("read set belongs to another store/domain"));
        }
        let head = self.matching_entries(read_set)?;
        let _permit = permit()?;
        tx.commit().map_err(map_sqlite_error)?;
        Ok(head)
    }
}
