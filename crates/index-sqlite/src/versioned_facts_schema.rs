use crate::map_sqlite_error;
use arkts_index_core::StoreError;
use rusqlite::Connection;

#[path = "versioned_fact_guards.rs"]
mod guards;
pub(crate) fn validate_layout(c: &Connection) -> Result<(), StoreError> {
    let without_rowid: bool = c
        .query_row(
            "SELECT wr FROM pragma_table_list WHERE schema='main' AND name='v_occurrences'",
            [],
            |r| r.get(0),
        )
        .map_err(map_sqlite_error)?;
    if without_rowid != cfg!(feature = "experimental-occurrence-without-rowid") {
        return Err(super::invalid("file facts occurrence layout mismatch"));
    }
    Ok(())
}
/// Retired committed receipts may release a resource FK only in the new layout.
pub(crate) fn validate_owner_layout(c: &Connection, format: i64) -> Result<(), StoreError> {
    let required: bool = c.query_row(
        r#"SELECT COALESCE((SELECT "notnull" FROM pragma_table_info('manifest_groups') WHERE name='owner'),0)"#,
        [], |row| row.get(0),
    ).map_err(map_sqlite_error)?;
    if !required {
        return Err(super::invalid("file facts logical owner layout mismatch"));
    }
    if matches!(format, 10 | 110) {
        let resource_required: bool = c.query_row(
            r#"SELECT COALESCE((SELECT "notnull" FROM pragma_table_info('manifest_groups') WHERE name='resource_owner'),1)"#,
            [], |row| row.get(0),
        ).map_err(map_sqlite_error)?;
        let split_fk: bool = c.query_row(
            r#"SELECT EXISTS(SELECT 1 FROM pragma_foreign_key_list('manifest_groups') WHERE "from"='resource_owner' AND "table"='manifest_owners' AND "to"='id') AND NOT EXISTS(SELECT 1 FROM pragma_foreign_key_list('manifest_groups') WHERE "from"='owner')"#,
            [], |row| row.get(0),
        ).map_err(map_sqlite_error)?;
        if resource_required || !split_fk {
            return Err(super::invalid("file facts resource owner layout mismatch"));
        }
    }
    Ok(())
}
pub(super) fn initialize(c: &Connection) -> Result<(), StoreError> {
    let mut sql = format!("BEGIN IMMEDIATE;
CREATE TABLE file_facts_format(version INTEGER PRIMARY KEY CHECK(version={0})); INSERT INTO file_facts_format VALUES({0});\n", super::FORMAT);
    sql.push_str("
CREATE TABLE file_versions(id TEXT PRIMARY KEY,uri TEXT NOT NULL,source_sha TEXT NOT NULL,domain TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('staging','sealed','collecting')),heritage_complete INTEGER,source_supported INTEGER,row_count INTEGER NOT NULL DEFAULT 0,creator TEXT NOT NULL REFERENCES manifest_owners(id));
CREATE TABLE version_pins(owner TEXT NOT NULL REFERENCES manifest_owners(id),version TEXT NOT NULL REFERENCES file_versions(id),PRIMARY KEY(owner,version));
CREATE INDEX version_pins_version ON version_pins(version,owner);
CREATE INDEX version_collection_state ON file_versions(state,id);
CREATE INDEX version_creator ON file_versions(creator);
CREATE INDEX manifest_group_owner ON manifest_groups(resource_owner,state) WHERE resource_owner IS NOT NULL;
CREATE UNIQUE INDEX sealed_file_key ON file_versions(uri,source_sha,domain) WHERE state='sealed';
CREATE TABLE v_symbols(version TEXT NOT NULL REFERENCES file_versions(id) ON DELETE CASCADE,ordinal INTEGER NOT NULL,name TEXT NOT NULL,name_folded TEXT NOT NULL,acronym_folded TEXT NOT NULL,kind INTEGER NOT NULL,container TEXT,sl INTEGER,sc INTEGER,el INTEGER,ec INTEGER,PRIMARY KEY(version,ordinal));
CREATE INDEX v_symbols_name ON v_symbols(name_folded);
CREATE INDEX v_symbols_acronym ON v_symbols(acronym_folded);
CREATE VIRTUAL TABLE v_symbol_fts USING fts5(name_folded,content='v_symbols',content_rowid='rowid',tokenize='trigram');
CREATE TRIGGER v_symbols_insert AFTER INSERT ON v_symbols BEGIN INSERT INTO v_symbol_fts(rowid,name_folded) VALUES(new.rowid,new.name_folded); END;
CREATE TRIGGER v_symbols_delete AFTER DELETE ON v_symbols BEGIN INSERT INTO v_symbol_fts(v_symbol_fts,rowid,name_folded) VALUES('delete',old.rowid,old.name_folded); END;
CREATE TABLE v_exports(version TEXT NOT NULL REFERENCES file_versions(id) ON DELETE CASCADE,ordinal INTEGER NOT NULL,name TEXT NOT NULL,name_folded TEXT NOT NULL,reference_name TEXT,kind INTEGER NOT NULL,identity TEXT,specifier TEXT,module_id TEXT,target_scope TEXT,searchable INTEGER NOT NULL,sl INTEGER,sc INTEGER,el INTEGER,ec INTEGER,PRIMARY KEY(version,ordinal));
CREATE INDEX v_exports_name ON v_exports(name_folded);
CREATE TABLE v_occurrences(version TEXT NOT NULL REFERENCES file_versions(id) ON DELETE CASCADE,ordinal INTEGER NOT NULL,name TEXT NOT NULL,qualified INTEGER,qualifier TEXT,sl INTEGER,sc INTEGER,el INTEGER,ec INTEGER,PRIMARY KEY(version,ordinal))");
    if cfg!(feature = "experimental-occurrence-without-rowid") {
        sql.push_str(" WITHOUT ROWID");
    }
    sql.push_str(";
CREATE TABLE v_identities(version TEXT NOT NULL REFERENCES file_versions(id) ON DELETE CASCADE,name TEXT NOT NULL,qualified INTEGER NOT NULL,qualifier TEXT NOT NULL,PRIMARY KEY(version,name,qualified,qualifier));
CREATE INDEX v_identities_name ON v_identities(name,version);
CREATE TABLE v_aliases(version TEXT NOT NULL REFERENCES file_versions(id) ON DELETE CASCADE,ordinal INTEGER NOT NULL,from_name TEXT NOT NULL,to_name TEXT NOT NULL,PRIMARY KEY(version,ordinal));
CREATE TABLE v_bindings(version TEXT NOT NULL REFERENCES file_versions(id) ON DELETE CASCADE,ordinal INTEGER NOT NULL,imported TEXT NOT NULL,local TEXT NOT NULL,specifier TEXT NOT NULL,kind INTEGER NOT NULL,PRIMARY KEY(version,ordinal));
CREATE TABLE v_heritage(version TEXT NOT NULL REFERENCES file_versions(id) ON DELETE CASCADE,ordinal INTEGER NOT NULL,name TEXT NOT NULL,nsl INTEGER,nsc INTEGER,nel INTEGER,nec INTEGER,dsl INTEGER,dsc INTEGER,del INTEGER,dec INTEGER,base TEXT,bsl INTEGER,bsc INTEGER,bel INTEGER,bec INTEGER,PRIMARY KEY(version,ordinal));
CREATE TABLE v_direct_exports(version TEXT NOT NULL REFERENCES file_versions(id) ON DELETE CASCADE,ordinal INTEGER NOT NULL,sl INTEGER,sc INTEGER,el INTEGER,ec INTEGER,PRIMARY KEY(version,ordinal));
DROP INDEX manifest_uri_group;
ALTER TABLE manifest_entries RENAME TO initial_manifest_entries;
CREATE TABLE manifest_entries(group_id TEXT NOT NULL REFERENCES manifest_groups(id),uri TEXT NOT NULL CHECK(length(uri)>0),kind TEXT NOT NULL CHECK(kind IN ('accepted','rejected','removed')),version TEXT REFERENCES file_versions(id),reason TEXT,CHECK((kind='accepted' AND version IS NOT NULL AND length(version)>0 AND reason IS NULL) OR (kind='rejected' AND version IS NULL AND reason IS NOT NULL AND length(reason)>0) OR (kind='removed' AND version IS NULL AND reason IS NULL)),PRIMARY KEY(group_id,uri));
INSERT INTO manifest_entries SELECT * FROM initial_manifest_entries;
DROP TABLE initial_manifest_entries;
CREATE INDEX manifest_uri_group ON manifest_entries(uri,group_id);
CREATE TRIGGER guard_file_staging BEFORE INSERT ON manifest_entries WHEN NEW.kind='accepted' AND NOT EXISTS(SELECT 1 FROM file_versions WHERE id=NEW.version AND uri=NEW.uri AND state='sealed') BEGIN SELECT RAISE(ABORT,'staging requires sealed file version'); END;
");
    sql.push_str(&guards::sql());
    sql.push_str("COMMIT;");
    c.execute_batch(&sql).map_err(map_sqlite_error)
}
