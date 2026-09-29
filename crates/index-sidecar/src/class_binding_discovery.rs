//! Bounded lexical discovery, not compiler identity or constructor coverage proof.

#[path = "class_binding_sources.rs"]
mod current_sources;

use std::collections::BTreeSet;

use arkts_index_core::{
    ClassBaseBinding, Document, Position, resolve_class_base_binding_snapshot,
    validate_class_binding_snapshot_uris,
};
use serde::Deserialize;
use serde_json::{Value, json};

use super::{
    ChangedDocument, ProtocolError, ProtocolPosition, Runtime, not_initialized, parse_params,
    protocol_store_error, validate_excluded_uris,
};

const MAX_OVERLAY_BYTES: usize = 2 * 1024 * 1024;
const MAX_OVERLAY_TOTAL_BYTES: usize = 8 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscoveryParams {
    workspace_identity: String,
    expected_generation: u64,
    document_uris: Vec<String>,
    overlays: Vec<ChangedDocument>,
    #[serde(default)]
    source_availability: Vec<SourceAvailability>,
    document_uri: String,
    class_name_position: ProtocolPosition,
}

#[derive(Deserialize)]
#[serde(try_from = "Value")]
struct SourceAvailability {
    uri: String,
    state: SourceAvailabilityState,
}

#[derive(PartialEq)]
enum SourceAvailabilityState {
    Present,
    Absent,
    Unknown,
}

impl TryFrom<Value> for SourceAvailability {
    type Error = &'static str;

    fn try_from(value: Value) -> Result<Self, Self::Error> {
        let source = value
            .as_object()
            .ok_or("sourceAvailability entries must be objects")?;
        let uri = source
            .get("uri")
            .and_then(Value::as_str)
            .ok_or("sourceAvailability uri must be a string")?
            .to_owned();
        let state = match source.get("state").and_then(Value::as_str) {
            Some("present") => SourceAvailabilityState::Present,
            Some("absent") => SourceAvailabilityState::Absent,
            Some("unknown") => SourceAvailabilityState::Unknown,
            _ => return Err("sourceAvailability state must be present, absent or unknown"),
        };
        Ok(Self { uri, state })
    }
}

impl Runtime {
    pub(super) fn class_binding_discovery(
        &mut self,
        params: Value,
    ) -> Result<(Value, bool), ProtocolError> {
        let availability_supplied = params.get("sourceAvailability").is_some();
        let params: DiscoveryParams = parse_params(params)?;
        let workspace_identity = self
            .workspace_identity
            .as_ref()
            .ok_or_else(not_initialized)?;
        if &params.workspace_identity != workspace_identity {
            return Err(ProtocolError::new(
                "workspace_mismatch",
                "class binding query belongs to a different workspace",
            ));
        }
        validate_inputs(&params)?;
        let snapshot = self
            .index
            .as_ref()
            .ok_or_else(not_initialized)?
            .class_binding_snapshot(&params.document_uris)
            .map_err(protocol_store_error)?;
        let overlay_bytes = params
            .overlays
            .iter()
            .map(|overlay| overlay.text.len())
            .sum();
        let overlays = params
            .overlays
            .into_iter()
            .filter(|overlay| {
                !availability_supplied
                    || params.source_availability.iter().any(|source| {
                        source.uri == overlay.uri
                            && source.state == SourceAvailabilityState::Present
                    })
            })
            .map(|overlay| Document::new(overlay.uri, overlay.text))
            .collect::<Vec<_>>();
        let binding = if self.completeness == "ready"
            && self.committed_generation == snapshot.served_generation
            && snapshot.served_generation == params.expected_generation
        {
            let position = Position::new(
                params.class_name_position.line,
                params.class_name_position.character,
            );
            if availability_supplied {
                let sources = current_sources::current_sources(
                    self.workspace_root.as_ref().ok_or_else(not_initialized)?,
                    workspace_identity,
                    &params.source_availability,
                    &overlays,
                    overlay_bytes,
                );
                let absent = params
                    .source_availability
                    .iter()
                    .filter(|source| source.state == SourceAvailabilityState::Absent)
                    .map(|source| source.uri.clone())
                    .collect::<Vec<_>>();
                snapshot.resolve_current_sources(
                    params.expected_generation,
                    &sources,
                    &absent,
                    &params.document_uri,
                    position,
                )
            } else {
                resolve_class_base_binding_snapshot(
                    &snapshot,
                    params.expected_generation,
                    &overlays,
                    &params.document_uri,
                    position,
                )
            }
        } else {
            ClassBaseBinding::Unknown
        };
        Ok((
            json!({
                "workspaceIdentity": workspace_identity,
                "servedGeneration": snapshot.served_generation,
                "completeness": self.completeness,
                "binding": binding_value(binding),
            }),
            false,
        ))
    }
}

fn validate_inputs(params: &DiscoveryParams) -> Result<(), ProtocolError> {
    validate_class_binding_snapshot_uris(&params.document_uris)
        .map_err(|error| ProtocolError::new("invalid_params", error.to_string()))?;
    validate_excluded_uris(&params.document_uris)?;
    if !params.document_uris.contains(&params.document_uri) {
        return Err(ProtocolError::new(
            "invalid_params",
            "documentUri must belong to documentUris",
        ));
    }
    let mut seen = BTreeSet::new();
    let mut bytes = 0usize;
    for overlay in &params.overlays {
        bytes = bytes.saturating_add(overlay.text.len());
        if !seen.insert(&overlay.uri)
            || !params.document_uris.contains(&overlay.uri)
            || overlay.text.len() > MAX_OVERLAY_BYTES
            || bytes > MAX_OVERLAY_TOTAL_BYTES
        {
            return Err(ProtocolError::new(
                "invalid_params",
                "overlays must be unique requested URIs with at most 2 MiB each and 8 MiB total",
            ));
        }
    }
    if params.source_availability.len() > params.document_uris.len() {
        return Err(ProtocolError::new(
            "invalid_params",
            "sourceAvailability must contain at most one entry per requested URI",
        ));
    }
    let mut availability_uris = BTreeSet::new();
    for source in &params.source_availability {
        if !availability_uris.insert(&source.uri)
            || !params.document_uris.contains(&source.uri)
            || (source.state == SourceAvailabilityState::Absent && seen.contains(&source.uri))
        {
            return Err(ProtocolError::new(
                "invalid_params",
                "sourceAvailability must be unique requested URIs and cannot mark an overlay absent",
            ));
        }
    }
    Ok(())
}

fn binding_value(binding: ClassBaseBinding) -> Value {
    match binding {
        ClassBaseBinding::Unknown => json!({ "kind": "unknown" }),
        ClassBaseBinding::NoBase => json!({ "kind": "no-base" }),
        ClassBaseBinding::Resolved {
            declaration_uri,
            name,
            name_range,
            support_uris,
        } => json!({
            "kind": "resolved", "declarationUri": declaration_uri, "name": name,
            "nameRange": { "start": { "line": name_range.start.line, "character": name_range.start.character },
                "end": { "line": name_range.end.line, "character": name_range.end.character } },
            "supportUris": support_uris,
        }),
    }
}
