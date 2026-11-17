use super::read::{get, range};
use crate::{kind_from_i64, map_sqlite_error};
use arkts_index_core::{
    ExportQuery, ExportSearchResult, StoreError, WorkspaceExport, fold_for_search,
};
use rusqlite::{Connection, params};
pub(super) fn search(
    c: &Connection,
    query: &ExportQuery,
) -> Result<ExportSearchResult, StoreError> {
    let tx = super::snapshot::Snapshot::begin(c).map_err(map_sqlite_error)?;
    let head: i64 = tx
        .query_row("SELECT head FROM manifest_identity WHERE id=1", [], |r| {
            r.get(0)
        })
        .map_err(map_sqlite_error)?;
    let mut items = Vec::new();
    if !query.folded().is_empty() {
        let visible = super::visibility::sql("e.version", "?3");
        let sql = format!(
            "SELECT e.ordinal,e.name,e.reference_name,e.kind,e.identity,e.specifier,e.module_id,e.target_scope,e.searchable,e.sl,e.sc,e.el,e.ec,f.uri FROM v_exports e JOIN file_versions f ON f.id=e.version WHERE e.name_folded>=?1 AND e.name_folded<?2 AND {visible}"
        );
        let upper = format!("{}{}", query.folded(), char::MAX);
        let mut stmt = tx.prepare(&sql).map_err(map_sqlite_error)?;
        let mut rows = stmt
            .query(params![query.folded(), upper, head])
            .map_err(map_sqlite_error)?;
        while let Some(r) = rows.next().map_err(map_sqlite_error)? {
            items.push(WorkspaceExport {
                ordinal: get(r, 0)?,
                exported_name: get(r, 1)?,
                reference_export_name: get(r, 2)?,
                kind: kind_from_i64(get(r, 3)?)?,
                uri: get(r, 13)?,
                declaration_identity: get(r, 4)?,
                import_specifier: get(r, 5)?,
                module_id: get(r, 6)?,
                target_scope: get(r, 7)?,
                reference_searchable: get(r, 8)?,
                range: range(r, 9)?,
            });
        }
    }
    items.sort_by(|a, b| {
        fold_for_search(&a.exported_name)
            .cmp(&fold_for_search(&b.exported_name))
            .then_with(|| a.uri.cmp(&b.uri))
            .then_with(|| a.ordinal.cmp(&b.ordinal))
    });
    items.truncate(query.limit());
    tx.commit().map_err(map_sqlite_error)?;
    Ok(ExportSearchResult {
        items,
        served_generation: crate::to_u64(head, "manifest head")?,
    })
}
