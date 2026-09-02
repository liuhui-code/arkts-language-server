//! Headless ArkTS workspace-symbol indexing.

use std::{collections::HashMap, error::Error, fmt};

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
    pub committed_generation: u64,
    pub state: IndexState,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum IndexState {
    Warming,
    #[default]
    Ready,
    Degraded,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StoreErrorKind {
    Busy,
    Corrupt,
    Incompatible,
    WorkspaceMismatch,
    InvalidData,
    InvalidGeneration,
    Io,
    Internal,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StoreError {
    kind: StoreErrorKind,
    message: String,
}

impl StoreError {
    pub fn new(kind: StoreErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub const fn kind(&self) -> StoreErrorKind {
        self.kind
    }
}

impl fmt::Display for StoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for StoreError {}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct StoreMetadata {
    pub committed_generation: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DocumentSymbols {
    pub uri: String,
    pub symbols: Vec<WorkspaceSymbol>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RefreshBatch {
    pub generation: u64,
    pub replacements: Vec<DocumentSymbols>,
    pub removed_uris: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CommitReceipt {
    pub committed_generation: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SymbolSearchResult {
    pub items: Vec<WorkspaceSymbol>,
    pub served_generation: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SymbolQuery {
    folded: String,
    limit: usize,
}

impl SymbolQuery {
    pub fn new(query: &str, limit: usize) -> Self {
        Self {
            folded: query.to_lowercase(),
            limit,
        }
    }

    pub fn folded(&self) -> &str {
        &self.folded
    }

    pub const fn limit(&self) -> usize {
        self.limit
    }

    pub fn rank(&self, name: &str) -> Option<u8> {
        symbol_match_rank(name, &self.folded)
    }
}

/// Atomic storage boundary for document symbol snapshots and generations.
pub trait SymbolStore {
    fn metadata(&self) -> Result<StoreMetadata, StoreError>;
    fn apply_batch(&mut self, batch: RefreshBatch) -> Result<CommitReceipt, StoreError>;
    fn search(&self, query: &SymbolQuery) -> Result<SymbolSearchResult, StoreError>;
}

#[derive(Default)]
pub struct MemoryStore {
    documents: HashMap<String, Vec<WorkspaceSymbol>>,
    committed_generation: u64,
}

impl SymbolStore for MemoryStore {
    fn metadata(&self) -> Result<StoreMetadata, StoreError> {
        Ok(StoreMetadata {
            committed_generation: self.committed_generation,
        })
    }

    fn apply_batch(&mut self, batch: RefreshBatch) -> Result<CommitReceipt, StoreError> {
        ensure_newer_generation(self.committed_generation, batch.generation)?;
        let mut next_documents = self.documents.clone();
        for uri in batch.removed_uris {
            next_documents.remove(&uri);
        }
        for replacement in batch.replacements {
            ensure_symbol_uris(&replacement)?;
            next_documents.insert(replacement.uri, replacement.symbols);
        }
        self.documents = next_documents;
        self.committed_generation = batch.generation;
        Ok(CommitReceipt {
            committed_generation: batch.generation,
        })
    }

    fn search(&self, query: &SymbolQuery) -> Result<SymbolSearchResult, StoreError> {
        Ok(SymbolSearchResult {
            items: rank_symbols(query, self.documents.values().flatten().cloned()),
            served_generation: self.committed_generation,
        })
    }
}

pub fn fold_for_search(value: &str) -> String {
    value.to_lowercase()
}

pub fn acronym_for_search(name: &str) -> String {
    name.chars()
        .enumerate()
        .filter_map(|(index, character)| {
            (index == 0 || character.is_uppercase()).then_some(character)
        })
        .collect::<String>()
        .to_lowercase()
}

pub fn rank_symbols(
    query: &SymbolQuery,
    symbols: impl IntoIterator<Item = WorkspaceSymbol>,
) -> Vec<WorkspaceSymbol> {
    let mut matches: Vec<_> = symbols
        .into_iter()
        .filter_map(|symbol| query.rank(&symbol.name).map(|rank| (rank, symbol)))
        .collect();
    matches.sort_by(|(left_rank, left), (right_rank, right)| {
        let left_name = fold_for_search(&left.name);
        let right_name = fold_for_search(&right.name);
        left_rank
            .cmp(right_rank)
            .then_with(|| left_name.cmp(&right_name))
            .then_with(|| left.uri.cmp(&right.uri))
            .then_with(|| left.range.start.cmp(&right.range.start))
    });
    matches.truncate(query.limit());
    matches.into_iter().map(|(_, symbol)| symbol).collect()
}

fn ensure_newer_generation(current: u64, next: u64) -> Result<(), StoreError> {
    if next > current {
        Ok(())
    } else {
        Err(StoreError::new(
            StoreErrorKind::InvalidGeneration,
            format!("generation {next} must be newer than committed generation {current}"),
        ))
    }
}

fn ensure_symbol_uris(document: &DocumentSymbols) -> Result<(), StoreError> {
    if document
        .symbols
        .iter()
        .all(|symbol| symbol.uri == document.uri)
    {
        Ok(())
    } else {
        Err(StoreError::new(
            StoreErrorKind::InvalidData,
            format!("symbol URI does not match document {}", document.uri),
        ))
    }
}

fn symbol_match_rank(name: &str, query: &str) -> Option<u8> {
    let lowercase_name = fold_for_search(name);
    if lowercase_name == query {
        return Some(0);
    }
    if lowercase_name.starts_with(query) {
        return Some(1);
    }

    let acronym = acronym_for_search(name);
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
        generation: u64,
        changed_documents: impl IntoIterator<Item = Document>,
        removed_uris: &[&str],
    ) -> Result<RefreshReport, StoreError> {
        let mut report = RefreshReport::default();
        let mut replacements = Vec::new();
        let mut removals: Vec<String> = removed_uris.iter().map(|uri| (*uri).to_owned()).collect();
        for document in changed_documents {
            match parse_symbols(&document) {
                Ok(symbols) => {
                    replacements.push(DocumentSymbols {
                        uri: document.uri,
                        symbols,
                    });
                    report.indexed_documents += 1;
                }
                Err(()) => {
                    removals.push(document.uri.clone());
                    report.rejected_documents.push(document.uri);
                }
            }
        }
        removals.sort();
        removals.dedup();
        let receipt = self.store.apply_batch(RefreshBatch {
            generation,
            replacements,
            removed_uris: removals,
        })?;
        report.committed_generation = receipt.committed_generation;
        report.state = if report.rejected_documents.is_empty() {
            IndexState::Ready
        } else {
            IndexState::Degraded
        };
        Ok(report)
    }

    pub fn search(&self, query: &str, limit: usize) -> Result<SymbolSearchResult, StoreError> {
        self.store.search(&SymbolQuery::new(query, limit))
    }

    pub fn metadata(&self) -> Result<StoreMetadata, StoreError> {
        self.store.metadata()
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
    let mut parenthesis_depth = 0usize;
    let mut bracket_depth = 0usize;

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
            "(" => parenthesis_depth += 1,
            ")" => {
                if parenthesis_depth == 0 {
                    return Err(());
                }
                parenthesis_depth -= 1;
            }
            "[" => bracket_depth += 1,
            "]" => {
                if bracket_depth == 0 {
                    return Err(());
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
                    token,
                    SymbolKind::Method,
                    Some(container.name.clone()),
                ));
            }
        }
    }

    if brace_depth == 0 && parenthesis_depth == 0 && bracket_depth == 0 {
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
