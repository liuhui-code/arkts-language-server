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
    workspace_root: &Path,
    database_path: &Path,
    workspace_identity: &str,
    generation: u64,
    force: bool,
    state: &Arc<AtomicU8>,
    updates: &Sender<CatalogUpdate>,
) -> Result<(), worker::CatalogFailure> {
    let mut progress = CatalogProgress::default();
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
    let mut manifest = Vec::new();
    let mut planner = if force {
        None
    } else {
        Some(
            hash::Planner::begin(database_path, workspace_identity, generation)
                .map_err(|error| Box::new((progress.clone(), error.to_string())))?,
        )
    };
    let mut rejected_uris = Vec::new();
    let mut last_progress = Instant::now();
    let mut entries_since_progress = 0usize;
    let mut files_since_progress = 0usize;
    let mut bytes_since_progress = 0u64;
    let test_entry_delay = test_entry_delay();
    let mut root_matchers = Vec::new();
    let loaded = load_ignore_file(workspace_root, &workspace_root.join(".git/info/exclude"));
    if loaded.had_error {
        hash::invalidate(&mut planner, hash::Issue::IgnoreRules);
        progress.rejected += 1;
    }
    if let Some(matcher) = loaded.matcher {
        root_matchers.push(matcher);
    }
    let mut pending_directories = VecDeque::from([DirectoryTask {
        relative: PathBuf::new(),
        ignore_matchers: root_matchers,
    }]);

    while let Some(task) = pending_directories.pop_front() {
        if is_cancelled(state) {
            let _ = updates.send(CatalogUpdate::Cancelled {
                generation,
                progress,
            });
            return Ok(());
        }
        let relative_directory = task.relative;
        let directory = workspace_root.join(&relative_directory);
        let mut ignore_matchers = task.ignore_matchers;
        let loaded = load_ignore_file(&directory, &directory.join(".gitignore"));
        if loaded.had_error {
            hash::invalidate(&mut planner, hash::Issue::IgnoreRules);
            progress.rejected += 1;
        }
        if let Some(matcher) = loaded.matcher {
            ignore_matchers.push(matcher);
        }
        let entries = match scan_gate::io("directory", &directory, || fs::read_dir(&directory)) {
            Ok(entries) => entries,
            Err(error) if relative_directory.as_os_str().is_empty() => {
                return Err(Box::new((
                    progress,
                    format!("failed to read directory {}: {error}", directory.display()),
                )));
            }
            Err(_) => {
                hash::invalidate(&mut planner, hash::Issue::Directory);
                progress.rejected += 1;
                maybe_emit_progress(
                    generation,
                    &progress,
                    updates,
                    &mut last_progress,
                    &mut entries_since_progress,
                    &mut files_since_progress,
                    &mut bytes_since_progress,
                );
                continue;
            }
        };

        for entry in entries {
            if is_cancelled(state) {
                let _ = updates.send(CatalogUpdate::Cancelled {
                    generation,
                    progress,
                });
                return Ok(());
            }
            let entry = match scan_gate::io("entry", &directory, || entry) {
                Ok(entry) => entry,
                Err(_) => {
                    hash::invalidate(&mut planner, hash::Issue::Entry);
                    progress.rejected += 1;
                    entries_since_progress += 1;
                    maybe_emit_progress(
                        generation,
                        &progress,
                        updates,
                        &mut last_progress,
                        &mut entries_since_progress,
                        &mut files_since_progress,
                        &mut bytes_since_progress,
                    );
                    continue;
                }
            };
            if wait_for_test_entry_delay(test_entry_delay, state, CATALOG_CANCELLED) {
                let _ = updates.send(CatalogUpdate::Cancelled {
                    generation,
                    progress,
                });
                return Ok(());
            }
            entries_since_progress += 1;
            let path = entry.path();
            let relative = relative_directory.join(entry.file_name());
            let file_type = match scan_gate::io("file-type", &path, || entry.file_type()) {
                Ok(file_type) => file_type,
                Err(_) => {
                    hash::invalidate(&mut planner, hash::Issue::FileType);
                    progress.rejected += 1;
                    maybe_emit_progress(
                        generation,
                        &progress,
                        updates,
                        &mut last_progress,
                        &mut entries_since_progress,
                        &mut files_since_progress,
                        &mut bytes_since_progress,
                    );
                    continue;
                }
            };

            if file_type.is_symlink() {
                progress.ignored += 1;
                maybe_emit_progress(
                    generation,
                    &progress,
                    updates,
                    &mut last_progress,
                    &mut entries_since_progress,
                    &mut files_since_progress,
                    &mut bytes_since_progress,
                );
                continue;
            }

            let is_directory = file_type.is_dir();
            if is_directory && is_hard_excluded_directory(&path) {
                progress.ignored += 1;
                maybe_emit_progress(
                    generation,
                    &progress,
                    updates,
                    &mut last_progress,
                    &mut entries_since_progress,
                    &mut files_since_progress,
                    &mut bytes_since_progress,
                );
                continue;
            }

            if !is_directory && (!file_type.is_file() || !is_source_path(&path)) {
                maybe_emit_progress(
                    generation,
                    &progress,
                    updates,
                    &mut last_progress,
                    &mut entries_since_progress,
                    &mut files_since_progress,
                    &mut bytes_since_progress,
                );
                continue;
            }

            if is_gitignored(&ignore_matchers, &path, is_directory) {
                progress.ignored += 1;
                maybe_emit_progress(
                    generation,
                    &progress,
                    updates,
                    &mut last_progress,
                    &mut entries_since_progress,
                    &mut files_since_progress,
                    &mut bytes_since_progress,
                );
                continue;
            }
            if is_directory {
                pending_directories.push_back(DirectoryTask {
                    relative,
                    ignore_matchers: ignore_matchers.clone(),
                });
                maybe_emit_progress(
                    generation,
                    &progress,
                    updates,
                    &mut last_progress,
                    &mut entries_since_progress,
                    &mut files_since_progress,
                    &mut bytes_since_progress,
                );
                continue;
            }

            progress.discovered += 1;
            files_since_progress += 1;
            let uri = path_to_file_uri(&path);
            let metadata = match scan_gate::io("source-metadata", &path, || entry.metadata()) {
                Ok(metadata) => metadata,
                Err(_) => {
                    hash::invalidate(&mut planner, hash::Issue::SourceMetadata);
                    progress.rejected += 1;
                    rejected_uris.push(uri);
                    maybe_emit_progress(
                        generation,
                        &progress,
                        updates,
                        &mut last_progress,
                        &mut entries_since_progress,
                        &mut files_since_progress,
                        &mut bytes_since_progress,
                    );
                    continue;
                }
            };
            bytes_since_progress = bytes_since_progress.saturating_add(metadata.len());
            if metadata.len() > MAX_SOURCE_BYTES {
                progress.policy_skipped += 1;
            } else if force {
                manifest.push((uri, path));
            } else {
                planner.as_mut().unwrap().admit(
                    uri,
                    path,
                    metadata,
                    &mut progress,
                    &mut rejected_uris,
                );
            }
            maybe_emit_progress(
                generation,
                &progress,
                updates,
                &mut last_progress,
                &mut entries_since_progress,
                &mut files_since_progress,
                &mut bytes_since_progress,
            );
        }
    }

    progress.total_files = Some(progress.discovered);
    if force {
        return streaming::build(streaming::ForceBuild {
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
    planner
        .unwrap()
        .build(state, updates, generation, progress, rejected_uris)
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
