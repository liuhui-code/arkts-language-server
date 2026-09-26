use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

use arkts_index_core::{
    Document, Position, ReferenceCandidateQuery, WorkspaceIndex, parse_document_symbols,
};
use arkts_index_sqlite::SqliteStore;

const ROOT: &str = "file:///catalog-storage";
const TARGET: &str = "file:///catalog-storage/Target.ets";
const CHILD_DB: &str = "ARKTS_CATALOG_STORAGE_TEST_DB";
const TRACE_FILE: &str = "ARKTS_INDEX_CATALOG_STORAGE_TRACE_FILE";

struct TestDir(PathBuf);

impl TestDir {
    fn new() -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "arkts-catalog-storage-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn run_child(database: &Path, trace: Option<&Path>) -> String {
    let mut command = Command::new(std::env::current_exe().unwrap());
    command
        .args(["--exact", "catalog_storage_trace_child", "--nocapture"])
        .env(CHILD_DB, database)
        .env_remove(TRACE_FILE)
        .env_remove("ARKTS_INDEX_CATALOG_SQL_TRACE_FILE");
    if let Some(path) = trace {
        command.env(TRACE_FILE, path);
    }
    let output = command.output().unwrap();
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(output.status.success(), "{text}");
    text
}

fn numeric_fields(record: &str) -> BTreeMap<&str, f64> {
    assert!(record.starts_with('{') && record.ends_with('}'));
    record[1..record.len() - 1]
        .split(',')
        .map(|field| {
            let (key, value) = field.split_once(':').unwrap();
            let number: f64 = value.parse().unwrap();
            assert!(number.is_finite() && number >= 0.0);
            (key.trim_matches('"'), number)
        })
        .collect()
}

#[test]
fn storage_trace_observes_committed_pages_and_wal_without_changing_queries() {
    let temp = TestDir::new();
    let off = run_child(&temp.0.join("off.sqlite3"), None);
    assert!(
        !off.contains("allocatedBtreeBytes"),
        "no protocol-output logging"
    );
    let trace = temp.0.join("storage.jsonl");
    assert!(!trace.exists(), "default-off probe emits no file");
    run_child(&temp.0.join("on.sqlite3"), Some(&trace));
    let contents = fs::read_to_string(&trace).expect("opt-in storage trace must exist");
    let records: Vec<_> = contents.lines().collect();
    assert_eq!(
        records.len(),
        2,
        "only successful generations emit storage records"
    );
    for (ordinal, record) in records.iter().enumerate() {
        assert!(!record.contains("file://") && !record.contains("Target.ets"));
        let fields = numeric_fields(record);
        assert_eq!(fields["generation"], (ordinal + 1) as f64);
        assert!(fields["pageSizeBytes"] > 0.0 && fields["pageCount"] > 0.0);
        assert!(fields["freelistPages"] <= fields["pageCount"]);
        let allocated = fields["allocatedBtreeBytes"];
        let buckets: f64 = [
            "occurrenceTableBytes",
            "occurrenceIndexBytes",
            "identityTableBytes",
            "identityIndexBytes",
            "referenceOtherTableBytes",
            "referenceOtherIndexBytes",
            "otherBtreeBytes",
        ]
        .iter()
        .map(|key| fields[*key])
        .sum();
        assert_eq!(allocated, buckets, "every btree belongs to one bucket");
        assert!(allocated <= fields["pageCount"] * fields["pageSizeBytes"]);
        assert!(fields["payloadBytes"] + fields["unusedBytes"] <= allocated);
        for key in [
            "occurrenceTableBytes",
            "occurrenceIndexBytes",
            "identityTableBytes",
            "identityIndexBytes",
            "referenceOtherTableBytes",
            "referenceOtherIndexBytes",
            "otherBtreeBytes",
            "dbFileBytesAfterCommit",
            "walFileBytesAfterCommit",
        ] {
            assert!(fields[key] > 0.0, "missing measured storage: {key}");
        }
        assert!(fields.contains_key("storageProbeMs"));
        for key in [
            "dbFileBytesBefore",
            "walFileBytesBefore",
            "dbFileBytesBeforeCommit",
            "walFileBytesBeforeCommit",
        ] {
            assert!(fields.contains_key(key));
        }
    }
    run_child(&temp.0.join("unwritable.sqlite3"), Some(&temp.0));
}

#[test]
fn catalog_storage_trace_child() {
    let Ok(database) = std::env::var(CHILD_DB) else {
        return;
    };
    let consumer: String = (0..512)
        .map(|i| format!("new AliasTarget() // {i}\n"))
        .collect();
    for generation in [1, 2] {
        let store = SqliteStore::open(&database, ROOT).unwrap();
        let mut index = WorkspaceIndex::with_store(store);
        let source = format!("import {{ Target as AliasTarget }} from './Target'\n{consumer}");
        let documents = [
            (TARGET, "export class Target {}\n"),
            ("file:///catalog-storage/Consumer.ets", source.as_str()),
        ]
        .into_iter()
        .map(|(uri, text)| parse_document_symbols(&Document::new(uri, text)).unwrap())
        .collect();
        assert_eq!(
            index
                .activate_catalog(generation, documents, vec![])
                .unwrap()
                .committed_generation,
            generation
        );
        let query = ReferenceCandidateQuery {
            declaration_uri: TARGET.to_owned(),
            declaration_position: Position::new(0, 14),
            limit: 16,
        };
        let candidates = index.search_reference_candidates(query.clone()).unwrap();
        assert_eq!(candidates.served_generation, generation);
        assert!(candidates.identity_complete && candidates.identity_uris.len() == 2);
        assert!(index.activate_catalog(generation, vec![], vec![]).is_err());
        drop(index);
        let reopened = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
        let candidates = reopened.search_reference_candidates(query).unwrap();
        assert_eq!(candidates.served_generation, generation);
        assert!(candidates.identity_complete && candidates.identity_uris.len() == 2);
    }
}
