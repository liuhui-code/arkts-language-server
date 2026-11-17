//! Resolves a published generation for each operation. A connection pins its file.
use crate::catalog_api::backend::{Backend, OpenMode};
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
    current: RefCell<(PathBuf, Backend)>,
    domain: Option<String>,
    allow_migration: bool,
    control: Control,
    identity: String,
}

impl CatalogStore {
    pub fn managed_namespace(
        &self,
    ) -> Result<Option<crate::cache_gc::namespace::ManagedCacheNamespace>, StoreError> {
        self.control.managed_namespace()
    }

    pub fn open(base: impl AsRef<Path>, identity: &str) -> Result<Self, StoreError> {
        Self::open_mode(base.as_ref(), identity, None, false)
    }
    pub fn open_with_domain(
        base: impl AsRef<Path>,
        identity: &str,
        domain: &str,
    ) -> Result<Self, StoreError> {
        if domain.is_empty() {
            return Err(incompatible("empty facts domain"));
        }
        Self::open_mode(base.as_ref(), identity, Some(domain), false)
    }
    /// Open and pin a structurally valid previous producer without serving its
    /// facts under the new domain. Only private migration may replace it.
    pub fn open_for_maintenance(
        base: impl AsRef<Path>,
        identity: &str,
        domain: &str,
    ) -> Result<Self, StoreError> {
        if domain.is_empty() {
            return Err(incompatible("empty facts domain"));
        }
        Self::open_mode(base.as_ref(), identity, Some(domain), true)
    }
    fn open_mode(
        base: &Path,
        identity: &str,
        domain: Option<&str>,
        allow_migration: bool,
    ) -> Result<Self, StoreError> {
        let (control, initial_store) = Control::open(base, identity)?;
        let guard = control.shared()?;
        let publication = control.active()?;
        let path = control.path(&publication);
        let store = Backend::open(
            &path,
            identity,
            &publication,
            initial_store,
            if allow_migration {
                OpenMode::MigrationParent
            } else {
                domain.map_or(OpenMode::LegacyOnly, OpenMode::Versioned)
            },
        )?;
        drop(guard);
        Ok(Self {
            current: RefCell::new((path, store)),
            control,
            identity: identity.into(),
            domain: domain.map(str::to_owned),
            allow_migration,
        })
    }

    fn compatible(&self, backend: &Backend) -> Result<bool, StoreError> {
        match (backend, self.domain.as_deref()) {
            (Backend::Versioned(f), Some(domain)) => f.has_domain(domain),
            _ => Ok(true),
        }
    }
    fn require_compatible(&self, backend: &Backend) -> Result<(), StoreError> {
        if self.compatible(backend)? {
            Ok(())
        } else {
            Err(StoreError::new(
                arkts_index_core::StoreErrorKind::MigrationRequired,
                "producer migration required; old facts cannot serve this domain",
            ))
        }
    }
    pub fn migration_required(&self) -> Result<bool, StoreError> {
        Ok(self.migration_source_domain()?.is_some())
    }
    pub fn migration_source_domain(&self) -> Result<Option<String>, StoreError> {
        self.access_backend(false, |backend| match (backend, self.domain.as_deref()) {
            (Backend::Versioned(f), Some(expected)) => {
                let actual = f.stored_domain()?;
                Ok((!f.has_domain(expected)?).then_some(actual))
            }
            _ => Ok(None),
        })
    }
    /// Task-status hint only; no facts or current-domain qualification is read.
    pub fn metadata_for_maintenance(&self) -> Result<StoreMetadata, StoreError> {
        self.access_backend(false, |b| b.metadata())
    }
    /// Full reconciliation inventory only; local queries never build this map.
    pub fn file_inventory(&self) -> Result<Option<crate::ManifestSnapshot>, StoreError> {
        self.access_backend(false, |backend| {
            if !self.compatible(backend)? {
                return Ok(None);
            }
            match backend {
                Backend::Legacy(_) => Ok(None),
                Backend::Versioned(facts) => facts.file_inventory().map(Some),
            }
        })
    }
    /// Read identity, qualification and payload from one selected data snapshot.
    /// Legacy stores have no versioned proof and do not execute the callback.
    pub fn qualified_read<T>(
        &self,
        input: &crate::InputRevision,
        read: impl FnOnce(&dyn SymbolStore) -> Result<T, StoreError>,
    ) -> Result<Option<crate::QualifiedRead<T>>, StoreError> {
        self.access_backend(false, |backend| {
            self.require_compatible(backend)?;
            match backend {
                Backend::Legacy(_) => Ok(None),
                Backend::Versioned(facts) => facts.qualified_read(input, read).map(Some),
            }
        })
    }
    pub fn read_snapshot<T>(
        &self,
        input: Option<&crate::InputRevision>,
        cancel: &crate::ReadCancellation,
        read: impl FnOnce(
            &dyn SymbolStore,
            u64,
            Option<&crate::QualificationReceipt>,
        ) -> Result<T, StoreError>,
    ) -> Result<Option<crate::QualifiedRead<T>>, StoreError> {
        cancel.check()?;
        self.access_backend(false, |backend| {
            self.require_compatible(backend)?;
            match backend {
                Backend::Legacy(_) => Ok(None),
                Backend::Versioned(facts) => facts.read_snapshot(input, cancel, read).map(Some),
            }
        })
    }
    /// Discovery-only fallback while the selected store is still legacy.
    /// No versioned identity or complete qualification is fabricated here.
    pub fn discovery_read<T>(
        &self,
        cancel: &crate::ReadCancellation,
        read: impl FnOnce(&dyn SymbolStore) -> Result<T, StoreError>,
    ) -> Result<T, StoreError> {
        cancel.check()?;
        self.access_backend(false, |backend| {
            self.require_compatible(backend)?;
            match backend {
                Backend::Legacy(store) => {
                    let _attachment = cancel.attach(&store.connection)?;
                    cancel.check()?;
                    let value = read(store.as_ref())?;
                    cancel.check()?;
                    Ok(value)
                }
                Backend::Versioned(facts) => facts
                    .read_snapshot(None, cancel, |s, _, _| read(s))
                    .map(|r| r.value),
            }
        })
    }
    fn access<T>(
        &self,
        write: bool,
        operation: impl FnOnce(&mut dyn SymbolStore) -> Result<T, StoreError>,
    ) -> Result<T, StoreError> {
        self.access_backend(write, |backend| {
            self.require_compatible(backend)?;
            operation(backend.store())
        })
    }
    fn access_backend<T>(
        &self,
        write: bool,
        operation: impl FnOnce(&mut Backend) -> Result<T, StoreError>,
    ) -> Result<T, StoreError> {
        let guard = self.control.shared()?;
        let publication = self.control.active()?;
        let path = self.control.path(&publication);
        let mut current = self.current.borrow_mut();
        if current.0 != path {
            let store = Backend::open(
                &path,
                &self.identity,
                &publication,
                None,
                if self.allow_migration {
                    OpenMode::MigrationParent
                } else {
                    self.domain
                        .as_deref()
                        .map_or(OpenMode::LegacyOnly, OpenMode::Versioned)
                },
            )?;
            let old = std::mem::replace(&mut *current, (path, store));
            crate::catalog_files::retire(old.1, &self.control, &self.identity);
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
    initial_store: Option<SqliteStore>,
) -> Result<SqliteStore, StoreError> {
    crate::catalog_control::safe_file(path)?;
    if !path.is_file() {
        return Err(incompatible("published catalog database is missing"));
    }
    let store = match initial_store {
        Some(store) if publication.database == "symbols-v2.sqlite3" => store,
        _ => SqliteStore::open_existing(path, identity)?,
    };
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
