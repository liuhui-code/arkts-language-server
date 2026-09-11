# References R3 — declaration façade fidelity spike

Parent revision: `b70367964bf7b32e66524b08b4aeb1acde6bd8ff`.

This spike is intentionally outside production composition. It asks whether
the locked OpenHarmony TypeScript frontend can emit a declaration façade that
could later represent a dependency without loading all dependency source into
one references `Program`.

## First RED → GREEN slice

The first public contract invokes the spike runner in a real child process for
an exported ArkTS class. It requires an in-memory `.d.ets` output, the expected
public method signature, compiler version `4.9.5`, and zero error diagnostics.

The initial command was:

```text
node --test tests/ohos-typescript-spike.test.mjs
```

It was RED with one failure because
`scripts/semantic/ets-declaration-facade-spike.mjs` did not exist. The minimal
implementation uses the locked compiler's public declaration-emit API, captures
all output in memory, and exits `42` when emission or mandatory diagnostics
fail. It does not alter the production semantic backend or references strategy.

## Additional GREEN fidelity slices

The child-process contract now also proves:

- a generic public signature follows a relative import and emits both `.d.ets`
  façades;
- SDK-configured `@Component`/`@State` decorators and `struct` survive emit;
- the spike uses the same single ambient ArkUI prelude policy as production,
  rather than turning every SDK API declaration into a root;
- an ArkUI `Text` callable is not confused with DOM `Text` because the façade
  compilation uses the ES library rather than the default DOM-inclusive bundle;
- an `@ohos.*` module used by a public type resolves on demand;
- the declaration map maps the emitted class identifier exactly to the original
  `.ets` identifier position;
- a malformed source exits `42` with a bounded relative diagnostic location.

## Consumer and owner-batch RED → GREEN

A second public child-process runner compares a complete source closure with a
fresh verifier that consumes emitted façades. The first simple class contract
was GREEN for exact definition and reference locations and proved that the
façade Program did not load the replaced source.

The generic dependency test then exposed two real failures:

1. The source-map decoder incorrectly reset original-column deltas on each
   generated line, mapping `Model.value` to offset 6 instead of 26.
2. After that correction, façade-only references still omitted two uses inside
   the owner source method bodies. A declaration file cannot contain those
   references by construction.

The minimal correct model now runs a consumer façade batch plus one owner source
batch, remaps both through declaration maps, merges/deduplicates, and compares
the final set with the full source closure. End-exclusive spans are mapped from
their final included UTF-16 code unit to avoid consuming the next source-map
segment. The fixed generic chain returns four exact references, while the
façade-only batch has two and the owner batch has three before deduplication.

The same runner accepts an explicit zero-based line/UTF-16 character so a real
business source can be queried without modifying or copying it.

That sequential spike established semantic fidelity but did not constitute a
memory benchmark. The following slice therefore moved both modes into fresh
processes and added external RSS sampling.

## Independent-process RSS RED → GREEN

Parent revision: `146a2cbe16d3949b0d2a1dfcc21b97e69e44ca67`.

The first new public contract required the source closure and hybrid
façade/owner query to execute in different child processes. It was RED because
the existing runner rejected `--mode source|facade`. The second contract was
RED because `scripts/bench/run-declaration-facade-memory-ab.mjs` did not exist.
The final report contract was RED until the report exposed the committed 30%
peak-reduction gate separately from semantic correctness.

The implementation now:

- reports a stable owner file/span from the source process without exposing an
  absolute path;
- reconstructs the same owner in a fresh façade process;
- samples the child process tree externally at a configurable interval;
- preserves every raw RSS sample and process contribution;
- treats exact definition/reference equality as the semantic status while
  reporting the memory gate independently.

The focused final command was:

```text
node --test tests/ohos-typescript-spike.test.mjs
```

It is GREEN with 24/24 tests and no skips.

The three-run FilePicker measurement kept all five reference locations exact,
but failed the memory gate: full-source peak was 167,919,616 bytes, while the
on-demand façade process-tree peak was 526,540,800 bytes (3.136×). Median
duration changed from 604 ms to 3,270 ms. Even after the emit child exited, the
single façade coordinator/query process peaked between 183,390,208 and
185,802,752 bytes, above every corresponding source run.

Therefore the on-demand declaration-façade route stops here. It remains a
research tool only and is not wired into production references. R3 may be
reopened only if the build supplies trustworthy precomputed `.d.ets` outputs;
the current server must not pay declaration emission during an interactive
references request.
