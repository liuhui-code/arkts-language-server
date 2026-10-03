# ADR 0008：由 compiler 批量生成语义事实

日期：2026-09-29。状态：**Proposed；S02 可证伪验证后再决定生产采用**。

S02 checkpoint：`public-checker-binding-projection-v1` **FAIL**；普通导出/alias
切片exact，但constructor keyword的两种declaration policy漏2/3个位置。
提取Program退出后的facts-only新进程不能据此成为生产答案；S03阻断。
见[唯一实验报告](../reports/2026-09-29-semantic-ready-s02-facts-spike.md)。
这否决所测binding投影假说，不证明所有compiler派生hook/投影均不可行；
重新研究需独立假说及本反例合同，S05仍可独立推进。

## Context

完整结果缓存只加速同一查询。未查询过的符号若要复用准备成本，需要有效的语义投影；现有词法候选索引不能直接成为完整语义答案。

## Proposed decision

- 将 R-14 的提取可行性验证提升为 Must，而不是直接批准生产 schema 或重构。
- 在固定 `ohos-typescript` 后端内批量提取 compiler 派生事实，复用其绑定和搜索规则，记录所用后端源码/API 的依据。
- 使用一个完整正确上下文，或经等价验证的真实 project/module 边界。任意文件数分组不能证明完整语义。
- compiler 决定事实；Rust/SQLite 只存储和检索已验证投影。references、definition、implementation 等 query-kind 分别验证，不能共用未经证明的万能 symbol lookup。
- 持久 key 必须是 compiler 派生、带作用域和版本的同代稳定身份；不承诺跨任意源码编辑永久稳定，不持久化 `ts.Symbol` 对象或内存 ID。未知覆盖不能推断无引用。

## Rejected shortcuts

逐符号全工程 `findReferences` 预计算只允许作为测试 oracle，不能成为产品准备算法。对 identifier 调用 `getSymbolAtLocation` 后存位置不足以复现构造函数、别名和继承查询；在 Rust 补完类型推断或继承规则会形成第二个 TypeChecker。基准符号名或路径不得成为生产特例。

## Gate and stop condition

S02 差分覆盖构造函数、`new this`、`super`、别名重导出、继承成员、同名、overlay、SDK/配置变化及真实 Settings oracle。清空完整答案缓存并释放验证 Program 后，未查询符号仍须精确；同时报告提取总 CPU、时间及峰值内存。

任一必测语义不能等价即 S02 FAIL，阻止依赖事实的生产 schema、发布和路由。保留反例，再评估受控 LS 复用或上游 hook；不能用词法补丁制造完整证明。S05 在 S01 后可独立继续，不被这项提取失败阻断。

## Relations

延续 [ADR 0005](0005-index-proof-trust-boundary.md) 的 compiler 权威；复用有效 compiler 事实不等于词法索引作答案。[ADR 0004](0004-reference-result-cache-validity.md) 的有界完整答案缓存继续独立使用。

边界见[设计契约](../plans/semantic-ready/design-contracts.md)；门禁见[验收协议](../benchmarks/semantic-ready-acceptance.md)；依赖见[执行计划](../plans/2026-09-29-semantic-ready-execution-plan.md)。
