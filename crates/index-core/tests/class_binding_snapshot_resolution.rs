use arkts_index_core::{
    ClassBaseBinding, Document, Position, TextRange, WorkspaceIndex, resolve_class_base_binding,
    resolve_class_base_binding_snapshot,
};

const CHILD: &str = "file:///workspace/Child.ets";
const BASE: &str = "file:///workspace/Base.ets";
const OTHER: &str = "file:///workspace/Other.ets";

#[test]
fn unsaved_source_replaces_persisted_binding_spelling_without_mutating_the_snapshot() {
    let mut index = WorkspaceIndex::in_memory();
    index
        .refresh(
            7,
            [
                Document::new(BASE, "export class Base {}\n"),
                Document::new(OTHER, "/* 😀 */ export class Other {}\n"),
                Document::new(
                    CHILD,
                    "import { Base } from './Base.ets'\nclass Child extends Base {}\n",
                ),
            ],
            &[],
        )
        .unwrap();
    let snapshot = index
        .class_binding_snapshot(&[CHILD.into(), BASE.into(), OTHER.into()])
        .unwrap();
    let before = snapshot.clone();
    assert_eq!(
        resolve_class_base_binding_snapshot(
            &snapshot,
            7,
            &[Document::new(
                CHILD,
                "import { Other as Current } from './Other.ets'\nclass Child extends Current {}\n"
            ),],
            CHILD,
            Position::new(1, 7)
        ),
        ClassBaseBinding::Resolved {
            declaration_uri: OTHER.into(),
            name: "Other".into(),
            name_range: TextRange::new(Position::new(0, 22), Position::new(0, 27)),
            support_uris: vec![CHILD.into(), OTHER.into()],
        }
    );
    assert_eq!(snapshot, before);
}

#[test]
fn persisted_named_alias_chain_agrees_with_the_fresh_source_discovery_contract() {
    let sources = [
        Document::new(BASE, "export class Base {}\n"),
        Document::new(
            "file:///workspace/First.ets",
            "export { Base as Public } from './Base.ets'\n",
        ),
        Document::new(
            "file:///workspace/Second.ets",
            "export { Public as Exposed } from './First.ets'\n",
        ),
        Document::new(
            CHILD,
            "import { Exposed as Alias } from './Second.ets'\nclass Child extends Alias {}\n",
        ),
    ];
    let mut index = WorkspaceIndex::in_memory();
    index.refresh(7, sources.clone(), &[]).unwrap();
    let snapshot = index
        .class_binding_snapshot(
            &sources
                .iter()
                .map(|item| item.uri.clone())
                .collect::<Vec<_>>(),
        )
        .unwrap();
    let fresh = resolve_class_base_binding(&sources, CHILD, Position::new(1, 7));
    assert!(matches!(fresh, ClassBaseBinding::Resolved { .. }));
    assert_eq!(
        resolve_class_base_binding_snapshot(&snapshot, 7, &[], CHILD, Position::new(1, 7)),
        fresh
    );
}

#[test]
fn bounded_snapshot_does_not_certify_an_extensionless_source_from_one_available_row() {
    let sources = [
        Document::new(BASE, "export class Base {}\n"),
        Document::new(
            CHILD,
            "import { Base } from './Base'\nclass Child extends Base {}\n",
        ),
    ];
    let mut index = WorkspaceIndex::in_memory();
    index.refresh(7, sources.clone(), &[]).unwrap();
    let snapshot = index
        .class_binding_snapshot(&[CHILD.into(), BASE.into()])
        .unwrap();
    // The old API's caller supplies its source universe. A bounded store snapshot
    // cannot prove that the omitted Base.ts (or an unknown legacy row) is absent.
    assert!(matches!(
        resolve_class_base_binding(&sources, CHILD, Position::new(1, 7)),
        ClassBaseBinding::Resolved { .. }
    ));
    assert_eq!(
        resolve_class_base_binding_snapshot(&snapshot, 7, &[], CHILD, Position::new(1, 7)),
        ClassBaseBinding::Unknown
    );
}

#[test]
fn overlay_admission_rejects_foreign_or_duplicate_uris_instead_of_ignoring_them() {
    let mut index = WorkspaceIndex::in_memory();
    index
        .refresh(
            7,
            [
                Document::new(BASE, "export class Base {}\n"),
                Document::new(
                    CHILD,
                    "import { Base } from './Base.ets'\nclass Child extends Base {}\n",
                ),
            ],
            &[],
        )
        .unwrap();
    let snapshot = index
        .class_binding_snapshot(&[CHILD.into(), BASE.into()])
        .unwrap();
    for overlays in [
        vec![Document::new(OTHER, "export class Other {}")],
        vec![
            Document::new(BASE, "export class Base {}"),
            Document::new(BASE, "export class Base {}"),
        ],
    ] {
        assert_eq!(
            resolve_class_base_binding_snapshot(
                &snapshot,
                7,
                &overlays,
                CHILD,
                Position::new(1, 7)
            ),
            ClassBaseBinding::Unknown
        );
    }
}

#[test]
fn public_snapshot_shape_cannot_forge_a_successful_resolution() {
    let mut index = WorkspaceIndex::in_memory();
    index
        .refresh(
            7,
            [
                Document::new(BASE, "export class Base {}\n"),
                Document::new(
                    CHILD,
                    "import { Base } from './Base.ets'\nclass Child extends Base {}\n",
                ),
            ],
            &[],
        )
        .unwrap();
    let snapshot = index
        .class_binding_snapshot(&[CHILD.into(), BASE.into(), OTHER.into()])
        .unwrap();
    let mut wrong_heritage_uri = snapshot.clone();
    wrong_heritage_uri.documents[0]
        .heritage
        .as_mut()
        .unwrap()
        .uri = OTHER.into();
    let mut wrong_binding_uri = snapshot.clone();
    wrong_binding_uri.documents[0].bindings[0].uri = OTHER.into();
    let mut duplicate_exports = snapshot.clone();
    let provenance = duplicate_exports.documents[1]
        .binding_provenance
        .as_mut()
        .unwrap();
    provenance.direct_exports.push(provenance.direct_exports[0]);
    let mut duplicate_unknown = snapshot.clone();
    duplicate_unknown
        .documents
        .push(snapshot.documents[2].clone());
    for forged in [
        wrong_heritage_uri,
        wrong_binding_uri,
        duplicate_exports,
        duplicate_unknown,
    ] {
        assert_eq!(
            resolve_class_base_binding_snapshot(&forged, 7, &[], CHILD, Position::new(1, 7)),
            ClassBaseBinding::Unknown
        );
    }
}

#[test]
fn malformed_or_unsupported_current_source_never_falls_back_to_persisted_success() {
    let sources = [
        Document::new(BASE, "export class Base {}\n"),
        Document::new(
            "file:///workspace/Barrel.ets",
            "export { Base as Public } from './Base.ets'\n",
        ),
        Document::new(
            CHILD,
            "import { Public } from './Barrel.ets'\nclass Child extends Public {}\n",
        ),
    ];
    let mut index = WorkspaceIndex::in_memory();
    index.refresh(7, sources.clone(), &[]).unwrap();
    let snapshot = index
        .class_binding_snapshot(
            &sources
                .iter()
                .map(|item| item.uri.clone())
                .collect::<Vec<_>>(),
        )
        .unwrap();
    assert!(matches!(
        resolve_class_base_binding_snapshot(&snapshot, 7, &[], CHILD, Position::new(1, 7)),
        ClassBaseBinding::Resolved { .. }
    ));
    for overlay in [
        Document::new(
            CHILD,
            "import { Public } from './Barrel.ets'\nclass Child extends Public {",
        ),
        Document::new(
            "file:///workspace/Barrel.ets",
            "export { Base as Public } from './Base.ets'\n/*",
        ),
        Document::new(
            "file:///workspace/Barrel.ets",
            "export * from './Base.ets'\n",
        ),
        Document::new(BASE, "export default class Base {}\n"),
    ] {
        assert_eq!(
            resolve_class_base_binding_snapshot(
                &snapshot,
                7,
                &[overlay],
                CHILD,
                Position::new(1, 7)
            ),
            ClassBaseBinding::Unknown
        );
    }
}

#[test]
fn valid_current_source_can_fill_a_requested_unknown_document() {
    let mut index = WorkspaceIndex::in_memory();
    index
        .refresh(
            7,
            [Document::new(
                CHILD,
                "import { Base } from './Base.ets'\nclass Child extends Base {}\n",
            )],
            &[],
        )
        .unwrap();
    let snapshot = index
        .class_binding_snapshot(&[CHILD.into(), BASE.into()])
        .unwrap();
    assert_eq!(
        resolve_class_base_binding_snapshot(&snapshot, 7, &[], CHILD, Position::new(1, 7)),
        ClassBaseBinding::Unknown
    );
    assert!(matches!(
        resolve_class_base_binding_snapshot(
            &snapshot,
            7,
            &[Document::new(BASE, "export class Base {}\n")],
            CHILD,
            Position::new(1, 7)
        ),
        ClassBaseBinding::Resolved { .. }
    ));
    assert!(snapshot.documents[1].heritage.is_none());
}

#[test]
fn generation_mismatch_remains_unknown_even_with_valid_current_source() {
    let mut index = WorkspaceIndex::in_memory();
    index
        .refresh(7, [Document::new(CHILD, "class Child {}\n")], &[])
        .unwrap();
    let snapshot = index.class_binding_snapshot(&[CHILD.into()]).unwrap();
    assert_eq!(
        resolve_class_base_binding_snapshot(
            &snapshot,
            8,
            &[Document::new(CHILD, "class Child {}\n")],
            CHILD,
            Position::new(0, 7)
        ),
        ClassBaseBinding::Unknown
    );
}

#[test]
fn transient_resolved_source_fields_are_not_authority() {
    let mut index = WorkspaceIndex::in_memory();
    index
        .refresh(
            7,
            [
                Document::new(BASE, "export class Base {}\n"),
                Document::new(OTHER, "export class Other {}\n"),
                Document::new(
                    CHILD,
                    "import { Base } from './Base.ets'\nclass Child extends Base {}\n",
                ),
            ],
            &[],
        )
        .unwrap();
    let mut snapshot = index
        .class_binding_snapshot(&[CHILD.into(), BASE.into(), OTHER.into()])
        .unwrap();
    let expected =
        resolve_class_base_binding_snapshot(&snapshot, 7, &[], CHILD, Position::new(1, 7));
    assert!(matches!(expected, ClassBaseBinding::Resolved { .. }));
    let binding = &mut snapshot.documents[0].bindings[0];
    binding.source_resolution = arkts_index_core::ReferenceBindingResolution::Unique;
    binding.resolved_source_uri = Some(OTHER.into());
    binding.external_terminal_identity = Some("forged:identity".into());
    assert_eq!(
        resolve_class_base_binding_snapshot(&snapshot, 7, &[], CHILD, Position::new(1, 7)),
        expected
    );
}

#[test]
fn local_base_and_no_base_match_fresh_discovery_but_never_constructor_completeness() {
    for source in [
        "class Base {}\nclass Child extends Base {}\n",
        "class Base {}\nclass Child {}\n",
    ] {
        let sources = [Document::new(CHILD, source)];
        let mut index = WorkspaceIndex::in_memory();
        index.refresh(7, sources.clone(), &[]).unwrap();
        let snapshot = index.class_binding_snapshot(&[CHILD.into()]).unwrap();
        let expected = resolve_class_base_binding(&sources, CHILD, Position::new(1, 7));
        assert_ne!(expected, ClassBaseBinding::Unknown);
        assert_eq!(
            resolve_class_base_binding_snapshot(&snapshot, 7, &[], CHILD, Position::new(1, 7)),
            expected
        );
    }
}

#[test]
fn an_extensionless_reexport_is_unknown_even_after_an_explicit_import_hop() {
    let sources = [
        Document::new(BASE, "export class Base {}\n"),
        Document::new(
            "file:///workspace/Barrel.ets",
            "export { Base as Public } from './Base'\n",
        ),
        Document::new(
            CHILD,
            "import { Public } from './Barrel.ets'\nclass Child extends Public {}\n",
        ),
    ];
    let mut index = WorkspaceIndex::in_memory();
    index.refresh(7, sources.clone(), &[]).unwrap();
    let snapshot = index
        .class_binding_snapshot(
            &sources
                .iter()
                .map(|item| item.uri.clone())
                .collect::<Vec<_>>(),
        )
        .unwrap();
    assert!(matches!(
        resolve_class_base_binding(&sources, CHILD, Position::new(1, 7)),
        ClassBaseBinding::Resolved { .. }
    ));
    assert_eq!(
        resolve_class_base_binding_snapshot(&snapshot, 7, &[], CHILD, Position::new(1, 7)),
        ClassBaseBinding::Unknown
    );
}

#[test]
fn cycles_and_traversal_budget_never_return_a_partial_discovery_chain() {
    let mut sources = vec![Document::new(
        CHILD,
        "import { Base } from './Hop0.ets'\nclass Child extends Base {}\n",
    )];
    for hop in 0..32 {
        sources.push(Document::new(
            format!("file:///workspace/Hop{hop}.ets"),
            format!("export {{ Base }} from './Hop{}.ets'\n", hop + 1),
        ));
    }
    sources.push(Document::new(
        "file:///workspace/Hop32.ets",
        "export class Base {}\n",
    ));
    let mut index = WorkspaceIndex::in_memory();
    index.refresh(7, sources.clone(), &[]).unwrap();
    let uris = sources
        .iter()
        .map(|item| item.uri.clone())
        .collect::<Vec<_>>();
    let snapshot = index.class_binding_snapshot(&uris).unwrap();
    assert_eq!(
        resolve_class_base_binding_snapshot(&snapshot, 7, &[], CHILD, Position::new(1, 7)),
        ClassBaseBinding::Unknown
    );
    let cyclic = Document::new(
        "file:///workspace/Hop1.ets",
        "export { Base } from './Hop0.ets'\n",
    );
    assert_eq!(
        resolve_class_base_binding_snapshot(&snapshot, 7, &[cyclic], CHILD, Position::new(1, 7)),
        ClassBaseBinding::Unknown
    );
}

#[test]
fn unknown_competing_rows_and_oversized_snapshot_do_not_certify_absence() {
    let mut index = WorkspaceIndex::in_memory();
    index
        .refresh(
            7,
            [
                Document::new(BASE, "export class Base {}\n"),
                Document::new(
                    CHILD,
                    "import { Base } from './Base'\nclass Child extends Base {}\n",
                ),
            ],
            &[],
        )
        .unwrap();
    let mut uris = vec![CHILD.into(), BASE.into()];
    for suffix in [
        ".ts",
        ".d.ets",
        ".d.ts",
        "/index.ets",
        "/index.ts",
        "/index.d.ets",
        "/index.d.ts",
    ] {
        uris.push(format!("file:///workspace/Base{suffix}"));
    }
    let mut snapshot = index.class_binding_snapshot(&uris).unwrap();
    assert_eq!(
        resolve_class_base_binding_snapshot(&snapshot, 7, &[], CHILD, Position::new(1, 7)),
        ClassBaseBinding::Unknown
    );
    assert_eq!(
        resolve_class_base_binding_snapshot(&snapshot, 7, &[], BASE, Position::new(0, 14)),
        ClassBaseBinding::NoBase
    );
    for number in 0..128 {
        let mut row = snapshot.documents[2].clone();
        row.uri = format!("file:///workspace/Unknown{number}.ets");
        snapshot.documents.push(row);
    }
    // Even a known local no-base answer must obey snapshot URI admission.
    assert_eq!(
        resolve_class_base_binding_snapshot(&snapshot, 7, &[], BASE, Position::new(0, 14)),
        ClassBaseBinding::Unknown
    );
}
