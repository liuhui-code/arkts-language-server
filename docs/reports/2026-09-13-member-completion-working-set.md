# Member completion working-set slice

Date: 2026-09-13. This report records a default-off causal slice for member-access completion. It
does not change the production default, does not narrow ordinary/module-export completion, and does
not claim that the complete completion/definition/references workflow has met the release gate.

## Contract and implementation

The public child-process test uses Content-Length framed LSP stdio. The first RED against parent
`c002745dd0b39fc28c463ade0db20979afb37a46` observed no completion Program event. After adding the
default-off event, the sharper RED observed three project files/roots where the current-root member
completion contract required the current document's two-file import closure and one project root.

The implementation makes one bounded change:

- the TypeScript completion engine and the outer semantic adapter share the same UTF-16-aware
  member-access classifier;
- only member completion under `ARKTS_INTERACTIVE_PROJECT_ROOT_PROFILE=current` prepares the
  current document and open overlays as roots, while the compiler follows real imports;
- the default `closure` profile and ordinary/module-export completion retain full membership;
- `completion.program.complete` reuses the existing default-off trace and records only aggregate
  Program counts, completion count and process memory.

The fixture proves stable member completion equality, a project-root reduction from 3 to 1 and an
actual project Program of 2 files. A second ordinary `PublicThing` completion under the same current
profile still uses all 3 project roots, protecting workspace discovery semantics.

## Fixed Photos replay

Workspace: OpenHarmony `applications_photos` commit
`98ea1d9cd6a363c576e2c6ff17844e51723baec5`. SDK: API 24 / ETS 6.1.1.125. Node:
v26.3.0. Target:
`common/src/main/ets/default/view/browserOperation/RecoverMenuOperation.ets`, member
`onOperationEnd`, zero-based UTF-16 position `70:24` (completion prefix `onO`).

Each profile used three fresh processes with automatic diagnostics enabled and the workflow:

```text
didOpen -> member completion -> definition -> legacy references -> idle
```

All six runs completed without protocol errors, returned three completion items, the same twelve
validated reference Locations and 27 diagnostics.

| Profile | Program files | Project files | Project roots | Completion response RSS (bytes) | Completion time (ms) |
|---|---:|---:|---:|---|---|
| closure | 1,928 | 1,246 | 1,246 | 651,833,344 / 751,624,192 / 806,137,856 | 7,941 / 8,361 / 8,037 |
| current | 380 | 29 | 1 | 473,157,632 / 462,057,472 / 474,415,104 | 2,850 / 3,005 / 2,991 |

Median completion-response product RSS fell from 751,624,192 to 473,157,632 bytes, a 37.05%
reduction that passes the unchanged 30% prototype gate. Median completion latency fell from 8.037
to 2.991 seconds, a 62.78% reduction. Program SourceFiles fell by 80.3%.

The whole workflow peak fell only 8.09%, from a median 806,842,368 to 741,531,648 bytes. This is
expected: the later legacy `textDocument/references` request correctly expands the same long-lived
LanguageService back to full membership. One current-profile run also reached a higher final peak,
so this slice must not be presented as whole-workflow memory success.

The normalized measurements are committed in
[`evidence/2026-09-13-photos-member-completion.json`](evidence/2026-09-13-photos-member-completion.json).
Raw process curves remain under `/private/tmp/arkts-photos-member-onoperationend-*-legacy-*.json`.

## Decision

- Member completion working-set and latency prototype gates are GREEN.
- Public fixture completion equality, real references validation and normal diagnostics are GREEN.
- Ordinary/module-export completion remains full-membership and unchanged.
- The broad current-root profile remains default-off because earlier diagnostics and whole-workflow
  product gates did not pass; this slice alone does not authorize changing that default.
- Before production enablement, repeat exact member-completion checks across other real project and
  member kinds, then isolate a member-only policy from the broader experimental profile.
- Global completion narrowing remains a separate phase: Rust may recall module-export candidates,
  while the compiler remains the final semantic owner and stale/partial/ambiguous input fails closed.
