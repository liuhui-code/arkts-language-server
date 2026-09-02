use std::{
    collections::VecDeque,
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicU8, Ordering},
        mpsc::Sender,
    },
    thread,
    time::{Duration, Instant},
};

use arkts_index_core::{
    Document, DocumentSymbols, RefreshReport, WorkspaceIndex, parse_document_symbols,
};
use arkts_index_sqlite::{SqliteStore, path_to_file_uri};
use ignore::{
    Match,
    gitignore::{Gitignore, GitignoreBuilder},
};

const MAX_SOURCE_BYTES: u64 = 2 * 1024 * 1024;
const READ_CHUNK_BYTES: usize = 64 * 1024;
const PROGRESS_FILE_BATCH: usize = 64;
const PROGRESS_BYTE_BATCH: u64 = 1024 * 1024;
const PROGRESS_ENTRY_BATCH: usize = 512;
const PROGRESS_INTERVAL: Duration = Duration::from_millis(250);
const PARSE_WORKERS: usize = 4;
const CATALOG_RUNNING: u8 = 0;
const CATALOG_CANCELLED: u8 = 1;
const CATALOG_ACTIVATING: u8 = 2;
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

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct CatalogProgress {
    pub discovered: usize,
    pub indexed: usize,
    pub rejected: usize,
    pub policy_skipped: usize,
    pub ignored: usize,
    pub total_files: Option<usize>,
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

struct DirectoryTask {
    relative: PathBuf,
    ignore_matchers: Vec<Gitignore>,
}

struct LoadedIgnore {
    matcher: Option<Gitignore>,
    had_error: bool,
}

impl CatalogControl {
    pub fn cancel(&self) -> bool {
        self.state
            .compare_exchange(
                CATALOG_RUNNING,
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

fn scan_workspace(
    workspace_root: &Path,
    database_path: &Path,
    workspace_identity: &str,
    generation: u64,
    state: &AtomicU8,
    updates: &Sender<CatalogUpdate>,
) -> Result<(), (CatalogProgress, String)> {
    let mut progress = CatalogProgress::default();
    let _ = updates.send(CatalogUpdate::Progress {
        generation,
        progress: progress.clone(),
    });
    if wait_at_test_catalog_gate(state) {
        let _ = updates.send(CatalogUpdate::Cancelled {
            generation,
            progress,
        });
        return Ok(());
    }
    let mut documents = Vec::new();
    let mut rejected_uris = Vec::new();
    let mut document_batch = Vec::with_capacity(PROGRESS_FILE_BATCH);
    let mut document_batch_bytes = 0usize;
    let mut last_progress = Instant::now();
    let mut entries_since_progress = 0usize;
    let mut files_since_progress = 0usize;
    let mut bytes_since_progress = 0u64;
    let test_entry_delay = test_entry_delay();
    let mut root_matchers = Vec::new();
    let loaded = load_ignore_file(workspace_root, &workspace_root.join(".git/info/exclude"));
    if loaded.had_error {
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
            progress.rejected += 1;
        }
        if let Some(matcher) = loaded.matcher {
            ignore_matchers.push(matcher);
        }
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) if relative_directory.as_os_str().is_empty() => {
                return Err((
                    progress,
                    format!("failed to read directory {}: {error}", directory.display()),
                ));
            }
            Err(_) => {
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
            let entry = match entry {
                Ok(entry) => entry,
                Err(_) => {
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
            if wait_for_test_entry_delay(test_entry_delay, state) {
                let _ = updates.send(CatalogUpdate::Cancelled {
                    generation,
                    progress,
                });
                return Ok(());
            }
            entries_since_progress += 1;
            let path = entry.path();
            let relative = relative_directory.join(entry.file_name());
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(_) => {
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
            let metadata = match entry.metadata() {
                Ok(metadata) => metadata,
                Err(_) => {
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
            } else {
                match read_source(&path) {
                    Ok(SourceRead::Text(text)) => {
                        document_batch_bytes = document_batch_bytes.saturating_add(text.len());
                        document_batch.push(Document::new(uri, text));
                        if document_batch.len() >= PROGRESS_FILE_BATCH
                            || document_batch_bytes >= PROGRESS_BYTE_BATCH as usize
                        {
                            parse_document_batch(
                                &mut document_batch,
                                &mut documents,
                                &mut rejected_uris,
                                &mut progress,
                            );
                            document_batch_bytes = 0;
                        }
                    }
                    Ok(SourceRead::PolicySkipped) => {
                        progress.policy_skipped += 1;
                    }
                    Err(_) => {
                        rejected_uris.push(uri);
                        progress.rejected += 1;
                    }
                }
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

    parse_document_batch(
        &mut document_batch,
        &mut documents,
        &mut rejected_uris,
        &mut progress,
    );
    progress.total_files = Some(progress.discovered);
    if state
        .compare_exchange(
            CATALOG_RUNNING,
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
    let _ = updates.send(CatalogUpdate::Activating {
        generation,
        progress: progress.clone(),
    });
    wait_at_test_activation_gate();
    let store = SqliteStore::open(database_path, workspace_identity)
        .map_err(|error| (progress.clone(), error.to_string()))?;
    let report = WorkspaceIndex::with_store(store)
        .activate_catalog(generation, documents, rejected_uris)
        .map_err(|error| (progress.clone(), error.to_string()))?;
    let _ = updates.send(CatalogUpdate::Complete {
        generation,
        report,
        progress,
    });
    Ok(())
}

fn parse_document_batch(
    batch: &mut Vec<Document>,
    documents: &mut Vec<DocumentSymbols>,
    rejected_uris: &mut Vec<String>,
    progress: &mut CatalogProgress,
) {
    if batch.is_empty() {
        return;
    }
    let batch = std::mem::take(batch);
    let worker_count = PARSE_WORKERS.min(batch.len());
    let chunk_size = batch.len().div_ceil(worker_count);
    let mut parsed_chunks = thread::scope(|scope| {
        let handles: Vec<_> = batch
            .chunks(chunk_size)
            .enumerate()
            .map(|(chunk_index, chunk)| {
                scope.spawn(move || {
                    (
                        chunk_index,
                        chunk.iter().map(parse_document_symbols).collect::<Vec<_>>(),
                    )
                })
            })
            .collect();
        handles
            .into_iter()
            .map(|handle| {
                handle
                    .join()
                    .expect("catalog parser worker should not panic")
            })
            .collect::<Vec<_>>()
    });
    parsed_chunks.sort_by_key(|(chunk_index, _)| *chunk_index);
    let results = parsed_chunks.into_iter().flat_map(|(_, results)| results);
    for (document, result) in batch.into_iter().zip(results) {
        match result {
            Ok(document) => {
                documents.push(document);
                progress.indexed += 1;
            }
            Err(_) => {
                rejected_uris.push(document.uri);
                progress.rejected += 1;
            }
        }
    }
}

fn load_ignore_file(root: &Path, path: &Path) -> LoadedIgnore {
    let metadata = match path.symlink_metadata() {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return LoadedIgnore {
                matcher: None,
                had_error: false,
            };
        }
        Err(_) => {
            return LoadedIgnore {
                matcher: None,
                had_error: true,
            };
        }
    };
    if !metadata.file_type().is_file() {
        return LoadedIgnore {
            matcher: None,
            had_error: false,
        };
    }
    let mut builder = GitignoreBuilder::new(root);
    let had_error = builder.add(path).is_some();
    match builder.build() {
        Ok(matcher) => LoadedIgnore {
            matcher: Some(matcher),
            had_error,
        },
        Err(_) => LoadedIgnore {
            matcher: None,
            had_error: true,
        },
    }
}

fn is_gitignored(matchers: &[Gitignore], path: &Path, is_directory: bool) -> bool {
    for matcher in matchers.iter().rev() {
        match matcher.matched(path, is_directory) {
            Match::Ignore(_) => return true,
            Match::Whitelist(_) => return false,
            Match::None => {}
        }
    }
    false
}

#[cfg(debug_assertions)]
fn wait_at_test_catalog_gate(state: &AtomicU8) -> bool {
    let Ok(milliseconds) = std::env::var("ARKTS_INDEX_TEST_CATALOG_GATE_MS") else {
        return false;
    };
    let Ok(milliseconds) = milliseconds.parse::<u64>() else {
        return false;
    };
    let deadline = Instant::now() + Duration::from_millis(milliseconds);
    while Instant::now() < deadline {
        if is_cancelled(state) {
            return true;
        }
        thread::sleep(Duration::from_millis(5));
    }
    is_cancelled(state)
}

#[cfg(not(debug_assertions))]
fn wait_at_test_catalog_gate(_state: &AtomicU8) -> bool {
    false
}

fn is_cancelled(state: &AtomicU8) -> bool {
    state.load(Ordering::Acquire) == CATALOG_CANCELLED
}

#[cfg(debug_assertions)]
fn wait_at_test_activation_gate() {
    let Ok(milliseconds) = std::env::var("ARKTS_INDEX_TEST_ACTIVATION_GATE_MS") else {
        return;
    };
    let Ok(milliseconds) = milliseconds.parse::<u64>() else {
        return;
    };
    thread::sleep(Duration::from_millis(milliseconds));
}

#[cfg(not(debug_assertions))]
fn wait_at_test_activation_gate() {}

#[cfg(debug_assertions)]
fn test_entry_delay() -> Duration {
    std::env::var("ARKTS_INDEX_TEST_ENTRY_DELAY_MS")
        .ok()
        .and_then(|milliseconds| milliseconds.parse::<u64>().ok())
        .map_or(Duration::ZERO, Duration::from_millis)
}

#[cfg(not(debug_assertions))]
fn test_entry_delay() -> Duration {
    Duration::ZERO
}

fn wait_for_test_entry_delay(delay: Duration, state: &AtomicU8) -> bool {
    if delay.is_zero() {
        return false;
    }
    let deadline = Instant::now() + delay;
    while Instant::now() < deadline {
        if is_cancelled(state) {
            return true;
        }
        thread::sleep(Duration::from_millis(5));
    }
    is_cancelled(state)
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

fn is_hard_excluded_directory(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| HARD_EXCLUDED_DIRECTORIES.contains(&name))
}

fn is_source_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| matches!(extension, "ets" | "ts"))
}

enum SourceRead {
    Text(String),
    PolicySkipped,
}

fn read_source(path: &Path) -> Result<SourceRead, ()> {
    let mut file = File::open(path).map_err(|_| ())?;
    let mut bytes = Vec::new();
    let mut chunk = [0u8; READ_CHUNK_BYTES];
    loop {
        let read = file.read(&mut chunk).map_err(|_| ())?;
        if read == 0 {
            break;
        }
        if bytes.len().saturating_add(read) > MAX_SOURCE_BYTES as usize {
            return Ok(SourceRead::PolicySkipped);
        }
        bytes.extend_from_slice(&chunk[..read]);
    }
    String::from_utf8(bytes)
        .map(SourceRead::Text)
        .map_err(|_| ())
}
