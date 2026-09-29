# R-07/R-10 caller-owned source-availability capture

Status: **managed-root ownership, capture producer, unwatched change and alias
public RED/GREEN recorded; final public focus 95/95 and framed-LSP 17/17 GREEN;
Settings 267 exact PASS; fresh controlled whole-fast 1,092/1,092 GREEN;
post-gate frozen-input preflight PASS**.
This document records the
next independent slice after
[transport admission](references-source-availability-transport.md), under
[ADR 0005](../adr/0005-index-proof-trust-boundary.md) and
[the active latency plan](../plans/2026-09-20-references-latency-execution-plan.md).
Parent revision: `9f91122ac504365c57473a430094da09baac9309`, dirty branch
`codex/references-f2-fixed-benchmark`; inherited edits are preserved. No
prior-source gate is reused as current evidence.

## Approved boundary

Expose caller-owned captured discovery inputs through a public interface,
then prove their composition with the existing `resolveClassBaseBinding`
NDJSON port. The caller/semantic layer owns project selection, SDK selection,
open document authority and managed revisions. The index adapter owns bounded
transport, canonical workspace URI rebasing and returned-protocol admission;
it cannot independently certify a whole semantic query snapshot.

`ReferenceInputState.captureClassBindingInput(input)` returns owned frozen
`workspace`, `query`, `inputs` and `assertCurrent`. The public helper in
[class-binding-input-snapshot.ts](../../src/semantic/references/class-binding-input-snapshot.ts)
copies the caller's requested set, cursor/generation, relevant supplied
overlays and project/SDK configuration before asynchronous discovery. The
caller supplies the bounded requested universe; this API does not enumerate
all dependencies, ProjectGraph membership or every relevant workspace buffer.
The existing port still owns ready/generation admission. Call `assertCurrent`
before IO and before accepting discovery; do not replace those port checks
with managed revision equality.

Capture all requested support and extensionless candidates from one owned
input set before asynchronous discovery. Preserve authoritative open buffers
and explicit present/absent/unknown evidence. Missing index rows, missing or
legacy metadata, unrequested files and omitted evidence are not absence.
Unknown physical identity must remain unknown rather than being guessed from
lexical paths, lowercasing or Map insertion order.

The initial strict physical-parent policy leaves candidates with missing
parents unknown. A typical `./Base` import does not imply that a `Base`
directory exists for `Base/index.*`; the fixture must retain that condition,
not create a directory merely to manufacture complete evidence. An explicitly
empty existing-parent control may characterize confirmed missing regular
files. This initial policy is conservative, not a permanent assertion that a
future independently proved nearest-ancestor algorithm is impossible.

Captured inputs need freshness fences for managed workspace/configuration/
overlay changes and independent physical-identity drift. Generation equality
alone cannot establish freshness. Any unsupported or contradictory capture
must withhold trustworthy evidence instead of filtering out the authoritative
buffer or reviving stale persisted facts.

## Actual first public RED: captured root ownership

The first failing public case uses independent caller-owned
`ReferenceInputState.capture`, then holds status through the real external
NDJSON boundary. Capture the parent `workspace.rootUri`, issue status, call
`state.changed(nestedRoot)` while status is held, then release it. The current
snapshot must be invalid, but `isCurrent(snapshot)` returns **true** rather
than the expected false: capture did not register the queried root for nested
mutation ownership.

Retained normal-termination evidence is
`.bench/anchor-reuse-2026-09-28/availability-capture-root-owner-red.log`:
**0/1 PASS**, exit 1, test **1,078.700272 ms**, total **1,218.147332 ms**.
This is an actual caller freshness failure, not missing final references, a
framed-LSP capability failure, 5 GB reproduction or product RPC latency.
Its retained SHA256 is in the report. Complete historical root-RED argv is not
retained here; the copyable same-test rerun is not claimed byte-identical argv.

Two earlier attempts must not be conflated with that valid public RED:

| Retained log | Observation and limitation |
| --- | --- |
| `availability-capture-root-red.log` | Missing audit environment makes the fixture sidecar exit 1; this is a fixture setup failure, not the semantic assertion RED |
| `availability-capture-root-reproduced-red.log` | The same ownership assertion fails, but fixture cleanup ordering hangs; precise SIGTERM of this attempt's child PID 19325 precedes exit 1 / 66,825.830426 ms total, not a normal terminal performance sample |

The fixture uses defined esbuild paths and releases/closes the held session
before removal. The minimal source repair registers the first captured root
at revision 0; it does not call `changed(root)` or invent a mutation. The
`availability-capture-root-green.log` run is **1/1 PASS**, exit 0,
**1,112.447462 ms** total. This repair alone does not implement complete
source admission or Rust consumption.

## Capture producer and unwatched-change RED/GREEN

The next public producer test first fails because the capture API is missing:
`availability-capture-producer-red.log`, **0/1 PASS**, exit 1,
**1,541.289826 ms** total. The first implementation run is not GREEN:
`availability-capture-producer-green.log` exits 1 because the fixture expects
the lexical `/var` path rather than native macOS `/private/var` canonical
identity. Correct the test expectation using `fs.realpathSync.native`, with
no production change for that failed expectation. The next
`availability-capture-producer-canonical-green.log` passes **1/1**, exit 0,
**1,418.588499 ms** total. A file named `green` does not override its exit.

An unwatched physical change then has its own public RED:
`availability-capture-unwatched-red.log`, **0/1 PASS**, exit 1,
**1,657.738335 ms** total, because the required exception is missing. Add a
physical stat witness revalidation to the capture interface's default path;
`availability-capture-unwatched-green.log` passes **1/1**, exit 0,
**1,138.261634 ms** total. This concerns that API, not promotion of a production
references default or a new discovery RPC.

Managed revision checks and best-effort physical stat witnesses do **not**
establish an atomic/content-hash filesystem snapshot or prove all concurrent
disk races. `present` means captured regular-file physical existence (or
admitted authoritative overlay presence), not successful disk readability,
current content fingerprint or semantic validity. No source-availability value
is consumed by the Rust resolver.

Revalidation only compares observations from capture onward. A disk edit before
capture that has not reached the watcher/index can leave old SQLite metadata
at the same numeric generation; `present` plus that generation does **not**
make those facts current content. Future resolver consumption still requires
current-source/index-content admission independently of physical availability.
Missing evidence or an unchanged generation cannot authorize exclusion.

## Diskless physical-alias overlay RED/GREEN

`availability-capture-alias-red.log` exposes an actual public failure: the
canonical candidate for a diskless open overlay is incorrectly marked absent.
The run is **0/1 PASS**, exit 1, **1,365.388540 ms** total. Associate an admitted
overlay with a candidate through safe physical identity, and preserve the
original overlay URI's physical witness for subsequent revalidation.
`availability-capture-alias-green.log` then passes **1/1**, exit 0,
**1,732.232421 ms** total. Foreign-owner input and duplicate physical overlays
are explicitly rejected rather than arbitrarily selected. Expanded public
characterization and the fresh frozen-source focus are recorded below.

This fix does not create a missing `Base` directory, infer omitted candidates
as absent or give the index authority over the open document. Presence remains
separate from extensionless resolver/constructor completeness.

## Public test registration RED

`availability-capture-manifest-red.log` is a real registration failure:
the new discovered test has no assigned layer. The public manifest test is
**0/1 PASS**, exit 1, **277.661273 ms** total. Register the test as
`unit-contract`; the manifest now has 122 entries/60 unit-contract entries.
The first combined run, `availability-capture-contracts-green.log`, is **not**
GREEN: **14/15 PASS**, total **9,357.887226 ms**. Its unrelated-sibling fixture
has not created the sibling directory; the existing root-overlap policy
correctly treats unknown physical root identity as potentially related, so the
captured guard rejects. Create the real disjoint sibling fixture directory;
do not relax production overlap/freshness policy. The subsequent
`availability-capture-contracts-canonical-green.log` completes **15/15 PASS**,
exit 0, **8,892.072497 ms** total: 11 capture and four manifest tests.

That characterization precedes the final cross-host probe expectation update.
The denied-parent control now reports the actual `lstat` probe code rather
than skipping or claiming EACCES was reached. Actual EACCES yields unknown;
when privileges/Windows instead yield ENOENT, the asserted result is absent.
Production source is unchanged by this expectation correction. The fresh
six-file frozen-source focus subsequently completes in
`availability-capture-focus.log`: **95/95 PASS**, exit 0, zero failures,
cancellations/skips/todos, **50,691.527083 ms** total. Its actual permission
diagnostic is **EACCES**; this host exercised the unknown-state branch, not
merely the ENOENT alternative. `pnpm check` and `pnpm build` also pass exit 0.

At the source freeze, helper/state/public test/support/external fixture are
**147/128/178/73/36** physical lines; manifest/manifest test are **246/286**.
All changed source/test/support files are below 500. Existing proxy 614-line
migration debt is not edited by this slice. No production RPC/planner/default
configuration is connected by the capture API.

## Final public capture characterization

The tests exercise the public capture interface and independently
compose its returned input with the existing real Node-to-sidecar port. They
do not invoke private parsers or introduce an unused per-references RPC.
Public input/NDJSON admission is not itself a Content-Length framed-LSP
capability test or a compiler-backed constructor completeness certificate.

The 11 public capture cases and combined 95-case focus protect:

- Caller-owned requested input and open overlay survive caller mutation.
- Captured pre-entry open source text is carried through the bounded port.
- All eight `./Base` file and `index.*` candidates are represented; missing
  parent candidates remain unknown.
- An existing-parent absent-file control does not infer absence from the DB.
- Managed revision changes and unmanaged physical-identity changes cannot
  publish a mixed captured input.
- Unknown/conflicting identity is fail-conservative, not arbitrarily selected.
- The captured result composes with strict transport without upgrading unknown,
  inventing omitted evidence or writing overlays/availability to persistence.

The fixture deliberately writes `Base.ets` but not `Child.ets`, supplies Child
through an open snapshot, and leaves the `Base` index parent missing. Nine
captured entries are Child plus the eight file/index candidates: the baseline
states are two present, three absent, four unknown. In-place caller mutation
of arrays, text/version, cursor, generation, workspace and nested project/SDK
inputs cannot change the original wire request. A canonical diskless Base.ts
overlay becomes present and carries its original source witness. Clone failure
rejects instead of normalizing unsupported input to a default configuration.

Unwatched modification, creation, deletion and client-root alias retargeting
invalidate captured evidence. A physically proven disjoint sibling leaves it
valid; managed nested/configuration changes invalidate it. Existing directories,
dangling links, missing parents and real EACCES preserve unknown. This is an
external NDJSON audit, not real Rust constructor proof; Rust still deliberately
returns existing extensionless unknown semantics.

The separate final-source framed-LSP regression completes **17/17 PASS**, exit
0, zero failures/cancellations/skips/todos, **18,983.779389 ms** total in
`availability-capture-lsp-focus.log`. It protects global freshness, candidate
snapshots and completed compiler search coverage. It does not add a new LSP
capability or prove the standalone capture API now runs during references.

Historical filtered producer/unwatched/alias REDs use `node --test
--test-concurrency=1 --test-name-pattern` with, respectively,
`captures physical availability`, `unwatched source modification` and
`canonical diskless overlay`, against `tests/class-binding-input-snapshot.test.mjs`.
The manifest RED uses `node --test --test-name-pattern 'classifies every
executable' tests/test-layer-manifest.test.mjs`. The first root RED's complete
historical argv is not preserved here; retain its actual log rather than
claiming a byte-identical command. Copyable focused reruns are in the report.

## Final-source gates

| Gate | Current status |
| --- | --- |
| Actual current parent and dirty-tree preservation | Recorded above; inherited work preserved |
| First public managed-root ownership RED | 0/1 PASS, exit 1; normal terminal log retained |
| Minimal root ownership GREEN | 1/1 PASS, exit 0; separate from producer completion |
| Public availability producer RED/GREEN | Missing API RED, corrected canonical-expectation GREEN 1/1 |
| Unwatched physical change RED/GREEN | Missing exception RED, stat-witness GREEN 1/1 |
| Physical alias / diskless-overlay admission | Actual incorrect-absent RED; minimal GREEN 1/1 |
| Public test registration | RED, repaired; 15/15 combined characterization PASS |
| Public capture/NDJSON composition characterization | Included in final 95/95 public focus |
| Typecheck and final runtime build | `pnpm check` / `pnpm build` PASS, exit 0 |
| Fresh focused regression | 95/95 PASS, exit 0; 50,691.527083 ms |
| Fresh framed-LSP focused regression | 17/17 PASS, exit 0; 18,983.779389 ms |
| Fresh fixed Settings/API24 replay | 267 exact PASS, exit 0; 60,533 ms RPC |
| Fresh controlled whole-fast | 1,092/1,092 PASS, exit 0; 864,280.234491 ms |
| Post-gate frozen-input preflight | PASS, exit 0; no server/output created |

Raw paths, terminal totals, SHA256 values and runtime/environment pins are
recorded in
[the capture report](../reports/2026-09-28-settings-source-availability-capture.md).
Output guards preserve retained evidence; a path named `final` is not by
itself proof of final-source validation.

The fresh fixed Settings/API24 constructor replay returns all **267 individual
exact Locations** with normal version-1 diagnostics and clean exit. Harness
RPC takes **60,533 ms**; externally sampled Node maximum is **763,441,152
bytes**. One rejected constructor seed still leads to 14 complete conservative
batches. This is one trace-on compatibility replay, not constructor narrowing,
a paired speedup, 500 ms, memory no-regression or final release graduation.
The fresh controlled `pnpm check:fast` completes **1,092/1,092 PASS**, exit 0,
zero failures/cancellations/skips/todos, **864,280.234491 ms** total. Its
terminal aggregate is authoritative, not interim lines or the preceding
1,081-case source's gate. The subsequent read-only public replay-input
preflight calls `parseArguments`, `validateInputs` and awaits
`validateBenchmarkManifest`; HEAD, lock and seven source/test fingerprints also
match. Fixed project/SDK/oracle/runtime/library inputs stay unchanged. The
unused output remains absent and no server launches. Its actual retained log
is recorded in the report; this is not default-host SDK certification.

## Scope not graduated

This slice does not pass availability to the Rust binding resolver and does
not add production references RPC consumption, constructor candidate exclusion
or a new semantic authority. No source membership, SDK/dependency profile,
production default, Worker lifecycle, memory budget, diagnostic capability or
reference completeness change is authorized by capture alone.

The preceding transport slice's 1,081/1,081 controlled whole-fast, 267 exact
Settings Locations, 58.759 s RPC and sampled Node maximum 738,242,560 bytes
are historical context only, not measurements of this source. Compiler-backed
inherited/factory/own-constructor coverage and exact differential remain required
before exclusion. Cold/edit 500 ms, original >3 GB, final memory/PSS, native
Windows and separate default-host SDK gates remain open. No commit, push or
merge is part of this slice.
