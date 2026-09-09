# Backend Spike S2a — Direct official-backend host

Parent revision: b6a19f11998bb39f48917c21363ce7338d3f3dd6 (PR #10 merge).
Branch: codex/backend-spike-host.

## RED → GREEN

The first focused command was RED because the spike report state machine did
not exist. After the state machine became GREEN, the committed-evidence test
remained RED because no real official-backend report existed. The first real
runner invocation then exposed an incorrect repository-root calculation and
attempted to read the toolchain lock one directory above the repository.

The minimal implementation corrected the root using fileURLToPath, loaded the
exact S1 compiler module, ran the five raw fixtures through isolated
LanguageService contexts, parsed one target-SDK declaration, disposed every
context, and emitted a bounded report.

## Honest phase status

The report state machine has only three outcomes:

- FAIL when any mandatory executed contract fails;
- INCOMPLETE when a case is deferred, fewer than 30 cases exist, or a required
  category is absent;
- PASS only when every mandatory case executes successfully.

The current report is deliberately INCOMPLETE: 5 passed, 0 failed, and 29
deferred. The default runner exits 42 for this state. The allow-incomplete
flag exists only to commit intermediate evidence and cannot satisfy the S2 gate.

The incomplete this-dot fixture returns the required member completions and
also exposes TS1003 at the edit tail. Because the DevEco oracle remains
unconfirmed, the direct contract gates completion availability and records the
diagnostic observation without declaring it correct or incorrect.

## Verification

- Direct report: OHOS_TYPESCRIPT_SPIKE=INCOMPLETE;
  EXECUTED=5 DEFERRED=29 FAILED=0.
- Report size: 10,402 bytes, below the 64 KiB contract.
- Focused tests: 9/9 passed, 0 fail/cancel/skip/todo.
- Full `pnpm check:fast`: 847/847 passed, 0 fail/cancel/skip/todo
  (464,636.87 ms).
- Default runner without the allow-incomplete flag: exit 42.
- Production ohos-typescript import gate: passed.
- `git diff --check`: passed.
