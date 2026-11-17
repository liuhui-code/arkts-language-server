use crate::{kind_from_i64, map_sqlite_error, reference_binding_kind_from_i64};
use arkts_index_core::*;
use rusqlite::{Connection, OptionalExtension, Row, types::FromSql};
pub(super) fn get<T: FromSql>(r: &Row<'_>, i: usize) -> Result<T, StoreError> {
    r.get(i).map_err(map_sqlite_error)
}
pub(super) fn range(r: &Row<'_>, i: usize) -> Result<TextRange, StoreError> {
    Ok(TextRange {
        start: Position::new(get(r, i)?, get(r, i + 1)?),
        end: Position::new(get(r, i + 2)?, get(r, i + 3)?),
    })
}
pub(super) fn rows<T>(
    c: &Connection,
    sql: &str,
    id: &str,
    mut decode: impl FnMut(&Row<'_>) -> Result<T, StoreError>,
) -> Result<Vec<T>, StoreError> {
    let mut stmt = c.prepare_cached(sql).map_err(map_sqlite_error)?;
    let mut rows = stmt.query([id]).map_err(map_sqlite_error)?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(map_sqlite_error)? {
        out.push(decode(row)?);
    }
    Ok(out)
}
pub(super) fn read(c: &Connection, id: &str) -> Result<Option<DocumentSymbols>, StoreError> {
    let header:Option<(String,Option<bool>,Option<bool>)>=c.query_row("SELECT uri,heritage_complete,source_supported FROM file_versions WHERE id=?1 AND state='sealed'",[id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(map_sqlite_error)?;
    let Some((uri, heritage, supported)) = header else {
        return Ok(None);
    };
    let symbols = rows(
        c,
        "SELECT name,kind,container,sl,sc,el,ec FROM v_symbols WHERE version=?1 ORDER BY ordinal",
        id,
        |r| {
            Ok(WorkspaceSymbol {
                name: get(r, 0)?,
                kind: kind_from_i64(get(r, 1)?)?,
                uri: uri.clone(),
                container: get(r, 2)?,
                range: range(r, 3)?,
            })
        },
    )?;
    let exports = rows(
        c,
        "SELECT ordinal,name,reference_name,kind,identity,specifier,module_id,target_scope,searchable,sl,sc,el,ec FROM v_exports WHERE version=?1 ORDER BY ordinal",
        id,
        |r| {
            Ok(WorkspaceExport {
                ordinal: get(r, 0)?,
                exported_name: get(r, 1)?,
                reference_export_name: get(r, 2)?,
                kind: kind_from_i64(get(r, 3)?)?,
                uri: uri.clone(),
                declaration_identity: get(r, 4)?,
                import_specifier: get(r, 5)?,
                module_id: get(r, 6)?,
                target_scope: get(r, 7)?,
                reference_searchable: get(r, 8)?,
                range: range(r, 9)?,
            })
        },
    )?;
    let occurrences = rows(
        c,
        "SELECT name,qualified,qualifier,sl,sc,el,ec FROM v_occurrences WHERE version=?1 ORDER BY ordinal",
        id,
        |r| {
            Ok(ReferenceOccurrence {
                name: get(r, 0)?,
                uri: uri.clone(),
                qualified: get(r, 1)?,
                qualifier: get(r, 2)?,
                range: range(r, 3)?,
            })
        },
    )?;
    let aliases = rows(
        c,
        "SELECT from_name,to_name FROM v_aliases WHERE version=?1 ORDER BY ordinal",
        id,
        |r| {
            Ok(ReferenceAlias {
                uri: uri.clone(),
                from_name: get(r, 0)?,
                to_name: get(r, 1)?,
            })
        },
    )?;
    let bindings = rows(
        c,
        "SELECT imported,local,specifier,kind FROM v_bindings WHERE version=?1 ORDER BY ordinal",
        id,
        |r| {
            Ok(ReferenceBinding {
                uri: uri.clone(),
                imported_name: get(r, 0)?,
                local_name: get(r, 1)?,
                source_specifier: get(r, 2)?,
                kind: reference_binding_kind_from_i64(get(r, 3)?)?,
                source_resolution: ReferenceBindingResolution::Unresolved,
                resolved_source_uri: None,
                external_terminal_identity: None,
            })
        },
    )?;
    let class_heritage = super::class_query::heritage(c, id, &uri, heritage)?;
    let class_binding_provenance = supported
        .map(|source_supported| {
            let direct_exports = rows(
                c,
                "SELECT sl,sc,el,ec FROM v_direct_exports WHERE version=?1 ORDER BY ordinal",
                id,
                |r| range(r, 0),
            )?;
            Ok::<_, StoreError>(ClassBindingProvenance {
                source_supported,
                direct_exports,
            })
        })
        .transpose()?;
    let doc = DocumentSymbols {
        uri,
        symbols,
        exports,
        occurrences,
        aliases,
        bindings,
        class_heritage,
        class_binding_provenance,
    };
    crate::validate_replacement(&doc)?;
    Ok(Some(doc))
}
