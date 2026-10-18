use arkts_index_core::StoreError;
use rusqlite::Transaction;

use crate::map_sqlite_error;

/// Full replacement already owns an immediate transaction. Clear the external
/// FTS index once instead of producing a delete/merge for every old symbol.
/// Schema and data changes roll back together if any later insertion fails.
pub(super) fn clear_documents(transaction: &Transaction<'_>) -> Result<(), StoreError> {
    let delete_trigger: String = transaction
        .query_row(
            "SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = 'symbols_search_delete'",
            [],
            |row| row.get(0),
        )
        .map_err(map_sqlite_error)?;
    transaction
        .execute_batch(
            "DROP TRIGGER symbols_search_delete;\
             INSERT INTO symbol_name_trigrams(symbol_name_trigrams) VALUES ('delete-all');\
             DELETE FROM reference_bindings;\
             DELETE FROM reference_aliases;\
             DELETE FROM reference_occurrence_identities;\
             DELETE FROM reference_occurrences;\
             DELETE FROM exports;\
             DELETE FROM class_heritage_declarations;\
             DELETE FROM symbols;\
             DELETE FROM documents;",
        )
        .map_err(map_sqlite_error)?;
    // Restore the actual cache schema's original trigger before normal insertions
    // and future incremental refreshes. The insert trigger is never disabled.
    transaction
        .execute_batch(&delete_trigger)
        .map_err(map_sqlite_error)
}
