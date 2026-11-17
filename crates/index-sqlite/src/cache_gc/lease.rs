use super::{files, inspect, now_ms};

#[derive(Debug)]
pub enum CacheLeaseError {
    IdentityMismatch,
    Io(String),
}
impl From<String> for CacheLeaseError {
    fn from(value: String) -> Self {
        Self::Io(value)
    }
}
impl From<&str> for CacheLeaseError {
    fn from(value: &str) -> Self {
        Self::Io(value.into())
    }
}
impl std::fmt::Display for CacheLeaseError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::IdentityMismatch => formatter.write_str("identity-key-mismatch"),
            Self::Io(message) => formatter.write_str(message),
        }
    }
}
impl std::error::Error for CacheLeaseError {}
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    path::{Path, PathBuf},
};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct UseRecord {
    pub schema: u32,
    pub workspace_identity: String,
    pub last_used_ms: u64,
}

/// Held after the SQLite connection field, so its Drop executes after sqlite3_close.
pub struct CacheLease {
    _file: File,
    directory: PathBuf,
    identity: String,
    record_lock: PathBuf,
    namespace: super::namespace::ManagedCacheNamespace,
}

impl CacheLease {
    pub fn acquire(database: &Path, identity: &str) -> Result<Option<Self>, CacheLeaseError> {
        Self::acquire_expected(database, identity, None)
    }

    pub(crate) fn acquire_expected(
        database: &Path,
        identity: &str,
        expected: Option<&super::namespace::ManagedCacheNamespace>,
    ) -> Result<Option<Self>, CacheLeaseError> {
        if let Some(expected) = expected {
            expected.validate()?;
        }
        let Some(directory) = database.parent() else {
            return Ok(None);
        };
        let Some(workspaces) = directory.parent() else {
            return Ok(None);
        };
        if workspaces
            .file_name()
            .is_none_or(|name| name != "workspaces")
        {
            return Ok(None);
        }
        let key = inspect::key(identity);
        if directory
            .file_name()
            .is_none_or(|name| name != key.as_str())
        {
            return Err(CacheLeaseError::IdentityMismatch);
        }
        let base = workspaces.parent().ok_or("missing-cache-base")?;
        fs::create_dir_all(base).map_err(|e| e.to_string())?;
        files::directory(base, false)?;
        let access = files::lock_file(&base.join(".cache-access.lock"), true)?.unwrap();
        access.lock_shared().map_err(|e| e.to_string())?;
        files::directory(workspaces, true)?;
        files::directory(&base.join(".leases"), true)?;
        let file =
            files::lock_file(&base.join(".leases").join(format!("{key}.lock")), true)?.unwrap();
        file.lock_shared().map_err(|e| e.to_string())?;
        files::directory(directory, true)?;
        let namespace = super::namespace::ManagedCacheNamespace::capture(directory, identity)?;
        if expected.is_some_and(|expected| {
            expected.directory != namespace.directory
                || expected.object_id != namespace.object_id
                || expected.workspace_identity != namespace.workspace_identity
        }) {
            return Err("cache namespace changed before lease reacquisition".into());
        }
        Ok(Some(Self {
            _file: file,
            directory: namespace.directory.clone(),
            namespace,
            identity: identity.into(),
            record_lock: base.join(".leases").join(format!("{key}.use.lock")),
        }))
    }

    pub fn namespace(&self) -> Result<super::namespace::ManagedCacheNamespace, String> {
        self.namespace.validate()?;
        Ok(self.namespace.clone())
    }

    pub fn record_use(&self) -> Result<(), String> {
        self.namespace.validate()?;
        // Usage leases remain shared. Serialize only this workspace's metadata
        // replacement, across threads/processes, on a stable separate lock.
        // Never upgrade the held usage lock or unlink this lock inode.
        files::directory(self.record_lock.parent().unwrap(), false)?;
        let record = files::lock_file(&self.record_lock, true)?.unwrap();
        record.lock().map_err(|e| e.to_string())?;
        // The per-workspace lock can wait behind another owner; do not reuse
        // the pre-wait object check after that wait.
        self.namespace.validate()?;
        files::write_json(
            &self.directory.join("cache-use.json"),
            &UseRecord {
                schema: 1,
                workspace_identity: self.identity.clone(),
                last_used_ms: now_ms(),
            },
        )
    }
}

impl Drop for CacheLease {
    fn drop(&mut self) {
        if let Err(error) = self.record_use() {
            eprintln!(
                "{{\"event\":\"index.cache.use-record.failed\",\"error\":{}}}",
                serde_json::to_string(&error).unwrap_or_default()
            );
        }
    }
}

pub(super) fn exclusive(base: &Path, key: &str, create: bool) -> Result<Vec<File>, String> {
    let mut guards = Vec::new();
    if let Some(access) = files::lock_file(&base.join(".cache-access.lock"), create)? {
        access.try_lock().map_err(|_| "namespace-busy")?;
        guards.push(access);
    }
    if create {
        files::directory(&base.join(".leases"), true)?;
    }
    if files::present_directory(&base.join(".leases"))? {
        files::directory(&base.join(".leases"), false)?;
        if let Some(file) =
            files::lock_file(&base.join(".leases").join(format!("{key}.lock")), create)?
        {
            file.try_lock().map_err(|_| "active-workspace")?;
            guards.push(file);
        }
    }
    Ok(guards)
}
