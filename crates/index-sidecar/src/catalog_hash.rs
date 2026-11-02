//! Nonforce route selection. No parser exists during manifest/hash comparison.
use super::{
    CatalogProgress, CatalogUpdate, observer,
    source::{SourceRead, SourceStamp, read_source},
    streaming::{
        Collected,
        producer::{Job, Producer},
    },
    worker::CatalogFailure,
};
use arkts_index_core::{StoreError, StoreErrorKind};
use arkts_index_sqlite::{CatalogBuildSession, CatalogInput, CatalogStage, CompleteScanInputs};
use std::{
    cell::RefCell,
    fs::Metadata,
    path::{Path, PathBuf},
    sync::{Arc, atomic::AtomicU8, mpsc::Sender},
};

pub(super) enum Issue {
    IgnoreRules,
    Directory,
    Entry,
    FileType,
    SourceMetadata,
    SourceRead,
}
pub(super) fn invalidate(planner: &mut Option<Planner>, issue: Issue) {
    if let Some(planner) = planner {
        planner.invalidate(issue);
    }
}
pub(super) struct Planner {
    session: CatalogBuildSession,
    inputs: Option<CompleteScanInputs>,
    hash_first: bool,
    jobs: Vec<Job>,
    sources: Vec<SourceStamp>,
}
impl Planner {
    pub(super) fn begin(base: &Path, identity: &str, generation: u64) -> Result<Self, StoreError> {
        let session = CatalogBuildSession::begin(base, identity, generation)?;
        let inputs = CompleteScanInputs::new().ok();
        let hash_first = match &inputs {
            Some(inputs) => session.has_qualified_reuse_candidate(inputs.producer_key())?,
            None => false,
        };
        Ok(Self {
            session,
            inputs,
            hash_first,
            jobs: Vec::new(),
            sources: Vec::new(),
        })
    }
    fn invalidate(&mut self, _issue: Issue) {
        // Each actual error branch calls this explicitly; normal ignores/policy skips do not.
        if let Some(inputs) = &mut self.inputs {
            inputs.invalidate();
        }
    }
    pub(super) fn admit(
        &mut self,
        uri: String,
        path: PathBuf,
        metadata: Metadata,
        progress: &mut CatalogProgress,
        rejected: &mut Vec<String>,
    ) {
        if !self.hash_first {
            self.jobs.push(Job {
                uri,
                path,
                expected: None,
            });
            return;
        }
        super::stream_gate::trace("hash_read", &uri);
        match read_source(&path) {
            Ok(SourceRead::Text(text)) => {
                let stamp = SourceStamp::capture(&path, &metadata, &text);
                if let Some(inputs) = &mut self.inputs {
                    inputs.record_digest(&uri, stamp.digest());
                }
                self.jobs.push(Job {
                    uri,
                    path,
                    expected: Some(stamp.clone()),
                });
                self.sources.push(stamp);
            }
            Ok(SourceRead::PolicySkipped) => progress.policy_skipped += 1,
            Err(_) => {
                self.invalidate(Issue::SourceRead);
                rejected.push(uri);
                progress.rejected += 1;
            }
        }
    }
    pub(super) fn build(
        mut self,
        state: &Arc<AtomicU8>,
        updates: &Sender<CatalogUpdate>,
        generation: u64,
        progress: CatalogProgress,
        rejected: Vec<String>,
    ) -> Result<(), CatalogFailure> {
        self.jobs.sort_unstable_by(|a, b| a.uri.cmp(&b.uri));
        let verified_count = self.jobs.len();
        let candidate = if self.hash_first {
            self.inputs.take().and_then(CompleteScanInputs::finish)
        } else {
            None
        };
        let collected = RefCell::new(Collected {
            progress,
            sources: self.sources,
            inputs: self.inputs,
        });
        let mut observer = observer::StorageObserver::new(state, updates, generation);
        let mut activation_error = None;
        let outcome = self.session.build_stream(
            candidate.as_ref(),
            || {
                let producer = Producer::new(self.jobs, state, updates, generation, &collected)?;
                Ok(rejected
                    .into_iter()
                    .map(|uri| Ok(CatalogInput::Rejected(uri)))
                    .chain(producer))
            },
            || {
                if self.hash_first {
                    Ok(candidate.clone())
                } else {
                    Ok(collected
                        .borrow_mut()
                        .inputs
                        .take()
                        .and_then(CompleteScanInputs::finish))
                }
            },
            |storage| {
                let Collected {
                    progress, sources, ..
                } = &mut *collected.borrow_mut();
                if storage.stage == CatalogStage::Reusing {
                    // indexed counts verified reusable facts here, not parser invocations.
                    progress.indexed = verified_count;
                    match observer::begin_activation(state, updates, generation, progress) {
                        Ok(true) => {}
                        Ok(false) => return false,
                        Err(error) => {
                            activation_error = Some(error.1);
                            return false;
                        }
                    }
                }
                observer.observe(storage, progress, sources)
            },
        );
        let outcome = if let Some(message) = activation_error {
            Err(StoreError::new(StoreErrorKind::Internal, message))
        } else {
            outcome
        };
        observer.finish(outcome, collected.into_inner().progress)
    }
}
