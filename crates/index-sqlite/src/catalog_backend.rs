//! Explicit storage negotiation; legacy callers never interpret the new schema.
use crate::{
    SqliteStore, VersionedFacts,
    catalog_control::{Publication, incompatible},
    catalog_store::open_published,
    map_sqlite_error,
};
use arkts_index_core::{StoreError, StoreErrorKind, StoreMetadata, SymbolStore};
use rusqlite::{Connection, OpenFlags};
use std::path::Path;
pub(crate) const VERSIONED_SCHEMA: i64 = if cfg!(feature = "experimental-occurrence-without-rowid")
{
    112
} else {
    12
};
pub(crate) enum OpenMode<'a> {
    LegacyOnly,
    Versioned(&'a str),
    MigrationParent,
}
pub(crate) enum Backend {
    Legacy(Box<SqliteStore>),
    Versioned(Box<VersionedFacts>),
}
impl Backend {
    pub fn store(&mut self) -> &mut dyn SymbolStore {
        match self {
            Self::Legacy(s) => s.as_mut(),
            Self::Versioned(s) => s.as_mut(),
        }
    }
    pub fn metadata(&self) -> Result<StoreMetadata, StoreError> {
        match self {
            Self::Legacy(s) => s.metadata(),
            Self::Versioned(s) => s.metadata(),
        }
    }
    pub fn open(
        path: &Path,
        identity: &str,
        publication: &Publication,
        initial: Option<SqliteStore>,
        mode: OpenMode<'_>,
    ) -> Result<Self, StoreError> {
        if initial.is_some() || matches!(mode, OpenMode::LegacyOnly) {
            return Ok(Self::Legacy(Box::new(open_published(
                path,
                identity,
                publication,
                initial,
            )?)));
        }
        crate::catalog_control::safe_file(path)?;
        let probe = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(map_sqlite_error)?;
        let schema: i64 = probe
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .map_err(map_sqlite_error)?;
        if schema != 12 && schema != 112 {
            drop(probe);
            return Ok(Self::Legacy(Box::new(open_published(
                path,
                identity,
                publication,
                None,
            )?)));
        }
        let app: i64 = probe
            .pragma_query_value(None, "application_id", |r| r.get(0))
            .map_err(map_sqlite_error)?;
        if schema != VERSIONED_SCHEMA || app != crate::APPLICATION_ID {
            return Err(incompatible(
                "incompatible versioned catalog storage profile",
            ));
        }
        let (workspace, store, domain): (String, String, String) = probe
            .query_row(
                "SELECT workspace,store,domain FROM manifest_identity WHERE id=1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(map_sqlite_error)?;
        if workspace != identity
            || path.file_name().and_then(|n| n.to_str()) != Some(store.as_str())
            || domain.is_empty()
        {
            return Err(incompatible("versioned catalog identity mismatch"));
        }
        if let OpenMode::Versioned(expected) = mode
            && domain != expected
        {
            return Err(StoreError::new(
                StoreErrorKind::MigrationRequired,
                "versioned catalog facts domain mismatch",
            ));
        }
        let format: i64 = probe
            .query_row("SELECT version FROM file_facts_format", [], |r| r.get(0))
            .map_err(map_sqlite_error)?;
        let previous = matches!(mode, OpenMode::MigrationParent)
            && super::versioned_facts::is_previous_format(format);
        drop(probe);
        let facts = if previous {
            VersionedFacts::open_previous_parent(path, identity, &store, &domain)?
        } else {
            VersionedFacts::open_existing(path, identity, &store, &domain)?
        };
        let backend = Self::Versioned(Box::new(facts));
        if backend.metadata()?.committed_generation < publication.generation {
            return Err(incompatible("versioned catalog publication is incomplete"));
        }
        Ok(backend)
    }
}
