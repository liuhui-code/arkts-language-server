use crate::{CatalogInputs, catalog_inputs::producer_digest};
use arkts_index_core::StoreError;
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fmt};
const COMPLETE_PREFIX: &str = "arkts-complete-scan-v2:";
const LEGACY_PREFIX: &str = "arkts-legacy-fingerprint-v2:";

/// Explicit scanner attestation, not a security boundary against malicious Rust callers.
/// The caller must invalidate this accumulator at every incomplete scan/read branch.
pub struct CompleteScanInputs {
    producer: String,
    sources: BTreeMap<String, [u8; 32]>,
    complete: bool,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CompleteScanFingerprint {
    producer: String,
    sources: String,
}
impl CompleteScanInputs {
    pub fn new() -> Result<Self, StoreError> {
        Ok(Self {
            producer: format!(
                "{:x}",
                producer_digest(b"arkts-complete-scan-v2\0")?.finalize()
            ),
            sources: BTreeMap::new(),
            complete: true,
        })
    }
    pub fn producer_key(&self) -> &str {
        &self.producer
    }
    pub fn invalidate(&mut self) {
        self.complete = false;
    }
    pub fn record(&mut self, uri: &str, source: &str) {
        self.record_digest(uri, CatalogInputs::source_digest(source));
    }
    pub fn record_digest(&mut self, uri: &str, digest: [u8; 32]) {
        if self.sources.insert(uri.into(), digest).is_some() {
            self.invalidate();
        }
    }
    pub fn finish(self) -> Option<CompleteScanFingerprint> {
        if !self.complete {
            return None;
        }
        let mut hash = Sha256::new();
        for (uri, digest) in self.sources {
            hash.update((uri.len() as u64).to_le_bytes());
            hash.update(uri.as_bytes());
            hash.update(digest);
        }
        Some(CompleteScanFingerprint {
            producer: self.producer,
            sources: format!("{:x}", hash.finalize()),
        })
    }
}
impl fmt::Display for CompleteScanFingerprint {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "{COMPLETE_PREFIX}{}:{}",
            self.producer, self.sources
        )
    }
}
pub(super) fn qualified_for(value: &str, producer: &str) -> bool {
    let Some(value) = value.strip_prefix(COMPLETE_PREFIX) else {
        return false;
    };
    let Some((key, sources)) = value.split_once(':') else {
        return false;
    };
    let valid_hex = |value: &str| {
        value.len() == 64
            && value
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    };
    key == producer && valid_hex(key) && valid_hex(sources)
}
pub(crate) fn legacy_encode(value: &str) -> String {
    format!("{LEGACY_PREFIX}{value}")
}
pub(super) fn legacy_matches(stored: &str, value: &str) -> bool {
    stored == legacy_encode(value)
        || (!stored.starts_with(COMPLETE_PREFIX)
            && !stored.starts_with(LEGACY_PREFIX)
            && stored == value)
}
