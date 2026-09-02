//! Persistent SQLite storage for the headless ArkTS workspace index.

use std::{
    fmt::Write as _,
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

use arkts_index_core::{
    CommitReceipt, DocumentSymbols, Position, RefreshBatch, StoreError, StoreErrorKind,
    StoreMetadata, SymbolKind, SymbolQuery, SymbolSearchResult, SymbolStore, TextRange,
    WorkspaceSymbol, acronym_for_search, fold_for_search, rank_symbols,
};
use rusqlite::{Connection, ErrorCode, OpenFlags, TransactionBehavior, params};
use sha2::{Digest, Sha256};

const APPLICATION_ID: i64 = 0x4152_4B49;
const SCHEMA_VERSION: i64 = 1;

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
    let workspace_identity = canonical_file_uri(&canonical_root);
    let mut hasher = Sha256::new();
    hasher.update(b"arkts-index-cache\0v1\0");
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
            .join("symbols-v1.sqlite3"),
    })
}

#[cfg(unix)]
fn canonical_file_uri(path: &Path) -> String {
    use std::os::unix::ffi::OsStrExt;

    format!(
        "file://{}",
        percent_encode_path(path.as_os_str().as_bytes())
    )
}

#[cfg(windows)]
fn canonical_file_uri(path: &Path) -> String {
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
        })
    }

    #[doc(hidden)]
    #[cfg(debug_assertions)]
    pub fn fail_before_commit_once(&mut self) {
        self.fail_before_commit = true;
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
        for uri in &batch.removed_uris {
            transaction
                .execute("DELETE FROM documents WHERE uri = ?1", [uri])
                .map_err(map_sqlite_error)?;
        }
        for replacement in &batch.replacements {
            transaction
                .execute("DELETE FROM documents WHERE uri = ?1", [&replacement.uri])
                .map_err(map_sqlite_error)?;
            transaction
                .execute(
                    "INSERT INTO documents(uri, generation) VALUES (?1, ?2)",
                    params![replacement.uri, generation],
                )
                .map_err(map_sqlite_error)?;
            for (ordinal, symbol) in replacement.symbols.iter().enumerate() {
                transaction
                    .execute(
                        "INSERT INTO symbols(\
                            document_uri, ordinal, name, name_folded, acronym_folded, kind, \
                            container, start_line, start_character, end_line, end_character\
                         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                        params![
                            replacement.uri,
                            i64::try_from(ordinal).map_err(|_| StoreError::new(
                                StoreErrorKind::InvalidData,
                                "symbol ordinal exceeds SQLite integer range",
                            ))?,
                            symbol.name,
                            fold_for_search(&symbol.name),
                            acronym_for_search(&symbol.name),
                            kind_to_i64(symbol.kind),
                            symbol.container,
                            i64::from(symbol.range.start.line),
                            i64::from(symbol.range.start.character),
                            i64::from(symbol.range.end.line),
                            i64::from(symbol.range.end.character),
                        ],
                    )
                    .map_err(map_sqlite_error)?;
            }
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

        transaction.commit().map_err(map_sqlite_error)?;
        Ok(CommitReceipt {
            committed_generation: batch.generation,
        })
    }

    fn search(&self, query: &SymbolQuery) -> Result<SymbolSearchResult, StoreError> {
        let escaped = escape_like(query.folded());
        let substring_pattern = format!("%{escaped}%");
        let acronym_pattern = format!("{escaped}%");
        let mut statement = self
            .connection
            .prepare(
                "SELECT name, kind, document_uri, container, \
                        start_line, start_character, end_line, end_character \
                 FROM symbols \
                 WHERE name_folded LIKE ?1 ESCAPE '\\' \
                    OR acronym_folded LIKE ?2 ESCAPE '\\'",
            )
            .map_err(map_sqlite_error)?;
        let rows = statement
            .query_map(params![substring_pattern, acronym_pattern], |row| {
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
        let generation = self.metadata()?.committed_generation;
        Ok(SymbolSearchResult {
            items: rank_symbols(query, symbols),
            served_generation: generation,
        })
    }
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
             CREATE INDEX symbols_acronym_folded ON symbols(acronym_folded);",
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
    }
}

fn kind_from_i64(value: i64) -> Result<SymbolKind, StoreError> {
    match value {
        1 => Ok(SymbolKind::Class),
        2 => Ok(SymbolKind::Struct),
        3 => Ok(SymbolKind::Function),
        4 => Ok(SymbolKind::Method),
        _ => Err(StoreError::new(
            StoreErrorKind::InvalidData,
            format!("unknown persisted symbol kind {value}"),
        )),
    }
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
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
