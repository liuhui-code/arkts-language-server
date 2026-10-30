//! Resolves a published generation for each operation. A connection pins its file.
use crate::{
    SqliteStore,
    catalog_control::{Control, Publication, incompatible},
};
use arkts_index_core::{
    ClassBindingSnapshot, ClassHeritageSearchResult, CommitReceipt, ExportQuery,
    ExportSearchResult, FullCatalogBatch, ReferenceCandidateQuery, ReferenceCandidateSearchResult,
    ReferenceSourceResolution, RefreshBatch, StoreError, StoreMetadata, SymbolQuery,
    SymbolSearchResult, SymbolStore,
};
use std::{
    cell::RefCell,
    path::{Path, PathBuf},
};

pub struct CatalogStore {
    current: RefCell<(PathBuf, SqliteStore)>,
    control: Control,
    identity: String,
}

impl CatalogStore {
    pub fn open(base: impl AsRef<Path>, identity: &str) -> Result<Self, StoreError> {
        let control = Control::open(base.as_ref(), identity)?;
        let guard = control.shared()?;
        let publication = control.active()?;
        let path = control.path(&publication);
        let store = open_published(&path, identity, &publication)?;
        drop(guard);
        Ok(Self {
            current: RefCell::new((path, store)),
            control,
            identity: identity.into(),
        })
    }

    fn access<T>(
        &self,
        write: bool,
        operation: impl FnOnce(&mut SqliteStore) -> Result<T, StoreError>,
    ) -> Result<T, StoreError> {
        let guard = self.control.shared()?;
        let publication = self.control.active()?;
        let path = self.control.path(&publication);
        let mut current = self.current.borrow_mut();
        if current.0 != path {
            let store = open_published(&path, &self.identity, &publication)?;
            let old = std::mem::replace(&mut *current, (path, store));
            crate::catalog_files::retire(old.1, self.control.base.clone(), self.identity.clone());
        }
        if write {
            self.control.invalidate_fingerprint()?;
            // Hold the lock through the ordinary SQLite incremental transaction.
            operation(&mut current.1)
        } else {
            drop(guard);
            operation(&mut current.1)
        }
    }
}

pub(super) fn open_published(
    path: &Path,
    identity: &str,
    publication: &Publication,
) -> Result<SqliteStore, StoreError> {
    crate::catalog_control::safe_file(path)?;
    if publication.database != "symbols-v2.sqlite3" && !path.is_file() {
        return Err(incompatible("published catalog database is missing"));
    }
    let store = SqliteStore::open(path, identity)?;
    if store.metadata()?.committed_generation < publication.generation {
        return Err(incompatible("published catalog generation is incomplete"));
    }
    Ok(store)
}

impl SymbolStore for CatalogStore {
    fn metadata(&self) -> Result<StoreMetadata, StoreError> {
        self.access(false, |s| s.metadata())
    }
    fn class_heritage(&self, uri: &str) -> Result<ClassHeritageSearchResult, StoreError> {
        self.access(false, |s| s.class_heritage(uri))
    }
    fn class_binding_snapshot(&self, uris: &[String]) -> Result<ClassBindingSnapshot, StoreError> {
        self.access(false, |s| s.class_binding_snapshot(uris))
    }
    fn apply_batch(&mut self, batch: RefreshBatch) -> Result<CommitReceipt, StoreError> {
        self.access(true, |s| s.apply_batch(batch))
    }
    fn replace_all(&mut self, batch: FullCatalogBatch) -> Result<CommitReceipt, StoreError> {
        crate::build_catalog(&self.control.base, &self.identity, batch, |_| true)
    }
    fn search(&self, query: &SymbolQuery) -> Result<SymbolSearchResult, StoreError> {
        self.access(false, |s| s.search(query))
    }
    fn search_exports(&self, query: &ExportQuery) -> Result<ExportSearchResult, StoreError> {
        self.access(false, |s| s.search_exports(query))
    }
    fn search_reference_candidates(
        &self,
        query: &ReferenceCandidateQuery,
        resolutions: &[ReferenceSourceResolution],
        roots: &[String],
    ) -> Result<ReferenceCandidateSearchResult, StoreError> {
        self.access(false, |s| {
            s.search_reference_candidates(query, resolutions, roots)
        })
    }
}
