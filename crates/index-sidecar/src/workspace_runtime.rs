use super::*;
impl Runtime {
    pub(super) fn initialize_workspace(
        &mut self,
        params: InitializeParams,
    ) -> Result<(Value, bool), ProtocolError> {
        if self.catalog.is_some()
            || self.maintenance.as_ref().is_some_and(|m| m.is_active())
            || self.readers.as_ref().is_some_and(|r| r.is_active())
        {
            return Err(ProtocolError::new(
                "busy",
                "initialize cannot replace a workspace while its catalog is active",
            ));
        }
        let workspace_root = fs::canonicalize(&params.workspace_root).map_err(|error| {
            ProtocolError::new(
                "io",
                format!("failed to canonicalize workspace root: {error}"),
            )
        })?;
        let cache = workspace_cache_location(&params.cache_directory, &workspace_root)
            .map_err(protocol_store_error)?;
        let domain = if params
            .capabilities
            .iter()
            .any(|c| c == maintenance::CAPABILITY)
        {
            Some(maintenance::domain()?)
        } else {
            None
        };
        let store = match &domain {
            Some(d) => CatalogStore::open_for_maintenance(
                &cache.database_path,
                &cache.workspace_identity,
                d,
            ),
            None => CatalogStore::open(&cache.database_path, &cache.workspace_identity),
        }
        .map_err(protocol_store_error)?;
        let managed_cache = store.managed_namespace().map_err(protocol_store_error)?;
        let migration_from = store
            .migration_source_domain()
            .map_err(protocol_store_error)?;
        let migration_required = migration_from.is_some();
        let metadata = store
            .metadata_for_maintenance()
            .map_err(protocol_store_error)?;
        let source_scope = crate::source_scope::SourceScope::default();
        let (readers, index) = if let Some(domain) = domain.as_ref() {
            (
                Some(reader::Readers::new(
                    reader_worker::Config {
                        namespace: managed_cache.clone(),
                        source_scope: source_scope.clone(),
                        root: workspace_root.clone(),
                        base: cache.database_path.clone(),
                        identity: cache.workspace_identity.clone(),
                        domain: domain.clone(),
                        migration_from: migration_from.clone(),
                    },
                    store,
                )?),
                None,
            )
        } else {
            (None, Some(WorkspaceIndex::with_store(store)))
        };
        let maintenance = domain.map(|domain| {
            maintenance::Maintenance::new(
                workspace_root.clone(),
                cache.database_path.clone(),
                cache.workspace_identity.clone(),
                domain,
                migration_from,
                managed_cache.clone(),
                source_scope,
            )
        });
        self.managed_cache = managed_cache;
        self.maintenance = maintenance;
        self.readers = readers;
        self.committed_generation = metadata.committed_generation;
        self.state = IndexState::Warming;
        self.completeness = "stale";
        self.rejected_count = metadata.rejected_documents.len();
        self.workspace_root = Some(workspace_root);
        self.database_path = Some(cache.database_path);
        self.workspace_identity = Some(cache.workspace_identity.clone());
        self.phase = "idle";
        self.building_generation = None;
        self.next_catalog_generation = self.committed_generation.saturating_add(1);
        self.progress = CatalogProgress::default();
        self.message =
            migration_required.then(|| "index facts need a producer migration".to_owned());
        self.index = index;
        let mut result =
            json!({"workspaceIdentity":cache.workspace_identity,"status":self.status()});
        if let Some(proof) = &self.managed_cache {
            proof
                .validate()
                .map_err(|message| ProtocolError::new("cache_namespace_changed", message))?;
            result["managedCache"] = json!(proof);
        }
        if let Some(maintenance) = &self.maintenance {
            result["capabilities"] =
                json!([maintenance::CAPABILITY, crate::source_scope::CAPABILITY]);
            result["factsDomain"] = json!(maintenance.domain);
            result["migrationRequired"] = json!(migration_required);
            result["readerEpoch"] = json!(self.readers.as_ref().unwrap().epoch);
        }
        Ok((result, false))
    }
}
