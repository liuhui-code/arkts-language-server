//! Background execution, completion observation and actual resource handoff.
use super::*;
use std::{sync::mpsc, thread};
impl Maintenance {
    pub(super) fn launch(
        &mut self,
        start: Start,
        file: Option<crate::maintenance_pending::FileJob>,
    ) -> Result<(), ProtocolError> {
        let uri = file.as_ref().map(|f| f.uri.clone());
        let kind = file.as_ref().map(|f| f.kind.label());
        self.serial += 1;
        let key = format!("{}-{}", self.nonce, self.serial);
        let state = Arc::new(AtomicU8::new(0));
        let worker_state = Arc::clone(&state);
        let (done, result) = mpsc::sync_channel(1);
        let (tx, progress) = mpsc::channel();
        let root = self.root.clone();
        let namespace = self.namespace.clone();
        let peers = self.source_scope.peers();
        let base = self.base.clone();
        let identity = self.identity.clone();
        let domain = self.domain.clone();
        let migration_from = self.migration_from.clone();
        let task = start.clone();
        let task_file = file;
        let mut parsers = self.parsers.take().unwrap_or_default();
        let mut draft = self.draft.take();
        let reuse_slot = Arc::clone(&self.reuse);
        let collection_barrier = self.collection.before_input();
        let collection_failed = self.collection.fatal_flag();
        let worker = thread::Builder::new()
            .name("arkts-file-maintenance".into())
            .spawn(move || {
                let mut reuse = None;
                let mut acquired_reuse = false;
                let work = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    if let Some(barrier) = collection_barrier {
                        barrier.wait(&worker_state)?;
                    }
                    reuse = reuse_slot.lock().unwrap().take();
                    acquired_reuse = true;
                    let work = crate::maintenance_engine::Work {
                        namespace,
                        peers,
                        root,
                        base,
                        identity,
                        domain,
                        migration_from,
                        start: task.clone(),
                        key,
                        state: Arc::clone(&worker_state),
                        updates: tx,
                        parsers: &mut parsers,
                        draft: &mut draft,
                        reuse: &mut reuse,
                    };
                    match task_file {
                        Some(file) => crate::maintenance_file_engine::run(work, file),
                        None => crate::maintenance_engine::run(work),
                    }
                }));
                let terminal = match work {
                    Ok(Ok(t)) => t,
                    Ok(Err(e)) => {
                        if matches!(
                            e.kind(),
                            arkts_index_core::StoreErrorKind::ProducerSuperseded
                                | arkts_index_core::StoreErrorKind::InvalidGeneration
                        ) {
                            // A permanently stale parent/domain cannot authorize reuse.
                            drop(draft.take());
                            drop(reuse.take());
                        }
                        if worker_state.load(Ordering::Acquire) == 4 {
                            Terminal::unknown(&task, &e.to_string())
                        } else {
                            let mut failure = Terminal::failed(
                                &task,
                                worker_state.load(Ordering::Acquire) == 1,
                                e.to_string(),
                            );
                            if matches!(
                                e.kind(),
                                arkts_index_core::StoreErrorKind::MigrationRequired
                                    | arkts_index_core::StoreErrorKind::ProducerSuperseded
                            ) && worker_state.load(Ordering::Acquire) != 1
                            {
                                failure.value["error"]["code"] =
                                    json!(crate::protocol_store_error(e).code);
                            }
                            failure
                        }
                    }
                    Err(_) => Terminal::unknown(
                        &task,
                        "maintenance worker panicked; inspect persisted dataset before retry",
                    ),
                };
                #[cfg(debug_assertions)]
                if std::env::var("ARKTS_INDEX_TEST_MAINTENANCE_PANIC").as_deref()
                    == Ok("outside-catch-once")
                    && !OUTSIDE_CATCH_FAULT.swap(true, Ordering::AcqRel)
                {
                    panic!("controlled worker exit before terminal send");
                }
                if acquired_reuse {
                    if collection_failed.load(Ordering::Acquire) {
                        drop(reuse.take());
                    }
                    *reuse_slot.lock().unwrap() = reuse;
                }
                let _ = done.send(Completion {
                    terminal,
                    parsers,
                    draft,
                });
            })
            .map_err(|e| ProtocolError::new("internal", e.to_string()))?;
        self.spawned += 1;
        if uri.is_none() {
            self.pending.latest = Some(start.input.clone());
            self.pending.needs_reconcile = true;
            self.last = Some(start.clone());
        }
        self.terminal = None;
        self.progress = CatalogProgress::default();
        self.active = Some(Active {
            uri,
            kind,
            start,
            state,
            worker,
            result,
            progress,
            ready: None,
        });
        Ok(())
    }
    pub fn poll(&mut self) -> Vec<Value> {
        let mut events = Vec::new();
        self.collection.poll(self.active.is_none());
        if self.active.is_none() {
            if let Some(job) = self.pending.take() {
                let task = Start {
                    attempt_id: format!("native-file-{}-{}", self.nonce, self.serial + 1),
                    input: job.input.clone(),
                    reason: "disk-change".into(),
                    force: false,
                };
                let uri = job.uri.clone();
                if let Err(error) = self.launch(task.clone(), Some(job)) {
                    let mut terminal = Terminal::failed(&task, false, error.message).value;
                    terminal["scope"] = json!("file");
                    terminal["uri"] = json!(uri);
                    self.terminal = Some(terminal.clone());
                    events.push(terminal);
                }
            }
            return events;
        }
        let active = self.active.as_mut().unwrap();
        while let Ok(update) = active.progress.try_recv() {
            match update {
                CatalogUpdate::Progress { progress, .. }
                | CatalogUpdate::Activating { progress, .. }
                | CatalogUpdate::Cancelled { progress, .. } => {
                    self.progress = progress;
                    events.push(json!({"event":"maintenance/progress","attemptId":active.start.attempt_id,"input":active.start.input.json(),"scope":if active.uri.is_some(){"file"}else{"workspace"},"uri":active.uri,"discovered":self.progress.discovered,"indexed":self.progress.indexed,"rejected":self.progress.rejected,"validation":self.progress.validation.map(|v|json!({"stage":format!("{:?}",v.stage),"vmSteps":v.vm_steps,"activitySequence":self.progress.activity_sequence,"stageElapsedMs":self.progress.stage_started.map_or(0,|s|s.elapsed().as_millis())}))}));
                }
                _ => (),
            }
        }
        if active.ready.is_none() {
            active.ready = active.result.try_recv().ok();
        }
        if active.worker.is_finished() {
            // Re-poll after observing thread completion: an earlier Empty can
            // race with the final send and must never overwrite its real result.
            if active.ready.is_none() {
                match active.result.try_recv() {
                    Ok(result) => active.ready = Some(result),
                    Err(mpsc::TryRecvError::Disconnected) => {
                        active.ready = Some(Completion {
                            terminal: Terminal::unknown(
                                &active.start,
                                "worker exited without a terminal result; inspect persisted dataset",
                            ),
                            // A lost worker drops and joins its owned pool before
                            // is_finished. Replacement is lazy, never overlapping.
                            parsers: crate::catalog::ParserPool::default(),
                            draft: None,
                        })
                    }
                    Err(mpsc::TryRecvError::Empty) => return events,
                }
            }
            let mut finished = self.active.take().unwrap();
            let joined = finished.worker.join();
            let completed = finished.ready.take().unwrap();
            self.parsers = Some(completed.parsers);
            self.draft = completed.draft;
            self.collection.dirty(&completed.terminal.value);
            let mut terminal = completed.terminal.value;
            if joined.is_err() {
                terminal["resourceError"] = json!("maintenance worker cleanup panicked");
            }
            if let Some(uri) = finished.uri {
                terminal["scope"] = json!("file");
                terminal["uri"] = json!(uri);
                terminal["changeKind"] = json!(finished.kind);
            }
            terminal["currentInput"] = json!(
                terminal["outcome"] == "qualified" && self.pending.qualified(&finished.start.input)
            );
            if terminal["currentInput"] == true {
                self.source_scope.qualified(&finished.start.input);
            }
            self.terminal = Some(terminal.clone());
            events.push(terminal);
        }
        events
    }
}
