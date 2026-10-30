//! Workspace cache administration. Preview never creates files in the inspected cache.
mod activity;
pub mod automatic;
mod decision;
pub(crate) mod files;
mod identity_snapshot;
mod inspect;
pub mod lease;
mod retire;
mod source;
pub(crate) mod sqlite_guard;
#[cfg(windows)]
mod windows_identity;

use serde::Serialize;
use std::{
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Clone)]
pub struct Policy {
    pub cache: PathBuf,
    pub apply: bool,
    pub include_legacy: bool,
    pub grace_ms: u64,
    pub idle_ms: u64,
    pub max_bytes: Option<u64>,
    pub limit: usize,
    pub after: String,
    pub identity_copy_bytes: u64,
}

impl Policy {
    pub fn new(cache: PathBuf) -> Self {
        Self {
            cache,
            apply: false,
            include_legacy: false,
            grace_ms: 86_400_000,
            idle_ms: 30 * 86_400_000,
            max_bytes: None,
            limit: 512,
            after: String::new(),
            identity_copy_bytes: 16 * 1024 * 1024,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub key: String,
    pub workspace_identity: Option<String>,
    pub legacy: bool,
    pub bytes: u64,
    pub outcome: String,
    pub reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub schema: &'static str,
    pub apply: bool,
    pub status: String,
    pub scanned: usize,
    pub observed_bytes: u64,
    pub potential_bytes: u64,
    pub removed_bytes: u64,
    pub next_cursor: Option<String>,
    pub budget_unmet: bool,
    pub size_unknown_entries: usize,
    pub entries: Vec<Entry>,
    pub trash_results: Vec<(String, String)>,
    pub issues: Vec<String>,
}

impl Report {
    fn empty(apply: bool, status: &str) -> Self {
        Self {
            schema: "arkts.index-cache-gc.v1",
            apply,
            status: status.into(),
            scanned: 0,
            observed_bytes: 0,
            potential_bytes: 0,
            removed_bytes: 0,
            next_cursor: None,
            budget_unmet: false,
            size_unknown_entries: 0,
            entries: Vec::new(),
            trash_results: Vec::new(),
            issues: Vec::new(),
        }
    }
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u64::MAX as u128) as u64
}

pub fn collect(policy: &Policy) -> Result<Report, String> {
    let mut report = Report::empty(policy.apply, "complete");
    if policy.limit == 0 {
        return Err("scan limit must be positive".into());
    }
    if !files::present_directory(&policy.cache)? {
        return Ok(report);
    }
    files::directory(&policy.cache, false)?;
    let _collector = if policy.apply {
        let file = files::lock_file(&policy.cache.join(".gc-run.lock"), true)?.unwrap();
        if file.try_lock().is_err() {
            report.status = "busy".into();
            return Ok(report);
        }
        files::directory(&policy.cache.join(".gc-state"), true)?;
        report.trash_results = retire::retry(&policy.cache);
        Some(file)
    } else {
        None
    };
    let workspaces = policy.cache.join("workspaces");
    if !files::present_directory(&workspaces)? {
        return Ok(report);
    }
    files::directory(&workspaces, false)?;
    let mut names = std::fs::read_dir(&workspaces)
        .map_err(|e| e.to_string())?
        .map(|item| {
            item.map(|e| e.file_name().to_string_lossy().to_string())
                .map_err(|e| e.to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    names.sort();
    let pending: Vec<_> = names
        .into_iter()
        .filter(|name| name > &policy.after)
        .collect();
    if pending.len() > policy.limit {
        report.next_cursor = Some(pending[policy.limit - 1].clone());
        report.status = "partial".into();
    }
    let mut candidates = Vec::new();
    for name in pending.into_iter().take(policy.limit) {
        let path = workspaces.join(&name);
        let value = if decision::validate_name(&name) {
            lease::exclusive(&policy.cache, &name, false).and_then(|proof| {
                drop(proof);
                decision::candidate(&path, &name, policy)
            })
        } else {
            Err("unsafe-cache-key".into())
        };
        report.scanned += 1;
        match value {
            Ok(candidate) => {
                report.observed_bytes = report.observed_bytes.saturating_add(candidate.entry.bytes);
                candidates.push(candidate);
            }
            Err(reason) => {
                let snapshot = files::snapshot(&path);
                if snapshot.is_err() {
                    report.size_unknown_entries += 1;
                }
                let bytes = snapshot
                    .map(|items| items.iter().map(|item| item.1).sum())
                    .unwrap_or(0);
                report.observed_bytes = report.observed_bytes.saturating_add(bytes);
                let marker = files::read_json::<lease::UseRecord>(&path.join("cache-use.json"))
                    .ok()
                    .filter(|value| {
                        value.schema == 1 && inspect::key(&value.workspace_identity) == name
                    });
                if policy.apply
                    && reason == "active-workspace"
                    && let Some(marker) = &marker
                    && let Err(error) =
                        activity::record(&policy.cache, &name, &marker.workspace_identity)
                {
                    report
                        .issues
                        .push(format!("active-use-record-failed: {name}: {error}"));
                }
                report.entries.push(Entry {
                    key: name,
                    workspace_identity: marker
                        .as_ref()
                        .map(|value| value.workspace_identity.clone()),
                    legacy: marker.is_none(),
                    bytes,
                    outcome: "protected".into(),
                    reason,
                });
            }
        }
    }
    candidates.sort_by_key(|candidate| {
        (
            !matches!(candidate.source, source::Source::Missing(_)),
            candidate.last_used.unwrap_or(0),
        )
    });
    let complete =
        report.next_cursor.is_none() && policy.after.is_empty() && report.size_unknown_entries == 0;
    let mut remaining = report.observed_bytes;
    for mut candidate in candidates {
        let result = (|| {
            let _leases = lease::exclusive(&policy.cache, &candidate.entry.key, policy.apply)?;
            let _sqlite =
                sqlite_guard::SqliteGroupGuard::acquire(&candidate.directory, &candidate.snapshot)?;
            if files::snapshot(&candidate.directory)? != candidate.snapshot {
                return Err("cache-changed-before-proof".into());
            }
            decision::evaluate(
                &mut candidate,
                policy,
                complete,
                remaining,
                _sqlite,
                &mut report.issues,
            )
        })();
        if let Err(reason) = result {
            decision::protect_on_error(&mut candidate, reason);
        }
        if [
            "missing-grace-unobserved",
            "missing-grace-pending",
            "abandoned-temporary-workspace",
            "idle-workspace",
        ]
        .contains(&candidate.entry.reason.as_str())
        {
            report.potential_bytes += candidate.entry.bytes;
        }
        if candidate.entry.outcome == "removed" {
            report.removed_bytes += candidate.entry.bytes;
        }
        if candidate.entry.outcome == "removed" || candidate.entry.outcome == "eligible" {
            remaining = remaining.saturating_sub(candidate.entry.bytes);
        }
        report.entries.push(candidate.entry);
    }
    report.budget_unmet = policy
        .max_bytes
        .is_some_and(|max| remaining > max || !complete);
    report.entries.sort_by(|a, b| a.key.cmp(&b.key));
    Ok(report)
}
