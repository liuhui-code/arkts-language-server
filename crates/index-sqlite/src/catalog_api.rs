//! Public catalog construction and storage facade.
pub use crate::catalog_build::{
    CatalogBuildProgress, CatalogStage, build_catalog, build_catalog_with_fingerprint,
};
pub use crate::catalog_inputs::CatalogInputs;
pub use crate::catalog_store::CatalogStore;
pub use crate::catalog_stream::{CatalogInput, build_catalog_stream};

#[path = "catalog_fingerprint.rs"]
pub(super) mod fingerprint;
#[path = "catalog_session.rs"]
mod session;
pub use fingerprint::{CompleteScanFingerprint, CompleteScanInputs};
pub use session::CatalogBuildSession;

#[path = "manifest_log.rs"]
mod manifest_log;
pub use manifest_log::{
    ManifestEntry, ManifestLog, ManifestObservation, ManifestReadSet, ManifestSnapshot,
    ManifestValue, PublicationWork,
};

#[path = "versioned_facts.rs"]
pub(crate) mod versioned_facts;
pub use versioned_facts::{
    CatalogValidationObserver, CatalogValidationProgress, CatalogValidationStage, CurrentFileInput,
    DraftReclamation, FileVersionReceipt, FileVersionWrite, FileWriteSize, FileWriteWork,
    InputRevision, QualificationReceipt, QualifiedRead, VersionGcReport, VersionedCheckpoint,
    VersionedFacts,
};

#[path = "catalog_backend.rs"]
pub(crate) mod backend;
#[path = "catalog_migration.rs"]
mod migration;
pub use migration::CatalogMigration;

#[path = "catalog_maintenance.rs"]
mod maintenance;
pub use maintenance::CatalogMaintenance;
#[path = "read_cancellation.rs"]
pub(crate) mod read_cancellation;
pub use read_cancellation::ReadCancellation;

#[path = "catalog_collection.rs"]
mod collection;
pub use collection::{CatalogCollectionReport, CatalogCollector};

#[path = "catalog_reuse.rs"]
mod reuse;
pub use reuse::CatalogReuseLease;
