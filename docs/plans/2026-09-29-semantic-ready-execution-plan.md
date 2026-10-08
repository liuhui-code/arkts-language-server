# ArkTS semantic-ready / 500 ms 接续执行计划

> **2026-10-06 路线更新：本页保留 S-series 的历史实施与失败证据，
> 不再是活跃阶段顺序。** 唯一活跃实施计划是
> [预算约束长驻 LS L01–L08](2026-10-06-budgeted-resident-semantic-plan.md)，
> 对应 [ADR 0014](../adr/0014-budgeted-long-lived-semantic-session.md)。
> L01 [首轮 Settings/API24 实验](../reports/2026-10-06-resident-l01-baseline.md)
> 对同文件未查符号得到 286/1,025/267 ms，42/42 exact；500 ms 稳定性
> 未达标、资源未毕业。生产仍走 `indexed-batched + closure + full SDK`、`dispose`、
> transient per-batch verifier。S02 v1–v6 为 FAIL/暂停研究，未经
> 新决策不做 v7；S03 facts 发布 BLOCKED；S05 compatible-disk 候选
> DECISION_COMPLETE/REJECTED，不能重标为 L01 成功。

初始整合日期：2026-09-29；当时 HEAD/附件基线为
`911ae43c274175614559b63f0311504747d8393d`。这是历史基线，不要求回退。
2026-10-03 本轮开始时 HEAD 为 `c4df943e5ff9dc1d724bb2aee75d7c4a197efcf4`，
分支为 `codex/s05-definition-compiler-trace`，已有未提交改动须保留；
后续每个实施切片仍以实际 `git rev-parse HEAD` 和 `git status` 记录身份。

**独立 S05 的相容磁盘 LS 候选评估已收口：REJECTED；默认关闭的原型与观测已实现，
但热会话生产能力未实现、未毕业。** 100 次 Settings 混合回放功能 exact，
实验臂早期资源门禁及当前构建时延门禁均 FAIL。
S02 的public-checker binding与resolved-signature两项投影假说均FAIL；隔离的第三项
compiler hook 在两个窄切片 exact，但内部仍逐构造器查询，判为NON_BULK。
第四项[共享 worklist 实验](../reports/2026-10-04-semantic-ready-s02-shared-worklist-spike.md)
在三个窄切片 exact 且消除逐目标全文件扫描，但 `public constructor` 的
declaration-policy 仍有一个缺失位置；Settings/SDK/其它种类及资源未过，S03仍阻断。
第五项[定义来源 worklist 实验](../reports/2026-10-04-semantic-ready-s02-origin-worklist-spike.md)
修复上述窄切片的声明过滤，并在更多构造器 fixture 上 exact；
`new Base`／`new Derived` usage-site 仍明确不支持，真实 Settings/SDK 与规模
门禁未测。S02 FAIL、S03 BLOCKED、生产默认路径不变。
第六项[usage-site 来源 worklist 实验](../reports/2026-10-04-semantic-ready-s02-usage-origin-worklist-spike.md)
使直接 `new Base`／`new Derived` 的两种 declaration policy 与 stock 精确，
其中继承调用需要两个 definition origin；含别名变量 `new Alias()` 的
call-shapes fixture 在提取时 `HOOK_UNSUPPORTED`、exit42，非构造查询与规模门禁未通过。
S02 FAIL、S03 BLOCKED；生产默认路径不变。
后续[原路径磁盘输入切片](../reports/2026-10-04-semantic-ready-s02-disk-oracle-slice.md)
只让旧 stock CLI oracle 读取被摘要锁定的原路径文件；该简化 Host 仍无 SDK/Harmony
解析，明确 `HOST_PARITY_NOT_MET`，并未在真实 Settings 上通过 S02 门禁。
新增[生产宿主 stock-oracle 对照](../reports/2026-10-04-semantic-ready-s02-production-host-oracle.md)
在真实 Settings/API24 默认工程选择下复用生产 DocumentStore、resolver 和 LS，
对 HomeInitData 两种声明策略与现有 LSP oracle 分别 9/9、10/10 精确；
MenuController 构造调用 `90:17`、排除声明的独立 stock 查询也与已核验
LSP golden 267/267 exact。隔离 v6 hook 现已消费同一生产 Host／pin 输入，
小 fixture 的构造事实精确，但真实 Settings 1,496 成员提取以
`FAIL/HOOK_UNSUPPORTED`、exit42 停止且无 facts；constructor hook parity／
规模门禁仍未通过，S02 FAIL、S03 BLOCKED。
后续失败诊断确定首个障碍是标准库 `new Array()` 的工程外 origin；保守降级
在本地构造器＋`Array` 小 fixture 上保住了本地 exact、外部 `UNSUPPORTED`，
但同一真实 Settings 输入继续在 `ADJUSTED_BRANCH` 失败且无 facts；
未将局部 `PARTIAL` 实验视为 S02 门禁通过。
后续真实 Settings 诊断发现该 `ADJUSTED_BRANCH` 发生时，已声明的本地
`file:` 依赖别名因目标包名不相等被 resolver 错误拒绝：`DialogPage`
import 报 TS2307，原 stock 仅同文件 2／3 位置，不能作为 hook 的正确性
oracle。真实 stdio LSP 先 RED 后 GREEN 的局部修复保留安装包名称及路径
边界，修正后同一 Settings/API24 stock 查询得跨模块 30／31 位置；隔离
hook 已用同一输入重跑且仍失败，产品 LSP 两种声明策略均完成精确差分。见
[生产宿主报告](../reports/2026-10-04-semantic-ready-s02-production-host-oracle.md)。
这只修复语义宿主，**不**使 S02 PASS 或放行 S03；旧 `ADJUSTED_BRANCH`
失败是错误解析宿主下的观测，不再作为独立反例使用。修正后隔离 hook
仍以同一原因码 exit42、无 facts。默认关闭的脱敏失败定位现已补齐并
用相同输入重放：首个失败是 `MenuCustomComponent.ets` 中的
`new CustomUiInfo`，compiler definition 指向同文件 import binding，
**不是** `DialogPage`。真实 LSP 随后对该文件四处 `@ohos/mpchart`
subpath import 报 TS2307：固定 checkout 声明版本依赖 3.0.15，但没有安装
任何 `oh_modules`。此处是依赖不完整环境，不应写成 hook 已解析语义反例。
已在同 SHA 独立 checkout 用 `ohpm install --all` 安装确切版本；真实 LSP
四条 mpchart TS2307 消失，`CustomUiInfo` definition 指向安装包源码。
原 production v2 pin 对 `oh_modules` 显式 exit2 拒绝，防止未固定依赖
进入完整 oracle；30／31 stock 的完整 facts 差分仍未执行到完成。
其后公开 CLI RED→GREEN 已加入显式 installed v3 pin：默认 v2 拒绝保持，
v3 锁定 registry lock、安装字节／链接拓扑及声明本地包目标树，并在 stock
查询前后校验。真实安装后 Settings/API24 pin 成功，生产宿主 stock 的
`DialogPage` 两组结果与现有 URI＋UTF-16 oracle 为 30／31 exact。公开 CLI
RED→GREEN 已为实际进入 Program 且与 v3 pin 字节一致的安装包源码建立
独立实验 semantic scope：query selection 仍仅工程成员，search/origin 可含
受控依赖；两种声明策略在小 fixture 与 stock 精确一致。游离同名包不能
借用 lock 行。完整安装后 Settings v6 提取约 15 秒仍在
`TouchpadPointerSpeedComponent.ets` `ADJUSTED_BRANCH` exit42、无 facts；
其相对 controller 导入在固定 commit 中缺失，真实 LSP 报 TS2307，
不是独立的已解析语义反例。
**S02 仍 FAIL、S03 仍 BLOCKED**；不能把 ProjectMembership 改成递归扫安装目录。
安装后 `new CustomUiInfo` 的公开 references 探索请求包含／排除声明均
明确返回 `-32803`，未给出部分 Location；现有 trace 只记录第 0 批开始，
原先无法证明具体 batch 失败谓词。公开 LSP RED→GREEN 补充默认关闭的
`references.batch.incomplete` 事件后，新进程回放确定第 0/24 批为
`source-unavailable`，仍不能证明缺的是哪个源文件。下一步先定位 source
identity 再决定 package source admission；不把此错误直接归因于索引
degraded 或 mpchart 路径。
真实 Settings/API24 生产 LSP 冷引用差分对 `DialogPage` 排除／包含声明
分别取得 legacy／默认各 30／31 个逐位置精确结果，目标 TS2307 消失；
但默认路径均以 `candidate-ineligible` 回退完整保守批处理，单次时延
分别为 93,298／94,639 ms，对照 legacy 为 8,037／9,317 ms，峰值
产品树 RSS 分别约 789／799 MB（legacy 827／832 MB）。
这是**正确性 GREEN、时延 FAIL**，不是 indexed proof 或 500 ms 毕业；
另一次 trace-on 冷回放仍为 30/30 exact、95,401.63 ms；`candidate-ineligible`
后对 1,496 个工程文件顺序执行 24 批，Program ready 累计 81.7 秒，
引用查询累计 2.1 秒。当前时延主要来自重复 compiler 准备，而非单批
搜索本身；trace 的各嵌套计时不得简单相加。
原因已定位为显式 constructor 关键字不在 class export 索引 span 内，
候选无 declaration identity；显式构造器＋别名的公开 LSP 控制已固定
完整 fallback 与 exact 位置，继承／`new this` 边界和 compiler-proven
映射仍待验证，禁止按名称绕过 proof。
S01 harness和真实candidate-ready对照已实现，但两个suite仍READINESS_UNSUPPORTED/FAIL；
新增真实未保存引用编辑及公开 API 类型编辑对照精确通过，完整桶验收仍有缺口，
不能重标毕业。
独立S02可证伪实验未批准S03生产改造；
后续独立 S05 已推进观测与相容磁盘复用切片：该具体候选的安全决策
`DECISION_COMPLETE / REJECTED`，实验默认 off、真实资源/时延毕业未完成；
仅 trace-on 的真实 Settings SourceFile 身份对照已采样，不推翻两对
100 操作 trace-off 失败。历史检查点中的 `IN_PROGRESS` 为当时状态。
S04、S06–S12在该 S-series 顺序中仍NOT_STARTED；现由 L-series 接续。
ADR 0008 研究暂停、0009/S03 依赖阻断、0010–0013 仍为未毕业提案；
新 ADR 0014 仅接受实验实施。Issue 为本地草案，未创建、未修改 GitHub #85。
S00 检查状态见 [整合报告](../reports/2026-09-29-semantic-ready-plan-integration.md)。
S01 当前唯一证据见 [基线报告](../reports/2026-09-29-semantic-ready-s01-baseline.md)。
S02 的v1反例见[事实投影反例报告](../reports/2026-09-29-semantic-ready-s02-facts-spike.md)，
v2窄切片见[resolved-signature报告](../reports/2026-10-03-semantic-ready-s02-resolved-signature-spike.md)，
v3隔离产物与负面成本结论见[compiler hook报告](../reports/2026-10-03-semantic-ready-s02-compiler-bulk-hook-spike.md)。
S05 当前唯一证据见 [context 生命周期观测报告](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md)。
继续指定阶段不自动授权下一阶段生产修改、提交、push、PR 或合并。

2026-10-03 实施顺序修订：用户要求先完成各阶段可行的计划实现，再集中逼近
就绪后 P95 ≤500 ms。阶段实施与产品毕业分别记状态；单独的 500 ms FAIL
不阻止下一实施切片，但必须保存原始样本并列为 S12b 未关闭项。
这不放宽精确性、结果完整性、新鲜度、取消或新路径的资源安全，
也不把不可行实验当成已实现能力。S02 v1/v2反例及v3 NON_BULK仍阻断 S03 facts 路线；
S05 相容磁盘复用候选仍默认关闭，不因调整时延顺序获得准入。
对锁定的 `ohos-typescript@4.9.5-r10` 做的只读入口审计也未找到可直接使用的
批量引用分组导出 hook；后续经用户授权仅用隔离 bundle 做了实验，
证实包装 query-scoped 内部调用并不足以通过批量事实门禁。
后续对同一锁定 bundle 的只读源码审计进一步确认：单目标 `State`、按文件搜索、
import/heritage 动态任务均各自推进；共享外层 NameTable 不能构成真实批量 producer。
具体停止线见 [S02 compiler hook 报告](../reports/2026-10-03-semantic-ready-s02-compiler-bulk-hook-spike.md)。

本页后续 S-series 顺序是历史决策，不是当前待执行队列；当前顺序见
[L01–L08](2026-10-06-budgeted-resident-semantic-plan.md)。需求由 [产品契约](semantic-ready/product-contract.md) 管理，
状态由 [Ledger](references-feature-ledger.md) 管理，取舍见 [MoSCoW](references-moscow.md)，
决策见 [ADR](../adr/README.md)，逻辑边界见 [设计合同](semantic-ready/design-contracts.md)，
门禁见 [验收规范](../benchmarks/semantic-ready-acceptance.md)。

## 接续而非覆盖

[2026-09-20 计划](2026-09-20-references-latency-execution-plan.md) 保留为既有实现/失败证据，
不是第二条活跃顺序。[bounded references 原计划](2026-09-10-bounded-references-execution-plan.md)
仍负责原 >3 GB reproducer 与最终 50% 内存等未完成门禁；新 SLO 不能关闭它们。

来源是用户提供的 `ArkTS-Semantic-Ready-500ms-Plan.zip`；不是直接覆盖离线包。
本地状态纠偏：R-09 已实现且 default-off，Settings 仍 L3 miss；R-07 empty/literal-root
已被消费但一般 constructor 范围未证明。R-04/05/06/08/12 已实现，复用而不重建。
此前 `check:fast` 1133/1133 属于已有 literal-root build，不能挪用于 S01 新工具；
本轮检查状态由 S01 报告记录。

## S-series 历史顺序、停止线与状态（非当前执行队列）

当前只实施 L01；其安全继续门禁与≤500 ms 产品门禁分开。
即使首次新符号仍超过 500 ms，只要精确性/新鲜度/取消/资源安全
通过，仍可继续 L02 增量有效性实验，并明确保留性能 FAIL；
不能据此接线、默认推广或声称产品目标达成。S02/S03/S05 的旧
依赖图如下，仅用于解释当时为何停线：

```text
S00 → S01 → S02 → S03 → S04 → S06 → S07 → S08
        └→ S05
S04 + S05 安全决策（准入或否决）+ S07 → S09a/b/c → S10a/b
S06 + S07 + S08 → S11a/b/c
S06～S11 实施及正确性/资源安全门禁通过，时延缺口已记录 → S12a 实施盘点
S12a → S12b 性能逼近与产品发布评审
```

S02 任一必需投影不等价：S03 及后续生产 facts 路线 BLOCKED，保留反例与完整 fallback。
当前已暂停 S02 v1–v6 研究；v7 必须有新独立假说及显式决策。
S05 仅依赖 S01，已独立完成相容磁盘 LS 候选的否决和安全 fallback 决策，
不再重复采样同一机制争取放行；该候选不必达到 500 ms 才能结束评估。
被否决的复用能力不得标 `IMPLEMENTED` 或被 S09 默认采用，也不 supersede ADR0003。
未来不同机制仍需独立公开 RED 与门禁；性能采样不得与其它实验并行。
S09/S10/S11 一轮一个能力/方向，不一次改所有 provider。

| Stage | 当前状态 | 功能范围 |
| --- | --- | --- |
| S00 | 文档已整合；检查见报告 | R-21、治理与当前状态纠偏 |
| S01 | IN_PROGRESS：harness/control 已实现；ready FAIL、覆盖缺口 | R-01/02/21：真实 ready 后分桶基准；不冒称产品 GREEN |
| S02 | FAIL／研究暂停：v1/v2有反例；v3 NON_BULK；v4 modifier过滤FAIL；v5多定义usage-site UNSUPPORTED；v6直接 `new` 窄切片exact、外部 origin 可在小 fixture 显式 `PARTIAL/UNSUPPORTED`，但别名变量 `new Alias()`、非构造查询与真实 Settings 同宿主提取仍失败，其它必测NOT_RUN；未经新决策不做v7 | R-07/14/25：须完整等价且可承受的compiler分组来源；不批准S03 |
| S03 | BLOCKED；须新的S02投影门禁PASS | R-08/14/22：同库版本化发布；不得接入失败假说 |
| S04 | NOT_STARTED；原 facts 前置路线不再活跃，改由 L01–L03 实验 | R-06/20/22/23：有界准备与就绪的历史范围 |
| S05 | DECISION_COMPLETE / REJECTED：观测与default-off相容disk LS原型已实现；生产复用未实现、未毕业 | R-03/09/10/11/12/24/26：受预算复用候选未获准；保留安全fallback |
| S06 | NOT_STARTED；事实路线暂停，L04 接 references | R-04/05/07/10/14：references 投影首查的历史范围 |
| S07 | NOT_STARTED；由 L02 验证普通编辑 | R-04/07/08/13/22：普通编辑增量的历史范围 |
| S08 | NOT_STARTED；由 L05 验证 implementations | R-15/25：implementations 独立投影的历史范围 |
| S09a/b/c | NOT_STARTED；由 L06 按能力验证 | R-24/26/29：定义、补全等当前文档体验的历史范围 |
| S10a/b | NOT_STARTED；由 L07 按能力验证 | R-15/27：prepareRename、rename 的历史范围 |
| S11a/b/c | NOT_STARTED；由 L07 按方向验证 | R-15/28：prepare/incoming/outgoing calls 的历史范围 |
| S12a/b | NOT_STARTED；由 L08 承接发布评审 | R-02/21/22：实施盘点、逐能力与平台/资源发布评审的历史范围 |

新状态以 [L01–L08 计划](2026-10-06-budgeted-resident-semantic-plan.md)
为准；上表不是允许跳过 L01–L03 安全门禁的待办列表。

## S-series 历史 Issue 草案与依赖（不自动创建）

父追踪单：[GitHub #85](https://github.com/liuhui-code/arkts-language-server/issues/85)。
下面 D-01–D-09 **不是 GitHub Issue 编号**。AFK 表示定义可交给 Agent 实施，
不是不经授权自动发布/合并；HITL 表示需人工确认决策。

| 草案 | 标题 | 类型 | Stage / 前置 |
| --- | --- | --- | --- |
| D-01 | 采纳 semantic-ready 契约并整合治理文档 | HITL | S00 / 无；本轮仅文档部分已整合 |
| D-02 | Settings ready 后分桶基准与精确 oracle | AFK | S01 / D-01 |
| D-03 | compiler 批量 references/implementations 事实等价性 spike | AFK | S02 / D-02 |
| D-04 | 预算内热 LS 与 snapshot 增量复用验证 | AFK | S05 / D-02（独立热复用支线） |
| D-05 | 语义事实同库原子发布与重启恢复 | AFK | S03 / D-03 PASS |
| D-06 | 有界首次准备、取消与可信 ready 信号 | AFK | S04 / D-05 |
| D-07 | 未缓存新符号 references 的投影查询 | AFK | S06 / D-06 |
| D-08 | 普通编辑增量、overlay 替换与反向失效 | AFK | S07 / D-07 |
| D-09 | implementations 独立投影与端到端验收 | AFK | S08 / D-03、D-08 |

首批拟创建 D-01–D-04；D-05–D-09 保持依赖阻塞草案。
后续定义、补全/auto-import、hover/signature、诊断回归、prepareRename/rename、调用层级三方向、
CI、默认切换和否决实验清理分别细化独立 Issue，不合成一个“所有能力 500 ms”大任务。
不得关闭或重写父单；#85 旧冷态口径与新首次准备豁免须显式记录关系。

## 全阶段工程合同

- 每轮只推进指定 stage/子切片；开始时核对实际 HEAD、AGENTS、dirty tree 和前置证据。
- 先公开接口 RED 或已有 characterization，再最小实现；RED 不得只是漏 build/SDK/路径。
  记录原命令、parent revision、exit、exact diff、时延/资源与未完成门禁。
- 复用真实 LspSession、Content-Length stdio、正常自动诊断、现有 oracle 和外部 sampler。
  stdout 只属协议；source 不写日志；trace-off 测产品，trace-on 独立归因。
- Settings 工程/依赖/边界不改，API24 授权兼容轨明确固定；匹配 SDK/DevEco 单独验收。
  不复制文件造规模，不升级后端，不改 SDK，不覆盖用户 AGENTS。
- 保留原预算、deadline、golden、结果完整性。手写 source/test/script ≤500 物理行；
  修改既有超限文件不得增长，并在 GREEN characterization 下抽取职责。
- 阶段状态与产品 gate 分开：Implemented 不等于 Graduated；没运行就是 NOT_RUN，
  缺输入/指标/样本是 BLOCKED，不伪造 PASS。
- 单独的 P95 >500 ms 记为性能 FAIL，不使已通过精确性、完整性、新鲜度、取消及
  资源安全的实施切片回退为 NOT_STARTED；下一实施阶段可继续。S12b 的毕业、
  默认切换、发布及 #85 关闭仍须完整通过 500 ms 与原内存门禁。
- 阶段只有一份 evidence/report；Ledger/MoSCoW/ADR 引用它，不重复堆日志。
- 不另建 checker、ProjectGraph、数据库、cache、scheduler；新表/RPC 必须有当阶段真实写读消费者。
- 默认仍 `indexed-batched + closure + full SDK`、`dispose`、transient per-batch verifier、
  一个 global 重任务与原 1024 MiB 策略预算；策略预算不是已证明的 RSS 硬上限。
- 非阶段相关改动保持不动；提交、push、PR、merge、Issue 写入须单独授权且遵循分支/PR 合同。

## S00 — 本轮文档整合

允许：`docs/adr/**`、`docs/plans/**`、`docs/benchmarks/**`、本阶段整合记录与架构入口链接。
禁止：源码、tests/scripts、crates、config、lock、AGENTS、SDK、工程和 runtime artifacts。
保留 R-01–R-20，新增 R-21–R-29；0007 记录需求，0008–0013 Proposed。
所有后续阶段保持 NOT_STARTED；无重复活跃 Ledger/MoSCoW/执行顺序。
退出：文档引用/编号/依赖/状态检查通过，范围保护摘要不变。
回滚：只撤本阶段增量，不撤前序 dirty edits；文档 GREEN 不计产品 GREEN。

## S01 — 基准先行；harness已实现，产品门禁开放

允许：现有 `scripts/bench/replay-references.mjs`、输入/oracle helper、拟新增的
prepared-suite/report helper、相应公开测试与 test-layer registry、版本化 benchmark 输入和报告。
禁止生产语义/索引策略修改。

1. 已复用现有 runner、保持旧 CLI，新增 `--prepared-suite` 与旧单 query 输入互斥。
2. Suite 冻结 Settings/source/SDK/backend/产物/hash、目标池/seed、query-kind、UTF-16
   位置、includeDeclaration、实际 flags、平台/宿主和 oracle；不先查询池中目标当准备。
3. 分能力记录 unseen、unopened、repeated、body/reference/public-API edit、eviction、restart。
   新契约不支持时输出 READINESS_UNSUPPORTED/FAIL，并保留 candidate-ready 对照，不能 sleep 后假 ready。
4. RED 拒绝空池/未解析 pin、重复目标冒充 unseen、假 ready、timeout 删样本、cache 桶混合、
   相同数量不同范围。GREEN 证明 harness 正确报告真实失败，不宣称产品变快。

报告最少包含 inputIdentity/readiness/preparation/requests/bucketSummaries/memory/correctness/gateStatus。
旧 `--help` 和下面新接口均已实现；固定 suite 当前如实 exit1，不是 ready PASS：

```sh
node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-semantic-ready-s01-api24.json \
  --out .bench/semantic-ready-s01/settings-baseline-replay.json
```

实施验证：`pnpm check`、`pnpm build`、native locked release prerequisites、新增 parser/report
公开合同测试、真实 Settings baseline、`pnpm check:fast`、`git diff --check`。
必要 oracle/SDK/采样不可用时只阻塞相应桶；不换输入或延长 deadline 冒充通过。
回滚新 CLI 扩展，保留旧 runner；退出证据包含失败样本、完整 flags、目标池摘要和实际采样间隔。
当前：56/56 references exact；constructor false267 冷/编辑分别126.714s/124.881s，
class247/248、Home9/10首查5.3–7.5s，50次已有 cache hits约1–3ms。
公开focused29/29、本轮完整check:fast1147/1147 PASS/exit0；冻结输入postflight相同。
第一组诊断观察FAIL；第二组观察PASS仍有历史TS2307。其他能力、unopened、
其它 reference/public-API edit 场景、真实eviction/restart未完成；不得据 repeated 桶放行 SLO。
2026-10-03 的[同报告追加](../reports/2026-09-29-semantic-ready-s01-baseline.md#2026-10-03-追加真实未保存引用编辑控制)
补齐一个真实 `edit-reference` 控制：冻结 Settings/API24 的 HomeInitData 在未保存
新增引用后，legacy/indexed-batched 各2/2 COMPLETE，9→10处 exact，v2正常空诊断。
两次编辑响应为522/3083 ms，均为单样本；ready仍READINESS_UNSUPPORTED，
两份新suite因该项exit1。预检还拒绝重复 oracle Location、按规范化集合而非
count 判断编辑变化；public CLI focus20/20，最终固定工作树 `check:fast`
1222/1222 PASS，但不冒称500ms、ready或S01毕业。
2026-10-04 的[同报告追加](../reports/2026-09-29-semantic-ready-s01-baseline.md)
补齐一次真实 `edit-public-api` candidate-ready 控制：Settings/API24 中未保存扩宽
`HomeInitData.deviceName` 的导出成员类型后，legacy 与 indexed-batched 各自
首查/编辑后均为9个完全相同的精确引用、最新版 v2 自动诊断为空；最终 indexed
编辑后完整响应约2.987秒。原工程保持clean，正常退出。它不提供公开 semantic-ready
信号，也不是多次P95、500ms或S01毕业证据；未打开模块、真实eviction/restart等
桶依旧未完成，S01继续IN_PROGRESS。
候选 ready 不支持新合同是已测产品失败，不靠 S01 私造信号修复；
S01本轮不自动进入后续阶段；用户之后的明确下一阶段请求已授权独立S02实验，
不表示这些S01失败/缺口消失。

## S02 — compiler 批量事实可证伪实验

初始v1/v2范围：独立 `scripts/semantic` spike、fixtures、公开协议/序列化测试及报告；
不改生产 adapter、fork、schema/RPC。后续隔离 bundle 的单独授权见本节末尾；它不扩大生产修改范围。
核对 pinned `ohos-typescript@4.9.5-r10` 实际 d.ts/源码 API、hook/许可，不臆造批量导出 API。
先普通导出/alias，再 constructor/new this/super/own-constructor barrier、继承/override/interfaces、SDK、
augmentation、Unicode/overlay。一个语义类型一个纵切，完整 compiler oracle 与人工已知位置交叉验证。
序列化后释放提取 Program、清空答案 cache；新进程对未查过的目标做 exact reference/implementation 差分。
生产提取不允许 N 次全仓 findReferences；oracle 调用计数和提取资源独立。
只用真实 Settings oracle 作压力证据，不替换 constructor267 与 class247/248。
退出：必需 query-kind 全等价且有可承受提取成本；否则 FAIL、保留最小反例、阻断 S03。
回滚仅停用 spike，生产原路径不变；不以词法规则补出第二语义系统。

当前checkpoint：[public-checker-binding-projection-v1](../reports/2026-09-29-semantic-ready-s02-facts-spike.md)
已串行回放ordinary/alias/constructor，8个普通/alias查询与class control exact；
两种constructor policy各漏2/3个位置、UNSUPPORTED，故所测假说FAIL/exit42。
提取0次references、Program退出后新进程消费；focused41/41、pnpm check通过。
Settings/SDK压力、implementation与其余必测NOT_RUN，不能标S02总PASS或开始S03。
不自动重试同类词法规则。下一独立切片可为S05受预算LS复用；
若重试S02，需明确compiler派生hook/新假说并保留本反例。

2026-10-03 第二假说按此停止线执行：[resolved-signature 实验](../reports/2026-10-03-semantic-ready-s02-resolved-signature-spike.md)
使用 pinned compiler signature declaration 与AST构造关键字生成序列化事实；
原始constructor与`new this`/`super`/自有构造边界共7个目标精确、提取0次
`findReferences`。但 `ViaAlias extends Alias` 与 `ViaParen extends (Base)` 的
构造调用被该投影错误加入基类引用，精确多出4个位置；v2因此总体FAIL，
不继续叠加语法特例。v1原反例不改，修饰符/重载/调用光标仍未获完整投影。
S03继续BLOCKED；不能以阶段暂不要求500ms为由接生产facts。

2026-10-03 后续授权范围：允许第三项**隔离的 compiler-fork bulk-hook 可行性实验**，
只使用显式传入、记录 SHA 的一次性 fork 产物；不得改仓库的
`node_modules`、package/lockfile、生产 import、默认引用路径或 SQLite schema。
先用上述继承别名反例做公开 CLI RED；stock pinned compiler 独立作 oracle，
fork 仅进入提取进程，consumer 仍不得加载 compiler。实验必须证明一次
full-Program 分组提取，禁止对目标逐个 `findReferences` 或循环内部单查询扫描；
缺 hook、身份不明、误报/漏报均明确 FAIL/BLOCKED，不把局部成功升格为 S02 PASS。
即使该反例通过，仍须依次验证重载、其他 query-kind、真实 Settings/SDK 与资源门禁；
S03 在 S02 全门通过前继续 BLOCKED。

2026-10-03 第三假说已执行：[compiler hook报告](../reports/2026-10-03-semantic-ready-s02-compiler-bulk-hook-spike.md)。
builder 精确锁定已安装r10 bundle，未碰生产依赖。stock无hook明确FAIL；实验产物
在继承别名和重载位置上与独立stock oracle exact，且提取不接目标查询池。
但每个constructor仍执行一次内部`findReferencedSymbols`，共享NameTable只完成
一次外层索引；该两组用例的共享候选扫描计数为0，不能证明降低重复语义工作。
CLI因此明确`FAIL/NON_BULK`、exit42，S02门禁仍未过，S03继续BLOCKED。
真实Settings/SDK、其它kind及内存/时延门禁均NOT_RUN；不以单次hook调用冒充批量语义提取。

2026-10-04 第四假说已执行：[共享 worklist 报告](../reports/2026-10-04-semantic-ready-s02-shared-worklist-spike.md)。
隔离 builder 锁定同一r10 bundle，初始多目标搜索共享名称索引/候选位置，
import map 另共享一次全文件遍历；同名跨模块、继承别名和重载与stock oracle
exact，内部逐目标查询和逐目标全文件扫描均为0。但 `public constructor`
在`includeDeclaration=false`缺一个真实位置，负例exit42；完整constructor、
其它query-kind、Settings/SDK及资源仍未过。不能将局部`SLICE_PASS`
升级为S02阶段PASS；S03继续BLOCKED，生产和默认路径不变。
下一S02最小语义合同须从 compiler 产生 `selection → ordered definitions →
definition-origin reference roles`，覆盖 `public constructor` 与继承 usage-site
多定义；禁止按 keyword 或修饰符推断 declaration policy。

2026-10-04 第五假说已执行：[定义来源 worklist 报告](../reports/2026-10-04-semantic-ready-s02-origin-worklist-spike.md)。
隔离 v5 产物从 compiler 提取 selection 对应的有序 definitions，并按 origin
保留 reference role；`public constructor` 的 false/true policy 各 3/3 精确，
重载、同名、继承及构造边界等窄切片也与 stock oracle exact。
`internalGroupQueries=0`、`perTargetFullFileScans=0`、`sharedWorklistPasses=1`，
但 `fullProgramPasses=2`，且 `new Base`／`new Derived` usage-site 分别缺 3／4
处并明确 `UNSUPPORTED`，实验 exit42。小 fixture 的 85–102 ms、约
104.9–110.7 MB high-water RSS 不构成真实 Settings/SDK 的资源证明。
下一最小合同是多定义 usage-site 的完整 origin 联合与正确声明过滤；
仍须非构造符号、implementations、变化/SDK/Settings 与规模门禁。
S02 FAIL、S03 BLOCKED；生产路径不变。

2026-10-04 第六假说已执行：[usage-site 来源 worklist 报告](../reports/2026-10-04-semantic-ready-s02-usage-origin-worklist-spike.md)。
隔离 v6 产物只扩展直接 `new` 标识符 selection，并合并从 compiler 获得的
有序 definition origins；继承的 `new Derived` 要两个 origin。`new Base`／
`new Derived` 的 false-policy 各 2/2、true-policy 分别 3/4，与 stock
URI＋UTF-16 Location 集合精确；修饰符、重载、同名、heritage、barrier 的
其它窄构造器 fixture 也精确。`constructor-call-shapes` 含别名变量调用
`new Alias()`，提取返回 `HOOK_UNSUPPORTED`/exit42 且无 facts，不能算通过；
`new this()` 不是此次失败触发点。ordinary/alias
非构造查询仍 `UNSUPPORTED`/FAIL；Settings/API24、SDK、overlay、
implementations 和规模资源未通过。usage fixture 的一次性提取为 84.7 ms、
105.1 MB high-water RSS，不能外推真实工程。S02 FAIL、S03 BLOCKED，
生产路径不变。

同日新增[只读磁盘输入前置切片](../reports/2026-10-04-semantic-ready-s02-disk-oracle-slice.md)：
CLI stock oracle 可以从原工程路径读取列出的源码并校验其摘要，拒绝内联复制；
但仍用简化 Host，`sdkRoot` 未进入 compiler，输出明确
`HOST_PARITY_NOT_MET`、`productionApproved:false`。这是后续 Settings parity
实验的输入基础，不是 Settings oracle、S02 通过或 S03 准入。当时须先让
stock 与 hook 使用相同的实际 SDK／Harmony resolver／membership／compiler
options，并与现有真实 LSP Location oracle 精确核对，之后才可测 hook 资源。

2026-10-04 的[生产宿主 stock oracle 切片](../reports/2026-10-04-semantic-ready-s02-production-host-oracle.md)
已推进上述条件的 **stock 半边**：从原始 clean Settings/API24 checkout 由生产
DocumentStore 发现 1,496 个工程成员，选中的 API24 SDK declaration digest
与锁文件一致；新增 manifest 还固定两个 SDK compiler-options JSON，以及默认
工程配置文件的发现集合/内容，安装依赖未锁定时拒绝查询。HomeInitData 声明光标
`16:13` 在 `includeDeclaration=false/true`
下与真实 LSP golden 分别 9/9、10/10 exact，missing/extra 均为 0。
同一固定工程的 MenuController 构造调用 `90:17`、排除声明也完成 stock
生产宿主对照：267/267 exact，Program 2,261 SourceFiles、单查询约 7.975 秒，
进程 high-water RSS 785,113,088 字节；不是 hook 或生产 LSP 性能结论。
测试先 RED 后 19/19 聚焦 GREEN，`pnpm check:fast` 在可读取 macOS
进程 RSS 的环境中 1,251/1,251 PASS。原简化 `oracle` 不变且仍标 `HOST_PARITY_NOT_MET`，
新生产宿主模式仍 `productionApproved:false`。后续同宿主 `production-extract`
公开 CLI 切片在 pin 的小 SDK／工程 fixture 上 RED→GREEN，stock/hook
Program SourceFile 数在修正隔离 bundle 默认 lib 路径后相等，构造器事实查询
精确；磁盘 oracle 聚焦测试 6/6 PASS、`pnpm check` PASS。然而对同一 clean
Settings/API24 的 1,496 成员进行约 10.5 秒提取后，返回
`FAIL/HOOK_UNSUPPORTED`、exit42，原因
`ORIGIN_WORKLIST_UNSUPPORTED_OUTSIDE_ROOT_OR_SPAN`，无 facts／部分结果。
默认关闭的失败详情重放已将**首个**阻断定位到
`AbilityContextManager.ts` 的 `new Array()`：其 definition 属于已锁定 compiler
的 `lib.es5.d.ts`，不在项目搜索根内。直接扩展根集合不能解除 constructor-kind
和 workspace-only facts 序列化边界；见同一生产宿主报告。
同一新 seed-pinned manifest 的独立 stock 对照仍为 267/267 exact；
两次 stock 进程耗时／RSS 不作为 hook 的资源对照或 P95。
下一步须先解决真实工程提取失败，之后才有资格验证 MenuController
constructor267、非构造、SDK/overlay 与提取成本门禁；v6 `new Alias()`
反例没有解除。
失败诊断与保守降级的同一报告进一步记录：首个外部 origin 是 compiler
`lib.es5.d.ts` 的 `Array`；小 fixture 的本地 `Local` exact 与外部
`UNSUPPORTED` 只能形成 `FAIL/PARTIAL` 实验产物。真实 Settings 重放之后
仍于 `ORIGIN_WORKLIST_UNSUPPORTED_ADJUSTED_BRANCH` 停止、无 facts。
这不是新 S02 PASS，也不允许继续 S03；若研究下一 origin 类别，需先锁定
compiler 节点与 coverage 合同，不能仅跳过不支持分支。
**S02 FAIL、S03 BLOCKED；不得把 stock 对照当成 facts 可发布证明。**

## S03 / S04 — 发布与有界准备

S03 只迁入 S02 实证通过的投影；复用同一 SQLite/schema owner 与 sidecar，真实 producer→写入→读取。
输入/coverage/projection 独立于候选代；staging→validated→committed 原子切换。
RED 覆盖 crash/cancel/损坏、旧 schema、SDK/options/source 同 mtime 变化、半覆盖；
GREEN 重启同代 exact、不同代不混、overlay 不冒充磁盘。退出失败不启读；回滚禁用新 facts 读路径，
不破坏旧 candidate DB。Rust focused/workspace tests、Clippy 和 locked release 均需 GREEN。

S04 在既有 supervisor/runtime 调度单个有界重任务，标准 workDoneProgress 报进度/取消。
Initialize 不等全事实；unknown 明确 degraded/partial。准备中变化、缺输入、shutdown、低预算
不得假 ready/无限重试；candidate.ready 不推出 semantic.ready。
退出：generation、进度和真实可用查询覆盖一致；先展示局部 capability-ready，未完成全部能力不宣称总体。
资源覆盖整个准备过程；回滚停用 preparation 模式，保留原正确查询。

## S05 — 独立热会话实验

只在现有 type-engine、Coordinator、snapshot、anchor/Worker ownership 上做默认关闭实验。
先记录 reset/evict 原因，再分别比较 Worker shell、相容 LS、SDK/registry 和 snapshot 更新。
R-09 现有入口不重复实现；局部 LS 只能作局部/anchor 复用，完整 references 须覆盖证明。
配置/SDK/边界不安全时重建；lease 保护、L3 滞回和整体 Node RSS accounting 不变。
RED 是兼容工作无必要重建或错误复用，不能只测同符号 cache。
复用候选准入/默认推广：trace-off 随机交替 A/B exact，≥100 次编辑/换模块/
压力/取消无持续增长；peak 不高于原 baseline×1.10，post-eviction 原门禁通过。
候选失败则记录并保持 default dispose/transient；不因候选未毕业反复阻塞其他安全实施切片。
需显式 ADR 评审才能挑战 0003；观测、shell、LS 对照分别小提交，不混 SDK/proof 重构。

当前第一切片仅实现trace-gated `semantic.context.create/reuse/trim/evict`，
以contextSequence和明确reset/evict reason观测Coordinator拥有的LS生命周期，
不是Program identity或复用证明。公开子进程聚焦37/37 PASS；
Settings/API24同build串行trace-on/off各1次，均9/9 exact、正常诊断和正常退出。
trace-off预热definition48ms，references4,647ms；trace-on见`reference-dispose`
及transient verifier重新准备。没有改变dispose、预算或Worker生命周期。
完整门禁/采样口径与限制由[唯一S05报告](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md)记录。
本轮whole-fast1160/1161、1FAIL/exit1：403-file struct请求4原20s超时；
原deadline隔离复核不能替代whole gate，未放行合并/默认或复用毕业。
第二切片已实现`ARKTS_SEMANTIC_SESSION_REUSE=off|experimental`，默认off。
仅同owner/epoch、from/to revision完整衔接、全部changed文本本次非overlay交付的
ordinary磁盘delta可沿用local LS；缺失/被其它alias消费/未交付/不安全边界仍重建。
未知source删除也沿原机制推进durable revision，覆盖单独删除、前后batch顺序及中间消费。
host版本使用已有source SHA与disk revision，修复移除重插/跨LScounter的旧range碰撞。
100次fixture磁盘comment、类型错误→修复、compiler-only声明及双alias用公开stdio测试。
最新source focused72/72 PASS/exit0（17公开LSP+4分层+51原guards），不是whole gate。
这不是Program reuse/全局coverage/真实100操作资源证明；在第二切片当时旧whole FAIL未关闭，
本切片不改defaults、SDK、预算或transient verifier。最新构建Settings无编辑、
trace-off off/experimental对照仅作exact/诊断回归，不能冒称disk复用收益。
最新两arm均9/9 exact、正常diagnostics0/exit0；warmed definition33ms，
references3,473/3,578ms（各1次，不是P95/500ms毕业）。
随机真实编辑/模块/压力/取消A/B、≥100操作资源趋势、post-eviction/PSS及毕业仍NOT_RUN。
第三检查点用真实Settings/API24受控单文件磁盘comment及公开LSP回放：
原工程clean且在private exact clone内编辑未打开声明；consumer`HomeInitData`
UTF-16 40:37的definition由16:13精确移至17:13，9个references含本文件
line28→29移位且完整oracle一致，正常v1 TS2339诊断与退出。
trace-off off/experimental各3个独立新进程交替运行均PASS；编辑后definition中位
1,811→281ms，但references中位6,597/6,611ms没有改善；Node RSS采样峰值中位
795,774,976/796,004,352 bytes，不能当PSS/最终内存gate。两arm均因
`workspace-changed`对references走安全index fallback。初始trace-on诊断等待顺序的
失败样本保留，不冒称PASS；修正后才得到两armtrace-on PASS。
此证据仅推进**局部相容磁盘LS**，没有证明Program复用或完整global scope，
不改变默认off/dispose/transient Worker。真实随机≥100混合操作、模块/压力/取消、
post-eviction/PSS、原>3GB/最终50%及500ms整体仍未关闭；随后当前工作树的
runner随后新增四条输出范围/status不可用的fail-closed安全用例：报告目标不能位于
原Settings或SDK，canonical parent必须识别symlink别名；不改语义server或既有性能曲线。
安全补丁前whole-fast1,177/1,177 PASS；补丁后沙箱内一次`ps`权限拒绝使采样/回放
测试失败并停止（exit1），仅记环境无效。获准macOS进程采样环境下，当前工作树
`/usr/bin/caffeinate -i pnpm check:fast`最终**1,181/1,181 PASS、exit0**
（0 fail/cancel/skip/todo，duration `1,195,387.333352 ms`）。先前1160/1161
FAIL保留为历史，不再称当前源码whole-fast阻断；原20秒struct超时根因仍未证明。
补丁后另有一次experimental真实Settings编辑smoke PASS/exit0，definition前后精确、
references9/9 exact及正常v1诊断；只证明runner有效输入仍可回放，
不把先前六次曲线改标补丁后A/B或P95。
详见[唯一S05报告](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md)。
第四检查点在相同Settings commit/API24/产物下完成一次固定顺序trace-off A/B：每arm
100次真实磁盘comment编辑及立即primary definition，11次跨模块定义与11次
9-location references，正常精确v1诊断、第50次L3 ack、第51次恢复均PASS。
同manifest与schedule digest的experimental/off采样Node peak分别
2,146,119,680/1,341,296,640B，即**1.600×**，违反S05沿用的≤1.10资源门禁；
primary定义中位311.815/261.549ms、references中位6,698.945/6,007.669ms，
未呈现本混合负载的时延收益。一次固定顺序A/B不是随机多会话或PSS、P95证明。
同冻结输入的独立experimental-only复核再次100/11/11 exact，Node峰1,796,046,848B；
相对唯一off为1.339×，但没有第二个配对off，不能用作随机配对推断。
两次experimental各22/100次primary定义>500ms，off为2/100；三条约90秒引用
都与`candidate-ineligible` index fallback同现，仅列为待诊断关联，不作根因宣称。
[单独trace-on诊断](../reports/2026-09-30-s05-settings-context-trace-diagnosis.md)
对齐L3/create/evict，但不把它与trace-off门禁样本直接混比。
独立trace-on、reuse-off的queue-start取消控制已PASS：请求id2回`-32800`无result，
新请求9/9 exact并恢复definition/正常诊断。另一独立off控制在
`references.batch.start`后、batch.complete前取消id2，也仅回`-32800`无result，
新refs9/9/definition/诊断均exact；两项都不代表experimental arm或所有batch。
原default-off不变，S05仍IN_PROGRESS且当前实验不能推广；
不能因此进入S03（仍BLOCKED）、改预算或提前声明500ms整体完成。
补充阶段判别：历史trace-on两次约90秒尾延迟均在`candidate-ineligible`后
执行24个保守batch，其中Program准备约78–81秒；索引拒绝的底层原因尚未证明。
已加默认关闭的只读SQLite同代次声明行快照探针，并完成三次新的Settings/API24
100-op exact回放；三次均未触发拒绝，因此不能据此修改生产freshness。
随后独立的两次watched-edit公开LSP RED，在generation 2已构建、第二次编辑
排队generation 3时证明旧水位可从1提前恢复到2；scripted表现为
`candidate-ineligible`，native曾接受旧代次direct-import候选，但结果仍完整。
最小安全修正把status可选`buildingGeneration`纳入每次编辑的恢复基线，
失败保持dirty/完整fallback；定向scripted+resync+manifest 6/6、native 1/1、
adapter 28/28 GREEN，`pnpm check` exit0，全量`check:fast`尚在运行。
其后全量`check:fast` 1,199/1,199 PASS；真实Settings/API24用同一manifest/
schedule固定**off→experimental**各100操作回放，两臂100/11/11 exact、诊断与
L3恢复均PASS，0个`candidate-ineligible`快照、各11次`workspace-changed`回退、
0次indexed recovery。没有复现90秒尾延迟，但refs均紧随编辑、会话随后退出，
**不证明**空闲后indexed可恢复或历史尾延迟已解决。Node采样峰off/
experimental为2,097,225,728/2,166,226,944B（1.033×）；experimental
100次primary definition P95约1.719秒，500ms目标未满足。单对非随机/PSS门禁。
随后默认关闭的`--post-idle-reference`在真实Settings/API24完成off与experimental
各一独立100-op会话及修正计时的第三次off复核：最后fallback后sidecar提交
更高代次，新增请求均9/9 exact、cache miss且明确indexed accepted/plan、
无fallback。修正后off观测为catalog等待10.774秒、随后LSP refs 5.431秒；
anchor与batch分别支付约2.23/2.24秒Program ready，实际batch查询约48ms。
因此“整会话永久legacy”被该场景反证，但500ms和资源毕业仍远未达到；
前两份报告中的`waitMs`曾误含查询时间，第三次独立复跑已修正口径。
定向CLI 6/6、获准外部进程采样后的完整`pnpm check:fast` 1,201/1,201
通过；受限沙箱里`ps`不可用造成的端到端超时不作为代码回归或GREEN。
下一证据门转为减少重复compiler准备且保持exact、目标export行拒绝快照、
多会话及PSS。index尚未open时`status`失败的启动期活性边界现有独立公开LSP
RED→GREEN：变更前完整fallback、变更后启动的catalog提交新代才恢复indexed；
两种`includeDeclaration`均exact，旧代不被接受。当前完整`check:fast`1208/1208
PASS，真实Settings/API24新进程mode-A九位置exact、正常诊断；该Settings回放没有
触发pre-open编辑，不能替代新LSP反例或证明历史11次回退的原因。可选原生
generation-race运行因第三代过早提交而未满足中间窗口断言，持久旧代pre-open组合
仍需确定性覆盖。之后脚本索引补上旧代漏掉新增`Added.ets`、新代才包含它的
负向控制；旧代仍完整fallback，新代两种declaration policy都精确indexed，
故上述“旧代不被接受”现在有可检测漏引用的公开用例支持。该加强的定向测试
8/8通过、`pnpm check`和`pnpm build`通过，但晚于1208/1208整套检查，不能
把该整套计数当作加强后的复跑。详见同一[S05报告](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md)。
保持S05 IN_PROGRESS、reuse默认off、S03 BLOCKED。详见
[水位TDD](../tdd/semantic-ready-context-lifecycle.md)与
[独立诊断](../reports/2026-09-30-s05-settings-context-trace-diagnosis.md)。

2026-10-05 的独立 R-08 回归已补齐上述**原生中间窗口测试缺口**：debug
sidecar 在指定 generation 3 的 activating 阶段等待测试文件显式放行，
不再靠固定 5 秒睡眠碰运气。真实 stdio LSP 测试先 RED（第三代提前 ready），
后连续 6 次原生 GREEN；generation 2 ready／generation 3 activating 时
第二次编辑的 references 必须完整且 fallback，不能有旧代 `accepted`／`recovered`；
放行第三代后才允许 indexed 恢复。Release 构建忽略测试闸门，生产索引
新鲜度策略未变。该最小工程门禁**不是** Settings/API24 时延、S02 投影、
500 ms 或内存发布证据；S05 的相容磁盘 LS 候选仍按本计划收口为 REJECTED。
命令与 RED/GREEN 记录见[水位TDD](../tdd/semantic-ready-context-lifecycle.md)。

[后续R-10诊断/实验](../reports/2026-10-03-settings-reexport-anchor-seed.md)：
同一真实Settings/API24具名re-export直接索引证明`unsupported`，单独anchor与最终
batch各支付约2.5秒Program准备。默认关闭的无别名re-export种子仍由最终compiler
在原始光标核验；同build三对独立回放9/9 exact，请求中位7.184→4.456秒，
product RSS峰值中位617.2→605.6MB。它不改变S05资源毕业或默认策略：
请求仍远超500ms，P95/随机100操作、post-eviction PSS、原>3GB与最终50%门禁未过。
随后公开LSP fixture补齐`includeDeclaration=true`、验证中途未保存编辑触发
ContentModified及新引用精确重试、显式取消无部分结果的门禁，6/6通过。
同一冻结Settings/API24输入的一对mode-C重复/编辑回放，两臂各11/11次均9位置exact；
开启种子首次/注释编辑后4.719/3.017秒，关闭为7.263/5.701秒，
中间9次为1–6ms缓存命中。进程树采样峰值开/关626.3/659.3MB。
这只是on→off单次顺序对照；没有关闭随机100操作、P95、PSS或500ms门禁。
该安全测试源的完整`check:fast`为1,207/1,207 PASS、exit0，产物pin和原Settings
checkout保持一致；这不改变S05 IN_PROGRESS、S03 BLOCKED或任何默认配置。
新增同工程同SDK的`includeDeclaration=true`首查配对：seed开/关都精确返回
10个URI/range（含声明），请求4.506/7.491秒，峰值进程树RSS
612,376,576/635,486,208B；只有每臂1次，不能当毕业性能证据。
默认关闭的`references.search.document-prepare.complete`观测已通过公开LSP
RED→GREEN，下一步只据真实阶段归因决定是否实验性减少重复准备；最终batch
仍有674个SourceFiles，不能把anchor节省误称为S05热LS通过。
新产物pin下的单次Settings实测：10/10 exact、正常诊断，请求4.474秒，
`documents.prepare(position,true)`为1.139秒/256文档，最终batch为2.991秒；
其中Program构建2.208秒，实际findRefs约49ms。前置准备虽值得分段测量，
但当前最大时延仍在compiler Program准备；不得把预载文件数当成已证因果，
亦不得据这一个样本跳过membership/closure或开启默认复用。
后续六段trace的真实Settings/API24模式A与C均exact/正常诊断：冷态membership
约987/1,010ms，额外预载54/21ms；未保存注释后membership约0.05ms，
但final batch `createProgram`仍2.157秒，编辑后refs仍3.094秒。
故当前一阶后续实验应围绕**安全复用/避免重复compiler Program构建**及其
1.10×资源门禁，而不是假设删除121个预载文档能达到500ms。S05仍IN_PROGRESS，
default-off和ADR0003边界不变；细节见同一[R-10报告](../reports/2026-10-03-settings-reexport-anchor-seed.md)。
当前构建进一步以两对反序、trace-off真实Settings 100操作回放复核相容磁盘LS：
每臂100次定义/11次引用/11次跨模块定义均exact，但experimental定义P95分别
1.657/1.608秒，off为0.278/0.272秒；Node峰值比1.079×/0.929×方向不一致。
同构建trace-on显示慢请求主要在`engine.define`并与L3 context churn同现，
不能据此归因具体retained Program。此候选时延门禁FAIL、默认仍off，继续S05
须先验证有界避免L3抖动的方法；不以反复采样替代修复或宣称500ms已达标。
完整身份、原始曲线及限制见[唯一S05报告](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md)。
后续默认关闭的compiler事件观测在同一真实Settings的trace-on 100操作配对中
证明：两臂每次编辑后定义都触发`createProgram`；超过500ms的2/off、5/experimental
次定义主要耗在该事件（约1.3–1.5秒），而大多数快请求约0.2秒。
这表明**单凭L3/context新建事件无法解释尖峰成本**，但单对trace-on分布与此前
trace-off反序门禁不同，不能将实验候选重标PASS。下一S05行为实验应针对
compiler冷热状态提出可证伪机制，不放宽L3、预算、完整结果或默认策略。
后续仅观测的 `programSequence` 在公开 LSP fixture 中显示：未修改定义查询
观察到同一 Program，磁盘注释编辑后即使 `contextSequence` 不变也观察到新 Program。
真实 Settings/API24 单次 Mode B 验证字段产生、9/9 references exact 与正常诊断，
但无编辑，不证明真实工程的 Program 切换或时延收益；原相容磁盘复用候选
default-off/不准入、S05 IN_PROGRESS。详见[唯一S05报告](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md)。
2026-10-04 默认关闭的 SourceFile 对象身份观测在真实 Settings/API24 私有克隆
磁盘注释编辑中看到：两臂都从 Program 1 换到 Program 2；实验臂第二次定义
观察到 SDK 306/306、工程 63/64 SourceFile 对象复用，off 臂为 0/306、0/64。
两臂 definition/references 与移位 oracle 精确、正常诊断和退出；但只是 trace-on
各一次，不能据 298 ms 的实验臂定义样本放行已被真实100操作 trace-off P95
否决的候选，也不能证明 TypeChecker/AST 内存归因。S05 IN_PROGRESS、默认 off。
完整身份、原始曲线与受限采样首样本环境失败见[同一报告](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md)。

2026-10-05 安全决策收口：两对反序、每臂 100 次真实 Settings/API24
trace-off 操作在完整结果、诊断及 L3 恢复上 exact，但实验臂编辑后定义
P95 1.657／1.608 秒，对照 off 为 0.278／0.272 秒。早期配对的 Node RSS
峰值比 1.600× 也违反 ≤1.10 准入门禁；后续比值方向不同，不能声称稳定
内存倍率或 PSS 结果。单次 trace-on SourceFile 对象复用不推翻这些失败。
因此结束**此候选**评估并拒绝准入，不再以重复采样寻求放行。
`ARKTS_SEMANTIC_SESSION_REUSE` 仍默认 `off`，完整语义 fallback、L3／预算
与 per-batch transient verifier 保持不变；ADR 0003 不被 supersede。
这只满足依赖图中的「S05 安全决策（否决）」节点，**不是**热会话生产能力
`IMPLEMENTED`、≤500 ms 或原始 >3 GB／50% 与 PSS/post-eviction 内存门禁通过。
后续若有不同机制须另立公开 RED 与精确性／新鲜度／取消／资源门禁。
S02 仍 FAIL、S03 仍 BLOCKED；本决策不允许跳过它们进入 facts 生产路线。

## S06 / S07 / S08 — 首查、编辑与实现跳转

S06 在现有入口默认关闭接入 cache→有效投影→获准热 LS→exact fallback。
按原始 cursor/query-kind 解析身份，constructor 不能换 class seed。cache 清空、提取 Program 已释放，
对未查询目标与未打开模块检查两种 includeDeclaration 的 exact 结果与完整 P95。
unknown/stale/Unicode mapping/coverage 缺失不得 complete 空结果；fallback 等待计时。
失败关闭新读取；默认切换留 S12。

S07 复用变更/别名域/revision fence，先 module/target 保守失效；overlay 新事实替换旧行。
公共签名、推断导出类型、global/package 变化按 compiler 依赖证据扩大失效；unknown 不裁剪。
保持 root-wide 答案 cache 失效，直到细粒度证据通过。编辑后立即请求、不预等 settled。
新增/删除/移动引用、diskless/close-reopen/nested roots/同 mtime 的 RED 全差分；
功能 exact 但等待 >500 ms 时记录性能 FAIL，不重标首次准备。失败退粗粒度，不返回旧结果。

S08 只接 S02 已证明的 implementation 投影，不能用 references 或 lexical extends 代替。
验证 interfaces/override/泛型/多实现/同名/编辑新增实现；第二真实消费者出现后才抽共用生命周期。
实施退出：该能力各桶 exact、新鲜度、取消与新路径资源安全通过；P95 按桶记录，
未达 500 ms 标性能 FAIL 留待 S12b，不能据此推广失败的新路径。
语义或资源失败仅回滚 implementation 新路径，不损坏 references。

## S09 / S10 / S11 — 每项能力独立纵切

- S09a definition/typeDefinition；S09b completion/auto-import、hover/signature 分能力；
  S09c 诊断新鲜度与资源/格式化回归。仅可使用通过正确性和资源安全准入的 S05
  热 LS，否则沿现有安全路径；不额外建全 workspace Program。
  保留补全排序/编辑/snippet/isIncomplete 与诊断 code/range/version；只优化实测缺口。
- S10a prepareRename，S10b rename。generation 不能代替 compiler 合法性/冲突检查；
  比较完整 WorkspaceEdit/expectedVersion，并只在临时副本应用验证。变更/取消不交旧 edit。
- S11a prepare calls，S11b incoming，S11c outgoing。先独立证明 call 投影与方向/fromRanges；
  references 不是 calls；旧 item 与新 snapshot 不能混用。

每项都需要真实子进程 RED/GREEN、对应 exact/编辑 oracle、500 ms 分桶与内存证据。
实施完成但 P95 未达标时保留原 capability/正确慢路径，记性能 FAIL 和未毕业后继续
下一安全实施切片；正确性或新路径资源安全失败则回滚各 provider，不静默删除旧功能。

## S12a / S12b — 实施盘点后再逼近目标与发布

S12a 逐项核实实施状态、公开 LSP 正确性、版本/取消边界、新路径资源安全、
未运行或失败的性能桶及阻断原因。只有真实实现和适用的安全门禁通过才能标
`IMPLEMENTED`；被 S02 等语义反例阻断的路线仍为 `BLOCKED`，失败候选仍为
`REJECTED`，不得将旧的正确慢 fallback 冒称新路径已完成。S12a 可列出待优化的
500 ms 差距，不以该差距阻断盘点本身。S12b 才集中按冻结证据优化并做产品发布评审。

每 capability×bucket 至少 100 请求/≥5 独立会话，目标池不足明确 BLOCKED；
跨 Windows/macOS/Linux 分开安装、SDK、非 ASCII/空格路径、sidecar、迁移和恢复验收。
完整准备/恢复/编辑/回收资源与原 memory gates 并列；Mac RSS 不替代 PSS。
任何必需 gate FAIL/BLOCKED/NOT_RUN 不宣称总体 500 ms、不换默认、不关闭 #85 或旧内存任务。
默认切换是独立、可回滚提交；CI 和否决实验/无消费者 RPC/重复 manifest 清理是各自 characterization 切片。
历史失败报告保留链接，不全盘盲删；生产字段/schema 不随文档提案自动创建。
发布需 `check:fast`、Rust workspace/Clippy/release、real-sdk/artifact/sealed/large 与新 suite 均有实际证据。
