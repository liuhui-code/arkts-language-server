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
}

impl CacheLease {
    pub fn acquire(database: &Path, identity: &str) -> Result<Option<Self>, CacheLeaseError> {
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
        Ok(Some(Self {
            _file: file,
            directory: directory.to_owned(),
            identity: identity.into(),
        }))
    }

    pub fn record_use(&self) -> Result<(), String> {
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
