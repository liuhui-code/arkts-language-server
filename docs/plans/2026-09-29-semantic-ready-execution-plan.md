# ArkTS semantic-ready / 500 ms 接续执行计划

日期：2026-09-29。实际 HEAD/附件基线均为
`911ae43c274175614559b63f0311504747d8393d`；当前分支
`codex/references-resident-fast-path` 有此前未提交改动，必须保留。

**当前推进到独立S05：default-off相容disk LS原型已实现；100次Settings混合回放功能exact，
但实验arm资源门禁FAIL，毕业未完成。**
S02 checkpoint的public-checker binding投影假说仍FAIL；S03阻断。
S01 harness和真实candidate-ready对照已实现，但两个suite仍READINESS_UNSUPPORTED/FAIL，
完整桶验收有缺口，不能重标毕业。用户明确要求下一阶段仅推进独立S02可证伪实验；
不是批准S03生产改造。后续下一阶段请求已推进独立S05观测与相容磁盘复用切片：
S05 IN_PROGRESS，实验默认off、真实资源/时延毕业未完成；S04、S06–S12仍NOT_STARTED。
新技术 ADR 0008–0013 为 Proposed。Issue 为本地草案，未创建、未修改 GitHub #85。
S00 检查状态见 [整合报告](../reports/2026-09-29-semantic-ready-plan-integration.md)。
S01 当前唯一证据见 [基线报告](../reports/2026-09-29-semantic-ready-s01-baseline.md)。
S02 当前唯一证据见 [事实投影反例报告](../reports/2026-09-29-semantic-ready-s02-facts-spike.md)。
S05 当前唯一证据见 [context 生命周期观测报告](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md)。
继续指定阶段不自动授权下一阶段生产修改、提交、push、PR 或合并。

这是唯一当前实施顺序。需求由 [产品契约](semantic-ready/product-contract.md) 管理，
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

## 顺序、停止线与状态

```text
S00 → S01 → S02 → S03 → S04 → S06 → S07 → S08
        └→ S05
S04 + S05 + S07 → S09a/b/c → S10a/b
S06 + S07 + S08 → S11a/b/c
S06～S11 全部必需验收通过 → S12
```

S02 任一必需投影不等价：S03 及后续生产 facts 路线 BLOCKED，保留反例与完整 fallback。
S05 仅依赖 S01，允许作为独立热 LS 替代实验继续；性能采样不得与其它实验并行。
S05 通过也不自动 supersede ADR0003。S09/S10/S11 一轮一个能力/方向，不一次改所有 provider。

| Stage | 当前状态 | 功能范围 |
| --- | --- | --- |
| S00 | 文档已整合；检查见报告 | R-21、治理与当前状态纠偏 |
| S01 | IN_PROGRESS：harness/control 已实现；ready FAIL、覆盖缺口 | R-01/02/21：真实 ready 后分桶基准；不冒称产品 GREEN |
| S02 | FAIL：所测public-checker绑定投影；其余必测NOT_RUN | R-07/14/25：普通/alias exact，constructor不等价；未否定所有compiler hook |
| S03 | BLOCKED；须新的S02投影门禁PASS | R-08/14/22：同库版本化发布；不得接入失败假说 |
| S04 | NOT_STARTED | R-06/20/22/23：有界准备与就绪 |
| S05 | IN_PROGRESS：原因观测和default-off相容disk LS原型已实现；毕业未完成 | R-03/09/10/11/12/24/26：受预算复用 |
| S06 | NOT_STARTED | R-04/05/07/10/14：references 投影首查 |
| S07 | NOT_STARTED | R-04/07/08/13/22：普通编辑增量 |
| S08 | NOT_STARTED | R-15/25：implementations 独立投影 |
| S09a/b/c | NOT_STARTED | R-24/26/29：定义、补全等当前文档体验 |
| S10a/b | NOT_STARTED | R-15/27：prepareRename、rename |
| S11a/b/c | NOT_STARTED | R-15/28：prepare/incoming/outgoing calls |
| S12 | NOT_STARTED | R-02/21/22：逐能力、平台与资源发布评审 |

## 建议 Issue 草案与依赖

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
reference/public-API edits、真实eviction/restart未完成；不得据 repeated 桶放行 SLO。
候选 ready 不支持新合同是已测产品失败，不靠 S01 私造信号修复；
S01本轮不自动进入后续阶段；用户之后的明确下一阶段请求已授权独立S02实验，
不表示这些S01失败/缺口消失。

## S02 — compiler 批量事实可证伪实验

允许：独立 `scripts/semantic` spike、fixtures、公开协议/序列化测试及报告；不改生产 adapter、fork、schema/RPC。
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
退出：trace-off 随机交替 A/B exact，≥100 次编辑/换模块/压力/取消无持续增长；
peak 不高于原 baseline×1.10，post-eviction 原门禁通过。失败保留 default dispose/transient。
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
多会话及PSS。另需单独构造index尚未open时`status`失败的公开LSP回归：当前dirty水位
可能保持undefined直到下一次watched change。该启动期活性边界不等同于
本次已ready的Settings回放，不用它解释上述11次回退。
保持S05 IN_PROGRESS、reuse默认off、S03 BLOCKED。详见
[水位TDD](../tdd/semantic-ready-context-lifecycle.md)与
[独立诊断](../reports/2026-09-30-s05-settings-context-trace-diagnosis.md)。

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
退出：该能力各桶 exact/P95/资源通过；失败仅回滚 implementation 新路径，不损坏 references。

## S09 / S10 / S11 — 每项能力独立纵切

- S09a definition/typeDefinition；S09b completion/auto-import、hover/signature 分能力；
  S09c 诊断新鲜度与资源/格式化回归。优先 S05 通过的热 LS，不额外建全 workspace Program。
  保留补全排序/编辑/snippet/isIncomplete 与诊断 code/range/version；只优化实测缺口。
- S10a prepareRename，S10b rename。generation 不能代替 compiler 合法性/冲突检查；
  比较完整 WorkspaceEdit/expectedVersion，并只在临时副本应用验证。变更/取消不交旧 edit。
- S11a prepare calls，S11b incoming，S11c outgoing。先独立证明 call 投影与方向/fromRanges；
  references 不是 calls；旧 item 与新 snapshot 不能混用。

每项都需要真实子进程 RED/GREEN、对应 exact/编辑 oracle、500 ms 分桶与内存证据。
未通过保留原 capability/正确慢路径并记未毕业；回滚各 provider，不静默删除旧功能。

## S12 — 发布、默认切换与独立清理

每 capability×bucket 至少 100 请求/≥5 独立会话，目标池不足明确 BLOCKED；
跨 Windows/macOS/Linux 分开安装、SDK、非 ASCII/空格路径、sidecar、迁移和恢复验收。
完整准备/恢复/编辑/回收资源与原 memory gates 并列；Mac RSS 不替代 PSS。
任何必需 gate FAIL/BLOCKED/NOT_RUN 不宣称总体 500 ms、不换默认、不关闭 #85 或旧内存任务。
默认切换是独立、可回滚提交；CI 和否决实验/无消费者 RPC/重复 manifest 清理是各自 characterization 切片。
历史失败报告保留链接，不全盘盲删；生产字段/schema 不随文档提案自动创建。
发布需 `check:fast`、Rust workspace/Clippy/release、real-sdk/artifact/sealed/large 与新 suite 均有实际证据。
