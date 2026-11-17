//! Qualification is bound to a data snapshot, never to an in-memory task phase.
use super::{InputRevision, QualificationReceipt, VersionedFacts, snapshot::Snapshot};
use crate::map_sqlite_error;
use arkts_index_core::{StoreError, SymbolStore};
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct QualifiedRead<T> {
    pub workspace: String,
    pub store: String,
    pub domain: String,
    pub head: u64,
    pub qualification: Option<QualificationReceipt>,
    pub value: T,
}
impl VersionedFacts {
    /// The closure receives only the read half of the standard store interface.
    /// This certifies one database snapshot, not the current filesystem/compiler.
    pub fn qualified_read<T>(
        &self,
        input: &InputRevision,
        read: impl FnOnce(&dyn SymbolStore) -> Result<T, StoreError>,
    ) -> Result<QualifiedRead<T>, StoreError> {
        self.read_snapshot(
            Some(input),
            &crate::ReadCancellation::default(),
            |s, _, _| read(s),
        )
    }
    pub fn read_snapshot<T>(
        &self,
        input: Option<&InputRevision>,
        cancel: &crate::ReadCancellation,
        read: impl FnOnce(&dyn SymbolStore, u64, Option<&QualificationReceipt>) -> Result<T, StoreError>,
    ) -> Result<QualifiedRead<T>, StoreError> {
        cancel.check()?;
        // Reject reentrancy before touching the outer reader's progress hook.
        // A failed BEGIN after attach would otherwise replace and then remove it.
        if !self.log.connection.is_autocommit() {
            return Err(StoreError::new(
                arkts_index_core::StoreErrorKind::Busy,
                "read snapshot boundary requires its own transaction",
            ));
        }
        let _attachment = cancel.attach(&self.log.connection)?;
        // This boundary must own a transaction, not borrow a caller's write tx.
        let tx = Snapshot::own(&self.log.connection).map_err(map_sqlite_error)?;
        let (workspace, store, domain, head): (String, String, String, i64) = tx
            .query_row(
                "SELECT workspace,store,domain,head FROM manifest_identity WHERE id=1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .map_err(map_sqlite_error)?;
        let qualification = input.map(|i| self.qualification(i)).transpose()?.flatten();
        cancel.check()?;
        let value = read(
            self,
            crate::to_u64(head, "manifest head")?,
            qualification.as_ref(),
        )?;
        cancel.check()?;
        tx.commit().map_err(map_sqlite_error)?;
        Ok(QualifiedRead {
            workspace,
            store,
            domain,
            head: crate::to_u64(head, "manifest head")?,
            qualification,
            value,
        })
    }
}
