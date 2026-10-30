use arkts_index_core::{
    Document, FullCatalogBatch, MemoryStore, Position, ReferenceCandidateQuery, WorkspaceIndex,
    parse_document_symbols,
};
use arkts_index_sqlite::{CatalogStore, build_catalog};

#[path = "support/temp_dir.rs"]
mod temp_dir;
const ROOT: &str = "file:///catalog-query-parity";

fn sources(name: &str) -> Vec<Document> {
    vec![
        Document::new(
            format!("{ROOT}/Target.ets"),
            format!("export class {name} {{ member: number = 1 }}"),
        ),
        Document::new(
            format!("{ROOT}/Consumer.ets"),
            format!("import {{ {name} as LocalAlias }} from './Target'\nnew LocalAlias()"),
        ),
    ]
}

#[test]
fn publication_and_incremental_edits_preserve_fts_exports_references_and_class_facts() {
    let temp = temp_dir::TestDir::new("catalog-query-parity");
    let database = temp.path().join("symbols-v2.sqlite3");
    let mut actual = WorkspaceIndex::with_store(CatalogStore::open(&database, ROOT).unwrap());
    let mut expected = WorkspaceIndex::with_store(MemoryStore::default());
    for (generation, name) in [(1, "LegacyMarker"), (2, "CurrentMarker")] {
        let documents: Vec<_> = sources(name)
            .iter()
            .map(|d| parse_document_symbols(d).unwrap())
            .collect();
        expected
            .activate_catalog(generation, documents.clone(), vec![])
            .unwrap();
        build_catalog(
            &database,
            ROOT,
            FullCatalogBatch {
                generation,
                documents,
                rejected_uris: vec![],
            },
            |_| true,
        )
        .unwrap();
        parity(&actual, &expected);
    }
    let edits = sources("EditedMarker");
    actual.refresh(3, edits.clone(), &[]).unwrap();
    expected.refresh(3, edits, &[]).unwrap();
    parity(&actual, &expected);
    assert!(actual.search("CurrentMarker", 20).unwrap().items.is_empty());
}

fn parity(actual: &WorkspaceIndex, expected: &WorkspaceIndex) {
    for query in [
        "LegacyMarker",
        "CurrentMarker",
        "EditedMarker",
        "Marker",
        "member",
        "LocalAlias",
    ] {
        assert_eq!(
            actual.search(query, 32).unwrap(),
            expected.search(query, 32).unwrap()
        );
        assert_eq!(
            actual.search_exports(query, 32).unwrap(),
            expected.search_exports(query, 32).unwrap()
        );
    }
    let target = format!("{ROOT}/Target.ets");
    let query = ReferenceCandidateQuery {
        declaration_uri: target.clone(),
        declaration_position: Position::new(0, 14),
        limit: 32,
    };
    assert_eq!(
        actual.search_reference_candidates(query.clone()).unwrap(),
        expected.search_reference_candidates(query).unwrap()
    );
    assert_eq!(
        actual.class_heritage(&target).unwrap(),
        expected.class_heritage(&target).unwrap()
    );
    assert_eq!(
        actual.class_binding_snapshot(&[target.clone()]).unwrap(),
        expected.class_binding_snapshot(&[target]).unwrap()
    );
}
