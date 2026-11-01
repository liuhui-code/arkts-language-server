use arkts_index_core::{StoreError, StoreErrorKind};
use sha2::{Digest, Sha256};
use std::{
    fmt::Write as _,
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WorkspaceCacheLocation {
    pub workspace_identity: String,
    /// Logical base path. Open with CatalogStore to follow atomic publications.
    pub database_path: PathBuf,
}

pub fn workspace_cache_location(
    cache_directory: impl AsRef<Path>,
    workspace_root: impl AsRef<Path>,
) -> Result<WorkspaceCacheLocation, StoreError> {
    let canonical_root = fs::canonicalize(workspace_root).map_err(|error| {
        StoreError::new(
            StoreErrorKind::Io,
            format!("failed to canonicalize workspace root: {error}"),
        )
    })?;
    let workspace_identity = path_to_file_uri(&canonical_root);
    let cache_key = cache_key(&workspace_identity);
    Ok(WorkspaceCacheLocation {
        workspace_identity,
        database_path: cache_directory
            .as_ref()
            .join("workspaces")
            .join(cache_key)
            .join("symbols-v2.sqlite3"),
    })
}

pub fn cache_key(identity: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"arkts-index-cache\0v2\0");
    hasher.update(identity.as_bytes());
    let mut cache_key = String::with_capacity(64);
    for byte in hasher.finalize() {
        write!(&mut cache_key, "{byte:02x}").expect("writing to String cannot fail");
    }
    cache_key
}

#[cfg(unix)]
pub fn path_to_file_uri(path: &Path) -> String {
    use std::os::unix::ffi::OsStrExt;

    format!(
        "file://{}",
        percent_encode_path(path.as_os_str().as_bytes())
    )
}

#[cfg(windows)]
pub fn path_to_file_uri(path: &Path) -> String {
    windows_path_to_file_uri(&path.to_string_lossy())
}

#[cfg(any(windows, test))]
fn windows_path_to_file_uri(path: &str) -> String {
    let mut normalized = path.replace('\\', "/");
    if let Some(unc) = normalized.strip_prefix("//?/UNC/") {
        normalized = format!("//{unc}");
    } else if let Some(without_prefix) = normalized.strip_prefix("//?/") {
        normalized = without_prefix.to_owned();
    }
    // UNC hosts are URI authorities, not a directory named `UNC` on a drive.
    if normalized.starts_with("//") {
        return format!("file:{}", percent_encode_path(normalized.as_bytes()));
    }
    if normalized.as_bytes().get(1) == Some(&b':') {
        let normalized_drive = normalized[0..1].to_ascii_lowercase();
        normalized.replace_range(0..1, &normalized_drive);
    }
    format!("file:///{}", percent_encode_path(normalized.as_bytes()))
}

fn percent_encode_path(bytes: &[u8]) -> String {
    let mut encoded = String::with_capacity(bytes.len());
    for byte in bytes {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~' | b'/' | b':') {
            encoded.push(char::from(*byte));
        } else {
            write!(&mut encoded, "%{byte:02X}").expect("writing to String cannot fail");
        }
    }
    encoded
}

#[cfg(test)]
mod tests {
    use super::windows_path_to_file_uri;

    #[test]
    fn windows_drive_uri_characterization() {
        let vectors = include_str!("../../../tests/fixtures/path-identity-vectors.tsv");
        for row in vectors.lines() {
            let fields: Vec<_> = row.split('\t').collect();
            if fields[0] != "windows" || fields[1].starts_with(r"\\") {
                continue;
            }
            assert_eq!(windows_path_to_file_uri(fields[1]), fields[2]);
            assert_eq!(
                windows_path_to_file_uri(&format!(r"\\?\{}", fields[1])),
                fields[2]
            );
        }
    }

    #[test]
    fn windows_unc_uris_preserve_authority_and_path_spelling() {
        let vectors = include_str!("../../../tests/fixtures/path-identity-vectors.tsv");
        for row in vectors.lines() {
            let fields: Vec<_> = row.split('\t').collect();
            if fields[0] != "windows" {
                continue;
            }
            let Some(unc) = fields[1].strip_prefix(r"\\") else {
                continue;
            };
            assert_eq!(
                windows_path_to_file_uri(&format!(r"\\?\UNC\{unc}")),
                fields[2]
            );
            assert_eq!(windows_path_to_file_uri(fields[1]), fields[2]);
        }
    }
}
