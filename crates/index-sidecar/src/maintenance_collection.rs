//! One retained GC worker, one outstanding quantum. Inputs wait for that quantum
//! off the control loop; the loop never dispatches GC while an input owns SQL.
use arkts_index_core::{StoreError, StoreErrorKind};
use arkts_index_sqlite::CatalogCollector;
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{
        Arc, Condvar, Mutex,
        atomic::{AtomicBool, AtomicU8, Ordering},
        mpsc,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
const IDLE_PROBE: Duration = Duration::from_secs(5);
#[derive(Default)]
pub(super) struct Barrier {
    finished: Mutex<bool>,
    changed: Condvar,
}
impl Barrier {
    pub fn wait(&self, state: &AtomicU8) -> Result<(), StoreError> {
        let mut done = self
            .finished
            .lock()
            .map_err(|_| failure("GC barrier poisoned"))?;
        while !*done {
            if state.load(Ordering::Acquire) == 1 {
                return Err(StoreError::new(
                    StoreErrorKind::Cancelled,
                    "input cancelled before acquiring the writer lane",
                ));
            }
            done = self
                .changed
                .wait_timeout(done, Duration::from_millis(20))
                .map_err(|_| failure("GC barrier poisoned"))?
                .0;
        }
        Ok(())
    }
}
struct Signal(Arc<Barrier>);
impl Drop for Signal {
    fn drop(&mut self) {
        *self.0.finished.lock().unwrap_or_else(|e| e.into_inner()) = true;
        self.0.changed.notify_all();
    }
}
#[derive(Clone)]
struct Config {
    namespace: Option<arkts_index_sqlite::cache_gc::namespace::ManagedCacheNamespace>,
    reuse: crate::maintenance_engine::SharedReuse,
    fatal: Arc<AtomicBool>,
    base: PathBuf,
    identity: String,
    domain: String,
}
struct Step {
    more: bool,
    value: Value,
}
struct CollectionFailure {
    message: String,
    fatal: bool,
}
struct Worker {
    send: Option<mpsc::SyncSender<Arc<Barrier>>>,
    receive: mpsc::Receiver<Result<Step, CollectionFailure>>,
    join: Option<JoinHandle<()>>,
}
impl Drop for Worker {
    fn drop(&mut self) {
        drop(self.send.take());
        if let Some(join) = self.join.take()
            && join.join().is_err()
        {
            eprintln!("index collection worker cleanup panicked");
        }
    }
}
pub(super) struct Collection {
    config: Config,
    worker: Option<Worker>,
    busy: Option<Arc<Barrier>>,
    stop: Arc<AtomicBool>,
    pending: bool,
    enabled: bool,
    disabled: bool,
    fatal: Arc<AtomicBool>,
    next_probe: Instant,
    spawns: u64,
    quanta: u64,
    facts: u64,
    versions: u64,
    last: Value,
    error: Option<String>,
}
impl Collection {
    pub fn new(
        base: PathBuf,
        identity: String,
        domain: String,
        reuse: crate::maintenance_engine::SharedReuse,
        namespace: Option<arkts_index_sqlite::cache_gc::namespace::ManagedCacheNamespace>,
    ) -> Self {
        let fatal = Arc::new(AtomicBool::new(false));
        Self {
            config: Config {
                namespace,
                reuse,
                fatal: Arc::clone(&fatal),
                base,
                identity,
                domain,
            },
            worker: None,
            busy: None,
            stop: Arc::new(AtomicBool::new(false)),
            pending: false,
            enabled: false,
            disabled: false,
            fatal,
            next_probe: Instant::now() + IDLE_PROBE,
            spawns: 0,
            quanta: 0,
            facts: 0,
            versions: 0,
            last: Value::Null,
            error: None,
        }
    }
    pub fn dirty(&mut self, terminal: &Value) {
        if !self.enabled
            && terminal["dataPublished"] != true
            && !terminal["qualification"].is_object()
        {
            return;
        }
        self.enabled = true;
        self.pending = true;
        // A GC thread fault is isolated until explicit workspace reinitialize.
        // New data inputs can retry SQL failures but cannot restart dead workers.
        if !self.fatal.load(Ordering::Acquire) {
            self.disabled = false;
        }
    }
    pub fn stop(&self) {
        self.stop.store(true, Ordering::Release);
    }
    pub fn is_busy(&self) -> bool {
        self.busy.is_some()
    }
    pub fn status(&self) -> Value {
        json!({"active":self.is_busy(),"workerSpawns":self.spawns,"collectorOpens":self.last["collectorOpens"],
            "quanta":self.quanta,"factsDeleted":self.facts,"versionsDeleted":self.versions,
            "pending":self.pending,"disabled":self.disabled,"fatal":self.fatal.load(Ordering::Acquire),"last":self.last,"error":self.error})
    }
    pub fn fatal_flag(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.fatal)
    }
    pub fn before_input(&mut self) -> Option<Arc<Barrier>> {
        self.poll(false);
        self.kick();
        self.busy.clone()
    }
    pub fn poll(&mut self, may_dispatch: bool) {
        if self.busy.is_some() {
            let result = self.worker.as_ref().unwrap().receive.try_recv();
            match result {
                Ok(Ok(step)) => {
                    self.busy = None;
                    self.quanta += 1;
                    self.pending |= step.more;
                    self.facts += step.value["factsDeleted"].as_u64().unwrap();
                    self.versions += step.value["versionsDeleted"].as_u64().unwrap();
                    self.last = step.value;
                    self.error = None;
                    if !step.more {
                        self.next_probe = Instant::now() + IDLE_PROBE;
                    }
                }
                Ok(Err(error)) => {
                    self.busy = None;
                    self.disabled = true;
                    self.fatal.store(error.fatal, Ordering::Release);
                    eprintln!(
                        "{}",
                        json!({"event":"maintenance.collectionFailed","fatal":error.fatal,"message":error.message,"workMayHaveCommitted":true})
                    );
                    self.error = Some(error.message);
                }
                Err(mpsc::TryRecvError::Disconnected) => {
                    self.busy = None;
                    self.disabled = true;
                    self.fatal.store(true, Ordering::Release);
                    self.error =
                        Some("GC worker disconnected; previous work may have committed".into());
                    drop(self.worker.take());
                }
                Err(mpsc::TryRecvError::Empty) => (),
            }
        }
        if may_dispatch {
            self.kick();
        }
    }
    fn kick(&mut self) {
        if !self.enabled
            || self.disabled
            || self.busy.is_some()
            || self.stop.load(Ordering::Acquire)
            || (!self.pending && Instant::now() < self.next_probe)
        {
            return;
        }
        if self.worker.is_none() {
            match spawn(self.config.clone(), Arc::clone(&self.stop)) {
                Ok(worker) => {
                    self.worker = Some(worker);
                    self.spawns += 1;
                }
                Err(error) => {
                    self.disabled = true;
                    self.error = Some(error);
                    return;
                }
            }
        }
        let barrier = Arc::new(Barrier::default());
        // Exactly one in-flight command; after its response the channel is empty.
        // Capacity one makes this send nonblocking without an unbounded backlog.
        if self
            .worker
            .as_ref()
            .unwrap()
            .send
            .as_ref()
            .unwrap()
            .send(Arc::clone(&barrier))
            .is_err()
        {
            self.disabled = true;
            self.fatal.store(true, Ordering::Release);
            self.error = Some("GC worker unavailable".into());
            return;
        }
        self.pending = false;
        self.busy = Some(barrier);
    }
}
impl Drop for Collection {
    fn drop(&mut self) {
        self.stop();
        drop(self.worker.take());
    }
}
fn failure(message: &str) -> StoreError {
    StoreError::new(StoreErrorKind::Io, message)
}
fn spawn(config: Config, stop: Arc<AtomicBool>) -> Result<Worker, String> {
    let (send, commands) = mpsc::sync_channel::<Arc<Barrier>>(1);
    let (done, receive) = mpsc::sync_channel(1);
    let join = thread::Builder::new()
        .name("arkts-index-collection".into())
        .spawn(move || {
            let mut collector = None;
            let mut opens = 0;
            while let Ok(barrier) = commands.recv() {
                let signal = Signal(barrier);
                let mut reuse = config.reuse.lock().unwrap().take();
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    if let Some(cache) = reuse.as_ref()
                        && !cache.is_selected()?
                    {
                        drop(reuse.take());
                    }
                    step(&config, &stop, &mut collector, &mut opens)
                }));
                let (result, fatal) = match result {
                    Ok(Ok(step)) => (Ok(step), false),
                    Ok(Err(error)) => {
                        drop(collector.take());
                        (
                            Err(CollectionFailure {
                                message: format!("GC failed; work may have committed: {error}"),
                                fatal: false,
                            }),
                            false,
                        )
                    }
                    Err(_) => {
                        config.fatal.store(true, Ordering::Release);
                        drop(reuse.take());
                        drop(collector.take());
                        (
                            Err(CollectionFailure {
                                message: "GC worker panicked; work may have committed".into(),
                                fatal: true,
                            }),
                            true,
                        )
                    }
                };
                *config.reuse.lock().unwrap() = reuse;
                // End all SQL/cleanup before releasing the next input's barrier.
                drop(signal);
                if done.send(result).is_err() || fatal || stop.load(Ordering::Acquire) {
                    break;
                }
            }
        })
        .map_err(|e| e.to_string())?;
    Ok(Worker {
        send: Some(send),
        receive,
        join: Some(join),
    })
}
fn step(
    config: &Config,
    stop: &AtomicBool,
    collector: &mut Option<CatalogCollector>,
    opens: &mut u64,
) -> Result<Step, StoreError> {
    #[cfg(debug_assertions)]
    if let Some(gate) = std::env::var_os("ARKTS_INDEX_TEST_COLLECTION_GATE") {
        while !std::path::Path::new(&gate).exists() && !stop.load(Ordering::Acquire) {
            thread::sleep(Duration::from_millis(5));
        }
    }
    if stop.load(Ordering::Acquire) {
        return Err(failure("collection owner closed"));
    }
    crate::managed_cache_admission::validate(config.namespace.as_ref())?;
    if collector.is_none() {
        *collector = Some(CatalogCollector::begin(
            &config.base,
            &config.identity,
            &config.domain,
        )?);
        *opens += 1;
    }
    #[cfg(debug_assertions)]
    {
        static ONCE: AtomicBool = AtomicBool::new(false);
        if std::env::var("ARKTS_INDEX_TEST_COLLECTION_PANIC").as_deref() == Ok("once")
            && !ONCE.swap(true, Ordering::AcqRel)
        {
            panic!("controlled collection fault after opening its physical store");
        }
    }
    let report = match collector.as_mut().unwrap().collect(4096) {
        Err(e) if e.kind() == StoreErrorKind::InvalidGeneration => {
            drop(collector.take());
            crate::managed_cache_admission::validate(config.namespace.as_ref())?;
            *collector = Some(CatalogCollector::begin(
                &config.base,
                &config.identity,
                &config.domain,
            )?);
            *opens += 1;
            collector.as_mut().unwrap().collect(4096)?
        }
        result => result?,
    };
    let g = &report.garbage;
    let more = g.work_items > 0 || !g.owner_scan_wrapped || !report.still_selected;
    let checkpoint = if !more {
        Some(collector.as_mut().unwrap().checkpoint().map(|r|json!({"logFrames":r.log_frames,"checkpointedFrames":r.checkpointed_frames})).map_err(|e|e.to_string()))
    } else {
        None
    };
    Ok(Step {
        more,
        value: json!({"storeId":report.store_id,"stillSelected":report.still_selected,
        "collectorOpens":opens,"workItems":g.work_items,"ownersExamined":g.owners_examined,
        "ownerScanWrapped":g.owner_scan_wrapped,"ownersRecovered":g.owners_recovered,
        "ownersDeleted":g.owners_deleted,"groupOwnersDetached":g.group_owners_detached,
        "factsDeleted":g.facts_deleted,"versionsDeleted":g.versions_deleted,
        "entriesDeleted":g.entries_deleted,"pinsDeleted":g.pins_deleted,
        "checkpoint":checkpoint.map(|r|match r {Ok(v)=>v,Err(error)=>json!({"error":error})})}),
    })
}
