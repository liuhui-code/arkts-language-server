# D2.1: one-command local delivery

Parent revision: `548e649369ce421b2c4bfb3ec75cbd617a3ec263`

Public command: `scripts/install-local.sh [BIN_DIRECTORY]`

## RED

From a cwd outside the repository:

```text
node --test tests/local-delivery.test.mjs
not ok 1 - one local command builds and idempotently installs a working Zed language server
ENOENT: no such file or directory, stat '.../dist/server.cjs'
```

The old installer only created a symlink. It did not build the server bundle or
the Zed extension.

## GREEN

The same public test now proves one command:

1. installs the frozen Node dependency graph and builds `dist/server.cjs`;
2. builds the Rust extension for `wasm32-wasip2` and atomically publishes
   `editors/zed/extension.wasm`;
3. creates or refreshes the requested CLI symlink without replacing unrelated
   paths;
4. succeeds when run again; and
5. starts the installed `arkts-language-server --stdio` from `/tmp` and answers
   a real framed LSP `initialize` request.

```text
node --test tests/local-delivery.test.mjs
1 test passed
```

The command only writes build outputs inside the checkout and the explicitly
requested bin directory. It does not read or write Zed's global extensions
directory or development-extension symlink.

## Integration concurrency regression

The first full quality-gate run exposed a second RED: Node ran the two public
installer suites concurrently, so both attempted to install dependencies and
write the same build outputs; both failed after roughly 70 seconds.

The initial GREEN skipped dependency installation when `esbuild` happened to
exist. Review found that this could silently reuse `node_modules` after
`pnpm-lock.yaml` changed. The hardened installer writes an atomic SHA-256 stamp
only after `pnpm install --frozen-lockfile` succeeds, and skips installation
only when both the required binary and matching lockfile stamp exist. The
public fake-toolchain test proves first install, unchanged-lock skip, and
reinstall after a lockfile change without running a real release build.
