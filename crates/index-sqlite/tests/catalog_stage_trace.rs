use std::{
    fs,
    path::Path,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

use arkts_index_core::{
    Document, DocumentSymbols, Position, ReferenceCandidateQuery, WorkspaceIndex,
    parse_document_symbols,
};
use arkts_index_sqlite::SqliteStore;
use rusqlite::{Connection, TransactionBehavior};

#[path = "support/temp_dir.rs"]
mod temp_dir;
use temp_dir::TestDir;

const ROOT: &str = "file:///catalog-stage";
const TARGET: &str = "file:///catalog-stage/Target.ets";
const CHILD_DB: &str = "ARKTS_INDEX_CATALOG_STAGE_TEST_DB";
const TRACE: &str = "ARKTS_INDEX_CATALOG_STAGE_TRACE_FILE";
const FIELDS: [&str; 9] = [
    "event",
    "stage",
    "generation",
    "documents",
    "inputOccurrenceRows",
    "inputAliasRows",
    "inputBindingRows",
    "epochMs",
    "elapsedNs",
];
const STAGES: [&str; 8] = [
    "replace.start",
    "references.start",
    "references.end",
    "index.start",
    "index.end",
    "commit.start",
    "commit.end",
    "replace.complete",
];

fn documents(generation: u64) -> Vec<DocumentSymbols> {
    let repeated = "const another = new AliasTarget()\n".repeat(generation as usize);
    [
        (TARGET, "export class Target {}\n".to_owned()),
        (
            "file:///catalog-stage/Consumer.ets",
            format!(
                "import {{ Target as AliasTarget }} from './Target'\n\
                 const value = new AliasTarget()\n{repeated}"
            ),
        ),
    ]
    .into_iter()
    .map(|(uri, text)| parse_document_symbols(&Document::new(uri, text)).unwrap())
    .collect()
}

fn run_child(database: &Path, trace: Option<&Path>, child_test: &str) {
    let mut command = Command::new(std::env::current_exe().unwrap());
    command
        .args(["--exact", child_test, "--nocapture"])
        .current_dir(database.parent().unwrap())
        .env(CHILD_DB, database)
        .env_remove(TRACE)
        .env_remove("ARKTS_INDEX_CATALOG_SQL_TRACE_FILE")
        .env_remove("ARKTS_INDEX_CATALOG_STORAGE_TRACE_FILE");
    if let Some(file) = trace {
        command.env(TRACE, file);
    }
    let output = command.output().unwrap();
    assert!(
        output.status.success(),
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    for bytes in [&output.stdout, &output.stderr] {
        assert!(
            !String::from_utf8_lossy(bytes).contains("catalog.sql.stage"),
            "stage observation must never write to process protocol streams"
        );
    }
}

fn field<'a>(record: &'a str, key: &str) -> &'a str {
    let prefix = format!("\"{key}\":");
    record
        .trim_start_matches('{')
        .trim_end_matches('}')
        .split(',')
        .find_map(|part| part.strip_prefix(&prefix))
        .unwrap_or_else(|| panic!("missing {key}: {record}"))
        .trim_matches('"')
}

fn assert_record_shape(record: &str) {
    assert!(record.starts_with('{') && record.ends_with('}'));
    let entries: Vec<_> = record[1..record.len() - 1].split(',').collect();
    assert_eq!(entries.len(), FIELDS.len());
    for (index, (entry, key)) in entries.iter().zip(FIELDS).enumerate() {
        let prefix = format!("\"{key}\":");
        let value = entry
            .strip_prefix(&prefix)
            .expect("fixed, unique field order");
        if index < 2 {
            assert!(value.starts_with('"') && value.ends_with('"'));
            assert!(!value[1..value.len() - 1].contains(['"', '\\']));
        } else {
            assert!(!value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit()));
            value.parse::<u128>().expect("nonnegative JSON integer");
        }
    }
}

#[test]
fn live_catalog_stage_trace_is_opt_in_and_preserves_committed_reference_results() {
    let directory = TestDir::new("catalog-stage-trace");
    run_child(
        &directory.path().join("off.sqlite3"),
        None,
        "catalog_stage_trace_child",
    );
    assert!(
        fs::read_dir(directory.path()).unwrap().all(|entry| {
            entry
                .unwrap()
                .path()
                .extension()
                .is_none_or(|extension| extension != "ndjson")
        }),
        "default-off trace has no output in the child working directory"
    );

    let trace = directory.path().join("stages.ndjson");
    run_child(
        &directory.path().join("on.sqlite3"),
        Some(&trace),
        "catalog_stage_trace_child",
    );
    let text = fs::read_to_string(&trace).expect("opt-in live stage trace must exist");
    let records: Vec<_> = text.lines().collect();
    assert_eq!(records.len(), STAGES.len() * 2);
    for (index, record) in records.iter().enumerate() {
        assert_record_shape(record);
        let generation = index / STAGES.len() + 1;
        let documents = documents(generation as u64);
        assert_eq!(field(record, "event"), "catalog.sql.stage");
        assert_eq!(field(record, "stage"), STAGES[index % STAGES.len()]);
        assert_eq!(field(record, "generation"), generation.to_string());
        assert_eq!(field(record, "documents"), "2");
        for (key, count) in [
            (
                "inputOccurrenceRows",
                documents
                    .iter()
                    .map(|doc| doc.occurrences.len())
                    .sum::<usize>(),
            ),
            (
                "inputAliasRows",
                documents.iter().map(|doc| doc.aliases.len()).sum::<usize>(),
            ),
            (
                "inputBindingRows",
                documents
                    .iter()
                    .map(|doc| doc.bindings.len())
                    .sum::<usize>(),
            ),
        ] {
            assert_eq!(field(record, key), count.to_string());
        }
        assert!(field(record, "epochMs").parse::<u128>().unwrap() > 0);
        let elapsed = field(record, "elapsedNs").parse::<u128>().unwrap();
        if index % STAGES.len() > 0 {
            let previous = field(records[index - 1], "elapsedNs")
                .parse::<u128>()
                .unwrap();
            assert!(
                elapsed >= previous,
                "one operation has monotonic stage times"
            );
        }
        assert!(
            !record.contains("file://"),
            "trace must contain no source URI"
        );
        assert!(
            !record.contains("Target.ets"),
            "trace must contain no source path"
        );
    }
}

#[test]
fn early_stage_is_visible_while_catalog_waits_for_a_writer() {
    let directory = TestDir::new("catalog-stage-live");
    let database = directory.path().join("catalog.sqlite3");
    let trace = directory.path().join("stages.ndjson");
    drop(SqliteStore::open(&database, ROOT).unwrap());
    let mut connection = Connection::open(&database).unwrap();
    let writer = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .unwrap();
    let mut child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "catalog_stage_trace_child", "--nocapture"])
        .env(CHILD_DB, &database)
        .env(TRACE, &trace)
        .env_remove("ARKTS_INDEX_CATALOG_SQL_TRACE_FILE")
        .env_remove("ARKTS_INDEX_CATALOG_STORAGE_TRACE_FILE")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut observed = String::new();
    let mut pending = false;
    while Instant::now() < deadline {
        observed = fs::read_to_string(&trace).unwrap_or_default();
        pending = child.try_wait().unwrap().is_none();
        if observed.ends_with('\n') || !pending {
            break;
        }
        thread::sleep(Duration::from_millis(10));
    }
    // Always release the test-owned lock and reap the child before assertions.
    writer.commit().unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success(), "{output:?}");
    assert!(
        pending,
        "the early boundary must not depend on process exit"
    );
    let records: Vec<_> = observed.lines().collect();
    assert_eq!(
        records.len(),
        1,
        "catalog is still waiting for the test writer"
    );
    assert_record_shape(records[0]);
    assert_eq!(field(records[0], "stage"), "replace.start");
    assert_eq!(
        fs::read_to_string(trace).unwrap().lines().count(),
        STAGES.len() * 2
    );
    assert_committed_results(database.to_str().unwrap(), 2);
}

#[test]
fn observer_open_failure_does_not_change_committed_reference_results() {
    let directory = TestDir::new("catalog-stage-unwritable");
    run_child(
        &directory.path().join("catalog.sqlite3"),
        Some(directory.path()),
        "catalog_stage_trace_child",
    );
}

#[test]
fn failed_replacement_never_reports_commit_and_preserves_previous_generation() {
    let directory = TestDir::new("catalog-stage-rollback");
    let trace = directory.path().join("stages.ndjson");
    run_child(
        &directory.path().join("catalog.sqlite3"),
        Some(&trace),
        "catalog_stage_trace_rollback_child",
    );
    let text = fs::read_to_string(trace).unwrap();
    let records: Vec<_> = text.lines().collect();
    for record in &records {
        assert_record_shape(record);
    }
    assert_eq!(records.len(), STAGES.len() + 1);
    for (index, record) in records[..STAGES.len()].iter().enumerate() {
        assert_eq!(field(record, "generation"), "1");
        assert_eq!(field(record, "stage"), STAGES[index]);
    }
    let failed = records.last().unwrap();
    assert_eq!(field(failed, "stage"), "replace.start");
    assert_eq!(field(failed, "generation"), "2");
    assert_eq!(field(failed, "documents"), "2");
    assert_eq!(field(failed, "inputAliasRows"), "0");
}

fn assert_committed_results(database: &str, generation: u64) {
    let reopened = WorkspaceIndex::with_store(SqliteStore::open(database, ROOT).unwrap());
    let candidates = reopened
        .search_reference_candidates(ReferenceCandidateQuery {
            declaration_uri: TARGET.to_owned(),
            declaration_position: Position::new(0, 14),
            limit: 16,
        })
        .unwrap();
    assert_eq!(candidates.served_generation, generation);
    assert!(candidates.identity_complete, "{candidates:#?}");
    assert_eq!(candidates.identity_uris.len(), 2);
}

#[test]
fn catalog_stage_trace_child() {
    let Ok(database) = std::env::var(CHILD_DB) else {
        return;
    };
    for generation in [1, 2] {
        let store = SqliteStore::open(&database, ROOT).unwrap();
        let mut index = WorkspaceIndex::with_store(store);
        assert_eq!(
            index
                .activate_catalog(generation, documents(generation), vec![])
                .unwrap()
                .committed_generation,
            generation
        );
        drop(index);
        assert_committed_results(&database, generation);
    }
    let mut index = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
    assert!(index.activate_catalog(2, vec![], vec![]).is_err());
    drop(index);
    assert_committed_results(&database, 2);
}

#[test]
fn catalog_stage_trace_rollback_child() {
    let Ok(database) = std::env::var(CHILD_DB) else {
        return;
    };
    let mut index = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
    index.activate_catalog(1, documents(1), vec![]).unwrap();
    assert!(index.activate_catalog(1, vec![], vec![]).is_err());
    let document = documents(2).remove(0);
    assert!(
        index
            .activate_catalog(2, vec![document.clone(), document], vec![])
            .is_err(),
        "duplicate document must roll back the replacement transaction"
    );
    drop(index);
    assert_committed_results(&database, 1);
}
