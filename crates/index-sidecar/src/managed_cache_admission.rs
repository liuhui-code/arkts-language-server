//! Every I/O lane retains the initialized owner's directory identity. Reopening
//! a pathname must not silently acquire a different cache object at that name.
use crate::protocol::ProtocolError;
use arkts_index_core::{StoreError, StoreErrorKind};
use arkts_index_sqlite::cache_gc::namespace::ManagedCacheNamespace;

pub(crate) fn validate(namespace: Option<&ManagedCacheNamespace>) -> Result<(), StoreError> {
    if let Some(namespace) = namespace {
        namespace.validate().map_err(|message| {
            StoreError::new(
                StoreErrorKind::InvalidData,
                format!("cache namespace changed: {message}"),
            )
        })?;
    }
    Ok(())
}
pub(crate) fn protocol(namespace: Option<&ManagedCacheNamespace>) -> Result<(), ProtocolError> {
    validate(namespace)
        .map_err(|error| ProtocolError::new("cache_namespace_changed", error.to_string()))
}
