use arkts_index_core::{
    DocumentSymbols, StoreError, StoreErrorKind, acronym_for_search, fold_for_search,
};
use rusqlite::{Transaction, params, params_from_iter, types::Value as SqlValue};

use crate::{class_heritage_storage, insert_reference_documents, kind_to_i64, map_sqlite_error};

pub(super) fn insert_document_symbols(
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
    insert_reference_documents(transaction, std::slice::from_ref(replacement), false)?;
    class_heritage_storage::insert_documents(transaction, std::slice::from_ref(replacement))?;
    Ok(())
}

pub(super) fn insert_catalog_documents(
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

pub(super) fn insert_symbol_documents(
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

pub(super) fn insert_export_documents(
    transaction: &Transaction<'_>,
    documents: &[DocumentSymbols],
    generation: i64,
) -> Result<(), StoreError> {
    let mut statement = transaction
        .prepare_cached(
            "INSERT INTO exports(\
                document_uri, generation, ordinal, exported_name, reference_export_name, \
                name_folded, symbol_kind, \
                declaration_identity, import_specifier, module_id, target_scope, \
                start_line, start_character, end_line, end_character, reference_searchable\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
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
                    item.reference_export_name,
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
