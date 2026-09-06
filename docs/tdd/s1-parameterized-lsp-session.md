# S1 parameterized LSP session TDD evidence

- Parent revision: `134e8ba8ad7b3b4783c83d6b7bb44ba78ed20159`
- Scope: reusable initialize and bounded shutdown/exit lifecycle for an injected real LSP target

## RED

Command:

```sh
node --test tests/lsp-session.test.mjs
```

The public session test could not load the planned helper:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'tests/support/lsp-session.mjs'
```

## GREEN

`LspSession` now accepts `command`, `args`, `cwd`, `env`, `rootUri`, and client
`capabilities`. It initializes the real `dist/server.cjs --stdio` process, sends
the `initialized` notification, then closes via `shutdown` followed by `exit`.
Both protocol waits are bounded, and repeated `close()` calls share the same
result.

The test uses a relative bundle path to exercise the injected working directory
and an isolated `ARKTS_LSP_LOG_DIR` to prove the injected environment reaches
the child process.

Verification from a freshly built bundle:

```sh
pnpm build
node --test tests/lsp-session.test.mjs
```

Result: `1/1` passed, `0` failed, `0` skipped.
