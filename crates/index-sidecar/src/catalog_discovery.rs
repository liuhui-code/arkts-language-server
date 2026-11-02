use super::*;

pub(super) fn load_ignore_file(root: &Path, path: &Path) -> LoadedIgnore {
    if super::scan_gate::fails("ignore", path) {
        return LoadedIgnore {
            matcher: None,
            had_error: true,
        };
    }
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

pub(super) fn is_gitignored(matchers: &[Gitignore], path: &Path, is_directory: bool) -> bool {
    for matcher in matchers.iter().rev() {
        match matcher.matched(path, is_directory) {
            Match::Ignore(_) => return true,
            Match::Whitelist(_) => return false,
            Match::None => {}
        }
    }
    false
}

pub(super) fn is_hard_excluded_directory(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| HARD_EXCLUDED_DIRECTORIES.contains(&name))
}

pub(super) fn is_source_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| matches!(extension, "ets" | "ts"))
}
