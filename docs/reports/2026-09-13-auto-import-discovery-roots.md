# Auto-import discovery-root working-set slice

Date: 2026-09-13. This report records the first default-off ordinary/module-export completion
working-set slice. It does not change the production default and does not claim that the complete
auto-import workflow or the large-project release memory gate has passed.

## Public contract and implementation

Parent revision: `e6261767b598dd9fdf7f6dfdf1da46de10fa3123`. The public child-process RED reused the
existing 5,000-export LSP transcript. With
`ARKTS_AUTO_IMPORT_PROJECT_ROOT_PROFILE=discovery`, the completion and resolved import edit were
already correct, but the actual compiler Program still had 25 project roots instead of the two
required roots: the current consumer and the Rust-discovered declaration file.

The smallest GREEN keeps the existing ownership model:

- Rust `exports/search` only recalls bounded candidates;
- `ohos-typescript` still emits and validates the official completion entry and resolve data;
- a ready, non-empty candidate set may provide the current request's compiler roots;
- the current document and all open overlays remain pinned roots;
- missing discovery, an empty set, `partial`/`stale`, or any candidate outside the workspace falls
  back to complete workspace roots;
- the new profile defaults to `workspace`, so ordinary completion is unchanged unless explicitly
  enabled.

The focused transcript is GREEN. Its ready case uses two project roots and still resolves the exact
`ManyExports` import beyond the old 4,096-entry scan boundary. Its deterministic stale case returns
the same candidate while retaining all 25 project roots. The existing member-completion,
definition, references and diagnostics contract also remains GREEN under default configuration.

## Fixed Photos replay

Workspace: OpenHarmony `applications_photos` commit
`98ea1d9cd6a363c576e2c6ff17844e51723baec5`. SDK: API 24 / ETS 6.1.1.125. Node:
v26.3.0. Target:
`imageEditor/product/editor_phone/src/main/ets/component/menu/BottomToolbar.ets`.

The in-memory overlay removed `ConflictContent` from the existing `./Consts` import and changed the
return annotation to the prefix `ConflictCont` at zero-based UTF-16 `318:41`. Each profile used a
fresh server, a fresh Rust catalog cache, automatic diagnostics, completion and completion resolve.

| Profile | Program files | Project files | Project roots | Completion worker RSS | Completion time | Whole workflow peak |
|---|---:|---:|---:|---:|---:|---:|
| workspace | 1,928 | 1,246 | 1,246 | 767,074,304 B | 8.766 s | 823,156,736 B |
| discovery | 772 | 107 | 2 | 481,456,128 B | 4.184 s | 769,040,384 B |

Both modes returned the same interface completion, the same replacement range and the same resolve
edit inserting `ConflictContent, ` into the existing import at UTF-16 `92:9`. Both published the
same 90 diagnostics with SHA-256
`b9195615f213289aa4b67bb0df6454e63828a4f6d7d52339be5e97fed65443f5`.

The completion Program and response improved materially: project files fell 91.41%, worker RSS at
the completion boundary fell 37.23%, and latency fell 52.27%. The whole workflow peak fell only
6.57%. Completion resolve and normal diagnostics still restore a broader semantic Program, so this
single A/B must not be presented as product memory success.

Normalized evidence is committed in
[`evidence/2026-09-13-photos-auto-import-discovery-roots.json`](evidence/2026-09-13-photos-auto-import-discovery-roots.json).
The raw local report remains `/private/tmp/arkts-real-auto-import-ab.json`.

## Decision

- Candidate-backed ordinary completion list working-set correctness is GREEN as an opt-in slice.
- Stale discovery fail-closed behavior is GREEN.
- The production default remains `workspace`.
- No ambient/global declaration exclusion claim is made: ready export discovery is not a complete
  ambient-contribution model.
- The next RED is completion resolve. It must preserve the official opaque completion identity and
  exact edit while preventing selection of a discovered item from unnecessarily restoring full
  workspace roots. Normal diagnostics remain unchanged and may still restore their correct closure.
