# E0d scripted protocol build isolation

Date: 2026-09-03

Parent revision: `e69d69bc6609a7b2f0b69200cd1bf016eb26fcbb`

## Contract

- Each Node test process builds the scripted semantic server into one unique
  operating-system temporary directory.
- Repeated helper calls in that process return the same path without rebuilding.
- Concurrent test processes never share an output file and never write to the
  repository `dist` directory.
- The generated CommonJS artifact exists and is accepted by Node before the
  process exits.
- Normal process exit removes the single temporary build directory. A failed
  build removes its directory and rethrows the original build error.

## RED

The public helper contract starts two independent Node processes concurrently.
Each process calls `buildScriptedSemanticServer()` twice, protects the first
artifact's modification time with a fixed sentinel, and checks the generated
file with `node --check`. The parent verifies path isolation and observes
cleanup after both children close. It uses no sleep or timing assertion.

```text
node --test tests/build-test-server.test.mjs
# 0 passed, 1 failed
# Failed to write to output file:
# dist/scripted-semantic-server.cjs: operation not permitted
```

The failure proves that the previous process-top-level builds shared a mutable
repository artifact. Besides the sandbox failure, concurrent Node test files
could race while replacing the same output.

## Minimal GREEN

`buildScriptedSemanticServer()` now lazily creates one `mkdtemp` directory,
builds once, caches and returns that process-owned path, and registers one
synchronous exit cleanup. The four protocol callers consume the returned path
instead of importing a repository-global constant.

```text
node --test tests/build-test-server.test.mjs
# 1 passed, 0 failed

node --test \
  tests/lsp-reliability.test.mjs \
  tests/lsp-workspace-symbol.test.mjs \
  tests/lsp-semantic-request-reliability.test.mjs \
  tests/lsp-workspace-global-freshness.test.mjs
# 32 passed, 0 failed
```

This slice changes only test infrastructure and protocol callers. It does not
change the production server, test-layer manifest, feature matrix, or installed
artifact acceptance.
