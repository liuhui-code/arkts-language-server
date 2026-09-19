# References disjoint re-export support chain

Date: 2026-09-19

## Finding and fix

The fixed Photos `EditorController` replay remained in conservative closure
after package-entry admission was corrected. The SQLite catalog had seven
same-name bindings: five package imports and two root-level re-exports. Rust
resolved all seven and returned a complete identity set of seven target files,
excluding the independent `browserCommonPC` declaration and its `index.ets`
re-export. The Node support-chain guard nevertheless inspected every returned
re-export, including the proven-disjoint PC barrel, and rejected identity mode
because that barrel was not in the target identity set.

The guard now ignores re-exports whose binding file is outside a complete
identity candidate set. For a re-export inside that set it still requires a
unique resolution to another candidate file; an incomplete target chain
continues to use conservative closure. This changes only the default-off
`indexed-batched`/`identity` experiment. Production remains `legacy`/`closure`.

## TDD

Parent revision: `10ee8f2629f63ad6982d7f000297ef65f5dbda80`.

- Public child-process RED: `identity support ignores a proven-disjoint
  same-name re-export` returned `compiler-definition`, rather than
  `compiler-definition-identity`, despite exact Locations.
- GREEN: the same test entered identity mode and retained exact Location
  equality. A second scripted response with a broken *target* re-export chain
  still fell back to conservative mode and retained exact Locations.
- The amended full references-batching public LSP suite passed 13/13, including
  the broken-target-chain assertion.
- `pnpm check` passed. The first full `pnpm check:fast` had one LSP
  startup wait timeout near the end; the complete rerun passed 925/925 tests
  with no skips or failures. The timeout did not recur, but its cause was not
  established, so it is not counted as a product regression or silently erased.

## Fixed real-project A/B

```text
workspace: OpenHarmony applications_photos
commit:    98ea1d9cd6a363c576e2c6ff17844e51723baec5
SDK:       DevEco OpenHarmony API 24 / 6.1.1.125
Node:      v26.3.0
file:      browserCommonPhone/src/main/ets/controller/EditorController.ets
symbol:    EditorController
position:  133:14 (zero-based UTF-16)
request:   textDocument/references, includeDeclaration=true
```

Both strategies used fresh independent server processes, the same checkout,
SDK, target and oracle. No test suite ran during the six reported measurements.

| Strategy | Run | Locations | Request | Product peak RSS |
| --- | ---: | ---: | ---: | ---: |
| legacy | 1 | 17 | 7.375 s | 890,122,240 B |
| legacy | 2 | 17 | 7.918 s | 885,297,152 B |
| legacy | 3 | 17 | 7.711 s | 891,904,000 B |
| identity-batched | 1 | 17 | 5.246 s | 638,324,736 B |
| identity-batched | 2 | 17 | 5.238 s | 650,092,544 B |
| identity-batched | 3 | 17 | 5.285 s | 652,480,512 B |

All six runs produced the same 17 normalized Locations (SHA-256
`2f0aa076d8d417a349cbfbfaf05dafa8d69c93f36fb42178a344adbdd83730f4`)
and 59 normal diagnostics. Identity-batched used seven identity candidates,
three sequential verifier batches and at most 211 Program SourceFiles (five
project files); the previous conservative run used up to 1,014 SourceFiles.

Median request latency was 5.246 s versus 7.711 s (0.68×). Median product
peak RSS was 650,092,544 versus 890,122,240 bytes (0.73×, a 27.0% reduction).
This clears the `<=2×` prototype latency gate but **does not** clear the 30%
prototype memory reduction or 50% final release gate. This checkout is not the
user-reported >3 GB reproducer, so that gate remains unverified.

The external sampler measured the server process tree and excluded its own
process. Raw curves, protocol transcript and event timeline remain in the
local `/private/tmp/photos-editorcontroller-{legacy-compare,disjoint-reexport-clean}{1,2,3}.json`
reports. The compact [machine evidence](evidence/2026-09-19-references-disjoint-reexport-support.json)
contains the values above without source contents.

## Reproduce

Build `dist/server.cjs` and `target/release/arkts-index-sidecar`, use the exact
checkout and SDK above, and run:

```bash
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/applications_photos-6.1-lts \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file browserCommonPhone/src/main/ets/controller/EditorController.ets \
  --symbol EditorController --line 133 --character 14 \
  --oracle /private/tmp/photos-editorcontroller-legacy-pass2.json \
  --out /private/tmp/photos-editorcontroller-disjoint-reexport-replay.json \
  --mode A --strategy indexed-batched --sdk-profile common \
  --dependency-profile identity --batch-roots 1 --trace --idle-ms 0 \
  --timeout-ms 180000 --diagnostic-timeout-ms 180000
```
