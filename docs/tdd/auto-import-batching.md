# Auto-import discovery-root batching TDD record

Parent revision: `6ac95099e0e14af232cd4a771e1a9521008bb7fe`.

## RED 1 — one Program owned every discovered root

The public child-process LSP contract created five ready export candidates in five source files and
configured a two-root limit. Before implementation, completion returned the candidates but emitted
one `completion.program.complete` event with six project roots instead of three sequential Programs
with `3/3/2` roots:

```text
node --test --test-name-pattern="validates every ready auto-import candidate" \
  tests/semantic/semantic-characterization.test.mjs

AssertionError: 1 !== 3
```

The minimal implementation validates ready, workspace-admitted candidates in stable sequential root
batches. Every batch keeps the current document and open overlays pinned, passes only that batch's
discovery candidates to `ohos-typescript`, and merges by compiler completion identity rather than
label. Partial, stale, empty, malformed, or out-of-workspace discovery continues to use the full
workspace path.

## RED 2 — an earlier dependency exposed a weaker duplicate

The fixture then made the first candidate import a declaration owned by a later batch. The compiler
could see that later completion before its discovery candidate was being proved. A first-wins merge
kept the non-pre-resolved item, so `completionItem/resolve` created an extra Program:

```text
AssertionError: 1 !== 0
```

The merge now replaces an identical weaker item when a later batch returns the official
`getCompletionEntryDetails()`-backed pre-resolved form. Same-label items with different module
sources remain distinct. The final public contract returns all five candidate identities, including
two `ChatChoice` sources in different batches, produces the exact import edit for each, and emits no
resolve compiler event.

## GREEN and real boundary

Focused GREEN:

```text
pnpm build
node --test --test-name-pattern="validates every ready auto-import candidate" \
  tests/semantic/semantic-characterization.test.mjs

1 passed, 0 failed
```

The existing >4096, stale fallback, and stable same-name source contracts also pass. A fixed Gramony
replay proved all 12 discovery-backed `Cha` candidates remain pre-resolved and all 16 visible
completion identities/import edits are identical for root limits 128, 8, and 2.

The memory gate failed: the product process-tree peak increased from 487,632,896 bytes at limit 128
to 518,311,936 at limit 8 and 572,743,680 at limit 2. The last two-root batch still followed imports
to 65 of 77 project files. Therefore the default batch limit remains 128 and smaller limits are an
explicit experiment only. No production memory improvement is claimed.
