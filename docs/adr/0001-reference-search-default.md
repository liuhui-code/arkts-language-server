# ADR 0001: Default reference search strategy

Status: **Accepted, release-gated**. Baseline: `349b3abe`.

## Context

The [bounded references plan](../plans/2026-09-10-bounded-references-execution-plan.md)
records that conservative batching preserved exact results but increased cold
latency substantially, while indexed batching improved a fixed Photos memory
comparison without completing the original >3 GB or final 50% memory gates.
Fewer candidates do not imply a small compiler dependency closure.

## Decision

Keep `indexed-batched` with `closure` dependencies and `full` SDK declarations
as the production default. Keep `legacy` as the explicit oracle and emergency
fallback. Do not default to `identity`: the SDK-import regression demonstrated
a missing support-file false negative. Do not use pure `batched` as the product
default. The `ohos-typescript` compiler remains the final semantic authority.

## Consequences and gate

Cold references can still take seconds. No partial result may be reported as
complete. For every graduated real-project symbol, compare sorted URI/range
sets for both values of `includeDeclaration` against a complete compiler oracle;
missing and extra Locations must both be zero. Stale/incomplete index, unknown
identity, project-graph ambiguity, unavailable source, cancellation, and changed
snapshots must use a complete safe path or fail closed. Preserve existing memory
and latency gates. Do not claim the reported 5 GB case resolved until its
original reproducer and final memory gate pass.
