# R2 indexed references candidates — implementation and macOS evidence

Status: **candidate narrowing slice complete; correctness gate green; peak-memory gate failed;
`indexed-batched` remains experimental and the product default remains `legacy`.**

Parent revision is `b70367964bf7b32e66524b08b4aeb1acde6bd8ff`. Measurements use the
current uncommitted build, Node v26.3.0, macOS x64, DevEco SDK API 24 / ETS 6.1.1.125, and the
existing SQLite/WAL sidecar. No second database or second semantic backend was added.

## Implemented slice

- The existing Rust parser records identifier occurrences and conservative `A as B` alias edges.
- SQLite schema v4 stores occurrences, aliases, declaration identity and whether an exported
  declaration is safe for this first narrowing slice. v2 databases migrate through v3 to v4;
  migrated rows default to unsupported until a fresh generation is committed.
- `references/candidates` accepts a declaration URI plus a UTF-16 position inside its identifier.
  It returns a deterministic alias-closure name set and candidate URI set.
- Named top-level exported class/struct/function declarations are supported. Default exports,
  members, unknown declarations, truncated results, stale/partial index state, missing identity,
  or generation mismatch fail closed to R1's all-membership batching.
- `indexed-batched` first tries the query position as an indexed declaration. For usage sites it
  resolves the canonical definition in a transient compiler worker, then queries the index.
- Open overlays are always unioned into the candidate working set. The index never emits final
  references; each candidate batch still runs official compiler definition/reference identity
  proof and the merged result remains exact.

The product default is deliberately unchanged:

```text
ARKTS_REFERENCES_STRATEGY=legacy          # default
ARKTS_REFERENCES_STRATEGY=batched         # R1 experiment
ARKTS_REFERENCES_STRATEGY=indexed-batched # R2 experiment
```

## Public correctness evidence

The real child-process LSP test indexes four relevant files plus twelve unrelated files and one
disk-stale/open-overlay file. Compared with conservative batching, indexed batching returns the
exact same URI/range set, includes the overlay-only reference, excludes the same-named unrelated
symbol, and reduces the admitted candidate set from full membership to five files.

Rust and adapter tests additionally cover re-export/import aliases, deterministic protocol shape,
SQLite reopen, stale generation, member fallback and default-export fallback.

## RemoteDesk cold replay

Pinned project:

```text
workspace: /private/tmp/arkts-business-remotedesk
commit:    8edc187868e94ed41634e8a6c4c4c072e3a48679
file:      entry/src/main/ets/model/RdpCredential.ets
symbol:    RdpCredential
position:  17:16 (UTF-16)
request:   textDocument/references, includeDeclaration=true
```

All R2 runs returned 71 normalized locations exactly equal to the final R1 golden. Normal
diagnostics remained enabled and produced eight diagnostics. No workspace/symbol or
textDocument/documentSymbol request was confused with references.

| Strategy | Indexed candidates | Batches | Request | Peak Node RSS | Max project SourceFiles |
|---|---:|---:|---:|---:|---:|
| R1 conservative, roots=64 | 829 | 13 | 51.607 s | 809.6 MiB | 643 |
| R2 indexed, roots=64 | 8 | 1 | 7.427 s | 924.2 MiB | 387 |
| R2 indexed, roots=2 | 8 | 4 | 15.428 s | 892.9 MiB | 328 |
| R2 indexed, roots=1 | 8 | 7 | 22.709 s | 911.7 MiB | 328 |

Raw accepted run:

```text
/private/tmp/arkts-remotedesk-a-indexed-r2e.json
```

The one-batch result cuts latency by about 6.9× versus R1 and reduces project SourceFiles by 39.8%,
but raises peak Node RSS by about 14.2%. Smaller candidate batches also remain above the R1 peak.
The important causal observation is that the eight true candidate roots include very large files
whose import closures overlap heavily; even one candidate can reach 328 project SourceFiles.
Candidate cardinality therefore fixes repeated irrelevant work, but it does not bound the largest
correct dependency closure or the macOS allocator footprint of successive compiler isolates.

## Gate decision and next plan item

R2's first slice passes exactness and latency/batch reduction but fails the plan's “real pressure
peak must not regress” exit condition. It must not become the default and is not released as the
5 GB fix.

The next R2 work is enforcing and measuring dependency-closure admission for ProjectGraph-backed
semantic units. If one correct semantic-unit closure still approaches the full application, the
evidence triggers R3's declaration-façade/project-partitioning investigation. Memory gates remain
unchanged.

## Semantic-unit ProjectGraph follow-up

`HarmonyProjectModel` now exposes immutable project/product/module/target units and explicit local
dependency/reverse-dependency edges. Only relative or `file:` dependencies create project edges;
versioned dependencies remain installed packages. Missing manifests, undeclared local targets, or
unowned candidate paths make the graph ineligible and retain conservative batching.

A public three-module LSP fixture proves exact Location equality while keeping Target and Barrel
from the same shared module together: with a one-root experimental limit, flat planning uses three
batches and semantic-unit planning uses two whole-unit batches. The restricted verifier admits four
project files instead of all ten membership files: the pinned entry unit, the candidate shared unit,
and their forward dependency closure. An under-declared dependency intentionally makes the
restricted verifier incomplete; the executor discards partial work and reruns conservatively,
returning the exact legacy set rather than a partial success.

The fixed RemoteDesk checkout does not contain an active root `build-profile.json5`, only
`build-profile.example.json5`. ProjectGraph therefore correctly declined to invent module boundaries.
Three independent post-change replays all used `semanticUnitMode=conservative`, returned the exact
71-location golden, and recorded these peaks:

| Run | Peak Node RSS | Request time | Project SourceFiles |
|---|---:|---:|---:|
| 1 | 625.7 MiB | 7.661 s | 387 |
| 2 | 932.3 MiB | 7.163 s | 387 |
| 3 | 930.1 MiB | 6.404 s | 387 |

The first run is an isolated low observation; the two repeat runs remain in the earlier R2 range.
Because semantic-unit planning was not active, these measurements neither pass the memory gate nor
measure the new grouping. Raw reports are:

```text
/private/tmp/arkts-remotedesk-a-indexed-r2-units.json
/private/tmp/arkts-remotedesk-a-indexed-r2-units-2.json
/private/tmp/arkts-remotedesk-a-indexed-r2-units-3.json
```

## Gramony dependency-closure replay

Pinned project and query:

```text
workspace: /private/tmp/arkts-business-gramony
commit:    0a1ee4b026b6736671f0030ba9859aceaa962298
file:      common/base/src/main/ets/utils/DateHelper/DateHelper.ets
symbol:    DateHelper
position:  0:16 (UTF-16)
request:   textDocument/references, includeDeclaration=true
```

This checkout has an active three-module project graph. All three independent new-process runs
returned the exact eight-location R1 golden. Each trace recorded `semanticUnitMode=project-graph`,
three graph units, two units in the selected batch, 73 admitted membership files out of 77, and 32
project SourceFiles.

| Run | Peak Node RSS | Request time | Exact locations |
|---|---:|---:|---:|
| 1 | 478.8 MiB | 3.364 s | 8 |
| 2 | 489.1 MiB | 3.098 s | 8 |
| 3 | 487.7 MiB | 3.073 s | 8 |

The fixed R1 run peaked at 553.3 MiB and took about 6.1 seconds. The R2 median peak is about 11.9%
lower and request latency is about half, but the peak improvement is below the 30% prototype gate.
The trace also contains 722 SDK SourceFiles, so this small application's project-file reduction does
not translate proportionally into whole-process RSS reduction.

Raw reports:

```text
/private/tmp/arkts-gramony-a-indexed-r2-units.json
/private/tmp/arkts-gramony-a-indexed-r2-units-2.json
/private/tmp/arkts-gramony-a-indexed-r2-units-3.json
```

## Settings boundary result

OpenHarmony Settings was fixed at commit `ecc550dfaed880e04e38a2477eb7235cd50475b9`.
`LogUtil` cannot be used as an optimization oracle: a fresh declaration-position query returned
zero locations, and the usage-position query returned 14 local locations while missing known
cross-module references. The externally sampled declaration run peaked at 750,764,032 bytes, but
the result failed correctness and is therefore not a successful semantic benchmark.

The root profile also omits the locally referenced `feature/suggestion` module while the phone
manifest declares it as a `file:` dependency. The graph is consequently incomplete and the planner
must retain conservative admission. No project files were copied and no project boundary was
modified to force this result.

## Photos toolchain boundary result

OpenHarmony Photos was checked out from the official `OpenHarmony-v6.1-LTS` tag at commit
`98ea1d9cd6a363c576e2c6ff17844e51723baec5`. The checkout contains 1,794 ArkTS/TS files and 18
declared modules, and its build profile targets SDK 23. No source, dependency declaration, or module
boundary was changed.

This checkout cannot become a correctness benchmark with the currently locked
`ohos-typescript@4.9.5-r4`. A declaration-position query for `GridInitConfigSyncer` returned only its
declaration even though ordinary source inspection shows uses in both `timeline` and `phone`.
`MediaDataManager`, whose import and construction are in the same `formAbility` module, likewise
returned only its declaration. Both consumers use ArkTS `import lazy`; the current semantic backend
did not establish those identities. The fresh-process peaks were 722,673,664 and 727,719,936 bytes,
respectively, but both semantic results are incomplete and are recorded as environment/toolchain
blocked rather than successful memory evidence.

The corresponding raw reports are:

```text
/private/tmp/arkts-photos-r2-gridinit-legacy.json
/private/tmp/arkts-photos-r2-mediadata-legacy.json
```

## FilePicker exact A/B replay

OpenHarmony FilePicker was checked out from `OpenHarmony-v6.1-LTS` at commit
`d691e8ec5da1e75e25dbefc922df0ea3fe361ee5`. It contains 595 ArkTS/TS files and two declared
modules. `StartModeOptions` uses ordinary relative imports and provides a legacy-complete control:
source inspection finds 62 case-sensitive text matches, 13 of which are import-path string
contents, leaving exactly the 49 identifier locations returned by the compiler across 14 files.

All three `indexed-batched` runs were compared byte-for-byte against the first normalized legacy
Location set and returned 49/49 exact locations. ProjectGraph was active in every indexed run: one
of two semantic units was selected, 58 of 80 membership files were admitted, and the compiler
Program contained 56 project plus 576 SDK SourceFiles.

| Strategy | Run peaks | Median peak | Median request | Result |
|---|---|---:|---:|---|
| legacy | 424.1 / 413.0 / 428.0 MiB | 424.1 MiB | 2.820 s | 49 locations |
| indexed semantic-unit | 671.3 / 656.7 / 664.6 MiB | 664.6 MiB | 4.562 s | exact 49/49 |

Despite reducing the project working set, the indexed path regressed median peak by about 56.7%
and median request time by about 61.8%. In this small semantic closure, the transient verifier and
SDK fixed cost dominate the 24-file project reduction. This is a real negative result and prevents
using an unconditional semantic-unit verifier for small memberships.

Raw reports:

```text
/private/tmp/arkts-filepicker-r2-startmode-legacy.json
/private/tmp/arkts-filepicker-r2-startmode-legacy-2.json
/private/tmp/arkts-filepicker-r2-startmode-legacy-3.json
/private/tmp/arkts-filepicker-r2-startmode-indexed.json
/private/tmp/arkts-filepicker-r2-startmode-indexed-2.json
/private/tmp/arkts-filepicker-r2-startmode-indexed-3.json
```

## Current gate decision

### Photos ordinary-import follow-up

The fixed Photos 6.1 checkout also contains a legacy-complete ordinary import that is independent
of the earlier `import lazy` limitation. At commit
`98ea1d9cd6a363c576e2c6ff17844e51723baec5`, the usage of `PersistInfoUtils` in
`imageEditor/common/src/main/ets/service/BaseEditor.ets` produced five normalized Locations in
legacy and indexed modes. Supporting DevEco's valid omitted-target configuration changed the graph
to complete with 18 semantic units. The indexed run used one batch, admitted 716 of 1,246 project
membership files, and built a Program with 78 project plus 632 SDK SourceFiles.

This is a correctness pass and a product-memory failure. Legacy peaked at 728,735,744 bytes in
5.303 seconds; indexed peaked at 842,514,432 bytes in 11.769 seconds. The trace shows two equivalent
710-SourceFile compiler initializations on the indexed usage-site path: a transient definition
anchor followed by the verifier. The next experiment must eliminate this duplicate compiler work
without allowing the index to become semantic truth. Until that experiment passes the existing
memory and exactness gates, the default remains `legacy`.

Dependency-closure admission is implemented and its public fail-conservative contract is green.
It produces a real reduction on Gramony, but it has not passed the 30% real-project peak target and
cannot activate on RemoteDesk or Settings without inventing project boundaries. Photos 6.1 has
suitable real scale and project structure, but the locked backend does not provide a complete
`import lazy` references oracle. R2 therefore remains experimental and the default remains
`legacy`. FilePicker supplies an exact ordinary-import oracle but shows a stable 56.7% median peak
regression when only 24 project files are removed. The next evidence step needs a larger, correctly
configured real multi-module checkout with a legacy-complete symbol; otherwise the plan must move
to the R3 façade/partitioning spike without claiming a product memory fix. A future production
strategy also needs evidence-based admission that avoids paying the verifier/SDK fixed cost when
the reducible project working set is small; this report does not invent such a threshold.
