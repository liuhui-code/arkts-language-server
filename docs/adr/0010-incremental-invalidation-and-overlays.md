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
