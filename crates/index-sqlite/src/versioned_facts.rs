//! Same-data-DB file facts and manifest composition. Not yet a production backend.
use super::manifest_log::{ManifestEntry, ManifestLog, ManifestValue};
use crate::map_sqlite_error;
use arkts_index_core::{DocumentSymbols, StoreError, StoreErrorKind};
use rusqlite::params;
use std::path::Path;
#[path = "versioned_checkpoint.rs"]
mod checkpoint;
pub use checkpoint::VersionedCheckpoint;
#[path = "versioned_input_view.rs"]
pub(crate) mod input_view;
pub use input_view::CurrentFileInput;
#[path = "versioned_class_query.rs"]
mod class_query;
#[path = "versioned_export_query.rs"]
mod export_query;
#[path = "versioned_qualification.rs"]
mod qualification;
#[path = "catalog_validation.rs"]
mod validation;
pub use qualification::{InputRevision, QualificationReceipt};
pub use validation::{
    CatalogValidationObserver, CatalogValidationProgress, CatalogValidationStage,
};
#[path = "versioned_qualified_read.rs"]
mod qualified_read;
pub use qualified_read::QualifiedRead;
#[path = "versioned_draft.rs"]
mod draft;
pub use draft::DraftReclamation;
#[path = "versioned_gc.rs"]
mod gc;
#[path = "versioned_reuse.rs"]
mod reuse;
#[path = "versioned_snapshot.rs"]
pub(crate) mod snapshot;
pub use gc::VersionGcReport;
#[path = "versioned_file_writer.rs"]
mod file_writer;
#[path = "versioned_facts_read.rs"]
mod read;
#[path = "versioned_reference_views.rs"]
mod reference_views;
#[path = "versioned_facts_schema.rs"]
pub(crate) mod schema;
#[path = "versioned_store_port.rs"]
mod store_port;
#[path = "versioned_symbol_query.rs"]
mod symbol_query;
#[path = "versioned_visibility.rs"]
mod visibility;
#[path = "versioned_facts_write.rs"]
mod write;
pub use file_writer::FileVersionWrite;
#[path = "versioned_write_observation.rs"]
mod write_observation;
pub use write_observation::FileWriteWork;
#[path = "versioned_write_size.rs"]
mod write_size;
pub use write_size::FileWriteSize;
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileVersionReceipt {
    pub version: String,
    pub reused: bool,
    pub rows: usize,
}
pub(super) const FORMAT: i64 = if cfg!(feature = "experimental-occurrence-without-rowid") {
    110
} else {
    10
};
pub(super) const PREVIOUS_FORMAT: i64 = if cfg!(feature = "experimental-occurrence-without-rowid") {
    108
} else {
    8
};
pub(super) fn is_previous_format(format: i64) -> bool {
    if cfg!(feature = "experimental-occurrence-without-rowid") {
        matches!(format, 108 | 109)
    } else {
        matches!(format, 8 | 9)
    }
}
pub struct VersionedFacts {
    log: ManifestLog,
    previous_parent: bool,
    owner_cursor: String,
    last_write_work: Option<FileWriteWork>,
}
impl VersionedFacts {
    pub(crate) fn stored_domain(&self) -> Result<String, StoreError> {
        self.log
            .connection
            .query_row("SELECT domain FROM manifest_identity WHERE id=1", [], |r| {
                r.get(0)
            })
            .map_err(map_sqlite_error)
    }
    pub(crate) fn has_domain(&self, expected: &str) -> Result<bool, StoreError> {
        Ok(!self.previous_parent && self.stored_domain()? == expected)
    }
    pub(crate) fn file_inventory(&self) -> Result<crate::ManifestSnapshot, StoreError> {
        self.log.snapshot()
    }

    pub fn last_publication_work(&self) -> Option<&crate::PublicationWork> {
        self.log.last_publication_work()
    }

    pub fn open_existing(
        path: &Path,
        workspace: &str,
        store: &str,
        domain: &str,
    ) -> Result<Self, StoreError> {
        let log = ManifestLog::open_checked(path, workspace, store, domain, true)?;
        Ok(Self {
            log,
            previous_parent: false,
            owner_cursor: String::new(),
            last_write_work: None,
        })
    }

    /// Only Backend's explicit migration-parent mode can obtain this lease.
    /// It cannot qualify as current-domain data or escape via public open APIs.
    pub(crate) fn open_previous_parent(
        path: &Path,
        workspace: &str,
        store: &str,
        domain: &str,
    ) -> Result<Self, StoreError> {
        let log = ManifestLog::open_previous_for_migration(path, workspace, store, domain)?;
        Ok(Self {
            log,
            previous_parent: true,
            owner_cursor: String::new(),
            last_write_work: None,
        })
    }
    pub fn create(
        path: &Path,
        workspace: &str,
        store: &str,
        domain: &str,
    ) -> Result<Self, StoreError> {
        let log = ManifestLog::create(path, workspace, store, domain)?;
        schema::initialize(&log.connection)?;
        reference_views::initialize(&log.connection)?;
        qualification::initialize(&log.connection)?;
        Ok(Self {
            log,
            previous_parent: false,
            owner_cursor: String::new(),
            last_write_work: None,
        })
    }
    /// Content lookup only; this is not a current filesystem/semantic certificate.
    pub fn find_version(
        &self,
        uri: &str,
        sha: &str,
    ) -> Result<Option<FileVersionReceipt>, StoreError> {
        if uri.is_empty() || sha.len() != 64 || !sha.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(invalid("invalid file version key"));
        }
        let domain: String = self
            .log
            .connection
            .query_row("SELECT domain FROM manifest_identity WHERE id=1", [], |r| {
                r.get(0)
            })
            .map_err(map_sqlite_error)?;
        file_writer::reuse(
            &self.log.connection,
            &self.log.owner.id,
            uri,
            &sha.to_ascii_lowercase(),
            &domain,
        )
    }
    pub fn search(
        &self,
        query: &str,
        limit: usize,
    ) -> Result<arkts_index_core::SymbolSearchResult, StoreError> {
        symbol_query::search(
            &self.log.connection,
            &arkts_index_core::SymbolQuery::new(query, limit),
        )
    }
    pub fn search_exports(
        &self,
        query: &str,
        limit: usize,
    ) -> Result<arkts_index_core::ExportSearchResult, StoreError> {
        export_query::search(
            &self.log.connection,
            &arkts_index_core::ExportQuery::new(query, limit),
        )
    }
    pub fn class_heritage(
        &self,
        uri: &str,
    ) -> Result<arkts_index_core::ClassHeritageSearchResult, StoreError> {
        class_query::class_heritage(&self.log, uri)
    }
    pub fn class_binding_snapshot(
        &self,
        uris: &[String],
    ) -> Result<arkts_index_core::ClassBindingSnapshot, StoreError> {
        class_query::snapshot(&self.log, uris)
    }
    pub fn search_reference_candidates(
        &self,
        query: &arkts_index_core::ReferenceCandidateQuery,
        resolutions: &[arkts_index_core::ReferenceSourceResolution],
        roots: &[String],
    ) -> Result<arkts_index_core::ReferenceCandidateSearchResult, StoreError> {
        crate::reference_query::search(
            &self.log.connection,
            crate::reference_read::ReferenceLayout::Versioned,
            query,
            resolutions,
            roots,
        )
    }
    pub fn read_version(&self, id: &str) -> Result<Option<DocumentSymbols>, StoreError> {
        let tx = self
            .log
            .connection
            .unchecked_transaction()
            .map_err(map_sqlite_error)?;
        let doc = read::read(&tx, id)?;
        tx.commit().map_err(map_sqlite_error)?;
        Ok(doc)
    }
    pub fn visible_document(&self, uri: &str) -> Result<Option<DocumentSymbols>, StoreError> {
        let tx = self
            .log
            .connection
            .unchecked_transaction()
            .map_err(map_sqlite_error)?;
        let doc = match self.log.lookup(uri)? {
            Some(observation) => match observation.entry.value {
                ManifestValue::Accepted(id) => read::read(&tx, &id)?,
                _ => None,
            },
            None => None,
        };
        tx.commit().map_err(map_sqlite_error)?;
        Ok(doc)
    }
    pub(crate) fn set_catalog_format(&mut self) -> Result<(), StoreError> {
        self.log
            .connection
            .pragma_update(None, "application_id", crate::APPLICATION_ID)
            .map_err(map_sqlite_error)?;
        self.log
            .connection
            .pragma_update(
                None,
                "user_version",
                crate::catalog_api::backend::VERSIONED_SCHEMA,
            )
            .map_err(map_sqlite_error)
    }
    pub fn stage_group(
        &mut self,
        group: &str,
        entries: &[(String, String)],
    ) -> Result<(), StoreError> {
        let entries: Vec<_> = entries
            .iter()
            .map(|(uri, id)| ManifestEntry::accepted(uri, id))
            .collect();
        self.stage_changes(group, &entries)
    }
    pub fn stage_changes(
        &mut self,
        group: &str,
        entries: &[ManifestEntry],
    ) -> Result<(), StoreError> {
        for entry in entries {
            if let ManifestValue::Accepted(id) = &entry.value {
                let valid:bool=self.log.connection.query_row("SELECT EXISTS(SELECT 1 FROM file_versions WHERE id=?1 AND uri=?2 AND state='sealed')",params![id,entry.uri],|r|r.get(0)).map_err(map_sqlite_error)?;
                if !valid {
                    return Err(invalid(
                        "manifest requires a sealed version with matching URI",
                    ));
                }
            }
        }
        self.log.stage(group, entries)
    }
    pub fn publish_group(&mut self, group: &str, head: u64) -> Result<u64, StoreError> {
        let state: String = self
            .log
            .connection
            .query_row(
                "SELECT state FROM manifest_groups WHERE id=?1",
                [group],
                |r| r.get(0),
            )
            .map_err(map_sqlite_error)?;
        if state == "staging" {
            self.log.seal(group)?;
        }
        self.log.publish(group, head)
    }
}
fn invalid(message: &str) -> StoreError {
    StoreError::new(StoreErrorKind::InvalidData, message)
}
