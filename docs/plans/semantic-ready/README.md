# Semantic-ready：就绪后 500 ms 文档入口

日期：2026-09-29。整合基线：`911ae43c274175614559b63f0311504747d8393d`
及其当前未提交工作树；没有回退、覆盖或重新合并源码。

用户授权本轮补充治理文档。**文档整合不代表技术提案已毕业、生产代码已实现，
也不是创建 GitHub Issue、提交、推送或合并的授权。**

## 唯一当前主线

固定真实基线 → 验证 compiler 批量语义事实 → 同库原子发布 → 有界首次准备
→ 就绪后查询 → 普通编辑增量 → 逐能力验收 → 发布评审。

热 LS/snapshot 复用是独立实验支线：S01 → S05。S02 失败时仍可验证这条支线，
但不得跳过内存和精确性门禁。

| 文档 | 唯一职责 |
| --- | --- |
| [产品契约](product-contract.md) | 首次豁免、正常工作负载、语义就绪与 500 ms |
| [当前执行计划](../2026-09-29-semantic-ready-execution-plan.md) | S00–S12 顺序、Issue 草案、阶段退出条件 |
| [Feature Ledger](../references-feature-ledger.md) | R-01–R-29 的当前优先级、状态与证据 |
| [MoSCoW](../references-moscow.md) | 取舍与停止条件；不重复管理阶段状态 |
| [ADR 索引](../../adr/README.md) | 保留 0001–0006，新增 0007–0013 的关系与提案状态 |
| [设计合同](design-contracts.md) | owner、输入身份、发布、overlay、路由与复用边界 |
| [验收规范](../../benchmarks/semantic-ready-acceptance.md) | 正确性、就绪、时延、资源与跨平台门禁 |
| [本轮整合记录](../../reports/2026-09-29-semantic-ready-plan-integration.md) | 文档检查与保护范围；不是产品测试报告 |

来源：用户提供的 `ArkTS-Semantic-Ready-500ms-Plan.zip`，完整 SHA-256 记录在整合报告。
没有将离线包整目录覆盖仓库，也没有复制包中的第二份 Ledger、MoSCoW、运行时配置或校验工具。
Markdown 是本次唯一治理正文；未引入并行的机器阶段状态表。

## 与已有实现的关系

- KEEP：compiler、DocumentAuthority、ProjectGraph、单一 SQLite owner、完整结果 cache、
  coalescing、references lanes、index recovery 和 L3 hysteresis。
- R-09 已实现且默认关闭，Settings 准入未毕业；新计划验证复用收益，不再次实现同一个入口。
- R-07 已消费 empty/literal-root 证据，但一般 constructor 范围仍未证明；不把词法事实当最终答案。
- `indexed-batched + closure + full SDK`、`dispose`、transient per-batch verifier 及原预算保持不变。
- S02 不等价：阻断生产 facts/schema 路线，保留反例和正确 fallback；不添加第二 checker。
- 原 >3 GB 复现、最终 50% 内存、DevEco/PSS 等任务继续独立开放。

下一可实施阶段是 S01。`--prepared-suite`、新的事实/复用控制仍是拟议接口，当前未实现。
