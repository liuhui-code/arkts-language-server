use super::{scan_workspace, test_gate};
use arkts_index_core::{DocumentSymbols, FullCatalogBatch, IndexState, RefreshReport};
use arkts_index_sqlite::{CatalogBuildProgress, CatalogStage, build_catalog_with_fingerprint};
use std::{
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicU8, Ordering},
        mpsc::Sender,
    },
    thread,
    time::Instant,
};
use test_gate::{
    ActivationGateResult, TEST_ACTIVATION_WAITING, activation_file_gate,
    wait_at_test_activation_gate,
};
pub(super) const CATALOG_RUNNING: u8 = 0;
pub(super) const CATALOG_CANCELLED: u8 = 1;
const CATALOG_ACTIVATING: u8 = 2;
const CATALOG_PUBLISHING: u8 = 4;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct CatalogProgress {
    pub discovered: usize,
    pub indexed: usize,
    pub rejected: usize,
    pub policy_skipped: usize,
    pub ignored: usize,
    pub total_files: Option<usize>,
    pub storage: Option<CatalogBuildProgress>,
    pub stage_started: Option<Instant>,
    pub activity_sequence: u64,
}

#[derive(Debug)]
pub enum CatalogUpdate {
    Progress {
        generation: u64,
        progress: CatalogProgress,
    },
    Activating {
        generation: u64,
        progress: CatalogProgress,
    },
    Complete {
        generation: u64,
        report: RefreshReport,
        progress: CatalogProgress,
    },
    Cancelled {
        generation: u64,
        progress: CatalogProgress,
    },
    Failed {
        generation: u64,
        progress: CatalogProgress,
        message: String,
    },
}

pub struct CatalogControl {
    state: Arc<AtomicU8>,
}

impl CatalogControl {
    pub fn cancel(&self) -> bool {
        if self
            .state
            .compare_exchange(
                CATALOG_RUNNING,
                CATALOG_CANCELLED,
                Ordering::AcqRel,
                Ordering::Acquire,
            )
            .is_ok()
        {
            return true;
        }
        if self
            .state
            .compare_exchange(
                CATALOG_ACTIVATING,
                CATALOG_CANCELLED,
                Ordering::AcqRel,
                Ordering::Acquire,
            )
            .is_ok()
        {
            return true;
        }
        self.state
            .compare_exchange(
                TEST_ACTIVATION_WAITING,
                CATALOG_CANCELLED,
                Ordering::AcqRel,
                Ordering::Acquire,
            )
            .is_ok()
    }
}

pub fn spawn_catalog(
    workspace_root: PathBuf,
    database_path: PathBuf,
    workspace_identity: String,
    generation: u64,
    force: bool,
    updates: Sender<CatalogUpdate>,
) -> CatalogControl {
    let state = Arc::new(AtomicU8::new(CATALOG_RUNNING));
    let worker_state = Arc::clone(&state);
    thread::Builder::new()
        .name(format!("arkts-catalog-{generation}"))
        .spawn(move || {
            let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                scan_workspace(
                    &workspace_root,
                    &database_path,
                    &workspace_identity,
                    generation,
                    force,
                    &worker_state,
                    &updates,
                )
            }));
            match outcome {
                Ok(Ok(())) => {}
                Ok(Err((progress, message))) => {
                    let _ = updates.send(CatalogUpdate::Failed {
                        generation,
                        progress,
                        message,
                    });
                }
                Err(_) => {
                    let _ = updates.send(CatalogUpdate::Failed {
                        generation,
                        progress: CatalogProgress::default(),
                        message: "catalog worker panicked".to_owned(),
                    });
                }
            }
        })
        .expect("catalog worker thread should spawn");
    CatalogControl { state }
}

pub(super) fn activate(
    database_path: &Path,
    workspace_identity: &str,
    generation: u64,
    state: &AtomicU8,
    updates: &Sender<CatalogUpdate>,
    documents: Vec<DocumentSymbols>,
    rejected_uris: Vec<String>,
    mut progress: CatalogProgress,
    sources: Vec<super::source::SourceStamp>,
    fingerprint: Option<String>,
) -> Result<(), (CatalogProgress, String)> {
    let file_gate =
        activation_file_gate(generation).map_err(|message| (progress.clone(), message))?;
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
        let _ = updates.send(CatalogUpdate::Cancelled {
            generation,
            progress,
        });
        return Ok(());
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
                let _ = updates.send(CatalogUpdate::Cancelled {
                    generation,
                    progress,
                });
                return Ok(());
            }
            Err(message) => return Err((progress, message)),
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
            let _ = updates.send(CatalogUpdate::Cancelled {
                generation,
                progress,
            });
            return Ok(());
        }
    }
    wait_at_test_activation_gate();
    let mut source_changed = false;
    let mut last_log_stage = None;
    let mut last_log: Option<Instant> = None;
    let outcome = build_catalog_with_fingerprint(
        database_path,
        workspace_identity,
        FullCatalogBatch {
            generation,
            documents,
            rejected_uris,
        },
        fingerprint.as_deref(),
        |storage| {
            if state.load(Ordering::Acquire) == CATALOG_CANCELLED {
                return false;
            }
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
            if last_log_stage != Some(log_stage)
                || last_log.is_none_or(|started| started.elapsed().as_secs() >= 10)
            {
                eprintln!(
                    "{{\"event\":\"index.catalog.storage-stage\",\"generation\":{generation},\"stage\":\"{}\",\"writtenDocuments\":{},\"writtenRows\":{}}}",
                    storage.stage.as_str(),
                    storage.written_documents,
                    storage.written_rows
                );
                last_log_stage = Some(log_stage);
                last_log = Some(Instant::now());
            }
            progress.storage = Some(storage);
            progress.activity_sequence += 1;
            let _ = updates.send(CatalogUpdate::Activating {
                generation,
                progress: progress.clone(),
            });
            if storage.stage == CatalogStage::Checking {
                for chunk in sources.chunks(64) {
                    if state.load(Ordering::Acquire) == CATALOG_CANCELLED {
                        return false;
                    }
                    source_changed = chunk.iter().any(|source| !source.is_current());
                    if source_changed {
                        return false;
                    }
                    progress.activity_sequence += 1;
                    let _ = updates.send(CatalogUpdate::Activating {
                        generation,
                        progress: progress.clone(),
                    });
                }
            }
            if storage.stage == CatalogStage::Publishing
                && state
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
        },
    );
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
            let _ = updates.send(CatalogUpdate::Complete {
                generation,
                report,
                progress,
            });
        }
        Err(_) if state.load(Ordering::Acquire) == CATALOG_CANCELLED => {
            let _ = updates.send(CatalogUpdate::Cancelled {
                generation,
                progress,
            });
        }
        Err(error) => {
            return Err((
                progress,
                if source_changed {
                    "workspace sources changed before catalog publication; rebuild required".into()
                } else {
                    error.to_string()
                },
            ));
        }
    }
    Ok(())
}
