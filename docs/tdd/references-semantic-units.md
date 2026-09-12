# References semantic-unit ProjectGraph TDD record

Parent revision: `b70367964bf7b32e66524b08b4aeb1acde6bd8ff`

## RED

The first model-level tracer bullet required a declared `entry` module with a local
`file:../shared` dependency to expose both `entry -> shared` and `shared <- entry` as immutable
semantic-unit edges. Before implementation the public `HarmonyProjectModel` had no
`semanticGraph()` contract:

```bash
node --test --test-name-pattern="exposes declared module dependency" \
  tests/harmony-project-model.test.mjs
```

The public child-process LSP tracer bullet then configured two declared modules, requested
`textDocument/references` through `dist/server.cjs`, and set the candidate-root limit to one.
Before planner integration the three indexed candidate files produced three flat batches:

```text
AssertionError: 3 !== 2
semanticUnitMode=conservative
```

Command:

```bash
pnpm build
node --test --test-name-pattern="keeps declared project semantic units intact" \
  tests/semantic/references-batching.test.mjs
```

The next RED required the verifier workspace to contain only the selected units and their declared
forward dependency closure. Whole-unit grouping alone still admitted every membership file, so the
public trace had no `admittedProjectFiles` reduction. After admission was added, an intentionally
under-declared `entry -> shared` fixture failed the whole LSP request with `-32803`: partial work
from the restricted verifier was not yet discarded and retried conservatively.

Finally, a model contract with non-empty `dynamicDependencies` initially reported a complete graph.
Because those edges are not yet resolved, treating the graph as complete would allow an unsafe
exclusion.

## GREEN

`HarmonyProjectModel.semanticGraph()` now returns bounded, immutable project/product/module/target
identities plus explicit local dependency and reverse-dependency edges. Only `file:` or relative
package dependencies form project edges; versioned packages remain installed-package dependencies.
Missing manifests, unresolved local paths, and non-empty dynamic dependencies mark the graph
incomplete. A local package nested inside its owning module remains part of that unit rather than
inventing a second module boundary.

When indexed candidates and a complete graph are both available, the references planner keeps all
candidate roots from one semantic unit together, packs whole units into sequential batches, and
admits only the batch units, pinned/open units, and their declared forward dependency closure. If
the graph is unavailable, incomplete, or cannot own every candidate path, it uses the existing R1
conservative planner. If a supposedly complete restricted closure still causes a source-unavailable
verification, the executor discards all partial results and retries the same indexed candidates with
the conservative planner. Cancellation is never converted into a fallback.

Focused GREEN after the closure-admission slice:

```text
Project model/budget + references batching suites: 34 passed, 0 failed
Public semantic-unit LSP case: exact Location equality; 3 flat file batches -> 2 whole-unit batches
Restricted verifier: 4 admitted project files out of 10 membership files
Under-declared dependency: restricted result discarded, conservative retry exact
```

## Real-project boundary

RemoteDesk has no active root `build-profile.json5` (only `build-profile.example.json5`), so all
three new-process replays correctly recorded `semanticUnitMode=conservative`. They returned the
same 71 locations and peaked at 656,072,704, 977,543,168, and 975,228,928 bytes. The two stable
high runs remain in the prior R2 range; no memory improvement is attributed to semantic-unit code.

Gramony is the first fixed real checkout in which this slice is active. At commit
`0a1ee4b026b6736671f0030ba9859aceaa962298`, references for `DateHelper` returned the exact eight
R1 locations in three independent new processes. The trace recorded three semantic units, two
units in the selected batch, 73 admitted membership files out of 77, and 32 project SourceFiles.
Peaks were 502,091,776, 512,905,216, and 511,356,928 bytes; request times were 3.364, 3.098, and
3.073 seconds. Against the fixed R1 peak of 580,169,728 bytes, the median reduction is only about
11.9%, below the 30% prototype gate.

OpenHarmony Settings commit `ecc550dfaed880e04e38a2477eb7235cd50475b9` is not accepted as a
correctness oracle for `LogUtil`: a fresh declaration query returned zero locations, while the
usage query returned only 14 local locations and missed known cross-module references. Its root
configuration also contains a local phone dependency on `feature/suggestion` that is not a declared
root module, so ProjectGraph correctly marks the graph incomplete instead of excluding it.

OpenHarmony Photos `OpenHarmony-v6.1-LTS` at commit
`98ea1d9cd6a363c576e2c6ff17844e51723baec5` has 1,794 ArkTS/TS files and 18 declared modules, but
the locked backend returned declaration-only results for both a cross-module and a same-module
`import lazy` class. Those runs are retained as toolchain-blocked evidence, not used as differential
goldens.

OpenHarmony FilePicker `OpenHarmony-v6.1-LTS` at commit
`d691e8ec5da1e75e25dbefc922df0ea3fe361ee5` provides an ordinary-import exact control. Three
independent indexed runs each matched all 49 normalized legacy locations. The active project graph
reduced 80 membership files to 58 admitted files and 56 project SourceFiles, but median peak RSS
regressed from 424.1 to 664.6 MiB. This negative result keeps the strategy experimental and shows
that working-set reduction must exceed the transient verifier plus SDK fixed cost.

## Root target omission compatibility (2026-09-11)

Parent revision: `0b2a321bd575a85a19c866b550563942eef69ab8`.

The Photos checkout exposed a valid DevEco configuration shape that the model rejected: root
`modules[]` entries may omit `targets`, and module `build-profile.json5` may also omit `targets` to
use the implicit `default` target. The installed DevEco project schema requires only `name` and
`srcPath` for root module entries; the module schema documents the implicit default target.

Two model-level tests were added before the implementation. The first failed because omitted root
targets returned `module-target-unavailable`; the second failed because an omitted module-profile
target list returned `module-profile-unavailable`:

```bash
node --test --test-name-pattern="an omitted root targets list uses the sole module-profile target" \
  tests/harmony-project-model.test.mjs
node --test --test-name-pattern="an omitted module-profile targets list provides the default target" \
  tests/harmony-project-model.test.mjs
```

The model now selects the sole non-test module-profile target when the root mapping is omitted and
synthesizes only the documented `default` target when the module profile omits the list. Multiple,
invalid, or test-only targets remain fail-closed. The full project-model suite passes 25/25.

This compatibility fix changes Photos from an unavailable graph to a complete 18-unit graph while
FilePicker remains complete and Settings remains unavailable for its independent configuration
problems. A real Photos ordinary-import query for `PersistInfoUtils` then returned the same five
normalized locations as legacy in one indexed semantic-unit batch. It reduced 1,246 membership
files to 716 admitted project files and the compiler Program to 78 project plus 632 SDK SourceFiles.
The result is semantically GREEN but not a memory improvement: indexed peak RSS was 842,514,432
bytes in 11.769 seconds versus legacy 728,735,744 bytes in 5.303 seconds. Trace evidence shows the
usage-site path paid for two equivalent 710-SourceFile Programs: one transient compiler anchor and
one verifier. The next slice must remove that duplicate anchor cost without weakening compiler
proof; the production default remains `legacy`.

## Rejected anchor-context reuse (2026-09-11)

The closest public purported behavior was changed first: the indexed LSP case required the compiler
anchor and first references batch to report `resident-anchor-context` while retaining exact Location
equality. It failed against the transient-worker implementation, then passed after the smallest
reuse implementation. The full suite exposed a safety defect: an under-declared dependency had
already been loaded while resolving the anchor and could bypass the restricted batch. Recording the
anchor Program's membership paths and requiring them to be a subset of batch admission restored the
existing conservative fallback; all four public batching cases passed.

The real Photos gate then rejected the implementation. Three new processes returned the exact five
`PersistInfoUtils` Locations and reused one 710-SourceFile Program, but peaks were 818,987,008,
883,437,568, and 885,207,040 bytes. The 883,437,568-byte median regressed about 4.9% from the prior
842,514,432-byte indexed run, despite reducing median request time to 7.439 seconds. Per the plan,
the behavior/test changes were removed. This leaves main's transient isolation intact and records
that duplicate construction is not sufficient evidence for a peak-memory fix.

## Compiler phase observability (2026-09-11)

The public indexed LSP test first required each isolated anchor/batch trace to expose Program counts,
source-text composition, prepared memory, and semantic-query heap delta. It failed with the old
single end-of-worker sample, then passed after the verifier captured a snapshot immediately after
`engine.prepare()` and retained the existing post-query sample. The fields remain behind
`ARKTS_REFERENCES_TRACE=1`; stdout remains protocol-only.

The fixed Photos replay reported 268,754,608 bytes of verifier heap after preparing 710 SourceFiles
and only 9,139,288 additional bytes after references. The 78 project files contributed 797,335
UTF-16 code units while 632 SDK declarations contributed 18,915,581, about 96.0% of the measured
source text. Definition showed the same shape: 270,729,512 prepared heap and a 5,955,792-byte query
delta. This is evidence for testing SDK ambient-root cardinality next; it is not a license to remove
SDK declarations without exact reference and diagnostic differentials.

## Rejected reference-only SDK ambient profile (2026-09-11)

A public LSP test first compared full and `common.d.ts` reference-verifier profiles against the same
fake SDK. It required exact references and diagnostics while proving that only the verifier loaded
fewer SDK files/text. The test failed while both runs used `index-full.d.ts`, then passed with the
experimental profile threaded only through transient anchor/batch workers. The production diagnostic
engine remained unchanged.

The real Photos result still failed the product gate. Three fresh processes returned exact five-item
reference sets and published 119 diagnostics. The common verifier reduced prepared heap from about
269 MiB to about 201 MiB, but product peak median was 777,347,072 bytes: only 7.7% below indexed and
6.7% above legacy. The experimental code and its proposed public switch were removed. This isolates
the next problem: the long-lived normal diagnostic context pays for the full Program before the
transient reference verifier runs, and disposing compiler objects does not immediately remove the
worker isolate's reserved heap from product RSS.

## Diagnostic lifecycle isolation (2026-09-11)

Parent revision: `c6f4d3c5bb55d324f7ad1114dad52ee3b59dc2fa`.

RED command:

```text
node --test --test-name-pattern='explicit references' tests/lsp-diagnostics.test.mjs
```

The public child-process test timed out waiting for `textDocument/publishDiagnostics`: the first
diagnostic request remained in flight while references returned, and no retry existed. The minimal
implementation gives `DocumentDiagnostics` a nest-safe suspension lease. Acquiring it aborts and
awaits pending diagnostic tasks; updates received while suspended are retained by URI; releasing the
last lease snapshots the current open document and schedules diagnostics again. The references LSP
handler holds this lease through every success, stale, incomplete, cancellation, and error path.

GREEN coverage additionally changes the document while a cancellation-resistant workspace references
request is active. The references response becomes `ContentModified`, version 1 diagnostics never
publish, and the exact version 2 diagnostic publishes after release. Focused command:

```text
node --test tests/lsp-diagnostics.test.mjs tests/lsp-workspace-global-freshness.test.mjs
```

All 16 tests passed. The fixed Photos `PersistInfoUtils` workload was then replayed in three fresh
processes with `indexed-batched`. Each run returned the exact five legacy Locations and published 119
version-1 diagnostics after references. Peak RSS was 562,184,192 / 571,596,800 / 578,387,968 bytes;
the 571,596,800-byte median is 32.16% below the 842,514,432-byte indexed baseline and passes the 30%
prototype gate. Median request time remains above the production 2x latency target, so this slice does
not switch the default strategy.

A concurrency review then added a second RED case: two overlapping references requests could
let the later request pass while the first request was still waiting for diagnostic cancellation to
settle. The diagnostic scheduler now shares one quiescence promise across nested suspension leases.
Both responses remain behind that barrier, the existing references freshness lane still supersedes the
older request, and diagnostics resume only after the final lease releases. The focused suite passed 17
tests, and the elevated full `pnpm check:fast` gate passed 905/905.

## SQLite reference-candidate name index (2026-09-11)

Parent revision: `ca9ec12e02a0bb11359483a7b4f65947d9a5c0d5`.

The real Photos trace left 4.3–5 seconds between compiler anchor completion and candidate acceptance.
Direct inspection of the retained SQLite database showed 1,096,191 occurrence rows. The production
recursive candidate query took 5.06 seconds and its query plan scanned the URI-ordered primary key;
the exact query with `INDEXED BY reference_occurrences_name` took 0.11 seconds and returned the same
two candidate URIs.

The public store RED case creates 500,000 irrelevant occurrences before the target URI and calls
`WorkspaceIndex.search_reference_candidates`. The old code returned the correct result but took
136.382851 ms on the development Mac. The one-line SQL index selection preserved the result, while a
deterministic unit gate now requires SQLite's query plan to use `reference_occurrences_name`. Wall-clock
timing remains benchmark evidence instead of a cross-machine test threshold; the SQLite store tests and
release sidecar build pass.

Three fresh Photos LSP processes returned exact five-item reference sets and 119 diagnostics. Median
request time fell from 11.253 to 6.775 seconds (39.79%), meeting the 2x-over-legacy production target
at 1.28x. Median peak remained bounded at 575,754,240 bytes, 31.66% below the original indexed
baseline. An `export const` function check remained exact but fell back to 20 batches and 63.279
seconds because that declaration kind is not yet searchable in the index; this becomes the next RED
slice rather than a reason to activate indexed batching by default.

## Exported const arrow-function candidates (2026-09-11)

Parent revision: `076af90a65f63fac7a4841eb1df772450d98e311`.

The public `WorkspaceIndex.search_reference_candidates` RED case used the exact Photos declaration shape,
`export const getMutuallyExclusiveDesc = (...) => ...`. Before implementation it returned
`supported=false`. The minimal parser slice recognizes only a top-level named const whose initializer starts
with a parameter list and reaches `=>`; it records the existing stable declaration identity as a function
export. A second RED case showed that a naive forward scan incorrectly classified
`export const count = 1` when a later semicolonless declaration was an arrow function. The stricter
initializer-bound parser leaves that value unsupported. The sidecar protocol contract exercises the same
result after SQLite persistence.

Three fresh-process Photos replays then accepted two candidate files, ran one verifier batch with 714
Program source files, and returned the exact three-item legacy Location set. Request times were 7.609,
7.345, and 7.357 seconds; peaks were 579,092,480, 568,172,544, and 579,428,352 bytes. All three runs
observed 107 version-1 diagnostics after the references response using the extended 180-second observation
window. This converts the prior 63.279-second fallback into a stable indexed path without broadening support
to unrelated const values or unproven export kinds.

## Exported enum candidate slice (2026-09-11)

Parent revision: `856e25f0856bd8c127e79257d7d6464ac94bf5e2`.

RED command:

```text
cargo test -p arkts-index-core exported_enum_is_searchable_for_reference_candidates -- --exact
```

The public store returned `supported=false` for a position inside
`export enum ConflictFunc`. The minimal implementation adds `SymbolKind::Enum`, persists it as a
new non-conflicting kind value, serializes it as `enum`, and parses named enum declarations through
the existing export/declaration-identity path. Enums are not treated as class containers, and the
existing default-export safety rule remains unchanged.

GREEN coverage includes the in-memory public store and the sidecar's SQLite-backed NDJSON protocol.
The protocol assertion checks the exact declaration identity
`file:///workspace/Enum.ets#0:12:ConflictFunc`, exact two-file candidate set, and `enum` workspace
symbol kind. Full tests passed for `arkts-index-core`, `arkts-index-sqlite`, and
`arkts-index-sidecar`, followed by the release sidecar build.

The real Photos query at `BottomToolbar.ets:320:18` supplied the higher-level RED: before the change
it used 20 conservative batches and 63.101 seconds. Three post-change child-process LSP runs each
returned the exact six legacy Locations and 107 diagnostics using one indexed two-file batch. Their
request times were 8.456 / 7.401 / 7.655 seconds and peaks were 569,102,336 / 566,415,360 /
566,480,896 bytes. This is a GREEN declaration-kind slice, not authorization to treat unknown enum
members or other export forms as indexed declarations.

## Exported interface candidate slice (2026-09-11)

Parent revision: `a64a1f6f07b283e63e49b6a616f67c71eee54f2c`.

RED command:

```text
cargo test -p arkts-index-core exported_interface_is_searchable_for_reference_candidates -- --exact
```

The public in-memory store returned `supported=false` for a position inside
`export interface ConflictContent`. The minimal implementation adds `SymbolKind::Interface`, its
SQLite value and `interface` protocol spelling, and recognizes the same named top-level declaration
shape already used for class/struct/enum. The sidecar public protocol checks the exact persisted
identity, two candidate URIs, and workspace-symbol kind.

The higher-level RED was the fixed Photos `ConflictContent` query. Before support, it returned the
correct three Locations only after 20 batches and 65.470 seconds. Three GREEN child-process LSP
runs each used one indexed two-file batch, returned the exact three-item legacy Location set, and
published 107 diagnostics. Request times were 7.900 / 7.927 / 7.796 seconds; peaks were
570,470,400 / 578,605,056 / 567,791,616 bytes. The 570,470,400-byte median is 26.99% below
this symbol's legacy peak, so the per-case 30% memory gate remains failed even though correctness
and latency are green.

## Exported type-alias candidate slice (2026-09-11)

Parent revision: `bcb51b5edd905232aaa1439b5cd09a463e5fea88`.

RED command:

```text
cargo test -p arkts-index-core exported_type_alias_is_searchable_for_reference_candidates
```

The public store test did not compile because `SymbolKind::TypeAlias` did not exist. The minimal
implementation adds that explicit kind, SQLite value 7, protocol spelling `type`, and a parser branch
restricted to named top-level `export type` declarations. The cross-file store test and the
SQLite-backed sidecar protocol test both require exact declaration identity and candidate URIs.

The real Photos query used `AlbumChangeData` at zero-based UTF-16 `75:30` in
`MediaObserverCallback.ets`. Legacy returned all three known occurrences and 20 diagnostics. Three
fresh-process GREEN runs each returned the exact same Location set and diagnostics using one indexed
batch, two batch roots, and 278 Program SourceFiles. Request times were 5.636 / 5.513 / 5.609 seconds;
peaks were 529,199,104 / 523,751,424 / 536,268,800 bytes. Median peak is 35.64% below the
822,280,192-byte legacy run.

The companion `PhotoAsset` collision run is intentionally retained as a limit case: type-alias
recognition removed `candidate-ineligible`, but conservative name matching found 1,154 files and
needed 11 batches. It stayed exact and is not reported as a performance success. Declaration/module
identity remains a later R2 requirement.

## Directional reference-binding slice (2026-09-11)

Parent revision: `fe2768a0549264bc43510a369174d2cbcf9334b1`.

The first RED was:

```text
cargo test -p arkts-index-core records_named_import_and_reexport_bindings_with_their_source_specifier
```

It failed because `DocumentSymbols` had neither a binding collection nor a binding kind. The minimal
parser change preserves quoted module specifiers and records named `import`, `import type`, ArkTS
`import lazy`, and named re-export entries as directional `importedName -> localName` bindings.
Comments, template literals, escaped specifiers, default imports, and namespace imports are not
promoted into proven bindings by this slice.

A second public-store RED required `references/candidates` to expose the exact two-edge
`Target -> Barrel -> Consumer` chain. SQLite schema v5 persists those edges in the existing database;
tests cover reopen and direct v4-to-v5 migration. The sidecar NDJSON contract and TypeScript index
adapter require the same camel-case payload and rebase every binding URI through the owning
workspace identity.

All existing candidate URIs remain conservative. Binding data is not yet an exclusion authority, so
this slice cannot introduce a reference false negative and makes no memory-performance claim. The
next RED must prove unique module resolution plus complete alias/re-export reachability before the
planner may narrow a high-collision name.

## Relative binding resolution slice (2026-09-11)

Parent revision: `415c98bdb9dc6c69a90a0997fd1e19683caea9c9`.

RED commands:

```text
cargo test -p arkts-index-core --test workspace_symbols
cargo test -p arkts-index-sqlite sqlite_persists_reference_binding_sources_across_reopen
cargo test -p arkts-index-sidecar sidecar_returns_conservative_reference_candidates_across_alias_reexports
node --test tests/index-adapter.test.mjs
```

The first test did not compile because the binding contract had no resolution state or resolved
source URI. The sidecar and adapter tests then failed on the missing public protocol fields. The
minimal implementation resolves relative specifiers against the committed catalog and publishes
exactly four states: `unique`, `unresolved`, `ambiguous`, and `unsupported`. Only `unique` carries a
resolved URI. SQLite recomputes the state after reopen instead of persisting derived truth.

All candidate URI sets and compiler verification behavior remain unchanged. This is still a
fail-conservative evidence slice. The next RED may narrow only after it proves every relevant
occurrence is classified by a complete chain rooted at the target declaration; otherwise it must
retain the current name-based candidate set.

## Directional binding-chain proof slice (2026-09-11)

Parent revision: `64ac8476f112780b26a7a03f4a9fe46e691f2604`.

The public RED required a complete `Target -> Barrel -> Consumer` proof and failed because reference
candidate results had no identity-completeness contract. The negative RED reused ambiguous relative
and bare-package bindings and required an empty proof URI set rather than a partial answer.

The minimal implementation walks only uniquely resolved directional bindings from the selected
declaration and classifies each relevant occurrence by URI plus the name established in that file.
All relevant bindings and occurrences must be reached, the result must fit the query limit, and the
sidecar catalog must be ready. Otherwise the proof is false and its URI set is empty. The planner
does not consume this field yet; conservative candidate behavior remains unchanged.

## Independent declaration collision slice (2026-09-12)

Parent revision: `e745ca76bb5c3f8339a9ab1894d955f4943db679`.

The first public store RED added an unrelated same-name exported declaration to a complete relative
binding chain. The old result set remained conservatively complete but `identityComplete` became
false. The implementation now classifies only occurrences owned by a different stable declaration
identity, so the conservative URI set is unchanged while `identityUris` excludes that document.

The next RED used `import * as Origin` plus `Origin.Thing` in a file that also declares its own
`Thing`. It exposed an unsafe classification until occurrences recorded whether their preceding
token is `.`. Qualified or migrated-unknown occurrences cannot be assigned to an independent
declaration. SQLite schema v6 persists known qualification; a v5 migration test proves old rows stay
incomplete until generation refresh.

The real child-process LSP RED then proved planner consumption. With five conservative index URIs,
four identity URIs, and one open overlay, the old path reported six candidate files. The GREEN path
uses four proof URIs plus the overlay and returns the exact same Locations. If identity proof is
false or empty it still uses the conservative set.

Focused GREEN commands:

```text
cargo test -p arkts-index-core
cargo test -p arkts-index-sqlite
cargo test -p arkts-index-sidecar
node --test tests/index-adapter.test.mjs tests/semantic/references-batching.test.mjs
```

The fixed Photos `PhotoAsset` replay preserved all nine legacy Locations but did not produce an
identity proof because its remaining bindings include package/SDK sources. It retained 1,154
candidates and 11 batches, taking 45.339 seconds with a 779,599,872-byte process-tree RSS peak.
The next slice must resolve package/SDK identities or remain conservative.

## Local-package binding-resolution overlay (2026-09-12)

Parent revision: `0f1fa18f5233166d95a409996a031a2b3c05784d`.

The first RED exercised the real sidecar NDJSON boundary. A bare package re-export stayed incomplete
even when the request included an authoritative resolved source URI, because the protocol discarded
that input. GREEN adds a bounded resolution overlay, verifies that its target belongs to the active
catalog, and reruns the same binding-chain proof. A conflicting duplicate overlay is explicitly
covered and must keep `identityUris` empty.

The second RED used a real LSP child process and a two-module Harmony fixture with
`shared: file:../shared`. Before the production connection, references remained exact but the trace
reported `compiler-definition`, showing that all five conservative candidates were admitted. GREEN
uses the existing `LocalPackageResolver`, sends one resolved binding back to the index, receives four
identity candidates, and reports `compiler-definition-identity`; the normalized Location set is
unchanged.

The safety boundary is intentional: Rust does not read package manifests to invent language module
semantics, stale/partial generations are ineligible, out-of-workspace targets are rejected, and an
unresolved SDK specifier cannot narrow candidates. The next RED must obtain SDK module identity from
the locked SDK owner rather than extending package-name heuristics.

The post-GREEN Photos `PhotoAsset` replay also stayed fail-conservative: exact nine Locations,
46.002 seconds, 784,023,552-byte peak RSS, 1,154 admitted candidates, and 11 batches. It emitted no
local-package resolution event. This is expected negative evidence for the next SDK-identity RED,
not a memory-gate pass.
