# Mac mixed-03 索引重复写入：口径核验与根因

本轮完成诊断及最小复现，**没有实施产品修复**。其余两类只补既有本地待办：
R-01/R-27引用/重命名资格失败，WUI-003/WUI-005定义长尾；本项沿用R-13，关联R-02/R-20。
见[本地问题记录](../plans/2026-10-11-query-performance-follow-up-plan.md#2026-11-03-mac-mixed-03-后续本地问题记录与索引专项诊断)。
没有新建远端issue，没有产品改动、产物重建、部署、合并、发布或新两小时测试。

## 结论

**变更维护链没有接入文件级增量；已解析输入过期后，当前构建仍可能继续全写，到最后才拒绝发布。**
不是每次查询或每个重复通知都会全量写，也没有证据表明原生错误处理器无限自行重试。

1. watcher掌握具体URI，到catalog调度只剩workspace ID。非force先全扫描比较完整指纹：
   相同可复用；一个文件不同，仍用全部manifest重建私有库。此前流式所有权和完全相同快照复用确实生效，
   **它们没有实现单文件变更的索引增量维护**。
2. 构建期间的新事件只置pending，不把输入revision变化送到当前native writer。
   未来文件在重读/解析时可早发现变化；已解析文件直到写完、SQLite校验和最终checkpoint之后的Checking才再检查。
   所以安全地拒绝了过期答案，却可能已经浪费全部写入，随后pending再全量构建。
3. 输入fence比较长度、mtime、SHA及路径。同字节重写/编辑撤销在构建中改变mtime也可能拒绝旧代；
   若重写发生在扫描前，完整内容键仍能命中、零批量写入。两种时序不能混为缓存一律失效。
4. 私有原子发布保留活动完整库，故完整草稿占用期间约同时存在两份索引。
   12.45GiB不是77份完整库同时残留；零字节lease也不是数GB数据来源。

这些机制已在未改的实际安装二进制上复现。**原77代每代最终错误没有被保留**，不能将全部逐一归为同一种取消、Checking失败或竞争失败。

## 固定身份和证据范围

- 源码`298d65f5d7f796c347fe8be5c739e428066489d8`；被测独立源码树
  `/private/tmp/arkts-zed-ui-main-20261103-src` tracked diff为空。当前主工作树已有其他改动保持原样。
- Node20.19.5，Mac x86_64/macOS26.6.2，SDK API24/ETS6.1.1.125；SDK路径
  `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`；元数据SHA256
  `6bc758dcc0d60ecc7e8fc0bc1b6e3ab57a14fdff8e87ad544dd2b72807b79d94`。
- server SHA256 `1c38f0cd60f0fd4a2c3c11f80c1b9cd508e079a10b09c66100e6a487fe2b543a`；
  semantic Worker `5dcab0b35be78c2ba75499550d93a947d05fc309485494eb2dff759a6ae41693`；
  native `4dce8fc2ea2a8a3317d789da0aa1bdd539a67538909545994c7b8a187851a9b5`。
- `B=.bench/macos-zed-ui-main-20261103`；[原耐久报告](2026-11-03-macos-30k-index-endurance-rerun.md)原样保留。
  mixed-03是协议驱动Photos30K，非UI点击。native初次复用既有完整库3.452s READY；
  semantic初始化degraded/project-membership-incomplete，不能混成native失败。
- `D=.bench/index-rewrite-diagnosis-20261103`；本轮所有新夹具/缓存在D/cases。
  D/installation.json及B/evidence/installation-verified.json保留完整launcher/扩展/七产物身份，本轮再次核对一致。
  D/evidence/preservation-verification.json：旧182项证据哈希无变化，原项目及B/project各30287个基线文件哈希无变化。

## 77代、4.57亿与12.45GiB的口径

脚本D/scripts/reconstruct_mixed03.py；核验输出D/reconstruction/summary.json。

| 观察 | 核验结果及边界 |
| --- | --- |
| 77代 | native PID13313的77组非交错batch.committed，generation101–224有空档；不是77次完整构建成功或发布。 |
| 校准/正式边界 | 按分配时刻：校准1代、正式76代。101在06:45:41.157407Z分配，正式计时06:45:44.953Z开始；累计计数含校准，批次无墙钟，不能精确切出正式行数。 |
| 31,790 batch.committed | 对应tx.commit成功后写trace，表示私有库批事务提交；不等于对外发布。 |
| 456,706,174 | 各代最后累计writtenRows相加：文档、符号、导出、类及引用/identity/alias/binding等应用层行工作计数；不是一个库现有行数，也不含所有索引/FTS/元数据/页写入。**不能称物理写放大**。 |
| 1,021,933文档 | 各代最大writtenDocuments之和，跨代同一文件重复计入；不是独立文件数、读取次数或parser实测次数。 |
| 12代写满30K | 171/177/183/185/186/193/198/206/208/210/215/219，各14,248,348计数行；其余65代部分写入。 |
| 31,802 checkpoint | 31,790 PASSIVE、12 TRUNCATE，busy均0。TRUNCATE成功不等于发布；frame不能直接累计乘页大小当设备写入量。 |
| 12.45GiB峰值 | 1463次5秒采样中，逻辑文件长度最大13,369,575,810B；allocated最大13,387,313,152B。不是累计写盘或SSD物理写量。 |
| 峰值组成 | 活动DB6,664,568,832B，私有DB6,664,716,288B，WAL40,216,072B，另有少量控制文件；07:48:22.938088Z。 |
| 发布 | 1463次采样和最终控制行都指向原catalog-1704-18e46c5fd445cc28-0.sqlite3，publicationGeneration=1、原指纹未变；**未观察到这77个新库成功切换**。逐代终态未留存，不伪造失败原因。 |

物理设备写入字节、每批墙钟及原始逐代终态均未测/未留存。
同库复用会推进metadata committed generation；与物理publicationGeneration不同。
attempt generation空档亦不能全部标为失败自动重试。

## 对齐原77代事件

catalog_files::new_database文件名含PID、SystemTime纳秒nonce和进程分配序号；
其唯一调用点是CatalogBuildSession::run。PID13313的77个保留lease序号恰好0–76、nonce递增，
与77组串行非交错写trace对应；lease mtime与nonce差均<100ms。
因此能恢复**私有库分配时刻**，不是catalog/start或hash开始，更不是每批提交时刻。

D/reconstruction/generations.json和generations.csv逐代记录generation、序号/时刻、批数/计数、宏动作，
以及前后编辑、保存、watch、配置、取消的wire seq/请求ID、低层动作、DB存在区间及峰值。
完整事件参数在input-events.ndjson，可按seq回原wire.ndjson.gz。
前一分配至本分配作为候选调度窗口，本分配至下次分配作为后续事件窗口：
**这些只是对齐边界，不能等同唯一触发或实际构建起止**。新事件调度与pending重跑的原始确切对应无法补造。

| 代 | UTC分配时刻 | 当时宏动作 | 已提交文档/计数行 | 原始证据与限制 |
| --- | --- | --- | --- | --- |
| 101 | 06:45:41.157407 | 校准move-restore-delete | 15914 / 6898024 | 原move/restore/watch；正式计时前已开始，之后有连续输入。 |
| 103 | 06:46:58.052020 | dependencyBarrel | 64 / 14848 | 前后有common/index.ts改写及恢复；不能仅凭动作名断言失败分支。 |
| 111 | 06:47:37.431545 | filesystemWatch | 6304 / 2690735 | watch、配置及撤销交错；终态未测。 |
| 171 | 07:05:28.908557 | development | 30000 / 14248348 | 88.063s后ScreenManager.ts磁盘改写，早于该代事务计时累计161.132s；草稿采样寿命约306s。 |
| 177 | 07:14:45.570956 | development | 30000 / 14248348 | 15.150s后common/index.ts改写；草稿采样寿命约297s。 |
| 224 | 08:45:12.856727 | configuration | 25177 / 10890643 | 配置与源码事件交错；动作名不是配置本身导致指纹miss的证明。 |

12个完整草稿采样寿命约296.5–306.4s，事务耗时累计154.5–161.1s；二者重叠，不能相加。
full-draft-overlap.json保存这些窗口中的磁盘源码改写/移动/watch，对长构建与编辑重叠有支持证据。
但不能据此断言12代全因mtime失败，或把未测剩余时间全部归给特定SQL校验。
原SidecarSession只drain native stderr、不保留；逐代native终态没有进入旧采样，batch trace又无时间。
这是本次可观测性限制；新tap补了该层，但没有改产品日志。

## 调用链与代码位置

以下行号均针对固定298d65f；D/evidence/source-callchain.json保存源码片段、函数/行号及文件SHA。

| 环节 | 文件/函数/行 | 行为 |
| --- | --- | --- |
| 输入 | src/lsp/run-language-server.ts:231 onDidChangeWatchedFiles | Coordinator accept后立即drain；semantic收到详细batches，workspaceSymbols只收到workspace IDs。 |
| 事件合并 | src/lsp/workspace-file-change-coordinator.ts:82/125 drain/acceptOne | 同通知内路径去重，配置/超量可rootDirty；不是跨事件完整变更集。 |
| 调度 | src/workspace/default-workspace-symbol-service.ts:76/210/225 workspaceFilesChanged/scheduleCatalog/runCatalog | 每工作区一个活动Promise、一个pending位；finally有pending再起一次，不通知当前native输入已变。 |
| 原生请求 | src/index/sidecar-workspace-index.ts:403 beginCatalog | catalog/start固定reason=workspace-open、force=false；reason字符串不能当真实打开事件原因。 |
| Native准入 | crates/index-sidecar/src/main.rs:355/407 Runtime::dispatch | 同时只有一个catalog，分配attempt generation；catalog/cancel是显式控制请求。 |
| 扫描/键 | index-sidecar/src/catalog.rs:78 scan_workspace；catalog_hash.rs:41/62/100 Planner | 枚举全准入源码；有候选时先读源码hash，再将有序完整manifest传build_stream。 |
| 指纹 | index-sqlite/src/catalog_fingerprint.rs:21/45 CompleteScanInputs | producer二进制/schema + URI/源码digest；mtime是另一个witness字段，不在内容键中。 |
| 复用/写入 | index-sqlite/src/catalog_session.rs:79/106/129 build_stream/run | 完整键相同且无reject才reuse；miss新建空私有库，producer接收全部manifest，无逐文件facts复用。 |
| 解析 | index-sidecar/src/catalog_stream_producer.rs:162/233 advance/parse | 4有界槽；未来输入读取时比hash stamp，已解析文件不在每批重检。 |
| SQL | index-sqlite/src/catalog_build.rs:99/151/164 write_documents | 分批commit后计数、PASSIVE，继续下一批；64文件是事务上限，不是当前变更范围。 |
| 最后fence | catalog_session.rs:154/171；index-sidecar/src/catalog_observer.rs:164/198 observe/finish | 写完→validate→FULL metadata/TRUNCATE→Checking源码→比较发布起点→Publishing；过期则degraded/stale，旧库保留。 |
| stamp | index-sidecar/src/catalog_source.rs:30/36 same_input/is_current | 路径/长度/mtime/digest比较；最终仍读取源码hash。 |
| 发布/回收 | index-sqlite/src/catalog_control.rs:184 publish；catalog_files.rs:63/80 retire/prune | 控制事务切完整库；lease及SQLite锁空闲才退役，先DB后WAL，不拆删活动WAL。 |

打开/未保存编辑只同步overlay及语义状态（run-language-server:200/269，service:68），不独立安排catalog。
没有单独didSave catalog handler；原State.save同时发watch和didSave，不能双算触发。
空arkts设置无project/sdk字段会提前return；build-profile文件watch会调度，但纯注释变化不改变native源码键。

### 现有refresh为什么没解决

SidecarWorkspaceIndex.refresh:170存在；native main:201 → index-core/src/lib.rs:881 Index::refresh，
只解析传入changed_documents再apply_batch。**当前workspace文件事件链没有调用它**，诊断tap亦无该链发送refresh。
CatalogStore.access（index-sqlite/src/catalog_store.rs:38–56）普通增量写入前会清空完整复用指纹。
直接NDJSON对照：只传一个改变文档，新增类和其他文件查询正确，同物理库更新且fingerprint=NULL；
后续catalog/start又完整写128。不能只接上现有API便宣称完整快照资格/删除/发布竞争已经解决。

### 过期代为何继续写及谁在重跑

watch只置前端pending，没有置当前native cancel flag。未来文件变化可在parse前停，
已解析文件不再parse，writer仍消费其他文件，到最后Checking才发现旧stamp。
发布拒绝保障正确性，迟发现造成写入/校验浪费；下一次由pending事件触发，不是native失败分支自发循环。
无pending时失败结束，稳定输入显式重试可恢复。

## 最小复现与成功/失败对照

同一个未修改的安装native，三次原生公开NDJSON会话共62次catalog对照；
四次真实子进程Content-Length LSP会话共66个动作对照，另有各自初次catalog。
夹具128个独立TS文件，每文件一类及300次属性访问，没有让依赖传播制造额外文件。
结果在D/cases/{native-01..03,lsp-01..04}，汇总D/evidence/controls-summary.json。
COMPLETED表示按预期完成取证，**预期复现的缺陷不是产品GREEN**。

| 场景 | 实际结果 |
| --- | --- |
| 无变化 | reusing、writtenDocuments=0、无新私有库；不是零扫描。 |
| 仅未保存编辑、撤销+didSave无watch | LSP零catalog/start。 |
| 单文件注释+watch | 各轮一次catalog写128并发布；连续3次稳定编辑各写128；已发布后撤销也再写128。 |
| 一条通知16重复项 | 一次catalog；有变化写128，没有16次构建。 |
| 活动构建中20独立同内容通知 | 两次：当前写128，合并pending命中内容键写0；没有20次全写。 |
| 配置注释/显式project设置、源码不变 | 各调度一次但写0；空arkts设置不调度。 |
| 改名恢复/ignore成员改变 | 改名、恢复各写128；ignore改变写68，恢复写128，URI/成员变化真实影响键。 |
| 未解析文件在构建中改变 | hash→parse报changed，写入前缀后失败（本轮104/128），稳定重试恢复。 |
| 已解析文件在writer中途改变 | native-03及lsp-03/04在writing26/128门控时改0000.ts，旧代仍写到128，Checking拒绝，后继代完整写128并READY。 |
| 写完后再改输入 | native三轮、LSP四轮：旧代128写满后Checking拒绝，稳定后新代成功。 |
| 同字节改写 | 扫描前改写可reuse写0；validating期间改写同字节，mtime变后Checking拒绝，原生三轮一致。 |
| 取消域 | workspace/symbol取消-32800但catalog成功；显式catalog/cancel得到cancelled、旧发布不变，稳定重试READY。 |
| refresh独立对照 | 一文档增量查询oracle通过；下一catalog因完整资格失效全写。 |

具体公开时间线：lsp-03于11:35:13.118Z开始动作；native PID24507，generation16写26时修改已解析文件。
11:35:13.821005Z返回degraded/stale，writtenDocuments=128、writtenRows=79744，committed仍15，message为
`workspace sources changed before catalog publication; rebuild required`；
11:35:13.837300Z pending发送新catalog/start，generation17于11:35:14.390693Z READY、committed17。
同一native协议进程处理，没有手动重启；另外一次--cache-gc维护进程独立统计，不算索引换代。

### 仪器化和验收边界

tap保留双向native协议及原先被drain的stderr，转发原始字节；binary/hash不变。
中途/validating窗口用**受控SIGSTOP**打开，仅针对自有子进程，最多3秒自动恢复，所有实际记录均driver恢复。
这证明因果，不表示原30K自然出现SIGSTOP/死循环；门控及额外日志时延不作普通性能对比。
正常未门控场景独立记录。传输characterization先RED后GREEN，碎片/大载荷/EOF/stderr/退出码及midwrite门控2项通过。
本轮没有阈值、正确性oracle或产品fence放宽。Context7访问失败，[Node20官方child_process文档](https://nodejs.org/docs/latest-v20.x/api/child_process.html)作管道核对备援，非产品归因依据。

小LSP夹具语义准备均degraded/workspace-sources-unavailable，lsp-04增加module布局仍如此；native完整128 READY。
所以这些只证明公开LSP→native维护支路，不是完整语义/SDK或导航性能验收，亦不与原30K membership-incomplete混同。
release未开启debug parser trace；确切parser次数、系统read次数及设备IO未测。

清理检查另有相关观察：各短会话关闭后有一个约24.7–27.7MiB的前一已发布库保留，不是失败草稿。
CatalogStore后续access才换缓存连接，prune跳过被lease持有的库；普通drop不强制整目录清理。
这可以解释关闭不等于立即只余一库，但缺乏逐句柄证据确认每次具体阻挡者，需后续最小化退役时序；逐库metadata、文件清单及128个URI核验见D/evidence/closed-cache-inventory.json。
不据此宣称永久泄漏，也不能用它替代原77代终态。新库/lease均保留，未手动删除。

## 影响、相关ADR与最小修复建议（未实施）

问题属于native维护链，不能推导每次查询都重建Program。不变输入仍有全扫描/hash成本；
单文件有效变化仍承担全库写入。30K草稿约5分钟，期间输入变化更容易令其过期，延长旧库驻留并增加无效IO。
不能凭30K和128夹具拟合线性/平方复杂度，亦不把引用/定义问题全部归为本项。

- [ADR0034](https://github.com/liuhui-code/arkts-language-server/blob/298d65f5d7f796c347fe8be5c739e428066489d8/docs/adr/0034-private-catalog-publication.md)：问题段及决定3/6/7明确watcher仍全量、最终fence、安全退役及完整指纹复用。
  当前行为符合这些约束，暴露的是维护粒度与迟发现失效的代价。
- [ADR0042](https://github.com/liuhui-code/arkts-language-server/blob/298d65f5d7f796c347fe8be5c739e428066489d8/docs/adr/0042-bounded-catalog-streaming.md)：决策3、M3/M4及实现状态明确hash-first命中免解析/免新库，文件级facts缓存、变更集、分片defer。
  **M1/M3落地不等于文件级增量已完成**。不改两份既有Proposed/审阅历史，不冒充新决策已批准。

建议最小完整后续边界：

1. 将变更URI集合、创建/删除/配置不确定性和revision传到维护调度/活动构建；
   已证实过期草稿在安全批次停，保留当前完整库、单一终态和合并后的后继工作。
   不能见每个watch就取消重来，以免连续输入永远无可发布结果；重复/无效通知不应作废有效工作。
2. 完成变化快照的文件级资格维护；不能只接refresh，因为它现在清完整键且与活动catalog有busy/发布起点竞争。
   普通源码变动应维护changed/removed事实，目录/配置不确定时fallback完整发现；
   保留URI/producer/schema、删除/拒绝、缺失watch恢复和最终输入/发布起点检查。
3. 有界记录generation触发/输入revision、reuse或miss、分配、提交计数、终态、发布与清理理由，不输出源码。
   同时补最后旧连接退役/后续prune观测，不能靠删活动WAL降低峰值。

提前作废减少剩余无效SQL/校验；文件级维护才减少有效单改的全库写入。
仅缓存AST/复制旧facts，若仍组装完整6.2GiB私有库，并没有解决数据库重写。
不删mtime、身份、SQLite校验或完整发布合同；接受mtime变化但内容相同需要独立证明读取/替换竞争安全。
本轮不实施上述建议，不给未经测量的收益百分比。

必要后续回归：无变化/同字节/同mtime换字节、编辑撤销与连续输入、重复/丢失watch、目录/配置/ignore，
已解析及未来输入变化、活动增量/发布竞争、查询与catalog取消域、失败后无pending及显式恢复，旧reader跨发布、关闭清理、Windows占用。

## 复现与文件入口

从仓库根运行，新的tag目录不存在才执行，不覆盖旧证据：

```sh
python3 .bench/index-rewrite-diagnosis-20261103/scripts/test_tap.py
python3 .bench/index-rewrite-diagnosis-20261103/scripts/reconstruct_mixed03.py
python3 .bench/index-rewrite-diagnosis-20261103/scripts/native_controls.py native-replay-01
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node .bench/index-rewrite-diagnosis-20261103/scripts/lsp_controls.mjs lsp-replay-01
python3 .bench/index-rewrite-diagnosis-20261103/scripts/summarize.py
```

- 原始：B/protocol-runs/mixed-03/{native-build.ndjson,wire.ndjson.gz,actions.ndjson,requests.ndjson,result.json,stderr.raw}；B/index-observer-mixed-03/samples.ndjson。
- 对齐：D/reconstruction/{generations.json,generations.csv,input-events.ndjson,full-draft-overlap.json,peak-disk-sample.json,summary.json}。
- 新运行：D/cases/*/{result.json,wire.ndjson或wire.ndjson.gz,native-build.ndjson,actions.ndjson,tap/*/{wire.ndjson,stderr.raw,exit.json}}。
- 汇总/身份/保存证明：D/evidence/{controls-summary.json,source-callchain.json,preservation-verification.json}，D/installation.json，D/MANIFEST.json。
- 未跑pnpm/cargo全量：没有产品候选变化或合并请求，仅执行诊断和工具characterization。其他工作和原失败证据原样保留。
