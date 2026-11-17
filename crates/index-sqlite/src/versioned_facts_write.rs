use crate::{kind_to_i64, map_sqlite_error, reference_binding_kind_to_i64};
use arkts_index_core::{DocumentSymbols, StoreError};
use rusqlite::{Connection, Params, Transaction, TransactionBehavior, params};

fn insert(tx: &Connection, sql: &str, values: impl Params) -> Result<usize, StoreError> {
    tx.prepare_cached(sql)
        .map_err(map_sqlite_error)?
        .execute(values)
        .map_err(map_sqlite_error)
}
fn chunks<T>(
    c: &Connection,
    key_bytes: usize,
    values: &[T],
    current: &mut dyn FnMut() -> bool,
    cost: impl Fn(&T) -> usize,
    mut write: impl FnMut(&Connection, &T, usize) -> Result<(), StoreError>,
) -> Result<(), StoreError> {
    if !current() {
        return Err(arkts_index_core::StoreError::new(
            arkts_index_core::StoreErrorKind::Cancelled,
            "file facts write cancelled",
        ));
    }
    if !c.is_autocommit() {
        for (index, value) in values.iter().enumerate() {
            write(c, value, index)?;
        }
        return Ok(());
    }
    let mut start = 0;
    while start < values.len() {
        let (mut end, mut bytes) = (start, 0usize);
        while end < values.len() && end - start < 4096 {
            let next = cost(&values[end])
                .saturating_add(256)
                .saturating_add(key_bytes.saturating_mul(2));
            if end > start && bytes.saturating_add(next) > 4 * 1024 * 1024 {
                break;
            }
            bytes = bytes.saturating_add(next);
            end += 1;
        }
        if !current() {
            return Err(arkts_index_core::StoreError::new(
                arkts_index_core::StoreErrorKind::Cancelled,
                "file facts write cancelled",
            ));
        }
        let tx = Transaction::new_unchecked(c, TransactionBehavior::Immediate)
            .map_err(map_sqlite_error)?;
        for (offset, value) in values[start..end].iter().enumerate() {
            write(&tx, value, start + offset)?;
        }
        if !current() {
            return Err(arkts_index_core::StoreError::new(
                arkts_index_core::StoreErrorKind::Cancelled,
                "file facts write cancelled",
            ));
        }
        tx.commit().map_err(map_sqlite_error)?;
        start = end;
    }
    Ok(())
}
pub(super) fn write(
    c: &Connection,
    id: &str,
    d: &DocumentSymbols,
    current: &mut dyn FnMut() -> bool,
) -> Result<(), StoreError> {
    chunks(
        c,
        id.len(),
        &d.symbols,
        current,
        |s| s.name.len() * 3 + s.container.as_ref().map_or(0, String::len),
        |tx, s, i| {
            insert(
                tx,
                "INSERT INTO v_symbols VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
                params![
                    id,
                    i as i64,
                    s.name,
                    arkts_index_core::fold_for_search(&s.name),
                    arkts_index_core::acronym_for_search(&s.name),
                    kind_to_i64(s.kind),
                    s.container,
                    s.range.start.line,
                    s.range.start.character,
                    s.range.end.line,
                    s.range.end.character
                ],
            )?;
            Ok(())
        },
    )?;
    chunks(
        c,
        id.len(),
        &d.exports,
        current,
        |e| {
            e.exported_name.len() * 2
                + e.reference_export_name.as_ref().map_or(0, String::len)
                + e.declaration_identity.as_ref().map_or(0, String::len)
                + e.import_specifier.as_ref().map_or(0, String::len)
                + e.module_id.as_ref().map_or(0, String::len)
                + e.target_scope.as_ref().map_or(0, String::len)
        },
        |tx, e, _| {
            insert(
                tx,
                "INSERT INTO v_exports VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
                params![
                    id,
                    e.ordinal,
                    e.exported_name,
                    arkts_index_core::fold_for_search(&e.exported_name),
                    e.reference_export_name,
                    kind_to_i64(e.kind),
                    e.declaration_identity,
                    e.import_specifier,
                    e.module_id,
                    e.target_scope,
                    e.reference_searchable,
                    e.range.start.line,
                    e.range.start.character,
                    e.range.end.line,
                    e.range.end.character
                ],
            )?;
            Ok(())
        },
    )?;
    chunks(
        c,
        id.len(),
        &d.occurrences,
        current,
        |o| o.name.len() * 2 + o.qualifier.as_ref().map_or(0, String::len) * 2,
        |tx, o, i| {
            insert(
                tx,
                "INSERT INTO v_occurrences VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![
                    id,
                    i as i64,
                    o.name,
                    o.qualified,
                    o.qualifier,
                    o.range.start.line,
                    o.range.start.character,
                    o.range.end.line,
                    o.range.end.character
                ],
            )?;
            insert(
                tx,
                "INSERT OR IGNORE INTO v_identities VALUES(?1,?2,?3,?4)",
                params![
                    id,
                    o.name,
                    o.qualified.map_or(-1, |x| if x { 1 } else { 0 }),
                    o.qualifier.as_deref().unwrap_or("")
                ],
            )?;
            Ok(())
        },
    )?;
    chunks(
        c,
        id.len(),
        &d.aliases,
        current,
        |a| a.from_name.len() + a.to_name.len(),
        |tx, a, i| {
            insert(
                tx,
                "INSERT INTO v_aliases VALUES(?1,?2,?3,?4)",
                params![id, i as i64, a.from_name, a.to_name],
            )?;
            Ok(())
        },
    )?;
    chunks(
        c,
        id.len(),
        &d.bindings,
        current,
        |b| b.imported_name.len() + b.local_name.len() + b.source_specifier.len(),
        |tx, b, i| {
            insert(
                tx,
                "INSERT INTO v_bindings VALUES(?1,?2,?3,?4,?5,?6)",
                params![
                    id,
                    i as i64,
                    b.imported_name,
                    b.local_name,
                    b.source_specifier,
                    reference_binding_kind_to_i64(b.kind)
                ],
            )?;
            Ok(())
        },
    )?;
    if let Some(h) = &d.class_heritage {
        chunks(
            c,
            id.len(),
            &h.classes,
            current,
            |h| h.name.len() + h.base.as_ref().map_or(0, |b| b.name.len()),
            |tx, h, i| {
                let b = h.base.as_ref();
                insert(
                    tx,
                    "INSERT INTO v_heritage VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)",
                    params![
                        id,
                        i as i64,
                        h.name,
                        h.name_range.start.line,
                        h.name_range.start.character,
                        h.name_range.end.line,
                        h.name_range.end.character,
                        h.declaration_range.start.line,
                        h.declaration_range.start.character,
                        h.declaration_range.end.line,
                        h.declaration_range.end.character,
                        b.map(|b| b.name.as_str()),
                        b.map(|b| b.range.start.line),
                        b.map(|b| b.range.start.character),
                        b.map(|b| b.range.end.line),
                        b.map(|b| b.range.end.character)
                    ],
                )?;
                Ok(())
            },
        )?;
    }
    if let Some(p) = &d.class_binding_provenance {
        chunks(
            c,
            id.len(),
            &p.direct_exports,
            current,
            |_| 0,
            |tx, r, i| {
                insert(
                    tx,
                    "INSERT INTO v_direct_exports VALUES(?1,?2,?3,?4,?5,?6)",
                    params![
                        id,
                        i as i64,
                        r.start.line,
                        r.start.character,
                        r.end.line,
                        r.end.character
                    ],
                )?;
                Ok(())
            },
        )?;
    }
    Ok(())
}
pub(super) const TABLES: [&str; 8] = [
    "v_symbols",
    "v_exports",
    "v_occurrences",
    "v_identities",
    "v_aliases",
    "v_bindings",
    "v_heritage",
    "v_direct_exports",
];
pub(super) fn counts(c: &Connection, id: &str) -> Result<[usize; 8], StoreError> {
    let mut result = [0; 8];
    for (i, table) in TABLES.iter().enumerate() {
        let n: i64 = c
            .query_row(
                &format!("SELECT count(*) FROM {table} WHERE version=?1"),
                [id],
                |r| r.get(0),
            )
            .map_err(map_sqlite_error)?;
        result[i] = usize::try_from(n).map_err(|_| {
            arkts_index_core::StoreError::new(
                arkts_index_core::StoreErrorKind::InvalidData,
                "invalid fact count",
            )
        })?;
    }
    Ok(result)
}
