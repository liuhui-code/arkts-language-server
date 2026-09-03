# N2c/N3 — Rename completeness and safety

Date: 2026-09-03

Parent revision: `8199a65`

## Public boundary

Every slice starts the production `dist/server.cjs --stdio` process and sends
LSP 3.17 `textDocument/rename` requests. Only the request document is opened;
all related ArkTS documents are discovered from the workspace and edited with
explicit `null` versions. Assertions apply the returned `WorkspaceEdit` with
the shared strict codec so exact UTF-16 ranges and atomic document versions are
part of the observable contract.

## Checklist

- [x] Renaming a shorthand barrel exported name preserves the origin, rewrites
  the barrel to `Profile as Account`, and updates every downstream public
  import/reference.
- [x] Renaming an explicit public export alias changes only the public alias
  layer and downstream public imports, not the origin name or local aliases.
- [x] Renaming an explicit consumer-local alias changes only that import alias
  and its local references.
- [x] An invalid target name returns fixed JSON-RPC `InvalidParams` (`-32602`)
  and no `WorkspaceEdit`.
- [x] An out-of-workspace rename location rejects the entire operation with
  fixed `RequestFailed` (`-32803`) and no partial edit.
- [ ] A symlink-escaped, unreadable, or otherwise
  unmaterializable rename location rejects the entire operation with fixed
  `RequestFailed` (`-32803`) and no partial edit, when a deterministic public
  fixture can exercise that condition.

The slices were added one at a time. No stable production RED was found in the
bounded scope, so no production implementation change is justified by this
task.

## Slice 1 — Barrel exported name

The initial graph is:

```text
barrel-public/model/Profile.ets
  -> barrel-public/model/index.ets
    -> barrel-public/Consumer.ets
    -> barrel-public/OtherConsumer.ets
```

The barrel alone is opened at version `7`. The expected edit keeps
`class Profile` byte-for-byte unchanged, changes the barrel export to
`Profile as Account`, and changes both unopened consumers' import specifiers
and type references to `Account` with version `null`.

The first run reached the real rename path, but a fixture named its functions
`renderProfile` and `fallbackProfile`. The assertion helper correctly found
those textual substrings before the intended type references. Renaming those
unrelated fixture declarations removed the ambiguity; the unchanged production
server then passed the exact barrel, consumer, version, and edit-application
contract.

## Slice 2 — Explicit alias boundaries

The second graph uses all three names simultaneously:

```text
class Profile
  -> export { Profile as PublicProfile }
    -> import { PublicProfile as UserProfile }
    -> import { PublicProfile }
```

Renaming `PublicProfile` at the barrel changes the barrel public alias, the
aliased consumer's imported side, and every unaliased public consumer
reference. It does not change `Profile`, `UserProfile`, or local uses of
`UserProfile`. A separate request at a `UserProfile` use changes only that
consumer's import alias and local references. Both request documents carry
their exact open versions; every unopened edit carries `null`.

## Slice 3 — Invalid name

A real semantic rename request with `newName: "not valid"` returns exactly:

```json
{
  "code": -32602,
  "message": "Rename requires a valid identifier."
}
```

The response has no result, proving no `WorkspaceEdit` leaks through the public
boundary.

## Slice 4 — Atomic workspace containment

The test creates sibling `workspace/` and `outside/` directories. The workspace
consumer imports the outside declaration, and the outside declaration is the
opened rename origin. This forces TypeScript to report a rename location that
is outside the configured root. The LSP response is exactly:

```json
{
  "code": -32803,
  "message": "Rename is not available at this position."
}
```

No result is returned and both files remain byte-for-byte unchanged. An earlier
attempt queried the consumer's unaliased local binding instead; TypeScript
correctly scoped that operation to a local import alias and therefore reported
no outside location. Moving the query to the origin makes the safety premise
observable instead of assuming an internal location set.

## Focused verification

```text
node --test tests/semantic/rename-completeness.test.mjs
# 5 passed, 0 failed, 0 skipped
```

All five cases are GREEN characterization of the existing production server.
Symlink-escape and unreadable-file variants remain intentionally unchecked:
their filesystem behavior is platform- and privilege-sensitive, while the
direct out-of-root case deterministically proves the same public atomic
containment contract.
