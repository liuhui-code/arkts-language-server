//! An opened cache's directory identity, independent of mutable cache contents.
use super::files;
use serde::Serialize;
use std::{
    fs::{self, File},
    path::{Path, PathBuf},
    sync::Arc,
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedCacheNamespace {
    pub directory: PathBuf,
    pub workspace_identity: String,
    pub object_id: String,
    #[serde(skip)]
    _directory: Arc<File>,
}

impl ManagedCacheNamespace {
    pub(super) fn capture(directory: &Path, identity: &str) -> Result<Self, String> {
        files::directory(directory, false)?;
        let handle = files::directory_handle(directory)?;
        let canonical = fs::canonicalize(directory).map_err(|e| e.to_string())?;
        let proof = Self {
            directory: canonical,
            workspace_identity: identity.into(),
            object_id: files::file_object_id(&handle)?,
            _directory: Arc::new(handle),
        };
        proof.validate()?;
        Ok(proof)
    }

    /// Admit an already attested peer without creating metadata or acquiring its use lease.
    pub fn from_proof(directory: &Path, identity: &str, object_id: &str) -> Result<Self, String> {
        let proof = Self::capture(directory, identity)?;
        if proof.object_id != object_id {
            return Err("peer cache directory object changed".into());
        }
        Ok(proof)
    }

    /// This attests the same directory object, never its file contents or source freshness.
    pub fn validate(&self) -> Result<(), String> {
        files::directory(&self.directory, false)?;
        let metadata = fs::symlink_metadata(&self.directory).map_err(|e| e.to_string())?;
        if files::object_id(&self.directory, &metadata)? != self.object_id
            || fs::canonicalize(&self.directory).map_err(|e| e.to_string())? != self.directory
        {
            return Err("cache directory object changed".into());
        }
        Ok(())
    }
}
