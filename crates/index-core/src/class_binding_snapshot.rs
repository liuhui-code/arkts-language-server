//! Generation-bound lexical provenance, never compiler identity/completeness proof.

use std::collections::BTreeSet;

use crate::class_binding_syntax::{direct_named_export_positions, module_bindings_supported};
use crate::{
    Document, DocumentClassHeritage, ReferenceBinding, StoreError, StoreErrorKind, TextRange,
};

pub const MAX_CLASS_BINDING_SNAPSHOT_DOCUMENTS: usize = 128;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClassBindingProvenance {
    /// Fresh source belongs to the intentionally narrow named-binding subset.
    /// False (or absent provenance) is unknown, not evidence of absent bindings.
    pub source_supported: bool,
    /// Class name ranges validated against actual direct-export source tokens.
    pub direct_exports: Vec<TextRange>,
}

impl ClassBindingProvenance {
    /// Storage consistency only; this cannot validate ArkTS semantic identity.
    pub fn validate_document(
        &self,
        heritage: Option<&DocumentClassHeritage>,
    ) -> Result<(), StoreError> {
        let unique: BTreeSet<_> = self
            .direct_exports
            .iter()
            .map(|range| (range.start, range.end))
            .collect();
        let valid = if self.source_supported {
            heritage.is_some_and(|facts| {
                let canonical: Vec<_> = facts
                    .classes
                    .iter()
                    .filter(|class| {
                        unique.contains(&(class.name_range.start, class.name_range.end))
                    })
                    .map(|class| class.name_range)
                    .collect();
                facts.lexically_complete
                    && unique.len() == self.direct_exports.len()
                    && canonical == self.direct_exports
            })
        } else {
            self.direct_exports.is_empty()
        };
        if valid {
            Ok(())
        } else {
            Err(StoreError::new(
                StoreErrorKind::InvalidData,
                "invalid class binding provenance",
            ))
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClassBindingDocument {
    pub uri: String,
    pub heritage: Option<DocumentClassHeritage>,
    pub binding_provenance: Option<ClassBindingProvenance>,
    /// Lexical spelling only; transient resolution fields are cleared.
    /// Empty when source validation is unavailable. Never an exclusion proof.
    pub bindings: Vec<ReferenceBinding>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClassBindingSnapshot {
    /// One row per requested URI, in input order, including unknown documents.
    pub documents: Vec<ClassBindingDocument>,
    pub served_generation: u64,
}

pub fn validate_class_binding_snapshot_uris(uris: &[String]) -> Result<(), StoreError> {
    if uris.len() <= MAX_CLASS_BINDING_SNAPSHOT_DOCUMENTS
        && uris.iter().all(|uri| !uri.is_empty())
        && uris.iter().collect::<BTreeSet<_>>().len() == uris.len()
    {
        Ok(())
    } else {
        Err(StoreError::new(
            StoreErrorKind::InvalidData,
            "class binding snapshot requires at most 128 unique nonempty URIs",
        ))
    }
}

pub(super) fn source_provenance(
    document: &Document,
    heritage: Option<&DocumentClassHeritage>,
) -> ClassBindingProvenance {
    let source_supported = heritage.is_some_and(|facts| facts.lexically_complete)
        && module_bindings_supported(document);
    let direct_exports = heritage
        .filter(|_| source_supported)
        .map(|facts| {
            let export_positions = direct_named_export_positions(document);
            facts
                .classes
                .iter()
                .filter(|class| export_positions.contains(&class.declaration_range.start))
                .map(|class| class.name_range)
                .collect()
        })
        .unwrap_or_default();
    ClassBindingProvenance {
        source_supported,
        direct_exports,
    }
}
