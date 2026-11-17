//! One set of read validation/serialization for legacy and snapshot readers.
use crate::{
    not_initialized, parse_params, protocol::*, protocol_store_error, symbol_kind_name,
    validate_excluded_uris,
};
use arkts_index_core::SymbolStore;
use serde_json::{Value, json};
use std::path::Path;
pub(crate) struct ReadContext<'a> {
    pub store: Option<&'a dyn SymbolStore>,
    pub root: Option<&'a Path>,
    pub identity: Option<&'a str>,
    pub completeness: &'a str,
    pub head: u64,
}
impl ReadContext<'_> {
    pub fn store(&self) -> Result<&dyn SymbolStore, ProtocolError> {
        self.store.ok_or_else(not_initialized)
    }
    pub fn dispatch(&self, method: &str, params: Value) -> Result<Value, ProtocolError> {
        match method {
            "index/status" => {
                let metadata = self.store()?.metadata().map_err(protocol_store_error)?;
                Ok(
                    json!({"statusScope":"data","state":if self.completeness=="ready" {"ready"}else{"warming"},"completeness":self.completeness,"committedGeneration":metadata.committed_generation,"rejectedCount":metadata.rejected_documents.len()}),
                )
            }
            "search" => {
                let params: SearchParams = parse_params(params)?;
                validate_excluded_uris(&params.excluded_uris)?;
                let search_result = self.store()?.search(
                    &arkts_index_core::SymbolQuery::new(&params.query, params.limit)
                        .excluding_uris(params.excluded_uris),
                );
                let result = search_result.map_err(protocol_store_error)?;
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
                Ok(json!({
                    "items": items,
                    "servedGeneration": result.served_generation,
                    "completeness": self.completeness,
                }))
            }
            "exports/search" => {
                let params: SearchParams = parse_params(params)?;
                let search_result =
                    self.store()?
                        .search_exports(&arkts_index_core::ExportQuery::new(
                            &params.query,
                            params.limit,
                        ));
                let result = search_result.map_err(protocol_store_error)?;
                let items: Vec<_> = result
                    .items
                    .into_iter()
                    .map(|export| {
                        let mut item = json!({
                            "exportedName": export.exported_name,
                            "kind": symbol_kind_name(export.kind),
                            "uri": export.uri,
                            "ordinal": export.ordinal,
                            "range": {
                                "start": {
                                    "line": export.range.start.line,
                                    "character": export.range.start.character,
                                },
                                "end": {
                                    "line": export.range.end.line,
                                    "character": export.range.end.character,
                                },
                            },
                        });
                        for (name, value) in [
                            ("declarationIdentity", export.declaration_identity),
                            ("importSpecifier", export.import_specifier),
                            ("moduleId", export.module_id),
                            ("targetScope", export.target_scope),
                        ] {
                            if let Some(value) = value {
                                item[name] = json!(value);
                            }
                        }
                        item
                    })
                    .collect();
                Ok(json!({
                    "items": items,
                    "servedGeneration": result.served_generation,
                    "completeness": self.completeness,
                }))
            }

            "references/candidates" => self.reference_candidates(params),
            "class-bindings/resolve" => self.class_binding_discovery(params),
            _ => Err(ProtocolError::new(
                "method_not_found",
                "unknown read method",
            )),
        }
    }
}
