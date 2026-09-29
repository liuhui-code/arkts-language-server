use arkts_index_core::{StoreError, StoreErrorKind};
use rusqlite::{Connection, TransactionBehavior};

use crate::{
    APPLICATION_ID, SCHEMA_VERSION, map_sqlite_error, schema_migrations::HERITAGE_SCHEMA_VERSION,
};

pub(super) fn migrate(connection: &mut Connection) -> Result<(), StoreError> {
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
        || ![HERITAGE_SCHEMA_VERSION, SCHEMA_VERSION].contains(&schema_version)
    {
        return Err(StoreError::new(
            StoreErrorKind::Incompatible,
            format!(
                "unsupported index database application/schema version {application_id}/{schema_version}"
            ),
        ));
    }
    if schema_version == SCHEMA_VERSION {
        return transaction.commit().map_err(map_sqlite_error);
    }
    if !has_column(&transaction, "documents", "class_bindings_source_supported")? {
        transaction
            .execute_batch(
                "ALTER TABLE documents ADD COLUMN class_bindings_source_supported
                    INTEGER CHECK(class_bindings_source_supported IN (0, 1));",
            )
            .map_err(map_sqlite_error)?;
    }
    if !has_column(
        &transaction,
        "class_heritage_declarations",
        "is_direct_export",
    )? {
        transaction
            .execute_batch(
                "ALTER TABLE class_heritage_declarations ADD COLUMN is_direct_export
                    INTEGER NOT NULL DEFAULT 0 CHECK(is_direct_export IN (0, 1));",
            )
            .map_err(map_sqlite_error)?;
    }
    // Legacy rows have no fresh-source provenance, even in downgraded fixtures
    // that retained columns from a newer schema.
    transaction
        .execute_batch(
            "UPDATE documents SET class_bindings_source_supported = NULL;
             UPDATE class_heritage_declarations SET is_direct_export = 0;",
        )
        .map_err(map_sqlite_error)?;
    transaction
        .pragma_update(None, "user_version", SCHEMA_VERSION)
        .map_err(map_sqlite_error)?;
    transaction.commit().map_err(map_sqlite_error)
}

fn has_column(connection: &Connection, table: &str, column: &str) -> Result<bool, StoreError> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(map_sqlite_error)?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(map_sqlite_error)?;
    for observed in columns {
        if observed.map_err(map_sqlite_error)? == column {
            return Ok(true);
        }
    }
    Ok(false)
}
