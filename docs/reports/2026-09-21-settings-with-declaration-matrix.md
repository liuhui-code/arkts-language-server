# Settings `HomeInitData` declaration-inclusive references matrix

Status: **9/9 real-project mode-A strategy replays passed exactness; not a release-gate result**. This extends the [`includeDeclaration=false` matrix](2026-09-21-settings-api24-reference-matrix.md) with the same real symbol and an oracle that includes its declaration. The [TDD record](../tdd/references-settings-with-declaration-matrix.md) documents the manifest-artifact RED and minimal pin refresh.

## Fixed inputs and scope

| Input | Value |
| --- | --- |
| Server revision at replay | `45a5348e1a8f44be8c6face68fb826a08eae8db7`; user-owned `AGENTS.md` edit and the one-line benchmark-manifest pin refresh were uncommitted, neither changed the built server |
| Real project | Clean `openharmony/applications_settings` checkout `ecc550dfaed880e04e38a2477eb7235cd50475b9` at `/private/tmp/arkts-settings-e2e.vrQQm9/project` |
| SDK | Project declares compile API 23, target/compatible API 20; selected DevEco ETS API 24 (`6.1.1.125`) at `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, declaration digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4` |
| Runtime | Darwin `25.6.0` x64, Node `v26.3.0`; closure dependencies, full SDK ambient profile, 64 batch roots, normal automatic diagnostics |
| Built artifacts, SHA-256 | Server `ec52e7fb552fb2bef239b996d3261d0b2e5f6f5017e8383861404d1d40849b2e`; semantic Worker `842291ecfe0a7fd7cb147af0abd6dfa16f2b0bc8e9001b0dd466ce63838a09de`; reference verifier `08c2bcb91537a3c0f8dfca0003a7b1cd81a7ae7ef6e6761b3b25efe1e29b6200`; standard library `ea78beea2aa84f93fe66645465c37eb916028b79cd9fe898d469bdf54efbf97d`; Rust sidecar `8d4e95b5c603b8f43e0da9a7e62d74b127a94fe16f8b6d0afbc9fd0d6ebe40ae` |
| Query | `common/src/main/ets/sendable/HomeInitData.ets`, `HomeInitData`, zero-based UTF-16 `16:13`, `textDocument/references`, `includeDeclaration=true` |
| Fixture | [Pinned manifest](../../bench/references/manifests/settings-homeinitdata-api24-with-declaration.json); [ten-location oracle](../../bench/references/oracles/settings-homeinitdata-api24-with-declaration.json) |

Each run starts a distinct server and private index cache, catalogs 1,846/1,846 files, opens the target, and sends references as its first semantic request. The request duration is `references-response-complete.timestamp - references-request-start.timestamp`: it excludes initialize/catalog time. An external sampler targets the server Node PID (Worker threads counted only there) plus Rust sidecar for product peak RSS; the harness is measured separately. Its nominal 50 ms interval is not a guarantee of exact peak capture. These are process/index-cold runs with uncontrolled OS caches, not semantic-cold runs over a precommitted index. No PSS or DevEco process comparison was made.

## Results

The oracle contains one declaration and nine re-export/consumer locations. A result passes only if its Location URI/range set exactly equals the oracle after the harness maps oracle-relative paths into the fixed checkout; equal counts alone are insufficient. All nine raw reports say `PASS`, each response validation says 10 expected / 10 observed / zero errors, and all nine sorted normalized result arrays have SHA-256 `100d9200b0c58c68b2eb2fc4f472c2a97265d1e536e4b7d63efbb633db0d4691` (over `jq -S -c '.normalizedReferences'`, including its newline). These arrays retain absolute file URIs under the fixed checkout; the hash is not portable to a different checkout path. Every run received a version-1 target-file `publishDiagnostics` notification with an empty diagnostic list. Automatic diagnostics were not disabled. The transcript identifies `textDocument/references` explicitly; no workspace/document-symbol request occurred.

| Strategy | Request durations, ms (runs 1–3) | Median, ms | Product peak RSS, bytes (runs 1–3) | Median peak, bytes | Raw replay |
| --- | ---: | ---: | ---: | ---: | --- |
| `legacy` | 9,460 / 9,030 / 8,740 | 9,030 | 788,803,584 / 785,092,608 / 793,755,648 | 788,803,584 | [1](/private/tmp/settings-homeinitdata-with-declaration-matrix-legacy-1.json), [2](/private/tmp/settings-homeinitdata-with-declaration-matrix-legacy-2.json), [3](/private/tmp/settings-homeinitdata-with-declaration-matrix-legacy-3.json) |
| `batched` | 90,622 / 90,894 / 91,085 | 90,894 | 736,837,632 / 743,411,712 / 747,032,576 | 743,411,712 | [1](/private/tmp/settings-homeinitdata-with-declaration-matrix-batched-1.json), [2](/private/tmp/settings-homeinitdata-with-declaration-matrix-batched-2.json), [3](/private/tmp/settings-homeinitdata-with-declaration-matrix-batched-3.json) |
| `indexed-batched` | 5,311 / 5,107 / 5,077 | 5,107 | 554,479,616 / 570,970,112 / 548,638,720 | 554,479,616 | [1](/private/tmp/settings-homeinitdata-with-declaration-indexed-green-1.json), [2](/private/tmp/settings-homeinitdata-with-declaration-matrix-indexed-batched-2.json), [3](/private/tmp/settings-homeinitdata-with-declaration-matrix-indexed-batched-3.json) |

All nine reports have the same clean checkout SHA, SDK path/version/declaration digest, server and Worker hashes, sidecar hash, query position and declaration policy. Runs were ordered `indexed → legacy → batched`, then `batched → indexed → legacy`, then `legacy → indexed → batched`, avoiding a single always-last strategy. These are independent processes, not nine requests in one reused server.
The linked raw JSON files, including external RSS samples, are local `/private/tmp` artifacts and may expire; the pinned command below recreates a run, while this report preserves the checked summary.

At the descriptive medians, pure `batched` took **10.1×** as long as `legacy` while lowering externally sampled product peak RSS by **5.8%**. `indexed-batched` was **43.4%** faster than `legacy` and lowered the median sampled peak by **29.7%**. The latter's fastest first request was still 5,077 ms; its median is **10.2×** the user's 500 ms navigation target. The small n=3 and index-cold workflow do not justify a P95, statistical significance or a broader-memory guarantee. The earlier nine-location matrix used an older semantic Worker artifact, so a cross-matrix `includeDeclaration` latency/RSS delta is not a controlled experiment.

## Limits and replay

This is a **same-selected-SDK API-24 compatibility run** of a project declaring compile API 23; it is not proof of API-23 or DevEco equivalence. Three fresh processes per arm can support a smoke comparison of medians, not a stable P95 or a general performance guarantee. Mode A does not establish warmed, repeated or edit-warm behavior for this declaration policy. The original >3 GB case, final 50% memory target, DevEco/PSS gates, native Windows characterization and ≤500 ms cold-navigation target remain separate open gates.

Run one pinned fresh-process replay from the repository root:

```sh
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-e2e.vrQQm9/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --symbol HomeInitData --line 16 --character 13 \
  --oracle bench/references/oracles/settings-homeinitdata-api24-with-declaration.json \
  --manifest bench/references/manifests/settings-homeinitdata-api24-with-declaration.json \
  --out /private/tmp/settings-homeinitdata-with-declaration-recheck.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 0
```

Omitting `--exclude-declaration` means `includeDeclaration=true`; the replay CLI has no positive `--include-declaration` option.
