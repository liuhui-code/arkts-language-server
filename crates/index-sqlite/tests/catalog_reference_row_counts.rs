use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

use arkts_index_core::{
    Document, DocumentSymbols, Position, ReferenceCandidateQuery, ReferenceOccurrenceIdentity,
    WorkspaceIndex, parse_document_symbols,
};
use arkts_index_sqlite::SqliteStore;

const ROOT: &str = "file:///catalog-row-counts";
const TARGET: &str = "file:///catalog-row-counts/Target.ets";
const CHILD_DB: &str = "ARKTS_INDEX_CATALOG_ROW_COUNT_TEST_DB";
const TRACE_FILE: &str = "ARKTS_INDEX_CATALOG_SQL_TRACE_FILE";

struct TestDir(PathBuf);

impl TestDir {
    fn new() -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("valid clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "arkts-catalog-row-counts-{}-{nonce}",
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

fn documents(generation: u64) -> Vec<DocumentSymbols> {
    let extra_usage = if generation == 1 {
        ""
    } else {
        "new AliasTarget()\n"
    };
    let distinct_names: String = (0..257)
        .map(|ordinal| format!("const extra_{ordinal:03} = {ordinal}\n"))
        .collect();
    [
        (TARGET, "export class Target {}\n".to_owned()),
        (
            "file:///catalog-row-counts/Consumer.ets",
            format!(
                "import {{ Target as AliasTarget }} from './Target'\n\
                 const one = new AliasTarget()\n\
                 const two = new AliasTarget()\n{extra_usage}{distinct_names}"
            ),
        ),
    ]
    .into_iter()
    .map(|(uri, source)| {
        parse_document_symbols(&Document::new(uri, source)).expect("parse ArkTS fixture")
    })
    .collect()
}

fn expected_counts(documents: &[DocumentSymbols]) -> [usize; 4] {
    let occurrences = documents.iter().map(|doc| doc.occurrences.len()).sum();
    let identities = documents
        .iter()
        .map(|doc| {
            doc.occurrences
                .iter()
                .map(ReferenceOccurrenceIdentity::from)
                .collect::<BTreeSet<_>>()
                .len()
        })
        .sum();
    let aliases = documents.iter().map(|doc| doc.aliases.len()).sum();
    let bindings = documents.iter().map(|doc| doc.bindings.len()).sum();
    [occurrences, identities, aliases, bindings]
}

fn run_child(database: &Path, trace: Option<&Path>) -> String {
    let mut command = Command::new(std::env::current_exe().expect("integration test executable"));
    command
        .args([
            "--exact",
            "catalog_reference_row_counts_child",
            "--nocapture",
        ])
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

fn numeric_field(record: &str, key: &str) -> usize {
    let prefix = format!("\"{key}\":");
    record
        .trim_start_matches('{')
        .trim_end_matches('}')
        .split(',')
        .find_map(|field| field.strip_prefix(&prefix))
        .unwrap_or_else(|| panic!("missing {key}: {record}"))
        .parse::<usize>()
        .unwrap_or_else(|_| panic!("non-integral {key}: {record}"))
}

#[test]
fn committed_catalog_trace_counts_actual_reference_rows_without_exposing_paths() {
    let temp = TestDir::new();
    let off_database = temp.0.join("off.sqlite3");
    let off_trace = temp.0.join("off.jsonl");
    let off_output = run_child(&off_database, None);
    assert!(!off_trace.exists(), "trace must be default-off");
    assert!(
        !off_output.contains("insertOccurrenceRows"),
        "default-off child output must not contain row counters"
    );

    let on_database = temp.0.join("on.sqlite3");
    let on_trace = temp.0.join("on.jsonl");
    run_child(&on_database, Some(&on_trace));
    let contents = fs::read_to_string(&on_trace).expect("opt-in trace file");
    let records: Vec<_> = contents.lines().collect();
    assert_eq!(records.len(), 2, "only committed generations emit records");

    let first_counts = expected_counts(&documents(1));
    let second_counts = expected_counts(&documents(2));
    let first_documents = documents(1);
    let generated_names: BTreeSet<_> = first_documents
        .iter()
        .flat_map(|document| &document.occurrences)
        .filter(|occurrence| occurrence.name.starts_with("extra_"))
        .map(|occurrence| occurrence.name.as_str())
        .collect();
    assert_eq!(generated_names.len(), 257, "all generated names must parse");
    assert!(
        first_counts[1] > 256 && first_counts[1] % 256 != 0,
        "fixture must flush a full 256-identity batch and a remainder"
    );
    assert!(
        first_counts[0] > first_counts[1],
        "fixture must duplicate identities"
    );
    assert!(first_counts[2] > 0, "fixture must insert aliases");
    assert!(first_counts[3] > 0, "fixture must insert bindings");
    assert!(
        second_counts[0] > first_counts[0],
        "generation 2 adds occurrences"
    );
    assert_eq!(second_counts[1], first_counts[1], "same identity set");

    for (generation, (record, expected)) in records
        .iter()
        .zip([first_counts, second_counts])
        .enumerate()
    {
        assert!(!record.contains("file://"), "no source URI in trace");
        assert!(!record.contains("Target.ets"), "no source path in trace");
        assert_eq!(numeric_field(record, "generation"), generation + 1);
        assert_eq!(numeric_field(record, "documents"), 2);
        for (key, count) in [
            "insertOccurrenceRows",
            "insertOccurrenceIdentityRows",
            "insertAliasRows",
            "insertBindingRows",
        ]
        .into_iter()
        .zip(expected)
        {
            assert_eq!(
                numeric_field(record, key),
                count,
                "{key}, generation {}",
                generation + 1
            );
        }
    }
}

#[test]
fn catalog_reference_row_counts_child() {
    let Ok(database) = std::env::var(CHILD_DB) else {
        return;
    };
    for generation in [1, 2] {
        let store = SqliteStore::open(&database, ROOT).expect("open SQLite catalog");
        let mut index = WorkspaceIndex::with_store(store);
        let receipt = index
            .activate_catalog(generation, documents(generation), vec![])
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
        "stale generation must not commit or emit a trace record"
    );
    assert_eq!(
        reopened
            .search_reference_candidates(ReferenceCandidateQuery {
                declaration_uri: TARGET.to_owned(),
                declaration_position: Position::new(0, 14),
                limit: 16,
            })
            .expect("query after rejected generation")
            .served_generation,
        2
    );
}
