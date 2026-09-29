# Settings binding-discovery protocol prerequisite

Status: **bounded Rust/Node discovery transport PASS; production captured
snapshot, constructor narrowing and latency/memory graduation remain open**.

## Implementation and authority

[Public TDD](../tdd/references-class-binding-protocol.md) records actual failing
protocol/adapter commands at parent
`9f91122ac504365c57473a430094da09baac9309`, followed by minimal implementations.
The existing sidecar now exposes protocol-v1 `class-bindings/resolve`; an
editor-neutral Node port performs canonical request/result URI mapping and
strict validation. No second database, persisted overlay, schema or TypeChecker.

Known lexical discovery requires the initialized workspace identity, ready
runtime and matching runtime/snapshot/expected generations. Reopened old rows
remain unknown until validation/refresh. Requested URIs and overlays have
count/UTF-8 byte budgets; malformed/oversized caller input never gets truncated.
Node rejects sparse arrays before IO; malformed child output degrades the
session, while invalid caller input leaves it usable. Current source shadows
persisted facts without mutating storage, including invalid traversed buffers.

This is **not** a production references/planner consumer. No discarded
per-references RPC is added. The future caller must capture all relevant open
buffers and fence project/SDK/workspace/index/document revisions around the
asynchronous query. Generation equality alone cannot establish freshness.
Extensionless source hops remain unknown without authoritative availability.
`NoBase`/`Resolved` never certify constructor identity or complete search scope.
Compiler-backed inherited/factory/own-constructor coverage and exact public
differential remain mandatory before any candidate exclusion.

## Verification

- Real Rust NDJSON discovery transcript **9/9 PASS**, including graceful shutdown.
- Rust workspace **155 PASS / 1 existing ignored release fixture**.
- Experimental snapshot/overlay/heritage/migration/layout **24/24 PASS**.
- Node public adapter/catalog/discovery **75/75 PASS**, zero skips, 27,607 ms.
  Discovery contributes47 tests/subtests, including the actual release sidecar,
  not only scripted malformed-output fixtures.
- Test-layer registration **4/4 PASS**; explicit118 entries, unit-contract57.
- Rust release build, TypeScript check, scoped formatting and diff checks PASS.
- Cohesive GREEN extractions preserved the existing27-test NDJSON behavior and
  28-test adapter/catalog behavior. Sidecar main971→754, NDJSON parent2717→2545,
  Node sidecar adapter1344→1321; all remain migration debt.
- New handwritten Rust source132/237, Rust test271/shared helper190, Node
  contract41/helper133/URI69/test275 lines, all≤500. No default/SDK/Worker/
  memory-policy change; existing dirty worktree protected. No commit/push/merge.

`pnpm check:fast` on frozen final source: **1,047 PASS**, zero failures,
cancelled, skipped or todo; 939,691.819 ms. This includes actual child-process
framed-stdio capability/freshness/cancellation and reference differential
regressions, not only parser/unit checks. Log:
[authorized fast gate](../../.bench/anchor-reuse-2026-09-27/class-binding-protocol-check-fast-authorized.log).
Post-gate runtime build PASS; manifest artifact pins match the final build.

The earlier restricted sandbox run was interrupted after three external-RSS
fixture failures; direct `ps` was explicitly denied. The same façade/replay/
diagnostic fixtures all pass when sampling is authorized, without changing
assertions. [Interrupted log](../../.bench/anchor-reuse-2026-09-27/class-binding-protocol-check-fast.log)
is retained, not presented as a completed gate. Transport/fast checks are not
performance graduation. Fixed Settings results follow the separate replay.

## Fixed project and remaining gates

Clean Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9` at
`/private/tmp/arkts-settings-row-counts.BPJdST/project`; declared SDK23/20/20
unchanged, user-approved API24 /6.1.1.125 at
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`.
SDK declaration digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
Node v26.3.0, ohos-typescript4.9.5-r10, pnpm8.3.1, Intel Mac/Darwin25.6.0.
Hardware: i7-9750H /12 logical CPUs /17,179,869,184 bytes RAM.

Regression target remains MenuController **constructor** UTF-16 **90:17** in
`common/src/main/ets/core/controller/MenuController.ets`, includeDeclaration=false,
against the267 exact-location oracle. This is not class-export identity proof
or API23/DevEco diagnostic equivalence. Cold/edit≤500ms, original>3GB pressure
reproduction and final memory graduation remain open.

## Same-build real framed-stdio replay

[Manifest](../../bench/references/manifests/settings-menucontroller-binding-protocol-api24.json)
pins final server `6a098bffca2121c2265e83aed6a3d9bd6a7ef3ed0fdfc77c9444f2206b9a0802`
and sidecar `f2c967a36ff3918a12357928c497aa006cc31e80a0f515d17b458cf3c832850d`;
semantic/verifier Worker and stdlib digests remain unchanged from the prior
overlay replay. Fresh process/index-cold A waits for committed ready catalog,
opens the target and first requests `textDocument/references`. This is not
workspace/symbol or documentSymbol, and no warm-up query runs first.

Normal automatic diagnostics remain enabled. Target Node PID93692, separate
sampler PID93693; no overlapping builds/tests, forced GC or heap snapshot.
Sampler requests50ms; actual100–204ms gaps are disclosed. Worker-thread RSS is
not summed again; harness/sampler are excluded from product memory.

| Observation | Value |
| --- | ---: |
| Request→response | **53,419 ms** |
| Exact/legal Locations | **267**, no error/missing/extra |
| Catalog | 1,846/1,846 indexed;1 entry skipped |
| Rejected/completed verifier attempts | **1/14** |
| Membership/max Program project files | **1,496/1,348** |
| Full-search early-completion proofs | **0** |
| Program readiness sum | **44,605.31 ms (~83.5%)** |
| createProgram/query/startup sums | **37,451.75/1,818.43/3,897.19 ms** |
| External target Node peak RSS | **843,595,776 bytes (~805 MiB)** |
| External product-tree peak RSS | **884,400,128 bytes** |
| External samples/actual gaps | **559 /100–204ms** |
| Sampler/harness peak RSS | **116,891,648/77,078,528 bytes** |

Version1 TS2307 for `@ohos.systemparameter` arrives1,796ms after the response.
Graceful exit0, no timeout/OOM/partial success. Peak is sampled, not a guaranteed
between-sample maximum; phase sums are descriptive, not independent ownership
estimates. No PSS, retention, P95 or cold-OS-cache claim.

**Compatibility/correctness replay PASS; cold≤500ms FAIL.** Class seed is still
rejected (`compiler-anchor-mismatch`); all14 conservative batches still run.
The new discovery port is not consumed by production references and brings no
measured speedup: prior53.310s versus current53.419s is essentially unchanged.
Node peak is6.1% above the prior795,295,744-byte smoke. Single runs cannot
attribute a cause or establish memory no-regression/reduction; final memory
graduation remains open. This is not reproduction of the original>3GB case.

Raw memory curve, method transcript, phase events and exact results:
[menu-binding-protocol-A-1.json](../../.bench/anchor-reuse-2026-09-27/menu-binding-protocol-A-1.json),
SHA256 `875508754f0fae367589800a4535a129c3db6e296a1f5220216f2b84f7d8f991`.

Replay using a fresh output path:

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
  --manifest bench/references/manifests/settings-menucontroller-binding-protocol-api24.json \
  --out .bench/anchor-reuse-2026-09-27/menu-binding-protocol-A-2.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace
```

External `ps` sampling must be permitted. Next: complete production snapshot /
source-availability admission, then compiler-backed inherited/factory/own-
constructor coverage and exact differential before exclusions.
