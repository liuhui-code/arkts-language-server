//! Typed storage failures shared by all adapters.
use std::{error::Error, fmt};
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StoreErrorKind {
    Cancelled,
    Busy,
    Corrupt,
    Incompatible,
    MigrationRequired,
    ProducerSuperseded,
    WorkspaceMismatch,
    InvalidData,
    InvalidGeneration,
    Io,
    Internal,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StoreError {
    kind: StoreErrorKind,
    message: String,
}

impl StoreError {
    pub fn new(kind: StoreErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub const fn kind(&self) -> StoreErrorKind {
        self.kind
    }
}

impl fmt::Display for StoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for StoreError {}
