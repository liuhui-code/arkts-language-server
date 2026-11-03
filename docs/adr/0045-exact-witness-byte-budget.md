# ADR0045: Bound exact input evidence by retained metadata bytes

- Date: 2026-11-03.
- Status: **Proposed. Authorized phase 2 reconstruction, targeted and frozen-input validation complete. No merge or release qualification.**
- Base: verified main `298d65f5d7f796c347fe8be5c739e428066489d8`; draft PR115/116 are not included.
- [Reconstruction and fresh TDD evidence](../tdd/2026-11-03-exact-witness-byte-budget.md).

## Evidence provenance

The earlier local candidate `5b729f29ca0a94b1aaa73c5a1450cb15e97425a6`, its
worktree, patch, raw logs and frozen fixture were absent after the environment
restart. Local Git object lookup failed and GitHub returned no matching commit.
This is a new implementation reconstructed from conversation records, not a
claim to have recovered those original bytes or receipts. All current acceptance
must use freshly generated evidence. The earlier reported full result does not
certify this reconstruction.

## Problem and existing contract

Fresh real-stdio RED: a complete 4002-source closure succeeds, while the matching
6002-source closure returns -32803. A 4200-declaration synthetic SDK also returns
-32803 on its first exact definition. The load-owned witness's 4096-fact limit
rejects otherwise valid closures. A second aggregate 4096 limit applies to
non-source proofs carried across source-driven owner replacement.

[ADR0036](0036-compiler-source-namespace-recovery.md) remains mandatory: original
SDK/configuration proof before retirement, after construction and after prepare;
failed-proof retention; qualified lexical/physical source recovery; actual
negative and physical-path observations; authoritative known-source reads; and
an independent final input fence. Capacity and unknown/non-source failures must
never acquire fresh authority through a source reset.

## Decision

1. Keep exact path/kind and load-time identity strings. Do not hash, sample,
   evict, restamp cache hits, omit negative facts or cache cross-request validity.
   Content and path-only facts remain separate. Store source-namespace and
   regular-source provenance as fixed fields rather than duplicate composite-key
   sets. Configuration consumption only removes recovery eligibility.
2. Bound both fact maps and both failure-path sets by one **64 MiB accounted
   metadata allowance per witness**. Each fact costs
   `256 + 2 * (path.length + identity.length)`; each failure path costs
   `128 + 2 * path.length`. Length means UTF-16 code units, including surrogate
   pairs. Fixed charges account for entry bookkeeping and bound even empty keys.
3. Reserve before inserting or growing identities; a failed reservation preserves
   the old record and poisons admission. Deletion/reset/namespace retirement
   release retained accounting. Identity snapshots do not alias mutable facts;
   recovery eligibility still reads current conservative provenance.
4. Update failure eligibility even when already unprovable. A later capacity or
   non-source failure must override an earlier recoverable source failure. Do not
   throw from a compiler load/finally merely because the budget is exhausted;
   retain denial and reject at the ordinary safe admission boundary.
5. Bound all pending facts-only capsules by a separate **64 MiB aggregate per
   SourceResetAdmissions owner**. Charge each record
   `128 + 2 * (contextId.length + root.length)` plus its capsule. Empty capsules
   cost a positive 128-byte header. Pass remaining capacity into capture and
   reserve every fact before copying it, never after allocating the whole proof.
6. Partial copies cannot become valid capsules. Map capacity errors to -32803
   before retiring the old owner. Successful capsules are immutable and contain
   original non-source facts only, never an old compiler, Program, resolver,
   witness or context. Pre-retirement/post-construction/post-prepare checks remain
   unchanged. Success releases the capsule; failure retains denial until real
   configuration authority. Complete and clear release aggregate accounting.

## Budget scope and trade-offs

64 MiB is an explicit accounting allowance, **not a V8 heap/RSS/process-global
limit**. Witness instances have distinct allowances. Validation snapshots are
transient, bounded by retained facts; context lifecycle still controls owner
count. No default RSS policy, compiler authority, membership cap or worker
watchdog changes. More admitted facts can increase exact-validation work.

The fresh reproducible Linux probe uses 23,787 sources and passed all three
cases. At short roots it retained 23,542 facts / 20,233,040 accounted bytes;
+192-character roots retained 23,545 facts / 47,368,936 bytes. Both returned exact
definitions twice. At +384-character roots it stopped at 21,218 facts /
67,107,132 bytes, below the 67,108,864-byte limit, and rejected both definitions
with -32803. Each used one Worker and no watchdog. The 64 MiB allowance fits the
first two measured envelopes with headroom while enforcing a concrete rejection
boundary for the third. It is not a guarantee for arbitrary paths or SDKs.
These new receipts supersede no lost history and do not establish native Windows,
V8 heap or official SDK performance. The metadata observer adds measurement work.

The complete 6002-source regression must be READY. The larger 23,787-source probe
must retain the existing membership-incomplete state rather than claiming full
READY. Neither test demonstrates that the reported 900-second Program build or
90-second definition is fixed. A large SDK proof test uses synthetic declarations
and explicit fixture memory settings; it is not a memory-policy benchmark.

## Safety evidence and remaining gates

Public tests exercise complete large closures, an actual >4096-fact SDK capsule,
healthy source replacement, repeated silent-SDK rejection, explicit recovery,
resident exhaustion, mixed source-window/capacity failure, pending header and
partial-copy exhaustion, two module contexts sharing capacity, and release/clear.
Three fresh counterfactuals each fail when early unprovable return, untranslated
capacity errors or missing release accounting are introduced. Unit tests cover UTF-16,
exact limits, source/configuration provenance, replacement and capsule immutability.

The first representation characterization produced 42/43: a normal source edit
returned correct results but created a second context. An unchanged full-file
rerun passed 24/24. A separate main/candidate experiment also reproduced this
context-retention failure on main; the precise race remains unresolved. Preserve
this failure and original assertion; it is not a waiver or proof of root cause.

The final focused cohort passed 80/80 across 13 complete files with zero skips,
failures, cancellations or todos; the separate metadata probe passed 3/3.
The phase 1 newly reconstructed frozen 23,787-file input was replayed via real
stdio without a compiler observer or deadline/budget overrides. Phase 1's new
baseline returned -32803 twice; this candidate returned the exact Target range
twice, preserving membership-incomplete, one Worker, no watchdog, normal exit
and unchanged input/artifact hashes. The measured 6002 Program sources belong
to phase 1's observed trace, not a new candidate observation. This is functional
acceptance only; it does not certify the user's reported cold-build stall.

A fresh normal-checkout full gate is required before merge. The current sparse
checkout lacks original grammar WASM and the toolchain lacks wasm32-wasip2;
no artifact/native-Windows/release qualification is implied. Recheck upstream
main and ADR numbering before publication. Roll back resident and pending budget
migration together, retaining all safety tests and failed receipts.
