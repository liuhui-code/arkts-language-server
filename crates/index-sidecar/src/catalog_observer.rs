use super::test_gate::{
    ActivationGateResult, TEST_ACTIVATION_WAITING, activation_file_gate,
    wait_at_test_activation_gate,
};
use super::{
    CatalogProgress, CatalogUpdate,
    source::SourceStamp,
    worker::{CATALOG_CANCELLED, CATALOG_RUNNING, CatalogFailure},
};
use arkts_index_core::{CommitReceipt, IndexState, RefreshReport, StoreError};
use arkts_index_sqlite::{CatalogBuildProgress, CatalogStage};
use std::{
    sync::{
        atomic::{AtomicU8, Ordering},
        mpsc::Sender,
    },
    time::Instant,
};
pub(super) const CATALOG_ACTIVATING: u8 = 2;
const CATALOG_PUBLISHING: u8 = 4;

pub(super) fn begin_activation(
    state: &AtomicU8,
    updates: &Sender<CatalogUpdate>,
    generation: u64,
    progress: &CatalogProgress,
) -> Result<bool, CatalogFailure> {
    let file_gate = activation_file_gate(generation)
        .map_err(|message| Box::new((progress.clone(), message)))?;
    let activating_state = if file_gate.is_some() {
        TEST_ACTIVATION_WAITING
    } else {
        CATALOG_ACTIVATING
    };
    if state
        .compare_exchange(
            CATALOG_RUNNING,
            activating_state,
            Ordering::AcqRel,
            Ordering::Acquire,
        )
        .is_err()
    {
        return Ok(false);
    }
    let _ = updates.send(CatalogUpdate::Activating {
        generation,
        progress: progress.clone(),
    });
    if let Some(file_gate) = file_gate {
        match file_gate.wait_for_release(state, CATALOG_CANCELLED) {
            Ok(ActivationGateResult::Released) => {}
            #[cfg(debug_assertions)]
            Ok(ActivationGateResult::Cancelled) => {
                return Ok(false);
            }
            Err(message) => return Err(Box::new((progress.clone(), message))),
        }
        if state
            .compare_exchange(
                TEST_ACTIVATION_WAITING,
                CATALOG_ACTIVATING,
                Ordering::AcqRel,
                Ordering::Acquire,
            )
            .is_err()
        {
            return Ok(false);
        }
    }
    wait_at_test_activation_gate();
    Ok(true)
}
pub(super) struct StorageObserver<'a> {
    state: &'a AtomicU8,
    updates: &'a Sender<CatalogUpdate>,
    generation: u64,
    source_changed: bool,
    last_log_stage: Option<&'static str>,
    last_log: Option<Instant>,
    last_progress: Option<Instant>,
}
impl<'a> StorageObserver<'a> {
    pub(super) fn new(
        state: &'a AtomicU8,
        updates: &'a Sender<CatalogUpdate>,
        generation: u64,
    ) -> Self {
        Self {
            state,
            updates,
            generation,
            source_changed: false,
            last_log_stage: None,
            last_log: None,
            last_progress: None,
        }
    }
    pub(super) fn observe(
        &mut self,
        storage: CatalogBuildProgress,
        progress: &mut CatalogProgress,
        sources: &[SourceStamp],
    ) -> bool {
        let generation = self.generation;

        if self.state.load(Ordering::Acquire) == CATALOG_CANCELLED {
            return false;
        }
        // A lazy producer is polled once per file; cancellation still checks above,
        // but identical writer progress must not enqueue one update per document.
        if storage.stage == CatalogStage::Writing
            && progress.storage == Some(storage)
            && self
                .last_progress
                .is_some_and(|time| time.elapsed() < super::PROGRESS_INTERVAL)
        {
            return true;
        }
        self.last_progress = Some(Instant::now());
        if progress
            .storage
            .is_none_or(|previous| previous.stage != storage.stage)
        {
            progress.stage_started = Some(Instant::now());
        }
        let log_stage = match storage.stage {
            CatalogStage::Writing | CatalogStage::Committing | CatalogStage::Checkpointing => {
                "persisting"
            }
            other => other.as_str(),
        };
        if self.last_log_stage != Some(log_stage)
            || self
                .last_log
                .is_none_or(|started| started.elapsed().as_secs() >= 10)
        {
            eprintln!(
                "{{\"event\":\"index.catalog.storage-stage\",\"generation\":{generation},\"stage\":\"{}\",\"writtenDocuments\":{},\"writtenRows\":{}}}",
                storage.stage.as_str(),
                storage.written_documents,
                storage.written_rows
            );
            self.last_log_stage = Some(log_stage);
            self.last_log = Some(Instant::now());
        }
        progress.storage = Some(storage);
        progress.activity_sequence += 1;
        let update = if self.state.load(Ordering::Acquire) == CATALOG_RUNNING {
            CatalogUpdate::Progress {
                generation: self.generation,
                progress: progress.clone(),
            }
        } else {
            CatalogUpdate::Activating {
                generation: self.generation,
                progress: progress.clone(),
            }
        };
        let _ = self.updates.send(update);
        if self.state.load(Ordering::Acquire) == CATALOG_RUNNING
            && storage.stage == CatalogStage::Writing
            && !super::stream_gate::writer(storage.written_documents, self.state)
        {
            return false;
        }
        if storage.stage == CatalogStage::Checking {
            for chunk in sources.chunks(64) {
                if self.state.load(Ordering::Acquire) == CATALOG_CANCELLED {
                    return false;
                }
                self.source_changed = !super::source::all_current(chunk);
                if self.source_changed {
                    return false;
                }
                progress.activity_sequence += 1;
                let _ = self.updates.send(CatalogUpdate::Activating {
                    generation: self.generation,
                    progress: progress.clone(),
                });
            }
        }
        if storage.stage == CatalogStage::Publishing
            && self
                .state
                .compare_exchange(
                    CATALOG_ACTIVATING,
                    CATALOG_PUBLISHING,
                    Ordering::AcqRel,
                    Ordering::Acquire,
                )
                .is_err()
        {
            return false;
        }
        true
    }
    pub(super) fn finish(
        self,
        outcome: Result<CommitReceipt, StoreError>,
        progress: CatalogProgress,
    ) -> Result<(), CatalogFailure> {
        match outcome {
            Ok(receipt) => {
                let report = RefreshReport {
                    indexed_documents: progress.indexed,
                    committed_generation: receipt.committed_generation,
                    state: if receipt.rejected_documents.is_empty() {
                        IndexState::Ready
                    } else {
                        IndexState::Degraded
                    },
                    rejected_documents: receipt.rejected_documents,
                };
                let _ = self.updates.send(CatalogUpdate::Complete {
                    generation: self.generation,
                    report,
                    progress,
                });
            }
            Err(_) if self.state.load(Ordering::Acquire) == CATALOG_CANCELLED => {
                let _ = self.updates.send(CatalogUpdate::Cancelled {
                    generation: self.generation,
                    progress,
                });
            }
            Err(error) => {
                return Err(Box::new((
                    progress,
                    if self.source_changed {
                        "workspace sources changed before catalog publication; rebuild required"
                            .into()
                    } else {
                        error.to_string()
                    },
                )));
            }
        }
        Ok(())
    }
}
