# ADR 0009：语义 generation、身份与原子发布

日期：2026-09-29。状态：**Proposed；S02 等价验证是生产事实/schema 的前提**。

## Context

跨请求或重启复用语义事实必须证明源文件、配置、SDK 和 overlay 来自同一有效输入。现有 candidate generation 的 `ready` 不等于 semantic validity。

## Proposed decision

- 复用 ProjectGraph、DocumentAuthority 的修订和快照，以及现有 SQLite owner；S02 通过后才设计最小 semantic generation 元数据和存储，不建第二数据库或解析 owner。
- 输入身份绑定 root、product/target、backend、SDK/stdlib、options、graph、membership、source 及投影版本；准备和变更时维护内容身份，不能仅用 mtime/size，也不能把每次全工程哈希放回查询路径。
- 按 staging → validated → committed 原子发布。查询固定单一有效 generation，或经验证的增量覆盖，不能读取半写入或混代结果。
- 按能力记录 coverage 和 unsupported reasons；未分类输入阻止该能力 complete。持久 symbol key 和构造函数/方法/别名关系须使用 S02 证明的规则。
- 相对 URI 只在已验证 root 映射下重定位；保留大小写、UTF-16 及嵌套 root 失效域。Overlay 是独立权威覆盖，不持久化为磁盘真值。

## Gate and failure policy

发布任一点崩溃或取消时，旧 generation 只能在仍有效时查询，否则明确失效；新半成品永远不可见。重启、路径移动、大小写、同 mtime 内容变化、SDK 切换和损坏数据库均需负例。

身份、版本或发布校验失败时降为不可用并安全重建。不能给旧词法 schema 加一个 semantic 标记来伪造来源，也不能导入未经验证的相容 schema。

## Relations

[ADR 0004](0004-reference-result-cache-validity.md) 的保守根级失效保持，直到 [ADR 0010](0010-incremental-invalidation-and-overlays.md) 的更小范围经证明。沿用 [ADR 0005](0005-index-proof-trust-boundary.md) 的原子 generation/索引恢复边界；R-14 持久化和 R-22 readiness 必须消费同一有效性记录。

边界见[设计契约](../plans/semantic-ready/design-contracts.md)；门禁见[验收协议](../benchmarks/semantic-ready-acceptance.md)；依赖见[执行计划](../plans/2026-09-29-semantic-ready-execution-plan.md)。
