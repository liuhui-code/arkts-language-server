//! Persistent read-only connections; maintenance owns separate connections/tasks.
use crate::{
    maintenance::Input,
    protocol::{ProtocolError, Request},
    read_query::ReadContext,
};
use arkts_index_sqlite::{CatalogStore, InputRevision, QualificationReceipt, ReadCancellation};
use serde_json::{Value, json};
use std::path::PathBuf;
#[derive(Clone)]
pub(crate) struct Config {
    pub source_scope: crate::source_scope::SourceScope,
    pub namespace: Option<arkts_index_sqlite::cache_gc::namespace::ManagedCacheNamespace>,
    pub root: PathBuf,
    pub base: PathBuf,
    pub identity: String,
    pub domain: String,
    pub migration_from: Option<String>,
}
pub(crate) struct Job {
    pub request: Request,
    pub input: Option<Input>,
    pub token: String,
    pub cancel: ReadCancellation,
}
pub(crate) struct Done {
    pub id: u64,
    pub token: String,
    pub result: Result<Value, ProtocolError>,
}
pub(crate) fn qualification(q: &QualificationReceipt) -> Value {
    json!({"qualificationId":q.id,"workspaceIdentity":q.workspace,"storeId":q.store,"factsDomain":q.domain,"head":q.head,"input":{"issuer":q.input.issuer(),"revision":q.input.revision()},"scanComplete":true,"rejected":0,"fingerprint":q.fingerprint})
}
pub(crate) fn execute(
    config: &Config,
    store: &mut Option<CatalogStore>,
    mut job: Job,
) -> Result<Value, ProtocolError> {
    if job.cancel.is_cancelled() {
        return Err(ProtocolError::new("cancelled", "read cancelled"));
    }
    crate::managed_cache_admission::protocol(config.namespace.as_ref())?;
    if store.is_none() {
        *store = Some(
            CatalogStore::open_for_maintenance(&config.base, &config.identity, &config.domain)
                .map_err(crate::protocol_store_error)?,
        );
    }
    let store = store.as_ref().unwrap();
    if let Some(actual) = store
        .migration_source_domain()
        .map_err(crate::protocol_store_error)?
    {
        return Err(
            if config.migration_from.as_deref() == Some(actual.as_str()) {
                ProtocolError::new(
                    "migration_required",
                    "index facts need a producer migration; no old-domain facts were served",
                )
            } else {
                ProtocolError::new(
                    "producer_superseded",
                    "another producer took over this catalog; this owner cannot migrate it back",
                )
            },
        );
    }
    let input = job
        .input
        .as_ref()
        .map(|i| InputRevision::new(&i.issuer, i.revision))
        .transpose()
        .map_err(crate::protocol_store_error)?;
    let scope_epoch = config.source_scope.epoch();
    let mut params = Some(std::mem::take(&mut job.request.params));
    let mut dispatch_error = None;
    let snapshot = store.read_snapshot(input.as_ref(), &job.cancel, |read, head, q| {
        read_gate(&job)?;
        crate::managed_cache_admission::validate(config.namespace.as_ref())?;
        if !config.source_scope.allows(q) {
            dispatch_error = Some(ProtocolError::new(
                "source_scope_unqualified",
                "source exclusions require a complete reconciliation",
            ));
            return Err(arkts_index_core::StoreError::new(
                arkts_index_core::StoreErrorKind::InvalidData,
                "source scope unqualified",
            ));
        }
        let context = ReadContext {
            store: Some(read),
            root: Some(&config.root),
            identity: Some(&config.identity),
            head,
            completeness: if q.is_some() { "ready" } else { "stale" },
        };
        match context.dispatch(&job.request.method, params.take().unwrap()) {
            Ok(value) => Ok(value),
            Err(error) => {
                dispatch_error = Some(error);
                Err(arkts_index_core::StoreError::new(
                    arkts_index_core::StoreErrorKind::Internal,
                    "read dispatch failed",
                ))
            }
        }
    });
    crate::managed_cache_admission::protocol(config.namespace.as_ref())?;
    if config.source_scope.epoch() != scope_epoch {
        return Err(ProtocolError::new(
            "invalid_generation",
            "source exclusions changed during read",
        ));
    }
    if let Some(error) = dispatch_error {
        return Err(error);
    }
    match snapshot.map_err(crate::protocol_store_error)? {
        Some(s) => {
            let mut value = s.value;
            value["snapshot"] = json!({"workspaceIdentity":s.workspace,"storeId":s.store,"factsDomain":s.domain,"head":s.head});
            value["qualification"] = s
                .qualification
                .as_ref()
                .map(qualification)
                .unwrap_or(Value::Null);
            value["format"] = json!("versioned");
            Ok(value)
        }
        None => {
            let mut error = None;
            let result = store.discovery_read(&job.cancel, |read| {
                if !config.source_scope.allows(None) {
                    error = Some(ProtocolError::new(
                        "source_scope_unqualified",
                        "source exclusions require a complete reconciliation",
                    ));
                    return Err(arkts_index_core::StoreError::new(
                        arkts_index_core::StoreErrorKind::InvalidData,
                        "source scope unqualified",
                    ));
                }
                let metadata = read.metadata()?;
                read_gate(&job)?;
                crate::managed_cache_admission::validate(config.namespace.as_ref())?;
                let context = ReadContext {
                    store: Some(read),
                    root: Some(&config.root),
                    identity: Some(&config.identity),
                    head: metadata.committed_generation,
                    completeness: "stale",
                };
                match context.dispatch(&job.request.method, params.take().unwrap()) {
                    Ok(value) => Ok(value),
                    Err(e) => {
                        error = Some(e);
                        Err(arkts_index_core::StoreError::new(
                            arkts_index_core::StoreErrorKind::Internal,
                            "read dispatch failed",
                        ))
                    }
                }
            });
            crate::managed_cache_admission::protocol(config.namespace.as_ref())?;
            if config.source_scope.epoch() != scope_epoch {
                return Err(ProtocolError::new(
                    "invalid_generation",
                    "source exclusions changed during read",
                ));
            }
            if let Some(error) = error {
                return Err(error);
            }
            let mut value = result.map_err(crate::protocol_store_error)?;
            value["snapshot"] = Value::Null;
            value["qualification"] = Value::Null;
            value["format"] = json!("legacy");
            Ok(value)
        }
    }
}
fn read_gate(job: &Job) -> Result<(), arkts_index_core::StoreError> {
    #[cfg(debug_assertions)]
    if std::env::var("ARKTS_INDEX_TEST_READ_GATE_ID")
        .ok()
        .is_some_and(|ids| ids.split(',').any(|id| id == job.request.id.to_string()))
        && let Some(path) = std::env::var_os("ARKTS_INDEX_TEST_READ_GATE")
    {
        use std::{
            fs,
            time::{Duration, Instant},
        };
        let path = PathBuf::from(path);
        let _ = fs::write(path.with_extension("started"), "read snapshot entered");
        let deadline = Instant::now() + Duration::from_secs(30);
        while !path.is_file() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(5));
        }
        let _ = fs::write(path.with_extension("finished"), "read gate exited");
        if !path.is_file() {
            return Err(arkts_index_core::StoreError::new(
                arkts_index_core::StoreErrorKind::Internal,
                "controlled read gate timed out",
            ));
        }
    }
    let _ = job;
    Ok(())
}

#[cfg(debug_assertions)]
pub(crate) fn fatal_test_gate(id: u64) {
    if std::env::var("ARKTS_INDEX_TEST_READER_FATAL_IDS")
        .ok()
        .is_some_and(|ids| ids.split(',').any(|item| item == id.to_string()))
    {
        if let Some(path) = std::env::var_os("ARKTS_INDEX_TEST_READER_FATAL_GATE") {
            use std::time::{Duration, Instant};
            let path = PathBuf::from(path);
            std::fs::write(
                path.with_extension(format!("{id}.started")),
                "fatal reader entered",
            )
            .unwrap();
            let deadline = Instant::now() + Duration::from_secs(30);
            while !path.is_file() && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(5));
            }
        }
        panic!("controlled reader failure outside the per-query unwind boundary");
    }
}
