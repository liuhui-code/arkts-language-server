use arkts_index_core::{Document, Position, TextRange, parse_document_class_heritage};

#[test]
fn records_named_classes_and_local_base_spelling_without_resolving_identity() {
    let source = "import { Original as LocalBase } from './Base'\n\
                  export class Child extends LocalBase { constructor() { super() } }\n\
                  class Leaf extends Child { static make() { return new this() } }\n";
    let facts =
        parse_document_class_heritage(&Document::new("file:///workspace/Child.ets", source))
            .expect("supported named class declarations should provide lexical facts");
    assert!(facts.lexically_complete);
    assert_eq!(facts.uri, "file:///workspace/Child.ets");
    assert_eq!(facts.classes.len(), 2);
    assert_eq!(facts.classes[0].name, "Child");
    assert_eq!(
        facts.classes[0].name_range,
        TextRange::new(Position::new(1, 13), Position::new(1, 18))
    );
    let base = facts.classes[0]
        .base
        .as_ref()
        .expect("explicit simple heritage");
    assert_eq!(
        base.name, "LocalBase",
        "spelling is not import-resolved semantic identity"
    );
    assert_eq!(
        base.range,
        TextRange::new(Position::new(1, 27), Position::new(1, 36))
    );
    assert_eq!(facts.classes[1].base.as_ref().unwrap().name, "Child");
    assert_eq!(
        facts.classes[0].declaration_range.start,
        Position::new(1, 0)
    );
    assert_eq!(facts.classes[0].declaration_range.end, Position::new(1, 66));
}

#[test]
fn skipped_templates_cannot_certify_complete_heritage() {
    let source = "class Base {}\nconst hidden = `${class Hidden extends Base {}}`;\n";
    let facts = parse_document_class_heritage(&Document::new("file:///template.ets", source))
        .expect("unsupported but balanced source can provide discovery facts");
    assert!(
        !facts.lexically_complete,
        "template interpolation was not analyzed"
    );
    assert_eq!(facts.classes.len(), 1);
    assert_eq!(facts.classes[0].name, "Base");
}

#[test]
fn dropped_numeric_header_tokens_cannot_form_supported_heritage() {
    for source in [
        "class A extends Base 123 {}",
        "class A 123 {}",
        "class 123 A {}",
        "export 123 class A {}",
    ] {
        let facts = parse_document_class_heritage(&Document::new("file:///numeric.ets", source))
            .expect("balanced unsupported headers should be incomplete");
        assert!(!facts.lexically_complete, "dropped header token: {source}");
        assert!(
            facts.classes.is_empty(),
            "unsupported header must not emit a class"
        );
    }
}

#[test]
fn newline_expression_prefixes_do_not_turn_class_expressions_into_declarations() {
    for prefix in [
        "new",
        "typeof",
        "void",
        "await",
        "yield",
        "instanceof",
        "in",
    ] {
        let source = format!("const value = {prefix}\nclass Child extends Base {{}}");
        let facts = parse_document_class_heritage(&Document::new("file:///expression.ets", source))
            .expect("unsupported expression can be classified conservatively");
        assert!(!facts.lexically_complete, "expression prefix: {prefix}");
        assert!(
            facts.classes.is_empty(),
            "not a top-level declaration: {prefix}"
        );
    }
}

#[test]
fn decorators_and_hidden_line_comment_code_cannot_certify_complete_heritage() {
    for source in [
        "@Observed\nclass Child extends Base {}",
        "@Decorator()\nclass Child extends Base {}",
        "// comment\rclass Child extends Base {}",
        "// comment\u{2028}class Child extends Base {}",
        "// comment\u{2029}class Child extends Base {}",
    ] {
        let facts =
            parse_document_class_heritage(&Document::new("file:///unsupported.ets", source))
                .expect("unsupported syntax may expose partial lexical facts");
        assert!(!facts.lexically_complete, "unclassified source: {source}");
    }
}

#[test]
fn unsupported_heritage_and_nested_or_anonymous_classes_are_incomplete() {
    for source in [
        "class Child extends NS.Base {}",
        "class Child extends factory(Base) {}",
        "class Child extends (Base) {}",
        "class Child extends Base<Type> {}",
        "class Child<Type> extends Base {}",
        "class Child extends Base implements Contract {}",
        "const Child = class extends Base {};",
        "const Child = class Named extends Base {};",
        "function make() { class Child extends Base {} }",
        "class Outer { field = class Inner extends Base {} }",
    ] {
        let facts =
            parse_document_class_heritage(&Document::new("file:///unsupported.ets", source))
                .expect("balanced unsupported forms must fail conservative");
        assert!(!facts.lexically_complete, "unsupported form: {source}");
    }
}

#[test]
fn literal_and_comment_keywords_are_inert_and_ranges_are_utf16() {
    let source = "/* 🦀 class Fake extends Hidden {} @ / ` */ export class Ω extends Base {\n\
                  value = '{ class Fake extends Hidden } @ / `';\n\
                  }\n// class Fake extends Hidden {} @ / `\n";
    let facts = parse_document_class_heritage(&Document::new("file:///unicode.ets", source))
        .expect("keywords inside literals and comments are inert");
    assert!(facts.lexically_complete);
    assert_eq!(facts.classes.len(), 1);
    assert_eq!(facts.classes[0].name, "Ω");
    let prefix = source.split("Ω").next().unwrap().encode_utf16().count() as u32;
    assert_eq!(facts.classes[0].name_range.start, Position::new(0, prefix));
    assert_eq!(
        facts.classes[0].name_range.end,
        Position::new(0, prefix + 1)
    );
    assert_eq!(facts.classes[0].declaration_range.end, Position::new(2, 1));
}

#[test]
fn malformed_source_returns_an_error_instead_of_partial_facts() {
    for source in [
        "class A {} class B {",
        "class A { ) }",
        "class A { [ }",
        "class A {} /* unfinished",
        "class A { value = 'unfinished }",
    ] {
        assert!(
            parse_document_class_heritage(&Document::new("file:///broken.ets", source)).is_err(),
            "malformed source must not publish partial evidence: {source}"
        );
    }
}

#[test]
fn uncertain_slashes_and_escaped_identifiers_are_never_complete() {
    for source in [
        "class A {} const pattern = /class Fake extends Hidden {}/;",
        "if (flag) /class Fake extends Hidden {}/.test(text); class A {}",
        "class A { value = left / right }",
        "class A extends B\\u0061se {}",
    ] {
        let facts = parse_document_class_heritage(&Document::new("file:///uncertain.ets", source))
            .expect("balanced uncertain scanning may provide discovery facts");
        assert!(!facts.lexically_complete, "uncertain scanning: {source}");
    }
}

#[test]
fn header_comments_and_windows_line_endings_remain_supported() {
    let source = "// comment\r\nexport class /* class Fake {} */ Child\r\n\
                  extends /* comment */ Base { value = 123 }\r\n";
    let facts = parse_document_class_heritage(&Document::new("file:///windows.ets", source))
        .expect("CRLF comments and header trivia are supported");
    assert!(facts.lexically_complete);
    assert_eq!(facts.classes.len(), 1);
    assert_eq!(facts.classes[0].name_range.start, Position::new(1, 33));
    assert_eq!(
        facts.classes[0].base.as_ref().unwrap().range.start,
        Position::new(2, 22)
    );
}
