use crate::{
    Document, DocumentParseError, DocumentSymbols, StoreError, StoreErrorKind,
    class_binding_snapshot, parse_document_class_heritage, parse_symbols,
};

pub fn parse_document_symbols(document: &Document) -> Result<DocumentSymbols, DocumentParseError> {
    parse_symbols(document).map(|(symbols, exports, occurrences, aliases, bindings)| {
        let class_heritage = parse_document_class_heritage(document).ok();
        let class_binding_provenance = Some(class_binding_snapshot::source_provenance(
            document,
            class_heritage.as_ref(),
        ));
        DocumentSymbols {
            uri: document.uri.clone(),
            symbols,
            exports,
            occurrences,
            aliases,
            bindings,
            class_heritage,
            class_binding_provenance,
        }
    })
}

pub(super) fn ensure_symbol_uris(document: &DocumentSymbols) -> Result<(), StoreError> {
    if let Some(facts) = &document.class_heritage {
        facts.validate_document(&document.uri)?;
    }
    if let Some(provenance) = &document.class_binding_provenance {
        provenance.validate_document(document.class_heritage.as_ref())?;
    }
    if document
        .symbols
        .iter()
        .all(|symbol| symbol.uri == document.uri)
        && document.exports.iter().all(|item| item.uri == document.uri)
        && document
            .occurrences
            .iter()
            .all(|item| item.uri == document.uri)
        && document.aliases.iter().all(|item| item.uri == document.uri)
        && document
            .bindings
            .iter()
            .all(|item| item.uri == document.uri)
    {
        Ok(())
    } else {
        Err(StoreError::new(
            StoreErrorKind::InvalidData,
            format!("symbol URI does not match document {}", document.uri),
        ))
    }
}
