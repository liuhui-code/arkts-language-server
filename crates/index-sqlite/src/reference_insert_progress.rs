use std::{
    fs::{File, OpenOptions},
    io::{BufWriter, Write},
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use super::ReferenceInsertTimings;

/// Cumulative successful executions inside an uncommitted catalog transaction.
/// Checkpoints do not identify the currently pending SQL after their timestamp.
pub(super) struct ReferenceInsertProgress {
    writer: BufWriter<File>,
    started: Instant,
    generation: u64,
    documents: usize,
}

impl ReferenceInsertProgress {
    pub(super) fn begin(generation: u64, documents: usize) -> Option<Self> {
        let path = std::env::var_os("ARKTS_INDEX_REFERENCE_INSERT_TRACE_FILE")
            .filter(|path| !path.is_empty())?;
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .ok()?;
        let mut trace = Self {
            writer: BufWriter::new(file),
            started: Instant::now(),
            generation,
            documents,
        };
        trace.emit("insert.start", 0, 0, 0, &ReferenceInsertTimings::default());
        Some(trace)
    }

    pub(super) fn document_checkpoint(
        &mut self,
        checkpoint: &str,
        ordinal: usize,
        completed: usize,
        buffered: usize,
        timings: &ReferenceInsertTimings,
    ) {
        // Four records per selected document, never one record per SQL row.
        if ordinal == 1 || ordinal.is_multiple_of(64) || ordinal == self.documents {
            self.emit(checkpoint, ordinal, completed, buffered, timings);
        }
    }

    pub(super) fn finish_checkpoint(
        &mut self,
        checkpoint: &str,
        buffered: usize,
        timings: &ReferenceInsertTimings,
    ) {
        self.emit(
            checkpoint,
            self.documents,
            self.documents,
            buffered,
            timings,
        );
    }

    fn emit(
        &mut self,
        checkpoint: &str,
        ordinal: usize,
        completed: usize,
        buffered: usize,
        timings: &ReferenceInsertTimings,
    ) {
        let epoch_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let _ = writeln!(
            self.writer,
            concat!(
                "{{\"event\":\"reference.sql.progress\",\"checkpoint\":\"{}\",",
                "\"generation\":{},\"documents\":{},\"documentOrdinal\":{},",
                "\"documentsCompleted\":{},\"bufferedIdentityRows\":{},",
                "\"executedOccurrenceRows\":{},\"executedIdentityRows\":{},",
                "\"executedAliasRows\":{},\"executedBindingRows\":{},",
                "\"completedOccurrencesMs\":{:.6},\"completedIdentitiesMs\":{:.6},",
                "\"completedAliasesMs\":{:.6},\"completedBindingsMs\":{:.6},",
                "\"epochMs\":{},\"elapsedNs\":{},\"uncommitted\":true}}"
            ),
            checkpoint,
            self.generation,
            self.documents,
            ordinal,
            completed,
            buffered,
            timings.occurrence_rows,
            timings.occurrence_identity_rows,
            timings.alias_rows,
            timings.binding_rows,
            timings.occurrences_ms,
            timings.occurrence_identities_ms,
            timings.aliases_ms,
            timings.bindings_ms,
            epoch_ms,
            self.started.elapsed().as_nanos(),
        );
        // Best effort, live visibility. IO failure cannot change store results.
        let _ = self.writer.flush();
    }
}
