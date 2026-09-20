# ADR 0003: Reference verifier lifecycle

Status: **Accepted**.

## Context and decision

Keep one transient Worker per reference batch and terminate it after the
compiler-verified result or failure. Do not make the verifier Language Service
permanently resident. The [R1 evidence](../reports/2026-09-11-bounded-references-r1.md)
found retention growth with a same-isolate prototype; cold profiling attributes
most time to Program/Checker preparation, not `findReferences` itself.

Request-scoped Worker-shell reuse may be measured behind an experimental flag
only after phase tracing exists. It may reuse the shell, not silently retain a
Language Service. Global verifier concurrency stays at one. No `ts.Symbol`
crosses a Program boundary.

## Graduation gate for an experiment

Require exact Location equality, a statistically meaningful latency gain,
peak RSS no more than 10% above per-batch, and the existing post-eviction
memory gate. Any retention trend reverts to the transient default.
