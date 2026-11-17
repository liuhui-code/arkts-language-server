//! Private migration retry reclamation. Never applied to a selected data store.
use super::{VersionedFacts, invalid};
use crate::map_sqlite_error;
use arkts_index_core::{StoreError, StoreErrorKind};
use rusqlite::{TransactionBehavior, params};

#[derive(Clone, Debug, Default)]
pub struct DraftReclamation {
    pub quanta: usize,
    pub groups_abandoned: usize,
    pub pins_released: usize,
    pub facts_deleted: usize,
    pub versions_deleted: usize,
}
fn check(current: &mut impl FnMut() -> bool) -> Result<(), StoreError> {
    if current() {
        Ok(())
    } else {
        Err(StoreError::new(
            StoreErrorKind::Cancelled,
            "private draft reclamation cancelled",
        ))
    }
}
impl VersionedFacts {
    pub(crate) fn reclaim_private_draft(
        &mut self,
        keep: &[String],
        mut current: impl FnMut() -> bool,
    ) -> Result<DraftReclamation, StoreError> {
        check(&mut current)?;
        let c = &mut self.log.connection;
        c.execute_batch("CREATE TEMP TABLE IF NOT EXISTS draft_keep(id TEXT PRIMARY KEY); DELETE FROM draft_keep;")
            .map_err(map_sqlite_error)?;
        // Build the complete desired pin set before relinquishing anything.
        for batch in keep.chunks(64) {
            check(&mut current)?;
            let tx = c
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(map_sqlite_error)?;
            for id in batch {
                let valid: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM file_versions f JOIN version_pins p ON p.version=f.id WHERE f.id=?1 AND f.state='sealed' AND p.owner=?2)", params![id, self.log.owner.id], |r| r.get(0)).map_err(map_sqlite_error)?;
                if !valid {
                    return Err(invalid("draft reuse requires an owned sealed version"));
                }
                tx.execute("INSERT OR IGNORE INTO draft_keep VALUES(?1)", [id])
                    .map_err(map_sqlite_error)?;
            }
            tx.commit().map_err(map_sqlite_error)?;
        }
        let mut report = DraftReclamation::default();
        // Each metadata writer quantum changes <=64 rows. Published mappings
        // remain protected; only this private owner's unadmitted groups abort.
        for phase in 0..3 {
            loop {
                check(&mut current)?;
                let tx = c
                    .transaction_with_behavior(TransactionBehavior::Immediate)
                    .map_err(map_sqlite_error)?;
                let sql = match phase {
                    0 => {
                        "UPDATE manifest_groups SET state='abandoned' WHERE id IN (SELECT id FROM manifest_groups WHERE resource_owner=?1 AND state IN ('staging','sealed') LIMIT 64)"
                    }
                    1 => {
                        "DELETE FROM version_pins WHERE owner=?1 AND version IN (SELECT version FROM version_pins WHERE owner=?1 AND NOT EXISTS(SELECT 1 FROM draft_keep k WHERE k.id=version) LIMIT 64)"
                    }
                    _ => {
                        "UPDATE file_versions SET state='collecting' WHERE id IN (SELECT f.id FROM file_versions f WHERE f.creator=?1 AND f.state='staging' AND NOT EXISTS(SELECT 1 FROM version_pins p WHERE p.version=f.id) AND NOT EXISTS(SELECT 1 FROM manifest_entries e WHERE e.version=f.id) LIMIT 64)"
                    }
                };
                let n = tx
                    .execute(sql, [&self.log.owner.id])
                    .map_err(map_sqlite_error)?;
                tx.commit().map_err(map_sqlite_error)?;
                report.quanta += 1;
                if phase == 0 {
                    report.groups_abandoned += n;
                }
                if phase == 1 {
                    report.pins_released += n;
                }
                if n == 0 {
                    break;
                }
            }
        }
        loop {
            check(&mut current)?;
            let gc = self.collect_garbage(4096)?;
            report.quanta += 1;
            report.facts_deleted += gc.facts_deleted;
            report.versions_deleted += gc.versions_deleted;
            if gc.work_items == 0 {
                break;
            }
        }
        // GC may just have removed abandoned entries that protected a partial
        // version above. Release those now, then drain them before new writes.
        loop {
            check(&mut current)?;
            let ids = {
                let mut q = self.log.connection.prepare("SELECT id FROM file_versions f WHERE f.creator=?1 AND f.state='staging' AND NOT EXISTS(SELECT 1 FROM version_pins p WHERE p.version=f.id) AND NOT EXISTS(SELECT 1 FROM manifest_entries e WHERE e.version=f.id) LIMIT 64").map_err(map_sqlite_error)?;
                q.query_map([&self.log.owner.id], |r| r.get::<_, String>(0))
                    .map_err(map_sqlite_error)?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(map_sqlite_error)?
            };
            if ids.is_empty() {
                break;
            }
            for id in ids {
                check(&mut current)?;
                self.release_version(&id)?;
            }
            loop {
                check(&mut current)?;
                let gc = self.collect_garbage(4096)?;
                report.quanta += 1;
                report.facts_deleted += gc.facts_deleted;
                report.versions_deleted += gc.versions_deleted;
                if gc.work_items == 0 {
                    break;
                }
            }
        }
        Ok(report)
    }
}
