//! Bounded logical GC. SQLite read transactions retain old pages; no VACUUM here.
use super::{VersionedFacts, invalid};
use crate::map_sqlite_error;
use arkts_index_core::StoreError;
use rusqlite::{OptionalExtension, Transaction, TransactionBehavior, params};
#[derive(Clone, Debug, Default)]
pub struct VersionGcReport {
    pub work_items: usize,
    pub owners_examined: usize,
    pub owner_scan_wrapped: bool,
    pub owners_recovered: usize,
    pub owners_deleted: usize,
    pub groups_abandoned: usize,
    pub group_owners_detached: usize,
    pub pins_deleted: usize,
    pub entries_deleted: usize,
    pub facts_deleted: usize,
    pub estimated_fact_bytes: usize,
    pub versions_deleted: usize,
    pub qualifications_deleted: usize,
}
impl VersionedFacts {
    pub fn release_version(&mut self, id: &str) -> Result<(), StoreError> {
        let tx = self
            .log
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(map_sqlite_error)?;
        tx.execute(
            "DELETE FROM version_pins WHERE owner=?1 AND version=?2",
            params![self.log.owner.id, id],
        )
        .map_err(map_sqlite_error)?;
        // The creating task may relinquish its own failed partial write while
        // the connection remains healthy. Other owners cannot abort that task.
        tx.execute("UPDATE file_versions SET state='collecting' WHERE id=?1 AND state='staging' AND creator=?2 AND NOT EXISTS(SELECT 1 FROM version_pins WHERE version=?1) AND NOT EXISTS(SELECT 1 FROM manifest_entries WHERE version=?1)",params![id,self.log.owner.id]).map_err(map_sqlite_error)?;
        tx.commit().map_err(map_sqlite_error)
    }
    /// One writer quantum: at most 4096 logical items / 4MiB estimated fact
    /// payload. One indivisible oversized row may exceed the payload estimate,
    /// just as with insertion. Reports are not physical disk-I/O measurements.
    pub fn collect_garbage(&mut self, max_elements: usize) -> Result<VersionGcReport, StoreError> {
        if max_elements == 0 {
            return Err(invalid("empty garbage collection budget"));
        }
        let budget = max_elements.min(4096);
        // Proof acquisition cannot wait inside a SQLite transaction. Missing,
        // busy or unverifiable lock objects never authorize collection.
        let candidates = {
            let mut q = self
                .log
                .connection
                .prepare("SELECT id,object_id,lock_slot FROM manifest_owners WHERE state='live' AND id>?1 ORDER BY id LIMIT ?2")
                .map_err(map_sqlite_error)?;
            q.query_map(params![self.owner_cursor, budget.min(64) as i64], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })
            .map_err(map_sqlite_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(map_sqlite_error)?
        };
        self.owner_cursor = candidates
            .last()
            .map(|(id, _, _)| id.clone())
            .unwrap_or_default();
        let owners_examined = candidates.len();
        let mut dead = Vec::new();
        for (id, object, lock_slot) in candidates {
            if let Some(guard) = self.log.owner.try_dead(&lock_slot, &object)? {
                dead.push((id, guard));
            }
        }
        let tx = self
            .log
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(map_sqlite_error)?;
        let mut report = VersionGcReport {
            owners_examined,
            owner_scan_wrapped: owners_examined == 0,
            ..Default::default()
        };
        // Hold each exclusive OS guard until after the SQL transaction ends.
        for (id, _) in &dead {
            if report.work_items == budget {
                break;
            }
            let changed = tx
                .execute(
                    "UPDATE manifest_owners SET state='dead' WHERE id=?1 AND state='live'",
                    [id],
                )
                .map_err(map_sqlite_error)?;
            report.owners_recovered += changed;
            report.work_items += changed;
        }
        report.groups_abandoned = change(
            &tx,
            "UPDATE manifest_groups SET state='abandoned' WHERE id IN (SELECT g.id FROM manifest_groups g JOIN manifest_owners o ON o.id=g.resource_owner WHERE g.resource_owner IS NOT NULL AND g.state IN ('staging','sealed') AND o.state='dead' LIMIT ?1)",
            budget - report.work_items,
        )?;
        report.work_items += report.groups_abandoned;
        report.pins_deleted = change(
            &tx,
            "DELETE FROM version_pins WHERE rowid IN (SELECT p.rowid FROM version_pins p JOIN manifest_owners o ON o.id=p.owner WHERE o.state='dead' LIMIT ?1)",
            budget - report.work_items,
        )?;
        report.work_items += report.pins_deleted;
        report.entries_deleted = change(
            &tx,
            "DELETE FROM manifest_entries WHERE rowid IN (SELECT e.rowid FROM manifest_entries e JOIN manifest_groups g ON g.id=e.group_id WHERE g.state='abandoned' OR (g.state='published' AND EXISTS(SELECT 1 FROM manifest_entries n JOIN manifest_groups q ON q.id=n.group_id WHERE n.uri=e.uri AND q.state='published' AND q.commit_seq>g.commit_seq)) LIMIT ?1)",
            budget - report.work_items,
        )?;
        report.work_items += report.entries_deleted;
        // A collecting version cannot be acquired/reused or staged again. The
        // pin/entry checks are in this same writer transaction, not stale lists.
        // Build the referenced-version set once. A correlated anti-probe has no
        // version-leading manifest index and otherwise rescans the manifest for
        // every version. NULL rejected/removed entries must not poison NOT IN.
        report.work_items += change(
            &tx,
            "UPDATE file_versions SET state='collecting' WHERE id IN (SELECT f.id FROM file_versions f JOIN manifest_owners o ON o.id=f.creator WHERE NOT EXISTS(SELECT 1 FROM file_versions WHERE state='collecting') AND (f.state='sealed' OR (f.state='staging' AND o.state='dead')) AND f.id NOT IN(SELECT e.version FROM manifest_entries e WHERE e.version IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM version_pins p JOIN manifest_owners x ON x.id=p.owner WHERE p.version=f.id AND x.state='live') LIMIT ?1)",
            (budget - report.work_items).min(1),
        )?;
        let version: Option<String> = tx
            .query_row(
                "SELECT id FROM file_versions WHERE state='collecting' ORDER BY id LIMIT 1",
                [],
                |r| r.get(0),
            )
            .optional()
            .map_err(map_sqlite_error)?;
        if let Some(version) = version {
            delete_facts(&tx, &version, budget, &mut report)?;
            let remains:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM v_symbols WHERE version=?1 UNION ALL SELECT 1 FROM v_exports WHERE version=?1 UNION ALL SELECT 1 FROM v_occurrences WHERE version=?1 UNION ALL SELECT 1 FROM v_identities WHERE version=?1 UNION ALL SELECT 1 FROM v_aliases WHERE version=?1 UNION ALL SELECT 1 FROM v_bindings WHERE version=?1 UNION ALL SELECT 1 FROM v_heritage WHERE version=?1 UNION ALL SELECT 1 FROM v_direct_exports WHERE version=?1)",[&version],|r|r.get(0)).map_err(map_sqlite_error)?;
            if !remains && report.work_items < budget {
                // Only dead pins can remain at this point; remove them before
                // deleting the version (normally removed in the first phase).
                report.versions_deleted=tx.execute("DELETE FROM file_versions WHERE id=?1 AND NOT EXISTS(SELECT 1 FROM version_pins WHERE version=?1) AND NOT EXISTS(SELECT 1 FROM manifest_entries WHERE version=?1)",[&version]).map_err(map_sqlite_error)?;
                report.work_items += report.versions_deleted;
            }
        }
        report.qualifications_deleted = change(
            &tx,
            "DELETE FROM qualifications WHERE rowid IN (SELECT rowid FROM qualifications WHERE head!=(SELECT head FROM manifest_identity WHERE id=1) LIMIT ?1)",
            budget - report.work_items,
        )?;
        report.work_items += report.qualifications_deleted;
        // Keep the exact committed replay identity, but an empty terminal
        // receipt no longer needs to retain its proven-dead resource owner.
        report.group_owners_detached = change(
            &tx,
            "UPDATE manifest_groups SET resource_owner=NULL WHERE id IN (SELECT g.id FROM manifest_groups g INDEXED BY manifest_group_owner JOIN manifest_owners o ON o.id=g.resource_owner WHERE g.resource_owner IS NOT NULL AND g.state IN ('published','abandoned') AND o.state='dead' AND NOT EXISTS(SELECT 1 FROM manifest_entries e WHERE e.group_id=g.id) LIMIT ?1)",
            budget - report.work_items,
        )?;
        report.work_items += report.group_owners_detached;
        // Only fully unreferenced dead logical incarnations are removed. Stable
        // lock files and committed publication receipts remain untouched.
        report.owners_deleted = change(
            &tx,
            "DELETE FROM manifest_owners WHERE id IN(SELECT o.id FROM manifest_owners o WHERE o.state='dead' AND NOT EXISTS(SELECT 1 FROM manifest_groups g WHERE g.resource_owner=o.id) AND NOT EXISTS(SELECT 1 FROM version_pins p WHERE p.owner=o.id) AND NOT EXISTS(SELECT 1 FROM file_versions f WHERE f.creator=o.id) LIMIT ?1)",
            budget - report.work_items,
        )?;
        report.work_items += report.owners_deleted;
        tx.commit().map_err(map_sqlite_error)?;
        drop(dead);
        Ok(report)
    }
}
fn change(tx: &Transaction<'_>, sql: &str, limit: usize) -> Result<usize, StoreError> {
    tx.execute(sql, [limit as i64]).map_err(map_sqlite_error)
}
fn delete_facts(
    tx: &Transaction<'_>,
    version: &str,
    budget: usize,
    report: &mut VersionGcReport,
) -> Result<(), StoreError> {
    let families = [
        (
            "v_symbols",
            vec!["name", "name_folded", "acronym_folded", "container"],
        ),
        (
            "v_exports",
            vec![
                "name",
                "name_folded",
                "reference_name",
                "identity",
                "specifier",
                "module_id",
                "target_scope",
            ],
        ),
        ("v_occurrences", vec!["name", "qualifier"]),
        ("v_identities", vec!["name", "qualifier"]),
        ("v_aliases", vec!["from_name", "to_name"]),
        ("v_bindings", vec!["imported", "local", "specifier"]),
        ("v_heritage", vec!["name", "base"]),
        ("v_direct_exports", vec![]),
    ];
    for (table, columns) in families {
        if report.work_items >= budget || report.estimated_fact_bytes >= 4 * 1024 * 1024 {
            break;
        }
        let mut cost = "64 + length(CAST(version AS BLOB))".to_owned();
        for col in columns {
            cost += &format!(" + COALESCE(length(CAST({col} AS BLOB)),0)");
        }
        // Occurrence storage may be WITHOUT ROWID. Its ordinal is unique only
        // within a version, so both selection and deletion retain that prefix.
        let key = if table == "v_occurrences" {
            "ordinal"
        } else {
            "rowid"
        };
        let mut statement = tx
            .prepare(&format!(
                "SELECT {key},{cost} FROM {table} WHERE version=?1 LIMIT ?2"
            ))
            .map_err(map_sqlite_error)?;
        let rows = statement
            .query_map(params![version, (budget - report.work_items) as i64], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?))
            })
            .map_err(map_sqlite_error)?;
        let mut ids = Vec::new();
        for row in rows {
            let (id, bytes) = row.map_err(map_sqlite_error)?;
            let bytes = usize::try_from(bytes).map_err(|_| invalid("invalid fact cost"))?;
            if report.facts_deleted + ids.len() > 0
                && report.estimated_fact_bytes.saturating_add(bytes) > 4 * 1024 * 1024
            {
                break;
            }
            report.estimated_fact_bytes = report.estimated_fact_bytes.saturating_add(bytes);
            ids.push(id);
        }
        drop(statement);
        if ids.is_empty() {
            continue;
        }
        let placeholders = vec!["?"; ids.len()].join(",");
        let count = tx
            .execute(
                &format!("DELETE FROM {table} WHERE version=? AND {key} IN ({placeholders})"),
                rusqlite::params_from_iter(
                    std::iter::once(rusqlite::types::Value::Text(version.into()))
                        .chain(ids.into_iter().map(rusqlite::types::Value::Integer)),
                ),
            )
            .map_err(map_sqlite_error)?;
        report.facts_deleted += count;
        report.work_items += count;
    }
    Ok(())
}

#[cfg(test)]
#[path = "versioned_gc_work_test.rs"]
mod work_test;
