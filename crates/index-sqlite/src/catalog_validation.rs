//! Real SQLite VM progress, scoped to private-store validation, never a timer heartbeat.
use super::VersionedFacts;
use crate::map_sqlite_error;
use arkts_index_core::{StoreError, StoreErrorKind};
use rusqlite::Connection;
use std::sync::Arc;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CatalogValidationStage {
    QuickCheck,
    ForeignKeys,
    Fts,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CatalogValidationProgress {
    pub stage: CatalogValidationStage,
    /// Approximate SQLite VM instructions within this stage, not rows or bytes.
    pub vm_steps: u64,
}
#[derive(Clone)]
pub struct CatalogValidationObserver(Arc<dyn Fn(CatalogValidationProgress) -> bool + Send + Sync>);
impl CatalogValidationObserver {
    /// Returning false cancels validation. Never query the connection from this callback.
    pub fn new(
        callback: impl Fn(CatalogValidationProgress) -> bool + Send + Sync + 'static,
    ) -> Self {
        Self(Arc::new(callback))
    }
}
fn cancelled() -> StoreError {
    StoreError::new(StoreErrorKind::Cancelled, "catalog validation cancelled")
}
struct Hook<'a> {
    connection: &'a Connection,
    active: bool,
}
impl<'a> Hook<'a> {
    fn install(
        connection: &'a Connection,
        observer: &CatalogValidationObserver,
        stage: CatalogValidationStage,
    ) -> Result<Self, StoreError> {
        if !(observer.0)(CatalogValidationProgress { stage, vm_steps: 0 }) {
            return Err(cancelled());
        }
        let mut vm_steps = 0u64;
        let callback = observer.clone();
        let hook = Self {
            connection,
            active: true,
        };
        connection
            .progress_handler(
                1000,
                Some(move || {
                    vm_steps += 1000;
                    !(callback.0)(CatalogValidationProgress { stage, vm_steps })
                }),
            )
            .map_err(map_sqlite_error)?;
        Ok(hook)
    }
    fn clear(&mut self) -> Result<(), StoreError> {
        self.connection
            .progress_handler(0, None::<fn() -> bool>)
            .map_err(map_sqlite_error)?;
        self.active = false;
        Ok(())
    }
    fn finish<T>(mut self, result: Result<T, StoreError>) -> Result<T, StoreError> {
        self.clear()?;
        // SQLITE_INTERRUPT is already mapped to Cancelled. Preserve every other
        // authoritative SQL/corruption error instead of relabeling it by a flag.
        result
    }
}
impl Drop for Hook<'_> {
    fn drop(&mut self) {
        if self.active
            && let Err(error) = self.clear()
        {
            eprintln!(
                "{}",
                serde_json::json!({"event":"index.validation.cleanup.failed","message":error.to_string()})
            );
        }
    }
}
fn stage<T>(
    connection: &Connection,
    observer: Option<&CatalogValidationObserver>,
    kind: CatalogValidationStage,
    run: impl FnOnce() -> Result<T, StoreError>,
) -> Result<T, StoreError> {
    match observer {
        Some(observer) => Hook::install(connection, observer, kind)?.finish(run()),
        None => run(),
    }
}
impl VersionedFacts {
    pub(crate) fn validate_catalog_storage(
        &self,
        observer: Option<&CatalogValidationObserver>,
    ) -> Result<(), StoreError> {
        let c = &self.log.connection;
        stage(c, observer, CatalogValidationStage::QuickCheck, || {
            let mut statement = c.prepare("PRAGMA quick_check").map_err(map_sqlite_error)?;
            let results = statement
                .query_map([], |r| r.get::<_, String>(0))
                .map_err(map_sqlite_error)?;
            for result in results {
                if result.map_err(map_sqlite_error)? != "ok" {
                    return Err(StoreError::new(
                        StoreErrorKind::Corrupt,
                        "versioned catalog quick_check failed",
                    ));
                }
            }
            Ok(())
        })?;
        stage(c, observer, CatalogValidationStage::ForeignKeys, || {
            let violations: i64 = c
                .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |r| {
                    r.get(0)
                })
                .map_err(map_sqlite_error)?;
            if violations != 0 {
                return Err(StoreError::new(
                    StoreErrorKind::Corrupt,
                    "versioned catalog FK check failed",
                ));
            }
            Ok(())
        })?;
        stage(c, observer, CatalogValidationStage::Fts, || {
            c.execute(
                "INSERT INTO v_symbol_fts(v_symbol_fts,rank) VALUES('integrity-check',1)",
                [],
            )
            .map_err(map_sqlite_error)?;
            Ok(())
        })
    }
}
