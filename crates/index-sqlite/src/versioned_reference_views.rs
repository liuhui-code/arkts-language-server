use crate::map_sqlite_error;
use arkts_index_core::StoreError;
use rusqlite::Connection;
pub(super) fn initialize(c: &Connection) -> Result<(), StoreError> {
    c.execute_batch("CREATE VIEW current_file_versions AS
 SELECT m.uri,m.version,m.kind,m.reason,p.commit_seq AS generation FROM manifest_entries m JOIN manifest_groups p ON p.id=m.group_id
 WHERE p.state='published' AND p.commit_seq<=(SELECT head FROM manifest_identity WHERE id=1)
 AND NOT EXISTS(SELECT 1 FROM manifest_entries n JOIN manifest_groups q ON q.id=n.group_id WHERE n.uri=m.uri AND q.state='published' AND q.commit_seq>p.commit_seq AND q.commit_seq<=(SELECT head FROM manifest_identity WHERE id=1));
 CREATE VIEW metadata AS SELECT id,workspace AS workspace_identity,head AS committed_generation FROM manifest_identity;
 CREATE VIEW documents AS SELECT m.uri,m.generation,f.heritage_complete AS heritage_lexically_complete,f.source_supported AS class_bindings_source_supported FROM current_file_versions m JOIN file_versions f ON f.id=m.version WHERE m.kind='accepted';
 CREATE VIEW rejected_documents AS SELECT uri FROM current_file_versions WHERE kind='rejected';
 CREATE VIEW exports AS SELECT m.uri AS document_uri,m.generation,e.ordinal,e.name AS exported_name,e.reference_name AS reference_export_name,e.name_folded,e.kind AS symbol_kind,e.identity AS declaration_identity,e.specifier AS import_specifier,e.module_id,e.target_scope,e.sl AS start_line,e.sc AS start_character,e.el AS end_line,e.ec AS end_character,e.searchable AS reference_searchable FROM v_exports e JOIN current_file_versions m ON m.version=e.version WHERE m.kind='accepted';
 CREATE VIEW reference_occurrences AS SELECT m.uri AS document_uri,e.ordinal,e.name,e.sl AS start_line,e.sc AS start_character,e.el AS end_line,e.ec AS end_character,e.qualified FROM v_occurrences e JOIN current_file_versions m ON m.version=e.version WHERE m.kind='accepted';
 CREATE VIEW reference_occurrence_identities AS SELECT m.uri AS document_uri,e.name,e.qualified AS qualification,e.qualifier FROM v_identities e JOIN current_file_versions m ON m.version=e.version WHERE m.kind='accepted';
 CREATE VIEW reference_aliases AS SELECT m.uri AS document_uri,e.ordinal,e.from_name,e.to_name FROM v_aliases e JOIN current_file_versions m ON m.version=e.version WHERE m.kind='accepted';
 CREATE VIEW reference_bindings AS SELECT m.uri AS document_uri,e.ordinal,e.imported AS imported_name,e.local AS local_name,e.specifier AS source_specifier,e.kind FROM v_bindings e JOIN current_file_versions m ON m.version=e.version WHERE m.kind='accepted';
 ").map_err(map_sqlite_error)
}
