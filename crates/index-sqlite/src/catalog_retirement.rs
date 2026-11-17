//! Runtime-owned retirement: a bounded FIFO, one executor, joined on last owner.
use crate::{catalog_control::io_error, catalog_files::RetiredCatalog};
use arkts_index_core::StoreError;
use std::{
    collections::VecDeque,
    panic::{AssertUnwindSafe, catch_unwind},
    sync::{
        Arc, Mutex, Weak,
        mpsc::{RecvTimeoutError, SyncSender, sync_channel},
    },
    thread::{self, JoinHandle},
    time::Duration,
};
pub(crate) type Job = Box<dyn FnOnce() -> Option<RetiredCatalog> + Send>;
static RUNTIME: Mutex<Weak<RetirementRuntime>> = Mutex::new(Weak::new());

pub(crate) struct RetirementRuntime {
    sender: Option<SyncSender<Job>>,
    thread: Option<JoinHandle<()>>,
}
impl RetirementRuntime {
    pub fn acquire() -> Result<Arc<Self>, StoreError> {
        let mut runtime = RUNTIME.lock().map_err(io_error)?;
        if let Some(runtime) = runtime.upgrade() {
            return Ok(runtime);
        }
        // Backpressure bounds pending resource closures, never facts/results.
        let (sender, receiver) = sync_channel::<Job>(8);
        let thread = thread::Builder::new()
            .name("arkts-catalog-retire".into())
            .spawn(move || {
                let mut pending = VecDeque::<RetiredCatalog>::new();
                loop {
                    let received = if pending.is_empty() {
                        receiver.recv().map_err(|_| RecvTimeoutError::Disconnected)
                    } else {
                        receiver.recv_timeout(Duration::from_millis(20))
                    };
                    match received {
                        Ok(job) => match catch_unwind(AssertUnwindSafe(job)) {
                            Ok(Some(retired)) => {
                                // One retry per namespace, not one retained lease
                                // per edit; FIFO retries remain fair across roots.
                                if !pending.iter().any(|old| old.same_namespace(&retired)) {
                                    pending.push_back(retired);
                                }
                            }
                            Ok(None) => {}
                            Err(_) => {
                                eprintln!("{{\"event\":\"index.catalog.retirement.panicked\"}}")
                            }
                        },
                        Err(RecvTimeoutError::Timeout) => {}
                        Err(RecvTimeoutError::Disconnected) => break,
                    }
                    if let Some(retired) = pending.pop_front()
                        && !retired.try_prune()
                    {
                        pending.push_back(retired);
                    }
                }
                // Shutdown waits for resource closure, never for another process
                // to release its publication lock. Later maintenance can prune.
                for retired in pending {
                    retired.try_prune();
                }
            })
            .map_err(io_error)?;
        let owned = Arc::new(Self {
            sender: Some(sender),
            thread: Some(thread),
        });
        *runtime = Arc::downgrade(&owned);
        Ok(owned)
    }
    pub fn enqueue(&self, job: Job) {
        if let Err(error) = self.sender.as_ref().unwrap().send(job) {
            // A failed executor cannot justify abandoning resources or silently
            // reporting their closure. Retain correctness on the caller instead.
            eprintln!("{{\"event\":\"index.catalog.retirement.executor-unavailable\"}}");
            if let Some(retired) = (error.0)() {
                retired.try_prune();
            }
        }
    }
}
impl Drop for RetirementRuntime {
    fn drop(&mut self) {
        drop(self.sender.take());
        if self.thread.take().unwrap().join().is_err() {
            eprintln!("{{\"event\":\"index.catalog.retirement.join-failed\"}}");
        }
    }
}
