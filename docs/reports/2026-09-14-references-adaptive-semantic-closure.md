# References adaptive semantic-closure gate

## Outcome

The compiler working-set batching path now expands only the semantic-unit batch
that encounters a real, workspace-member import outside its declared project
closure. It preserves already completed batch results and retries the failed
batch with the newly observed unit plus its declared dependency closure. Paths
remain internal to the verifier/executor boundary; structured logs expose only
bounded counts.

This closes the fallback observed in the fixed OpenHarmony Photos replay. The
same `PhotoAsset` request returned all 15 r10 legacy locations in three
independent fresh processes, with two completed semantic-unit batches, one
adaptive expansion, and no conservative restart in every run.

| Run | Request | Product-tree peak RSS | Final batches | Expansion | Max project files |
|---|---:|---:|---:|---:|---:|
| 1 | 12.967 s | 570,724,352 B | 2 | 3 units / 229 files | 393 |
| 2 | 15.446 s | 623,849,472 B | 2 | 3 units / 229 files | 393 |
| 3 | 20.310 s | 576,552,960 B | 2 | 3 units / 229 files | 393 |
| Median | 15.446 s | 576,552,960 B | 2 | 3 units / 229 files | 393 |

The prior fixed run restarted four conservative batches after one completed
semantic-unit batch and one failed batch. It took 21.622 seconds and peaked at
626,348,032 bytes. Against that single historical run, the new three-run median
is 28.56% faster and 7.95% lower in peak RSS. This is directional evidence, not
a paired statistical release comparison.

The request still costs 1.56x the 9.882-second legacy run, but remains below the
prototype's `legacy × 2` latency bound. `indexed-batched` and the verifier-only
`common` SDK profile remain opt-in; this slice does not change the production
strategy or batch-root default.

## TDD evidence

Parent revision: `3a7f1e89238d715c97bf09d013fa3e8c45a019b5`.

The existing public child-process transcript for an underdeclared cross-module
relative import was changed first to require:

- exact equality with the conservative `Location[]` oracle;
- project-graph batches after recovery;
- one `references.semantic-unit.expanded` event;
- no `references.semantic-unit.fallback` event;
- no path-bearing trace field.

Before implementation, the focused test failed because the request emitted
`references.semantic-unit.fallback` and restarted three conservative batches.
After implementation, all 11 references-batching child-process tests passed.

The verifier records at most 16 denied paths, and only when the path belongs to
the frozen complete project membership but is absent from the current admitted
set. A missing path must map to a ready, complete `HarmonySemanticGraph`, and the
admission set must strictly grow. Otherwise the old conservative fallback is
retained. Retries are bounded by the number of semantic units.

## Fixed replay

```text
workspace: /private/tmp/applications_photos-6.1-lts
commit:    98ea1d9cd6a363c576e2c6ff17844e51723baec5
SDK:       /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony
API:       24 / 6.1.1.125
Node:      v26.3.0
target:    common/src/main/ets/default/view/browserOperation/RecoverMenuOperation.ets
symbol:    PhotoAsset
position:  82:26 (zero-based UTF-16)
request:   textDocument/references, includeDeclaration=true
strategy:  indexed-batched, common SDK profile, batch roots 2
```

Reproduction command:

```bash
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/applications_photos-6.1-lts \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/default/view/browserOperation/RecoverMenuOperation.ets \
  --symbol PhotoAsset \
  --line 82 \
  --character 26 \
  --oracle /private/tmp/photos-photoasset-r10-legacy.json \
  --out /private/tmp/photos-photoasset-r10-adaptive-closure.json \
  --mode A \
  --strategy indexed-batched \
  --sdk-profile common \
  --batch-roots 2 \
  --trace
```

One sampler-permission failure happened before any LSP request and is excluded.
One report write failed with `ENOSPC` and is excluded. A further run started the
index as stale/degraded, correctly fell back to conservative verification, and
timed out; it is an environment/index-readiness failure, not counted as an
adaptive-closure success.

Machine-readable summary:
[`evidence/2026-09-14-references-adaptive-semantic-closure.json`](evidence/2026-09-14-references-adaptive-semantic-closure.json).
