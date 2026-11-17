mod catalog;
mod maintenance;
mod maintenance_engine;
mod maintenance_fact_batch;
mod maintenance_file_engine;
mod maintenance_file_input;
mod maintenance_pending;
mod managed_cache_admission;
mod protocol;
mod read_query;
mod read_runtime;
mod reader;
mod reader_worker;
mod server_loop;
mod source_scope;
mod workspace_runtime;
use server_loop::run;
mod stdio;
use stdio::{InputUpdate, spawn_input_reader, write_response};
mod cache_cli;
mod catalog_runtime;
mod class_binding_discovery;
mod reference_candidates;

use std::{
    fs, io,
    path::PathBuf,
    sync::{
        Mutex,
        mpsc::{self, Sender},
    },
    time::{Duration, Instant},
};

use arkts_index_core::{
    Document, IndexState, StoreError, StoreErrorKind, SymbolKind, WorkspaceIndex,
};
use arkts_index_sqlite::{CatalogStore, workspace_cache_location};
use catalog::{CatalogControl, CatalogProgress, CatalogUpdate, spawn_catalog};
use serde::Deserialize;
use serde_json::{Value, json};

const PROTOCOL_VERSION: u32 = 1;
const MAX_EXCLUDED_URIS: usize = 256;
const MAX_EXCLUDED_URI_BYTES: usize = 4_096;
const MAX_EXCLUDED_URI_TOTAL_BYTES: usize = 64 * 1_024;
const CATALOG_HEARTBEAT_INTERVAL: Duration = Duration::from_millis(250);

use protocol::*;
struct Runtime {
    index: Option<WorkspaceIndex>,
    maintenance: Option<maintenance::Maintenance>,
    readers: Option<reader::Readers>,
    workspace_root: Option<PathBuf>,
    database_path: Option<PathBuf>,
    workspace_identity: Option<String>,
    managed_cache: Option<arkts_index_sqlite::cache_gc::namespace::ManagedCacheNamespace>,
    state: IndexState,
    committed_generation: u64,
    completeness: &'static str,
    rejected_count: usize,
    phase: &'static str,
    building_generation: Option<u64>,
    next_catalog_generation: u64,
    catalog: Option<ActiveCatalog>,
    progress: CatalogProgress,
    message: Option<String>,
}

struct ActiveCatalog {
    generation: u64,
    control: CatalogControl,
}

impl Default for Runtime {
    fn default() -> Self {
        Self {
            index: None,
            maintenance: None,
            readers: None,
            workspace_root: None,
            database_path: None,
            workspace_identity: None,
            managed_cache: None,
            state: IndexState::Warming,
            committed_generation: 0,
            completeness: "stale",
            rejected_count: 0,
            phase: "idle",
            building_generation: None,
            next_catalog_generation: 1,
            catalog: None,
            progress: CatalogProgress::default(),
            message: None,
        }
    }
}

impl Runtime {
    fn legacy_read(&mut self, method: &str, params: Value) -> Result<Value, ProtocolError> {
        managed_cache_admission::protocol(self.managed_cache.as_ref())?;
        let context = read_query::ReadContext {
            store: self.index.as_ref().map(WorkspaceIndex::read_store),
            root: self.workspace_root.as_deref(),
            identity: self.workspace_identity.as_deref(),
            completeness: self.completeness,
            head: self.committed_generation,
        };
        let result = context.dispatch(method, params);
        if method != "class-bindings/resolve" && result.as_ref().is_err_and(|e| e.store_failure) {
            self.state = IndexState::Degraded;
            self.completeness = "stale";
        }
        result
    }
    fn dispatch(
        &mut self,
        request: Request,
        catalog_updates: &Sender<CatalogUpdate>,
    ) -> Result<(Value, bool), ProtocolError> {
        if matches!(
            request.method.as_str(),
            "refresh" | "catalog/start" | "maintenance/start" | "maintenance/changes"
        ) {
            managed_cache_admission::protocol(self.managed_cache.as_ref())?;
        }
        match request.method.as_str() {
            "index/cancel" | "index/reader-status" => self
                .read_control(&request.method, request.params)
                .map(|v| (v, false)),
            "health" => Ok((
                json!({"protocolVersion": PROTOCOL_VERSION, "status": self.status()}),
                false,
            )),
            "initialize" => self.initialize_workspace(parse_params(request.params)?),
            "refresh" => {
                if self.maintenance.is_some() {
                    return Err(ProtocolError::new(
                        "incompatible",
                        "versioned clients must use maintenance updates",
                    ));
                }
                let params: RefreshParams = parse_params(request.params)?;
                if self.catalog.is_some() {
                    return Err(ProtocolError::new(
                        "busy",
                        "refresh cannot commit while a full catalog is active",
                    ));
                }
                let removed_uris: Vec<_> = params.removed_uris.iter().map(String::as_str).collect();
                let documents = params
                    .changed
                    .into_iter()
                    .map(|document| Document::new(document.uri, document.text));
                let refresh_result = self.index.as_mut().ok_or_else(not_initialized)?.refresh(
                    params.generation,
                    documents,
                    &removed_uris,
                );
                let report = match refresh_result {
                    Ok(report) => report,
                    Err(error) => {
                        self.state = IndexState::Degraded;
                        self.completeness = "stale";
                        return Err(protocol_store_error(error));
                    }
                };
                self.committed_generation = report.committed_generation;
                self.next_catalog_generation = self
                    .next_catalog_generation
                    .max(self.committed_generation.saturating_add(1));
                self.state = report.state;
                self.rejected_count = report.rejected_documents.len();
                self.completeness = if self.state == IndexState::Ready {
                    "ready"
                } else {
                    "partial"
                };
                Ok((
                    json!({
                        "status": self.status(),
                        "rejectedDocuments": report.rejected_documents,
                    }),
                    false,
                ))
            }
            "search" | "exports/search" | "references/candidates" | "class-bindings/resolve" => {
                self.legacy_read(&request.method, request.params)
                    .map(|v| (v, false))
            }
            "catalog/start" => {
                if self.maintenance.is_some() {
                    return Err(ProtocolError::new(
                        "incompatible",
                        "versioned clients must use maintenance/start",
                    ));
                }
                let params: CatalogStartParams = parse_params(request.params)?;
                if let Some(active) = &self.catalog {
                    return Ok((
                        json!({
                            "accepted": false,
                            "generation": active.generation,
                            "status": self.status(),
                        }),
                        false,
                    ));
                }
                let workspace_root = self.workspace_root.clone().ok_or_else(not_initialized)?;
                let database_path = self.database_path.clone().ok_or_else(not_initialized)?;
                let workspace_identity = self
                    .workspace_identity
                    .clone()
                    .ok_or_else(not_initialized)?;
                let current = self
                    .index
                    .as_ref()
                    .ok_or_else(not_initialized)?
                    .metadata()
                    .map_err(protocol_store_error)?
                    .committed_generation;
                let generation = self.next_catalog_generation.max(current.saturating_add(1));
                self.next_catalog_generation = generation.saturating_add(1);
                self.phase = "discovering";
                self.building_generation = Some(generation);
                self.progress = CatalogProgress::default();
                self.message = None;
                let control = spawn_catalog(
                    workspace_root,
                    database_path,
                    workspace_identity,
                    generation,
                    params.force,
                    catalog_updates.clone(),
                    self.managed_cache.clone(),
                );
                self.catalog = Some(ActiveCatalog {
                    generation,
                    control,
                });
                Ok((
                    json!({
                        "accepted": true,
                        "generation": generation,
                        "status": self.status(),
                    }),
                    false,
                ))
            }
            "catalog/cancel" => {
                let params: CatalogCancelParams = parse_params(request.params)?;
                let cancelled = self
                    .catalog
                    .as_ref()
                    .filter(|active| active.generation == params.generation)
                    .is_some_and(|active| active.control.cancel());
                if cancelled {
                    self.phase = "cancelling";
                }
                Ok((
                    json!({
                        "cancelled": cancelled,
                        "generation": params.generation,
                        "status": self.status(),
                    }),
                    false,
                ))
            }
            "cache/namespace" => {
                if request.params != json!({}) {
                    return Err(ProtocolError::new(
                        "invalid_params",
                        "cache namespace takes no parameters",
                    ));
                }
                let proof = self.managed_cache.as_ref().ok_or_else(|| {
                    ProtocolError::new("uninitialized", "no opened managed cache namespace")
                })?;
                proof
                    .validate()
                    .map_err(|message| ProtocolError::new("cache_namespace_changed", message))?;
                Ok((json!(proof), false))
            }
            "status" => Ok((self.status(), false)),
            "shutdown" => {
                if let Some(readers) = self.readers.as_mut() {
                    readers.close_clients();
                }
                if let Some(active) = &self.catalog {
                    active.control.cancel();
                }
                Ok((json!({}), true))
            }
            method if method.starts_with("maintenance/") => {
                let result = self
                    .maintenance
                    .as_mut()
                    .ok_or_else(|| {
                        ProtocolError::new(
                            "incompatible",
                            "maintenance capability was not negotiated",
                        )
                    })?
                    .dispatch(method, request.params)?;
                if matches!(method, "maintenance/changes" | "maintenance/start")
                    && result["accepted"] == true
                {
                    self.state = IndexState::Warming;
                    self.completeness = "stale";
                    let input = self.maintenance.as_ref().and_then(|m| m.observed_input());
                    if let Some(readers) = self.readers.as_mut() {
                        readers.invalidate(input);
                    }
                }
                Ok((result, false))
            }
            _ => Err(ProtocolError::new(
                "method_not_found",
                format!("unknown sidecar method {}", request.method),
            )),
        }
    }
}

fn main() {
    if let Err(error) = cache_cli::run().unwrap_or_else(run) {
        eprintln!("arkts-index-sidecar: {error}");
        std::process::exit(1);
    }
}

fn parse_params<T: for<'de> Deserialize<'de>>(value: Value) -> Result<T, ProtocolError> {
    serde_json::from_value(value)
        .map_err(|error| ProtocolError::new("invalid_params", error.to_string()))
}

fn validate_excluded_uris(uris: &[String]) -> Result<(), ProtocolError> {
    if uris.len() > MAX_EXCLUDED_URIS {
        return Err(ProtocolError::new(
            "invalid_params",
            format!("excludedUris must contain at most {MAX_EXCLUDED_URIS} entries"),
        ));
    }
    let mut total_bytes = 0usize;
    for uri in uris {
        if uri.is_empty() || uri.len() > MAX_EXCLUDED_URI_BYTES {
            return Err(ProtocolError::new(
                "invalid_params",
                format!(
                    "each excludedUris entry must contain 1..={MAX_EXCLUDED_URI_BYTES} UTF-8 bytes"
                ),
            ));
        }
        total_bytes = total_bytes.saturating_add(uri.len());
        if total_bytes > MAX_EXCLUDED_URI_TOTAL_BYTES {
            return Err(ProtocolError::new(
                "invalid_params",
                format!(
                    "excludedUris must contain at most {MAX_EXCLUDED_URI_TOTAL_BYTES} UTF-8 bytes"
                ),
            ));
        }
    }
    Ok(())
}

fn protocol_store_error(error: StoreError) -> ProtocolError {
    let code = match error.kind() {
        StoreErrorKind::Busy => "busy",
        StoreErrorKind::Cancelled => "cancelled",
        StoreErrorKind::Corrupt => "corrupt",
        StoreErrorKind::Incompatible => "incompatible",
        StoreErrorKind::MigrationRequired => "migration_required",
        StoreErrorKind::ProducerSuperseded => "producer_superseded",
        StoreErrorKind::WorkspaceMismatch => "workspace_mismatch",
        StoreErrorKind::InvalidData => "invalid_data",
        StoreErrorKind::InvalidGeneration => "invalid_generation",
        StoreErrorKind::Io => "io",
        StoreErrorKind::Internal => "internal",
    };
    ProtocolError {
        code,
        message: error.to_string(),
        store_failure: !matches!(
            error.kind(),
            StoreErrorKind::MigrationRequired | StoreErrorKind::ProducerSuperseded
        ),
    }
}

fn not_initialized() -> ProtocolError {
    ProtocolError::new(
        "not_initialized",
        "initialize must succeed before this method",
    )
}

fn state_name(state: IndexState) -> &'static str {
    match state {
        IndexState::Warming => "warming",
        IndexState::Ready => "ready",
        IndexState::Degraded => "degraded",
    }
}

fn symbol_kind_name(kind: SymbolKind) -> &'static str {
    match kind {
        SymbolKind::Class => "class",
        SymbolKind::Struct => "struct",
        SymbolKind::Enum => "enum",
        SymbolKind::Interface => "interface",
        SymbolKind::TypeAlias => "type",
        SymbolKind::Function => "function",
        SymbolKind::Method => "method",
        SymbolKind::Variable => "variable",
        SymbolKind::Namespace => "module",
    }
}
