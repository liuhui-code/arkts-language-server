//! Oversized documents are split inside the unpublished DB, preserving ordinals.
use crate::{
    CatalogBuildProgress, CatalogStage, SqliteStore,
    catalog_build::{checkpoint, emit},
    catalog_insert, class_heritage_storage, map_sqlite_error, reference_insert, sqlite_generation,
};
use arkts_index_core::{DocumentSymbols, StoreError};
use rusqlite::{Transaction, TransactionBehavior};

pub(super) fn write(
    store: &mut SqliteStore,
    document: &DocumentSymbols,
    generation: u64,
    progress: &mut CatalogBuildProgress,
    observe: &mut impl FnMut(CatalogBuildProgress) -> bool,
) -> Result<(), StoreError> {
    let mut base = empty(document);
    base.class_binding_provenance = document.class_binding_provenance.clone();
    base.class_heritage = document.class_heritage.clone().map(|mut facts| {
        facts.classes.clear();
        facts
    });
    let tx = store.connection.transaction().map_err(map_sqlite_error)?;
    catalog_insert::insert_catalog_documents(
        &tx,
        std::slice::from_ref(&base),
        sqlite_generation(generation)?,
    )?;
    class_heritage_storage::insert_documents(&tx, std::slice::from_ref(&base))?;
    emit(observe, progress, CatalogStage::Committing)?;
    tx.commit().map_err(map_sqlite_error)?;
    progress.written_rows += 1;

    rows(
        store,
        &document.symbols,
        |s| s.name.len() * 3 + s.container.as_ref().map_or(0, String::len),
        document.uri.len(),
        progress,
        observe,
        |tx, chunk, offset| {
            let mut part = empty(document);
            part.symbols = chunk.to_vec();
            catalog_insert::insert_symbol_documents_at(tx, &[part], offset)?;
            Ok(chunk.len())
        },
    )?;
    rows(
        store,
        &document.exports,
        |e| {
            e.exported_name.len()
                + e.reference_export_name.as_ref().map_or(0, String::len)
                + e.declaration_identity.as_ref().map_or(0, String::len)
                + e.import_specifier.as_ref().map_or(0, String::len)
                + e.module_id.as_ref().map_or(0, String::len)
                + e.target_scope.as_ref().map_or(0, String::len)
        },
        document.uri.len(),
        progress,
        observe,
        |tx, chunk, _| {
            let mut part = empty(document);
            part.exports = chunk.to_vec();
            catalog_insert::insert_export_documents(tx, &[part], sqlite_generation(generation)?)?;
            Ok(chunk.len())
        },
    )?;
    rows(
        store,
        &document.occurrences,
        |o| 2 * (o.name.len() + o.qualifier.as_ref().map_or(0, String::len)),
        document.uri.len() * 2,
        progress,
        observe,
        |tx, chunk, offset| {
            let mut part = empty(document);
            part.occurrences = chunk.to_vec();
            let count = reference_insert::insert_document_chunk(tx, &part, offset)?;
            Ok(count.occurrence_rows + count.occurrence_identity_rows)
        },
    )?;
    rows(
        store,
        &document.aliases,
        |a| a.from_name.len() + a.to_name.len(),
        document.uri.len(),
        progress,
        observe,
        |tx, chunk, offset| {
            let mut part = empty(document);
            part.aliases = chunk.to_vec();
            reference_insert::insert_document_chunk(tx, &part, offset)?;
            Ok(chunk.len())
        },
    )?;
    rows(
        store,
        &document.bindings,
        |b| b.imported_name.len() + b.local_name.len() + b.source_specifier.len(),
        document.uri.len(),
        progress,
        observe,
        |tx, chunk, offset| {
            let mut part = empty(document);
            part.bindings = chunk.to_vec();
            reference_insert::insert_document_chunk(tx, &part, offset)?;
            Ok(chunk.len())
        },
    )?;
    if let Some(facts) = &document.class_heritage {
        rows(
            store,
            &facts.classes,
            |c| c.name.len() + c.base.as_ref().map_or(0, |b| b.name.len()),
            document.uri.len(),
            progress,
            observe,
            |tx, chunk, offset| {
                let mut part = empty(document);
                let mut heritage = facts.clone();
                heritage.classes = chunk.to_vec();
                part.class_heritage = Some(heritage);
                part.class_binding_provenance = document.class_binding_provenance.clone();
                class_heritage_storage::insert_documents_at(tx, &[part], offset)?;
                Ok(chunk.len())
            },
        )?;
    }
    Ok(())
}

fn rows<T>(
    store: &mut SqliteStore,
    values: &[T],
    size: impl Fn(&T) -> usize,
    uri_bytes: usize,
    progress: &mut CatalogBuildProgress,
    observe: &mut impl FnMut(CatalogBuildProgress) -> bool,
    mut insert: impl FnMut(&Transaction<'_>, &[T], usize) -> Result<usize, StoreError>,
) -> Result<(), StoreError> {
    let mut start = 0;
    while start < values.len() {
        emit(observe, progress, CatalogStage::Writing)?;
        let (mut end, mut bytes) = (start, 0usize);
        // Two logical rows per reference occurrence, plus all maintained indexes/FTS.
        while end < values.len() && end - start < 4_096 {
            let next = size(&values[end]).saturating_add(uri_bytes + 256);
            if end > start && bytes.saturating_add(next) > 4 * 1024 * 1024 {
                break;
            }
            bytes = bytes.saturating_add(next);
            end += 1;
        }
        let tx = store
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(map_sqlite_error)?;
        let count = insert(&tx, &values[start..end], start)?;
        emit(observe, progress, CatalogStage::Committing)?;
        tx.commit().map_err(map_sqlite_error)?;
        progress.written_rows = progress.written_rows.saturating_add(count);
        emit(observe, progress, CatalogStage::Checkpointing)?;
        checkpoint(store, "PASSIVE", progress)?;
        emit(observe, progress, CatalogStage::Writing)?;
        start = end;
    }
    Ok(())
}

fn empty(document: &DocumentSymbols) -> DocumentSymbols {
    DocumentSymbols {
        uri: document.uri.clone(),
        symbols: vec![],
        exports: vec![],
        occurrences: vec![],
        aliases: vec![],
        bindings: vec![],
        class_heritage: None,
        class_binding_provenance: None,
    }
}
