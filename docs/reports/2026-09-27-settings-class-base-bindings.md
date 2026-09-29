# Settings fresh-source base-binding prerequisite

Status: **discovery API/correctness regression PASS; constructor narrowing and
cold ≤500 ms remain open/FAIL**. No performance improvement claimed.

## Implementation boundary

[Public TDD evidence](../tdd/references-class-base-bindings.md): immutable source
input can resolve a supported unique local base or named import/explicit
re-export alias chain. It returns URI/UTF-16 span/support provenance only.
Missing, duplicate, partial, colliding, unsupported or cyclic input stays
unknown. Source validation prevents legacy numeric-token loss and quoted
export/punctuation from fabricating a binding. No second TypeChecker.

This API has **no production consumer**. Old persisted bindings omit type/lazy
and raw syntax, so a generation-bound source-validated binding snapshot is
still required before sidecar/planner use. Constructor compiler proof remains
mandatory; no candidate exclusion, SDK/default/Worker/memory-policy change.

- New public core tests **12/12 PASS**; workspace **117 PASS / 1 existing
  ignored release fixture**, zero failures.
- Release sidecar, Node v26.3.0 check/build, formatting/diff checks PASS.
- Actual child-process stdio suites **9/9 PASS**, 52,047.547 ms suite duration.
- New resolver/syntax/ranking/tests 167/183/59/367 lines, all ≤500. Touched
  core lib shrinks 1,683→1,630 but remains migration debt.
- No new whole-fast-suite claim, reset/commit/push/merge.

## Fixed environment and read-only source check

Server HEAD `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`. Clean Settings
`ecc550dfaed880e04e38a2477eb7235cd50475b9` at
`/private/tmp/arkts-settings-row-counts.BPJdST/project`; declared SDK 23/20/20
unchanged. User-approved selected SDK API24 / 6.1.1.125 at
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
Not a claim of API23/DevEco diagnostic equivalence. Node v26.3.0,
ohos-typescript 4.9.5-r10, Intel Mac.

The temporary Rust public-API probe reads the same four Settings sources as
the [lexical check](2026-09-27-settings-class-heritage-facts.md); all retain
`lexically_complete=false`. `MenuController` at UTF-16 70:13 and
`WifiSetupProxyEntryController` at 84:13 return **Unknown**, even though base
spellings are present. No inference of absence/complete constructor scope.
This four-document source probe is not a full catalog snapshot, LSP E2E or
latency experiment. Sources are not edited or expanded to manufacture success.

Probe/source/results/test logs: `/private/tmp/arkts-base-binding-validation.lEbzph/`.
`settings-base-bindings.txt` SHA256:
`f603e263cc91c883d3a4e20e87f37ad8f33057ba48ff119497b22c35e52e3115`.

## Same-build real LSP replay

[New artifact manifest](../../bench/references/manifests/settings-menucontroller-base-binding-api24.json)
pins the unchanged TS server/Worker artifacts and rebuilt sidecar
`dcdf1f28185b0277eb865a6d841ad5713e96cf6f993ae378750da786ccc8ae5f`.
Historical manifests/evidence are not overwritten. Actual constructor query:
`common/src/main/ets/core/controller/MenuController.ets`, UTF-16 **90:17**,
`includeDeclaration=false`; distinct **267-location constructor** oracle.

One fresh process/index-cold A replay, normal automatic diagnostics, external
RSS sampling, no overlapping tests/build, no forced GC/snapshot. Experimental
seed/conservative-unit flags are explicit, not production default promotion.

| Observation | Value |
| --- | ---: |
| Protocol request | `textDocument/references` |
| Request → response | **59,322 ms** |
| Exact/legal Locations | **267**, no missing/extra/error |
| Catalog | 1,846/1,846 indexed; 1 entry skipped |
| Rejected / completed verifier attempts | 1 / 14 |
| Membership / max Program project files | 1,496 / 1,348 |
| Full-search early-completion proof | 0; all conservative batches run |
| All attempts' Program readiness | **49,125.51 ms (~82.8%)** |
| All attempts' createProgram / query / startup | 40,633.77 / 2,136.44 / 4,669.72 ms |
| External Node PID peak RSS | **691,609,600 bytes** (~660 MiB) |
| External product-tree peak RSS | **693,940,224 bytes** |
| External samples / actual spacing | 661 / 89–423 ms |
| Sampler peak / harness timeline max RSS | 91,439,104 / 69,672,960 bytes |

Requested period is 50 ms; measured external sampling gaps are above. A trace
endpoint reports Node RSS 693,268,480, slightly above the external sampled
Node peak: sampling can miss between-sample peaks. No Worker RSS double-count;
sampler/harness excluded from product. Phase sums are descriptive, not assumed
mutually exclusive. No PSS/retention/release no-regression inference from one run.

Version-1 normal diagnostics arrive 2,411 ms after response: the existing
TS2307 unresolved `@ohos.systemparameter`. Graceful exit 0, no OOM/timeout/
partial success. The discovery API is not used here, so differences from prior
storage smoke cannot be attributed to it. ≤500 ms remains explicitly **FAIL**.

Raw curve/request transcript/phases/exact Locations:
[menu-base-binding-A-1.json](../../.bench/anchor-reuse-2026-09-27/menu-base-binding-A-1.json),
SHA256 `60b7c15febf538878e81e1ab944415c4b4b47596aa8f30f648399adae3bdc184`.

Replay with a fresh output filename:

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
  --manifest bench/references/manifests/settings-menucontroller-base-binding-api24.json \
  --out .bench/anchor-reuse-2026-09-27/menu-base-binding-A-2.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace
```

Next: generation-bound validated binding/source snapshot integration, then
compiler-backed inherited/factory/own-constructor completeness before narrowing.
Original >3 GB reproducer and final memory graduation remain open.
