use crate::{
    deduplicate_symbols, fts_phrase, is_long_query, map_sqlite_error, prefix_parameters,
    read_symbol_rows,
};
use arkts_index_core::{StoreError, SymbolQuery, SymbolSearchResult, rank_symbols};
use rusqlite::Connection;
const COLUMNS: &str = "s.name,s.kind,f.uri,s.container,s.sl,s.sc,s.el,s.ec";
pub(super) fn search(
    c: &Connection,
    query: &SymbolQuery,
) -> Result<SymbolSearchResult, StoreError> {
    let tx = super::snapshot::Snapshot::begin(c).map_err(map_sqlite_error)?;
    let head: i64 = tx
        .query_row("SELECT head FROM manifest_identity WHERE id=1", [], |r| {
            r.get(0)
        })
        .map_err(map_sqlite_error)?;
    let mut symbols = Vec::new();
    let visible_prefix = super::visibility::sql("s.version", "?3");
    if !query.folded().is_empty() {
        let mut parameters = prefix_parameters(query.folded());
        parameters.push(head.to_string());
        let sql = if is_long_query(query.folded()) {
            parameters = vec![fts_phrase(query.folded()), head.to_string()];
            let visible = super::visibility::sql("s.version", "?2");
            format!(
                "SELECT {COLUMNS} FROM v_symbol_fts JOIN v_symbols s ON s.rowid=v_symbol_fts.rowid JOIN file_versions f ON f.id=s.version WHERE v_symbol_fts MATCH ?1 AND {visible}"
            )
        } else {
            format!(
                "SELECT {COLUMNS} FROM v_symbols s JOIN file_versions f ON f.id=s.version WHERE s.name_folded>=?1 AND s.name_folded<?2 AND {visible_prefix}"
            )
        };
        symbols = read_symbol_rows(&tx, &sql, &parameters)?;
        let mut parameters = prefix_parameters(query.folded());
        parameters.push(head.to_string());
        symbols.extend(read_symbol_rows(&tx,&format!("SELECT {COLUMNS} FROM v_symbols s JOIN file_versions f ON f.id=s.version WHERE s.acronym_folded>=?1 AND s.acronym_folded<?2 AND {visible_prefix}"),&parameters)?);
    }
    deduplicate_symbols(&mut symbols);
    tx.commit().map_err(map_sqlite_error)?;
    Ok(SymbolSearchResult {
        items: rank_symbols(query, symbols),
        served_generation: crate::to_u64(head, "manifest head")?,
    })
}
