//! Captured lexical discovery only; never constructor or reference-scope proof.

use std::collections::{BTreeMap, BTreeSet};

use crate::{
    ClassBaseBinding, ClassBindingDocument, ClassBindingSnapshot, ClassHeritageDeclaration,
    Document, Position, ReferenceBindingKind, ReferenceBindingResolution, parse_document_symbols,
    resolve_reference_binding_sources, validate_class_binding_snapshot_uris,
};

/// Overlays must come from one caller-fenced workspace/document revision.
/// Matching generation alone does not prove that the caller's snapshot is current.
/// The caller must supply every relevant active overlay from that revision;
/// omitted current buffers cannot be detected by this lexical adapter.
pub fn resolve_class_base_binding_snapshot(
    snapshot: &ClassBindingSnapshot,
    expected_generation: u64,
    overlays: &[Document],
    document_uri: &str,
    class_name_position: Position,
) -> ClassBaseBinding {
    let uris = snapshot
        .documents
        .iter()
        .map(|item| item.uri.clone())
        .collect::<Vec<_>>();
    if snapshot.served_generation != expected_generation
        || validate_class_binding_snapshot_uris(&uris).is_err()
        || !snapshot.documents.iter().all(valid_document)
    {
        return ClassBaseBinding::Unknown;
    }
    let mut seen_overlays = BTreeSet::new();
    if overlays.iter().any(|overlay| {
        !seen_overlays.insert(&overlay.uri)
            || !snapshot
                .documents
                .iter()
                .any(|item| item.uri == overlay.uri)
    }) {
        return ClassBaseBinding::Unknown;
    }
    let mut documents = snapshot.documents.clone();
    for overlay in overlays {
        if let Some(target) = documents.iter_mut().find(|item| item.uri == overlay.uri) {
            *target = source_document(overlay);
        }
    }
    resolve_metadata(&documents, document_uri, class_name_position, true)
}

impl ClassBindingSnapshot {
    /// Current texts replace persisted facts, even at the same generation.
    /// Absent URIs are caller-owned evidence, never inferred from missing rows.
    /// Omitted/unknown alternatives cannot establish extensionless uniqueness.
    /// This is lexical discovery only, not constructor/reference completeness.
    pub fn resolve_current_sources(
        &self,
        expected_generation: u64,
        current_sources: &[Document],
        absent_uris: &[String],
        document_uri: &str,
        class_name_position: Position,
    ) -> ClassBaseBinding {
        let requested = self
            .documents
            .iter()
            .map(|item| item.uri.clone())
            .collect::<Vec<_>>();
        if self.served_generation != expected_generation
            || validate_class_binding_snapshot_uris(&requested).is_err()
        {
            return ClassBaseBinding::Unknown;
        }
        let mut availability = BTreeMap::new();
        for uri in absent_uris {
            if !requested.contains(uri) || availability.insert(uri.clone(), false).is_some() {
                return ClassBaseBinding::Unknown;
            }
        }
        for source in current_sources {
            if !requested.contains(&source.uri)
                || availability.insert(source.uri.clone(), true).is_some()
            {
                return ClassBaseBinding::Unknown;
            }
        }
        let documents = current_sources
            .iter()
            .map(source_document)
            .collect::<Vec<_>>();
        resolve_documents(
            documents.iter().map(|item| item.uri.clone()).collect(),
            |uri| unique_document(&documents, uri).cloned(),
            document_uri,
            class_name_position,
            false,
            Some(&availability),
        )
    }
}

fn valid_document(document: &ClassBindingDocument) -> bool {
    document
        .heritage
        .as_ref()
        .is_none_or(|facts| facts.validate_document(&document.uri).is_ok())
        && document
            .binding_provenance
            .as_ref()
            .is_none_or(|facts| facts.validate_document(document.heritage.as_ref()).is_ok())
        && document.bindings.iter().all(|binding| {
            binding.uri == document.uri
                && !binding.imported_name.is_empty()
                && !binding.local_name.is_empty()
                && !binding.source_specifier.is_empty()
        })
        && (document.bindings.is_empty()
            || document
                .binding_provenance
                .as_ref()
                .is_some_and(|facts| facts.source_supported))
}

pub(super) fn resolve_metadata(
    documents: &[ClassBindingDocument],
    document_uri: &str,
    class_name_position: Position,
    explicit_sources_only: bool,
) -> ClassBaseBinding {
    resolve_documents(
        documents.iter().map(|item| item.uri.clone()).collect(),
        |uri| unique_document(documents, uri).cloned(),
        document_uri,
        class_name_position,
        explicit_sources_only,
        None,
    )
}

pub(super) fn resolve_documents(
    uris: BTreeSet<String>,
    lookup: impl Fn(&str) -> Option<ClassBindingDocument>,
    document_uri: &str,
    class_name_position: Position,
    explicit_sources_only: bool,
    availability: Option<&BTreeMap<String, bool>>,
) -> ClassBaseBinding {
    let Some(document) = lookup(document_uri) else {
        return ClassBaseBinding::Unknown;
    };
    let Some(facts) = document
        .heritage
        .as_ref()
        .filter(|facts| facts.lexically_complete)
    else {
        return ClassBaseBinding::Unknown;
    };
    if !document
        .binding_provenance
        .as_ref()
        .is_some_and(|facts| facts.source_supported)
    {
        return ClassBaseBinding::Unknown;
    }
    let classes: Vec<_> = facts
        .classes
        .iter()
        .filter(|class| {
            class.name_range.start <= class_name_position
                && class_name_position < class.name_range.end
        })
        .collect();
    let [class] = classes.as_slice() else {
        return ClassBaseBinding::Unknown;
    };
    let Some(base) = &class.base else {
        return ClassBaseBinding::NoBase;
    };
    Resolver {
        lookup,
        uris,
        visited: BTreeSet::new(),
        support: BTreeSet::new(),
        explicit_sources_only,
        availability,
    }
    .resolve(document_uri, &base.name, false)
    .unwrap_or(ClassBaseBinding::Unknown)
}

struct Resolver<'a, F> {
    lookup: F,
    uris: BTreeSet<String>,
    visited: BTreeSet<(String, String, bool)>,
    support: BTreeSet<String>,
    explicit_sources_only: bool,
    availability: Option<&'a BTreeMap<String, bool>>,
}

impl<F: Fn(&str) -> Option<ClassBindingDocument>> Resolver<'_, F> {
    fn resolve(&mut self, uri: &str, name: &str, exported: bool) -> Option<ClassBaseBinding> {
        if self.visited.len() >= 32 || !self.visited.insert((uri.into(), name.into(), exported)) {
            return None;
        }
        let document = (self.lookup)(uri)?;
        let facts = document
            .heritage
            .as_ref()
            .filter(|facts| facts.lexically_complete)?;
        let provenance = document
            .binding_provenance
            .as_ref()
            .filter(|facts| facts.source_supported)?;
        let local_count = facts
            .classes
            .iter()
            .filter(|class| class.name == name)
            .count()
            + document
                .bindings
                .iter()
                .filter(|binding| {
                    binding.kind == ReferenceBindingKind::Import && binding.local_name == name
                })
                .count();
        if local_count > 1 {
            return None;
        }
        self.support.insert(uri.into());
        let classes: Vec<_> = facts
            .classes
            .iter()
            .filter(|class| {
                class.name == name
                    && (!exported || provenance.direct_exports.contains(&class.name_range))
            })
            .collect();
        let kind = if exported {
            ReferenceBindingKind::ReExport
        } else {
            ReferenceBindingKind::Import
        };
        let bindings: Vec<_> = document
            .bindings
            .iter()
            .filter(|binding| binding.kind == kind && binding.local_name == name)
            .collect();
        if classes.len() + bindings.len() != 1 {
            return None;
        }
        if let [class] = classes.as_slice() {
            return Some(self.target(uri, class));
        }
        let mut binding = bindings[0].clone();
        // A bounded snapshot has no absence proof for competing extensionless
        // candidates. Missing rows can also mean old/rejected/unknown metadata.
        let candidates = crate::relative_binding_sources::relative_source_uri_candidates(
            &binding.uri,
            &binding.source_specifier,
        )?;
        if let Some(availability) = self.availability {
            let mut present = Vec::new();
            for candidate in &candidates {
                if *availability.get(candidate)? {
                    present.push(candidate);
                }
            }
            let [target] = present.as_slice() else {
                return None;
            };
            binding.resolved_source_uri = Some((*target).clone());
        } else {
            if self.explicit_sources_only && candidates.len() != 1 {
                return None;
            }
            resolve_reference_binding_sources(std::slice::from_mut(&mut binding), &self.uris);
            if binding.source_resolution != ReferenceBindingResolution::Unique {
                return None;
            }
        }
        self.resolve(
            binding.resolved_source_uri.as_deref()?,
            &binding.imported_name,
            true,
        )
    }

    fn target(&self, uri: &str, class: &ClassHeritageDeclaration) -> ClassBaseBinding {
        ClassBaseBinding::Resolved {
            declaration_uri: uri.into(),
            name: class.name.clone(),
            name_range: class.name_range,
            support_uris: self.support.iter().cloned().collect(),
        }
    }
}

fn unique_document<'a>(
    documents: &'a [ClassBindingDocument],
    uri: &str,
) -> Option<&'a ClassBindingDocument> {
    let mut matches = documents.iter().filter(|document| document.uri == uri);
    let document = matches.next()?;
    matches.next().is_none().then_some(document)
}

pub(super) fn source_document(document: &Document) -> ClassBindingDocument {
    match parse_document_symbols(document) {
        Ok(parsed) => ClassBindingDocument {
            uri: parsed.uri,
            heritage: parsed.class_heritage,
            binding_provenance: parsed.class_binding_provenance,
            bindings: parsed.bindings,
        },
        Err(_) => ClassBindingDocument {
            uri: document.uri.clone(),
            heritage: None,
            binding_provenance: None,
            bindings: Vec::new(),
        },
    }
}
