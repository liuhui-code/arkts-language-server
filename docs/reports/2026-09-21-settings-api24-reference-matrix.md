# Settings/API-24 references strategy matrix (R-02)

Status: **fixed real-project smoke matrix passed exactness; cold latency and release gates remain open**. This extends the [Settings standard-library report](2026-09-21-settings-api24-standard-library.md); it does not replace the original >3 GB reproducer or final 50% references memory gate.

## Fixed inputs and measurement

| Input | Value |
| --- | --- |
| Server revision | `9cc3768e874176593a24dc6cc2606ea2b851fe97` on the PR #91 branch; the separate user-owned `AGENTS.md` edit was present but not part of the build |
| Real project | Clean `openharmony/applications_settings` checkout `ecc550dfaed880e04e38a2477eb7235cd50475b9` at `/private/tmp/arkts-settings-e2e.vrQQm9/project` |
| SDK | Project declares compile API 23; selected DevEco ETS API 24 (`6.1.1.125`) at `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, declaration digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4` |
| Runtime | macOS Darwin 25.6.0 x64, Node `v26.3.0`; full SDK ambient profile, closure dependencies, 64 batch roots, normal automatic diagnostics |
| Artifacts | Entry bundle `ec52e7fb552fb2bef239b996d3261d0b2e5f6f5017e8383861404d1d40849b2e`; semantic Worker `d41171d961eb4e6436f81f9ae97928860b5d7e932d30e9bd60832db54e0d6558`; verifier Worker `08c2bcb91537a3c0f8dfca0003a7b1cd81a7ae7ef6e6761b3b25efe1e29b6200`; standard-library composite `ea78beea2aa84f93fe66645465c37eb916028b79cd9fe898d469bdf54efbf97d`; sidecar `8d4e95b5c603b8f43e0da9a7e62d74b127a94fe16f8b6d0afbc9fd0d6ebe40ae` |

Each mode-A run started a new server and a private index cache, catalogued 1,846/1,846 files, opened the target document, then sent `textDocument/references` first. The reported duration spans that request to its response, **not** initialize or catalog time. Product peak is the external sampler's server-plus-sidecar RSS, counting Worker threads only inside the one Node PID; harness RSS is separate. The sampler targets 50 ms but actual intervals can vary. These are process/index-cold runs with OS caches uncontrolled, not semantic-cold runs over a precommitted index. No PSS or DevEco measurement was made.

## `HomeInitData`, `includeDeclaration=false`

The declaration is `common/src/main/ets/sendable/HomeInitData.ets` at zero-based UTF-16 `16:13`. The [pinned manifest](../../bench/references/manifests/settings-homeinitdata-api24-no-declaration.json) and [nine-location oracle](../../bench/references/oracles/settings-homeinitdata-api24-no-declaration.json) include a common barrel re-export and phone consumer usages, but exclude the declaration. All nine fresh processes passed exact normalized URI/range comparison, with no target-file diagnostics. The nine normalized Location arrays are identical across all strategies.

| Strategy | Request durations, ms (runs 1–3) | Median, ms | Product peak RSS, bytes (runs 1–3) | Median peak, bytes | Raw replay |
| --- | ---: | ---: | ---: | ---: | --- |
| `legacy` | 9,774 / 8,905 / 8,857 | 8,905 | 780,009,472 / 784,814,080 / 789,626,880 | 784,814,080 | [1](/private/tmp/settings-homeinitdata-matrix-legacy-1.json), [2](/private/tmp/settings-homeinitdata-matrix-legacy-2.json), [3](/private/tmp/settings-homeinitdata-matrix-legacy-3.json) |
| `batched` | 93,179 / 92,775 / 93,943 | 93,179 | 720,121,856 / 741,953,536 / 733,638,656 | 733,638,656 | [1](/private/tmp/settings-homeinitdata-matrix-batched-1.json), [2](/private/tmp/settings-homeinitdata-matrix-batched-2.json), [3](/private/tmp/settings-homeinitdata-matrix-batched-3.json) |
| `indexed-batched` | 5,172 / 5,019 / 5,012 | 5,019 | 559,669,248 / 558,444,544 / 556,470,272 | 558,444,544 | [1](/private/tmp/settings-homeinitdata-matrix-indexed-batched-1.json), [2](/private/tmp/settings-homeinitdata-matrix-indexed-batched-2.json), [3](/private/tmp/settings-homeinitdata-matrix-indexed-batched-3.json) |

In this small fixed sample, pure `batched` took about **10.5×** the legacy median request time while its median product RSS peak was only about **6.5%** lower. `indexed-batched` was about **43.6%** faster than legacy at the medians and its median product RSS peak was about **28.8%** lower. These are descriptive comparisons for three non-release runs, not statistically stable P95 values, a guarantee on other symbols, or proof of the final memory gate. In particular, even the best observed cold request exceeded the user's **500 ms** navigation target by roughly tenfold.

## Opposite declaration-policy checks

The newly frozen [HomeInitData-with-declaration manifest](../../bench/references/manifests/settings-homeinitdata-api24-with-declaration.json) and [oracle](../../bench/references/oracles/settings-homeinitdata-api24-with-declaration.json) add the one declaration Location to the nine usages. A fresh pinned legacy replay returned 10/10 exact Locations in 8,876 ms at 788,107,264 bytes peak; a fresh pinned indexed-batched replay returned the same 10/10 in 5,043 ms at 563,699,712 bytes peak. Both published zero target-file diagnostics: [legacy raw](/private/tmp/settings-homeinitdata-with-declaration-legacy-1.json), [indexed raw](/private/tmp/settings-homeinitdata-with-declaration-indexed-1.json).

The newly frozen [MenuController-without-declaration manifest](../../bench/references/manifests/settings-menucontroller-api24-no-declaration.json) and [oracle](../../bench/references/oracles/settings-menucontroller-api24-no-declaration.json) remove only the declaration Location from the earlier 248-location oracle. A fresh pinned legacy replay returned 247/247 exact Locations in 8,960 ms at 794,812,416 bytes peak; a fresh pinned indexed-batched replay returned the same 247/247 in 6,111 ms at 639,008,768 bytes peak: [legacy raw](/private/tmp/settings-menucontroller-no-declaration-legacy-1.json), [indexed raw](/private/tmp/settings-menucontroller-no-declaration-indexed-batched-1.json). Both retained the one TS 2307 diagnostic for `@ohos.systemparameter`; its validity against the declared API 23 or DevEco remains unverified.

The four policy/symbol pairs now have fixed oracles. Only `HomeInitData` without declaration has this new three-run A/B/C matrix; the two opposite-policy comparisons above are **one fresh process per strategy** and cannot establish performance distributions. PR [#91](https://github.com/liuhui-code/arkts-language-server/pull/91) reported its `validate` and `windows-install` checks passing at `9cc3768`; that CI status does not mean the Settings replay ran natively on Windows.

## Warmed and repeat/edit replays

With the same pinned `HomeInitData` nine-location oracle and `indexed-batched`
strategy, three independent fresh-process mode-B replays completed completion
and definition warmups before references. All three returned 9/9 exact
Locations and empty version-1 target diagnostics:

| Mode-B run | Completion warmup | Definition warmup | References | Full-run product peak RSS | Raw replay |
| --- | ---: | ---: | ---: | ---: | --- |
| 1 | 8,613 ms | 34 ms | 4,259 ms | 1,146,388,480 bytes | [raw](/private/tmp/settings-homeinitdata-mode-b-indexed-20260921.json) |
| 2 | 8,608 ms | 39 ms | 4,616 ms | 1,094,619,136 bytes | [raw](/private/tmp/settings-homeinitdata-mode-b-indexed-20260921-2.json) |
| 3 | 8,687 ms | 37 ms | 4,404 ms | 1,136,500,736 bytes | [raw](/private/tmp/settings-homeinitdata-mode-b-indexed-20260921-3.json) |
| Observed median | 8,613 ms | 37 ms | 4,404 ms | 1,136,500,736 bytes | — |

The mode-B median full-run peak is about **2.04×** the mode-A indexed median
of 558,444,544 bytes. These are **different workflows**, not an isolated
references-memory A/B: the mode-B peak sample occurred near the references
response, but completion/definition may have left compiler state resident.
The warmup calls succeeded at the protocol level; their *contents* were not
checked against completion/definition goldens. Three samples are insufficient
for a stable P95 or a hot-context policy change.

### Controlled mode-B context-retention comparison

Three further independent mode-B processes changed only
`ARKTS_REFERENCES_CONTEXT_RETENTION=budget-aware` from the production
`dispose` profile. All passed the same pinned 9/9 reference oracle and empty
version-1 target diagnostics. Every retained run logged
`references.context.retention` with `residentBefore=1`, `residentAfter=1`,
`removed=false`; all three dispose runs logged `1`, `0`, `true` respectively.

| `budget-aware` run | Completion warmup | Definition warmup | References | Full-run product peak RSS | Raw replay |
| --- | ---: | ---: | ---: | ---: | --- |
| 1 | 8,611 ms | 40 ms | 4,191 ms | 1,137,713,152 bytes | [raw](/private/tmp/settings-homeinitdata-mode-b-budget-aware-20260921-1.json) |
| 2 | 8,539 ms | 39 ms | 4,017 ms | 1,128,755,200 bytes | [raw](/private/tmp/settings-homeinitdata-mode-b-budget-aware-20260921-2.json) |
| 3 | 8,536 ms | 36 ms | 4,072 ms | 1,129,537,536 bytes | [raw](/private/tmp/settings-homeinitdata-mode-b-budget-aware-20260921-3.json) |
| Observed median | 8,539 ms | 39 ms | 4,072 ms | 1,129,537,536 bytes | — |

The dispose B medians above were 4,404 ms references and 1,136,500,736
bytes full-run peak. The retained medians differ by 332 ms and 6,963,200
bytes in this three-versus-three sample: too small and too sparse to claim a
clear latency or memory win or change the default. Both profiles still peak
around **1.13 GB**, and the configured 1,024 MiB semantic budget is a policy
threshold, **not a hard Node-process RSS cap**. No post-eviction PSS gate was
run; completion/definition contents were not oracle-checked; first references
remained above 500 ms under both profiles.

One new fresh-process mode-C replay returned the same 9/9 exact Locations on
all **11** requests (`repeatedResultsIdentical=true`): the first cold request
took 5,018 ms, the nine unchanged-snapshot repeats took **2–3 ms each**, and
the request after an unsaved comment edit to document version 2 took 3,855 ms.
The full-run product peak was **579,821,568 bytes**. One empty version-2
`publishDiagnostics` notification arrived after the edit/retry; this raw run
did **not** capture a version-1 notification, so a complete per-version
diagnostic sequence is not proven by this replay. [Raw mode-C replay](/private/tmp/settings-homeinitdata-mode-c-indexed-20260921.json).

The six B runs and one C run used the same fixed checkout, API-24 SDK digest,
server and runtime-asset hashes as mode A, each with a new process and private
index cache. They are not release-level warm/edit performance or memory
evidence. In particular, warmup did not bring first references below 500 ms;
only unchanged-snapshot repeats met that target in the single C run.

## Reproduce and remaining gates

From the pinned checkout, SDK, server/sidecar build and artifacts above, this command replays one fresh indexed-batched `HomeInitData` request with the manifest's SDK, oracle and artifact preflight:

```sh
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-e2e.vrQQm9/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --symbol HomeInitData --line 16 --character 13 \
  --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-homeinitdata-api24-no-declaration.json \
  --out /private/tmp/settings-homeinitdata-api24-replay.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 0
```

This is an **API-24 compatibility run** of a project declaring compile API 23. It establishes same-selected-SDK exactness across tested strategies and declaration policies; it does **not** establish API-23 or DevEco equivalence. R-02 still needs larger randomized/independent samples (especially mode C), edit-warm diagnostic/freshness coverage, native Windows characterization, the original >3 GB reproducer and final 50%/product PSS release gates. Do not graduate F2 or claim the 5 GB problem solved from this matrix. Cold navigation remains far above 500 ms.
