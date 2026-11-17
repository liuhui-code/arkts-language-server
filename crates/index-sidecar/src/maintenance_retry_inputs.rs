//! A private draft is a cache of sealed content keys, never a current-input proof.
use crate::{
    catalog::{self, Job},
    maintenance_engine::hex,
};
use arkts_index_core::{StoreError, StoreErrorKind};
use arkts_index_sqlite::{CatalogMigration, CompleteScanInputs, ManifestEntry, ManifestValue};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    sync::atomic::{AtomicU8, Ordering},
};
pub(super) struct Prepared {
    pub jobs: Vec<Job>,
    pub fingerprint: CompleteScanInputs,
    pub sources: Vec<catalog::SourceStamp>,
    pub stamps: BTreeMap<String, catalog::SourceStamp>,
    pub entries: Vec<ManifestEntry>,
    pub reused: usize,
    pub reclamation: arkts_index_sqlite::DraftReclamation,
}
pub(super) fn prepare(
    jobs: Vec<Job>,
    draft: &mut CatalogMigration,
    state: &AtomicU8,
) -> Result<Prepared, StoreError> {
    let inventory = draft.inventory()?;
    let expected: BTreeSet<_> = jobs.iter().map(|j| j.uri.clone()).collect();
    let current: BTreeMap<_, _> = inventory
        .entries
        .into_iter()
        .map(|e| (e.uri, e.value))
        .collect();
    let mut prepared = Prepared {
        jobs: Vec::new(),
        fingerprint: CompleteScanInputs::new()?,
        sources: Vec::new(),
        stamps: BTreeMap::new(),
        entries: Vec::new(),
        reused: 0,
        reclamation: Default::default(),
    };
    let mut keep = Vec::new();
    for mut job in jobs {
        if state.load(Ordering::Acquire) == 1 {
            return Err(fail("private draft input cancelled"));
        }
        let metadata = fs::metadata(&job.path).map_err(|e| fail(&e.to_string()))?;
        let text = match catalog::read_maintenance_source(&job.path) {
            Ok(catalog::MaintenanceSourceRead::Text(text)) => text,
            _ => return Err(fail("private retry source unreadable or outside admission")),
        };
        let stamp = catalog::SourceStamp::capture(&job.path, &metadata, &text);
        let sha = hex(&stamp);
        prepared.fingerprint.record_digest(&job.uri, stamp.digest());
        prepared.sources.push(stamp.clone());
        if let Some(version) = draft.facts_mut().find_version(&job.uri, &sha)? {
            keep.push(version.version.clone());
            prepared.reused += 1;
            if current.get(&job.uri) != Some(&ManifestValue::Accepted(version.version.clone())) {
                prepared
                    .entries
                    .push(ManifestEntry::accepted(&job.uri, &version.version));
            }
        } else {
            prepared.stamps.insert(job.uri.clone(), stamp.clone());
            job.expected = Some(stamp);
            prepared.jobs.push(job);
        }
    }
    for (uri, value) in current {
        if !expected.contains(&uri) && value != ManifestValue::Removed {
            prepared.entries.push(ManifestEntry::removed(&uri));
        }
    }
    prepared.reclamation = draft.prepare_reuse(&keep, || state.load(Ordering::Acquire) != 1)?;
    Ok(prepared)
}
fn fail(message: &str) -> StoreError {
    StoreError::new(StoreErrorKind::InvalidData, message)
}
