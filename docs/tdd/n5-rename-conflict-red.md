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

## Minimal GREEN

The production rename path now runs a bounded conflict preflight after
`getRenameInfo` succeeds and before `findRenameLocations` constructs any edit.
The first slice deliberately applies only to the name of a top-level class
declaration (including an ArkTS `struct` represented as a generated class).

It uses only the checked-in TypeScript 5.9.2 public API:

- `LanguageService.getProgram()` and `Program.getSourceFile()` obtain the exact
  program snapshot already used by rename.
- `ts.forEachChild` and public node ranges locate the identifier at the rename
  trigger span without importing TypeScript internals.
- `TypeChecker.getSymbolAtLocation()` identifies the queried declaration.
- `TypeChecker.resolveName()` performs one exact lookup for the proposed name
  in the target's value/type/namespace space with globals excluded. This avoids
  allocating the full visible-symbol array in a large module.
- `getExportSymbolOfSymbol()` followed by `getMergedSymbol()` normalizes the
  local/export proxy pair. It does **not** follow import/export aliases to their
  origin, so origin, barrel-public, and consumer-local rename layers stay
  distinct.
- `SymbolFlags.ClassExcludes` reuses TypeScript's declaration-merging rules;
  for example, it does not blindly reject every symbol visible in both the type
  and value namespaces.

For the applicable slice, a missing program, source file, or target symbol is
`indeterminate` and fails closed through the existing `unavailable` outcome.
Confirmed conflict also becomes `unavailable`, which the existing LSP adapter
maps to fixed `RequestFailed (-32803)` with no result. Non-applicable alias and
barrel positions retain the established TypeScript prefix/suffix rename path.

GREEN verification:

```text
pnpm check
pnpm build
node --test --test-name-pattern="target name already exists" \
  tests/semantic/rename-completeness.test.mjs
# 1 passed, 0 failed, 5 skipped

node --test --test-concurrency=1 \
  tests/semantic/rename-completeness.test.mjs \
  tests/semantic/rename-depth.test.mjs \
  tests/lsp-semantic-request-reliability.test.mjs \
  tests/lsp-workspace-global-freshness.test.mjs
# 26 passed, 0 failed, 0 skipped
```

## Expansion test plan

Do not broaden the preflight ahead of tests. Add these as independent public
stdio RED→GREEN slices:

1. Querying a use-site of the same top-level class rejects the same conflict.
2. A class rename conflicts correctly with top-level class, enum, type alias,
   variable, function, and import bindings according to namespace rules.
3. Legal class/interface and class/namespace declaration merges remain
   available; a same-symbol/no-op rename is not mistaken for a conflict.
4. An inner binding may shadow an outer binding, while two bindings in the same
   block/function scope conflict.
5. Class and struct members use their containing type's member table rather
   than lexical `getSymbolsInScope` results.
6. Import aliases, explicit export aliases, and shorthand barrel exports check
   the queried alias layer, never only the canonical origin.
7. A conflicting unopened declaration is detected from the complete workspace
   program snapshot.

If the logic grows beyond the current top-level-class slice, extract a small
`preflightRenameConflict(program, sourceFile, triggerSpan, newName)` module.
Unit characterization should then lock: identifier lookup boundaries,
export/local same-symbol normalization, `ClassExcludes` compatibility, exact
scope comparison, and the `clear | conflict | not-applicable | indeterminate`
result algebra. Real stdio tests remain authoritative for LSP error mapping,
alias semantics, virtual-document coordinates, and atomic absence of edits.

## Original GREEN plan

The RED commit defined this sequence; steps 1–3 and 5 are complete for the
bounded top-level-class slice:

1. [x] Detect whether the requested target name resolves to an existing declaration
   in the renamed declaration's effective scope before constructing edits.
2. [x] Reject the whole operation through the existing editor-neutral unavailable
   outcome, preserving the fixed LSP `-32803` mapping.
3. [x] Keep non-conflicting local aliases, barrel aliases, and origin renames GREEN;
   do not replace TypeScript's prefix/suffix-aware rename locations.
4. [ ] Add conflict cases only when they define a distinct semantic boundary:
   value/type namespace compatibility, member scope, imports/aliases, and
   unopened declarations. Each case must start as its own public RED.
5. [x] Run the focused completeness, depth, reliability, and workspace-global
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
