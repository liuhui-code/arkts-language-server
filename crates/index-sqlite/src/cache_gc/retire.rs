use super::{files, inspect, lease, now_ms, sqlite_guard::SqliteGroupGuard};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Serialize, Deserialize)]
struct Retired {
    schema: u32,
    key: String,
    identity: String,
    name: String,
    files: Vec<(String, u64, u128, String)>,
}

pub(super) fn retire(
    base: &Path,
    directory: &Path,
    key: &str,
    identity: &str,
    snapshot: Vec<(String, u64, u128, String)>,
    database: SqliteGroupGuard,
) -> Result<Vec<String>, String> {
    let trash = base.join(".gc-trash");
    files::directory(&trash, true)?;
    let name = format!("{key}-{}-{}", std::process::id(), now_ms());
    let target = trash.join(&name);
    let proof = trash.join(format!("{name}.json"));
    let record = Retired {
        schema: 1,
        key: key.into(),
        identity: identity.into(),
        name,
        files: snapshot,
    };
    files::write_json(&proof, &record)?;
    // NTFS rejects directory rename while ANY child file has an open handle, including ours.
    // Keep namespace/use locks; the atomic rename itself rejects a racing legacy opener.
    #[cfg(windows)]
    drop(database);
    #[cfg(unix)]
    let _database = database;
    fs::rename(directory, &target).map_err(|e| format!("retire-deferred: {e}"))?;
    if files::snapshot(&target)? != record.files {
        // A legacy writer may have completed in the Windows handle-release/rename interval.
        // Preserve the COMPLETE group in trash with its intent; never sweep changed input.
        return Err("retire-deferred: cache-changed-after-rename".into());
    }
    fs::remove_dir_all(&target).map_err(|e| format!("delete-deferred: {e}"))?;
    Ok(fs::remove_file(proof)
        .err()
        .map(|e| format!("proof-cleanup-deferred: {e}"))
        .into_iter()
        .collect())
}

/// A partial deletion may leave a subset. Unknown or modified files are never swept.
pub(super) fn retry(base: &Path) -> Vec<(String, String)> {
    let trash = base.join(".gc-trash");
    if !trash.exists() {
        return Vec::new();
    }
    if let Err(e) = files::directory(&trash, false) {
        return vec![("trash".into(), e)];
    }
    let mut results = Vec::new();
    let Ok(entries) = fs::read_dir(&trash) else {
        return vec![("trash".into(), "trash-inaccessible".into())];
    };
    for file in entries.flatten() {
        if file.path().extension().is_none_or(|ext| ext != "json") {
            continue;
        }
        let result = retry_one(base, &trash, &file.path());
        results.push((
            file.file_name().to_string_lossy().into(),
            result.err().unwrap_or_else(|| "removed".into()),
        ));
    }
    results
}

fn retry_one(base: &Path, trash: &Path, proof: &Path) -> Result<(), String> {
    let record: Retired = files::read_json(proof)?;
    if record.schema != 1
        || inspect::key(&record.identity) != record.key
        || !record.name.starts_with(&format!("{}-", record.key))
        || record.name.contains(['/', '\\', '.'])
        || proof
            .file_stem()
            .is_none_or(|name| name != record.name.as_str())
    {
        return Err("invalid-trash-proof".into());
    }
    let _leases = lease::exclusive(base, &record.key, true)?;
    let target: PathBuf = trash.join(&record.name);
    if target.exists() {
        let remaining = files::snapshot(&target)?;
        if remaining.iter().any(|item| !record.files.contains(item)) {
            return Err("trash-changed".into());
        }
        let _database = SqliteGroupGuard::acquire(&target, &remaining)?;
        #[cfg(windows)]
        drop(_database);
        fs::remove_dir_all(target).map_err(|e| format!("delete-deferred: {e}"))?;
    }
    fs::remove_file(proof).map_err(|e| e.to_string())
}
