//! Metadata-only current keys; inspecting unchanged files does not acquire pins.
use super::{VersionedFacts, invalid};
use crate::{ManifestObservation, ManifestReadSet, ManifestValue, map_sqlite_error};
use arkts_index_core::StoreError;
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CurrentFileInput {
    pub uri: String,
    pub observation: Option<ManifestObservation>,
    pub source_sha: Option<String>,
}
pub(crate) struct PreparedInputs {
    pub head: u64,
    pub read_set: Option<ManifestReadSet>,
    pub inputs: Vec<CurrentFileInput>,
}
impl VersionedFacts {
    pub(crate) fn verify_prepared_noop<G>(
        &self,
        read_set: Option<&ManifestReadSet>,
        permit: impl FnOnce() -> Result<G, StoreError>,
    ) -> Result<u64, StoreError> {
        self.log.verify_checked_with(
            read_set.ok_or_else(|| invalid("no observed noop set"))?,
            permit,
        )
    }
    pub(crate) fn prepare_inputs(&self, uris: &[String]) -> Result<PreparedInputs, StoreError> {
        let tx = self
            .log
            .connection
            .unchecked_transaction()
            .map_err(map_sqlite_error)?;
        let head = crate::read_committed_generation(&tx)?;
        let read_set = if uris.is_empty() {
            None
        } else {
            Some(self.log.capture_in_snapshot(uris)?)
        };
        let inputs=read_set.as_ref().map_or(&[][..],|s|s.observations()).iter().map(|(uri,observation)|{
            let observation=observation.clone();
            let source_sha=match &observation {
                Some(o)=>match &o.entry.value {
                    ManifestValue::Accepted(id)=>Some(tx.query_row("SELECT source_sha FROM file_versions WHERE id=?1 AND state='sealed'",[id],|r|r.get(0)).map_err(map_sqlite_error)?),
                    _=>None,
                },
                _=>None,
            };
            Ok(CurrentFileInput{uri:uri.clone(),observation,source_sha})
        }).collect::<Result<Vec<_>,StoreError>>()?;
        tx.commit().map_err(map_sqlite_error)?;
        Ok(PreparedInputs {
            head,
            read_set,
            inputs,
        })
    }
    pub(crate) fn commit_prepared<G>(
        &mut self,
        group: &str,
        read_set: Option<&ManifestReadSet>,
        permit: impl FnOnce() -> Result<G, StoreError>,
    ) -> Result<u64, StoreError> {
        let read_set = read_set.ok_or_else(|| invalid("no observed write set"))?;
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
        self.log.publish_checked_with(group, read_set, permit)
    }
}
