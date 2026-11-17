# 索引重复写入方案设计评审

日期：2026-11-03。**结论：需要修改后采用，不能按现文直接接线实施。**
以下是评审意见和修订建议，不是已批准架构；未修改产品代码及其schema/配置/运行安装，未合并发布。
沿用R-13，不另建远端或重复问题；[前轮诊断](2026-11-03-index-rewrite-root-cause.md)及原77代失败证据保留。

## 1. 基线与证据强度

- 固定诊断/实际安装产物：`298d65f5d7f796c347fe8be5c739e428066489d8`；native SHA256
  `4dce8fc2ea2a8a3317d789da0aa1bdd539a67538909545994c7b8a187851a9b5`，与前轮一致。
- 当前工作分支`fix/zed-navigation-ownership-20261101`，HEAD `b57ad075a80fdc2169189ba7da17fc6bb98a0866`。
  开始时39个已有脏文件，包含前轮文档及其他任务，均保留。
  工作树的workspace-symbol改动是缓存目录/告警接线，不是本方案的变更集实现。
- 当前HEAD没有固定298d的CatalogBuildSession/hash-first流水线，ADR0042文件亦不在当前分支；
  原生相关差异43文件。实现前须选择含0042的基线，不能将当前脏树当已部署298d。
  **schema、apply_batch、词法facts等公共约束可复用；新流水线位置以下按298d标注。**
- `E=.bench/index-incremental-review-20261103`。identity.json保存分支、已有差异哈希、固定源码身份；
  evidence/source-review.json保存20个相关源文件片段、准确行号及当前/固定文件哈希。
- 本轮两次原生公开NDJSON短测各4类对照，实际3.201/3.096s；两次5项SQLite模型0.299/0.356s。
  都在E/cases隔离夹具，不是公开LSP、UI、30K性能或两小时耐久验收，不涉及SDK编译。
  四类各两次相同结果；模型只检验SQL合同，不代表产品已实现修订设计。

## 2. 逐项判断

| 原建议 | 判断 | 需要补齐/收紧 |
| --- | --- | --- |
| ① URI变更集、revision、单写、内容判重 | 原则可采用 | 区分接收事件序号、真实内容/namespace revision、数据提交代；按当前磁盘和身份合并，不是盲信最后事件。进程内单任务不等于跨进程全局单任务。 |
| ② 文件增量、删除、有限传播、维护资格 | 需要修改 | 当前facts大部分确为本文件词法事实，但解析后的绑定/候选不是。schema无每文件内容manifest；现有refresh不能提供完整资格原子提交。 |
| ③ 在安全边界作废过期工作 | 需要修改 | 当前refresh同步占据协议dispatch；新控制消息无法及时被执行。须有独立可运行的控制面、任务身份和取消状态；全局revision取消会误伤稳定文件。 |
| ④ 事务外解析、同DB提交facts+资格、独立读事务 | 架构方向可采用 | 必须加入expected-base CAS、当前物理库重选/锁顺序、权威资格迁移及崩溃矩阵；不能只比new generation更大，也不能继续信任旧control fingerprint。 |
| ⑤ reader/WAL/退役和全库回退 | 可采用并保留 | 已有读事务/租约是基础；必须约束读事务跨await、checkpoint阻塞、Windows删除失败及最后reader关闭后的重试。 |
| 分两步 | 顺序基本合理 | 两步前先冻结资格/API合同；第一步不等于消除有效单改的全库写入，第二步还应分存储资格与调度接入验收。 |

## 3. 阻塞直接实现的六个缺口

### B1：现有schema没有所需的权威manifest/资格

`crates/index-sqlite/src/schema.rs:12–30`的metadata只有workspace_identity/committed_generation；
文档只有URI、generation及词法支持标志，没有source_digest、逐文件准入状态或完整快照资格。
完整键在另一数据库`catalog-state.sqlite3.fingerprint`（catalog_control.rs:184–223）。
CatalogStore::access:38–56先在control清键，再执行data事务；失败时丢复用是保守行为，不是跨库原子性。
CatalogBuildSession::begin:25–61仍从control取键。

因此不能只给refresh增加几个参数便说“事实+完整指纹已经原子更新”。需要新data schema和明确迁移：
权威文件manifest、数据代、覆盖/拒绝信息与内容键在同一data事务；control只负责物理库指针及发布边界。
不能要求两个库各自写成功才拼出权威资格，不能对旧facts直接盖当前源码digest。
当前完整键是有序URI/digest的SHA（catalog_fingerprint.rs:45），**无法O(1)修补这个普通SHA**；
最小版可从小型manifest行重算根，保留O(N)元数据工作。未经必要性证明不引入Merkle树。

### B2：更大的generation不证明解析基于当前输入

`main.rs:57 RefreshParams`只有generation/changed/removedUris；
`index-core/src/lib.rs:881`解析文本后收集replacements，`index-sqlite/src/lib.rs:167–219`在BEGIN IMMEDIATE内只重检new > current。
已有generation-race回归能拒绝低代迟交，**不能拒绝基于旧状态但编号更高的提交**。

真实双进程反例（native-01/02/stale-base）：两者始于数据代1；B将磁盘新文本提交为代2；
A再以代3提交预先捕获的旧文本，API接受，查询旧类成功，而磁盘仍是新类。
另B的status仍报2，实际查询servedGeneration已是3。
这是**底层受信文本API不具备新维护器所需前提**，不是证明当前公开LSP会交付旧答案。

必须在持有发布shared锁、重选当前物理库、取得data写事务后，对
`store identity + base data generation + extractor/policy domain`作相等比较，失败返回conflict并重新取当前输入。
跨进程事件序号不能直接当数据generation；后者从当前DB分配。status/资格也不能仅靠Runtime缓存。

### B3：只维护fingerprint还不够，必须迁移新鲜度确认协议

`src/semantic/references/reference-index-freshness.ts:51–140`依赖dirty token、catalog starting/ready和代号推进。
若新设计的内容判重保持数据代不变，却只省掉catalog，没有“此次提示已核验”的收据，dirty可能一直不解除。
相反，只因别的文件/进程推进数据代就解除所有dirty，也会过早恢复资格。
**No-op确认、部分待办完成和覆盖到哪个输入revision必须明确，不能仍只判断数字变大。**

watch是提示，不是完整磁盘变更日志。原生反例：新增Silent.ts但不通知/刷新，裸native查询仍complete=true，集合不含Silent；
显式catalog扫描后才纳入。此接口的complete描述缓存模型，不独立证明全部磁盘最新；没有测公开LSP错误结果。
因此必须保留请求级物理输入/namespace终检、漏事件恢复和全范围资格证明，不能把本地revision或缓存键当替代。
配置/目录不确定、监听overflow/reconnect、重开和终检发现漂移须进入reconcile，扫描差异后只更新实际差异facts。
**证明不足时完整查询仍保守拒绝/走既有语义路径，不输出不完整成功。**

### B4：控制面活性没有被“事务外解析”自动解决

现有`Runtime::dispatch("refresh")`（main.rs:201–249）直接调用Index::refresh，解析和SQL都同步执行，期间不处理后续控制请求。
事务外解析只是缩短SQL锁，不等于取消消息可运行。

实测一个520,053B、未超过2MiB扫描准入的源码，产生80,006条occurrence；refresh之后立即发送status，
status分别在424.09/434.53ms、且refresh完成后才返回。这不是500ms门禁失败，只是调度顺序的证据。
不能据此给更大文件推算超时，但不能把这个API原样放进“可及时取消”的设计。

解析/写入需成为现有native后台任务机制的一种，控制线程不做长解析/SQL；writer连接由一个任务所有者使用，
独立读连接不共享可变事务。任务取消须与查询token取消分离，不能因为一次前台请求取消就销毁共享维护任务。

### B5：全局revision取消与持续进展存在反例

设B稳定，A每次都在B提交前编辑。若任何全局revision变化都取消B，B永远无法完成；
对30K全库任务，持续改变任何已读输入也可能始终无法得到最终全局当前证明。
这不是增加sleep或无限宽限可以解决的。

需要按任务read-set/文件revision判断过期；每URI合并最新事实、公平挑选稳定工作，冲突重试不无限占队首。
未完成/未知范围存在时不得宣称当前全局READY。稳定文件可以推进缓存模型，但不能借此将完整查询裁成部分成功。
**可承诺稳定输入后的最终完成、无关稳定任务和前台进展；不能承诺任意持续改写下总能发布“全部最新”。**

特别地，纯重复通知和真实同字节重写不同：后者改变mtime，旧SourceStamp仍应被拒绝。
`catalog_source.rs:30–40`及hash_fences.rs:83保护长度/mtime/SHA边界；判重不等于给旧witness换新戳。
如欲允许内容一致的证明续期，需另行证明读取/替换竞争并修订ADR，本方案首版不做。

### B6：单文件不等于小事务，大变更集也不能机械分块提交

当前apply_batch是整个RefreshBatch一个事务，没有普通catalog的64文档/32,768估算行/8MiB写预算。
80,006 occurrence反例证明有效大小的单文件也可超过普通预算。替换/删除旧大文件还会级联删除旧facts及FTS，
**预算必须包含旧事实删除及索引成本，不能只数新payload或文件数。**

当前PK为URI/ordinal；私有库的分批writer不能直接用于活动库。模型live-chunks在第一块提交后，reader读到旧代1和只剩New0的半文件。
这是被否定的实现反例，不是现有产品做了这种提交。
需要明确小逻辑单元原子事务、关系操作成组、大单元安全回退，以及何时确需版本化staging（见第7节）。

## 4. 文档facts独立程度、跨文件和删除传播

**已证实可复用的是持久化的本文件词法facts，不是已解析的完整语义依赖图。**

- `index-core/src/document_metadata.rs:12`只从Document URI/text构造symbols、exports、occurrences、aliases、bindings及可选class facts；
  index-core/src无文件/环境读取。缓存键仍需URI、extractor二进制/算法及schema，不能仅用文本SHA。
- `schema.rs`的bindings只存imported/local/source_specifier/kind；class_binding_storage.rs:94读取时重新置Unresolved，
  不持久化resolved_source_uri/external identity。lib.rs:525–526按本次document集合及权威source resolutions解析。
- `documents`是事实的所有者，各表ON DELETE CASCADE及FTS删除触发器保证删除本文件事实；
  不应把其他消费者的合法导入文本一并删掉。来源消失后它可能未解析；恢复后又可能有效。

native-01/02/lexical-lifecycle实测：

| 变化 | 存储/查询观察 | 设计含义 |
| --- | --- | --- |
| 只给A.ts加注释，Base位置移一行 | Consumer仍为文档代1，bindings行未改；查询身份位置改变，仍找回A/Barrel/Consumer | 无需重解析Consumer词法facts，但不能复用旧锚点身份/查询结果。 |
| 删Barrel，再恢复同URI | Barrel事实删除；Consumer原bindings保留；恢复后原链再次可解析 | 删除本地facts与撤销派生绑定是两件事，恢复必须重建查询视图。 |
| 加Barrel.ets与Barrel.ts并存，再移除 | native保守解析从unique变ambiguous再恢复，Consumer facts不变 | namespace变化会改变负向/唯一性证明；不等同ArkTS编译器也判断歧义，真实resolver仍权威。 |
| 无通知新增Silent.ts | 裸native缓存集合暂未纳入；扫描后纳入 | 不能由watch序号推出完整磁盘覆盖。 |

由此建议首版不再造一套持久化语义依赖图：本地facts按差异替换，派生解析/候选/锚点缓存按实际namespace和receipt退役，
保持官方语义验证。alias、barrel、循环导出、package/SDK目标、路径映射、拒绝/未知class facts均需相应回归。
Native读取document URI集合仍随规模增长；“SQL只写k文件”不是所有索引查询或语义成本都变成O(k)。

## 5. 官方方案参考：采用机制与适用边界

- clangd按文件拥有工作并合并过期写，保留读前写的顺序；适合借鉴队列所有权及消除无效工作。
  不宜把其preamble/AST线程模型原样移入我们的native词法存储。[线程设计](https://clangd.llvm.org/design/threads)
- clangd将动态文件facts与后台索引分层，并缓存每文件索引；支持文件粒度复用。
  这不证明本项目必须现在更换物理存储为shard。[索引设计](https://clangd.llvm.org/design/indexing)
- rust-analyzer用revision感知陈旧计算并在边界转成取消结果；借鉴显式失效边界。
  不复制panic取消穿过SQLite COMMIT，也不将任意全局变化当所有文件都需重建。[取消设计](https://rust-analyzer.github.io/book/contributing/architecture.html#cancellation)
- SQLite独立读事务提供稳定数据快照；一个连接的多条自动提交SELECT不是同一快照。
  这解决DB内部一致性，不提供源码新鲜度或业务expected-base。[隔离](https://sqlite.org/isolation.html)、[事务](https://sqlite.org/lang_transaction.html)
- WAL下即使ATTACH，也没有多个数据库作为整体的原子性；完整资格不能依赖两个独立提交同时成功。
  [ATTACH约束](https://sqlite.org/lang_attach.html)
- 长reader会限制checkpoint；PASSIVE不等reader，FULL/RESTART/TRUNCATE可能等待，不能在前台每次强制截断。
  [WAL](https://sqlite.org/wal.html)、[checkpoint API](https://sqlite.org/c3ref/wal_checkpoint_v2.html)

Context7已对SQLite、clangd、rust-analyzer尝试resolve，均HTTP传输失败；没有声称query-docs成功。
以上直接查阅用户给定及补充官方页面，链接及适用边界保存在E/evidence/official-references.json。

## 6. 修订后的最小完整设计（仍为建议）

### 6.1 三种时钟与两种资格，不混用

- event sequence：记录收到什么、使旧请求失效，不代表内容变化或跨进程版本。
- maintenance input identity：当前磁盘/namespace、parser domain的已核验事实；overlay权威与磁盘索引分开。
- data generation：在data事务内由当前基代分配，配合物理store identity，作为一致快照版本。
- data model完整性：某个manifest所对应的facts是否完整、一致，区分parsed/rejected/policy-skipped/unknown。
- 当前请求资格：上述模型是否覆盖本次需要且仍有当前物理输入证明；不能由“有一个完整旧库”推出。

schema建议新增权威file manifest（URI、源码digest、准入/事实状态、extractor domain、事实成本等），
data内qualification（store identity、data generation、manifest根、覆盖及配置/namespace证明）。
mtime/长度是重读witness，不等于内容键，更不能作为免hash证据；物理根/文件身份按现有路径合同检查。
不因SDK配置变动机械重解析所有纯词法facts；只有事实提取器输入变化才失效这些facts，成员/解析配置则重核scope/派生视图。

### 6.2 事件、reconcile和后台任务

1. 保留每URI create/change/remove提示及namespace/config不确定性；按当前磁盘核实最终存在、内容与身份。
   delete后create、create后delete、case-only rename、移动成对事件、离线/权限失败不能用最后type盲目处理。
2. 复用已有有界pending思想；超量转root/namespace uncertain并扫描，不丢删除。进程内一个串行写所有者，解析有界在途。
   内容判重只免facts写入；真正的事件及旧请求失效不能被吞掉。无DML时返回覆盖本轮提示的No-op收据。
   最小版可以保留小型资格元事务并推进代号，明确“免写”指facts免写，而非承诺SQLite零写。
   若要求No-op连元数据代也不推进，则必须先迁移freshness消费者，不能继续套用旧的greater-generation确认。
3. 校验失败、监听丢失/overflow/reconnect、配置/目录事件、重开及缺少可信全范围证明时，reconcile枚举/hash并对比manifest。
   可扫描N、仅解析/写差异k；不因扫描发现一项变化就重写N。首版允许O(N)发现/最终校验，不能为宣称规模无关而删fence。
4. 若当前完整查询没有可复用的全范围输入证明，不得直接信任delta/watch；继续既有语义路径或明确不可用，同时排队恢复。
   背景补齐不应成为所有局部前台操作的等待屏障。SDK/semantic覆盖不足与native资格仍分层。
5. 待办按URI及关系操作公平合并，旧任务仅因其实际输入失效而作废。持续变动文件不无限占队首，稳定输入停止后能完成。
   在永不稳定的冷全库上不能保证全局最新READY；已有基库可保留稳定文件进展，但未覆盖范围仍不可作完整结果。

### 6.3 提交、读取及控制库发布顺序

```text
事务外：读取并验证输入，解析不可变facts，记录expected store/base/domain
增量提交：control shared → 重选当前库/持有使用权 → data BEGIN IMMEDIATE
          → 相等CAS + 输入资格检查 → facts删除/替换 + manifest + qualification
          → 提交前fence → COMMIT → 带覆盖范围的receipt → 释放锁
读取：control shared下选库并持有reader lease → 释放control锁
      → data读事务内读取facts与qualification → 结束事务 → 现有请求终检
全库：私有分批构建 + 校验/FULL封存 → control exclusive
      → 比较物理起点及data基代 → 原子切指针 → 安全退役
```

- 所有写者遵循一致锁顺序；解析、等待前台补充解析及长扫描不占control exclusive。
  增量持shared直至data提交，防止发布已切库后继续修改旧物理库；data事务序列化写者，CAS防旧基代覆写。
  完整性证明不足时仍保留必要全范围校验；其锁持有和源I/O时长单列，不能只凭事务外解析承诺提交恒短，或为短锁偷移/删除fence。
- “单写”明确为进程内维护队列 + 跨进程短事务互斥，不承诺所有窗口只有一个正在解析的任务。
  跨进程私有构建可能重复，最终比较基代拒绝输家。若要全局维护去重，需要独立OS维护租约/通知合同；
  现有publication锁不免费提供，不能长时间拿exclusive来实现。本次首版不据此引入全局broker。
- read事务只活在短存储操作内，不跨LSP await、用户空闲或整个会话；多次Native调用用版本收据校验，不以长事务钉WAL保一致。
  不共享同一可变Connection做并发读写。连接可复用，事务不可永久复用。
- 新catalog/read选路从data事务读权威资格；control内旧fingerprint不得继续成为另一个权威。
  新旧schema/写者必须隔离或显式拒绝：推荐新schema缓存域冷建一次、保留旧域供原安全GC，不能让旧二进制继续写新表旁的旧事实。
  具体cache-key/GC格式兼容属于迁移片，不在本次改代码。
- 原Data/Control之间的最终source fence仍保留；SQL事务不使文件系统也成为原子快照。
  文件可能在检查后再次变化，仍需原输入证明与公开请求最终校验，不宣称消除了这类竞争。

### 6.4 取消与提交状态

任务要有独立attempt identity，至少区分queued、prepared、writing、committed/no-op、obsolete、cancelled、conflict、failed。
在解析任务前后、写锁前、事务内安全DML边界和提交前检查失效；真正取消未提交事务必须rollback。
已经COMMIT不能再报告“零写入cancelled”，应保留提交receipt，若当前输入又变则继续标dirty、调度后继并拒绝旧请求结果。
每attempt单一终态；旧attempt不能确认新dirty token。冲突/重试消耗同一既有截止时间，不无限循环或重置超时。

### 6.5 恢复与兼容矩阵

| 退出/故障点 | 要求 |
| --- | --- |
| data事务COMMIT前取消/异常/进程退出 | facts、manifest、资格一起回滚；不能留新资格配旧facts。 |
| COMMIT后ACK前退出 | 重开以data记录为准，不因ACK丢失重复写；重新核验当前源码后确认当前资格。 |
| 私有库封存后、control切换前退出 | 旧指针仍有效，草稿按lease/SQLite锁回收，不能误当已发布。 |
| control切换后退出 | 只打开其指定完整库并核验identity/schema/generation；缺失/坏控制行不回滚legacy或创建空库。 |
| 两写者竞争或另一窗口先提交 | CAS/发布起点不符则conflict，释放资源，基于当前状态有限重做，不因编号更大强行写。 |
| 源路径离线/权限不明 | 不当删除证明、不清库；标资格未知，保留旧数据及恢复机会。 |
| Windows旧文件/目录被占用 | 跳过/有限重试，最后使用权解除后回收；DB删不掉不能继续删其WAL，不unlink稳定锁文件。 |
| 升级schema/producer或新旧进程并存 | 新域/不兼容拒绝，旧域保留；不静默重初始化或向旧事实盖新资格。 |

现有普通连接用WAL/NORMAL（store_open.rs:67–79），全库封存/控制发布有FULL边界。
同DB原子性与掉电耐久是两回事：NORMAL可能在系统崩溃后丢最近事务，但事实与资格必须同回滚；
不得声称每个增量ACK都具备FULL掉电持久性。[同步模式](https://sqlite.org/pragma.html#pragma_synchronous)
本轮只做进程退出模型，未模拟断电、磁盘满或Windows。

## 7. 大文件、staging与分片的取舍

本节保留上一轮最小交付取舍。用户随后明确要求长期方案，**长期架构建议以第10节为准**：
文件版本化staging应纳入完整目标，不能以“大文件经常回退全库”代替解决；以下不是已批准决策。

| 选择 | 本轮建议 | 理由/限制 |
| --- | --- | --- |
| 有界逻辑变更单元，一次data事务 | 首选 | 普通单源/关联rename或barrel更新，在资格和facts一起提交；核算插入与旧行删除成本。 |
| 大变更集按独立单元处理 | 有条件 | 若是独立磁盘变化，可推进已证实单元；待办/未知范围仍dirty，不能提前全局READY。必须原子成组的关系操作不得拆开。 |
| 无法在预算内原子处理的单文件/关联组 | 首版保留私有全库回退 | 正确性完整，性能限制明示；不是普通单改都fallback。实施时统计真实30K触发频率及旧facts删除成本，再判断收益。 |
| 版本化document staging | 条件必要，非现在默认引入 | 若要求超大单文件也严格分批且原子可见，当前URI/ordinal schema不足；需新版本键、active-version映射、所有查询/FTS过滤、旧版本GC。不能只加一张草稿表便认为读侧安全。 |
| 物理不可变shard | 当前不建议 | 还没有证据表明有界delta事务无法解决主要重写；需重做跨shard查询、发布manifest、reader/GC及Windows句柄。clangd有分片不等于此处必须换。 |

如果大文件回退在真实负载很常见，首版就不能宣称重复全写已充分解决；届时应先评审版本化staging，
而不是扩大隐含事务/RSS阈值或把旧文件的巨量DELETE当常数操作。

## 8. ADR对应、阶段依赖和退出条件

- [ADR0034](https://github.com/liuhui-code/arkts-language-server/blob/298d65f5d7f796c347fe8be5c739e428066489d8/docs/adr/0034-private-catalog-publication.md)决定1/3/4/5/6/7仍保留：私有全库、最终fence、完整可见、取消线性点及安全回收。
  新data权威资格需明确增补/替代“control存完整fingerprint”的部分，不能默默双权威；普通增量事务原本就被允许。
- [ADR0042](https://github.com/liuhui-code/arkts-language-server/blob/298d65f5d7f796c347fe8be5c739e428066489d8/docs/adr/0042-bounded-catalog-streaming.md)M1/M3不等于文件增量，M4明确defer facts缓存/变更集/分片。
  本建议属于新增M4设计，不能回写成先前已批准。其有界所有权、worker join、拒绝/完整扫描资格继续保留。
- ADR0005/0025的信任及namespace恢复边界、ADR0028的使用权/GC也要保持；本报告不改变任何ADR审批状态。

| 阶段 | 依赖/范围 | 可核验退出条件 |
| --- | --- | --- |
| P0 合同冻结 | 先于接线 | 定义三种时钟、资格/No-op收据、CAS、schema域/恢复矩阵、超大单元策略；将下述反例变成公开接口RED，记录父revision。 |
| P1 变更集/提前作废/观测 | 依赖P0；仍保留全库写路线 | 16重复项不变成16任务；20独立通知有界合并；旧任务安全停止并join/结清，单一终态，不误退役其他请求；取消/覆盖/清理原因有逐代收据。**不称有效单改已免全写。** |
| P2a 数据资格/事务API | 依赖P0，向P2b提供基础 | 单DB事实/manifest/资格原子，expected-base冲突、No-op、故障重开、独立reader、control发布竞争及兼容域回归GREEN。 |
| P2b 文件维护接入 | 依赖P1/P2a | 普通单改只解析/写实际差异；不再因刷新后丢键而下次全写；dirty确认覆盖正确输入，barrel/删除/漏watch恢复保持完整查询合同。 |
| P3 集成验收 | 同一最终候选 | 真实子进程LSP、相关Rust与release、完整check:fast；Mac/可用Windows原生路径/占用；随后固定30K混合耐久及资源趋势，明确UI范围。不是本轮执行结果。 |

P1保留旧reuse确认/元数据推进，直到P2的新receipt与freshness消费者一起迁移；不先部署新writer、留下旧确认逻辑。

具体验收不能只看成功率或一个总耗时：

1. **普通增量**：有资格基库下改1文件，记录解析文件/SQL触及URI/私有库分配/manifest工作；
   未变facts写0、新私有库0；同内容提示facts写0，receipt确实解除对应dirty。发现/hash的O(N)单列，不伪称规模无关。
2. **依赖传播**：A导出位置/名字、barrel、删除/恢复、歧义目标及package映射变化；未变消费者词法行可复用，
   新锚点/绑定及候选必须与冷全建和当前语义完整响应一致，未知支持状态保持未知。
3. **失效/漏事件**：同长度同mtime换字节、同字节新mtime、路径/目录ABA、无通知新增引用文件；
   不交付旧完整结果，后继有限恢复，不删校验或要求永久重启。
4. **取消/活性**：固定交错输入序列覆盖writing26/128、COMMIT前后、查询取消；记录停止后的额外写量、单一终态和资源退出。
   A持续改而B稳定时B有进展；输入停止后最新待办完成。永不稳定的范围不伪报当前READY。
5. **预算**：520KB/80,006 occurrence、删除旧大文件、成对rename及大变更集，验证原子性、背压和fallback频率，
   不能用小文件数量冒充fact成本；不能将分块半文件写进活动库。
6. **跨进程/崩溃**：两个进程基代1、B提交2、A迟交更大编号仍须冲突；raw status/结果的store/generation一致。
   data提交前后、ACK前、control发布前后崩溃均有正确恢复；旧库reader不能被删，关后可回收。
7. **WAL/Windows**：长读期间不强制TRUNCATE阻塞前台；释放读事务后checkpoint可推进；
   读事务不能跨用户空闲。真实Windows文件占用/大小写/盘符/junction/关闭重开单列，Mac结果不能代替。

500ms继续是体验目标，不新增硬线；不恢复默认RSS门限、不延长超时。完整30K引用/重命名、SDK及UI既有未闭环项不因索引局部对照而通过。

## 9. 本轮实际验证、未证实项与复跑

| 证据 | 实际执行 | 结论边界 |
| --- | --- | --- |
| native-01/02 stale-base | 两真实进程、同隔离cache | 证实旧基态+大编号可被受信refresh接收、Runtime status跨进程落后；不是公开LSP漏洞证明。 |
| native-01/02 lexical-lifecycle | 导出改动、删除/恢复、歧义/恢复、漏事件 | 支持本地facts独立及派生解析必须失效；非真实SDK完整引用/重命名验收。 |
| native-01/02 reader-lifecycle | 原生增量与私有发布，另持SQLite读事务 | 两次均旧快照不变；TRUNCATE返回[1,21,0]、WAL344600B；reader关闭并后续prune后旧文件删除。仅Mac夹具。 |
| native-01/02 dense-dispatch | 520053B源、80006 occurrence | status在refresh后返回；424.09/434.53ms为局部观测，不推算大规模性能。 |
| models-01/02 | 每轮三个子进程os._exit(42)，自动提交读及错误live chunk | models-02把data generation也随facts推进，明确隔离出control旧键；提交前退出全旧、提交后全新。初版及模型演进保留。**玩具schema模型，不是新产品实现。** |
| channel契约 | 实际native初始化/错误/terminal/退出 | 诊断传输先RED后GREEN，最终1项通过；原始warning及补齐close后的结果均保留。 |
| 现有9份Rust回归 | 静态审阅 | 未在本轮运行，不沿用历史通过宣称新方案GREEN。 |

关键现有回归（固定298d行号）：
store_contract.rs:953低代迟交、:1027查询行与版本同快照；class_binding_snapshot.rs:82不持久化解析结果、:213并发快照；
catalog_publication.rs:28旧完整库、:55增量竞争、:99大文件私有分块；catalog_session_contract.rs:103基代起点；
catalog_hash_fences.rs:83同mtime换字节；catalog_open_contract.rs:50/74/119/141缺失/坏库不静默新建。
它们没有覆盖本建议的高编号旧基态、data manifest原子资格或新No-op确认，不能用旧GREEN替代新增回归。

原生产输入rusqlite0.40.1/bundled libsqlite3-sys0.38.2；本地bundle头版本3.53.2；
Python模型/读事务观测使用SQLite3.51.0。原生运行库版本未通过协议API直接读取，勿将Python版本当Native版本。
未测断电/真正IO失败、Windows占用、新schema迁移、真实跨进程新维护协议、持续负载公平性；本轮没有它们的实现，不能称已验证。
前轮77代逐代终态缺失、物理写盘量未测的限制仍保留。

```sh
python3 .bench/index-incremental-review-20261103/scripts/test_channel.py
python3 .bench/index-incremental-review-20261103/scripts/native_review_cases.py native-replay-01
python3 .bench/index-incremental-review-20261103/scripts/sqlite_contract_models.py models-replay-01
python3 .bench/index-incremental-review-20261103/scripts/collect_evidence.py
```

使用新tag，不覆盖旧目录。原生binary在脚本启动前验SHA；全证据在E，运行与模型原始wire/结果分别保留。
identity.json、evidence/{source-review,existing-regressions,results-summary,official-references,preservation}.json及MANIFEST.json为入口。
本轮未跑全量pnpm/cargo，因为没有产品改动；没有重跑两小时或截图、没有Git提交或发布。

## 10. 长期方案收敛：文件版本化、分批暂存、原子可见

用户追加要求采用成熟长期方案，不以临时回退为目标。上一轮将大单元私有全库回退列为首版取舍，
**不应把这一取舍当最终架构**。520KB/80,006 occurrence已证明“一个合法大小文件也可能越过普通写批预算”，
长期方案应直接覆盖这种输入，而不是等它触发全库写后再说规模特殊。
本节修订的是建议目标，未实施产品或schema迁移，不改变历史ADR审批状态。

### 10.1 官方实现实际提供的模式

- clangd的FileIndex按文件保存facts；FileSymbols::update只替换指定key的slabs，buildIndex持有共享slab快照。
  后台按文件持久化缓存。借鉴的是所有权和文件粒度，不能据此声称它合并搜索结构的工作完全不随规模增长。
  [设计](https://clangd.llvm.org/design/indexing)、[FileIndex源码](https://raw.githubusercontent.com/llvm/llvm-project/main/clang-tools-extra/clangd/index/FileIndex.cpp)、
  [背景缓存源码](https://raw.githubusercontent.com/llvm/llvm-project/main/clang-tools-extra/clangd/index/BackgroundIndexStorage.cpp)。
- Lucene10.3.1以不可变segment核心、读者时间点快照、原子更新及后台merge维护索引。
  updateDocuments的可见性是整组全有或全无。借鉴“生产/落盘与发布分开、旧读者有快照、回收异步”，不建议换Lucene。
  [索引模型](https://lucene.apache.org/core/10_3_1/core/org/apache/lucene/index/package-summary.html)、
  [IndexWriter](https://lucene.apache.org/core/10_3_1/core/org/apache/lucene/index/IndexWriter.html)。
- rust-analyzer把Analysis作为不可变快照，并对旧revision计算显式取消；借鉴依赖范围及旧世代隔离，
  不将任意文件变化当所有任务作废。[架构](https://rust-analyzer.github.io/book/contributing/architecture.html#cancellation)。

这些项目不共享一种存储实现。**下述SQLite文件版本化方案是结合本仓库约束的工程建议，不冒充它们原样使用该schema。**

### 10.2 建议的正式存储模型

继续SQLite，正式迁移所有facts表及读写接口，建立：

- 文件版本记录：URI、source digest、extractor/schema域、输入证明、状态和实际fact数量。
- 版本化facts：所有符号、exports、引用、identity、alias、binding、heritage及FTS均归属file_version；
  不再仅靠URI/ordinal区分新旧内容。
- 活动版本映射：URI→当前可见file_version；删除以撤销映射/墓碑发布，旧大文件的物理删除交给GC。
- 版本化发布组/manifest：大变更组的映射亦先暂存；通过同DB提交记录的可见状态或manifest根发布，
  不能facts已分批，最后却在前台一个事务里更新数万条head。读侧必须按已发布组和本次快照选择每URI的有效版本。
- 发布资格：与活动映射在同一data事务更新的published generation、manifest/覆盖和拒绝信息。
  暂存批次的SQL事务提交不得冒充索引版本已发布。

正常更新流程统一为：

1. 核实文件输入，生成新的不可变文件版本；只解析改变的本地facts，未变文件复用原版本。
2. 新版本facts分批写入staging，落盘并不使其可见。大文件使用同一条正常路径，不要求一次巨型事务。
3. 完整消费并验证版本和变更组后，在一个发布事务中核验物理store、预期活动版本/相关read-set、namespace及输入证明，
   将准备好的组/manifest设为可见，同时更新资格；不在此时再搬运全部facts或大批映射。事务失败不切换。
4. reader在读事务内同时读取活动映射、facts、资格；旧reader继续原快照，新reader看到完整新版本。
5. 取消/过期只终止该未发布文件版本或逻辑组；已经生成的其他有效文件版本仍可复用。
   不因一个文件过期废弃其余29,999个文件的有效成果。
6. 未发布草稿、退休版本分批回收；读事务/使用权及Windows占用仍受保护，不能以RSS或目录年龄强删。

所有查询必须在LIMIT、排名、计数和候选筛选之前约束到活动版本，FTS亦如此；
事后过滤旧/暂存版本可能先吃掉limit，产生漏结果。旧URI级主键、FK、FTS触发器及查询必须一起迁移，
不能只加一张staging表而保持旧查询不变。
[SQLite读事务](https://sqlite.org/isolation.html)提供DB内部快照；源码当前性仍由原输入fence保护。

### 10.3 调度、证明与跨进程

- 控制面独立可运行；后台写所有者消费有界任务。按URI/revision合并，稳定文件不会被另一文件连续输入反复取消。
  query取消不拥有共享后台索引任务；每attempt只有一个终态，已发布不能再冒称“未写cancelled”。
- 提交时不能接受“编号更大所以有效”。物理store/domain必须匹配，受影响文件的预期活动版本和read-set必须仍成立。
  仅无关文件推进全局代时，可以在重新验证独立性后重基准，无需重解析已证实未变的staging；
  同文件或namespace冲突必须拒绝，不能借重基准绕过旧输入检查。schema/producer域不兼容不做这种复用。
- 整体快照身份与内容证明分离：published generation识别可见模型，不证明磁盘最新；逐文件digest和manifest覆盖用于证明。
  不再把全项目串接SHA一次不匹配当全写开关。若必须提供聚合内容根，应设计可增量维护的manifest结构；
  不暗中每次重读所有facts再称增量。实现复杂度和实际成本仍须测量，不凭结构名称推断O(1)。
- 内容相同的后继任务可以在重新取得当前路径/长度/mtime/SHA证明后复用匹配的完整facts版本；
  原旧请求/旧witness仍失效。这是复用不可变数据，不是给旧证明续期，也不是接受暂存的半份facts。
- watcher仍是提示。启动、overflow/重连、配置/目录不确定及终检漂移触发reconcile；
  发现可扫描全体，但只构造/发布有变化的文件版本。没有可信完整证明时，完整引用/重命名不能用旧模型冒充成功。
- clangd的跨文件rename源码明确接受后台索引可能滞后的取舍。本仓库不能据此放宽完整性；
  借鉴存储/调度，保留自己的新鲜度及官方语义验证。
  [rename取舍源码](https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/refactor/Rename.cpp)。

### 10.4 最终边界和验收调整

普通编辑、保存、撤销、删除、移动、大单文件及大变更集都进入版本化增量路线。
全库构建保留给首次建库、不兼容schema/extractor迁移及已确认无法修复的缓存损坏，作为bootstrap/恢复，
**不作为正常大文件和监听不确定时的自动全写方案**；监听不确定首先重发现、比较版本。
发布失败重试应复用仍有效的staging，不等同重新全量解析/写入。

正式实现目标必须同时覆盖：大文件中途取消、删除旧大文件、分批崩溃恢复、旧reader跨发布、隐藏版本不吞limit、
跨进程同文件冲突/不同文件安全重基准、持续输入公平性、漏watch恢复、GC及Windows占用。
以“改1文件不写未变facts”“大文件可分批且只原子可见”“取消不重写全项目”为机制验收，
并实测磁盘/锁时间/读写量及尾延迟；不靠抬超时或阈值通过。

第8节仍可按依赖分阶段开发，但在file-version staging、读侧迁移、资格和GC未闭环前，
不得宣称长期方案完成。本节是完整目标建议，代码仍未实施，也不宣称已解决原30K问题。
补充研究及本节追加前文档快照在`.bench/index-incremental-practice-20261103`；未重跑测试、未部署或合并。

## 11. 历史ADR审计后的必要限定

[42份ADR冲突审计](2026-11-03-index-versioning-adr-conflict-audit.md)确认本建议不能以“完全沿用旧ADR”直接实施：
日常更新的文件版本/同库发布需要局部调整0034/0042的存储选择；0005编辑后恢复的
catalog水位/终态协议须保留或由明确的新收据决策衔接，facts相同不自动结清dirty。
0034的重复解析已由0042 hash-first明确修订，不能把这一既有后继误当新授权。

第10.3节的受限重基准**仅适用于已证明独立的增量逻辑组**；
保留的完整私有库发布仍执行整个parent/store/generation起点比较，不能将旧整库重基准。
manifest仅描述DB可见内容，不替代当前文件系统/符号链接/配置证明；
native词法facts版本化不缩小0004答案缓存或0010语义/诊断失效域，不重启0008暂停的语义投影。
native未发布staging取消与0031保护的原地compiler同步清算是不同取消域。
新行版本GC补充0028整workspace治理，不替代其lease、受管身份及DB/WAL保护。

建议后续以新Proposed ADR明确局部替代关系、迁移和验收，不整份废除旧决策，不追认Accepted。
本次只完成审计和建议澄清，没有产品实现、测试重跑、部署或合并；R-13仍OPEN。

## 12. 可执行方案与ADR0043

2026-11-03起草、2026-11-04交付[ADR0043 Proposed](../adr/0043-versioned-file-index-maintenance.md)及
[IX-00–08执行计划](../plans/2026-11-03-versioned-index-maintenance.md)，状态统一记入
[既有Feature Ledger](../plans/references-feature-ledger.md#idx-v1-feature-ledger)。
第10节的manifest现具体化为关系型发布组日志：分批写文件版本及entry，短事务只发布组头/head/资格，
不每次复制全URI映射或自研Merkle树。资格收据明确衔接0005，完整对账仍保留现行扫描/source fence，
只提取/写变化facts；No-op可提交资格元数据而不伪增facts代。旧native继续旧水位，未完成迁移不启用新格式。
0034/0042局部后继、全表查询/FTS、CAS/ABA、取消/控制面、GC/迁移和反例/规模/耐久均在新产物中明确。
本次仅设计交付，产品NOT_STARTED、验证NOT_RUN；未实现、构建、部署、提交或合并，不改变历史失败/审批状态。
