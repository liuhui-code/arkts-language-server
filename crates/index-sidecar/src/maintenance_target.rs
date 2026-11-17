//! Exclusive draft ownership returns to its workspace on failure/unwind; it is
//! discarded only on explicit force, parent change, activation or owner close.
use arkts_index_core::StoreError;
use arkts_index_sqlite::{CatalogMaintenance, CatalogMigration, ManifestEntry};
use std::{
    ops::{Deref, DerefMut},
    path::Path,
};
pub(crate) type SharedReuse = std::sync::Arc<std::sync::Mutex<Reuse>>;
pub(crate) type Reuse = Option<Box<arkts_index_sqlite::CatalogReuseLease>>;
pub(crate) type Draft = Option<Box<CatalogMigration>>;
pub(crate) struct DraftLease<'a> {
    slot: &'a mut Draft,
    migration: Draft,
    pub reused: bool,
}
impl Deref for DraftLease<'_> {
    type Target = CatalogMigration;
    fn deref(&self) -> &CatalogMigration {
        self.migration.as_ref().unwrap()
    }
}
impl DerefMut for DraftLease<'_> {
    fn deref_mut(&mut self) -> &mut CatalogMigration {
        self.migration.as_mut().unwrap()
    }
}
impl Drop for DraftLease<'_> {
    fn drop(&mut self) {
        *self.slot = self.migration.take();
    }
}
impl DraftLease<'_> {
    pub fn activate(
        mut self,
        id: &str,
        input: &arkts_index_sqlite::InputRevision,
        proof: &arkts_index_sqlite::CompleteScanFingerprint,
        sources: impl FnOnce() -> Result<bool, StoreError>,
        admit: impl FnOnce() -> Result<bool, StoreError>,
    ) -> Result<arkts_index_sqlite::QualificationReceipt, StoreError> {
        let result = self
            .migration
            .as_mut()
            .unwrap()
            .try_activate(id, input, proof, sources, admit);
        if result.is_ok() {
            drop(self.migration.take());
        }
        result
    }
}
pub(crate) enum Target<'a> {
    Bootstrap(DraftLease<'a>),
    Delta(Box<CatalogMaintenance>, &'a mut Reuse),
}
impl<'a> Target<'a> {
    pub fn bootstrap(
        slot: &'a mut Draft,
        base: &Path,
        identity: &str,
        domain: &str,
        previous: Option<&str>,
        force: bool,
    ) -> Result<Self, StoreError> {
        if force {
            drop(slot.take());
        }
        if let Some(old) = slot.as_ref()
            && !old.is_current_parent()?
        {
            drop(slot.take());
        }
        let reused = slot.is_some();
        let migration = match slot.take() {
            Some(draft) => draft,
            None => Box::new(CatalogMigration::begin_from(
                base, identity, domain, previous,
            )?),
        };
        Ok(Self::Bootstrap(DraftLease {
            slot,
            migration: Some(migration),
            reused,
        }))
    }
    pub fn write_versions(
        &mut self,
        inputs: &[arkts_index_sqlite::FileVersionWrite<'_>],
        current: impl FnMut() -> bool,
    ) -> Result<Vec<arkts_index_sqlite::FileVersionReceipt>, StoreError> {
        match self {
            Self::Bootstrap(b) => b.facts_mut().write_versions(inputs, current),
            Self::Delta(d, _) => d.write_versions(inputs, current),
        }
    }
    pub fn last_file_write_work(&self) -> Option<&arkts_index_sqlite::FileWriteWork> {
        match self {
            Self::Bootstrap(b) => b.last_file_write_work(),
            Self::Delta(d, _) => d.last_file_write_work(),
        }
    }
    pub(super) fn stage(
        &mut self,
        id: &str,
        entries: &[ManifestEntry],
        state: &std::sync::atomic::AtomicU8,
    ) -> Result<(), StoreError> {
        if entries.is_empty() {
            return Ok(());
        }
        match self {
            Self::Bootstrap(b) => b.facts_mut().stage_changes(id, entries),
            Self::Delta(d, cache) => {
                d.retain_for_reuse(cache, entries, || {
                    state.load(std::sync::atomic::Ordering::Acquire) != 1
                })?;
                d.stage_changes(id, entries)
            }
        }
    }
}
