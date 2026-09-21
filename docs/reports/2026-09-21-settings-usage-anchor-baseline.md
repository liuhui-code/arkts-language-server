# Settings usage-site reference anchor: fixed baseline

Status: **6/6 exact real-project replays; duplicated cold compiler preparation
observed; no optimization or release gate completed**. The
[TDD record](../tdd/references-settings-usage-anchor-baseline.md) records the
manifest RED and pinned GREEN.

## Fixed case

The clean `openharmony/applications_settings` checkout is
`ecc550dfaed880e04e38a2477eb7235cd50475b9` at
`/private/tmp/arkts-settings-e2e.vrQQm9/project`. It declares compile API 23;
the selected DevEco ETS SDK is API 24, version `6.1.1.125`, declaration digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
The pinned [manifest](../../bench/references/manifests/settings-homeinitdata-api24-usage-no-declaration.json)
records the exact Node and built artifact hashes. This is a same-selected-SDK
compatibility differential, **not** API-23 or DevEco semantic equivalence.

The request is `textDocument/references` on `HomeInitData` at its real
`new HomeInitData()` usage in
`common/src/main/ets/sendable/HomeInitData.ets`, zero-based UTF-16 `(28,30)`,
`includeDeclaration=false`. The existing
[nine-location oracle](../../bench/references/oracles/settings-homeinitdata-api24-no-declaration.json)
includes the current usage, the common barrel and seven phone consumer usages.
Each run starts a new server and private index, catalogs 1,846/1,846 files,
opens the document, and issues references first. Normal automatic diagnostics
stay enabled. Six sorted normalized Location arrays are identical, SHA-256
`af899f9d66934ede16f63e436c1c0eb367961b20335b9c598299189dec8b7010`
over `jq -S -c '.normalizedReferences'`; absolute checkout URIs make this
hash local to the fixed path.

## Six-run observation

The request interval starts after catalog and ends at the LSP response. RSS is
externally sampled for the Node server PID plus Rust sidecar; Worker threads
are included once in Node RSS, and the harness is separate. The nominal
sampling interval is 50 ms, not a promise to catch the exact instantaneous
peak. All version-1 target-file diagnostic lists were empty and published
normally after the response.

| Strategy | Request durations, ms | Median | Product peak RSS, bytes | Median peak |
| --- | --- | ---: | --- | ---: |
| `legacy` | 8,904 / 8,631 / 8,628 | 8,631 | 790,999,040 / 781,504,512 / 794,034,176 | 790,999,040 |
| `indexed-batched` | 7,355 / 7,191 / 7,132 | 7,191 | 573,898,752 / 573,988,864 / 584,445,952 | 573,988,864 |

All six returned 9/9 exact Locations, with no request error, timeout or OOM.
For this small n=3 observation, indexed-batched's median is 16.7% faster and
its sampled median product peak 27.4% lower than legacy. Neither figure is a
stable P95 or a product-wide memory claim. The 7.19-second indexed median is
still far above the user's 500 ms cold-navigation goal.

Every indexed run used a **separate transient anchor verifier** first:

| Trace event | Indexed runs, ms | Median | Compiler scope |
| --- | --- | ---: | --- |
| `references.anchor.complete` | 2,055 / 2,053 / 1,994 | 2,053 | 308 SourceFiles, one project SourceFile |
| `references.candidate-selection.complete` | 4,099 / 4,031 / 3,949 | 4,031 | **Includes**, rather than adds to, anchor time |
| `references.batch.complete` | 3,224 / 3,126 / 3,150 | 3,150 | 613 SourceFiles, 151 project SourceFiles |

The single batch's `workerCreateProgramMs` was 2,380 / 2,324 / 2,307;
its `workerQueryMs` was 52 / 55 / 52. The index accepted the anchor as
`compiler-definition-identity` in all three runs. This directly supports
researching R-10 anchor reuse/fusion for **usage-site** queries. It does not
prove that ~2 seconds can be removed: candidate selection, source resolution,
batch closure and final symbol identity still require exact semantics.
The declaration-position benchmark had no separate anchor Program, so the
two positions must not be pooled as one latency distribution.

Raw reports and full external curves:

- Indexed-batched: [1](/private/tmp/settings-homeinitdata-usage-pinned-indexed-batched-1.json), [2](/private/tmp/settings-homeinitdata-usage-pinned-indexed-batched-2.json), [3](/private/tmp/settings-homeinitdata-usage-pinned-indexed-batched-3.json)
- Legacy: [1](/private/tmp/settings-homeinitdata-usage-pinned-legacy-1.json), [2](/private/tmp/settings-homeinitdata-usage-pinned-legacy-2.json), [3](/private/tmp/settings-homeinitdata-usage-pinned-legacy-3.json)

These `/private/tmp` files can expire; the command in the TDD record
recreates one run. The original >3 GB reproducer, final 50% memory gate,
PSS/DevEco comparison, native Windows behavior and release-size performance
sample remain open. No production algorithm, worker count, memory limit or
diagnostic behavior changed in this slice.
