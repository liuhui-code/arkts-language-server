use std::collections::{BTreeSet, HashMap};

use crate::{
    CommitReceipt, DocumentSymbols, ExportQuery, ExportSearchResult, FullCatalogBatch,
    MAX_REFERENCE_ALIAS_NAMES, ReferenceBindingKind, ReferenceBindingResolution,
    ReferenceCandidateQuery, ReferenceCandidateSearchResult, ReferenceOccurrenceIdentity,
    ReferenceSourceResolution, RefreshBatch, StoreError, StoreMetadata, SymbolQuery,
    SymbolSearchResult, SymbolStore, apply_reference_source_resolutions, ensure_newer_generation,
    ensure_symbol_uris, fold_for_search, prove_reference_binding_chain, rank_symbols,
    reference_binding_source_outside_admission, reference_uri_admitted,
    resolve_reference_binding_sources, sort_reference_bindings, unsupported_reference_candidates,
};

#[derive(Default)]
pub struct MemoryStore {
    documents: HashMap<String, DocumentSymbols>,
    rejected_documents: BTreeSet<String>,
    committed_generation: u64,
}

impl SymbolStore for MemoryStore {
    fn class_binding_snapshot(
        &self,
        document_uris: &[String],
    ) -> Result<crate::ClassBindingSnapshot, StoreError> {
        crate::validate_class_binding_snapshot_uris(document_uris)?;
        let documents = document_uris
            .iter()
            .map(|uri| {
                let document = self.documents.get(uri);
                let binding_provenance =
                    document.and_then(|item| item.class_binding_provenance.clone());
                let bindings = if binding_provenance
                    .as_ref()
                    .is_some_and(|item| item.source_supported)
                {
                    document
                        .map(|item| {
                            item.bindings
                                .iter()
                                .cloned()
                                .map(|mut binding| {
                                    // Match persisted spelling metadata, not query-time enrichment.
                                    binding.source_resolution =
                                        ReferenceBindingResolution::Unresolved;
                                    binding.resolved_source_uri = None;
                                    binding.external_terminal_identity = None;
                                    binding
                                })
                                .collect()
                        })
                        .unwrap_or_default()
                } else {
                    Vec::new()
                };
                crate::ClassBindingDocument {
                    uri: uri.clone(),
                    heritage: document.and_then(|item| item.class_heritage.clone()),
                    binding_provenance,
                    bindings,
                }
            })
            .collect();
        Ok(crate::ClassBindingSnapshot {
            documents,
            served_generation: self.committed_generation,
        })
    }

    fn class_heritage(
        &self,
        document_uri: &str,
    ) -> Result<crate::ClassHeritageSearchResult, StoreError> {
        Ok(crate::ClassHeritageSearchResult {
            facts: self
                .documents
                .get(document_uri)
                .and_then(|document| document.class_heritage.clone()),
            served_generation: self.committed_generation,
        })
    }

    fn metadata(&self) -> Result<StoreMetadata, StoreError> {
        Ok(StoreMetadata {
            committed_generation: self.committed_generation,
            rejected_documents: self.rejected_documents.iter().cloned().collect(),
        })
    }

    fn apply_batch(&mut self, batch: RefreshBatch) -> Result<CommitReceipt, StoreError> {
        ensure_newer_generation(self.committed_generation, batch.generation)?;
        let mut next_documents = self.documents.clone();
        let mut next_rejected_documents = self.rejected_documents.clone();
        for uri in batch.removed_uris {
            next_documents.remove(&uri);
            next_rejected_documents.remove(&uri);
        }
        for replacement in batch.replacements {
            ensure_symbol_uris(&replacement)?;
            next_rejected_documents.remove(&replacement.uri);
            next_documents.insert(replacement.uri.clone(), replacement);
        }
        for uri in batch.rejected_uris {
            next_documents.remove(&uri);
            next_rejected_documents.insert(uri);
        }
        self.documents = next_documents;
        self.rejected_documents = next_rejected_documents;
        self.committed_generation = batch.generation;
        Ok(CommitReceipt {
            committed_generation: batch.generation,
            rejected_documents: self.rejected_documents.iter().cloned().collect(),
        })
    }

    fn replace_all(&mut self, batch: FullCatalogBatch) -> Result<CommitReceipt, StoreError> {
        ensure_newer_generation(self.committed_generation, batch.generation)?;
        let mut documents = HashMap::new();
        for document in batch.documents {
            ensure_symbol_uris(&document)?;
            documents.insert(document.uri.clone(), document);
        }
        self.documents = documents;
        self.rejected_documents = batch.rejected_uris.into_iter().collect();
        self.committed_generation = batch.generation;
        Ok(CommitReceipt {
            committed_generation: batch.generation,
            rejected_documents: self.rejected_documents.iter().cloned().collect(),
        })
    }

    fn search(&self, query: &SymbolQuery) -> Result<SymbolSearchResult, StoreError> {
        Ok(SymbolSearchResult {
            items: rank_symbols(
                query,
                self.documents
                    .values()
                    .flat_map(|document| document.symbols.iter())
                    .cloned(),
            ),
            served_generation: self.committed_generation,
        })
    }

    fn search_exports(&self, query: &ExportQuery) -> Result<ExportSearchResult, StoreError> {
        let mut items: Vec<_> = self
            .documents
            .values()
            .flat_map(|document| document.exports.iter())
            .filter(|item| fold_for_search(&item.exported_name).starts_with(query.folded()))
            .cloned()
            .collect();
        items.sort_by(|left, right| {
            fold_for_search(&left.exported_name)
                .cmp(&fold_for_search(&right.exported_name))
                .then_with(|| left.uri.cmp(&right.uri))
                .then_with(|| left.ordinal.cmp(&right.ordinal))
        });
        items.truncate(query.limit());
        Ok(ExportSearchResult {
            items,
            served_generation: self.committed_generation,
        })
    }

    fn search_reference_candidates(
        &self,
        query: &ReferenceCandidateQuery,
        source_resolutions: &[ReferenceSourceResolution],
        admitted_uri_roots: &[String],
    ) -> Result<ReferenceCandidateSearchResult, StoreError> {
        let direct_declaration = self
            .documents
            .get(&query.declaration_uri)
            .and_then(|document| {
                document.exports.iter().find(|item| {
                    item.reference_searchable
                        && item.range.start.line == query.declaration_position.line
                        && item.range.end.line == query.declaration_position.line
                        && item.range.start.character <= query.declaration_position.character
                        && query.declaration_position.character < item.range.end.character
                })
            });
        let document_uris: BTreeSet<_> = self.documents.keys().cloned().collect();
        let imported_declaration = direct_declaration
            .is_none()
            .then(|| {
                let document = self.documents.get(&query.declaration_uri)?;
                let occurrence = document.occurrences.iter().find(|occurrence| {
                    occurrence.qualified == Some(false)
                        && occurrence.range.start.line == query.declaration_position.line
                        && occurrence.range.end.line == query.declaration_position.line
                        && occurrence.range.start.character <= query.declaration_position.character
                        && query.declaration_position.character < occurrence.range.end.character
                })?;
                let mut imports: Vec<_> = document
                    .bindings
                    .iter()
                    .filter(|binding| {
                        binding.kind == ReferenceBindingKind::Import
                            && binding.local_name == occurrence.name
                    })
                    .cloned()
                    .collect();
                resolve_reference_binding_sources(&mut imports, &document_uris);
                apply_reference_source_resolutions(
                    &mut imports,
                    source_resolutions,
                    &document_uris,
                );
                let [binding] = imports.as_slice() else {
                    return None;
                };
                if binding.source_resolution != ReferenceBindingResolution::Unique {
                    return None;
                }
                let source_uri = binding.resolved_source_uri.as_deref()?;
                if !reference_uri_admitted(source_uri, &query.declaration_uri, admitted_uri_roots) {
                    return None;
                }
                let exports: Vec<_> = self
                    .documents
                    .get(source_uri)?
                    .exports
                    .iter()
                    .filter(|item| {
                        item.reference_searchable
                            && item.reference_export_name.as_deref()
                                == Some(binding.imported_name.as_str())
                    })
                    .collect();
                let [declaration] = exports.as_slice() else {
                    return None;
                };
                Some(*declaration)
            })
            .flatten();
        let declaration = direct_declaration.or(imported_declaration);
        let Some(declaration) = declaration else {
            return Ok(unsupported_reference_candidates(self.committed_generation));
        };
        let Some(reference_export_name) = declaration.reference_export_name.as_ref() else {
            return Ok(unsupported_reference_candidates(self.committed_generation));
        };
        let mut names = BTreeSet::from([
            declaration.exported_name.clone(),
            reference_export_name.clone(),
        ]);
        loop {
            let before = names.len();
            for binding in self
                .documents
                .values()
                .filter(|document| {
                    reference_uri_admitted(&document.uri, &declaration.uri, admitted_uri_roots)
                })
                .flat_map(|document| document.bindings.iter())
            {
                if names.contains(&binding.imported_name) {
                    names.insert(binding.local_name.clone());
                }
                if names.contains(&binding.local_name) {
                    names.insert(binding.imported_name.clone());
                }
                if names.len() > MAX_REFERENCE_ALIAS_NAMES {
                    return Ok(unsupported_reference_candidates(self.committed_generation));
                }
            }
            if names.len() == before {
                break;
            }
        }
        let uris: BTreeSet<_> = self
            .documents
            .values()
            .filter(|document| {
                reference_uri_admitted(&document.uri, &declaration.uri, admitted_uri_roots)
            })
            .flat_map(|document| document.occurrences.iter())
            .filter(|occurrence| names.contains(&occurrence.name))
            .map(|occurrence| occurrence.uri.clone())
            .collect();
        let complete = uris.len() <= query.limit;
        let uris = uris.iter().take(query.limit).cloned().collect();
        let occurrences: Vec<_> = self
            .documents
            .values()
            .filter(|document| {
                reference_uri_admitted(&document.uri, &declaration.uri, admitted_uri_roots)
            })
            .flat_map(|document| document.occurrences.iter())
            .filter(|occurrence| names.contains(&occurrence.name))
            .cloned()
            .collect();
        let mut qualifier_names: BTreeSet<_> = occurrences
            .iter()
            .filter_map(|occurrence| occurrence.qualifier.as_ref())
            .cloned()
            .collect();
        if qualifier_names.len() > MAX_REFERENCE_ALIAS_NAMES {
            qualifier_names.clear();
        }
        let mut bindings: Vec<_> = self
            .documents
            .values()
            .filter(|document| {
                reference_uri_admitted(&document.uri, &declaration.uri, admitted_uri_roots)
            })
            .flat_map(|document| document.bindings.iter())
            .filter(|binding| {
                names.contains(&binding.imported_name)
                    || names.contains(&binding.local_name)
                    || qualifier_names.contains(&binding.local_name)
            })
            .cloned()
            .collect();
        resolve_reference_binding_sources(&mut bindings, &document_uris);
        apply_reference_source_resolutions(&mut bindings, source_resolutions, &document_uris);
        if reference_binding_source_outside_admission(
            &bindings,
            &document_uris,
            &declaration.uri,
            admitted_uri_roots,
        ) {
            return Ok(unsupported_reference_candidates(self.committed_generation));
        }
        let independent_declarations: BTreeSet<_> = self
            .documents
            .values()
            .filter(|document| {
                reference_uri_admitted(&document.uri, &declaration.uri, admitted_uri_roots)
            })
            .flat_map(|document| document.exports.iter())
            .filter(|item| {
                item.reference_searchable
                    && item
                        .reference_export_name
                        .as_ref()
                        .is_some_and(|name| names.contains(name))
                    && item.declaration_identity.is_some()
                    && item.declaration_identity != declaration.declaration_identity
            })
            .filter_map(|item| {
                Some((
                    item.uri.clone(),
                    item.reference_export_name.as_ref()?.clone(),
                ))
            })
            .collect();
        let occurrence_identities: BTreeSet<_> = occurrences
            .iter()
            .map(ReferenceOccurrenceIdentity::from)
            .collect();
        let occurrence_identities: Vec<_> = occurrence_identities.into_iter().collect();
        let (identity_complete, identity_uris, narrowed_uris) = prove_reference_binding_chain(
            &bindings,
            &occurrence_identities,
            &independent_declarations,
            &declaration.uri,
            &declaration.exported_name,
            reference_export_name,
            query.limit,
        );
        sort_reference_bindings(&mut bindings);
        Ok(ReferenceCandidateSearchResult {
            supported: true,
            complete,
            identity_complete,
            identity_uris,
            narrowed_uris,
            declaration_uri: Some(declaration.uri.clone()),
            declaration_identity: declaration.declaration_identity.clone(),
            names: names.into_iter().collect(),
            uris,
            bindings,
            served_generation: self.committed_generation,
        })
    }
}
