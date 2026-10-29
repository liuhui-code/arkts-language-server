//! A lock proves current use; an observation timestamp is only a conservative LRU input.
use super::{files, inspect, now_ms};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Serialize, Deserialize)]
struct Active {
    schema: u32,
    identity: String,
    seen_ms: u64,
}

pub(super) fn record(base: &Path, key: &str, identity: &str) -> Result<(), String> {
    files::write_json(
        &base.join(".gc-state").join(format!("{key}.active.json")),
        &Active {
            schema: 1,
            identity: identity.into(),
            seen_ms: now_ms(),
        },
    )
}

pub(super) fn last_seen(base: &Path, key: &str, identity: &str) -> Result<Option<u64>, String> {
    if !files::present_directory(&base.join(".gc-state"))? {
        return Ok(None);
    }
    let path = base.join(".gc-state").join(format!("{key}.active.json"));
    match fs::symlink_metadata(&path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
        _ => (),
    }
    let record: Active = files::read_json(&path)?;
    if record.schema != 1 || record.identity != identity || inspect::key(identity) != key {
        return Err("invalid-activity-observation".into());
    }
    Ok(Some(record.seen_ms))
}
