use super::{Entry, Policy};
use rusqlite::{Connection, OpenFlags};
use std::path::{Path, PathBuf};

pub fn key(identity: &str) -> String {
    crate::cache_key(identity)
}

pub(super) fn identity(database: &Path, limit: u64) -> Result<String, String> {
    let result = main_identity(database);
    if result.is_err()
        && database
            .with_file_name("symbols-v2.sqlite3-wal")
            .metadata()
            .is_ok_and(|meta| meta.len() > 0)
    {
        super::identity_snapshot::identity(database, limit)
    } else {
        result
    }
}

fn main_identity(database: &Path) -> Result<String, String> {
    let uri = format!("{}?immutable=1", crate::path_to_file_uri(database));
    let connection = Connection::open_with_flags(
        uri,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| e.to_string())?;
    metadata_identity(&connection)
}

pub(super) fn metadata_identity(connection: &Connection) -> Result<String, String> {
    let application: i64 = connection
        .pragma_query_value(None, "application_id", |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if application != crate::APPLICATION_ID {
        return Err("foreign-database".into());
    }
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if !(1..=crate::SCHEMA_VERSION).contains(&version) {
        return Err("unsupported-schema".into());
    }
    connection
        .query_row(
            "SELECT workspace_identity FROM metadata WHERE id=1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("identity-unavailable: {e}"))
}

pub fn root(identity: &str) -> Option<PathBuf> {
    let encoded = identity.strip_prefix("file:///")?;
    let mut bytes = Vec::new();
    let mut iter = encoded.as_bytes().iter();
    while let Some(&byte) = iter.next() {
        if byte == b'%' {
            let a = (*iter.next()? as char).to_digit(16)?;
            let b = (*iter.next()? as char).to_digit(16)?;
            bytes.push((a * 16 + b) as u8);
        } else {
            bytes.push(byte);
        }
    }
    let text = String::from_utf8(bytes).ok()?;
    if text.contains('\0') {
        return None;
    }
    #[cfg(unix)]
    let path = PathBuf::from(format!("/{text}"));
    #[cfg(windows)]
    let path = {
        if text.as_bytes().get(1) != Some(&b':') {
            return None;
        }
        PathBuf::from(text.replace('/', "\\"))
    };
    if path
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return None;
    }
    Some(path)
}

pub(super) struct Candidate {
    pub entry: Entry,
    pub directory: PathBuf,
    pub snapshot: Vec<(String, u64, u128, String)>,
    pub root: PathBuf,
    pub source: super::source::Source,
    pub last_used: Option<u64>,
}

pub(super) fn candidate(
    directory: &Path,
    name: &str,
    policy: &Policy,
) -> Result<Candidate, String> {
    let before = super::files::snapshot(directory)?;
    if before.iter().any(|item| item.0 == "retired.json") {
        return Err("unexpected-retirement-marker".into());
    }
    let legacy_approved = super::decision::approved_legacy_grace(&policy.cache, name).is_some();
    if !directory.join("cache-use.json").exists() && !policy.include_legacy && !legacy_approved {
        return Err("legacy-opt-in-required".into());
    }
    let identity = identity(
        &directory.join("symbols-v2.sqlite3"),
        policy.identity_copy_bytes,
    )?;
    if key(&identity) != name {
        return Err("identity-key-mismatch".into());
    }
    let marker = directory.join("cache-use.json");
    let legacy = !marker.exists();
    let last_used = if legacy {
        None
    } else {
        let record: super::lease::UseRecord = super::files::read_json(&marker)?;
        if record.schema != 1 || record.workspace_identity != identity {
            return Err("invalid-use-record".into());
        }
        Some(
            record
                .last_used_ms
                .max(super::activity::last_seen(&policy.cache, name, &identity)?.unwrap_or(0)),
        )
    };
    if legacy && !policy.include_legacy && !legacy_approved {
        return Err("legacy-opt-in-required".into());
    }
    let root = root(&identity).ok_or("unsupported-workspace-uri")?;
    let source = super::source::prove(&root, &identity)?;
    if super::files::snapshot(directory)? != before {
        return Err("cache-changed-during-inspection".into());
    }
    let bytes = before.iter().map(|item| item.1).sum();
    Ok(Candidate {
        entry: Entry {
            key: name.into(),
            workspace_identity: Some(identity),
            legacy,
            bytes,
            outcome: "protected".into(),
            reason: String::new(),
        },
        directory: directory.to_owned(),
        snapshot: before,
        root,
        source,
        last_used,
    })
}
