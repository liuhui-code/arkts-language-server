# R2 indexed references candidates — implementation and macOS evidence

Status: **R2 candidate narrowing is progressing by proven declaration kind. Class/struct/function,
named exported const arrow functions, named exported enums, named exported interfaces, and named
exported type aliases are green; unproven kinds still fail
closed. `indexed-batched` remains experimental and the product default remains `legacy`.**

The investigation began at parent revision `b70367964bf7b32e66524b08b4aeb1acde6bd8ff`; each later
slice records its own parent below. Measurements use Node v26.3.0, macOS x64, DevEco SDK API 24 /
ETS 6.1.1.125, and the existing SQLite/WAL sidecar. No second database or second semantic backend
was added.

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
anchor followed by the verifier.

The follow-up reused the compiler anchor as the first verifier only when the document/project
snapshot matched and the batch admission contained every project file already loaded by the anchor.
The public LSP differential stayed exact, including the under-declared-dependency fallback. Three
fresh Photos processes returned the same five Locations and confirmed one 710-SourceFile resident
context for both phases. Their peaks were 818,987,008, 883,437,568, and 885,207,040 bytes; the median
was 883,437,568 bytes, about 4.9% above the earlier 842,514,432-byte indexed run. Median request time
was 7.439 seconds versus the earlier single-run 11.769 seconds, so reuse removed setup time but did
not reduce the product peak. The code experiment was therefore discarded rather than merged.

This result changes the next decision: duplicate Program construction was a latency cost, not the
dominant peak-memory cause in this workload. The 710-file Program itself—78 project files plus 632
SDK declarations—and the semantic work performed on it remain the memory floor. Further R2 work
must reduce the admitted compiler closure or the SDK declaration working set while preserving exact
compiler proof; keeping the same Program alive longer is not an acceptable memory optimization.
Until such an experiment passes the existing memory and exactness gates, the default remains
`legacy`.

A default-off trace follow-up measured the isolated worker immediately after `prepare()` and again
after the semantic query. On the same Photos case, the anchor had 270,729,512 bytes heap after
preparing the 710-file Program and added 5,955,792 bytes for definition. The references verifier had
268,754,608 bytes heap after prepare and added 9,139,288 bytes for `findReferences`. Its prepared
inputs were 797,335 UTF-16 code units from 78 project files and 18,915,581 from 632 SDK declarations;
SDK declarations therefore represented about 96.0% of measured Program source text. The external
process peak was 856,199,168 bytes and all five Locations remained exact.

These observations do not assign object-level heap bytes to individual files, but they do falsify
the hypothesis that result search/mapping is the first-order cost in this workload: more than 96%
of the verifier heap was already present after Program preparation, and the SDK surface dominates
the admitted source text. The next bounded experiment is consequently an SDK ambient-root profile
spike, with unchanged full SDK roots as the default. It may proceed only if references and
diagnostics remain exact; otherwise it is rejected like anchor reuse.

That SDK ambient-root spike has now been run and rejected for production. A reference-verifier-only
`common.d.ts` profile left the interactive/diagnostic engine on the full SDK and passed the public
LSP differential. In Photos it returned the same five references in three fresh processes and the
normal diagnostic publication remained at 119 items. The verifier fell from 632 SDK files and
18,915,581 SDK text code units to 502 files and 13,876,398 code units; prepared heap fell from about
269 MiB to about 201 MiB.

Product peaks were 559,480,832, 789,028,864, and 777,347,072 bytes, with a 777,347,072-byte median.
That is only about 7.7% below the prior 842,514,432-byte indexed run and remains about 6.7% above the
728,735,744-byte legacy run. Median request time was 8.039 seconds. The 30% peak gate therefore
failed and the profile code was removed. This A/B shows that shrinking the transient verifier works
inside its own isolate, but the full Program already created by normal diagnostics leaves a product
RSS floor that dominates the final peak.

The lifecycle slice now prevents the normal diagnostic context and explicit reference verification
from contributing retained heavy heaps to the same peak. At the public LSP boundary, an explicit
references request suspends diagnostics, cancels and awaits any in-flight diagnostic task, and then
requeues diagnostics for the current document version after references terminates. Public child-process
tests cover both a cancellation-responsive in-flight diagnostic and a document edit during references;
the latter publishes only the latest diagnostic version.

On the same fixed Photos case, three independent processes returned the exact five-item legacy
Location set and then published 119 diagnostics for document version 1. Peaks were 562,184,192,
571,596,800, and 578,387,968 bytes. The 571,596,800-byte median is 32.16% below the prior
842,514,432-byte indexed run and passes the 30% prototype gate. Request times were 10.720, 11.537,
and 11.253 seconds; diagnostics arrived 2.536, 2.601, and 2.616 seconds after the references response.
This validates lifecycle overlap as the product-peak amplifier without weakening the SDK profile or
diagnostic semantics.

The scheduling change is accepted, but `indexed-batched` remains opt-in. Its median request time is
about 2.12 times the prior single legacy run, slightly above the 2x production target. The next R2
slice is latency/cross-symbol validation, not more memory work: reduce anchor/index planning time and
prove exactness on additional symbol categories before considering a default-strategy cutover.

Dependency-closure admission is implemented and its public fail-conservative contract is green.
The Photos ordinary-import workload now passes the prototype memory gate once automatic diagnostics
and the transient verifier are serialized. This does not repair the locked backend's incomplete
`import lazy` oracle, make RemoteDesk/Settings configuration complete, or make the Rust index semantic
truth. R2 therefore remains experimental and the default remains `legacy` until latency and broader
symbol-category exactness gates pass.

Raw accepted lifecycle reports:

```text
/private/tmp/arkts-photos-persist-utils-indexed-diagnostic-gate-a-rss.json
/private/tmp/arkts-photos-persist-utils-indexed-diagnostic-gate-b-rss.json
/private/tmp/arkts-photos-persist-utils-indexed-diagnostic-gate-c-rss.json
```

### SQLite reference-candidate name-index correction

The accepted lifecycle runs also made the remaining request gap measurable. The fixed Photos SQLite
database contained 1,096,191 `reference_occurrences` rows. `REFERENCE_URIS_SQL` joined the bounded
name set but ordered by `document_uri`; SQLite consequently scanned the occurrence primary key in URI
order instead of using `reference_occurrences_name`. The exact production query took 5.06 seconds.
Adding `INDEXED BY reference_occurrences_name` changed neither schema nor results and reduced that
same direct query to 0.11 seconds.

A store-level RED case inserts 500,000 irrelevant URI-ordered occurrences and requires the exact two
`FastNeedle` candidate URIs. The old query took 136 ms on the development Mac; the single-line index
selection made it GREEN. A deterministic unit gate additionally requires SQLite's execution plan to use
`reference_occurrences_name`; wall-clock timing is retained as benchmark evidence rather than a
cross-machine correctness assertion. All SQLite store tests and the release sidecar build pass.

Three fresh Photos end-to-end processes then returned the exact five `PersistInfoUtils` Locations and
published 119 diagnostics. Request times were 7.800, 6.775, and 6.575 seconds; the 6.775-second median
is 39.79% below the pre-fix 11.253-second median and 1.28 times the 5.303-second legacy run. Peaks were
571,305,984, 581,206,016, and 575,754,240 bytes; the 575,754,240-byte median remains 31.66% below the
original 842,514,432-byte indexed baseline. Both current prototype gates now pass for this class case.

Raw reports:

```text
/private/tmp/arkts-photos-persist-utils-indexed-name-index-a-rss.json
/private/tmp/arkts-photos-persist-utils-indexed-name-index-b-rss.json
/private/tmp/arkts-photos-persist-utils-indexed-name-index-c-rss.json
```

The first cross-kind check is intentionally not counted as a pass for default activation.
`getMutuallyExclusiveDesc` is an `export const` function, which the current lexical index does not
register as a searchable declaration. It safely fell back to 20 conservative batches and returned the
exact three legacy Locations, but took 63.279 seconds. The replay harness's 20-second diagnostic wait
expired before references completed, so this run does not prove post-request diagnostic publication.
The next slice must add conservative index coverage for declared export kinds and rerun with a diagnostic
window longer than the request; it must not reinterpret the timeout as a missing diagnostic or a pass.

### Exported const arrow-function candidate coverage

The next TDD slice narrowed that requirement to the real syntax proven by Photos: a named, top-level
`export const` whose initializer is directly an arrow function. The index assigns the declaration a stable
identity and records it as a function export. It deliberately keeps ordinary exported values unsupported;
a separate RED case proves that a semicolonless scalar export cannot capture a later local arrow function.
The sidecar protocol contract also persists and returns the exact declaration identity, name, and two URIs.

With a 180-second diagnostic observation window, three fresh Photos processes queried
`getMutuallyExclusiveDesc` at `BottomToolbar.ets:352:19`. All three used two index candidate files and one
714-source-file verifier Program, returned the exact three legacy Locations, and later published 107
version-1 diagnostics. Request times were 7.609, 7.345, and 7.357 seconds; the 7.357-second median is
88.37% below the previous 63.279-second conservative fallback. Peak RSS values were 579,092,480,
568,172,544, and 579,428,352 bytes; median peak was 579,092,480 bytes.

Raw reports:

```text
/private/tmp/arkts-photos-get-mutually-usage-indexed-export-const-a-rss.json
/private/tmp/arkts-photos-get-mutually-usage-indexed-export-const-b-rss.json
/private/tmp/arkts-photos-get-mutually-usage-indexed-export-const-c-rss.json
```

This closes only the exported arrow-function gap. It does not claim that exported enums, interfaces,
type aliases, or non-function values are reference-searchable, and it is not sufficient by itself to switch
`indexed-batched` on by default.

### Exported enum candidate coverage

Parent revision: `856e25f0856bd8c127e79257d7d6464ac94bf5e2`.

The next public `WorkspaceIndex.search_reference_candidates` RED case used
`export enum ConflictFunc { AI, EDIT, CROP }`. Before implementation it returned
`supported=false`. The minimal parser change adds an explicit persisted `Enum` symbol kind and
only makes named top-level exported enums reference-searchable; the existing default-export rule
continues to fail closed. The sidecar protocol test verifies the `enum` kind, stable declaration
identity, exact names, and exact candidate URIs after SQLite persistence.

The fixed real replay used OpenHarmony Photos at commit
`98ea1d9cd6a363c576e2c6ff17844e51723baec5`, source
`imageEditor/product/editor_phone/src/main/ets/component/menu/BottomToolbar.ets`, usage position
`320:18` (zero-based UTF-16), and declaration `Consts.ets:67:12`. Legacy returned six normalized
Locations and published 107 version-1 diagnostics in 7.609 seconds, peaking at 834,555,904 bytes.
Before enum support, `indexed-batched` safely returned the same six Locations but used 20
conservative batches and took 63.101 seconds.

After the change, three independent new processes each returned the exact six-item legacy set,
published the same 107 diagnostics, used one indexed batch with two candidate files, and prepared
714 Program SourceFiles. Request times were 8.456, 7.401, and 7.655 seconds; peaks were
569,102,336, 566,415,360, and 566,480,896 bytes. Median request time was 7.655 seconds, 87.87%
below the conservative fallback and 1.006x the legacy run. Median peak was 566,480,896 bytes,
32.12% below legacy. No index fallback or workspace/document-symbol request occurred.

Raw reports:

```text
/private/tmp/arkts-photos-conflict-func-legacy-a-main-856e25f-rss.json
/private/tmp/arkts-photos-conflict-func-indexed-before-enum-rss.json
/private/tmp/arkts-photos-conflict-func-indexed-enum-a-rss.json
/private/tmp/arkts-photos-conflict-func-indexed-enum-b-rss.json
/private/tmp/arkts-photos-conflict-func-indexed-enum-c-rss.json
```

This validates another real declaration kind without weakening fallback behavior. It does not by
itself justify changing the default: remaining export kinds and alias/member shapes still require
their own real RED/exact-differential slices, and the original >3 GB release reproducer remains
unavailable.

### Exported interface candidate coverage

Parent revision: `a64a1f6f07b283e63e49b6a616f67c71eee54f2c`.

The public store RED used the real declaration shape
`export interface ConflictContent`. Before implementation it returned `supported=false`. The
minimal change adds an explicit persisted `Interface` symbol kind and routes named interface
declarations through the existing top-level export and stable declaration-identity checks. It does
not enable type aliases, values, default exports, or member references. The SQLite-backed sidecar
contract verifies the `interface` workspace-symbol kind, identity
`file:///workspace/Interface.ets#0:17:ConflictContent`, and exact two-file candidate set.

The fixed Photos replay used the same commit, SDK, and `BottomToolbar.ets` as the enum case. The
import position was `92:12` and the declaration was `Consts.ets:74:17` (zero-based UTF-16). Legacy
returned three Locations and 107 diagnostics in 7.130 seconds, peaking at 781,402,112 bytes. Before
interface support, indexed batching returned the exact same result but required 20 conservative
batches and 65.470 seconds.

Three post-change fresh processes each returned the exact legacy set and 107 version-1 diagnostics.
Every run used one indexed batch, two candidate files, and 714 Program SourceFiles, with no
fallback. Request times were 7.900, 7.927, and 7.796 seconds; peaks were 570,470,400,
578,605,056, and 567,791,616 bytes. Median request time was 7.900 seconds, 87.93% below the
fallback. Median peak was 570,470,400 bytes, 26.99% below this symbol's legacy run. Correctness and
latency pass; the per-case 30% prototype memory threshold does not. The default therefore remains
`legacy`.

Raw reports:

```text
/private/tmp/arkts-photos-conflict-content-legacy-a-main-a64a1f6-rss.json
/private/tmp/arkts-photos-conflict-content-indexed-before-interface-rss.json
/private/tmp/arkts-photos-conflict-content-indexed-interface-a-rss.json
/private/tmp/arkts-photos-conflict-content-indexed-interface-b-rss.json
/private/tmp/arkts-photos-conflict-content-indexed-interface-c-rss.json
```

### Exported type-alias candidate coverage

Parent revision: `bcb51b5edd905232aaa1439b5cd09a463e5fea88`.

The public `WorkspaceIndex.search_reference_candidates` RED used the real declaration shape
`export type PhotoAsset = photoAccessHelper.PhotoAsset`. It failed to compile because the index had
no type-alias kind. The minimal implementation adds an explicit `TypeAlias` symbol kind, persists it
as the new non-conflicting SQLite value 7, serializes it as the existing protocol kind `type`, and
recognizes only a named top-level exported type declaration. `import type`, `export type { ... }`,
non-exported aliases, default exports, values, and members do not become declarations through this
path. The SQLite-backed sidecar contract verifies identity
`file:///workspace/TypeAlias.ets#0:12:PhotoAsset`, the exact two-file candidate set, and the `type`
workspace-symbol kind.

The real validation used OpenHarmony Photos commit
`98ea1d9cd6a363c576e2c6ff17844e51723baec5`, DevEco OpenHarmony API 24 / ETS 6.1.1.125, and
`common/src/main/ets/default/model/browser/dataObserver/MediaObserverCallback.ets`. The query was
inside `AlbumChangeData` at zero-based UTF-16 `75:30`; its exported alias declaration is
`common/src/main/ets/default/access/UserFileManagerAccess.ets:118:12`. Legacy returned exactly the
three source occurrences and published 20 version-1 diagnostics in 7.538 seconds, peaking at
822,280,192 bytes.

Three post-change fresh processes returned the exact legacy Location set and the same 20 diagnostics.
Every run used one indexed batch, three name candidates, two batch roots, and 278 Program SourceFiles,
with no fallback. Request times were 5.636, 5.513, and 5.609 seconds; peaks were 529,199,104,
523,751,424, and 536,268,800 bytes. The medians are 5.609 seconds and 529,199,104 bytes: 25.59%
less request time and 35.64% less peak RSS than this symbol's legacy run. Correctness, latency, and
the per-case 30% prototype memory threshold pass. The production default remains `legacy` pending
broader declaration/alias coverage and the unavailable original >3 GB release reproducer.

A collision check used the real `PhotoAsset` alias imported by `RecoverMenuOperation.ets`. It
remained exact but name-only lookup conservatively returned 1,154 files and required 11 batches,
rather than one. This is not counted as a performance pass: it records the remaining need for
module/declaration identity narrowing and prevents treating type-alias support as a solution for
common-name symbols.

Raw reports:

```text
/private/tmp/arkts-photos-photoasset-type-legacy-main-bcb51b5.json
/private/tmp/arkts-photos-photoasset-type-indexed-before-typealias.json
/private/tmp/arkts-photos-photoasset-type-indexed-a.json
/private/tmp/arkts-photos-album-change-data-legacy.json
/private/tmp/arkts-photos-album-change-data-indexed-a.json
/private/tmp/arkts-photos-album-change-data-indexed-b.json
/private/tmp/arkts-photos-album-change-data-indexed-c.json
```
