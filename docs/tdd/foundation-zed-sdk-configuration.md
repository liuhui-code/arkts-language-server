# Foundation F1 — Zed SDK configuration

Parent revision: `c8234a0bebf0aa08d08f55b184c895f0c9b1dc67`.
Branch: `codex/foundation-zed-sdk-config`.

## Public contract

The real stdio LSP accepts an absolute OpenHarmony SDK path from Zed through
`initialize.initializationOptions.sdk.path`. It has higher precedence than
workspace `local.properties`, `ARKLINE_HARMONY_SDK_PATH`, and platform
discovery. The same selection can be changed with
`workspace/didChangeConfiguration` at `settings.arkts.sdk.path`.

Changing the selection disposes the workspace type engines, not the document
store. The next request rebuilds semantics from the selected SDK while open,
unsaved document text and version remain authoritative. An explicit invalid or
relative path fails closed and emits `arkts.sdk.configuration`; it never falls
through to a lower-priority SDK. Sending `settings.arkts.sdk = {}` removes the
editor override and restores project/environment/platform selection.

The Zed extension does not parse or own SDK configuration. It relies on Zed's
standard LSP initialization options; the language server remains the sole SDK
selection owner.

## RED → GREEN evidence

1. `pnpm build && node --test --test-name-pattern='Zed initialization SDK configuration overrides local.properties' tests/semantic/project-sdk-selection.test.mjs`
   was RED: definition resolved to SDK A from `local.properties` instead of the
   SDK B path supplied by initialization options. Passing the editor selection
   through the backend-neutral semantic port and constructor-scoped SDK
   discovery made it GREEN.
2. `pnpm build && node --test --test-name-pattern='Zed runtime SDK configuration rebuilds semantics' tests/semantic/project-sdk-selection.test.mjs`
   was RED: runtime configuration was ignored and definition remained in SDK A.
   The configuration handler now cancels workspace freshness, resets semantic
   engines, republishes diagnostics, and preserves the open overlay; the SDK B
   exact URI/range is GREEN.
3. `pnpm build && node --test --test-name-pattern='invalid explicit Zed SDK' tests/semantic/project-sdk-selection.test.mjs`
   was RED because only downstream TypeScript diagnostics were present. The
   selected SDK snapshot now emits the stable configuration diagnostic and
   remains fail-closed; GREEN.
4. Clearing `arkts.sdk` was covered after the shared runtime-selection seam was
   GREEN. It restores SDK A from `local.properties` after proving the process
   initially used SDK B. No separate RED is claimed.

## Focused verification

`pnpm build && node --test tests/semantic/project-sdk-selection.test.mjs tests/sdk-discovery.test.mjs`
passed 31/31 tests with no failures, cancellations, skips, or todos. This
includes the pre-existing one-process/two-workspace SDK isolation contract.

Final `pnpm check:fast` passed 831/831 tests with no failures, cancellations,
skips, or todos (462.5 seconds). `pnpm check` and `git diff --check` also passed.
