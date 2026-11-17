//! Workspace mutation facade and borrowed standard reads.
use super::*;

pub struct WorkspaceIndex {
    store: Box<dyn SymbolStore>,
}

impl WorkspaceIndex {
    /// Borrow the standard read port without moving or granting write ownership.
    pub fn read_store(&self) -> &dyn SymbolStore {
        self.store.as_ref()
    }

    pub fn in_memory() -> Self {
        Self::with_store(MemoryStore::default())
    }

    pub fn with_store(store: impl SymbolStore + 'static) -> Self {
        Self {
            store: Box::new(store),
        }
    }

    pub fn refresh(
        &mut self,
        generation: u64,
        changed_documents: impl IntoIterator<Item = Document>,
        removed_uris: &[&str],
    ) -> Result<RefreshReport, StoreError> {
        let mut report = RefreshReport::default();
        let mut replacements = Vec::new();
        let mut removals: Vec<String> = removed_uris.iter().map(|uri| (*uri).to_owned()).collect();
        let mut rejected_uris = Vec::new();
        for document in changed_documents {
            match parse_document_symbols(&document) {
                Ok(document_symbols) => {
                    replacements.push(document_symbols);
                    report.indexed_documents += 1;
                }
                Err(_) => {
                    rejected_uris.push(document.uri);
                }
            }
        }
        removals.sort();
        removals.dedup();
        rejected_uris.sort();
        rejected_uris.dedup();
        let receipt = self.store.apply_batch(RefreshBatch {
            generation,
            replacements,
            removed_uris: removals,
            rejected_uris,
        })?;
        report.committed_generation = receipt.committed_generation;
        report.rejected_documents = receipt.rejected_documents;
        report.state = if report.rejected_documents.is_empty() {
            IndexState::Ready
        } else {
            IndexState::Degraded
        };
        Ok(report)
    }

    pub fn activate_catalog(
        &mut self,
        generation: u64,
        documents: Vec<DocumentSymbols>,
        rejected_uris: Vec<String>,
    ) -> Result<RefreshReport, StoreError> {
        let indexed_documents = documents.len();
        let receipt = self.store.replace_all(FullCatalogBatch {
            generation,
            documents,
            rejected_uris,
        })?;
        let state = if receipt.rejected_documents.is_empty() {
            IndexState::Ready
        } else {
            IndexState::Degraded
        };
        Ok(RefreshReport {
            indexed_documents,
            rejected_documents: receipt.rejected_documents,
            committed_generation: receipt.committed_generation,
            state,
        })
    }

    pub fn search(&self, query: &str, limit: usize) -> Result<SymbolSearchResult, StoreError> {
        self.store.search(&SymbolQuery::new(query, limit))
    }

    pub fn search_exports(
        &self,
        query: &str,
        limit: usize,
    ) -> Result<ExportSearchResult, StoreError> {
        self.store.search_exports(&ExportQuery::new(query, limit))
    }

    pub fn search_reference_candidates(
        &self,
        query: ReferenceCandidateQuery,
    ) -> Result<ReferenceCandidateSearchResult, StoreError> {
        self.store.search_reference_candidates(&query, &[], &[])
    }

    pub fn search_reference_candidates_with_source_resolutions(
        &self,
        query: ReferenceCandidateQuery,
        source_resolutions: &[ReferenceSourceResolution],
    ) -> Result<ReferenceCandidateSearchResult, StoreError> {
        self.store
            .search_reference_candidates(&query, source_resolutions, &[])
    }

    pub fn search_reference_candidates_with_scope(
        &self,
        query: ReferenceCandidateQuery,
        source_resolutions: &[ReferenceSourceResolution],
        admitted_uri_roots: &[String],
    ) -> Result<ReferenceCandidateSearchResult, StoreError> {
        self.store
            .search_reference_candidates(&query, source_resolutions, admitted_uri_roots)
    }

    pub fn search_excluding(
        &self,
        query: &str,
        limit: usize,
        excluded_uris: &[String],
    ) -> Result<SymbolSearchResult, StoreError> {
        self.store
            .search(&SymbolQuery::new(query, limit).excluding_uris(excluded_uris.iter().cloned()))
    }

    pub fn metadata(&self) -> Result<StoreMetadata, StoreError> {
        self.store.metadata()
    }

    pub fn class_heritage(
        &self,
        document_uri: &str,
    ) -> Result<ClassHeritageSearchResult, StoreError> {
        self.store.class_heritage(document_uri)
    }

    pub fn class_binding_snapshot(
        &self,
        document_uris: &[String],
    ) -> Result<ClassBindingSnapshot, StoreError> {
        self.store.class_binding_snapshot(document_uris)
    }
}
