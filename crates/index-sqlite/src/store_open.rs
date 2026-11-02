use super::*;

impl SqliteStore {
    pub fn open(path: impl AsRef<Path>, workspace_identity: &str) -> Result<Self, StoreError> {
        Self::open_with_page_size(path.as_ref(), workspace_identity, None, true)
    }

    pub(super) fn open_private_catalog(
        path: &Path,
        workspace_identity: &str,
    ) -> Result<Self, StoreError> {
        Self::open_with_page_size(path, workspace_identity, Some(16384), true)
    }

    /// A published database must already exist and carry an initialized index schema.
    pub(super) fn open_existing(path: &Path, workspace_identity: &str) -> Result<Self, StoreError> {
        Self::open_with_page_size(path, workspace_identity, None, false)
    }

    fn open_with_page_size(
        path: &Path,
        workspace_identity: &str,
        page_size: Option<u32>,
        create: bool,
    ) -> Result<Self, StoreError> {
        let cache_lease =
            cache_gc::lease::CacheLease::acquire(path, workspace_identity).map_err(|error| {
                StoreError::new(
                    if matches!(&error, cache_gc::lease::CacheLeaseError::IdentityMismatch) {
                        StoreErrorKind::WorkspaceMismatch
                    } else {
                        StoreErrorKind::Io
                    },
                    error.to_string(),
                )
            })?;
        if create && let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                StoreError::new(
                    StoreErrorKind::Io,
                    format!("failed to create index cache directory: {error}"),
                )
            })?;
        }
        let generation_lease = catalog_files::reader_lease(path)?;
        let mut flags = OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX;
        if create {
            flags |= OpenFlags::SQLITE_OPEN_CREATE;
        }
        let mut connection = Connection::open_with_flags(path, flags).map_err(map_sqlite_error)?;
        if !create {
            let application_id: i64 = connection
                .pragma_query_value(None, "application_id", |row| row.get(0))
                .map_err(map_sqlite_error)?;
            if application_id != APPLICATION_ID {
                return Err(catalog_control::incompatible(
                    "published catalog schema is missing",
                ));
            }
        }
        if let Some(page_size) = page_size {
            connection
                .pragma_update(None, "page_size", page_size)
                .map_err(map_sqlite_error)?;
        }
        connection
            .busy_timeout(Duration::from_secs(5))
            .map_err(map_sqlite_error)?;
        let journal_mode: String = connection
            .query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))
            .map_err(map_sqlite_error)?;
        if !journal_mode.eq_ignore_ascii_case("wal") {
            return Err(StoreError::new(
                StoreErrorKind::Incompatible,
                format!("SQLite WAL mode is unavailable (got {journal_mode})"),
            ));
        }
        connection
            .execute_batch("PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;")
            .map_err(map_sqlite_error)?;

        schema_migrations::ensure_schema(&mut connection, workspace_identity)?;
        if let Some(lease) = &cache_lease {
            lease
                .record_use()
                .map_err(|error| StoreError::new(StoreErrorKind::Io, error))?;
        }

        Ok(Self {
            connection,
            _cache_lease: cache_lease,
            _generation_lease: generation_lease,
            #[cfg(debug_assertions)]
            fail_before_commit: false,
            #[cfg(debug_assertions)]
            generation_preflight_pause: None,
            #[cfg(debug_assertions)]
            search_rows_pause: Mutex::new(None),
            #[cfg(debug_assertions)]
            class_binding_snapshot_pause: Mutex::new(None),
        })
    }
}
