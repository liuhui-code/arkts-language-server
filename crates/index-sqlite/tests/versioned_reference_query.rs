use arkts_index_core::{
    Document, Position, ReferenceCandidateQuery, WorkspaceIndex, parse_document_symbols,
};
use arkts_index_sqlite::VersionedFacts;
use sha2::{Digest, Sha256};
#[path = "support/temp_dir.rs"]
mod temp_dir;
#[test]
fn reference_graph_uses_the_current_versions_and_preserves_legacy_proof() {
    let temp = temp_dir::TestDir::new("versioned-reference-query");
    let mut f = VersionedFacts::create(
        &temp.path().join("data.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    let docs = [
        Document::new("file:///workspace/Target.ets", "export class Target {}"),
        Document::new(
            "file:///workspace/Consumer.ets",
            "import { Target as Local } from './Target'; new Local();",
        ),
    ];
    let mut entries = vec![];
    for (i, d) in docs.iter().enumerate() {
        let parsed = parse_document_symbols(d).unwrap();
        let sha = format!("{:x}", Sha256::digest(d.text.as_bytes()));
        let stored = f.write_version(&format!("v{i}"), &sha, &parsed).unwrap();
        entries.push((d.uri.clone(), stored.version));
    }
    f.stage_group("initial", &entries).unwrap();
    f.publish_group("initial", 0).unwrap();
    let q = ReferenceCandidateQuery {
        declaration_uri: docs[0].uri.clone(),
        declaration_position: Position::new(0, 14),
        limit: 100,
    };
    let mut oracle = WorkspaceIndex::in_memory();
    oracle.refresh(1, docs.clone(), &[]).unwrap();
    assert_eq!(
        f.search_reference_candidates(&q, &[], &[]).unwrap(),
        oracle.search_reference_candidates(q.clone()).unwrap()
    );
    let changed = Document::new(docs[1].uri.clone(), "export const other=1;");
    let parsed = parse_document_symbols(&changed).unwrap();
    let stored = f
        .write_version(
            "changed",
            &format!("{:x}", Sha256::digest(changed.text.as_bytes())),
            &parsed,
        )
        .unwrap();
    f.stage_group("changed", &[(changed.uri.clone(), stored.version)])
        .unwrap();
    assert_eq!(
        f.search_reference_candidates(&q, &[], &[]).unwrap(),
        oracle.search_reference_candidates(q.clone()).unwrap()
    );
    f.publish_group("changed", 1).unwrap();
    oracle.refresh(2, [changed], &[]).unwrap();
    assert_eq!(
        f.search_reference_candidates(&q, &[], &[]).unwrap(),
        oracle.search_reference_candidates(q).unwrap()
    );
}

#[test]
fn standard_read_port_works_and_legacy_writes_cannot_bypass_version_publication() {
    let temp = temp_dir::TestDir::new("versioned-read-port");
    let mut f = VersionedFacts::create(
        &temp.path().join("data.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    let d = Document::new("file:///a.ets", "export class A {}");
    let parsed = parse_document_symbols(&d).unwrap();
    f.write_version(
        "v1",
        &format!("{:x}", Sha256::digest(d.text.as_bytes())),
        &parsed,
    )
    .unwrap();
    f.stage_group("initial", &[(d.uri.clone(), "v1".into())])
        .unwrap();
    f.publish_group("initial", 0).unwrap();
    let mut index = WorkspaceIndex::with_store(f);
    assert_eq!(index.metadata().unwrap().committed_generation, 1);
    assert_eq!(index.search("A", 10).unwrap().items.len(), 1);
    assert!(
        index
            .refresh(2, [Document::new(d.uri, "export class Wrong {}")], &[])
            .is_err()
    );
    assert_eq!(index.metadata().unwrap().committed_generation, 1);
    assert!(index.search("Wrong", 10).unwrap().items.is_empty());
}

#[test]
fn reexports_scope_limits_and_rejected_members_match_existing_complete_oracles() {
    let temp = temp_dir::TestDir::new("versioned-reference-matrix");
    let docs = [
        Document::new("file:///workspace/Target.ets", "export class Target {}"),
        Document::new(
            "file:///workspace/Barrel.ets",
            "export { Target as Alias } from './Target';",
        ),
        Document::new(
            "file:///workspace/Consumer.ets",
            "import { Alias as Local } from './Barrel'; new Local();",
        ),
    ];
    let mut f = VersionedFacts::create(
        &temp.path().join("data.sqlite3"),
        "workspace",
        "store",
        "domain",
    )
    .unwrap();
    let mut entries = vec![];
    for (i, d) in docs.iter().enumerate() {
        let parsed = parse_document_symbols(d).unwrap();
        let sha = format!("{:x}", Sha256::digest(d.text.as_bytes()));
        let stored = f.write_version(&format!("v{i}"), &sha, &parsed).unwrap();
        entries.push((d.uri.clone(), stored.version));
    }
    f.stage_group("initial", &entries).unwrap();
    f.publish_group("initial", 0).unwrap();
    let mut memory = WorkspaceIndex::in_memory();
    memory.refresh(1, docs.clone(), &[]).unwrap();
    let mut legacy = WorkspaceIndex::with_store(
        arkts_index_sqlite::SqliteStore::open(temp.path().join("legacy.sqlite3"), "workspace")
            .unwrap(),
    );
    legacy.refresh(1, docs, &[]).unwrap();
    for roots in [
        vec![],
        vec!["file:///workspace".into()],
        vec!["file:///workspace/Target.ets".into()],
    ] {
        for limit in [1, 100] {
            let q = ReferenceCandidateQuery {
                declaration_uri: "file:///workspace/Target.ets".into(),
                declaration_position: Position::new(0, 14),
                limit,
            };
            let result = f.search_reference_candidates(&q, &[], &roots).unwrap();
            assert_eq!(
                result,
                legacy
                    .search_reference_candidates_with_scope(q.clone(), &[], &roots)
                    .unwrap()
            );
            assert_eq!(
                result,
                memory
                    .search_reference_candidates_with_scope(q, &[], &roots)
                    .unwrap()
            );
        }
    }
    f.stage_changes(
        "reject",
        &[arkts_index_sqlite::ManifestEntry::rejected(
            "file:///workspace/Consumer.ets",
            "read-error",
        )],
    )
    .unwrap();
    f.publish_group("reject", 1).unwrap();
    let q = ReferenceCandidateQuery {
        declaration_uri: "file:///workspace/Target.ets".into(),
        declaration_position: Position::new(0, 14),
        limit: 100,
    };
    let result = f.search_reference_candidates(&q, &[], &[]).unwrap();
    assert!(
        !result.identity_complete,
        "rejected source cannot certify exclusion of unknown members"
    );
}
