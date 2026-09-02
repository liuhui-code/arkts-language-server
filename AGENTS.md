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
