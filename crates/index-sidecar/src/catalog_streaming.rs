use super::{
    CatalogProgress, CatalogUpdate, observer, source::SourceStamp, worker::CatalogFailure,
};
use arkts_index_sqlite::{CatalogInput, build_catalog_stream};
use std::{
    cell::RefCell,
    path::{Path, PathBuf},
    sync::{Arc, atomic::AtomicU8, mpsc::Sender},
};

#[path = "catalog_stream_producer.rs"]
pub(super) mod producer;

pub(super) struct Collected {
    pub(super) progress: CatalogProgress,
    pub(super) sources: Vec<SourceStamp>,
    pub(super) inputs: Option<arkts_index_sqlite::CompleteScanInputs>,
}
pub(super) struct ForceBuild<'a> {
    pub database_path: &'a Path,
    pub workspace_identity: &'a str,
    pub generation: u64,
    pub state: &'a Arc<AtomicU8>,
    pub updates: &'a Sender<CatalogUpdate>,
    pub manifest: Vec<(String, PathBuf)>,
    pub rejected_uris: Vec<String>,
    pub progress: CatalogProgress,
}
pub(super) fn build(input: ForceBuild<'_>) -> Result<(), CatalogFailure> {
    let ForceBuild {
        database_path,
        workspace_identity,
        generation,
        state,
        updates,
        mut manifest,
        rejected_uris,
        progress,
    } = input;
    manifest.sort_unstable_by(|a, b| a.0.cmp(&b.0));
    let collected = RefCell::new(Collected {
        progress,
        sources: Vec::new(),
        inputs: None,
    });
    let mut producer = producer::Producer::new(
        manifest
            .into_iter()
            .map(|(uri, path)| producer::Job {
                uri,
                path,
                expected: None,
            })
            .collect(),
        state,
        updates,
        generation,
        &collected,
    )
    .map_err(|error| Box::new((collected.borrow().progress.clone(), error.to_string())))?;
    let mut observer = observer::StorageObserver::new(state, updates, generation);
    let events = rejected_uris
        .into_iter()
        .map(|uri| Ok(CatalogInput::Rejected(uri)))
        .chain(&mut producer);
    let outcome = build_catalog_stream(
        database_path,
        workspace_identity,
        generation,
        events,
        |storage| {
            let Collected {
                progress, sources, ..
            } = &mut *collected.borrow_mut();
            observer.observe(storage, progress, sources)
        },
    );
    // Disconnect every slot before joining, on success, cancellation, SQL error or unwinding.
    // No terminal event is sent while a parser can still own a source/result payload.
    drop(producer);
    observer.finish(outcome, collected.into_inner().progress)
}
