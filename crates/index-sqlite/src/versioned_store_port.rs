//! Existing public read contract; legacy mutation APIs must not bypass staging/CAS.
use super::VersionedFacts;
use crate::map_sqlite_error;
use arkts_index_core::*;
impl SymbolStore for VersionedFacts {
    fn metadata(&self) -> Result<StoreMetadata, StoreError> {
        let tx =
            super::snapshot::Snapshot::begin(&self.log.connection).map_err(map_sqlite_error)?;
        let generation = crate::read_committed_generation(&tx)?;
        let rejected_documents = crate::read_rejected_documents(&tx)?;
        tx.commit().map_err(map_sqlite_error)?;
        Ok(StoreMetadata {
            committed_generation: generation,
            rejected_documents,
        })
    }
    fn class_heritage(&self, uri: &str) -> Result<ClassHeritageSearchResult, StoreError> {
        VersionedFacts::class_heritage(self, uri)
    }
    fn class_binding_snapshot(&self, uris: &[String]) -> Result<ClassBindingSnapshot, StoreError> {
        VersionedFacts::class_binding_snapshot(self, uris)
    }
    fn apply_batch(&mut self, _: RefreshBatch) -> Result<CommitReceipt, StoreError> {
        Err(legacy_write())
    }
    fn replace_all(&mut self, _: FullCatalogBatch) -> Result<CommitReceipt, StoreError> {
        Err(legacy_write())
    }
    fn search(&self, q: &SymbolQuery) -> Result<SymbolSearchResult, StoreError> {
        super::symbol_query::search(&self.log.connection, q)
    }
    fn search_exports(&self, q: &ExportQuery) -> Result<ExportSearchResult, StoreError> {
        super::export_query::search(&self.log.connection, q)
    }
    fn search_reference_candidates(
        &self,
        q: &ReferenceCandidateQuery,
        resolutions: &[ReferenceSourceResolution],
        roots: &[String],
    ) -> Result<ReferenceCandidateSearchResult, StoreError> {
        VersionedFacts::search_reference_candidates(self, q, resolutions, roots)
    }
}
fn legacy_write() -> StoreError {
    StoreError::new(
        StoreErrorKind::Incompatible,
        "versioned facts require staged publication with expected-head checks",
    )
}
