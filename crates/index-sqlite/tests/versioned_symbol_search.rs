use arkts_index_core::{Document, WorkspaceIndex, parse_document_symbols};
use arkts_index_sqlite::VersionedFacts;
use sha2::{Digest, Sha256};
#[path = "support/temp_dir.rs"]
mod temp_dir;
fn write(f: &mut VersionedFacts, id: &str, uri: &str, text: &str) -> String {
    let doc = parse_document_symbols(&Document::new(uri, text)).unwrap();
    f.write_version(id, &format!("{:x}", Sha256::digest(text.as_bytes())), &doc)
        .unwrap()
        .version
}
#[test]
fn queries_filter_staged_and_historical_versions_before_ranking_or_limit() {
    let temp = temp_dir::TestDir::new("versioned-symbol-query");
    let mut f = VersionedFacts::create(
        &temp.path().join("data.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    let a = write(
        &mut f,
        "old",
        "file:///a.ets",
        "export class HiddenTarget {} ",
    );
    f.stage_group("old", &[("file:///a.ets".into(), a)])
        .unwrap();
    f.publish_group("old", 0).unwrap();
    let b = write(
        &mut f,
        "new",
        "file:///a.ets",
        "export class LiveTarget {} ",
    );
    f.stage_group("new", &[("file:///a.ets".into(), b)])
        .unwrap();
    assert_eq!(f.search("Hidden", 1).unwrap().items.len(), 1);
    assert!(f.search("Live", 1).unwrap().items.is_empty());
    f.publish_group("new", 1).unwrap();
    let mut oracle = WorkspaceIndex::in_memory();
    oracle
        .refresh(
            1,
            [Document::new(
                "file:///a.ets",
                "export class LiveTarget {} ",
            )],
            &[],
        )
        .unwrap();
    for q in ["Li", "Live", "Target", "LT", "", "missing"] {
        let actual = f.search(q, 1).unwrap();
        assert_eq!(actual.items, oracle.search(q, 1).unwrap().items, "{q}");
        assert_eq!(actual.served_generation, 2);
    }
}

#[test]
fn exported_symbols_follow_current_manifest_with_exact_legacy_order_and_payload() {
    let temp = temp_dir::TestDir::new("versioned-export-query");
    let mut f = VersionedFacts::create(
        &temp.path().join("data.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    let uri = "file:///a.ets";
    let old = write(&mut f, "old", uri, "export class AlphaOld {} ");
    f.stage_group("old", &[(uri.into(), old)]).unwrap();
    f.publish_group("old", 0).unwrap();
    let text = "export class AlphaNew {} export { AlphaNew as Alias };";
    let new = write(&mut f, "new", uri, text);
    f.stage_group("new", &[(uri.into(), new)]).unwrap();
    assert_eq!(
        f.search_exports("Alpha", 1).unwrap().items[0].exported_name,
        "AlphaOld"
    );
    f.publish_group("new", 1).unwrap();
    let mut oracle = WorkspaceIndex::in_memory();
    oracle.refresh(1, [Document::new(uri, text)], &[]).unwrap();
    let mut legacy = WorkspaceIndex::with_store(
        arkts_index_sqlite::SqliteStore::open(temp.path().join("legacy.sqlite3"), "workspace")
            .unwrap(),
    );
    legacy.refresh(1, [Document::new(uri, text)], &[]).unwrap();
    // Existing SQL and MemoryStore differ for empty export prefixes; preserve SQL behavior.
    assert!(legacy.search_exports("", 1).unwrap().items.is_empty());
    assert!(!oracle.search_exports("", 1).unwrap().items.is_empty());
    for q in ["A", "Alpha", "Alias", "missing", ""] {
        let result = f.search_exports(q, 1).unwrap();
        assert_eq!(
            result.items,
            legacy.search_exports(q, 1).unwrap().items,
            "{q}"
        );
        if !q.is_empty() {
            assert_eq!(
                result.items,
                oracle.search_exports(q, 1).unwrap().items,
                "{q}"
            );
        }
        assert_eq!(result.served_generation, 2);
    }
}

#[test]
fn reader_results_and_generation_stay_coherent_during_other_connection_publication() {
    use std::sync::{Arc, Barrier};
    let temp = temp_dir::TestDir::new("versioned-query-snapshot");
    let path = temp.path().join("data.sqlite3");
    let mut writer = VersionedFacts::create(&path, "workspace", "store", "domain").unwrap();
    let odd = "export class GenerationOdd {}";
    let even = "export class GenerationEven {}";
    let first = write(&mut writer, "odd", "file:///a.ets", odd);
    writer
        .stage_group("first", &[("file:///a.ets".into(), first)])
        .unwrap();
    writer.publish_group("first", 0).unwrap();
    let gate = Arc::new(Barrier::new(2));
    let reader_gate = gate.clone();
    let reader = std::thread::spawn(move || {
        let reader = VersionedFacts::open_existing(&path, "workspace", "store", "domain").unwrap();
        reader_gate.wait();
        for _ in 0..100 {
            let result = reader.search("Generation", 10).unwrap();
            assert_eq!(result.items.len(), 1);
            let expected = if result.served_generation % 2 == 1 {
                "GenerationOdd"
            } else {
                "GenerationEven"
            };
            assert_eq!(result.items[0].name, expected);
        }
    });
    gate.wait();
    for generation in 2..=12 {
        let id = write(
            &mut writer,
            &format!("version-{generation}"),
            "file:///a.ets",
            if generation % 2 == 1 { odd } else { even },
        );
        let group = format!("group-{generation}");
        writer
            .stage_group(&group, &[("file:///a.ets".into(), id)])
            .unwrap();
        assert_eq!(
            writer.publish_group(&group, generation - 1).unwrap(),
            generation
        );
    }
    reader.join().unwrap();
}
