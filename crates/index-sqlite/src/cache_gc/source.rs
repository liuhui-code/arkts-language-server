use super::{files, inspect};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(super) struct Anchor {
    pub path: PathBuf,
    pub object_id: String,
}

#[derive(PartialEq, Eq)]
pub(super) enum Source {
    Present,
    Missing(Anchor),
    Unavailable,
}

pub(super) fn prove(root: &Path, identity: &str) -> Result<Source, String> {
    match fs::symlink_metadata(root) {
        Ok(meta) => {
            if !meta.is_dir() || files::unsafe_meta(&meta) {
                return Err("source-inaccessible".into());
            }
            let canonical = fs::canonicalize(root).map_err(|_| "source-inaccessible")?;
            if crate::path_to_file_uri(&canonical) != identity {
                return Err("source-identity-changed".into());
            }
            Ok(Source::Present)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let mut anchors = vec![std::env::temp_dir()];
            #[cfg(unix)]
            anchors.extend([PathBuf::from("/tmp"), PathBuf::from("/var/tmp")]);
            for anchor in anchors {
                let Ok(canonical) = fs::canonicalize(&anchor) else {
                    continue;
                };
                let Some(anchor) = inspect::root(&crate::path_to_file_uri(&canonical)) else {
                    continue;
                };
                if root == anchor || !root.starts_with(&anchor) {
                    continue;
                }
                let meta = fs::metadata(&anchor).map_err(|_| "temporary-root-unavailable")?;
                let mut parent = root.parent();
                while let Some(path) = parent {
                    match fs::symlink_metadata(path) {
                        Ok(current) => {
                            if !current.is_dir() || files::unsafe_meta(&current) {
                                return Err("source-parent-unsafe".into());
                            }
                            let actual =
                                fs::canonicalize(path).map_err(|_| "source-parent-inaccessible")?;
                            let actual = inspect::root(&crate::path_to_file_uri(&actual))
                                .ok_or("unsupported-source-parent")?;
                            if !actual.starts_with(&anchor) {
                                return Err("source-parent-outside-temporary-root".into());
                            }
                            #[cfg(unix)]
                            {
                                use std::os::unix::fs::MetadataExt;
                                if current.dev() != meta.dev() {
                                    return Err("source-volume-unavailable".into());
                                }
                            }
                            return Ok(Source::Missing(Anchor {
                                object_id: files::object_id(&anchor, &meta)?,
                                path: anchor,
                            }));
                        }
                        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                            parent = path.parent()
                        }
                        Err(_) => return Err("source-parent-inaccessible".into()),
                    }
                }
            }
            Ok(Source::Unavailable)
        }
        Err(_) => Err("source-inaccessible".into()),
    }
}
