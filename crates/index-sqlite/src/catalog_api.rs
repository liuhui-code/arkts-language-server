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
