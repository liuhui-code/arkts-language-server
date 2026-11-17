use super::*;

#[test]
fn reference_uri_query_uses_the_covering_occurrence_identity_index() {
    let connection = Connection::open_in_memory().expect("in-memory database should open");
    connection
        .execute_batch(
            "CREATE TABLE reference_bindings(\
                    imported_name TEXT NOT NULL,\
                    local_name TEXT NOT NULL\
                 );\
                 CREATE TABLE reference_occurrence_identities(\
                    document_uri TEXT NOT NULL,\
                    name TEXT NOT NULL,\
                    qualification INTEGER NOT NULL,\
                    qualifier TEXT NOT NULL\
                 );\
                 CREATE INDEX reference_occurrence_identities_name \
                    ON reference_occurrence_identities(\
                        name, document_uri, qualification, qualifier\
                    );",
        )
        .expect("reference query schema should exist");

    let mut statement = connection
        .prepare(&format!("EXPLAIN QUERY PLAN {REFERENCE_URIS_SQL}"))
        .expect("reference query plan should prepare");
    let details: Vec<String> = statement
        .query_map(params!["Needle", "Needle", 20], |row| row.get(3))
        .expect("reference query plan should execute")
        .collect::<Result<_, _>>()
        .expect("reference query plan should decode");

    assert!(
        details.iter().any(|detail| {
            detail.contains("COVERING INDEX reference_occurrence_identities_name")
        }),
        "reference query plan did not use the covering identity index: {details:?}"
    );
}

#[test]
fn scoped_reference_queries_reuse_the_proven_names_without_scanning_aliases() {
    let connection = Connection::open_in_memory().expect("in-memory database should open");
    connection
        .execute_batch(
            "CREATE TABLE reference_bindings(\
                    document_uri TEXT NOT NULL,\
                    imported_name TEXT NOT NULL,\
                    local_name TEXT NOT NULL,\
                    source_specifier TEXT NOT NULL,\
                    kind INTEGER NOT NULL\
                 );\
                 CREATE INDEX reference_bindings_imported_name \
                    ON reference_bindings(imported_name, document_uri);\
                 CREATE INDEX reference_bindings_local_name \
                    ON reference_bindings(local_name, document_uri);\
                 CREATE TABLE reference_occurrence_identities(\
                    document_uri TEXT NOT NULL,\
                    name TEXT NOT NULL,\
                    qualification INTEGER NOT NULL,\
                    qualifier TEXT NOT NULL\
                 );\
                 CREATE INDEX reference_occurrence_identities_name \
                    ON reference_occurrence_identities(\
                        name, document_uri, qualification, qualifier\
                    );",
        )
        .expect("scoped reference query schema should exist");

    let sql = scoped_reference_bindings_sql(2).expect("two names should produce SQL");
    let mut statement = connection
        .prepare(&format!("EXPLAIN QUERY PLAN {sql}"))
        .expect("scoped reference query plan should prepare");
    let details: Vec<String> = statement
        .query_map(params!["Needle", "Alias"], |row| row.get(3))
        .expect("scoped reference query plan should execute")
        .collect::<Result<_, _>>()
        .expect("scoped reference query plan should decode");

    assert!(
        details
            .iter()
            .any(|detail| detail.contains("reference_bindings_imported_name")),
        "scoped query did not use the imported-name index: {details:?}"
    );
    assert!(
        details
            .iter()
            .any(|detail| detail.contains("reference_bindings_local_name")),
        "scoped query did not use the local-name index: {details:?}"
    );
    assert!(
        details
            .iter()
            .all(|detail| !detail.contains("reference_aliases")),
        "scoped query rebuilt the global alias graph: {details:?}"
    );

    let sql = scoped_reference_occurrences_sql(2).expect("two names should produce SQL");
    let mut statement = connection
        .prepare(&format!("EXPLAIN QUERY PLAN {sql}"))
        .expect("scoped occurrence query plan should prepare");
    let details: Vec<String> = statement
        .query_map(params!["Needle", "Alias"], |row| row.get(3))
        .expect("scoped occurrence query plan should execute")
        .collect::<Result<_, _>>()
        .expect("scoped occurrence query plan should decode");
    assert!(
        details.iter().any(|detail| {
            detail.contains("COVERING INDEX reference_occurrence_identities_name")
        }),
        "scoped occurrence query did not stay inside the covering identity index: {details:?}"
    );
    assert!(
        details
            .iter()
            .all(|detail| !detail.contains("reference_aliases")),
        "scoped occurrence query rebuilt the global alias graph: {details:?}"
    );
}
