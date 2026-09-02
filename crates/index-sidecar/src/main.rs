mod catalog;

use std::{
    fs,
    io::{self, BufRead, Write},
    path::PathBuf,
    sync::{
        Mutex,
        mpsc::{self, Sender},
    },
    thread,
    time::{Duration, Instant},
};

use arkts_index_core::{
    Document, IndexState, StoreError, StoreErrorKind, SymbolKind, WorkspaceIndex,
};
use arkts_index_sqlite::{SqliteStore, workspace_cache_location};
use catalog::{CatalogControl, CatalogProgress, CatalogUpdate, spawn_catalog};
use serde::Deserialize;
use serde_json::{Value, json};

const PROTOCOL_VERSION: u32 = 1;
const MAX_EXCLUDED_URIS: usize = 256;
const MAX_EXCLUDED_URI_BYTES: usize = 4_096;
const MAX_EXCLUDED_URI_TOTAL_BYTES: usize = 64 * 1_024;
const CATALOG_HEARTBEAT_INTERVAL: Duration = Duration::from_millis(250);

#[derive(Deserialize)]
struct Request {
    protocol: u32,
    id: u64,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InitializeParams {
    workspace_root: PathBuf,
    cache_directory: PathBuf,
}

#[derive(Deserialize)]
struct ChangedDocument {
    uri: String,
    text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RefreshParams {
    generation: u64,
    changed: Vec<ChangedDocument>,
    #[serde(default)]
    removed_uris: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchParams {
    query: String,
    limit: usize,
    #[serde(default)]
    excluded_uris: Vec<String>,
}

#[derive(Deserialize)]
struct CatalogStartParams {
    #[serde(rename = "reason")]
    _reason: String,
    #[serde(rename = "force")]
    _force: bool,
}

#[derive(Deserialize)]
struct CatalogCancelParams {
    generation: u64,
}

struct ProtocolError {
    code: &'static str,
    message: String,
}

impl ProtocolError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

struct Runtime {
    index: Option<WorkspaceIndex>,
    workspace_root: Option<PathBuf>,
    database_path: Option<PathBuf>,
    workspace_identity: Option<String>,
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
            workspace_root: None,
            database_path: None,
            workspace_identity: None,
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
    fn dispatch(
        &mut self,
        request: Request,
        catalog_updates: &Sender<CatalogUpdate>,
    ) -> Result<(Value, bool), ProtocolError> {
        match request.method.as_str() {
            "health" => Ok((
                json!({"protocolVersion": PROTOCOL_VERSION, "status": self.status()}),
                false,
            )),
            "initialize" => {
                let params: InitializeParams = parse_params(request.params)?;
                if self.catalog.is_some() {
                    return Err(ProtocolError::new(
                        "busy",
                        "initialize cannot replace a workspace while its catalog is active",
                    ));
                }
                let workspace_root = fs::canonicalize(&params.workspace_root).map_err(|error| {
                    ProtocolError::new(
                        "io",
                        format!("failed to canonicalize workspace root: {error}"),
                    )
                })?;
                let cache = workspace_cache_location(&params.cache_directory, &workspace_root)
                    .map_err(protocol_store_error)?;
                let store = SqliteStore::open(&cache.database_path, &cache.workspace_identity)
                    .map_err(protocol_store_error)?;
                let index = WorkspaceIndex::with_store(store);
                let metadata = index.metadata().map_err(protocol_store_error)?;
                self.committed_generation = metadata.committed_generation;
                self.state = IndexState::Warming;
                self.completeness = "stale";
                self.rejected_count = metadata.rejected_documents.len();
                self.workspace_root = Some(workspace_root);
                self.database_path = Some(cache.database_path);
                self.workspace_identity = Some(cache.workspace_identity.clone());
                self.phase = "idle";
                self.building_generation = None;
                self.next_catalog_generation = self.committed_generation.saturating_add(1);
                self.progress = CatalogProgress::default();
                self.message = None;
                self.index = Some(index);
                Ok((
                    json!({
                        "workspaceIdentity": cache.workspace_identity,
                        "status": self.status(),
                    }),
                    false,
                ))
            }
            "refresh" => {
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
            "search" => {
                let params: SearchParams = parse_params(request.params)?;
                validate_excluded_uris(&params.excluded_uris)?;
                let search_result = self
                    .index
                    .as_ref()
                    .ok_or_else(not_initialized)?
                    .search_excluding(&params.query, params.limit, &params.excluded_uris);
                let result = match search_result {
                    Ok(result) => result,
                    Err(error) => {
                        self.state = IndexState::Degraded;
                        self.completeness = "stale";
                        return Err(protocol_store_error(error));
                    }
                };
                let items: Vec<_> = result
                    .items
                    .into_iter()
                    .map(|symbol| {
                        let mut item = json!({
                            "name": symbol.name,
                            "kind": symbol_kind_name(symbol.kind),
                            "uri": symbol.uri,
                            "range": {
                                "start": {
                                    "line": symbol.range.start.line,
                                    "character": symbol.range.start.character,
                                },
                                "end": {
                                    "line": symbol.range.end.line,
                                    "character": symbol.range.end.character,
                                },
                            },
                        });
                        if let Some(container) = symbol.container {
                            item["containerName"] = json!(container);
                        }
                        item
                    })
                    .collect();
                Ok((
                    json!({
                        "items": items,
                        "servedGeneration": result.served_generation,
                        "completeness": self.completeness,
                    }),
                    false,
                ))
            }
            "catalog/start" => {
                let _params: CatalogStartParams = parse_params(request.params)?;
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
                let generation = self.next_catalog_generation;
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
                    catalog_updates.clone(),
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
            "status" => Ok((self.status(), false)),
            "shutdown" => {
                if let Some(active) = &self.catalog {
                    active.control.cancel();
                }
                Ok((json!({}), true))
            }
            _ => Err(ProtocolError::new(
                "method_not_found",
                format!("unknown sidecar method {}", request.method),
            )),
        }
    }

    fn handle_catalog_update(&mut self, update: CatalogUpdate) -> Option<Value> {
        match update {
            CatalogUpdate::Progress {
                generation,
                progress,
            } if self.is_active_catalog(generation) => {
                self.progress = progress;
            }
            CatalogUpdate::Activating {
                generation,
                progress,
            } if self.is_active_catalog(generation) => {
                self.progress = progress;
                self.phase = "activating";
            }
            CatalogUpdate::Complete {
                generation,
                report,
                progress,
            } if self.is_active_catalog(generation) => {
                self.progress = progress;
                self.catalog = None;
                self.building_generation = None;
                self.committed_generation = report.committed_generation;
                self.rejected_count = report.rejected_documents.len();
                if self.progress.rejected > 0 {
                    self.phase = "degraded";
                    self.state = IndexState::Degraded;
                    self.completeness = "partial";
                } else if self.progress.policy_skipped > 0 {
                    self.phase = "partial";
                    self.state = IndexState::Ready;
                    self.completeness = "partial";
                } else {
                    self.phase = "ready";
                    self.state = IndexState::Ready;
                    self.completeness = "ready";
                }
            }
            CatalogUpdate::Cancelled {
                generation,
                progress,
            } if self.is_active_catalog(generation) => {
                self.progress = progress;
                self.phase = "cancelled";
                self.catalog = None;
                self.building_generation = None;
            }
            CatalogUpdate::Failed {
                generation,
                progress,
                message,
            } if self.is_active_catalog(generation) => {
                self.progress = progress;
                self.phase = "degraded";
                self.state = IndexState::Degraded;
                self.completeness = "stale";
                self.catalog = None;
                self.building_generation = None;
                self.message = Some(message);
            }
            _ => return None,
        }
        Some(self.catalog_progress_event())
    }

    fn is_active_catalog(&self, generation: u64) -> bool {
        self.catalog
            .as_ref()
            .is_some_and(|active| active.generation == generation)
    }

    fn catalog_progress_event(&self) -> Value {
        json!({
            "protocol": PROTOCOL_VERSION,
            "event": "catalog/progress",
            "params": {
                "workspaceIdentity": self.workspace_identity,
                "status": self.status(),
            },
        })
    }

    fn status(&self) -> Value {
        let mut status = json!({
            "state": state_name(self.state),
            "committedGeneration": self.committed_generation,
            "completeness": self.completeness,
            "rejectedCount": self.rejected_count,
            "phase": self.phase,
            "buildingGeneration": self.building_generation,
            "discovered": self.progress.discovered,
            "indexed": self.progress.indexed,
            "rejected": self.progress.rejected,
            "policySkipped": self.progress.policy_skipped,
            "ignored": self.progress.ignored,
        });
        if let Some(total_files) = self.progress.total_files {
            status["totalFiles"] = json!(total_files);
        }
        if let Some(message) = &self.message {
            status["message"] = json!(message);
        }
        status
    }
}

fn main() {
    if let Err(error) = run() {
        eprintln!("arkts-index-sidecar: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let stdout = Mutex::new(io::stdout());
    let (input_sender, input_receiver) = mpsc::channel();
    spawn_input_reader(input_sender)?;
    let (catalog_sender, catalog_receiver) = mpsc::channel();
    let mut runtime = Runtime::default();
    let mut last_catalog_event = Instant::now();

    'server: loop {
        while let Ok(update) = catalog_receiver.try_recv() {
            if let Some(event) = runtime.handle_catalog_update(update) {
                write_response(&stdout, event)?;
                last_catalog_event = Instant::now();
            }
        }
        if runtime.catalog.is_some() && last_catalog_event.elapsed() >= CATALOG_HEARTBEAT_INTERVAL {
            write_response(&stdout, runtime.catalog_progress_event())?;
            last_catalog_event = Instant::now();
        }

        let input = match input_receiver.recv_timeout(Duration::from_millis(10)) {
            Ok(input) => input,
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        };
        let line = match input {
            InputUpdate::Line(line) => line,
            InputUpdate::End => break,
            InputUpdate::Error(message) => return Err(message),
        };
        if line.trim().is_empty() {
            continue;
        }
        let request: Request = match serde_json::from_str(&line) {
            Ok(request) => request,
            Err(error) => {
                write_response(
                    &stdout,
                    json!({
                        "protocol": PROTOCOL_VERSION,
                        "id": null,
                        "ok": false,
                        "error": {"code": "invalid_request", "message": error.to_string()},
                    }),
                )?;
                continue;
            }
        };
        let id = request.id;
        let dispatched = if request.protocol == PROTOCOL_VERSION {
            runtime.dispatch(request, &catalog_sender)
        } else {
            Err(ProtocolError::new(
                "protocol_mismatch",
                format!(
                    "client protocol {} is incompatible with sidecar protocol {PROTOCOL_VERSION}",
                    request.protocol
                ),
            ))
        };
        let (response, shutdown) = match dispatched {
            Ok((result, shutdown)) => (
                json!({
                    "protocol": PROTOCOL_VERSION,
                    "id": id,
                    "ok": true,
                    "result": result,
                }),
                shutdown,
            ),
            Err(error) => (
                json!({
                    "protocol": PROTOCOL_VERSION,
                    "id": id,
                    "ok": false,
                    "error": {"code": error.code, "message": error.message},
                }),
                false,
            ),
        };
        write_response(&stdout, response)?;
        if shutdown {
            break 'server;
        }
    }
    if let Some(active) = &runtime.catalog {
        active.control.cancel();
    }
    Ok(())
}

enum InputUpdate {
    Line(String),
    End,
    Error(String),
}

fn spawn_input_reader(sender: Sender<InputUpdate>) -> Result<(), String> {
    thread::Builder::new()
        .name("arkts-sidecar-stdin".to_owned())
        .spawn(move || {
            let stdin = io::stdin();
            for line in stdin.lock().lines() {
                match line {
                    Ok(line) => {
                        if sender.send(InputUpdate::Line(line)).is_err() {
                            return;
                        }
                    }
                    Err(error) => {
                        let _ = sender
                            .send(InputUpdate::Error(format!("failed to read stdin: {error}")));
                        return;
                    }
                }
            }
            let _ = sender.send(InputUpdate::End);
        })
        .map(|_| ())
        .map_err(|error| format!("failed to spawn stdin reader: {error}"))
}

fn write_response(writer: &Mutex<impl Write>, response: Value) -> Result<(), String> {
    let mut writer = writer
        .lock()
        .map_err(|_| "stdout writer mutex is poisoned".to_owned())?;
    serde_json::to_writer(&mut *writer, &response)
        .map_err(|error| format!("failed to serialize response: {error}"))?;
    writer
        .write_all(b"\n")
        .and_then(|()| writer.flush())
        .map_err(|error| format!("failed to write response: {error}"))
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
        StoreErrorKind::Corrupt => "corrupt",
        StoreErrorKind::Incompatible => "incompatible",
        StoreErrorKind::WorkspaceMismatch => "workspace_mismatch",
        StoreErrorKind::InvalidData => "invalid_data",
        StoreErrorKind::InvalidGeneration => "invalid_generation",
        StoreErrorKind::Io => "io",
        StoreErrorKind::Internal => "internal",
    };
    ProtocolError::new(code, error.to_string())
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
        SymbolKind::Function => "function",
        SymbolKind::Method => "method",
    }
}
