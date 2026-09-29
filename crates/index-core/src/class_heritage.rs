//! Conservative lexical metadata; never a symbol identity or reference-scope proof.

use crate::line_index::LineIndex;
use crate::tokenizer::{Token, TokenKind, Tokenization, tokenize_with_status};
use crate::{Document, DocumentParseError, StoreError, StoreErrorKind, TextRange};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClassHeritageBase {
    /// Source spelling only. Imports and aliases are not resolved here.
    pub name: String,
    pub range: TextRange,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClassHeritageDeclaration {
    pub name: String,
    pub name_range: TextRange,
    pub declaration_range: TextRange,
    pub base: Option<ClassHeritageBase>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DocumentClassHeritage {
    pub uri: String,
    pub classes: Vec<ClassHeritageDeclaration>,
    /// All observed class syntax belongs to the supported lexical subset.
    /// This does not prove valid ArkTS, resolved inheritance, or complete references.
    pub lexically_complete: bool,
}

impl DocumentClassHeritage {
    /// Checks storage structure only, not ArkTS validity or semantic identity.
    pub fn validate_document(&self, uri: &str) -> Result<(), StoreError> {
        let valid = self.uri == uri
            && self.classes.iter().all(|class| {
                !class.name.is_empty()
                    && contained_nonempty_range(class.name_range, class.declaration_range)
                    && class.base.as_ref().is_none_or(|base| {
                        !base.name.is_empty()
                            && base.range.start >= class.name_range.end
                            && contained_nonempty_range(base.range, class.declaration_range)
                    })
            });
        if valid {
            Ok(())
        } else {
            Err(StoreError::new(
                StoreErrorKind::InvalidData,
                format!("invalid class heritage metadata for document {uri}"),
            ))
        }
    }
}

fn contained_nonempty_range(inner: TextRange, outer: TextRange) -> bool {
    outer.start <= inner.start && inner.start < inner.end && inner.end <= outer.end
}

/// Discovery metadata and the committed generation from one store snapshot.
/// Missing facts are unknown, not a complete empty set of class declarations.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClassHeritageSearchResult {
    pub facts: Option<DocumentClassHeritage>,
    pub served_generation: u64,
}

/// Records top-level named classes with no heritage or a simple identifier base.
/// Unsupported forms make the document incomplete; facts remain discovery-only.
/// Malformed tokenization/delimiters fail rather than publish partial evidence.
pub fn parse_document_class_heritage(
    document: &Document,
) -> Result<DocumentClassHeritage, DocumentParseError> {
    let scanned = tokenize_with_status(&document.text)?;
    let lines = LineIndex::new(&document.text);
    parse_scanned_class_heritage(document, &scanned, &lines)
}

pub(super) fn parse_scanned_class_heritage(
    document: &Document,
    scanned: &Tokenization<'_>,
    lines: &LineIndex,
) -> Result<DocumentClassHeritage, DocumentParseError> {
    let tokens = &scanned.tokens;
    let (depths, closes) = delimiter_structure(tokens)?;
    let mut facts = DocumentClassHeritage {
        uri: document.uri.clone(),
        classes: Vec::new(),
        lexically_complete: !scanned.uncertain,
    };
    let mut classified_extends = Vec::new();
    for (index, token) in tokens.iter().enumerate() {
        if token.kind != TokenKind::Identifier || token.text != "class" {
            continue;
        }
        let start = declaration_start(tokens, index);
        let Some((name, base, body, heritage)) = class_header(&document.text, tokens, index) else {
            facts.lexically_complete = false;
            continue;
        };
        let prefix_is_trivia = (start..index)
            .all(|left| is_trivia(&document.text[tokens[left].end..tokens[left + 1].start]));
        if depths[index] != 0
            || !prefix_is_trivia
            || !is_declaration_boundary(&document.text, tokens, start)
        {
            facts.lexically_complete = false;
            continue;
        }
        if let Some(heritage) = heritage {
            classified_extends.push(heritage);
        }
        let end = closes[body].ok_or(DocumentParseError)?;
        facts.classes.push(ClassHeritageDeclaration {
            name: name.text.to_string(),
            name_range: range(lines, name.start, name.end),
            declaration_range: range(lines, tokens[start].start, tokens[end].end),
            base: base.map(|base| ClassHeritageBase {
                name: base.text.to_string(),
                range: range(lines, base.start, base.end),
            }),
        });
    }
    if tokens.iter().enumerate().any(|(index, token)| {
        token.kind == TokenKind::Identifier
            && token.text == "extends"
            && !classified_extends.contains(&index)
    }) {
        facts.lexically_complete = false;
    }
    Ok(facts)
}

fn class_header<'a>(
    source: &str,
    tokens: &'a [Token<'a>],
    index: usize,
) -> Option<(&'a Token<'a>, Option<&'a Token<'a>>, usize, Option<usize>)> {
    let name = tokens.get(index + 1)?;
    if name.kind != TokenKind::Identifier || matches!(name.text, "extends" | "implements") {
        return None;
    }
    let mut body = index + 2;
    let mut base = None;
    let mut heritage = None;
    if tokens.get(body)?.text == "extends" {
        heritage = Some(body);
        let candidate = tokens.get(body + 1)?;
        if candidate.kind != TokenKind::Identifier {
            return None;
        }
        base = Some(candidate);
        body += 2;
    }
    let open = tokens.get(body)?;
    let gaps_are_trivia =
        (index..body).all(|left| is_trivia(&source[tokens[left].end..tokens[left + 1].start]));
    (open.kind == TokenKind::Punctuation && open.text == "{" && gaps_are_trivia)
        .then_some((name, base, body, heritage))
}

fn is_trivia(mut source: &str) -> bool {
    loop {
        source = source.trim_start();
        if source.is_empty() {
            return true;
        }
        if source.starts_with("//") {
            source = &source[source.find('\n').unwrap_or(source.len())..];
        } else if source.starts_with("/*") {
            let Some(end) = source.find("*/") else {
                return false;
            };
            source = &source[end + 2..];
        } else {
            return false;
        }
    }
}

fn declaration_start(tokens: &[Token<'_>], mut index: usize) -> usize {
    while index > 0
        && tokens[index - 1].kind == TokenKind::Identifier
        && matches!(
            tokens[index - 1].text,
            "export" | "default" | "declare" | "abstract"
        )
    {
        index -= 1;
    }
    index
}

fn is_declaration_boundary(source: &str, tokens: &[Token<'_>], start: usize) -> bool {
    if start == 0 {
        return true;
    }
    let previous = &tokens[start - 1];
    if previous.kind == TokenKind::Identifier
        && matches!(
            previous.text,
            "new"
                | "typeof"
                | "void"
                | "await"
                | "yield"
                | "instanceof"
                | "in"
                | "delete"
                | "throw"
                | "else"
                | "do"
        )
    {
        return false;
    }
    if previous.kind == TokenKind::Punctuation && matches!(previous.text, ";" | "}") {
        return true;
    }
    let gap = &source[previous.end..tokens[start].start];
    gap.contains(['\n', '\r', '\u{2028}', '\u{2029}'])
        && (previous.kind != TokenKind::Punctuation
            || matches!(previous.text, ")" | "]" | "++" | "--"))
}

type DelimiterStructure = (Vec<usize>, Vec<Option<usize>>);

fn delimiter_structure(tokens: &[Token<'_>]) -> Result<DelimiterStructure, DocumentParseError> {
    let mut stack: Vec<(usize, &str)> = Vec::new();
    let mut depths = Vec::with_capacity(tokens.len());
    let mut closes = vec![None; tokens.len()];
    for (index, token) in tokens.iter().enumerate() {
        depths.push(stack.len());
        if token.kind != TokenKind::Punctuation {
            continue;
        }
        match token.text {
            "{" | "(" | "[" => stack.push((index, token.text)),
            "}" | ")" | "]" => {
                let (open_index, open) = stack.pop().ok_or(DocumentParseError)?;
                if !matches!((open, token.text), ("{", "}") | ("(", ")") | ("[", "]")) {
                    return Err(DocumentParseError);
                }
                closes[open_index] = Some(index);
            }
            _ => {}
        }
    }
    if !stack.is_empty() {
        return Err(DocumentParseError);
    }
    Ok((depths, closes))
}

fn range(lines: &LineIndex, start: usize, end: usize) -> TextRange {
    TextRange::new(lines.position(start), lines.position(end))
}
