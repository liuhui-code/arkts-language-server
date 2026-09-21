use std::time::Instant;

use arkts_index_core::{DocumentSymbols, StoreError, StoreErrorKind};
use rusqlite::{Transaction, params, params_from_iter, types::Value as SqlValue};

use crate::{map_sqlite_error, reference_binding_kind_to_i64};

#[derive(Default)]
pub(super) struct ReferenceInsertTimings {
    pub(super) occurrences_ms: f64,
    pub(super) occurrence_identities_ms: f64,
    pub(super) aliases_ms: f64,
    pub(super) bindings_ms: f64,
}

pub(super) fn insert_reference_documents(
    transaction: &Transaction<'_>,
    documents: &[DocumentSymbols],
    trace_enabled: bool,
) -> Result<ReferenceInsertTimings, StoreError> {
    const OCCURRENCE_IDENTITIES_PER_INSERT: usize = 256;
    const VALUES_PER_OCCURRENCE_IDENTITY: usize = 4;
    let mut timings = ReferenceInsertTimings::default();
    let mut occurrence_statement = transaction
        .prepare_cached(
            "INSERT INTO reference_occurrences(\
                document_uri, ordinal, name, start_line, start_character, end_line, end_character, qualified\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )
        .map_err(map_sqlite_error)?;
    let mut alias_statement = transaction
        .prepare_cached(
            "INSERT INTO reference_aliases(document_uri, ordinal, from_name, to_name) \
             VALUES (?1, ?2, ?3, ?4)",
        )
        .map_err(map_sqlite_error)?;
    let mut binding_statement = transaction
        .prepare_cached(
            "INSERT INTO reference_bindings(\
                document_uri, ordinal, imported_name, local_name, source_specifier, kind\
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .map_err(map_sqlite_error)?;
    let mut occurrence_identity_values =
        Vec::with_capacity(OCCURRENCE_IDENTITIES_PER_INSERT * VALUES_PER_OCCURRENCE_IDENTITY);
    let mut occurrence_identity_count = 0usize;
    for document in documents {
        let started = trace_enabled.then(Instant::now);
        let mut occurrence_identities = Vec::with_capacity(document.occurrences.len());
        for (ordinal, occurrence) in document.occurrences.iter().enumerate() {
            occurrence_statement
                .execute(params![
                    document.uri,
                    sqlite_ordinal(ordinal, "reference occurrence")?,
                    occurrence.name,
                    i64::from(occurrence.range.start.line),
                    i64::from(occurrence.range.start.character),
                    i64::from(occurrence.range.end.line),
                    i64::from(occurrence.range.end.character),
                    occurrence.qualified,
                ])
                .map_err(map_sqlite_error)?;
            occurrence_identities.push((
                occurrence.name.as_str(),
                match occurrence.qualified {
                    None => -1_i64,
                    Some(false) => 0_i64,
                    Some(true) => 1_i64,
                },
                occurrence.qualifier.as_deref().unwrap_or(""),
            ));
        }
        add_elapsed(started, &mut timings.occurrences_ms);

        let started = trace_enabled.then(Instant::now);
        occurrence_identities.sort_unstable();
        occurrence_identities.dedup();
        for (name, qualification, qualifier) in occurrence_identities {
            occurrence_identity_values.extend([
                SqlValue::Text(document.uri.clone()),
                SqlValue::Text(name.to_owned()),
                SqlValue::Integer(qualification),
                SqlValue::Text(qualifier.to_owned()),
            ]);
            occurrence_identity_count += 1;
            if occurrence_identity_count == OCCURRENCE_IDENTITIES_PER_INSERT {
                insert_occurrence_identity_values(
                    transaction,
                    occurrence_identity_count,
                    &occurrence_identity_values,
                )?;
                occurrence_identity_values.clear();
                occurrence_identity_count = 0;
            }
        }
        add_elapsed(started, &mut timings.occurrence_identities_ms);

        let started = trace_enabled.then(Instant::now);
        for (ordinal, alias) in document.aliases.iter().enumerate() {
            alias_statement
                .execute(params![
                    document.uri,
                    sqlite_ordinal(ordinal, "reference alias")?,
                    alias.from_name,
                    alias.to_name,
                ])
                .map_err(map_sqlite_error)?;
        }
        add_elapsed(started, &mut timings.aliases_ms);

        let started = trace_enabled.then(Instant::now);
        for (ordinal, binding) in document.bindings.iter().enumerate() {
            binding_statement
                .execute(params![
                    document.uri,
                    sqlite_ordinal(ordinal, "reference binding")?,
                    binding.imported_name,
                    binding.local_name,
                    binding.source_specifier,
                    reference_binding_kind_to_i64(binding.kind),
                ])
                .map_err(map_sqlite_error)?;
        }
        add_elapsed(started, &mut timings.bindings_ms);
    }
    if occurrence_identity_count > 0 {
        let started = trace_enabled.then(Instant::now);
        insert_occurrence_identity_values(
            transaction,
            occurrence_identity_count,
            &occurrence_identity_values,
        )?;
        add_elapsed(started, &mut timings.occurrence_identities_ms);
    }
    Ok(timings)
}

fn add_elapsed(started: Option<Instant>, total_ms: &mut f64) {
    if let Some(started) = started {
        *total_ms += started.elapsed().as_secs_f64() * 1_000.0;
    }
}

fn insert_occurrence_identity_values(
    transaction: &Transaction<'_>,
    row_count: usize,
    values: &[SqlValue],
) -> Result<(), StoreError> {
    const VALUES_PER_OCCURRENCE_IDENTITY: usize = 4;
    let mut sql = String::from(
        "INSERT INTO reference_occurrence_identities(\
            document_uri, name, qualification, qualifier\
         ) VALUES ",
    );
    let value_group = format!("({})", ["?"; VALUES_PER_OCCURRENCE_IDENTITY].join(","));
    sql.push_str(&vec![value_group; row_count].join(","));
    transaction
        .prepare_cached(&sql)
        .map_err(map_sqlite_error)?
        .execute(params_from_iter(values.iter()))
        .map(|_| ())
        .map_err(map_sqlite_error)
}

fn sqlite_ordinal(ordinal: usize, item: &str) -> Result<i64, StoreError> {
    i64::try_from(ordinal).map_err(|_| {
        StoreError::new(
            StoreErrorKind::InvalidData,
            format!("{item} ordinal exceeds SQLite integer range"),
        )
    })
}
