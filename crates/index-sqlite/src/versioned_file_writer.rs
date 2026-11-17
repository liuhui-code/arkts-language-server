//! Parsed inputs are prepared outside short write transactions.
use super::write_observation::{FileWriteWork, WriteObservation};
use super::write_size::FileWriteSize;
use super::{FileVersionReceipt, VersionedFacts, invalid, write};
use crate::{map_sqlite_error, validate_replacement};
use arkts_index_core::{DocumentSymbols, StoreError, StoreErrorKind};
use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};
use std::collections::BTreeSet;

pub struct FileVersionWrite<'a> {
    pub id: &'a str,
    pub sha: &'a str,
    pub document: &'a DocumentSymbols,
}
struct Prepared<'a> {
    id: &'a str,
    sha: String,
    document: &'a DocumentSymbols,
    expected: [usize; 8],
}
impl VersionedFacts {
    pub fn last_file_write_work(&self) -> Option<&FileWriteWork> {
        self.last_write_work.as_ref()
    }
    pub fn write_version(
        &mut self,
        id: &str,
        sha: &str,
        document: &DocumentSymbols,
    ) -> Result<FileVersionReceipt, StoreError> {
        self.write_versions(&[FileVersionWrite { id, sha, document }], || true)
            .map(|mut r| r.remove(0))
    }
    /// current must be a bounded in-memory admission check, never SQL/filesystem
    /// work. Successful sealed drafts are not a published/current-source proof.
    pub fn write_versions(
        &mut self,
        inputs: &[FileVersionWrite<'_>],
        mut current: impl FnMut() -> bool,
    ) -> Result<Vec<FileVersionReceipt>, StoreError> {
        self.last_write_work = None;
        if !self.log.connection.is_autocommit() {
            return Err(StoreError::new(
                StoreErrorKind::Busy,
                "file writer requires its own transaction",
            ));
        }
        let observer = WriteObservation::new(&self.log.connection)?;
        let result = write_inputs(
            &self.log.connection,
            &self.log.owner.id,
            inputs,
            &mut current,
        );
        self.last_write_work = Some(observer.snapshot());
        result
    }
}
fn check(current: &mut dyn FnMut() -> bool) -> Result<(), StoreError> {
    if current() {
        Ok(())
    } else {
        Err(StoreError::new(
            StoreErrorKind::Cancelled,
            "file facts write cancelled",
        ))
    }
}
fn write_inputs(
    c: &Connection,
    owner: &str,
    inputs: &[FileVersionWrite<'_>],
    current: &mut dyn FnMut() -> bool,
) -> Result<Vec<FileVersionReceipt>, StoreError> {
    let domain: String = c
        .query_row("SELECT domain FROM manifest_identity WHERE id=1", [], |r| {
            r.get(0)
        })
        .map_err(map_sqlite_error)?;
    let mut receipts = Vec::new();
    let mut start = 0;
    while start < inputs.len() {
        check(current)?;
        let mut end = start;
        let mut size = FileWriteSize::default();
        let mut prepared = Vec::new();
        while end < inputs.len() {
            let next = FileWriteSize::for_input(&inputs[end], &domain);
            if end > start && !size.combine(next).fits() {
                break;
            }
            check(current)?;
            prepared.push(prepare(&inputs[end])?);
            size = size.combine(next);
            end += 1;
            if !size.fits() || size.at_limit() {
                break;
            }
        }
        if !size.fits() {
            receipts.push(write_one(c, owner, &domain, &prepared[0], current)?);
        } else {
            let tx = Transaction::new_unchecked(c, TransactionBehavior::Immediate)
                .map_err(map_sqlite_error)?;
            let mut committed = Vec::new();
            for file in &prepared {
                check(current)?;
                committed.push(write_one(&tx, owner, &domain, file, current)?);
            }
            check(current)?;
            tx.commit().map_err(map_sqlite_error)?;
            receipts.extend(committed);
        }
        start = end;
    }
    Ok(receipts)
}
fn prepare<'a>(input: &FileVersionWrite<'a>) -> Result<Prepared<'a>, StoreError> {
    let doc = input.document;
    if input.id.is_empty()
        || input.sha.len() != 64
        || !input.sha.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err(invalid("invalid file version key"));
    }
    validate_replacement(doc)?;
    if doc.symbols.iter().any(|s| s.uri != doc.uri)
        || doc.exports.iter().any(|s| s.uri != doc.uri)
        || doc.occurrences.iter().any(|s| s.uri != doc.uri)
        || doc.aliases.iter().any(|s| s.uri != doc.uri)
        || doc.bindings.iter().any(|s| s.uri != doc.uri)
    {
        return Err(invalid("foreign file facts"));
    }
    let identities: BTreeSet<_> = doc
        .occurrences
        .iter()
        .map(|o| (&o.name, o.qualified, o.qualifier.as_deref().unwrap_or("")))
        .collect();
    Ok(Prepared {
        id: input.id,
        sha: input.sha.to_ascii_lowercase(),
        document: doc,
        expected: [
            doc.symbols.len(),
            doc.exports.len(),
            doc.occurrences.len(),
            identities.len(),
            doc.aliases.len(),
            doc.bindings.len(),
            doc.class_heritage.as_ref().map_or(0, |h| h.classes.len()),
            doc.class_binding_provenance
                .as_ref()
                .map_or(0, |p| p.direct_exports.len()),
        ],
    })
}
fn write_one(
    c: &Connection,
    owner: &str,
    domain: &str,
    file: &Prepared<'_>,
    current: &mut dyn FnMut() -> bool,
) -> Result<FileVersionReceipt, StoreError> {
    check(current)?;
    let reused = if c.is_autocommit() {
        let tx = Transaction::new_unchecked(c, TransactionBehavior::Immediate)
            .map_err(map_sqlite_error)?;
        let reused = begin_file(&tx, owner, domain, file)?;
        check(current)?;
        tx.commit().map_err(map_sqlite_error)?;
        reused
    } else {
        begin_file(c, owner, domain, file)?
    };
    if let Some(receipt) = reused {
        return Ok(receipt);
    }
    write::write(c, file.id, file.document, current)?;
    check(current)?;
    if c.is_autocommit() {
        let tx = Transaction::new_unchecked(c, TransactionBehavior::Immediate)
            .map_err(map_sqlite_error)?;
        seal(&tx, file)?;
        check(current)?;
        tx.commit().map_err(map_sqlite_error)?;
    } else {
        seal(c, file)?;
    }
    Ok(FileVersionReceipt {
        version: file.id.into(),
        reused: false,
        rows: file.expected.iter().sum(),
    })
}
fn begin_file(
    c: &Connection,
    owner: &str,
    domain: &str,
    file: &Prepared<'_>,
) -> Result<Option<FileVersionReceipt>, StoreError> {
    let id = file.id;
    let sha = &file.sha;
    let doc = file.document;
    let existing: Option<(String, String, String, String)> = c
        .query_row(
            "SELECT uri,source_sha,domain,state FROM file_versions WHERE id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()
        .map_err(map_sqlite_error)?;
    if let Some((uri, digest, previous_domain, state)) = existing {
        if uri != doc.uri || digest != *sha || previous_domain != domain {
            return Err(invalid("file version identity collision"));
        }
        if state != "sealed" {
            return Err(invalid("file version is still staging"));
        }
    }
    if let Some(receipt) = reuse_in_tx(c, owner, &doc.uri, sha, domain)? {
        return Ok(Some(receipt));
    }
    c.execute("INSERT INTO file_versions(id,uri,source_sha,domain,state,heritage_complete,source_supported,creator) VALUES(?1,?2,?3,?4,'staging',?5,?6,?7)",params![id,doc.uri,sha,domain,doc.class_heritage.as_ref().map(|h|h.lexically_complete),doc.class_binding_provenance.as_ref().map(|p|p.source_supported),owner]).map_err(map_sqlite_error)?;
    c.execute("INSERT INTO version_pins VALUES(?1,?2)", params![owner, id])
        .map_err(map_sqlite_error)?;
    Ok(None)
}
fn seal(c: &Connection, file: &Prepared<'_>) -> Result<(), StoreError> {
    if write::counts(c, file.id)? != file.expected {
        return Err(invalid("incomplete file facts"));
    }
    let rows: usize = file.expected.iter().sum();
    c.execute(
        "UPDATE file_versions SET state='sealed',row_count=?1 WHERE id=?2 AND state='staging'",
        params![rows as i64, file.id],
    )
    .map_err(map_sqlite_error)?;
    Ok(())
}
pub(super) fn reuse(
    c: &Connection,
    owner: &str,
    uri: &str,
    sha: &str,
    domain: &str,
) -> Result<Option<FileVersionReceipt>, StoreError> {
    let tx =
        Transaction::new_unchecked(c, TransactionBehavior::Immediate).map_err(map_sqlite_error)?;
    let result = reuse_in_tx(&tx, owner, uri, sha, domain)?;
    tx.commit().map_err(map_sqlite_error)?;
    Ok(result)
}
fn reuse_in_tx(
    c: &Connection,
    owner: &str,
    uri: &str,
    sha: &str,
    domain: &str,
) -> Result<Option<FileVersionReceipt>, StoreError> {
    // The first SQL is a write: acquisition and the version's existence are
    // ordered with GC in the same transaction, without a read-upgrade race.
    c.execute("INSERT OR IGNORE INTO version_pins SELECT ?1,id FROM file_versions WHERE uri=?2 AND source_sha=?3 AND domain=?4 AND state='sealed'",params![owner,uri,sha,domain]).map_err(map_sqlite_error)?;
    let receipt=c.query_row("SELECT id,row_count FROM file_versions WHERE uri=?1 AND source_sha=?2 AND domain=?3 AND state='sealed'",params![uri,sha,domain],|r|Ok(FileVersionReceipt{version:r.get(0)?,rows:usize::try_from(r.get::<_,i64>(1)?).map_err(|_|rusqlite::Error::IntegralValueOutOfRange(1,i64::MAX))?,reused:true})).optional().map_err(map_sqlite_error)?;
    Ok(receipt)
}
