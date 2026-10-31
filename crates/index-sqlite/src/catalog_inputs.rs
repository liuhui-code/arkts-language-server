use crate::catalog_control::io_error;
use arkts_index_core::StoreError;
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fs::File, io::Read, path::Path};

/// Full-catalog reuse requires the exact producer binary, schema and admitted sources.
/// Ordinary incremental writes invalidate the stored fingerprint before committing.
pub struct CatalogInputs {
    producer: Sha256,
    sources: BTreeMap<String, [u8; 32]>,
}

impl CatalogInputs {
    pub fn new() -> Result<Self, StoreError> {
        let mut producer = Sha256::new();
        producer.update(b"arkts-catalog-inputs-v1\0");
        producer.update(crate::SCHEMA_VERSION.to_le_bytes());
        let mut binary =
            File::open(std::env::current_exe().map_err(io_error)?).map_err(io_error)?;
        let mut buffer = [0u8; 64 * 1024];
        loop {
            let size = binary.read(&mut buffer).map_err(io_error)?;
            if size == 0 {
                break;
            }
            producer.update(&buffer[..size]);
        }
        Ok(Self {
            producer,
            sources: BTreeMap::new(),
        })
    }

    pub fn source_digest(source: &str) -> [u8; 32] {
        Sha256::digest(source.as_bytes()).into()
    }

    pub fn file_matches(path: &Path, expected: &[u8; 32]) -> bool {
        let Ok(file) = File::open(path) else {
            return false;
        };
        let mut bounded = file.take(2 * 1024 * 1024 + 1);
        let mut hash = Sha256::new();
        let mut buffer = [0u8; 64 * 1024];
        let mut total = 0;
        loop {
            let Ok(size) = bounded.read(&mut buffer) else {
                return false;
            };
            if size == 0 {
                break;
            }
            total += size;
            if total > 2 * 1024 * 1024 {
                return false;
            }
            hash.update(&buffer[..size]);
        }
        let actual: [u8; 32] = hash.finalize().into();
        actual == *expected
    }

    pub fn record(&mut self, uri: &str, source: &str) {
        self.sources
            .insert(uri.into(), Sha256::digest(source.as_bytes()).into());
    }

    pub fn finish(self) -> String {
        let mut hash = self.producer;
        for (uri, digest) in self.sources {
            hash.update((uri.len() as u64).to_le_bytes());
            hash.update(uri.as_bytes());
            hash.update(digest);
        }
        format!("{:x}", hash.finalize())
    }
}
