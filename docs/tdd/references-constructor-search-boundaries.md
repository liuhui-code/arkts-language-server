# Constructor search boundaries before candidate narrowing

Parent HEAD `9f91122ac504365c57473a430094da09baac9309`, existing dirty
`codex/references-f2-fixed-benchmark` preserved. Follow-up to the
[rejected-batch attribution](../reports/2026-09-27-settings-rejected-batch-trace.md).

## Characterization, not a fabricated bug fix

Inspect the installed, pinned `ohos-typescript` 4.9.5-r10 implementation:
`addConstructorReferences`, `findOwnConstructorReferences`,
`findSuperConstructorAccesses`, `findInheritedConstructorReferences`.
Compiler module SHA256
`af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`.
These implementation functions are inspected, not invoked by server code or
tests and not adopted as private production APIs.

Extend the existing public constructor characterization, retaining the closest
stable interface: real Node child process, Content-Length framed LSP, real Rust
sidecar. Add a static `new this()` factory on the base and an implicit descendant
of the already explicitly constructed child. The base-constructor search must:

- Include the static factory construction with **no base-class lexeme**.
- Include the child's `super()` but **exclude** `new Leaf()` inheriting that
  child's own constructor, rather than the base constructor.
- Still include the separate two-level implicit descendant alias calls.
- Keep same-name isolation, both declaration policies and exact per-query
  comparison across legacy/indexed/grouping/trace-off profiles.

```sh
node --test --test-name-pattern='explicit constructor references' \
  tests/semantic/references-anchor-reuse.test.mjs
```

Result: **1/1 PASS**, exit 0, 102,110.798 ms, zero failures/skips. This is a
characterization of existing behavior; no failing production behavior or
optimization is invented. The test grows 483→489 physical lines, within 500.
No production source/default/Worker/budget/index schema change is made.

The fixed Settings checkout contains actual MenuController derivations and
`super` calls, but a source search did not find `new this()`. The added fixture
is a backend search-boundary guard, not a real business-project benchmark or a
claim of target-SDK restriction/diagnostic parity. Settings remains the sole
real-project performance gate and its source/boundaries/oracle are unchanged.

Class export identity is still insufficient to prove constructor candidate
completeness. Future narrowing must account for static factories as well as
alias/re-export and implicit inheritance, and respect explicit-constructor
barriers; names alone cannot safely admit or exclude these call sites.
Compiler remains the final authority and complete fallback remains required.

## Full gate

The first non-escalated full run was deliberately interrupted (exit 130) before
completion to rerun the external-process-sampling tests with authorized access.
It is not a passing full run. The fresh authorized `pnpm check:fast`, after
the final test edits, completes with exit 0: **996/996 PASS**, zero failures,
cancellations, skips or todos; **908,988.667 ms**. The expanded constructor
transcript passes again within this whole-suite run (99,971.811 ms).
Nested skip/todo fixtures intentionally test gate rejection; the final parent
suite has zero runtime annotations. No assertion or timeout was weakened.

The existing Settings manifest preflight also passes against the final build,
using pinned Node v26.3.0: server, semantic Worker, verifier Worker, adjacent
standard-library delivery, sidecar, project, SDK and constructor oracle match.
The first unqualified Node preflight correctly rejects host v21.6.2; rerunning
with the pinned executable succeeds. No replay is launched or result file
created by preflight. Previous Settings 52.584 s/267 exact evidence remains
the same build, not a new run or a new performance improvement.

`git diff --check` and documentation links pass. Only this test is changed in
production/test code for this slice, 489 lines; prior oversized-file migration
debt is untouched. No production behavior/default, commit, push or merge.
