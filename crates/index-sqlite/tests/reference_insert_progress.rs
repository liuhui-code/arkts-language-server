use std::{collections::BTreeSet, fs, path::Path, process::Command};

use arkts_index_core::{
    Document, DocumentSymbols, MemoryStore, Position, ReferenceCandidateQuery,
    ReferenceOccurrenceIdentity, WorkspaceIndex, parse_document_symbols,
};
use arkts_index_sqlite::SqliteStore;

#[path = "support/temp_dir.rs"]
mod temp_dir;
use temp_dir::TestDir;

const ROOT: &str = "file:///reference-progress";
const TARGET: &str = "file:///reference-progress/Target.ets";
const CHILD_DB: &str = "ARKTS_INDEX_REFERENCE_PROGRESS_TEST_DB";
const TRACE: &str = "ARKTS_INDEX_REFERENCE_INSERT_TRACE_FILE";
const FAIL_INSERT: &str = "ARKTS_INDEX_REFERENCE_PROGRESS_TEST_FAIL_INSERT";
const FIELDS: [&str; 18] = [
    "event",
    "checkpoint",
    "generation",
    "documents",
    "documentOrdinal",
    "documentsCompleted",
    "bufferedIdentityRows",
    "executedOccurrenceRows",
    "executedIdentityRows",
    "executedAliasRows",
    "executedBindingRows",
    "completedOccurrencesMs",
    "completedIdentitiesMs",
    "completedAliasesMs",
    "completedBindingsMs",
    "epochMs",
    "elapsedNs",
    "uncommitted",
];
const PHASES: [&str; 4] = [
    "document.occurrences.complete",
    "document.identities.complete",
    "document.aliases.complete",
    "document.bindings.complete",
];

fn documents(generation: u64) -> Vec<DocumentSymbols> {
    let mut sources = vec![(TARGET.to_owned(), "export class Target {}\n".to_owned())];
    for ordinal in 0..129 {
        sources.push((
            format!("{ROOT}/Consumer{ordinal:03}.ets"),
            format!(
                "import {{ Target as AliasTarget }} from './Target'\n\
                 const one = new AliasTarget()\n\
                 const two = new AliasTarget()\n{}",
                "const extra = new AliasTarget()\n".repeat(generation as usize),
            ),
        ));
    }
    sources
        .into_iter()
        .map(|(uri, text)| parse_document_symbols(&Document::new(uri, text)).unwrap())
        .collect()
}

fn counts(document: &DocumentSymbols) -> [usize; 4] {
    [
        document.occurrences.len(),
        document
            .occurrences
            .iter()
            .map(ReferenceOccurrenceIdentity::from)
            .collect::<BTreeSet<_>>()
            .len(),
        document.aliases.len(),
        document.bindings.len(),
    ]
}

fn run_child(database: &Path, trace: Option<&Path>, fail_insert: bool) {
    let mut command = Command::new(std::env::current_exe().unwrap());
    command
        .args(["--exact", "reference_progress_child", "--nocapture"])
        .current_dir(database.parent().unwrap())
        .env(CHILD_DB, database)
        .env_remove(FAIL_INSERT)
        .env_remove(TRACE)
        .env_remove("ARKTS_INDEX_CATALOG_STAGE_TRACE_FILE")
        .env_remove("ARKTS_INDEX_CATALOG_SQL_TRACE_FILE")
        .env_remove("ARKTS_INDEX_CATALOG_STORAGE_TRACE_FILE");
    if let Some(file) = trace {
        command.env(TRACE, file);
    }
    if fail_insert {
        command.env(FAIL_INSERT, "1");
    }
    let output = command.output().unwrap();
    assert!(output.status.success(), "{output:?}");
    for bytes in [&output.stdout, &output.stderr] {
        assert!(!String::from_utf8_lossy(bytes).contains("reference.sql.progress"));
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

fn number(record: &str, key: &str) -> usize {
    field(record, key).parse().unwrap()
}

fn assert_counts(record: &str, expected: [usize; 4]) {
    for (key, count) in [
        "executedOccurrenceRows",
        "executedIdentityRows",
        "executedAliasRows",
        "executedBindingRows",
    ]
    .into_iter()
    .zip(expected)
    {
        assert_eq!(number(record, key), count, "{record}");
    }
}

fn assert_shape(record: &str) {
    assert!(record.starts_with('{') && record.ends_with('}'));
    let entries: Vec<_> = record[1..record.len() - 1].split(',').collect();
    assert_eq!(entries.len(), FIELDS.len());
    for (index, (entry, key)) in entries.iter().zip(FIELDS).enumerate() {
        let value = entry.strip_prefix(&format!("\"{key}\":")).unwrap();
        match index {
            0..=1 => {
                assert!(value.starts_with('"') && value.ends_with('"'));
                assert!(!value[1..value.len() - 1].contains(['"', '\\']));
            }
            11..=14 => {
                assert!(
                    value
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || byte == b'.')
                );
                assert!(value.parse::<f64>().unwrap().is_finite());
            }
            17 => assert_eq!(value, "true"),
            _ => {
                assert!(value.bytes().all(|byte| byte.is_ascii_digit()));
                value.parse::<u128>().unwrap();
            }
        }
    }
    assert!(!record.contains("file://") && !record.contains("AliasTarget"));
}

#[test]
fn progress_is_opt_in_bounded_and_counts_executed_not_buffered_identity_rows() {
    let directory = TestDir::new("reference-progress");
    run_child(&directory.path().join("off.sqlite3"), None, false);
    assert!(fs::read_dir(directory.path()).unwrap().all(|entry| {
        entry
            .unwrap()
            .path()
            .extension()
            .is_none_or(|ext| ext != "ndjson")
    }));
    let trace = directory.path().join("progress.ndjson");
    run_child(&directory.path().join("on.sqlite3"), Some(&trace), false);
    let text = fs::read_to_string(trace).expect("opt-in reference-insert progress must exist");
    let all: Vec<_> = text.lines().collect();
    for record in &all {
        assert_shape(record);
    }
    for generation in [1, 2] {
        let records: Vec<_> = all
            .iter()
            .copied()
            .filter(|record| number(record, "generation") == generation)
            .collect();
        let docs = documents(generation as u64);
        let mut expected = [0; 4];
        assert_eq!(field(records[0], "checkpoint"), "insert.start");
        assert_counts(records[0], expected);
        assert_eq!(number(records[0], "documentsCompleted"), 0);
        assert_eq!(number(records[0], "bufferedIdentityRows"), 0);
        for key in [
            "completedOccurrencesMs",
            "completedIdentitiesMs",
            "completedAliasesMs",
            "completedBindingsMs",
        ] {
            assert_eq!(field(records[0], key).parse::<f64>().unwrap(), 0.0);
        }
        let mut record_index = 1;
        for (index, doc) in docs.iter().enumerate() {
            let doc_counts = counts(doc);
            for phase in 0..4 {
                expected[phase] += doc_counts[phase];
                if index != 0 && (index + 1) % 64 != 0 && index + 1 != docs.len() {
                    continue;
                }
                let record = records[record_index];
                record_index += 1;
                assert_eq!(field(record, "checkpoint"), PHASES[phase]);
                assert_eq!(number(record, "documentOrdinal"), index + 1);
                assert_eq!(
                    number(record, "documentsCompleted"),
                    index + usize::from(phase == 3)
                );
                let mut executed = expected;
                executed[1] -= expected[1] % 256;
                assert_counts(record, executed);
                assert_eq!(number(record, "bufferedIdentityRows"), expected[1] % 256);
            }
        }
        assert!(expected[0] > expected[1] && expected[1] > 256 && expected[1] % 256 > 0);
        let tail = records[record_index];
        assert_eq!(field(tail, "checkpoint"), "identities.tail.start");
        let mut before_tail = expected;
        before_tail[1] -= expected[1] % 256;
        assert_counts(tail, before_tail);
        assert_eq!(number(tail, "bufferedIdentityRows"), expected[1] % 256);
        for record in &records[record_index + 1..] {
            assert_counts(record, expected);
            assert_eq!(number(record, "documentsCompleted"), docs.len());
            assert_eq!(number(record, "bufferedIdentityRows"), 0);
        }
        assert_eq!(
            field(records[record_index + 1], "checkpoint"),
            "identities.tail.complete"
        );
        assert_eq!(
            field(records[record_index + 2], "checkpoint"),
            "insert.complete"
        );
        assert_eq!(
            records.len(),
            20,
            "bounded checkpoints, not one log per row/document"
        );
        for (index, record) in records.iter().enumerate() {
            assert_eq!(field(record, "event"), "reference.sql.progress");
            assert_eq!(field(record, "uncommitted"), "true");
            assert_eq!(number(record, "documents"), 130);
            assert!(!record.contains("file://") && !record.contains("AliasTarget"));
            for key in [
                "completedOccurrencesMs",
                "completedIdentitiesMs",
                "completedAliasesMs",
                "completedBindingsMs",
            ] {
                let value = field(record, key).parse::<f64>().unwrap();
                assert!(value.is_finite() && value >= 0.0);
                if index > 0 {
                    assert!(value >= field(records[index - 1], key).parse::<f64>().unwrap());
                }
            }
            assert!(number(record, "epochMs") > 0);
            if index > 0 {
                assert!(number(record, "elapsedNs") >= number(records[index - 1], "elapsedNs"));
            }
        }
    }
    assert_eq!(all.len(), 40);
}

#[test]
fn observer_open_failure_preserves_public_catalog_and_reopen_results() {
    let directory = TestDir::new("reference-progress-unwritable");
    run_child(
        &directory.path().join("catalog.sqlite3"),
        Some(directory.path()),
        false,
    );
}

#[test]
fn executed_progress_on_late_failure_does_not_certify_commit() {
    let directory = TestDir::new("reference-progress-rollback");
    let trace = directory.path().join("progress.ndjson");
    run_child(
        &directory.path().join("catalog.sqlite3"),
        Some(&trace),
        true,
    );
    let text = fs::read_to_string(trace).unwrap();
    let records: Vec<_> = text
        .lines()
        .filter(|record| number(record, "generation") == 2)
        .collect();
    assert_eq!(
        records.len(),
        5,
        "start + first document's four completed phases"
    );
    for record in &records {
        assert_shape(record);
        assert_ne!(field(record, "checkpoint"), "insert.complete");
    }
    assert!(number(records[1], "executedOccurrenceRows") > 0);
    assert_eq!(number(records[4], "documentsCompleted"), 1);
    assert!(number(records[4], "bufferedIdentityRows") > 0);
}

fn assert_public_results(database: &str, generation: u64, changed: Option<Document>) {
    let mut memory = WorkspaceIndex::with_store(MemoryStore::default());
    memory
        .activate_catalog(generation.min(2), documents(generation.min(2)), vec![])
        .unwrap();
    if let Some(document) = changed {
        memory.refresh(generation, [document], &[]).unwrap();
    }
    let reopened = WorkspaceIndex::with_store(SqliteStore::open(database, ROOT).unwrap());
    let query = ReferenceCandidateQuery {
        declaration_uri: TARGET.to_owned(),
        declaration_position: Position::new(0, 14),
        limit: 256,
    };
    let expected = memory.search_reference_candidates(query.clone()).unwrap();
    assert!(expected.identity_complete);
    assert_eq!(expected.identity_uris.len(), 130);
    assert_eq!(
        reopened.search_reference_candidates(query).unwrap(),
        expected
    );
}

#[test]
fn reference_progress_child() {
    let Ok(database) = std::env::var(CHILD_DB) else {
        return;
    };
    for generation in [1, 2] {
        let docs = documents(generation);
        let fail = generation == 2 && std::env::var_os(FAIL_INSERT).is_some();
        if fail {
            // Test-owned fault injection; the result oracle remains public.
            rusqlite::Connection::open(&database)
                .unwrap()
                .execute_batch(
                    "CREATE TRIGGER fail_test_binding BEFORE INSERT ON reference_bindings \
                 BEGIN SELECT RAISE(ABORT, 'test binding failure'); END;",
                )
                .unwrap();
        }
        let mut index = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
        let result = index.activate_catalog(generation, docs, vec![]);
        drop(index);
        if fail {
            assert!(result.is_err());
            assert_public_results(&database, 1, None);
            return;
        }
        assert_eq!(result.unwrap().committed_generation, generation);
        assert_public_results(&database, generation, None);
    }
    let changed = Document::new(
        format!("{ROOT}/Consumer000.ets"),
        "import { Target as AliasTarget } from './Target'\nnew AliasTarget()\n",
    );
    let mut index = WorkspaceIndex::with_store(SqliteStore::open(&database, ROOT).unwrap());
    index.refresh(3, [changed.clone()], &[]).unwrap();
    drop(index);
    assert_public_results(&database, 3, Some(changed));
}
