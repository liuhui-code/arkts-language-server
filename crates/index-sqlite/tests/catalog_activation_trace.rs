use std::{
    fs,
    path::PathBuf,
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

use arkts_index_core::{
    Document, Position, ReferenceCandidateQuery, WorkspaceIndex, parse_document_symbols,
};
use arkts_index_sqlite::SqliteStore;

const ROOT: &str = "file:///catalog-trace";
const TARGET: &str = "file:///catalog-trace/Target.ets";
const ALIAS_COUNT: usize = 64;
const CHILD_DB: &str = "ARKTS_INDEX_CATALOG_TRACE_TEST_DB";
const TRACE_FILE: &str = "ARKTS_INDEX_CATALOG_SQL_TRACE_FILE";
const FIELDS: [&str; 19] = [
    "generation",
    "documents",
    "preflightMs",
    "beginMs",
    "dropIndexMs",
    "deleteDocumentsMs",
    "deleteRejectedMs",
    "insertDocumentsMs",
    "insertSymbolsMs",
    "insertExportsMs",
    "insertReferencesMs",
    "insertOccurrencesMs",
    "insertOccurrenceIdentitiesMs",
    "insertAliasesMs",
    "insertBindingsMs",
    "createIndexMs",
    "rejectedMetadataMs",
    "commitMs",
    "totalMs",
];

struct TestDir(PathBuf);

impl TestDir {
    fn new() -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("valid clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "arkts-catalog-activation-trace-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("create test directory");
        Self(path)
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn run_child(database: &PathBuf, trace: Option<&PathBuf>) -> String {
    let mut command = Command::new(std::env::current_exe().expect("integration test executable"));
    command
        .args(["--exact", "catalog_activation_trace_child", "--nocapture"])
        .env(CHILD_DB, database)
        .env_remove(TRACE_FILE);
    if let Some(path) = trace {
        command.env(TRACE_FILE, path);
    }
    let output = command.output().expect("start integration-test child");
    let output_text = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(
        output.status.success(),
        "catalog child failed: {output_text}"
    );
    output_text
}

fn numeric_fields(record: &str) -> Vec<(&str, f64)> {
    assert!(record.starts_with('{') && record.ends_with('}'), "{record}");
    record[1..record.len() - 1]
        .split(',')
        .map(|field| {
            let (key, value) = field.split_once(':').expect("numeric JSON field");
            let parsed = value.trim().parse::<f64>().expect("numeric JSON value");
            assert!(
                parsed.is_finite() && parsed >= 0.0,
                "invalid timing: {record}"
            );
            (key.trim().trim_matches('"'), parsed)
        })
        .collect()
}

#[test]
fn catalog_activation_trace_is_opt_in_and_follows_successful_commits() {
    let temp = TestDir::new();
    let off_database = temp.0.join("off.sqlite3");
    let off_trace = temp.0.join("off.jsonl");
    let off_output = run_child(&off_database, None);
    assert!(
        !off_trace.exists(),
        "default-off catalog must not emit trace"
    );
    assert!(
        !off_output.contains("preflightMs"),
        "default-off catalog must not log SQL trace to process output"
    );

    let on_database = temp.0.join("on.sqlite3");
    let on_trace = temp.0.join("on.jsonl");
    run_child(&on_database, Some(&on_trace));
    let contents = fs::read_to_string(&on_trace).expect("opt-in trace must exist");
    let records: Vec<_> = contents.lines().collect();
    assert_eq!(records.len(), 2, "one record per committed generation");
    for (index, record) in records.iter().enumerate() {
        assert!(!record.contains("file://"), "trace must omit source URIs");
        assert!(
            !record.contains("Target.ets"),
            "trace must omit source paths"
        );
        let fields = numeric_fields(record);
        assert_eq!(
            fields.iter().map(|(name, _)| *name).collect::<Vec<_>>(),
            FIELDS,
            "fixed stage fields must be ordered"
        );
        assert_eq!(fields[0].1, (index + 1) as f64);
        assert_eq!(fields[1].1, 2.0);
        let reference_parts = &fields[11..15];
        assert!(
            reference_parts
                .iter()
                .all(|(_, elapsed_ms)| *elapsed_ms > 0.0),
            "all reference insertion subphases must execute: {record}"
        );
        let parts_ms: f64 = reference_parts
            .iter()
            .map(|(_, elapsed_ms)| elapsed_ms)
            .sum();
        assert!(
            parts_ms <= fields[10].1 + 0.01,
            "subphases must fit within insertReferencesMs (allowing 0.001-ms rounding): {record}"
        );
        assert!(fields[18].1 >= fields[17].1, "total includes commit");
    }

    let unwritable_database = temp.0.join("unwritable.sqlite3");
    run_child(&unwritable_database, Some(&temp.0));
}

#[test]
fn catalog_activation_trace_child() {
    let Ok(database) = std::env::var(CHILD_DB) else {
        return;
    };
    for generation in [1, 2] {
        let store = SqliteStore::open(&database, ROOT).expect("open SQLite catalog");
        let mut index = WorkspaceIndex::with_store(store);
        let consumer_source = (0..ALIAS_COUNT)
            .map(|ordinal| {
                format!(
                    "import {{ Target as AliasTarget{ordinal:02} }} from './Target'\n\
                     const value{ordinal:02} = new AliasTarget{ordinal:02}()\n"
                )
            })
            .collect::<String>();
        let documents: Vec<_> = [
            (TARGET, "export class Target {}\n"),
            (
                "file:///catalog-trace/Consumer.ets",
                consumer_source.as_str(),
            ),
        ]
        .into_iter()
        .map(|(uri, source)| {
            parse_document_symbols(&Document::new(uri, source)).expect("parse ArkTS fixture")
        })
        .collect();
        assert!(
            documents
                .iter()
                .map(|document| document.aliases.len())
                .sum::<usize>()
                >= ALIAS_COUNT,
            "trace fixture must exercise repeated alias insertion"
        );
        assert!(
            documents
                .iter()
                .map(|document| document.bindings.len())
                .sum::<usize>()
                >= ALIAS_COUNT,
            "trace fixture must exercise repeated binding insertion"
        );
        let receipt = index
            .activate_catalog(generation, documents, vec![])
            .expect("activate catalog");
        assert_eq!(receipt.committed_generation, generation);
        drop(index);
        let reopened = WorkspaceIndex::with_store(
            SqliteStore::open(&database, ROOT).expect("reopen committed catalog"),
        );
        let candidates = reopened
            .search_reference_candidates(ReferenceCandidateQuery {
                declaration_uri: TARGET.to_owned(),
                declaration_position: Position::new(0, 14),
                limit: 16,
            })
            .expect("query committed reference candidates");
        assert_eq!(candidates.served_generation, generation);
        assert!(candidates.identity_complete, "{candidates:#?}");
        assert_eq!(candidates.identity_uris.len(), 2);
    }

    let mut reopened = WorkspaceIndex::with_store(
        SqliteStore::open(&database, ROOT).expect("reopen committed catalog"),
    );
    assert!(
        reopened.activate_catalog(2, vec![], vec![]).is_err(),
        "stale generation must not commit or produce a trace record"
    );
    assert_eq!(
        reopened
            .search_reference_candidates(ReferenceCandidateQuery {
                declaration_uri: TARGET.to_owned(),
                declaration_position: Position::new(0, 14),
                limit: 16,
            })
            .expect("query after rejected catalog")
            .served_generation,
        2
    );
}
