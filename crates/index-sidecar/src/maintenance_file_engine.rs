//! One fair URI quantum. No full namespace qualification is issued here.
use crate::{
    catalog::{CatalogProgress, Collected, Job, Producer},
    maintenance::Terminal,
    maintenance_engine::{Work, check_producer, hex},
    maintenance_file_input::{FileInput, fail, inspect},
};
use arkts_index_sqlite::{CatalogInput, CatalogMaintenance, ManifestEntry, ManifestValue};
use serde_json::json;
use std::{cell::RefCell, sync::atomic::Ordering};
pub(crate) fn run(
    work: Work<'_>,
    job: crate::maintenance_pending::FileJob,
) -> Result<Terminal, arkts_index_core::StoreError> {
    let uri = job.uri;
    let kind = job.kind.label();
    let Work {
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
        draft: _,
        reuse,
    } = work;
    if crate::catalog::wait_maintenance_gate(&state) {
        return Err(fail("maintenance cancelled"));
    }
    crate::managed_cache_admission::validate(namespace.as_ref())?;
    let selection =
        arkts_index_sqlite::CatalogStore::open_for_maintenance(&base, &identity, &domain)?;
    check_producer(&selection, migration_from.as_deref())?;
    drop(selection);
    let input = inspect(&root, &identity, &uri, namespace.as_ref(), &peers)?;
    let mut target =
        CatalogMaintenance::begin(&base, &identity, &domain, std::slice::from_ref(&uri))?;
    let current = &target.inputs()[0];
    let mut written = 0;
    let mut rows = 0;
    let mut file_work = arkts_index_sqlite::FileWriteWork::default();
    let entry = match &input {
        FileInput::Absent => {
            if current
                .observation
                .as_ref()
                .is_some_and(|o| o.entry.value != ManifestValue::Removed)
            {
                Some(ManifestEntry::removed(&uri))
            } else {
                None
            }
        }
        FileInput::Present(stamp) if current.source_sha.as_deref() == Some(&hex(stamp)) => None,
        FileInput::Present(stamp) => {
            let sha = hex(stamp);
            if let Some(version) = target.find_version(&uri, &sha)? {
                Some(ManifestEntry::accepted(&uri, &version.version))
            } else {
                let path = crate::class_binding_discovery::admitted_path(&root, &identity, &uri)
                    .ok_or_else(|| fail("source path lost identity"))?;
                let collected = RefCell::new(Collected {
                    progress: CatalogProgress::default(),
                    sources: Vec::new(),
                    inputs: None,
                });
                let mut producer = Producer::retained(
                    vec![Job {
                        uri: uri.clone(),
                        path,
                        expected: Some(stamp.clone()),
                    }],
                    &state,
                    &updates,
                    start.input.revision,
                    &collected,
                    parsers,
                )?;
                let mut entry = None;
                let mut completed = false;
                for next in &mut producer {
                    match next? {
                        CatalogInput::Document(doc) => {
                            let result = target.write_versions(
                                &[arkts_index_sqlite::FileVersionWrite {
                                    id: &key,
                                    sha: &sha,
                                    document: &doc,
                                }],
                                || state.load(Ordering::Acquire) != 1,
                            );
                            if let Some(work) = target.last_file_write_work() {
                                file_work = work.clone();
                            }
                            let version = match result {
                                Ok(mut receipts) => receipts.remove(0),
                                Err(error) => {
                                    crate::maintenance_fact_batch::failed(
                                        &start.attempt_id,
                                        &error,
                                        target.last_file_write_work(),
                                    );
                                    return Err(error);
                                }
                            };
                            written += usize::from(!version.reused);
                            if !version.reused {
                                rows += version.rows;
                            }
                            entry = Some(ManifestEntry::accepted(&uri, &version.version));
                        }
                        CatalogInput::Rejected(_) => {
                            entry = Some(ManifestEntry::rejected(&uri, "source-parse-error"))
                        }
                        CatalogInput::Complete => {
                            completed = true;
                            break;
                        }
                    }
                }
                drop(producer); // All actual outcomes are collected before lease reuse/publication.
                if !completed {
                    return Err(fail("file parser stream incomplete"));
                }
                entry
            }
        }
    };
    // Producer EOF has already entered validation; a reused/no-op file has no
    // producer and enters it here. Never overwrite a concurrently accepted cancel.
    match state.compare_exchange(0, 2, Ordering::AcqRel, Ordering::Acquire) {
        Ok(_) | Err(2) => (),
        Err(_) => return Err(fail("maintenance cancelled")),
    }
    let source_fence = || {
        Ok(state.load(Ordering::Acquire) != 1
            && input.same(&inspect(
                &root,
                &identity,
                &uri,
                namespace.as_ref(),
                &peers,
            )?))
    };
    let admit = || {
        Ok(state
            .compare_exchange(2, 4, Ordering::AcqRel, Ordering::Acquire)
            .is_ok())
    };
    let published = entry.is_some();
    let head = if let Some(entry) = entry {
        target.retain_for_reuse(reuse, std::slice::from_ref(&entry), || {
            state.load(Ordering::Acquire) != 1
        })?;
        target.stage_changes(&key, &[entry])?;
        target.commit(&key, source_fence, admit)?
    } else {
        target.verify_noop(source_fence, admit)?
    };
    Ok(crate::maintenance_fact_batch::decorate(
        Terminal {
            value: json!({"event":"maintenance/terminal","attemptId":start.attempt_id,"input":start.input.json(),"phase":"completed","scope":"file","uri":uri,"changeKind":kind,"outcome":if published {"data-updated"} else {"unchanged"},"dataPublished":published,"writtenDocuments":written,"factRowsWritten":rows,"qualification":null,"snapshot":{"workspaceIdentity":identity,"storeId":target.store_id(),"factsDomain":domain,"head":head}}),
        },
        &file_work,
    ))
}
