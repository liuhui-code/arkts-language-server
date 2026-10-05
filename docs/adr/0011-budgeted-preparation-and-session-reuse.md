# ADR 0011：统一预算下的首次准备、热会话与回收

日期：2026-09-29。状态：**Proposed；S05 相容磁盘 LS 候选 REJECTED／默认 off；不覆盖现行 ADR 0003**。
下文的 `S05 IN_PROGRESS` 是对应检查点当时的历史状态，以末尾的
2026-10-05 安全决策为当前结论。

## Context

首次准备可慢，资源仍须有界。现有 per-batch transient verifier 是安全基线。R-09 已实现且默认关闭；固定 Settings A/B 的 enabled 查询均在 L3 驱逐后 miss，仍使用 24 batches，没有真实构建节省或毕业证据。

## Proposed decision

- 初始准备、增量维护和查询使用现有 worker/supervisor/coordinator。复用滞回、leases 和取消机制，只添加实际准入所需信息，不建通用缓存管理框架。
- 全局重任务默认并发一；交互 LS 与全局 verifier 可能同时存在，必须累计预算。并发一不意味着只有一个 Program。
- S05 在 S01 后独立分辨 Worker shell、SDK/registry 和兼容 LS/snapshot 复用的收益及驻留成本。仅经自身 gate 证明的范围获准保留。
- 内容兼容时评估增量更新；SDK/options/project 边界变化仍重建。没有新鲜度证据不能删除 reset；DocumentRegistry 只在兼容运行域共享，不声称跨 isolate 共享 JS 对象。
- 所有准备 CPU、初始/增量峰值、保留状态和回收理由纳入同一资源报表。超预算时取消或暂停后台任务、释放未 leased 的冷上下文，或终止 verifier；不能手工删 compiler AST/Type/Symbol 节点。

## Gate and rollback

与当前基线交替测量精确结果、时延、峰值、post-eviction 和 100 次操作趋势。保留 [ADR 0003](0003-reference-verifier-worker-lifecycle.md) 的峰值 RSS ≤1.10 × per-batch、post-eviction 和有效时延收益门禁，且仍须满足最终产品内存门禁。

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

继续使用 [ADR 0002](0002-hot-semantic-context-lifecycle.md) 已实现的 default-off retention、L3 hysteresis 和 R-09 准入；[R-09 TDD](../tdd/references-resident-fast-path.md) 与 [Settings 报告](../reports/2026-09-29-settings-resident-fast-path.md) 保留实现与失败毕业的区别。R-10 已有有界 anchor memo 不等于复用 Program；R-11 shell reuse 仍是次级实验。只有未来不同候选通过自身门禁及评审，才可显式讨论对 ADR 0003 的 supersession 范围；本次否决不产生该范围。

边界见[设计契约](../plans/semantic-ready/design-contracts.md)；门禁见[验收协议](../benchmarks/semantic-ready-acceptance.md)；依赖见[执行计划](../plans/2026-09-29-semantic-ready-execution-plan.md)。
