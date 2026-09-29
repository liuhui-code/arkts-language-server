use std::collections::BTreeSet;

use arkts_index_core::{
    ClassHeritageBase, ClassHeritageDeclaration, ClassHeritageSearchResult, DocumentClassHeritage,
    DocumentSymbols, Position, StoreError, TextRange,
};
use rusqlite::{Connection, OptionalExtension, Row, Transaction, TransactionBehavior, params};

use crate::{SqliteStore, map_sqlite_error, read_committed_generation};

pub(super) const CREATE_TABLE_SQL: &str = "CREATE TABLE IF NOT EXISTS class_heritage_declarations(
    document_uri TEXT NOT NULL REFERENCES documents(uri) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    name TEXT NOT NULL,
    name_start_line INTEGER NOT NULL CHECK(name_start_line >= 0),
    name_start_character INTEGER NOT NULL CHECK(name_start_character >= 0),
    name_end_line INTEGER NOT NULL CHECK(name_end_line >= 0),
    name_end_character INTEGER NOT NULL CHECK(name_end_character >= 0),
    declaration_start_line INTEGER NOT NULL CHECK(declaration_start_line >= 0),
    declaration_start_character INTEGER NOT NULL CHECK(declaration_start_character >= 0),
    declaration_end_line INTEGER NOT NULL CHECK(declaration_end_line >= 0),
    declaration_end_character INTEGER NOT NULL CHECK(declaration_end_character >= 0),
    base_name TEXT,
    base_start_line INTEGER CHECK(base_start_line >= 0),
    base_start_character INTEGER CHECK(base_start_character >= 0),
    base_end_line INTEGER CHECK(base_end_line >= 0),
    base_end_character INTEGER CHECK(base_end_character >= 0),
    is_direct_export INTEGER NOT NULL DEFAULT 0 CHECK(is_direct_export IN (0, 1)),
    PRIMARY KEY(document_uri, ordinal),
    CHECK((base_name IS NULL AND base_start_line IS NULL AND base_start_character IS NULL
        AND base_end_line IS NULL AND base_end_character IS NULL)
        OR (base_name IS NOT NULL AND base_start_line IS NOT NULL
        AND base_start_character IS NOT NULL AND base_end_line IS NOT NULL
        AND base_end_character IS NOT NULL))
);";

pub(super) fn insert_documents(
    transaction: &Transaction<'_>,
    documents: &[DocumentSymbols],
) -> Result<(), StoreError> {
    let mut insert = transaction
        .prepare_cached(
            "INSERT INTO class_heritage_declarations(
                document_uri, ordinal, name,
                name_start_line, name_start_character, name_end_line, name_end_character,
                declaration_start_line, declaration_start_character,
                declaration_end_line, declaration_end_character,
                base_name, base_start_line, base_start_character, base_end_line, base_end_character,
                is_direct_export
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
        )
        .map_err(map_sqlite_error)?;
    for document in documents {
        transaction
            .execute(
                "UPDATE documents SET class_bindings_source_supported = ?1 WHERE uri = ?2",
                params![
                    document
                        .class_binding_provenance
                        .as_ref()
                        .map(|facts| facts.source_supported),
                    document.uri,
                ],
            )
            .map_err(map_sqlite_error)?;
        let Some(facts) = &document.class_heritage else {
            continue;
        };
        let direct_exports: BTreeSet<_> = document
            .class_binding_provenance
            .iter()
            .flat_map(|facts| &facts.direct_exports)
            .map(|range| (range.start, range.end))
            .collect();
        transaction
            .execute(
                "UPDATE documents SET heritage_lexically_complete = ?1 WHERE uri = ?2",
                params![facts.lexically_complete, document.uri],
            )
            .map_err(map_sqlite_error)?;
        for (ordinal, class) in facts.classes.iter().enumerate() {
            let base = class.base.as_ref();
            insert
                .execute(params![
                    document.uri,
                    ordinal as i64,
                    class.name,
                    class.name_range.start.line,
                    class.name_range.start.character,
                    class.name_range.end.line,
                    class.name_range.end.character,
                    class.declaration_range.start.line,
                    class.declaration_range.start.character,
                    class.declaration_range.end.line,
                    class.declaration_range.end.character,
                    base.map(|base| base.name.as_str()),
                    base.map(|base| base.range.start.line),
                    base.map(|base| base.range.start.character),
                    base.map(|base| base.range.end.line),
                    base.map(|base| base.range.end.character),
                    direct_exports.contains(&(class.name_range.start, class.name_range.end)),
                ])
                .map_err(map_sqlite_error)?;
        }
    }
    Ok(())
}

pub(super) fn search(
    store: &SqliteStore,
    document_uri: &str,
) -> Result<ClassHeritageSearchResult, StoreError> {
    let transaction = Transaction::new_unchecked(&store.connection, TransactionBehavior::Deferred)
        .map_err(map_sqlite_error)?;
    let served_generation = read_committed_generation(&transaction)?;
    let facts = read_document(&transaction, document_uri)?;
    transaction.commit().map_err(map_sqlite_error)?;
    Ok(ClassHeritageSearchResult {
        facts,
        served_generation,
    })
}

pub(super) fn read_document(
    connection: &Connection,
    document_uri: &str,
) -> Result<Option<DocumentClassHeritage>, StoreError> {
    let complete = connection
        .query_row(
            "SELECT heritage_lexically_complete FROM documents WHERE uri = ?1",
            [document_uri],
            |row| row.get::<_, Option<bool>>(0),
        )
        .optional()
        .map_err(map_sqlite_error)?
        .flatten();
    complete
        .map(|lexically_complete| {
            let mut statement = connection
                .prepare_cached(
                    "SELECT name,
                        name_start_line, name_start_character, name_end_line, name_end_character,
                        declaration_start_line, declaration_start_character,
                        declaration_end_line, declaration_end_character,
                        base_name, base_start_line, base_start_character,
                        base_end_line, base_end_character
                     FROM class_heritage_declarations WHERE document_uri = ?1 ORDER BY ordinal",
                )
                .map_err(map_sqlite_error)?;
            let classes = statement
                .query_map([document_uri], read_declaration)
                .map_err(map_sqlite_error)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(map_sqlite_error)?;
            let facts = DocumentClassHeritage {
                uri: document_uri.to_owned(),
                classes,
                lexically_complete,
            };
            facts.validate_document(document_uri)?;
            Ok(facts)
        })
        .transpose()
}

fn read_declaration(row: &Row<'_>) -> rusqlite::Result<ClassHeritageDeclaration> {
    let base = match row.get::<_, Option<String>>(9)? {
        Some(name) => Some(ClassHeritageBase {
            name,
            range: read_range(row, 10)?,
        }),
        None => None,
    };
    Ok(ClassHeritageDeclaration {
        name: row.get(0)?,
        name_range: read_range(row, 1)?,
        declaration_range: read_range(row, 5)?,
        base,
    })
}

pub(super) fn read_range(row: &Row<'_>, start: usize) -> rusqlite::Result<TextRange> {
    Ok(TextRange {
        start: Position::new(row.get(start)?, row.get(start + 1)?),
        end: Position::new(row.get(start + 2)?, row.get(start + 3)?),
    })
}
