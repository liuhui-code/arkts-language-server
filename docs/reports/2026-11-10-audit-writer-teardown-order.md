# IDX-V1-TEST-LIFETIME-001: audit directory teardown precedes its writer

Status: confirmed fixture defect; independently reordered copy GREEN, not integrated while IX19 is frozen.
This is not evidence of a product Worker/Program leak. No user service was stopped.

## Observed failure and stalled resources

IX19 source028bd76f (2441inputs) failed `Stage resource/source namespace respects physical aliases: hardlink`
with ENOTEMPTY at `tests/lsp-resource-source-namespace.test.mjs:14`. The same test file registers
auditRoot removal before `createReadinessFixture`, whose later after-hook closes sessions at
`tests/support/semantic-readiness-lsp.mjs:67-70`. The real audit adapter keeps appending until its Native
child exits (`tests/fixtures/index/native-wire-audit.mjs:10,33-35`).

The exact test process88623 retained LSP88638, wrapper88639 and Native88640; the whole-gate log
had not advanced for390s. Read-only descendant evidence is in
`namespace-final-20261109/ix19-cleanup-stall-process-tree.json`. Node20.19.5's actual hook-order probe
returned early-directory-removal, late-close-start, late-close-end. Its pinned implementation appends
hooks and awaits them in registration order; an error stops that loop. See the official
[Node20 test documentation](https://nodejs.org/download/release/v20.19.5/docs/api/test.html#contextafterfn-options)
and [pinned implementation, createHook/runHook](https://github.com/nodejs/node/blob/v20.19.5/lib/internal/test_runner/test.js#L598).
Context7 resolve failed at transport; no successful query-docs result is claimed.

Only exact owned test server88638 received SIGTERM after PID/PPID/command revalidation. All four recorded
PIDs were subsequently absent and the full gate resumed. This intervention and the original failure
remain in `ix19-cleanup-stall-intervention.json`; IX19 cannot be described as a normal whole-gatePASS.
The declaration-read path optimization may change timing, but no causal evidence makes it responsible
for this existing hook-order error. Earlier passes do not prove this teardown was safe.

## Bounded real-process counterexample and control

`namespace-final-20261109/cleanup-order-diagnostic` contains exact-source-hashed independent copies
of the publicLSP test. No frozen W file changed. A diagnostic preload observes Native identity/exit
records and actual PID presence at auditRoot deletion. On an unsafe delete it retains the directory
rather than throwing, so the subsequent fixture close can still run; a final hook asserts ordering.
This is a controlled lifecycle assertion, not a claimed natural ENOTEMPTY reproduction.

- Original ordering: identities1/exits0/activeNative5106; final ordering assertionRED, actual test body
  still validates its original LSP results. The later close completes normally because the diagnostic
  preserved the directory.
- Copy with audit cleanup registration after fixture creation: identities1/exits1/activeNative empty;
  same public transcript and ordering assertionGREEN.
- Only named hardlink case executed; two other cases are explicitly name-filtered, not passed.

Commands use pinned Node20.19.5, `--import observe-cleanup.mjs --test --test-name-pattern=hardlink`
and baseline.test.mjs/fixed.test.mjs respectively, with distinct IX_AUDIT_CLEANUP_TRACE files.
`ix19-cleanup-order-controlled-proof.json` preserves exact sources, logs, observations and hashes.

## Repair boundary and remaining verification

Own the audit directory until its real writer has closed; do not retry rmSync or sleep to hide the race.
Before integration, add a persistent lifecycle regression which asserts session/Native close precedes
removal and covers setup/body failure. Preserve cleanup of partially prepared fixtures. LspSession.close
is already idempotent at `tests/support/lsp-session.mjs:76-78`; use that contract rather than suppressing
close errors or adding process-kill behavior to a passing test.

Frozen IX19 continues to gather the rest of its results. Integrate only after terminal, then run the
repaired exact public cases and a fresh complete gate. The existing22port +22LSP read-proof checks do
not cover this teardown bug and cannot replace the new whole gate. No product lifecycle or ADR0042
contract is weakened; this fixture must honor that ownership ordering.


## Existing ownership helper and failure-path controls

The repository already has `tests/support/test-resource-scope.mjs::createTestResourceScope`: one
after-hook owns a reverse-ordered list of async closes, then directory removal; errors are aggregated
after all closes/removal have been attempted. Its characterization in `tests/test-resource-scope.test.mjs`
covers failed body plus earlier-close and removal failures. Reuse this existing contract rather than
relying on hook registration timing or inventing a new cleanup framework.

Independent realLSP copied controls in `cleanup-order-diagnostic/owned-scope-controls.json`:
- owned-fixed: exit0; identities1/exits1/no activeNative at directory removal.
- controlled body failure after initialization: expected exit1 retains the primary error; identities1/
  exits1/no activeNative at removal, no hook failure.
- controlled setup failure before initialize: expected exit1 retains the primary error; identities0/
  exits0/no activeNative at removal. This case does not claim a Native was started.

Each case has two unrelated name-filtered cases, not two successes. The diagnostic observer preserves
a directory on an active-writer violation so it cannot recreate the stuck cleanup it observes. The
owned-scope control passes without that suppression. Frozen W remains unchanged; minimal integration
will import the existing helper, register the audit directory with it, and track the idempotent
`f.session.close()` before body work can fail. The fixture's own later cleanup keeps its directory
ownership and reuses the same close Promise. A new final whole gate remains required.


## Integrated repair after authoritative IX19 terminal

IX19 ended2026-11-10T10:57:03.852172Z,2462PASS/1FAIL/0skip,4642.525s wall,2441inputs
unchanged. The original teardown failure and controlled owned-server intervention remain preserved.
Only after terminal, the actual test imported createTestResourceScope, tracked f.session.close(),
and asserted all observed Native identity records have matching normal exit records before removal.
The regular fixture close remains idempotent. All three realLSP alias cases and the existing generic
failed-body/close/removal ownership test passed4/4,0skip in6.853s. No product lifecycle or threshold
changed. Receipt ix19-cleanup-integrated-receipt.json. Status FIXED_PENDING_FINAL_GATE.

Fresh IX20 source68aa4629/2441inputs is now running. Complete79-asset runtime snapshot was taken
after its build, while tests run, and must be rechecked after terminal; do not describe it as a
before-first-test snapshot. Source identity and primary runtime checks remain in the gate receipt.
Photos32/tool33, scale33/Python19+Node9, density34/Python20+Node5, topology35/Python6+Node8
waiters are characterized and serial, not completed workload. Windows SSH read-only recheck at
10:48:59Z still timed out; no Windows deployment or UI verification.


## IX20 final complete-check result

The repaired candidate source snapshot `68aa4629acb6683a330b85ff7f4d795a128dee6833b48f80b9239e38c255b68f` passed the fresh complete gate: **2463/2463**, zero failures, skipped, cancelled or todo; 4121.232 seconds wall time, ended 2026-11-10T12:11:15.096391Z. All2441 source inputs and the79 runtime assets matched the recorded candidate. Rust evidence is exact249-input reuse, not a fresh cargo run. Evidence: `.bench/index-versioned-maintenance-20261104/namespace-final-20261109/ix20-terminal-qualified-check-receipt.json`. The intervened IX19 failure remains preserved; it is not relabelled PASS.

Photos32 is a separate, ongoing protocol-driven single-session soak; its completion and post-fix scale performance have not yet been established. This is not real Zed UI acceptance.
