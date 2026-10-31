use std::{
    collections::VecDeque,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU8, Ordering},
        mpsc::Sender,
    },
    thread,
    time::{Duration, Instant},
};

use arkts_index_core::{Document, DocumentSymbols, parse_document_symbols};
use arkts_index_sqlite::{CatalogInputs, path_to_file_uri};
use ignore::{
    Match,
    gitignore::{Gitignore, GitignoreBuilder},
};

#[path = "catalog_source.rs"]
mod source;
#[path = "catalog_test_gate.rs"]
mod test_gate;
use source::{SourceRead, SourceStamp, read_source};

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
    state: &AtomicU8,
    updates: &Sender<CatalogUpdate>,
) -> Result<(), (CatalogProgress, String)> {
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
    let mut documents = Vec::new();
    let mut sources = Vec::new();
    let mut inputs = CatalogInputs::new().ok();
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
                        sources.push(SourceStamp::capture(&path, &metadata, &text));
                        if let Some(inputs) = &mut inputs {
                            inputs.record(&uri, &text);
                        }
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
    worker::activate(
        database_path,
        workspace_identity,
        generation,
        state,
        updates,
        documents,
        rejected_uris,
        progress,
        sources,
        inputs.map(CatalogInputs::finish).filter(|_| !force),
    )
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
