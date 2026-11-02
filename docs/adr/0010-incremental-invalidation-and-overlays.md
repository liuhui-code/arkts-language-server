# ADR 0010：普通编辑的增量维护与权威覆盖

日期：2026-09-29。状态：**Proposed；S07 验证后按范围采用**。

## Context

现有根级完整答案缓存失效是安全基线。每次普通编辑全工程重建会违反就绪后目标，但缩小失效域需要依赖和新鲜度证据。

## Proposed decision

- 先按真实 module/target 语义单元保守失效；只有 compiler 依赖事实足够才缩为文件级。
- 编辑文件的新事实整体遮蔽旧事实，不能 union 新旧位置让已删除引用复活。
- 公开签名、推断导出类型、全局声明、包或 SDK 变化向受影响依赖扩展；缺证据就扩大，不能假定函数体编辑总是局部。
- 请求捕获当前 overlay 快照。操作中变化返回 ContentModified 或在新快照重算，不能发布混代结果。
- 复用现有 open/change/close、磁盘无文件 overlay、物理别名、嵌套 root、合并、取消和 revision fences；overlay 高于磁盘。
- 普通编辑可显示 updating，但即时查询的全部等待仍计入 500 ms；不能重置整个 SLO 会话。

## Gate and rollback

新增、删除和移动引用，别名改写、公开签名、配置变化、close → reopen、路径别名及并发取消都须精确差分。只看查询文件版本会漏掉其他文件的新引用；未知依赖不能当成无依赖。

普通编辑即时查询须在冻结 profile 上独立验证 P95 ≤500 ms。出现陈旧结果则退回更粗失效并记录时延未达标；全根重建可保留为安全回退，不能当作已达标主路径。不得为提速关闭跨文件诊断。

## Relations

R-13 的保守增量变为 Must，进一步细粒度优化仍为 Should。此提案衔接 [ADR 0004](0004-reference-result-cache-validity.md)、[0006](0006-semantic-request-scheduling.md) 和 [0009](0009-semantic-generation-and-publication.md)，不重建第二套文档权威或取消机制。

边界见[设计契约](../plans/semantic-ready/design-contracts.md)；门禁见[验收协议](../benchmarks/semantic-ready-acceptance.md)；顺序见[执行计划](../plans/2026-09-29-semantic-ready-execution-plan.md)。

## 2026-11-01 corrective evidence — local verified, full CI pending

A settled diagnostic for source A after a dependency B change is being checked
against the existing conservative cross-file invalidation contract. The intended
correction restores current publication without suppressing diagnostics or
introducing a new compiler owner.

See the [recursive review receipt](../reports/2026-11-01-recursive-ide-review.md).
Three actual-compiler RED cases were followed by a frozen focused 12/12 PASS,
including five new cases. Partial parallel round 2 corrected cross-workspace
debounce starvation and false error logs for expected invalidation: focused
15/15 and typecheck pass; genuine error logging remains covered. Full qualification
remains open; round 3 independent review found no additional confirmed must-fix
issue in the frozen diff. Conservative workspace open-document re-diagnosis
cost remains performance-unqualified. Original RED logs and separate
round 1/2 source/hash snapshots are retained.
This addendum does not change the decision status, historical verification
counts or remaining acceptance limits.

Final integrated local validation passes 263/263 across 34 complete files,
including all 19 previously failing files; typecheck/build pass and frozen inputs
match. Original full 2134/2222 FAIL is preserved; fresh full locked-toolchain CI
remains pending on the authorized draft PR. No approval status is changed.

## 2026-11-01 group 2 workspace-symbol corrective evidence — IN_PROGRESS

The [second-group review](../reports/2026-11-01-recursive-ide-review-batch2.md)
confirms that version-only per-overlay checks missed same-version close/reopen
and mutations across asynchronous workspace-symbol providers. Final complete
overlay membership and exact snapshot identity now fence combined publication;
obsolete searches return -32801, cancellation retains -32800 precedence, and
other errors remain -32603. Exact-parent public RED4/9 becomes focusedGREEN30/30.
Scripted provider timing runs through real framed stdio, not real-compiler/UI
qualification. Final combined gates remain pending. This corrects the existing
capture/overlay contract; ADR0009 and this ADR retain their approval statuses.

Group 2's final combined local gate is376/376 across29 complete files, exit0,
Node20check/buildPASS,1400/1400 inputs matching. This closes local scoped
implementation/review only; original full2260/2264FAIL and fresh complete PR CI
remain separate. The workspace-symbol fixture is not real SDK/UI certification.
