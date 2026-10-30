use super::*;

impl Runtime {
    pub(super) fn handle_catalog_update(&mut self, update: CatalogUpdate) -> Option<Value> {
        match update {
            CatalogUpdate::Progress {
                generation,
                progress,
            } if self.is_active_catalog(generation) => {
                self.progress = progress;
            }
            CatalogUpdate::Activating {
                generation,
                progress,
            } if self.is_active_catalog(generation) => {
                self.progress = progress;
                if self.phase != "cancelling" {
                    self.phase = "activating";
                }
            }
            CatalogUpdate::Complete {
                generation,
                report,
                progress,
            } if self.is_active_catalog(generation) => {
                self.progress = progress;
                self.catalog = None;
                self.building_generation = None;
                self.committed_generation = report.committed_generation;
                self.rejected_count = report.rejected_documents.len();
                if self.progress.rejected > 0 {
                    self.phase = "degraded";
                    self.state = IndexState::Degraded;
                    self.completeness = "partial";
                } else if self.progress.policy_skipped > 0 {
                    self.phase = "partial";
                    self.state = IndexState::Ready;
                    self.completeness = "partial";
                } else {
                    self.phase = "ready";
                    self.state = IndexState::Ready;
                    self.completeness = "ready";
                }
            }
            CatalogUpdate::Cancelled {
                generation,
                progress,
            } if self.is_active_catalog(generation) => {
                self.progress = progress;
                self.phase = "cancelled";
                self.catalog = None;
                self.building_generation = None;
            }
            CatalogUpdate::Failed {
                generation,
                progress,
                message,
            } if self.is_active_catalog(generation) => {
                self.progress = progress;
                self.phase = "degraded";
                self.state = IndexState::Degraded;
                self.completeness = "stale";
                self.catalog = None;
                self.building_generation = None;
                self.message = Some(message);
            }
            _ => return None,
        }
        Some(self.catalog_progress_event())
    }

    fn is_active_catalog(&self, generation: u64) -> bool {
        self.catalog
            .as_ref()
            .is_some_and(|active| active.generation == generation)
    }

    pub(super) fn catalog_progress_event(&self) -> Value {
        json!({
            "protocol": PROTOCOL_VERSION,
            "event": "catalog/progress",
            "params": {
                "workspaceIdentity": self.workspace_identity,
                "status": self.status(),
            },
        })
    }

    pub(super) fn status(&self) -> Value {
        let mut status = json!({
            "state": state_name(self.state),
            "committedGeneration": self.committed_generation,
            "completeness": self.completeness,
            "rejectedCount": self.rejected_count,
            "phase": self.phase,
            "buildingGeneration": self.building_generation,
            "discovered": self.progress.discovered,
            "indexed": self.progress.indexed,
            "rejected": self.progress.rejected,
            "policySkipped": self.progress.policy_skipped,
            "ignored": self.progress.ignored,
        });
        if let Some(storage) = self.progress.storage {
            status["storage"] = json!({
                "stage": storage.stage.as_str(),
                "writtenDocuments": storage.written_documents,
                "writtenRows": storage.written_rows,
                "walFrames": storage.wal_frames,
                "checkpointedFrames": storage.checkpointed_frames,
                "activitySequence": self.progress.activity_sequence,
                "stageElapsedMs": self.progress.stage_started.map_or(0, |started| started.elapsed().as_millis()),
            });
        }
        if let Some(total_files) = self.progress.total_files {
            status["totalFiles"] = json!(total_files);
        }
        if let Some(message) = &self.message {
            status["message"] = json!(message);
        }
        status
    }
}
