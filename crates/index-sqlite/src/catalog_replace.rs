use std::{
    fs::OpenOptions,
    io::{BufWriter, Write},
    time::Instant,
};

use arkts_index_core::{CommitReceipt, FullCatalogBatch, StoreError, SymbolStore};
use rusqlite::TransactionBehavior;

use crate::{
    SqliteStore, insert_catalog_documents, insert_export_documents, insert_reference_documents,
    insert_symbol_documents, invalid_generation, map_sqlite_error, read_committed_generation,
    read_rejected_documents, sqlite_generation, validate_replacement,
};

#[derive(Default)]
struct CatalogSqlTrace {
    generation: u64,
    documents: usize,
    preflight_ms: f64,
    begin_ms: f64,
    drop_index_ms: f64,
    delete_documents_ms: f64,
    delete_rejected_ms: f64,
    insert_documents_ms: f64,
    insert_symbols_ms: f64,
    insert_exports_ms: f64,
    insert_references_ms: f64,
    insert_occurrences_ms: f64,
    insert_occurrence_identities_ms: f64,
    insert_aliases_ms: f64,
    insert_bindings_ms: f64,
    create_index_ms: f64,
    rejected_metadata_ms: f64,
    commit_ms: f64,
    total_ms: f64,
}

pub(super) fn replace_all(
    store: &mut SqliteStore,
    batch: FullCatalogBatch,
) -> Result<CommitReceipt, StoreError> {
    let total_started = Instant::now();
    let mut trace = CatalogSqlTrace {
        generation: batch.generation,
        documents: batch.documents.len(),
        ..CatalogSqlTrace::default()
    };

    let started = Instant::now();
    let current = store.metadata()?.committed_generation;
    if batch.generation <= current {
        return Err(invalid_generation(batch.generation, current));
    }
    let generation = sqlite_generation(batch.generation)?;
    for document in &batch.documents {
        validate_replacement(document)?;
    }
    trace.preflight_ms = elapsed_ms(started);

    let started = Instant::now();
    let transaction = store
        .connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(map_sqlite_error)?;
    let committed_generation = read_committed_generation(&transaction)?;
    if batch.generation <= committed_generation {
        return Err(invalid_generation(batch.generation, committed_generation));
    }
    trace.begin_ms = elapsed_ms(started);

    let started = Instant::now();
    transaction
        .execute("DROP INDEX reference_occurrence_identities_name", [])
        .map_err(map_sqlite_error)?;
    trace.drop_index_ms = elapsed_ms(started);

    let started = Instant::now();
    transaction
        .execute("DELETE FROM documents", [])
        .map_err(map_sqlite_error)?;
    trace.delete_documents_ms = elapsed_ms(started);

    let started = Instant::now();
    transaction
        .execute("DELETE FROM rejected_documents", [])
        .map_err(map_sqlite_error)?;
    trace.delete_rejected_ms = elapsed_ms(started);

    let started = Instant::now();
    insert_catalog_documents(&transaction, &batch.documents, generation)?;
    trace.insert_documents_ms = elapsed_ms(started);

    let started = Instant::now();
    insert_symbol_documents(&transaction, &batch.documents)?;
    trace.insert_symbols_ms = elapsed_ms(started);

    let started = Instant::now();
    insert_export_documents(&transaction, &batch.documents, generation)?;
    trace.insert_exports_ms = elapsed_ms(started);

    let started = Instant::now();
    let trace_enabled =
        std::env::var_os("ARKTS_INDEX_CATALOG_SQL_TRACE_FILE").is_some_and(|path| !path.is_empty());
    let reference_timings =
        insert_reference_documents(&transaction, &batch.documents, trace_enabled)?;
    trace.insert_references_ms = elapsed_ms(started);
    trace.insert_occurrences_ms = reference_timings.occurrences_ms;
    trace.insert_occurrence_identities_ms = reference_timings.occurrence_identities_ms;
    trace.insert_aliases_ms = reference_timings.aliases_ms;
    trace.insert_bindings_ms = reference_timings.bindings_ms;

    let started = Instant::now();
    transaction
        .execute(
            "CREATE INDEX reference_occurrence_identities_name \
             ON reference_occurrence_identities(name, document_uri, qualification)",
            [],
        )
        .map_err(map_sqlite_error)?;
    trace.create_index_ms = elapsed_ms(started);

    let started = Instant::now();
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
    trace.rejected_metadata_ms = elapsed_ms(started);

    let started = Instant::now();
    transaction.commit().map_err(map_sqlite_error)?;
    trace.commit_ms = elapsed_ms(started);
    trace.total_ms = elapsed_ms(total_started);
    write_trace(&trace);

    Ok(CommitReceipt {
        committed_generation: batch.generation,
        rejected_documents,
    })
}

fn elapsed_ms(started: Instant) -> f64 {
    started.elapsed().as_secs_f64() * 1_000.0
}

fn write_trace(trace: &CatalogSqlTrace) {
    let Some(path) =
        std::env::var_os("ARKTS_INDEX_CATALOG_SQL_TRACE_FILE").filter(|path| !path.is_empty())
    else {
        return;
    };
    let Ok(file) = OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };
    let mut writer = BufWriter::new(file);
    let _ = writeln!(
        writer,
        concat!(
            "{{\"generation\":{},\"documents\":{},",
            "\"preflightMs\":{:.3},\"beginMs\":{:.3},",
            "\"dropIndexMs\":{:.3},\"deleteDocumentsMs\":{:.3},",
            "\"deleteRejectedMs\":{:.3},\"insertDocumentsMs\":{:.3},",
            "\"insertSymbolsMs\":{:.3},\"insertExportsMs\":{:.3},",
            "\"insertReferencesMs\":{:.3},",
            "\"insertOccurrencesMs\":{:.3},\"insertOccurrenceIdentitiesMs\":{:.3},",
            "\"insertAliasesMs\":{:.3},\"insertBindingsMs\":{:.3},",
            "\"createIndexMs\":{:.3},",
            "\"rejectedMetadataMs\":{:.3},\"commitMs\":{:.3},",
            "\"totalMs\":{:.3}}}"
        ),
        trace.generation,
        trace.documents,
        trace.preflight_ms,
        trace.begin_ms,
        trace.drop_index_ms,
        trace.delete_documents_ms,
        trace.delete_rejected_ms,
        trace.insert_documents_ms,
        trace.insert_symbols_ms,
        trace.insert_exports_ms,
        trace.insert_references_ms,
        trace.insert_occurrences_ms,
        trace.insert_occurrence_identities_ms,
        trace.insert_aliases_ms,
        trace.insert_bindings_ms,
        trace.create_index_ms,
        trace.rejected_metadata_ms,
        trace.commit_ms,
        trace.total_ms,
    );
    let _ = writer.flush();
}
