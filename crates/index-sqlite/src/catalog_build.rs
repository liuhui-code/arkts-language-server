use crate::{
    SqliteStore,
    catalog_control::{Control, incompatible},
    catalog_files,
    catalog_insert::{insert_catalog_documents, insert_export_documents, insert_symbol_documents},
    catalog_store::open_published,
    class_heritage_storage, invalid_generation, map_sqlite_error, read_rejected_documents,
    reference_insert::insert_reference_documents,
    sqlite_generation, validate_replacement,
};
use arkts_index_core::{
    CommitReceipt, DocumentSymbols, FullCatalogBatch, StoreError, StoreErrorKind, SymbolStore,
};
use rusqlite::TransactionBehavior;
use std::{path::Path, time::Instant};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CatalogStage {
    Writing,
    Committing,
    Checkpointing,
    Validating,
    Publishing,
    Checking,
    Reusing,
}

impl CatalogStage {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Writing => "writing",
            Self::Committing => "committing",
            Self::Checkpointing => "checkpointing",
            Self::Validating => "validating",
            Self::Publishing => "publishing",
            Self::Checking => "checking",
            Self::Reusing => "reusing",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CatalogBuildProgress {
    pub stage: CatalogStage,
    pub written_documents: usize,
    pub written_rows: usize,
    pub checkpointed_frames: usize,
    pub wal_frames: usize,
}

/// False from the observer cancels at a transaction/stage boundary, before publication.
/// The unpublished file remains disposable after a crash; no active rows are deleted.
pub fn build_catalog(
    base: &Path,
    identity: &str,
    batch: FullCatalogBatch,
    observe: impl FnMut(CatalogBuildProgress) -> bool,
) -> Result<CommitReceipt, StoreError> {
    build_catalog_with_fingerprint(base, identity, batch, None, observe)
}

pub fn build_catalog_with_fingerprint(
    base: &Path,
    identity: &str,
    batch: FullCatalogBatch,
    fingerprint: Option<&str>,
    mut observe: impl FnMut(CatalogBuildProgress) -> bool,
) -> Result<CommitReceipt, StoreError> {
    let mut control = Control::open(base, identity)?;
    let guard = control.shared()?;
    let parent = control.active()?;
    let mut old = open_published(&control.path(&parent), identity, &parent)?;
    let expected = old.metadata()?.committed_generation;
    if batch.generation <= expected {
        drop(guard);
        catalog_files::retire(old, base.to_owned(), identity.into());
        return Err(invalid_generation(batch.generation, expected));
    }
    let reuse = expected > 0
        && batch.rejected_uris.is_empty()
        && fingerprint.is_some()
        && control.fingerprint()?.as_deref() == fingerprint;
    let path = if reuse {
        None
    } else {
        Some(catalog_files::new_database(base)?)
    };
    // Reserve the build's reader lease while still holding the publication lock.
    let reservation = path
        .as_ref()
        .map(|path| catalog_files::reader_lease(path))
        .transpose()?;
    drop(guard);
    let mut progress = CatalogBuildProgress {
        stage: CatalogStage::Writing,
        written_documents: 0,
        written_rows: 0,
        checkpointed_frames: 0,
        wal_frames: 0,
    };
    let result = (|| {
        if reuse {
            emit(&mut observe, &mut progress, CatalogStage::Reusing)?;
        } else {
            let mut store = SqliteStore::open(path.as_ref().unwrap(), identity)?;
            write_documents(&mut store, &batch, &mut progress, &mut observe)?;
            emit(&mut observe, &mut progress, CatalogStage::Validating)?;
            validate(&store)?;
            emit(&mut observe, &mut progress, CatalogStage::Checkpointing)?;
            // Publish only a sealed DB. FULL also syncs the final WAL commit; TRUNCATE
            // finishes persistence before the short control transaction exposes it.
            store
                .connection
                .execute_batch("PRAGMA synchronous=FULL;")
                .map_err(map_sqlite_error)?;
            finish_metadata(&mut store, batch.generation, &batch.rejected_uris)?;
            checkpoint(&store, "TRUNCATE", &mut progress)?;
            emit(&mut observe, &mut progress, CatalogStage::Checkpointing)?;
            drop(store);
            catalog_files::sync_parent(path.as_ref().unwrap())?;
        }
        emit(&mut observe, &mut progress, CatalogStage::Checking)?;
        let guard = control.exclusive()?;
        if control.active()? != parent || old.metadata()?.committed_generation != expected {
            return Err(StoreError::new(
                StoreErrorKind::InvalidGeneration,
                "catalog base changed while building; unpublished result discarded",
            ));
        }
        // The observer may claim the non-cancellable publishing boundary here.
        emit(&mut observe, &mut progress, CatalogStage::Publishing)?;
        let database = if let Some(path) = &path {
            path.file_name()
                .and_then(|s| s.to_str())
                .ok_or_else(|| incompatible("invalid build path"))?
        } else {
            &parent.database
        };
        let rejected_documents = if reuse {
            old.connection
                .execute_batch("PRAGMA synchronous=FULL;")
                .map_err(map_sqlite_error)?;
            finish_metadata(&mut old, batch.generation, &[])?;
            read_rejected_documents(&old.connection)?
        } else {
            batch
                .rejected_uris
                .iter()
                .cloned()
                .collect::<std::collections::BTreeSet<_>>()
                .into_iter()
                .collect()
        };
        // Reuse changes only metadata in the already-published DB. Its single
        // commit is the publication point; a second control commit could fail
        // after the active generation had already advanced.
        if !reuse {
            control.publish(
                database,
                batch.generation,
                if batch.rejected_uris.is_empty() {
                    fingerprint
                } else {
                    None
                },
            )?;
        }
        drop(guard);
        Ok(CommitReceipt {
            committed_generation: batch.generation,
            rejected_documents,
        })
    })();
    catalog_files::retire(old, base.to_owned(), identity.into());
    drop(reservation);
    if let Ok(_guard) = control.exclusive() {
        catalog_files::prune(&control);
    }
    result
}

fn write_documents(
    store: &mut SqliteStore,
    batch: &FullCatalogBatch,
    progress: &mut CatalogBuildProgress,
    observe: &mut impl FnMut(CatalogBuildProgress) -> bool,
) -> Result<(), StoreError> {
    let mut start = 0;
    while start < batch.documents.len() {
        emit(observe, progress, CatalogStage::Writing)?;
        let mut end = start;
        let (mut rows, mut bytes) = (0usize, 0usize);
        while end < batch.documents.len() && end - start < 64 {
            let cost = document_cost(&batch.documents[end]);
            if end > start
                && (rows.saturating_add(cost.0) > 32_768
                    || bytes.saturating_add(cost.1) > 8 * 1024 * 1024)
            {
                break;
            }
            rows = rows.saturating_add(cost.0);
            bytes = bytes.saturating_add(cost.1);
            end += 1;
        }
        if end == start + 1 && (rows > 32_768 || bytes > 8 * 1024 * 1024) {
            validate_replacement(&batch.documents[start])?;
            crate::catalog_document::write(
                store,
                &batch.documents[start],
                batch.generation,
                progress,
                observe,
            )?;
            progress.written_documents = end;
            emit(observe, progress, CatalogStage::Writing)?;
            start = end;
            continue;
        }
        let documents = &batch.documents[start..end];
        for document in documents {
            validate_replacement(document)?;
        }
        let started = Instant::now();
        let tx = store
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(map_sqlite_error)?;
        insert_catalog_documents(&tx, documents, sqlite_generation(batch.generation)?)?;
        insert_symbol_documents(&tx, documents)?;
        insert_export_documents(&tx, documents, sqlite_generation(batch.generation)?)?;
        class_heritage_storage::insert_documents(&tx, documents)?;
        let references = insert_reference_documents(&tx, documents, true)?;
        let actual_rows = documents
            .iter()
            .map(|d| {
                1 + d.symbols.len()
                    + d.exports.len()
                    + d.class_heritage.as_ref().map_or(0, |h| h.classes.len())
            })
            .sum::<usize>()
            + references.occurrence_rows
            + references.occurrence_identity_rows
            + references.alias_rows
            + references.binding_rows;
        emit(observe, progress, CatalogStage::Committing)?;
        tx.commit().map_err(map_sqlite_error)?;
        progress.written_documents = end;
        progress.written_rows = progress.written_rows.saturating_add(actual_rows);
        trace(batch.generation, progress, started.elapsed().as_millis());
        emit(observe, progress, CatalogStage::Checkpointing)?;
        checkpoint(store, "PASSIVE", progress)?;
        emit(observe, progress, CatalogStage::Writing)?;
        start = end;
    }
    Ok(())
}

fn finish_metadata(
    store: &mut SqliteStore,
    generation: u64,
    rejected: &[String],
) -> Result<(), StoreError> {
    // Rejections are also bounded; this DB is still unpublished until every row exists.
    for chunk in rejected.chunks(256) {
        let tx = store.connection.transaction().map_err(map_sqlite_error)?;
        for uri in chunk {
            tx.execute(
                "INSERT OR IGNORE INTO rejected_documents(uri) VALUES(?1)",
                [uri],
            )
            .map_err(map_sqlite_error)?;
        }
        tx.commit().map_err(map_sqlite_error)?;
    }
    store
        .connection
        .execute(
            "UPDATE metadata SET committed_generation=?1 WHERE id=1",
            [sqlite_generation(generation)?],
        )
        .map(|_| ())
        .map_err(map_sqlite_error)
}

fn validate(store: &SqliteStore) -> Result<(), StoreError> {
    let check: String = store
        .connection
        .query_row("PRAGMA quick_check", [], |r| r.get(0))
        .map_err(map_sqlite_error)?;
    if check != "ok" {
        return Err(incompatible("private catalog failed SQLite quick_check"));
    }
    let mut foreign_keys = store
        .connection
        .prepare("PRAGMA foreign_key_check")
        .map_err(map_sqlite_error)?;
    if foreign_keys
        .query([])
        .map_err(map_sqlite_error)?
        .next()
        .map_err(map_sqlite_error)?
        .is_some()
    {
        return Err(incompatible("private catalog failed foreign_key_check"));
    }
    store.connection.execute("INSERT INTO symbol_name_trigrams(symbol_name_trigrams,rank) VALUES('integrity-check',1)", []).map_err(map_sqlite_error)?;
    Ok(())
}

pub(super) fn checkpoint(
    store: &SqliteStore,
    mode: &str,
    progress: &mut CatalogBuildProgress,
) -> Result<(), StoreError> {
    let started = Instant::now();
    let (busy, wal, done): (i64, i64, i64) = store
        .connection
        .query_row(&format!("PRAGMA wal_checkpoint({mode})"), [], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?))
        })
        .map_err(map_sqlite_error)?;
    crate::catalog_trace::record(format!(
        "{{\"event\":\"index.catalog.checkpoint.complete\",\"mode\":\"{mode}\",\"walFrames\":{wal},\"checkpointedFrames\":{done},\"busy\":{busy},\"elapsedMs\":{}}}",
        started.elapsed().as_millis()
    ));
    progress.wal_frames = wal.max(0) as usize;
    progress.checkpointed_frames = done.max(0) as usize;
    if busy != 0 || wal > done {
        return Err(incompatible("private catalog checkpoint could not finish"));
    }
    Ok(())
}

pub(super) fn emit(
    observe: &mut impl FnMut(CatalogBuildProgress) -> bool,
    progress: &mut CatalogBuildProgress,
    stage: CatalogStage,
) -> Result<(), StoreError> {
    progress.stage = stage;
    if observe(*progress) {
        Ok(())
    } else {
        Err(StoreError::new(
            StoreErrorKind::Internal,
            "catalog build cancelled before publication",
        ))
    }
}

// Estimates choose batches; an oversized document uses bounded row chunks instead.
fn document_cost(document: &DocumentSymbols) -> (usize, usize) {
    let rows = 1
        + document.symbols.len()
        + document.exports.len()
        + 2 * document.occurrences.len()
        + document.aliases.len()
        + document.bindings.len()
        + document
            .class_heritage
            .as_ref()
            .map_or(0, |h| h.classes.len());
    let strings: usize = document
        .symbols
        .iter()
        .map(|s| s.name.len() * 3 + s.container.as_ref().map_or(0, String::len))
        .sum::<usize>()
        + document
            .occurrences
            .iter()
            .map(|o| 2 * (o.name.len() + o.qualifier.as_ref().map_or(0, String::len)))
            .sum::<usize>()
        + document
            .exports
            .iter()
            .map(|e| {
                e.exported_name.len() * 2
                    + e.reference_export_name.as_ref().map_or(0, String::len)
                    + e.declaration_identity.as_ref().map_or(0, String::len)
                    + e.import_specifier.as_ref().map_or(0, String::len)
                    + e.module_id.as_ref().map_or(0, String::len)
                    + e.target_scope.as_ref().map_or(0, String::len)
            })
            .sum::<usize>()
        + document
            .aliases
            .iter()
            .map(|a| a.from_name.len() + a.to_name.len())
            .sum::<usize>()
        + document
            .class_heritage
            .iter()
            .flat_map(|h| &h.classes)
            .map(|c| c.name.len() + c.base.as_ref().map_or(0, |b| b.name.len()))
            .sum::<usize>()
        + document
            .bindings
            .iter()
            .map(|b| b.imported_name.len() + b.local_name.len() + b.source_specifier.len())
            .sum::<usize>();
    (
        rows,
        rows.saturating_mul(document.uri.len() + 128)
            .saturating_add(strings),
    )
}

fn trace(generation: u64, progress: &CatalogBuildProgress, elapsed_ms: u128) {
    crate::catalog_trace::record(format!(
        "{{\"event\":\"index.catalog.batch.committed\",\"generation\":{generation},\"writtenDocuments\":{},\"writtenRows\":{},\"elapsedMs\":{elapsed_ms}}}",
        progress.written_documents, progress.written_rows
    ));
}
