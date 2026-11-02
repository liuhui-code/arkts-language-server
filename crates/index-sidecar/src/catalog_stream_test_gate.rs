//! Debug-only deterministic pipeline gates; no source text or production protocol fields.
use std::sync::atomic::AtomicU8;

#[cfg(debug_assertions)]
mod debug {
    use super::*;
    use std::{
        fs::{self, OpenOptions},
        io::Write,
        sync::{
            Mutex,
            atomic::{AtomicBool, Ordering},
        },
        time::{Duration, Instant},
    };
    static TRACE_LOCK: Mutex<()> = Mutex::new(());
    static WRITER_WAITED: AtomicBool = AtomicBool::new(false);
    pub(super) fn trace(event: &str, uri: &str) {
        let Some(path) = std::env::var_os("ARKTS_INDEX_TEST_STREAM_TRACE") else {
            return;
        };
        let _lock = TRACE_LOCK.lock().unwrap_or_else(|error| error.into_inner());
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(file, "{}", serde_json::json!({"event":event,"uri":uri}));
        }
    }
    pub(super) fn wait(variable: &str, state: &AtomicU8) -> bool {
        let Some(path) = std::env::var_os(variable) else {
            return true;
        };
        let deadline = Instant::now() + Duration::from_secs(30);
        loop {
            if state.load(Ordering::Acquire) == super::super::worker::CATALOG_CANCELLED {
                return false;
            }
            if fs::metadata(&path).is_ok_and(|metadata| metadata.is_file()) {
                return true;
            }
            if Instant::now() >= deadline {
                return false;
            }
            std::thread::sleep(Duration::from_millis(5));
        }
    }
    pub(super) fn before_parse(uri: &str, state: &AtomicU8) -> bool {
        trace("started", uri);
        assert!(
            std::env::var("ARKTS_INDEX_TEST_STREAM_PANIC_URI")
                .ok()
                .as_deref()
                != Some(uri),
            "injected catalog parser panic"
        );
        if std::env::var("ARKTS_INDEX_TEST_STREAM_FIRST_URI")
            .ok()
            .as_deref()
            == Some(uri)
        {
            trace("first_wait", uri);
            return wait("ARKTS_INDEX_TEST_STREAM_FIRST_GATE", state);
        }
        true
    }
    pub(super) fn writer(documents: usize, state: &AtomicU8) -> bool {
        if documents >= 64
            && std::env::var_os("ARKTS_INDEX_TEST_STREAM_WRITER_GATE").is_some()
            && !WRITER_WAITED.swap(true, Ordering::AcqRel)
        {
            trace("writer_wait", "");
            return wait("ARKTS_INDEX_TEST_STREAM_WRITER_GATE", state);
        }
        true
    }
}
pub(super) fn trace(_event: &str, _uri: &str) {
    #[cfg(debug_assertions)]
    debug::trace(_event, _uri);
}
pub(super) fn before_parse(_uri: &str, _state: &AtomicU8) -> bool {
    #[cfg(debug_assertions)]
    {
        debug::before_parse(_uri, _state)
    }
    #[cfg(not(debug_assertions))]
    true
}
pub(super) fn writer(_documents: usize, _state: &AtomicU8) -> bool {
    #[cfg(debug_assertions)]
    {
        debug::writer(_documents, _state)
    }
    #[cfg(not(debug_assertions))]
    true
}
pub(super) struct Worker;
impl Drop for Worker {
    fn drop(&mut self) {
        trace("worker_exit", "");
    }
}
