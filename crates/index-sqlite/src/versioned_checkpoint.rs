//! The maintenance executor calls this outside its write transaction/query loop.
use super::{VersionedFacts, invalid};
use crate::map_sqlite_error;
use arkts_index_core::StoreError;
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VersionedCheckpoint {
    pub busy: bool,
    pub log_frames: Option<u64>,
    pub checkpointed_frames: Option<u64>,
}
fn frames(n: i64) -> Result<Option<u64>, StoreError> {
    match n {
        -1 => Ok(None),
        0.. => Ok(Some(n as u64)),
        _ => Err(invalid("invalid SQLite checkpoint frame count")),
    }
}
impl VersionedFacts {
    /// Never waits for readers/writers to finish and never truncates or VACUUMs.
    /// busy=false alone is not completion: compare the two frame counts too.
    pub fn checkpoint_passive(&mut self) -> Result<VersionedCheckpoint, StoreError> {
        let (busy, log, checkpointed): (bool, i64, i64) = self
            .log
            .connection
            .query_row("PRAGMA wal_checkpoint(PASSIVE)", [], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })
            .map_err(map_sqlite_error)?;
        Ok(VersionedCheckpoint {
            busy,
            log_frames: frames(log)?,
            checkpointed_frames: frames(checkpointed)?,
        })
    }
}
