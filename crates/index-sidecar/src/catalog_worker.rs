use super::{scan_workspace, test_gate};
use arkts_index_core::RefreshReport;
use arkts_index_sqlite::CatalogBuildProgress;
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicU8, Ordering},
        mpsc::Sender,
    },
    thread,
    time::Instant,
};
use test_gate::TEST_ACTIVATION_WAITING;
pub(super) const CATALOG_RUNNING: u8 = 0;
pub(super) const CATALOG_CANCELLED: u8 = 1;
use super::observer::CATALOG_ACTIVATING;

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

pub(super) type CatalogFailure = Box<(CatalogProgress, String)>;

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
                Ok(Err(failure)) => {
                    let (progress, message) = *failure;
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
