use std::{
    collections::VecDeque,
    fs,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicU8, Ordering},
        mpsc::Sender,
    },
    time::{Duration, Instant},
};

use arkts_index_sqlite::path_to_file_uri;
use ignore::{
    Match,
    gitignore::{Gitignore, GitignoreBuilder},
};

#[path = "catalog_source.rs"]
mod source;
#[path = "catalog_test_gate.rs"]
mod test_gate;

#[path = "catalog_discovery.rs"]
mod discovery;
use discovery::{is_gitignored, is_hard_excluded_directory, is_source_path, load_ignore_file};

use self::test_gate::{test_entry_delay, wait_at_test_catalog_gate, wait_for_test_entry_delay};

const MAX_SOURCE_BYTES: u64 = 2 * 1024 * 1024;
const PROGRESS_FILE_BATCH: usize = 64;
const PROGRESS_BYTE_BATCH: u64 = 1024 * 1024;
const PROGRESS_ENTRY_BATCH: usize = 512;
const PROGRESS_INTERVAL: Duration = Duration::from_millis(250);
const PARSE_WORKERS: usize = 4;
const HARD_EXCLUDED_DIRECTORIES: &[&str] = &[
    ".git",
    ".hg",
    ".svn",
    "node_modules",
    "oh_modules",
    ".hvigor",
    ".idea",
    ".preview",
    ".cxx",
    ".test",
    "build",
    "dist",
    "out",
    "target",
];

#[path = "catalog_hash.rs"]
mod hash;
#[path = "catalog_walk.rs"]
mod walker;
pub(crate) use hash::Issue as ScanIssue;
pub(crate) use source::{SourceStamp, all_current};
pub(crate) use streaming::pool::Pool as ParserPool;
pub(crate) use streaming::{
    Collected,
    producer::{Job, Producer},
};
pub(crate) use walker::{WalkVisitor, walk};
pub(crate) fn wait_maintenance_gate(state: &AtomicU8) -> bool {
    wait_at_test_catalog_gate(state, CATALOG_CANCELLED)
}
pub(crate) fn is_maintenance_source(path: &Path) -> bool {
    is_source_path(path)
}
pub(crate) fn maintenance_ignore_rules(
    root: &Path,
    path: &Path,
) -> Result<Vec<Gitignore>, arkts_index_core::StoreError> {
    let loaded = load_ignore_file(root, path);
    if loaded.had_error {
        return Err(arkts_index_core::StoreError::new(
            arkts_index_core::StoreErrorKind::InvalidData,
            "source admission rules unavailable",
        ));
    }
    Ok(loaded.matcher.into_iter().collect())
}
pub(crate) fn maintenance_excluded(rules: &[Gitignore], path: &Path, directory: bool) -> bool {
    directory && is_hard_excluded_directory(path) || is_gitignored(rules, path, directory)
}
#[path = "catalog_observer.rs"]
mod observer;
#[path = "catalog_scan_test_gate.rs"]
mod scan_gate;
#[path = "catalog_stream_test_gate.rs"]
mod stream_gate;
#[path = "catalog_streaming.rs"]
mod streaming;
#[path = "catalog_worker.rs"]
mod worker;
use worker::CATALOG_CANCELLED;
pub use worker::{CatalogControl, CatalogProgress, CatalogUpdate, spawn_catalog};

struct DirectoryTask {
    relative: PathBuf,
    ignore_matchers: Vec<Gitignore>,
}

struct LoadedIgnore {
    matcher: Option<Gitignore>,
    had_error: bool,
}

fn scan_workspace(
    workspace: (
        &Path,
        Option<&arkts_index_sqlite::cache_gc::namespace::ManagedCacheNamespace>,
    ),
    database_path: &Path,
    workspace_identity: &str,
    generation: u64,
    force: bool,
    state: &Arc<AtomicU8>,
    updates: &Sender<CatalogUpdate>,
) -> Result<(), worker::CatalogFailure> {
    let (workspace_root, namespace) = workspace;
    let progress = CatalogProgress::default();
    let _ = updates.send(CatalogUpdate::Progress {
        generation,
        progress: progress.clone(),
    });
    if wait_at_test_catalog_gate(state, CATALOG_CANCELLED) {
        let _ = updates.send(CatalogUpdate::Cancelled {
            generation,
            progress,
        });
        return Ok(());
    }
    crate::managed_cache_admission::validate(namespace)
        .map_err(|e| Box::new((progress.clone(), e.to_string())))?;
    let manifest = Vec::new();
    let planner = if force {
        None
    } else {
        Some(
            hash::Planner::begin(database_path, workspace_identity, generation)
                .map_err(|error| Box::new((progress.clone(), error.to_string())))?,
        )
    };
    let rejected_uris = Vec::new();
    let mut visitor = LegacyVisitor {
        planner,
        manifest,
        rejected: rejected_uris,
    };
    let Some(progress) = walk(
        crate::source_scope::SourceView {
            root: workspace_root,
            owner: namespace,
            peers: &[],
        },
        generation,
        state,
        updates,
        progress,
        &mut visitor,
    )?
    else {
        return Ok(());
    };
    let LegacyVisitor {
        planner,
        manifest,
        rejected: rejected_uris,
    } = visitor;
    if force {
        return streaming::build(streaming::ForceBuild {
            namespace,
            database_path,
            workspace_identity,
            generation,
            state,
            updates,
            manifest,
            rejected_uris,
            progress,
        });
    }
    planner.unwrap().build(
        state,
        updates,
        generation,
        progress,
        rejected_uris,
        namespace,
    )
}

struct LegacyVisitor {
    planner: Option<hash::Planner>,
    manifest: Vec<(String, PathBuf)>,
    rejected: Vec<String>,
}
impl WalkVisitor for LegacyVisitor {
    fn invalidate(&mut self, issue: hash::Issue) {
        hash::invalidate(&mut self.planner, issue);
    }
    fn reject(&mut self, uri: String) {
        self.rejected.push(uri);
    }
    fn source(
        &mut self,
        uri: String,
        path: PathBuf,
        metadata: fs::Metadata,
        progress: &mut CatalogProgress,
    ) -> Result<(), arkts_index_core::StoreError> {
        if let Some(planner) = &mut self.planner {
            planner.admit(uri, path, metadata, progress, &mut self.rejected);
        } else {
            self.manifest.push((uri, path));
        }
        Ok(())
    }
}
fn is_cancelled(state: &AtomicU8) -> bool {
    state.load(Ordering::Acquire) == CATALOG_CANCELLED
}

#[allow(clippy::too_many_arguments)]
fn maybe_emit_progress(
    generation: u64,
    progress: &CatalogProgress,
    updates: &Sender<CatalogUpdate>,
    last_progress: &mut Instant,
    entries_since_progress: &mut usize,
    files_since_progress: &mut usize,
    bytes_since_progress: &mut u64,
) {
    if *entries_since_progress < PROGRESS_ENTRY_BATCH
        && *files_since_progress < PROGRESS_FILE_BATCH
        && *bytes_since_progress < PROGRESS_BYTE_BATCH
        && last_progress.elapsed() < PROGRESS_INTERVAL
    {
        return;
    }
    let _ = updates.send(CatalogUpdate::Progress {
        generation,
        progress: progress.clone(),
    });
    *last_progress = Instant::now();
    *entries_since_progress = 0;
    *files_since_progress = 0;
    *bytes_since_progress = 0;
}

pub(crate) use source::{
    SourceRead as MaintenanceSourceRead, read_source as read_maintenance_source,
};
