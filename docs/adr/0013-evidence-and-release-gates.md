# ADR 0013：证据分层、完整响应计时与发布门禁

日期：2026-09-29。状态：**Proposed；不代表产品门禁已通过**。

## Context

缓存热请求、不同 SDK/配置、trace-on 归因和默认产品测量不能混作一个性能结论。结果数量相同也不能证明精确语义。

## Proposed decision

- 保留原正确性、回归和内存门禁，post-ready 分桶以 500 ms 为优化目标；2026-10-10 用户授权 L08 正式 P95 上限为 550 ms，其它门槛不变，历史 500 ms 失败保留。
- trace-on 只做归因；产品时延使用 trace-off、独立进程和真实 framed LSP。计时从请求发出至完整终态，包括排队、更新/恢复等待、回退和序列化。
- 首次准备的时间、资源、进度和故障单列；ready 不能来自静默预跑全部基准目标。准备没有内存或后台 CPU 豁免。
- 测量前冻结语料、能力、操作分布、硬件和工具链；ready 后才按固定 seed 选择未查询目标。新符号、新模块、普通编辑和驱逐/重启查询各桶独立报告。
- 正常请求的 error/timeout 算失败；主动取消及故意 ContentModified 使用独立矩阵。PASS/FAIL/BLOCKED/NOT_RUN 分开，环境缺失、样本不足和旧版本 CI 不能成为 PASS。
- 2026-10-08 用户确认：最终产品验证统一在 L08。L01–L07 逐切片验证精确性、完整性、新鲜度、取消和执行保护；最终时延、内存、整体 ready、长期 soak、规模与跨平台未达标不阻塞下一实施切片。默认推广和发布须在 L08 全套通过，不降低原样本或阈值。

## Gate and failure policy

[验收协议](../benchmarks/semantic-ready-acceptance.md) 定义 G-CORRECT、G-READY、G-LATENCY、G-MEMORY、G-LIFECYCLE 和 G-PORTABILITY。精确对照要求零 missing/extra/stale/非法 UTF-16；references 的两种 `includeDeclaration` 都验证，未完成工作不能发布 partial success。

初始准备豁免时延不豁免原 >3 GB 复现、最终 50% 内存目标、DevEco/PSS、post-eviction 或工作区规模门禁。Node PID RSS 只计一次，worker threads 不重复叠加；macOS RSS 不能充当 Linux release PSS。

必需指标不能测量或证据身份不符时发布 BLOCKED；实测失败记 FAIL。不能修改预算、期限、样本或语义范围使其变绿。复用同一报告不能认证不同构建、SDK 或配置。

## Relations

此提案补充 [ADR 0007](0007-semantic-readiness-and-500ms-slo.md) 的验收定义，保留 [原产品内存协议](../benchmarks/product-gate.md) 和 ADR 0001–0006 的未完成门禁。原报告留作历史；新证据写入 reports/raw 摘要，[Ledger](../plans/references-feature-ledger.md) 和 [MoSCoW](../plans/references-moscow.md) 链接当前结论，避免重复追加调查日志。

实施顺序见[当前 L01–L08 执行计划](../plans/2026-10-06-budgeted-resident-semantic-plan.md)；需求范围见[产品契约](../plans/semantic-ready/product-contract.md)。

## S01 implementation evidence

2026-10-10 [L06阶段审计](../reports/2026-10-10-resident-l06-completion-audit.md)
按A～E完成：19公开case/252联合、当前62真实请求、全新whole1492及
终态身份一致。阶段PASS不重标raw FAIL/READINESS_UNSUPPORTED；
旧whole失败、输出传输截断及一次观察缺口保留，根终态统计实际完整。
没有由单进程RSS/时延推导最终P95/PSS/内存收益；L07可继续，发布仍待L08。

[L07当前审计](../reports/2026-10-10-resident-l07-completion-audit.md)A–E
通过，冻结完整1511/1511、根退出0及终态身份一致，阶段DONE。
原真实54/54目标已resident，不能认证
晋升；增加真正未查lazy源后62/62完整语义/诊断配对一致，实际Program
及create见证证明反事实。原raw readiness FAIL/CLI1和高RSS/慢响应保留，
不从单对控制推导P95、PSS、最终资源或发布成功。

2026-09-29已加入公开prepared-suite与失败报告，详见[S01唯一证据](../reports/2026-09-29-semantic-ready-s01-baseline.md)。
candidate-ready并不认证semantic-ready；50条已有cache hits与未缓存/编辑慢请求分桶，
缺桶/样本/就绪保持BLOCKED。harness实现不使本ADR的发布技术提案自动Accepted，
也不关闭原内存/新500ms门禁。

## 2026-11-01 measurement portability evidence — local verified, full CI pending

The [recursive IDE review, round 4](../reports/2026-11-01-recursive-ide-review.md)
identified a pre-existing Linux sampler assumption during aggregate validation:
a missing procfs children file was treated as a missing process even when the
process remained live, preventing the first measurement sample. Original test
failures and the affected scripts' equality with HEAD are preserved. A separate
worktree now verifies a bounded fallback with PID identity and mount visibility
proofs: 46 probe/boundary, 29 prepared and one façade check, explicit exit 0.
Closing review's hidden-child gap and its corrective RED/GREEN remain recorded.
The frozen patch is now integrated after the original aggregate failed; its
focused results do not qualify the original failing aggregate or combined inputs. No aggregate GREEN or
resource acceptance is claimed. This implements evidence integrity/portability,
not a new product policy or approval status.

The same round separately confirms a baseline-reproduced navigation test ordering
assumption. Existing Main.ets-first fixture control restores deterministic initial
preparation; baseline and candidate each pass 3/3 with the original zero-read,
capacity and recovery assertions intact. This test-only patch is integrated and
covered by the final focused pass below; fresh full CI is still pending. It is
not a product performance improvement.

A separate oversized-readiness test also depended on an unstated enumeration
order: baseline and candidate safely degraded without generation/capabilities,
but reached a different no-anchor reason. Existing Main-first setup makes the
intended anchored branch deterministic (focused 1/1 on each; candidate full file
16/16). Original assertions/scale/timeouts remain; this independent test-only
patch is now integrated and is not described as a readiness product defect.

The original aggregate terminated 2134/2222, 88 failures, exit 1, with all 935
frozen inputs matching. All three corrections are now integrated; a frozen
34-file combination passes 263/263, zero failed/skipped/cancelled/todo, exit 0,
341678.5413ms; typecheck/build pass and final frozen inputs match. Fresh complete
qualification belongs to the draft PR's locked-toolchain CI. No subset result
overwrites the original FAIL or constitutes 2222/2222.

## 2026-11-01 group 2 round 4 marker determinism — integration pending

The [second-group report](../reports/2026-11-01-recursive-ide-review-batch2.md)
records a baseline/candidate-reproduced fixture race: file existence preceded
completed marker contents. Isolated pending-file/rename publication preserves
all four public call-hierarchy assertions and timeouts; reverting only that change
is RED0/4, candidate Node20 check/build and five-file89/89 pass. The patch is not
yet integrated and closing review is active while the original full gate runs.
No production freshness contract or ADR approval status changes.

Group 2 terminal local evidence: all round4 corrections integrated, Node20
check/build and29-file376/376PASS, zero fail/skip/cancel/todo, exit0,
577502.642ms;1400/1400 frozen inputs match. Original full2260/2264FAIL is retained,
including the unexplained/non-reproduced initialization timeout. Fresh full CI
on the authorized draft PR112 update remains pending; scoped sums are not a
replacement whole-suite pass. No merge or approval-status change is implied.

## 2026-11-02 index protocol corrective evidence — scoped verified

The [authorized follow-up](../reports/2026-11-02-authorized-ide-follow-up.md)
corrects malformed successful search payloads being treated as ordinary business
errors. SidecarProtocolError now invokes existing session fail-closed behavior;
genuine busy errors remain nonfatal and explicit close/open recovery is covered.
Public-contract RED1/2→GREEN2/2, existing characterization20/20, extracted22/22,
manifest4/4, Node20typecheck and independent26/26 pass. No complete follow-up gate,
storage/recovery policy change or approval-status promotion is implied. Published
CI and the separate unfinished owner-churn slice retain their own evidence.

Final follow-up local validation: Node20check/build and ten complete files
123/123PASS, exit0, zero fail/skip/cancel/todo,56958.721ms;1403/1403 frozen inputs
match. This does not certify a complete suite or the separate OPEN/design-gated
resource optimization. Published a11 CI is still awaiting its terminal outcome;
fresh follow-up-head CI remains pending. No approval or policy change.

## 2026-11-02 01:24 UTC — published a11 CI terminal PASS

[Run41368012421](https://github.com/liuhui-code/arkts-language-server/actions/runs/41368012421)
completed SUCCESS for exact published head
`a11cdbc87b5223aae806f79d624b180df8f9d3c4`, base `b57ad075`, with validation
checkouts on merge commit `a175ae2314973689a22fb6b029ecb025b2759305`.
Complete fast2267/2267, artifact E2E7/7 and large E2E1/1 pass with zero
failures/skips/cancellations. Rust records224 passing tests plus one explicitly
executed initially ignored fixture (225 executions). Zed query tests2/2 and
four SCM query validations, WASM release, Windows install/reinstall and framed
LSP smoke pass. Raw local receipts:
`/workspace/shared/pr112-batch2-ci-evidence/validate.log` and `windows-install.log`.

This closes the published second-group CI gate, not a real editor UI/native
Windows network-share or general resource qualification. Earlier full2260/2264
and CI2233/2234 failures remain historical failures; the original startup timeout
is still unexplained/non-reproduced, not retroactively assigned a cause.
The separately authorized unpublished index follow-up has scoped123/123 PASS;
it requires fresh CI on its own future head and cannot inherit this full PASS.

## 2026-11-02 catalog-open corrective evidence — integrated, joint gates pending

The [continuous review](../reports/2026-11-02-continuous-ide-review.md) confirms
existing missing/truncated legacy data and malformed control could be silently
reinitialized, including rollback to surviving legacygen1 while namedgen2 exists.
Observed empty/rolled-back results were STALE, not falsely READY. Absent-control
bootstrap/import remains; existing control/data open without CREATE and reject
missing schema/row/empty data. Bootstrap connection handoff preserves original
WAL close behavior; its intermediate failed candidate is retained. No incremental
control-generation writes, globally immutable DB policy or automatic deletion.

Six reviewed files integrated02:05UTC with matching hashes. Final isolated Rust
workspace234PASS/0FAIL/1existingignored external455 fixture, strictClippy/release
and real release recovery smoke PASS;98/98 inputs match. Independent malformed-
control and12concurrentbootstrap probes pass. Original RED4/7 and stronger
controlRED7/9 remain. Joint integrated gates/fresh CI are pending; publishedb129
CI is separate. No status promotion, nativeWindows/UI or resource graduation.

## 2026-11-02 owner-churn corrective evidence — integrated, gates pending

The [continuous review](../reports/2026-11-02-continuous-ide-review.md) integrates
eligible dirty catalog reconciliation before the first raw query capture, plus
cached immutable canonical-root/catalog stamp and a post-refresh/pre-compiler
update guard. Original query views, disk bytes and target scope remain; cache
absence uses the original path. No new all-source proof capsule, second LS or
proof-handoff API is introduced. Independent32/32 and ordering4/SDK19 pass;
controlled4→2 owners retains two catalog scans and is not a general speed claim.
Rejected alternatives and inconclusive baseline-prewarm controls remain recorded.
Joint Rust/Node20/41-file gate is running on1415 frozen inputs; fresh CI pending.
No existing status, source-recovery, SDK/configuration proof or resource policy
is changed. Published b129 CI SUCCESS covers only its earlier input, not this fix.

## 2026-11-02 integrated gate failure receipt

The continuous candidate's joint gate terminates exit1: Node399/401, two
timeouts, zero skipped/cancelled/todo,890904.056ms. Rust234PASS/1existingignored,
fmt/strictClippy/release and Node20check/build pass;1415/1415 frozen inputs match.
Third-restart readiness5s and the first conservative reference query30s retain
original deadlines. Paired baseline/current diagnosis is active; no root cause
or fix is inferred from progress logs, earlier independent review or stage passes.
Main edits pause until attribution. This full joint FAIL remains separate from
published b129 CI PASS and any future candidate/CI receipt; no approval change.

## 2026-11-02 diagnostic rerun and isolated fixture correction

The same41-file rerun fails exit1 with400/401 PASS, zero skip/cancel/todo;
all1415 source and captured runtime hashes match. Original two timeouts pass
this run and paired/full-file controls, but remain unexplained and unfixed.
The new scoped-request-count assertion is reproduced on baseline and candidate
by allowing a legitimate newer catalog generation; this confirms an invalid
fixture timing assumption, not stale-result production behavior. The original
failed fixture was not retained, so its exact generation is not reconstructed.

An isolated hold/release test preserves immediate watched-change/query order,
old-generation fallback/count/no-recovery and released new-generation results.
Strengthened paired6/6 and six completefiles21/21 pass; independent final review
and main integration remain pending. No production or timeout changes. See the
[continuous report](../reports/2026-11-02-continuous-ide-review.md) and its
UNITS-RESULT.md evidence receipt. Joint399/401 FAIL and rerun400/401 FAIL are
retained separately; no aggregate PASS or ADR status change follows from this
isolated correction.

### 04:11 UTC integration checkpoint

The reviewed six-file fixture correction is integrated with matching artifact
hashes. Independent final review confirms watched notification→immediate query;
activation is awaited only after the repeated response. Current manifest300/
bundle156 includes the extracted test. Final `pnpm check` plus42 complete Node
files runs on1416 frozen inputs; no terminal result or fresh complete CI yet.
No production or timeout changes; the original joint Rust234/Clippy/release/
Node20check/build passes remain scoped to their inputs. Both failed Node gates,
unexplained timeouts and unreconstructed original generation remain retained.

## 2026-11-02 04:27 UTC local verification terminal

The [continuous candidate](../reports/2026-11-02-continuous-ide-review.md) is
implemented and locally verified: final42 complete Node files401/401 PASS,
zero fail/skip/cancel/todo, `pnpm check` exit0;1416/1416 source inputs and all
production runtime hashes match. Rust234PASS/0FAIL/1 original ignored external455
fixture, fmt/strictClippy/release and Node20 build passed on the same production
input. Only the six-file generation-fixture correction followed the failed
joint gate. Independent review found no new confirmed must-fix in scope.

Fresh complete candidate CI awaits publication. Original joint399/401 FAIL and
rerun400/401 FAIL are retained; the two historical timeouts remain unexplained,
non-reproduced observations, not fixed. Lost original fixture generation is not
reconstructed. No ADR approval change, whole-suite pass, UI/native-UNC/30K/
endurance qualification or general performance claim follows from local scope.

## 2026-11-02 c462 CI correction — integrated, full gate failed

CI41389230974 on c462 fails Linux fast2281/2284; Rust235 and Windows pass,
subsequent Linux gates not reached. Earlier local401/401 omitted the existing
close/reopen navigation tests. The [continuous report](../reports/2026-11-02-continuous-ide-review.md)
preserves this coverage gap and separates a production availability regression
from a native-enumeration-order fixture assumption.

The extra post-refresh guard now applies only if early catalog reconciliation
actually ran, represented by object presence rather than its `changed` flag.
Performed `{changed:false}` remains guarded; undefined preserves prior lazy
catch-up. Original source/SDK/namespace/final authority proofs and raw target
remain. Unchanged navigation tests supply inverse2RED when the restriction is
reverted. The fixture tests mutations before/after the target's actual native
stat observation; production is not sorted. Performed-unchanged tracing supports
the intended branch, but two changed-gate variants survived and are explicitly
not mutation-kill evidence.

Reviewed three-file artifact integrated; focused50/50 and final window7/7 pass,
forced-order selected3pass/4name skips. Full frozen `pnpm check:fast` terminates2283/2286 PASS,3FAIL, zero skip/cancel/
todo,3561406.298545ms;953/953 inputs match. Original CI failures pass, but new
CLI cancellation cases return exit1/FAIL rather than NOT_CANCELLED, and incoming
package retarget returns [] rather than -32803. Causes are under investigation.
The CLI fake server does not execute this correction, but cleanup removed its
report and no causality is inferred. Semantic paired reproduction is pending.
Publication is paused; no complete success or replacement CI receipt. Evidence
`iteration-evidence/ci-catalog-recovery/README.md`, joint-fast.log and artifact
manifest are maintainer-retained local paths, not repository links.
No ADR status/approval change, weakened authority or inflated timeout.

### 07:12 UTC follow-on integrated, complete validation pending

Original incoming-test tracing establishes background diagnosis discovered and
then recovered the package change before incomingCalls returned current [].
The two-line test precondition now awaits First v1 diagnostics before retarget;
original error, watcher recovery and cold oracle remain. Corrected current and
unconditional-guard files each8/8; the latter is not b129. Added-v2 analogue is
separate from the original trace. No authority guard is relaxed.

A retained real sampler reproduction establishes late SIGINT false FAIL after
semantic PASS; original cleaned-up reports remain unattributed. Cancel/mixed
share polling-aware natural-exit grace with cooperative TERM fallback, not a
hard termination bound; strict exit status and budgets remain. Final Node20
five-file42/42 PASS, old SIGINT and fixed5s grace RED. Earlier Node24 40/42 and
Node20 41/42 remain, without reconstructed signal timing or version causality.
Actual100-edit mixed CLI is unrun; real sampler/helper and existing CLI contracts
are scoped evidence. See maintainer-local incoming-retarget-recovery/README.md
and mixed-sampler-shutdown/review.md, final-receipt.json. Manifest301/unit122/
bundle156; new complete gate pending. Prior2283/2286 FAIL is not overwritten.
No ADR status change or complete-success claim.

### 08:28 UTC instrumented canonical gate terminal failure

Canonical check:fast with external evidence instrumentation terminates2294/2295,
exit1, zero skip/cancel/todo,4118031.704339ms;986/986 frozen inputs match. Prior
confirmed failures pass; sole rename-completeness:97 explicit barrel alias id2
rename hits its original5s deadline. Cause unknown; current/b129 same-deadline
paired diagnosis subsequently completed (receipt below). No timeout relaxation
or authority change follows.

556 fixtures preserved, zero copy errors/unexpected preload observations;6071
directly observed child launches omit evidence preload, not exhaustive evidence
about grandchildren. External shim/bridge/test-parent hook are not shipped.
This instrumented gate is not labeled native/uninstrumented. Previous failures
remain; publication and complete acceptance remain blocked pending diagnosis.

### Publication-ready checkpoint after completed paired diagnosis

Node20 current/b129 each pass three selected rename runs (each1PASS/5 name
skips), then each original complete file6/6 with zero skips; unchanged5s deadline
and assertions. Baseline4961.657ms near the limit is not a load explanation or
fix. Logging ENOENT appears in successful controls on both sides without proving
timeout causality. Source inputs match main before/after and normalized runtime
comparisons match; maintainer-local rename-paired receipts retain the scope.

No new confirmed must-fix emerged. Reviewed corrections are ready for the same
draft PR and fresh complete CI, not merge or final acceptance. Rename cause
remains unknown/non-reproduced, not fixed. Instrumented2294/2295 FAIL and all
prior failures remain separate from selected/file passes; no summed full-pass
claim. Published b129 remains the last complete green. ADR status unchanged.

## 2026-11-03: standing455-file cold-target waiver

The maintainer explicitly excluded the455-file cold catalog3-second target from
the required integration criteria, while retaining indexing and every other
correctness/integrity check. That existing user authorization supersedes this
one timing criterion; it does not promote this or any other ADR status.

CI41496045454 on f49809f stopped at3.02023698s before Node; that failure remains
recorded. The canonical driver now scopes a test-only explicit policy to the
extracted pinned-fixture command. It records actual duration, target and waiver
instead of claiming a strict timing pass. Manual direct cargo calls remain
strict by default; an unknown policy fails. All pinned data/query assertions and
all other release gates, including the legacy100K cost contract, remain required.
No product timeout, memory threshold, indexing function or cold-build optimization
is changed to meet this excluded target.

[TDD and preserved measurements](../tdd/2026-11-03-pr112-cold-target-waiver.md)
include driver/policy RED→GREEN and a real Mac fixture:3954.833488ms against3000ms,
explicitly waived, with all other fixture assertions passing. Scoped tests do
not qualify the full new head. Complete CI after this change must be reported
with its authorized waiver, not as an unmodified all-gates pass; earlier failures,
unexplained timeouts and open real UI/UNC/30K/endurance limits remain separate.
