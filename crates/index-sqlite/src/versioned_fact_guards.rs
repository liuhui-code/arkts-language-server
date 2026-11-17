//! Seal invariants make publication a header-only operation. These guards are
//! part of the storage contract, including alternate ManifestLog writers.
pub(super) fn sql() -> String {
    let mut sql=String::from("
CREATE TRIGGER immutable_file_key BEFORE UPDATE ON file_versions
WHEN OLD.id IS NOT NEW.id OR OLD.uri IS NOT NEW.uri OR OLD.source_sha IS NOT NEW.source_sha OR OLD.domain IS NOT NEW.domain OR OLD.creator IS NOT NEW.creator
 OR NOT ((OLD.state='staging' AND NEW.state='sealed') OR (OLD.state IN ('staging','sealed') AND NEW.state='collecting'))
 OR (OLD.state='sealed' AND (OLD.row_count IS NOT NEW.row_count OR OLD.heritage_complete IS NOT NEW.heritage_complete OR OLD.source_supported IS NOT NEW.source_supported))
BEGIN SELECT RAISE(ABORT,'immutable file version'); END;
CREATE TRIGGER protect_referenced_file BEFORE UPDATE OF state ON file_versions
WHEN NEW.state='collecting' AND (EXISTS(SELECT 1 FROM manifest_entries WHERE version=NEW.id) OR EXISTS(SELECT 1 FROM version_pins p JOIN manifest_owners o ON o.id=p.owner WHERE p.version=NEW.id AND o.state='live'))
BEGIN SELECT RAISE(ABORT,'referenced file version'); END;
CREATE TRIGGER immutable_manifest_entry BEFORE UPDATE ON manifest_entries BEGIN SELECT RAISE(ABORT,'immutable manifest entry'); END;
CREATE TRIGGER protect_live_entry BEFORE DELETE ON manifest_entries WHEN EXISTS(SELECT 1 FROM manifest_groups g WHERE g.id=OLD.group_id AND (g.state IN ('staging','sealed') OR (g.state='published' AND NOT EXISTS(SELECT 1 FROM manifest_entries n JOIN manifest_groups q ON q.id=n.group_id WHERE n.uri=OLD.uri AND q.state='published' AND q.commit_seq>g.commit_seq)))) BEGIN SELECT RAISE(ABORT,'current or active entry is protected'); END;
CREATE TRIGGER only_staging_entry BEFORE INSERT ON manifest_entries WHEN NOT EXISTS(SELECT 1 FROM manifest_groups WHERE id=NEW.group_id AND state='staging') BEGIN SELECT RAISE(ABORT,'immutable sealed group'); END;
CREATE TRIGGER immutable_group_identity BEFORE UPDATE ON manifest_groups
WHEN (OLD.id IS NOT NEW.id OR OLD.owner IS NOT NEW.owner OR OLD.resource_owner IS NOT NEW.resource_owner OR OLD.state IN ('published','abandoned'))
AND NOT (OLD.state IN ('published','abandoned') AND OLD.resource_owner IS NOT NULL AND NEW.resource_owner IS NULL
 AND OLD.id IS NEW.id AND OLD.owner IS NEW.owner AND OLD.state IS NEW.state AND OLD.commit_seq IS NEW.commit_seq
 AND EXISTS(SELECT 1 FROM manifest_owners o WHERE o.id=OLD.resource_owner AND o.state='dead')
 AND NOT EXISTS(SELECT 1 FROM manifest_entries e WHERE e.group_id=OLD.id))
BEGIN SELECT RAISE(ABORT,'immutable group identity'); END;
CREATE TRIGGER guard_file_publication BEFORE UPDATE OF state ON manifest_groups WHEN NEW.state='published' AND OLD.state!='sealed' BEGIN SELECT RAISE(ABORT,'publication requires sealed group'); END;
");
    let families = [
        "v_symbols",
        "v_exports",
        "v_occurrences",
        "v_identities",
        "v_aliases",
        "v_bindings",
        "v_heritage",
        "v_direct_exports",
    ];
    let mut remains = Vec::new();
    for table in families {
        sql += &format!(
            "CREATE TRIGGER {table}_guard_insert BEFORE INSERT ON {table} WHEN (SELECT state FROM file_versions WHERE id=NEW.version) IS NOT 'staging' BEGIN SELECT RAISE(ABORT,'immutable sealed facts'); END;\n"
        );
        sql += &format!(
            "CREATE TRIGGER {table}_guard_update BEFORE UPDATE ON {table} WHEN (SELECT state FROM file_versions WHERE id=OLD.version) IS NOT 'staging' OR (SELECT state FROM file_versions WHERE id=NEW.version) IS NOT 'staging' BEGIN SELECT RAISE(ABORT,'immutable sealed facts'); END;\n"
        );
        sql += &format!(
            "CREATE TRIGGER {table}_guard_delete BEFORE DELETE ON {table} WHEN (SELECT state FROM file_versions WHERE id=OLD.version) IS NOT 'collecting' BEGIN SELECT RAISE(ABORT,'facts must enter collection first'); END;\n"
        );
        remains.push(format!(
            "EXISTS(SELECT 1 FROM {table} WHERE version=OLD.id)"
        ));
    }
    sql += &format!(
        "CREATE TRIGGER bounded_version_delete BEFORE DELETE ON file_versions WHEN OLD.state!='collecting' OR {} BEGIN SELECT RAISE(ABORT,'file facts must be collected in bounded batches'); END;\n",
        remains.join(" OR ")
    );
    sql
}
