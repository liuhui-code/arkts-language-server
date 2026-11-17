//! Point admission uses the catalog's ignore rules, without enumerating siblings.
use crate::{catalog, class_binding_discovery};
use arkts_index_core::{StoreError, StoreErrorKind};
use std::{
    fs,
    path::{Component, Path},
};
pub(crate) enum FileInput {
    Absent,
    Present(catalog::SourceStamp),
}
impl FileInput {
    pub fn same(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Absent, Self::Absent) => true,
            (Self::Present(a), Self::Present(b)) => a.same_input(b),
            _ => false,
        }
    }
}
pub(crate) fn fail(message: impl Into<String>) -> StoreError {
    StoreError::new(StoreErrorKind::InvalidData, message)
}
pub(crate) fn inspect(
    root: &Path,
    identity: &str,
    uri: &str,
    namespace: Option<&arkts_index_sqlite::cache_gc::namespace::ManagedCacheNamespace>,
    peers: &[arkts_index_sqlite::cache_gc::namespace::ManagedCacheNamespace],
) -> Result<FileInput, StoreError> {
    let path = class_binding_discovery::admitted_path(root, identity, uri)
        .ok_or_else(|| fail("noncanonical or outside-workspace file URI"))?;
    if !catalog::is_maintenance_source(&path) {
        return Err(fail("not a source file"));
    }
    if let Some(namespace) = namespace {
        namespace.validate().map_err(fail)?;
        if path.starts_with(&namespace.directory) {
            return Ok(FileInput::Absent);
        }
    }
    if peers
        .iter()
        .any(|p| path.starts_with(&p.directory) && p.validate().is_ok())
    {
        return Ok(FileInput::Absent);
    }
    let relative = path
        .strip_prefix(root)
        .map_err(|_| fail("outside workspace"))?;
    let mut directory = root.to_path_buf();
    let mut rules = catalog::maintenance_ignore_rules(root, &root.join(".git/info/exclude"))?;
    let parts: Vec<_> = relative.components().collect();
    for (i, part) in parts.iter().enumerate() {
        if !fs::symlink_metadata(&directory).is_ok_and(|m| m.is_dir()) {
            return Err(fail(
                "source ancestor is unavailable or not a real directory",
            ));
        }
        rules.extend(catalog::maintenance_ignore_rules(
            &directory,
            &directory.join(".gitignore"),
        )?);
        let Component::Normal(name) = part else {
            return Err(fail("noncanonical path component"));
        };
        let candidate = directory.join(name);
        let is_dir = i + 1 < parts.len();
        if catalog::maintenance_excluded(&rules, &candidate, is_dir) {
            return Ok(FileInput::Absent);
        }
        if is_dir {
            directory = candidate;
        }
    }
    let metadata = match fs::symlink_metadata(&path) {
        Ok(m) if m.is_file() => m,
        Ok(_) => return Err(fail("source is not a regular file")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(FileInput::Absent),
        Err(e) => return Err(fail(e.to_string())),
    };
    let physical = fs::canonicalize(&path).map_err(|e| fail(e.to_string()))?;
    if arkts_index_sqlite::path_to_file_uri(&physical) != uri {
        return Err(fail("source URI does not match current physical identity"));
    }
    // Reuse the existing bounded, no-follow/nonblocking current-source reader.
    // Unknown/read errors never become an authoritative deletion.
    let text = class_binding_discovery::read_current_source(&path, root)
        .ok_or_else(|| fail("source unreadable, changed, symlinked or outside admission"))?;
    Ok(FileInput::Present(catalog::SourceStamp::capture(
        &path, &metadata, &text,
    )))
}
