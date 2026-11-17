use super::reference_anchor::*;
use super::reference_names::*;
use super::reference_read::{ReferenceLayout, ReferenceRead};
use crate::*;
pub(super) fn search(
    connection: &Connection,
    layout: ReferenceLayout,
    query: &ReferenceCandidateQuery,
    source_resolutions: &[ReferenceSourceResolution],
    admitted_uri_roots: &[String],
) -> Result<ReferenceCandidateSearchResult, StoreError> {
    let trace = std::env::var_os("ARKTS_INDEX_REFERENCE_TRACE").is_some();
    let trace_started = Instant::now();
    let mut trace_previous = trace_started;
    let transaction = match layout {
        ReferenceLayout::Legacy => {
            catalog_api::versioned_facts::snapshot::Snapshot::own(connection)
        }
        ReferenceLayout::Versioned => {
            catalog_api::versioned_facts::snapshot::Snapshot::begin(connection)
        }
    }
    .map_err(map_sqlite_error)?;
    let input = ReferenceRead::new(&transaction, layout);
    let generation = read_committed_generation(&input)?;
    // New-format callers cannot use a missing/rejected file to prove exclusion.
    // Legacy admission retains its existing separate readiness contract.
    if matches!(layout, ReferenceLayout::Versioned) && !read_rejected_documents(&input)?.is_empty()
    {
        return Ok(unsupported_reference_candidates(generation));
    }
    let mut declaration_statement = input
        .prepare(
            "SELECT exported_name, reference_export_name, declaration_identity, \
                        reference_searchable \
                 FROM exports \
                 WHERE document_uri = ?1 AND start_line = ?2 AND end_line = ?2 \
                   AND start_character <= ?3 AND ?3 < end_character \
                 ORDER BY ordinal LIMIT 2",
        )
        .map_err(map_sqlite_error)?;
    let declaration_rows = declaration_statement
        .query_map(
            params![
                query.declaration_uri,
                i64::from(query.declaration_position.line),
                i64::from(query.declaration_position.character),
            ],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, bool>(3)?,
                ))
            },
        )
        .map_err(map_sqlite_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(map_sqlite_error)?;
    drop(declaration_statement);
    let document_uris = read_document_uris(&input)?;
    let imported_declaration = if declaration_rows.is_empty() {
        read_direct_import_declaration(
            &input,
            query,
            source_resolutions,
            admitted_uri_roots,
            &document_uris,
        )?
    } else {
        None
    };
    let (declaration_uri, exported_name, reference_export_name, declaration_identity) =
        match declaration_rows.as_slice() {
            [(exported_name, Some(reference_export_name), declaration_identity, true)] => (
                query.declaration_uri.clone(),
                exported_name.clone(),
                reference_export_name.clone(),
                declaration_identity.clone(),
            ),
            [] => {
                let Some(declaration) = imported_declaration else {
                    return Ok(unsupported_reference_candidates(generation));
                };
                declaration
            }
            _ => return Ok(unsupported_reference_candidates(generation)),
        };
    trace_reference_query_stage(
        trace,
        "declaration",
        trace_started,
        &mut trace_previous,
        declaration_rows.len(),
    );

    let names = if admitted_uri_roots.is_empty() {
        read_reference_names(&input, &reference_export_name, &exported_name)?
    } else {
        read_scoped_reference_names(
            &input,
            &[reference_export_name.clone(), exported_name.clone()],
            &declaration_uri,
            admitted_uri_roots,
        )?
    };
    if names.len() > MAX_REFERENCE_ALIAS_NAMES {
        return Ok(unsupported_reference_candidates(generation));
    }
    trace_reference_query_stage(
        trace,
        "names",
        trace_started,
        &mut trace_previous,
        names.len(),
    );
    let scoped = !admitted_uri_roots.is_empty();
    let occurrences: Vec<_> = if scoped {
        read_scoped_reference_occurrences(&input, &names)?
    } else {
        read_reference_occurrences(&input, &reference_export_name, &exported_name)?
    }
    .into_iter()
    .filter(|occurrence| {
        reference_uri_admitted(&occurrence.uri, &declaration_uri, admitted_uri_roots)
            && names.binary_search(&occurrence.name).is_ok()
    })
    .collect();
    trace_reference_query_stage(
        trace,
        "occurrences",
        trace_started,
        &mut trace_previous,
        occurrences.len(),
    );
    let mut qualifier_names: Vec<_> = occurrences
        .iter()
        .filter_map(|occurrence| occurrence.qualifier.clone())
        .collect();
    qualifier_names.sort();
    qualifier_names.dedup();
    if qualifier_names.len() > MAX_REFERENCE_ALIAS_NAMES {
        qualifier_names.clear();
    }
    let mut binding_names = names.clone();
    binding_names.extend(qualifier_names.iter().cloned());
    binding_names.sort();
    binding_names.dedup();
    let mut bindings = if scoped || !qualifier_names.is_empty() {
        read_scoped_reference_bindings(&input, &binding_names)?
    } else {
        read_reference_bindings(&input, &reference_export_name, &exported_name)?
    };
    bindings.retain(|binding| {
        reference_uri_admitted(&binding.uri, &declaration_uri, admitted_uri_roots)
            && (names.binary_search(&binding.imported_name).is_ok()
                || names.binary_search(&binding.local_name).is_ok()
                || qualifier_names.binary_search(&binding.local_name).is_ok())
    });
    trace_reference_query_stage(
        trace,
        "bindings",
        trace_started,
        &mut trace_previous,
        bindings.len(),
    );
    resolve_reference_binding_sources(&mut bindings, &document_uris);
    apply_reference_source_resolutions(&mut bindings, source_resolutions, &document_uris);
    if reference_binding_source_outside_admission(
        &bindings,
        &document_uris,
        &declaration_uri,
        admitted_uri_roots,
    ) {
        return Ok(unsupported_reference_candidates(generation));
    }
    trace_reference_query_stage(
        trace,
        "binding-resolution",
        trace_started,
        &mut trace_previous,
        bindings.len(),
    );
    let independent_declarations: BTreeSet<_> = if scoped {
        read_scoped_independent_reference_declarations(
            &input,
            &names,
            declaration_identity.as_deref(),
        )?
    } else {
        read_independent_reference_declarations(
            &input,
            &reference_export_name,
            &exported_name,
            declaration_identity.as_deref(),
        )?
    }
    .into_iter()
    .filter(|(uri, name)| {
        reference_uri_admitted(uri, &declaration_uri, admitted_uri_roots)
            && names.binary_search(name).is_ok()
    })
    .collect();
    trace_reference_query_stage(
        trace,
        "independent-declarations",
        trace_started,
        &mut trace_previous,
        independent_declarations.len(),
    );
    let mut uris = if admitted_uri_roots.is_empty() {
        read_reference_uris(
            &input,
            &reference_export_name,
            &exported_name,
            query.limit.saturating_add(1),
        )?
    } else {
        occurrences
            .iter()
            .map(|occurrence| occurrence.uri.clone())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .take(query.limit.saturating_add(1))
            .collect()
    };
    let (identity_complete, identity_uris, narrowed_uris) = prove_reference_binding_chain(
        &bindings,
        &occurrences,
        &independent_declarations,
        &declaration_uri,
        &exported_name,
        &reference_export_name,
        query.limit,
    );
    trace_reference_query_stage(
        trace,
        "identity-proof",
        trace_started,
        &mut trace_previous,
        identity_uris.len(),
    );
    let complete = uris.len() <= query.limit;
    uris.truncate(query.limit);
    transaction.commit().map_err(map_sqlite_error)?;
    Ok(ReferenceCandidateSearchResult {
        supported: true,
        complete,
        identity_complete,
        identity_uris,
        narrowed_uris,
        declaration_uri: Some(declaration_uri),
        declaration_identity: declaration_identity.clone(),
        names,
        uris,
        bindings,
        served_generation: generation,
    })
}
fn trace_reference_query_stage(
    enabled: bool,
    stage: &str,
    started: Instant,
    previous: &mut Instant,
    count: usize,
) {
    let now = Instant::now();
    if enabled {
        eprintln!(
            "arkts-index reference-query stage={stage} stage_ms={:.3} total_ms={:.3} count={count}",
            now.duration_since(*previous).as_secs_f64() * 1_000.0,
            now.duration_since(started).as_secs_f64() * 1_000.0,
        );
    }
    *previous = now;
}

fn unsupported_reference_candidates(generation: u64) -> ReferenceCandidateSearchResult {
    ReferenceCandidateSearchResult {
        supported: false,
        complete: false,
        identity_complete: false,
        identity_uris: Vec::new(),
        narrowed_uris: Vec::new(),
        declaration_uri: None,
        declaration_identity: None,
        names: Vec::new(),
        uris: Vec::new(),
        bindings: Vec::new(),
        served_generation: generation,
    }
}
