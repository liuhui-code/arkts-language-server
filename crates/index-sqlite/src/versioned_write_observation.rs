//! SQLite callbacks are commit attempts, not durable bytes or publication counts.
use crate::map_sqlite_error;
use arkts_index_core::StoreError;
use rusqlite::Connection;
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
#[derive(Clone, Debug, Default)]
pub struct FileWriteWork {
    pub commit_callbacks: usize,
    pub rollback_callbacks: usize,
}
#[derive(Default)]
struct Counts {
    commits: AtomicUsize,
    rollbacks: AtomicUsize,
}
pub(super) struct WriteObservation<'a> {
    connection: &'a Connection,
    counts: Arc<Counts>,
}
impl<'a> WriteObservation<'a> {
    pub fn new(connection: &'a Connection) -> Result<Self, StoreError> {
        let observer = Self {
            connection,
            counts: Arc::default(),
        };
        let counts = Arc::clone(&observer.counts);
        connection
            .commit_hook(Some(move || {
                counts.commits.fetch_add(1, Ordering::Relaxed);
                false
            }))
            .map_err(map_sqlite_error)?;
        let counts = Arc::clone(&observer.counts);
        connection
            .rollback_hook(Some(move || {
                counts.rollbacks.fetch_add(1, Ordering::Relaxed);
            }))
            .map_err(map_sqlite_error)?;
        Ok(observer)
    }
    pub fn snapshot(&self) -> FileWriteWork {
        FileWriteWork {
            commit_callbacks: self.counts.commits.load(Ordering::Relaxed),
            rollback_callbacks: self.counts.rollbacks.load(Ordering::Relaxed),
        }
    }
}
impl Drop for WriteObservation<'_> {
    fn drop(&mut self) {
        for result in [
            self.connection.commit_hook(None::<fn() -> bool>),
            self.connection.rollback_hook(None::<fn()>),
        ] {
            if let Err(error) = result {
                eprintln!(
                    "{}",
                    serde_json::json!({"event":"index.file-write.observation-cleanup.failed","message":error.to_string()})
                );
            }
        }
    }
}
