# Q-store bounded code-action resolution registry

Date: 2026-09-03

Parent revision: `5df61c0853b890dc07286df32e66142d8d3cf867`

## Scope

This independent slice adds the server-owned registry required by later Q1/Q2
code-action list and resolve integration. It does not register LSP handlers,
change capabilities, call TypeScript, generalize the completion registry, or
edit the shared test-layer manifest.

The public store binds an opaque UUID to an immutable snapshot containing:

- document URI and version;
- the canonical quick-fix title, kind, and diagnostic;
- the compact action fingerprint used by the future resolver.

Lookup returns one of `active`, `stale`, or `unknown`. A document change or
close calls `forgetDocument`, which replaces matching active entries with
payload-free stale tombstones. This preserves the distinction between an
expired server-issued UUID and forged client data.

## Bounds and trust boundary

- Active entries and tombstones share one FIFO limit of 512 entries.
- Serialized active record payloads share a 512 KiB limit.
- A single record larger than 512 KiB is rejected before existing state is
  changed.
- When the byte limit is crossed, complete oldest entries are evicted; records
  are never truncated.
- Replacing an active record with a tombstone releases its accounted payload.
- `clear` removes active entries and tombstones and resets byte accounting.
- Client data must have exactly one own key named `arktsCodeActionId`, whose
  value is a canonical UUID v4 string. Extra enumerable, non-enumerable, or
  symbol keys cannot reach a record.
- Records are structured-cloned and deeply frozen on insertion. Returned data,
  lookup envelopes, records, and nested action descriptors are immutable, so
  caller or client mutation cannot alter registry state.

The 512 KiB budget covers serialized active payloads. UUID/Map/tombstone object
overhead is separately bounded by the 512-entry cap.

## RED to GREEN

Focused command for every cycle:

```text
node --test tests/code-action-resolution-store.test.mjs
```

Observed stable RED slices:

1. The tracer failed because `src/lsp/code-action-resolution-store.ts` did not
   exist. Minimal GREEN added remember/lookup and 512-entry FIFO eviction.
2. Data with an extra client-controlled field still resolved as active.
   Minimal GREEN required the UUID-only shape and UUID v4 value.
3. `forgetDocument` left matching records active. Minimal GREEN replaced only
   that document's records with stale tombstones.
4. Mutating the source record after `remember` changed the later lookup.
   Minimal GREEN snapshots and deeply freezes the record and returned values.
5. Two 300 KiB records remained active simultaneously. Minimal GREEN added the
   512 KiB serialized-payload budget and FIFO byte eviction.
6. A non-enumerable extra own field bypassed the initial `Object.keys` guard.
   Minimal GREEN validates all own keys with `Reflect.ownKeys` and reads the ID
   from its own data descriptor.

The clear, single-oversize rejection, payload-release, and combined tombstone
capacity assertions were GREEN when added after their underlying minimal
implementations. They are recorded as boundary characterization rather than
claimed as additional RED cycles.

## Verification

```text
node --test tests/code-action-resolution-store.test.mjs
pnpm check
```

Final focused result: `8/8` passed, `0` failed, `0` skipped. TypeScript checking
passed. The new test remains intentionally unclassified until the integration
track updates the shared manifest.

