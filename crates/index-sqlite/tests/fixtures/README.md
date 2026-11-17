# Previous owner-layout migration fixtures

These are deliberately checked compatibility inputs for a fake one-class project,
not user caches or generated build outputs. Each test copies a complete data/control
pair into its own TestDir. No environment variable or shared mutable directory is
required. Default tests consume format8; the experimental physical-profile tests
consume108. Normal current-format opens must still reject both.

Produced through the frozen IX20 public CatalogMigration API on Windows with
Rust1.95, then copied using Python sqlite3.Connection.backup. Producer parent is
298d65f5d7f796c347fe8be5c739e428066489d8 plus the uncommitted IX20 snapshot
68aa4629acb6683a330b85ff7f4d795a128dee6833b48f80b9239e38c255b68f.
The parent commit alone does not reproduce that snapshot. The corresponding
private candidate archive and producer test are retained with the diagnostic
receipts; no release binary or revision was fabricated.

The two SQLite files were backed up separately only after the producer/tests
closed. This is not a claim of atomic live backup across databases. Original
archives retain DB/WAL/SHM evidence. Backup integrity_check and foreign_key_check
passed; actual format and physical occurrence layout were verified. Only
manifest_owners.object_id in the derived fixture was replaced with an explicitly
unverifiable value to remove machine-specific identities. Facts, keys, producer,
head, schema and control publication were preserved. Old lease paths are not
copied or assumed live; each test obtains its own real lease through public APIs.

Provenance and SHA256 receipts are retained under
.bench/index-versioned-maintenance-20261104/namespace-final-20261109/
owner-retention-control/portable-fixture{8,108}-preparation.json.
Production code must not load these fixtures or bypass owner identity checks.

Context7 resolution failed with an HTTP transport error. Official fallback:
https://docs.python.org/3/library/sqlite3.html#sqlite3.Connection.backup

Producer source is retained alongside the fixtures as producer.rs. Copy it only
into the frozen previous producer's tests (not the current successor), run the
specific test with ARKTS_TEST_OWNER_FORMAT8_FIXTURE pointing to a nonexistent
isolated directory. Repeat with --features experimental-occurrence-without-rowid
for108. Never point it at a real project/cache. It requires create_dir to succeed
and asserts the actual old component format before emitting metadata.


## Stable-slot predecessor and current resource-reference layout

The successor format is10/110. Format8/108 uses the original unique lease-file
ABI; format9/109 uses stable OS-lock slots and logical lease incarnations. Both
are real previous-producer inputs; do not create a predecessor by changing its
format tag. Current format10/110 preserves immutable logical group owner and
separates the nullable resource-owner FK. Ordinary old-format opens reject;
private migration has explicit compatibility and parent/head fences.

The real9/109 inputs were emitted on Windows by source-owner-next using its
public CatalogMigration API. producer_slots.rs retains that exact fixture
producer, peer_slots.rs the actual9/109 old-writer head-advance control. These
are provenance sources, not automatically compiled current-format tests. The
closed derived-backup preparation receipt is portable-slot-fixtures-preparation.json
under the same owner-retention-control evidence directory. It preserves original
DB/WAL/SHM archives and records the backup/integrity procedure and SHA256s.

Only complete data.dbfixture/control.dbfixture pairs and fixture.json belong
in the candidate. Read-time SQLite WAL/SHM files observed in archived working
fixture folders are excluded from integration; originals remain in evidence.
Tests materialize their own scratch databases and never modify these inputs.

Current regression wrappers cover both old lease ABIs in each physical profile,
failed migration/retry, held old SQLite read snapshots and retagged-schema
rejection before owner registration. Four separate actual old-writer controls
are preserved in terminal-owner-split-qualified-summary.json; those external
executables are not required by the self-contained current cargo suite.
