# ADR 0011：统一预算下的首次准备、热会话与回收

日期：2026-09-29。2026-10-06 状态：**预算/压力政策 Proposed；S05 相容磁盘 LS 候选 REJECTED／默认 off；不覆盖现行 ADR 0003**。
本 ADR 拥有统一预算、压力、滞回和驱逐政策，不授予任何具体 LS
生命周期生产准入。不同机制的长驻 LS 实验由
[ADR 0014](0014-budgeted-long-lived-semantic-session.md) 管理，其 L01
不以 S05 的 `ARKTS_SEMANTIC_SESSION_REUSE=experimental` 作为成功基线。
下文的 `S05 IN_PROGRESS` 是对应检查点当时的历史状态，以末尾的
2026-10-05 安全决策为当前结论。

2026-10-08 推进规则更新：L03 使用 L01/L02 实测证据实现预算与回收，
不要求进入 L03 前先通过最终资源指标。L01–L07 保留切片正确性、取消
与可停止/清理的执行保护；最终内存、时延、长期 soak 和 PSS/DevEco
统一在 L08 验收。下文 S05 的失败、否决及默认关闭结论保留为历史证据。

2026-10-09 [L03 完成审计](../reports/2026-10-09-resident-l03-completion-audit.md)
A～E PASS：预算、准入、成本感知回收和恢复实施及校准完成，完整
check:fast 1439/1439 PASS，终态身份一致。本 ADR 仍 Proposed，实验
默认关闭；阶段完成不覆盖 ADR 0003 或 S05 否决，不授予生产准入。

## Context

首次准备可慢，资源仍须有界。现有 per-batch transient verifier 是安全基线。R-09 已实现且默认关闭；固定 Settings A/B 的 enabled 查询均在 L3 驱逐后 miss，仍使用 24 batches，没有真实构建节省或毕业证据。

## 预算政策提案（L03 前须由 L01/L02 实测校准）

- 初始准备、增量维护和查询使用现有 worker/supervisor/coordinator。复用滞回、leases 和取消机制，只添加实际准入所需信息，不建通用缓存管理框架。
- 全局重任务默认并发一；交互 LS 与全局 verifier 可能同时存在，必须累计预算。并发一不意味着只有一个 Program。
- S05 在 S01 后独立分辨 Worker shell、SDK/registry 和兼容 LS/snapshot 复用的收益及驻留成本。仅经自身 gate 证明的范围获准保留。
- 内容兼容时评估增量更新；SDK/options/project 边界变化仍重建。没有新鲜度证据不能删除 reset；DocumentRegistry 只在兼容运行域共享，不声称跨 isolate 共享 JS 对象。
- 所有准备 CPU、初始/增量峰值、保留状态和回收理由纳入同一资源报表。超预算时取消或暂停后台任务、释放未 leased 的冷上下文，或终止 verifier；不能手工删 compiler AST/Type/Symbol 节点。

L03 只有在 L01 的 steady/peak 和 L02 的编辑资源曲线已得到以后，
才能选择 soft budget、pressure target 和成本感知驱逐。不能为实验
绕过 S05 的 1.600× 失败或盲目提高 1024 MiB 策略预算。

## Gate and rollback

与当前基线交替测量精确结果、时延、峰值、post-eviction 和 100 次操作趋势。保留 [ADR 0003](0003-reference-verifier-worker-lifecycle.md) 的峰值 RSS ≤1.10 × per-batch、post-eviction 和有效时延收益门禁，且仍须满足最终产品内存门禁。
这些产品阈值在 L08 最终判定；前序实验的回归记录为待解问题，
使用预声明停止线保护运行，不因尚未达到最终阈值冻结后续实现。

保留增长、峰值回归或配置错配即恢复 transient 默认。永久保留所有 LS、提高预算/heap 或强制 GC 不能替代工作集方案。单个正确闭包过大时只可研究真实边界或可信构建产物，不能虚构文件数量硬上限。

## S05 observation checkpoint — implementation, not acceptance

[唯一S05报告](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md)记录
默认关闭的Coordinator生命周期/原因日志与公开LSP回归。contextSequence只标识
该Coordinator生命周期内的context/LS实例，不标识Program、共享AST或跨isolate复用。
普通未保存comment沿用LS；磁盘content revision、SDK切换、L3以及references
dispose有独立原因。日志关闭后exact结果不变；不为观测主动构造Program。

固定Settings/API24预热轨trace-off的definition48ms、references4,647ms；
trace-on显示热context被`reference-dispose`移除，再支付transient verifier准备成本。
这是各1次的观测对照，不证明保留完整interactive Program在预算内安全，
不证明复用能达到500ms，也不改变ADR0003、dispose默认或本ADR的Proposed状态。
后续相容disk delta实验须先证明revision/delta对所有context的交付完整性，
不得直接删contentRevision guard或把既有overlay增量行为冒称新优化。

## S05 compatible-disk prototype — default off

`ARKTS_SEMANTIC_SESSION_REUSE=off|experimental`已在现有reference runtime集中解析，
默认off；仅实验地放行相容磁盘delta后的local LS复用，不改references dispose、
per-batch transient Worker、SDK full、并发或1024MiB策略预算。
DocumentAuthority产生一次性revision span；所有changed路径必须是同一lexical root
中已知、既有、无overlay的ordinary change。consumer还必须证明owner/reset epoch相同、
span起点等于该LS已应用revision、终点等于当前revision、没有removed/reset/overflow，
并且每条changed文本实际交付在本次非overlay documents内。
其它context已消费delta、scope外/未知/未交付文本、create/delete、project/SDK变化
均保守重建；不能拿“最新非空delta”补证中间丢失的revision。
未知in-root source删除也推进原contentRevision，不仅清一次性span：
先删后改、单独删除或删除已被prepare消费后再改，均不得复活相容凭证。

Compiler host版本包含已有resident source SHA256与每文件磁盘revision，
防止script移除重插或不同LS的局部counter重置碰撞；不新增文件读取、AST cache、
fallback-version策略或第二文本真值。公开RED分别出现了disk注释后的错误range、
未交付triple-slash声明的旧行号，以及alias重建后旧overlay诊断offset。
这些反例及GREEN保留在同一S05报告/TDD。局部LS sequence复用不保证Program不重建；
更不能证明完整references coverage、worker reuse或semantic readiness。

100次真实fixture磁盘编辑和人工expected UTF-16位置是正确性证据，
不是100次真实Settings混合操作的资源趋势。trace-off Settings无编辑对照只能作
回归控制，不能证明disk-reuse收益。本ADR继续Proposed，S05继续IN_PROGRESS；
原whole-fast timeout当时未归因，随机资源/时延/PSS毕业门禁仍开放。

回滚边界：off+新进程关闭相容delta复用，但source版本复合键、未知source删除的
durable revision fence与bookkeeping抽取在off下同样执行，不是旧构建的byte-identical回滚。
同build off/experimental只比较准入，不证明这些共同改动无时延/RSS影响；
若共同改动回归，须恢复经过验证的旧产物/单独变更，而非仅关开关。

## S05 real Settings edit checkpoint — still proposed

The [single S05 report](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md)
now records a frozen API24 Settings watched-disk edit in a private exact checkout.
An open usage at UTF-16 40:37 resolves to the unopened declaration at 16:13 before,
17:13 after a one-line disk comment; both arms return the same nine complete references
(including the shifted in-file occurrence) and normal v1 TS2339 diagnostics.
Three fresh trace-off processes per arm passed. Experimental local-LS reuse has a
post-edit definition median of 281 ms versus 1,811 ms off. References remain about
6.6 seconds in both arms after `workspace-changed` safe index fallback; sampled Node RSS
peak medians are 796,004,352 versus 795,774,976 bytes (experimental/off), effectively
unchanged at this sample size. `contextSequence` continuity is not proof of Program reuse.
The initial trace-on harness diagnostic wait-order FAIL is preserved; corrected controls
wait for existing v1 diagnostics before the edit and pass without suppressing them.

This supports the narrow compatible-disk local-LS admission hypothesis for one real edit,
not full-reference coverage, randomized 100-operation retention, PSS/post-eviction,
500 ms P95 or any release memory gate. Default remains off, ADR 0003 and per-batch
transient verifiers remain authoritative, and this ADR remains Proposed.
After a runner-only safety patch to reject output under the original Settings/SDK
and unavailable source status, the fresh current-worktree full `check:fast` passes
**1,181/1,181** (exit0, zero fail/cancel/skip/todo). The prior 1,177/1,177 PASS
predated that patch; a sandboxed macOS `ps`-denied attempt was stopped/exit1 and
is not valid code regression evidence. The earlier 1,160/1,161 timeout remains
historical and unexplained. This clears only the current-source regression gate,
not this ADR's resource or product graduation gates.
One post-patch real Settings experimental smoke passes exact definitions, nine
references, normal v1 diagnostics and exit0; it is not a paired/P95 measurement.

## S05 100-operation Settings pressure checkpoint — no graduation

The same [S05 report](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md)
now includes a pinned API24 Settings, trace-off, one-process-per-arm comparison:
100 watched disk edits with immediate exact definitions, 11 complete nine-location
references, 11 exact cross-module definitions, normal versioned diagnostics,
and Level3 acknowledgement at operation 50 followed by exact recovery at 51.
Both arms complete correctly. Yet sampled Node peak RSS is 2,146,119,680 bytes
with experimental reuse versus 1,341,296,640 bytes off: **1.600×**, failing
the retained ≤1.10 resource gate. Post-edit primary definition median is
311.815 versus 261.549 ms; references median 6,698.945 versus 6,007.669 ms.
The experiment does not demonstrate a latency gain on this mixed workload.
This is one fixed-order A/B, not randomized multi-session P95, PSS or a cause
analysis of compiler retention. The earlier single-edit benefit remains a
narrow observation, not grounds to relax the gate. Keep default off, S05
IN_PROGRESS, this ADR Proposed, and ADR 0003/per-batch transient verifier intact.
An experimental-only repeat with identical pinned inputs is exact yet peaks at
1,796,046,848 Node RSS bytes; no second paired off run exists, so no randomized
paired effect or cause is inferred from either observation.
An independent trace-on/reuse-off Settings control cancels at
`references.queue.start`: explicit LSP id 2 receives `-32800` without a result,
then fresh exact references/definition and normal diagnostics recover. This is
not proof of cancellation inside a verifier batch or the experimental arm.
A separate reuse-off control cancels after `references.batch.start` and before
completion, also returning only `-32800` before exact recovery; it does not
qualify cancellation for every batch or the experimental arm.

## 2026-10-03 real re-export attribution — no decision change

The [Settings/API24 re-export report](../reports/2026-10-03-settings-reexport-anchor-seed.md)
adds a declaration-inclusive exact seed-on/off pair and a separately pinned
single phase-trace run. The accepted default-off discovery seed removes a
standalone anchor, but the trace still measures 1.139 s in document preparation
and 2.991 s in the final transient verifier batch (2.208 s `createProgram`,
49 ms compiler reference query; 674 SourceFiles). This distinguishes paid
setup from the cheap final query, not a proof that retaining this Program
passes the 100-operation ≤1.10 RSS gate above. No preload shortcut, permanent
verifier residency or default switch follows from this one sample. The ADR
remains Proposed; S05 remains IN_PROGRESS.

The next pinned Settings/API24 six-phase trace narrows the cold preparation
cost: project membership takes 987–1,010 ms, workspace preload only 21–54 ms.
After an unsaved comment edit, membership falls to about 0.05 ms, while the
transient verifier still spends 2.157 s in `createProgram` and the complete
reference request takes 3.094 s. Thus removing workspace preload is not the
primary route to the 500 ms goal for this cursor. This does not repeal the
earlier 1.600× resource failure for session reuse or authorize an unbounded
hot Program. ADR status and per-batch default remain unchanged.

The subsequent [current-build S05 paired replay](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md)
keeps the same real Settings/API24 oracle and runs two reversed-order 100-operation
trace-off pairs. All four arms are exact, but experimental local-LS reuse has
post-edit definition P95 1.657/1.608 s versus off 0.278/0.272 s. Peak Node RSS
ratios vary in direction (1.079×/0.929×), so neither an RSS benefit nor a
current-build leak is established. Same-build trace-on associates the slow
definitions with `engine.define` and Level3 context churn; it does not identify
the retained compiler object. This candidate fails the latency gate, remains
default-off, and gives no reason to change the 1024 MiB budget or transient
verifier policy. The ADR remains Proposed.

## 2026-10-05 S05 negative safety decision

The S05 experiment is decision-complete for the **compatible-disk local-LS
reuse candidate**, not accepted as a production capability. The two reversed-
order, trace-off, 100-operation Settings/API24 pairs preserve exact results but
show experimental post-edit definition P95 of 1.657/1.608 s against
0.278/0.272 s with reuse off. An earlier fixed-order pair exceeded the
≤1.10 peak Node RSS admission gate at 1.600×; later ratios vary, so this is
not a stable memory-effect estimate or a PSS result. The single trace-on
SourceFile reuse observation is narrower and does not reverse the trace-off
failure.

Keep `ARKTS_SEMANTIC_SESSION_REUSE=off` by default and retain the existing
complete semantic fallback, L3/budget policy and per-batch transient verifier.
The prototype and observability are implemented; **budgeted hot-session
production reuse is NOT IMPLEMENTED or graduated**, and neither the 500 ms
contract nor the original >3 GB/50% and PSS/post-eviction memory gates pass.
This decision does not supersede ADR 0003. Any different reuse mechanism
requires a new public RED and independent correctness, freshness,
cancellation and resource gates; it must not relabel this rejected candidate.
S02 remains FAIL and S03 remains BLOCKED.

## Relations

2026-10-08 [L03 references 压力准入](../tdd/l03-reference-pressure-admission.md)
在公开 RED/GREEN 后，将既有默认关闭的 L3 单批实验停止线统一传入
legacy、batched 与 indexed 路由。多批显式拒绝、单批及关闭路径完整
结果和最新诊断/导航恢复在 50/50 focused 中通过；生产默认不变。
这不是按字节成本准入或统一 soft budget 完成，也不是新的项目文件数
限制。新源码 whole NOT_RUN，前轮 1380/1380 只属于多根回收检查点。

2026-10-08 [L03 成本感知容量驱逐](../tdd/l03-cost-aware-capacity-eviction.md)
在公开 RED/GREEN 后，增加默认关闭的 benchmark/cost 双开关；既有
两个 context 容量满时，仅在所有无 lease 候选有正成本且有差异时，
按最近观测的 grouped compiler 准备耗时优先驱逐低成本对象，LRU
打破并列。缺测、同成本、单候选和关闭路径保留原 LRU；不提高
1024 MiB 策略，不让成本豁免 L3，也不单独开启 L2 rearm。
成本仅是当前实例成功查询的耗时样本，不是字节预算、独占 CPU 或
下次冷恢复保证；不新增缓存 owner。三根最新 overlay/完整引用与
lease/旧实例边界在该检查点 67/67 focused 中通过，源码 whole NOT_RUN。
统一 resident/transient 字节核算和真实工程对照继续，产品默认和
S05 否决保留；最终资源、时延、soak 与平台结论在 L08。

2026-10-08 [L03 全部文档关闭后的压力回收](../tdd/l03-closed-document-pressure-recycle.md)
以公开 RED/GREEN 将非空文档资格限定到手动入口。自动入口有已注册
roots 且通过原实际 L3/静默/零 context/lease 见证时，可在空文档
状态替换；仍先终止旧 Worker，再恢复 root 注册，不重放已关闭文本。
在途引用、关闭后的 ContentModified、两根相同版本号的新 overlay、
正常诊断和两个关闭路径在该检查点 126/126 focused 中通过，whole NOT_RUN。
没有新增开关或提高预算，不代表统一字节预算或资源收益已经取得。

2026-10-08 [L03 在途压力与 verifier 准入](../tdd/l03-midflight-reference-admission.md)
在公开 RED/GREEN 后，将已有默认关闭的压力开关延伸到执行期间。
请求内遇到 L3 后保留正见证，禁止追加 verifier，并与扩展/递归
fallback 共享资格；已启动验证仍可清理，完整范围已证明时仍可成功。
取消检查先于预算拒绝；否则未完成范围显式 `-32803`，不返回部分
位置或写入部分成功缓存。新请求重新判断，不永久冻结后续查询。
两路在途控制、关闭路径、取消与单批完成在该检查点 103/103 focused
中通过，whole NOT_RUN。此为执行保护，不是硬 RSS 上限或统一字节
预算毕业；1024 MiB、现行 RSS/滞回 owner 和生产默认不变，最终验收仍在 L08。

2026-10-08 [L03 准入前 RSS 刷新](../tdd/l03-reference-pressure-sampling.md)
以公开 RED/GREEN 连接实际进程 RSS 与 references 准入：入口在
document preparation 之后刷新，后续 verifier 资格检查也刷新同一个
runtime policy/滞回 owner。沿用原默认关闭双开关，不新增阈值或按批数
换算字节，不相加 Worker RSS；请求内 L3 见证、取消优先、完整单批
许可及正常诊断保留。三路、tracing 关闭和两个关闭路径在该检查点
120/120 focused 中通过，whole NOT_RUN。此为采样与执行保护衔接，
不是独占 Program 字节核算、硬峰值上限或真实工程内存收益；统一
字节成本和 soft budget 校准继续，最终资源目标仍在 L08。

2026-10-08 [L03 transient Worker 核算](../tdd/l03-transient-worker-occupancy.md)
通过四个逐项公开 RED/GREEN 补齐 reference、anchor、诊断 verifier 的
物理存活计数与快照时钟。沿用已有指标文件 opt-in，真实 `exit` 才
释放；保留单 semantic owner 字段，另外记录 owner 加 transient 数。
RSS 按 Node PID 只计一次，heap/Coordinator 状态仍限定 owner isolate；
计数不是 Program 数或独占字节。边界快照不更新压力、不构造 Program，
取消恢复与普通诊断在该检查点 153/153 focused 中通过，whole NOT_RUN。
没有新预算、调度或默认路由；真实工程校准和统一字节成本继续，
不把计数归零写成 RSS 回落或资源收益，最终资源验收仍在 L08。

2026-10-09 [真实 Settings 生命周期校准](../reports/2026-10-09-resident-l03-transient-occupancy.md)
在同源码下比较 dispose 与 budget-aware，两轮 8/8 exact、正常诊断一致。
保留 context 与 transient verifier 重叠后被自然 L3 驱逐；移除 context
且 verifier 退出时仍有较高 Node RSS，二者不是即时字节归还见证。
R-09 固定关闭，各次引用均重建 verifier Program；峰值近似的单次
trace-on 对照不证明资源收益，也不否定尚未参与本控制的 resident 复用。
预算继续按全进程 RSS 一次计量，结合实际重叠与已观测准备成本校准；
不得相加同一 PID 的 Worker RSS 或按 context/文件数虚构成本。产品源码
未变，重放器 24/24 PASS；该检查点 whole NOT_RUN，最终判定仍在 L08。

2026-10-09 [高压力 anchor 准入](../tdd/l03-anchor-pressure-admission.md)
在真实 LSP RED/GREEN 后，把原压力双开关延伸到独立候选发现准备。
取消优先，刷新同一全进程 RSS/滞回政策；L3 不另启 compiler anchor，
但必须交回完整 scope 验证，而不是空结果或未经证明的 index 范围。
单批完整、多批显式错误、关闭/低压力、取消恢复与正常最新诊断通过，
该检查点十五文件 focused 160/160 PASS，whole NOT_RUN。已有便宜且已验证
的 resident/memo 资格保留；没有新增预算、协议或默认推广。回退成本
与真实工程收益仍需实测，不由 Worker 数量推算字节，最终验收仍在 L08。

2026-10-09 [按实际 RSS 与准备成本回收](../tdd/l03-cost-aware-pressure-recovery.md)
把既有默认关闭成本政策用于 L3 冷驱逐。每处置一个无 lease context
就通过原全进程 RSS/滞回重新判断目标，持续 L3 不因高成本而豁免；
未知/并列成本仍用 LRU。Worker 资格须在静默时复核当前压力，已回落
则拒绝替换；没有成功资格的事务不提前清引用缓存，显式压力控制的
原清缓存合同不变。三组公开 RED/GREEN 与当前六文件联合控制
20/20 PASS；该联合控制检查点尚未执行 whole，后续校准及完整回归见下。
1024 MiB 与原 92%/85% 阈值不变，功能通过不代表资源收益。

2026-10-09 [统一政策的真实 Settings 校准](../reports/2026-10-09-resident-l03-budget-policy-calibration.md)
在当前同构建上完成选定配置/对照 26/26 exact、最新诊断配对一致，
覆盖首次、稳态、编辑、冷定位及驱逐后全局恢复。1024 MiB 与原滞回
保留；自动替换候选没有显示峰值收益，稳态重复约 4.9 s，故不纳入
本序列选定配置，但机制和历史证据仍保留为独立实验。trace-off 选定
峰值 +0.77%，不宣布资源降低；已处置上下文与物理退出后的 RSS 仍
分别核算，恢复工序不同的样本不冒称构建提速。当前完整 check:fast
1439/1439 PASS、退出 0、无 skip/todo/cancel，终态后源码/构建、测试
及工程/SDK 身份一致；[完成审计](../reports/2026-10-09-resident-l03-completion-audit.md)
A～E 通过，L03 阶段实施与校准完成。六份 raw report 的 readiness
仍为 FAIL / READINESS_UNSUPPORTED，最终内存、时延及产品验收留在 L08。

继续使用 [ADR 0002](0002-hot-semantic-context-lifecycle.md) 已实现的 default-off retention、L3 hysteresis 和 R-09 准入；[R-09 TDD](../tdd/references-resident-fast-path.md) 与 [Settings 报告](../reports/2026-09-29-settings-resident-fast-path.md) 保留实现与失败毕业的区别。R-10 已有有界 anchor memo 不等于复用 Program；R-11 shell reuse 仍是次级实验。ADR 0014 拥有新 LS 生命周期，当前 ADR 只负责其资源政策；只有未来不同候选通过自身门禁及评审，才可显式讨论对 ADR 0003 的 supersession 范围；S05 否决不产生该范围。

边界见[设计契约](../plans/semantic-ready/design-contracts.md)；门禁见[验收协议](../benchmarks/semantic-ready-acceptance.md)；依赖见[执行计划](../plans/2026-09-29-semantic-ready-execution-plan.md)。
