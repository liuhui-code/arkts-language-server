//! Headless ArkTS workspace-symbol indexing.

use std::{
    collections::{BTreeSet, HashMap},
    error::Error,
    fmt,
};

pub const MAX_REFERENCE_ALIAS_NAMES: usize = 1_024;

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

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WorkspaceExport {
    pub exported_name: String,
    pub kind: SymbolKind,
    pub uri: String,
    pub range: TextRange,
    pub ordinal: u32,
    pub declaration_identity: Option<String>,
    pub import_specifier: Option<String>,
    pub module_id: Option<String>,
    pub target_scope: Option<String>,
    pub reference_searchable: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReferenceOccurrence {
    pub name: String,
    pub uri: String,
    pub range: TextRange,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReferenceAlias {
    pub from_name: String,
    pub to_name: String,
    pub uri: String,
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
    pub rejected_documents: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DocumentSymbols {
    pub uri: String,
    pub symbols: Vec<WorkspaceSymbol>,
    pub exports: Vec<WorkspaceExport>,
    pub occurrences: Vec<ReferenceOccurrence>,
    pub aliases: Vec<ReferenceAlias>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FullCatalogBatch {
    pub generation: u64,
    pub documents: Vec<DocumentSymbols>,
    pub rejected_uris: Vec<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DocumentParseError;

impl fmt::Display for DocumentParseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("document is not a balanced ArkTS/TypeScript source")
    }
}

impl Error for DocumentParseError {}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RefreshBatch {
    pub generation: u64,
    pub replacements: Vec<DocumentSymbols>,
    pub removed_uris: Vec<String>,
    pub rejected_uris: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CommitReceipt {
    pub committed_generation: u64,
    pub rejected_documents: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SymbolSearchResult {
    pub items: Vec<WorkspaceSymbol>,
    pub served_generation: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExportSearchResult {
    pub items: Vec<WorkspaceExport>,
    pub served_generation: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReferenceCandidateSearchResult {
    pub supported: bool,
    pub complete: bool,
    pub declaration_identity: Option<String>,
    pub names: Vec<String>,
    pub uris: Vec<String>,
    pub served_generation: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReferenceCandidateQuery {
    pub declaration_uri: String,
    pub declaration_position: Position,
    pub limit: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExportQuery {
    folded: String,
    limit: usize,
}

impl ExportQuery {
    pub fn new(query: &str, limit: usize) -> Self {
        Self {
            folded: fold_for_search(query),
            limit,
        }
    }

    pub fn folded(&self) -> &str {
        &self.folded
    }

    pub const fn limit(&self) -> usize {
        self.limit
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SymbolQuery {
    folded: String,
    limit: usize,
    excluded_uris: BTreeSet<String>,
}

impl SymbolQuery {
    pub fn new(query: &str, limit: usize) -> Self {
        Self {
            folded: query.to_lowercase(),
            limit,
            excluded_uris: BTreeSet::new(),
        }
    }

    pub fn excluding_uris(mut self, uris: impl IntoIterator<Item = String>) -> Self {
        self.excluded_uris.extend(uris);
        self
    }

    pub fn folded(&self) -> &str {
        &self.folded
    }

    pub const fn limit(&self) -> usize {
        self.limit
    }

    pub fn excludes_uri(&self, uri: &str) -> bool {
        self.excluded_uris.contains(uri)
    }

    pub fn rank(&self, name: &str) -> Option<u8> {
        symbol_match_rank(name, &self.folded)
    }
}

/// Atomic storage boundary for document symbol snapshots and generations.
pub trait SymbolStore {
    fn metadata(&self) -> Result<StoreMetadata, StoreError>;
    fn apply_batch(&mut self, batch: RefreshBatch) -> Result<CommitReceipt, StoreError>;
    fn replace_all(&mut self, batch: FullCatalogBatch) -> Result<CommitReceipt, StoreError>;
    fn search(&self, query: &SymbolQuery) -> Result<SymbolSearchResult, StoreError>;
    fn search_exports(&self, query: &ExportQuery) -> Result<ExportSearchResult, StoreError>;
    fn search_reference_candidates(
        &self,
        query: &ReferenceCandidateQuery,
    ) -> Result<ReferenceCandidateSearchResult, StoreError>;
}

#[derive(Default)]
pub struct MemoryStore {
    documents: HashMap<String, DocumentSymbols>,
    rejected_documents: BTreeSet<String>,
    committed_generation: u64,
}

impl SymbolStore for MemoryStore {
    fn metadata(&self) -> Result<StoreMetadata, StoreError> {
        Ok(StoreMetadata {
            committed_generation: self.committed_generation,
            rejected_documents: self.rejected_documents.iter().cloned().collect(),
        })
    }

    fn apply_batch(&mut self, batch: RefreshBatch) -> Result<CommitReceipt, StoreError> {
        ensure_newer_generation(self.committed_generation, batch.generation)?;
        let mut next_documents = self.documents.clone();
        let mut next_rejected_documents = self.rejected_documents.clone();
        for uri in batch.removed_uris {
            next_documents.remove(&uri);
            next_rejected_documents.remove(&uri);
        }
        for replacement in batch.replacements {
            ensure_symbol_uris(&replacement)?;
            next_rejected_documents.remove(&replacement.uri);
            next_documents.insert(replacement.uri.clone(), replacement);
        }
        for uri in batch.rejected_uris {
            next_documents.remove(&uri);
            next_rejected_documents.insert(uri);
        }
        self.documents = next_documents;
        self.rejected_documents = next_rejected_documents;
        self.committed_generation = batch.generation;
        Ok(CommitReceipt {
            committed_generation: batch.generation,
            rejected_documents: self.rejected_documents.iter().cloned().collect(),
        })
    }

    fn replace_all(&mut self, batch: FullCatalogBatch) -> Result<CommitReceipt, StoreError> {
        ensure_newer_generation(self.committed_generation, batch.generation)?;
        let mut documents = HashMap::new();
        for document in batch.documents {
            ensure_symbol_uris(&document)?;
            documents.insert(document.uri.clone(), document);
        }
        self.documents = documents;
        self.rejected_documents = batch.rejected_uris.into_iter().collect();
        self.committed_generation = batch.generation;
        Ok(CommitReceipt {
            committed_generation: batch.generation,
            rejected_documents: self.rejected_documents.iter().cloned().collect(),
        })
    }

    fn search(&self, query: &SymbolQuery) -> Result<SymbolSearchResult, StoreError> {
        Ok(SymbolSearchResult {
            items: rank_symbols(
                query,
                self.documents
                    .values()
                    .flat_map(|document| document.symbols.iter())
                    .cloned(),
            ),
            served_generation: self.committed_generation,
        })
    }

    fn search_exports(&self, query: &ExportQuery) -> Result<ExportSearchResult, StoreError> {
        let mut items: Vec<_> = self
            .documents
            .values()
            .flat_map(|document| document.exports.iter())
            .filter(|item| fold_for_search(&item.exported_name).starts_with(query.folded()))
            .cloned()
            .collect();
        items.sort_by(|left, right| {
            fold_for_search(&left.exported_name)
                .cmp(&fold_for_search(&right.exported_name))
                .then_with(|| left.uri.cmp(&right.uri))
                .then_with(|| left.ordinal.cmp(&right.ordinal))
        });
        items.truncate(query.limit());
        Ok(ExportSearchResult {
            items,
            served_generation: self.committed_generation,
        })
    }

    fn search_reference_candidates(
        &self,
        query: &ReferenceCandidateQuery,
    ) -> Result<ReferenceCandidateSearchResult, StoreError> {
        let declaration = self
            .documents
            .get(&query.declaration_uri)
            .and_then(|document| {
                document.exports.iter().find(|item| {
                    item.reference_searchable
                        && item.range.start.line == query.declaration_position.line
                        && item.range.end.line == query.declaration_position.line
                        && item.range.start.character <= query.declaration_position.character
                        && query.declaration_position.character < item.range.end.character
                })
            });
        let Some(declaration) = declaration else {
            return Ok(unsupported_reference_candidates(self.committed_generation));
        };
        let mut names = BTreeSet::from([declaration.exported_name.clone()]);
        loop {
            let before = names.len();
            for alias in self
                .documents
                .values()
                .flat_map(|document| document.aliases.iter())
            {
                if names.contains(&alias.from_name) {
                    names.insert(alias.to_name.clone());
                }
                if names.contains(&alias.to_name) {
                    names.insert(alias.from_name.clone());
                }
                if names.len() > MAX_REFERENCE_ALIAS_NAMES {
                    return Ok(unsupported_reference_candidates(self.committed_generation));
                }
            }
            if names.len() == before {
                break;
            }
        }
        if names.contains("default") {
            return Ok(unsupported_reference_candidates(self.committed_generation));
        }
        let uris: BTreeSet<_> = self
            .documents
            .values()
            .flat_map(|document| document.occurrences.iter())
            .filter(|occurrence| names.contains(&occurrence.name))
            .map(|occurrence| occurrence.uri.clone())
            .collect();
        let complete = uris.len() <= query.limit;
        let uris = uris.iter().take(query.limit).cloned().collect();
        Ok(ReferenceCandidateSearchResult {
            supported: true,
            complete,
            declaration_identity: declaration.declaration_identity.clone(),
            names: names.into_iter().collect(),
            uris,
            served_generation: self.committed_generation,
        })
    }
}

fn unsupported_reference_candidates(generation: u64) -> ReferenceCandidateSearchResult {
    ReferenceCandidateSearchResult {
        supported: false,
        complete: false,
        declaration_identity: None,
        names: Vec::new(),
        uris: Vec::new(),
        served_generation: generation,
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
        .filter(|symbol| !query.excludes_uri(&symbol.uri))
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
        && document.exports.iter().all(|item| item.uri == document.uri)
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
    if query.is_empty() {
        return None;
    }
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
    query
        .chars()
        .nth(2)
        .is_some_and(|_| lowercase_name.contains(query))
        .then_some(3)
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
        let mut rejected_uris = Vec::new();
        for document in changed_documents {
            match parse_document_symbols(&document) {
                Ok(document_symbols) => {
                    replacements.push(document_symbols);
                    report.indexed_documents += 1;
                }
                Err(_) => {
                    rejected_uris.push(document.uri);
                }
            }
        }
        removals.sort();
        removals.dedup();
        rejected_uris.sort();
        rejected_uris.dedup();
        let receipt = self.store.apply_batch(RefreshBatch {
            generation,
            replacements,
            removed_uris: removals,
            rejected_uris,
        })?;
        report.committed_generation = receipt.committed_generation;
        report.rejected_documents = receipt.rejected_documents;
        report.state = if report.rejected_documents.is_empty() {
            IndexState::Ready
        } else {
            IndexState::Degraded
        };
        Ok(report)
    }

    pub fn activate_catalog(
        &mut self,
        generation: u64,
        documents: Vec<DocumentSymbols>,
        rejected_uris: Vec<String>,
    ) -> Result<RefreshReport, StoreError> {
        let indexed_documents = documents.len();
        let receipt = self.store.replace_all(FullCatalogBatch {
            generation,
            documents,
            rejected_uris,
        })?;
        let state = if receipt.rejected_documents.is_empty() {
            IndexState::Ready
        } else {
            IndexState::Degraded
        };
        Ok(RefreshReport {
            indexed_documents,
            rejected_documents: receipt.rejected_documents,
            committed_generation: receipt.committed_generation,
            state,
        })
    }

    pub fn search(&self, query: &str, limit: usize) -> Result<SymbolSearchResult, StoreError> {
        self.store.search(&SymbolQuery::new(query, limit))
    }

    pub fn search_exports(
        &self,
        query: &str,
        limit: usize,
    ) -> Result<ExportSearchResult, StoreError> {
        self.store.search_exports(&ExportQuery::new(query, limit))
    }

    pub fn search_reference_candidates(
        &self,
        query: ReferenceCandidateQuery,
    ) -> Result<ReferenceCandidateSearchResult, StoreError> {
        self.store.search_reference_candidates(&query)
    }

    pub fn search_excluding(
        &self,
        query: &str,
        limit: usize,
        excluded_uris: &[String],
    ) -> Result<SymbolSearchResult, StoreError> {
        self.store
            .search(&SymbolQuery::new(query, limit).excluding_uris(excluded_uris.iter().cloned()))
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

struct LineIndex<'a> {
    text: &'a str,
    line_starts: Vec<usize>,
}

impl<'a> LineIndex<'a> {
    fn new(text: &'a str) -> Self {
        let mut line_starts = Vec::with_capacity(text.len() / 40 + 1);
        line_starts.push(0);
        line_starts.extend(
            text.bytes()
                .enumerate()
                .filter_map(|(offset, byte)| (byte == b'\n').then_some(offset + 1)),
        );
        Self { text, line_starts }
    }

    fn position(&self, byte_offset: usize) -> Position {
        let line = self
            .line_starts
            .partition_point(|line_start| *line_start <= byte_offset)
            .saturating_sub(1);
        let line_start = self.line_starts[line];
        let character = self.text[line_start..byte_offset].encode_utf16().count();
        Position::new(line as u32, character as u32)
    }
}

pub fn parse_document_symbols(document: &Document) -> Result<DocumentSymbols, DocumentParseError> {
    parse_symbols(document).map(|(symbols, exports, occurrences, aliases)| DocumentSymbols {
        uri: document.uri.clone(),
        symbols,
        exports,
        occurrences,
        aliases,
    })
}

type ParsedSymbols = (
    Vec<WorkspaceSymbol>,
    Vec<WorkspaceExport>,
    Vec<ReferenceOccurrence>,
    Vec<ReferenceAlias>,
);

fn parse_symbols(document: &Document) -> Result<ParsedSymbols, DocumentParseError> {
    let tokens = tokenize(&document.text)?;
    let line_index = LineIndex::new(&document.text);
    let mut symbols = Vec::new();
    let mut exports = Vec::new();
    let occurrences = tokens
        .iter()
        .filter(|token| token.kind == TokenKind::Identifier)
        .map(|token| ReferenceOccurrence {
            name: token.text.to_owned(),
            uri: document.uri.clone(),
            range: TextRange::new(
                line_index.position(token.start),
                line_index.position(token.end),
            ),
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
                symbols.push(symbol(document, &line_index, name, kind, None));
                if is_exported_declaration(&tokens, index, brace_depth) {
                    exports.push(workspace_export(
                        document,
                        &line_index,
                        name,
                        kind,
                        exports.len(),
                        !is_default_exported_declaration(&tokens, index),
                    )?);
                }
                pending_container = Some(name.text.to_owned());
            }
            "function" => {
                if let Some(name) = tokens
                    .get(index + 1)
                    .filter(|next| next.kind == TokenKind::Identifier)
                {
                    symbols.push(symbol(
                        document,
                        &line_index,
                        name,
                        SymbolKind::Function,
                        None,
                    ));
                    if is_exported_declaration(&tokens, index, brace_depth) {
                        exports.push(workspace_export(
                            document,
                            &line_index,
                            name,
                            SymbolKind::Function,
                            exports.len(),
                            !is_default_exported_declaration(&tokens, index),
                        )?);
                    }
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
                    &line_index,
                    token,
                    SymbolKind::Method,
                    Some(container.name.clone()),
                ));
            }
        }
    }

    if brace_depth == 0 && parenthesis_depth == 0 && bracket_depth == 0 {
        Ok((symbols, exports, occurrences, aliases))
    } else {
        Err(DocumentParseError)
    }
}

fn is_exported_declaration(tokens: &[Token<'_>], index: usize, brace_depth: usize) -> bool {
    if brace_depth != 0 {
        return false;
    }
    match tokens.get(index.wrapping_sub(1)).map(|token| token.text) {
        Some("export") => true,
        Some("default") => {
            tokens.get(index.wrapping_sub(2)).map(|token| token.text) == Some("export")
        }
        _ => false,
    }
}

fn symbol(
    document: &Document,
    line_index: &LineIndex<'_>,
    name: &Token<'_>,
    kind: SymbolKind,
    container: Option<String>,
) -> WorkspaceSymbol {
    WorkspaceSymbol {
        name: name.text.to_owned(),
        kind,
        uri: document.uri.clone(),
        range: TextRange::new(
            line_index.position(name.start),
            line_index.position(name.end),
        ),
        container,
    }
}

fn workspace_export(
    document: &Document,
    line_index: &LineIndex<'_>,
    name: &Token<'_>,
    kind: SymbolKind,
    ordinal: usize,
    reference_searchable: bool,
) -> Result<WorkspaceExport, DocumentParseError> {
    let ordinal = u32::try_from(ordinal).map_err(|_| DocumentParseError)?;
    let range = TextRange::new(
        line_index.position(name.start),
        line_index.position(name.end),
    );
    Ok(WorkspaceExport {
        exported_name: name.text.to_owned(),
        kind,
        uri: document.uri.clone(),
        range,
        ordinal,
        declaration_identity: Some(format!(
            "{}#{}:{}:{}",
            document.uri, range.start.line, range.start.character, name.text
        )),
        import_specifier: None,
        module_id: None,
        target_scope: None,
        reference_searchable,
    })
}

fn is_default_exported_declaration(tokens: &[Token<'_>], keyword_index: usize) -> bool {
    keyword_index >= 2
        && tokens[keyword_index - 2].text == "export"
        && tokens[keyword_index - 1].text == "default"
}

fn is_non_method_keyword(identifier: &str) -> bool {
    matches!(
        identifier,
        "if" | "for" | "while" | "switch" | "catch" | "function"
    )
}

fn tokenize(source: &str) -> Result<Vec<Token<'_>>, DocumentParseError> {
    let mut tokens = Vec::new();
    let mut offset = 0usize;
    let mut regex_allowed = true;

    while offset < source.len() {
        let rest = &source[offset..];
        if rest.starts_with("//") {
            offset += rest.find('\n').unwrap_or(rest.len());
            continue;
        }
        if rest.starts_with("/*") {
            let Some(end) = rest.find("*/") else {
                return Err(DocumentParseError);
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
            offset = skip_quoted(source, offset, character).ok_or(DocumentParseError)?;
            regex_allowed = false;
            continue;
        }
        if character.is_ascii_digit() {
            offset = skip_number(source, offset);
            regex_allowed = false;
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
            regex_allowed = identifier_allows_regex_after(&source[start..offset]);
            continue;
        }
        if character == '/' && regex_allowed {
            offset = skip_regex_literal(source, offset).ok_or(DocumentParseError)?;
            regex_allowed = false;
            continue;
        }
        if rest.starts_with("++") || rest.starts_with("--") {
            tokens.push(Token {
                text: &source[offset..offset + 2],
                kind: TokenKind::Punctuation,
                start: offset,
                end: offset + 2,
            });
            offset += 2;
            continue;
        }
        if rest.starts_with("=>") {
            tokens.push(Token {
                text: &source[offset..offset + 2],
                kind: TokenKind::Punctuation,
                start: offset,
                end: offset + 2,
            });
            offset += 2;
            regex_allowed = true;
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
        regex_allowed = punctuation_allows_regex_after(character, regex_allowed, rest);
    }

    Ok(tokens)
}

fn skip_number(source: &str, start: usize) -> usize {
    let mut offset = start;
    while offset < source.len() {
        let character = source[offset..]
            .chars()
            .next()
            .expect("offset is inside source");
        if !(character.is_ascii_alphanumeric() || matches!(character, '.' | '_')) {
            break;
        }
        offset += character.len_utf8();
    }
    offset
}

fn identifier_allows_regex_after(identifier: &str) -> bool {
    matches!(
        identifier,
        "await"
            | "case"
            | "delete"
            | "do"
            | "else"
            | "extends"
            | "in"
            | "instanceof"
            | "new"
            | "of"
            | "return"
            | "throw"
            | "typeof"
            | "void"
            | "yield"
    )
}

fn punctuation_allows_regex_after(
    punctuation: char,
    previously_allowed: bool,
    source_from_punctuation: &str,
) -> bool {
    match punctuation {
        ')' | ']' | '}' | '.' | '<' | '>' => false,
        '!' if !source_from_punctuation.starts_with("!=") => previously_allowed,
        '?' if source_from_punctuation.starts_with("?.") => false,
        _ => true,
    }
}

fn skip_regex_literal(source: &str, start: usize) -> Option<usize> {
    let mut offset = start + 1;
    let mut escaped = false;
    let mut in_character_class = false;

    while offset < source.len() {
        let character = source[offset..]
            .chars()
            .next()
            .expect("offset is inside source");
        if matches!(character, '\n' | '\r' | '\u{2028}' | '\u{2029}') {
            return None;
        }
        offset += character.len_utf8();
        if escaped {
            escaped = false;
            continue;
        }
        match character {
            '\\' => escaped = true,
            '[' => in_character_class = true,
            ']' => in_character_class = false,
            '/' if !in_character_class => {
                while offset < source.len() {
                    let flag = source[offset..]
                        .chars()
                        .next()
                        .expect("offset is inside source");
                    if !is_identifier_continue(flag) {
                        break;
                    }
                    offset += flag.len_utf8();
                }
                return Some(offset);
            }
            _ => {}
        }
    }
    None
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
