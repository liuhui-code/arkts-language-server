use std::fs;

use arkts_index_core::{
    Document, Position, SymbolKind, TextRange, WorkspaceIndex, WorkspaceSymbol,
};

fn fixture(name: &str) -> String {
    fs::read_to_string(format!("../../fixtures/index/{name}"))
        .expect("workspace-symbol fixture should be readable")
}

fn first_match(index: &WorkspaceIndex, query: &str) -> WorkspaceSymbol {
    index
        .search(query, 20)
        .expect("in-memory search should succeed")
        .items
        .remove(0)
}

#[test]
fn refreshes_arkts_documents_and_searches_workspace_symbols() {
    let mut index = WorkspaceIndex::in_memory();
    let report = index
        .refresh(
            1,
            [
                Document::new("file:///workspace/Main.ets", fixture("Main.ets")),
                Document::new("file:///workspace/Person.ets", fixture("Person.ets")),
            ],
            &[],
        )
        .expect("in-memory refresh should commit");

    assert_eq!(report.indexed_documents, 2);
    assert!(report.rejected_documents.is_empty());

    let main_page = first_match(&index, "MainPage");
    assert_eq!(main_page.name, "MainPage");
    assert_eq!(main_page.kind, SymbolKind::Struct);
    assert_eq!(main_page.uri, "file:///workspace/Main.ets");
    assert_eq!(main_page.container, None);
    assert_eq!(
        main_page.range,
        TextRange::new(Position::new(2, 7), Position::new(2, 15))
    );

    let person = first_match(&index, "Person");
    assert_eq!(person.kind, SymbolKind::Class);
    assert_eq!(person.uri, "file:///workspace/Person.ets");
    assert_eq!(person.container, None);

    let greeting = first_match(&index, "makeGreeting");
    assert_eq!(greeting.kind, SymbolKind::Function);
    assert_eq!(greeting.container, None);

    let greet = first_match(&index, "greet");
    assert_eq!(greet.kind, SymbolKind::Method);
    assert_eq!(greet.container.as_deref(), Some("MainPage"));
    assert_eq!(
        greet.range,
        TextRange::new(Position::new(9, 11), Position::new(9, 16))
    );

    let display_name = first_match(&index, "displayName");
    assert_eq!(display_name.kind, SymbolKind::Method);
    assert_eq!(display_name.container.as_deref(), Some("Person"));
}

#[test]
fn ranks_prefix_symbol_matches_before_substring_matches() {
    let mut index = WorkspaceIndex::in_memory();
    index
        .refresh(
            1,
            [Document::new(
                "file:///workspace/Ranking.ets",
                "class DomainMain {}\nclass MainPanel {}\n",
            )],
            &[],
        )
        .expect("in-memory refresh should commit");

    let names: Vec<_> = index
        .search("Main", 20)
        .expect("in-memory search should succeed")
        .items
        .into_iter()
        .map(|symbol| symbol.name)
        .collect();

    assert_eq!(names, ["MainPanel", "DomainMain"]);
}

#[test]
fn excludes_document_uris_before_ranking_and_limiting() {
    let mut index = WorkspaceIndex::in_memory();
    index
        .refresh(
            1,
            [
                Document::new("file:///workspace/A.ets", "class TwinService {}\n"),
                Document::new("file:///workspace/B.ets", "class TwinService {}\n"),
            ],
            &[],
        )
        .expect("in-memory refresh should commit");

    let excluded = index
        .search_excluding("TwinService", 1, &["file:///workspace/A.ets".to_owned()])
        .expect("excluded search should succeed");

    assert_eq!(excluded.items.len(), 1);
    assert_eq!(excluded.items[0].uri, "file:///workspace/B.ets");
}

#[test]
fn finds_camel_case_symbols_by_acronym() {
    let mut index = WorkspaceIndex::in_memory();
    index
        .refresh(
            1,
            [Document::new(
                "file:///workspace/Main.ets",
                fixture("Main.ets"),
            )],
            &[],
        )
        .expect("in-memory refresh should commit");

    let matches = index
        .search("MP", 20)
        .expect("in-memory search should succeed")
        .items;

    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].name, "MainPage");
    assert_eq!(matches[0].kind, SymbolKind::Struct);
}

#[test]
fn rejects_one_malformed_document_without_failing_the_refresh_batch() {
    let mut index = WorkspaceIndex::in_memory();
    let report = index
        .refresh(
            1,
            [
                Document::new(
                    "file:///workspace/Healthy.ets",
                    "export class HealthyService {}\n",
                ),
                Document::new(
                    "file:///workspace/Broken.ets",
                    "export class BrokenService {\n  run() {\n",
                ),
            ],
            &[],
        )
        .expect("healthy documents should still commit");

    assert_eq!(report.indexed_documents, 1);
    assert_eq!(report.rejected_documents, ["file:///workspace/Broken.ets"]);
    assert_eq!(
        index
            .search("HealthyService", 20)
            .expect("in-memory search should succeed")
            .items
            .len(),
        1
    );
    assert!(
        index
            .search("BrokenService", 20)
            .expect("in-memory search should succeed")
            .items
            .is_empty()
    );
}
