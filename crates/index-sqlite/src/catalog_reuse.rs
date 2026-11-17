//! Workspace-owned recent content pins. Cache hits are never input certificates.
use super::backend::{Backend, OpenMode};
use crate::{
    ManifestEntry, QualificationReceipt, VersionedFacts,
    catalog_control::{Control, Publication, incompatible},
    catalog_files,
};
use arkts_index_core::{StoreError, StoreErrorKind};
use std::path::Path;
pub struct CatalogReuseLease {
    control: Control,
    parent: Publication,
    identity: String,
    facts: Option<VersionedFacts>,
}
impl CatalogReuseLease {
    pub fn begin(base: &Path, identity: &str, domain: &str) -> Result<Self, StoreError> {
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
            Backend::Versioned(f) => *f,
            legacy => {
                catalog_files::retire(legacy, &control, identity);
                return Err(incompatible("content reuse requires a versioned catalog"));
            }
        };
        drop(guard);
        Ok(Self {
            control,
            parent,
            identity: identity.into(),
            facts: Some(facts),
        })
    }
    pub fn store_id(&self) -> &str {
        &self.parent.database
    }
    pub fn workspace_identity(&self) -> &str {
        &self.identity
    }
    pub fn is_selected(&self) -> Result<bool, StoreError> {
        Ok(self.control.active()? == self.parent)
    }
    fn require_selected(&self) -> Result<(), StoreError> {
        if !self.is_selected()? {
            return Err(StoreError::new(
                StoreErrorKind::InvalidGeneration,
                "content reuse store was replaced",
            ));
        }
        Ok(())
    }
    /// At most the current and next sealed content for each affected URI. Pin
    /// before publication, so another process's GC cannot race a lease handoff.
    /// A failed publication may replace cache entries, never current facts/proof.
    pub fn retain_transitions(
        &mut self,
        entries: &[ManifestEntry],
        mut current: impl FnMut() -> bool,
    ) -> Result<(), StoreError> {
        for batch in entries.chunks(16) {
            check(&mut current)?;
            let _guard = self.control.shared()?;
            self.require_selected()?;
            self.facts.as_mut().unwrap().retain_recent(batch)?;
        }
        Ok(())
    }
    /// Only a current complete qualification can release removed-member cache
    /// pins. Existing members retain one-step undo/redo; absence is not a TTL.
    pub fn reconcile(
        &mut self,
        receipt: &QualificationReceipt,
        mut current: impl FnMut() -> bool,
    ) -> Result<usize, StoreError> {
        let mut released = 0;
        let mut after = String::new();
        loop {
            check(&mut current)?;
            let _guard = self.control.shared()?;
            self.require_selected()?;
            let (count, last) = self
                .facts
                .as_mut()
                .unwrap()
                .release_absent_reuse(receipt, &after)?;
            released += count;
            match last {
                Some(id) => after = id,
                None => return Ok(released),
            }
        }
    }
}
fn check(current: &mut impl FnMut() -> bool) -> Result<(), StoreError> {
    if current() {
        Ok(())
    } else {
        Err(StoreError::new(
            StoreErrorKind::Cancelled,
            "content reuse update cancelled",
        ))
    }
}
impl Drop for CatalogReuseLease {
    fn drop(&mut self) {
        if let Some(f) = self.facts.take() {
            catalog_files::retire(f, &self.control, &self.identity);
        }
    }
}
