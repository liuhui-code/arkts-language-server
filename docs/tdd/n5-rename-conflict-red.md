# N5 — Rename same-scope conflict RED

Date: 2026-09-03

Parent revision: `061a46a20f36b0d26000cb2adb0f013b6c40ed74`

## Public contract

The production `dist/server.cjs --stdio` process opens one ArkTS module that
already declares top-level classes named `Account` and `Profile`. Renaming the
`Profile` declaration to `Account` would create two declarations with the same
name in one lexical/module scope.

The LSP boundary must reject that unsafe operation atomically:

```json
{
  "code": -32803,
  "message": "Rename is not available at this position."
}
```

The response must have no `result`; in particular, no partial `WorkspaceEdit`
may escape. The fixture remains byte-for-byte unchanged.

## Test-only RED checklist

- [x] Add a deterministic same-scope `Account` / `Profile` fixture.
- [x] Query the real stdio rename boundary at the `Profile` declaration.
- [x] Require fixed `RequestFailed (-32803)` and no `WorkspaceEdit`.
- [x] Observe and record the current production RED.
- [x] Commit test assets only; do not change `src/**` or shared acceptance.

## RED evidence

The focused command was run twice against the unchanged production server:

```text
node --test --test-name-pattern="target name already exists" \
  tests/semantic/rename-completeness.test.mjs
# 0 passed, 1 failed, 5 skipped
```

Both runs failed at the intended public assertion. Instead of returning the
fixed error, the server returned one versioned `documentChanges` entry with
three edits from `Profile` to `Account`: the class declaration and both type
references. This would create a duplicate top-level declaration, so the
returned edit is precisely the unsafe result the contract forbids.

No production file was changed, and the RED did not involve a timeout,
transport failure, build failure, or host-dependent fixture.

## Follow-up GREEN plan

The application task should proceed in vertical slices after this RED commit:

1. Detect whether the requested target name resolves to an existing declaration
   in the renamed declaration's effective scope before constructing edits.
2. Reject the whole operation through the existing editor-neutral unavailable
   outcome, preserving the fixed LSP `-32803` mapping.
3. Keep non-conflicting local aliases, barrel aliases, and origin renames GREEN;
   do not replace TypeScript's prefix/suffix-aware rename locations.
4. Add conflict cases only when they define a distinct semantic boundary:
   value/type namespace compatibility, member scope, imports/aliases, and
   unopened declarations. Each case must start as its own public RED.
5. Run the focused completeness, depth, reliability, and workspace-global
   freshness suites before the full repository gate.

## Installed semantic closure plan

After the production bundle is GREEN, close the installed-artifact behavior in
a separate test-first slice without editing shared acceptance in this RED:

1. Add a conflict marker/case to the versioned conformance corpus rather than
   referring to repository-only fixture paths.
2. Extend the installed semantic scenario runner to issue rename through the
   packaged immutable command and assert exact `-32803` plus absent `result`.
3. Run the same case against the repository bundle and the installed command;
   require identical JSON-RPC semantics.
4. Only after both targets are GREEN, update the feature evidence claim and
   portable acceptance atomically on their owning task.
5. Preserve the existing successful installed rename edit case so rejection
   support cannot accidentally disable rename wholesale.
