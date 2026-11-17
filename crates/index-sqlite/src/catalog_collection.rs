//! A retained, physically scoped maintenance connection. Call on the writer lane,
//! never a foreground query/control loop. Logical GC is not disk shrinkage.
use super::backend::{Backend, OpenMode};
use crate::{
    VersionGcReport, VersionedCheckpoint, VersionedFacts,
    catalog_control::{Control, Publication, incompatible},
    catalog_files,
};
use arkts_index_core::{StoreError, StoreErrorKind};
use std::path::Path;
#[derive(Clone, Debug)]
pub struct CatalogCollectionReport {
    pub store_id: String,
    /// A peer can switch catalogs after the initial selection check. The work
    /// remains safe on our pinned old DB; it is never proof about the new DB.
    pub still_selected: bool,
    pub garbage: VersionGcReport,
}
pub struct CatalogCollector {
    control: Control,
    parent: Publication,
    facts: Option<VersionedFacts>,
    identity: String,
}
impl CatalogCollector {
    pub fn begin(base: &Path, identity: &str, domain: &str) -> Result<Self, StoreError> {
        if domain.is_empty() {
            return Err(incompatible("empty collector facts domain"));
        }
        let (control, initial) = Control::open(base, identity)?;
        let guard = control.shared()?;
        let parent = control.active()?;
        let facts = match Backend::open(
            &control.path(&parent),
            identity,
            &parent,
            initial,
            OpenMode::Versioned(domain),
        )? {
            Backend::Versioned(facts) => *facts,
            legacy => {
                catalog_files::retire(legacy, &control, identity);
                return Err(incompatible(
                    "versioned catalog bootstrap required before collection",
                ));
            }
        };
        drop(guard);
        Ok(Self {
            control,
            parent,
            facts: Some(facts),
            identity: identity.into(),
        })
    }
    pub fn store_id(&self) -> &str {
        &self.parent.database
    }
    fn selected(&self) -> Result<bool, StoreError> {
        Ok(self.control.active()? == self.parent)
    }
    fn require_selected(&self) -> Result<(), StoreError> {
        let _guard = self.control.shared()?;
        if !self.selected()? {
            return Err(StoreError::new(
                StoreErrorKind::InvalidGeneration,
                "collector physical catalog was replaced; reopen on the selected store",
            ));
        }
        Ok(())
    }
    /// Retains the owner/cursor across quanta; does not create an owner per pass.
    /// The physical lease protects this database after the publication guard is
    /// released. GC uses its own bounded SQLite transaction and no publication
    /// lock. It cannot move publication or modify the authoritative head/Q.
    pub fn collect(&mut self, max_elements: usize) -> Result<CatalogCollectionReport, StoreError> {
        self.require_selected()?;
        let garbage = self.facts.as_mut().unwrap().collect_garbage(max_elements)?;
        Ok(CatalogCollectionReport {
            store_id: self.parent.database.clone(),
            still_selected: self.selected()?,
            garbage,
        })
    }
    /// Scoped to store_id(), not a certificate about whichever DB is current
    /// when the caller receives it. Never TRUNCATE/VACUUM or wait for readers.
    pub fn checkpoint(&mut self) -> Result<VersionedCheckpoint, StoreError> {
        self.require_selected()?;
        self.facts.as_mut().unwrap().checkpoint_passive()
    }
}
impl Drop for CatalogCollector {
    fn drop(&mut self) {
        if let Some(facts) = self.facts.take() {
            catalog_files::retire(facts, &self.control, &self.identity);
        }
    }
}
