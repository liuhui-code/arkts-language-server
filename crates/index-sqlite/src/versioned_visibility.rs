//! Shared SQL admission for immutable facts; caller supplies only static identifiers.
pub(super) fn sql(version: &str, head: &str) -> String {
    format!("EXISTS(SELECT 1 FROM manifest_entries m JOIN manifest_groups p ON p.id=m.group_id
 WHERE m.version={version} AND m.uri=f.uri AND m.kind='accepted' AND p.state='published' AND p.commit_seq<=CAST({head} AS INTEGER)
 AND NOT EXISTS(SELECT 1 FROM manifest_entries n JOIN manifest_groups q ON q.id=n.group_id
 WHERE n.uri=m.uri AND q.state='published' AND q.commit_seq<=CAST({head} AS INTEGER) AND q.commit_seq>p.commit_seq))")
}
