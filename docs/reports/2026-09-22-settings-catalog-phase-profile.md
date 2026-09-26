# Settings fresh catalog: native phase timing

Status: **measured bottleneck, no optimization or product graduation**.

The same clean OpenHarmony Settings checkout
`ecc550dfaed880e04e38a2477eb7235cd50475b9` was used at
`/private/tmp/arkts-settings-e2e.vrQQm9/project`. It declares compile API 23;
the selected DevEco OpenHarmony API 24 (`6.1.1.125`) is a fixed compatibility
configuration, not a claim of SDK equivalence. Node was `v26.3.0`. The server
bundle SHA-256 was
`5a4cf266d6765bd452fe0a9ac87d93b545c4d0cc6b36e7a3d035e48b9cbf3c5e`;
the Rust sidecar SHA-256 was
`8d4e95b5c603b8f43e0da9a7e62d74b127a94fe16f8b6d0afbc9fd0d6ebe40ae`.
The previously verified SDK declaration digest for this path was
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.

Each run used a fresh server and private index cache, waited for the first
catalog commit, then ran the same usage-site `textDocument/references` oracle
for `HomeInitData` at zero-based UTF-16 `28:30`, without the declaration.
Normal diagnostics remained enabled. The opt-in trace records the original
sidecar phase on receipt by the Node process; a separate 50 ms macOS sampler
measured product-tree RSS. All three requests returned all nine exact
Locations with no missing or extra entries.

| Fresh run | Files | Discovering → activating | Activating → ready | Total catalog trace | References after ready | Product-tree peak RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1,846 | 963 ms | 11,853 ms | 12,816 ms | 7,506 ms | 575,250,432 B |
| 2 | 1,846 | 797 ms | 10,332 ms | 11,128 ms | 7,241 ms | 572,948,480 B |
| 3 | 1,846 | 803 ms | 10,181 ms | 10,984 ms | 7,265 ms | 585,261,056 B |

Median `activating → ready` was **10,332 ms**, about **92.8%** of the median
catalog trace. The earlier 24–30 second first-click catalog observations used
a different server build/workflow and should not be pooled with this series.
These three sequential samples are diagnostic, not release-level P95 data.

`discovering → activating` includes directory traversal, source reads and
interleaved parsing. `activating → ready` includes SQLite open/activation,
commit and event-delivery overhead; it is a strong upper-bound proxy for the
database stage, not yet a breakdown of individual SQL statements. The evidence
therefore prioritizes measurement *inside* activation before changing Rust
indexing algorithms. It does not prove scanning or parsing is always cheap on
another disk or project, nor that optimizing SQLite alone reaches 500 ms
navigation: even the post-catalog references took over seven seconds.

A fourth same-build, fresh-cache run took a five-second macOS `sample` of the
Rust sidecar beginning shortly after launch. Its recorded activation started
at `16:51:36.930Z`; the sample began at `16:51:36.352Z`, so most of its window
overlapped activation. In the sampled catalog-thread call graph, 3,234 of
3,710 ticks were in SQLite `replace_all`; 1,936 plus 903 ticks were in
`insert_reference_documents` and its occurrence-identity insert branch.
SQLite B-tree insertion and WAL page writes were visible below those frames.
This is stack-sampling evidence for a **reference-row write hotspot**, not a
wall-time percentage for the entire transaction or proof that one SQL
statement alone causes the full delay. The fourth replay still returned 9/9
exact references. Its raw artifacts are:

```text
/private/tmp/settings-homeinitdata-catalog-sample-2.json
/private/tmp/settings-catalog-sidecar-sample-2.txt
```

The next controlled change should test one reference-insertion improvement
against this same fixture, while preserving SQLite generation atomicity,
query completeness, and peak product memory. Do not tune parser workers or
alter semantic scope based on this profile.

Raw replay reports, including phase events, exact results, normal diagnostics
and independent RSS samples, are retained locally:

```text
/private/tmp/settings-homeinitdata-catalog-phase-1.json
/private/tmp/settings-homeinitdata-catalog-phase-2.json
/private/tmp/settings-homeinitdata-catalog-phase-3.json
```

To repeat with a new output path after `pnpm build`:

```sh
ARKTS_INDEX_CATALOG_TRACE=1 \
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-e2e.vrQQm9/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --symbol HomeInitData --line 28 --character 30 --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --out /private/tmp/settings-homeinitdata-catalog-phase-next.json \
  --mode A --catalog-state ready --strategy indexed-batched \
  --sdk-profile full --dependency-profile closure --batch-roots 64 \
  --idle-ms 0 --trace --timeout-ms 120000
```
