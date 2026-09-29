use arkts_index_core::{
    ClassBaseBinding, Document, Position, TextRange, resolve_class_base_binding,
};

#[test]
fn resolves_a_unique_same_file_base_without_claiming_constructor_semantics() {
    let document = Document::new(
        "file:///workspace/Child.ets",
        "class Base {}\nclass Child extends Base {}\n",
    );
    assert_eq!(
        resolve_class_base_binding(
            std::slice::from_ref(&document),
            &document.uri,
            Position::new(1, 7)
        ),
        ClassBaseBinding::Resolved {
            declaration_uri: document.uri.clone(),
            name: "Base".into(),
            name_range: TextRange::new(Position::new(0, 6), Position::new(0, 10)),
            support_uris: vec![document.uri.clone()],
        }
    );
    assert_eq!(
        resolve_class_base_binding(
            std::slice::from_ref(&document),
            &document.uri,
            Position::new(0, 7)
        ),
        ClassBaseBinding::NoBase
    );
}

#[test]
fn follows_named_import_alias_and_two_explicit_reexport_aliases() {
    let sources = [
        Document::new("file:///workspace/Base.ets", "export class Base {}\n"),
        Document::new(
            "file:///workspace/First.ets",
            "export { Base as Public } from './Base'\n",
        ),
        Document::new(
            "file:///workspace/Second.ets",
            "export { Public as Exposed } from './First'\n",
        ),
        Document::new(
            "file:///workspace/Child.ets",
            "import { Exposed as Alias } from './Second'\nclass Child extends Alias {}\n",
        ),
        Document::new("file:///workspace/Other.ets", "export class Base {}\n"),
    ];
    assert_eq!(
        resolve_class_base_binding(&sources, &sources[3].uri, Position::new(1, 7)),
        ClassBaseBinding::Resolved {
            declaration_uri: sources[0].uri.clone(),
            name: "Base".into(),
            name_range: TextRange::new(Position::new(0, 13), Position::new(0, 17)),
            support_uris: [0, 3, 1, 2]
                .iter()
                .map(|index| sources[*index].uri.clone())
                .collect(),
        }
    );
}

#[test]
fn rejects_import_headers_whose_unsupported_source_was_erased_by_legacy_metadata() {
    for header in [
        "import { Base 123 as Alias } from './Base'",
        "import type { Base as Alias } from './Base'",
        "import { type Base as Alias } from './Base'",
        "const expression = (import { Base as Alias } from './Base')",
    ] {
        let sources = [
            Document::new("file:///workspace/Base.ets", "export class Base {}\n"),
            Document::new(
                "file:///workspace/Child.ets",
                format!("{header}\nclass Child extends Alias {{}}\n"),
            ),
        ];
        assert_eq!(
            resolve_class_base_binding(&sources, &sources[1].uri, Position::new(1, 7)),
            ClassBaseBinding::Unknown,
            "unsupported header: {header}"
        );
    }
}

#[test]
fn conflicting_source_snapshots_never_select_the_first_same_uri_candidate() {
    let sources = [
        Document::new("file:///workspace/Base.ets", "export class Base {}\n"),
        Document::new("file:///workspace/Base.ets", "export class Other {}\n"),
        Document::new(
            "file:///workspace/Child.ets",
            "import { Base } from './Base'\nclass Child extends Base {}\n",
        ),
    ];
    assert_eq!(
        resolve_class_base_binding(&sources, &sources[2].uri, Position::new(1, 7)),
        ClassBaseBinding::Unknown
    );
}

#[test]
fn unmodeled_top_level_value_or_type_bindings_withhold_base_discovery() {
    for local in [
        "const Alias = Other;",
        "let Alias = Other;",
        "var Alias = Other;",
        "function Alias() {}",
        "type Alias = Other;",
    ] {
        let sources = [
            Document::new("file:///workspace/Base.ets", "export class Base {}\n"),
            Document::new(
                "file:///workspace/Child.ets",
                format!(
                    "import {{ Base as Alias }} from './Base'\n{local}\nclass Child extends Alias {{}}\n"
                ),
            ),
        ];
        assert_eq!(
            resolve_class_base_binding(&sources, &sources[1].uri, Position::new(2, 7)),
            ClassBaseBinding::Unknown,
            "unmodeled binding: {local}"
        );
    }
}

#[test]
fn raw_header_boundaries_cannot_be_fabricated_by_dropped_numbers_or_literal_punctuation() {
    for (source, line) in [
        (
            "import { Base } from './Base' 123\nclass Child extends Base {}\n",
            1,
        ),
        (
            "class Child extends Base {}\nimport { Base } from './Base' 123",
            0,
        ),
        (
            "123 import { Base } from './Base'\nclass Child extends Base {}\n",
            1,
        ),
        (
            "'}' import { Base } from './Base'\nclass Child extends Base {}\n",
            1,
        ),
        (
            "import { Base } from './Base' ';'\nclass Child extends Base {}\n",
            1,
        ),
    ] {
        let sources = [
            Document::new("file:///workspace/Base.ets", "export class Base {}\n"),
            Document::new("file:///workspace/Child.ets", source),
        ];
        assert_eq!(
            resolve_class_base_binding(&sources, &sources[1].uri, Position::new(line, 7)),
            ClassBaseBinding::Unknown,
            "invalid header boundary: {source}"
        );
    }
}

#[test]
fn unsupported_reexport_modifiers_never_certify_an_alias_chain() {
    for modifier in ["lazy", "type"] {
        let sources = [
            Document::new("file:///workspace/Base.ets", "export class Base {}\n"),
            Document::new(
                "file:///workspace/Barrel.ets",
                format!("export {modifier} {{ Base as Public }} from './Base'\n"),
            ),
            Document::new(
                "file:///workspace/Child.ets",
                "import { Public } from './Barrel'\nclass Child extends Public {}\n",
            ),
        ];
        assert_eq!(
            resolve_class_base_binding(&sources, &sources[2].uri, Position::new(1, 7)),
            ClassBaseBinding::Unknown,
            "unsupported modifier: {modifier}"
        );
    }
}

#[test]
fn quoted_export_keywords_cannot_fabricate_direct_class_exports() {
    for prefix in ["'export'", "'export' 'declare'", "'export' 'default'"] {
        let sources = [
            Document::new(
                "file:///workspace/Base.ets",
                format!("{prefix}\nclass Base {{}}\n"),
            ),
            Document::new(
                "file:///workspace/Child.ets",
                "import { Base } from './Base'\nclass Child extends Base {}\n",
            ),
        ];
        assert_eq!(
            resolve_class_base_binding(&sources, &sources[1].uri, Position::new(1, 7)),
            ClassBaseBinding::Unknown,
            "not an export: {prefix}"
        );
    }
}

#[test]
fn ambiguity_missing_sources_and_unsupported_bindings_remain_unknown() {
    for (base, header, extras) in [
        (
            "export class Base {}\nexport class Base {}",
            "import { Base } from './Base'",
            vec![],
        ),
        (
            "class Base {}\nexport class Base {}",
            "import { Base } from './Base'",
            vec![],
        ),
        (
            "import { Other as Base } from './Other'\nexport class Base {}",
            "import { Base } from './Base'",
            vec![Document::new(
                "file:///workspace/Other.ets",
                "export class Other {}",
            )],
        ),
        (
            "export class Base {}",
            "import { Base } from './Base'\nimport { Base } from './Base'",
            vec![],
        ),
        (
            "export class Base {}",
            "import { Base } from './Base'\nclass Base {}",
            vec![],
        ),
        ("class Base {}", "import { Base } from './Base'", vec![]),
        (
            "export class Base {}",
            "import { Base } from './Missing'",
            vec![],
        ),
        ("export class Base {}", "import Base from './Base'", vec![]),
        (
            "export class Base {}",
            "import * as Base from './Base'",
            vec![],
        ),
        (
            "export class Base {}",
            "import { Base } from 'package'",
            vec![],
        ),
        (
            "export class Base {}",
            "import { Base } from './Base'",
            vec![Document::new(
                "file:///workspace/Base.ts",
                "export class Base {}",
            )],
        ),
        (
            "export class Base {}",
            "import { Base } from './Base'",
            vec![Document::new(
                "file:///workspace/Base/index.ets",
                "export class Base {}",
            )],
        ),
    ] {
        let mut sources = vec![
            Document::new("file:///workspace/Base.ets", base),
            Document::new(
                "file:///workspace/Child.ets",
                format!("{header}\nclass Child extends Base {{}}\n"),
            ),
        ];
        sources.extend(extras);
        let line = header.lines().count() as u32;
        assert_eq!(
            resolve_class_base_binding(&sources, &sources[1].uri, Position::new(line, 7)),
            ClassBaseBinding::Unknown,
            "ambiguous or unsupported: {base} / {header}"
        );
    }
}

#[test]
fn alias_cycles_and_exhausted_traversal_never_publish_partial_chains() {
    let cycle = [
        Document::new("file:///workspace/A.ets", "export { Base } from './B'"),
        Document::new("file:///workspace/B.ets", "export { Base } from './A'"),
        Document::new(
            "file:///workspace/Child.ets",
            "import { Base } from './A'\nclass Child extends Base {}",
        ),
    ];
    assert_eq!(
        resolve_class_base_binding(&cycle, &cycle[2].uri, Position::new(1, 7)),
        ClassBaseBinding::Unknown
    );
    let mut chain = vec![Document::new(
        "file:///workspace/Child.ets",
        "import { Base } from './Barrel0'\nclass Child extends Base {}",
    )];
    for index in 0..40 {
        chain.push(Document::new(
            format!("file:///workspace/Barrel{index}.ets"),
            format!("export {{ Base }} from './Barrel{}'", index + 1),
        ));
    }
    chain.push(Document::new(
        "file:///workspace/Barrel40.ets",
        "export class Base {}",
    ));
    assert_eq!(
        resolve_class_base_binding(&chain, &chain[0].uri, Position::new(1, 7)),
        ClassBaseBinding::Unknown
    );
}

#[test]
fn supported_comments_crlf_relative_paths_and_utf16_positions_are_preserved() {
    let sources = [
        Document::new(
            "file:///workspace/base%20dir/Base.ets",
            "/* 😀 */ export abstract class Base {}\r\n",
        ),
        Document::new(
            "file:///workspace/child/Child.ets",
            "/* 😀 */ import /* gap */ { Base as Alias, } from '../base dir/Base.ets';\r\nclass Child extends Alias {}\r\n",
        ),
    ];
    assert_eq!(
        resolve_class_base_binding(&sources, &sources[1].uri, Position::new(1, 7)),
        ClassBaseBinding::Resolved {
            declaration_uri: sources[0].uri.clone(),
            name: "Base".into(),
            name_range: TextRange::new(Position::new(0, 31), Position::new(0, 35)),
            support_uris: sources
                .iter()
                .map(|document| document.uri.clone())
                .collect(),
        }
    );
}

#[test]
fn partial_or_missing_facts_do_not_become_known_empty_heritage() {
    for source in [
        "class Child extends NS.Base {}",
        "class Child extends Base implements X {}",
        "class Child extends Base<T> {}",
        "class Child extends Base {",
        "class Child { /* unterminated",
        "class Child {}\nconst value = `template`;",
        "class Child extends Base {}\nclass { }",
        "",
    ] {
        let document = Document::new("file:///workspace/Child.ets", source);
        assert_eq!(
            resolve_class_base_binding(
                std::slice::from_ref(&document),
                &document.uri,
                Position::new(0, 7)
            ),
            ClassBaseBinding::Unknown,
            "unsupported or missing facts: {source}"
        );
    }
    assert_eq!(
        resolve_class_base_binding(&[], "file:///workspace/Missing.ets", Position::new(0, 7)),
        ClassBaseBinding::Unknown
    );
}
