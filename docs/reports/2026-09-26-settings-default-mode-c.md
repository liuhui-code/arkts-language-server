# Settings default references: repeat and edit-warm verification

Status: **three-process exactness/hot-cache smoke PASS; cold/edit latency RED**.
No production policy or implementation was changed for this verification.
This is a real framed-LSP replay, not a Zed UI timing measurement or a release
claim that all navigation is below 500 ms.

## Fixed environment

- Source parent `9f91122ac504365c57473a430094da09baac9309` plus the current
  uncommitted source-fingerprint/lifecycle slices; raw reports preserve dirty
  status. The user-owned `AGENTS.md` changes remain untouched.
- Clean real Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9`, at
  `/private/tmp/arkts-settings-row-counts.BPJdST/project`.
- macOS 26.6.2 / build 25G83, x64, Node `v26.3.0` at
  `/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node`.
- Selected SDK `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`,
  ETS API 24, version `6.1.1.125`, digest
  `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.
  Settings declares compile 23 and target/compatible 20; this is the accepted
  API-24 compatibility track, not matched-23/DevEco equivalence.
- The [source-snapshot manifest](../../bench/references/manifests/settings-homeinitdata-api24-anchor-reuse-source-snapshot.json)
  pins the project, SDK, server, both Workers, standard library, sidecar and
  oracle. Its historical benchmark name does not enable anchor reuse.
- Server SHA-256
  `93e3c903f71f8c1eb2dad96f982a52297ee2d99b8eae8fe13dbbaeebcd5b7759`;
  semantic Worker
  `1855b57f71b334600e789d10ede35a82ef32a9f22f1edd28c8a6e03ff0601fe8`;
  verifier Worker
  `08c2bcb91537a3c0f8dfca0003a7b1cd81a7ae7ef6e6761b3b25efe1e29b6200`.
- Production profiles: `indexed-batched + closure + full SDK`, batch roots 64,
  default `dispose` context retention. `ARKTS_REFERENCES_ANCHOR_REUSE=0`;
  no phase trace, test delays, forced GC, heap snapshots or altered memory limits.
  Each raw report records the complete injected `ARKTS_*` environment.

## Workload and exactness

Each sequential run starts an independent Node process and private index cache,
waits for catalog completion (`Indexed 1846/1846 files; skipped 1 entries`),
then opens the real file. The first measured references request follows index
readiness, not immediate first-click/index-warming. There is no explicit
completion/definition prewarm. Normal automatic diagnostics remain enabled.

Query `common/src/main/ets/sendable/HomeInitData.ets`, usage of `HomeInitData`,
zero-based UTF-16 **28:30**, `includeDeclaration=false`. Mode C sends ten
references on document version 1, then appends an unsaved comment and sends
request eleven on version 2, followed by a one-second idle interval.

All **33/33** responses contain the same exact nine URI/range Locations as
the fixed oracle. Every run logs **nine cache hits, two misses and two stores**.
The second miss is after the overlay edit, not a stale cache response. All
three publish normal version-2 empty target diagnostics and shut down with
exit code 0/no signal. No `workspace/symbol` or `documentSymbol` request was
used. A comment-only edit intentionally leaves semantic Locations unchanged;
the public mutation tests separately prove newly added references are found.

## Measurements

| Run | First references ms | Nine cache hits ms | Post-edit miss ms | Whole-workflow product peak RSS bytes | After one-second idle RSS bytes |
| --- | ---: | --- | ---: | ---: | ---: |
| 1 | 7,032 | 2–4 | 5,369 | 577,314,816 | 491,839,488 |
| 2 | 7,247 | 2–3 | 5,673 | 576,098,304 | 490,283,008 |
| 3 | 7,543 | 2–3 | 6,516 | 530,329,600 | 469,557,248 |

Cold/edit request medians are **7,247 / 5,673 ms**. Across the 27 unchanged
cache hits, median is **2 ms**, observed nearest-rank P95 **3 ms**, maximum
**4 ms**. These are framed request/response timestamps with millisecond clock
granularity. This small consecutive burst is a smoke observation, not a
stable release P95, paced user workflow or attribution of a cross-build gain.
Do not pool with the older MenuController 67/96 ms cache results or the
completion/definition-warmed anchor-reuse A/B: build, symbol and workload differ.

RSS is externally sampled from the target process tree, configured at 50 ms;
raw actual timestamps are retained. Node worker threads count once in the
server PID; Rust sidecar is included separately. Harness and sampler memory
are excluded from product RSS. Sampler peaks were respectively 113,881,088,
110,989,312 and 112,484,352 bytes. Product peaks include cataloging, both
semantic misses and normal diagnostic work, not only the reference algorithm.
Request-completion log RSS is not the sampled peak.

Nine cache hits finish in less than one configured sampling interval. Nearest
RSS samples cannot independently characterize every hit or prove a long-term
retention plateau. One-second idle data is not the post-eviction/PSS gate.
No PSS or DevEco comparison was taken. `pmset -g therm` could not retrieve CPU
power/thermal status; machine throttling was not quantified. There is no paired
legacy control here and no memory-improvement or original >3 GB reproduction
claim.

## Evidence and replay

Local raw JSON files contain the fixed environment, request transcript,
normalization/validation, cache events, timelines and original RSS curve:

- [Run 1](../../.bench/anchor-reuse-2026-09-26/default-source-guard-C-1.json), SHA-256
  `7a5edbafd1e51e37880489d380e2b39082cbd18a8e3b982c6f30dbd888b4c11e`.
- [Run 2](../../.bench/anchor-reuse-2026-09-26/default-source-guard-C-2.json), SHA-256
  `5fd9ae17d42d85d9f289eed2b84c7cecacdee20441185abb23e58879a337fccf`.
- [Run 3](../../.bench/anchor-reuse-2026-09-26/default-source-guard-C-3.json), SHA-256
  `e563dab4d667c8b3ad5efad80bfc5da2947241ad629f2faf66159a282f3e2f60`.

From the repository root, use a new output path (existing files are refused):

```sh
ARKTS_REFERENCES_ANCHOR_REUSE=0 \
/Users/liuhui/.nvm/versions/node/v26.3.0/bin/node \
  scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-row-counts.BPJdST/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/sendable/HomeInitData.ets \
  --symbol HomeInitData --line 28 --character 30 --exclude-declaration \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --manifest bench/references/manifests/settings-homeinitdata-api24-anchor-reuse-source-snapshot.json \
  --out /private/tmp/settings-default-mode-c-recheck.json \
  --mode C --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 1000
```

External process sampling permission is required on this Mac. The real
checkout remains clean; the overlay comment is never written to disk.

## Disposition

R-04 same-snapshot cache/freshness smoke is GREEN for this second real Settings
symbol. **First and post-edit misses still fail the 500 ms requirement.**
R-02 randomized/larger samples, immediate index-warming behavior, native Windows,
PSS/DevEco, original >3 GB and final 50% memory gates remain open. R-10 stays
default-off because its separate warmed A/B regressed peak RSS. The unchanged
production build already passed full `check:fast` **970/970**; this follow-up
adds only raw evidence and documentation. No commit, push or merge occurred.
