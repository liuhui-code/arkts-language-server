use crate::{CatalogBuildProgress, SqliteStore, catalog_build};
use arkts_index_core::{
    CommitReceipt, DocumentSymbols, FullCatalogBatch, StoreError, StoreErrorKind,
};
use std::path::Path;

/// Owned stream events. Complete is required; EOF alone never authorizes publication.
pub enum CatalogInput {
    Document(Box<DocumentSymbols>),
    Rejected(String),
    Complete,
}

/// Build a private catalog from strictly URI-ordered document events.
/// The producer must emit Complete only after all producers have finished successfully,
/// followed by EOF. Errors, premature EOF and trailing events discard the private build.
/// This bounds retained writer payload, not allocations inside the producer or process RSS.
pub fn build_catalog_stream(
    base: &Path,
    identity: &str,
    generation: u64,
    inputs: impl IntoIterator<Item = Result<CatalogInput, StoreError>>,
    observe: impl FnMut(CatalogBuildProgress) -> bool,
) -> Result<CommitReceipt, StoreError> {
    catalog_build::build_catalog_using(
        base,
        identity,
        FullCatalogBatch {
            generation,
            documents: Vec::new(),
            rejected_uris: Vec::new(),
        },
        None,
        observe,
        |store, batch, progress, observe| consume(store, batch, inputs, progress, observe),
    )
}

pub(super) fn consume(
    store: &mut SqliteStore,
    batch: &mut FullCatalogBatch,
    inputs: impl IntoIterator<Item = Result<CatalogInput, StoreError>>,
    progress: &mut CatalogBuildProgress,
    observe: &mut impl FnMut(CatalogBuildProgress) -> bool,
) -> Result<(), StoreError> {
    let mut inputs = inputs.into_iter();
    let (mut rows, mut bytes) = (0usize, 0usize);
    let mut previous_uri: Option<String> = None;
    loop {
        // Cancellation precedes every producer poll, including streams of only rejections.
        catalog_build::emit(observe, progress, crate::CatalogStage::Writing)?;
        match inputs
            .next()
            .ok_or_else(|| invalid("catalog stream ended without Complete"))??
        {
            CatalogInput::Document(document) => {
                if previous_uri
                    .as_ref()
                    .is_some_and(|uri| uri >= &document.uri)
                {
                    return Err(invalid(
                        "catalog stream documents are not strictly URI ordered",
                    ));
                }
                previous_uri = Some(document.uri.clone());
                let cost = catalog_build::document_cost(&document);
                if !batch.documents.is_empty()
                    && (rows.saturating_add(cost.0) > 32_768
                        || bytes.saturating_add(cost.1) > 8 * 1024 * 1024)
                {
                    flush(store, batch, progress, observe)?;
                    rows = 0;
                    bytes = 0;
                }
                rows = rows.saturating_add(cost.0);
                bytes = bytes.saturating_add(cost.1);
                batch.documents.push(*document);
                if batch.documents.len() == 64 || rows >= 32_768 || bytes >= 8 * 1024 * 1024 {
                    flush(store, batch, progress, observe)?;
                    rows = 0;
                    bytes = 0;
                }
            }
            CatalogInput::Rejected(uri) => batch.rejected_uris.push(uri),
            CatalogInput::Complete => {
                catalog_build::emit(observe, progress, crate::CatalogStage::Writing)?;
                if inputs.next().is_some() {
                    return Err(invalid("catalog stream has events after Complete"));
                }
                flush(store, batch, progress, observe)?;
                return Ok(());
            }
        }
    }
}

fn flush(
    store: &mut SqliteStore,
    batch: &mut FullCatalogBatch,
    progress: &mut CatalogBuildProgress,
    observe: &mut impl FnMut(CatalogBuildProgress) -> bool,
) -> Result<(), StoreError> {
    catalog_build::write_documents(store, batch, progress, observe)?;
    // No payload from the previous chunk remains when the producer is polled again.
    drop(std::mem::take(&mut batch.documents));
    Ok(())
}

fn invalid(message: &str) -> StoreError {
    StoreError::new(StoreErrorKind::Internal, message)
}
