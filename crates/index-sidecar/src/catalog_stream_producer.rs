use super::super::{
    CatalogUpdate, MAX_SOURCE_BYTES, PARSE_WORKERS, observer,
    source::{SourceRead, SourceStamp, read_source},
    stream_gate,
    worker::CATALOG_CANCELLED,
};
use super::Collected;
use arkts_index_core::{
    Document, DocumentSymbols, StoreError, StoreErrorKind, parse_document_symbols,
};
use arkts_index_sqlite::CatalogInput;
use std::{
    cell::RefCell,
    fs,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicU8, Ordering},
        mpsc::{self, Receiver, RecvTimeoutError, Sender, SyncSender},
    },
    thread::{self, JoinHandle},
    time::Duration,
};

pub(in crate::catalog) struct Job {
    pub uri: String,
    pub path: PathBuf,
    pub expected: Option<SourceStamp>,
}
struct Output {
    uri: String,
    source: Option<SourceStamp>,
    outcome: Outcome,
}
enum Outcome {
    Parsed(Box<DocumentSymbols>),
    Rejected,
    Skipped,
    Changed,
}
struct Slot {
    jobs: Option<SyncSender<Job>>,
    result: Option<Receiver<Output>>,
    worker: Option<JoinHandle<()>>,
}

/// Four fixed single-item escrow slots; no per-worker chunks or unbounded reorder map.
/// Writer chunks have their own row/byte limits. Each slot can own one in-progress
/// parse or complete result plus its source, whose expansion is not a hard byte/RSS cap.
pub(in crate::catalog) struct Producer<'a> {
    pending: std::vec::IntoIter<Job>,
    slots: Vec<Slot>,
    remaining: usize,
    ordinal: usize,
    finished: bool,
    state: &'a Arc<AtomicU8>,
    updates: &'a Sender<CatalogUpdate>,
    generation: u64,
    collected: &'a RefCell<Collected>,
}
impl<'a> Producer<'a> {
    pub(in crate::catalog) fn new(
        manifest: Vec<Job>,
        state: &'a Arc<AtomicU8>,
        updates: &'a Sender<CatalogUpdate>,
        generation: u64,
        collected: &'a RefCell<Collected>,
    ) -> Result<Self, StoreError> {
        let remaining = manifest.len();
        let mut this = Self {
            pending: manifest.into_iter(),
            slots: Vec::new(),
            remaining,
            ordinal: 0,
            finished: false,
            state,
            updates,
            generation,
            collected,
        };
        for index in 0..PARSE_WORKERS.min(remaining) {
            let (jobs, input) = mpsc::sync_channel::<Job>(1);
            let (output, result) = mpsc::sync_channel(1);
            let state = Arc::clone(state);
            let worker = thread::Builder::new()
                .name(format!("catalog-parser-{index}"))
                .spawn(move || {
                    let _worker_lifetime = stream_gate::Worker;
                    while let Ok(job) = input.recv() {
                        if state.load(Ordering::Acquire) == CATALOG_CANCELLED {
                            break;
                        }
                        if !stream_gate::before_parse(&job.uri, &state) {
                            break;
                        }
                        let result = parse(job);
                        stream_gate::trace("parsed", &result.uri);
                        if output.send(result).is_err() {
                            break;
                        }
                    }
                })
                .map_err(|error| failure(&format!("catalog parser spawn failed: {error}")))?;
            this.slots.push(Slot {
                jobs: Some(jobs),
                result: Some(result),
                worker: Some(worker),
            });
            this.dispatch(index)?;
        }
        Ok(this)
    }
    fn dispatch(&mut self, slot: usize) -> Result<(), StoreError> {
        if let Some(job) = self.pending.next() {
            self.slots[slot]
                .jobs
                .as_ref()
                .unwrap()
                .send(job)
                .map_err(|_| failure("catalog parser stopped before accepting work"))?;
        }
        Ok(())
    }
    fn join(&mut self) -> bool {
        // Disconnect every receiver before any join: a producer must never be pinned in send.
        for slot in &mut self.slots {
            slot.jobs.take();
            slot.result.take();
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
    fn receive(&self, slot: usize) -> Result<Output, StoreError> {
        loop {
            if self.state.load(Ordering::Acquire) == CATALOG_CANCELLED {
                return Err(failure("catalog stream cancelled"));
            }
            match self.slots[slot]
                .result
                .as_ref()
                .unwrap()
                .recv_timeout(Duration::from_millis(10))
            {
                Ok(output) => return Ok(output),
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => {
                    return Err(failure("catalog parser disconnected before completion"));
                }
            }
        }
    }
    fn advance(&mut self) -> Result<CatalogInput, StoreError> {
        loop {
            if self.remaining == 0 {
                if !self.join() {
                    return Err(failure("catalog parser panicked"));
                }
                if !observer::begin_activation(
                    self.state,
                    self.updates,
                    self.generation,
                    &self.collected.borrow().progress,
                )
                .map_err(|error| failure(&error.1))?
                {
                    return Err(failure("catalog stream cancelled before activation"));
                }
                self.finished = true;
                return Ok(CatalogInput::Complete);
            }
            let slot = self.ordinal % self.slots.len();
            let output = self.receive(slot)?;
            self.ordinal += 1;
            self.remaining -= 1;
            if self.state.load(Ordering::Acquire) != CATALOG_CANCELLED {
                self.dispatch(slot)?;
            }
            let mut collected = self.collected.borrow_mut();
            if let Some(source) = output.source {
                if let Some(inputs) = &mut collected.inputs {
                    inputs.record_digest(&output.uri, source.digest());
                }
                collected.sources.push(source);
            }
            match output.outcome {
                Outcome::Parsed(document) => {
                    collected.progress.indexed += 1;
                    return Ok(CatalogInput::Document(document));
                }
                Outcome::Rejected => {
                    collected.progress.rejected += 1;
                    return Ok(CatalogInput::Rejected(output.uri));
                }
                Outcome::Skipped => collected.progress.policy_skipped += 1,
                Outcome::Changed => {
                    return Err(failure(
                        "workspace source changed between hash scan and parsing; rebuild required",
                    ));
                }
            }
        }
    }
}
impl Iterator for Producer<'_> {
    type Item = Result<CatalogInput, StoreError>;
    fn next(&mut self) -> Option<Self::Item> {
        if self.finished {
            return None;
        }
        let result = self.advance();
        if result.is_err() {
            self.finished = true;
        }
        Some(result)
    }
}
impl Drop for Producer<'_> {
    fn drop(&mut self) {
        self.join();
    }
}

fn parse(
    Job {
        uri,
        path,
        expected,
    }: Job,
) -> Output {
    let mut output = Output {
        uri,
        source: None,
        outcome: if expected.is_some() {
            Outcome::Changed
        } else {
            Outcome::Rejected
        },
    };
    let Ok(metadata) = fs::metadata(&path) else {
        return output;
    };
    if metadata.len() > MAX_SOURCE_BYTES {
        if expected.is_none() {
            output.outcome = Outcome::Skipped;
        }
        return output;
    }
    stream_gate::trace("parse_read", &output.uri);
    match read_source(&path) {
        Ok(SourceRead::Text(text)) => {
            let source = SourceStamp::capture(&path, &metadata, &text);
            if expected
                .as_ref()
                .is_some_and(|previous| !previous.same_input(&source))
            {
                return output;
            }
            if expected.is_none() {
                output.source = Some(source);
            }
            output.outcome = Outcome::Rejected;
            stream_gate::trace("parser_call", &output.uri);
            if let Ok(document) = parse_document_symbols(&Document::new(output.uri.clone(), text)) {
                output.outcome = Outcome::Parsed(Box::new(document));
            }
        }
        Ok(SourceRead::PolicySkipped) if expected.is_none() => output.outcome = Outcome::Skipped,
        Ok(SourceRead::PolicySkipped) => {}
        Err(_) => {}
    }
    output
}
fn failure(message: &str) -> StoreError {
    StoreError::new(StoreErrorKind::Internal, message)
}
