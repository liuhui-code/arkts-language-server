use super::{
    Policy, files,
    inspect::{self, Candidate},
    now_ms, retire,
    source::{Anchor, Source},
    sqlite_guard::SqliteGroupGuard,
};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Serialize, Deserialize)]
struct Missing {
    schema: u32,
    identity: String,
    since_ms: u64,
    anchor: Anchor,
    files: Vec<(String, u64, u128, String)>,
    #[serde(default)]
    legacy_opt_in: bool,
    #[serde(default)]
    grace_ms: u64,
}

pub(super) fn approved_legacy_grace(base: &Path, key: &str) -> Option<u64> {
    if !files::present_directory(&base.join(".gc-state")).ok()? {
        return None;
    }
    files::read_json::<Missing>(&base.join(".gc-state").join(format!("{key}.json")))
        .ok()
        .filter(|state| {
            state.schema == 1 && state.legacy_opt_in && inspect::key(&state.identity) == key
        })
        .map(|state| state.grace_ms)
}

pub(super) fn evaluate(
    candidate: &mut Candidate,
    policy: &Policy,
    inventory_complete: bool,
    remaining: u64,
    database: SqliteGroupGuard,
    issues: &mut Vec<String>,
) -> Result<(), String> {
    let identity = candidate.entry.workspace_identity.as_ref().unwrap();
    let state_path = policy
        .cache
        .join(".gc-state")
        .join(format!("{}.json", candidate.entry.key));
    let eligible = match &candidate.source {
        Source::Unavailable => return Err("source-unavailable".into()),
        Source::Present => {
            if policy.apply && state_path.exists() {
                if files::unsafe_meta(
                    &fs::symlink_metadata(&state_path).map_err(|e| e.to_string())?,
                ) {
                    return Err("unsafe-missing-observation".into());
                }
                fs::remove_file(&state_path).map_err(|e| e.to_string())?;
            }
            let Some(last_used) = candidate.last_used else {
                return Err("legacy-last-use-unknown".into());
            };
            if now_ms().saturating_sub(last_used) < policy.idle_ms || last_used > now_ms() {
                return Err("recently-used".into());
            }
            if policy.max_bytes.is_some() && !inventory_complete {
                return Err("capacity-inventory-incomplete".into());
            }
            if policy.max_bytes.is_some_and(|max| remaining <= max) {
                return Err("within-capacity-budget".into());
            }
            "idle-workspace"
        }
        Source::Missing(anchor) => {
            let observation = files::read_json::<Missing>(&state_path).ok().filter(|old| {
                old.schema == 1
                    && old.identity == *identity
                    && old.anchor == *anchor
                    && old.files == candidate.snapshot
                    && old.since_ms <= now_ms()
                    && candidate.last_used.is_none_or(|last| last <= old.since_ms)
            });
            if let Some(observation) = observation {
                if now_ms().saturating_sub(observation.since_ms)
                    < policy.grace_ms.max(observation.grace_ms)
                {
                    return Err("missing-grace-pending".into());
                }
            } else {
                if policy.apply {
                    let approved = approved_legacy_grace(&policy.cache, &candidate.entry.key);
                    files::write_json(
                        &state_path,
                        &Missing {
                            schema: 1,
                            identity: identity.clone(),
                            since_ms: now_ms(),
                            anchor: anchor.clone(),
                            files: candidate.snapshot.clone(),
                            legacy_opt_in: candidate.entry.legacy
                                && (policy.include_legacy || approved.is_some()),
                            grace_ms: policy.grace_ms.max(approved.unwrap_or(0)),
                        },
                    )?;
                    candidate.entry.outcome = "observing".into();
                }
                return Err("missing-grace-unobserved".into());
            }
            "abandoned-temporary-workspace"
        }
    };
    candidate.entry.reason = eligible.into();
    candidate.entry.outcome = "eligible".into();
    if !policy.apply {
        return Ok(());
    }
    // All SQLite metadata reads have CLOSED before acquiring the POSIX byte lock.
    if files::snapshot(&candidate.directory)? != candidate.snapshot
        || super::source::prove(&candidate.root, identity)? != candidate.source
    {
        return Err("input-changed-before-retirement".into());
    }
    issues.extend(retire::retire(
        &policy.cache,
        &candidate.directory,
        &candidate.entry.key,
        identity,
        candidate.snapshot.clone(),
        database,
    )?);
    candidate.entry.outcome = "removed".into();
    for path in [
        state_path,
        policy
            .cache
            .join(".gc-state")
            .join(format!("{}.active.json", candidate.entry.key)),
    ] {
        if path.exists()
            && let Err(error) = fs::remove_file(&path)
        {
            issues.push(format!(
                "metadata-cleanup-deferred: {}: {error}",
                path.display()
            ));
        }
    }
    Ok(())
}

pub(super) fn protect_on_error(candidate: &mut Candidate, error: String) {
    let deferred = [
        "retire-deferred",
        "delete-deferred",
        "proof-cleanup-deferred",
        "input-changed-before-retirement",
    ]
    .iter()
    .any(|prefix| error.starts_with(prefix));
    candidate.entry.reason = error;
    if candidate.entry.outcome != "observing" {
        candidate.entry.outcome = if deferred { "deferred" } else { "protected" }.into();
    }
}

pub(super) fn validate_name(name: &str) -> bool {
    name.len() == 64
        && name
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

pub(super) fn candidate(
    directory: &Path,
    name: &str,
    policy: &Policy,
) -> Result<Candidate, String> {
    inspect::candidate(directory, name, policy)
}
