//! Bounded URI intents, independent of parsed payloads and complete qualification.
use crate::{maintenance::Input, protocol::ProtocolError};
use serde::Deserialize;
use std::collections::{BTreeMap, VecDeque};
#[derive(Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum Kind {
    Changed,
    Created,
    Removed,
}
impl Kind {
    pub fn label(&self) -> &'static str {
        match self {
            Self::Changed => "changed",
            Self::Created => "created",
            Self::Removed => "removed",
        }
    }
}
#[derive(Clone, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub(crate) struct Change {
    pub uri: String,
    pub kind: Kind,
}
#[derive(Clone, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum Uncertainty {
    Namespace,
    Configuration,
    WatchOverflow,
    Reconnected,
}
#[derive(Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Changes {
    pub input: Input,
    pub changes: Vec<Change>,
    pub uncertainty: Vec<Uncertainty>,
    #[serde(default)]
    pub managed_cache_namespaces: Option<Vec<crate::source_scope::Proof>>,
}
#[derive(Clone)]
pub(crate) struct FileJob {
    pub uri: String,
    pub input: Input,
    pub kind: Kind,
}
pub(crate) struct Pending {
    pub latest: Option<Input>,
    pub needs_reconcile: bool,
    pub precise: bool,
    pub barrier: bool,
    last_changes: Option<Changes>,
    order: VecDeque<String>,
    files: BTreeMap<String, FileJob>,
    bytes: usize,
}
impl Default for Pending {
    fn default() -> Self {
        Self {
            latest: None,
            needs_reconcile: true,
            precise: false,
            barrier: false,
            last_changes: None,
            order: VecDeque::new(),
            files: BTreeMap::new(),
            bytes: 0,
        }
    }
}
impl Pending {
    pub fn len(&self) -> usize {
        self.files.len()
    }
    pub fn check_input(&self, input: &Input) -> Result<(), ProtocolError> {
        input.validate()?;
        if self
            .latest
            .as_ref()
            .is_some_and(|last| last.issuer != input.issuer || last.revision > input.revision)
        {
            return Err(ProtocolError::new(
                "invalid_generation",
                "stale or foreign input issuer",
            ));
        }
        Ok(())
    }
    pub fn record(&mut self, changes: Changes) -> Result<bool, ProtocolError> {
        self.check_input(&changes.input)?;
        if self.latest.as_ref() == Some(&changes.input) {
            if self.last_changes.as_ref() == Some(&changes) {
                return Ok(false);
            }
            return Err(ProtocolError::new(
                "invalid_generation",
                "input revision already assigned",
            ));
        }
        self.latest = Some(changes.input.clone());
        self.needs_reconcile = true;
        self.precise = changes.uncertainty.is_empty() && self.precise;
        if !changes.uncertainty.is_empty() {
            self.barrier = true;
            self.order.clear();
            self.files.clear();
            self.bytes = 0;
        } else {
            for change in &changes.changes {
                let job = FileJob {
                    uri: change.uri.clone(),
                    input: changes.input.clone(),
                    kind: change.kind.clone(),
                };
                if self.files.contains_key(&change.uri) {
                    self.files.insert(change.uri.clone(), job);
                } else if self.files.len() < crate::MAX_EXCLUDED_URIS
                    && self.bytes + change.uri.len() <= crate::MAX_EXCLUDED_URI_TOTAL_BYTES
                {
                    self.bytes += change.uri.len();
                    self.order.push_back(change.uri.clone());
                    self.files.insert(change.uri.clone(), job);
                } else {
                    // Overflow is a retained reconcile requirement, never an ACK
                    // that every precise URI was retained or already consumed.
                    self.precise = false;
                }
            }
        }
        self.last_changes = Some(changes);
        Ok(true)
    }
    pub fn take(&mut self) -> Option<FileJob> {
        if self.barrier {
            return None;
        }
        let uri = self.order.pop_front()?;
        self.bytes -= uri.len();
        self.files.remove(&uri)
    }
    pub fn qualified(&mut self, input: &Input) -> bool {
        let current =
            self.latest.as_ref() == Some(input) && (self.barrier || self.files.is_empty());
        if current {
            // A complete current-input proof covers the intents held behind
            // the structural barrier, not just the original uncertain event.
            self.order.clear();
            self.files.clear();
            self.bytes = 0;
            self.barrier = false;
            self.needs_reconcile = false;
            self.precise = true;
        }
        current
    }
}
