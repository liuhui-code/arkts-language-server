# Engineering contract

This repository uses test-driven development for every behavior change,
defect fix, refactor, build/CI change, and developer-tooling change.

- Start behavior changes with a failing test through the closest stable public
  interface. Record the failing command and parent revision.
- Work in vertical slices: one test, one minimal implementation, then refactor
  while GREEN.
- Refactors require an existing characterization test that protects the
  behavior being preserved.
- LSP behavior is tested through a real child process and Content-Length framed
  stdio. Do not test private server internals instead.
- Only advertise an LSP capability after its public transcript is GREEN.
- Run `pnpm check:fast` before requesting merge. Rust changes additionally run
  their focused `cargo test` and the relevant release build.
- Never push or merge directly to `main`; use a branch and pull request.
- stdout belongs exclusively to LSP/internal protocols. Operational logs go to
  stderr.

## Source file size

- Handwritten source, test, and script files must stay at or below 500 physical
  lines (including blank lines and comments). Generated and vendored files are
  excluded.
- Existing files above 500 lines are migration debt, not permission to add more
  large files. When changing one, keep its line count from growing and extract
  a cohesive responsibility toward the limit in the same change. Preserve
  behavior with a characterization test before refactoring.
- Do not split code mechanically just to satisfy the count; keep module
  boundaries and ownership clear. Record any remaining over-limit file in the
  change summary so the incremental migration stays visible.

## Agent skills

Before using repository-planning, triage, diagnosis, TDD, or architecture
skills, read the matching repository guidance:

- Issue tracker operations: `docs/agents/issue-tracker.md`
- Triage label vocabulary: `docs/agents/triage-labels.md`
- Domain-document discovery and terminology: `docs/agents/domain.md`
