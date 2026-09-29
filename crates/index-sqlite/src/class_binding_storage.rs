use arkts_index_core::{
    ClassBindingDocument, ClassBindingProvenance, ClassBindingSnapshot, ReferenceBinding,
    ReferenceBindingResolution, StoreError, validate_class_binding_snapshot_uris,
};
use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior};

use crate::{
    SqliteStore, class_heritage_storage, map_sqlite_error, read_committed_generation,
    reference_binding_kind_from_i64,
};

pub(super) fn snapshot(
    store: &SqliteStore,
    document_uris: &[String],
) -> Result<ClassBindingSnapshot, StoreError> {
    validate_class_binding_snapshot_uris(document_uris)?;
    let transaction = Transaction::new_unchecked(&store.connection, TransactionBehavior::Deferred)
        .map_err(map_sqlite_error)?;
    let served_generation = read_committed_generation(&transaction)?;
    #[cfg(debug_assertions)]
    if let Some((generation_read, resume)) = store
        .class_binding_snapshot_pause
        .lock()
        .expect("test pause mutex should not be poisoned")
        .take()
    {
        generation_read.wait();
        resume.wait();
    }
    let documents = document_uris
        .iter()
        .map(|uri| read_document(&transaction, uri))
        .collect::<Result<Vec<_>, _>>()?;
    transaction.commit().map_err(map_sqlite_error)?;
    Ok(ClassBindingSnapshot {
        documents,
        served_generation,
    })
}

fn read_document(connection: &Connection, uri: &str) -> Result<ClassBindingDocument, StoreError> {
    let heritage = class_heritage_storage::read_document(connection, uri)?;
    let source_supported = connection
        .query_row(
            "SELECT class_bindings_source_supported FROM documents WHERE uri = ?1",
            [uri],
            |row| row.get::<_, Option<bool>>(0),
        )
        .optional()
        .map_err(map_sqlite_error)?
        .flatten();
    let binding_provenance = source_supported
        .map(|source_supported| {
            let mut statement = connection
                .prepare_cached(
                    "SELECT name_start_line, name_start_character, name_end_line, name_end_character
                     FROM class_heritage_declarations
                     WHERE document_uri = ?1 AND is_direct_export = 1 ORDER BY ordinal",
                )
                .map_err(map_sqlite_error)?;
            let direct_exports = statement
                .query_map([uri], |row| class_heritage_storage::read_range(row, 0))
                .map_err(map_sqlite_error)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(map_sqlite_error)?;
            let provenance = ClassBindingProvenance {
                source_supported,
                direct_exports,
            };
            provenance.validate_document(heritage.as_ref())?;
            Ok(provenance)
        })
        .transpose()?;
    let bindings = if source_supported == Some(true) {
        read_bindings(connection, uri)?
    } else {
        Vec::new()
    };
    Ok(ClassBindingDocument {
        uri: uri.to_owned(),
        heritage,
        binding_provenance,
        bindings,
    })
}

fn read_bindings(connection: &Connection, uri: &str) -> Result<Vec<ReferenceBinding>, StoreError> {
    let mut statement = connection
        .prepare_cached(
            "SELECT imported_name, local_name, source_specifier, kind
             FROM reference_bindings WHERE document_uri = ?1 ORDER BY ordinal",
        )
        .map_err(map_sqlite_error)?;
    let rows = statement
        .query_map([uri], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })
        .map_err(map_sqlite_error)?;
    rows.map(|row| {
        let (imported_name, local_name, source_specifier, kind) = row.map_err(map_sqlite_error)?;
        Ok(ReferenceBinding {
            uri: uri.to_owned(),
            imported_name,
            local_name,
            source_specifier,
            kind: reference_binding_kind_from_i64(kind)?,
            source_resolution: ReferenceBindingResolution::Unresolved,
            resolved_source_uri: None,
            external_terminal_identity: None,
        })
    })
    .collect()
}
