//! Bounded persistent readers. A client terminal does not release a running slot.
use crate::{
    maintenance::Input,
    protocol::{ProtocolError, Request},
    reader_worker::{self, Config, Done, Job},
};
use arkts_index_sqlite::ReadCancellation;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc::{self, Receiver, SyncSender},
    },
    thread::{self, JoinHandle},
};
const WORKERS: usize = 2;
const WAITING: usize = 4;
static NEXT_EPOCH: AtomicU64 = AtomicU64::new(1);
struct Active {
    id: u64,
    token: String,
    input: Option<Input>,
    cancel: ReadCancellation,
    terminal: bool,
}
struct Slot {
    sender: Option<SyncSender<Job>>,
    results: Receiver<Done>,
    worker: Option<JoinHandle<()>>,
    active: Option<Active>,
}
pub(crate) struct Readers {
    pub epoch: String,
    slots: Vec<Slot>,
    waiting: VecDeque<Job>,
    outbound: Vec<Value>,
    serial: u64,
    cancelled: u64,
    finished: u64,
    failures: u64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Cancel {
    reader_epoch: String,
    request_id: u64,
    request_token: String,
}
pub(crate) fn is_read(method: &str) -> bool {
    matches!(
        method,
        "search"
            | "exports/search"
            | "references/candidates"
            | "class-bindings/resolve"
            | "index/status"
    )
}
fn frame(epoch: &str, id: u64, token: &str, result: Result<Value, ProtocolError>) -> Value {
    match result {
        Ok(value) => {
            json!({"protocol":1,"id":id,"ok":true,"readerEpoch":epoch,"requestToken":token,"result":value})
        }
        Err(e) => {
            json!({"protocol":1,"id":id,"ok":false,"readerEpoch":epoch,"requestToken":token,"error":{"code":e.code,"message":e.message}})
        }
    }
}
fn cancelled() -> ProtocolError {
    ProtocolError::new("cancelled", "read cancelled")
}
impl Readers {
    pub fn new(
        config: Config,
        initial: arkts_index_sqlite::CatalogStore,
    ) -> Result<Self, ProtocolError> {
        let mut initial = Some(initial);
        let birth = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| ProtocolError::new("internal", e.to_string()))?
            .as_nanos();
        let mut readers = Self {
            epoch: format!(
                "{:x}-{birth:x}-{:x}",
                std::process::id(),
                NEXT_EPOCH.fetch_add(1, Ordering::Relaxed)
            ),
            slots: Vec::new(),
            waiting: VecDeque::new(),
            outbound: Vec::new(),
            serial: 0,
            cancelled: 0,
            finished: 0,
            failures: 0,
        };
        for index in 0..WORKERS {
            let (sender, input) = mpsc::sync_channel::<Job>(1);
            let (output, results) = mpsc::channel();
            let config = config.clone();
            let initial = initial.take();
            let worker = thread::Builder::new()
                .name(format!("arkts-reader-{index}"))
                .spawn(move || {
                    let mut store = initial;
                    while let Ok(job) = input.recv() {
                        let id = job.request.id;
                        let token = job.token.clone();
                        #[cfg(debug_assertions)]
                        reader_worker::fatal_test_gate(id);
                        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                            reader_worker::execute(&config, &mut store, job)
                        }))
                        .unwrap_or_else(|_| Err(ProtocolError::new("internal", "reader panicked")));
                        if output.send(Done { id, token, result }).is_err() {
                            break;
                        }
                    }
                })
                .map_err(|e| ProtocolError::new("internal", e.to_string()))?;
            readers.slots.push(Slot {
                sender: Some(sender),
                results,
                worker: Some(worker),
                active: None,
            });
        }
        Ok(readers)
    }
    pub fn is_active(&self) -> bool {
        !self.waiting.is_empty() || self.slots.iter().any(|s| s.active.is_some())
    }
    pub fn status(&self) -> Value {
        json!({"statusScope":"reader-tasks","readerEpoch":self.epoch,"readerThreadsCreated":self.slots.len(),"activeReaderTasks":self.slots.iter().filter(|s|s.active.is_some()).count(),"queuedReads":self.waiting.len(),"cancelledTerminals":self.cancelled,"finishedResources":self.finished,"resourceFailures":self.failures,"retiredReaders":self.slots.iter().filter(|s|s.sender.is_none()).count()})
    }
    pub fn submit(&mut self, request: Request, input: Option<Input>) -> Result<(), ProtocolError> {
        if self.waiting.iter().any(|j| j.request.id == request.id)
            || self
                .slots
                .iter()
                .any(|s| s.active.as_ref().is_some_and(|a| a.id == request.id))
        {
            return Err(ProtocolError::new(
                "duplicate_request_id",
                "read request ID is still owned",
            ));
        }
        if self.slots.iter().all(|s| s.sender.is_none()) {
            return Err(ProtocolError::new(
                "reader_unavailable",
                "no healthy reader remains",
            ));
        }
        if self.waiting.len() >= WAITING {
            return Err(ProtocolError::new("busy", "reader queue is full"));
        }
        self.serial += 1;
        let token = match request.params.get("requestToken") {
            Some(Value::String(t)) if !t.is_empty() && t.len() <= 128 => t.clone(),
            Some(_) => {
                return Err(ProtocolError::new(
                    "invalid_params",
                    "invalid read request token",
                ));
            }
            None => format!("{}:{}", self.epoch, self.serial),
        };
        self.waiting.push_back(Job {
            request,
            input,
            token,
            cancel: ReadCancellation::default(),
        });
        self.pump();
        Ok(())
    }
    fn pump(&mut self) {
        for slot in &mut self.slots {
            if slot.active.is_some() || slot.sender.is_none() {
                continue;
            }
            let Some(job) = self.waiting.pop_front() else {
                break;
            };
            let active = Active {
                id: job.request.id,
                token: job.token.clone(),
                input: job.input.clone(),
                cancel: job.cancel.clone(),
                terminal: false,
            };
            match slot.sender.as_ref().unwrap().send(job) {
                Ok(()) => slot.active = Some(active),
                Err(e) => {
                    slot.sender = None;
                    self.waiting.push_front(e.0);
                }
            }
        }
    }
    fn cancel_id(&mut self, id: u64, token: &str) -> bool {
        if let Some(position) = self
            .waiting
            .iter()
            .position(|j| j.request.id == id && j.token == token)
        {
            let job = self.waiting.remove(position).unwrap();
            job.cancel.cancel();
            self.cancelled += 1;
            self.outbound
                .push(frame(&self.epoch, id, token, Err(cancelled())));
            return true;
        }
        for slot in &mut self.slots {
            if let Some(a) = slot.active.as_mut()
                && a.id == id
                && a.token == token
                && !a.terminal
            {
                a.cancel.cancel();
                a.terminal = true;
                self.cancelled += 1;
                self.outbound
                    .push(frame(&self.epoch, id, token, Err(cancelled())));
                return true;
            }
        }
        false
    }
    pub fn cancel(&mut self, params: Value) -> Result<Value, ProtocolError> {
        let c: Cancel = crate::parse_params(params)?;
        let accepted =
            c.reader_epoch == self.epoch && self.cancel_id(c.request_id, &c.request_token);
        Ok(json!({"accepted":accepted,"status":self.status()}))
    }
    pub fn invalidate(&mut self, input: Option<&Input>) {
        let mut old: Vec<_> = self
            .waiting
            .iter()
            .filter(|j| j.input.as_ref() != input)
            .map(|j| (j.request.id, j.token.clone()))
            .collect();
        old.extend(
            self.slots
                .iter()
                .filter_map(|s| s.active.as_ref())
                .filter(|a| a.input.as_ref() != input)
                .map(|a| (a.id, a.token.clone())),
        );
        for (id, token) in old {
            self.cancel_id(id, &token);
        }
    }
    pub fn close_clients(&mut self) {
        let mut ids: Vec<_> = self
            .waiting
            .iter()
            .map(|j| (j.request.id, j.token.clone()))
            .collect();
        ids.extend(
            self.slots
                .iter()
                .filter_map(|s| s.active.as_ref())
                .map(|a| (a.id, a.token.clone())),
        );
        for (id, token) in ids {
            self.cancel_id(id, &token);
        }
    }
    pub fn poll(&mut self) -> Vec<Value> {
        let mut replies = std::mem::take(&mut self.outbound);
        for slot in &mut self.slots {
            let mut done = slot.results.try_recv().ok();
            if done.is_none() && slot.worker.as_ref().is_some_and(|w| w.is_finished()) {
                // Completion observation must precede the final channel check.
                done = slot.results.try_recv().ok();
                slot.sender = None;
                if done.is_none()
                    && let Some(a) = slot.active.as_ref()
                {
                    done = Some(Done {
                        id: a.id,
                        token: a.token.clone(),
                        result: Err(ProtocolError::new(
                            "reader_unavailable",
                            "reader exited without a terminal",
                        )),
                    });
                }
            }
            if let Some(done) = done
                && let Some(active) = slot.active.take()
            {
                self.finished += 1;
                if done.id != active.id || done.token != active.token {
                    self.failures += 1;
                    slot.sender = None;
                    if !active.terminal {
                        replies.push(frame(
                            &self.epoch,
                            active.id,
                            &active.token,
                            Err(ProtocolError::new(
                                "internal",
                                "reader result ownership mismatch",
                            )),
                        ));
                    }
                    continue;
                }
                if let Err(e) = &done.result
                    && e.code != "cancelled"
                    && (e.store_failure || e.code == "internal" || e.code == "reader_unavailable")
                {
                    self.failures += 1;
                    if active.terminal {
                        eprintln!(
                            "{}",
                            json!({"event":"index.reader.failure-after-terminal","code":e.code,"message":e.message})
                        );
                    }
                }
                if !active.terminal {
                    replies.push(frame(&self.epoch, done.id, &done.token, done.result));
                }
            }
        }
        if self.slots.iter().all(|slot| slot.sender.is_none()) {
            for job in self.waiting.drain(..) {
                replies.push(frame(
                    &self.epoch,
                    job.request.id,
                    &job.token,
                    Err(ProtocolError::new(
                        "reader_unavailable",
                        "no healthy reader remains",
                    )),
                ));
            }
        }
        self.pump();
        replies
    }
}
impl Drop for Readers {
    fn drop(&mut self) {
        self.waiting.clear();
        for slot in &mut self.slots {
            if let Some(a) = &slot.active {
                a.cancel.cancel();
            }
            slot.sender = None;
        }
        for slot in &mut self.slots {
            if let Some(worker) = slot.worker.take()
                && worker.join().is_err()
            {
                eprintln!("{}", json!({"event":"index.reader.join.failed"}));
            }
            while let Ok(done) = slot.results.try_recv() {
                if let Err(error) = done.result
                    && error.code != "cancelled"
                {
                    eprintln!(
                        "{}",
                        json!({"event":"index.reader.failure-during-close","code":error.code,"message":error.message})
                    );
                }
            }
        }
    }
}
