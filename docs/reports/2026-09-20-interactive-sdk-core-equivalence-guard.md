# Interactive SDK `core` equivalence guard

Date: 2026-09-20. Parent revision:
`fcb9ef991c3cf9157e0c21a1c159f17996b34904`.

## Behavior and TDD

The existing opt-in `core` profile used four SDK declarations whenever those
files existed. That condition did not prove equivalence with the SDK's
`index-full.d.ts`: a fifth referenced declaration could provide an ArkUI
global. A real Photos file demonstrated 70 false diagnostics under this
condition.

The public child-process LSP test now adds a fifth `full-only.d.ts` provider
while keeping all four core files present, and uses its type in the open
document. Before the fix, exact references were returned but `core` published
a false TS2304 for `UnusedFullSdkMarker` (RED). The interactive engine now
uses the four-file profile only when the full index is an empty declaration
wrapper whose *entire* direct path-reference set equals those four existing
files. An extra path, declaration statement, library/type directive, other
triple-slash pragma, or unreadable index falls back to the normal full entry.
The same public LSP test is GREEN with exact references, completion, definition,
and automatic diagnostics. Two further public cases verify a genuinely
equivalent four-reference wrapper retains the one-file reduction and an
unsupported pragma or missing core files forces full fallback.

Focused command:

```bash
pnpm check && pnpm build && \
  node --test --test-name-pattern="diagnostics core SDK" \
    tests/semantic/references-batching.test.mjs
```

Result: 3 passed, 0 failed. This guard compares the currently selected SDK
files at engine construction; it does not cache an inventory across SDK
versions. It proves only the narrow wrapper-equivalence case. It is **not** a
general per-document SDK-global closure or a new low-memory production
strategy.

## Real-project regression

The same fixed OpenHarmony Photos `BottomToolbar` query from the
[current-main no-go](2026-09-20-interactive-sdk-static-core-no-go.md) was
replayed through a newly built server and worker. The installed DevEco API 24
`index-full.d.ts` references many more than the four core files, so the
opt-in setting correctly used full SDK declarations:

| Check | Previous `core` | Guarded `core` | Full baseline |
| --- | ---: | ---: | ---: |
| References | 3 | 3, exact | 3 |
| Automatic diagnostics | 132, false errors | 62, exact | 62 |
| Diagnostic SDK SourceFiles | 448 | 573 | 573 |
| SDK root files | 4 | 1 | 1 |
| Peak product RSS | 841,830,400 B | 888,885,248 B | 887,308,288 B |

The strict replay differential emits both
`REFERENCES_LOCATION_GATE=PASS` and
`DIAGNOSTIC_CORRECTNESS_GATE=PASS`. The near-baseline RSS is expected: the
guard restores correctness by using the full SDK, not by reducing the
working set. The user-reported >3 GB case and final 50% memory gate remain
open.

Raw guarded replay:
`/private/tmp/photos-bottomtoolbar-core-guard-20260920.json`.
Its `dist/semantic-worker.cjs` SHA-256 was
`da29c91ebcbb62b99f6012fb07ec6abf9d89a7c49c6c99e1731d70410a59084f`;
the public `dist/server.cjs` bundle was unchanged because the edit is in the
semantic worker.

Validation after the final edit: `pnpm check:fast` passed 927/927 tests and
`git diff --check` passed. The default interactive SDK profile remains `full`;
the default references strategy and diagnostic scheduling are unchanged.
