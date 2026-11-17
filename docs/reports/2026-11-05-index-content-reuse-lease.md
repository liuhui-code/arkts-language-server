# IDX-V1-GC-002：工作区内容复用租约

状态：机制已实现，228输入v2的适用Rust冻结检查通过；完整产品目标未完成。
parent `298d65f5d7f796c347fe8be5c739e428066489d8`，独立分支/工作树
`feat/index-versioned-maintenance-20261104` / `/private/tmp/arkts-index-versioned-maintenance-20261104`。
证据根 `.bench/index-versioned-maintenance-20261104`。UTC原始日志11-04，本地日期11-05。
[前片失败与根因](2026-11-05-automatic-versioned-index-collection.md#idx-v1-gc-002自动gc缺少内容复用租约)
和223/224输入失败记录保留；未部署、提交、合并或操作真实项目/缓存。

## 根因及选择

旧Native删除恢复回归要求恢复同URI/字节时0解析、0写facts。
开始自动GC后，removed映射使旧facts不再是当前内容，原任务owner结束又没有其他pin，GC因此回收。
此前只是没有主动GC使历史残留，复用缓存没有明确使用权；不是新鲜度、文件名大小写或符号结果错误。
现有反例`ix05-auto-gc-restore-isolated-red.log`保持writtenDocuments1≠0，原测试未修改。

新增`CatalogReuseLease`把工作区内容复用表达为既有`version_pins`的活动owner，
复用OS锁/对象身份、工作区使用权、物理库pin和GC保护，不引入缓存TTL、RSS预算、私有SQL旁路或新schema。
缓存仍是sealed内容，不是Program/AST、语义结论或当前输入证书。
借鉴文件facts缓存和明确所有权；本项目的近期保留策略是ADR0043的具体细化，不冒称某上游逐行采用相同策略。

本cache owner对每个**受到实际变更影响的URI**保留实际旧当前内容与拟发布的新sealed内容，最多两个不同版本；
其他窗口/活动reader的合法引用仍可保护更多历史，不声称全局所有owner合起来只剩两个：

- V1→V2保留V1/V2；V2→V3替换为V2/V3，V1可由GC回收。
- 在V1/V2间撤销重做不反复解析/写facts，其他URI更新不驱逐它。
- 删除时暂留该URI删除前的内容，恢复可复用；成功完整资格确认其已不存在后，分批释放缓存pin。
- 释放缓存使用权不修改可见facts/数据head/Q，不影响其他owner的借用，也不删除当前manifest仍引用的版本。
- 失败发布允许保留有界候选内容，不能让它成为公开结果或新鲜度证明。

拒绝“睡几秒后再GC”、禁用GC、永久pin全部历史及放宽旧零解析断言。
这保护一步撤销/重做，不承诺任意长历史永远命中；更老内容失去租约后可被回收，届时仍可正确重提取。
全路径身份、SHA、源读取/最终fence、发布准入及实际编译器验证未省略。

## 获取、更新与退役调用链

`maintenance_file_engine::run`或完整对账`Target::stage` →
`CatalogMaintenance::retain_for_reuse` → `CatalogReuseLease::retain_transitions` →
`VersionedFacts::retain_recent`，随后才是原stage/commit/source及admission路径。
库文件：`crates/index-sqlite/src/catalog_reuse.rs`、`versioned_reuse.rs`、`catalog_maintenance.rs`。
Native所有权：`maintenance.rs`、`maintenance_executor.rs`、`maintenance_target.rs`、`maintenance_collection.rs`。

批次最多16个URI，在同一短事务里校验同URI sealed身份、取得所需pin，再释放本owner的过旧pin；
每URI最多2次插入/2次删除，最多64条pin元数据变更。磁盘读取/解析不在该事务内。
这是缓存元数据事务量子，不是源码语义分组或Program分批策略。
URI使用精确键，不做全路径小写；查找带sealed谓词以使用已有内容键索引，不按每文件扫描全库版本。
缓存操作只证明内容可借用，不为准备中的旧read-set盖新章；并发变更仍由最终发布CAS拒绝。

完整qualification成功后，`CatalogReuseLease::reconcile`逐批重新核对**同事务里的当前完整收据**，
仅释放manifest最新状态已removed/不存在的URI缓存引用。旧input、旧head、伪造/不同物理库收据拒绝。
每轮检查最多64个pin，以实际检查到的version游标推进；不是只对“待删除64条”LIMIT后反复从头扫描所有保留项。
这避免该循环明显的重复全扫描；尚未完成最终规模/VM步骤对比，不据此声称全链路O(1)。
确认资格后的清理错误作为`reuseCleanupError`独立附在已成功终态，不把已提交/已确认数据改写为未提交。

## 线程与关闭

一个工作区保留一个cache owner/连接，使用短时互斥槽交接唯一所有权：
输入任务在GC真实结束后取出租约；GC在无输入写者时取出、验证物理选库，结束SQL后归还。
互斥锁只用于take/return及状态提示，不在其内执行解析/SQL；输入等待GC被取消时不覆盖GC持有的槽。
没有新增原生进程或线程池，使用既有输入协调线程和保留GC线程。

GC发现peer已换物理库时放弃旧cache，避免空闲会话一直钉住旧库。
GC致命故障通过共享原子标志先于屏障释放通知输入方；后续输入不留下依赖失效GC的cache owner，
数据功能仍继续、GC不因每次输入反复重建，显式工作区initialize可恢复。
任务丢失/异常或工作区关闭按所有权释放；数据Q、parser/reader及后台GC各自的生命周期不混为同一状态。
`retainedReuseStore`是空闲槽提示，GC/输入持有时可为null，**不是资源已释放的证明**。
Native空闲peer回归结合GC已观察新store、任务不活动及槽状态；库回归另断言旧物理数据DB在释放后实际退役。
没有测量RSS下降，不以RSS未立即下降断言泄漏。

## TDD与验证证据

parent均298d；API RED来自演进dirty候选，未补造每个中间候选hash。
当前冻结身份`ix05-reuse-v2-frozen.json`，驱动`reuse_checks_v2.py`。
v1同候选完整Native暴露下述GC-003，原日志保留；不能拿v1部分通过替代v2。

| 回归 | 证据与结果 |
| --- | --- |
| 原删除/恢复断言 | `ix05-auto-gc-restore-isolated-red.log` → `ix05-reuse-restore-native-green-fixed.log`：从写1恢复写0、parser0，既有测试原样保留 |
| 近期内容/更老历史/关闭 | `ix05-reuse-lease-api-red.log`缺API → `...api-green.log`：V1/V2受保护，V3后V1可回收，cache关闭后V2可回收，当前V3仍在 |
| 旧资格、取消、错误内容、物理替换 | `ix05-reuse-lease-boundaries.log`：旧Q不释放、取消可续、非法ID不破坏原引用，跨物理库拒绝；旧库实际退役 |
| 多页与其他owner | `ix05-reuse-lease-paged-green.log`：4项库回归通过，130租约分批释放，其他owner钉住1版本直到关闭 |
| 原生命周期＋GC组合 | `ix05-reuse-shared-lifetime-green.log`：原7项及新GC5/压力2项通过；已将GC夹具推进到V3后验证V1真实删除，未删/放松删除断言 |
| 撤销/重做、完整删除确认、空闲peer替换 | `ix05-reuse-native-lifetime.log`：3项真实Native回归通过；四次撤销/重做0解析/写，不同URI不驱逐；空闲不发新mutation也能退役旧cache |
| GC fatal后的真实源码更新 | `ix05-reuse-fatal-reinitialize-fresh-issuer-green.log`：不保留不可维护cache、不重启GC，数据仍成功，同进程新会话恢复 |

复现：

```sh
cargo test --locked -p arkts-index-sqlite --test catalog_reuse_lease
cargo test --locked -p arkts-index-sidecar --test maintenance_changes_lifecycle --test maintenance_reuse --test maintenance_collection --test maintenance_collection_pressure --test maintenance_collection_bootstrap
```

中间失败保留：一次Rust重复可变借用、一次新增构造参数错误、unfulfilled expect lint；均不冒称产品行为RED。
致命故障测试升级为真正编辑后，旧脚本重新initialize却复用了`window/1`，
触发原资格唯一键保护（`ix05-reuse-fatal-reinitialize-identity-diagnostic.log`完整错误为
`UNIQUE constraint failed: qualifications.issuer, qualifications.revision`）。
修正测试为新生命周期的`reinitialized-window` issuer，保留成功断言/资格不可变合同，未吞错或更改产品合同。

这是库/真实Native短回归，不是公开LSP、Zed真实UI、30K或者2小时耐久。
计数是事实/解析/逻辑GC及租约操作，不是实际落盘字节、RSS峰值或完整事务总数。

## IDX-V1-GC-003：后台GC不能否决显式工作区重建

v1完整Native的既有`reader_queries::fatal_readers_retire_without_restart_loops_and_explicit_reinitialize_has_a_new_epoch`
实际返回`busy / initialize cannot replace a workspace while its catalog is active`。
原因是初版`Maintenance::is_active`把后台GC也算成正在处理的输入，workspace initialize因此提前拒绝。
这是可确认产品回退，不是缓存文件多、OOM或reader仍有请求：测试已确认activeReaderTasks0、retiredReaders2。

`ix05-gc-reinitialize-red.log`进一步在受控GC gate始终不打开时稳定重现同一busy。
修复让is_active仅表达已接受数据任务/待办；成功工作区替换会走原Maintenance Drop，
标记stop、清算/join实际GC，再完成新生命周期，不要求用户赶空闲窗口或反复重试。
非法Root替换在验证失败时不触发旧owner Drop，原GC/工作区保留；`ix05-gc-reinitialize-invalid-input-green.log`已验证。
`ix05-gc-reinitialize-green.log`包含6项GC、5项原维护、3项复用、2项旧reader query及1项退役，全部通过，
旧reader恢复断言未修改；新epoch/旧cancel隔离保持。
这不承诺抢占任意同步SQLite调用；关闭/重建仍等待真实资源结束，产品超时未延长。

独立debug wire重放`reuse_wire_replay.py` / `ix05-reuse-wire-result.json`，
目录`reuse-wire-20261104T184635Z`保留生成的128源码、输入SHA、逐帧JSONL、parser trace、stderr和结果。
实际binary SHA256 `111ff60803e6fe74b4715bc598b74d70a73aefe28c837727736fde70a37039a6`：
64提交取消重试解析66/复用62；随后删除恢复和四次撤销/重做均写0、hot parser0；
最后完整No-op写0/复用128并返回当前资格。单次受控debug运行10.857s，非release分布、UI或30K验收。

## 剩余边界与完整目标

每URI最多两版本不等于总字节有硬界：单文件可很大，URI数及其他活动借用可增长。
删除URI的缓存须完整权威对账后退役；如果永远没有成功完整对账，不能声称所有删除成员的缓存已收敛。
父端自动对账/失败与部分输入处理、namespace/元数据治理仍必须闭环，不能用本片代替。
默认Node/LSP仍legacy、原默认128文件RED未关闭；strict解码、URI/input/Q、ReferenceIndexFreshness、
partial/schema/ACK、最终pnpm、同条件规模、30K两小时及Mac/Windows真实UI仍保留原目标。
旧原生提交头/墓碑/owner锁治理也未完成；没有新默认RSS预算、超时、规模阈值或真实缓存删除授权变化。
`ix05-reuse-v2-receipt.json`核对228份Rust/Cargo输入在全部9项检查期间未变：

| v2实际范围 | 结果 | 墙钟时长 |
| --- | --- | --- |
| Core/SQLite完整包 | 253PASS（Core63、SQLite190），含原100K成本测试 | 173.653s |
| 默认Native31份相关完整文件 | 143PASS | 221.564s |
| experimental存储25份完整文件 | 86PASS | 127.690s |
| experimental Native21份相关完整文件 | 79PASS | 229.410s |
| fmt、双配置workspace all-targets Clippy -D warnings、双配置release | 全部exit0 | 收据逐条记录 |

默认release SHA256 `cfd3f2ecdcfd8c06738a0504816161aac81bab5e9098443ce8001346635c76ae`；
experimental `0634237d40e97e8ad2c57a56aea952e0f3a311811228fcdd7c8608b44e877d92`，
分别归档`artifacts/reuse-v2-default`、`artifacts/reuse-v2-experimental`，未安装到日常环境。
新文件均≤500行；已改存量超限源码仍Core lib1131/SQLite lib761，另3份未改旧测试债务见收据。
这是以上Rust范围，不是整个workspace/全部平台全绿；旧legacy128反例、historical实验迁移失败仍保留，
默认Node/LSP接线与最终整链路检查尚未完成。旧219成功、223/224及228v1失败都未改写为v2成功。

Node接线准备：用独立pnpm8.15.9按冻结lock、copy模式、跳过install scripts安装到本worktree，
Node v21.6.2；未替换全局pnpm8.3.1或原工作区依赖。最初offline缺包/DNS失败日志保留，联网安装仅在隔离目录。
`ix03-node-adapter-characterization.log`：两个既有公开adapter driver＋scripted sidecar测试文件27PASS、
0FAIL/skip/todo，275份TS/fixture/manifest输入前后未变，作为后续提取Session/严格协议的表征。
它不是framed公开LSP验收，未因此宣称IX-03/04接通；SDK未用于这些夹具。
