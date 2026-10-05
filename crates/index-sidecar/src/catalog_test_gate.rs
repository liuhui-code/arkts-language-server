//! Debug-only controls for deterministic catalog lifecycle tests.

use std::{
    sync::atomic::{AtomicU8, Ordering},
    time::Duration,
};

#[cfg(debug_assertions)]
use std::{fs, path::PathBuf, thread, time::Instant};

pub(super) const TEST_ACTIVATION_WAITING: u8 = 3;
#[cfg(debug_assertions)]
const ACTIVATION_FILE_GATE_TIMEOUT: Duration = Duration::from_secs(30);

pub(super) enum ActivationGateResult {
    Released,
    #[cfg(debug_assertions)]
    Cancelled,
}

pub(super) struct ActivationFileGate {
    #[cfg(debug_assertions)]
    path: PathBuf,
}

#[cfg(debug_assertions)]
pub(super) fn activation_file_gate(generation: u64) -> Result<Option<ActivationFileGate>, String> {
    let target = std::env::var_os("ARKTS_INDEX_TEST_ACTIVATION_GATE_GENERATION");
    let release_file = std::env::var_os("ARKTS_INDEX_TEST_ACTIVATION_GATE_FILE");
    let (target, release_file) = match (target, release_file) {
        (None, None) => return Ok(None),
        (Some(target), Some(release_file)) => (target, release_file),
        _ => return Err("test activation file gate requires generation and file".to_owned()),
    };
    let target = target
        .into_string()
        .map_err(|_| "test activation gate generation must be UTF-8".to_owned())?
        .parse::<u64>()
        .map_err(|_| "test activation gate generation must be an integer".to_owned())?;
    let path = PathBuf::from(release_file);
    if !path.is_absolute() {
        return Err("test activation gate file must be absolute".to_owned());
    }
    Ok((target == generation).then_some(ActivationFileGate { path }))
}

#[cfg(not(debug_assertions))]
pub(super) fn activation_file_gate(_generation: u64) -> Result<Option<ActivationFileGate>, String> {
    Ok(None)
}

impl ActivationFileGate {
    #[cfg(debug_assertions)]
    pub(super) fn wait_for_release(
        &self,
        state: &AtomicU8,
        cancelled_state: u8,
    ) -> Result<ActivationGateResult, String> {
        let deadline = Instant::now() + ACTIVATION_FILE_GATE_TIMEOUT;
        loop {
            if state.load(Ordering::Acquire) == cancelled_state {
                return Ok(ActivationGateResult::Cancelled);
            }
            if fs::metadata(&self.path).is_ok_and(|metadata| metadata.is_file()) {
                return Ok(ActivationGateResult::Released);
            }
            if Instant::now() >= deadline {
                return Err("test activation file gate timed out".to_owned());
            }
            thread::sleep(Duration::from_millis(10));
        }
    }

    #[cfg(not(debug_assertions))]
    pub(super) fn wait_for_release(
        &self,
        _state: &AtomicU8,
        _cancelled_state: u8,
    ) -> Result<ActivationGateResult, String> {
        Ok(ActivationGateResult::Released)
    }
}

#[cfg(debug_assertions)]
pub(super) fn wait_at_test_catalog_gate(state: &AtomicU8, cancelled_state: u8) -> bool {
    let Ok(milliseconds) = std::env::var("ARKTS_INDEX_TEST_CATALOG_GATE_MS") else {
        return false;
    };
    let Ok(milliseconds) = milliseconds.parse::<u64>() else {
        return false;
    };
    let deadline = Instant::now() + Duration::from_millis(milliseconds);
    while Instant::now() < deadline {
        if state.load(Ordering::Acquire) == cancelled_state {
            return true;
        }
        thread::sleep(Duration::from_millis(5));
    }
    state.load(Ordering::Acquire) == cancelled_state
}

#[cfg(not(debug_assertions))]
pub(super) fn wait_at_test_catalog_gate(_state: &AtomicU8, _cancelled_state: u8) -> bool {
    false
}

#[cfg(debug_assertions)]
pub(super) fn wait_at_test_activation_gate() {
    let Ok(milliseconds) = std::env::var("ARKTS_INDEX_TEST_ACTIVATION_GATE_MS") else {
        return;
    };
    let Ok(milliseconds) = milliseconds.parse::<u64>() else {
        return;
    };
    thread::sleep(Duration::from_millis(milliseconds));
}

#[cfg(not(debug_assertions))]
pub(super) fn wait_at_test_activation_gate() {}

#[cfg(debug_assertions)]
pub(super) fn test_entry_delay() -> Duration {
    std::env::var("ARKTS_INDEX_TEST_ENTRY_DELAY_MS")
        .ok()
        .and_then(|milliseconds| milliseconds.parse::<u64>().ok())
        .map_or(Duration::ZERO, Duration::from_millis)
}

#[cfg(not(debug_assertions))]
pub(super) fn test_entry_delay() -> Duration {
    Duration::ZERO
}

pub(super) fn wait_for_test_entry_delay(
    delay: Duration,
    state: &AtomicU8,
    cancelled_state: u8,
) -> bool {
    if delay.is_zero() {
        return false;
    }
    let deadline = std::time::Instant::now() + delay;
    while std::time::Instant::now() < deadline {
        if state.load(Ordering::Acquire) == cancelled_state {
            return true;
        }
        std::thread::sleep(Duration::from_millis(5));
    }
    state.load(Ordering::Acquire) == cancelled_state
}
