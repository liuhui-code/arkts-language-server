# Settings 6.1-LTS with API 24: exploratory navigation replay

Status: **initial exploratory cross-SDK evidence**. The later pinned API-24
[benchmark](2026-09-21-settings-api24-benchmark.md) supersedes this report's
single-run performance figures; neither asserts API-23 semantic equivalence.
No Settings source, build profile, project boundary, server behavior or runtime
budget was changed. The previous [preflight](2026-09-21-references-f2-settings-preflight.md)
correctly blocked a *formal matched-SDK benchmark*, but that did not mean the
language server could not serve an API-23 project using the installed API-24
SDK. This run tests that narrower compatibility question.

## Fixed inputs

| Input | Value |
| --- | --- |
| Server HEAD | `001a44be589348712bf3ac242b1739575432dffe` (`AGENTS.md` has a pre-existing, untouched user edit) |
| Server / sidecar SHA-256 | `6a42c44b3d72ae0cb38f9bd014b10f946d087400366857c1f9433346f0337d8b` / `8d4e95b5c603b8f43e0da9a7e62d74b127a94fe16f8b6d0afbc9fd0d6ebe40ae` |
| Settings checkout | `/private/tmp/arkts-settings-e2e.vrQQm9/project`, clean `ecc550dfaed880e04e38a2477eb7235cd50475b9` |
| Project SDK settings | compile 23, target/compatible 20 |
| Selected SDK | `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, ETS API 24, component `6.1.1.125` |
| SDK declaration digest | `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4` |
| Node / platform | `v26.3.0`, macOS x86_64 |
| Symbol | `MenuController`, `common/src/main/ets/core/controller/MenuController.ets`, zero-based UTF-16 `70:13`, include declaration |
| Runtime | full SDK, closure dependencies, 64 batch roots, normal automatic diagnostics, external 50 ms process-tree RSS sampling |

The first sandboxed attempt stopped **before initialize**: the external sampler
reported `spawn EPERM`. It is not a semantic failure. The reruns allowed the
sampler to inspect the target process. Each replay used a fresh language-server
process, private index cache, and the existing framed-stdio `LspSession`.

## Observations

The first successful legacy request returned **248** UTF-16-valid Locations
across **60** Settings files, including cross-module uses. It was intentionally
run against an empty discovery oracle, so its replay status is `FAIL` solely
because the expected count was zero; the LSP response itself had no error.
The resulting normalized Location set became the **provisional legacy oracle**
for these API-24 exploratory runs. This is exact strategy differential, not
independent proof that the API-24 semantics match API 23 or DevEco.
The [frozen Location set](../../bench/references/oracles/settings-menucontroller-api24.json)
contains all 248 distinct workspace-relative ranges. It was subsequently
source-span checked and used as the pinned **same-API-24 strategy oracle**;
verification does not establish API-23 or DevEco equivalence.

| Run | Exact vs provisional legacy | Automatic diagnostics | References request | Whole-run peak process-tree RSS |
| --- | --- | --- | ---: | ---: |
| A: legacy, references first | Source oracle; 248 valid Locations | version 1, 18 | 9,829 ms | 791,580,672 B |
| A: indexed-batched, references first | 248/248, no missing or extra Location | version 1, same 18 | 6,103 ms | 628,072,448 B |
| B: indexed-batched, completion + definition first | 248/248, no missing or extra Location | version 1, same 18 | 5,598 ms | 1,063,485,440 B |
| C: indexed-batched, 10 repeats + unsaved comment edit | All 11 responses exact and identical | version 2, same 18 | first 5,943 ms; repeats 2–10 median 4,726 ms; post-edit 4,873 ms | 689,340,416 B |

In B, the separate warm-up completion took **8,703 ms** and definition took
**165 ms**. The larger whole-run RSS peak shows that a warm interactive
context plus the references verifier can cost *more* memory than cold A;
it is not evidence of a memory improvement from warming. One additional
framed-stdio `textDocument/definition` request from the real cross-module
usage `feature/aboutdevice/src/main/ets/controller/OucAboutDeviceController.ets`
at `22:46` returned the exact declaration range in `MenuController.ets`
(`70:13–70:27`) with no LSP error in **2,992 ms** on a fresh process.
These are single-run timings, not P95 measurements or proof of the 500 ms goal.

The sidecar catalog reached `ready` with 1,846 indexed files. The indexed A
run logged `references.index.accepted`, generation 1, with 63 candidate
files; the same event appeared on all 11 C requests. Thus these requests did
not silently take an unindexed legacy fallback. C recorded one `sdk.selected`
event, not one per reference request. All 11 C responses passed range and
Location-set validation; the unsaved edit was a trailing comment, not a
deliberate semantic change.

## Exact-cache v1 follow-up

After moving the bounded complete-result cache ahead of Rust candidate
selection, the same mode-C workload again returned all **248** exact Locations
on every request. The first request took 6,059 ms end to end. Requests 2–10
took 91, 1,942, 61, 57, 57, 58, 65, 85 and 111 ms (median **65 ms**).
For each cache hit the server's own request duration was only **0.60–0.90 ms**;
the 1,942 ms outlier waited before semantic dispatch while SDK/diagnostic work
occupied the existing serial queue. This is evidence for the scheduling slice,
not a cache miss. The unsaved-comment request invalidated the cache and rebuilt
the same result in 4,747 ms end to end (server duration 4,681 ms).

The trace contained two cache misses, two stores, nine hits, two candidate
selections and two verifier batches. Therefore the nine valid hits started no
index selection or verifier work. Whole-run peak process-tree RSS was
849,776,640 bytes; this single run is not used as a memory graduation claim.

An opt-in budget-aware context-retention mode-B follow-up also returned all
248 Locations. Completion plus definition warm-up took 9,472 ms, references
took 5,902 ms end to end (server duration 5,831 ms), and the trace retained
the resident context 1→1. Peak process-tree RSS was 936,415,232 bytes, compared
with 1,063,485,440 bytes in the earlier dispose-profile B run. This direction
is encouraging but is not a randomized repeated A/B and does not justify
changing the production default.

Raw reports, including request timeline, diagnostics, normalized Locations and
external RSS samples, are local to this Mac:

- `/private/tmp/settings-api24-menucontroller-legacy-discovery-unsandboxed.json`
- `/private/tmp/settings-api24-menucontroller-indexed-a.json`
- `/private/tmp/settings-api24-menucontroller-indexed-b.json`
- `/private/tmp/settings-api24-menucontroller-indexed-c.json`
- `/private/tmp/settings-api24-menucontroller-indexed-c-front-cache.json`
- `/private/tmp/settings-api24-menucontroller-indexed-b-retain.json`

Reproduce the indexed A run with a new output path and the checked-in
provisional API-24 oracle:

```sh
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-e2e.vrQQm9/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/core/controller/MenuController.ets \
  --symbol MenuController --line 70 --character 13 \
  --oracle bench/references/oracles/settings-menucontroller-api24.json \
  --out /private/tmp/settings-api24-menucontroller-indexed-new.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 0
```

## Interpretation and remaining gate

API 24 is usable for this particular Settings navigation workload; it did not
timeout or return an empty result. The indexed path agreed exactly with legacy
under the **same API-24 SDK**, while reducing this cold A run's whole-run peak
RSS by about 20.7%. That is not a cross-version correctness guarantee, a
release-grade memory ratio, or a solved 500 ms latency goal. The later pinned
API-24 benchmark supplies independent cold runs and a source-span-checked
oracle; multiple symbols, full diagnostics validation and release sampling
remain open. A matching API-23 run is optional cross-version validation, not
a prerequisite for continuing the API-24 performance work. The historical `LogUtil` case
must not be reused as an oracle without resolving its known missing uses.
