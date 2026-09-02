# B1 semantic characterization evidence

- Parent revision: `a4da5556b7f233abee00b152356ab477dba76f31`
- Scope: public ArkTS completion and definition behavior through a real LSP child process
- Production changes: none
- Capability changes: none

## Environment precondition

The first build attempt stopped before starting the language server because this
worktree had no installed dependencies:

```text
pnpm build && node --test tests/semantic/semantic-characterization.test.mjs
sh: esbuild: command not found
```

This was an environment failure, not behavioral RED. Dependencies were restored
without changing the lockfile using:

```text
pnpm install --frozen-lockfile --offline
```

## Characterization cycles

Each case was added and executed before adding the next case. All three
behaviors were already GREEN at the parent revision, so no production fix was
introduced merely to manufacture RED.

1. `completes inherited fields and methods after this dot`
   - Command: `pnpm build && node --test tests/semantic/semantic-characterization.test.mjs`
   - Result after the first slice: `1/1` passed
2. `maps a definition in a rewritten ArkTS struct back to source coordinates`
   - Command: `pnpm build && node --test tests/semantic/semantic-characterization.test.mjs`
   - Result after the second slice: `2/2` passed
3. `resolves a definition through an import alias and barrel export`
   - Command: `pnpm build && node --test tests/semantic/semantic-characterization.test.mjs`
   - Result after the third slice: `3/3` passed

The tests communicate exclusively through Content-Length framed stdio and
assert observable completion labels and definition locations. They do not call
semantic implementation internals.

## Final verification

- `pnpm check:fast`: passed (`3/3` nested semantic tests)
- `node --test tests/*.test.mjs tests/**/*.test.mjs`: passed (`8/8` root and
  nested tests)

The existing package-script glob only selected nested test files in this
worktree's shell, so the second command explicitly included the pre-existing
root-level suites. Fixing that shared test script is outside B1 ownership.
