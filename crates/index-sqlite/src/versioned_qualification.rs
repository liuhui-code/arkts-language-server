//! Data-snapshot qualification, not a substitute for the caller's final source fence.
use super::{VersionedFacts, invalid};
use crate::{CompleteScanFingerprint, CompleteScanInputs, map_sqlite_error};
use arkts_index_core::StoreError;
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InputRevision {
    issuer: String,
    revision: i64,
}
impl InputRevision {
    pub fn new(issuer: &str, revision: u64) -> Result<Self, StoreError> {
        if issuer.is_empty() {
            return Err(invalid("empty input issuer"));
        }
        Ok(Self {
            issuer: issuer.into(),
            revision: i64::try_from(revision).map_err(|_| invalid("input revision overflow"))?,
        })
    }
    pub fn issuer(&self) -> &str {
        &self.issuer
    }
    pub fn revision(&self) -> u64 {
        self.revision as u64
    }
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct QualificationReceipt {
    pub id: String,
    pub workspace: String,
    pub store: String,
    pub domain: String,
    pub head: u64,
    pub input: InputRevision,
    pub fingerprint: String,
}
pub(super) fn initialize(c: &Connection) -> Result<(), StoreError> {
    c.execute_batch("CREATE TABLE qualifications(id TEXT UNIQUE NOT NULL CHECK(length(id)>0),issuer TEXT NOT NULL CHECK(length(issuer)>0),revision INTEGER NOT NULL CHECK(revision>=0),head INTEGER NOT NULL CHECK(head>=0),fingerprint TEXT NOT NULL,PRIMARY KEY(issuer,revision));").map_err(map_sqlite_error)
}
pub(super) fn lookup(
    c: &Connection,
    input: &InputRevision,
) -> Result<Option<QualificationReceipt>, StoreError> {
    c.query_row("SELECT q.id,i.workspace,i.store,i.domain,q.head,q.fingerprint FROM qualifications q JOIN manifest_identity i ON i.id=1 AND i.head=q.head WHERE q.issuer=?1 AND q.revision=?2", params![input.issuer,input.revision], |r| Ok(QualificationReceipt { id:r.get(0)?,workspace:r.get(1)?,store:r.get(2)?,domain:r.get(3)?,head:r.get::<_,i64>(4)? as u64,input:input.clone(),fingerprint:r.get(5)? })).optional().map_err(map_sqlite_error)
}
impl VersionedFacts {
    /// Only CatalogMigration may clear unadmitted PRIVATE receipts, before the
    /// physical store is ever selected. Active-store tokens remain immutable.
    pub(crate) fn clear_private_qualifications(&mut self) -> Result<(), StoreError> {
        self.log
            .connection
            .execute("DELETE FROM qualifications", [])
            .map_err(map_sqlite_error)?;
        Ok(())
    }

    /// The scanner must attest the complete admitted namespace and revalidate its
    /// source witnesses before calling. This verifies that the attested content
    /// exactly matches visible facts; it does not read or certify the filesystem.
    pub fn qualify_complete_scan(
        &mut self,
        id: &str,
        input: &InputRevision,
        expected_head: u64,
        proof: &CompleteScanFingerprint,
    ) -> Result<QualificationReceipt, StoreError> {
        self.qualify_with_permit(id, input, expected_head, proof, || Ok(()))
    }
    pub(crate) fn qualify_with_permit<G>(
        &mut self,
        id: &str,
        input: &InputRevision,
        expected_head: u64,
        proof: &CompleteScanFingerprint,
        permit: impl FnOnce() -> Result<G, StoreError>,
    ) -> Result<QualificationReceipt, StoreError> {
        if id.is_empty() {
            return Err(invalid("empty qualification identity"));
        }
        let expected = i64::try_from(expected_head).map_err(|_| invalid("head overflow"))?;
        // O(N) attestation stays outside the short write transaction. The final
        // head CAS makes a concurrent publication invalidate this read snapshot.
        let tx = self
            .log
            .connection
            .unchecked_transaction()
            .map_err(map_sqlite_error)?;
        let head: i64 = tx
            .query_row("SELECT head FROM manifest_identity WHERE id=1", [], |r| {
                r.get(0)
            })
            .map_err(map_sqlite_error)?;
        if head != expected {
            return Err(invalid("qualification head changed"));
        }
        let rejected: bool = tx
            .query_row("SELECT EXISTS(SELECT 1 FROM rejected_documents)", [], |r| {
                r.get(0)
            })
            .map_err(map_sqlite_error)?;
        if rejected {
            return Err(invalid("rejected inputs cannot qualify"));
        }
        let mut scan = CompleteScanInputs::new()?;
        {
            let mut stmt=tx.prepare("SELECT c.uri,f.source_sha FROM current_file_versions c JOIN file_versions f ON f.id=c.version WHERE c.kind='accepted' ORDER BY c.uri").map_err(map_sqlite_error)?;
            let rows = stmt
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
                .map_err(map_sqlite_error)?;
            for row in rows {
                let (uri, sha) = row.map_err(map_sqlite_error)?;
                let mut digest = [0; 32];
                if sha.len() != 64 || !sha.bytes().all(|b| b.is_ascii_hexdigit()) {
                    return Err(invalid("invalid stored source hash"));
                }
                for (i, byte) in digest.iter_mut().enumerate() {
                    *byte = u8::from_str_radix(&sha[2 * i..2 * i + 2], 16)
                        .map_err(|_| invalid("invalid stored source hash"))?;
                }
                scan.record_digest(&uri, digest);
            }
        }
        if scan.finish().as_ref() != Some(proof) {
            return Err(invalid("complete scan does not match visible facts"));
        }
        tx.commit().map_err(map_sqlite_error)?;
        let _permit = permit()?;
        let tx = self
            .log
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(map_sqlite_error)?;
        let head: i64 = tx
            .query_row("SELECT head FROM manifest_identity WHERE id=1", [], |r| {
                r.get(0)
            })
            .map_err(map_sqlite_error)?;
        if head != expected {
            return Err(invalid("qualification head changed"));
        }
        if let Some(receipt) = lookup(&tx, input)? {
            if receipt.fingerprint != proof.to_string() {
                return Err(invalid(
                    "input token already qualified with different content",
                ));
            }
            return Ok(receipt);
        }
        // A token is immutable even if its old head is no longer current. A new
        // input requires a new revision, never silent reassignment of a receipt.
        tx.execute(
            "INSERT INTO qualifications VALUES(?1,?2,?3,?4,?5)",
            params![
                id,
                input.issuer,
                input.revision,
                expected,
                proof.to_string()
            ],
        )
        .map_err(map_sqlite_error)?;
        let receipt =
            lookup(&tx, input)?.ok_or_else(|| invalid("missing committed qualification"))?;
        tx.commit().map_err(map_sqlite_error)?;
        Ok(receipt)
    }
    pub fn qualification(
        &self,
        input: &InputRevision,
    ) -> Result<Option<QualificationReceipt>, StoreError> {
        lookup(&self.log.connection, input)
    }
}
