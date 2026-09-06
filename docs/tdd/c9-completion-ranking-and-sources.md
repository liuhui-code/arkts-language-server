# C9 completion ranking and source identity

Date: 2026-09-03

Parent revision: `eb0ef8c`

## Public boundary

A real Content-Length stdio session opens one consumer containing a local
`RankLocal` declaration. Two unopened ArkTS modules both export a class named
`RankedChoice`. Two identical completion requests at the `Rank` prefix assert:

- the local item precedes the auto-import items;
- both semantically distinct import choices remain available;
- each same-name choice exposes a stable, workspace-relative module identity;
- response order, `sortText`, edits, kinds, and details are stable after the
  server-owned opaque UUID is removed from the comparison.

Keeping both modules is intentional. De-duplicating solely by label would make
one valid import unreachable; mature completion UIs distinguish the sources
instead. Exact duplicates from one TypeScript entry are not introduced by this
scenario.

## RED

The server already ranked the local item first and returned stable responses,
but both auto-import choices were visually indistinguishable:

```text
expected: ["./RankedAlpha", "./RankedBeta"]
actual:   ["TypeScript class export", "TypeScript class export"]
```

Focused command:

```text
node --test --test-name-pattern="ranks local completion first" \
  tests/semantic/semantic-characterization.test.mjs
```

## GREEN

The minimal change uses TypeScript's human-readable `sourceDisplay` when it is
available. When TypeScript only returns an absolute project path, the server
converts it to a slash-normalized, extension-free module specifier relative to
the importing file. Package specifiers and local completion details remain
unchanged; resolve still replaces the list detail with the full symbol
signature.

Verification:

```text
pnpm build
# GREEN

node --test --test-name-pattern="ranks local completion first" \
  tests/semantic/semantic-characterization.test.mjs
# 1 selected passed

node --test tests/semantic/semantic-characterization.test.mjs
# 10/10 passed, 0 skipped

pnpm check
# GREEN, no TypeScript errors
```

