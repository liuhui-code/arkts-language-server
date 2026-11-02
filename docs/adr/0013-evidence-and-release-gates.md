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
