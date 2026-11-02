use arkts_index_sqlite::{CatalogInputs, path_to_file_uri};
use rusqlite::{Connection, OpenFlags, types::Value};
use serde_json::json;
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};
#[expect(dead_code, reason = "shared public protocol fixture")]
#[path = "support/sidecar_process.rs"]
mod sidecar_process;
use sidecar_process::{SidecarProcess, TestDir, initialize};
#[expect(dead_code, reason = "shared hash-first fixtures")]
#[path = "support/hash_first.rs"]
mod hash_first;

fn control_path(path: &Path) -> Option<PathBuf> {
    for entry in fs::read_dir(path).unwrap() {
        let path = entry.unwrap().path();
        if path.file_name().unwrap() == "catalog-state.sqlite3" {
            return Some(path);
        }
        if path.is_dir()
            && let Some(path) = control_path(&path)
        {
            return Some(path);
        }
    }
    None
}
fn snapshot(cache: &Path) -> BTreeMap<String, Vec<Vec<Value>>> {
    let control = control_path(cache).unwrap();
    let open = |path| Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
    let name: String = open(&control)
        .query_row(
            "SELECT database_name FROM catalog_state WHERE id=1",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let connection = open(&control.with_file_name(name));
    let mut snapshot = BTreeMap::new();
    for table in [
        "documents",
        "symbols",
        "exports",
        "reference_occurrences",
        "reference_occurrence_identities",
        "reference_aliases",
        "reference_bindings",
        "class_heritage_declarations",
        "rejected_documents",
    ] {
        let columns: Vec<String> = connection
            .prepare(&format!("PRAGMA table_info({table})"))
            .unwrap()
            .query_map([], |row| row.get(1))
            .unwrap()
            .map(Result::unwrap)
            .filter(|column: &String| column != "generation")
            .collect();
        let order = (1..=columns.len())
            .map(|index| index.to_string())
            .collect::<Vec<_>>()
            .join(",");
        let mut statement = connection
            .prepare(&format!(
                "SELECT {} FROM {table} ORDER BY {order}",
                columns.join(",")
            ))
            .unwrap();
        let rows = statement
            .query_map([], |row| {
                (0..columns.len())
                    .map(|index| row.get(index))
                    .collect::<Result<Vec<Value>, _>>()
            })
            .unwrap()
            .map(Result::unwrap)
            .collect::<Vec<_>>();
        snapshot.insert(table.to_owned(), rows);
    }
    snapshot
}
fn build(process: &mut SidecarProcess, force: bool, id: u64) -> bool {
    assert_eq!(
        process.request(json!({"protocol":1,"id":id,"method":"catalog/start",
        "params":{"force":force,"reason":"stream-equivalence"}}))["ok"],
        true
    );
    let mut oversized_chunk_seen = false;
    loop {
        let event = process.read_event();
        let status = &event["params"]["status"];
        if status["storage"]["writtenRows"].as_u64().unwrap_or(0) > 0
            && status["storage"]["writtenDocuments"] == 0
        {
            oversized_chunk_seen = true;
        }
        if matches!(
            status["phase"].as_str(),
            Some("ready" | "partial" | "degraded" | "cancelled")
        ) {
            assert_eq!(status["phase"], "ready", "{status}");
            assert_eq!(status["indexed"], 5);
            return oversized_chunk_seen;
        }
    }
}
fn queries(process: &mut SidecarProcess, workspace: &Path, id: u64) -> Vec<serde_json::Value> {
    [
        ("search", json!({"query":"Dense","limit":32})),
        ("exports/search", json!({"query":"Dense","limit":32})),
        (
            "references/candidates",
            json!({"declarationUri":path_to_file_uri(&workspace.join("0000.ets")),
            "declarationPosition":{"line":0,"character":14},"limit":32}),
        ),
    ]
    .into_iter()
    .enumerate()
    .map(|(offset, (method, params))| {
        let mut response = process
            .request(json!({"protocol":1,"id":id+offset as u64,"method":method,"params":params}));
        assert_eq!(response["ok"], true);
        let result = response["result"].as_object_mut().unwrap();
        assert!(result.remove("servedGeneration").is_some());
        json!(result)
    })
    .collect()
}

#[test]
fn four_expanding_documents_and_near_admission_source_preserve_every_row_and_query() {
    let temp = TestDir::new("stream-dense-equivalence");
    let workspace = temp.path().join("workspace");
    let cache = temp.path().join("cache");
    fs::create_dir(&workspace).unwrap();
    let mut digests = Vec::new();
    for index in 0..4 {
        let source = format!(
            "export class Dense{index} {{}}\nimport {{ Dense0 as Alias{index} }} from './0000';\n"
        ) + &format!("Dense{index}();\n").repeat(20_000);
        let path = workspace.join(format!("{index:04}.ets"));
        fs::write(&path, &source).unwrap();
        digests.push((path, CatalogInputs::source_digest(&source)));
    }
    let mut near_limit = "export class NearLimit {}\n/*".to_owned();
    near_limit.push_str(&"x".repeat(2 * 1024 * 1024 - 1 - near_limit.len() - 2));
    near_limit.push_str("*/");
    assert_eq!(near_limit.len(), 2 * 1024 * 1024 - 1);
    let path = workspace.join("9999.ets");
    fs::write(&path, &near_limit).unwrap();
    digests.push((path, CatalogInputs::source_digest(&near_limit)));
    let trace = temp.path().join("trace.jsonl");
    let mut process = SidecarProcess::spawn_with_environment(&[(
        "ARKTS_INDEX_TEST_STREAM_TRACE",
        trace.as_os_str(),
    )]);
    assert_eq!(initialize(&mut process, &workspace, &cache, 1)["ok"], true);
    assert!(build(&mut process, false, 2));
    let expected = snapshot(&cache);
    assert!(expected["reference_occurrences"].len() >= 80_000);
    let expected_queries = queries(&mut process, &workspace, 3);
    let before = hash_first::stored(&cache);
    fs::write(&trace, "").unwrap();
    assert!(!build(&mut process, false, 6));
    assert_eq!(hash_first::parsed(&trace), 0);
    assert_eq!(hash_first::count(&trace, "started"), 0);
    assert_eq!(hash_first::stored(&cache), before);
    assert_eq!(snapshot(&cache), expected);
    assert_eq!(queries(&mut process, &workspace, 7), expected_queries);
    assert!(build(&mut process, true, 10));
    assert_eq!(
        snapshot(&cache),
        expected,
        "all stored values and ordinals must match, excluding generation only"
    );
    assert_eq!(queries(&mut process, &workspace, 11), expected_queries);
    for (path, digest) in digests {
        assert!(CatalogInputs::file_matches(&path, &digest));
    }
    process.shutdown(14);
}
