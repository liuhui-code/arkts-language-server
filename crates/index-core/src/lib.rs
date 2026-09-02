//! Headless ArkTS workspace-symbol indexing.

use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Document {
    pub uri: String,
    pub text: String,
}

impl Document {
    pub fn new(uri: impl Into<String>, text: impl Into<String>) -> Self {
        Self {
            uri: uri.into(),
            text: text.into(),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Position {
    pub line: u32,
    pub character: u32,
}

impl Position {
    pub const fn new(line: u32, character: u32) -> Self {
        Self { line, character }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TextRange {
    pub start: Position,
    pub end: Position,
}

impl TextRange {
    pub const fn new(start: Position, end: Position) -> Self {
        Self { start, end }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SymbolKind {
    Class,
    Struct,
    Function,
    Method,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WorkspaceSymbol {
    pub name: String,
    pub kind: SymbolKind,
    pub uri: String,
    pub range: TextRange,
    pub container: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RefreshReport {
    pub indexed_documents: usize,
    pub rejected_documents: Vec<String>,
}

/// Storage boundary for the parsed symbol snapshots of individual documents.
///
/// The in-memory implementation is used by the spike. A persistent store can
/// implement this contract without changing parsing or the workspace API.
pub trait SymbolStore {
    fn replace_document(&mut self, uri: &str, symbols: Vec<WorkspaceSymbol>);
    fn remove_document(&mut self, uri: &str);
    fn search(&self, query: &str, limit: usize) -> Vec<WorkspaceSymbol>;
}

#[derive(Default)]
pub struct MemoryStore {
    documents: HashMap<String, Vec<WorkspaceSymbol>>,
}

impl SymbolStore for MemoryStore {
    fn replace_document(&mut self, uri: &str, symbols: Vec<WorkspaceSymbol>) {
        self.documents.insert(uri.to_owned(), symbols);
    }

    fn remove_document(&mut self, uri: &str) {
        self.documents.remove(uri);
    }

    fn search(&self, query: &str, limit: usize) -> Vec<WorkspaceSymbol> {
        let query = query.to_lowercase();
        let mut matches: Vec<_> = self
            .documents
            .values()
            .flatten()
            .filter_map(|symbol| {
                symbol_match_rank(&symbol.name, &query).map(|rank| (rank, symbol.clone()))
            })
            .collect();

        matches.sort_by(|(left_rank, left), (right_rank, right)| {
            let left_name = left.name.to_lowercase();
            let right_name = right.name.to_lowercase();
            left_rank
                .cmp(right_rank)
                .then_with(|| left_name.cmp(&right_name))
                .then_with(|| left.uri.cmp(&right.uri))
                .then_with(|| left.range.start.cmp(&right.range.start))
        });
        matches.truncate(limit);
        matches.into_iter().map(|(_, symbol)| symbol).collect()
    }
}

fn symbol_match_rank(name: &str, query: &str) -> Option<u8> {
    let lowercase_name = name.to_lowercase();
    if lowercase_name == query {
        return Some(0);
    }
    if lowercase_name.starts_with(query) {
        return Some(1);
    }

    let acronym: String = name
        .chars()
        .enumerate()
        .filter_map(|(index, character)| {
            (index == 0 || character.is_uppercase()).then_some(character)
        })
        .collect::<String>()
        .to_lowercase();
    if acronym.starts_with(query) {
        return Some(2);
    }
    lowercase_name.contains(query).then_some(3)
}

pub struct WorkspaceIndex {
    store: Box<dyn SymbolStore>,
}

impl WorkspaceIndex {
    pub fn in_memory() -> Self {
        Self::with_store(MemoryStore::default())
    }

    pub fn with_store(store: impl SymbolStore + 'static) -> Self {
        Self {
            store: Box::new(store),
        }
    }

    pub fn refresh(
        &mut self,
        changed_documents: impl IntoIterator<Item = Document>,
        removed_uris: &[&str],
    ) -> RefreshReport {
        for uri in removed_uris {
            self.store.remove_document(uri);
        }

        let mut report = RefreshReport::default();
        for document in changed_documents {
            match parse_symbols(&document) {
                Ok(symbols) => {
                    self.store.replace_document(&document.uri, symbols);
                    report.indexed_documents += 1;
                }
                Err(()) => {
                    self.store.remove_document(&document.uri);
                    report.rejected_documents.push(document.uri);
                }
            }
        }
        report
    }

    pub fn search(&self, query: &str, limit: usize) -> Vec<WorkspaceSymbol> {
        self.store.search(query, limit)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum TokenKind {
    Identifier,
    Punctuation,
}

#[derive(Clone, Debug)]
struct Token<'a> {
    text: &'a str,
    kind: TokenKind,
    start: usize,
    end: usize,
}

#[derive(Clone, Debug)]
struct Container {
    name: String,
    body_depth: usize,
}

fn parse_symbols(document: &Document) -> Result<Vec<WorkspaceSymbol>, ()> {
    let tokens = tokenize(&document.text)?;
    let mut symbols = Vec::new();
    let mut containers: Vec<Container> = Vec::new();
    let mut pending_container: Option<String> = None;
    let mut brace_depth = 0usize;

    for (index, token) in tokens.iter().enumerate() {
        match token.text {
            "class" | "struct" => {
                let Some(name) = tokens
                    .get(index + 1)
                    .filter(|next| next.kind == TokenKind::Identifier)
                else {
                    continue;
                };
                let kind = if token.text == "class" {
                    SymbolKind::Class
                } else {
                    SymbolKind::Struct
                };
                symbols.push(symbol(document, name, kind, None));
                pending_container = Some(name.text.to_owned());
            }
            "function" => {
                if let Some(name) = tokens
                    .get(index + 1)
                    .filter(|next| next.kind == TokenKind::Identifier)
                {
                    symbols.push(symbol(document, name, SymbolKind::Function, None));
                }
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
                    return Err(());
                }
                if containers
                    .last()
                    .is_some_and(|container| container.body_depth == brace_depth)
                {
                    containers.pop();
                }
                brace_depth = brace_depth.saturating_sub(1);
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
                    token,
                    SymbolKind::Method,
                    Some(container.name.clone()),
                ));
            }
        }
    }

    if brace_depth == 0 {
        Ok(symbols)
    } else {
        Err(())
    }
}

fn symbol(
    document: &Document,
    name: &Token<'_>,
    kind: SymbolKind,
    container: Option<String>,
) -> WorkspaceSymbol {
    WorkspaceSymbol {
        name: name.text.to_owned(),
        kind,
        uri: document.uri.clone(),
        range: TextRange::new(
            position_at(&document.text, name.start),
            position_at(&document.text, name.end),
        ),
        container,
    }
}

fn position_at(text: &str, byte_offset: usize) -> Position {
    let prefix = &text[..byte_offset];
    let line = prefix.bytes().filter(|byte| *byte == b'\n').count() as u32;
    let line_start = prefix.rfind('\n').map_or(0, |offset| offset + 1);
    let character = prefix[line_start..].encode_utf16().count() as u32;
    Position::new(line, character)
}

fn is_non_method_keyword(identifier: &str) -> bool {
    matches!(
        identifier,
        "if" | "for" | "while" | "switch" | "catch" | "function"
    )
}

fn tokenize(source: &str) -> Result<Vec<Token<'_>>, ()> {
    let mut tokens = Vec::new();
    let mut offset = 0usize;

    while offset < source.len() {
        let rest = &source[offset..];
        if rest.starts_with("//") {
            offset += rest.find('\n').unwrap_or(rest.len());
            continue;
        }
        if rest.starts_with("/*") {
            let Some(end) = rest.find("*/") else {
                return Err(());
            };
            offset += end + 2;
            continue;
        }

        let character = rest.chars().next().expect("offset is inside source");
        if character.is_whitespace() {
            offset += character.len_utf8();
            continue;
        }
        if matches!(character, '\'' | '"' | '`') {
            offset = skip_quoted(source, offset, character).ok_or(())?;
            continue;
        }
        if is_identifier_start(character) {
            let start = offset;
            offset += character.len_utf8();
            while offset < source.len() {
                let next = source[offset..]
                    .chars()
                    .next()
                    .expect("offset is inside source");
                if !is_identifier_continue(next) {
                    break;
                }
                offset += next.len_utf8();
            }
            tokens.push(Token {
                text: &source[start..offset],
                kind: TokenKind::Identifier,
                start,
                end: offset,
            });
            continue;
        }

        let end = offset + character.len_utf8();
        tokens.push(Token {
            text: &source[offset..end],
            kind: TokenKind::Punctuation,
            start: offset,
            end,
        });
        offset = end;
    }

    Ok(tokens)
}

fn skip_quoted(source: &str, start: usize, quote: char) -> Option<usize> {
    let mut escaped = false;
    let content_start = start + quote.len_utf8();
    for (relative_offset, character) in source[content_start..].char_indices() {
        let offset = content_start + relative_offset;
        if escaped {
            escaped = false;
        } else if character == '\\' {
            escaped = true;
        } else if character == quote {
            return Some(offset + character.len_utf8());
        }
    }
    None
}

fn is_identifier_start(character: char) -> bool {
    character == '_' || character == '$' || character.is_alphabetic()
}

fn is_identifier_continue(character: char) -> bool {
    is_identifier_start(character) || character.is_ascii_digit()
}
