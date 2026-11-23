# M5 entry audit: actual observable watch uncertainty

Status: read-only code audit while frozen candidate whole check runs. Not M5
implementation or completed acceptance. No product/watcher/protocol change here.

The semantic input path consumes LSP didChangeWatchedFiles, TextDocuments save
and configuration events; no production Node fs.watch/watchFile/watchDirectory
owner was found in src/lsp,src/semantic,src/project,src/core/workspace. A platform
FSEvents/inotify/ReadDirectoryChangesW overflow cannot be injected as a genuine
existing Node callback in this architecture. Do not invent a new LSP overflow
method and claim the current client supplies it. Native index supervision and
source input observation are separate domains.

## Existing paths

- `src/lsp/register-workspace-file-inputs.ts:29`: accept -> coordinator.accept/drain
  -> freshness.cancelWorkspace -> deliverWorkspaceFileInputs -> workspaceSymbols
  invalidation and diagnostics.refreshWorkspace. Save uses the same acceptance.
- `workspace-file-change-coordinator.ts:9`: bounded1024 pending paths, per-root
  coalescing and root-dirty fallback rather than discarding necessary coverage.
  Lines174/218 onward distinguish uncertain physical paths, directory lifecycle,
  permission failure and missing removed entries; uncertain URI is not a source.
- `semantic-engine-resources.ts:39`: typed workspace mutation reaches the existing
  Store; only explicit configuration provenance invokes configurationFilesChanged.
- `DocumentStore.workspaceFilesChanged:343`: rootDirty expands affected closure
  owners/namespaces; bounded deltas invalidate original input proofs. Membership
  refresh at326 uses original catalog proof/namespace/current disk facts.
- Worker mutation coalescing preserves rootDirty OR and latest managed namespace
  registration; normal source/body events are not all configuration resets.
- `worker-managed-source-namespaces.ts`: namespace registration replacement sends
  existing rootDirty mutation. Configuration reload likewise routes through known
  authoritative mutation. Current/final raw fences remain needed for silent gaps.

Existing unit/contract cases include bounded removed-path overflow and one-shot
reset in workspace-file-change-coordinator.test.mjs, and opaque directory lifecycle
in workspace-watch-path-lifetime.test.mjs. These citations are discovery, not new
test execution or proof of the entire M5 matrix. Current whole check is separate.

## Confirmed design gaps to investigate next

`run-language-server.ts:181-200` starts semantic preparation before fire-and-forget
dynamic registration. Registration rejection logs outcome disabled; it does not
carry a watch uncertainty receipt or schedule a source/config reconciliation.
A successful registration does not prove no events were missed before activation.
This is a static ordering finding, not a reproduced incorrect result or proof
that current raw input fences fail. No source counts or timing attribution to
this gap has been measured.

Blindly sending rootDirty/configurationChanged on registration acknowledgement
can invalidate/cancel an expensive initialization already in progress. Blocking
initialization on an acknowledgement forever is also unacceptable. The next
public controlled case must delay/reject actual client/registerCapability, mutate
inputs around the observed enumeration, and check initialization terminal, actual
query freshness, bounded reconciliation and no rebuild storm. The input lifetime
and initialization reconciliation ordering need explicit design before mutation.
Healthy watch status must never authorize bypassing current/final raw checks.

No native watch framework is required merely to demonstrate an OS callback this
process does not own. Client-level overflow reporting / periodic background
reconciliation remains unimplemented; a claimed continuous-event guarantee would
require an explicit provider contract. Whole A-plan remains IN_PROGRESS.

## Windows

Read-only `ssh -o BatchMode=yes -o ConnectTimeout=8 windows-pc 'cmd /c ver'`
exited255 with192.168.31.14:22 Operation timed out on this turn. No Windows
deployment or UI operation occurred; this does not block independent Mac work.


## Executed registration-gap characterization

`tests/semantic/watch-registration-input-lifetime.test.mjs` exercises real stdio
LSP with an actual outstanding client/registerCapability request. Four cases:
registration accepted/rejected after initialization and a warm query, each under
SDKpartial and completeSDK READY. No fake watcher-overflow protocol introduced.
While registration remains unanswered, initial preparation completes and exact
GlobalThing definition succeeds. Change the unopened Global.ets on disk by
prepending a newline without sending a watch event; only then accept/reject the
actual registration. First query refuses with -32803 and no result; immediately
following query returns exact GlobalThing range at line1 instead of line0. One
Worker throughout and clean shutdown. No source/config mutation is sent to make
the retry work. Both delayed outcomes use the existing disk-authority path.

Initial two partial cases plus manifest4:6/6PASS in E
`watch-registration-gap-characterization01.log`. Expanded four public cases plus
existing watched-file LSP, bounded coalescing/uncertainty and directory lifecycle
regressions:36/36PASS,0skip/cancel,69516.69ms in
`watch-registration-gap-expanded01.log`. Test manifest363entries,
bundle-e2e188. Product runtime b02394a2, source310hashes still match frozen manifest.
Commands (cwd isolated implementation worktree, Node20.19.5):

```sh
node --test --test-concurrency=1 tests/semantic/watch-registration-input-lifetime.test.mjs tests/workspace-file-change-coordinator.test.mjs tests/workspace-watch-path-lifetime.test.mjs tests/lsp-workspace-file-changes.test.mjs tests/test-layer-manifest.test.mjs
```

These successful controls disprove an unconditional claim that late/rejected
registration necessarily freezes initialization or permanently leaves this input
stale. No product change is justified solely by registration ordering in these
covered cases, and no blind rootDirty/configuration reset was added at ACK.

Limits:100-file generated fixture, not30K real UI; only source edit in the
registration gap AFTER initial terminal and warm query. Does not establish a
continuous watch guarantee, exact during-enumeration race, client overflow
reporting, offline/remount/junction or reconnect behavior. Existing independent
raw fences and bounded authoritative recovery remain necessary; registration ACK
is not a freshness receipt. The broader M5 matrix is still open, no new accepted
ADR or watch-only contract, no claim all missed events can be observed.

## 2026-11-20 next exact initial-scan control prepared

The existing four registration tests cover changes after initialization/warm query,
not the first scan. While final-candidate whole check runs, an external diagnostic
control was prepared under E (no frozen src/test/script input modified):
`watch-initial-scan-gap.cjs`, `watch-initial-scan-gap.test.mjs`,
`watch-initial-scan-gap-plan.json`. Both JavaScript files pass Node syntax checks;
not executed yet and not counted as coverage or a product regression PASS.

It pauses only the first actual complete strong membership scan after capture,
before publication, under a bounded10s private fixture gate. With real dynamic
registration still outstanding, the parent edits or moves Global.ets on actual
disk without watch notification, then accepts/rejects registration and releases
the scan. Four cases require honest preparation terminal, no stale definition,
subsequent exact fresh range/new URI, one semantic Worker and clean shutdown.
Actual input mutation and captured scan/dispatch timeline will be retained via
full framed transcript collection. This is controlled diagnostic interleaving,
not a claimed genuine OS overflow or real Zed UI scenario.

Windows read-only recheck on this update: default sandbox network was denied;
with approved network access the same SSH command actually timed out at
192.168.31.14:22 (exit255). Separate facts retained in E
`windows-connectivity-20261120-readonly.json`. No test deployment, UI operation or
user-process interruption. The Mac final whole check remains live and independent.


### Subsequent initial-scan control result

The previously prepared exact initial-scan interleaving cases were subsequently
ported to the repository watch-registration-input-lifetime test and executed:
E/watch-initial-scan-gap-repository02.log8/8PASS,zero skip/fail/cancel (four prior
post-warm cases plus four initial strong-scan edit/move x accept/reject cases).
Controlled private capture proves actual scan before publication; no old position
may succeed. First query is either already exact-current or honestly-32803; the
second must return the exact fresh range/URI. This closes those specific gap
controls, not a genuine OS-overflow provider, remount/junction/reconnect,30KUI
or continuous-watch guarantee. Current4521whole check includes these tests but
has not terminated at this update. Historical preparation text above remains
chronological evidence, not its latest execution status.
