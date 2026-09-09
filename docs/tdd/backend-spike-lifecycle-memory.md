# Backend Spike S3 — Lifecycle and memory

Parent revision: `db2147b2c3b9ab03ae89797f17aa2894b065074b` (PR #14 merge).
Branch: `codex/backend-spike-lifecycle-memory`.

## RED

The first focused test failed because the lifecycle evaluator and committed evidence did not exist:

```text
node --test tests/ohos-typescript-spike.test.mjs
ERR_MODULE_NOT_FOUND: lifecycle-report.mjs
```

The first real API 24 SDK run then failed its edit-reuse gate:

```text
OHOS_TYPESCRIPT_LIFECYCLE=FAIL
CHURN=20 RSS_GROWTH=0 HEAP_GROWTH=23019312
```

An ordinary comment edit caused all 2,271 root snapshots to be materialized again. The compiler is
allowed to request root snapshots to compare versions, so the gate distinguishes snapshot requests
from actual immutable snapshot materialization.

## GREEN

The spike runtime now shares both one official `DocumentRegistry` and one immutable snapshot pool
across equal backend/SDK/context identities. Pool entries are keyed by canonical file path and script
version, with text equality as a collision guard. A document edit increments its version and creates
exactly one new snapshot; stable SDK declarations are reused. `trim()` adapts
`cleanupSemanticCache()`, while `dispose()` remains the only whole-context release operation.

The accepted run used revision `9cc62fe98f47c0bf113676e3fb33fe932b493052`, SDK API 24 digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`, and 2,150 SDK
declaration files:

```text
OHOS_TYPESCRIPT_LIFECYCLE=PASS
CHURN=20 RSS_GROWTH=0 HEAP_GROWTH=1456160
```

Observed acceptance evidence:

- 10 stable queries: 0 additional snapshot requests and 0 materializations;
- ordinary comment edit: 2,271 requests, but exactly 1 materialization;
- 1 trim and 21 dispose calls (20 churn contexts plus the stable context);
- 20 post-GC samples, 0 RSS growth and 1,456,160-byte heap growth;
- thresholds: 96 MiB RSS growth and 32 MiB heap growth;
- report size below 64 KiB and no local absolute paths.

Verification:

```text
node --test tests/ohos-typescript-spike.test.mjs: 10/10 passed
pnpm check:fast: 853/853 passed, 0 fail/cancel/skip/todo (468,078.69 ms)
production ohos-typescript import gate: passed
git diff --check: passed
```

## Reproduction

```bash
node --test tests/ohos-typescript-spike.test.mjs

node --expose-gc scripts/semantic/ohos-typescript-spike/lifecycle-run.mjs \
  --upstream "$PWD/.cache/upstream/ohos-typescript" \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --out /tmp/ohos-typescript-lifecycle.json

! rg -q 'ohos-typescript' src/lsp src/composition
git diff --check
```

The real lifecycle run is an explicit acceptance step because CI does not own the local DevEco SDK
checkout. Fast tests validate the evaluator, snapshot-pool behavior, exact locked identity, report
shape, sample count, thresholds, and committed PASS evidence.
