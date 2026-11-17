use serde::Deserialize;
use serde_json::Value;
use std::path::PathBuf;
#[derive(Deserialize)]
pub(crate) struct Request {
    pub(crate) protocol: u32,
    pub(crate) id: u64,
    pub(crate) method: String,
    #[serde(default)]
    pub(crate) params: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InitializeParams {
    pub(crate) workspace_root: PathBuf,
    pub(crate) cache_directory: PathBuf,
    #[serde(default)]
    pub(crate) capabilities: Vec<String>,
}

#[derive(Deserialize)]
pub(crate) struct ChangedDocument {
    pub(crate) uri: String,
    pub(crate) text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RefreshParams {
    pub(crate) generation: u64,
    pub(crate) changed: Vec<ChangedDocument>,
    #[serde(default)]
    pub(crate) removed_uris: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SearchParams {
    pub(crate) query: String,
    pub(crate) limit: usize,
    #[serde(default)]
    pub(crate) excluded_uris: Vec<String>,
}

#[derive(Deserialize)]
pub(crate) struct ProtocolPosition {
    pub(crate) line: u32,
    pub(crate) character: u32,
}

#[derive(Deserialize)]
pub(crate) struct CatalogStartParams {
    #[serde(rename = "reason")]
    pub(crate) _reason: String,
    #[serde(rename = "force")]
    pub(crate) force: bool,
}

#[derive(Deserialize)]
pub(crate) struct CatalogCancelParams {
    pub(crate) generation: u64,
}

pub(crate) struct ProtocolError {
    pub(crate) store_failure: bool,
    pub(crate) code: &'static str,
    pub(crate) message: String,
}

impl ProtocolError {
    pub(crate) fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            store_failure: false,
            code,
            message: message.into(),
        }
    }
}
