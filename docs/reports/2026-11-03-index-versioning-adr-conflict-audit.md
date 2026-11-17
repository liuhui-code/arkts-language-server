# 文件版本化索引方案：历史 ADR 冲突审计

日期：2026-11-03。性质：**设计审计，不是新 ADR 的批准或产品实现**。
关联：R-13、[重复写入诊断](2026-11-03-index-rewrite-root-cause.md)、
[方案评审第10节](2026-11-03-index-incremental-proposal-review.md#10-长期方案收敛文件版本化分批暂存原子可见)。

## 1. 结论与审计身份

**不能把新方案写成“完全沿用旧 ADR，无需新决策”。**
日常更新从完整私有库路线转为文件版本化 staging，需要明确调整 ADR0034/0042 的适用范围；
编辑后的索引恢复还必须衔接 ADR0005 的现行水位协议。
官方编译器权威、完整结果、输入新鲜度、取消终态、使用权及默认无 RSS 预算继续保留。
没有证据说明必须推翻这些约束，或需要重启暂停的编译器语义 facts 路线。

审计对象分开记录：

- 已部署/诊断固定源码：`298d65f5d7f796c347fe8be5c739e428066489d8`，
  本机 `/private/tmp/arkts-zed-ui-main-20261103-src`；沿用前轮已核实的构建身份。
- 当前工作树：`fix/zed-navigation-ownership-20261101`，HEAD
  `b57ad075a80fdc2169189ba7da17fc6bb98a0866`，含原有未提交修改。
  **它与固定诊断版本不是同一源码快照，不能称本轮重新核实了远端最新 main。**
- 建议目标：SQLite 文件 facts 版本化、有界 staging、原子可见 manifest、快照查询、增量资格与 GC。
  仍是建议；本次“ok，审视历史ADR”不等同于审批新架构。

固定树42份 ADR 共5844行已归档，做全文关键词扫描和相关决策条款定向审阅。
10份相对当前树内容不同或缺失：0005、0010、0013、0022、0033–0037、0042。
当前树没有0042，不能仅查当前 `docs/adr/README.md` 就漏掉已部署版本的决定。
下表和行号均指固定298d版本；证据清单记录两棵树的 SHA-256。
这不是对5844行逐句重新审批，也不是全仓库行为正确性证明。

证据目录：`.bench/index-incremental-adr-audit-20261103`（下称 A）。
`adr-inventory.json`保存全文/状态/行号/双树哈希；`decision-keyword-scan.json`保存检索命中；
`mapping.json`保存逐ADR判定；`preservation.json`记录本轮改动边界。

## 2. 必须显式处理的存储与协议差异

### A1. ADR0034/0042 的完整私有库单位与新文件版本单位

固定[0034 决策1、3、4、7](https://github.com/liuhui-code/arkts-language-server/blob/298d65f5d7f796c347fe8be5c739e428066489d8/docs/adr/0034-private-catalog-publication.md#L19-L65)
规定控制库选活动物理库、完整私有库发布、比较构建起点、普通增量先清复用指纹。
其[取舍 L78–79](https://github.com/liuhui-code/arkts-language-server/blob/298d65f5d7f796c347fe8be5c739e428066489d8/docs/adr/0034-private-catalog-publication.md#L78-L79)
明确因 PK/FK/FTS/查询迁移范围而选择独立库，接受双份空间成本。
固定[0042 §3、M4](https://github.com/liuhui-code/arkts-language-server/blob/298d65f5d7f796c347fe8be5c739e428066489d8/docs/adr/0042-bounded-catalog-streaming.md#L40-L49)
继续以完整私有 DB 发布；M4 L129–134把按文件复用/增量及分片留作后续决定。

新方案要求日常变更只写变化文件，并在同一 data DB 发布 manifest/资格；
这扩大了旧方案明确没有迁移的 schema/读侧范围，不能只称“优化 apply_batch”。
但0034 L15–17**明确保留普通增量事务**，它并未规定所有物理 DB 永远只读；
因此不应把0034整份废除，也不能把文件 facts 不可变误写成 DB 文件不可变。

建议由一份新的 Proposed ADR **局部替代/扩展**：

1. 日常更新以文件版本/逻辑组为原子可见单位；冷建库、不兼容迁移、损坏恢复仍保留完整私有库路线。
2. `catalog-state.sqlite3`只保留物理 store 选择等明确职责；data DB 内 manifest、可见 facts、
   published generation、覆盖/拒绝资格由同一事务发布。跨库冗余信息必须定义非权威性或恢复规则，
   不能假定 control/data 两份提交天然原子。
3. 逐项迁移 URI/ordinal 主键、FK、全部查询/计数/FTS、旧数据 unknown 资格和恢复路径；
   活动版本过滤必须发生在 LIMIT/排名之前。
4. 普通增量不再以清空唯一全库 fingerprint 表示全部资格；需原子维护可增量更新的 manifest/完整性元数据。
   文件内容键和新资格的精确格式仍待正式设计，不能仅宣称已有 refresh 支持。
5. **完整私有库发布保留整个 parent/store/generation 比较。**
   仅文件级增量组可在核实 read-set/namespace 独立性后重基准；不得把“无关文件可重基准”套给旧整库结果。
6. staging 批次提交不是发布；原子可见、完整性检查、持久化、单一终态及不覆盖现用库的约束继续继承。
   需要为新路径明确验证和 checkpoint/崩溃恢复策略，不能默默删除旧保障。

代码一致性证据：固定 `crates/index-sqlite/src/catalog_store.rs:38–56` 在 publication 共享锁内
选库并先 `invalidate_fingerprint()` 后 `apply_batch`；`lib.rs:167–219`仅检查新 generation
大于当前值，没有新方案的 expected-base/read-set CAS。
前轮 E/native-01、02 已示范较大编号的旧基态写入可被受信 native API 接收，
**未证明公开 LSP 已返回旧答案**；它证明不能把现 API 当新并发提交协议使用。

### A2. ADR0005 的编辑后恢复不是“文件写完即可 READY”

固定[0005 Decision L481–490](https://github.com/liuhui-code/arkts-language-server/blob/298d65f5d7f796c347fe8be5c739e428066489d8/docs/adr/0005-index-proof-trust-boundary.md#L481-L490)
要求编辑后 committed generation 超过编辑时 accepted/committed/building 最大水位；
打开前状态抓取失败时，还须观察编辑后实际启动的 catalog 及其终态。
固定 `src/semantic/references/reference-index-freshness.ts` 的 `changed:51`、
`catalogStarted:79`、`catalogReady:91`、`beforeSearch:108`实际执行此协议。

反例：旧 catalog 在编辑前读过A；编辑后只因一个新批次提交或 generation 数字增大就解除根 dirty，
并不能证明A的新内容已纳入。另一个反例是“编辑再撤销，facts相同所以不发任何新确认”：
原 dirty token 仍在，内容复用不自动满足现行恢复门槛，可能一直走完整回退。

**这是新方案的协议衔接阻塞项，而非已经证明必须降低旧安全合同。**
正式设计必须选择并验证其中一种：保留现行外部水位/开始及终态协议，
在完整核验覆盖该输入后发布相容的新资格；或局部修订0005相应段落，
用 store/domain、输入 revision、覆盖范围和已提交 manifest 的收据替代数值猜测，并迁移全部消费者。
两者都不能仅推进数字、把 SQL staging commit 当 published、或移除 dirty map。
新收据须覆盖 No-op、删除/拒绝、事件期间新增变化、打开前抓取失败及跨进程竞争。
本次不选择未经验证的具体 wire 格式，也不修改新鲜度合同。

### A3. ADR0042 已经修订过的重复解析不应再次误判为冲突

[0042 §4 L55、78–90](https://github.com/liuhui-code/arkts-language-server/blob/298d65f5d7f796c347fe8be5c739e428066489d8/docs/adr/0042-bounded-catalog-streaming.md#L51-L90)
已明确：0034“复用仍扫描、解析”描述旧实现，hash-first完整命中可免解析；
完整键、scan-complete、最终 length/mtime/SHA fence 仍保留。
**免重复解析已有明确后继依据，不需要重新批准同一个例外。**
但 hash-first 整库命中不等于按文件增量 miss、版本化 staging 或 per-file GC 已获批准/实现。
0042首片“不改schema”是该阶段范围；新方案需新决策扩大范围，不是偷偷绕过它，也不是永久禁止迁移。

## 3. 必须保留的分层边界

| 容易混用的概念 | 历史约束与本方案边界 | 判定 |
| --- | --- | --- |
| 文件词法 facts / 编译器语义 facts | 0005 L470–479、L698–739：候选及原始绑定拼写不证明最终语义；0008 L1–8、L109–139暂停S02/S03，0009 L3/9–21有先决条件。此次只能版本化已有 native lexical facts，不能接失败语义投影、第二TypeChecker或借用Proposed语义generation作为批准。 | 条件相容；越界则冲突 |
| 文件 facts 复用 / 最终答案缓存 | 0004 L14–47对完整编译器结果执行现行root/overlay失效。新 facts 可复用，不自动缩小结果缓存范围，不重启无关TODO。 | 保留0004 |
| 原生文件失效 / 语义影响范围 | 0010 L9–16、0019 L51–69：语义范围先模块/target，缩小须依赖证明；0010追加还有保守跨文件诊断。纯单文件提取可局部重做，但查询时绑定、别名及删除传播仍须用当前可见集合重算/验证。 | 不能以文本局部性推导语义局部性 |
| 发布代 / 磁盘新鲜度 / 语义READY | 0005、0009、0019、0024：三者不同。manifest根证明DB内部版本，不是磁盘目录快照或完整Program范围；文件数20K限制及30K完整引用/重命名缺口不因此消失。 | 必须分别命名/记录 |
| 内容键 / 实际输入证明 | 0019 L40–42、0025 L24–26、0035 L38–50、0036 L33–51：可复用匹配的不可变产物；当前路径/字节证明重新实际取得。旧请求、旧resolver/SDK/config witness不得重新盖戳复活。 | 相容但需明确owner/domain |
| DB manifest / 目录身份观测 | 0039 L4、L10–17已拒绝跨请求目录内容复用候选，0037 L77–104仍保留原租约内独立终检。持久化manifest不能当作重启该拒绝路线或省略realpath/符号链接检查的理由。 | 不能隐式重启Rejected决定 |
| 合并watch hints / 合并权威文档事件 | 0006、0025、0035及0037保留mutation、close/reopen和文档生命周期屏障。按URI合并后台待办不许可吞掉关闭、同版本重开或将旧请求变新请求。 | 只合并可证明等价的后台意图 |
| native staging取消 / compiler同步取消 | 0023 L29–42、0031 L29–47：已进入原地Program/checker同步的普通取消先清算，绝对截止保留。独立native staging可废弃其私有版本；不能沿此规则在任意同步点抛取消或退役语义Worker。 | 必须分取消域 |
| 单写者 / 跨进程竞争 | 0034 L38–39、0042 L44仍保护跨窗口。每工作区单任务只约束本owner，不能代替OS锁和data事务内CAS。 | 必须跨进程证明 |
| 新native队列 / 既有前后台队列 | 0006、0027、0030/31、0037仍有公平性、mutation/global barrier；0032–0040保护独立人工请求。控制面不能被同步解析堵住，也不能为native索引重写语义请求契约。 | 新队列须声明归属，不一统替换 |
| 行版本GC / 整工作区缓存GC | 0028 L41–79、0034 L47–54负责受管目录、使用权和DB/WAL整组退役。新版本GC是库内维护，需另定义可见/暂存/退休状态、活动任务引用和崩溃孤儿处理，不以TTL证明owner死亡。 | 扩展；不是替代0028 |
| 有界队列 / 默认RSS驱逐 | 0029 L21–37、0042 L7/28–38：背压、payload释放、正常GC不等于恢复默认4GiB预算；保持用户显式预算语义和默认热态可用。 | 保留0029 |
| 机制回归 / 产品验收 | 0007 L5–10、0013、0042 M0–M4：500ms是体验目标；trace用于归因，普通计时看尾部。模型/局部GREEN不能替代30K、Windows、UI及耐久；不追加新硬线。 | 不改历史证据或门槛口径 |

读事务下删退休行是否安全与“什么时候物理归还磁盘”也是两件事。
新GC必须同时处理SQLite读快照、可能尚未进入事务的任务/缓存引用以及长reader导致的WAL保留；
不能只用 reader lease 数推断所有行均不可回收，也不能因旧reader能读旧页就不再约束WAL增长。
Windows占用、后台checkpoint、句柄关闭及物理库退役仍须独立验证。

## 4. 42份 ADR 的逐项映射

分类：**A**需新决策局部调整存储选择；**B**需明确协议/生命周期衔接；
**C**保留约束、越界会冲突；**O**本轮存储范围正交，不调整。
下列相容判定仅针对方案边界，不把历史Proposed改成Accepted，也不证明实现合规。

| ADR | 固定版本条款 | 分类 | 处理 |
| --- | --- | --- | --- |
| 0001 Reference search default | L13–30 | C | 完整scope、closure/full SDK、compiler最终权威不变 |
| 0002 Hot semantic context lifecycle | L59–81及顶部后继 | O | LS保留/压力由后继0015/18/19/29解释，不涉及facts schema |
| 0003 Reference verifier lifecycle | L3–25 | O | 物理Worker与项目LS生命周期已有0016/18后继，不能恢复逐批销毁 |
| 0004 Reference result cache validity | L12–47 | C | 保留完整答案缓存及原失效域 |
| 0005 Index proof/fallback boundary | L470–504、698–739 | B/C | 接通编辑后资格协议；不改候选/语义信任边界 |
| 0006 Semantic request scheduling | L5–8、19–43、61–81及close生命周期 | C | mutation/取消/公平与文档事件屏障保留 |
| 0007 Semantic readiness/500ms | L5–13 | C | 采用最新体验口径，旧硬线不重启 |
| 0008 Compiler-derived semantic facts | L1–8、109–139 | C | 暂停的S02/S03不在此次native词法schema迁移范围 |
| 0009 Semantic generation/publication | L3、9–21 | C | 仍Proposed/有先决条件，不用其术语冒称批准语义投影 |
| 0010 Incremental invalidation/overlays | L9–22、30–69 | C | overlay优先；语义/诊断影响域不随facts存储改成纯文件域 |
| 0011 Budgeted preparation/session reuse | L3–19、25–43 | O | S05否决及历史实验不复活；当前默认预算由0029解释 |
| 0012 Query routing/fallback | L37–55 | C | 不把native产物接成完整语义答案；能力独立证明 |
| 0013 Evidence/release gates | L9–28及后续收据 | C | 保留独立普通计时/正确性/源码身份及未通过记录 |
| 0014 Long-lived semantic session | L226–244 | O/C | compiler/DocumentAuthority归属不变；历史预算由后继修改 |
| 0015 Default resident optimization | L3–7、13–63 | O | 不撤销已选默认；不借历史预算恢复RSS驱逐 |
| 0016 Reference verifier SDK cache | L3–5、14–24 | O | 同isolate SDK语法与新native存储独立 |
| 0017 Shared inputs/search | L3–6、12–30 | O | 不以native per-file事实改变共享输入/完整搜索 |
| 0018 Semantic groups/initial preparation | L4–24 | O | 初始准备与组边界由0019/0029后继；不改编译分批 |
| 0019 Stable Programs/request inputs | L19–69、215–232 | C | 保留稳定组、版本分层、actual witness、联合终检 |
| 0020 Failed semantic build recovery | L21–45 | C | 不触动Registry、Worker单终态/恢复预算及旧epoch隔离 |
| 0021 SDK quality/service availability | 全文 | O | 单组件SDK问题不级联全服务；native维护不改变SDK质量分类 |
| 0022 Completion resolution lifecycle | L3–7、26–69 | O/C | 既有句柄安全回退/源身份合同不因索引换代被改写 |
| 0023 Completion cancellation/sync | L29–49 | C | 新取消域不穿透compiler同步保护 |
| 0024 Partial initialization/sync | L20–45、75–93 | C | 不再用catalog扩大交互根；保留partial的真实语义及取消接通 |
| 0025 Namespace proof recovery | L24–79、118–167 | C | parser产物与resolver证明不同；正负证明一起归属/退役 |
| 0026 Cancellation terminal handoff | L22–49 | C | 单调期限、terminal-produced/sent/received分别观测 |
| 0027 Completion details priority | L24–43 | C | 共享分类、有限优先、公平与mutation/global屏障不变 |
| 0028 Index cache lifecycle | L37–79 | B/C | 追加库内版本GC；保留整workspace安全回收及Windows保护 |
| 0029 Opt-in RSS budget | L21–46 | C | 默认null；不得以新staging/GC名义恢复隐式驱逐 |
| 0030 Completion/navigation liveness | L3–4、21–80 | C | 取消退休旧条款以0031为准；范围与有效性仍分离 |
| 0031 Cancelled read/compiler sync | L29–47 | C | 普通取消不销毁可清算同步，绝对截止不改 |
| 0032 Completion identity/inferred roots | L50–83、85–118 | C | 文件版本不冒充请求/文档/推断根身份；独立合法请求保留 |
| 0033 Client navigation ownership | L40–66 | O | 新索引不能宣称解决客户端晚到结果抢界面 |
| 0034 Private catalog publication | L15–65、78–79 | A/B | 日常增量发布单位/权威元数据需新决策，保留全库安全控制路径 |
| 0035 Unchanged-source authority | L21–51 | C | 同内容可复用状态，事件/旧请求/权威切换不能合并消失 |
| 0036 Compiler namespace recovery | L19–54 | C | 无通知变化仍拒绝旧请求，后继实际重建；不续旧证明 |
| 0037 Navigation/input validation | L53–104 | C | 同步查询原租约内终检；索引manifest不是跨请求valid=true |
| 0038 SDK component environment | L14–37 | O/C | SDK选择/组件物理域/load-owned metadata不变 |
| 0039 Directory observations | L4、10–17、63–83 | C | Rejected保持，不将其原方案正文当现行许可 |
| 0040 Client context backpressure | L40–64 | O | native变更集与客户端请求生产背压不同，不能宣称已修UI |
| 0041 Windows index storage location | L20–40 | C | 同一选定cache根/namespace，GC沿用；不切根或复制活动WAL |
| 0042 Bounded catalog streaming | L21–49、55–90、129–135 | A/C | M4新决策扩展；有界所有权/hash-first/fence与完整控制路径继续保留 |

## 5. 历史 ADR 之间的表面冲突与文档欠账

多数看似矛盾的旧句子已有明确后继，应读修订链，不能随意选较方便的一句：

| 旧句子 | 已有后继 | 结论 |
| --- | --- | --- |
| 0003逐批终止Worker | 0016 L3–5；项目LS逐job dispose又由0018 L21–24按迁移范围修改 | 历史有明确修订，不是新缺口 |
| 0018两个交互组加一槽、默认4GiB | 0019 L25–31改驻留策略；0029 L39–46撤销默认预算，显式预算保留 | 不能重新启用旧默认 |
| 0006旧补全详情失效错误 | 0022 L5–7明确改变旧详情合同 | 仅特定旧item安全回退，不是吞所有错误 |
| 0024/0030普通取消后短静默退休 | 0031 L42–47明确修订已进入compiler同步的普通取消 | 按新边界清算，真正不返回仍有绝对截止 |
| 0034热复用仍解析 | 0042 L55明确免重复解析的后继决策 | 免解析不等于已做文件级增量 |
| 0016等旧逐次500ms、0007旧550ms/P95 | 0007 L5–10及0027/0029等明确记录维护者最新口径 | 500ms体验目标，不恢复另一条硬线 |

仍有**文档索引/状态同步欠账**：例如0034页首保留“回归未执行”，正文已有后续分版本验证收据；
0042正文记录M1/M3已实现而完整门禁未完成，索引摘要未充分表达此区别；
当前工作树目录索引没有固定版0042。读者容易误把页首历史状态当所有后继版本状态，
或将后续局部通过理解为整份Accepted。
这些是文档表达风险，不证明产品行为冲突。本次保存证据并指出，不擅自改写历史状态、
同步整棵旧分支文档或追认审批。后续集成时应保留日期/版本、明确实现与验收分别是什么状态。

## 6. 新 ADR 应写清什么，以及开发前的门槛

建议新增**一份 Proposed“文件版本化索引的增量维护与原子可见性”**，
编号待集成时核对分配，本次不占号、不改历史批准状态。它必须列出：

- **局部替代**0034/0042哪些存储单位、fingerprint及发布职责；哪些仍用于全库bootstrap/恢复。
  若改外部水位，明确局部修订0005相应段和所有兼容消费者；不是只写“遵循旧ADR”。
- **继承不变量**：native仅候选、compiler权威、overlay/current input、单终态、原恢复约束、
  原租约内最终校验、完整覆盖、默认无RSS预算、同cache root及受管生命周期。
- **六类独立身份**：输入revision、文件facts内容版本、解析/配置域、published index generation、
  compiler/语义状态及Worker epoch；不要求各自都新增计数器，但不得共用一个数字充当全部证明。
- **完整发布数据模型**：含大文件和大变更组映射staging、各表FK/FTS、资格、No-op、删除/拒绝、
  reader快照及过滤、read-set CAS/受限重基准、跨库恢复、迁移与回滚。
- **维护边界**：控制面可运行、有限工作窗口、持续输入进展、取消前后终态、孤儿GC、长reader/WAL、
  Windows占用以及关闭后禁止重新创建存储。物理分片不是前提，先证明单库版本化方案成本。

开发顺序应为合同/失败回归 → schema/查询/发布/资格的纵向闭环 → 事件增量调度 →
取消/重基准/GC与恢复 → 完整规模和真实平台验证。
可以小切片实现，但不能先把旧资格清掉、先暴露半版本，再等下一阶段补完整性。

必要的可测反例（新设计未实现，本轮**未运行**）：

1. 改1文件不重写未变facts；相同内容/不同mtime取得新证明并结清正确dirty token，旧请求仍失败。
2. 负解析候选创建、移动恢复、删除barrel、漏watch、规则/配置变化后完整恢复；未知覆盖不能报完整。
3. 巨型合法单文件/大组中途提交、取消、崩溃：读者始终只见旧完整或新完整，不见混合；
   隐藏版本不能占LIMIT/FTS排序，旧reader和新reader各自资格一致。
4. 同文件跨窗口冲突拒绝；确证独立文件组可受控重基准；旧完整私有库仍受整个起点fence保护。
5. control/data提交边界强杀、旧schema、未知字段/拒绝项和新producer：重开正确，绝不空库冒成功。
6. 连续编辑一个热点不饿死独立文件；native取消不退役健康语义Worker，不改变compiler同步清算合同。
7. 孤儿、退休行、长reader和Windows占用GC：不拆删WAL、不凭TTL断言失主；实际磁盘/WAL峰和尾延迟可解释。
8. 适用完整检查及同输入规模对照、30K协议/真实UI/单会话耐久分别报告，保留既有失败和未覆盖限制。

## 7. 本次验证与限制

本轮只新增审计报告、追加既有评审/待办的关联和建议边界，未改产品或历史ADR正文/状态。
执行了42份清单/双树哈希核对、条款/调用点审阅、本地链接与文档差异/保留检查。
没有运行pnpm/cargo、重新构建、部署、两小时或UI测试，不把前轮小模型当新架构GREEN。
前轮原始反例仍见 E=`.bench/index-incremental-review-20261103`；
固定298d诊断及旧失败不变，R-13和其他功能缺口仍OPEN。
