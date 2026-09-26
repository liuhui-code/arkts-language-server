//! Opt-in, read-only catalog storage observation. Never checkpoints the WAL.

use std::{
    fmt::Write as _,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    time::Instant,
};

use rusqlite::Connection;

pub(super) struct CatalogStorageTrace {
    output: PathBuf,
    database: PathBuf,
    before: (u64, u64),
    before_commit: Option<(u64, u64)>,
    probe_ms: f64,
}

impl CatalogStorageTrace {
    pub(super) fn begin(connection: &Connection) -> Option<Self> {
        let output = std::env::var_os("ARKTS_INDEX_CATALOG_STORAGE_TRACE_FILE")
            .filter(|path| !path.is_empty())?;
        let started = Instant::now();
        let database = PathBuf::from(connection.path()?);
        let before = file_lengths(&database)?;
        Some(Self {
            output: output.into(),
            database,
            before,
            before_commit: None,
            probe_ms: elapsed_ms(started),
        })
    }

    pub(super) fn before_commit(&mut self) {
        let started = Instant::now();
        self.before_commit = file_lengths(&self.database);
        self.probe_ms += elapsed_ms(started);
    }

    pub(super) fn finish(self, connection: &Connection, generation: u64) {
        // Observation failure must never turn a successful catalog into failure.
        let _ = self.write(connection, generation);
    }

    fn write(self, connection: &Connection, generation: u64) -> Option<()> {
        let started = Instant::now();
        let after = file_lengths(&self.database)?;
        let before_commit = self.before_commit?;
        let mut fields = vec![
            ("generation", generation),
            ("pageSizeBytes", pragma(connection, "page_size")?),
            ("pageCount", pragma(connection, "page_count")?),
            ("freelistPages", pragma(connection, "freelist_count")?),
            ("dbFileBytesBefore", self.before.0),
            ("walFileBytesBefore", self.before.1),
            ("dbFileBytesBeforeCommit", before_commit.0),
            ("walFileBytesBeforeCommit", before_commit.1),
            ("dbFileBytesAfterCommit", after.0),
            ("walFileBytesAfterCommit", after.1),
        ];
        let mut buckets = [0u64; 7];
        let mut payload = 0u64;
        let mut unused = 0u64;
        let mut statement = connection
            .prepare(
                "SELECT d.name, s.tbl_name, s.type, d.pgsize, d.payload, d.unused \
             FROM dbstat('main', 1) d LEFT JOIN sqlite_schema s ON s.name = d.name",
            )
            .ok()?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, i64>(5)?,
                ))
            })
            .ok()?;
        for row in rows {
            let (name, table, kind, bytes, row_payload, row_unused) = row.ok()?;
            let bytes = u64::try_from(bytes).ok()?;
            let row_payload = u64::try_from(row_payload).ok()?;
            let row_unused = u64::try_from(row_unused).ok()?;
            let table = table.as_deref().unwrap_or(&name);
            let index = kind.as_deref() == Some("index");
            let bucket = match (table, index) {
                ("reference_occurrences", false) => 0,
                ("reference_occurrences", true) => 1,
                ("reference_occurrence_identities", false) => 2,
                ("reference_occurrence_identities", true) => 3,
                ("reference_aliases" | "reference_bindings", false) => 4,
                ("reference_aliases" | "reference_bindings", true) => 5,
                _ => 6,
            };
            buckets[bucket] += bytes;
            payload += row_payload;
            unused += row_unused;
        }
        fields.extend([
            ("occurrenceTableBytes", buckets[0]),
            ("occurrenceIndexBytes", buckets[1]),
            ("identityTableBytes", buckets[2]),
            ("identityIndexBytes", buckets[3]),
            ("referenceOtherTableBytes", buckets[4]),
            ("referenceOtherIndexBytes", buckets[5]),
            ("otherBtreeBytes", buckets[6]),
            ("allocatedBtreeBytes", buckets.iter().sum()),
            ("payloadBytes", payload),
            ("unusedBytes", unused),
        ]);
        let mut record = String::from("{");
        for (key, value) in fields {
            write!(&mut record, "\"{key}\":{value},").ok()?;
        }
        write!(
            &mut record,
            "\"storageProbeMs\":{:.3}}}",
            self.probe_ms + elapsed_ms(started)
        )
        .ok()?;
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.output)
            .ok()?;
        writeln!(file, "{record}").ok()?;
        Some(())
    }
}

fn pragma(connection: &Connection, name: &str) -> Option<u64> {
    let value: i64 = connection
        .pragma_query_value(None, name, |row| row.get(0))
        .ok()?;
    u64::try_from(value).ok()
}

fn file_lengths(database: &Path) -> Option<(u64, u64)> {
    let mut wal = database.as_os_str().to_os_string();
    wal.push("-wal");
    Some((file_length(database)?, file_length(Path::new(&wal))?))
}

fn file_length(path: &Path) -> Option<u64> {
    match fs::metadata(path) {
        Ok(metadata) => Some(metadata.len()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Some(0),
        Err(_) => None,
    }
}

fn elapsed_ms(started: Instant) -> f64 {
    started.elapsed().as_secs_f64() * 1_000.0
}
