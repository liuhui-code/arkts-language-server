# Auto-import resolve discovery-root working-set slice

Date: 2026-09-13. This report records the second default-off ordinary auto-import working-set
slice. It does not change the production default or claim that ambient/global contribution
discovery and the large-project release gate are complete.

## Public RED and GREEN

Parent revision: `915722d803c212f9c6298c5ccf80f51c5fa7aec3`. The existing real child-process
5,000-export transcript first failed because no bounded resolve Program existed after the indexed
completion response. The implemented contract now records both completion and resolve Program
cardinality.

For a ready export generation, an ordinary completion retains the workspace-relative declaration
URIs that matched the returned item. The LSP client still receives only the opaque
`arktsCompletionId`; the retained compiler metadata stays in the server-owned resolution record.
Resolving that record uses the current document, open overlays and those declaration roots. The
official `ohos-typescript` completion identity and `getCompletionEntryDetails()` remain the source
of the final detail and import edit.

Missing metadata, an empty set, malformed/non-file URIs, paths outside the workspace, a disabled
profile, or non-ready discovery all retain the existing full-workspace resolve. The public fixture
now proves both directions: ready completion and resolve each use two project roots and return the
exact `ManyExports` edit; deterministic stale completion and resolve each use all 25 roots and
return the same edit.

## Fixed Photos replay

Workspace: OpenHarmony `applications_photos` commit
`98ea1d9cd6a363c576e2c6ff17844e51723baec5`. SDK: API 24 / ETS 6.1.1.125. Node:
v26.3.0. Target:
`imageEditor/product/editor_phone/src/main/ets/component/menu/BottomToolbar.ets`.

The in-memory overlay removed `ConflictContent` from the existing `./Consts` import and completed
`ConflictCont` at zero-based UTF-16 `318:41`. Each profile used a fresh server and cache and waited
for `index.catalog.terminal=ready` before completion. Normal diagnostics stayed enabled.

| Profile | Program files | Project files | Project roots | Completion worker RSS | Resolve worker RSS | Workflow peak |
|---|---:|---:|---:|---:|---:|---:|
| workspace | 1,928 | 1,246 | 1,246 | 724,439,040 B | 743,264,256 B | 780,128,256 B |
| discovery | 772 | 107 | 2 | 416,636,928 B | 489,156,608 B | 547,852,288 B |

Both profiles returned the same completion, detail, replacement range and resolve edit inserting
`ConflictContent, ` into the existing import at UTF-16 `92:9`. Both published the same 90
diagnostics with SHA-256
`99e981f9e8725f7a683cabb1138d21f8df8181c2f376e6f3889e8f35be3efdb1`.

In this one A/B, completion worker RSS fell 42.49%, resolve worker RSS fell 34.19%, and the externally
sampled product process-tree peak fell 29.77%. Completion latency fell 19.62%. Resolve latency was
1.715 s for workspace and 7.039 s for discovery, a 4.10x regression. This is a single noisy run,
but it fails the latency gate and must not be hidden behind the memory result.

Normalized evidence is committed in
[`evidence/2026-09-13-photos-auto-import-resolve-roots.json`](evidence/2026-09-13-photos-auto-import-resolve-roots.json).
The raw local report remains `/private/tmp/arkts-real-auto-import-resolve-ab.json`.

## Verification and decision

- `pnpm check` passed.
- The two closest production LSP tests passed.
- The complete local `pnpm check:fast` was attempted, but the loaded Mac caused unrelated existing
  five-second tests to time out at roughly 5.6 seconds; the run was stopped rather than reported as
  GREEN. A clean GitHub validation run remains required before merge.
- Ready and stale correctness/fallback contracts are GREEN.
- The profile remains default-off (`workspace`).
- Cross-project correctness and repeated-run latency/RSS remain open.
- Ambient/global contribution completeness remains the prerequisite for any production-default
  change.

The next slice should first determine why the same two-root resolve rebuild costs 4.10x in this
run. It may optimize reuse only if the exact completion/edit and fail-closed fallback contracts stay
unchanged; it must not restore full workspace roots merely to improve this number.
