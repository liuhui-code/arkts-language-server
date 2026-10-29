use super::{Policy, Report, collect, files, now_ms};
use serde::{Deserialize, Serialize};

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct State {
    schema: u32,
    cursor: String,
    completed_ms: u64,
}

/// Called in a separate maintenance process. A crash releases both run locks.
pub fn run(policy: &Policy, interval_ms: u64) -> Result<Report, String> {
    if !policy.apply || policy.include_legacy {
        return Err("automatic mode requires apply without legacy opt-in".into());
    }
    if !policy.cache.exists() {
        return collect(policy);
    }
    files::directory(&policy.cache, false)?;
    let guard = files::lock_file(&policy.cache.join(".gc-auto.lock"), true)?.unwrap();
    if guard.try_lock().is_err() {
        return Ok(Report::empty(true, "busy"));
    }
    let state_path = policy.cache.join(".gc-auto.json");
    let state = files::read_json::<State>(&state_path).unwrap_or_default();
    if state.schema == 1
        && state.cursor.is_empty()
        && state.completed_ms <= now_ms()
        && now_ms().saturating_sub(state.completed_ms) < interval_ms
    {
        return Ok(Report::empty(true, "cooldown"));
    }
    let mut policy = policy.clone();
    if state.schema == 1 && state.cursor.len() <= 4096 && !state.cursor.contains(['/', '\\']) {
        policy.after = state.cursor;
    }
    let mut report = collect(&policy)?;
    if report.status != "busy" {
        if let Err(error) = files::write_json(
            &state_path,
            &State {
                schema: 1,
                cursor: report.next_cursor.clone().unwrap_or_default(),
                completed_ms: if report.next_cursor.is_none() {
                    now_ms()
                } else {
                    0
                },
            },
        ) {
            report
                .issues
                .push(format!("automatic-state-write-failed: {error}"));
        }
        if let Err(error) = files::write_json(&policy.cache.join(".gc-last-report.json"), &report) {
            report
                .issues
                .push(format!("automatic-report-write-failed: {error}"));
        }
    }
    Ok(report)
}
