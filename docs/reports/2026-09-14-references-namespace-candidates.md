# References namespace candidate gate

## Outcome

The Rust workspace index now gives a top-level exported namespace its own
`Namespace` kind, persisted as kind 9 and emitted through the existing wire
kind `module`. Namespace members remain compiler-owned and are not promoted to
global declaration identities.

The public sidecar RED proved that `export namespace Routers` was unsupported.
The GREEN test additionally proves that two same-name namespaces imported from
different modules retain disjoint candidate sets.

The real OpenHarmony Photos `Routers` replay used three independent legacy and
three independent indexed-batched processes. All six returned the same 19
Locations, one normal diagnostic, and Location hash
`e8a3d315a06711100b45ad2f3785bc53b2e94e844e0a1d7f269c8c2f2cddcf4c`.

| Strategy | Request median | Product-tree peak RSS median | Candidate files | Max Program files |
|---|---:|---:|---:|---:|
| legacy | 12.393 s | 777,011,200 B | full membership | full context |
| indexed | 9.914 s | 562,438,144 B | 3 | 577 (218 project) |

Indexed latency was 0.80x and peak RSS 0.72x legacy, a 27.6% reduction. This
passes correctness and prototype latency but not the final 50% memory gate.
Production remains `legacy`, and the user-reported >3 GB reproducer remains
open.

## Fixed replay

```text
parent:    8980886aea951c003a98fb4af92c63aa3464deb8
workspace: OpenHarmony applications_photos
commit:    98ea1d9cd6a363c576e2c6ff17844e51723baec5
SDK:       /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony
target:    tools/src/main/global/pages/Routers.ets
symbol:    Routers
position:  26:19 (zero-based UTF-16)
request:   textDocument/references, includeDeclaration=true
```

```bash
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/applications_photos-6.1-lts \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file tools/src/main/global/pages/Routers.ets \
  --symbol Routers --line 26 --character 19 \
  --oracle /private/tmp/photos-routers-legacy-pass.json \
  --out /private/tmp/photos-routers-indexed.json \
  --mode A --strategy indexed-batched --sdk-profile common \
  --batch-roots 2 --trace --idle-ms 0 --timeout-ms 30000
```

The index selected the declaration and two real consumer files. One
source-unavailable semantic-unit expansion admitted 841 project files, while
the actual Program contained 218 project and 359 SDK SourceFiles versus 1,246
project membership files. Closure expansion and SDK roots remain the dominant
next boundaries.

Machine evidence:
[`evidence/2026-09-14-references-namespace-candidates.json`](evidence/2026-09-14-references-namespace-candidates.json).

## Validation

- public sidecar RED then GREEN;
- `cargo test --locked -p arkts-index-core`: 25 passed;
- `cargo test --locked -p arkts-index-sqlite`: 25 passed;
- `cargo test --locked -p arkts-index-sidecar --test ndjson_protocol`: 27
  passed, one pinned real-fixture release test ignored locally;
- `cargo fmt --all --check` and release-equivalent workspace Clippy: PASS;
- `pnpm check:fast`: 923 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo;
- six real-project processes: exact 19/19 Location equality.
