use crate::class_heritage::parse_scanned_class_heritage;
use crate::line_index::LineIndex;
use crate::tokenizer::{Token, TokenKind, tokenize_with_status};
use crate::{
    Document, DocumentParseError, DocumentSymbols, ReferenceAlias, ReferenceBinding,
    ReferenceOccurrence, StoreError, StoreErrorKind, SymbolKind, TextRange, WorkspaceExport,
    WorkspaceSymbol, class_binding_snapshot, exported_const_is_arrow_function, exported_const_name,
    is_default_exported_declaration, is_exported_declaration, is_non_method_keyword,
    reference_bindings, symbol, workspace_export,
};

pub fn parse_document_symbols(document: &Document) -> Result<DocumentSymbols, DocumentParseError> {
    let scanned = tokenize_with_status(&document.text)?;
    let lines = LineIndex::new(&document.text);
    parse_symbols(document, &scanned.tokens, &lines).map(
        |(symbols, exports, occurrences, aliases, bindings)| {
            let class_heritage = parse_scanned_class_heritage(document, &scanned, &lines).ok();
            let class_binding_provenance = Some(class_binding_snapshot::source_provenance(
                document,
                class_heritage.as_ref(),
                &scanned,
                &lines,
            ));
            DocumentSymbols {
                uri: document.uri.clone(),
                symbols,
                exports,
                occurrences,
                aliases,
                bindings,
                class_heritage,
                class_binding_provenance,
            }
        },
    )
}

#[derive(Clone, Debug)]
struct Container {
    name: String,
    body_depth: usize,
}

type ParsedSymbols = (
    Vec<WorkspaceSymbol>,
    Vec<WorkspaceExport>,
    Vec<ReferenceOccurrence>,
    Vec<ReferenceAlias>,
    Vec<ReferenceBinding>,
);

fn parse_symbols(
    document: &Document,
    tokens: &[Token<'_>],
    line_index: &LineIndex,
) -> Result<ParsedSymbols, DocumentParseError> {
    let mut symbols = Vec::new();
    let mut exports = Vec::new();
    let occurrences = tokens
        .iter()
        .enumerate()
        .filter(|(_, token)| token.kind == TokenKind::Identifier)
        .map(|(index, token)| {
            let qualifier = (index > 1
                && tokens[index - 1].text == "."
                && tokens[index - 2].kind == TokenKind::Identifier)
                .then(|| tokens[index - 2].text.to_owned());
            ReferenceOccurrence {
                name: token.text.to_owned(),
                uri: document.uri.clone(),
                range: TextRange::new(
                    line_index.position(token.start),
                    line_index.position(token.end),
                ),
                qualified: Some(index > 0 && tokens[index - 1].text == "."),
                qualifier,
            }
        })
        .collect();
    let aliases = tokens
        .windows(3)
        .filter(|window| {
            window[0].kind == TokenKind::Identifier
                && window[1].text == "as"
                && window[2].kind == TokenKind::Identifier
        })
        .map(|window| ReferenceAlias {
            from_name: window[0].text.to_owned(),
            to_name: window[2].text.to_owned(),
            uri: document.uri.clone(),
        })
        .collect();
    let bindings = reference_bindings(document, tokens);
    let mut containers: Vec<Container> = Vec::new();
    let mut pending_container: Option<String> = None;
    let mut brace_depth = 0usize;
    let mut parenthesis_depth = 0usize;
    let mut bracket_depth = 0usize;

    for (index, token) in tokens.iter().enumerate() {
        if token.kind == TokenKind::StringLiteral {
            continue;
        }
        match token.text {
            "class" | "struct" | "enum" | "interface" | "namespace" => {
                let Some(name) = tokens
                    .get(index + 1)
                    .filter(|next| next.kind == TokenKind::Identifier)
                else {
                    continue;
                };
                let kind = match token.text {
                    "class" => SymbolKind::Class,
                    "struct" => SymbolKind::Struct,
                    "enum" => SymbolKind::Enum,
                    "interface" => SymbolKind::Interface,
                    "namespace" => SymbolKind::Namespace,
                    _ => unreachable!(),
                };
                symbols.push(symbol(document, line_index, name, kind, None));
                if is_exported_declaration(tokens, index, brace_depth) {
                    exports.push(workspace_export(
                        document,
                        line_index,
                        name,
                        kind,
                        exports.len(),
                        Some(if is_default_exported_declaration(tokens, index) {
                            "default"
                        } else {
                            name.text
                        }),
                    )?);
                }
                if kind != SymbolKind::Enum {
                    pending_container = Some(name.text.to_owned());
                }
            }
            "function" => {
                if let Some(name) = tokens
                    .get(index + 1)
                    .filter(|next| next.kind == TokenKind::Identifier)
                {
                    symbols.push(symbol(
                        document,
                        line_index,
                        name,
                        SymbolKind::Function,
                        None,
                    ));
                    if is_exported_declaration(tokens, index, brace_depth) {
                        exports.push(workspace_export(
                            document,
                            line_index,
                            name,
                            SymbolKind::Function,
                            exports.len(),
                            Some(if is_default_exported_declaration(tokens, index) {
                                "default"
                            } else {
                                name.text
                            }),
                        )?);
                    }
                }
            }
            "type" => {
                if !is_exported_declaration(tokens, index, brace_depth) {
                    continue;
                }
                let Some(name) = tokens
                    .get(index + 1)
                    .filter(|next| next.kind == TokenKind::Identifier)
                else {
                    continue;
                };
                symbols.push(symbol(
                    document,
                    line_index,
                    name,
                    SymbolKind::TypeAlias,
                    None,
                ));
                exports.push(workspace_export(
                    document,
                    line_index,
                    name,
                    SymbolKind::TypeAlias,
                    exports.len(),
                    Some(if is_default_exported_declaration(tokens, index) {
                        "default"
                    } else {
                        name.text
                    }),
                )?);
            }
            "const" => {
                let Some(name) = exported_const_name(tokens, index, brace_depth) else {
                    continue;
                };
                let kind = if exported_const_is_arrow_function(tokens, index) {
                    SymbolKind::Function
                } else {
                    SymbolKind::Variable
                };
                symbols.push(symbol(document, line_index, name, kind, None));
                exports.push(workspace_export(
                    document,
                    line_index,
                    name,
                    kind,
                    exports.len(),
                    Some(name.text),
                )?);
            }
            "{" => {
                brace_depth += 1;
                if let Some(name) = pending_container.take() {
                    containers.push(Container {
                        name,
                        body_depth: brace_depth,
                    });
                }
            }
            "}" => {
                if brace_depth == 0 {
                    return Err(DocumentParseError);
                }
                if containers
                    .last()
                    .is_some_and(|container| container.body_depth == brace_depth)
                {
                    containers.pop();
                }
                brace_depth = brace_depth.saturating_sub(1);
            }
            "(" => parenthesis_depth += 1,
            ")" => {
                if parenthesis_depth == 0 {
                    return Err(DocumentParseError);
                }
                parenthesis_depth -= 1;
            }
            "[" => bracket_depth += 1,
            "]" => {
                if bracket_depth == 0 {
                    return Err(DocumentParseError);
                }
                bracket_depth -= 1;
            }
            _ => {
                let Some(container) = containers.last() else {
                    continue;
                };
                if container.body_depth != brace_depth
                    || token.kind != TokenKind::Identifier
                    || tokens.get(index + 1).map(|next| next.text) != Some("(")
                    || is_non_method_keyword(token.text)
                    || tokens
                        .get(index.wrapping_sub(1))
                        .map(|previous| previous.text)
                        == Some(".")
                {
                    continue;
                }
                symbols.push(symbol(
                    document,
                    line_index,
                    token,
                    SymbolKind::Method,
                    Some(container.name.clone()),
                ));
            }
        }
    }

    if brace_depth == 0 && parenthesis_depth == 0 && bracket_depth == 0 {
        Ok((symbols, exports, occurrences, aliases, bindings))
    } else {
        Err(DocumentParseError)
    }
}

pub(super) fn ensure_symbol_uris(document: &DocumentSymbols) -> Result<(), StoreError> {
    if let Some(facts) = &document.class_heritage {
        facts.validate_document(&document.uri)?;
    }
    if let Some(provenance) = &document.class_binding_provenance {
        provenance.validate_document(document.class_heritage.as_ref())?;
    }
    if document
        .symbols
        .iter()
        .all(|symbol| symbol.uri == document.uri)
        && document.exports.iter().all(|item| item.uri == document.uri)
        && document
            .occurrences
            .iter()
            .all(|item| item.uri == document.uri)
        && document.aliases.iter().all(|item| item.uri == document.uri)
        && document
            .bindings
            .iter()
            .all(|item| item.uri == document.uri)
    {
        Ok(())
    } else {
        Err(StoreError::new(
            StoreErrorKind::InvalidData,
            format!("symbol URI does not match document {}", document.uri),
        ))
    }
}
