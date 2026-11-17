use super::reference_read::ReferenceRead;
use crate::*;
pub(super) fn read_document_uris(
    connection: &ReferenceRead<'_>,
) -> Result<BTreeSet<String>, StoreError> {
    let mut statement = connection
        .prepare("SELECT uri FROM documents ORDER BY uri")
        .map_err(map_sqlite_error)?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(map_sqlite_error)?;
    rows.collect::<Result<BTreeSet<_>, _>>()
        .map_err(map_sqlite_error)
}

pub(super) fn read_direct_import_declaration(
    connection: &ReferenceRead<'_>,
    query: &ReferenceCandidateQuery,
    source_resolutions: &[ReferenceSourceResolution],
    admitted_uri_roots: &[String],
    document_uris: &BTreeSet<String>,
) -> Result<Option<DirectImportDeclaration>, StoreError> {
    let mut occurrence_statement = connection
        .prepare(
            "SELECT name FROM reference_occurrences \
             WHERE document_uri = ?1 AND start_line = ?2 AND end_line = ?2 \
               AND start_character <= ?3 AND ?3 < end_character AND qualified = 0 \
             ORDER BY ordinal LIMIT 2",
        )
        .map_err(map_sqlite_error)?;
    let occurrence_rows = occurrence_statement
        .query_map(
            params![
                query.declaration_uri,
                i64::from(query.declaration_position.line),
                i64::from(query.declaration_position.character),
            ],
            |row| row.get::<_, String>(0),
        )
        .map_err(map_sqlite_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(map_sqlite_error)?;
    let [local_name] = occurrence_rows.as_slice() else {
        return Ok(None);
    };

    let mut binding_statement = connection
        .prepare(
            "SELECT imported_name, source_specifier FROM reference_bindings \
             WHERE document_uri = ?1 AND local_name = ?2 AND kind = 1 \
             ORDER BY ordinal LIMIT 2",
        )
        .map_err(map_sqlite_error)?;
    let mut bindings = binding_statement
        .query_map(params![query.declaration_uri, local_name], |row| {
            Ok(ReferenceBinding {
                uri: query.declaration_uri.clone(),
                imported_name: row.get(0)?,
                local_name: local_name.clone(),
                source_specifier: row.get(1)?,
                kind: ReferenceBindingKind::Import,
                source_resolution: ReferenceBindingResolution::Unresolved,
                resolved_source_uri: None,
                external_terminal_identity: None,
            })
        })
        .map_err(map_sqlite_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(map_sqlite_error)?;
    resolve_reference_binding_sources(&mut bindings, document_uris);
    apply_reference_source_resolutions(&mut bindings, source_resolutions, document_uris);
    let [binding] = bindings.as_slice() else {
        return Ok(None);
    };
    if binding.source_resolution != ReferenceBindingResolution::Unique {
        return Ok(None);
    }
    let Some(source_uri) = binding.resolved_source_uri.as_deref() else {
        return Ok(None);
    };
    if !reference_uri_admitted(source_uri, &query.declaration_uri, admitted_uri_roots) {
        return Ok(None);
    }

    let mut export_statement = connection
        .prepare(
            "SELECT exported_name, reference_export_name, declaration_identity FROM exports \
             WHERE document_uri = ?1 AND reference_export_name = ?2 \
               AND reference_searchable = 1 \
             ORDER BY ordinal LIMIT 2",
        )
        .map_err(map_sqlite_error)?;
    let export_rows = export_statement
        .query_map(params![source_uri, binding.imported_name], |row| {
            Ok((
                source_uri.to_owned(),
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(map_sqlite_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(map_sqlite_error)?;
    let [declaration] = export_rows.as_slice() else {
        return Ok(None);
    };
    Ok(Some(declaration.clone()))
}
