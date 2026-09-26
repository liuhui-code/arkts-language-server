use super::{APPLICATION_ID, SCHEMA_VERSION, map_sqlite_error};
use arkts_index_core::StoreError;
use rusqlite::{Connection, TransactionBehavior};

pub(super) fn initialize_schema(
    connection: &mut Connection,
    workspace_identity: &str,
) -> Result<(), StoreError> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(map_sqlite_error)?;
    transaction
        .execute_batch(&fresh_schema_sql(
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
                reference_export_name TEXT,\
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
             CREATE INDEX exports_reference_export_name \
                ON exports(reference_export_name, document_uri);\
             CREATE TABLE reference_occurrences(\
                document_uri TEXT NOT NULL REFERENCES documents(uri) ON DELETE CASCADE,\
                ordinal INTEGER NOT NULL CHECK(ordinal >= 0),\
                name TEXT NOT NULL,\
                start_line INTEGER NOT NULL,\
                start_character INTEGER NOT NULL,\
                end_line INTEGER NOT NULL,\
                end_character INTEGER NOT NULL,\
                qualified INTEGER CHECK(qualified IN (0, 1)),\
                PRIMARY KEY(document_uri, ordinal)\
             );\
             CREATE TABLE reference_occurrence_identities(\
                document_uri TEXT NOT NULL REFERENCES documents(uri) ON DELETE CASCADE,\
                name TEXT NOT NULL,\
                qualification INTEGER NOT NULL CHECK(qualification IN (-1, 0, 1)),\
                qualifier TEXT NOT NULL,\
                PRIMARY KEY(document_uri, name, qualification, qualifier)\
             );\
             CREATE INDEX reference_occurrence_identities_name \
                ON reference_occurrence_identities(\
                    name, document_uri, qualification, qualifier\
                );\
             CREATE TABLE reference_aliases(\
                document_uri TEXT NOT NULL REFERENCES documents(uri) ON DELETE CASCADE,\
                ordinal INTEGER NOT NULL CHECK(ordinal >= 0),\
                from_name TEXT NOT NULL,\
                to_name TEXT NOT NULL,\
                PRIMARY KEY(document_uri, ordinal)\
             );\
             CREATE INDEX reference_aliases_from_name ON reference_aliases(from_name);\
             CREATE INDEX reference_aliases_to_name ON reference_aliases(to_name);\
             CREATE TABLE reference_bindings(\
                document_uri TEXT NOT NULL REFERENCES documents(uri) ON DELETE CASCADE,\
                ordinal INTEGER NOT NULL CHECK(ordinal >= 0),\
                imported_name TEXT NOT NULL,\
                local_name TEXT NOT NULL,\
                source_specifier TEXT NOT NULL,\
                kind INTEGER NOT NULL CHECK(kind IN (1, 2)),\
                PRIMARY KEY(document_uri, ordinal)\
             );\
             CREATE INDEX reference_bindings_imported_name \
                ON reference_bindings(imported_name);\
             CREATE INDEX reference_bindings_local_name \
                ON reference_bindings(local_name);\
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
        ))
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

fn fresh_schema_sql(sql: &str) -> String {
    #[cfg(feature = "experimental-occurrence-without-rowid")]
    {
        let start = sql.find("CREATE TABLE reference_occurrences(").unwrap();
        let end = start + sql[start..].find(");").unwrap();
        let mut result = sql.to_owned();
        result.insert_str(end + 1, " WITHOUT ROWID");
        result
    }
    #[cfg(not(feature = "experimental-occurrence-without-rowid"))]
    sql.to_owned()
}
