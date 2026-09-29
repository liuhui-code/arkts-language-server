# Production references candidate-snapshot admission

Status: **managed candidate-stage freshness repaired; complete binding/source
admission, constructor narrowing and performance graduation remain open**.

## Actual defects and repair

[Public RED/GREEN evidence](../tdd/references-candidate-snapshot.md) records
seven observed failures against parent
`9f91122ac504365c57473a430094da09baac9309` on dirty branch
`codex/references-f2-fixed-benchmark`. Existing uncommitted work is preserved.
No reset, commit, push or merge.

An index/status response can remain ready at the same generation while the
surrounding authoritative inputs have changed. The old request previously
resynchronized Query v1 after v2, causing `semantic worker fatal: Stale semantic
document version ...: 1 < 2` and a follow-up 20-second timeout. A no-signal
public caller reproduced the same missing mutation fence. Other actual REDs
showed SDK changes proceeding into verification/cache, mutable caller query
objects changing the requested symbol, nested workspace edits bypassing parent
revision and cache invalidation, and a typed stale failure becoming LSP
InternalError instead of ContentModified.

The repair freezes entrance query/document/position values but preserves live
cancellation; captures managed root and configuration revisions with selected
project/SDK inputs; checks cancellation before document synchronization; and
rechecks admission and final publication. Invalidated work is rejected, not
retried against a mixture of snapshots. Normal complete-result semantics and
automatic diagnostics remain enabled.

Physical equal/ancestor/descendant roots share mutation and overlay-cache
invalidation. Canonical symlink aliases are covered; an unresolved identity
fails conservative. Actual-worker tests show unrelated sibling roots still
retain pending requests and valid cache hits without additional verifier work.
Watched file events continue clearing all cache entries. The LSP runner maps
semantic `content-modified` to its existing stale outcome after first-cause
cancellation checks, so nested stale work returns -32801 and no Locations.

## Scope and verification boundary

The public-port tests use the actual SemanticWorkerEngine, semantic Worker and
external NDJSON sidecar fixture; they deliberately omit AbortSignal where
testing the managed revision fence. Two separate Content-Length framed child
process transcripts certify the real LSP response/error mapping, normal
current-version diagnostics, graceful shutdown and exact same-process recovery.
Public-port tests are not presented as framed-LSP certification.

Candidate selection was extracted cohesively under four existing GREEN public
transcripts before implementing new behavior. New source254/test391/179/fixture69
physical lines are≤500. The proxy shrinks822→694 lines from this turn's entrance
but remains explicit migration debt; the touched semantic request runner is345.

Frozen final-source verification: **146/146 PASS**, zero failures/cancelled/
skipped/todo,402,638.730ms, exit0. This covers all references suites, actual-worker
snapshot/anchor transport, supervisors/lanes, production Worker, physical watched
changes, workspace freshness and explicit test registration:

```sh
node --test --test-concurrency=1 \
  tests/semantic/references*.test.mjs \
  tests/semantic-worker-reference-snapshot.test.mjs \
  tests/semantic-worker-anchor-seed.test.mjs \
  tests/semantic-worker-supervisor*.test.mjs \
  tests/lsp-production-semantic-worker.test.mjs \
  tests/lsp-workspace-global-freshness.test.mjs \
  tests/lsp-workspace-file-changes.test.mjs \
  tests/test-layer-manifest.test.mjs
```

[Raw focused log](../../.bench/anchor-reuse-2026-09-27/candidate-snapshot-focused.log).
TypeScript check, runtime build, manifest preflight, line counts and diff check
PASS. Registry has120 explicit entries, including both new test files. No Rust
source changed in this slice. At that focused-stage checkpoint there was
**no GREEN whole `check:fast` result** for this source; the previous slice's
1,047-pass gate was not reused. Chronological whole-gate outcomes follow.

The first fresh whole-fast invocation in the restricted macOS sandbox reached
existing external-sampler failures and was stopped (exit1); its log is retained
at `.bench/anchor-reuse-2026-09-27/candidate-snapshot-check-fast.log`, not reported
as GREEN. Isolated unchanged façade A/B sampler test failed with `spawn EPERM`
there, then passed1/1 in4,720.796ms with authorized read-only `ps`. The complete
gate is rerun in that authorized environment with unchanged source/assertions;
its outcome is recorded separately below.

### Earlier whole-fast gate: not passed

Authorized rerun preserved at
`.bench/anchor-reuse-2026-09-27/candidate-snapshot-check-fast-authorized.log`.
It produced759 passing lines and5 failing lines before being stopped while the
next file was running (process exit130). These are partial log counts, **not**
a completed759-test success. The earlier restricted run had619 passing/3 failing
lines before stop, including external-sampler failures; it likewise is not GREEN.

The first authorized failure was `edit during rejected-anchor complete retry`.
An unchanged targeted run also failed waiting10 seconds for the fallback trace
(`Timed out waiting for the transient reference batch`, total14,156.379ms,
exit1), recorded in
`.bench/anchor-reuse-2026-09-27/candidate-snapshot-retry-edit-isolated.log`.
That single-test selection **overlapped the whole suite**, so it is not an
independent idle-machine reproduction. No wrong Location set was established
by that failure. Other suite cases that normally take seconds reached18–36s.

Read-only health sampling then found16GiB RAM, swap4,143.75MiB used and load
averages298.77/181.91/88.99; wired pages3,282,816 (4KiB pages), free pages2,857.
After stopping only our validated test process group, swap was4,331.25MiB and
load74.96/141.37/85.23. Cause of the machine-wide pressure is **not established**;
these observations neither prove a product regression nor excuse it. Own test
processes were confirmed stopped. No user application was killed, timeout
increased, source/diagnostics policy changed, or failing assertion skipped.

At that checkpoint the gate was **blocked by an inconclusive, pressure-
contaminated run**, not completed. Targeted and complete authorized rechecks
below retain that evidence rather than retroactively calling the run GREEN.

### Later idle-machine targeted recheck: 5/5 PASS

Chronologically after the stopped runs above, the five prior failing anchor-
reuse names were rerun with unchanged source at the same HEAD
`9f91122ac504365c57473a430094da09baac9309`, after confirming our earlier tests
were no longer running. Initial read-only health was16GiB RAM, load
2.97/4.29/18.51 and swap4,077.75MiB used; residual swap is not proof that the
machine was entirely pressure-free.

The completed targeted run returned **5/5 PASS**, exit0,12,030.208ms, with zero
failures/cancellations/skips/todos:

- Edit during rejected-anchor complete retry with exact recovery.
- Cancellation during seeded verification with no partial result and recovery.
- Local-export seed after a pre-query unsaved comment edit.
- Anchor fallback without a compiler-validated definition.
- Anchor isolation from another cursor position.

[Raw idle targeted log](../../.bench/anchor-reuse-2026-09-27/candidate-snapshot-idle-failures.log).
Read-only review located the earlier retry failure at the fallback-trace wait
**before `didChange`**, not at reference-result comparison. No wrong Location
set was demonstrated by that failure. No production repair, timeout increase,
assertion change or capability reduction was made for this idle recheck.

The contrast is associated with the recorded resource conditions, not a proven
complete cause of the earlier failures. The previous stopped/failing evidence
remains above. Targeted5/5 does not replace the new complete gate below.

### Complete authorized idle whole-fast gate: FAIL

The unchanged-source authorized `pnpm check:fast` completed with **1,056 total,
997 PASS /59 FAIL**, zero cancellations/skips/todos,2,365,703.412ms, **exit1**.
[Raw complete idle log](../../.bench/anchor-reuse-2026-09-27/candidate-snapshot-check-fast-idle.log).
Earlier interim505/30 spec-line observations were not final totals and are not
used as test counts. Health during that run included load6.01/6.27/12.30 and
used swap4,960.25MiB of6,144MiB; targeted recovery did not solve the full gate.

The parsed failure summary has56 failure blocks, all reporting a wait timeout;
these blocks are **not equivalent to the runner's59 failed-test count**.
Of those blocks,53 include operational `sdk.selected` for the default DevEco
API24 SDK, ready=true; the logging block reports ready=false. Examples include
document-symbol-depth, signature-help and hover. This supports inspection of
host SDK scope/startup timing, not a complete timeout-cause diagnosis.

### Same-build isolated startup controls

Sequential idle replays changed no source, deadlines, assertions or diagnostics:

| Control | Result | Test / total duration |
| --- | --- | --- |
| First call-hierarchy case, inherited default SDK environment | 1/1 PASS | 4,660.369 /4,912.322ms |
| Same case, only `ARKLINE_HARMONY_SDK_PATH` set to proven missing `/private/tmp/arkts-fast-sdk-control-missing-20260927` | 1/1 PASS | 1,894.864 /2,121.697ms |
| Logging case, its existing explicit missing-SDK environment | 1/1 PASS | 1,830.424 /2,018.282ms |

This single-workload A/B shows a scope/time effect, but the isolated default
case did **not** reproduce the timeout. Logging's full-run failure despite its
explicit missing SDK also prevents attributing every failure to SDK selection.
These are not statistical performance gates or a proven complete root cause.
The failed403-file reference run waited20s after an index-not-open fallback,
then cataloged403 files, without a retained `sdk.selected` marker or completed
compiler result. Its separate missing-SDK control passed1/1 in9,985.109ms
(total10,152.512ms), retaining the original20s deadline and exact Location
assertions. This does not erase the failing default-host whole run.

### Controlled fixture-SDK whole-fast: 1,056/1,056 PASS

The later authorized control completed **1,056/1,056 PASS**, exit0, zero
failures/cancellations/skips/todos,2,012,515.851ms (~33.54min):

```sh
test ! -e /private/tmp/arkts-fast-sdk-control-missing-20260927 && \
ARKLINE_HARMONY_SDK_PATH=/private/tmp/arkts-fast-sdk-control-missing-20260927 \
pnpm check:fast \
  > .bench/anchor-reuse-2026-09-27/candidate-snapshot-check-fast-fixture-sdk.log 2>&1
```

[Raw completed controlled log](../../.bench/anchor-reuse-2026-09-27/candidate-snapshot-check-fast-fixture-sdk.log).
Only the suite's inherited environment changes: a proven missing SDK path keeps
ordinary source fixtures from implicitly selecting the host installation.
SDK-specific fixtures still override it with their own explicit SDK. Source,
test assertions, deadlines, normal diagnostics and runtime artifacts are
unchanged across these diagnostic reruns. Server/semantic/verifier hashes still
match the fixed Settings manifest; production defaults and the real Settings
API24 replay are unchanged.

The403-file case passes in18,585.434ms in this full control under its original
20s deadline. The constructor comparison's306,850.670ms is an entire multi-RPC
test duration, **not navigation latency**. During-run health still included
16GiB RAM, swap5,204.50MiB of6,144MiB and load6.62/6.80/6.70; zero failures here
does not establish resource pressure or SDK loading as the sole prior cause.

The **controlled fixture gate is GREEN**; the completed **default-host gate
remains FAIL (997/1,056,59 failures)** and its investigation remains open. All
earlier failed/stopped logs are retained. This control does not certify
≤500ms navigation, production memory release gates or Windows behavior, and no
source repair or timeout relaxation was made to obtain it.

This is **not** complete authoritative binding snapshot capture. No production
`class-bindings/resolve` planner consumer or constructor candidate exclusion is
added. All relevant bounded open-overlay/source-availability admission,
extensionless source uniqueness/absence and compiler-backed constructor search
coverage remain next. There is no SDK-profile, cache-budget, Worker-count,
verifier-lifetime or production-default change. The managed fence does not
claim detection of unobserved disk/SDK mutations before notification.

## Fixed Settings replay environment

[Manifest](../../bench/references/manifests/settings-menucontroller-candidate-snapshot-api24.json)
pins clean Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9` at
`/private/tmp/arkts-settings-row-counts.BPJdST/project`. Declared compile/target/
compatible SDK23/20/20 are unchanged. The user-approved selected API24/6.1.1.125
is `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, declaration
digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
Node v26.3.0, ohos-typescript4.9.5-r10. This is same-SDK compatibility replay,
not API23/DevEco diagnostic equivalence.

Target: `common/src/main/ets/core/controller/MenuController.ets`, MenuController
**constructor** UTF-16 **90:17**, includeDeclaration=false,267 exact-location
oracle SHA256 `72980d7c79e3baf44ebba8a30094484225aebe08aefd2077cda45cbdc5e90ab3`.
Do not substitute the smaller class-export reference set for this query.

Final server artifact
`b75228ce69a8f2cd664976203912c2289d4508b7571364c0eb6018db257f817a`;
semantic/verifier Workers, stdlib and sidecar digests are unchanged from the
previous protocol replay. Runtime build and complete manifest preflight PASS.

## Same-build Settings result

One independent process, actual Content-Length framed stdio, committed catalog
ready, references as the first semantic request, normal automatic diagnostics,
no forced GC or heap snapshot. No test/build ran concurrently with the replay.
The external sampler monitors Node PID5189; Worker threads are not added again.

| Measurement | Observed |
| --- | --- |
| Exact oracle | **PASS:267 legal exact Locations**,0 validation errors |
| Request to response | **55,479ms** |
| Sampled target Node peak RSS | **759,275,520 bytes (~724.1MiB)** |
| Sampled server process-tree peak RSS | 762,552,320 bytes (Node+sidecar, no Zed) |
| External sample count | 549; requested50ms, actual gaps104–348ms |
| Sampler / harness peak RSS | 116,371,456 /76,865,536 bytes, separately accounted |
| Catalog | Indexed1,846/1,846 files; skipped1 entry |
| Verification | 1 rejected seed (`compiler-anchor-mismatch`) +14 completed conservative batches |
| Project membership / largest batch Program project files | 1,496 /1,348 |
| Normal diagnostics | v1 TS2307 for `@ohos.systemparameter`,1,993ms after response |
| Shutdown | exit0, no timeout/OOM/partial success |
| Cold≤500ms | **FAIL** |

Across all15 verification attempts (the rejected seed included), logged Program
readiness totals **46,500.010ms (~83.8% of request time)**; createProgram is
38,820.549ms, query1,828.797ms, Worker startup3,980.209ms. These are summed trace
durations, not independent additive wall-time categories: createProgram is
inside readiness. Candidate-stage freshness is fixed, but constructor-anchor
rejection still forces the complete conservative search; no throughput or
candidate-exclusion benefit is claimed.

[Raw replay](../../.bench/anchor-reuse-2026-09-27/menu-candidate-snapshot-A-1.json)
contains the request/diagnostic timeline, all267 normalized locations, external
memory curve, operational trace, effective environment and graceful shutdown.
SHA256:`05864a7774b9cb373e85efba8ea6721fd9ef22e8e745a31e22e01e7e617f5a81`.
Preflight checked clean project revision, actual SDK digest, oracle and all
server/Worker/stdlib/sidecar artifact hashes before launch.

```sh
ARKTS_REFERENCES_ANCHOR_REUSE=0 \
ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=1 \
ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS=1 \
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-row-counts.BPJdST/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/core/controller/MenuController.ets \
  --symbol MenuController --line 90 --character 17 --exclude-declaration \
  --oracle bench/references/oracles/settings-menucontroller-constructor-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-menucontroller-candidate-snapshot-api24.json \
  --out .bench/anchor-reuse-2026-09-27/menu-candidate-snapshot-A-1.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace
```

This single compatibility run does not establish memory no-regression or a
causal performance improvement. Cold/edit≤500ms, original>3GB reproduction,
repeated retention/PSS and final memory release gates remain open. API24
compatibility does not imply diagnostic equivalence or zero SDK diagnostics.
A focused suite/replay is not a fresh whole-fast gate.
