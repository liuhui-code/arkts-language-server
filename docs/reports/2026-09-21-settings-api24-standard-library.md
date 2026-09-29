# Settings/API-24 standard-library diagnostic check (R-02)

Status: **focused RED/GREEN, portable installed-artifact acceptance, and
pinned real-project replays passed; remaining-diagnostic gate open**. This report
supersedes only the 18-error diagnostic observation in the earlier
[F6b report](2026-09-21-settings-api24-diagnostic-cache.md), not its cached
latency measurements.

## Fixed inputs

| Input | Value |
| --- | --- |
| Server parent revision | `3c0900fe98407112948d9009ef69376e4c5c8608`; standard-library delivery changes uncommitted during replay; existing user `AGENTS.md` edit preserved |
| Entry-server bundle SHA-256 | `ec52e7fb552fb2bef239b996d3261d0b2e5f6f5017e8383861404d1d40849b2e` (unchanged from F6b; this hash alone does not identify changed semantic-worker code) |
| Final replay Worker SHA-256 | Semantic `d41171d961eb4e6436f81f9ae97928860b5d7e932d30e9bd60832db54e0d6558`; reference verifier `08c2bcb91537a3c0f8dfca0003a7b1cd81a7ae7ef6e6761b3b25efe1e29b6200` |
| Standard-library asset identities | Replay composite `standardLibrarySha256` `ea78beea2aa84f93fe66645465c37eb916028b79cd9fe898d469bdf54efbf97d` over manifest and library contents; manifest SHA-256 `d6e26a09136c533dccdeff3a0af436ebd257e6b8dc7f55a2743b5744d3a79cba`; 70 delivered `lib*.d.ts` files; production selects `lib.es2022.d.ts` without DOM |
| Rust sidecar SHA-256 | `8d4e95b5c603b8f43e0da9a7e62d74b127a94fe16f8b6d0afbc9fd0d6ebe40ae` |
| Real project | Clean `openharmony/applications_settings` checkout `ecc550dfaed880e04e38a2477eb7235cd50475b9` at `/private/tmp/arkts-settings-e2e.vrQQm9/project` |
| SDK | Project declares compile 23; selected DevEco ETS API 24, version `6.1.1.125`, at `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony` |
| Runtime | macOS Darwin 25.6.0 x64; Node `v26.3.0`; `indexed-batched + closure + full SDK`, 64 batch roots, normal automatic diagnostics |
| Request | `textDocument/references`, `MenuController` declaration at `common/src/main/ets/core/controller/MenuController.ets`, zero-based UTF-16 `70:13`, `includeDeclaration=true` |
| Raw evidence | Pinned [`settings-menucontroller-indexed-pinned-a-1.json`](/private/tmp/settings-menucontroller-indexed-pinned-a-1.json), final-provenance unpinned [`settings-api24-stdlib-no-dom-a-2.json`](/private/tmp/settings-api24-stdlib-no-dom-a-2.json), earlier no-DOM [`settings-api24-stdlib-no-dom-a-1.json`](/private/tmp/settings-api24-stdlib-no-dom-a-1.json), and intermediate full-library [`settings-api24-stdlib-a-1.json`](/private/tmp/settings-api24-stdlib-a-1.json); each preserves framed LSP transcript, diagnostics, normalized Locations and external process-tree RSS samples |

This is an API-24 **compatibility** run for a project declaring compile 23.
It is not API-23-matched or a DevEco diagnostic oracle. The asset hashes must
be considered with the entry-server bundle hash: that SHA can stay unchanged
when adjacent declarations **or the separate semantic-worker bundle** change.
The replay tool now records deterministic identities for the composite
standard-library asset set and both adjacent semantic Worker bundles. The
second no-DOM raw replay records all four hashes in the table above. Its
optional manifest pins fail preflight on mismatch; legacy manifests without
these pins remain accepted. Targeted RED/GREEN and the full replay CLI suite
(**10/10**) passed. The first two no-DOM `MenuController` replays used explicit
inputs; its [refreshed manifest](../../bench/references/manifests/settings-menucontroller-api24.json)
now pins the SDK, oracle and all runtime-asset hashes, and a third fresh
indexed-batched replay passed that preflight with 248/248 exact Locations.
The separate `HomeInitData` run below also passes its pinned manifest.

## Observation

The production `dist/` bundle previously contained no adjacent TypeScript
standard-library declarations. A [real-LSP RED/GREEN test](../tdd/standard-library-delivery.md)
reproduced missing `Object`, `Array`, `Promise` and `string.includes`
diagnostics. The first asset-delivery replay returned 248 exact Locations and
reduced the preceding F6b run's 18 errors to two. Its default
`lib.es2022.full.d.ts` introduced DOM `Text`, however, causing a public-test
TS 2300/2348 collision with ArkUI-like `Text`; Settings also exposed TS 2554.
Production now selects the non-DOM `lib.es2022.d.ts` explicitly. Three fresh
`MenuController` replays returned **248/248 exact Locations each** and one
diagnostic each. The second replay used the final extracted compiler-options
build and captured Worker-bundle digests; the third ran through the refreshed
manifest's SDK/runtime/Oracle preflight.

The prior 17 missing-standard-library errors (14× TS 2304, 2× TS 2583,
1× TS 2339) disappeared; the intermediate TS 2554 also disappeared. The
one remaining diagnostic is:

| Code | Position (zero-based UTF-16) | Message |
| --- | --- | --- |
| TS 2307 | `19:28–19:51` | Cannot find module `@ohos.systemparameter` or corresponding declarations |

The final diagnostic Program reported 361 SourceFiles: 27 project, 282 SDK
and 52 standard-library files, versus 309 total before asset delivery. The
external 50 ms-target sampler observed **635,502,592**, **639,254,528** and
**645,877,760 bytes** peak product RSS in the three no-DOM runs (server plus
sidecar, each counted once). The pinned third request took **6,226 ms** from
`textDocument/references` start to response. The intermediate full-library
run observed 663,162,880 bytes. These are separate cold runs, not a stable
memory-improvement estimate or latency distribution; sampler and harness
memory remain separate.
No PSS or DevEco comparison was made.

The focused command below passed **9/9**, including a portable install from a
sealed artifact, preserved standard-library assets and installed LSP semantic
smoke. It does not constitute execution on Windows:

```sh
pnpm build
node --test tests/semantic/standard-library-diagnostics.test.mjs \
  tests/release/portable-install.acceptance.mjs \
  tests/test-layer-manifest.test.mjs
```

The first full `pnpm check:fast` attempt for the wider change passed 949/950;
the lone failure was a five-second test-helper wait on the fourth references
request in `references-completeness.test.mjs`, not an observed Location diff.
Its correctness-only wait was raised to 15 seconds (no product timeout or
strategy change), and the isolated file passed 3/3. The post-adjustment full
`pnpm check:fast` rerun passed **950/950** in 870,262.14 ms. This establishes
the repository's fast test gate, not the real-project latency or memory release
gates.

## Second real symbol: HomeInitData without declaration

The same clean Settings checkout and selected API 24 contain a second fixed
compiler oracle: `HomeInitData` at
`common/src/main/ets/sendable/HomeInitData.ets`, zero-based UTF-16 `16:13`,
with `includeDeclaration=false`. Its
[nine-location oracle](../../bench/references/oracles/settings-homeinitdata-api24-no-declaration.json)
contains the common barrel and phone-consumer usages, but excludes the
declaration. The
[manifest](../../bench/references/manifests/settings-homeinitdata-api24-no-declaration.json)
pins the checkout, selected SDK digest, Node version, query, oracle, entry
bundle, both semantic Worker bundles, standard-library assets and sidecar.

| Fresh mode-A run | Result | Request time | Peak product RSS | Raw evidence |
| --- | --- | ---: | ---: | --- |
| `legacy` | 9/9 exact Locations; no target-file diagnostics | 8,857 ms | 780,861,440 bytes | [legacy](/private/tmp/settings-homeinitdata-legacy-a-1.json) |
| `indexed-batched` | 9/9 exact Locations; no target-file diagnostics | 5,259 ms | 555,511,808 bytes | [indexed](/private/tmp/settings-homeinitdata-indexed-a-1.json) |
| `indexed-batched` with pinned manifest | 9/9 exact Locations; manifest preflight passed | 5,009 ms | 558,116,864 bytes | [pinned](/private/tmp/settings-homeinitdata-indexed-pinned-a-1.json) |

Each raw run reports `PASS`, and the normalized nine-location arrays are
identical across strategies. These are **one process per row**, not a latency
distribution or a stable memory ratio. The pinned run proves this particular
manifest and selected local SDK/runtime fingerprints pass preflight; it is
not API-23-matched, DevEco-equivalent, or evidence that all global queries
meet the ≤500 ms target. In fact, each observed cold request was over 5 s;
the 500 ms target remains unmet in this state.

## Reproduce

From this source revision with the pinned Settings checkout and selected SDK
at the paths above, build the runtime and replay the unchanged oracle:

```sh
pnpm build
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/arkts-settings-e2e.vrQQm9/project \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file common/src/main/ets/core/controller/MenuController.ets \
  --symbol MenuController --line 70 --character 13 \
  --oracle bench/references/oracles/settings-menucontroller-api24.json \
  --out /private/tmp/settings-api24-stdlib-no-dom-a-replay.json \
  --mode A --strategy indexed-batched --sdk-profile full \
  --dependency-profile closure --batch-roots 64 --idle-ms 0 --trace
```

## Open gates

- Mac local/portable installed-artifact delivery passed the focused test;
  Windows delivery was not executed on Windows in this run.
- Triage the remaining TS 2307 independently. It is not established as an
  SDK compatibility error or a correct DevEco-equivalent diagnostic yet.
- Both Settings symbols now have a pinned replay: `MenuController` with the
  declaration and `HomeInitData` without it. Extend independent randomized
  samples and both declaration-policy variants per symbol before graduating
  a release gate.
- Cold/post-edit navigation, the original >3 GB reproducer, final references
  50% memory target and product release PSS gates remain open. These two
  replays do not establish the user's ≤500 ms target beyond prior cached
  same-snapshot evidence.
