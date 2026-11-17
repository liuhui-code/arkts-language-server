//! A query owns its interrupt binding until its SQLite scope actually ends.
use arkts_index_core::{StoreError, StoreErrorKind};
use rusqlite::{Connection, InterruptHandle};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
#[derive(Clone, Default)]
pub struct ReadCancellation {
    flag: Arc<AtomicBool>,
    handle: Arc<Mutex<Option<InterruptHandle>>>,
}
impl ReadCancellation {
    pub fn is_cancelled(&self) -> bool {
        self.flag.load(Ordering::Acquire)
    }
    pub fn cancel(&self) {
        self.flag.store(true, Ordering::Release);
        // Do not clone/release the binding before interrupt: detaching must
        // finish after this call, before the connection can serve another job.
        if let Some(handle) = self
            .handle
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .as_ref()
        {
            handle.interrupt();
        }
    }
    pub(crate) fn check(&self) -> Result<(), StoreError> {
        if self.is_cancelled() {
            Err(cancelled())
        } else {
            Ok(())
        }
    }
    pub(crate) fn attach<'a>(
        &self,
        connection: &'a Connection,
    ) -> Result<Attachment<'a>, StoreError> {
        let mut binding = self.handle.lock().unwrap_or_else(|p| p.into_inner());
        self.check()?;
        if binding.is_some() {
            return Err(StoreError::new(
                StoreErrorKind::Busy,
                "read cancellation owner already has an active connection",
            ));
        }
        *binding = Some(connection.get_interrupt_handle());
        let attachment = Attachment {
            connection,
            cancel: self.clone(),
        };
        drop(binding);
        let flag = Arc::clone(&self.flag);
        connection
            .progress_handler(
                1000,
                Some(move || {
                    #[cfg(debug_assertions)]
                    if debug_sql_gate(&flag) {
                        return true;
                    }
                    flag.load(Ordering::Acquire)
                }),
            )
            .map_err(crate::map_sqlite_error)?;
        Ok(attachment)
    }
}
#[cfg(debug_assertions)]
fn debug_sql_gate(flag: &AtomicBool) -> bool {
    use std::{
        fs,
        path::PathBuf,
        time::{Duration, Instant},
    };
    static ENTERED: AtomicBool = AtomicBool::new(false);
    let Some(path) = std::env::var_os("ARKTS_INDEX_TEST_READ_SQL_GATE") else {
        return false;
    };
    if ENTERED.swap(true, Ordering::AcqRel) {
        return false;
    }
    let path = PathBuf::from(path);
    let _ = fs::write(
        path.with_extension("started"),
        "SQLite VM progress callback",
    );
    let deadline = Instant::now() + Duration::from_secs(30);
    while !path.is_file() && !flag.load(Ordering::Acquire) && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(5));
    }
    let _ = fs::write(
        path.with_extension("finished"),
        "SQLite progress gate exited",
    );
    !path.is_file() || flag.load(Ordering::Acquire)
}
pub(crate) fn cancelled() -> StoreError {
    StoreError::new(StoreErrorKind::Cancelled, "read cancelled")
}
pub(crate) struct Attachment<'a> {
    connection: &'a Connection,
    cancel: ReadCancellation,
}
impl Drop for Attachment<'_> {
    fn drop(&mut self) {
        let mut binding = self.cancel.handle.lock().unwrap_or_else(|p| p.into_inner());
        binding.take();
        if let Err(error) = self.connection.progress_handler(0, None::<fn() -> bool>) {
            eprintln!(
                "{}",
                serde_json::json!({"event":"index.reader.cleanup.failed","message":error.to_string()})
            );
        }
    }
}
