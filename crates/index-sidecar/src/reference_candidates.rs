use arkts_index_core::{
    IndexState, Position, ReferenceBindingKind, ReferenceBindingResolution,
    ReferenceCandidateQuery, ReferenceSourceResolution,
};
use serde::Deserialize;
use serde_json::{Value, json};

use super::{
    MAX_EXCLUDED_URI_BYTES, MAX_EXCLUDED_URIS, ProtocolError, ProtocolPosition, Runtime,
    not_initialized, parse_params, protocol_store_error, validate_excluded_uris,
};

const MAX_REFERENCE_CANDIDATES: usize = 65_536;
const MAX_REFERENCE_SOURCE_RESOLUTIONS: usize = 4_096;
const MAX_REFERENCE_SOURCE_SPECIFIER_BYTES: usize = 4_096;
const MAX_REFERENCE_SOURCE_RESOLUTION_BYTES: usize = 8 * 1_024 * 1_024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReferenceCandidatesParams {
    declaration_uri: String,
    declaration_position: ProtocolPosition,
    limit: usize,
    #[serde(default)]
    source_resolutions: Vec<ProtocolReferenceSourceResolution>,
    #[serde(default)]
    admitted_root_uris: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProtocolReferenceSourceResolution {
    binding_uri: String,
    source_specifier: String,
    #[serde(default)]
    resolved_source_uri: Option<String>,
    #[serde(default)]
    external_terminal_identity: Option<String>,
}

impl Runtime {
    pub(super) fn reference_candidates(
        &mut self,
        params: Value,
    ) -> Result<(Value, bool), ProtocolError> {
        let params: ReferenceCandidatesParams = parse_params(params)?;
        validate_admitted_root_uris(&params.admitted_root_uris)?;
        if params.declaration_uri.is_empty()
            || params.declaration_uri.len() > MAX_EXCLUDED_URI_BYTES
            || params.limit == 0
            || params.limit > MAX_REFERENCE_CANDIDATES
            || !valid_reference_source_resolutions(&params.source_resolutions)
        {
            return Err(ProtocolError::new(
                "invalid_params",
                format!(
                    "declarationUri must contain 1..={MAX_EXCLUDED_URI_BYTES} UTF-8 bytes \
                     and limit must be in 1..={MAX_REFERENCE_CANDIDATES}; sourceResolutions \
                     must contain bounded binding/specifier pairs with exactly one valid target"
                ),
            ));
        }
        let source_resolutions: Vec<_> = params
            .source_resolutions
            .into_iter()
            .map(|resolution| ReferenceSourceResolution {
                binding_uri: resolution.binding_uri,
                source_specifier: resolution.source_specifier,
                resolved_source_uri: resolution.resolved_source_uri,
                external_terminal_identity: resolution.external_terminal_identity,
            })
            .collect();
        let search_result = self
            .index
            .as_ref()
            .ok_or_else(not_initialized)?
            .search_reference_candidates_with_scope(
                ReferenceCandidateQuery {
                    declaration_uri: params.declaration_uri,
                    declaration_position: Position::new(
                        params.declaration_position.line,
                        params.declaration_position.character,
                    ),
                    limit: params.limit,
                },
                &source_resolutions,
                &params.admitted_root_uris,
            );
        let result = match search_result {
            Ok(result) => result,
            Err(error) => {
                self.state = IndexState::Degraded;
                self.completeness = "stale";
                return Err(protocol_store_error(error));
            }
        };
        let bindings: Vec<_> = result
            .bindings
            .into_iter()
            .map(|binding| {
                let mut value = json!({
                    "kind": reference_binding_kind_name(binding.kind),
                    "uri": binding.uri,
                    "importedName": binding.imported_name,
                    "localName": binding.local_name,
                    "sourceSpecifier": binding.source_specifier,
                    "sourceResolution": reference_binding_resolution_name(
                        binding.source_resolution,
                    ),
                    "resolvedSourceUri": binding.resolved_source_uri,
                });
                if let Some(identity) = binding.external_terminal_identity {
                    value["externalTerminalIdentity"] = json!(identity);
                }
                value
            })
            .collect();
        Ok((
            json!({
                "supported": result.supported,
                "complete": result.complete && self.completeness == "ready",
                "identityComplete": result.identity_complete
                    && self.completeness == "ready",
                "identityUris": result.identity_uris,
                "narrowedUris": result.narrowed_uris,
                "declarationUri": result.declaration_uri,
                "declarationIdentity": result.declaration_identity,
                "names": result.names,
                "uris": result.uris,
                "bindings": bindings,
                "servedGeneration": result.served_generation,
                "completeness": self.completeness,
            }),
            false,
        ))
    }
}

fn valid_reference_source_resolutions(resolutions: &[ProtocolReferenceSourceResolution]) -> bool {
    if resolutions.len() > MAX_REFERENCE_SOURCE_RESOLUTIONS {
        return false;
    }
    let mut total_bytes = 0usize;
    for resolution in resolutions {
        if resolution.binding_uri.is_empty()
            || resolution.binding_uri.len() > MAX_EXCLUDED_URI_BYTES
            || resolution.source_specifier.is_empty()
            || resolution.source_specifier.len() > MAX_REFERENCE_SOURCE_SPECIFIER_BYTES
        {
            return false;
        }
        let valid_target = match (
            resolution.resolved_source_uri.as_deref(),
            resolution.external_terminal_identity.as_deref(),
        ) {
            (Some(uri), None) => !uri.is_empty() && uri.len() <= MAX_EXCLUDED_URI_BYTES,
            (None, Some(identity)) => {
                valid_external_terminal_identity(identity)
                    && valid_sdk_module_specifier(&resolution.source_specifier)
            }
            _ => false,
        };
        if !valid_target {
            return false;
        }
        total_bytes = total_bytes
            .saturating_add(resolution.binding_uri.len())
            .saturating_add(resolution.source_specifier.len())
            .saturating_add(
                resolution
                    .resolved_source_uri
                    .as_ref()
                    .map_or(0, String::len),
            )
            .saturating_add(
                resolution
                    .external_terminal_identity
                    .as_ref()
                    .map_or(0, String::len),
            );
        if total_bytes > MAX_REFERENCE_SOURCE_RESOLUTION_BYTES {
            return false;
        }
    }
    true
}

fn valid_external_terminal_identity(identity: &str) -> bool {
    identity.len() == 68
        && identity.starts_with("sdk:")
        && identity[4..]
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn valid_sdk_module_specifier(specifier: &str) -> bool {
    !specifier.contains(['/', '\\'])
        && (specifier.starts_with("@ohos.")
            || specifier.starts_with("@system.")
            || specifier.starts_with("@kit.")
            || specifier.starts_with("@arkts."))
}

fn validate_admitted_root_uris(uris: &[String]) -> Result<(), ProtocolError> {
    validate_excluded_uris(uris).map_err(|_| {
        ProtocolError::new(
            "invalid_params",
            format!(
                "admittedRootUris must contain at most {MAX_EXCLUDED_URIS} bounded URI entries"
            ),
        )
    })?;
    if uris.iter().any(|uri| !uri.starts_with("file://")) {
        return Err(ProtocolError::new(
            "invalid_params",
            "each admittedRootUris entry must be a file URI",
        ));
    }
    Ok(())
}

fn reference_binding_kind_name(kind: ReferenceBindingKind) -> &'static str {
    match kind {
        ReferenceBindingKind::Import => "import",
        ReferenceBindingKind::ReExport => "reexport",
    }
}

fn reference_binding_resolution_name(resolution: ReferenceBindingResolution) -> &'static str {
    match resolution {
        ReferenceBindingResolution::Unique => "unique",
        ReferenceBindingResolution::External => "external",
        ReferenceBindingResolution::Unresolved => "unresolved",
        ReferenceBindingResolution::Ambiguous => "ambiguous",
        ReferenceBindingResolution::Unsupported => "unsupported",
    }
}
