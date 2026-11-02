use super::fingerprint::{self, CompleteScanFingerprint};
use crate::{
    CatalogBuildProgress, CatalogInput, CatalogStage, SqliteStore,
    catalog_build::{checkpoint, emit, finish_metadata, validate},
    catalog_control::{Control, Publication, incompatible},
    catalog_files,
    catalog_store::open_published,
    invalid_generation, read_rejected_documents,
};
use arkts_index_core::{CommitReceipt, FullCatalogBatch, StoreError, StoreErrorKind, SymbolStore};
use std::path::{Path, PathBuf};

/// Pins the parent generation before discovery/hash selection. No private DB or parser
/// is created until a rebuild is selected. Callers still supply source-fence observations.
pub struct CatalogBuildSession {
    control: Control,
    old: Option<SqliteStore>,
    parent: Publication,
    expected: u64,
    generation: u64,
    stored_fingerprint: Option<String>,
    base: PathBuf,
    identity: String,
}
impl CatalogBuildSession {
    pub fn begin(base: &Path, identity: &str, generation: u64) -> Result<Self, StoreError> {
        Self::begin_for(base, identity, generation, true)
    }
    pub(crate) fn begin_for(
        base: &Path,
        identity: &str,
        generation: u64,
        read_fingerprint: bool,
    ) -> Result<Self, StoreError> {
        let (control, initial_store) = Control::open(base, identity)?;
        let guard = control.shared()?;
        let parent = control.active()?;
        let old = open_published(&control.path(&parent), identity, &parent, initial_store)?;
        let expected = old.metadata()?.committed_generation;
        if generation <= expected {
            drop(guard);
            catalog_files::retire(old, base.to_owned(), identity.into());
            return Err(invalid_generation(generation, expected));
        }
        let stored_fingerprint = if read_fingerprint && expected > 0 {
            control.fingerprint()?
        } else {
            None
        };
        drop(guard);
        Ok(Self {
            control,
            old: Some(old),
            parent,
            expected,
            generation,
            stored_fingerprint,
            base: base.to_owned(),
            identity: identity.into(),
        })
    }
    pub fn has_qualified_reuse_candidate(&self, producer_key: &str) -> Result<bool, StoreError> {
        Ok(self.expected > 0
            && self
                .stored_fingerprint
                .as_deref()
                .is_some_and(|value| fingerprint::qualified_for(value, producer_key))
            && read_rejected_documents(&self.old.as_ref().unwrap().connection)?.is_empty())
    }
    pub(crate) fn legacy_reuse(&self, candidate: Option<&str>) -> bool {
        self.expected > 0
            && candidate
                .zip(self.stored_fingerprint.as_deref())
                .is_some_and(|(candidate, stored)| fingerprint::legacy_matches(stored, candidate))
    }
    /// A matching qualified key invokes neither factory nor finalizer. On a miss,
    /// cancellation is checked before creating the producer. The finalizer attests
    /// the actual fully consumed inputs, not merely the intended manifest.
    pub fn build_stream<I>(
        self,
        candidate: Option<&CompleteScanFingerprint>,
        make_inputs: impl FnOnce() -> Result<I, StoreError>,
        finish_fingerprint: impl FnOnce() -> Result<Option<CompleteScanFingerprint>, StoreError>,
        observe: impl FnMut(CatalogBuildProgress) -> bool,
    ) -> Result<CommitReceipt, StoreError>
    where
        I: IntoIterator<Item = Result<CatalogInput, StoreError>>,
    {
        let reuse = self.expected > 0
            && candidate
                .is_some_and(|key| self.stored_fingerprint.as_deref() == Some(&key.to_string()))
            && read_rejected_documents(&self.old.as_ref().unwrap().connection)?.is_empty();
        let batch = FullCatalogBatch {
            generation: self.generation,
            documents: Vec::new(),
            rejected_uris: Vec::new(),
        };
        self.run(batch, reuse, observe, |store, batch, progress, observe| {
            emit(observe, progress, CatalogStage::Writing)?;
            let inputs = make_inputs()?;
            crate::catalog_stream::consume(store, batch, inputs, progress, observe)?;
            Ok(finish_fingerprint()?.map(|value| value.to_string()))
        })
    }

    pub(crate) fn run<F: FnMut(CatalogBuildProgress) -> bool>(
        mut self,
        mut batch: FullCatalogBatch,
        reuse: bool,
        mut observe: F,
        write: impl FnOnce(
            &mut SqliteStore,
            &mut FullCatalogBatch,
            &mut CatalogBuildProgress,
            &mut F,
        ) -> Result<Option<String>, StoreError>,
    ) -> Result<CommitReceipt, StoreError> {
        let control = &mut self.control;
        let old = self.old.as_mut().unwrap();
        let parent = &self.parent;
        let expected = self.expected;
        let base = &self.base;
        let identity = &self.identity;
        // Reserve private DB ownership under the same publication lock as its allocation.
        let guard = control.shared()?;
        let path = if reuse {
            None
        } else {
            Some(catalog_files::new_database(base)?)
        };
        let _reservation = path
            .as_ref()
            .map(|path| catalog_files::reader_lease(path))
            .transpose()?;
        drop(guard);
        let mut fingerprint = None;
        let mut progress = CatalogBuildProgress {
            stage: CatalogStage::Writing,
            written_documents: 0,
            written_rows: 0,
            checkpointed_frames: 0,
            wal_frames: 0,
        };
        if reuse {
            emit(&mut observe, &mut progress, CatalogStage::Reusing)?;
        } else {
            let mut store = SqliteStore::open_private_catalog(path.as_ref().unwrap(), identity)?;
            store
                .connection
                .execute_batch("PRAGMA cache_size=-65536;")
                .map_err(crate::map_sqlite_error)?;
            fingerprint = write(&mut store, &mut batch, &mut progress, &mut observe)?;
            drop(std::mem::take(&mut batch.documents));
            emit(&mut observe, &mut progress, CatalogStage::Validating)?;
            validate(&store)?;
            emit(&mut observe, &mut progress, CatalogStage::Checkpointing)?;
            store
                .connection
                .execute_batch("PRAGMA synchronous=FULL;")
                .map_err(crate::map_sqlite_error)?;
            finish_metadata(&mut store, batch.generation, &batch.rejected_uris)?;
            checkpoint(&store, "TRUNCATE", &mut progress)?;
            emit(&mut observe, &mut progress, CatalogStage::Checkpointing)?;
            drop(store);
            catalog_files::sync_parent(path.as_ref().unwrap())?;
        }
        emit(&mut observe, &mut progress, CatalogStage::Checking)?;
        let guard = control.exclusive()?;
        if control.active()? != *parent || old.metadata()?.committed_generation != expected {
            return Err(StoreError::new(
                StoreErrorKind::InvalidGeneration,
                "catalog base changed while building; unpublished result discarded",
            ));
        }
        emit(&mut observe, &mut progress, CatalogStage::Publishing)?;
        let database = if let Some(path) = &path {
            path.file_name()
                .and_then(|s| s.to_str())
                .ok_or_else(|| incompatible("invalid build path"))?
        } else {
            &parent.database
        };
        let rejected_documents = if reuse {
            old.connection
                .execute_batch("PRAGMA synchronous=FULL;")
                .map_err(crate::map_sqlite_error)?;
            finish_metadata(old, batch.generation, &[])?;
            read_rejected_documents(&old.connection)?
        } else {
            batch
                .rejected_uris
                .iter()
                .cloned()
                .collect::<std::collections::BTreeSet<_>>()
                .into_iter()
                .collect()
        };
        if !reuse {
            control.publish(
                database,
                batch.generation,
                if batch.rejected_uris.is_empty() {
                    fingerprint.as_deref()
                } else {
                    None
                },
            )?;
        }
        drop(guard);
        Ok(CommitReceipt {
            committed_generation: batch.generation,
            rejected_documents,
        })
    }
}
impl Drop for CatalogBuildSession {
    fn drop(&mut self) {
        if let Some(old) = self.old.take() {
            catalog_files::retire(old, self.base.clone(), self.identity.clone());
        }
        if let Ok(_guard) = self.control.exclusive() {
            catalog_files::prune(&self.control);
        }
    }
}
