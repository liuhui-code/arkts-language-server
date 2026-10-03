# ADR 0012：按能力查询路由、调度与安全回退

日期：2026-09-29。状态：**Proposed；逐能力通过门禁后启用**。

## Context

已有完整结果缓存与 references 调度可复用；新符号 miss 仍慢。不同 LSP 能力的语义不能用一套未验证 symbol lookup 代替。

## Proposed decision

- 在现有 proxy/adapter 中路由完整答案缓存 → 有效语义投影或热 LS → exact fallback，不建第二公共语义层。
- references/implementations 仅消费 S02 对各自 query-kind 证明的投影；completion/hover/signature 优先评估热 LS。rename 额外验证合法性、冲突和编辑集合，不能把引用位置直接当可重命名编辑。
- 复用现有 interactive/global lanes、合并、取消和 revision fences。背景准备只能在实际调度点让出；异步包装同步 compiler 不是抢占。
- 不支持、失效或缺输入时保守回退，返回完整结果或显式错误；不能返回空数组伪装 complete。慢回退全部计入 SLO。
- 只有第二个实际能力出现相同输入/生命周期逻辑时才抽共用代码；投影语义和门禁按能力独立。

## Gate and rollback

真实 LSP 中 references 进行时 definition/hover 仍能结束，编辑使旧结果失效。新符号、新模块、普通编辑及驱逐/重启恢复各桶独立测 P95，不能用缓存命中稀释。rename 应用后的代码与完整 oracle 编辑集等价；调用层级方向和范围单独比较。

错误或尾延迟失控只回滚对应能力快路径。保留现有可工作的能力和公共响应语义；只有其公共 transcript GREEN 才广告新能力。前后台任务共享内存预算。

## Relations

[ADR 0001](0001-reference-search-default.md) 的 `indexed-batched + closure + full SDK`、[0002](0002-hot-semantic-context-lifecycle.md) 的 `dispose` 和 [0003](0003-reference-verifier-worker-lifecycle.md) 的 transient 默认保持。新路由通过逐能力和产品 gate 后才显式 supersede 对应默认条款。继续复用 [0004](0004-reference-result-cache-validity.md) 的 cache/coalescing、[0005](0005-index-proof-trust-boundary.md) 的索引恢复与 compiler 权威，以及 [0006](0006-semantic-request-scheduling.md) 的现有 lanes。

范围见[产品契约](../plans/semantic-ready/product-contract.md)；边界见[设计契约](../plans/semantic-ready/design-contracts.md)；门禁见[验收协议](../benchmarks/semantic-ready-acceptance.md)。
