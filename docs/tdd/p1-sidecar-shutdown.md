# P1 — Await normal shutdown resource disposal

Parent revision: `ed069cf5075992b7afd8821ffd12328a9a4fd7ea`.
This vertical fix was applied on the uncommitted `codex/project-model-phase1` worktree.

## Observed defect and scope

The first integrated fast run exposed `ENOTEMPTY` while the local-package stdio
fixture removed its isolated `cache/workspaces/...` directory after `LspSession.close()`.
The session waits for the LSP Node process, but production shutdown previously
discarded the asynchronous index-close promises. The language-server library
processes `exit` synchronously and exits Node without waiting for sidecar shutdown.
Consequently, main-process exit did not establish that the sidecar had stopped
writing the cache. This is an actual resource-lifecycle ordering gap, not a reason
to add recursive-delete retries. An indefinitely surviving real Rust sidecar was
not established; its stdin EOF/shutdown normally terminates it eventually.

Scope: await normal LSP `shutdown`; drain already-open indexes and any in-flight
open operation including the close it performs after observing disposal.
Do not change package resolution, test cleanup, Rust, or abnormal termination.

## RED → GREEN evidence

1. Public workspace-service boundary:

   `node --test --test-name-pattern='disposal waits until' tests/workspace-symbol-service.test.mjs`

   RED: `disposedBeforeIndexClose` was `true`, expected `false`, while a controlled
   external index-close promise was pending. GREEN: return an idempotent promise
   from service disposal that settles after the index close operations.

2. In-flight open boundary:

   `node --test --test-name-pattern='disposal drains' tests/workspace-symbol-service.test.mjs`

   RED after slice 1: disposal still completed before a controlled open and its
   late index close. GREEN: track outstanding `openWorkspace` lifetimes and include
   them in the same disposal drain. Completed operations remove themselves from
   the set; disposed services refuse new starts.

3. Real Content-Length framed stdio child process:

   `node --test --test-name-pattern='shutdown acknowledgement waits' tests/lsp-reliability.test.mjs`

   RED after slices 1–2: `shutdown acknowledged before the index released its
   resources`. The real server's injected index reports close completion through
   the existing LSP log notification. GREEN: the shutdown handler returns the
   shared disposal promise, so close completion precedes the shutdown response
   and the subsequent clean `exit`.

The focused RED commands intentionally filtered unrelated tests; their skips are
test-name filtering, not accepted runtime skips in the full suites.

## Final focused verification

- `node --test tests/workspace-symbol-service.test.mjs tests/lsp-reliability.test.mjs`:
  **28 passed, 0 failed, 0 skipped, 0 todo**.
- `pnpm check`: **passed**.
- `pnpm build && node --test tests/semantic/local-package-resolution.test.mjs`:
  **13 passed, 0 failed, 0 skipped, 0 todo**, including the original main-symlink
  fixture cleanup. Its `fs.rm` remains unchanged, without retries or sleeps.
- `git diff --check`: **passed**.
- Integrated `pnpm check:fast`: coordinating task verified **664 passed, 0 failed,
  0 cancelled, 0 skipped, 0 todo**, in 329.1 seconds after this fix.

## Lifecycle boundaries

`SidecarWorkspaceIndex.close()` already awaits any pending open, then the sidecar
shutdown/close with its existing timeout and termination fallback. The service
now propagates that completion signal. `runCatalog` cannot open or respawn an
index; late callbacks observe disposal and do not publish state. The additional
tracked open lifetime covers an index that materializes during shutdown.

Exit without a preceding completed shutdown, a killed parent, and whole-process
crash recovery remain best-effort existing behavior; this change does not claim
those paths are drained. Existing abnormal-exit protocol tests remain GREEN.

Documentation exception: evidence only; owner=current lifecycle-fix task;
scope=this file; expires=2026-09-14.
