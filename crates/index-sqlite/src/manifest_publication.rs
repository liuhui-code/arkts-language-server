//! Read-set verification is outside the short publication write transaction.
use super::{ManifestLog, PublicationWork, invalid};
use crate::map_sqlite_error;
use arkts_index_core::StoreError;
use rusqlite::{OptionalExtension, StatementStatus, TransactionBehavior, params};
impl ManifestLog {
    pub fn publish(&mut self, group: &str, expected_head: u64) -> Result<u64, StoreError> {
        self.publish_with(group, expected_head, || Ok(()))
    }
    pub(in crate::catalog_api) fn publish_with<G>(
        &mut self,
        group: &str,
        expected_head: u64,
        permit: impl FnOnce() -> Result<G, StoreError>,
    ) -> Result<u64, StoreError> {
        let read = self
            .connection
            .unchecked_transaction()
            .map_err(map_sqlite_error)?;
        if let Some(head) = committed(&read, group)? {
            return Ok(head);
        }
        let head: i64 = read
            .query_row("SELECT head FROM manifest_identity WHERE id=1", [], |r| {
                r.get(0)
            })
            .map_err(map_sqlite_error)?;
        if u64::try_from(head).ok() != Some(expected_head) {
            return Err(invalid("manifest head changed"));
        }
        // Compare only this sealed group's members, never copy the workspace map.
        // Absence/reappearance must change the namespace epoch even when a URI
        // ultimately returns to the same content or disappears again (ABA).
        let namespace_changed:bool=read.query_row("SELECT EXISTS(SELECT 1 FROM manifest_entries e WHERE e.group_id=?1 AND (e.kind!='removed') != COALESCE((SELECT n.kind!='removed' FROM manifest_entries n JOIN manifest_groups q ON q.id=n.group_id WHERE n.uri=e.uri AND q.state='published' AND q.commit_seq<=?2 ORDER BY q.commit_seq DESC LIMIT 1),0))",params![group,head],|r|r.get(0)).map_err(map_sqlite_error)?;
        let state: String = read
            .query_row(
                "SELECT state FROM manifest_groups WHERE id=?1",
                [group],
                |r| r.get(0),
            )
            .map_err(map_sqlite_error)?;
        if state != "sealed" {
            return Err(invalid("unsealed manifest cannot publish"));
        }
        read.commit().map_err(map_sqlite_error)?;
        let _permit = permit()?;
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(map_sqlite_error)?;
        if let Some(head) = committed(&tx, group)? {
            return Ok(head);
        }
        let actual: i64 = tx
            .query_row("SELECT head FROM manifest_identity WHERE id=1", [], |r| {
                r.get(0)
            })
            .map_err(map_sqlite_error)?;
        if actual != head {
            return Err(invalid("manifest head changed"));
        }
        let next = head
            .checked_add(1)
            .ok_or_else(|| invalid("manifest sequence exhausted"))?;
        let mut publish=tx.prepare("UPDATE manifest_groups SET state='published',commit_seq=?1 WHERE id=?2 AND state='sealed'").map_err(map_sqlite_error)?;
        publish
            .execute(params![next, group])
            .map_err(map_sqlite_error)?;
        let mut steps = publish.get_status(StatementStatus::VmStep);
        drop(publish);
        let mut update=tx.prepare("UPDATE manifest_identity SET head=?1,namespace_epoch=CASE WHEN ?2 THEN ?1 ELSE namespace_epoch END WHERE id=1").map_err(map_sqlite_error)?;
        update
            .execute(params![next, namespace_changed])
            .map_err(map_sqlite_error)?;
        steps = steps.saturating_add(update.get_status(StatementStatus::VmStep));
        drop(update);
        tx.commit().map_err(map_sqlite_error)?;
        self.last_work = Some(PublicationWork {
            group: group.into(),
            head: next as u64,
            update_vm_steps: steps,
        });
        Ok(next as u64)
    }
}
pub(super) fn committed(c: &rusqlite::Connection, group: &str) -> Result<Option<u64>, StoreError> {
    let value: Option<i64> = c
        .query_row(
            "SELECT commit_seq FROM manifest_groups WHERE id=?1 AND state='published'",
            [group],
            |r| r.get(0),
        )
        .optional()
        .map_err(map_sqlite_error)?;
    value
        .map(|n| u64::try_from(n).map_err(|_| invalid("invalid publication sequence")))
        .transpose()
}
