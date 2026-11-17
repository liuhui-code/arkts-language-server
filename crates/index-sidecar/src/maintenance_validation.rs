//! Relay actual private-validation VM work, never synthetic wall-clock heartbeats.
use crate::catalog::{CatalogProgress, CatalogUpdate};
use arkts_index_sqlite::{CatalogMigration, CatalogValidationObserver, CatalogValidationStage};
use std::{
    sync::{
        Arc, Mutex,
        atomic::{AtomicU8, Ordering},
        mpsc::Sender,
    },
    time::{Duration, Instant},
};
struct Relay {
    stage: Option<CatalogValidationStage>,
    last_steps: u64,
    last_sent: Instant,
    stage_started: Instant,
    sequence: u64,
}
pub(super) fn attach(
    builder: &mut CatalogMigration,
    base: &CatalogProgress,
    state: &Arc<AtomicU8>,
    updates: &Sender<CatalogUpdate>,
    revision: u64,
) {
    let state = state.clone();
    let updates = updates.clone();
    let base = base.clone();
    // One callback thread owns SQL. The mutex only provides the observer's Sync bound.
    let relay = Mutex::new(Relay {
        stage: None,
        last_steps: 0,
        last_sent: Instant::now(),
        stage_started: Instant::now(),
        sequence: base.activity_sequence,
    });
    builder.set_validation_observer(CatalogValidationObserver::new(move |work| {
        if state.load(Ordering::Acquire) == 1 {
            return false;
        }
        let mut mark = relay.lock().unwrap_or_else(|p| p.into_inner());
        let changed = mark.stage != Some(work.stage);
        let first_work = mark.last_steps == 0 && work.vm_steps > 0;
        if changed || first_work || mark.last_sent.elapsed() >= Duration::from_millis(200) {
            if changed {
                mark.stage_started = Instant::now();
            }
            mark.stage = Some(work.stage);
            mark.last_steps = work.vm_steps;
            mark.last_sent = Instant::now();
            mark.sequence += 1;
            let mut progress = base.clone();
            progress.validation = Some(work);
            progress.activity_sequence = mark.sequence;
            progress.stage_started = Some(mark.stage_started);
            if updates
                .send(CatalogUpdate::Progress {
                    generation: revision,
                    progress,
                })
                .is_err()
            {
                return false;
            }
        }
        state.load(Ordering::Acquire) != 1
    }));
}
