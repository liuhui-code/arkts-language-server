# R3 declaration façade fidelity spike

Status: **emit/source-map and bounded consumer+owner verification tracers GREEN;
scale/memory gates remain incomplete; production references remains `legacy`.**

Parent revision: `b70367964bf7b32e66524b08b4aeb1acde6bd8ff`.
The Mac run used Node v26.3.0, locked `ohos-typescript` 4.9.5, and DevEco SDK
API 24 / ETS 6.1.1.125. No production semantic path, worker count, memory
budget, diagnostics policy, or reference result was changed.

## Implemented observation runner

`scripts/semantic/ets-declaration-facade-spike.mjs` accepts one `.ets` source
and an optional user-selected SDK root. It invokes the locked compiler's public
declaration emit API, captures `.d.ets` and `.d.ets.map` output in memory, and
returns machine-decidable JSON. It exits `42` for emit/diagnostic failure and
`2` for invalid invocation.

SDK behavior deliberately matches the production frontend boundary:

- compiler ETS options come from `<sdk>/ets/build-tools/ets-loader/tsconfig.json`;
- one ambient ArkUI prelude is selected in production order;
- `@ohos.*`, `@system.*`, `@kit.*`, and `@arkts.*` modules resolve on demand;
- the ES standard library is used without DOM globals, avoiding a false
  collision between ArkUI's callable `Text` and DOM's constructable `Text`.

The runner reports no absolute source path or source body in diagnostics.

## Machine contracts

The public child-process tests prove all of the following against the locked
frontend:

1. An exported ArkTS class emits `.d.ets` with its public method signature.
2. A relative cross-file generic dependency emits both façades and preserves
   `Box<T>`/`unwrap<T>`.
3. SDK-configured `@Component` and `@State` decorators survive on an exported
   `struct`; an ArkUI callable can be used inside `build()` without the DOM
   name collision.
4. `.d.ets.map` is emitted, names the original `.ets`, and maps the generated
   class identifier to the exact original UTF-16-neutral ASCII position.
5. An `@ohos.*` module type appearing in a public signature resolves through
   the SDK module boundary.
6. A malformed source produces FAIL/exit 42 with code, basename, line, and
   character, bounded to twenty error diagnostics.

Focused command:

```text
node --test tests/ohos-typescript-spike.test.mjs
```

## Real SDK and business-project evidence

With `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`:

| Source | Result | Emitted façades | Program SourceFiles | Preserved evidence |
|---|---:|---:|---:|---|
| `fixtures/semantic/arkui-sdk-depth/BuilderTail.ets` | PASS | 1 | 399 | `@Entry`, `@Component`, `@State`, `struct`, map |
| FilePicker `AudioPickerViewData.ets` | PASS | 5 | 403 | `@Observed`, generic base, relative deps, `@ohos.multimedia.image`, 5 maps |

FilePicker was the existing real checkout at
`/private/tmp/applications_filepicker-6.1-lts`, fixed at commit
`d691e8ec5da1e75e25dbefc922df0ea3fe361ee5`. No project source or boundary was
modified.

An early invalid SDK experiment enumerated all 868 declarations as roots and
failed on API 24 `export @interface` files. That was not a compiler-fidelity
failure for the tested source; it was an incorrect runner boundary. The
production frontend never enumerates the whole SDK this way. After using the
same ambient-prelude plus on-demand module policy, both real cases passed with
zero error diagnostics. This failed attempt is retained here because it guards
against reintroducing whole-SDK root expansion.

## Façade consumption and exact references

`ets-declaration-facade-consumer-spike.mjs` constructs a full-source verifier
and a fresh façade verifier, supports either `/*@query*/` or an explicit
zero-based line/UTF-16 character, and never emits absolute paths. The first
generic dependency run found that a façade-only verifier cannot be complete:
the declaration preserves `Model.value`, but omits two real uses from method
bodies. Returning that partial set would violate the references contract.

The corrected tracer therefore uses the production-direction execution model:

```text
consumer + dependency façades
        +
symbol owner source + other dependency façades
        -> map both result sets to source
        -> merge/dedupe/sort
        -> compare with full source closure
```

The fixed generic fixture returns four exact locations. Its façade-only batch
contains two locations, the owner batch contains three, and the merged set is
exact after deduplication. No replaced dependency source is loaded into the
consumer façade Program.

The same differential passed on unmodified FilePicker source:

```text
declaration: audiopicker/.../pages/model/AudioPickerViewData.ets
consumer:    audiopicker/.../pages/viewmodel/AudioPickerViewModel.ets
position:    31:32 (zero-based UTF-16)
symbol:      AudioPickerViewData
```

Both paths returned five identical locations, with the definition mapped to
`AudioPickerViewData.ets` offset 881. The measured compiler structures were:

| Metric | Full source closure | Max of consumer façade / owner source batch | Change |
|---|---:|---:|---:|
| Program SourceFiles | 56 | 56 | 0 |
| Program text bytes | 444,604 | 438,990 | -5,614 (-1.26%) |
| Program AST nodes | 20,950 | 20,364 | -586 (-2.80%) |

The owner batch alone had 50 SourceFiles, 426,569 text bytes and 19,111 AST
nodes. These are compiler-structure observations from a sequential process, not
external memory measurements.

## Gate decision

This spike establishes that the locked frontend can produce useful ArkTS-aware
façades and that consumer plus owner-source batching can preserve the covered
definition/reference sets exactly. It does **not** establish a material memory
win: the real FilePicker closure reduction is small and there is no isolated
RSS A/B yet.

Therefore no façade is admitted to production. The next vertical slice is:

```text
full source semantic-unit closure (independent process)
        vs
consumer façades + owner source batch (independent batches/processes)
        -> exact merged definition/reference locations
        -> Program nodes/bytes + latency + external RSS A/B
```

Any definition/reference mismatch stops the R3 route. Approximate declarations,
text search, and index-only reference answers remain forbidden.

## Verification

- Focused `node --test tests/ohos-typescript-spike.test.mjs`: 22/22 passed.
- Full `pnpm check:fast`: 897/897 passed; 0 failed, skipped, cancelled, or todo.
- `git diff --check`: passed.
- The cumulative R1/R2 Rust workspace tests remain 40 executed passes with one
  existing release-only ignored test; R3 changed no Rust source.
