//! Peer source exclusions share the existing accepted-input mutation boundary.
use crate::{maintenance::Input, protocol::ProtocolError};
use arkts_index_sqlite::{QualificationReceipt, cache_gc::namespace::ManagedCacheNamespace};
use serde::Deserialize;
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

#[derive(Clone, Copy)]
pub(crate) struct SourceView<'a> {
    pub root: &'a Path,
    pub owner: Option<&'a ManagedCacheNamespace>,
    pub peers: &'a [ManagedCacheNamespace],
}

pub(crate) const CAPABILITY: &str = "managed-source-namespaces-v1";
#[derive(Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Proof {
    pub directory: PathBuf,
    pub workspace_identity: String,
    pub object_id: String,
}
#[derive(Default)]
struct State {
    epoch: u64,
    peers: Vec<ManagedCacheNamespace>,
    required: Option<Input>,
}
#[derive(Clone, Default)]
pub(crate) struct SourceScope(Arc<Mutex<State>>);
impl SourceScope {
    pub fn prepare(
        base: &Path,
        root: &Path,
        rows: &[Proof],
    ) -> Result<Vec<ManagedCacheNamespace>, ProtocolError> {
        let parent = base
            .parent()
            .and_then(Path::parent)
            .ok_or_else(|| ProtocolError::new("invalid_params", "missing cache parent"))?;
        let mut peers = Vec::new();
        for row in rows {
            let expected = parent.join(arkts_index_sqlite::cache_key(&row.workspace_identity));
            if row.directory != expected
                || !row.directory.starts_with(root)
                || row.directory == root
                || peers
                    .iter()
                    .any(|p: &ManagedCacheNamespace| p.directory == row.directory)
            {
                return Err(ProtocolError::new(
                    "invalid_params",
                    "peer namespace is not a distinct managed leaf in this source root",
                ));
            }
            peers.push(
                ManagedCacheNamespace::from_proof(
                    &row.directory,
                    &row.workspace_identity,
                    &row.object_id,
                )
                .map_err(|m| ProtocolError::new("cache_namespace_changed", m))?,
            );
        }
        Ok(peers)
    }
    pub fn install(&self, input: Input, peers: Vec<ManagedCacheNamespace>) {
        let mut state = self.0.lock().unwrap();
        state.epoch += 1;
        state.peers = peers;
        state.required = Some(input);
    }
    pub fn peers(&self) -> Vec<ManagedCacheNamespace> {
        self.0.lock().unwrap().peers.clone()
    }
    pub fn epoch(&self) -> u64 {
        self.0.lock().unwrap().epoch
    }
    pub fn allows(&self, receipt: Option<&QualificationReceipt>) -> bool {
        self.0
            .lock()
            .unwrap()
            .required
            .as_ref()
            .is_none_or(|floor| {
                receipt.is_some_and(|q| {
                    q.input.issuer() == floor.issuer && q.input.revision() >= floor.revision
                })
            })
    }
    pub fn qualified(&self, input: &Input) {
        let mut state = self.0.lock().unwrap();
        if state
            .required
            .as_ref()
            .is_some_and(|floor| floor.issuer == input.issuer && floor.revision <= input.revision)
        {
            state.required = None;
        }
    }
}
