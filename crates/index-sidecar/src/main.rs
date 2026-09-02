use std::{
    io::{self, BufRead, Write},
    path::PathBuf,
};

use arkts_index_core::{
    Document, IndexState, StoreError, StoreErrorKind, SymbolKind, WorkspaceIndex,
};
use arkts_index_sqlite::{SqliteStore, workspace_cache_location};
use serde::Deserialize;
use serde_json::{Value, json};

const PROTOCOL_VERSION: u32 = 1;

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
struct SearchParams {
    query: String,
    limit: usize,
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
    state: IndexState,
    committed_generation: u64,
    completeness: &'static str,
    rejected_count: usize,
}

impl Default for Runtime {
    fn default() -> Self {
        Self {
            index: None,
            state: IndexState::Warming,
            committed_generation: 0,
            completeness: "stale",
            rejected_count: 0,
        }
    }
}

impl Runtime {
    fn dispatch(&mut self, request: Request) -> Result<(Value, bool), ProtocolError> {
        match request.method.as_str() {
            "health" => Ok((
                json!({"protocolVersion": PROTOCOL_VERSION, "status": self.status()}),
                false,
            )),
            "initialize" => {
                let params: InitializeParams = parse_params(request.params)?;
                let cache =
                    workspace_cache_location(&params.cache_directory, &params.workspace_root)
                        .map_err(protocol_store_error)?;
                let store = SqliteStore::open(&cache.database_path, &cache.workspace_identity)
                    .map_err(protocol_store_error)?;
                let index = WorkspaceIndex::with_store(store);
                let metadata = index.metadata().map_err(protocol_store_error)?;
                self.committed_generation = metadata.committed_generation;
                self.state = IndexState::Warming;
                self.completeness = "stale";
                self.rejected_count = 0;
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
                let search_result = self
                    .index
                    .as_ref()
                    .ok_or_else(not_initialized)?
                    .search(&params.query, params.limit);
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
                        json!({
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
                            "containerName": symbol.container,
                        })
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
            "status" => Ok((self.status(), false)),
            "shutdown" => Ok((json!({}), true)),
            _ => Err(ProtocolError::new(
                "method_not_found",
                format!("unknown sidecar method {}", request.method),
            )),
        }
    }

    fn status(&self) -> Value {
        json!({
            "state": state_name(self.state),
            "committedGeneration": self.committed_generation,
            "completeness": self.completeness,
            "rejectedCount": self.rejected_count,
        })
    }
}

fn main() {
    if let Err(error) = run() {
        eprintln!("arkts-index-sidecar: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();
    let mut runtime = Runtime::default();

    for line in stdin.lock().lines() {
        let line = line.map_err(|error| format!("failed to read stdin: {error}"))?;
        if line.trim().is_empty() {
            continue;
        }
        let request: Request = match serde_json::from_str(&line) {
            Ok(request) => request,
            Err(error) => {
                write_response(
                    &mut stdout,
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
            runtime.dispatch(request)
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
        write_response(&mut stdout, response)?;
        if shutdown {
            break;
        }
    }
    Ok(())
}

fn write_response(writer: &mut impl Write, response: Value) -> Result<(), String> {
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
