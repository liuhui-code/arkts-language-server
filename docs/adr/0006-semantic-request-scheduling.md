# ADR 0006: Interactive/global semantic scheduling

Status: **Accepted and implemented for references; broader global operations remain deferred**.

2026-10-25 amendment: [ADR0023](0023-completion-cancellation-and-synchronization.md)
extends completion's bounded bypass across queued diagnostics and interactive reads up to the first global barrier.
The deferred oldest request runs after one bypass, preserving progress for diagnoses/highlights/prefetch.
Mutation priority, active synchronous work, detached references and the original define/hover rule remain unchanged.

## Context and proposed decision

The persistent semantic Worker serializes messages with one Promise queue and
awaits each request. A long reference verifier can therefore block a later
definition/hover even when the heavy compiler work runs in another Worker.
Introduce an interactive lane for current-document navigation/completion and a
single global lane for references and other proven global operations. Background
diagnostics/indexing remain lower priority.

References now retain their revision-bound request and cancellation cell while
their verification runs outside the persistent Worker's serial queue. The
supervisor permits only classified interactive methods to run beside that one
detached request; diagnostics and other global operations remain serialized.
Any mutation advances the revision and marks the detached request
ContentModified, so its eventual response cannot publish stale or partial
Locations. Global verifier concurrency remains one.

The cancellation bridge uses request-local async context so overlapping
interactive and references work observe their own cancellation cells through
the stable TypeScript host token. Opt-in trace events identify interactive
methods admitted during references and report their queue wait. This decision
does not yet generalize the detached lane to implementations, rename or call
hierarchy.

The [candidate-stage snapshot regression](../tdd/references-candidate-snapshot.md)
extends freshness to asynchronous index/status work outside the persistent
Worker's queue. Cancellation is checked before document synchronization; an
old operation must never enqueue its version-1 buffer after version 2.
Managed input/configuration revisions fence semantic admission and completion,
including canonical aliases and overlapping workspace roots. A semantic
`content-modified` failure follows the runner's stale path even if only a
nested workspace's LSP freshness lane was directly aborted. The references
adapter emits ContentModified (-32801), not InternalError (-32603), with no
partial Locations. Existing first-cause client cancellation retains priority.

The [pre-F6b Settings/API-24 benchmark](../reports/2026-09-21-settings-api24-benchmark.md)
exposed a second scheduling boundary: the LSP references handler waited for
an already-started automatic diagnostic to quiesce **before** entering the
complete-result cache. Three of 27 cached repeats waited 1.96–1.99 seconds
despite about 1 ms of eventual server-side cache work. F6b keeps normal
diagnostics and moves only a proven complete cache hit ahead of that wait.
Cache misses still quiesce diagnostics before compiler work, preventing an
unbudgeted second heavy Program; the request runner still checks freshness
and cancellation before responding. A [framed-LSP RED/GREEN test](../tdd/references-diagnostic-cache.md)
proves a cached response completes before a held diagnostic settles and that
versioned diagnostics still publish. In three fresh-process
[Settings/API-24 runs](../reports/2026-09-21-settings-api24-diagnostic-cache.md),
27 cached requests had 67 ms median, 96 ms observed nearest-rank P95 and
100 ms maximum, with exact 248-Location responses. These smoke results do
not claim cold/miss navigation under 500 ms or graduate the release gate.

## Queued automatic diagnostics and interactive navigation (2026-10-06)

After references resume normal automatic diagnostics, a second queued
`diagnose` could occupy the sole semantic Worker before a later definition.
The [public framed-LSP RED/GREEN](../tdd/l01-diagnostic-priority.md) proves that
ordering, then verifies a narrow priority rule: mutations remain first; only
the earliest `define` or `hover` may bypass a contiguous prefix of queued
diagnoses, and the oldest diagnose can be bypassed at most once. No interactive
request may cross a queued global operation. An already-running synchronous
diagnosis remains non-preemptible. The existing detached-references lane keeps
its separate interactive policy; the one-bypass fairness bound applies only
outside that lane. A concurrent edit still invalidates the old definition,
publishes version-2 diagnostics, and permits a fresh exact definition.

The [three-process Settings/API24 check](../reports/2026-10-06-resident-l01-diagnostic-priority.md)
returns the exact previously unqueried definition before the second normal
diagnostic, but complete responses take 824.4/703.9/691.0 ms. This change
corrects a queue-order defect; it does **not** establish 500 ms navigation,
semantic readiness, or a memory release gate. The test-only diagnosis hold is
default-off and absent from the real-project runs. Compiler preparation and
the first active diagnosis remain separate measured concerns.

## Gate

2026-10-12 [OP-03a公开反例](../tdd/op03a-completion-diagnostic-priority.md)证明
complete也会不必要地等待尚未执行的诊断。最小实现将complete加入上述
define/hover的同一有限越过名单，strict/build及原联合4/4通过；mutation优先、
最老diagnose最多一次、不能越过排队global、在途同步compiler不抢占均不变。
直接公平性／取消、v2编辑恢复与global屏障也通过，两文件联合6/6；扩展回归、
同输入成本和当前完整GREEN仍待审计，未合入main，没有新owner或并发预算。
当前eae466b5十文件完整相关回归89/89、exit0，不替代新check:fast或产品门禁。
本切片不声明修复既有cold completion／403文件whole超时或550ms产品毕业。

2026-10-15 current public scheduling/readiness characterization31/31 passes with
unchanged production5cf9d618, original request deadlines and input identities.
This retains one-bypass fairness, cancellation, mutation/global barriers and normal
latest diagnostics; private holds do not establish normal wait-time benefit.
OP-03a next distinguishes supervisor pending time from physical-Worker waiting,
LSP diagnostic quiescence and query recertification. No new scheduler, owner,
concurrency or diagnostic suppression is authorized by observational work.

2026-10-15 the [OP-03a observational slice](../tdd/op03a-completion-diagnostic-priority.md)
now has two public RED/GREEN boundaries, default-OFF behind exact
`ARKTS_SEMANTIC_QUEUE_TRACE=1`: parent admission through original successful
send return, and Worker message callback through original dispatch. Pairing uses
root/epoch and existing wire request IDs; no protocol envelope or queue changes.
Worker-local time excludes undelivered messages and compiler execution. Do not
subtract clocks across threads or present their sum as total waiting/CPU. Default
absence, cancelled pending work, true send faults, complete payload/diagnostic
equivalence and original scheduling/readiness protections pass nine full files78/78.
Supervisor894→732 lines after cohesive error/input extraction remains migration
debt; no scheduler/owner/budget change, normal-project cost/adoption still open.

The next observational slice also wraps only the original cache-miss diagnostic
quiescence and original in-query readiness call, including input construction,
afterQuery and final current-proof admission. Default/0 bypass observation; complete
cache hits still bypass quiescence. Query-snapshot state and membership are taken
from that actual returned proof and named queryScope*, not public root readiness.
Fresh public status still revokes unknown membership changes and reports2307.
Current sixteen complete files172/172; collector and latency/memory consumers reject
queue-trace samples even under a forged trace-off label. Two real Settings sessions
retain10 complete exact responses/latest diagnostics but FAIL/DEGRADED missing input;
their observed quiescence does not explain the multi-second edit cost. Follow edit
preparation/fallback attribution, not a new scheduler based on these partial spans.

The subsequent fixed ordinary Settings OFF/ON/ON/OFF comparison retains48 complete
completion responses and96 current diagnostics with identical full payloads; see
the [OP-03a record](../tdd/op03a-completion-diagnostic-priority.md). The narrow rule
changes publication order, but median latency, diagnostic completion and sampled
RSS do not establish stable whole-workflow benefit. Keep its proven one-bypass
correctness/fairness contract, not a general speed claim or new concurrency policy.
Successful-ready refresh and product qualification remain open; no favorable
resampling, diagnostic suppression or new production flag is justified by this data.

Successful-ready refresh cost has since been observed with the installed full SDK
and a separately frozen generated corpus: six sessions retain54 exact queries and
54 current public READY proofs, not Settings qualification. Normal body-edit
responses take827–921ms; independent trace observations retain501–573ms full
certification and869 actual dependency-check calls per edit. See the same OP-03a
record. This motivates a falsifiable redundant-input-certification slice, not
skipping freshness or moving work outside the complete response. Any rearranged
admission must still follow complete output construction; product gates remain open.

The subsequent OP03a readiness slice removes only the immediately repeated
admission after a fresh preparation or query refresh. The entire report, UUID
and identity digest are constructed before the retained final fresh-input guard;
unchanged queries and read-only status retain their original current checks.
Real no-notification SDK mutation during construction still revokes READY, with
normal configuration/revision recovery. No cached validity, skipped dependency
diagnostics, moved response work, scheduler/owner/budget change or new flag.
Current eabe24ef passes twelve complete files70/70. Four fixed path-normalized
baseline/candidate variants retain36 exact/currentREADY responses and lower
edited medians/sampled RSS in both directions (audit125adc35), supporting this
local slice only. Fresh whole subsequently terminates1779/1797 with18 failures,
exit1 and stable source/build/SDK identities (auditd16e6667); not whole GREEN.
Original complete-file reproduction11/11 and90/91 retains the stable403-source
timeout. One selected trace confirms repeated cold Programs and an unsuccessful
anchor before full fallback, not a reason to change fairness or verifier ownership.
The maintainer has since authorized both unopened-module entry paths. Direct
never-didOpen definition, typeDefinition and hover each now have public RED/GREEN
transcripts, matching independent opened-caller complete payloads. Existing
physical source authority resolves request-owned disk bytes within the original
request interval and retains final source/freshness/cancellation guards. Explicit
bounded Worker query data never enters the open map, enqueues synthetic open/close
or advances the mutation revision; original call-hierarchy disk follow-ups now use
that transport too. Genuine client version zero is no longer treated as a disk
marker, fixing public close-to-disk and outgoing-call regressions. No new owner,
LS, scheduler, concurrency, budget or flag; source work remains in the response.
2026-10-25 amendment: [ADR 0022](0022-completion-resolution-lifecycle.md) supersedes
the stale completion-resolve error mapping below. Issued items whose context
expired return a safe original payload without new edits; unknown/forged handles
still fail. The source-byte, input-proof and freshness requirements remain.

SignatureHelp, completion, completion resolve and call-hierarchy preparation have
since each passed their own public RED/GREEN. Full incoming/outgoing items and
ranges match opened-caller oracles too. Disk completion records bind exact source
SHA with the original512-record limit, one hash per list and no extra source-text
retention. Resolve rereads disk, rejects same-size/mtime changes or open authority,
and ignores forged client item fields; fresh preparation/completion recovers.
Version-zero preResolved shortcuts remain open-only. Original public44/44 protects
the pure completion-mapper extraction before and after it. References (both
declaration policies), implementation and prepareRename/rename have since each
passed their basic direct-disk public RED/GREEN; transactional origin and local
import-alias edits retain their distinct semantics and null closed-file versions.
An actual unnotified cross-file edit exposed stale disk reference result-cache
hits, while another declaration policy already returned current owner results.
Disk hits now bind the existing complete READY generation/input proof; storage
requires the same proof before/after the query, and proof metadata counts within
the original128-entry/8MiB limit. Readonly status never starts preparation; no
current certificate falls back to the original full query. Proven disk hits
still occur; ordinary open hits retain their no-extra-owner-request diagnostic
bypass. All added admission waiting remains inside the complete response.
Identical overlapping disk references also reuse the original coalescer across
source resolution and execution, with separate client freshness/cancellation
and a shared operation independent of the first token. Managed changes revoke
all old subscribers, with complete new recovery and one terminal per client.
This changes no semantic lane/concurrency or owner budget. Current bd4010b6 passes
twenty-eight complete related files313/313, independently auditedb36e8173. Basic
14-item entry oracles, private SDK fixtures and private600ms verifier windows
do not certify all workload buckets, normal installed-SDK cost, fresh whole or L08.
The original whole1779/1797 FAIL and cold403-source timeout remain unresolved.

Document close is a lifecycle barrier, not a replaceable full-text snapshot.
Queued `close → open` must reach the semantic Worker in that order, even if
the reopened document restarts at the same or a lower version. Coalescing may
still replace ordinary text changes, but must not erase either side of close.
The [public reopen regression](../tdd/references-reopen-mutations.md) proves
exact references and isolated anchor fallback without relaxing document truth.

A framed LSP interference test uses a default-off verifier delay, launches
references, then sends definition, hover and a document edit. Definition and
hover complete before references with queue waits below 250 ms; the edit makes
the old references request fail ContentModified, and a new definition sees the
new document revision. Direct supervisor coverage also proves out-of-order
response routing and first-cause cancellation. See
[the TDD evidence](../tdd/references-scheduling.md).

The active-lane audit applies only while references is still running. An
interactive request sent after awaiting the terminal references response is
not required to produce `references.interactive.start`; it retains the normal
public response and `request.completed` contracts. The 2026-09-28 test repair
checks the two bypassing requests before the edit and separately audits the
fresh definition after cancellation. Three independent runs and the 51-test
focus pass with unchanged deadlines and no production change; the broader
whole-fast gate remains open due to independently retained timeouts.

R-10's opt-in validated-definition route preserves the same request contracts.
Two additional [public characterization transcripts](../tdd/references-anchor-reuse.md)
cancel or edit after the reused anchor enters a transient batch. Neither old
request returns partial Locations; same-process recovery proves the complete
result, including the added unsaved reference. This does not claim real-project
cancellation latency or change the production scheduler.
