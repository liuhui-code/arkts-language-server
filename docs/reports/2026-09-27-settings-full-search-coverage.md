# Settings single compiler search coverage

Status: **267 exact references and normal diagnostics PASS; cold 500 ms FAIL**.
The new implementation safely avoids remaining batches only after a single
completed compiler search proves the entire original search scope. This real
Settings constructor case does **not** qualify, and no speedup is claimed.

## Implementation and public gates

[RED/GREEN](../tdd/references-full-search-coverage.md): the positive full-Program
fixture reduces four verifiers to two across both declaration policies, without
changing any Location. Disconnected inherited calls prevent premature stopping;
empty definitions produce no coverage; rejected seeds and trace-off stay exact.
New public transcript **4/4 PASS** (12,898.017 ms); explicit layer inventory
**4/4 PASS**; existing compiler phase/constructor/batching/cancellation gates
**7/7 PASS** (118,634.069 ms). Check/build and `git diff --check` pass.
The 996-test full gate recorded previously is for the previous implementation.

Fresh authorized `pnpm check:fast` on this implementation: **1,000/1,000 PASS**,
exit 0, zero failures/cancellations/skips/todos, **932,570.833 ms**. This is a
whole-suite regression gate, not performance graduation. No source/test edits
after it; the replay preceded it without overlapping test load.
The changed oversized engine shrinks 3,760→3,712 lines through cohesive metric
extraction, but remains migration debt; new helpers/test/executor stay below 500.

Raw compiler definitions, actual `findReferences`, unchanged Program identity,
full exact mapping and final membership checks establish the proof. Original
membership/query/all overlays must be present in that **one** Program. No
source counts, candidate subset, index class identity or cross-batch union can
substitute. Tolerated unadmitted dependencies disable the proof. Compiler
remains authority; Worker lifetime, concurrency, SDK/defaults/budgets stay fixed.

## Fixed environment and replay

Parent server HEAD `9f91122ac504365c57473a430094da09baac9309`, dirty
`codex/references-f2-fixed-benchmark`; all existing changes preserved.
Clean Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9` at
`/private/tmp/arkts-settings-row-counts.BPJdST/project`. SDK declarations
23/20/20 unchanged, selected API24/6.1.1.125 explicitly accepted for compatible
same-SDK comparisons, not DevEco/API23 diagnostic equivalence. Node v26.3.0,
ohos-typescript 4.9.5-r10, current Intel Mac. The
[new manifest](../../bench/references/manifests/settings-menucontroller-search-coverage-api24.json)
pins repository, SDK digest, server, Workers, stdlib, sidecar and the distinct
267-location constructor oracle. Earlier manifests/raw runs are not overwritten.

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
  --manifest bench/references/manifests/settings-menucontroller-search-coverage-api24.json \
  --out .bench/anchor-reuse-2026-09-27/menu-search-coverage-A-1.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000 --trace
```

One fresh process/index-cold run, UTF-16 cursor **90:17**, declaration excluded.
Normal automatic diagnostics on; independent external PID/tree RSS sampler;
no concurrent test suite during replay, forced GC, heap snapshot, workspace
boundary edits, fake scale or altered result completeness. Experimental
seed/grouping flags remain opt-in; this run does not promote them.

## Result

| Observation | Value |
| --- | ---: |
| References request → response | **54,306 ms** |
| Exact/legal constructor Locations | **267**, no errors/missing/extra |
| Rejected attempts / complete batches | 1 / 14 |
| Membership / maximum single Program project files | 1,496 / 1,348 |
| Full-search coverage accepted / skipped batches | **0 / 0** |
| All attempts' Program readiness | 45,266.15 ms (~83.4% of request) |
| All attempts' reference query time | 1,807.10 ms |
| All attempts' startup time | 3,956.74 ms |
| Target Node PID peak RSS | **841,601,024 bytes** |
| Product process-tree peak RSS | **883,486,720 bytes** |
| External samples / actual spacing | 356 / 161–255 ms |
| Sampler peak / harness timeline maximum RSS | 115,585,024 / 76,410,880 bytes |

Requested 50 ms is not achieved by the external `ps` sampler; actual spacing
is reported and peaks may be missed between samples. Worker-thread RSS is
never added twice; sampler/harness are separate from product memory. Phase
readiness/query/startup sums are descriptive, not assumed disjoint attribution.

Normal version-1 diagnostics publish 2,100 ms after the references response,
with the existing unresolved `@ohos.systemparameter` diagnostic (TS2307).
Server shuts down/exit 0; no timeout/OOM/partial response. A single sample
cannot establish P95, plateau, no-regression, memory reduction or causality.

Raw curve/timeline/results remain in
`.bench/anchor-reuse-2026-09-27/menu-search-coverage-A-1.json`, SHA256
`1e665a397c34e0fab2cdd7a2df09ab36816dca0e544367260b357075531660c4`.

## Decision

No legal file is dropped to make Settings eligible. This safe prerequisite
does not solve its repeated preparation: no single batch covers all membership.
Next constructor narrowing requires a real inheritance/alias/factory completeness
model with fail-conservative fallback, not class-export proof. Cold/edit ≤500 ms,
original >3 GB reproducer, final 50% memory and release graduation remain open.
No commit, push or merge.
