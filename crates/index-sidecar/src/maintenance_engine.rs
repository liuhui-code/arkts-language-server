//! Reconciliation uses the same admission walker and four escrow parser slots.
use crate::{
    catalog::{
        self, CatalogProgress, CatalogUpdate, Collected, Job, Producer, ScanIssue, WalkVisitor,
    },
    maintenance::{Start, Terminal},
};
use arkts_index_core::{StoreError, StoreErrorKind, SymbolStore};
#[path = "maintenance_validation.rs"]
mod validation;
use arkts_index_sqlite::{
    CatalogInput, CatalogMaintenance, CatalogStore, CompleteScanInputs, InputRevision,
    ManifestEntry,
};
use std::{
    cell::RefCell,
    collections::{BTreeMap, BTreeSet},
    fmt::Write as _,
    fs,
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicU8, Ordering},
        mpsc::Sender,
    },
};
use validation::attach;
#[derive(Default)]
struct Discovery {
    jobs: Vec<Job>,
    rejected: Vec<String>,
    uncertain: bool,
}
impl WalkVisitor for Discovery {
    fn invalidate(&mut self, _: ScanIssue) {
        self.uncertain = true;
    }
    fn reject(&mut self, uri: String) {
        self.rejected.push(uri);
    }
    fn source(
        &mut self,
        uri: String,
        path: PathBuf,
        _: fs::Metadata,
        _: &mut CatalogProgress,
    ) -> Result<(), StoreError> {
        self.jobs.push(Job {
            uri,
            path,
            expected: None,
        });
        Ok(())
    }
}
fn fail(message: impl Into<String>) -> StoreError {
    StoreError::new(StoreErrorKind::InvalidData, message)
}
pub(crate) fn hex(stamp: &catalog::SourceStamp) -> String {
    let mut s = String::with_capacity(64);
    for b in stamp.digest() {
        write!(&mut s, "{b:02x}").unwrap();
    }
    s
}
#[path = "maintenance_source_fence.rs"]
mod source_fence;
use source_fence::fence;
#[path = "maintenance_target.rs"]
mod target;
pub(super) use target::{Draft, Reuse, SharedReuse, Target};
#[path = "maintenance_retry_inputs.rs"]
mod retry_inputs;
pub(super) fn check_producer(
    store: &CatalogStore,
    previous: Option<&str>,
) -> Result<(), StoreError> {
    if let Some(actual) = store.migration_source_domain()?
        && previous != Some(actual.as_str())
    {
        return Err(StoreError::new(
            StoreErrorKind::ProducerSuperseded,
            "another producer took over this catalog; no reverse migration is authorized",
        ));
    }
    Ok(())
}
pub(super) struct Work<'a> {
    pub peers: Vec<arkts_index_sqlite::cache_gc::namespace::ManagedCacheNamespace>,
    pub namespace: Option<arkts_index_sqlite::cache_gc::namespace::ManagedCacheNamespace>,
    pub root: PathBuf,
    pub base: PathBuf,
    pub identity: String,
    pub domain: String,
    pub migration_from: Option<String>,
    pub start: Start,
    pub key: String,
    pub state: Arc<AtomicU8>,
    pub updates: Sender<CatalogUpdate>,
    pub parsers: &'a mut catalog::ParserPool,
    pub draft: &'a mut Draft,
    pub reuse: &'a mut Reuse,
}
pub(super) fn run(
    Work {
        namespace,
        peers,
        root,
        base,
        identity,
        domain,
        migration_from,
        start,
        key,
        state,
        updates,
        parsers,
        draft,
        reuse,
    }: Work<'_>,
) -> Result<Terminal, StoreError> {
    if catalog::wait_maintenance_gate(&state) {
        return Err(fail("maintenance cancelled"));
    }
    crate::managed_cache_admission::validate(namespace.as_ref())?;
    let selection = CatalogStore::open_for_maintenance(&base, &identity, &domain)?;
    check_producer(&selection, migration_from.as_deref())?;
    drop(selection);
    let mut visitor = Discovery::default();
    let source_view = crate::source_scope::SourceView {
        root: &root,
        owner: namespace.as_ref(),
        peers: &peers,
    };
    let progress = catalog::walk(
        source_view,
        start.input.revision,
        &state,
        &updates,
        CatalogProgress::default(),
        &mut visitor,
    )
    .map_err(|e| fail(e.1))?
    .ok_or_else(|| fail("maintenance cancelled"))?;
    if visitor.uncertain
        || !visitor.rejected.is_empty()
        || progress.rejected > 0
        || progress.policy_skipped > 0
    {
        return Err(fail(
            "reconciliation incomplete; no complete qualification can be issued",
        ));
    }
    visitor.jobs.sort_by(|a, b| a.uri.cmp(&b.uri));
    let inventory = if start.force {
        None
    } else {
        CatalogStore::open_for_maintenance(&base, &identity, &domain)?.file_inventory()?
    };
    let expected: Vec<_> = visitor.jobs.iter().map(|j| j.uri.clone()).collect();
    let mut scope: BTreeSet<_> = expected.iter().cloned().collect();
    if let Some(inventory) = &inventory {
        scope.extend(inventory.entries.iter().map(|e| e.uri.clone()));
    }
    let mut target = if inventory.is_some() {
        drop(draft.take());
        Target::Delta(
            Box::new(CatalogMaintenance::begin(
                &base,
                &identity,
                &domain,
                &scope.into_iter().collect::<Vec<_>>(),
            )?),
            reuse,
        )
    } else {
        drop(reuse.take());
        Target::bootstrap(
            draft,
            &base,
            &identity,
            &domain,
            migration_from.as_deref(),
            start.force,
        )?
    };
    let mut fingerprint = CompleteScanInputs::new()?;
    let mut sources = Vec::new();
    let mut stamps = BTreeMap::new();
    let mut entries = Vec::new();
    let mut reused = 0;
    if let Target::Delta(delta, _) = &mut target {
        let current: BTreeMap<_, _> = delta
            .inputs()
            .iter()
            .map(|i| (i.uri.clone(), i.clone()))
            .collect();
        let mut changed = Vec::new();
        for mut job in visitor.jobs {
            if state.load(Ordering::Acquire) == 1 {
                return Err(fail("maintenance cancelled"));
            }
            let metadata = fs::metadata(&job.path).map_err(|e| fail(e.to_string()))?;
            let text = match catalog::read_maintenance_source(&job.path) {
                Ok(catalog::MaintenanceSourceRead::Text(t)) => t,
                _ => {
                    return Err(fail(
                        "source unreadable or outside admission during hash scan",
                    ));
                }
            };
            let stamp = catalog::SourceStamp::capture(&job.path, &metadata, &text);
            let sha = hex(&stamp);
            fingerprint.record_digest(&job.uri, stamp.digest());
            sources.push(stamp.clone());
            if current
                .get(&job.uri)
                .is_some_and(|i| i.source_sha.as_deref() == Some(&sha))
            {
                reused += 1;
                continue;
            }
            if let Some(version) = delta.find_version(&job.uri, &sha)? {
                entries.push(ManifestEntry::accepted(&job.uri, &version.version));
                reused += 1;
            } else {
                stamps.insert(job.uri.clone(), stamp.clone());
                job.expected = Some(stamp);
                changed.push(job);
            }
        }
        if let Some(inventory) = inventory {
            for entry in inventory.entries {
                if expected.binary_search(&entry.uri).is_err() {
                    entries.push(ManifestEntry::removed(&entry.uri));
                }
            }
        }
        visitor.jobs = changed;
    }
    let retried = matches!(&target, Target::Bootstrap(b) if b.reused);
    if let Target::Bootstrap(b) = &mut target
        && b.reused
    {
        let prepared = retry_inputs::prepare(std::mem::take(&mut visitor.jobs), b, &state)?;
        eprintln!(
            "{}",
            serde_json::json!({"event":"maintenance.draftReclaimed",
            "attemptId":start.attempt_id,"input":{"issuer":start.input.issuer,"revision":start.input.revision},
            "quanta":prepared.reclamation.quanta,"pinsReleased":prepared.reclamation.pins_released,
            "groupsAbandoned":prepared.reclamation.groups_abandoned,
            "factsDeleted":prepared.reclamation.facts_deleted,"versionsDeleted":prepared.reclamation.versions_deleted})
        );
        visitor.jobs = prepared.jobs;
        fingerprint = prepared.fingerprint;
        sources = prepared.sources;
        stamps = prepared.stamps;
        entries = prepared.entries;
        reused = prepared.reused;
    }
    let cold = matches!(target, Target::Bootstrap(_));
    let streaming_cold = cold && !retried;
    let (parser_inputs, delta_proof) = if streaming_cold {
        (Some(fingerprint), None)
    } else {
        (None, fingerprint.finish())
    };
    let collected = RefCell::new(Collected {
        progress,
        sources: Vec::new(),
        inputs: parser_inputs,
    });
    let mut producer = Producer::retained(
        visitor.jobs,
        &state,
        &updates,
        start.input.revision,
        &collected,
        parsers,
    )?;
    let mut batch = crate::maintenance_fact_batch::FactBatch::new(&start.attempt_id);
    let mut serial = 0;
    let mut staged = false;
    let mut complete = false;
    for event in &mut producer {
        match event? {
            CatalogInput::Document(doc) => {
                #[cfg(debug_assertions)]
                consumer_test_gate();
                let stamp = if streaming_cold {
                    collected.borrow().sources.last().cloned()
                } else {
                    stamps.remove(&doc.uri)
                }
                .ok_or_else(|| fail("parser source witness missing"))?;
                let id = format!("{key}:{serial}");
                serial += 1;
                entries.extend(batch.push(
                    crate::maintenance_fact_batch::ParsedVersion {
                        id,
                        sha: hex(&stamp),
                        document: doc,
                    },
                    &domain,
                    &mut target,
                    &state,
                )?);
            }
            CatalogInput::Rejected(uri) => {
                return Err(fail(format!(
                    "parsed input rejected for {uri}; complete bootstrap is unavailable"
                )));
            }
            CatalogInput::Complete => {
                complete = true;
                break;
            }
        }
        if entries.len() >= 64 {
            target.stage(&key, &entries, &state)?;
            staged = true;
            entries.clear();
        }
        if serial % 64 == 0 {
            let _ = updates.send(CatalogUpdate::Progress {
                generation: start.input.revision,
                progress: collected.borrow().progress.clone(),
            });
        }
    }
    drop(producer);
    if !complete {
        return Err(fail("parser stream ended without completion"));
    }
    entries.extend(batch.flush(&mut target, &state)?);
    let had_entries = staged || !entries.is_empty();
    for chunk in entries.chunks(64) {
        target.stage(&key, chunk, &state)?;
    }
    let mut collected = collected.into_inner();
    let proof = if streaming_cold {
        sources = std::mem::take(&mut collected.sources);
        collected.inputs.take().and_then(CompleteScanInputs::finish)
    } else {
        delta_proof
    };
    let proof = proof.ok_or_else(|| fail("complete scan proof missing"))?;
    let input = InputRevision::new(&start.input.issuer, start.input.revision)?;
    let admit = || {
        Ok(state
            .compare_exchange(2, 4, Ordering::AcqRel, Ordering::Acquire)
            .is_ok())
    };
    let mut cleanup = None;
    let receipt = match target {
        Target::Bootstrap(mut b) => {
            if had_entries {
                let head = b.facts_mut().metadata()?.committed_generation;
                b.facts_mut().publish_group(&key, head)?;
            }
            let revision = start.input.revision;
            attach(&mut b, &collected.progress, &state, &updates, revision);
            b.activate(
                &key,
                &input,
                &proof,
                || {
                    fence(
                        source_view,
                        &expected,
                        &sources,
                        &state,
                        &updates,
                        start.input.revision,
                    )
                },
                admit,
            )?
        }
        Target::Delta(mut d, cache) => {
            if cache.as_ref().is_some_and(|c| c.store_id() != d.store_id()) {
                drop(cache.take());
            }
            let published_head = if had_entries {
                let head = d.commit(
                    &key,
                    || {
                        fence(
                            source_view,
                            &expected,
                            &sources,
                            &state,
                            &updates,
                            start.input.revision,
                        )
                    },
                    admit,
                )?;
                #[cfg(debug_assertions)]
                if std::env::var("ARKTS_INDEX_TEST_MAINTENANCE_PANIC").as_deref()
                    == Ok("after-data-commit")
                {
                    panic!("controlled maintenance fault after data commit");
                }
                state.store(2, Ordering::Release);
                Some(head)
            } else {
                None
            };
            match d.qualify(
                &key,
                &input,
                &proof,
                || {
                    fence(
                        source_view,
                        &expected,
                        &sources,
                        &state,
                        &updates,
                        start.input.revision,
                    )
                },
                admit,
            ) {
                Ok(receipt) => {
                    cleanup = cache
                        .as_mut()
                        .and_then(|c| c.reconcile(&receipt, || true).err())
                        .map(|e| e.to_string());
                    receipt
                }
                Err(error) if published_head.is_some() => {
                    return Ok(crate::maintenance_fact_batch::decorate(
                        Terminal::published_pending(
                            start,
                            batch.written,
                            batch.rows,
                            reused + batch.reused,
                            published_head.unwrap(),
                            error.to_string(),
                        ),
                        &batch.work,
                    ));
                }
                Err(error) => return Err(error),
            }
        }
    };
    let mut result = crate::maintenance_fact_batch::decorate(
        Terminal::qualified(
            start,
            batch.written,
            batch.rows,
            reused + batch.reused,
            cold || had_entries,
            expected.len(),
            receipt,
        ),
        &batch.work,
    );
    if let Some(error) = cleanup {
        result.value["reuseCleanupError"] = serde_json::json!(error);
    }
    Ok(result)
}

#[cfg(debug_assertions)]
fn consumer_test_gate() {
    use std::sync::atomic::AtomicBool;
    static ENTERED: AtomicBool = AtomicBool::new(false);
    if std::env::var("ARKTS_INDEX_TEST_MAINTENANCE_PANIC").as_deref()
        == Ok("with-parser-lease-once")
        && !ENTERED.swap(true, Ordering::AcqRel)
    {
        panic!("controlled consumer unwind while the parser lease owns slots");
    }
}
