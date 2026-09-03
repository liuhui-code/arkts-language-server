# I2 — Immutable artifact semantic smoke

Date: 2026-09-03

Parent revision: `09fd6b2c69f34dfb6526917d851083a779769fa2`

## Public boundary

The installed command from a manifest-verified directory artifact must run the
same real `Content-Length` stdio semantic scenario as the source-built local
installation. It must do so from an external working directory with an
isolated HOME and without invoking build tools.

## Characterization and minimal change

Before extraction:

```text
node --test tests/release/local-delivery.acceptance.mjs
```

The existing source-install semantic scenario passed 1/1. The scenario was
then moved without behavior changes to
`tests/support/installed-semantic-smoke.mjs`; the same command remained 1/1
GREEN. This is a characterization/refactor slice, so no RED was fabricated.

The immutable-artifact acceptance now invokes that exact helper after
manifest verification and installation. It covers initialize, completion
list, lazy completion resolve, UTF-16 edits, didChange v2, diagnostics clearing,
and exact definition into unopened files. The poisoned `pnpm`, `cargo`, and
`esbuild` invocation log must remain absent after both install and runtime.

## Verification

```text
node --test tests/release/portable-install.acceptance.mjs
# 4/4 passed, 0 failed, 0 skipped

node --test tests/release/local-delivery.acceptance.mjs
# 1/1 passed, 0 failed, 0 skipped
```

The local-delivery command launches an installer which rebuilds files in the
repository. In restricted agent environments it therefore requires the
workspace-write permission inherited by that child process; a denied nested
write is an execution-environment failure, not an LSP assertion failure.

## Remaining boundary

This slice proves semantic behavior of immutable runtime bytes. I3 remains
separate: it must prove that indexing reaches ready through the sidecar adjacent
to the installed artifact and cannot fall back to a repository-relative
binary.

