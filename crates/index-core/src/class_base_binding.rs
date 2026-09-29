//! Fresh-source discovery provenance only; never compiler or reference-scope proof.

use crate::class_binding_snapshot_resolution::{resolve_documents, source_document};
use crate::{Document, Position, TextRange};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ClassBaseBinding {
    /// A supported named class has no explicit base. Not constructor completeness.
    NoBase,
    /// Supported spelling provenance only; compiler confirmation is still required.
    Resolved {
        declaration_uri: String,
        name: String,
        name_range: TextRange,
        support_uris: Vec<String>,
    },
    /// No safe discovery conclusion. Never interpret as an absent base/reference.
    Unknown,
}

/// Resolves supported class-base spelling within an immutable source input set.
/// Callers still need generation/overlay admission and compiler confirmation.
pub fn resolve_class_base_binding(
    documents: &[Document],
    document_uri: &str,
    class_name_position: Position,
) -> ClassBaseBinding {
    // Preserve the fresh-source contract: the caller supplies its source universe.
    // A bounded storage snapshot cannot make this completeness claim.
    resolve_documents(
        documents
            .iter()
            .map(|document| document.uri.clone())
            .collect(),
        |uri| {
            let mut matches = documents.iter().filter(|document| document.uri == uri);
            let document = matches.next()?;
            matches.next().is_none().then(|| source_document(document))
        },
        document_uri,
        class_name_position,
        false,
        None,
    )
}
