# Settings mode-C attempt: catalog readiness blocks replay

Status: **two replay FAILs / exit 1 before references**. The planned ten
references plus unsaved-comment retry did not run. Cache/freshness/exactness
and normal diagnostic publication are **not evaluated**, not passed or disproven.
The original constructor 30 s regression and whole-fast failure remain open.

## Fixed input and unchanged boundaries

Parent `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`; inherited changes are preserved.
No production source, test assertions, deadlines, SDK policy, scope,
diagnostics, cache budget or Worker lifecycle is changed. No build, commit,
push or merge. A local 64-line invocation wrapper only delegates the existing
`replay-references.mjs`, LspSession and external RSS sampler.

- Clean Settings checkout `/private/tmp/arkts-settings-row-counts.BPJdST/project`,
  commit `ecc550dfaed880e04e38a2477eb7235cd50475b9`.
- SDK `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`,
  API24/6.1.1.125, digest
  `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
  This is the approved compatibility track, not API23 equivalence.
- `common/src/main/ets/core/controller/MenuController.ets`, constructor cursor
  zero-based UTF-16 **90:17**, `includeDeclaration=false`.
- [Manifest](../../bench/references/manifests/settings-menucontroller-source-availability-consumer-api24.json)
  SHA256 `169d12a76df09f2c1b3a995024a53783a331179d1c688f1089d031676313d48b`.
- Oracle 267 tuples, SHA256
  `72980d7c79e3baf44ebba8a30094484225aebe08aefd2077cda45cbdc5e90ab3`.
- Node v26.3.0; indexed-batched + closure + full SDK; batch roots64;
  anchor reuse0/local-export seed1/conservative units1, context retention
  `dispose`, memory budget1,024 MiB; trace1; Node compile cache disabled.
- Catalog-ready, request and diagnostic deadlines180,000 ms; nominal external
  sampling50 ms; post-query idle1,000 ms. No forced GC/heap snapshot.

Public manifest preflight passes. Four production artifacts plus the original
constructor/scheduling test hashes match all six frozen pins after the runs;
[consumer report](2026-09-28-settings-source-availability-consumer.md) records
the hashes. Standard-library fingerprint remains
`ea78beea2aa84f93fe66645465c37eb916028b79cd9fe898d469bdf54efbf97d`.

The manifest locks project/SDK/query/oracle/runtime assets, **not** mode,
runtime flags, deadlines or the full environment. Those are separate invocation
evidence. C-1 uses `env -i` with explicit PATH/LANG and the flags above.
C-2 retains normal macOS environment, clears inherited ARKTS/ARKLINE/DEVECO and
Node option/compile-cache variables, then sets the same flags. Its invocation
JSON records arguments and variable names without unrelated secret values.
These serial, unpaired controls do not establish environment causality.

## Actual terminal outcomes

| Observation | C-1 minimal environment | C-2 normal OS environment |
| --- | ---: | ---: |
| Target Node / sampler PID | 99277 / 99278 | 1494 / 1495 |
| initialize-response epoch ms | 1790587347943 | 1790587858612 |
| catalog-not-observed epoch ms | 1790587528506 | 1790588038784 |
| initialize complete → catalog failure | 180,563 ms | 180,172 ms |
| Replay terminal result | FAIL / exit1 | FAIL / exit1 |
| Actual references responses | 0; workload not entered | 0; workload not entered |
| didOpen / didChange / diagnostics | Not reached | Not reached |
| Node RSS observed peak | 49,766,400 B | 43,937,792 B |
| Product-tree RSS observed peak | 141,922,304 B | 124,899,328 B |
| Sidecar RSS observed peak | 130,228,224 B | 114,839,552 B |
| Sampler peak, excluded from product | 61,906,944 B | 43,134,976 B |
| Harness max timeline RSS, not continuous peak | 13,033,472 B | 12,390,400 B |
| Samples / actual median gap | 455 / 353 ms | 309 / 444 ms |
| Actual gap P95 / max | 678 / 2,616 ms | 1,489 / 3,301 ms |
| Server shutdown / exit | null result / exit0, no signal | null result / exit0, no signal |

The runner throws at its catalog-ready gate, before diagnostic subscription,
didOpen and the references loop. `diagnostic=null`, `responses=[]` and the
absent query events mean **not executed**, not reference timeout, a valid empty
result, SDK mismatch, OOM, or diagnostic suppression. The log's fixed
`REQUEST=textDocument/references` label describes the intended replay, not IO.
Both server event lists contain only started/initialized/stopped.

Bounded protocol transcripts retain128 of720/731 entries, dropping592/603;
their tails contain progress notifications and shutdown. They are not complete
method histories, do not retain progress payloads, and cannot establish index
percentage or whether an earlier progress end was ever sent. Timeline and
control flow establish that no references request is reached. No catalog
terminal event is retained in `serverEvents`. Initialize succeeds in both attempts.

RSS covers initialization/catalog/cleanup only. Separate process peaks must
not be summed; Worker-thread RSS is counted once at the target PID. Sparse
actual sampling may miss short peaks. **This is not reference memory benefit,
267-tuple equality, cache hit/invalidation, or production binding consumption.**

## Host and next gate

Read-only postflight at2026-09-28T09:36:40.791Z observes CPU speed limit51%,
swap8,622 MiB of9,216 MiB and3,620,163 wired pages of4,096 bytes on16 GiB RAM.
No matching replay/server/sampler remains. These are non-atomic host-wide
readings, not proof that host pressure or any application is the sole cause.
No user application is terminated and no restart is performed.

First restore catalog readiness in a lower-pressure same-input environment,
then run the original mode-C and 30 s/whole-fast gates. Do not bypass the
catalog-ready contract, increase timeouts, suppress diagnostics, truncate
scope, promote experimental flags or advance constructor narrowing from this
blocked run. A new cache check must correlate iteration11 with miss/rebuild/
store; identical results after a trailing comment alone do not prove freshness.
The runner's first-diagnostic predicate also does not certify version2 diagnostics.

## Retained evidence

All files below are under `.bench/anchor-reuse-2026-09-28/` and not overwritten.
The C-2 invocation JSON contains the full executable/argument list; replay with
a new unused `--out`, since existing outputs are guarded. External `ps` requires
authorized access. Raw results include timelines, process curves and protocol
diagnostic snapshots. Wrapper syntax check and `git diff --check` pass;
no fresh whole-fast result is claimed.

| Artifact | SHA256 |
| --- | --- |
| `menu-source-availability-consumer-C-1.json` | `f1ac952a2f3390ddca93b8ad0c7614f32fb66f3a9970aedae0b2327ecd14ad78` |
| `menu-source-availability-consumer-C-1.log` | `0284002c4ecaa9c0eea99654b214ab1d58b8a3ef98d114d0a8ef87d5b19c9cbc` |
| `menu-source-availability-consumer-C-2.json` | `ed82df84b40282b1bb8e7f55f142ec14fba9bb80c94f591980ec56f088a2261e` |
| `menu-source-availability-consumer-C-2.log` | `60e79608a5c4e4b4ea1987028ecfc2f341f4131bdcecae2992edcb23899633b6` |
| `menu-source-availability-consumer-C-2.invocation.json` | `2add9f7d1bbc103597b9aa7b1e6e8829354857a45b1a2416e814a6894b057333` |
| `menu-source-availability-consumer-C-2-run.mjs` | `ee3a9ec4978a31db4688b2ff053773d2030dcb8b496270f631523610d64f21ea` |
| `menu-source-availability-consumer-C-postflight.json` | `ed35fcfb11959b4f3c7b97cea670b2a653013171221b495bbc3865104a8039ff` |
