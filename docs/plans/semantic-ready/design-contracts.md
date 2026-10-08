# 历史设计合同：语义事实、版本、路由与复用

状态：**Archived proposal / 未获生产准入**。本页保留 S02/S03 原始研究合同，
不是当前实施顺序或已批准的 schema。S02 v1–v6 未通过，S03 BLOCKED，
S05 相容磁盘实验 REJECTED；不得按下文旧投影路由直接接生产。
当前路线见 [L01–L08 计划](../2026-10-06-budgeted-resident-semantic-plan.md)
与 [ADR 0014](../../adr/0014-budgeted-long-lived-semantic-session.md)。
历史背景关联 [原 S-series 计划](../2026-09-29-semantic-ready-execution-plan.md)、
[产品契约](product-contract.md) 和 [ADR 索引](../../adr/README.md)。

## 每类真值一个 owner

| 真值/机制 | 复用的 owner | 不新增 |
| --- | --- | --- |
| 当前文本、版本与 diskless overlay | DocumentAuthority/document-store | 第二编辑缓冲区 |
| module/target/工程准入与依赖 | ProjectGraph/HarmonyProjectModel | Rust/semantic 自建工程边界或 resolver |
| 类型、symbol、query-kind 语义与诊断 | pinned compiler adapter | 词法类型推导或第二 checker |
| 候选发现与排序 | Rust index-core | 候选位置冒充精确答案 |
| 磁盘 schema/事务/恢复 | index-sqlite + sidecar | 第二数据库或 Node 直接写私有表 |
| LS/Worker 生命周期与预算 | Coordinator + supervisor | 竞争的 scheduler/cache manager |
| 完整答案 cache | ReferenceResultCache | 各能力重复无界 cache |
| ready 状态 | semantic owner 消费有效提交代 | UI 自建另一个 ready 真值 |

## 未实施的 S02/S03 逻辑记录

`SemanticGeneration`：独立 `id`、完整 `inputKey`、`producerIdentity`、
`projectionVersion`、实际分析单元/source 身份/能力覆盖及未知原因；
state 为 staging/validated/committed/invalid。候选代号不改义、不当语义身份。

Compiler facts 的最小内容：

- `symbolKey`：同一 semantic generation 内跨实际分析单元身份一致；不用 `symbol.id`
  或跨 Program 的 `ts.Symbol`，不承诺跨任意编辑永久稳定。
- `selectionBinding`：内容身份、选择 span、query-kind 到目标的映射；class、constructor、alias
  使用位置不能无证据共用一个查询身份。
- `occurrence`：compiler 判定的目标、role、UTF-16 range 和 source 身份。
  `includeDeclaration` 的投影规则必须与实际查询差分。
- `relation`：仅加入已验证且有真实消费者的关系种类；词法 heritage 不是 implementation/call。
- `queryProjection`：按能力/选择语境生成完整答案的实际规则及版本。

目标 ID 不是全部查询语义。生产提取不得逐声明重复全工程 `findReferences`；
oracle 可以逐目标调用，但成本、调用计数与提取独立报告。

## 原子发布与恢复

1. 从现有权威 owner 捕获输入身份和 source/overlay 版本。
2. 用正确的有界语义单元/依赖闭包提取，写 staging。
3. 检查 coverage、query-kind 和输入未变；unknown 保留不完整。
4. 同一 SQLite 事务或明确等效原子边界发布 committed generation。
5. 准备中变化不能将旧 stage 标作新输入；旧代仅在自身输入仍有效时可回答。
6. 重启核对 compiler/SDK/options/source/schema/projection；损坏或旧版本拒绝/重建。

持久化数据描述磁盘源码版本；overlay 的内存事实替换同文件旧行，不写成磁盘真值。
删除位置不能通过 union 旧表复活。相同 mtime 不证明内容未变。

## 历史实验控制（不作为新路线准入）

S05 的 `SESSION_REUSE` 已在既有 reference runtime 集中解析，默认 off，
但其实验候选已 REJECTED；新 L01 不复用该 flag。`FACTS_MODE` 未实现，
S03 BLOCKED，不按此页继续接入。

| 控制 | 拟议值 | 拟议默认 | 用途 |
| --- | --- | --- | --- |
| `ARKTS_SEMANTIC_FACTS_MODE` | off / build-only / query | off | 生产/准备证据；通过后逐能力读取 |
| `ARKTS_SEMANTIC_SESSION_REUSE` | off / experimental | off | 已实现：仅完整交付的相容disk delta后local LS复用实验，未毕业 |

build-only 不改变公开查询来源；query 不跳过有效代/coverage/freshness。
SESSION_REUSE非法值启动时报错；FACTS_MODE非法值仍为拟议要求。日志写stderr。
现有references/SDK/closure/retention默认不变。
不为每个实验继续增加开关；清理实验控制需要独立 characterization。

S05准入须有同owner/epoch、精确from/to revision的一次性span、无removed/reset，
且changedPaths全部实际提供在非overlay documents内；消费/遗漏delta或不安全边界重建。
host resident版本携带已有source SHA与每路径磁盘revision，防跨LS及重插counter碰撞。
未知in-root source删除须推进durable revision，不能只清pending span而在后续change时复活。
不能因为定义已返回而关闭正常诊断；完整global查询仍须原coverage证明。

## 原拟议查询与生命周期（仅供研究对照）

| 条件 | 动作 |
| --- | --- |
| 完整 cache 与输入一致 | 原 cache 返回；保留最终 freshness fence |
| 该能力投影完整、有效 | 检索并应用当前有效 overlay/增量 |
| 热 LS 配置/版本/范围足够 | 官方 LS 查询；全局操作必须完整覆盖 |
| unknown/stale/partial | 原 exact fallback；所有等待计入时延 |
| source/mapping 不可用 | 既有 incomplete/错误，不冒充 complete 空结果 |

有效 compiler 结论可以复用；不为每次验证同一个事实重复建 Program。
LS 兼容性绑定 compiler、SDK、options、scope 与输入；配置/不安全边界变化重建。
DocumentRegistry 只共享相容运行域内的 SourceFile，不跨 isolate 分享普通 JS AST。
Leased context 不 dispose；释放只调用后端生命周期，不手工删 AST/Type/Symbol。

单个正确闭包仍过大时，先测真实工程配置/SDK roots/已有可信构建声明。
不得按固定文件数切断必要依赖；可信 `.d.ets` 须证明函数体引用和映射完整，禁止查询中 emit。

## 停止空架构扩张

S02 未通过不写生产 schema/RPC；S03 保持 BLOCKED，只有新决策和真实
producer→存储→读取消费验证才能重启。
第二个实际消费者出现前不建万能 GlobalSemanticQueryFramework。
每个增量记录消除的重复工作；失败留反例，不补第二套语言语义。
