use std::{
    fs::{File, OpenOptions},
    io::{BufWriter, Write},
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use arkts_index_core::FullCatalogBatch;

/// Best-effort, opt-in observation of the captured input, not committed rows.
pub(super) struct CatalogStageTrace {
    writer: BufWriter<File>,
    started: Instant,
    generation: u64,
    documents: usize,
    input_occurrence_rows: usize,
    input_alias_rows: usize,
    input_binding_rows: usize,
}

impl CatalogStageTrace {
    pub(super) fn begin(batch: &FullCatalogBatch) -> Option<Self> {
        let path = std::env::var_os("ARKTS_INDEX_CATALOG_STAGE_TRACE_FILE")
            .filter(|path| !path.is_empty())?;
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .ok()?;
        Some(Self {
            writer: BufWriter::new(file),
            started: Instant::now(),
            generation: batch.generation,
            documents: batch.documents.len(),
            input_occurrence_rows: batch
                .documents
                .iter()
                .map(|doc| doc.occurrences.len())
                .sum(),
            input_alias_rows: batch.documents.iter().map(|doc| doc.aliases.len()).sum(),
            input_binding_rows: batch.documents.iter().map(|doc| doc.bindings.len()).sum(),
        })
    }

    fn emit(&mut self, stage: &str) {
        let epoch_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let _ = writeln!(
            self.writer,
            concat!(
                "{{\"event\":\"catalog.sql.stage\",\"stage\":\"{}\",",
                "\"generation\":{},\"documents\":{},\"inputOccurrenceRows\":{},",
                "\"inputAliasRows\":{},\"inputBindingRows\":{},",
                "\"epochMs\":{},\"elapsedNs\":{}}}"
            ),
            stage,
            self.generation,
            self.documents,
            self.input_occurrence_rows,
            self.input_alias_rows,
            self.input_binding_rows,
            epoch_ms,
            self.started.elapsed().as_nanos(),
        );
        // Flush the start boundary before synchronous SQL can block the caller.
        // Observer failures must never affect the transaction or its result.
        let _ = self.writer.flush();
    }
}

pub(super) fn emit(trace: &mut Option<CatalogStageTrace>, stage: &str) {
    if let Some(trace) = trace.as_mut() {
        trace.emit(stage);
    }
}
