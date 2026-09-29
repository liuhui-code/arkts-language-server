# Settings/API-24 cached references during automatic diagnostics (F6b)

Status: **F6b hot-path smoke GREEN; release gates still open**. This report
compares three fresh-process mode-C replays against the earlier
[Settings baseline](2026-09-21-settings-api24-benchmark.md). The observed
automatic-diagnostic outlier was reproduced deterministically through the
public LSP boundary and corrected only for a complete, still-valid references
cache hit. Cold and post-edit cache misses retain the diagnostic quiescence
barrier. Diagnostics were not disabled.

## Fixed inputs and validity

| Input | Value |
| --- | --- |
| Server parent revision | `3209adcdeaa7bab10db31d08ca34033aceb149b0`; F6b changes were uncommitted during replay; existing user `AGENTS.md` edit was preserved |
| Server bundle SHA-256 | `ec52e7fb552fb2bef239b996d3261d0b2e5f6f5017e8383861404d1d40849b2e` in all three runs |
| Rust sidecar SHA-256 | `8d4e95b5c603b8f43e0da9a7e62d74b127a94fe16f8b6d0afbc9fd0d6ebe40ae` |
| Real project | Clean `openharmony/applications_settings` checkout `ecc550dfaed880e04e38a2477eb7235cd50475b9` at `/private/tmp/arkts-settings-e2e.vrQQm9/project` |
| SDK | Project declares compile 23, target/compatible 20; selected DevEco ETS API 24, version `6.1.1.125`, at `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`; pinned declaration digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4` from the baseline manifest |
| Runtime | macOS Darwin 25.6.0 x64, Node `v26.3.0`; `indexed-batched + closure + full SDK`, 64 batch roots, normal automatic diagnostics |
| Request | `textDocument/references`, `MenuController` declaration, `common/src/main/ets/core/controller/MenuController.ets`, zero-based UTF-16 `70:13`, `includeDeclaration=true` |
| Measurement | Existing real child-process `LspSession`, fresh server/private index per run; external process-tree RSS sampler configured for 50 ms (actual sample timestamps retained), sampler memory separate |

The manifest's server hash still identifies the **earlier** bundle, so these
same-build replays deliberately omitted `--manifest` and supplied the pinned
query, SDK and oracle explicitly. Each raw report records its effective
environment, server/sidecar hashes, framed protocol transcript, event timeline,
normalized Locations and RSS samples. This is an API-24 **compatibility** run
of a project declaring compile 23, not proof of matched API-23 or DevEco
equivalence.

## Public-boundary RED/GREEN

The [TDD record](../tdd/references-diagnostic-cache.md) captures a
Content-Length-framed LSP RED: with automatic diagnostics deliberately held
in progress by a default-off test delay, a valid cached references request
waited for diagnostic quiescence. GREEN moves only the already-complete cache
hit ahead of that wait. The test then observed the same exact references
result **before** diagnostic settlement, below 500 ms, and subsequent
versioned diagnostic publication. Ten focused public tests passed, including
cache invalidation, coalescing, scheduling and diagnostic regressions. Cache
misses still await quiescence before compiler verification.

## Three independent real-project replays

Each process made ten version-1 references requests, then an unsaved comment
edit and one version-2 request. Each returned 11 successful responses of 248
exact Locations, with zero missing/extra/invalid ranges against the same
[compiler-based oracle](../../bench/references/oracles/settings-menucontroller-api24.json).
All three published normal version-2 diagnostics (18 entries). Each recorded
nine cache hits and two misses (initial and post-edit).

| Run/raw report | Cold first request | Nine unchanged cache hits | Post-edit miss | Peak server + sidecar RSS |
| --- | ---: | --- | ---: | ---: |
| [4](/private/tmp/settings-api24-f6b-c-4.json) | 5,913 ms | 60–96 ms | 5,389 ms | 848,039,936 bytes |
| [5](/private/tmp/settings-api24-f6b-c-5.json) | 6,065 ms | 63–89 ms | 5,751 ms | 849,141,760 bytes |
| [6](/private/tmp/settings-api24-f6b-c-6.json) | 5,954 ms | 60–100 ms | 5,454 ms | 853,094,400 bytes |

Across the 27 unchanged hits: **median 67 ms, observed nearest-rank P95
96 ms, maximum 100 ms**. The previous build's three independent processes
had 27 hits at median 61 ms and observed P95 1,983 ms; one hit per process
took 1,963–1,990 ms. The F6b sample no longer shows those outliers. These
are end-to-end framed-LSP times, not the approximately 1 ms server-side cache
lookup duration. Three processes and 27 hits are smoke evidence, not a stable
release-tail estimate or proof that all navigation completes within 500 ms.

Peak values count the target Node process and Rust sidecar once. Worker-thread
RSS is not summed a second time; harness/sampler RSS is separate in raw data.
The peaks are similar to the old mode-C peaks (842,301,440–850,317,312
bytes), so this slice makes **no memory-improvement claim**. PSS and DevEco
comparison are not measured here.

## Reproduce

From the repository root after building the F6b server bundle and the release
sidecar, with the pinned checkout and SDK at the paths above:

```sh
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-e2e.vrQQm9/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/core/controller/MenuController.ets \
  --symbol MenuController --line 70 --character 13 \
  --oracle bench/references/oracles/settings-menucontroller-api24.json \
  --out /private/tmp/settings-api24-f6b-c-replay.json \
  --mode C --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 0
```

Do not add the old manifest until its server hash is updated to the exact
build being compared. Preserve normal diagnostics and the real project
boundary; do not alter SDK selection or duplicate files to change scale.

## Open gates

- The cold/post-edit requests still take roughly 5.4–6.1 seconds; the user's
  500 ms target is demonstrated here only for complete same-snapshot cache
  hits, not navigation generally.
- The 18 published errors include missing SDK modules and standard globals.
  Their diagnostic correctness for this compile-23 project using API 24
  remains unverified; API-23-matched/DevEco comparison is separate.
- Add a second real Settings symbol and `includeDeclaration=false` exact
  oracle; run randomized larger samples before interpreting P95 as release
  evidence.
- The original >3 GB reproducer, final references 50% memory reduction and
  general release PSS gates remain open. No claim that the 5 GB issue is
  resolved follows from this run.
