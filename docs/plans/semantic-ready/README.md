# Semantic-ready：就绪后 500 ms 文档入口

初始日期：2026-09-29。初始整合基线：`911ae43c274175614559b63f0311504747d8393d`。
2026-10-06 路线更新：本目录保留原产品契约与历史设计输入；当前实施主线改为
[L01–L08 预算约束长驻语义会话计划](../2026-10-06-budgeted-resident-semantic-plan.md)，
决策见 [ADR 0014](../../adr/0014-budgeted-long-lived-semantic-session.md)。

用户授权本轮补充治理文档。**文档整合不代表技术提案已毕业、生产代码已实现，
也不是创建 GitHub Issue、提交、推送或合并的授权。**

## 当前主线与历史路线

当前：固定真实 Settings/API24 基线 → L01 长驻 LS 可证伪实验 → L02 增量
新鲜度 → L03 预算与回收 → L04–L07 逐能力接线及 exact fallback → L08 发布评审。
中间阶段的 500 ms 未达标必须如实记录，但不自动阻止后续安全实验；
生产准入仍要求正确性、资源及分桶时延全部通过。

原先的 compiler facts → SQLite 投影路线是历史研究：S02 v1–v6 未通过，
S03 BLOCKED；S05 相容磁盘 LS 复用候选已 REJECTED。不得把它们改标为
新路线的成功证据，也不得未经新决策继续接生产 schema。

| 文档 | 唯一职责 |
| --- | --- |
| [产品契约](product-contract.md) | 首次豁免、正常工作负载、语义就绪与 500 ms |
| [当前执行计划](../2026-10-06-budgeted-resident-semantic-plan.md) | L01–L08 顺序、安全与产品门禁 |
| [历史 S-series 计划](../2026-09-29-semantic-ready-execution-plan.md) | 保留 S00–S12 原始证据与停止线 |
| [Feature Ledger](../references-feature-ledger.md) | 当前优先级、状态与历史证据 |
| [MoSCoW](../references-moscow.md) | 取舍与停止条件；不重复管理阶段状态 |
| [ADR 索引](../../adr/README.md) | 当前与历史决策的状态及关系 |
| [历史设计合同](design-contracts.md) | S02/S03 投影模型的未实施研究记录 |
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

当前进行的是 L01；现有 `--prepared-suite` 真实 LSP 回放可复用，但其
`READINESS_UNSUPPORTED` 是真实门禁，候选索引 ready 不等于语义就绪。
