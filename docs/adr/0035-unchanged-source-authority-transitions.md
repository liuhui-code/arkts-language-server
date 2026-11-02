# ADR0035：同输入源码权威切换与编译版本

- 日期：2026-10-31。
- 状态：**Proposed；已授权候选实现并验证fast2152/2152及Mac30K三轮；未记录独立评审或Accepted。追加既有恢复缺口OPEN。**
- 父提交：`04282ed34ebab7cd01726bb0291af53bd278ff00`；基于未提交ADR0037候选，
  server `604cbd724df7c38e9e9514682f3eeaa446f66eaa79cdb286cdf8562e917a2304`。
- [已有测量](../reports/2026-10-31-navigation-work-reuse.md)、[TDD](../tdd/2026-10-31-unchanged-navigation-inputs.md)。

## 证据和假设

30K候选关闭重开中位1200.191ms，createProgram计时区间1021–1040ms。
该文件overlay和磁盘文本SHA完全一致；SDK284个SourceFile继续复用，不是SDK全部重解析。
公开stdio反例Program序号1→2，原LS仍在，无context退役。
`updateProjectContent`对已交付的同字节changed source也删除驻留脚本，
推进单文件/Host内容版本；后续准备再建同一快照。删除/重建也会经过推断根移除/准入，
但本轮未独立测量根顺序变化，不把它作为这1秒的已确认组成。
原updateScript已有同sourceContent只更新文档元数据的分支；本次避免前面的delta移除绕过它，
并使内容时钟也遵循有效输入变化。不是新增跨请求有效性缓存。
DocumentStore删closure、未知解析域变化为另外两个假设，单独观察，不将全部区间归给它们。

## 历史ADR审计

| 历史决策 | 本决策的关系 |
| --- | --- |
| [0010 Proposed decision](0010-incremental-invalidation-and-overlays.md#proposed-decision) | overlay高于磁盘、变更撤销旧请求资格；关闭仍解除overlay，未保存内容不能继续冒充磁盘 |
| [0019 决定5/7及输入所有权约束](0019-stable-programs-and-request-inputs.md#决定) | 采用已有事件消费、组版本、单文件版本分离；不将消费revision等同于Host必须变化 |
| [0025 M004/M005](0025-namespace-proof-domain-recovery.md#m005overlay返回已准入磁盘快照) | 保留实际bounded byte read协调自身源码事实；不删除旧负向/SDK/config证明，不重盖缓存命中戳 |
| [0022 生命周期表](0022-completion-resolution-lifecycle.md) / [0032 决定A/C](0032-completion-item-identity-and-inferred-roots.md#决定a逻辑身份与失效范围分开) | Program复用不复活旧请求、旧补全句柄或同数字版本的旧文档生命周期 |
| [0032 决定B](0032-completion-item-identity-and-inferred-roots.md#决定b推断入口与源码缓存分别拥有生命周期) | 不固定Host版本、不暗改根列表；真实入口/成员/生成文本变化仍更新，resident实际移除仍移除对应推断根 |
| [0037 决定C/D](0037-navigation-work-and-input-validation.md#c-一个同步导航操作交接证明原租约内完成最终核验) | 每请求当前输入及租约内独立最终核验不变；mutation/global屏障、取消、公平与恢复预算不变 |
| [0029](0029-opt-in-rss-memory-budget.md) | 不恢复默认RSS预算、不增加永久缓存/Program所有者；正常trim/dispose保持 |

这是上述语义分层的实现补充，不撤销历史决定；历史RED和验收收据保持。
500ms按ADR0007的最新体验口径；旧ADR中的逐次硬门槛保留为历史。

## 决定

1. 权威文档事件始终沿既有mutation及Freshness路径消费。
   关闭、同版本重开、编辑仍撤销旧公开请求与派生句柄；DocumentStore不保留已关闭overlay权威。
2. 只对已交付、当前owner已有驻留记录的源码考虑同输入复用：
   原source文本逐字相同，当前文件仍是查询入口或明确合法稳定根。
   正常prepare仍更新documentVersion/overlay等权威元数据；不额外复制或永久拥有AST。
   无交付、未知输入、移除、配置/解析owner变更、真实字节/根集合变化沿既有保守更新。
   这是同owner已有resident record的保留，不是ADR0032的disk→resident首次promotion；
   缺少promotion证明的新record仍走原版本更新。同配置下原source文本不变才保留其生成文本和快照。
   membership/semantic roots更新及updateScript的真实entry admission仍执行，不能用同文本隐藏根集合变化。
3. `receivedRevision`和owner applied revision照常前进；确认无编译输入变化的文件不推进其compiler版本，
   无关文件/未来依赖的真实版本更新仍保留。Host版本只在实际文本/根/配置输入变化时前进。
   不只凭文档版本、SHA或mtime推定路径/配置有效；原准备、源码authority协调、独立终检继续执行。
4. 不改变结果缓存合同、扩大20K完整范围、延长截止时间、并发使用checker或创建替代Worker。
   引用缓存大范围失效TODO及Zed客户端ADR0033不在本次实施范围。

## 参考和适配边界

Context7 `resolve-library-id(TypeScript)`本轮HTTP传输失败；以下为官方源码与本机实际安装包回退，未伪称查询成功。
[TypeScript4.9.5 synchronizeHostData](https://github.com/microsoft/TypeScript/blob/v4.9.5/src/services/services.ts#L1251)
通过Host project version判断同步需求；[Language Service API](https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API)
将脚本版本/快照与增量服务输入关联。
实际编译器ohos-typescript4.9.5-r10仍以安装源码核验；不依赖新版内部API、不改编译器或伪造常量版本。
借鉴的是输入变更驱动编译版本，LSP关闭/打开生命周期和Harmony权威/物理边界仍由本项目证明。

## 备选和拒绝

- 每次关闭都退役Program：安全回退保留，但同输入可复用场景不作为优化路径。
- 关闭不失效、保留旧overlay/详情：破坏磁盘权威与请求生命周期，拒绝。
- 仅比较同内容就跳过路径/config/最终核验：不能覆盖同字节换inode、父路径retarget和未通知依赖变化，拒绝。
- 给所有changed source停止推进版本：未来依赖或未交付输入会消费旧Registry事实，拒绝。
- 为此次加长期结果缓存/TTL或新内存门槛：无必要，不采用。

## 验证与回滚

先公开stdio RED，再最小GREEN；覆盖同内容关闭/重开、关闭后磁盘查询、真实编辑/撤销、
未保存overlay与不同磁盘内容、依赖/配置变化、旧请求/详情、路径别名及未通知变更、异常后恢复。
大项目原64请求及生命周期锚点三轮串行前后比，正常计时与插桩分别记录，精确结果对照。
最终完整check:fast，保留455冷目录3秒独立门槛授权跳过及Windows/UI限制。
若缺乏同输入证据则走原更新；本次可独立回滚编译delta过滤，不回滚ADR0037其他优化。

## 实施收据与尚存边界

最终check:fast2152/2152，0失败/取消/跳过/todo，exit0；801输入和82运行产物/标准库与性能候选一致。
同条件Mac30K三轮重开查询中位1136.739→140.757ms，最大1192.076→158.738ms；Program7→8变为7→7。
每轮69份完整响应一致，原完整范围错误仍是错误；64独立请求的多秒排队未改善。
7份关联历史ADR逐字未改，审计及完整证据见[实施报告](../reports/2026-10-31-unchanged-navigation-inputs.md)。
Windows连接超时，无真实UI或长时验收；455独立门槛按授权不执行。

追加小夹具NAV-INPUT-001：无通知创建动态import类型依赖后，旧/新候选均连续-32803，
显式Created通知后都恢复；这是ADR0025缺事件恢复要求仍有实现缺口的证据，具体所有者待定位。
不改其恢复合同，不把保护性拒绝写成可用性通过，也不以此次同输入优化宣称覆盖该输入变化场景。

2026-10-31后继：[ADR0036](0036-compiler-source-namespace-recovery.md)已定位私有源码 namespace proof
未接入恢复入口，实施来源区分与保留 SDK/配置合同的候选；其最终检查独立记录，以上历史收据不改写。

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
