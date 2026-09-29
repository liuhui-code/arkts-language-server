use arkts_index_core::{StoreError, StoreErrorKind};
use rusqlite::{Connection, TransactionBehavior};

use crate::{
    APPLICATION_ID, SCHEMA_VERSION, class_heritage_storage, map_sqlite_error,
    schema::initialize_schema, verify_workspace_identity,
};

#[cfg(not(feature = "experimental-occurrence-without-rowid"))]
pub(super) const HERITAGE_SCHEMA_VERSION: i64 = 10;
#[cfg(feature = "experimental-occurrence-without-rowid")]
pub(super) const HERITAGE_SCHEMA_VERSION: i64 = 110;

pub(super) fn migrate_schema_v9_to_v10(connection: &mut Connection) -> Result<(), StoreError> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(map_sqlite_error)?;
    let application_id: i64 = transaction
        .pragma_query_value(None, "application_id", |row| row.get(0))
        .map_err(map_sqlite_error)?;
    let schema_version: i64 = transaction
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(map_sqlite_error)?;
    if application_id != APPLICATION_ID
        || ![
            HERITAGE_SCHEMA_VERSION - 1,
            HERITAGE_SCHEMA_VERSION,
            SCHEMA_VERSION,
        ]
        .contains(&schema_version)
    {
        return Err(StoreError::new(
            StoreErrorKind::Incompatible,
            format!(
                "unsupported index database application/schema version {application_id}/{schema_version}"
            ),
        ));
    }
    if schema_version >= HERITAGE_SCHEMA_VERSION {
        return transaction.commit().map_err(map_sqlite_error);
    }
    let has_heritage_marker = {
        let mut statement = transaction
            .prepare("PRAGMA table_info(documents)")
            .map_err(map_sqlite_error)?;
        let columns = statement
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(map_sqlite_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(map_sqlite_error)?;
        columns
            .iter()
            .any(|column| column == "heritage_lexically_complete")
    };
    if !has_heritage_marker {
        transaction
            .execute_batch(
                "ALTER TABLE documents ADD COLUMN heritage_lexically_complete
                    INTEGER CHECK(heritage_lexically_complete IN (0, 1));",
            )
            .map_err(map_sqlite_error)?;
    }
    transaction
        .execute_batch(class_heritage_storage::CREATE_TABLE_SQL)
        .map_err(map_sqlite_error)?;
    transaction
        .pragma_update(None, "user_version", HERITAGE_SCHEMA_VERSION)
        .map_err(map_sqlite_error)?;
    transaction.commit().map_err(map_sqlite_error)
}

const QUALIFIED_OCCURRENCE_SCHEMA_VERSION: i64 = 8;
const OCCURRENCE_IDENTITY_SCHEMA_VERSION: i64 = 7;
const OCCURRENCE_PROOF_SCHEMA_VERSION: i64 = 6;
const BINDING_SCHEMA_VERSION: i64 = 5;
const REFERENCE_SCHEMA_VERSION: i64 = 4;
const EXPORT_SCHEMA_VERSION: i64 = 3;
const PREVIOUS_SCHEMA_VERSION: i64 = 2;

pub(super) fn ensure_schema(
    connection: &mut Connection,
    workspace_identity: &str,
) -> Result<(), StoreError> {
    let application_id: i64 = connection
        .pragma_query_value(None, "application_id", |row| row.get(0))
        .map_err(map_sqlite_error)?;
    let schema_version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(map_sqlite_error)?;
    #[cfg(feature = "experimental-occurrence-without-rowid")]
    if !matches!(
        (application_id, schema_version),
        (0, 0) | (APPLICATION_ID, 109 | 110) | (APPLICATION_ID, SCHEMA_VERSION)
    ) {
        return Err(StoreError::new(
            StoreErrorKind::Incompatible,
            "experimental occurrence layout requires a separate fresh cache",
        ));
    }
    match (application_id, schema_version) {
        (0, 0) => initialize_schema(connection, workspace_identity)?,
        (APPLICATION_ID, SCHEMA_VERSION) => {
            verify_workspace_identity(connection, workspace_identity)?
        }
        #[cfg(not(feature = "experimental-occurrence-without-rowid"))]
        (APPLICATION_ID, 9 | 10) => {
            verify_workspace_identity(connection, workspace_identity)?;
        }
        #[cfg(feature = "experimental-occurrence-without-rowid")]
        (APPLICATION_ID, 109 | 110) => {
            verify_workspace_identity(connection, workspace_identity)?;
        }
        (APPLICATION_ID, QUALIFIED_OCCURRENCE_SCHEMA_VERSION) => {
            verify_workspace_identity(connection, workspace_identity)?;
            migrate_schema_v8_to_v9(connection)?;
        }
        (APPLICATION_ID, OCCURRENCE_IDENTITY_SCHEMA_VERSION) => {
            verify_workspace_identity(connection, workspace_identity)?;
            migrate_schema_v7_to_v8(connection)?;
            migrate_schema_v8_to_v9(connection)?;
        }
        (APPLICATION_ID, OCCURRENCE_PROOF_SCHEMA_VERSION) => {
            verify_workspace_identity(connection, workspace_identity)?;
            migrate_schema_v6_to_v7(connection)?;
            migrate_schema_v7_to_v8(connection)?;
            migrate_schema_v8_to_v9(connection)?;
        }
        (APPLICATION_ID, BINDING_SCHEMA_VERSION) => {
            verify_workspace_identity(connection, workspace_identity)?;
            migrate_schema_v5_to_v6(connection)?;
            migrate_schema_v6_to_v7(connection)?;
            migrate_schema_v7_to_v8(connection)?;
            migrate_schema_v8_to_v9(connection)?;
        }
        (APPLICATION_ID, REFERENCE_SCHEMA_VERSION) => {
            verify_workspace_identity(connection, workspace_identity)?;
            migrate_schema_v4_to_v5(connection)?;
            migrate_schema_v5_to_v6(connection)?;
            migrate_schema_v6_to_v7(connection)?;
            migrate_schema_v7_to_v8(connection)?;
            migrate_schema_v8_to_v9(connection)?;
        }
        (APPLICATION_ID, EXPORT_SCHEMA_VERSION) => {
            verify_workspace_identity(connection, workspace_identity)?;
            migrate_schema_v3_to_v4(connection)?;
            migrate_schema_v4_to_v5(connection)?;
            migrate_schema_v5_to_v6(connection)?;
            migrate_schema_v6_to_v7(connection)?;
            migrate_schema_v7_to_v8(connection)?;
            migrate_schema_v8_to_v9(connection)?;
        }
        (APPLICATION_ID, PREVIOUS_SCHEMA_VERSION) => {
            verify_workspace_identity(connection, workspace_identity)?;
            migrate_schema_v2_to_v3(connection)?;
            migrate_schema_v3_to_v4(connection)?;
            migrate_schema_v4_to_v5(connection)?;
            migrate_schema_v5_to_v6(connection)?;
            migrate_schema_v6_to_v7(connection)?;
            migrate_schema_v7_to_v8(connection)?;
            migrate_schema_v8_to_v9(connection)?;
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
    let current_version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(map_sqlite_error)?;
    if matches!(current_version, 9 | 109) {
        migrate_schema_v9_to_v10(connection)?;
    }
    let current_version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(map_sqlite_error)?;
    if current_version == HERITAGE_SCHEMA_VERSION {
        crate::class_binding_migration::migrate(connection)?;
    }
    Ok(())
}

fn migrate_schema_v8_to_v9(connection: &mut Connection) -> Result<(), StoreError> {
    let has_reference_export_name = {
        let mut statement = connection
            .prepare("PRAGMA table_info(exports)")
            .map_err(map_sqlite_error)?;
        let columns = statement
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(map_sqlite_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(map_sqlite_error)?;
        columns
            .iter()
            .any(|column| column == "reference_export_name")
    };
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(map_sqlite_error)?;
    if !has_reference_export_name {
        transaction
            .execute_batch("ALTER TABLE exports ADD COLUMN reference_export_name TEXT;")
            .map_err(map_sqlite_error)?;
    }
    transaction
        .execute_batch(
            "UPDATE exports SET reference_export_name = exported_name \
             WHERE reference_searchable = 1 AND reference_export_name IS NULL;\
             CREATE INDEX IF NOT EXISTS exports_reference_export_name \
                ON exports(reference_export_name, document_uri);",
        )
        .map_err(map_sqlite_error)?;
    transaction
        .pragma_update(None, "user_version", 9)
        .map_err(map_sqlite_error)?;
    transaction.commit().map_err(map_sqlite_error)
}

fn migrate_schema_v5_to_v6(connection: &mut Connection) -> Result<(), StoreError> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(map_sqlite_error)?;
    transaction
        .execute_batch(
            "ALTER TABLE reference_occurrences ADD COLUMN qualified \
                INTEGER CHECK(qualified IN (0, 1));",
        )
        .map_err(map_sqlite_error)?;
    transaction
        .pragma_update(None, "user_version", OCCURRENCE_PROOF_SCHEMA_VERSION)
        .map_err(map_sqlite_error)?;
    transaction.commit().map_err(map_sqlite_error)
}

fn migrate_schema_v6_to_v7(connection: &mut Connection) -> Result<(), StoreError> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(map_sqlite_error)?;
    transaction
        .execute_batch(
            "CREATE TABLE reference_occurrence_identities(\
                document_uri TEXT NOT NULL REFERENCES documents(uri) ON DELETE CASCADE,\
                name TEXT NOT NULL,\
                qualification INTEGER NOT NULL CHECK(qualification IN (-1, 0, 1)),\
                PRIMARY KEY(document_uri, name, qualification)\
             );\
             CREATE INDEX reference_occurrence_identities_name \
                ON reference_occurrence_identities(name, document_uri, qualification);\
             INSERT INTO reference_occurrence_identities(document_uri, name, qualification) \
             SELECT document_uri, name, COALESCE(qualified, -1) \
             FROM reference_occurrences \
             GROUP BY document_uri, name, qualified;\
             DROP INDEX reference_occurrences_name;",
        )
        .map_err(map_sqlite_error)?;
    transaction
        .pragma_update(None, "user_version", OCCURRENCE_IDENTITY_SCHEMA_VERSION)
        .map_err(map_sqlite_error)?;
    transaction.commit().map_err(map_sqlite_error)
}

fn migrate_schema_v7_to_v8(connection: &mut Connection) -> Result<(), StoreError> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(map_sqlite_error)?;
    transaction
        .execute_batch(
            "ALTER TABLE reference_occurrence_identities \
                RENAME TO reference_occurrence_identities_v7;\
             DROP INDEX reference_occurrence_identities_name;\
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
             INSERT INTO reference_occurrence_identities(\
                document_uri, name, qualification, qualifier\
             ) \
             SELECT document_uri, name, qualification, '' \
             FROM reference_occurrence_identities_v7;\
             DROP TABLE reference_occurrence_identities_v7;",
        )
        .map_err(map_sqlite_error)?;
    transaction
        .pragma_update(None, "user_version", QUALIFIED_OCCURRENCE_SCHEMA_VERSION)
        .map_err(map_sqlite_error)?;
    transaction.commit().map_err(map_sqlite_error)
}

fn migrate_schema_v4_to_v5(connection: &mut Connection) -> Result<(), StoreError> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(map_sqlite_error)?;
    transaction
        .execute_batch(
            "CREATE TABLE reference_bindings(\
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
                ON reference_bindings(local_name);",
        )
        .map_err(map_sqlite_error)?;
    transaction
        .pragma_update(None, "user_version", BINDING_SCHEMA_VERSION)
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
        .pragma_update(None, "user_version", REFERENCE_SCHEMA_VERSION)
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
