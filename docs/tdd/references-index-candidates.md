# References index-candidate TDD record

Parent revision: `b70367964bf7b32e66524b08b4aeb1acde6bd8ff`

## RED

The first public Rust sidecar protocol test sent `references/candidates` for an exported
declaration whose name crossed a re-export and import-alias chain. Before implementation it failed
with `method_not_found`:

```bash
cargo test -p arkts-index-sidecar --test ndjson_protocol \
  sidecar_returns_conservative_reference_candidates_across_alias_reexports -- --exact
```

The TypeScript adapter slice then failed because `referenceCandidates` returned `undefined`:

```bash
node --test --test-name-pattern="maps conservative reference candidates" \
  tests/index-adapter.test.mjs
```

Finally, a real child-process LSP test failed because `indexed-batched` was not a valid strategy.
After the first implementation it failed again because indexed and conservative execution both
created eight batches, proving that the candidate result had not reached the compiler planner:

```bash
pnpm build
node --test --test-name-pattern="indexed batching" \
  tests/semantic/references-batching.test.mjs
```

The same public test was tightened once more to require an isolated compiler anchor for usage-site
queries; it failed until the anchor Program moved to a transient verifier worker.

## GREEN

The completed slice adds declaration/occurrence/alias data to the existing SQLite generation,
exposes `references/candidates`, and only narrows when the result is supported, complete, ready,
identity-bearing, and matches the currently committed generation. Otherwise it falls back to R1
conservative batching. Open overlays remain pinned into every applicable batch, and the official
compiler still proves every final Location.

Focused results:

```text
Rust sidecar protocol: 1 passed
TypeScript index adapter: 1 passed
Public LSP indexed batching: 1 passed
Full public references batching/cancellation/indexed suite: 3 passed
```

The public test covers import alias, re-export, same-name false-positive removal, an overlay-only
reference absent from the persisted index, fewer compiler batches, and exact normalized Location
equality with conservative batching. The Rust protocol also proves unsupported fallback for
members and default exports, plus stale-on-restart completeness.
