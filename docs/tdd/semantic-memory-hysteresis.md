# Semantic memory L3 hysteresis

Parent revision: `7ff7e9d`. This slice implements R-12 without changing the
worker count, resident-context bound or reference strategy.

## RED

The public `SemanticMemoryPolicy` contract entered L3 at 92% but immediately
fell back to L2 when the next sample was 90%, proving that
`level3TargetRatio` was not used:

```text
node --test tests/semantic/semantic-coordinator.test.mjs
AssertionError: 'level2' !== 'level3'
```

## GREEN

The policy now latches L3 after crossing its entry ratio. Samples at or above
the configured target remain L3; the latch clears only below the target, after
which the normal L0–L2 thresholds apply. Invalid samples are still rejected
before policy state changes.

Focused verification:

```text
pnpm check
node --test tests/semantic/semantic-coordinator.test.mjs \
  tests/semantic/type-engine-context-runtime.test.mjs \
  tests/lsp-production-semantic-worker.test.mjs
```

All nine tests passed, including the production one-worker/two-context metrics
transcript. Both changed handwritten files remain below 500 lines.
