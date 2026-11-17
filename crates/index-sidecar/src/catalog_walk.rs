//! One directory walker for legacy catalogs and versioned maintenance.
use super::*;
pub(crate) trait WalkVisitor {
    fn invalidate(&mut self, issue: hash::Issue);
    fn reject(&mut self, uri: String);
    fn source(
        &mut self,
        uri: String,
        path: PathBuf,
        metadata: fs::Metadata,
        progress: &mut CatalogProgress,
    ) -> Result<(), arkts_index_core::StoreError>;
}
pub(crate) fn walk(
    view: crate::source_scope::SourceView<'_>,
    generation: u64,
    state: &Arc<AtomicU8>,
    updates: &Sender<CatalogUpdate>,
    mut progress: CatalogProgress,
    visitor: &mut impl WalkVisitor,
) -> Result<Option<CatalogProgress>, worker::CatalogFailure> {
    let crate::source_scope::SourceView {
        root: workspace_root,
        owner: namespace,
        peers,
    } = view;
    if let Some(namespace) = namespace {
        namespace
            .validate()
            .map_err(|e| Box::new((progress.clone(), e)))?;
    }
    let mut skipped_peers = Vec::new();
    let mut last_progress = Instant::now();
    let mut entries_since_progress = 0usize;
    let mut files_since_progress = 0usize;
    let mut bytes_since_progress = 0u64;
    let test_entry_delay = test_entry_delay();
    let mut root_matchers = Vec::new();
    let loaded = load_ignore_file(workspace_root, &workspace_root.join(".git/info/exclude"));
    if loaded.had_error {
        visitor.invalidate(hash::Issue::IgnoreRules);
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
            return Ok(None);
        }
        let relative_directory = task.relative;
        let directory = workspace_root.join(&relative_directory);
        let mut ignore_matchers = task.ignore_matchers;
        let loaded = load_ignore_file(&directory, &directory.join(".gitignore"));
        if loaded.had_error {
            visitor.invalidate(hash::Issue::IgnoreRules);
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
                visitor.invalidate(hash::Issue::Directory);
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
                return Ok(None);
            }
            let entry = match scan_gate::io("entry", &directory, || entry) {
                Ok(entry) => entry,
                Err(_) => {
                    visitor.invalidate(hash::Issue::Entry);
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
                return Ok(None);
            }
            entries_since_progress += 1;
            let path = entry.path();
            let relative = relative_directory.join(entry.file_name());
            let file_type = match scan_gate::io("file-type", &path, || entry.file_type()) {
                Ok(file_type) => file_type,
                Err(_) => {
                    visitor.invalidate(hash::Issue::FileType);
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
            if is_directory
                && let Some(peer) = peers
                    .iter()
                    .find(|p| path == p.directory && p.validate().is_ok())
            {
                skipped_peers.push(peer);
                progress.ignored += 1;
                continue;
            }
            if is_directory && namespace.is_some_and(|namespace| path == namespace.directory) {
                progress.ignored += 1;
                continue;
            }
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
                    visitor.invalidate(hash::Issue::SourceMetadata);
                    progress.rejected += 1;
                    visitor.reject(uri);
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
                visitor
                    .source(uri, path, metadata, &mut progress)
                    .map_err(|error| Box::new((progress.clone(), error.to_string())))?;
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
    if let Some(namespace) = namespace {
        namespace
            .validate()
            .map_err(|e| Box::new((progress.clone(), e)))?;
    }
    for peer in skipped_peers {
        peer.validate()
            .map_err(|e| Box::new((progress.clone(), e)))?;
    }
    Ok(Some(progress))
}
