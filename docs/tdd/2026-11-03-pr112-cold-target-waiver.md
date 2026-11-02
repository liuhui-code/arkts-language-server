# PR112: apply the standing cold-target waiver without dropping correctness

Parent: `f49809f0d5f3cd0e2cc55ae4d6af31cd95f0d5b9`.
User authority: the455-file cold catalog3-second target is nonessential and
must not block integration; indexing and all other correctness/integrity checks
remain required. This records that existing authorization, not a new exception.

## Original CI and RED

Final-head CI41496045454 attempt1 passed Windows installation/reinstallation/LSP
smoke and native workspace tests, then stopped at the old explicit455 fixture:
3.02023698s against3s. Node fast and later release stages were not reached.
Raw log: `.bench/pr112-review-20261103/ci-f49809f-attempt1.log`.
This is not a full pass or a new product failure to optimize around.

The release-driver regression was strengthened first: inspect the actual child
environment of every stubbed cargo/pnpm call. It failed5/6 because the fixture's
policy was unset. Its original native-failure71 propagation assertion remained.
An initial shell-fixture interpolation ReferenceError is retained separately as
test setup failure, not the behavioral RED.

The self-contained pinned protocol fixture is extracted from the over-limit
NDJSON file,2436→2260 lines, to a229-line target. All protocol/data/query assertions
are preserved; a normalized comparison confirms the only scenario difference
is the cold timing policy. With the original strict guard, new policy tests
failed2/3: an explicit waiver was not honored and an unknown value was not rejected.

## Scope of the implementation

- Direct cargo execution still defaults to the original3-second timing assertion.
- Only the canonical release driver's one pinned-fixture call sets
  `ARKTS_TEST_455_COLD_CATALOG_POLICY=waive-3s-user-authorized`.
  No global export, product option, timeout increase or RSS-policy change.
- The exact recognized policy emits a structured `test.performance.waiver`
  record with measuredMs,targetMs,withinTarget and user authority. Unknown
  policies fail. `--nocapture` retains the actual measurement in release CI.
- The fixture still checks the fixed Git revision, READY/completeness, all455
  discovered/indexed files, zero rejection, generation1, fuzzy ranking and exact
  definition files/positions. Any failure still stops the driver before Node.
- The legacy100K cost contract and every other native, Node, query, WASM,
  artifact and large gate remain unchanged. No rerun-until-fast loop is used.

The extracted target is `pinned_catalog_fixture`; historical TDD commands naming
the old NDJSON target remain historical. The canonical driver is authoritative.

## Scoped verification

Rust:26 NDJSON protocol cases plus3 timing-policy cases passed; the external
fixture was initially ignored as before, then explicitly executed. Node release
driver:6/6 passed, including failure propagation and policy isolation.

Actual Mac execution with the same pinned fixture585feb45114a128a0d2a23947c83faf338e758f7:
**3954.833488ms**,target3000ms,withinTarget=false, explicitly WAIVED;
all remaining fixture assertions passed, exit0,5.43s test duration.
This does not claim the original cold target passed or explain its duration.

```sh
ARKTS_INDEX_REAL_FIXTURE=/path/to/nim-uikit-harmony \
ARKTS_TEST_455_COLD_CATALOG_POLICY=waive-3s-user-authorized \
cargo test --locked -p arkts-index-sidecar --test pinned_catalog_fixture \
  pinned_large_arkts_fixture_meets_cold_catalog_and_deterministic_query_gates \
  -- --ignored --exact --nocapture
node --test tests/release-pipeline.test.mjs
```

Local evidence: `.bench/pr112-review-20261103/`
`cold-waiver-{release,policy}-red.log`, `cold-waiver-rust-green.log`,
`cold-waiver-release-green.log`, `cold-waiver-real-fixture.log`,
and `cold-fixture-original.rs.txt`. New-head complete CI is still required;
these scoped results are not added together into a full release pass.

ADR0013 records the explicit acceptance exception. Final reporting must say
“complete CI with the authorized cold-target waiver”, preserving original
failed/waived measurements and all existing UI/30K/SDK/performance limitations.
