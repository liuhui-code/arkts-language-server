//! Cache ownership is separate from task pins and published manifest references.
use super::{VersionedFacts, invalid, qualification};
use crate::{ManifestEntry, ManifestValue, QualificationReceipt, map_sqlite_error};
use arkts_index_core::{StoreError, StoreErrorKind};
use rusqlite::{OptionalExtension, TransactionBehavior, params};
impl VersionedFacts {
    pub(crate) fn retain_recent(&mut self, entries: &[ManifestEntry]) -> Result<(), StoreError> {
        if entries.len() > 16 {
            return Err(invalid("reuse metadata batch exceeds 16 transitions"));
        }
        let tx = self
            .log
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(map_sqlite_error)?;
        for entry in entries {
            if entry.uri.is_empty() {
                return Err(invalid("empty reuse URI"));
            }
            let previous: Option<String> = tx
                .query_row(
                    "SELECT version FROM current_file_versions WHERE uri=?1 AND kind='accepted'",
                    [&entry.uri],
                    |r| r.get(0),
                )
                .optional()
                .map_err(map_sqlite_error)?;
            let next = match &entry.value {
                ManifestValue::Accepted(id) => Some(id.as_str()),
                _ => None,
            };
            for id in [previous.as_deref(), next].into_iter().flatten() {
                let exists:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM file_versions WHERE id=?1 AND uri=?2 AND state='sealed')",params![id,entry.uri],|r|r.get(0)).map_err(map_sqlite_error)?;
                if !exists {
                    return Err(StoreError::new(
                        StoreErrorKind::InvalidGeneration,
                        "reuse requires a sealed same-URI version",
                    ));
                }
                tx.execute(
                    "INSERT OR IGNORE INTO version_pins VALUES(?1,?2)",
                    params![self.log.owner.id, id],
                )
                .map_err(map_sqlite_error)?;
            }
            tx.execute("DELETE FROM version_pins WHERE owner=?1 AND version IN (SELECT id FROM file_versions WHERE uri=?2 AND state='sealed') AND version IS NOT ?3 AND version IS NOT ?4",params![self.log.owner.id,entry.uri,previous,next]).map_err(map_sqlite_error)?;
        }
        tx.commit().map_err(map_sqlite_error)
    }
    pub(crate) fn release_absent_reuse(
        &mut self,
        receipt: &QualificationReceipt,
        after: &str,
    ) -> Result<(usize, Option<String>), StoreError> {
        let tx = self
            .log
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(map_sqlite_error)?;
        if qualification::lookup(&tx, &receipt.input)?.as_ref() != Some(receipt) {
            return Err(StoreError::new(
                StoreErrorKind::InvalidGeneration,
                "content reuse retirement requires the current complete qualification",
            ));
        }
        // Page examined pins, not only matching deletions. Re-scanning retained
        // members from the beginning for every 64 deletions would be quadratic.
        let rows = {
            let mut q=tx.prepare("SELECT p.version,EXISTS(SELECT 1 FROM current_file_versions c WHERE c.uri=f.uri AND c.kind!='removed') FROM version_pins p JOIN file_versions f ON f.id=p.version WHERE p.owner=?1 AND p.version>?2 ORDER BY p.version LIMIT 64").map_err(map_sqlite_error)?;
            q.query_map(params![self.log.owner.id, after], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, bool>(1)?))
            })
            .map_err(map_sqlite_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(map_sqlite_error)?
        };
        let mut count = 0;
        for (id, present) in &rows {
            if !present {
                count += tx
                    .execute(
                        "DELETE FROM version_pins WHERE owner=?1 AND version=?2",
                        params![self.log.owner.id, id],
                    )
                    .map_err(map_sqlite_error)?;
            }
        }
        tx.commit().map_err(map_sqlite_error)?;
        Ok((count, rows.last().map(|(id, _)| id.clone())))
    }
}
