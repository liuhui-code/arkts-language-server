# L01 pre-open diagnostic barrier: public CLI RED/GREEN

Parent revision: `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`.

The benchmark-only scenario flag `waitForPreOpenDiagnostics: true` waits between
the previous scenario and its own request for normal version-1
`textDocument/publishDiagnostics` from every declared pre-open target. It does
not change the default request path or claim semantic readiness.

RED: `node --test --test-name-pattern 'second definition waits' tests/prepared-suite-diagnostic-barrier-cli.test.mjs`
with read-only macOS process sampling access exited 1. The child LSP completed
the first references request before both delayed version-1 diagnostics; the
second definition started without a barrier event. An earlier sandboxed run
could not sample child RSS and was not counted as behavior RED.

GREEN: the same command exited 0 (1/1). The child-process Content-Length
transcript preserves both exact Location oracles, records two normal version-1
diagnostics after references, and starts definition after the barrier event.
The focused file and test-layer manifest pass 8/8, including missing-second
fail-closed behavior and the unchanged default path. The existing prepared
suite CLI file passes 23/23; `pnpm check` and `git diff --check` pass.
The final-tree `pnpm check:fast` passed **1295/1295** with read-only macOS
process sampling access. An initial sandboxed full run failed sampler-dependent
cases because process inspection was denied; it was interrupted and is not
reported as a behavior regression or as a passing run.
