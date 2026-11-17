//! Parsed ASTs wait outside SQLite transactions; source/final fences stay separate.
use crate::{maintenance::Terminal, maintenance_engine::Target};
use arkts_index_core::{DocumentSymbols, StoreError, StoreErrorKind};
use arkts_index_sqlite::{FileVersionWrite, FileWriteSize, FileWriteWork, ManifestEntry};
use serde_json::{Value, json};
use std::sync::atomic::{AtomicU8, Ordering};
pub(super) struct ParsedVersion {
    pub id: String,
    pub sha: String,
    pub document: Box<DocumentSymbols>,
}
pub(super) struct FactBatch {
    pending: Vec<ParsedVersion>,
    size: FileWriteSize,
    attempt: String,
    pub written: usize,
    pub rows: usize,
    pub reused: usize,
    pub work: FileWriteWork,
}
impl FactBatch {
    pub fn new(attempt: &str) -> Self {
        Self {
            pending: Vec::new(),
            size: FileWriteSize::default(),
            attempt: attempt.into(),
            written: 0,
            rows: 0,
            reused: 0,
            work: FileWriteWork::default(),
        }
    }
    pub fn push(
        &mut self,
        file: ParsedVersion,
        domain: &str,
        target: &mut Target<'_>,
        state: &AtomicU8,
    ) -> Result<Vec<ManifestEntry>, StoreError> {
        let cost = FileWriteSize::for_input(
            &FileVersionWrite {
                id: &file.id,
                sha: &file.sha,
                document: &file.document,
            },
            domain,
        );
        let mut entries = Vec::new();
        if !self.pending.is_empty() && !self.size.combine(cost).fits() {
            entries = self.flush(target, state)?;
        }
        self.pending.push(file);
        self.size = self.size.combine(cost);
        if !self.size.fits() || self.size.at_limit() {
            entries.extend(self.flush(target, state)?);
        }
        Ok(entries)
    }
    pub fn flush(
        &mut self,
        target: &mut Target<'_>,
        state: &AtomicU8,
    ) -> Result<Vec<ManifestEntry>, StoreError> {
        if self.pending.is_empty() {
            return Ok(Vec::new());
        }
        let inputs = self
            .pending
            .iter()
            .map(|file| FileVersionWrite {
                id: &file.id,
                sha: &file.sha,
                document: &file.document,
            })
            .collect::<Vec<_>>();
        let result = target.write_versions(&inputs, || state.load(Ordering::Acquire) != 1);
        let work = target.last_file_write_work();
        if let Some(work) = work {
            self.work.commit_callbacks += work.commit_callbacks;
            self.work.rollback_callbacks += work.rollback_callbacks;
        }
        let receipts = match result {
            Ok(r) => r,
            Err(error) => {
                failed(&self.attempt, &error, work);
                return Err(error);
            }
        };
        if receipts.len() != self.pending.len() {
            return Err(StoreError::new(
                StoreErrorKind::Internal,
                "file write receipt cardinality mismatch",
            ));
        }
        let mut entries = Vec::new();
        for (file, receipt) in self.pending.iter().zip(receipts) {
            if !receipt.reused {
                self.written += 1;
                self.rows += receipt.rows;
            } else {
                self.reused += 1;
            }
            entries.push(ManifestEntry::accepted(
                &file.document.uri,
                &receipt.version,
            ));
        }
        self.pending.clear();
        self.size = FileWriteSize::default();
        Ok(entries)
    }
}
fn value(work: &FileWriteWork) -> Value {
    json!({"scope":"file-version-writing","commitCallbacks":work.commit_callbacks,"rollbackCallbacks":work.rollback_callbacks})
}
pub(crate) fn decorate(mut terminal: Terminal, work: &FileWriteWork) -> Terminal {
    terminal.value["fileWriteWork"] = value(work);
    terminal
}
pub(crate) fn failed(attempt: &str, error: &StoreError, work: Option<&FileWriteWork>) {
    let cancelled = error.kind() == StoreErrorKind::Cancelled;
    eprintln!(
        "{}",
        json!({"event":if cancelled{"index.file-facts.write.cancelled"}else{"index.file-facts.write.failed"},"level":if cancelled{"info"}else{"error"},"attemptId":attempt,"message":error.to_string(),"work":work.map(value)})
    );
}
