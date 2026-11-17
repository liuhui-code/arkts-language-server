//! A slot is reusable only after its actual parse outcome has been collected.
use super::super::{PARSE_WORKERS, stream_gate, worker::CATALOG_CANCELLED};
use super::parse::{Job, Output, parse};
use arkts_index_core::{StoreError, StoreErrorKind};
use std::{
    ops::{Deref, DerefMut},
    sync::{
        Arc,
        atomic::{AtomicU8, Ordering},
        mpsc::{self, Receiver, RecvTimeoutError, SyncSender},
    },
    thread::{self, JoinHandle},
    time::Duration,
};
struct Task {
    job: Job,
    state: Arc<AtomicU8>,
}
struct Slot {
    jobs: Option<SyncSender<Task>>,
    results: Receiver<Result<Output, StoreError>>,
    worker: Option<JoinHandle<()>>,
    busy: bool,
}
#[derive(Default)]
pub(crate) struct Pool {
    slots: Vec<Slot>,
}
pub(crate) enum Lease<'a> {
    Owned(Pool),
    Retained(&'a mut Pool),
}
impl Deref for Lease<'_> {
    type Target = Pool;
    fn deref(&self) -> &Pool {
        match self {
            Self::Owned(p) => p,
            Self::Retained(p) => p,
        }
    }
}
impl DerefMut for Lease<'_> {
    fn deref_mut(&mut self) -> &mut Pool {
        match self {
            Self::Owned(p) => p,
            Self::Retained(p) => p,
        }
    }
}
impl Lease<'_> {
    pub fn release(&mut self) -> bool {
        let drained = self.drain();
        match self {
            Self::Owned(pool) => pool.close() && drained,
            Self::Retained(_) => {
                stream_gate::trace("parser_lease_released", "");
                drained
            }
        }
    }
}
impl Pool {
    pub fn grow(&mut self, count: usize) -> Result<(), StoreError> {
        while self.slots.len() < count.min(PARSE_WORKERS) {
            let index = self.slots.len();
            let (jobs, input) = mpsc::sync_channel::<Task>(1);
            let (output, results) = mpsc::sync_channel(1);
            let worker = thread::Builder::new()
                .name(format!("catalog-parser-{index}"))
                .spawn(move || {
                    let _lifetime = stream_gate::Worker;
                    stream_gate::trace("worker_start", "");
                    while let Ok(Task { job, state }) = input.recv() {
                        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                            if state.load(Ordering::Acquire) == CATALOG_CANCELLED
                                || !stream_gate::before_parse(&job.uri, &state)
                            {
                                return Err(
                                    if state.load(Ordering::Acquire) == CATALOG_CANCELLED {
                                        StoreError::new(
                                            StoreErrorKind::Cancelled,
                                            "catalog stream cancelled",
                                        )
                                    } else {
                                        failure("catalog parser gate ended before parsing")
                                    },
                                );
                            }
                            let result = parse(job);
                            stream_gate::trace("parsed", &result.uri);
                            Ok(result)
                        }))
                        .unwrap_or_else(|_| Err(failure("catalog parser panicked")));
                        if output.send(result).is_err() {
                            break;
                        }
                    }
                })
                .map_err(|error| failure(&format!("catalog parser spawn failed: {error}")))?;
            self.slots.push(Slot {
                jobs: Some(jobs),
                results,
                worker: Some(worker),
                busy: false,
            });
        }
        Ok(())
    }
    pub fn dispatch(
        &mut self,
        index: usize,
        job: Job,
        state: &Arc<AtomicU8>,
    ) -> Result<(), StoreError> {
        let slot = &mut self.slots[index];
        if slot.busy {
            return Err(failure("parser slot still owns a previous task"));
        }
        let sender = slot
            .jobs
            .as_ref()
            .ok_or_else(|| failure("catalog parser slot retired"))?;
        if sender
            .send(Task {
                job,
                state: Arc::clone(state),
            })
            .is_err()
        {
            slot.jobs = None;
            return Err(failure("catalog parser stopped before accepting work"));
        }
        slot.busy = true;
        Ok(())
    }
    pub fn receive(&mut self, index: usize, state: &AtomicU8) -> Result<Output, StoreError> {
        let slot = &mut self.slots[index];
        loop {
            if state.load(Ordering::Acquire) == CATALOG_CANCELLED {
                // This does not release the resource; drain() must collect it.
                return Err(StoreError::new(
                    StoreErrorKind::Cancelled,
                    "catalog stream cancelled",
                ));
            }
            match slot.results.recv_timeout(Duration::from_millis(10)) {
                Ok(result) => {
                    slot.busy = false;
                    return result;
                }
                Err(RecvTimeoutError::Timeout) => (),
                Err(RecvTimeoutError::Disconnected) => {
                    slot.busy = false;
                    slot.jobs = None;
                    return Err(failure("catalog parser disconnected before completion"));
                }
            }
        }
    }
    fn drain(&mut self) -> bool {
        let mut success = true;
        for slot in &mut self.slots {
            if slot.busy {
                match slot.results.recv() {
                    Ok(Ok(_)) => (),
                    Ok(Err(error)) if error.kind() == StoreErrorKind::Cancelled => (),
                    Ok(Err(error)) => {
                        eprintln!(
                            "{}",
                            serde_json::json!({"event":"index.parser.cleanup.failed","message":error.to_string()})
                        );
                        success = false;
                    }
                    Err(_) => {
                        slot.jobs = None;
                        success = false;
                    }
                }
                slot.busy = false;
            }
        }
        success
    }
    fn close(&mut self) -> bool {
        for slot in &mut self.slots {
            slot.jobs = None;
        }
        let mut success = true;
        let mut joined = false;
        for slot in &mut self.slots {
            if let Some(worker) = slot.worker.take() {
                success &= worker.join().is_ok();
                joined = true;
            }
        }
        if joined {
            stream_gate::trace("joined", "");
        }
        success
    }
}
impl Drop for Pool {
    fn drop(&mut self) {
        if !self.close() {
            eprintln!(
                "{}",
                serde_json::json!({"event":"index.parser.join.failed"})
            );
        }
    }
}
fn failure(message: &str) -> StoreError {
    StoreError::new(StoreErrorKind::Internal, message)
}
