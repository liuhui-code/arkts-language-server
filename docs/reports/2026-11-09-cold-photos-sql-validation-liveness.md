# IDX-V1-INIT-002: real Photos cold SQL validation loses liveness

Date: 2026-11-08/09. OPEN until original-input retest and final full checks.

## Observed failure, not a guessed OOM

The independent original Photos30K cold run scanned/staged30000files, then no progress for exactly30s.
Parent reported `Indexing degraded after 30000 files`; zero user actions and zero formal soak seconds.
Nodepeak740.25MiB, Native81.57MiB, normal acknowledged shutdown, no protective process kill.
The semantic preparation separately reports incomplete membership; it is not the cause of the Native final-stage stall.

PrivateDB1831776256bytes: manifesthead1, one published private group,30000sealed versions,
one private qualification, file-facts format8, outer user_version0. Control still selects old symbols-v2/schema11.
Logical publication within a PRIVATE candidate is not physical activation or public completeness.
`CatalogMigration::try_activate` commits the private qualification, calls `prepare_catalog`, then format/checkpoint,
source fence, bounded admission and physical control publication. The pre-format state bounds failure to storage validation.

The original postflight `/usr/bin/sqlite3 integrity_check; foreign_key_check` hit its60s external observation cap.
That raw postflight remainsFAIL, but no corruption was returned: integrity was unproven, not demonstrated corrupt.
Original cache/DB/WAL, input manifests, logs, progress timestamps and normal-close proof are preserved in
`.bench/index-versioned-maintenance-20261104/photos-soak-20261108-awake`.

## Controlled phase measurements

APFS cloned DB only, rusqlite0.40.1/bundledSQLite3.53.2, same production SQL, independent diagnostic60s interruption.
No user cache or original evidence was modified. SQLite VM counters are logical work, not rows or disk bytes.

| Phase | Actual diagnostic result |
| --- | --- |
|quick_check, initial default cache|60s then diagnostic SQLITE_INTERRUPT; NOT PASS|
|foreign key check|21.29s,0violations|
|FTS external-content integrity|1.34s,completed|
|full integrity_check|60s then diagnostic interruption; NOT PASS|
|quick_check, existing legacy64MiB cache value|45.18s,ok|
|quick_check, default2MiB repeated|41.06s,ok|
|quick_check, actual1000-op progress measurement|42.601s,207185callbacks,maximum callback gap282ms,ok|

The cache comparison does NOT support raising page cache as the solution. Product page cache/RSS/V8/timeout
settings remain unchanged. OS page cache/order is uncontrolled; do not infer precise cache speedups.
The crucial measured contradiction is42.6s of real ongoing work versus a30s *no progress* watchdog.
The worker already advances every<=282ms in this sample, but that progress never reached the owner.

Raw: `cold-photos-validation-20261108/{execution,cache-comparison}.json`, phase logs, cloned files and copy receipt.

## Implemented minimal mechanism

- `crates/index-sqlite/src/catalog_validation.rs`: original full quick/FK/FTS checks retained. Scoped1000-op
  SQLite progress handler reports stage/work, can cancel, and explicitly detaches on success/error/unwind.
  Observer is consumed by one activation attempt; retained drafts do not retain obsolete observer state after failure.
- `catalog_migration.rs`: one-attempt observer; original format/checkpoint/source/final publication sequence retained.
- `crates/index-sidecar/src/maintenance_validation.rs`: real callback-only relay; first stage/first actual work,
  then at most5reports/sec, no periodic timer heartbeat. It checks cancellation and fails if its owner channel disappears.
- `catalog_worker.rs`/`maintenance_executor.rs`: typed validation stage, approximate VM instructions and monotonic
  activity/per-stage elapsed time are relayed under the original task/input identity.
- `src/index/maintenance-events.ts`: strict optional metadata validation; malformed data still retires the session.
- `versioned-maintenance.ts`, workspace aggregation and existing LSP progress composition preserve the metadata.
  Public message is `Validating index; ...s elapsed`, no fake percentage or implementation counters in the UI.

Existing30s stall/cancel limits remain. Only actual SQL work renews the existing activity boundary; no validation
is skipped, no physical publication is moved earlier, no stale source proof/qualification is reused.
This fixes the measured Native-validation liveness gap; it does not fix SCALE003 semantic30s compilation deadline.
Progress callbacks are not a completion percentage or universal wall-time guarantee for every SQLite/IO operation.

## TDD and checks so far

Parent298d plus existing candidate. Public CatalogMigration regression firstRED (missing API), thenGREEN:
SQL cancellation before source/admit, retained draft retry, old input receipt absent, scoped callback removed.
Real FK corruption independently remainsCorrupt and cannot reach publication (GREEN characterization).
Existing migration retry3 alsoPASS. Real Native NDJSON firstRED missing validation progress, thenGREEN for actual
VM work in all3stages before the single qualified terminal. New framedLSP firstRED, exposed aggregation omission,
then2PASS: actualNative validation message, exact ready100 terminal and exact Widget499 name/URI.
Public adapter/lifecycle25PASS includes malformed stage/steps/activity/elapsed rejection. Strict focused ClippyPASS.
These are focused checks, not fresh full-suite, original30K or2h acceptance.

An environment interruption removed654 files and the .git pointer from the temporary worktree around midnight;
causation is UNKNOWN, do not assert a janitor/other-agent cause. Restored only missing files from2384-input
hash-verified backup and matching existing Git admin pointer, preserving all present/new changes and file modes.
Post-restore hash audit found only the6 intentionally modified existing Rust inputs; new files separately backed up.
Later JS bridge/test changes are separately owned. Receipt `tmp-midnight-restoration-20261109.json`.
The failed metadata command did not run the intended checks; subsequent restored focused runsPASS.

Next: freeze the final integrated candidate, run fresh literal Cargo/Node/experimental/pinned455 correctness checks,
then real-input cold/warm and the required single-session7200s Photos mix. Original failed runs remainfailed.
Only455 cold3s performance timing is waived. UI/Windows, SDK and full30K references/rename limitations remain explicit.

## ADR and official references

ADR0043 isProposed and already requires private complete validation, independent control and truthful progress;
this implementation closes a missing delivery path without weakening its atomicity/qualification contract.
ADR0042 pipeline/memory ownership and ADR0028 lease/physical-retirement constraints remain unchanged.
ADR0020 semantic Worker supervision is separate and its deadlines are not changed.
Context7 TypeScript/rusqlite resolve attempts failed transport; no query-docs result is claimed.
[SQLite progress handler](https://sqlite.org/c3ref/progress_handler.html) defines approximate VM work/cancellation
and forbids querying that same connection from its callback. [PRAGMA quick_check](https://sqlite.org/pragma.html#pragma_quick_check)
and [cache_size](https://sqlite.org/pragma.html#pragma_cache_size) support the diagnostic controls; no complexity
claim beyond these measured data is inferred. Source of truth for behavior is the pinned installed/bundled implementation.
