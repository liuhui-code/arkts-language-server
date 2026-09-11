use std::fs;

use arkts_index_core::{
    Document, Position, ReferenceBindingKind, ReferenceCandidateQuery, SymbolKind, TextRange,
    WorkspaceIndex, WorkspaceSymbol, parse_document_symbols,
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
fn records_named_import_and_reexport_bindings_with_their_source_specifier() {
    let imported = parse_document_symbols(&Document::new(
        "file:///workspace/Consumer.ets",
        "const inertDelimiter = '{'\n\
         import type { PhotoAsset as LocalAsset, Album } from './models/Media'\n\
         import lazy { DeferredPanel } from \"./ui/DeferredPanel\"\n",
    ))
    .expect("named imports should parse");

    assert_eq!(imported.bindings.len(), 3);
    assert_eq!(imported.bindings[0].kind, ReferenceBindingKind::Import);
    assert_eq!(imported.bindings[0].imported_name, "PhotoAsset");
    assert_eq!(imported.bindings[0].local_name, "LocalAsset");
    assert_eq!(imported.bindings[0].source_specifier, "./models/Media");
    assert_eq!(imported.bindings[1].imported_name, "Album");
    assert_eq!(imported.bindings[1].local_name, "Album");
    assert_eq!(imported.bindings[2].imported_name, "DeferredPanel");
    assert_eq!(imported.bindings[2].source_specifier, "./ui/DeferredPanel");

    let reexported = parse_document_symbols(&Document::new(
        "file:///workspace/PublicApi.ets",
        "export { PhotoAsset as PublicPhotoAsset, Album } from './models/Media'\n",
    ))
    .expect("named re-exports should parse");

    assert_eq!(reexported.bindings.len(), 2);
    assert_eq!(reexported.bindings[0].kind, ReferenceBindingKind::ReExport);
    assert_eq!(reexported.bindings[0].imported_name, "PhotoAsset");
    assert_eq!(reexported.bindings[0].local_name, "PublicPhotoAsset");
    assert_eq!(reexported.bindings[0].source_specifier, "./models/Media");
    assert_eq!(reexported.bindings[1].imported_name, "Album");
    assert_eq!(reexported.bindings[1].local_name, "Album");
}

#[test]
fn reference_candidates_expose_the_binding_chain_for_later_identity_narrowing() {
    let mut index = WorkspaceIndex::in_memory();
    index
        .refresh(
            1,
            [
                Document::new("file:///workspace/Target.ets", "export class Thing {}\n"),
                Document::new(
                    "file:///workspace/Barrel.ets",
                    "export { Thing as PublicThing } from './Target'\n",
                ),
                Document::new(
                    "file:///workspace/Consumer.ets",
                    "import { PublicThing as Alias } from './Barrel'\nconst value = new Alias()\n",
                ),
            ],
            &[],
        )
        .expect("reference generation should commit");

    let result = index
        .search_reference_candidates(ReferenceCandidateQuery {
            declaration_uri: "file:///workspace/Target.ets".to_owned(),
            declaration_position: Position::new(0, 14),
            limit: 20,
        })
        .expect("reference candidates should be searchable");

    assert_eq!(result.bindings.len(), 2);
    assert_eq!(result.bindings[0].kind, ReferenceBindingKind::ReExport);
    assert_eq!(result.bindings[0].uri, "file:///workspace/Barrel.ets");
    assert_eq!(result.bindings[0].imported_name, "Thing");
    assert_eq!(result.bindings[0].local_name, "PublicThing");
    assert_eq!(result.bindings[0].source_specifier, "./Target");
    assert_eq!(result.bindings[1].kind, ReferenceBindingKind::Import);
    assert_eq!(result.bindings[1].uri, "file:///workspace/Consumer.ets");
    assert_eq!(result.bindings[1].imported_name, "PublicThing");
    assert_eq!(result.bindings[1].local_name, "Alias");
    assert_eq!(result.bindings[1].source_specifier, "./Barrel");
}

#[test]
fn parses_regex_literals_without_confusing_them_with_delimiters_or_division() {
    let document = Document::new(
        "file:///workspace/RegexService.ets",
        r#"
export class RegexService {
  normalize(value: string): string {
    const withoutEdges = value.replace(/^\[|\]$/g, '')
    const groups = value.match(/\[([^\]]+)\]/g)
    return withoutEdges.replace(/\//g, '')
  }

  ratio(total: number, count: number): number {
    return total / count
  }

  afterDivision(): void {}
}
"#,
    );

    let symbols = parse_document_symbols(&document)
        .expect("regex delimiters should not make a balanced document malformed")
        .symbols;
    let names: Vec<_> = symbols.into_iter().map(|symbol| symbol.name).collect();

    assert_eq!(
        names,
        ["RegexService", "normalize", "ratio", "afterDivision"]
    );
}

#[test]
fn keeps_postfix_division_and_comments_out_of_regex_scanning() {
    let document = Document::new(
        "file:///workspace/ArithmeticService.ets",
        r#"
export class ArithmeticService {
  ratio(total: number | undefined, count: number): number {
    // Regex-looking comment delimiters must stay inert: /[({]/
    /* The same applies to block comments: /[)}]/ */
    return total! / count
  }

  afterDivision(): void {}
}
"#,
    );

    let symbols = parse_document_symbols(&document)
        .expect("a postfix assertion followed by division is not a regex literal")
        .symbols;
    let names: Vec<_> = symbols.into_iter().map(|symbol| symbol.name).collect();

    assert_eq!(names, ["ArithmeticService", "ratio", "afterDivision"]);
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
fn exported_const_function_is_searchable_for_reference_candidates() {
    let mut index = WorkspaceIndex::in_memory();
    index
        .refresh(
            1,
            [
                Document::new(
                    "file:///workspace/Consts.ets",
                    "export const getMutuallyExclusiveDesc = (key: string): string => key\n",
                ),
                Document::new(
                    "file:///workspace/Consumer.ets",
                    "import { getMutuallyExclusiveDesc } from './Consts'\n\
                     const value = getMutuallyExclusiveDesc('key')\n",
                ),
            ],
            &[],
        )
        .expect("reference generation should commit");

    let result = index
        .search_reference_candidates(ReferenceCandidateQuery {
            declaration_uri: "file:///workspace/Consts.ets".to_owned(),
            declaration_position: Position::new(0, 15),
            limit: 20,
        })
        .expect("exported const reference candidates should be searchable");

    assert!(result.supported);
    assert!(result.complete);
    assert_eq!(result.names, ["getMutuallyExclusiveDesc"]);
    assert_eq!(
        result.uris,
        [
            "file:///workspace/Consts.ets",
            "file:///workspace/Consumer.ets",
        ]
    );
}

#[test]
fn exported_enum_is_searchable_for_reference_candidates() {
    let mut index = WorkspaceIndex::in_memory();
    index
        .refresh(
            1,
            [
                Document::new(
                    "file:///workspace/Consts.ets",
                    "export enum ConflictFunc { AI, EDIT, CROP }\n",
                ),
                Document::new(
                    "file:///workspace/Consumer.ets",
                    "import { ConflictFunc } from './Consts'\n\
                     const value = ConflictFunc.AI\n",
                ),
            ],
            &[],
        )
        .expect("reference generation should commit");

    let result = index
        .search_reference_candidates(ReferenceCandidateQuery {
            declaration_uri: "file:///workspace/Consts.ets".to_owned(),
            declaration_position: Position::new(0, 14),
            limit: 20,
        })
        .expect("exported enum reference candidates should be searchable");

    assert!(result.supported);
    assert!(result.complete);
    assert_eq!(result.names, ["ConflictFunc"]);
    assert_eq!(
        result.uris,
        [
            "file:///workspace/Consts.ets",
            "file:///workspace/Consumer.ets",
        ]
    );
    assert_eq!(first_match(&index, "ConflictFunc").kind, SymbolKind::Enum);
}

#[test]
fn exported_interface_is_searchable_for_reference_candidates() {
    let mut index = WorkspaceIndex::in_memory();
    index
        .refresh(
            1,
            [
                Document::new(
                    "file:///workspace/Consts.ets",
                    "export interface ConflictContent { type: number }\n",
                ),
                Document::new(
                    "file:///workspace/Consumer.ets",
                    "import { ConflictContent } from './Consts'\n\
                     const value: ConflictContent = { type: 1 }\n",
                ),
            ],
            &[],
        )
        .expect("reference generation should commit");

    let result = index
        .search_reference_candidates(ReferenceCandidateQuery {
            declaration_uri: "file:///workspace/Consts.ets".to_owned(),
            declaration_position: Position::new(0, 20),
            limit: 20,
        })
        .expect("exported interface reference candidates should be searchable");

    assert!(result.supported);
    assert!(result.complete);
    assert_eq!(result.names, ["ConflictContent"]);
    assert_eq!(
        result.uris,
        [
            "file:///workspace/Consts.ets",
            "file:///workspace/Consumer.ets",
        ]
    );
    assert_eq!(
        first_match(&index, "ConflictContent").kind,
        SymbolKind::Interface
    );
}

#[test]
fn exported_type_alias_is_searchable_for_reference_candidates() {
    let mut index = WorkspaceIndex::in_memory();
    index
        .refresh(
            1,
            [
                Document::new(
                    "file:///workspace/MoveDialog.ets",
                    "export type PhotoAsset = photoAccessHelper.PhotoAsset;\n",
                ),
                Document::new(
                    "file:///workspace/RecoverMenuOperation.ets",
                    "import { PhotoAsset } from './MoveDialog'\n\
                     const assets: PhotoAsset[] = []\n",
                ),
            ],
            &[],
        )
        .expect("reference generation should commit");

    let result = index
        .search_reference_candidates(ReferenceCandidateQuery {
            declaration_uri: "file:///workspace/MoveDialog.ets".to_owned(),
            declaration_position: Position::new(0, 14),
            limit: 20,
        })
        .expect("exported type alias reference candidates should be searchable");

    assert!(result.supported);
    assert!(result.complete);
    assert_eq!(result.names, ["PhotoAsset"]);
    assert_eq!(
        result.uris,
        [
            "file:///workspace/MoveDialog.ets",
            "file:///workspace/RecoverMenuOperation.ets",
        ]
    );
    assert_eq!(
        first_match(&index, "PhotoAsset").kind,
        SymbolKind::TypeAlias
    );
}

#[test]
fn semicolonless_exported_value_does_not_capture_a_later_arrow_function() {
    let mut index = WorkspaceIndex::in_memory();
    index
        .refresh(
            1,
            [Document::new(
                "file:///workspace/Values.ets",
                "export const count = 1\nconst local = () => count\n",
            )],
            &[],
        )
        .expect("reference generation should commit");

    let result = index
        .search_reference_candidates(ReferenceCandidateQuery {
            declaration_uri: "file:///workspace/Values.ets".to_owned(),
            declaration_position: Position::new(0, 14),
            limit: 20,
        })
        .expect("unsupported exported values should fail conservative");

    assert!(!result.supported);
    assert!(!result.complete);
    assert!(result.uris.is_empty());
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
