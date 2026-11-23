# Resident source final-window observation reuse

Status: implementation and validation IN_PROGRESS; not whole-goal acceptance,
real UI, endurance, merge or deployment. Parent1e3886df3c4d27755a53c073462f1456b0a3de7e;
worktree /private/tmp/arkts-syntax-owned-factory-20261119.
E=.bench/repeated-query-proof-plan-20261117/implementation-20261118/ in main checkout.

## Diagnosis

Independent instrumented complete20004-source public reference transcript03:
Worker readiness1636.46 /references2058.51 /readiness1612.97ms. These commands are
serial; sum5307.94ms. This separate diagnostic is not the ordinary4623.4ms sample
or a pass of its original5s observation gate. No new Program observations in the
three commands. Function spans are inclusive and cannot be added to their parents.

| Consumer | Before readiness ms | References ms | After readiness ms |
| --- | ---: | ---: | ---: |
| Current member scan | 276.10 | 293.81 | 287.83 |
| Final member scan | 264.56 | 274.17 | 270.23 |
| Current resident-source check | 104.67 | not entered | 115.12 |
| Final resident-source check | 583.67 | not entered | 591.99 |
| Source namespace encoding/digest | 292.16 | not entered | 225.73 |
| Candidate identity entry/publication guards | not entered | 594.09 combined | not entered |

Raw stacks identify resident diskInputsCurrent -> observedSourceIdentity and
ReferenceSearchExecutor.execute -> projectFileIdentitiesCurrent. The latter two
checks straddle asynchronous search and are NOT removed here. The former did a
before/after regular leaf observation even when the same final phase had already
completed an exact regular member observation. Original query observations cannot
be lent into this phase. Zero new Program observations does not mean zero parsing
in other earlier commands; the table describes only this final reference operation.

## Minimal design and safety boundary

Keep the original final member scan, namespace proofs and late source raw check.
A completed final membership producer registers owner/epoch/revision; only typed
regular metadata captured in that scan may become the first side of the resident
source window. No complete validity boolean is borrowed. Metadata from failed,
cancelled, mismatched, weak, missing or later-running producers falls back to the
original before/after path. No change to actual byte read guards or generic final
requestFileIdentity borrowing. Original source identities still determine expected
Program bytes. The receipt map and provisional records die with the phase.

Implementation: project/request-input-validation.ts (typed completion and one-shot
receipt), project/validated-source-directory.ts (first-side consumer),
project/source-file-identity.ts (narrow structural stat input type only).
ADR0037 refinement records this scheduling change; ADR0044 retains proof ownership.

## TDD evidence

Public stdio child test resident-final-source-observation.test.mjs verifies READY,
three exact references in two source files and the source observations inside the
actual resident-final path. Original b8a05575 frozen runtime RED02 has64files and
128calls in both prepared query phases. Candidate has64calls in both. Initialization
may lack a completed earlier producer and deliberately keeps the old full path.

RED01 included initialization, and first GREEN01 still found128calls in that
initial phase. The public test now explicitly starts its measurement AFTER actual
initialization terminal; RED02 verifies the unchanged post-init bound against the
original frozen runtime. This is a measurement-scope correction, not removal of
the fallback path or relaxation of the per-file bound.

Initial GREEN02 unit drift tests omitted the directory provider and exercised full
physical fallback rather than the intended regular fast path. GREEN03 supplies
the real membership directory proof:30/30PASS,0skip/cancel, TSC PASS. Additional
actual disk body-edit/same-path replacement controls and expanded regressions are
in progress. Historical failed logs remain. No end-to-end speed claim until
ordinary noninstrumented timing completes. Remaining complete20K timeout and all
M4/M5/final whole-check/Windows UI/endurance obligations remain open.

## Final focused controls and ordinary failures

Expanded01:105/105PASS,0skip/cancel. Subsequently added actual body-edit and
same-path replacement controls and charged completed-owner receipt bookkeeping
to the same optional32MiB metadata account. Final focused01:63/63PASS,0skip/cancel;
TSC02 PASS. New source files remain <=500lines (validation454lines). Manifest RED
correctly rejected two unregistered tests; manifest GREEN02:4/4PASS,366entries
(unit153/bundle190). Original count assertions updated to the actual two added
entries, no test omitted. Frozen Worker3ee3a0c7758c20775a5818635124b8f3ad8aa6fb44a0b939eb95910bca241ae6,
Native unchanged800e6628; identity runtime-m4-final-source-window-identity.json.

Ordinary original20K transcript01 PASS, references4979.39ms, retains all outbound payloads, queued unconsumed inbound messages, logs and
inputs. Consumed inbound bodies were asserted but not persisted by v1; do not
claim a full wire transcript for this run. However matched01 then performed three alternating independent
sessions per old/new frozen runtime: ALL6FAIL at the unchanged original5s request
observer. Completion outcomes are superseded after client teardown/cancellation
(~5005–5008ms); those values are NOT successful full reference latency samples.
Both baseline AND candidate failures remain product/performance acceptance gaps.
Do not report these as passed because the expected locations merged before final
readiness. No original threshold or correctness assertion was relaxed.

The structural64-file source-check reduction is therefore NOT yet evidence of
end-to-end benefit. The candidate is experimental pending actual completed-operation
measurements. A separate ordinary timing observation pair removes external
profiling but uses the previously explicit diagnostic20s test observer so the
operation can reach its own public terminal. This is diagnosis, not passing the
original5s gate; product timeouts unchanged. Work continues on remaining costs.

Independent ordinary observation pair01 reached successful complete public results:
old5459.57ms /candidate5261.51ms (single pair,~198.06ms or3.63%). Both selected
transcripts pass only with the explicitly separate20s TEST observer; neither
proves the original5s gate. Workspace capture20004files/200188bytes, all relative
source hashes equal. Existing overlay sequence retained. This small sample is
not a robust latency distribution and does not close the remaining tail gap.

Diagnostic04 failed because the external observer matched the previous final-union
source text and threw before Worker execution. Captured worker-causes records the
exact "unique M0 hook required" exception; resulting exits/recoveries belong to
this tool injection, not an uninstrumented product crash. A first adapter05 also
omitted initialization of the new receipt map in its replacement body; its passing
transcript is INVALID for optimization attribution and is excluded. Both original
logs retained. Final adapter preserves the map initialization; a compatibility
check now asserts exactly one initialization in original AND transformed code,
besides unique hooks and VM syntax. Only diagnostic06 may measure the new path,
subject to actual public outputs and reduced final-source counts being observed.

## Valid instrumented result and current next step

Diagnostic06 selected1PASS/2not-selected; original source initialization retained,
three exact references and clean close. No new Program observations in final
three commands. New readiness1508.09/reference1954.97/readiness1551.34ms. Resident
final checks464.66/461.21ms, final project lstats40034 in each readiness versus
previous60037:20003fewer each,40006fewer across the complete operation. That is
about16.7% of its measured project leaf lstat calls (240182 ->200176), NOT50% of
all operation cost. The64-noise-file public oracle is specifically the resident
consumer's2-to-1 window count. Earlier/later diagnostics are different sessions;
wall-time deltas are not a precise standalone optimization attribution.

Remaining independent costs: six current/final member scans across the three
commands, two candidate-snapshot guards across async search, full source-namespace
hash assembly before/after, original scope/config/SDK and resident-signature
preparation. Reference command1954.97ms has about850ms outside the instrumented
member/candidate subspans; this is UNATTRIBUTED, not assumed symbol-search or queue.
Next bounded measurement must cover reference planning, view/identity assembly,
actual search and continuation time; do not remove async publication guards based
only on their cost. Also measure retained role/binding work for real Photos;
this complete-SDK sparse fixture is not the original SDKpartial30K topology.

Final oracle01:14/14PASS,0skip/cancel, now asserts exact URI AND all three ranges,
actual mutation controls and manifest. All312product source hashes still match
frozen3ee3a0c7. No final whole check yet; no claimed repair of the original5s
failures, Photos end-to-end tails, M5, Windows UI or endurance requirements.
