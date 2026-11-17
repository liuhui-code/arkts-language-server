//! Re-enumerate the same admitted source namespace before publication.
use super::{Discovery, fail};
use crate::catalog::{self, CatalogProgress, CatalogUpdate};
use arkts_index_core::StoreError;
use std::sync::{
    Arc,
    atomic::{AtomicU8, Ordering},
    mpsc::Sender,
};

pub(super) fn fence(
    view: crate::source_scope::SourceView<'_>,
    expected: &[String],
    sources: &[catalog::SourceStamp],
    state: &Arc<AtomicU8>,
    updates: &Sender<CatalogUpdate>,
    revision: u64,
) -> Result<bool, StoreError> {
    if state.load(Ordering::Acquire) == 1 {
        return Ok(false);
    }
    let mut visitor = Discovery::default();
    let progress = catalog::walk(
        view,
        revision,
        state,
        updates,
        CatalogProgress::default(),
        &mut visitor,
    )
    .map_err(|e| fail(e.1))?;
    let Some(progress) = progress else {
        return Ok(false);
    };
    let mut actual: Vec<_> = visitor.jobs.into_iter().map(|j| j.uri).collect();
    actual.sort();
    Ok(!visitor.uncertain
        && visitor.rejected.is_empty()
        && progress.rejected == 0
        && progress.policy_skipped == 0
        && actual == expected
        && catalog::all_current(sources)
        && state.load(Ordering::Acquire) != 1)
}
