//! Bounded current text admission. This is not an atomic filesystem snapshot.

use std::{
    collections::BTreeSet,
    fs::{self, Metadata, OpenOptions},
    io::Read,
    path::{Component, Path, PathBuf},
};

use arkts_index_core::Document;
use arkts_index_sqlite::path_to_file_uri;

use super::{
    MAX_OVERLAY_BYTES, MAX_OVERLAY_TOTAL_BYTES, SourceAvailability, SourceAvailabilityState,
};

pub(super) fn current_sources(
    root: &Path,
    workspace_identity: &str,
    availability: &[SourceAvailability],
    overlays: &[Document],
    overlay_bytes: usize,
) -> Vec<Document> {
    let mut documents = Vec::new();
    let mut bytes = overlay_bytes;
    let mut physical = BTreeSet::new();
    for source in availability {
        if source.state != SourceAvailabilityState::Present {
            continue;
        }
        let Some(file_path) = admitted_path(root, workspace_identity, &source.uri) else {
            continue;
        };
        let Some(parent) = fs::canonicalize(file_path.parent().unwrap())
            .ok()
            .filter(|parent| parent.starts_with(root))
        else {
            continue;
        };
        let physical_path = parent.join(file_path.file_name().unwrap());
        // Multiple lexical aliases cannot select one physical source by order.
        if !physical.insert(physical_path) {
            return Vec::new();
        }
        if let Some(overlay) = overlays.iter().find(|overlay| overlay.uri == source.uri) {
            documents.push(overlay.clone());
        } else if let Some(text) = read_source(&file_path, root) {
            bytes = bytes.saturating_add(text.len());
            if bytes > MAX_OVERLAY_TOTAL_BYTES {
                return Vec::new();
            }
            documents.push(Document::new(&source.uri, text));
        }
    }
    documents
}

fn admitted_path(root: &Path, workspace_identity: &str, uri: &str) -> Option<PathBuf> {
    let relative = uri.strip_prefix(workspace_identity)?.strip_prefix('/')?;
    let mut decoded = Vec::new();
    let raw = relative.as_bytes();
    let mut offset = 0;
    while offset < raw.len() {
        if raw[offset] == b'%' {
            let high = char::from(*raw.get(offset + 1)?).to_digit(16)?;
            let low = char::from(*raw.get(offset + 2)?).to_digit(16)?;
            let byte = (high * 16 + low) as u8;
            if matches!(byte, 0 | b'/' | b'\\') {
                return None;
            }
            decoded.push(byte);
            offset += 3;
        } else {
            decoded.push(raw[offset]);
            offset += 1;
        }
    }
    let relative = String::from_utf8(decoded).ok()?;
    if relative.contains(['\\', '\0']) {
        return None;
    }
    let relative = Path::new(&relative);
    if relative
        .components()
        .any(|part| !matches!(part, Component::Normal(_)))
    {
        return None;
    }
    let candidate = root.join(relative);
    // Existing encoder also normalizes only Windows drive letters, never filenames.
    (path_to_file_uri(&candidate) == uri).then_some(candidate)
}

fn read_source(file_path: &Path, root: &Path) -> Option<String> {
    let before = fs::symlink_metadata(file_path).ok()?;
    if !before.is_file() || before.len() > MAX_OVERLAY_BYTES as u64 {
        return None;
    }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        // Avoid a leaf-symlink/FIFO replacement following or blocking the open.
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    let mut file = options.open(file_path).ok()?;
    let opened = file.metadata().ok()?;
    if !opened.is_file() || !same_file(&before, &opened) {
        return None;
    }
    let mut content = Vec::new();
    file.by_ref()
        .take(MAX_OVERLAY_BYTES as u64 + 1)
        .read_to_end(&mut content)
        .ok()?;
    if content.len() > MAX_OVERLAY_BYTES {
        return None;
    }
    let after = fs::symlink_metadata(file_path).ok()?;
    let handle_after = file.metadata().ok()?;
    let physical = fs::canonicalize(file_path).ok()?;
    if !physical.starts_with(root)
        || !after.is_file()
        || !same_file(&before, &after)
        || !same_file(&opened, &handle_after)
        || after.len() != content.len() as u64
    {
        return None;
    }
    String::from_utf8(content).ok()
}

fn same_file(left: &Metadata, right: &Metadata) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if left.dev() != right.dev()
            || left.ino() != right.ino()
            || left.ctime() != right.ctime()
            || left.ctime_nsec() != right.ctime_nsec()
        {
            return false;
        }
    }
    left.len() == right.len() && left.modified().ok() == right.modified().ok()
}
