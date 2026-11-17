use super::reference_read::ReferenceRead;
use crate::*;
const REFERENCE_NAMES_SQL: &str = "WITH RECURSIVE \
    edges(source, target) AS (\
        SELECT imported_name, local_name FROM reference_bindings \
        UNION SELECT local_name, imported_name FROM reference_bindings\
    ), \
    names(name) AS (\
        VALUES (?1), (?2) \
        UNION SELECT edges.target FROM edges JOIN names ON edges.source = names.name\
    ) \
    SELECT name FROM names ORDER BY name LIMIT ?3";

const REFERENCE_URIS_SQL: &str = "WITH RECURSIVE \
    edges(source, target) AS (\
        SELECT imported_name, local_name FROM reference_bindings \
        UNION SELECT local_name, imported_name FROM reference_bindings\
    ), \
    names(name) AS (\
        VALUES (?1), (?2) \
        UNION SELECT edges.target FROM edges JOIN names ON edges.source = names.name\
    ) \
    SELECT DISTINCT reference_occurrence_identities.document_uri \
    FROM reference_occurrence_identities \
         INDEXED BY reference_occurrence_identities_name JOIN names USING(name) \
    ORDER BY reference_occurrence_identities.document_uri LIMIT ?3";

const REFERENCE_BINDINGS_SQL: &str = "WITH RECURSIVE \
    edges(source, target) AS (\
        SELECT imported_name, local_name FROM reference_bindings \
        UNION SELECT local_name, imported_name FROM reference_bindings\
    ), \
    names(name) AS (\
        VALUES (?1), (?2) \
        UNION SELECT edges.target FROM edges JOIN names ON edges.source = names.name\
    ) \
    SELECT document_uri, imported_name, local_name, source_specifier, kind \
    FROM reference_bindings \
    WHERE imported_name IN (SELECT name FROM names) \
       OR local_name IN (SELECT name FROM names) \
    ORDER BY document_uri, source_specifier, imported_name, local_name, kind";

const REFERENCE_OCCURRENCES_SQL: &str = "WITH RECURSIVE \
    edges(source, target) AS (\
        SELECT imported_name, local_name FROM reference_bindings \
        UNION SELECT local_name, imported_name FROM reference_bindings\
    ), \
    names(name) AS (\
        VALUES (?1), (?2) \
        UNION SELECT edges.target FROM edges JOIN names ON edges.source = names.name\
    ) \
    SELECT reference_occurrence_identities.name, \
           reference_occurrence_identities.document_uri, \
           qualification, qualifier \
    FROM reference_occurrence_identities \
         INDEXED BY reference_occurrence_identities_name JOIN names USING(name)";

const INDEPENDENT_REFERENCE_DECLARATIONS_SQL: &str = "WITH RECURSIVE \
    edges(source, target) AS (\
        SELECT imported_name, local_name FROM reference_bindings \
        UNION SELECT local_name, imported_name FROM reference_bindings\
    ), \
    names(name) AS (\
        VALUES (?1), (?2) \
        UNION SELECT edges.target FROM edges JOIN names ON edges.source = names.name\
    ) \
    SELECT exports.document_uri, exports.reference_export_name \
    FROM exports JOIN names ON exports.reference_export_name = names.name \
    WHERE exports.reference_searchable = 1 \
      AND exports.declaration_identity IS NOT NULL \
      AND exports.declaration_identity <> ?3";

pub(super) fn scoped_reference_sql(name_count: usize, query: &str) -> Result<String, StoreError> {
    if name_count == 0 {
        return Err(StoreError::new(
            StoreErrorKind::InvalidData,
            "scoped reference query requires at least one proven name",
        ));
    }
    Ok(format!(
        "WITH names(name) AS (VALUES {}) {query}",
        vec!["(?)"; name_count].join(",")
    ))
}

pub(super) fn scoped_reference_bindings_sql(name_count: usize) -> Result<String, StoreError> {
    scoped_reference_sql(
        name_count,
        "SELECT document_uri, imported_name, local_name, source_specifier, kind \
         FROM reference_bindings \
         WHERE imported_name IN (SELECT name FROM names) \
            OR local_name IN (SELECT name FROM names) \
         ORDER BY document_uri, source_specifier, imported_name, local_name, kind",
    )
}

pub(super) fn scoped_reference_occurrences_sql(name_count: usize) -> Result<String, StoreError> {
    scoped_reference_sql(
        name_count,
        "SELECT reference_occurrence_identities.name, \
                reference_occurrence_identities.document_uri, qualification, qualifier \
         FROM reference_occurrence_identities \
              INDEXED BY reference_occurrence_identities_name \
         JOIN names USING(name)",
    )
}

pub(super) fn scoped_independent_reference_declarations_sql(
    name_count: usize,
) -> Result<String, StoreError> {
    scoped_reference_sql(
        name_count,
        "SELECT exports.document_uri, exports.reference_export_name \
         FROM exports JOIN names ON exports.reference_export_name = names.name \
         WHERE exports.reference_searchable = 1 \
           AND exports.declaration_identity IS NOT NULL \
           AND exports.declaration_identity <> ?",
    )
}

pub(super) fn read_reference_names(
    connection: &ReferenceRead<'_>,
    reference_export_name: &str,
    declaration_name: &str,
) -> Result<Vec<String>, StoreError> {
    let mut statement = connection
        .prepare(REFERENCE_NAMES_SQL)
        .map_err(map_sqlite_error)?;
    let rows = statement
        .query_map(
            params![
                reference_export_name,
                declaration_name,
                (MAX_REFERENCE_ALIAS_NAMES + 1) as i64
            ],
            |row| row.get::<_, String>(0),
        )
        .map_err(map_sqlite_error)?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(map_sqlite_error)
}

pub(super) fn read_scoped_reference_names(
    connection: &ReferenceRead<'_>,
    seed_names: &[String],
    declaration_uri: &str,
    admitted_uri_roots: &[String],
) -> Result<Vec<String>, StoreError> {
    let mut from_statement = connection
        .prepare(
            "SELECT document_uri, local_name FROM reference_bindings \
             INDEXED BY reference_bindings_imported_name WHERE imported_name = ?1 \
             ORDER BY document_uri, local_name",
        )
        .map_err(map_sqlite_error)?;
    let mut to_statement = connection
        .prepare(
            "SELECT document_uri, imported_name FROM reference_bindings \
             INDEXED BY reference_bindings_local_name WHERE local_name = ?1 \
             ORDER BY document_uri, imported_name",
        )
        .map_err(map_sqlite_error)?;
    let mut names: BTreeSet<_> = seed_names.iter().cloned().collect();
    let mut pending = seed_names.to_vec();
    while let Some(name) = pending.pop() {
        let mut neighbors = from_statement
            .query_map([&name], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(map_sqlite_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(map_sqlite_error)?;
        neighbors.extend(
            to_statement
                .query_map([&name], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(map_sqlite_error)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(map_sqlite_error)?,
        );
        for (uri, neighbor) in neighbors {
            if reference_uri_admitted(&uri, declaration_uri, admitted_uri_roots)
                && names.insert(neighbor.clone())
            {
                pending.push(neighbor);
                if names.len() > MAX_REFERENCE_ALIAS_NAMES {
                    return Ok(names.into_iter().collect());
                }
            }
        }
    }
    Ok(names.into_iter().collect())
}

pub(super) fn read_reference_uris(
    connection: &ReferenceRead<'_>,
    reference_export_name: &str,
    declaration_name: &str,
    limit: usize,
) -> Result<Vec<String>, StoreError> {
    let limit = i64::try_from(limit).map_err(|_| {
        StoreError::new(
            StoreErrorKind::InvalidData,
            "reference candidate limit exceeds SQLite integer range",
        )
    })?;
    let mut statement = connection
        .prepare(REFERENCE_URIS_SQL)
        .map_err(map_sqlite_error)?;
    let rows = statement
        .query_map(
            params![reference_export_name, declaration_name, limit],
            |row| row.get::<_, String>(0),
        )
        .map_err(map_sqlite_error)?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(map_sqlite_error)
}

pub(super) fn read_reference_bindings(
    connection: &ReferenceRead<'_>,
    reference_export_name: &str,
    declaration_name: &str,
) -> Result<Vec<ReferenceBinding>, StoreError> {
    let mut statement = connection
        .prepare(REFERENCE_BINDINGS_SQL)
        .map_err(map_sqlite_error)?;
    let rows = statement
        .query_map(params![reference_export_name, declaration_name], |row| {
            Ok(ReferenceBinding {
                uri: row.get(0)?,
                imported_name: row.get(1)?,
                local_name: row.get(2)?,
                source_specifier: row.get(3)?,
                kind: reference_binding_kind_from_i64(row.get(4)?).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        4,
                        rusqlite::types::Type::Integer,
                        Box::new(error),
                    )
                })?,
                source_resolution: ReferenceBindingResolution::Unresolved,
                resolved_source_uri: None,
                external_terminal_identity: None,
            })
        })
        .map_err(map_sqlite_error)?;
    let mut bindings = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(map_sqlite_error)?;
    sort_reference_bindings(&mut bindings);
    Ok(bindings)
}

pub(super) fn read_scoped_reference_bindings(
    connection: &ReferenceRead<'_>,
    names: &[String],
) -> Result<Vec<ReferenceBinding>, StoreError> {
    let sql = scoped_reference_bindings_sql(names.len())?;
    let mut statement = connection.prepare(&sql).map_err(map_sqlite_error)?;
    let rows = statement
        .query_map(params_from_iter(names), |row| {
            Ok(ReferenceBinding {
                uri: row.get(0)?,
                imported_name: row.get(1)?,
                local_name: row.get(2)?,
                source_specifier: row.get(3)?,
                kind: reference_binding_kind_from_i64(row.get(4)?).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        4,
                        rusqlite::types::Type::Integer,
                        Box::new(error),
                    )
                })?,
                source_resolution: ReferenceBindingResolution::Unresolved,
                resolved_source_uri: None,
                external_terminal_identity: None,
            })
        })
        .map_err(map_sqlite_error)?;
    let mut bindings = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(map_sqlite_error)?;
    sort_reference_bindings(&mut bindings);
    Ok(bindings)
}

pub(super) fn read_reference_occurrences(
    connection: &ReferenceRead<'_>,
    reference_export_name: &str,
    declaration_name: &str,
) -> Result<Vec<ReferenceOccurrenceIdentity>, StoreError> {
    let mut statement = connection
        .prepare(REFERENCE_OCCURRENCES_SQL)
        .map_err(map_sqlite_error)?;
    let rows = statement
        .query_map(params![reference_export_name, declaration_name], |row| {
            Ok(ReferenceOccurrenceIdentity {
                name: row.get(0)?,
                uri: row.get(1)?,
                qualified: reference_qualification_from_i64(row.get(2)?).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        2,
                        rusqlite::types::Type::Integer,
                        Box::new(error),
                    )
                })?,
                qualifier: non_empty_string(row.get(3)?),
            })
        })
        .map_err(map_sqlite_error)?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(map_sqlite_error)
}

pub(super) fn read_scoped_reference_occurrences(
    connection: &ReferenceRead<'_>,
    names: &[String],
) -> Result<Vec<ReferenceOccurrenceIdentity>, StoreError> {
    let sql = scoped_reference_occurrences_sql(names.len())?;
    let mut statement = connection.prepare(&sql).map_err(map_sqlite_error)?;
    let rows = statement
        .query_map(params_from_iter(names), |row| {
            Ok(ReferenceOccurrenceIdentity {
                name: row.get(0)?,
                uri: row.get(1)?,
                qualified: reference_qualification_from_i64(row.get(2)?).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        2,
                        rusqlite::types::Type::Integer,
                        Box::new(error),
                    )
                })?,
                qualifier: non_empty_string(row.get(3)?),
            })
        })
        .map_err(map_sqlite_error)?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(map_sqlite_error)
}

pub(super) fn read_independent_reference_declarations(
    connection: &ReferenceRead<'_>,
    reference_export_name: &str,
    declaration_name: &str,
    declaration_identity: Option<&str>,
) -> Result<BTreeSet<(String, String)>, StoreError> {
    let Some(declaration_identity) = declaration_identity else {
        return Ok(BTreeSet::new());
    };
    let mut statement = connection
        .prepare(INDEPENDENT_REFERENCE_DECLARATIONS_SQL)
        .map_err(map_sqlite_error)?;
    let rows = statement
        .query_map(
            params![
                reference_export_name,
                declaration_name,
                declaration_identity
            ],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(map_sqlite_error)?;
    rows.collect::<Result<BTreeSet<_>, _>>()
        .map_err(map_sqlite_error)
}

pub(super) fn read_scoped_independent_reference_declarations(
    connection: &ReferenceRead<'_>,
    names: &[String],
    declaration_identity: Option<&str>,
) -> Result<BTreeSet<(String, String)>, StoreError> {
    let Some(declaration_identity) = declaration_identity else {
        return Ok(BTreeSet::new());
    };
    let sql = scoped_independent_reference_declarations_sql(names.len())?;
    let mut parameters: Vec<SqlValue> = names.iter().cloned().map(SqlValue::Text).collect();
    parameters.push(SqlValue::Text(declaration_identity.to_owned()));
    let mut statement = connection.prepare(&sql).map_err(map_sqlite_error)?;
    let rows = statement
        .query_map(params_from_iter(parameters.iter()), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(map_sqlite_error)?;
    rows.collect::<Result<BTreeSet<_>, _>>()
        .map_err(map_sqlite_error)
}

#[cfg(test)]
#[path = "reference_query_plan_tests.rs"]
mod tests;
