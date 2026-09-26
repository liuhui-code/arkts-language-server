# Settings API-24 compatibility benchmark: reference strategy and hot tail

Status: **pinned same-SDK A/B/C smoke benchmark; product gates open**. The
Settings checkout declares compile SDK 23, target/compatible 20; this replay
intentionally selects the locally installed ETS API 24. API 23 is not required
to continue measuring this configuration. These results do not establish
general API-23/API-24 or DevEco diagnostic equivalence.

## Fixed workload

| Input | Value |
| --- | --- |
| Server revision | `f2881aa49725672ac5ef6dc99268026164b61ea5`; existing `AGENTS.md` edit left untouched |
| Server / sidecar SHA-256 | `afb0e7084480ee5fa1c4bdc909b0a13a8d81deeed306bdf3c2d6ba67f8b2c60f` / `8d4e95b5c603b8f43e0da9a7e62d74b127a94fe16f8b6d0afbc9fd0d6ebe40ae` |
| Settings revision | clean `ecc550dfaed880e04e38a2477eb7235cd50475b9` at `/private/tmp/arkts-settings-e2e.vrQQm9/project` |
| Selected SDK | `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, ETS API 24, `6.1.1.125`, declaration digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4` |
| Runtime | macOS x86_64, Node `v26.3.0`, `indexed-batched + closure + full SDK`, 64 batch roots |
| Request | `textDocument/references`, `MenuController` declaration in `common/src/main/ets/core/controller/MenuController.ets`, zero-based UTF-16 `70:13`, `includeDeclaration=true` |
| Sampling | Existing framed-stdio `LspSession`, normal automatic diagnostics, external 50 ms process-tree RSS; fresh server/private index per run |

The [manifest](../../bench/references/manifests/settings-menucontroller-api24.json)
pins the exact inputs and the [248-Location oracle](../../bench/references/oracles/settings-menucontroller-api24.json).
Every oracle range was checked against the real Settings source text and
selects exactly `MenuController`; the known cross-module use at
`feature/aboutdevice/src/main/ets/controller/OucAboutDeviceController.ets`
`22:46` is present and its definition request points to the declaration.
This verifies a useful same-SDK *strategy differential* oracle, not every
possible semantic reference or SDK-version equivalence.

## Results

All nine mode-A runs returned the same 248 exact, distinct Locations, with
zero missing/extra/invalid ranges. Each also published 18 diagnostics. The
whole-run peak below includes the server and Rust sidecar once; Node worker
RSS is not added a second time. Times are end-to-end LSP request times.

| Strategy, three independent cold processes | Request duration (ms) | Median (ms) | Peak process-tree RSS (bytes) | Median peak (bytes) |
| --- | --- | ---: | --- | ---: |
| `legacy` | 9,684 / 9,032 / 8,867 | 9,032 | 782,360,576 / 787,144,704 / 788,578,304 | 787,144,704 |
| `batched` | 90,171 / 89,790 / 92,484 | 90,171 | 735,158,272 / 747,442,176 / 749,711,360 | 747,442,176 |
| `indexed-batched` | 6,098 / 6,023 / 6,111 | 6,098 | 635,400,192 / 639,213,568 / 630,226,944 | 635,400,192 |

For this symbol and SDK, indexed batching lowered median cold peak RSS
**19.3%** versus legacy and was **32.5%** faster. Pure conservative batching
was approximately ten times slower than legacy despite a small RSS decrease;
it remains a correctness fallback, not a product default. Three samples are
smoke evidence, not a stable P95 or release-memory gate.

Three additional fresh-process mode-C runs each did ten same-snapshot
references, then an unsaved trailing-comment edit and one more references.
All 33 responses contained the exact 248-Location set; the edit invalidated
the cache and the post-edit request rebuilt. The 27 unchanged repeat requests
had **61 ms median** but **1,983 ms observed nearest-rank P95**. One repeat in
each process took 1,983 / 1,963 / 1,990 ms, respectively. The remaining 24
were 55–97 ms. The post-edit requests took 4,767 / 4,776 / 4,969 ms.
Whole-run peak process-tree RSS was 842,301,440 / 850,317,312 / 848,392,192
bytes. This fails both the plan's cached-references 200 ms P95 target and the
user's 500 ms navigation target; a fast median must not hide this tail.

Each slow repeat correlated with one `sdk.selected` event at its start, while
the eventual `references.cache.hit` and `request.completed` server work took
about 1 ms. `sdk.selected` occurred once before the edit and once afterward,
**not on every references request**. Source inspection shows the LSP
references handler awaits `suspendDiagnostics()`, whose quiescence wait
includes already-started diagnostics; this is the next latency hypothesis to
test through a failing public LSP transcript. Do not disable diagnostics or
change memory/worker policy merely to make the benchmark pass.

All 18 published diagnostics in each run were errors, including missing
`@ohos.systemparameter` and standard globals such as `Object`. The runs
establish references strategy equality under API 24; they do **not** establish
diagnostic correctness for the declared-23 project. This remains a separate
compatibility/correctness gate.

The pinned manifest was itself replayed in a fresh process and passed with
248 exact Locations and a 633,331,712-byte whole-run peak. Raw LSP timelines,
normalized results, diagnostic payloads, server events and 50 ms RSS samples
are saved locally in `/private/tmp/settings-api24-f2-uy89FQ/` as
`legacy-a-{1..3}.json`, `batched-a-{1..3}.json`, `indexed-a-{1..3}.json`,
`indexed-c-{1..3}.json` and `indexed-manifest.json`.

## Reproduce

With the pinned checkout, binaries and SDK still at the above paths:

```sh
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-e2e.vrQQm9/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/core/controller/MenuController.ets \
  --symbol MenuController --line 70 --character 13 \
  --oracle bench/references/oracles/settings-menucontroller-api24.json \
  --manifest bench/references/manifests/settings-menucontroller-api24.json \
  --out /private/tmp/settings-api24-menucontroller-new.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 0
```

Remaining F2 work: verify a second real symbol and
`includeDeclaration=false`, diagnose the 18 errors, randomize a larger
same-environment A/B/C sample, then run the existing release gates. The
original >3 GB reproducer and final 50% memory target are still open.
