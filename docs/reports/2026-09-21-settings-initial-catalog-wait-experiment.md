# Settings initial-catalog references wait experiment

Status: **experimental; not a production-default or release-gate pass**.

## Fixed input

The real, clean OpenHarmony `applications_settings` checkout was
`ecc550dfaed880e04e38a2477eb7235cd50475b9` at
`/private/tmp/arkts-settings-e2e.vrQQm9/project`. Its declared compile API is
23. This Mac selected DevEco OpenHarmony API 24, version `6.1.1.125`, with
SDK declaration digest
`8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
This is a fixed compatibility experiment, not a claim of SDK equivalence.
Node was `v26.3.0`; the three final runs used server bundle SHA-256
`3ba1c1cc8d07f2d78f3ff8f08c78b0f8eeca21fda252e3e669e5b5c121f023a6`
and sidecar SHA-256
`8d4e95b5c603b8f43e0da9a7e62d74b127a94fe16f8b6d0afbc9fd0d6ebe40ae`.
The server source HEAD was `caafd2a` with only this experimental patch and
the pre-existing user-owned `AGENTS.md` change in the worktree.

The request was **`textDocument/references`**, not workspace/document symbol:
usage-site `HomeInitData` in
`common/src/main/ets/sendable/HomeInitData.ets`, zero-based UTF-16 position
`28:30`, `includeDeclaration=false`. The existing compiler-backed oracle has
nine exact normalized Locations. Automatic diagnostics were left enabled.
Each attempt used a fresh server and private index cache, with external 50 ms
sampling of the product process tree (Node Worker-thread RSS counted once).

The previous [immediate-catalog report](2026-09-21-settings-immediate-catalog-replay.md)
recorded a 120-second timeout after the stale-first request fixed a 23-batch
plan, even though the catalog later became ready.

## Causal probes

An initial 30-second wait completed one 9/9 request in 32.75 seconds at
532,316,160 B peak RSS. Another process reached catalog readiness at about
31.2 seconds, just after the 30-second cap; it fixed the old 23-batch plan
and timed out at 120 seconds. Raising only the cap to 60 seconds exposed a
different race: the request arrived before sidecar `open`, received
`workspace index is not open`, fixed 23 batches, and timed out even though
catalog readiness arrived about 44.3 seconds later. Neither failure produced
a partial response; their observed peaks are **not completed-query peaks**.

The public-LSP RED/GREEN then added a short cancellable pre-open handshake
and a deadline-aware sidecar status query. The final same-build repetitions:

| Fresh index-cold process | Exact references | Request | Catalog ready after request | Wait | Batches | Product-tree peak RSS | Diagnostics |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 9/9 | 39,829 ms | 23,948 ms | 24,118 ms | 1 | 536,715,264 B | v1, 0 errors |
| 2 | 9/9 | 50,548 ms | 30,281 ms | 30,377 ms | 1 | 556,167,168 B | v1, 0 errors |
| 3 | 9/9 | 47,469 ms | 29,621 ms | 29,700 ms | 1 | 559,980,544 B | v1, 0 errors |

Medians: request **47,469 ms**, wait **29,700 ms**, peak product-tree RSS
**556,167,168 B**. No run had missing or extra oracle Locations. Normal
version-1 diagnostics published only **3.8–4.7 seconds after** the references
response: the current LSP handler suspends diagnostics throughout a cache miss,
including this new wait. That diagnostic delay is an open product gate.

The local raw JSON reports preserve the complete LSP transcript, server phase
events, normalized results and external RSS samples:

```text
/private/tmp/settings-homeinitdata-initial-wait-60s-open-fix.json
/private/tmp/settings-homeinitdata-initial-wait-60s-open-fix-2.json
/private/tmp/settings-homeinitdata-initial-wait-60s-open-fix-3.json
```

The old committed manifest pins an older server bundle, so the final runner
commands intentionally omitted `--manifest` rather than bypassing its binary
check. Repo SHA, SDK digest, oracle, Node, worker/standard-library/sidecar
digests and the effective environment were checked and recorded in the raw
reports. Rebuilds must record a new server SHA. The older completed legacy
controls (31.6–38.1 seconds and 875–910 MB) used a different server build and
are excluded from the comparison below.

## Same-build first-click comparison

Three further independent index-cold processes ran `legacy` on the **same
server/sidecar binaries, checkout, SDK, symbol, oracle and external sampler**.
All returned the same nine exact Locations with ordinary diagnostics. A single
default indexed-batched process was also run without the wait flag:

| Strategy | Fresh runs | Exact result | Request times | Peak product-tree RSS |
| --- | ---: | --- | --- | --- |
| Legacy | 3 | 9/9 each | 9,574 / 8,681 / 8,581 ms | 837,541,888 / 953,434,112 / 964,247,552 B |
| Indexed-batched, initial wait 60 s | 3 | 9/9 each | 39,829 / 50,548 / 47,469 ms | 536,715,264 / 556,167,168 / 559,980,544 B |
| Indexed-batched, default no wait | 1 | 9/9 | 90,791 ms, 23 batches | 762,339,328 B |

The legacy median was **8,681 ms / 953,434,112 B**. The waited-indexed
median was **47,469 ms / 556,167,168 B**: approximately 5.47× the latency
and 41.7% lower observed peak RSS. These are sequential, non-randomized
samples, not release-level P95 or a general memory guarantee. The default
first-click run happened to finish before the 120-second timeout; it still
paid for 23 frozen batches after the initial index fallback. No strategy
met the 500 ms navigation goal. The full legacy Program's memory safety on
the original >3 GB project remains unknown, so these results do **not**
authorize switching initial warming to legacy globally.

Additional local raw reports:

```text
/private/tmp/settings-homeinitdata-same-build-legacy-1.json
/private/tmp/settings-homeinitdata-same-build-legacy-2.json
/private/tmp/settings-homeinitdata-same-build-legacy-3.json
/private/tmp/settings-homeinitdata-same-build-default-1.json
```

The focused protocol check passed 12/12. The restricted macOS `check:fast`
run passed 954/957; its three failures were sandbox-sensitive fixture Git or
external process sampling. Those three files then passed 38/38 when run with
the required macOS permissions. A full unrestricted CI result is still open.

## Reproduction and decision

After `pnpm build`, run from the repository root with external macOS process
sampling permitted and a new output filename:

```sh
ARKTS_REFERENCES_INITIAL_CATALOG_WAIT_MS=60000 \
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-e2e.vrQQm9/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --symbol HomeInitData --line 28 --character 30 --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --out /private/tmp/settings-homeinitdata-initial-wait-next.json \
  --mode A --catalog-state immediate --strategy indexed-batched \
  --sdk-profile full --dependency-profile closure --batch-roots 64 \
  --idle-ms 0 --trace --timeout-ms 120000
```

The experiment proves that startup timing, not `findReferences` result count,
caused this fixed case to amplify into many compiler batches. It does **not**
meet the 500 ms navigation target, prove a default policy for larger catalogs,
or close the original >3 GB / final 50% memory gate. Keep
`ARKTS_REFERENCES_INITIAL_CATALOG_WAIT_MS` defaulting to zero. Next compare
completed randomized strategy samples and move initial-index preparation or
readiness outside the user click/diagnostic suspension path before any default
change.
