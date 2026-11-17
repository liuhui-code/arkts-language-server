use super::super::manifest_log::{ManifestLog, ManifestValue};
use super::read::{get, range, rows};
use crate::map_sqlite_error;
use arkts_index_core::*;
use rusqlite::Connection;
fn active(log: &ManifestLog, uri: &str) -> Result<Option<String>, StoreError> {
    Ok(log.lookup(uri)?.and_then(|o| match o.entry.value {
        ManifestValue::Accepted(id) => Some(id),
        _ => None,
    }))
}
fn header(c: &Connection, id: &str) -> Result<(Option<bool>, Option<bool>), StoreError> {
    c.query_row("SELECT heritage_complete,source_supported FROM file_versions WHERE id=?1 AND state='sealed'",[id],|r|Ok((r.get(0)?,r.get(1)?))).map_err(map_sqlite_error)
}
pub(super) fn heritage(
    c: &Connection,
    id: &str,
    uri: &str,
    complete: Option<bool>,
) -> Result<Option<DocumentClassHeritage>, StoreError> {
    complete.map(|lexically_complete|{
        let classes=rows(c,"SELECT name,nsl,nsc,nel,nec,dsl,dsc,del,dec,base,bsl,bsc,bel,bec FROM v_heritage WHERE version=?1 ORDER BY ordinal",id,|r|{
            let base=match get::<Option<String>>(r,9)?{Some(name)=>Some(ClassHeritageBase{name,range:range(r,10)?}),None=>None};
            Ok(ClassHeritageDeclaration{name:get(r,0)?,name_range:range(r,1)?,declaration_range:range(r,5)?,base})
        })?;
        let result=DocumentClassHeritage{uri:uri.into(),classes,lexically_complete};result.validate_document(uri)?;Ok(result)
    }).transpose()
}
pub(super) fn class_heritage(
    log: &ManifestLog,
    uri: &str,
) -> Result<ClassHeritageSearchResult, StoreError> {
    let tx = super::snapshot::Snapshot::begin(&log.connection).map_err(map_sqlite_error)?;
    let head: i64 = tx
        .query_row("SELECT head FROM manifest_identity WHERE id=1", [], |r| {
            r.get(0)
        })
        .map_err(map_sqlite_error)?;
    let facts = match active(log, uri)? {
        Some(id) => heritage(&tx, &id, uri, header(&tx, &id)?.0)?,
        None => None,
    };
    tx.commit().map_err(map_sqlite_error)?;
    Ok(ClassHeritageSearchResult {
        facts,
        served_generation: crate::to_u64(head, "manifest head")?,
    })
}
pub(super) fn snapshot(
    log: &ManifestLog,
    uris: &[String],
) -> Result<ClassBindingSnapshot, StoreError> {
    validate_class_binding_snapshot_uris(uris)?;
    let tx = super::snapshot::Snapshot::begin(&log.connection).map_err(map_sqlite_error)?;
    let head: i64 = tx
        .query_row("SELECT head FROM manifest_identity WHERE id=1", [], |r| {
            r.get(0)
        })
        .map_err(map_sqlite_error)?;
    let mut documents = Vec::new();
    for uri in uris {
        let Some(id) = active(log, uri)? else {
            documents.push(ClassBindingDocument {
                uri: uri.clone(),
                heritage: None,
                binding_provenance: None,
                bindings: vec![],
            });
            continue;
        };
        let (complete, supported) = header(&tx, &id)?;
        let heritage = heritage(&tx, &id, uri, complete)?;
        let binding_provenance = supported
            .map(|source_supported| {
                let direct_exports = rows(
                    &tx,
                    "SELECT sl,sc,el,ec FROM v_direct_exports WHERE version=?1 ORDER BY ordinal",
                    &id,
                    |r| range(r, 0),
                )?;
                let provenance = ClassBindingProvenance {
                    source_supported,
                    direct_exports,
                };
                provenance.validate_document(heritage.as_ref())?;
                Ok::<_, StoreError>(provenance)
            })
            .transpose()?;
        let bindings = if supported == Some(true) {
            rows(
                &tx,
                "SELECT imported,local,specifier,kind FROM v_bindings WHERE version=?1 ORDER BY ordinal",
                &id,
                |r| {
                    Ok(ReferenceBinding {
                        uri: uri.clone(),
                        imported_name: get(r, 0)?,
                        local_name: get(r, 1)?,
                        source_specifier: get(r, 2)?,
                        kind: crate::reference_binding_kind_from_i64(get(r, 3)?)?,
                        source_resolution: ReferenceBindingResolution::Unresolved,
                        resolved_source_uri: None,
                        external_terminal_identity: None,
                    })
                },
            )?
        } else {
            vec![]
        };
        documents.push(ClassBindingDocument {
            uri: uri.clone(),
            heritage,
            binding_provenance,
            bindings,
        });
    }
    tx.commit().map_err(map_sqlite_error)?;
    Ok(ClassBindingSnapshot {
        documents,
        served_generation: crate::to_u64(head, "manifest head")?,
    })
}
