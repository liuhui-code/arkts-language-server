# Budget-aware reference context retention

Parent revision: `ebc3b4f`.
Public boundary: a real `dist/server.cjs --stdio` LSP session.

## RED

The test warms a cross-file definition, executes batched references with
`ARKTS_REFERENCES_CONTEXT_RETENTION=budget-aware`, then repeats the definition.
Before implementation the semantic trace had no retention decision and the
executor always disposed the resident context. The expected 1→1 retention
event was absent.

```text
pnpm build
node --test tests/semantic/references-context-retention.test.mjs
```

## GREEN

Reference runtime configuration now accepts `dispose` and `budget-aware`.
The existing `dispose` behavior remains the default. The opt-in profile leaves
the resident context under coordinator ownership, where normal process-memory
sampling can still trim or evict it at L2/L3. The public test observes one warm
context before and after admission and exact identical definitions around the
global query.

One exploratory Settings/API-24 B run passed all 248 exact Locations with a
936,415,232-byte peak; the older dispose run peaked at 1,063,485,440 bytes.
These single runs are not sufficient for graduation or a default change.
