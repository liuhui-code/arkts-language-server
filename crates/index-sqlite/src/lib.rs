//! Persistent SQLite storage for the headless ArkTS workspace index.

use std::{
    collections::BTreeSet,
    fmt::Write as _,
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

use arkts_index_core::{
    CommitReceipt, DocumentSymbols, ExportQuery, ExportSearchResult, FullCatalogBatch,
    MAX_REFERENCE_ALIAS_NAMES, Position, ReferenceCandidateQuery, ReferenceCandidateSearchResult,
    RefreshBatch, StoreError, StoreErrorKind, StoreMetadata, SymbolKind, SymbolQuery,
    SymbolSearchResult, SymbolStore, TextRange, WorkspaceExport, WorkspaceSymbol,
    acronym_for_search, fold_for_search, rank_symbols,
};
use rusqlite::types::Value as SqlValue;
use rusqlite::{
    Connection, ErrorCode, OpenFlags, ToSql, Transaction, TransactionBehavior, params,
    params_from_iter,
};
use sha2::{Digest, Sha256};

#[cfg(debug_assertions)]
use std::sync::{Arc, Barrier, Mutex};

const APPLICATION_ID: i64 = 0x4152_4B49;
const SCHEMA_VERSION: i64 = 4;
const EXPORT_SCHEMA_VERSION: i64 = 3;
const PREVIOUS_SCHEMA_VERSION: i64 = 2;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WorkspaceCacheLocation {
    pub workspace_identity: String,
    pub database_path: PathBuf,
}

pub fn workspace_cache_location(
    cache_directory: impl AsRef<Path>,
    workspace_root: impl AsRef<Path>,
) -> Result<WorkspaceCacheLocation, StoreError> {
    let canonical_root = fs::canonicalize(workspace_root).map_err(|error| {
        StoreError::new(
            StoreErrorKind::Io,
            format!("failed to canonicalize workspace root: {error}"),
        )
    })?;
    let workspace_identity = path_to_file_uri(&canonical_root);
    let mut hasher = Sha256::new();
    hasher.update(b"arkts-index-cache\0v2\0");
    hasher.update(workspace_identity.as_bytes());
    let mut cache_key = String::with_capacity(64);
    for byte in hasher.finalize() {
        write!(&mut cache_key, "{byte:02x}").expect("writing to String cannot fail");
    }
    Ok(WorkspaceCacheLocation {
        workspace_identity,
        database_path: cache_directory
            .as_ref()
            .join("workspaces")
            .join(cache_key)
            .join("symbols-v2.sqlite3"),
    })
}

#[cfg(unix)]
pub fn path_to_file_uri(path: &Path) -> String {
    use std::os::unix::ffi::OsStrExt;

    format!(
        "file://{}",
        percent_encode_path(path.as_os_str().as_bytes())
    )
}

#[cfg(windows)]
pub fn path_to_file_uri(path: &Path) -> String {
    let mut normalized = path.to_string_lossy().replace('\\', "/");
    if let Some(without_prefix) = normalized.strip_prefix("//?/") {
        normalized = without_prefix.to_owned();
    }
    if normalized.as_bytes().get(1) == Some(&b':') {
        let normalized_drive = normalized[0..1].to_ascii_lowercase();
        normalized.replace_range(0..1, &normalized_drive);
    }
    format!("file:///{}", percent_encode_path(normalized.as_bytes()))
}

fn percent_encode_path(bytes: &[u8]) -> String {
    let mut encoded = String::with_capacity(bytes.len());
    for byte in bytes {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~' | b'/' | b':') {
            encoded.push(char::from(*byte));
        } else {
            write!(&mut encoded, "%{byte:02X}").expect("writing to String cannot fail");
        }
    }
    encoded
}

pub struct SqliteStore {
    connection: Connection,
    #[cfg(debug_assertions)]
    fail_before_commit: bool,
    #[cfg(debug_assertions)]
    generation_preflight_pause: Option<(Arc<Barrier>, Arc<Barrier>)>,
    #[cfg(debug_assertions)]
    search_rows_pause: Mutex<Option<(Arc<Barrier>, Arc<Barrier>)>>,
}

impl SqliteStore {
    pub fn open(path: impl AsRef<Path>, workspace_identity: &str) -> Result<Self, StoreError> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                StoreError::new(
                    StoreErrorKind::Io,
                    format!("failed to create index cache directory: {error}"),
                )
            })?;
        }
        let flags = OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX;
        let mut connection = Connection::open_with_flags(path, flags).map_err(map_sqlite_error)?;
        connection
            .busy_timeout(Duration::from_secs(5))
            .map_err(map_sqlite_error)?;
        let journal_mode: String = connection
            .query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))
            .map_err(map_sqlite_error)?;
        if !journal_mode.eq_ignore_ascii_case("wal") {
            return Err(StoreError::new(
                StoreErrorKind::Incompatible,
                format!("SQLite WAL mode is unavailable (got {journal_mode})"),
            ));
        }
        connection
            .execute_batch("PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;")
            .map_err(map_sqlite_error)?;

        let application_id: i64 = connection
            .pragma_query_value(None, "application_id", |row| row.get(0))
            .map_err(map_sqlite_error)?;
        let schema_version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(map_sqlite_error)?;
        match (application_id, schema_version) {
            (0, 0) => initialize_schema(&mut connection, workspace_identity)?,
            (APPLICATION_ID, SCHEMA_VERSION) => {
                verify_workspace_identity(&connection, workspace_identity)?
            }
            (APPLICATION_ID, EXPORT_SCHEMA_VERSION) => {
                verify_workspace_identity(&connection, workspace_identity)?;
                migrate_schema_v3_to_v4(&mut connection)?;
            }
            (APPLICATION_ID, PREVIOUS_SCHEMA_VERSION) => {
                verify_workspace_identity(&connection, workspace_identity)?;
                migrate_schema_v2_to_v3(&mut connection)?;
                migrate_schema_v3_to_v4(&mut connection)?;
            }
            _ => {
                return Err(StoreError::new(
                    StoreErrorKind::Incompatible,
                    format!(
                        "unsupported index database application/schema version {application_id}/{schema_version}"
                    ),
                ));
            }
        }

        Ok(Self {
            connection,
            #[cfg(debug_assertions)]
            fail_before_commit: false,
            #[cfg(debug_assertions)]
            generation_preflight_pause: None,
            #[cfg(debug_assertions)]
            search_rows_pause: Mutex::new(None),
        })
    }

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
        let current = self.metadata()?.committed_generation;
        if batch.generation <= current {
            return Err(invalid_generation(batch.generation, current));
        }
        let generation = sqlite_generation(batch.generation)?;
        for document in &batch.documents {
            validate_replacement(document)?;
        }

        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(map_sqlite_error)?;
        let committed_generation = read_committed_generation(&transaction)?;
        if batch.generation <= committed_generation {
            return Err(invalid_generation(batch.generation, committed_generation));
        }

        transaction
            .execute("DELETE FROM documents", [])
            .map_err(map_sqlite_error)?;
        transaction
            .execute("DELETE FROM rejected_documents", [])
            .map_err(map_sqlite_error)?;
        insert_catalog_documents(&transaction, &batch.documents, generation)?;
        insert_symbol_documents(&transaction, &batch.documents)?;
        insert_export_documents(&transaction, &batch.documents, generation)?;
        insert_reference_documents(&transaction, &batch.documents)?;
        for uri in &batch.rejected_uris {
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
        let rejected_documents = read_rejected_documents(&transaction)?;
        transaction.commit().map_err(map_sqlite_error)?;
        Ok(CommitReceipt {
            committed_generation: batch.generation,
            rejected_documents,
        })
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
    ) -> Result<ReferenceCandidateSearchResult, StoreError> {
        let transaction =
            Transaction::new_unchecked(&self.connection, TransactionBehavior::Deferred)
                .map_err(map_sqlite_error)?;
        let generation = read_committed_generation(&transaction)?;
        let mut declaration_statement = transaction
            .prepare(
                "SELECT exported_name, declaration_identity, reference_searchable \
                 FROM exports \
                 WHERE document_uri = ?1 AND start_line = ?2 AND end_line = ?2 \
                   AND start_character <= ?3 AND ?3 < end_character \
                 ORDER BY ordinal LIMIT 2",
            )
            .map_err(map_sqlite_error)?;
        let declaration_rows = declaration_statement
            .query_map(
                params![
                    query.declaration_uri,
                    i64::from(query.declaration_position.line),
                    i64::from(query.declaration_position.character),
                ],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, bool>(2)?,
                    ))
                },
            )
            .map_err(map_sqlite_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(map_sqlite_error)?;
        drop(declaration_statement);
        let [(exported_name, declaration_identity, true)] = declaration_rows.as_slice() else {
            return Ok(unsupported_reference_candidates(generation));
        };

        let names = read_reference_names(&transaction, exported_name)?;
        if names.len() > MAX_REFERENCE_ALIAS_NAMES || names.iter().any(|name| name == "default") {
            return Ok(unsupported_reference_candidates(generation));
        }
        let mut uris =
            read_reference_uris(&transaction, exported_name, query.limit.saturating_add(1))?;
        let complete = uris.len() <= query.limit;
        uris.truncate(query.limit);
        transaction.commit().map_err(map_sqlite_error)?;
        Ok(ReferenceCandidateSearchResult {
            supported: true,
            complete,
            declaration_identity: declaration_identity.clone(),
            names,
            uris,
            served_generation: generation,
        })
    }
}

fn insert_document_symbols(
    transaction: &Transaction<'_>,
    replacement: &DocumentSymbols,
) -> Result<(), StoreError> {
    insert_symbol_documents(transaction, std::slice::from_ref(replacement))?;
    let generation: i64 = transaction
        .query_row(
            "SELECT generation FROM documents WHERE uri = ?1",
            [&replacement.uri],
            |row| row.get(0),
        )
        .map_err(map_sqlite_error)?;
    insert_export_documents(transaction, std::slice::from_ref(replacement), generation)?;
    insert_reference_documents(transaction, std::slice::from_ref(replacement))
}

fn insert_catalog_documents(
    transaction: &Transaction<'_>,
    documents: &[DocumentSymbols],
    generation: i64,
) -> Result<(), StoreError> {
    const DOCUMENTS_PER_INSERT: usize = 64;
    for chunk in documents.chunks(DOCUMENTS_PER_INSERT) {
        let mut sql = String::from("INSERT INTO documents(uri, generation) VALUES ");
        sql.push_str(&vec!["(?,?)"; chunk.len()].join(","));
        let mut values = Vec::with_capacity(chunk.len() * 2);
        for document in chunk {
            values.push(SqlValue::Text(document.uri.clone()));
            values.push(SqlValue::Integer(generation));
        }
        transaction
            .execute(&sql, params_from_iter(values.iter()))
            .map_err(map_sqlite_error)?;
    }
    Ok(())
}

fn insert_symbol_documents(
    transaction: &Transaction<'_>,
    documents: &[DocumentSymbols],
) -> Result<(), StoreError> {
    const SYMBOLS_PER_INSERT: usize = 256;
    const VALUES_PER_SYMBOL: usize = 11;
    let mut values = Vec::with_capacity(SYMBOLS_PER_INSERT * VALUES_PER_SYMBOL);
    let mut row_count = 0usize;

    for document in documents {
        for (ordinal, symbol) in document.symbols.iter().enumerate() {
            let ordinal = i64::try_from(ordinal).map_err(|_| {
                StoreError::new(
                    StoreErrorKind::InvalidData,
                    "symbol ordinal exceeds SQLite integer range",
                )
            })?;
            values.extend([
                SqlValue::Text(document.uri.clone()),
                SqlValue::Integer(ordinal),
                SqlValue::Text(symbol.name.clone()),
                SqlValue::Text(fold_for_search(&symbol.name)),
                SqlValue::Text(acronym_for_search(&symbol.name)),
                SqlValue::Integer(kind_to_i64(symbol.kind)),
                symbol
                    .container
                    .clone()
                    .map_or(SqlValue::Null, SqlValue::Text),
                SqlValue::Integer(i64::from(symbol.range.start.line)),
                SqlValue::Integer(i64::from(symbol.range.start.character)),
                SqlValue::Integer(i64::from(symbol.range.end.line)),
                SqlValue::Integer(i64::from(symbol.range.end.character)),
            ]);
            row_count += 1;
            if row_count == SYMBOLS_PER_INSERT {
                insert_symbol_values(transaction, row_count, &values)?;
                values.clear();
                row_count = 0;
            }
        }
    }
    if row_count > 0 {
        insert_symbol_values(transaction, row_count, &values)?;
    }
    Ok(())
}

fn insert_symbol_values(
    transaction: &Transaction<'_>,
    row_count: usize,
    values: &[SqlValue],
) -> Result<(), StoreError> {
    const VALUES_PER_SYMBOL: usize = 11;
    let mut sql = String::from(
        "INSERT INTO symbols(\
            document_uri, ordinal, name, name_folded, acronym_folded, kind, \
            container, start_line, start_character, end_line, end_character\
         ) VALUES ",
    );
    let value_group = format!("({})", ["?"; VALUES_PER_SYMBOL].join(","));
    sql.push_str(&vec![value_group; row_count].join(","));
    transaction
        .execute(&sql, params_from_iter(values.iter()))
        .map(|_| ())
        .map_err(map_sqlite_error)
}

fn insert_export_documents(
    transaction: &Transaction<'_>,
    documents: &[DocumentSymbols],
    generation: i64,
) -> Result<(), StoreError> {
    let mut statement = transaction
        .prepare_cached(
            "INSERT INTO exports(\
                document_uri, generation, ordinal, exported_name, name_folded, symbol_kind, \
                declaration_identity, import_specifier, module_id, target_scope, \
                start_line, start_character, end_line, end_character, reference_searchable\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        )
        .map_err(map_sqlite_error)?;
    for document in documents {
        for item in &document.exports {
            statement
                .execute(params![
                    document.uri,
                    generation,
                    i64::from(item.ordinal),
                    item.exported_name,
                    fold_for_search(&item.exported_name),
                    kind_to_i64(item.kind),
                    item.declaration_identity,
                    item.import_specifier,
                    item.module_id,
                    item.target_scope,
                    i64::from(item.range.start.line),
                    i64::from(item.range.start.character),
                    i64::from(item.range.end.line),
                    i64::from(item.range.end.character),
                    item.reference_searchable,
                ])
                .map_err(map_sqlite_error)?;
        }
    }
    Ok(())
}

fn insert_reference_documents(
    transaction: &Transaction<'_>,
    documents: &[DocumentSymbols],
) -> Result<(), StoreError> {
    let mut occurrence_statement = transaction
        .prepare_cached(
            "INSERT INTO reference_occurrences(\
                document_uri, ordinal, name, start_line, start_character, end_line, end_character\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .map_err(map_sqlite_error)?;
    let mut alias_statement = transaction
        .prepare_cached(
            "INSERT INTO reference_aliases(document_uri, ordinal, from_name, to_name) \
             VALUES (?1, ?2, ?3, ?4)",
        )
        .map_err(map_sqlite_error)?;
    for document in documents {
        for (ordinal, occurrence) in document.occurrences.iter().enumerate() {
            occurrence_statement
                .execute(params![
                    document.uri,
                    sqlite_ordinal(ordinal, "reference occurrence")?,
                    occurrence.name,
                    i64::from(occurrence.range.start.line),
                    i64::from(occurrence.range.start.character),
                    i64::from(occurrence.range.end.line),
                    i64::from(occurrence.range.end.character),
                ])
                .map_err(map_sqlite_error)?;
        }
        for (ordinal, alias) in document.aliases.iter().enumerate() {
            alias_statement
                .execute(params![
                    document.uri,
                    sqlite_ordinal(ordinal, "reference alias")?,
                    alias.from_name,
                    alias.to_name,
                ])
                .map_err(map_sqlite_error)?;
        }
    }
    Ok(())
}

fn sqlite_ordinal(ordinal: usize, item: &str) -> Result<i64, StoreError> {
    i64::try_from(ordinal).map_err(|_| {
        StoreError::new(
            StoreErrorKind::InvalidData,
            format!("{item} ordinal exceeds SQLite integer range"),
        )
    })
}

const REFERENCE_NAMES_SQL: &str = "WITH RECURSIVE \
    edges(source, target) AS (\
        SELECT from_name, to_name FROM reference_aliases \
        UNION SELECT to_name, from_name FROM reference_aliases\
    ), \
    names(name) AS (\
        VALUES (?1) \
        UNION SELECT edges.target FROM edges JOIN names ON edges.source = names.name\
    ) \
    SELECT name FROM names ORDER BY name LIMIT ?2";

const REFERENCE_URIS_SQL: &str = "WITH RECURSIVE \
    edges(source, target) AS (\
        SELECT from_name, to_name FROM reference_aliases \
        UNION SELECT to_name, from_name FROM reference_aliases\
    ), \
    names(name) AS (\
        VALUES (?1) \
        UNION SELECT edges.target FROM edges JOIN names ON edges.source = names.name\
    ) \
    SELECT DISTINCT reference_occurrences.document_uri \
    FROM reference_occurrences INDEXED BY reference_occurrences_name JOIN names USING(name) \
    ORDER BY reference_occurrences.document_uri LIMIT ?2";

fn read_reference_names(
    connection: &Connection,
    exported_name: &str,
) -> Result<Vec<String>, StoreError> {
    let mut statement = connection
        .prepare(REFERENCE_NAMES_SQL)
        .map_err(map_sqlite_error)?;
    let rows = statement
        .query_map(
            params![exported_name, (MAX_REFERENCE_ALIAS_NAMES + 1) as i64],
            |row| row.get::<_, String>(0),
        )
        .map_err(map_sqlite_error)?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(map_sqlite_error)
}

fn read_reference_uris(
    connection: &Connection,
    exported_name: &str,
    limit: usize,
) -> Result<Vec<String>, StoreError> {
    let limit = i64::try_from(limit).map_err(|_| {
        StoreError::new(
            StoreErrorKind::InvalidData,
            "reference candidate limit exceeds SQLite integer range",
        )
    })?;
    let mut statement = connection
        .prepare(REFERENCE_URIS_SQL)
        .map_err(map_sqlite_error)?;
    let rows = statement
        .query_map(params![exported_name, limit], |row| row.get::<_, String>(0))
        .map_err(map_sqlite_error)?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(map_sqlite_error)
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
            start_line, start_character, end_line, end_character, reference_searchable \
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
        ) = row.map_err(map_sqlite_error)?;
        exports.push(WorkspaceExport {
            exported_name,
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

fn initialize_schema(
    connection: &mut Connection,
    workspace_identity: &str,
) -> Result<(), StoreError> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(map_sqlite_error)?;
    transaction
        .execute_batch(
            "CREATE TABLE metadata(\
                id INTEGER PRIMARY KEY CHECK(id = 1),\
                workspace_identity TEXT NOT NULL,\
                committed_generation INTEGER NOT NULL CHECK(committed_generation >= 0)\
             );\
             CREATE TABLE documents(\
                uri TEXT PRIMARY KEY,\
                generation INTEGER NOT NULL CHECK(generation >= 0)\
             );\
             CREATE TABLE rejected_documents(\
                uri TEXT PRIMARY KEY\
             );\
             CREATE TABLE symbols(\
                document_uri TEXT NOT NULL REFERENCES documents(uri) ON DELETE CASCADE,\
                ordinal INTEGER NOT NULL,\
                name TEXT NOT NULL,\
                name_folded TEXT NOT NULL,\
                acronym_folded TEXT NOT NULL,\
                kind INTEGER NOT NULL,\
                container TEXT,\
                start_line INTEGER NOT NULL,\
                start_character INTEGER NOT NULL,\
                end_line INTEGER NOT NULL,\
                end_character INTEGER NOT NULL,\
                PRIMARY KEY(document_uri, ordinal)\
             );\
             CREATE INDEX symbols_name_folded ON symbols(name_folded);\
             CREATE INDEX symbols_acronym_folded ON symbols(acronym_folded);\
             CREATE TABLE exports(\
                document_uri TEXT NOT NULL REFERENCES documents(uri) ON DELETE CASCADE,\
                generation INTEGER NOT NULL CHECK(generation >= 0),\
                ordinal INTEGER NOT NULL CHECK(ordinal >= 0),\
                exported_name TEXT NOT NULL,\
                name_folded TEXT NOT NULL,\
                symbol_kind INTEGER NOT NULL,\
                declaration_identity TEXT,\
                import_specifier TEXT,\
                module_id TEXT,\
                target_scope TEXT,\
                start_line INTEGER NOT NULL,\
                start_character INTEGER NOT NULL,\
                end_line INTEGER NOT NULL,\
                end_character INTEGER NOT NULL,\
                reference_searchable INTEGER NOT NULL CHECK(reference_searchable IN (0, 1)),\
                PRIMARY KEY(document_uri, ordinal)\
             );\
             CREATE INDEX exports_name_prefix ON exports(name_folded);\
             CREATE TABLE reference_occurrences(\
                document_uri TEXT NOT NULL REFERENCES documents(uri) ON DELETE CASCADE,\
                ordinal INTEGER NOT NULL CHECK(ordinal >= 0),\
                name TEXT NOT NULL,\
                start_line INTEGER NOT NULL,\
                start_character INTEGER NOT NULL,\
                end_line INTEGER NOT NULL,\
                end_character INTEGER NOT NULL,\
                PRIMARY KEY(document_uri, ordinal)\
             );\
             CREATE INDEX reference_occurrences_name ON reference_occurrences(name);\
             CREATE TABLE reference_aliases(\
                document_uri TEXT NOT NULL REFERENCES documents(uri) ON DELETE CASCADE,\
                ordinal INTEGER NOT NULL CHECK(ordinal >= 0),\
                from_name TEXT NOT NULL,\
                to_name TEXT NOT NULL,\
                PRIMARY KEY(document_uri, ordinal)\
             );\
             CREATE INDEX reference_aliases_from_name ON reference_aliases(from_name);\
             CREATE INDEX reference_aliases_to_name ON reference_aliases(to_name);\
             CREATE VIRTUAL TABLE symbol_name_trigrams USING fts5(\
                name_folded,\
                content = 'symbols',\
                content_rowid = 'rowid',\
                tokenize = 'trigram'\
             );\
             CREATE TRIGGER symbols_search_insert AFTER INSERT ON symbols BEGIN \
                INSERT INTO symbol_name_trigrams(rowid, name_folded) \
                VALUES (new.rowid, new.name_folded);\
             END; \
             CREATE TRIGGER symbols_search_delete AFTER DELETE ON symbols BEGIN \
                INSERT INTO symbol_name_trigrams(\
                    symbol_name_trigrams, rowid, name_folded\
                ) VALUES ('delete', old.rowid, old.name_folded);\
             END;",
        )
        .map_err(map_sqlite_error)?;
    transaction
        .execute(
            "INSERT INTO metadata(id, workspace_identity, committed_generation) VALUES (1, ?1, 0)",
            [workspace_identity],
        )
        .map_err(map_sqlite_error)?;
    transaction
        .pragma_update(None, "application_id", APPLICATION_ID)
        .map_err(map_sqlite_error)?;
    transaction
        .pragma_update(None, "user_version", SCHEMA_VERSION)
        .map_err(map_sqlite_error)?;
    transaction.commit().map_err(map_sqlite_error)
}

fn migrate_schema_v3_to_v4(connection: &mut Connection) -> Result<(), StoreError> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(map_sqlite_error)?;
    transaction
        .execute_batch(
            "ALTER TABLE exports ADD COLUMN reference_searchable \
                INTEGER NOT NULL DEFAULT 0 CHECK(reference_searchable IN (0, 1));\
             CREATE TABLE reference_occurrences(\
                document_uri TEXT NOT NULL REFERENCES documents(uri) ON DELETE CASCADE,\
                ordinal INTEGER NOT NULL CHECK(ordinal >= 0),\
                name TEXT NOT NULL,\
                start_line INTEGER NOT NULL,\
                start_character INTEGER NOT NULL,\
                end_line INTEGER NOT NULL,\
                end_character INTEGER NOT NULL,\
                PRIMARY KEY(document_uri, ordinal)\
             );\
             CREATE INDEX reference_occurrences_name ON reference_occurrences(name);\
             CREATE TABLE reference_aliases(\
                document_uri TEXT NOT NULL REFERENCES documents(uri) ON DELETE CASCADE,\
                ordinal INTEGER NOT NULL CHECK(ordinal >= 0),\
                from_name TEXT NOT NULL,\
                to_name TEXT NOT NULL,\
                PRIMARY KEY(document_uri, ordinal)\
             );\
             CREATE INDEX reference_aliases_from_name ON reference_aliases(from_name);\
             CREATE INDEX reference_aliases_to_name ON reference_aliases(to_name);",
        )
        .map_err(map_sqlite_error)?;
    transaction
        .pragma_update(None, "user_version", SCHEMA_VERSION)
        .map_err(map_sqlite_error)?;
    transaction.commit().map_err(map_sqlite_error)
}

fn migrate_schema_v2_to_v3(connection: &mut Connection) -> Result<(), StoreError> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(map_sqlite_error)?;
    transaction
        .execute_batch(
            "CREATE TABLE exports(\
                document_uri TEXT NOT NULL REFERENCES documents(uri) ON DELETE CASCADE,\
                generation INTEGER NOT NULL CHECK(generation >= 0),\
                ordinal INTEGER NOT NULL CHECK(ordinal >= 0),\
                exported_name TEXT NOT NULL,\
                name_folded TEXT NOT NULL,\
                symbol_kind INTEGER NOT NULL,\
                declaration_identity TEXT,\
                import_specifier TEXT,\
                module_id TEXT,\
                target_scope TEXT,\
                start_line INTEGER NOT NULL,\
                start_character INTEGER NOT NULL,\
                end_line INTEGER NOT NULL,\
                end_character INTEGER NOT NULL,\
                PRIMARY KEY(document_uri, ordinal)\
             );\
             CREATE INDEX exports_name_prefix ON exports(name_folded);",
        )
        .map_err(map_sqlite_error)?;
    transaction
        .pragma_update(None, "user_version", EXPORT_SCHEMA_VERSION)
        .map_err(map_sqlite_error)?;
    transaction.commit().map_err(map_sqlite_error)
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
    }
}

fn kind_from_i64(value: i64) -> Result<SymbolKind, StoreError> {
    match value {
        1 => Ok(SymbolKind::Class),
        2 => Ok(SymbolKind::Struct),
        3 => Ok(SymbolKind::Function),
        4 => Ok(SymbolKind::Method),
        5 => Ok(SymbolKind::Enum),
        _ => Err(StoreError::new(
            StoreErrorKind::InvalidData,
            format!("unknown persisted symbol kind {value}"),
        )),
    }
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

fn map_sqlite_error(error: rusqlite::Error) -> StoreError {
    let kind = match &error {
        rusqlite::Error::SqliteFailure(sqlite_error, _) => match sqlite_error.code {
            ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked => StoreErrorKind::Busy,
            ErrorCode::DatabaseCorrupt | ErrorCode::NotADatabase => StoreErrorKind::Corrupt,
            ErrorCode::CannotOpen | ErrorCode::ReadOnly => StoreErrorKind::Io,
            _ => StoreErrorKind::Internal,
        },
        _ => StoreErrorKind::Internal,
    };
    StoreError::new(kind, format!("SQLite index error: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reference_uri_query_forces_the_occurrence_name_index() {
        let connection = Connection::open_in_memory().expect("in-memory database should open");
        connection
            .execute_batch(
                "CREATE TABLE reference_aliases(\
                    from_name TEXT NOT NULL,\
                    to_name TEXT NOT NULL\
                 );\
                 CREATE TABLE reference_occurrences(\
                    document_uri TEXT NOT NULL,\
                    name TEXT NOT NULL\
                 );\
                 CREATE INDEX reference_occurrences_name \
                    ON reference_occurrences(name, document_uri);",
            )
            .expect("reference query schema should exist");

        let mut statement = connection
            .prepare(&format!("EXPLAIN QUERY PLAN {REFERENCE_URIS_SQL}"))
            .expect("reference query plan should prepare");
        let details: Vec<String> = statement
            .query_map(params!["Needle", 20], |row| row.get(3))
            .expect("reference query plan should execute")
            .collect::<Result<_, _>>()
            .expect("reference query plan should decode");

        assert!(
            details
                .iter()
                .any(|detail| detail.contains("reference_occurrences_name")),
            "reference query plan did not use the name index: {details:?}"
        );
    }
}
