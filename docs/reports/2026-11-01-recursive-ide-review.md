# 2026-11-01 IDE correctness recursive review

## Scope and current status

**Group 1 local implementation/review complete; fresh full CI pending.** The user authorized expert review, primary-source research,
minimal corrections and renewed review for at most four rounds, stopping earlier
when a completed review finds no new confirmed issue. Maintain the existing ADRs
and the single [Feature Ledger](../plans/references-feature-ledger.md).

Parent: `b57ad075a80fdc2169189ba7da17fc6bb98a0866`.
Working branch: `chore/ide-review-20261101`. At 17:05 UTC the user explicitly
authorized pushing the independent branch and opening a draft PR, not merging.
Publication remains a separate verified action; existing failures and acceptance
statuses remain.

## Queued continuation — second group not started

At 17:07:30 UTC on 2026-11-01 the user requested: “结束后，再继续下一个四轮”.
The rounds in this report remain **group 1**, with at most four rounds; current
Round 4 is not renamed Round 5. After current validation and the draft PR are
completed and group 1 PR validation reaches a terminal outcome, execute **group 2**, again with at most four rounds and early stopping
when a completed review finds no new confirmed issue. Group 2 has not started;
its future results require a clearly separate group receipt. This queued scope
does not turn pending group 1 checks into passes or authorize merging main.

## Round 1 — local corrections verified

Four previously identified P2 findings are being reproduced and corrected through
public behavior. Focused passes below do not imply full runtime qualification.

| Finding | Existing feature / decision | Intended corrective scope | Status |
| --- | --- | --- | --- |
| PlainText completion insertion loses literal `$1` | R-26; [ADR0022](../adr/0022-completion-resolution-lifecycle.md) | Apply snippet conversion only to snippet-formatted inputs; preserve original plain text and immutable list fields | FIXED-FOCUSED: 14/14; fresh full CI pending |
| prepareCallHierarchy can publish after its final asynchronous preparation loses freshness | R-28, R-13/R-31; [ADR0037](../adr/0037-navigation-work-and-input-validation.md), [ADR0006](../adr/0006-semantic-request-scheduling.md) | Recheck existing request/source authority after the last await before publication | FIXED-FOCUSED: 12/12; fresh full CI pending |
| A settled diagnostic for source A is not refreshed when dependency B changes | R-29, R-13/R-31; [ADR0010](../adr/0010-incremental-invalidation-and-overlays.md) | Restore conservative cross-file invalidation and current diagnostic publication without suppressing diagnostics | Round 1 frozen 12/12; round 2 focused 15/15; fresh full CI pending |
| Windows UNC file URI conversion loses network authority | R-34; affected navigation/edit capability IDs depend on verified coverage | Preserve host/share semantics and URI escaping; require focused Rust tests and relevant release build | FIXED-FOCUSED: Linux-hosted helper/public checks pass; full crate 82 tests and release library PASS; native Windows NOT_RUN |

These are corrections to existing contracts, not new architectural decisions.
No ADR0039 is proposed and no existing Proposed record is promoted to Accepted.
Primary-source references, RED/GREEN commands, raw log paths and final input
identities will be recorded as the corresponding checks finish; none are inferred
from a source inspection or another candidate's historical pass.

## Primary-source research and adaptation limits

- [LSP 3.17 completion](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/language/completion.md)
  distinguishes plain insertion from snippet interpretation and negotiates snippet
  support. This supports format-aware mapping, not stripping placeholder-shaped
  text from plain strings. The format covers both insertText and textEdit.newText.
- [clangd request handling](https://clangd.llvm.org/design/threads) orders reads
  after preceding writes and discards obsolete work. We borrow lifecycle/order
  discipline, not its per-file workers, concurrent completion route or stale
  preamble policy; ArkTS keeps its existing compiler ownership and final fences.
- [rust-analyzer architecture](https://rust-analyzer.github.io/book/contributing/architecture.html)
  separates explicit inputs from lazily derived semantic state. This motivates
  investigating affected-dependency invalidation, not replacing the official
  ArkTS compiler or claiming a full incremental architecture was implemented.

These primary references were read on 2026-11-01. They provide design patterns,
not runtime evidence for this candidate or a guarantee of performance at scale.

## Validation receipt

- Baseline frozen pnpm 8 installation, TypeScript check and build: PASS, as
  reported by the execution coordinator; final integrated typecheck/build also
  PASS. Baseline checks alone do not verify the four behavior changes.
- Runtime: Node `24.22.1`, rather than repository target `20.19.5`; qualification
  limits must be retained until an equivalent target-runtime check exists.
- Initial full `pnpm check:fast` attempt: BLOCKED by missing `cargo` (`ENOENT`),
  not a confirmed product regression. Rust is now installed; full aggregate
  qualification is pending, not a full pass.
- Focused completion: 14/14 PASS; hierarchy: 12/12 PASS, with original REDs
  preserved below. Diagnostics: three production-backend cases RED (missing
  dependent A refresh), then frozen focused GREEN 12/12. This covers five new
  actual-compiler cases, six existing diagnostic/suspension cases and one resource
  watcher case. Round 2 scheduling/logging corrections subsequently passed focused 15/15. Native Windows,
  real UI, soak and performance qualification are not established.

### Round 1 focused receipts

Logs are workspace-relative paths under `../iteration-evidence/`, outside the
repository; they are local execution receipts, not published artifact links.

**Completion:** parent `b57ad075`, public child-process framed stdio with scripted
semantic services. `node --test tests/lsp-completion-text.test.mjs` initially
failed both cases (0/2), because expected `foo$1` became `foo`. Minimal format-aware
mapping then passed the new tests plus existing completion resolution/reliability
coverage, 14/14. `pnpm check` and diff whitespace checks passed. Logs:
`round1-completion/red.log`, `green.log`, `typecheck.log`. The RED test process
exit was not independently saved: the surrounding shell ended with `cat`, so its
exit 0 is not a test pass. The reporter records both failures.

```
node --test tests/lsp-completion-text.test.mjs tests/lsp-completion-resolution.test.mjs tests/lsp-completion-reliability.test.mjs
```

After correcting the fixture's incidental diagnostic result shape to return a
versioned result, the same command again passed 14/14
(`green-harness-cleanup.log`); typecheck and diff checks passed
(`typecheck-harness-cleanup.log`). This fixture cleanup did not change production
code or explain away the original insertion corruption. Exact shell wrappers are
preserved in `round1-completion/receipt.txt`. This is public adapter verification,
not independent real-compiler completion or actual editor coverage.

**Hierarchy:** `node --test tests/lsp-call-hierarchy-publication.test.mjs` first
produced 0/4 in `round1-hierarchy/red.log`, including a fixture response-queue
assertion defect; that run is not the product RED count. The corrected fixture
before production change passed 1/4 and failed cancellation, edit and same-version
close/reopen (`red-corrected.log`, exit 1). The final source-validation await is
controlled through a fixture decorator after the real source check succeeds.
The production handler now rechecks cancellation and freshness before publication.

```
node --test tests/lsp-call-hierarchy-publication.test.mjs tests/lsp-call-hierarchy-reliability.test.mjs tests/lsp-call-hierarchy-preflight.test.mjs
```

Result: 12/12, exit 0, no skips/cancellations/todo
(`round1-hierarchy/green-focused.log`). TypeScript check also exited 0:

```
PATH=/workspace/scratch/dcdb41e16594/.tool-bin:$PATH COREPACK_HOME=/workspace/scratch/dcdb41e16594/.corepack corepack pnpm check
```

See `round1-hierarchy/receipt.txt` and `typecheck.log`. This verifies the public
final-publication fence with scripted semantics, not a separately reproduced
internal realpath race, native compiler semantics, Node20 runtime or Zed UI.
Existing physical source checks, deadlines and incoming/outgoing guards remain.

**Diagnostics:** the first three production-backend tests reproduced missing A
refresh after B overlay edit, close-to-disk and watched disk change. The frozen
round 1 candidate subsequently passed 12/12 (`round1-diagnostics/green.log`),
including five new actual-compiler cases, six existing diagnostic/suspension cases
and a resource watcher case; `resource.log` separately preserves 1/1. The final
round 1 source snapshot includes URI decoding and preserved raw logging; it is
stored at `round1-diagnostics/source/` with `source.sha256`, not reconstructed
from later source. Earlier `check.log`/`build.log` do not qualify subsequent minor
edits; the later round 2 typecheck now passes, recorded separately below.

**Rust / UNC:** the user authorized installation at 16:36:05 UTC on 2026-11-01
(“允许安转 rust”). Official Rust 1.95.0 is installed in the workspace with verified
hashes; there is no remaining installation authorization blocker. The original
cargo ENOENT receipt remains historical, not a product failure.

Linux public URI baseline and extracted Windows-drive characterization passed.
The UNC algorithm RED exited 101: `file:///UNC/server/Share/MixedCase.ts` differed
from the expected network-authority URI `file://server/Share/MixedCase.ts`.
The corrected pure helper passes 2/2; the public Unix contract passes 1/1 and
shared Node URI/path checks pass 6/6. Logs under `round1-unc/` preserve
`rust-public-baseline.log`, `rust-drive-characterization.log`, `rust-unc-red.log`,
`rust-unc-green.log` and `node-shared-vectors.log`.
Full SQLite crate tests now PASS (82 tests, `rust-crate-tests.log`); the relevant
release library build also PASS. These are Linux-hosted algorithm/public checks, **not native
Windows execution**, which remains NOT_RUN.

## Round 2 — partial parallel review, focused corrections verified

Review of the diagnostic candidate identified that one global debounce timer can
let edits in one workspace postpone another workspace's diagnostics. A public RED
was followed by per-workspace deadlines. A further logging RED showed expected
invalidation incorrectly generating one error log; a minimal three-line correction
suppresses only that expected invalidation while preserving genuine backend errors.

`round2-diagnostics/red.log` and `errors-red.log` preserve these separate failures;
`errors-green.log` and final `green.log` preserve verification. Final focused
coverage is 15/15: six actual-compiler dependent-diagnostic cases, six existing
diagnostic/suspension cases, two scripted error-classification cases and one
resource watcher case. `round2-diagnostics/check.log` records a passing
`pnpm check`; `source/` and `source.sha256` preserve this candidate separately.
`tests/lsp-diagnostic-invalidation-errors.test.mjs` is registered in the protocol
manifest. Neither logger filtering nor scripted errors substitute for compiler
freshness verification. This remains R-29 liveness/error handling under existing
contracts, not a new Accepted ADR.

## Round 3 — independent frozen-diff review completed

Independent review of the frozen five production changes, public tests, Rust
helper and governance documentation found no additional confirmed must-fix issue
within that scope. That was a scoped review finding, not aggregate completion. Subsequent aggregate
failures triggered round 4 below; the earlier review does not certify untested
UI/platform/scale behavior or override those failures.

## Aggregate integration — focused PASS, fresh full CI pending

Final manifest verification passes 4/4 (`integration/manifest-final.log`): 288
tests assigned explicitly as protocol 14, bundle 149, unit 117, including four new
test entries. The initial expected-284 mismatch is retained in
`integration/manifest-counts-red.log`; intermediate `manifest.log` and
`manifest-green.log` remain separate receipts. The complete protocol run passes
92/92, exit 0, with no skips/cancellations/todo (`integration/protocol.log`).
Rust formatting passes (`integration/rustfmt.log`).

The code/test/configuration inputs are frozen in
`integration/frozen-inputs.sha256` (documentation deliberately excluded). Strict
workspace/all-target Clippy passed for this candidate (`integration/clippy.log`).
The original frozen `pnpm check:fast` reached terminal exit 1: **2222 tests,
2134 pass, 88 fail, zero skipped/cancelled/todo**, 4306278.564141ms. All 935/935
frozen inputs still matched. Classification accounts for 86 sampler-related
failures, one navigation fixture and one oversized-readiness reason fixture.
The original `integration/check-fast.log` is retained; it is not reclassified PASS.

All three round 4 patches are now integrated. The new probe test is registered:
manifest total 289 (unit 118, protocol 14, bundle 149). Integrated revalidation
completed **263/263 PASS**, zero failures/skips/cancellations/todo, exit 0,
341678.5413ms. Typecheck and build passed first. All 19 originally failing files
plus relevant modified coverage comprise 34 complete files, enumerated by
`integration/final-focused-inputs.json`; results are in
`integration/final-focused.log`. All `integration/final-inputs.sha256` inputs
match, with `FINAL_INPUTS_UNCHANGED=1`. This is not a 2222/2222 full-suite pass.

A fresh complete verification is planned in the draft PR's locked-toolchain CI.
Even a passing 34-file combination is not a full `check:fast` pass. The user was
informed of this validation sequence at 17:57 UTC; group 2 waits for group 1 PR
validation to reach a terminal outcome. Frozen code/test/configuration remained unchanged through integrated checks;
documentation is outside that input freeze and is now finalized for publication.

## Round 4 — patches integrated, focused revalidation PASS

The aggregate run exposed an existing Linux procfs assumption shared by resource
measurement tests. `tests/support/process-resource-probe.mjs` reads
`/proc/<pid>/task/<pid>/children`; on this environment that file is absent for a
live PID even though its stat file and task directory exist. The helper maps the
ENOENT to EPROCESS_NOT_FOUND, so `scripts/bench/sample-process-tree-rss.mjs`
silently exits. Prepared-suite cases then fail after waiting 10 seconds for their
first sample. This is a confirmed measurement-harness portability/error-
classification defect, not evidence that the language server passed resource
qualification or that the six preceding corrections caused these failures.

Read-only probes and HEAD/candidate SHA equality for the affected existing probe,
sampler, prepared-suite and memory-A/B scripts are preserved in
`integration/aggregate-sampler-diagnostic.log`. The original reproduction report
is retained locally at `/tmp/arkts-prepared-suite-2eHmem/report.json`; this local
path is not a published artifact link. Failure attribution remains scoped: this
finding does not automatically explain every aggregate failure.

A separate worktree, `../arkts-probe-round4`, now has a frozen corrective candidate:
only a missing optional children file enables one bounded proc scan per sample.
PID birth identity and parent relationships remain checked. A closing review
found that the first fallback could silently miss hidden children; that additional
RED was corrected with mountinfo visibility proof. hidepid, unknown visibility,
numeric PID masks, permission failures and malformed evidence fail closed.
The closing review's must-fix issue is resolved within this separate candidate.

Both REDs remain in `round4-sampler/red.log` and `visibility-red.log`; the initial
patch is retained separately. Final `final-command-exits.log` records 46 probe /
boundary checks, 29 prepared-suite checks and one façade check, each with explicit
exit 0 and no skips. Validation at 16:59:54–17:00:20 UTC overlapped the original
aggregate process: correctness evidence only, not a benchmark/PSS/release claim.
See `round4-sampler/receipt.txt`, `probe-boundary-green.log`,
`prepared-final-green.log` and `facade-final-green.log`.

The frozen `round4-sampler/round4.patch` SHA256 is
`5e48feb83a83bc8e988b8ae35ea9b0109e25792943fd612d03d1ec39d33b207c`.
After the original aggregate reached exit 1, this patch was integrated and its
unit test registered (manifest 289). Separate-worktree focused GREEN is retained
as prior evidence, not proof that the integrated input passes the complete gate.
The work maps to R-02 evidence integrity and R-34 portability/release qualification
under [ADR0013](../adr/0013-evidence-and-release-gates.md), not a new product
semantic architecture or permission to relax memory/correctness assertions.

### Round 4 navigation fixture determinism — separate test-only patch

The aggregate `navigation-partial-membership` noise-read assertion (1 rather
than 0) reproduces both on baseline `b57ad075` and the frozen candidate. Separate
instrumentation locates the sole read in `prepareInitialWorkspace`: unsorted
opendir traversal makes capacity-partial `membership.paths[0]` select
`Unused1.ts`, before the three definition requests. Those three fallback requests
add zero noise reads and retain scans 2→2. This is a pre-existing fixture ordering
assumption, not a product regression or measured navigation performance gain.

Using the existing `ARKTS_TEST_MEMBERSHIP_FIRST_SOURCE=Main.ets` fixture control
makes the initialization anchor deterministic. Independent baseline and candidate
complete-file runs each pass 3/3, exit 0. Original scale, zero-read, explicit-error
and deletion-recovery assertions remain unchanged. Evidence lives under
`round4-navigation/`, including `noise-witness.jsonl`, `baseline.log`,
`instrumented-baseline.log`, `baseline-main-first-full.log` and
`candidate-main-first.log`, with their separate commands/exit receipts.

The test-only `round4-navigation/main-first-test-only.patch` SHA256 is
`274ffda60db4040a0fa2ac5bcf99a9080a363f6f8463463d29e74476440ccf91`.
It was integrated after the original frozen aggregate reached its terminal
failure. Combined focused validation passed 263/263; fresh full validation remains
the draft PR CI gate. This evidence maps to R-02/R-34 and ADR0013, with ADR0037's
capacity-proof behavior unchanged; no Accepted status or performance graduation
is inferred from making the test precondition explicit.

### Round 4 oversized-readiness fixture determinism — separate test-only patch

A distinct ordering assumption in
`tests/semantic/semantic-readiness.test.mjs` reproduces on baseline and candidate.
Only the expected reason differs: both preserve degraded state, null generation
and empty capabilities. Observed enumeration visits `Oversized.ets` first, leaving
empty membership and no initialization anchor, so the correct branch reports
`workspace-sources-unavailable` rather than the asserted partial-membership reason.
This does **not** establish a readiness product vulnerability.

Preloading the existing Main-first fixture with its first-source parameter makes
the test explicitly exercise the intended anchored partial-membership branch.
Baseline and candidate focused cases each pass 1/1; the independently patched
candidate complete file passes 16/16, exit 0. Original assertions, scale and
timeouts remain intact. This is separate from the navigation test correction.
Evidence under `round4-readiness/` preserves `baseline.log`, `order.jsonl`,
`observed-baseline.log`, the two Main-first focused logs and
`candidate-patched-full.log`, with command/exit receipts.

The now-integrated `round4-readiness/main-first-test-only.patch` SHA256 is
`09e220d36f1d70e628fa663c68507c49b2cd408dadf64538ea1eeaa2f61aa90e`.
It belongs to R-02 evidence determinism / R-22 readiness-test preconditions and
R-34 aggregate qualification under ADR0013, not a new semantic readiness policy.
As of the 17:45 UTC checkpoint, the original frozen full run is still active with
88 recorded failures; that dated checkpoint was not a terminal summary. The later
terminal failure and all three patches' integration are recorded above; integrated
full-gate qualification remains open.

## Stopping rule and remaining limits

Round 4 is the final review iteration of group 1. Local implementation/review
and integrated focused verification are complete; fresh complete CI remains
pending on the draft PR. Final reporting retains all original aggregate failures and any
remaining unverified gates. Publication approval requested at 17:00:40 UTC was
granted at 17:05 UTC for the independent branch and draft PR. Merging main is
not authorized; publication success must be separately verified.

The diagnostic correction conservatively re-diagnoses open documents in the
affected workspace. That restores correctness but may increase background work;
the cost is not performance-qualified and is not a claim of dependency-granular
incremental optimization. Full-workspace scan performance remains an attribution
opportunity, not an implemented/measured improvement in this receipt.

Actual runtime remains Node 24.22.1, not pinned Node 20.19.5. Native Windows URI
execution, real Zed UI, 30K-project behavior, long soak and broad performance
qualification remain unverified. The Linux-hosted Windows path helper tests do
not close that native platform gap or historical UI/scale failures.

## Governing policies and preserved limits

[ADR0007](../adr/0007-semantic-readiness-and-500ms-slo.md)'s 2026-10-28 revision
makes 500ms an experience target: occasional exceedance is not an independent
functional failure or delivery block. Historical 550ms/P95 values are not a new
hard threshold. Report sustained slow responses and functional failures honestly.

[ADR0029](../adr/0029-opt-in-rss-memory-budget.md) keeps the default RSS budget
null; explicit positive budgets retain their pressure semantics. Normal cleanup,
bounded caches, original input fences, cancellation, complete semantic scope and
fault recovery remain. No new RSS limit, timeout extension or truncated success
is authorized by these corrections. Historical failed gates, open Windows/UI
items and ADR approval states are not rewritten.
