//! Active-store controller. Long extraction/fences never hold publication locks.
use crate::{
    CompleteScanFingerprint, CurrentFileInput, FileVersionReceipt, InputRevision, ManifestEntry,
    QualificationReceipt, VersionedFacts,
    catalog_api::backend::{Backend, OpenMode},
    catalog_control::{Control, Publication, PublicationGuard, incompatible},
    catalog_files,
};
use arkts_index_core::{DocumentSymbols, StoreError, StoreErrorKind};
use std::path::Path;
pub struct CatalogMaintenance {
    control: Control,
    parent: Publication,
    facts: Option<VersionedFacts>,
    prepared: crate::catalog_api::versioned_facts::input_view::PreparedInputs,
    head: u64,
    identity: String,
}
impl CatalogMaintenance {
    pub fn begin(
        base: &Path,
        identity: &str,
        domain: &str,
        uris: &[String],
    ) -> Result<Self, StoreError> {
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
                return Err(incompatible("versioned catalog bootstrap required"));
            }
        };
        drop(guard);
        let prepared = facts.prepare_inputs(uris)?;
        let head = prepared.head;
        Ok(Self {
            control,
            parent,
            facts: Some(facts),
            prepared,
            head,
            identity: identity.into(),
        })
    }
    pub fn inputs(&self) -> &[CurrentFileInput] {
        &self.prepared.inputs
    }
    pub fn store_id(&self) -> &str {
        &self.parent.database
    }
    /// Validate an unchanged point observation without publishing another group.
    /// It remains discovery-only; only qualify() can issue complete-scan proof.
    pub fn verify_noop(
        &self,
        check_sources: impl FnOnce() -> Result<bool, StoreError>,
        admit: impl FnOnce() -> Result<bool, StoreError>,
    ) -> Result<u64, StoreError> {
        if !check_sources()? {
            return Err(incompatible("noop source fence failed"));
        }
        self.facts
            .as_ref()
            .unwrap()
            .verify_prepared_noop(self.prepared.read_set.as_ref(), || {
                permit(&self.control, &self.parent, admit)
            })
    }
    pub fn write_version(
        &mut self,
        id: &str,
        sha: &str,
        doc: &DocumentSymbols,
    ) -> Result<FileVersionReceipt, StoreError> {
        self.facts.as_mut().unwrap().write_version(id, sha, doc)
    }
    pub fn write_versions(
        &mut self,
        inputs: &[crate::FileVersionWrite<'_>],
        current: impl FnMut() -> bool,
    ) -> Result<Vec<FileVersionReceipt>, StoreError> {
        self.facts.as_mut().unwrap().write_versions(inputs, current)
    }
    pub fn last_file_write_work(&self) -> Option<&crate::FileWriteWork> {
        self.facts.as_ref().unwrap().last_file_write_work()
    }
    pub fn find_version(
        &self,
        uri: &str,
        sha: &str,
    ) -> Result<Option<FileVersionReceipt>, StoreError> {
        self.facts.as_ref().unwrap().find_version(uri, sha)
    }
    pub fn retain_for_reuse(
        &self,
        slot: &mut Option<Box<crate::CatalogReuseLease>>,
        entries: &[ManifestEntry],
        current: impl FnMut() -> bool,
    ) -> Result<(), StoreError> {
        if entries.is_empty() {
            return Ok(());
        }
        if slot.as_ref().is_some_and(|c| {
            c.store_id() != self.store_id() || c.workspace_identity() != self.identity
        }) {
            drop(slot.take());
        }
        if slot.is_none() {
            let domain = self.facts.as_ref().unwrap().stored_domain()?;
            *slot = Some(Box::new(crate::CatalogReuseLease::begin(
                &self.control.base,
                &self.identity,
                &domain,
            )?));
        }
        let cache = slot.as_mut().unwrap();
        if cache.store_id() != self.store_id() {
            return Err(StoreError::new(
                StoreErrorKind::InvalidGeneration,
                "content reuse cannot rebase a prepared writer",
            ));
        }
        cache.retain_transitions(entries, current)
    }
    pub fn stage_changes(
        &mut self,
        group: &str,
        entries: &[ManifestEntry],
    ) -> Result<(), StoreError> {
        self.facts.as_mut().unwrap().stage_changes(group, entries)
    }
    pub fn commit(
        &mut self,
        group: &str,
        check_sources: impl FnOnce() -> Result<bool, StoreError>,
        admit: impl FnOnce() -> Result<bool, StoreError>,
    ) -> Result<u64, StoreError> {
        if !check_sources()? {
            return Err(incompatible("maintenance source fence failed"));
        }
        let control = &self.control;
        let parent = &self.parent;
        let head = self.facts.as_mut().unwrap().commit_prepared(
            group,
            self.prepared.read_set.as_ref(),
            || permit(control, parent, admit),
        )?;
        self.head = head;
        Ok(head)
    }
    /// A data publication and a later complete qualification have separate
    /// outcomes. Failure here never means that an earlier data commit vanished.
    pub fn qualify(
        &mut self,
        id: &str,
        input: &InputRevision,
        scan: &CompleteScanFingerprint,
        check_sources: impl FnOnce() -> Result<bool, StoreError>,
        admit: impl FnOnce() -> Result<bool, StoreError>,
    ) -> Result<QualificationReceipt, StoreError> {
        if !check_sources()? {
            return Err(incompatible("qualification source fence failed"));
        }
        let control = &self.control;
        let parent = &self.parent;
        self.facts
            .as_mut()
            .unwrap()
            .qualify_with_permit(id, input, self.head, scan, || {
                permit(control, parent, admit)
            })
    }
}
fn permit(
    control: &Control,
    parent: &Publication,
    admit: impl FnOnce() -> Result<bool, StoreError>,
) -> Result<PublicationGuard, StoreError> {
    let guard = control.shared()?;
    if control.active()? != *parent {
        return Err(StoreError::new(
            StoreErrorKind::InvalidGeneration,
            "active physical store changed",
        ));
    }
    if !admit()? {
        return Err(incompatible("maintenance publication admission rejected"));
    }
    Ok(guard)
}
impl Drop for CatalogMaintenance {
    fn drop(&mut self) {
        if let Some(facts) = self.facts.take() {
            catalog_files::retire(facts, &self.control, &self.identity);
        }
    }
}
