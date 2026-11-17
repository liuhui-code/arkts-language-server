//! One negotiated maintenance owner. Control messages never run extraction/SQL.
use crate::{
    catalog::{CatalogProgress, CatalogUpdate},
    protocol::ProtocolError,
};
use arkts_index_sqlite::{CompleteScanInputs, QualificationReceipt};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicU8, Ordering},
        mpsc::Receiver,
    },
    thread::JoinHandle,
    time::{SystemTime, UNIX_EPOCH},
};
#[path = "maintenance_collection.rs"]
mod collection;
#[path = "maintenance_executor.rs"]
mod executor;
pub(crate) const CAPABILITY: &str = "versioned-file-maintenance-v1";
#[cfg(debug_assertions)]
static OUTSIDE_CATCH_FAULT: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub(crate) struct Input {
    pub issuer: String,
    pub revision: u64,
}
impl Input {
    pub(crate) fn validate(&self) -> Result<(), ProtocolError> {
        if self.issuer.is_empty()
            || self.issuer.len() > 128
            || self.revision > 9_007_199_254_740_991
        {
            return Err(ProtocolError::new(
                "invalid_params",
                "invalid maintenance input",
            ));
        }
        Ok(())
    }
    pub(crate) fn json(&self) -> Value {
        json!({"issuer":self.issuer,"revision":self.revision})
    }
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Start {
    pub attempt_id: String,
    pub input: Input,
    pub reason: String,
    #[serde(default)]
    pub force: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Cancel {
    attempt_id: String,
    input: Input,
}
pub(crate) struct Terminal {
    pub value: Value,
}
impl Terminal {
    pub fn qualified(
        start: Start,
        written: usize,
        rows: usize,
        reused: usize,
        published: bool,
        indexed: usize,
        q: QualificationReceipt,
    ) -> Self {
        let input = start.input.json();
        Self {
            value: json!({"event":"maintenance/terminal","attemptId":start.attempt_id,"input":input,"phase":"completed","outcome":"qualified","dataPublished":published,"indexedDocuments":indexed,"writtenDocuments":written,"factRowsWritten":rows,"reusedDocuments":reused,
            "qualification":{"qualificationId":q.id,"workspaceIdentity":q.workspace,"storeId":q.store,"factsDomain":q.domain,"head":q.head,"input":{"issuer":q.input.issuer(),"revision":q.input.revision()},"scanComplete":true,"rejected":0,"fingerprint":q.fingerprint}}),
        }
    }
    pub fn published_pending(
        start: Start,
        written: usize,
        rows: usize,
        reused: usize,
        head: u64,
        error: String,
    ) -> Self {
        Self {
            value: json!({"event":"maintenance/terminal","attemptId":start.attempt_id,"input":start.input.json(),"phase":"completed","outcome":"published-unqualified","dataPublished":true,"head":head,"writtenDocuments":written,"factRowsWritten":rows,"reusedDocuments":reused,"qualification":null,"error":error}),
        }
    }
    fn failed(start: &Start, cancelled: bool, message: String) -> Self {
        Self {
            value: json!({"event":"maintenance/terminal","attemptId":start.attempt_id,"input":start.input.json(),"phase":if cancelled{"cancelled"}else{"failed"},"outcome":if cancelled{"cancelled"}else{"failed"},"dataPublished":false,"qualification":null,"error":if cancelled{Value::Null}else{json!({"code":"maintenance_failed","message":message})}}),
        }
    }
    fn unknown(start: &Start, message: &str) -> Self {
        Self {
            value: json!({"event":"maintenance/terminal","attemptId":start.attempt_id,"input":start.input.json(),"phase":"failed","outcome":"unknown","dataPublished":null,"qualification":null,"error":{"code":"publication_unknown","message":message}}),
        }
    }
}
struct Completion {
    terminal: Terminal,
    parsers: crate::catalog::ParserPool,
    draft: crate::maintenance_engine::Draft,
}
struct Active {
    uri: Option<String>,
    kind: Option<&'static str>,
    start: Start,
    state: Arc<AtomicU8>,
    worker: JoinHandle<()>,
    result: Receiver<Completion>,
    progress: Receiver<CatalogUpdate>,
    ready: Option<Completion>,
}
pub(crate) struct Maintenance {
    source_scope: crate::source_scope::SourceScope,
    namespace: Option<arkts_index_sqlite::cache_gc::namespace::ManagedCacheNamespace>,
    root: PathBuf,
    base: PathBuf,
    identity: String,
    pub domain: String,
    migration_from: Option<String>,
    active: Option<Active>,
    pending: crate::maintenance_pending::Pending,
    last: Option<Start>,
    terminal: Option<Value>,
    pub progress: CatalogProgress,
    nonce: String,
    serial: u64,
    spawned: u64,
    parsers: Option<crate::catalog::ParserPool>,
    draft: crate::maintenance_engine::Draft,
    reuse: crate::maintenance_engine::SharedReuse,
    collection: collection::Collection,
}
pub(crate) fn domain() -> Result<String, ProtocolError> {
    CompleteScanInputs::new()
        .map(|i| format!("arkts-file-facts-v1:{}", i.producer_key()))
        .map_err(crate::protocol_store_error)
}
impl Maintenance {
    pub fn new(
        root: PathBuf,
        base: PathBuf,
        identity: String,
        domain: String,
        migration_from: Option<String>,
        namespace: Option<arkts_index_sqlite::cache_gc::namespace::ManagedCacheNamespace>,
        source_scope: crate::source_scope::SourceScope,
    ) -> Self {
        let nonce = format!(
            "{:x}-{:x}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        );
        let reuse = Arc::new(std::sync::Mutex::new(None));
        let collection = collection::Collection::new(
            base.clone(),
            identity.clone(),
            domain.clone(),
            Arc::clone(&reuse),
            namespace.clone(),
        );
        Self {
            source_scope,
            namespace,
            root,
            base,
            identity,
            domain,
            migration_from,
            active: None,
            pending: crate::maintenance_pending::Pending::default(),
            last: None,
            terminal: None,
            progress: CatalogProgress::default(),
            nonce,
            serial: 0,
            spawned: 0,
            parsers: Some(crate::catalog::ParserPool::default()),
            draft: None,
            reuse,
            collection,
        }
    }
    pub fn is_active(&self) -> bool {
        // Background GC belongs to the workspace lifetime, not to an accepted
        // input. Replacement drops this owner, which stops and joins its GC.
        self.active.is_some() || self.pending.len() > 0
    }
    pub fn observed_input(&self) -> Option<&Input> {
        self.pending.latest.as_ref()
    }
    pub fn status(&self) -> Value {
        let task = self
            .active
            .as_ref()
            .map(|a| &a.start)
            .or(self.last.as_ref());
        json!({"retainedReuseStore":self.reuse.lock().unwrap().as_ref().map(|c|c.store_id()),"collection":self.collection.status(),"statusScope":"task","retainedBootstrapDraft":self.draft.is_some(),"maintenanceWorkerSpawns":self.spawned,"activeMaintenanceTasks":usize::from(self.active.is_some()),"pendingUriCount":self.pending.len(),"needsReconcile":self.pending.needs_reconcile,"requiresReconcileBarrier":self.pending.barrier,"precise":self.pending.precise,"observedInput":self.pending.latest.as_ref().map(Input::json),"activeUri":self.active.as_ref().and_then(|a|a.uri.as_deref()),"phase":if let Some(t)=&self.terminal {t["phase"].as_str().unwrap_or("failed")}else if let Some(active)=&self.active{match active.state.load(Ordering::Acquire){1=>"cancelling",2|3=>"validating",4=>"publishing",_=>"running"}}else if self.pending.len()>0 {"queued"}else{"idle"},"attemptId":task.map(|s|s.attempt_id.as_str()),"input":task.map(|s|s.input.json()),"terminal":self.terminal})
    }
    fn changes(&mut self, params: Value) -> Result<Value, ProtocolError> {
        if params
            .get("managedCacheNamespaces")
            .is_some_and(Value::is_null)
        {
            return Err(ProtocolError::new(
                "invalid_params",
                "source exclusions require an array; [] is explicit revocation",
            ));
        }
        let mut changes: crate::maintenance_pending::Changes = crate::parse_params(params)?;
        if changes.changes.is_empty() && changes.uncertainty.is_empty() {
            return Err(ProtocolError::new("invalid_params", "empty change set"));
        }
        let uris: Vec<_> = changes.changes.iter().map(|c| c.uri.clone()).collect();
        crate::validate_excluded_uris(&uris)?;
        for uri in &uris {
            let path =
                crate::class_binding_discovery::admitted_path(&self.root, &self.identity, uri)
                    .ok_or_else(|| {
                        ProtocolError::new(
                            "invalid_params",
                            "noncanonical or outside-workspace URI",
                        )
                    })?;
            if !crate::catalog::is_maintenance_source(&path)
                && !changes
                    .uncertainty
                    .contains(&crate::maintenance_pending::Uncertainty::Configuration)
            {
                changes
                    .uncertainty
                    .push(crate::maintenance_pending::Uncertainty::Configuration);
            }
        }
        // Reasons are a set, not an unbounded retained list of duplicate flags.
        changes.uncertainty = std::mem::take(&mut changes.uncertainty)
            .into_iter()
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .collect();
        let peers = changes
            .managed_cache_namespaces
            .as_ref()
            .map(|rows| {
                if !changes
                    .uncertainty
                    .contains(&crate::maintenance_pending::Uncertainty::Namespace)
                {
                    return Err(ProtocolError::new(
                        "invalid_params",
                        "source policy requires namespace uncertainty",
                    ));
                }
                crate::source_scope::SourceScope::prepare(&self.base, &self.root, rows)
            })
            .transpose()?;
        let input = changes.input.clone();
        let uncertain = !changes.uncertainty.is_empty();
        let accepted = self.pending.record(changes)?;
        if accepted && let Some(peers) = peers {
            self.source_scope.install(input, peers);
        }
        if accepted {
            if let Some(active) = &self.active
                && (uncertain || active.uri.as_ref().is_none_or(|u| uris.contains(u)))
            {
                cancel_state(&active.state);
            }
            self.terminal = None;
        }
        Ok(json!({"accepted":accepted,"status":self.status()}))
    }
    pub fn dispatch(&mut self, method: &str, params: Value) -> Result<Value, ProtocolError> {
        match method {
            "maintenance/changes" => self.changes(params),
            "maintenance/start" => {
                let start: Start = crate::parse_params(params)?;
                self.start(start)
            }
            "maintenance/status" => Ok(self.status()),
            "maintenance/cancel" => {
                let cancel: Cancel = crate::parse_params(params)?;
                let accepted = self
                    .active
                    .as_ref()
                    .filter(|a| {
                        a.start.attempt_id == cancel.attempt_id && a.start.input == cancel.input
                    })
                    .is_some_and(|a| cancel_state(&a.state));
                Ok(json!({"accepted":accepted,"status":self.status()}))
            }
            _ => Err(ProtocolError::new(
                "method_not_found",
                "unknown maintenance method",
            )),
        }
    }
    fn start(&mut self, start: Start) -> Result<Value, ProtocolError> {
        self.pending.check_input(&start.input)?;
        if start.attempt_id.is_empty()
            || start.attempt_id.len() > 128
            || start.input.issuer.is_empty()
            || start.input.issuer.len() > 128
            || start.input.revision > 9_007_199_254_740_991
            || start.reason.is_empty()
            || start.reason.len() > 128
        {
            return Err(ProtocolError::new(
                "invalid_params",
                "invalid maintenance identity/input",
            ));
        }
        if let Some(last) = &self.last {
            if last.input.issuer != start.input.issuer || start.input.revision < last.input.revision
            {
                return Err(ProtocolError::new(
                    "invalid_generation",
                    "stale or foreign input issuer",
                ));
            }
            if start.input == last.input {
                if start.attempt_id != last.attempt_id {
                    return Err(ProtocolError::new(
                        "invalid_generation",
                        "input revision already assigned",
                    ));
                }
                return Ok(json!({"accepted":false,"status":self.status()}));
            }
        }
        if self.active.is_some() || (self.pending.len() > 0 && !self.pending.barrier) {
            return Ok(json!({"accepted":false,"status":self.status()}));
        }
        self.launch(start, None)?;
        Ok(json!({"accepted":true,"status":self.status()}))
    }
}
fn cancel_state(state: &AtomicU8) -> bool {
    for allowed in [0, 2, 3] {
        if state
            .compare_exchange(allowed, 1, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
        {
            return true;
        }
    }
    false
}
impl Drop for Maintenance {
    fn drop(&mut self) {
        self.collection.stop();
        if let Some(active) = self.active.take() {
            cancel_state(&active.state);
            let _ = active.worker.join();
        }
    }
}
