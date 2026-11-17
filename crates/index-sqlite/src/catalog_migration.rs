//! Private full-store bootstrap/upgrade. Ordinary maintenance does not use this.
use crate::{
    CompleteScanFingerprint, InputRevision, QualificationReceipt, VersionedFacts,
    catalog_api::backend::{Backend, OpenMode},
    catalog_control::{Control, Publication, incompatible},
    catalog_files,
};
use arkts_index_core::{StoreError, StoreErrorKind, SymbolStore};
use std::path::{Path, PathBuf};
pub struct CatalogMigration {
    control: Control,
    parent_publication: Publication,
    parent: Option<Backend>,
    expected: u64,
    candidate: Option<VersionedFacts>,
    path: PathBuf,
    identity: String,
    activated: bool,
    validation: Option<crate::CatalogValidationObserver>,
}
impl CatalogMigration {
    pub fn begin(base: &Path, identity: &str, domain: &str) -> Result<Self, StoreError> {
        Self::begin_checked(base, identity, domain, |_| Ok(()))
    }
    /// Startup permission applies only to the producer observed at initialization.
    /// A live owner cannot reverse a different producer's later takeover.
    pub fn begin_from(
        base: &Path,
        identity: &str,
        domain: &str,
        previous: Option<&str>,
    ) -> Result<Self, StoreError> {
        Self::begin_checked(base, identity, domain, |parent| {
            if let Backend::Versioned(f) = parent {
                let actual = f.stored_domain()?;
                if actual != domain && Some(actual.as_str()) != previous {
                    return Err(StoreError::new(
                        StoreErrorKind::ProducerSuperseded,
                        "another producer took over this catalog; no reverse migration is authorized",
                    ));
                }
            }
            Ok(())
        })
    }
    fn begin_checked(
        base: &Path,
        identity: &str,
        domain: &str,
        check: impl FnOnce(&Backend) -> Result<(), StoreError>,
    ) -> Result<Self, StoreError> {
        let (control, initial) = Control::open(base, identity)?;
        let guard = control.shared()?;
        let parent_publication = control.active()?;
        let parent = Backend::open(
            &control.path(&parent_publication),
            identity,
            &parent_publication,
            initial,
            OpenMode::MigrationParent,
        )?;
        check(&parent)?;
        let expected = parent.metadata()?.committed_generation;
        let path = catalog_files::new_path(base)?;
        let store = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| incompatible("invalid migration path"))?;
        let candidate = VersionedFacts::create(&path, identity, store, domain)?;
        drop(guard);
        Ok(Self {
            control,
            parent_publication,
            parent: Some(parent),
            expected,
            candidate: Some(candidate),
            path,
            identity: identity.into(),
            activated: false,
            validation: None,
        })
    }
    /// Observe/cancel SQL validation in the next activation attempt only.
    /// The callback must not access this database connection.
    pub fn set_validation_observer(&mut self, observer: crate::CatalogValidationObserver) {
        self.validation = Some(observer);
    }
    pub fn facts_mut(&mut self) -> &mut VersionedFacts {
        self.candidate
            .as_mut()
            .expect("candidate only exists before successful activation")
    }
    pub fn last_file_write_work(&self) -> Option<&crate::FileWriteWork> {
        self.candidate
            .as_ref()
            .and_then(VersionedFacts::last_file_write_work)
    }
    /// A retained draft may be reused only while its pinned publication and
    /// authoritative parent data head remain unchanged. No numeric cross-store comparison.
    pub fn is_current_parent(&self) -> Result<bool, StoreError> {
        if self.activated {
            return Ok(false);
        }
        let _guard = self.control.shared()?;
        Ok(self.control.active()? == self.parent_publication
            && self
                .parent
                .as_ref()
                .unwrap()
                .metadata()?
                .committed_generation
                == self.expected)
    }
    /// Private current mappings only; this is never a source freshness proof.
    pub fn inventory(&self) -> Result<crate::ManifestSnapshot, StoreError> {
        self.candidate
            .as_ref()
            .ok_or_else(|| {
                StoreError::new(
                    StoreErrorKind::InvalidGeneration,
                    "migration candidate is already selected",
                )
            })?
            .file_inventory()
    }
    /// Reclaim obsolete private drafts before writing another attempt. `keep`
    /// contains owned sealed content matches, not current-input certificates.
    /// Cancellation can leave committed GC progress; retry resumes safely.
    pub fn prepare_reuse(
        &mut self,
        keep: &[String],
        current: impl FnMut() -> bool,
    ) -> Result<crate::DraftReclamation, StoreError> {
        if !self.is_current_parent()? {
            return Err(StoreError::new(
                StoreErrorKind::InvalidGeneration,
                "draft parent changed",
            ));
        }
        self.candidate
            .as_mut()
            .unwrap()
            .reclaim_private_draft(keep, current)
    }
    /// Scanner source checks run without a publication lock/SQL transaction.
    /// `admit` runs under the publication lock and MUST be a bounded in-memory
    /// owner/input/cancel check. All native writers must honor this controller.
    pub fn activate(
        mut self,
        input: &InputRevision,
        scan: &CompleteScanFingerprint,
        check_sources: impl FnOnce() -> Result<bool, StoreError>,
        admit: impl FnOnce() -> Result<bool, StoreError>,
    ) -> Result<QualificationReceipt, StoreError> {
        self.try_activate("bootstrap", input, scan, check_sources, admit)
    }
    /// On failure the private candidate remains owned by this builder. A later
    /// attempt must revalidate all sources and use its own qualification identity.
    pub fn try_activate(
        &mut self,
        qualification_id: &str,
        input: &InputRevision,
        scan: &CompleteScanFingerprint,
        check_sources: impl FnOnce() -> Result<bool, StoreError>,
        admit: impl FnOnce() -> Result<bool, StoreError>,
    ) -> Result<QualificationReceipt, StoreError> {
        let validation = self.validation.take();
        if !self.is_current_parent()? {
            return Err(StoreError::new(
                StoreErrorKind::InvalidGeneration,
                "catalog base changed during migration",
            ));
        }
        let facts = self.candidate.as_mut().unwrap();
        // Earlier private qualifications never passed external publication/admit.
        // They must not become visible when a later input selects this same DB.
        facts.clear_private_qualifications()?;
        let head = facts.metadata()?.committed_generation;
        let receipt = facts.qualify_complete_scan(qualification_id, input, head, scan)?;
        facts.prepare_catalog(validation.as_ref())?;
        catalog_files::sync_parent(&self.path)?;
        if !check_sources()? {
            return Err(incompatible("migration source fence failed"));
        }
        let guard = self.control.exclusive()?;
        if self.control.active()? != self.parent_publication
            || self
                .parent
                .as_ref()
                .unwrap()
                .metadata()?
                .committed_generation
                != self.expected
        {
            return Err(StoreError::new(
                StoreErrorKind::InvalidGeneration,
                "catalog base changed during migration",
            ));
        }
        if !admit()? {
            return Err(incompatible("migration publication admission rejected"));
        }
        if facts.qualification(input)?.as_ref() != Some(&receipt) {
            return Err(incompatible("migration qualification changed"));
        }
        let name = self
            .path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| incompatible("invalid migration path"))?;
        // Control chooses the physical store only. Authoritative data head and
        // qualifications are in the candidate data DB, never mirrored as proof.
        self.control.publish(name, head, None)?;
        self.activated = true;
        drop(guard);
        if let Some(candidate) = self.candidate.take() {
            catalog_files::retire(candidate, &self.control, &self.identity);
        }
        if let Some(parent) = self.parent.take() {
            catalog_files::retire(parent, &self.control, &self.identity);
        }
        Ok(receipt)
    }
}
impl Drop for CatalogMigration {
    fn drop(&mut self) {
        if let Some(parent) = self.parent.take() {
            catalog_files::retire(parent, &self.control, &self.identity);
        }
        if let Some(candidate) = self.candidate.take() {
            catalog_files::retire(candidate, &self.control, &self.identity);
        }
    }
}
// All validation happens while this is a private, unpublished store. No other
// native writer is allowed to acquire a private path by directory discovery.
impl VersionedFacts {
    pub(crate) fn prepare_catalog(
        &mut self,
        validation: Option<&crate::CatalogValidationObserver>,
    ) -> Result<(), StoreError> {
        self.validate_catalog_storage(validation)?;
        self.set_catalog_format()?;
        let report = self.checkpoint_passive()?;
        if report.log_frames != report.checkpointed_frames {
            return Err(incompatible("private catalog checkpoint is pinned"));
        }
        Ok(())
    }
}
