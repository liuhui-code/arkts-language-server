//! Persistent SQLite storage for the headless ArkTS workspace index.

use std::{
    collections::BTreeSet,
    fs,
    path::Path,
    time::{Duration, Instant},
};

use arkts_index_core::{
    ClassBindingSnapshot, ClassHeritageSearchResult, CommitReceipt, DocumentSymbols, ExportQuery,
    ExportSearchResult, FullCatalogBatch, MAX_REFERENCE_ALIAS_NAMES, Position, ReferenceBinding,
    ReferenceBindingKind, ReferenceBindingResolution, ReferenceCandidateQuery,
    ReferenceCandidateSearchResult, ReferenceOccurrenceIdentity, ReferenceSourceResolution,
    RefreshBatch, StoreError, StoreErrorKind, StoreMetadata, SymbolKind, SymbolQuery,
    SymbolSearchResult, SymbolStore, TextRange, WorkspaceExport, WorkspaceSymbol,
    apply_reference_source_resolutions, fold_for_search, prove_reference_binding_chain,
    rank_symbols, reference_binding_source_outside_admission, reference_uri_admitted,
    resolve_reference_binding_sources, sort_reference_bindings,
};
use rusqlite::types::Value as SqlValue;
use rusqlite::{
    Connection, ErrorCode, OpenFlags, ToSql, Transaction, TransactionBehavior, params,
    params_from_iter,
};

pub mod cache_gc;
mod catalog_api;
mod catalog_build;
mod catalog_control;
mod catalog_document;
mod catalog_files;
mod catalog_inputs;
mod catalog_insert;
mod catalog_store;
mod catalog_stream;
mod catalog_trace;
mod store_open;
pub use catalog_api::*;
mod catalog_replace;
mod class_binding_migration;
mod class_binding_storage;
mod class_heritage_storage;
mod reference_anchor;
mod reference_insert;
mod reference_names;
mod reference_query;
mod reference_read;
mod schema;
mod schema_migrations;

use catalog_insert::insert_document_symbols;
use reference_insert::insert_reference_documents;

#[cfg(debug_assertions)]
use std::sync::{Arc, Barrier, Mutex};

const APPLICATION_ID: i64 = 0x4152_4B49;
#[cfg(not(feature = "experimental-occurrence-without-rowid"))]
const SCHEMA_VERSION: i64 = 11;
#[cfg(feature = "experimental-occurrence-without-rowid")]
const SCHEMA_VERSION: i64 = 111;

type DirectImportDeclaration = (String, String, String, Option<String>);

mod cache_location;
pub use cache_location::{
    WorkspaceCacheLocation, cache_key, path_to_file_uri, workspace_cache_location,
};
pub struct SqliteStore {
    connection: Connection,
    _generation_lease: Option<std::fs::File>,
    _cache_lease: Option<cache_gc::lease::CacheLease>,
    #[cfg(debug_assertions)]
    fail_before_commit: bool,
    #[cfg(debug_assertions)]
    generation_preflight_pause: Option<(Arc<Barrier>, Arc<Barrier>)>,
    #[cfg(debug_assertions)]
    search_rows_pause: Mutex<Option<(Arc<Barrier>, Arc<Barrier>)>>,
    #[cfg(debug_assertions)]
    class_binding_snapshot_pause: Mutex<Option<(Arc<Barrier>, Arc<Barrier>)>>,
}

impl SqliteStore {
    #[doc(hidden)]
    #[cfg(debug_assertions)]
    pub fn fail_before_commit_once(&mut self) {
        self.fail_before_commit = true;
    }

    #[doc(hidden)]
    #[cfg(debug_assertions)]
    pub fn pause_after_generation_preflight_once(
        &mut self,
        reached_preflight: Arc<Barrier>,
        resume: Arc<Barrier>,
    ) {
        self.generation_preflight_pause = Some((reached_preflight, resume));
    }

    #[doc(hidden)]
    #[cfg(debug_assertions)]
    pub fn pause_after_search_rows_once(&mut self, rows_read: Arc<Barrier>, resume: Arc<Barrier>) {
        *self
            .search_rows_pause
            .get_mut()
            .expect("test pause mutex should not be poisoned") = Some((rows_read, resume));
    }

    #[doc(hidden)]
    #[cfg(debug_assertions)]
    pub fn pause_after_class_binding_snapshot_once(
        &mut self,
        generation_read: Arc<Barrier>,
        resume: Arc<Barrier>,
    ) {
        *self
            .class_binding_snapshot_pause
            .get_mut()
            .expect("test pause mutex should not be poisoned") = Some((generation_read, resume));
    }

    #[doc(hidden)]
    #[cfg(debug_assertions)]
    pub fn explain_search_plan(&self, query: &str) -> Result<Vec<String>, StoreError> {
        let folded = fold_for_search(query);
        if !is_long_query(&folded) {
            if folded.is_empty() {
                return Ok(Vec::new());
            }
            let mut plan = explain_query_plan(
                &self.connection,
                NAME_PREFIX_SQL,
                &prefix_parameters(&folded),
            )?;
            plan.extend(explain_query_plan(
                &self.connection,
                ACRONYM_PREFIX_SQL,
                &prefix_parameters(&folded),
            )?);
            return Ok(plan);
        }

        let mut plan =
            explain_query_plan(&self.connection, LONG_SUBSTRING_SQL, &[fts_phrase(&folded)])?;
        plan.extend(explain_query_plan(
            &self.connection,
            ACRONYM_PREFIX_SQL,
            &prefix_parameters(&folded),
        )?);
        Ok(plan)
    }
}

impl SymbolStore for SqliteStore {
    fn metadata(&self) -> Result<StoreMetadata, StoreError> {
        let generation: i64 = self
            .connection
            .query_row(
                "SELECT committed_generation FROM metadata WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .map_err(map_sqlite_error)?;
        Ok(StoreMetadata {
            committed_generation: to_u64(generation, "committed_generation")?,
            rejected_documents: read_rejected_documents(&self.connection)?,
        })
    }

    fn apply_batch(&mut self, batch: RefreshBatch) -> Result<CommitReceipt, StoreError> {
        let current = self.metadata()?.committed_generation;
        if batch.generation <= current {
            return Err(StoreError::new(
                StoreErrorKind::InvalidGeneration,
                format!(
                    "generation {} must be newer than committed generation {current}",
                    batch.generation
                ),
            ));
        }
        #[cfg(debug_assertions)]
        if let Some((reached_preflight, resume)) = self.generation_preflight_pause.take() {
            reached_preflight.wait();
            resume.wait();
        }
        let generation = i64::try_from(batch.generation).map_err(|_| {
            StoreError::new(
                StoreErrorKind::InvalidGeneration,
                format!(
                    "generation {} exceeds SQLite integer range",
                    batch.generation
                ),
            )
        })?;
        for replacement in &batch.replacements {
            validate_replacement(replacement)?;
        }

        #[cfg(debug_assertions)]
        let should_fail = std::mem::take(&mut self.fail_before_commit);
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(map_sqlite_error)?;
        let committed_generation: i64 = transaction
            .query_row(
                "SELECT committed_generation FROM metadata WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .map_err(map_sqlite_error)?;
        let committed_generation = to_u64(committed_generation, "committed_generation")?;
        if batch.generation <= committed_generation {
            return Err(StoreError::new(
                StoreErrorKind::InvalidGeneration,
                format!(
                    "generation {} must be newer than committed generation {committed_generation}",
                    batch.generation
                ),
            ));
        }
        for uri in &batch.removed_uris {
            transaction
                .execute("DELETE FROM documents WHERE uri = ?1", [uri])
                .map_err(map_sqlite_error)?;
            transaction
                .execute("DELETE FROM rejected_documents WHERE uri = ?1", [uri])
                .map_err(map_sqlite_error)?;
        }
        for replacement in &batch.replacements {
            transaction
                .execute("DELETE FROM documents WHERE uri = ?1", [&replacement.uri])
                .map_err(map_sqlite_error)?;
            transaction
                .execute(
                    "DELETE FROM rejected_documents WHERE uri = ?1",
                    [&replacement.uri],
                )
                .map_err(map_sqlite_error)?;
            transaction
                .execute(
                    "INSERT INTO documents(uri, generation) VALUES (?1, ?2)",
                    params![replacement.uri, generation],
                )
                .map_err(map_sqlite_error)?;
            insert_document_symbols(&transaction, replacement)?;
        }
        for uri in &batch.rejected_uris {
            transaction
                .execute("DELETE FROM documents WHERE uri = ?1", [uri])
                .map_err(map_sqlite_error)?;
            transaction
                .execute(
                    "INSERT INTO rejected_documents(uri) VALUES (?1) \
                     ON CONFLICT(uri) DO NOTHING",
                    [uri],
                )
                .map_err(map_sqlite_error)?;
        }
        transaction
            .execute(
                "UPDATE metadata SET committed_generation = ?1 WHERE id = 1",
                [generation],
            )
            .map_err(map_sqlite_error)?;

        #[cfg(debug_assertions)]
        if should_fail {
            return Err(StoreError::new(
                StoreErrorKind::Internal,
                "injected failure before SQLite commit",
            ));
        }

        let rejected_documents = read_rejected_documents(&transaction)?;
        transaction.commit().map_err(map_sqlite_error)?;
        Ok(CommitReceipt {
            committed_generation: batch.generation,
            rejected_documents,
        })
    }

    fn replace_all(&mut self, batch: FullCatalogBatch) -> Result<CommitReceipt, StoreError> {
        catalog_replace::replace_all(self, batch)
    }

    fn class_heritage(&self, document_uri: &str) -> Result<ClassHeritageSearchResult, StoreError> {
        class_heritage_storage::search(self, document_uri)
    }

    fn class_binding_snapshot(
        &self,
        document_uris: &[String],
    ) -> Result<ClassBindingSnapshot, StoreError> {
        class_binding_storage::snapshot(self, document_uris)
    }

    fn search(&self, query: &SymbolQuery) -> Result<SymbolSearchResult, StoreError> {
        let transaction =
            Transaction::new_unchecked(&self.connection, TransactionBehavior::Deferred)
                .map_err(map_sqlite_error)?;
        let mut symbols = if query.folded().is_empty() {
            Vec::new()
        } else if !is_long_query(query.folded()) {
            let mut matches = read_symbol_rows(
                &transaction,
                NAME_PREFIX_SQL,
                &prefix_parameters(query.folded()),
            )?;
            matches.extend(read_symbol_rows(
                &transaction,
                ACRONYM_PREFIX_SQL,
                &prefix_parameters(query.folded()),
            )?);
            matches
        } else {
            let mut matches = read_symbol_rows(
                &transaction,
                LONG_SUBSTRING_SQL,
                &[fts_phrase(query.folded())],
            )?;
            matches.extend(read_symbol_rows(
                &transaction,
                ACRONYM_PREFIX_SQL,
                &prefix_parameters(query.folded()),
            )?);
            matches
        };
        deduplicate_symbols(&mut symbols);
        #[cfg(debug_assertions)]
        if let Some((rows_read, resume)) = self
            .search_rows_pause
            .lock()
            .expect("test pause mutex should not be poisoned")
            .take()
        {
            rows_read.wait();
            resume.wait();
        }
        let generation: i64 = transaction
            .query_row(
                "SELECT committed_generation FROM metadata WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .map_err(map_sqlite_error)?;
        let generation = to_u64(generation, "committed_generation")?;
        transaction.commit().map_err(map_sqlite_error)?;
        Ok(SymbolSearchResult {
            items: rank_symbols(query, symbols),
            served_generation: generation,
        })
    }

    fn search_exports(&self, query: &ExportQuery) -> Result<ExportSearchResult, StoreError> {
        let transaction =
            Transaction::new_unchecked(&self.connection, TransactionBehavior::Deferred)
                .map_err(map_sqlite_error)?;
        let mut items = if query.folded().is_empty() {
            Vec::new()
        } else {
            read_export_rows(&transaction, &prefix_parameters(query.folded()))?
        };
        items.sort_by(|left, right| {
            fold_for_search(&left.exported_name)
                .cmp(&fold_for_search(&right.exported_name))
                .then_with(|| left.uri.cmp(&right.uri))
                .then_with(|| left.ordinal.cmp(&right.ordinal))
        });
        items.truncate(query.limit());
        let generation = read_committed_generation(&transaction)?;
        transaction.commit().map_err(map_sqlite_error)?;
        Ok(ExportSearchResult {
            items,
            served_generation: generation,
        })
    }

    fn search_reference_candidates(
        &self,
        query: &ReferenceCandidateQuery,
        source_resolutions: &[ReferenceSourceResolution],
        admitted_uri_roots: &[String],
    ) -> Result<ReferenceCandidateSearchResult, StoreError> {
        reference_query::search(
            &self.connection,
            reference_read::ReferenceLayout::Legacy,
            query,
            source_resolutions,
            admitted_uri_roots,
        )
    }
}

const NAME_PREFIX_SQL: &str = "SELECT name, kind, document_uri, container, \
            start_line, start_character, end_line, end_character \
     FROM symbols INDEXED BY symbols_name_folded \
     WHERE name_folded >= ?1 AND name_folded < ?2";

const ACRONYM_PREFIX_SQL: &str = "SELECT name, kind, document_uri, container, \
            start_line, start_character, end_line, end_character \
     FROM symbols INDEXED BY symbols_acronym_folded \
     WHERE acronym_folded >= ?1 AND acronym_folded < ?2";

const LONG_SUBSTRING_SQL: &str = "SELECT symbols.name, symbols.kind, symbols.document_uri, symbols.container, \
            symbols.start_line, symbols.start_character, \
            symbols.end_line, symbols.end_character \
     FROM symbol_name_trigrams \
     JOIN symbols ON symbols.rowid = symbol_name_trigrams.rowid \
     WHERE symbol_name_trigrams MATCH ?1";

const EXPORT_PREFIX_SQL: &str = "SELECT exported_name, symbol_kind, document_uri, ordinal, \
            declaration_identity, import_specifier, module_id, target_scope, \
            start_line, start_character, end_line, end_character, reference_searchable, \
            reference_export_name \
     FROM exports INDEXED BY exports_name_prefix \
     WHERE name_folded >= ?1 AND name_folded < ?2";

fn read_export_rows(
    connection: &Connection,
    parameters: &[String],
) -> Result<Vec<WorkspaceExport>, StoreError> {
    let mut statement = connection
        .prepare(EXPORT_PREFIX_SQL)
        .map_err(map_sqlite_error)?;
    let parameter_refs: Vec<&dyn ToSql> = parameters
        .iter()
        .map(|parameter| parameter as &dyn ToSql)
        .collect();
    let rows = statement
        .query_map(parameter_refs.as_slice(), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, i64>(8)?,
                row.get::<_, i64>(9)?,
                row.get::<_, i64>(10)?,
                row.get::<_, i64>(11)?,
                row.get::<_, bool>(12)?,
                row.get::<_, Option<String>>(13)?,
            ))
        })
        .map_err(map_sqlite_error)?;
    let mut exports = Vec::new();
    for row in rows {
        let (
            exported_name,
            kind,
            uri,
            ordinal,
            declaration_identity,
            import_specifier,
            module_id,
            target_scope,
            start_line,
            start_character,
            end_line,
            end_character,
            reference_searchable,
            reference_export_name,
        ) = row.map_err(map_sqlite_error)?;
        exports.push(WorkspaceExport {
            exported_name,
            reference_export_name,
            kind: kind_from_i64(kind)?,
            uri,
            range: TextRange::new(
                Position::new(
                    to_u32(start_line, "start_line")?,
                    to_u32(start_character, "start_character")?,
                ),
                Position::new(
                    to_u32(end_line, "end_line")?,
                    to_u32(end_character, "end_character")?,
                ),
            ),
            ordinal: to_u32(ordinal, "ordinal")?,
            declaration_identity,
            import_specifier,
            module_id,
            target_scope,
            reference_searchable,
        });
    }
    Ok(exports)
}

fn read_symbol_rows(
    connection: &Connection,
    sql: &str,
    parameters: &[String],
) -> Result<Vec<WorkspaceSymbol>, StoreError> {
    let mut statement = connection.prepare(sql).map_err(map_sqlite_error)?;
    let parameter_refs: Vec<&dyn ToSql> = parameters
        .iter()
        .map(|parameter| parameter as &dyn ToSql)
        .collect();
    let rows = statement
        .query_map(parameter_refs.as_slice(), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, i64>(7)?,
            ))
        })
        .map_err(map_sqlite_error)?;
    let mut symbols = Vec::new();
    for row in rows {
        let (name, kind, uri, container, start_line, start_character, end_line, end_character) =
            row.map_err(map_sqlite_error)?;
        symbols.push(WorkspaceSymbol {
            name,
            kind: kind_from_i64(kind)?,
            uri,
            range: TextRange::new(
                Position::new(
                    to_u32(start_line, "start_line")?,
                    to_u32(start_character, "start_character")?,
                ),
                Position::new(
                    to_u32(end_line, "end_line")?,
                    to_u32(end_character, "end_character")?,
                ),
            ),
            container,
        });
    }
    Ok(symbols)
}

#[cfg(debug_assertions)]
fn explain_query_plan(
    connection: &Connection,
    sql: &str,
    parameters: &[String],
) -> Result<Vec<String>, StoreError> {
    let mut statement = connection
        .prepare(&format!("EXPLAIN QUERY PLAN {sql}"))
        .map_err(map_sqlite_error)?;
    let parameter_refs: Vec<&dyn ToSql> = parameters
        .iter()
        .map(|parameter| parameter as &dyn ToSql)
        .collect();
    let rows = statement
        .query_map(parameter_refs.as_slice(), |row| row.get::<_, String>(3))
        .map_err(map_sqlite_error)?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(map_sqlite_error)
}

fn is_long_query(value: &str) -> bool {
    value.chars().nth(2).is_some()
}

fn fts_phrase(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn prefix_parameters(folded: &str) -> Vec<String> {
    vec![folded.to_owned(), format!("{folded}\u{10ffff}")]
}

fn deduplicate_symbols(symbols: &mut Vec<WorkspaceSymbol>) {
    let mut seen = BTreeSet::new();
    symbols.retain(|symbol| {
        seen.insert((
            symbol.uri.clone(),
            symbol.range.start.line,
            symbol.range.start.character,
        ))
    });
}

fn read_rejected_documents(connection: &Connection) -> Result<Vec<String>, StoreError> {
    let mut statement = connection
        .prepare("SELECT uri FROM rejected_documents ORDER BY uri")
        .map_err(map_sqlite_error)?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(map_sqlite_error)?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(map_sqlite_error)
}

fn read_committed_generation(connection: &Connection) -> Result<u64, StoreError> {
    let generation: i64 = connection
        .query_row(
            "SELECT committed_generation FROM metadata WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .map_err(map_sqlite_error)?;
    to_u64(generation, "committed_generation")
}

fn sqlite_generation(generation: u64) -> Result<i64, StoreError> {
    i64::try_from(generation).map_err(|_| {
        StoreError::new(
            StoreErrorKind::InvalidGeneration,
            format!("generation {generation} exceeds SQLite integer range"),
        )
    })
}

fn invalid_generation(next: u64, current: u64) -> StoreError {
    StoreError::new(
        StoreErrorKind::InvalidGeneration,
        format!("generation {next} must be newer than committed generation {current}"),
    )
}

fn verify_workspace_identity(
    connection: &Connection,
    expected_identity: &str,
) -> Result<(), StoreError> {
    let actual_identity: String = connection
        .query_row(
            "SELECT workspace_identity FROM metadata WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .map_err(map_sqlite_error)?;
    if actual_identity == expected_identity {
        Ok(())
    } else {
        Err(StoreError::new(
            StoreErrorKind::WorkspaceMismatch,
            format!("index cache belongs to {actual_identity}, not {expected_identity}"),
        ))
    }
}

fn validate_replacement(document: &DocumentSymbols) -> Result<(), StoreError> {
    if let Some(facts) = &document.class_heritage {
        facts.validate_document(&document.uri)?;
    }
    if let Some(facts) = &document.class_binding_provenance {
        facts.validate_document(document.class_heritage.as_ref())?;
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

fn kind_to_i64(kind: SymbolKind) -> i64 {
    match kind {
        SymbolKind::Class => 1,
        SymbolKind::Struct => 2,
        SymbolKind::Function => 3,
        SymbolKind::Method => 4,
        SymbolKind::Enum => 5,
        SymbolKind::Interface => 6,
        SymbolKind::TypeAlias => 7,
        SymbolKind::Variable => 8,
        SymbolKind::Namespace => 9,
    }
}

fn kind_from_i64(value: i64) -> Result<SymbolKind, StoreError> {
    match value {
        1 => Ok(SymbolKind::Class),
        2 => Ok(SymbolKind::Struct),
        3 => Ok(SymbolKind::Function),
        4 => Ok(SymbolKind::Method),
        5 => Ok(SymbolKind::Enum),
        6 => Ok(SymbolKind::Interface),
        7 => Ok(SymbolKind::TypeAlias),
        8 => Ok(SymbolKind::Variable),
        9 => Ok(SymbolKind::Namespace),
        _ => Err(StoreError::new(
            StoreErrorKind::InvalidData,
            format!("unknown persisted symbol kind {value}"),
        )),
    }
}

fn reference_binding_kind_to_i64(kind: ReferenceBindingKind) -> i64 {
    match kind {
        ReferenceBindingKind::Import => 1,
        ReferenceBindingKind::ReExport => 2,
    }
}

fn reference_binding_kind_from_i64(value: i64) -> Result<ReferenceBindingKind, StoreError> {
    match value {
        1 => Ok(ReferenceBindingKind::Import),
        2 => Ok(ReferenceBindingKind::ReExport),
        _ => Err(StoreError::new(
            StoreErrorKind::InvalidData,
            format!("unknown persisted reference binding kind {value}"),
        )),
    }
}

fn reference_qualification_from_i64(value: i64) -> Result<Option<bool>, StoreError> {
    match value {
        -1 => Ok(None),
        0 => Ok(Some(false)),
        1 => Ok(Some(true)),
        _ => Err(StoreError::new(
            StoreErrorKind::InvalidData,
            format!("unknown persisted reference qualification {value}"),
        )),
    }
}

fn non_empty_string(value: String) -> Option<String> {
    (!value.is_empty()).then_some(value)
}

fn to_u32(value: i64, field: &str) -> Result<u32, StoreError> {
    u32::try_from(value).map_err(|_| {
        StoreError::new(
            StoreErrorKind::InvalidData,
            format!("persisted {field} is outside the UTF-16 position range"),
        )
    })
}

fn to_u64(value: i64, field: &str) -> Result<u64, StoreError> {
    u64::try_from(value).map_err(|_| {
        StoreError::new(
            StoreErrorKind::InvalidData,
            format!("persisted {field} must be non-negative"),
        )
    })
}

mod sqlite_error;
pub(crate) use sqlite_error::map_sqlite_error;
