# Semantic-ready：就绪后 500 ms 目标 / 550 ms 验收文档入口

初始日期：2026-09-29。初始整合基线：`911ae43c274175614559b63f0311504747d8393d`。
2026-10-06 路线更新：本目录保留原产品契约与历史设计输入；当前实施主线改为
[L01–L08 预算约束长驻语义会话计划](../2026-10-06-budgeted-resident-semantic-plan.md)，
决策见 [ADR 0014](../../adr/0014-budgeted-long-lived-semantic-session.md)。

2026-10-10 用户明确确认“550”：L08正式完整响应P95≤550ms，500ms保留
为优化目标，其它验收门槛不变。当前实测与剩余项见
[L08报告](../../reports/2026-10-10-resident-l08-semantic-readiness.md)，历史
500ms失败不重标；各阶段旧统计不代表当前构建或产品毕业。

用户授权本轮补充治理文档。**文档整合不代表技术提案已毕业、生产代码已实现，
也不是创建 GitHub Issue、提交、推送或合并的授权。**

## 当前主线与历史路线

当前：固定真实 Settings/API24 基线 → L01 长驻 LS 可证伪实验 → L02 增量
新鲜度 → L03 预算与回收 → L04–L07 逐能力接线及 exact fallback → L08 发布评审。
2026-10-08 用户确认：最终产品验证统一放在 L08，不用最终目标阻塞
L01–L07。前序阶段逐切片验证功能、完整结果、快照、取消和执行保护；
时延、内存、整体 ready、长期 soak 和跨平台未达标如实带入后续阶段。
L02/L03 可使用 L01 已有基线继续实验；默认推广与发布等待 L08 全套验收。
2026-10-09 [L03 完成审计](../../reports/2026-10-09-resident-l03-completion-audit.md)
A～E PASS，阶段实施与校准 DONE；实验默认关闭，最终指标仍在 L08。
同日 [L04 完成审计](../../reports/2026-10-09-resident-l04-completion-audit.md)
A～E PASS，references 接线与校准 DONE；当前完整 check:fast 1449/1449
及终态身份复核通过，R-09 仍默认关闭。
同日 [L05 完成审计](../../reports/2026-10-09-resident-l05-completion-audit.md)
A～E PASS，独立implementation接线与校准DONE；当前完整check:fast
1467/1467及终态源码/产物/测试/工具和工程/SDK等身份一致，实验默认关闭。
2026-10-10 [L06完成审计](../../reports/2026-10-10-resident-l06-completion-audit.md)
A～E PASS，交互接线/校准DONE；19公开case、联合252、真实62及全新
完整1492/1492，终态身份一致。按用户授权继续L07，最终产品门禁仍在L08。

[L07当前审计](../../reports/2026-10-10-resident-l07-completion-audit.md)A–E
直接证据通过：25生产公开case、当前62完整真实请求及最新诊断一致，
实际lazy晋升/未查Program复用有OFF重建反事实。冻结完整1511/1511、
根退出0及终态身份一致，L07阶段DONE；原失败、慢准备/重建/恢复和
高RSS如实保留，默认不推广。

原先的 compiler facts → SQLite 投影路线是历史研究：S02 v1–v6 未通过，
S03 BLOCKED；S05 相容磁盘 LS 复用候选已 REJECTED。不得把它们改标为
新路线的成功证据，也不得未经新决策继续接生产 schema。

| 文档 | 唯一职责 |
| --- | --- |
| [产品契约](product-contract.md) | 首次豁免、正常工作负载、语义就绪、500 ms目标与550 ms验收 |
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

L01 历史基线保留；L02 同内容晋升实验已实现、默认关闭，阶段 IN_PROGRESS。
L03 [回收请求等待](../../tdd/l03-recycle-request-wait.md) 后已实现默认关闭的
[自然 L3 自动回收](../../tdd/l03-automatic-pressure-recycle.md)，组合 86/86 PASS；
[真实自然压力对照](../../reports/2026-10-08-resident-l03-natural-worker-recycle.md)
88/88 exact；单 timing 峰值下降、编辑长尾变慢，最终门禁未关闭。
前序证据见 [L02 报告](../../reports/2026-10-08-resident-l02-same-content-promotion.md)。
后续 [失效与编辑控制](../../reports/2026-10-08-resident-l02-invalidation-and-edit.md)
已修复 target 首次空定位并取得七类独立公开合同；真实编辑 exact，但没有
晋升机制的可归因提速。L02 固定源码独立 `check:fast` 1338/1338 PASS、退出 0；
当前 L03 固定实现独立 `check:fast` 1439/1439 PASS、退出 0，终态源码/
构建、测试与输入身份一致，不沿用 L02 的旧 whole。[当前政策校准](../../reports/2026-10-09-resident-l03-budget-policy-calibration.md)
选定配置/对照 26/26 exact、诊断一致；保留 1024 MiB 与原滞回，不纳入
自动 Worker 替换，不宣称最终资源收益。L04 [公开组合合同](../../tdd/l04-promoted-resident-reference-contracts.md)
及 [历史八轮 Settings 两种声明策略控制](../../reports/2026-10-08-resident-l04-route-control.md)
已推进，16/16 real exact，但 trace ON 都 miss，不能宣称热收益。
后续准入 trace 定位 level1 下 4096 条配置见证触顶；缺失祖先共享的
公开组合 43/43 PASS，但新的真实 2/2 exact 回放仍触顶并完整 fallback，
原因与下一证明压缩切片见同一 L04 TDD，不把它重标为真实复用成功。
随后直接加载目录的证明共享经真实 RED/GREEN，该检查点串行组合 48/48 PASS；
新构建两种 declaration policy 的独立 Settings 回放各 2/2 exact、
9/10 refs 实际 resident hit、零 batch、诊断 PASS，容量拒绝消失。
该构建完整响应为 1.31/1.21 s，没有整体 ready、P95 或内存毕业。
当前 [选定预算政策的公开组合](../../tdd/l04-budget-policy-reference-contracts.md)
10/10 PASS，完整回归 1449/1449、终态源码/构建、冻结测试与输入一致；
[同构建真实对照](../../reports/2026-10-09-resident-l04-budget-policy-integration.md)
两种声明策略的 ON/OFF、独立 trace/timing 八进程共 52 项 exact，四对
完整集合/最新诊断一致，两份 ON trace 首次新符号均实际 resident hit。
新引用 timing 915/937 ms，准备与冷恢复更慢、峰值更高；阶段 L04 DONE
不等于最终资源、时延或 semantic-ready 毕业，raw ready FAIL 保留给 L08。
L05 [选定政策独立implementations合同](../../tdd/l05-budget-policy-implementation-contracts.md)
23项及联合132/132通过，补齐执行中取消、SDK/package/配置/未知输入、
多根/close-reopen和trace OFF。四进程[当前真实对照](../../reports/2026-10-09-resident-l05-budget-policy-integration.md)
22/22 exact、两对最新诊断一致，R-09 OFF仍有独立完整Program复用；
同内容晋升保持38个脚本generation。完整whole和终态审计齐备，L05 DONE；
未查628/677ms、约13s恢复和峰值风险留给L08，不宣称最终收益。
L06历史起点[交互公开合同](../../tdd/l06-resident-interactive-contracts.md)
与相关回归 57/57 PASS，包含完整导航/hover/signature、completion/resolve、
同名 auto-import、snippet、API 编辑、回收和 refs 进行时交互；不新建 owner。
[历史固定构建Settings控制](../../reports/2026-10-08-resident-l06-interactive-control.md)
8/8 exact，13 个同内容晋升实际避免一次重建；单 timing 新 definition
686→165 ms，原 v1 2307/2339 诊断保留，不能宣称整体 ready/P95/内存达标。
[L07 rename/call hierarchy 合同](../../tdd/l07-resident-edit-and-call-contracts.md)
已推进完整编辑及应用、alias 分层、双向调用点、未打开 follow-up 与
编辑/回收/取消，修复本地 alias 冲突及诊断丢失，当前 focused 88/88、
并行 72/72 PASS。这些是功能回归，不重用旧构建的 Settings 性能结论；
该段88/72为历史起点；当前真实工程/预算组合及冻结完整E见上方审计。
全部冲突/方言/平台矩阵仍在L08。L03–L07阶段DONE，L02仍IN_PROGRESS；
L06当前19公开case/252联合/62真实及whole1492见上方完成审计；旧timeout原因、其它能力的真实
admission 和 L08 产品门禁仍开放，不提前毕业。
现有 `--prepared-suite` 真实 LSP 回放可复用；`READINESS_UNSUPPORTED`
如实记录并在后续实现/L08 验证，候选索引 ready 不等于语义就绪。
