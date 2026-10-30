use super::MAX_SOURCE_BYTES;
use arkts_index_sqlite::CatalogInputs;
use std::{
    fs::{self, File, Metadata},
    io::Read,
    path::{Path, PathBuf},
    time::SystemTime,
};
const READ_CHUNK_BYTES: usize = 64 * 1024;

pub(super) struct SourceStamp {
    path: PathBuf,
    length: u64,
    modified: Option<SystemTime>,
    digest: [u8; 32],
}
impl SourceStamp {
    pub fn capture(path: &Path, metadata: &Metadata, source: &str) -> Self {
        Self {
            path: path.to_owned(),
            length: metadata.len(),
            modified: metadata.modified().ok(),
            digest: CatalogInputs::source_digest(source),
        }
    }
    pub fn is_current(&self) -> bool {
        fs::metadata(&self.path)
            .is_ok_and(|meta| meta.len() == self.length && meta.modified().ok() == self.modified)
            && CatalogInputs::file_matches(&self.path, &self.digest)
    }
}

pub(super) enum SourceRead {
    Text(String),
    PolicySkipped,
}

pub(super) fn read_source(path: &Path) -> Result<SourceRead, ()> {
    let mut file = File::open(path).map_err(|_| ())?;
    let mut bytes = Vec::new();
    let mut chunk = [0u8; READ_CHUNK_BYTES];
    loop {
        let read = file.read(&mut chunk).map_err(|_| ())?;
        if read == 0 {
            break;
        }
        if bytes.len().saturating_add(read) > MAX_SOURCE_BYTES as usize {
            return Ok(SourceRead::PolicySkipped);
        }
        bytes.extend_from_slice(&chunk[..read]);
    }
    String::from_utf8(bytes)
        .map(SourceRead::Text)
        .map_err(|_| ())
}
