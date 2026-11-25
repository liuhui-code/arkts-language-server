# IX-00：文件版本化维护的首次公开回归

日期：2026-11-04。整体目标ACTIVE；IX-00 IN_PROGRESS，IX-01–08未完成。
授权：用户要求按ADR0043/执行计划推进实现；不自动合并或发布。

- 原工作区保留，实施工作树：`/private/tmp/arkts-index-versioned-maintenance-20261104`。
- 分支：`feat/index-versioned-maintenance-20261104`；parent/远端main：`298d65f5d7f796c347fe8be5c739e428066489d8`。
- 首次fetch已成功结束；未启动重复fetch。原工作区44文件快照在`.bench/index-versioned-maintenance-20261104/original-worktree.json`。
- Rust/cargo 1.95.0；本轮只跑真实native子进程，无SDK/Node/UI认证。系统Node26.3.0、pnpm8.3.1尚未用于产品检查，后续需对齐计划工具链。

## RED：普通非force维护不应重新解析未变文件

新增`crates/index-sidecar/tests/catalog_incremental_maintenance.rs`。
通过真实NDJSON initialize、catalog/start(force=false)、进度终态、search、shutdown。
128源码冷建后仅改0000.ets为ChangedFile；新符号存在、旧HashFirst0消失、HashFirst127保持，
两次catalog均READY/indexed128。先正常shutdown，再断言解析数，失败不会依赖panic回收子进程。

命令：`cargo test --locked -p arkts-index-sidecar --test catalog_incremental_maintenance`。
实际连续两次exit101：**实际解析128，预期1**；测试运行4.04s/4.00s。
这证明原miss重复解析仍存在，不是新旧符号错误；不是LSP或真实UI测试。
第二次原始日志/命令收据：`.bench/index-versioned-maintenance-20261104/ix00-red-repeat.{log,json}`。

## 现有机制表征

命令：`cargo test --locked -p arkts-index-sidecar --test catalog_hash_first --test catalog_publication`。
exit0，4/4 PASS：冷→热hash-first免解析；重启保留已发布库/存储进度；
私有激活可响应取消；同长度同mtime换字节拒绝发布。
它们仅保护旧机制，不把全新文件版本格式算已验证。

## 下一步与未完成

继续IX-00锁顺序/全查询oracle，进入IX-01版本化facts/发布组日志的公开Rust接口RED→GREEN。
当前尚无产品存储实现改动，新格式未启用。新回归仍RED；完整检查、release、规模/两小时/UI均未执行。
ADR保持Proposed，不将此进展标为功能完成，不重启无关缓存优化。

## IX-01 第一切片：发布组日志基础（IN_PROGRESS）

2026-11-04，在隔离分支新增`crates/index-sqlite/src/manifest_log.rs`，由catalog_api导出。
未修改超限lib.rs。此组件尚未接入生产catalog、完整facts/FTS、资格和GC，不是新格式整体完成。

公开Rust接口TDD：先新增`file_version_publication`，观察E0432（ManifestLog/ManifestEntry缺失）；
实现stage/seal/publish/snapshot，1/1 GREEN。再新增独立连接/重开与身份错误/缺失库用例，
观察E0599（open_existing缺失），实现后2/2 GREEN。
补充现有行为表征：过期head提交拒绝、封存后不可追加、发布重试幂等、墓碑隐藏旧映射。
最终`cargo test --locked -p arkts-index-sqlite --test file_version_publication --test catalog_publication`
**9/9 PASS**（新3、旧6），exit0。阶段RED是新API编译失败，与上节128文件运行时RED分开。

`cargo clippy --locked -p arkts-index-sqlite --all-targets -- -D warnings` exit0；
`cargo build --locked -p arkts-index-sidecar --release` exit0，67秒。
新增组件222行、测试112行、catalog_api18行，均≤500；旧生产存储路径未切换。
Context7 rusqlite解析仍传输失败；实际安装0.40.1源码为API回退依据，未谎称获取query-docs。

当前基础仅完成manifest映射/发布；下一片须补accepted/rejected/removed明确分类、
完整文件facts版本及FK/FTS/全部查询可见性、owner/资格/GC等，再接通native维护。
128文件真实native回归仍RED；没有将它改为跳过或调低预期。完整pnpm/规模/耐久/UI尚未执行。

## IX-01 第二切片：明确拒绝状态和点观察

2026-11-04，新增公开行为用例先RED：rejected/removed构造入口缺失（E0599）；
实现ManifestValue的Accepted/Rejected/Removed及数据库CHECK约束后4/4 GREEN。
读取失败替换旧accepted后保留明确rejected记录；removed才从当前清单消失，均不复活旧facts。
再新增按URI点观察用例，lookup入口缺失RED（E0599），实现后5/5 GREEN。
点查SQL先约束URI、只选最新已发布组，返回group_id和entry，保留墓碑供后继read-set/ABA检查；
它不调用全工作区snapshot，也不把group数字当磁盘新鲜度。

最终focused命令与上一片相同，新5+旧6共11/11 PASS、exit0。
仍未实现完整file_versions/facts/FTS、qualification和GC，未启用生产格式；
旧128文件运行时RED保持未解决，不以新组件GREEN替代它。

## IX-01 第三切片：同库文件facts版本

2026-11-04，新建versioned_facts及schema/write/read三个内聚模块，全部≤500行。
同一data文件保存文件版本、manifest、符号/exports/occurrence/去重identity/alias/binding/heritage及direct-export来源。
逐族按4096元素/4MiB估算分块写；核对八类实际行数后才封存。FTS表/触发器已建立，但MATCH查询准入/排名尚未验证。
纯提取输出的DocumentSymbols完整往返匹配；绑定的临时resolution仍不持久化，不是语义证明。

TDD：VersionedFacts缺失E0432→完整facts回归GREEN；open_existing缺失E0599→重开GREEN。
编译期曾遇usize/u64 FromSql不支持的E0277，改为i64读取及checked转换，未掩盖失败。
另一个真实运行时RED：替代ManifestLog写入口能发布缺失版本，3PASS/1FAIL；
补同库manifest→file_versions外键及发布触发器（要求sealed且URI匹配）后GREEN。
find_version缺失E0599→源键预查GREEN；stage_changes缺失E0599→拒绝/删除/恢复生命周期GREEN。

最终命令：`cargo test --locked -p arkts-index-sqlite --test versioned_file_facts --test file_version_publication --test catalog_publication`。
**19/19 PASS**：facts8、manifest5、旧完整发布6，exit0，均无skip。
范围覆盖：完整字段/非空alias和binding/继承、URI隔离/同键复用、身份不覆盖、重开、
SQL约束失败后半成品不可读且新attempt可恢复、替代写入口约束、解析前查键、
大文件12000次构造/Unicode位置及全部ordinal往返、拒绝→删除→恢复复用旧facts。
SQL失败是主动传入重复export ordinal的控制用例，不是断电/磁盘满实测。

最终Clippy/release命令与exit见`.bench/index-versioned-maintenance-20261104/ix01-facts-{clippy,release}.{json,log}`，均exit0。
旧lib.rs未增长。原生产catalog仍未接新组件，因此128文件重复解析修复仍未完成。
下一步：全查询/FTS可见性与MemoryStore冷oracle、资格、GC及Native/TS调用链；
不得以每次全量装入MemoryStore的临时读路径代替正式SQL迁移。
没有全量pnpm、30K规模/耐久或UI证据；不启用新生产格式、不合并发布，目标保持ACTIVE。

## IX-01 第四切片：实际SQL符号/导出查询

2026-11-04，search和search_exports分别先E0599 RED后实现；新增versioned_symbol_query、
versioned_export_query及共享versioned_visibility，均直接查同库，不用全量MemoryStore作生产读路径。
name/acronym前缀、FTS trigram子串和export前缀均在SQL阶段限制为最新已发布URI版本，
随后复用现行rank_symbols/导出排序再应用limit，数据与head在同一read事务。
新增原始fold/acronym列及索引，未发布组件格式升为3；旧内部格式明确拒绝，不迁移/删除真实缓存。

公开测试：历史/暂存版本不能吃limit；前缀/子串/acronym/缺失/空symbol与MemoryStore逐项相同；
导出完整payload/排序与旧SqliteStore相同，非空导出再与MemoryStore对照。
独立连接并发发布11次、读取100次时返回symbol的奇偶版本与servedGeneration一致。
这是并发压力覆盖，不宣称穷尽精确调度窗口。

校准中发现并保留实际失败：空export查询，新SQL返回[]而MemoryStore返回AlphaNew。
独立旧SqliteStore证明它原本就返回[]。最终测试同时锁定旧SQL空集、MemoryStore非空及
新SQL与旧SQL相同；没有删除原失败历史，没有顺带更改旧行为。此一致性欠账单列未修复。
实现中一次Unicode字面量写法编译失败已修正；不是性能样本。

最终命令：`cargo test --locked -p arkts-index-sqlite --test versioned_symbol_search --test versioned_file_facts --test file_version_publication --test catalog_publication`。
22/22 PASS（查询3、facts8、manifest5、旧发布6），exit0；
最新Clippy/release均exit0，原始输出/命令在`.bench/index-versioned-maintenance-20261104/ix01-query-{clippy,release}.{log,json}`。

仍待：reference候选/alias-binding图及class snapshot所有读路径、MemoryStore完整对照、
资格/GC和Native/TS接通；原128文件Native RED未解决。未做完整pnpm/30K规模/耐久/UI验收。

## IX-01 第五切片：完整读接口、同库资格与受控重基准

2026-11-04，parent仍为298d65f；独立worktree实施，未提交/合并/部署。ADR0043仍Proposed。
本片基本读接口已落地，但IX-01仍IN_PROGRESS；生命周期和生产接通未完成。

读路径：class heritage/binding snapshot直接读取当前版本的相关字段，不装入全项目MemoryStore。
引用候选共享现行reference_query/names/anchor算法：legacy保持原表及索引提示；
新布局通过同data DB的可见版本views过滤历史/暂存，再执行名字图、scope、LIMIT及歧义判断。
仅新布局去掉不能用于view的三个INDEXED BY提示；不改legacy查询计划。
公开SymbolStore读取接口已覆盖；apply_batch/replace_all明确拒绝，避免绕过版本发布CAS。
空export在MemoryStore与旧SQL间的历史差异沿上一片单列保留。

新增真实运行时RED：rejected成员未进入accepted view，导致identity_complete错误为true；
补新布局拒绝资格检查后GREEN。原始失败`ix01-read-contracts.{log,json}`保留。
legacy继续原外层准入合同，没有用新布局检查改变旧路径行为。
类/引用图oracle包含MemoryStore与旧SQL、reexport/alias、scope及limit1/100、隐藏stage和标准读port；
不宣称这几项穷尽SDK解析/大型循环及全部并发窗口。

资格公开API：InputRevision显式issuer session+非负revision；qualify_complete_scan验证完整扫描指纹
与当前可见URI/SHA集合相同且无rejected，完成后短写事务重新CAS head，写入同data DB。
qualification只返回当前head的收据；绑定workspace/store/domain、token、head、指纹及不可变ID。
同head两个窗口同数字版本各自保留收据；No-op只写收据，不改facts/head；同token重试返回原收据，
发布后旧token不能重新绑定新head，暂存不使当前收据提前失效。
完整集合核对为O(N)读事务，位于短写事务外；当前调用仍会计算producer指纹，不声称成本已优化。
这是受信scanner提供的完整性attestation，**不读取或认证当下文件系统**：最终source fence、
父端dirty/input消费、新鲜度及compiler合同仍须在后续IX-03/04接通，不能提前当READY证据。
本次新增组件格式5（非生产schema12），没有迁移/修改真实缓存。

并发公开API：observe_read_set记录同快照的store/domain、namespace_epoch、URI及group entry身份；
publish_checked复核所有读集合并要求写URI全部被观察，再按当前head做短事务CAS。
独立现有文件编辑可有限重基准；同文件a2→a1→a2仍因entry不同拒绝；
namespace成员增删推进epoch，absence→present→absent也拒绝。命名空间变化采取保守冲突，
不以“最后内容相同”重新认可旧证明。另一个writer若落在读核对和提交之间，head CAS拒绝，
没有自动无限重试。发布前成员差异核对在读事务，只更新组头/head/epoch；
普通publish仍保留严格expected-head，已提交attempt返回原代，跨store/漏观察写均拒绝。
这些是SQLite独立连接对照，不是双进程强杀或OS owner/GC生命周期验证。

TDD证据（`.bench/index-versioned-maintenance-20261104`）：
- qualification缺失API的E0432/E0599 RED→首项GREEN，后补非空集合/漏成员/删除/旧token及边界回归2/2。
- read-set缺失API的E0599 RED→独立编辑/同文件ABA GREEN，补absence ABA/漏写/跨store/终态重试2/2。
- 旧引用查询重构前后store_contract22+class_binding7均通过；lib.rs由1645减至771行，
  尚超500为迁移债务；所有新source/test文件均≤500。原查询计划测试按责任迁入reference_query_plan_tests。
- `ix01-storage-suite`: SQLite包`--lib --tests` **126PASS/0FAIL/0ignored**，142.816s，
  包含100K原成本检查PASS；这是加入read-set前的候选，不冒充最后候选全量结果。
  原历史100K失败证据不删除，一次通过不解释历史波动。
- 同一自动序列的下一条Clippy碰到新read-set RED尚未实现的API，exit101；
  `ix01-storage-clippy.log`保留，这条失败不是运行时成本问题，且未到release步骤。
- 最后冻结存储候选`ix01-final-storage`：lib4+10个完整测试文件，**63PASS/0FAIL/0ignored**，22.296s；
  包括全部新接口和受影响的旧发布/引用/类查询表征，原始命令在同名json。
- 最后`ix01-final-clippy`严格`-D warnings`及`ix01-final-release`均exit0；
  早先Clippy曾因提取后旧测试不在同模块而编译失败，修正归属，没有放宽断言。
Context7 resolve-library-id本轮仍transport失败，未谎称获取库文档；API沿安装rusqlite0.40.1与已有用法。

**未闭环**：owner/版本借用与GC、崩溃及ACK恢复、最终counts、native独立读写控制面/4parser、
变更集及真实source fence、严格Node能力/收据校验与LSP、格式迁移与切库均待实现。
新格式仍未启用，128文件真实native回归仍RED（改1仍parse128）；
未跑pnpm全量、最终30K规模/2小时耐久或Windows/UI。本片GREEN不关闭R-13或IX-01。

## IX-01 / IX-05 第六切片：owner、借用、分批回收与真实异常退出

2026-11-04继续实现；parent仍298d65f，独立worktree未提交/合并/部署。
新增manifest_owner、versioned_gc/checkpoint及5个公开回归文件；新文件均≤500行。
组件格式由5经6推进到7，尚非生产schema12；真实缓存未迁移、未删除。

### 实现边界与生命周期

每个ManifestLog连接先取得workspace CacheLease/可识别物理库reader lease，
再持不可重用owner的OS独占锁登记，字段顺序确保SQLite连接先关闭、owner/库/workspace使用权后释放。
新建owner lock使用create_new，记录锁文件对象ID；GC仅在对象ID仍相同且非阻塞取得独占锁时认定owner已退出。
没有按PID/心跳/时间猜死亡；缺失、替换或无法验证的锁不授权删除；锁对象不在本机制中unlink/重用。
目录、reparse/symlink/hardlink与对象ID复用0028现有files helper，不新增宽松的路径身份规则。

写入新版本登记creator及pin；find_version复用与pin获取在同一SQLite写事务，
GC不能在“查到sealed”和“取得使用权”之间移除它。release_version显式交还本owner的pin；
活动组的entry继续保护所用facts。本owner还可放弃未引用的失败staging版本，不必等整个会话退出。
所有group staging/seal受创建owner约束；替代ManifestLog入口也有stage与publication的sealed/URI触发器，
不能在GC标collecting后重新借用/引用半回收版本。已提交组仍可按attempt ID返回原终态。

collect_garbage在SQL外非阻塞试探OS使用权，在同一writer事务内重新检查owner状态、
最新/活动entry及pin后操作。恢复失主、废弃未发布组、移除失主pin/退休entry、
将无引用版本标collecting后分族分批删除facts，维护FTS/FK，再删空版本和过期资格。
每量子最多4096逻辑项及4MiB估算fact payload；一个不可分的超大行允许像写入一样单项越界。
metadata逻辑项与fact估算字节分开，不把此值称SQLite页/WAL/物理IO/精确heap硬界。
最新已发布entry及墓碑暂保留；引用它们的历史数据仍可由已开启SQLite读事务读取旧页。
不做前台VACUUM/TRUNCATE；checkpoint_passive供后续维护executor调用，不能把busy=false单独当完成。
按[SQLite WAL](https://sqlite.org/wal.html#concurrency)与[checkpoint定义](https://sqlite.org/pragma.html#pragma_wal_checkpoint)，
PASSIVE不等待读者/写者退出，但实际IO时间仍需计入，不能承诺同步IO任意点可中断。
实际bundled SQLite经测试为3.53.2；未变更依赖。

### RED → GREEN 与必要对照

原始证据均在`.bench/index-versioned-maintenance-20261104`，以下失败没有覆盖删除：
- lifetime接口缺失的E0599 RED，补实现后基础活跃借用/关闭失主回归GREEN；一次OwnerLease可见性编译失败修正。
- `ix01-owner-fairness-red`：65个活动连接堵住固定64项扫描前缀，死owner一直不可见；
  改按ID游标轮转，保留不等待活动owner，GREEN。
- `ix01-fact-fairness-red`：持续加入新版本时，每轮1项全花在标新候选，旧facts一直不删；
  改先完成已有collecting版本，再选择下一个，GREEN。
- `ix01-partial-release-red`：失败staging即使主动release仍只能等owner关闭；
  补本creator在事务内放弃未引用partial，GREEN。
- `ix01-format-boundary-red`：不兼容格式虽然返回错误，已多登记一个owner；
  提前格式核验，包含替代ManifestLog入口，GREEN；没有改旧格式或放宽检查。
- `ix01-owner-identity-red`：仅名称相同的新锁inode错误地被当作死亡证明；
  追加注册对象身份并核对，GREEN。另一个缺失锁夹具同样保留数据，不擅自重建锁。
- `ix01-wal-red`接口缺失后实现；一次Rust区间模式语法编译错误修正，原日志保留。

真实子进程回归通过：测试进程已写sealed draft、未发布group及duplicate-ordinal导致的partial，
父进程先验证活动时不回收，再SIGKILL子进程；实际退出signal9，恢复1个owner、回收2个版本，
已发布Current/head1/原attempt终态不变。不是掉电或真实磁盘写坏测试，也不是语义Worker现场复现。

其他公开回归：独立连接borrow保护已退休旧版本，当前查询只返回新head；交还pin后旧版本回收。
单个2411逻辑fact版本以17项量子历经142轮回收，每轮预算保持，Current完整/旧FTS不可见。
两个并发collector的累计facts与versions只回收一次，不把并发错误吞成成功。
长SQLite read事务跨增量和GC仍读Before；新公开查询读After；
PASSIVE在读者存活时190帧仅回写120，读者结束后190/190，integrity_check=ok、FK违规0。
这里是独立SQLite物理快照/完整性对照，不冒充产品暴露了长快照端口或真实UI验收。

### 当前检查身份与结果

- `ix01-lifecycle-all`：加入锁对象身份最后补丁前，整个SQLite包 **139PASS/0FAIL/0ignored**，149.382s，
  包含原100K成本检查；输入hash在这套检查/Clippy/release期间未改变。
- 最后格式7候选`ix01-lifecycle-final`：lib+15个完整文件 **75PASS/0FAIL/0ignored**，25.626s。
  `ix01-lifecycle-final-clippy`为workspace/all-targets严格-D warnings；默认sidecar release构建，均exit0。
- 新接口在experimental-occurrence-without-rowid配置12个完整文件 **36PASS/0FAIL/0ignored**，
  这是明确的新增接口范围，不称整个实验配置GREEN。
- 额外完整选集experimental运行 **43PASS/3FAIL**后停止；失败是旧store_contract手工v4/v5/v6迁移夹具，
  都报`experimental occurrence layout requires a separate fresh cache`。
  未修改298d基线用独立target运行同一完整store_contract：**19PASS/相同3FAIL**，
  错误及函数相同，证明是既有profile边界与旧夹具预期冲突；没有顺带改为skip/放宽断言。
  因此保留实验配置全选集失败状态，不能与新增接口36PASS混算成全绿。
- Context7 SQLite resolve仍transport失败；本片回退到SQLite官方WAL/pragma资料和安装rusqlite0.40.1 API。
  格式、workspace身份及原编译器/source freshness合同未放松。

### 仍须完成，不能提前启用

这只是存储生命周期基础。正常Native维护触发/低优先级调度、控制面接收、任务owner边界与自动清算、
已完成attempt/owner/锁对象的受控保留与清理、墓碑和group header的完整GC仍需接通/验证；
新`.owners`目录的cache inventory/整库退役协调、生产format迁移/选库与强杀/ACK恢复尚未完成。
当前保留终态header与稳定锁对象，以避免旧attempt重放或锁inode重用；**不宣称metadata已经有界回收**。
Windows的文件占用/对象ID/锁/kill语义未实机验证。

Native热复用不能对每个未变文件调用带pin写入的借用接口：应先比较当前可见entry和源键，
只给确实需要staging/复用历史facts的变更集取得pin；普通No-op仍做必要集合/磁盘证明。
当前write_version分族事务是基础API，Native批writer仍须验证跨小文件合并的实际事务数/同步成本，
不能把组件测试通过当作冷索引性能已改进；这些成本尚未实测，不预设归因或固定收益。

原128文件Native RED仍未修复：生产catalog没有使用新组件。
IX-01/05继续IN_PROGRESS，IX-02/03/04未接通；全量pnpm、最终规模/30K两小时耐久和真实UI均未运行。
目标保持ACTIVE；无提交/合并/发布、无日常部署、无真实缓存删除。

## IX-02 / IX-05 第七切片：活动库控制器、受控切库与短事务验证

2026-11-04，仍在298d65f独立worktree；未提交、合并、部署或删除真实缓存。
本片将存储基础接入既有catalog物理选库控制器，**尚未接入Native stdio入口/TS客户端**。
不能把“控制器已可用”写成“原128文件端到端已修复”。

### 实际实现

新增catalog_backend / catalog_migration / catalog_maintenance、versioned_input_view、
versioned_fact_guards及publication工作计数。公开CatalogStore::open保持旧格式模式；
显式open_with_domain才可读新库，并核对workspace、物理store ID、facts domain、application_id、
schema profile及本data库head下界。Bootstrap仍旧完整可读，Native默认入口没有自行迁移。
新格式在隔离API测试中标记12/112，组件格式最终8；生产客户端尚未启用，旧默认schema11/111不变。
旧reader遇已切换新库明确拒绝，不把不兼容库当空库；新域不能解释旧域facts。

CatalogMigration在同namespace分配新私有物理库，仍使用publication锁、workspace/reader lease，
完整指纹资格及quick_check/FK/FTS integrity、checkpoint和目录sync后才可切换control指针。
control仅选物理库，完整资格与head保留在data DB；没有假设两库跨库原子。
完整源fence回调在publication锁/SQL事务外；最后锁内做短的父库/数据代和准入检查，
父库构建期间被更新则拒绝，新库head从1低于旧5仍可正确切换且以store/domain区分。
这是显式完整bootstrap/升级API，不是普通文件变化走私库重建的fallback。

CatalogMaintenance只接管当前已选新格式；准备变化URI的同快照read-set及URI/SHA/entry元数据，
不物化完整文档，不给未变文件逐个登记pin；历史facts真正要复用时才走带pin的find_version。
变化facts暂存后，commit复核read-set、当前physical store和短的admit回调，再由同data DB事务发布。
完整资格另有独立结果：一次data已发布后资格被取消/失效，不能改称“未写取消”；新token可重试资格而不重写facts。
No-op资格不推进head或替换物理库。提交permit直到data COMMIT后才释放，覆盖物理切库和输入/取消准入顺序。

CatalogStore保持全部旧查询接口；存储后端/迁移模块归属于catalog_api facade，
没有让已超限lib.rs增长（仍771行，既有迁移债务保留）；所有新增手写文件≤500行。
后台退役函数泛化为关闭具体backend后沿用现有受管prune，不在查询循环中关闭大旧库。

### 发布事务的运行时反例与修复

复核发现先前publication trigger在最终UPDATE内再次EXISTS遍历整组，违反“短事务只更新组头”设计。
使用已安装rusqlite0.40.1 Statement::get_status(VmStep)直接统计两条UPDATE及其trigger：
1成员142步，129成员2830步，`ix02-publication-work-runtime-red`真实失败。
该计数**不包括**preflight读、BEGIN/COMMIT、B-tree物理IO、源码检查或fsync，不是时延/物理写字节。

修复把约束落实为：staging入口检查sealed版本及URI；sealed key/facts不可修改；
版本被entry/live pin引用时不能转collecting；当前/活动entry及已封存group身份不可变；
facts进入collecting且分批删空后才能删除版本，禁止用FK cascade进行一次大删除。
这些约束使最终publication仅检查已sealed group的常数状态，不再扫描成员；没有删除输入/身份校验。
修后同档均125步，完整大文件分批GC、真实子进程强杀、旧读快照及所有既有facts测试继续通过。
新增独立SQLite写者测试明确拒绝改sealed key/符号、删当前entry、给封存组添成员或改已发布commit_seq。
这不把缓存DB当恶意SQL的安全边界，也不声称整个索引流程O(1)：read-set/namespace preflight、
完整集合核对和源fence仍可能随实际组/项目规模增长，且本片没有大规模时延证据。

### 回归及证据身份

`.bench/index-versioned-maintenance-20261104`保留：
- `ix05-catalog-selection-red`、`ix02-controller-red`：缺接口RED；实现后各4项最终公开API回归通过。
- 切库覆盖旧库持续可读、旧未协商reader拒绝、低head新域、来源/准入拒绝、源回调内旧库写入不死锁且被父代fence拦下、域升级。
- 维护覆盖同物理库单文件更新及未变文件、No-op、最终源检查期间发生物理替换拒绝旧提交、
  已发布data后资格取消及新输入恢复、只读当前键不增加per-file pin。
- `ix02-publication-work-api-red`接口缺失、`...runtime-red`计数142/2830，
  `...green`及`ix02-seal-invariants`：125/125与保护约束、合法GC继续通过，原失败均保留。
- 默认SQLite整个包`ix02-final-storage`：**150PASS/0FAIL/0ignored**，172.681s，包含原100K成本检查。
  随后仅修复当前键视图的重复点查和lint（之前新增getter未接用，Clippy报dead_code），
  `ix02-final-input-view`五个完整相关文件**12PASS/0FAIL/0ignored**，16.002s；
  后续test-only clone→from_ref lint修正未改变断言。
- 最后workspace/all-targets严格Clippy `ix02-final-clippy-fixed`、默认sidecar release均exit0。
  之前collapsible_if、unused getter及test clone lint失败日志保留，没有放宽lint。
- 五个完整旧Native子进程文件`ix02-final-native-characterization`：**35PASS/0FAIL/0ignored**，32.781s；
  覆盖NDJSON、打开、发布、hash选择和hash fence，证明本次旧路径表征，无新协议/真实UI结论。
- `ix02-native-128-still-red`：真实旧Native请求回归**仍FAIL，parser128!=1**，3.95s；
  main/Planner尚未调用新控制器，因此不把存储150PASS/Native表征35PASS当端到端修复。
- 本片Context7 rusqlite resolve仍transport失败；API依据安装0.40.1源码，未谎称获取query-docs。

### 接下来必须接通的范围

IX-02已开始但远未完成：真实Native控制循环/独立reader、4parser/批writer、变更/取消进入活动任务、
任务单一终态及公平/背压/进展、实际源读取/目录对账/最终witness仍待实现；
本片source/admit主要是受控回调对照，**不是**真实watch或全项目源fence验证。
必须保持128文件同等parser1与完整查询断言，并接通实际新版默认客户端/公开LSP调用链，
不能仅换一个测试入口得到绿色而让产品仍走旧全写路径。

尚须补：partial/unqualified bootstrap发布语义（当前activate要求完整资格）；
跨进程/强杀/ACK缺失的控制库选库验证；group/owner/锁对象保留治理及新目录cache inventory；
实际冷批写事务数与成本；新112表模板尚未继承旧experimental WITHOUT ROWID物理特性，
不能把此前新增接口36PASS或12/112域隔离称为该物理布局迁移已验收。
以上在新格式生产启用前闭环，不以长期实验flag回避。

IX-03/04的TS事件、strict validator、完整资格消费及legacy兼容未开始，
pnpm全量、最终规模/30K两小时和真实UI/Windows仍未运行；原实验旧迁移3FAIL及100K历史失败保留。
没有关闭R-13、没有Accepted追认或合并/发布，目标仍ACTIVE。


## IX-02 第八切片：真实 Native 维护与终态恢复（IN_PROGRESS）

仍固定 parent `298d65f5d7f796c347fe8be5c739e428066489d8`，隔离分支未提交。
新增协商能力 `versioned-file-maintenance-v1`；实际 NDJSON initialize 后可以 start/status/cancel。
控制循环不负责解析/写入；单活动维护线程使用既有四 parser escrow 槽及同一准入 walker，
冷建走私库迁移，普通对账比较 URI/SHA 后只提取变化文件，同物理库发布组；No-op只发新资格。
真实目录集合和源 witness 最终重新核验，没有删身份检查或把对账称为 O(1)。

`maintenance_protocol` 真实子进程覆盖：
1. 维护等待时 status/cancel 可达，ACK 后状态 cancelling，匹配 attempt+input 才能取消。
2. 128 文件冷解析128，改一个文件解析1、writtenDocuments1，未变文件可查、旧符号消失；
   无变化新输入解析0、facts0、documents0、dataPublished=false、store/head不变。
3. 重复 start 不增建线程，旧 input cancel 不能取消新输入，正常取消 error=null。
4. 受控 data commit 后 panic 返回 unknown/dataPublished=null；已提交数据可查，新输入同会话恢复资格且不重写。
5. 受控线程在 terminal send 前退出后，poll 在确认线程结束后再次读取终态通道；
   Disconnected 合成 unknown，join 清算并记录 resourceError，新输入无需重启即可继续。
   此为 Rust 维护线程故障注入，不是已复现现场 Node Worker/OOM。

`maintenance/status` 现在明确标 `statusScope:task`，不是当前 data DB 新鲜度证明。
维护任务终态、取消ACK、实际线程join不同；发布已准入或结果未知时不误报“未写取消”。
结果通道在第一次 try_recv 返回 Empty 与线程结束之间可能竞态，完成后必须再读，不能覆盖已发送终态。

证据（均在 `.bench/index-versioned-maintenance-20261104`）：
- `ix02-maintenance-protocol-red`：原接口 method_not_found；实际控制/解析路径 RED→GREEN。
- `ix02-cancelling-status-red`：真实 running/cancelling 断言失败，后已修复。
- `ix02-publication-unknown-inverse-red`：受控旧错误分类反例；不是298d现场故障。
- `ix02-missing-terminal-inverse-red`：受控恢复原 ready-only poll，30s guard 失败；好实现随后恢复。
- `ix02-native-missing-terminal-green`：五项完整文件 **5PASS/0FAIL/0ignored**，12.303s；
  同候选 workspace/all-targets 严格 Clippy 与 release 均 exit0。
- 更早 `ix02-native-protocol-final-tests` 41PASS，但早于第五项，不冒称覆盖它。

边界：只有显式协商的新 API 已接通，默认 TS/LSP 尚未消费；
原 `catalog_incremental_maintenance` 旧调用路径 parser128!=1 的失败仍保留，未删/跳过或降断言。
尚缺 changes/按URI pending、公平后继与背压、组合小文件批写、独立读执行器、partial bootstrap、
新 producer 域旧缓存恢复、自动GC/完整迁移与严格 Node/LSP 接通。不能把 negotiated128 通过称产品整体修复。

## IX-01/02 第九切片：查询与资格同快照（IN_PROGRESS）

新 `QualifiedRead<T>` 绑定 workspace/store/domain/head、当前 input 的可选 qualification 与查询 payload。
`VersionedFacts::qualified_read` 自己建立只读事务并先读 manifest_identity 固定快照；
回调只得到 `&dyn SymbolStore` 读接口。符号/导出/引用/继承/绑定/metadata 内部复用该读事务，
不再在同连接嵌套 BEGIN；既有独立查询仍自己拥有事务，legacy 引用路径仍自行 BEGIN。
`CatalogStore::qualified_read` 先按现行 control 选库，再读取同一 data 快照；
不把 control 与 data 两库当跨库原子，不在查询期间持 publication 锁。
旧后端返回 None 且不执行 callback，不能编造新格式资格。

有效回归：另一独立连接在读回调前发布新 head，旧 payload/资格/head 仍一致，
下一读看到新 payload/head、资格为空；所有六种标准读接口均检验 served_generation。
另一 owner 在回调中发布同域新物理库（两库均head1），旧回调保留旧store/资格，下一读选新store。
这是同进程独立连接/owner 的交错验证，不冒充跨进程或 Windows 验证。
另覆盖回调报错/panic后的读事务释放、不同issuer不互认、legacy不执行新格式回调。

- `ix02-qualified-read-api-red` / `ix02-qualified-catalog-api-red`：接口缺失编译 RED。
- `ix02-qualified-read-runtime-inverse-red`：受控移除外层读事务，真实运行返回新数据造成旧符号0!=1；
  日志保留，随后恢复，不是声称298d已有该新接口或现场已出现混配。
- 最终存储全包、Native相关回归、Clippy/release：见 `ix02-qualified-read-*` 命令收据；
  这些验证在本切片完成后单独记录，不用前一切片的通过代替。

Context7 resolve 再次 transport 失败；API 回退实际安装 rusqlite0.40.1，
隔离语义依据 [SQLite 官方隔离文档](https://sqlite.org/isolation.html)。
这个接口证明的是一个已选 data DB 快照，不是磁盘/SDK/compiler 最新输入证明；
独立 reader executor、原生查询 envelope 和严格 TS 验证仍待接入，task 状态尚不升级为 authoritative status。

完整 pnpm、规模配对、30K两小时和真实UI/Windows仍未执行；R-13仍OPEN、ADR仍Proposed，未提交/部署/合并。


## IX-05 第十切片：实验物理布局与GC（IN_PROGRESS）

计划已有兼容缺口不是新架构：先前新格式112实际仍为rowid，GC统一读取rowid。
`ix05-occurrence-layout-red` 在 experimental 编译的真实SQLite `pragma_table_list.wr` 上失败：false!=true。
建表现在仅该配置给v_occurrences使用WITHOUT ROWID，文件组件格式显式区分默认8 / experimental108；
物理catalog标签保持12/112，旧默认11/旧实验111的既有合同不变，不原地改用户缓存。

随后不改既有GC断言，直接运行experimental `versioned_gc_budget`：
`ix05-occurrence-gc-red` 真实失败，含 `no such column: rowid ... FROM v_occurrences`。
修复occurrence按version+ordinal选择/删除；ordinal不是全库唯一，删除必须保留version条件。
其他facts仍使用rowid，并同样保留version条件；仍≤4096元素/4MiB估算量子，不增加全版本cascade。
`ix05-occurrence-gc-first` 两项原回归PASS，含大版本17元素分批与并发collector、不损当前版本。

再构造隔离的“格式tag正确、实际表结构错配”样例，保留原数据/owner数量：
`ix05-layout-fence-red` 证明之前会打开错误布局；修后在登记owner前检查真实wr，
default与experimental两组 `ix05-layout-fence-*-green` 各3PASS，未知tag及真实结构错配均拒绝。
这里只验证物理格式/安全拒绝，不声称数据损坏恢复或Windows占用已验收。

依据：[SQLite WITHOUT ROWID](https://sqlite.org/withoutrowid.html)、
[PRAGMA table_list](https://sqlite.org/pragma.html#pragma_table_list)；Context7失败及本地依赖版本沿前片记录。
最终配置分开验证：`ix05-layout-experimental-versioned` 运行全部versioned文件及manifest公开接口，
`ix05-layout-experimental-native` 跑真实维护NDJSON；默认SQLite整包/维护NDJSON另记，
两配置严格Clippy与release分别留收据。仅当前命令exit0才算该组通过。
此前旧experimental store_contract三项迁移fixture失败及298d对照不被这些选择测试覆盖，也未删除或放宽。

前一切片最终冻结结果：`ix02-qualified-read-storage-full` **154PASS/0FAIL/0ignored**，195.938s；
`ix02-qualified-read-native` **42PASS/0FAIL/0ignored**，76.315s；严格workspace Clippy/release exit0，
`ix02-qualified-read-frozen.json`证明174个Rust/lock输入未变，产物SHA256
`cbf4e7070ece2f244f6fd5c433c51272f97335592eef6f1acc5e31a36cbd7920`。
这些早于本物理布局/GC修正，不冒称是最后候选的全量检查，最后证据以ix05-layout命令收据为准。

后续优先：维护变更账本/公平pending、独立读executor与真实资格envelope、partial/producer升级、
自动GC及完整owner/lock治理，再接默认Node/LSP和规模/30K耐久；目标仍ACTIVE，未部署/提交/合并。


### 第十切片最终检查收据

最终源码冻结 `ix05-layout-frozen.json`：174个Rust/lock输入前后相同。
- 默认SQLite整包 `ix05-layout-default-storage-full`：**156PASS/0FAIL/0ignored**，196.467s，含原100K成本检查。
- experimental版本化/manifest公开接口17个完整文件：**52PASS/0FAIL/0ignored**，40.506s。
- default / experimental真实Native维护各 **5PASS/0FAIL/0ignored**，16.740s / 20.405s。
- 两配置workspace/all-targets严格Clippy、两配置sidecar release均exit0，命令在同名JSON，未跳过断言。
- 默认产物SHA256：`3111a97db6ea6fc839ce4ee9d4218ddab8f76ae176820d86fb2589514e239d65`；
  experimental产物：`678cca70f26c59cd560554a66d5522857bea8c895de02907ed1ea416f8aaa272`。
- `cargo fmt --all --check`、两工作区 `git diff --check` 通过；原44文件快照除授权文档外无变化。
  新增/本次修改的手写源码测试均≤500行，唯一剩余迁移债务lib.rs771（先前1645，未继续增长）。

这些是Rust/Native局部验证；未跑完整pnpm、默认LSP端到端、最终规模/30K耐久或真实UI/Windows，
也未重新跑旧experimental迁移fixture的已知3FAIL，不能称整个workspace/全配置检查全绿。
默认客户端仍旧格式，新能力仅显式协商，旧128解析失败证据继续保留；不改变ADR的Proposed状态。


## IX-02 第十一切片：URI变更账本、局部维护与公平进展（IN_PROGRESS）

实现仍在隔离分支，默认TS/LSP未切换。真实NDJSON增加 `maintenance/changes`：
`input={issuer,revision}`，`changes=[{uri,kind:changed|created|removed}]`，
`uncertainty=[namespace|configuration|watch-overflow|reconnected]`；字段严格，原因按集合规范化。
URI使用现有256项/单项4096字节/总64KiB传输额度，pending也按既有URI额度有界，
不增加源码准入、RSS或时延门槛。额度外保留最新input和needsReconcile/precise=false，不能声称精确消费。
该额度只约束本账本，不能称旧stdin原始队列/全进程内存已被严格界定。

同URI合并最新input和kind，保持首次排队位置；活动URI的新输入仅取消该任务，
不影响其他URI。全范围对账或结构/配置不确定性才涉及更广的取消域。
局部任务读取磁盘真实现状，watch kind只是线索；迟到removed不能覆盖已恢复内容。
按祖先路径重新检查原ignore/硬排除规则，不调用全项目walker；复用既有有界current-source reader。
源码必须是同Root下可核验的真实普通文件，路径保留原始文件名大小写，不全路径lowercase。
局部结果显式scope=file、changeKind、snapshot store/domain/head且qualification=null；
它不是完整查询资格。仅相同当前input、无未覆盖输入的完整对账收据可清除needsReconcile并使native READY。

No-op局部任务也调用CatalogMaintenance.verify_noop：源fence在publication锁外，
同data读事务检查entry/namespace/read-set，最后physical store/admit guard；不另写业务发布组。
同字节的entry ABA或源回调期间换库均拒绝。owner/使用权登记仍可能写元数据，不能把facts0叫整DB零写。
完整对账No-op另行提交新资格，仍扫描/核验完整准入集；不是整体O(1)。

### 新RED与验证范围

证据目录统一 `.bench/index-versioned-maintenance-20261104`，parent仍298d。
- `ix02-changes-red`：真实child method_not_found；128文件普通变化调用链原本不存在。
- `ix02-changes-first`：复用Producer EOF已进入验证态，却再次只接受running导致误报maintenance cancelled；
  修为只允许running→validating或已validating，保留cancel竞态检查，未覆盖接受的取消状态。
- `ix02-changes-known-green`：普通改1文件只解析1，未变127不解析；局部后stale，完整资格只补元数据，原5项维护回归继续通过。
- `ix02-changes-fairness-inverse-red`：受控改成所有变化取消活动任务，稳定文件被取消的实际断言失败；
  这不是原现场复现或298d新API行为。恢复正确作用域后 `...fairness-green` 两项PASS。
- `ix02-point-noop-api-red-corrected`：缺verify_noop的真实API RED；
  `...point-noop-green` 两个完整存储文件PASS，覆盖取消/来源拒绝、同内容ABA和换库。
  首稿误把fixture返回文本当receipt的编译错误及一次Job input部分move编译错误均保留，未算运行时缺陷。
- `ix02-changes-new-input-state-runtime-red`：新完整对账输入仍显示旧READY，真实ready!=warming失败；
  修后只有匹配当前input的完整资格恢复READY；`...lifecycle-green` 四项生命周期及原维护/变化文件通过。
- `ix02-changes-bounded-first`：活动文件停在parser时积累257项，pending有界且precision退化；
  overflow输入水位保留，显式完整对账恢复；不是无界burst/性能或耐久结论。
- `ix02-changes-case-alias-red`：Mac真实大小写不敏感卷，mixedcase别名实际发布第二份物理源facts（10行）；
  修复canonical URI一致性检查后 `...case-green` 输出aliases=true/outcome=failed并只保留一个原始大小写URI。
  不冒称Windows实机验证，大小写敏感卷运行另一个明确分支。

新增公开child回归还覆盖相同通知幂等、不同行为复用同input拒绝、新input同字节仍需资格、
删除/恢复sealed facts无需parser、真正新文件只解析自身；目录walker故障下point成功但完整对账明确失败，
UTF8读错不当删除、相邻根URI拒绝且不推进水位、旧终态不能替新input清dirty、正常取消不报error。
这些是固定有限交错/故障回归，不能当30K真实UI或两小时稳定验收。

### 仍未闭环

结构不确定性后的后续精确URI必须受global barrier约束，防显式移动被拆成中间状态；正在补证。
其他仍待完成：自动/有界对账调度、独立reader executor及authoritative native查询envelope、
合并小文件批writer/4parser吞吐、partial/bootstrap与producer升级、自动GC/owner/锁清算、
默认Node事件/strict资格消费与旧协议兼容，最终完整pnpm、规模配对及30K两小时。
不把本片有限文件量/单URI量子称整个方案已完成，不关闭R-13或追认ADR Accepted。


### 结构屏障的反例、修复与最终收据

`ix02-changes-namespace-barrier-red`：真实文件Before→After移动并记录namespace不确定性后，
后续After编辑让point线程提前启动，spawns2!=1；这证明“只清一次pending”不能保持结构屏障。
增加独立barrier状态：精确URI仍合并保留但暂不执行；完整start可覆盖屏障内待办，
只有最新input的完整资格才一次清理这些已覆盖意图。原任务被新input supersede时不清屏障。
公开回归要求移动前后映射只有一个新增可见head，且最终仅有新URI；
`...namespace-barrier-green` 三个完整维护文件 **14PASS/0FAIL/0ignored**，28.529s。
这是观察到结构不确定性后的屏障，不是自动证明任意watch数组都是原子移动。
显式成组移动应走namespace路径；普通独立通知是局部data，不得当完整集合证明。

最终候选（仍未提交）检查：
- `ix02-uri-barrier-default-native`：**76PASS/0FAIL/0ignored**，77.140s；
  含新14项与既有NDJSON、扫描/hash/source fence、class binding/可用性完整文件。
- `ix02-uri-barrier-experimental-native`：**39PASS/0FAIL/0ignored**，33.622s；
  含新维护与两份class binding完整文件，不冒称experimental整个workspace通过。
- SQLite默认整包 `ix02-uri-final-default-storage`：**157PASS/0FAIL/0ignored**，203.357s；
  experimental版本化/manifest接口17份完整文件 `...experimental-storage`：**53PASS/0FAIL/0ignored**，50.143s。
  后续仅改Native屏障/回归，130个SQLite/Core/lock输入完全相同，
  `ix02-uri-barrier-storage-reuse.json`留证；不是声称屏障修改后重新跑过整包存储。
- 最终两配置workspace/all-targets Clippy（-D warnings）、两配置release均exit0；
  `ix02-uri-barrier-frozen.json`冻结180个Rust/lock输入，所有列出检查均有独立JSON命令收据。
- 默认release SHA256：`bdc87a9ee08ffc5be487c18375282c1d419984f744f30a5d23c7aa2174fe21d3`；
  experimental：`87f6573d4d80399c2a53e61c83a9757a26a9979b115a2e7637b4ca305984f7fc`。
  子进程回归使用cargo调试构建；release在这里验证构建，不冒充release时延/耐久测试。

fs::canonicalize的Context7 resolve仍失败，原始返回保留 `ix02-uri-context7.json`。
回退核对[Rust官方文档](https://doc.rust-lang.org/std/fs/fn.canonicalize.html)，
线上页显示1.99.1，1.95.0固定页无法取得；实际编译/测试仍Rust1.95.0，
Mac大小写别名是本机行为证据，未据线上文档声称Windows实机已过。

最终完整pnpm/默认LSP、两类规模对照、30K两小时及真实UI/Windows尚未执行。
目前只减少Native文件facts的重复解析/写入，不等同语义Program增量或证明跳转/引用时延改善。
持续输入/overflow下全范围进展、跨进程组合及真正同步不返回的边界仍需后续组合验证；
正常精确URI有限交错的公平性不外推为全部负载无饥饿。
冷建小文件写事务合并、长期parser/维护槽、独立reader、自动对账/GC、partial与域升级仍待闭环；
activeMaintenanceTasks只计主维护线程，parser已join但异步retire/owner锁保留尚非完整回收证明。
旧默认128解析RED、旧experimental三项迁移fixture失败、旧30K引用/重命名/SDK限制及无关缓存TODO保持原记录。
原项目/日常安装/真实缓存未改，原工作区除授权文档外未动，未提交/合并/发布。


## IX-02 独立reader与查询取消（2026-11-04，进行中）

隔离parent仍`298d65f5d7f796c347fe8be5c739e428066489d8`，未提交；本片只运行Rust公开API/真实NDJSON子进程，SDK NOT_USED。
新模块`reader.rs`/`reader_worker.rs`/`read_runtime.rs`负责两个长期独立连接、四个等待槽和资源终态；
`read_query.rs`复用旧查询参数校验/结果序列化，`WorkspaceIndex::read_store`仅借出标准只读端口。
初始化的CatalogStore转交首reader，现代模式主Runtime不额外钉一条旧库连接。
`index/status`从data读真实库/head/Q，旧`status`仅task；每查询Q/身份/payload同data读事务。
显式现代协议才启用，新默认Node/LSP尚未连接；legacy discovery没有完整Q，不伪造资格。

### 已有公开回归及RED范围

证据均在`.bench/index-versioned-maintenance-20261104`，没有以私有Runtime单测替代公开child。
- `ix02-read-port-red`缺方法编译RED；既有Core五份文件先表征，再提取`workspace_index.rs`；
  `...read-port-green`完整Core通过。旧Core lib1313→1168行，SQLite lib771→761行，剩余超限债务保留；新源码/测试均≤500。
- `ix02-reader-data-status-red`缺真实data status；`...reader-first`同时保护原NDJSON/class binding。
  `reader_queries`逐项对照新旧search（含excluded）、exports、引用候选、class binding及非法输入；
  去掉明确新增snapshot/Q/format后业务payload及error保持相同。
- 两个真实Native进程：同head另一issuer No-op不覆写原issuer Q；peer推进head后原owner task仍历史ready，
  新data status必须stale/Qnull；强制私库替换后读到新storeId/head1，不与旧store的head2比较。
- `ix02-read-cancellation-red`缺API编译RED；`...reader-exclusive-cancel-red`真实API接受了第二活动连接绑定，
  修为Busy且保留第一绑定，三项公开取消API及同快照读取继续通过。
- SQLite VM进度gate、取消后实际资源结束/复用同连接；另有非协作gate证明cancel终态不是槽位释放。
  `...reader-slot-inverse-red`受控逆改提前释放槽实际失败，恢复后通过；不是原现场挂死证明。
  输入推进撤销旧查询但共享文件维护继续完成；旧input明确拒绝，晚到旧token取消不命中新查询。
- 有界等待/第五项busy、排队取消补位、shutdown所有接受请求唯一cancelled终态，然后实际join退出。
  读线程致命退出受控注入发生在每query unwind外；`...reader-fatal-red`在无注入钩子时返回成功，
  它只校准故障注入，不把它称原产品故障。现有退役逻辑会返回unavailable，不无限补线程；
  显式reinitialize新epoch可恢复，旧epoch取消拒绝。
- `ix02-reader-pending-retirement-red`确认真实候选缺口：两reader故障结束时已接受等待4!=0，
  会永远等待不存在的线程。修复全部退役后同时结清等待队列，`...pending-retirement-green`三个完整reader文件8PASS。
- 关闭排空结果曾误放正常pump的候选错误已在冻结检查前纠正；关闭后错误只写stderr，普通派发不吞结果。

新增`ReadCancellation`绑定作用域及progress handler，SQLite_INTERRUPT→typed Cancelled；
取消线程持绑定锁到interrupt返回，解绑后旧取消不再触碰复用连接。独立进程监督deadline未改，
非SQL同步段仍可能不立即退出，不能据控制ACK声称任意段可抢占或完整close有界。
Context7 resolve仍传输失败，原始`ix02-reader-context7.json`保留；回退核对锁定rusqlite0.40.1源码及
SQLite官方interrupt/progress_handler，未声称query-docs成功。

### 当前验证与剩余边界

`ix02-reader-frozen.json`冻结当前Rust/Cargo输入；首轮`...final-default-core-storage`完整两包223PASS，
`...final-default-native`14份相关完整文件84PASS，fmt PASS。其余实验/Clippy/release尚在执行，最终收据后续追加。
这不是整个workspace全绿，旧默认128解析反例仍RED，旧experimental迁移3FAIL继续保留；没有删/忽略这些失败。
旧30K引用/rename/SDK、真实UI/Windows、规模对照和至少2小时单会话均未在本片执行。
自动对账/低优先GC、persistent4parser/小文件批writer、partial/domain升级、完整资源生命周期、
Node事件/strict资格/最终证明接通仍OPEN，R-13及IX-00–08不能标完成。


### 取消API重入反例与修订候选

首轮完整检查后继续API边界审计，新增`rejected_nested_snapshot_does_not_remove_the_outer_queries_sql_cancellation`。
`ix02-reader-nested-cancel-red`是真实公开API运行失败：内层拥有事务的read_snapshot应失败，
但在BEGIN失败前已经覆盖连接唯一progress handler，随后Drop删除它；
外层在SQL开始前cancel（此刻sqlite3_interrupt无活动语句，按官方语义不生效），下一次search仍返回300个Match。
此范围仅为嵌套公共API边界，不声称Native当前查询路径会递归调用该API，也不冒充30K现场故障。
修复在attach回调之前检查必须autocommit，返回Busy而不触碰外层绑定；
`...nested-cancel-green`取消API4项加同快照读取原3项均通过。
reader epoch加入创建时间信息并保留PID/进程内单调序号，减少PID重用与历史令牌冲突；
既有重初始化/旧epoch及旧token回归继续保护会话隔离。

修订后重新冻结`ix02-reader-v2-frozen.json`；首轮`...reader-final-*`收据和hash保留，不能冒充本修订候选。
`...v2-final-default-core-storage`完整Core63PASS/SQLite161PASS（合计224，0FAIL/0ignored），220.507s；
其余当前检查继续收集。读取取消不调整产品deadline、SQL源准入或V8/RSS策略。


本片新增运行时RED命令（共同parent=298d65f5d7f796c347fe8be5c739e428066489d8；均exit101）：

```sh
cargo test --locked -p arkts-index-sqlite --test versioned_read_cancellation one_cancel_owner
cargo test --locked -p arkts-index-sidecar --test reader_retirement
cargo test --locked -p arkts-index-sqlite --test versioned_read_cancellation rejected_nested_snapshot
```

对应日志分别为`ix02-reader-exclusive-cancel-red.log`、`ix02-reader-pending-retirement-red.log`、
`ix02-reader-nested-cancel-red.log`。RED为当时未提交候选的具体缺口，不能称这些API在原298d已存在。
SQLite进度回调受控gate可发生于prepare或step，尚未细分具体SQL阶段；
debug marker的VM称呼不构成该阶段已测的证据，不据此归因真实30K热点。


### Reader修订候选最终收据（仍不是整体最终验收）

`ix02-reader-v2-final-*`九份JSON分别包含原始命令、起止/耗时、退出码和冻结输入未变化证明。
`reader_checks_v2.py`可在同一隔离工作树重放；`ix02-reader-v2-frozen.json`固定本片Rust/Cargo输入。
- fmt exit0。
- 默认Core63 + SQLite161，完整两包 **224PASS/0FAIL/0ignored**，220.507s。
- 默认Native14份相关完整文件 **84PASS/0FAIL/0ignored**，132.889s。
- experimental版本化/manifest等18份完整存储文件 **57PASS/0FAIL/0ignored**，59.084s。
- experimental Native8份相关完整文件 **47PASS/0FAIL/0ignored**，70.272s。
- 两配置workspace/all-targets Clippy `-D warnings` 均exit0；两配置release均exit0。
- 默认release SHA256 `fd8e5acbcc2cb2f6faf7df265d2787b7504a138d15f097224e37461e2b323f01`；
  experimental `0cdd3fd9aec9dc5ba39861f323bdee7a219d9be24093a48dd082129f76df266e`。
  两个真实产物分别保存在`artifacts/reader-v2-default/`及`reader-v2-experimental/`，映射见`ix02-reader-v2-artifacts.json`，未重新构建/部署。

`ix02-reader-legacy128-retained`在当前修订候选重跑旧默认公开反例，仍exit101/1FAIL：实际128、期望1。
因此不能称整个workspace通过、默认功能已优化或可以合并；不是用focused检查跳过后抹掉失败。
旧experimental三项迁移fixture原失败仍按既有证据保留，本片没有重跑或声称已经修复。
子进程功能回归使用debug构建；release这里只验证构建/保存身份，不作为release性能或耐久计时。
SDK未使用，未执行Node/LSP、pnpm check:fast、30K、真实UI或Windows；没有改默认RSS/V8/超时/规模阈值。
两处既有大文件债务仍是Core lib1168、SQLite lib761行，其余本片新增源码/测试均≤500。

本片交付独立读取、权威快照/资格、取消与队列终态边界；R-13/IX总目标继续ACTIVE。
下一片优先补冷建小文件批writer/长期parser所有权、自动对账及GC/迁移生命周期，
随后接通默认父端URI/输入与strict资格消费，再做最终完整检查、规模对照与原30K耐久；不部署/提交/合并/发布。


## IX-02 长期parser所有权（2026-11-04，进行中）

parent固定298d，隔离工作树未提交。此前Producer每次任务创建/销毁最多4个parser线程，
包括普通单URI维护。公开RED命令：
`cargo test --locked -p arkts-index-sidecar --test maintenance_parser_lifetime`；
`ix02-parser-lifetime-red` exit101，冷任务完成后实际worker_exit4、期望0。
先跑`catalog_streaming/catalog_stream_equivalence/catalog_hash_first`既有完整文件表征，
`ix02-parser-legacy-characterization` exit0，再提取共用源码读取/解析与槽位所有权。

现代维护owner空闲时拥有Pool；发起任务时把整个池移给维护线程，以内部Completion连同实际终态归还。
Producer只独占借用它，取消/失败/异常展开都必须接收每个忙槽位的真实结果才结束借用，
不能清客户端任务或发送cancel ACK就把槽位当空闲。不持Mutex横跨解析/SQLite写入，
因此消费者unwind后没有遗留poisoned锁；这不是吞掉poison后假装健康。
仍为原有最多4个单项escrow、结果有界及按序交付，按需要从0增长到4，
不增加源码/timeout/RSS阈值，也不新引入批量解析载荷/无界reorder。

提取`catalog_parse.rs`保留原文件大小/内容见证/读取与parser准入；
`catalog_parse_pool.rs`负责槽位、独占借用、实际清算及关闭；Producer负责顺序/进度/SourceStamp收集。
legacy Producer继续任务独有pool、任务结束实际close/join，历史协商/格式仍不改。
现代普通任务、取消、每输入pure parser异常不退出健康parser线程；parser异常仍报告failed并写stderr。
这里的复用对象是纯Rust索引提取线程，不是SDK解析、语义Program或Node语义Worker；
维护协调线程仍按任务启动，`maintenanceWorkerSpawns`按实际继续增长，未伪称全部执行器长期化。

4项真实NDJSON生命周期回归（`ix02-parser-owned-lifetime-green`）：
1. 8文件冷建、3次单文件变化、完整No-op：parser_call11、worker_start4、关闭前worker_exit0；关闭后exit4/joined1。
2. 首项受控阻塞时其余3项已完成，取消后先清算所有结果；全部改写后新input得到8个After/0个Before，未混入旧结果；同4线程。
3. 原有panic URI钩子触发pure parser异常，任务failed；删除该输入后新input完整7结果，原4健康线程复用；不是默默忽略该文件后发完整Q。
4. consumer持有parser借用时受控unwind，报告unknown、无完整Q，借用清算后新input成功8结果，同4线程；不把unknown改成未写失败。

`ix02-parser-cancel-panic-first`首次包含一项测试工具失败：live追加JSONL读到半个末行，
不是产品取消故障。计数器现在仅排除尚未以newline结束的末行，完整行仍严格JSON解析，
修后取消回归通过。`ix02-parser-consumer-gate-red`在未安装受控gate时收到qualified而非unknown，
只是故障注入校准RED，不冒充原产品崩溃复现。新gate仅debug，一次性故障，不是产品sleep/timeout策略。

当前冻结`ix02-parser-frozen.json`；`parser_checks.py`收集相关Native/Clippy/release命令及独立JSON。
Core/SQLite/Cargo共享输入与reader-v2冻结完全一致，`ix02-parser-storage-reuse.json`记录复用之前完整Core63/SQLite161、experimental57证据，
不是声称改parser后重新跑了完整存储包。新候选完整Native验证进行中；原默认128解析RED、100K成本失败、旧experimental迁移3FAIL不因此关闭。
SDK NOT_USED，尚无Node/LSP、30K、真实UI、Windows或两小时稳定性证据。
本片不是合并/部署授权，不开启默认新协议。批writer、自动对账/GC、domain/partial迁移、严格父端资格及最终规模耐久仍OPEN。


### 长期parser片最终收据（不代表整链路完成）

`ix02-parser-frozen.json`的199个Rust/Cargo输入在所有列出检查后仍一致；
`ix02-parser-receipt.json`确认原工作区其余已有文件未变。源码/测试新文件均≤500行；
仍有Core lib1168/SQLite lib761两处既有债务，本片未改这两文件。
- `ix02-parser-final-default-native`：22份相关完整Native文件 **121PASS/0FAIL/0ignored**，142.606s。
- `...experimental-native`：12份相关完整文件 **57PASS/0FAIL/0ignored**，86.174s。
- fmt及两配置workspace/all-targets Clippy `-D warnings` exit0，两配置release exit0。
- Core63/SQLite161、experimental存储57按未变化输入收据复用，不声称本片重新跑过存储包。
- 默认release SHA256 `3afb3fd4927340225a05e1cba5e93b4a7d8e1224baa64c4e8e1f3f05556d7c6a`；
  experimental `deedf534b7730364fead97c2628c76f96e866c1069117d19422e40ca12ed647c`；
  `ix02-parser-artifacts.json`对应`artifacts/parser-default/`、`artifacts/parser-experimental/`真实产物。

另用这两个已保存release产物运行`parser_release_smoke.py`，独立8源码夹具、显式协商的真实NDJSON会话均通过。
逐帧原始`ix02-parser-release-{default,experimental}.jsonl`、stderr及各JSON保留；生成输入及完整重跑步骤在脚本内，
临时DB只在该会话exit后移除，真实项目/缓存不动。这里不使用debug gate或trace计数声称release线程数。

| 配置 | initialize首请求（ms） | cold ACK后至完整终态（ms） | point ACK后至终态（ms） | No-op对账ACK后至终态（ms） | 完整资格后search（ms） |
| --- | ---: | ---: | ---: | ---: | ---: |
| default | 3109.338 | 270.067 | 62.104 | 196.788 | 10.411 |
| experimental | 1072.549 | 260.553 | 100.255 | 175.717 | 13.151 |

两个配置各一会话，不能混成多轮分布/中位数或规模结论。initialize计时含进程启动后首请求等候，
内部阶段及差异原因UNMEASURED，不推测归因；500ms只作目标，记录3.11s/1.07s，不删除样本或改阈值。
cold写8文件，point只写1、Qnull/stale；No-op完整对账写0文件/0facts行，新Q与head/查询一致；
不把元数据写0、语义正确性、内存峰或30K性能一并冒称通过。

当前候选再次跑`catalog_incremental_maintenance`，`ix02-parser-legacy128-retained`仍exit101，实际128、期望1。
它和未在本片重跑的原100K成本失败/旧experimental迁移3FAIL均保持原状态，
不把上面的相关Native文件范围说成整个workspace或pnpm check:fast通过。
正式Node/LSP、SDK、规模对照、30K至少两小时协议混合、真实UI/Windows仍NOT_RUN。
本片只完成长期纯parser及资源所有权，维护协调线程仍每任务创建；
下一片批writer、自动对账/GC及partial/domain迁移尚未闭环，默认协议接通之前不能启用生产新格式。
原方案与ledger总目标保持ACTIVE/IN_PROGRESS，未提交、部署、合并或发布。


## IX-02 有界跨文件facts写入（2026-11-04，进行中）

parent固定298d，隔离工作树未提交。沿用最多64文档、4096记录及4MiB估算payload额度；
4096/4MiB是已有file writer分块额度，不是默认RSS、源码文件数或响应时间门限。
64是数据库写入缓冲额度，不是语义Program分组或SDK重新构建批次。
普通独立URI量子仍独立发布以保留公平性；cold/完整对账解析出的多个文件可共享低层写事务，
不把任意watch数组擅自变成一个原子语义组。大文件仍允许完整处理，按原行/字节分块，不截断/拒绝结果来满足额度。

### 可核验的RED与实现

- `ix02-writer-api-red`：新公开FileVersionWrite/write_versions尚不存在，编译exit101。
- 提取旧写法与RAII SQLite commit/rollback观测，保留旧逐文件逐家族执行，运行
  `cargo test --locked -p arkts-index-sqlite --test versioned_write_batch -- --nocapture`：
  `ix02-writer-runtime-baseline`实际 **576个commit callbacks，期望1**，exit101。
  64文件×原事务路径的真实观测，不能称576次物理写盘或576倍加速。
- `ix02-writer-extraction-characterization`既有file facts/seal/lifetime/controller完整文件通过；
  没有靠删除原正确性断言让新接口通过。
- `versioned_file_writer.rs`把形状验证、身份/完整计数准备放在SQL事务外，
  按`FileWriteSize`选择小文件组，再以BEGIN IMMEDIATE把头、pin、全部facts、封存同事务提交。
  `versioned_facts_write.rs`复用原全部家族SQL；大文件按原有界分块并在每批开始/提交前检查当前输入。
  小文件组中途取消/冲突全部回滚，之前完成的大文件分块仍只是未发布草稿，可释放/GC及重新构建。
- `versioned_write_observation.rs`仅在连接独占写调用范围注册commit/rollback hook，RAII结束时清除，
  异常展开也解除回调；不在SQLite hook中执行SQL。回调计数不等于成功durability、发布次数或设备字节。
- Native先加相同口径的fileWriteWork，`maintenance_write_batch`运行时RED：
  128文件cold实际128个提交、期望2（`ix02-writer-native-runtime-red`）。
  接入`maintenance_fact_batch.rs`后cold128→2、65文件真实变化→2、No-op facts→0，完整结果/Q回归通过。
  这是新文件版本写入范围；candidate lookup、owner、manifest及qualification等事务不包括在这两个数中。
  文件解析结果先在SQL外有界缓存，大文件到来先flush前组，最终发布与source/read-set/物理store准入不变。
  point写入也接入同一可取消接口；No-op及删除的fileWriteWork0不代表整个DB免写。

7项公开存储回归：64/65文件、独立行数及字节边界、重用相同sealed版本、数据身份碰撞全批回滚、
遍历可访问取消边界及成功对照、回调unwind后连接/观测器恢复且保留原有版本、所有8类facts完全往返。
大文件取消用例有12K次引用：先完成一个occurrence分块，cancel后不能seal/发布，
实际回收≥4096 facts，后续完整重试与被保护的baseline都正确。
Scope=sealed draft与publication分开，不把部分写入取消说成物理未写。

本片中间失败全部保留：一个终态字段替换遗漏导致编译失败；
行数边界夹具误把每文件500类（估算5003记录）当small，实际正确走large分块14次提交，
改为每文件300类使“单文件能装入、合并两文件超行数”条件成立，并未提高额度或放宽期望；
全facts夹具的顶层const及本地export alias使窄class binder按既有规则标unknown/direct_exports为空，
删去这些非必要源语句，保留import alias并继续断言每个文件8类facts全非空；没有修改解析器或减弱断言。
严格Clippy捕获测试is_err后unwrap，改为match，未加allow。

### 配置、证据和剩余范围

Context7 resolve rusqlite仍传输失败，`ix02-writer-context7.json`保留；
核对实际锁定0.40.1源码Transaction::new_unchecked与hooks，以及
[SQLite commit/rollback官方文档](https://sqlite.org/c3ref/commit_hook.html)。
当前实现不在已有外层事务中执行公开write_versions，Busy在注册观测器前返回；
内部只有已核算的小组共享事务，大文件保持原分块路线。
调用方current只做有界内存准入，不能在持写事务时做SQL/FS检查；Native传入现有Atomic状态。
不替代最终磁盘权威、输入代次、compiler/overlay或最终freshness fence，不变更时延/内存/规模阈值。

`writer_checks.py`/`ix02-writer-frozen.json`冻结本片完整Rust/Cargo输入，当前重跑完整Core/SQLite、
相关默认/实验Native、实验存储及两配置严格Clippy/release；最终收据后补。
旧默认128解析RED、100K成本失败、旧experimental迁移3FAIL都不因新API局部通过关闭。
失败/取消的部分行量仍有未观测范围：fileWriteWork只计SQLite回调，failed API会记录有无观测，
取消后/最终fence失败前已完成草稿不因此变成published；尚不能称每一代物理写量和所有失败阶段已量化。
默认TS/LSP、自动对账、GC/owner/header回收及producer/partial迁移仍未接通；
后续自动GC还须验证保留待续有效草稿的所有权，不可回收后再冒称“取消可复用”。
SDK/Node/30K/真实UI/Windows/两小时均未在本片执行；本轮不部署/提交/合并/发布。


### 整包检查发现的半写夹具适配

首轮`ix02-writer-final-default-core-storage`实际exit101，184PASS/1FAIL时在crash回归停止：
原小文件duplicate-export错误现在在一个事务内全部回滚，所以实际仅回收sealed draft1，旧fixture期望2。
没有改2这个断言；crash child改为明确超出small writer额度的大文件，在symbols分块已提交后因重复export ordinal失败，
并断言真实commit_callbacks≥2/rollback≥1，保持杀死owner后两版本都回收且published Current不变。
修订v2整包又在`failed_write_can_relinquish_its_partial_version_without_closing_the_session`失败，
同样是旧小文件不再留下半写版本，实际deleted0/期望1。该fixture也强制大文件分块、证明有提交前缀后释放，
保留原deleted1及不关闭会话的要求；没有删测试、降断言、调大GC次数或提高写入限额。
`ix02-writer-partial-fixtures-green` crash/lifetime/batch三份完整文件15PASS，原v1/v2失败日志/JSON继续保留。

完整修订候选重新冻结`ix02-writer-v3-frozen.json`，执行`writer_checks_v3.py`，
v1/v2的通过部分不冒充v3完整通过，最终结果后补。两处改变仅是使旧半写场景继续真实发生，
小文件事务原子回滚和大文件前缀清算均需要同时得到验证。


### 合批修订候选最终收据（整体目标仍未完成）

`ix02-writer-v3-frozen.json`的205个Rust/Cargo输入在九项列出检查后未变化；
`ix02-writer-v3-receipt.json`记录parent298d、检查/产物/原工作区保护与原失败。
- 默认完整Core63 + SQLite168，**231PASS/0FAIL/0ignored**，154.307s。
- 默认Native23份相关完整文件，**122PASS/0FAIL/0ignored**，188.948s。
- experimental版本化等19份完整存储文件，**64PASS/0FAIL/0ignored**，71.052s。
- experimental Native13份相关完整文件，**58PASS/0FAIL/0ignored**，119.868s。
- fmt、两配置workspace/all-targets Clippy `-D warnings`、两配置release全部exit0。
- 默认release SHA256 `0fc1eb8fb4f71d7b4a85cf410e7e756881e4a60861e59f6be98709c8cb22fbaf`；
  experimental `ad84f98bca28edc51ded7203088543b9cc833db3f9c2257d347424195246e543`；
  `ix02-writer-artifacts.json`对应`artifacts/writer-default/`、`writer-experimental/`真实已保存产物。

`writer_release_smoke_v3.py`使用以上两产物，每配置分别两个串行真实进程（cold会话、关闭后cache重开），
默认PID59453/59454、experimental59455/59456，真实NDJSON/逐帧原始jsonl及stderr均保留。
cold128文件facts写2个commit回调；point1文件写1；全量No-op及缓存重开对账facts写0；
每次qualification与读取snapshot/head一致。两个会话不累计为连续耐久；源/SDK为生成128简单类、SDK NOT_USED。

| 配置 | 初次initialize ms | cold ACK后终态 ms | point ACK后终态 ms | No-op ACK后终态 ms | 完整Q后search ms | 重开initialize / reconcile ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| default | 73.180 | 298.086 | 91.466 | 230.686 | 14.551 | 48.856 / 159.451 |
| experimental | 2652.071 | 290.083 | 73.424 | 208.291 | 10.525 | 47.125 / 156.454 |

每格仅一次，非分布/中位数，不外推30K。首请求包含进程启动后等候，内部阶段UNMEASURED；
首次default另外两轮2773.100/71.749ms（下述诊断失败轮次）也保留，不以最终较快样本覆盖。
500ms仍是体验目标，2.65/2.77秒未归因、不删样本或调产品阈值。

#### 完整性诊断的只读限制

前两轮协议操作正常完成，但Python SQLite3.51.0在关闭后原生成WAL data DB上用mode=ro查询/完整性检查报CANTOPEN；
`ix02-writer-release-default.*`、`...release-v2-default.*`继续标失败；后者夹具复制到
`writer-release-v2-default-failure/`封存，实际data DB552960字节/预期129个版本。
复制data DB的RW及immutable查询/完整性/FK均通过，普通WAL和FTS最小对照RO却通过，
所以只确定该数据/调用方式的读模式差异，具体原因仍UNCONFIRMED，不声称普遍SQLite/WAL限制或已证明产品缺陷。
最初`ix02-writer-integrity-diagnostic.json`只测了control DB，不能替代随后明确选data DB的`...data-integrity-diagnostic.json`。

v3先验证同一Native实际缓存关闭重开成功，再在两个Native进程都exit后复制完整fixture索引目录，
仅用RW打开该诊断副本执行integrity_check/foreign_key_check；default/experimental的data及control DB共4份全部ok/无FK违反。
对原生成索引的全部文件做前后SHA比较未变，未删除用户缓存，未在原生成DB上恢复/写入来掩盖失败。
`...release-v3-{default,experimental}.json`明确记载此模式；不能称只读原库检查通过，兼容性原因继续保留为诊断缺口。

当前候选重新运行`catalog_incremental_maintenance`仍exit101：旧默认路线解析128≠1；
原100K成本失败、旧experimental迁移3FAIL及30K全量引用/rename/SDK问题均不因此关闭。
本片不称workspace全绿或pnpm check:fast通过；默认TS/LSP、规模配对、至少2小时30K及真实UI/Windows仍未测。
新源码/测试均≤500行；versioned_facts.rs由390→294行，Core lib1168/SQLite lib761两处既有超限债务仍保留。
ADR0043仍Proposed、ledger IN_PROGRESS；自动对账、保留可复用草稿的所有权、GC及迁移/父端接通继续推进。
未提交、部署、合并或发布，原项目与日常安装未动。


## 生产者迁移与存活旧owner边界（IX-05）

固定parent仍为298d65f5d7f796c347fe8be5c739e428066489d8，隔离worktree不变。
本片仅Rust/原生NDJSON，不涉及Node、SDK、Zed/UI或真实缓存，未部署/提交/合并。
证据根仍为`.bench/index-versioned-maintenance-20261104`。

- `ix05-producer-native-real-red.log`：旧生产者库导致initialize失败，maintenance无法启动。
- `ix05-producer-native-first.log`：首次修订能head5→1，但不等于生命周期完整。
- `ix05-producer-reverse-migration-red.log`：新peer已接管后，存活旧owner的start仍成功qualified并反向覆盖；真实公开API/子进程，不是静态推断。
- `ix05-producer-owner-policy-green-v2.log`：初始化来源权限固定、begin_from受锁核对后两条NDJSON回归通过。
- `ix05-producer-file-owner-red.log`：精确file任务返回migration_required而非producer_superseded，证明先前只修全对账遗漏路径；`ix05-producer-file-owner-green.log`保留修订后通过。
- `ix05-producer-recovery-green.log`：最终2条完整公开子进程回归包含无效UTF8输入失败、原head5/store保留、修复输入后同会话head1迁移、Before消失/After出现、reader resourceFailures/retired均0；另一条同时覆盖读/全对账/file的后接管拒绝。
- `ix05-producer-public-boundaries-v3.log`：6条完整公开持久层用例通过，包含旧facts三类回调不执行、普通search拒绝、错误workspace/空domain/strict模式不放行、取消草稿不改变选库、重试权限和迟到候选最终CAS。

中间编译错误原日志保留：native-red/runtime-red的SHA格式错误、owner-policy-first及green初版漏接Work字段/穷举分支；
public-boundaries首版误用公开API参数，v2迟到候选为空而先触发InvalidData，均未作为有效产品RED；
修正测试使候选含完整facts/发布组后，v3才验证预期的InvalidGeneration，未放宽断言。

职责位置：Core错误类型提取到store_error.rs；CatalogStore维护打开模式严格校验身份但阻止旧domain读；
CatalogMigration::begin_from保护创建阶段，activate保留source/admit/CAS；workspace_runtime捕获初始权限；
reader_worker及两种maintenance engine按同一权限分类。迁移/接管错误不是reader crash，不耗资源失败预算。
原Core lib1168→1131行（仍超限债务），SQLite lib761行未增长；新增文件和改动Native模块均须≤500行。

本轮完整检查使用`producer_checks_v1.py`冻结Rust/Cargo输入后运行，收据前缀`ix05-producer-v1-final-*`。
最终结果以实际收据为准，启动检查不等于通过。default Node/LSP未接通，原legacy128 RED、100K历史失败证据、
旧experimental迁移fixture失败、Python只读CANTOPEN及真实UI/Windows/2h未验收状态全部保留。


### IX-05生产者片最终冻结结果

207份Rust/Cargo输入全过程hash不变；完整收据`ix05-producer-v1-receipt.json`。
- 默认Core/SQLite整包 **233PASS**（Core63、SQLite170），254.682s；包含原100K成本回归，未放宽/豁免。历史失败及其波动原因仍保留，当前并非该项失败。
- 默认Native24份相关完整测试文件 **124PASS**，205.380s。
- experimental19份版本化存储完整文件 **66PASS**，74.657s；Native14份相关完整文件 **60PASS**，134.574s。
- fmt、workspace/all-targets两配置严格Clippy `-D warnings`、workspace两配置release均exit0。
- 默认release SHA256 `664875cfea522f3bd5006816bc972984a6ccd0f1e26b2b2c3102a57cbb0ca417`；实验配置`cb56c80c671f40503a62d2123b8b085484176eed2b1d1cf1b9c205e5c4b0f7aa`，分别归档producer-default/producer-experimental。

`producer_release_migration.py`及`ix05-producer-release-migration.{json,jsonl}`：归档旧writer release0fc1eb8f、当前release664875cf两个真实进程共用**临时1文件**cache，旧进程保持存活直到接管后读验证完成；实际producer key、store ID均变化。
旧pid61253/new61254：旧init70.326ms/cold终态257.416ms；新init2491.481ms、旧facts明确migration_required12.614ms、升级终态242.612ms、两次正确search45.969/11.275ms；新reader资源失败/退役0，两进程正常shutdown。
旧二进制接管后读返回其原有incompatible错误，不伪称旧二进制也实现了新增producer_superseded；后者由当前子进程对照证明。
这是一次小样本功能验证，init较慢的内部原因未测，不能当作多轮性能结论、规模测试、UI/Worker或耐久验收。
源与cache均独立临时夹具，正常结束已清理；逐帧协议和stderr保留，没有删用户真实cache。

三份本ADR引用的既有根因/评审/冲突审计报告已从原工作树**按原字节复制**进候选，修复候选文档的悬空链接；
`ix05-related-original-reports-copied.json`保留原/副本SHA，原文件未修改。原44份已有工作保护核验无无关变化。
除已列迁移债务外，新增及其余修改Rust模块均≤500；Core1131/SQLite761既有迁移债务如上；没有因为本片通过而改变整目标ACTIVE/IX-05 IN_PROGRESS。


## IX-05长期回收控制器（本片尚未接入Native自动调度）

在上一生产者片全部验证结束后新增公开`CatalogCollector`。
`ix05-collector-port-red.log`真实公开库测试因E0432缺少该控制器失败；
最小实现新增`catalog_collection.rs`，使用同一Backend/profile/workspace校验及既有VersionedFacts GC，不另造缓存根。
`ix05-collector-port-green{,-v2,-v3}.log`保留三轮实际结果，v3完整文件3PASS。
初版测试只等待read_version不可读，后发现collecting也不可读；已加强为累计versions_deleted==1，
证明实际完成版本删除而非仅隐藏，保留原日志，未降低正确性。

覆盖：活动find_version借用期间不删历史、借用关闭后预算1逐批删除旧版本、保持当前文档及完整资格；
多轮量子不新建owner锁文件、budget0拒绝、PASSIVE checkpoint计数有效；
peer切库后旧collector的collect/checkpoint拒绝，不能把旧回收当新库结果或迁回旧domain；
legacy/空domain/错workspace/wrongdomain不放行，legacy查询及head保持。
所有路径均临时库/公开Rust API，非真实LSP、UI或自动后台清理验收，没有动真实cache。

本轮重新冻结Rust/Cargo输入，执行`collector_checks_v1.py`，收据前缀`ix05-collector-v1-final-*`；
当前执行状态以实际收据为准，之前producer-v1全检查只代表上一源码快照。
尚未回收published group收据/owner/稳定锁对象；这些不能在未补ACK/引用保护时盲删。
下一片需要Native单writer lane公平调度、保留游标/剩余工作、实际关闭资源与自动对账；
默认Node/LSP与整体验收仍未完成，不能把这个新增库API当作用户已经享有自动GC。


### IX-05 collector片最终冻结结果

209份Rust/Cargo输入全过程hash不变，`ix05-collector-v1-receipt.json`保存全部9条命令/退出码/时长。
- 默认Core/SQLite整包 **236PASS**（Core63、SQLite173），263.577s，包含原100K成本检查，未豁免或改断言。
- 默认Native24份相关完整文件 **124PASS**，213.011s。
- experimental20份版本化存储完整文件 **69PASS**，81.540s；Native14份相关文件 **60PASS**，132.211s。
- fmt、两配置workspace/all-targets严格Clippy、两配置workspace release均exit0。
- 默认产物SHA256 `3867f6244f86871db636bb623ec275f53dcc4efb1cd9fc8c74e5abbec90288ef`；实验`630d16fe0f17627f7ef856c2c904db2fd4c391a8548e03d9f9161379fd3220b4`，归档collector-default/collector-experimental。

`collector_release_migration.py`再次用实际归档旧0fc1eb8f/当前3867f624两个release同用临时cache。
`ix05-collector-release-migration.{json,jsonl}`：旧pid63158、新63160均正常关闭；旧仍存活期间新进程init1586.627ms、
升级终态250.790ms，Before0/After1正确search48.628/12.362ms，新reader失败/退役0，旧二进制读仍明确拒绝。
前一候选2491.481ms init样本保留；不是同一二进制的重复分布，不合并为中位数，也不猜测差异原因。
这只复核当前Native产物上的生产者迁移，**不证明未接入的自动GC、默认LSP、30K规模或UI**。
GC的3项新增测试为公开Rust库端口；Native既有相关124项不是自动GC用例。

原44份已有文件保护核验无无关变动；源改动全部在隔离worktree，无真实cache清理/部署/提交。
Core1131/SQLite761既有超限债务不增长，新collector98行/测试175行均≤500（最终以实际wc为准）。
原legacy128默认路径RED、历史100K失败原因、旧experimental迁移3FAIL、Python RO诊断CANTOPEN仍保留。
新格式还没有默认生产启用，自动调度/草稿复用/元数据保留、partial/ACK/schema迁移、严格TS接线及最终验收继续OPEN。


## IDX-V1-LIFETIME-001：自动维护前置并发写修复

上一goal turn为有效进展（producer/collector及209输入验证已落盘）；本turn继续原完整目标，没有缩减到库测试。
父版本298d不变。executor职责提取前4完整Native文件18PASS；
提取后`ix02-auto-executor-after.log`受控unwind后重试失败unsafe-metadata-target；repeat1单独通过，保留偶发证据。
独立公开CacheLease复现和逐项因果对照见[根因报告](../reports/2026-11-04-cache-use-record-concurrency.md)。

- 原4096调用1120错误；诊断266尝试264名字，nlink0真实快照；unique-temp-only256次仍58失败。
- 唯一原子序号/对象归属清理＋每workspace稳定记录锁：原4096条件零显式错误，83.27s。
  该单轮比原75.52s长，不把正确性修复宣称吞吐优化。
- `ix05-cache-use-cross-process-green.log`5PASS，其中1为子进程入口、4为父级功能回归；无忽略。
  子进程自行持锁被kill后实际wait，后继写成功，原锁文件保留；symlink/hardlink及unsafe锁仍拒绝，外部文件原样。
- `ix05-cache-use-native-recovery.log`真实Native未知终态后新输入恢复，另一进程4线程同时record_use，
  8正确项/资格绑定、维护任务2、parser线程4；非LSP、SDK、UI或30K耐久。
- `ix02-auto-executor-repaired.log`原4份完整文件18PASS，未改断言。

执行器提取仅把launch/poll实际执行与完成清算移入maintenance_executor.rs；父模块488→313行，
新executor182行。cache_gc/files203、lease138、SQLite回归287、Native回归97（最终实际wc/收据为准），均≤500。
使用记录写锁位于. leases同层（实际`.leases/<key>.use.lock`），不在workspace内增加未知文件，
不删除稳定锁inode；新/旧metadata格式及原usage锁不变。

Context7失败/官方回退版本限制记录于`ix05-cache-use-docs.json`，不伪称查到1.95专属文档或Windows实测。
生产代码无诊断trace保留；原4096 RED、独立插桩和中间RED日志保留。
`cache_use_checks_v1.py`对当前新候选再次冻结，收据`ix05-cache-use-v1-final-*`；实际结果另补，启动不等于通过。
没有提交/部署/合并、没有改默认Node/LSP或预算/超时阈值，也没有删除真实cache。


### cache-use修复最终冻结核验

`ix05-cache-use-v1-final-*`先完成全部功能测试，但strict Clippy因新测试多余借用失败；保留原失败。
v2仅改该borrow和过强的测试名，产品源码/Cargo与v1逐项相同；未抑制lint或降低断言。
`ix05-cache-use-v2-receipt.json`：212份Rust/Cargo输入全过程不变；全部9项适用Rust检查exit0。

| 当前v2范围 | 实际结果 | 墙钟时长 |
| --- | --- | --- |
| Core/SQLite整包 | 241PASS（Core63、SQLite178） | 199.121s |
| 默认Native25份相关完整文件 | 125PASS | 175.401s |
| experimental21份版本化/metadata存储完整文件 | 74PASS | 45.792s |
| experimental Native15份相关完整文件 | 61PASS | 105.078s |
| fmt / 两配置workspace all-targets Clippy -D warnings / 两配置release | 全部exit0 | 原始收据逐条记录 |

上述不是整个workspace/两平台/端到端全绿；默认Node/LSP未接通，旧experimental3迁移失败及历史100K波动证据保留。
原100K成本回归本次在默认SQLite整包再次PASS，未豁免；pnpm check:fast与最终规模/30K2h/真实UI/Windows未执行。

release默认SHA256 `37da2d3d5f5c51264e6f0a2a8c65cf84b004681a129140f34424587c6ae2ce0e`；
experimental `f236b3a1a0883f6b93b0ce47232bf35f462b7f5f5f5fd9d8158a3878374fe28c`，均归档cache-use-default/experimental。
`cache_use_release_migration.py` / `ix05-cache-use-release-migration.{json,jsonl}`：旧pid65790（归档0fc1eb8f）
与新pid65791实际共用临时1源码cache，旧仍存活时新迁移成功、Before0/After1及资格正确，reader失败/退役0，均正常shutdown。
新init1771.980ms、升级terminal241.424ms、正确search42.997/11.044ms；单样本内部原因未测，不合并前候选为分布，非UI或30K性能验收。
该两版本脚本**未**构造不合作旧metadata writer与新writer持续并发，不能据此关闭混版元数据风险。

原44份已有文件核验无无关改变，212输入hash不变，剩余超限债务仍Core1131/SQLite761；新增文件均≤500。
原始错误/诊断/中间失败完整保留，没有提交、部署、合并或删除真实缓存；目标继续ACTIVE。
自动维护完整接线、私库草稿保留/GC/metadata治理和全部最终验收要求均没有缩减。

## IX-05私有草稿复用及重试清理（2026-11-05）

[完整新增证据及复现命令](../reports/2026-11-05-private-index-draft-retry-and-reclamation.md)。
parent仍298d；219份Rust/Cargo输入冻结检查完成。新增公开存储migration_retry3项（source/admission双对照）、
draft_reclamation4项及真实Native draft_reuse3项、draft_policy2项通过定向命令。
实际失败/修订包括同输入重复解析、失败Q暴露防护、成功builder仍钉parent、superseded仍留草稿、
正确结果掩盖旧未发布事实残留。命令和各自RED/GREEN保留在上述报告表中，非静态推断。
Native调用GC前完成当前内容预检，保留匹配sealed pin，清理obsolete staging/partial事实；
中途取消保留已提交GC，新输入先续清再写。统计是逻辑删除非物理I/O。
活动库自动GC及默认LSP未接通；这不是最终端到端/平台/耐久完成。

最终`ix05-draft-v1-receipt.json`：219输入全程不变，Core/SQLite248、Native130、实验存储81/Native66PASS；
fmt、双配置workspace all-targets严格Clippy及release通过。100K成本测试未豁免，整包本轮PASS。
真实debug wire重放另存`draft-wire-20261104T170952Z`，parser66/写66/复用62、五组符号及Q正确，
stderr回收2版本20facts；这是受控诊断，不作为release普通计时或LSP/UI验收。

## IX-05活动库自动GC（2026-11-05）

[新增原因/调用链/RED-GREEN/限制](../reports/2026-11-05-automatic-versioned-index-collection.md)。
parent仍298d；本片223输入冻结检查进行中，上一219成绩不冒充新版本。
公开Native先确认collection未安装的RED；接通后普通更新自动回收、GC屏障/查询/关闭、活动借用和空闲回收通过。
随后受控fatal、等待GC时取消分别建立RED并修订；5项机制+2项压力回归GREEN。
后者连续7次更新不饿死回收、12000引用大文件跨量子实际清理；不是30K或2小时耐久。
新增owner_scan_wrapped公开回归以66个live owner证明零工作不能当扫描完成。
完整Native/存储双配置、Clippy和release尚待当前冻结流程完成；默认LSP仍未接通。

后继启动门控补2项GREEN（坏UTF首次构建不启用GC，修复后启用；完整缓存No-op重开启用），定向共9项。
223输入v1的Core/SQLite249PASS；Native删除恢复writtenDocuments1≠0失败，期间source变化也如实记录，
不作为最终冻结成绩。`ix05-auto-gc-restore-isolated-red.log`在当前224输入下独立重现同一断言失败。
IDX-V1-GC-002根因：复用旧sealed内容没有长期使用权，自动GC在removed发布后回收它；
需要正式有限内容复用租约，而非放宽GC/旧断言。当前候选未验收、无新release/部署，完整目标继续。

## IX-05复用租约：GC-002后继（2026-11-05）

[完整调用链及RED/GREEN](../reports/2026-11-05-index-content-reuse-lease.md)。
新公开API先RED，再实现近期内容pin/旧资格拒绝/删除确认/只清本owner及物理退役，库4项通过。
原7项生命周期中的删除恢复断言未改，恢复0解析/0写；GC用例推进到V3验证V1删除，不再要求驱逐热V1。
新Native3项证明四次撤销重做/不同URI不驱逐、确认删除后退役、空闲peer替换释放旧cache。
GC fatal扩展为真实源码更新后检查资源清算，重初始化使用新issuer，不破坏资格不可变合同。
228输入冻结检查进行中，原223/224失败及219成功分别保留，默认LSP及完整目标仍未完成。

228输入v1实际Core/SQLite253PASS、相关Native在reader_queries原恢复断言失败（sourceUnchanged=true）。
GC-003根因及独立RED是GC被误算成活动catalog，initialize返回busy；修正is_active、由旧owner Drop停止/join GC。
`ix05-gc-reinitialize-green.log`原reader/新6项GC等17项通过；非法Root不毁旧owner另通过。
当前v2重新冻结全套，v1失败继续保留，旧断言未改；产品保护/超时未延长。

v2本片最终`ix05-reuse-v2-receipt.json`：228 Rust/Cargo输入全程不变，9项检查exit0；
Core/SQLite253、相关默认Native143、实验存储86/Native79PASS，fmt/严格双配置Clippy/release通过。
这是31/21份Native相关文件范围，非整个workspace/Windows/默认LSP全绿。
release默认cfd3f2ecdcfd、实验0634237d40e9已按profile归档；原v1 reader恢复失败保留，未改其断言。
独立debug wire重放删除恢复及四次撤销重做写0/hot parser0，最后No-op复用128；所有原帧保留。
Node安装最初offline/DNS失败原样保留，隔离pnpm8.15.9/冻结锁/复制依赖且未执行安装脚本后，
两个旧adapter文件27PASS、0FAIL/skip/todo，275 TS/fixture等输入未变。仅为下一片协议提取表征，非framed LSP。
全目标、默认LSP原128 RED、完整生命周期/规模/耐久/UI/Windows均保持未完成。

## IX-03/04父端桥接开始（2026-11-05，默认仍RED）

[模块、公开反例及证据](../reports/2026-11-05-index-node-protocol-bridge.md)。
旧adapter先27表征通过，session/catalog两次职责提取后27仍通过；1066行父类缩为460。
新输入/同快照Q/terminal与能力协商合同14项GREEN，合旧27共41PASS；tsc exit0。
公开Native先缺factsDomain RED，补应答字段后完整maintenance_protocol6PASS；
新Rust片fmt/strict Clippy/release通过，旧228全量成绩不覆盖此协议变化。
真实生产framed LSP+真实Native新增RED明确默认仍catalog/start，冷搜索正确但未调用maintenance/start。
后续编辑断言尚未执行，保留RED；未启用半成品能力、不伪增generation。
测试库存新增3入口；库存/层级精确计数回归14PASS，初始旧计数失败保留。
完整pnpm、原默认128、规模/生命周期/30K两小时/UI/Windows仍未闭环。

## IX-03/04默认接通与No-op恢复（2026-11-05）

[调用链、全部失败及适用范围](../reports/2026-11-05-default-index-maintenance-and-noop-freshness.md)。
默认能力接入后真实LSP128改单1及结果GREEN；最终walk计数复位曾导致父端误退役，
再发现Indexed0/128，Native加真实完整集合长度后公开提示128/128 GREEN。
No-op公开RED：head1未变、写0仍workspace-changed fallback；完整资格消费后同结果并recovered GREEN。
原raw legacy128≠1再现并原样归档；Rust新增用例转实际默认协商路径且保留原parser=1、结果及计数断言。
当前相关17完整Node文件109/109、0skip，TypeScript/build通过，冻结输入不变；新默认Native7项GREEN。
完整默认Rust workspace检查另跑receipt；未冒充最终pnpm或30K/UI验收。
URI投递/输入不确定性和全对账O(N)读成本仍未完成；下一片不能以默认128GREEN代替这些合同。

## IX-03 URI投递与目录生命周期（2026-11-05）

[完整因果/问题/证据](../reports/2026-11-05-index-input-delivery-and-directory-lifetime.md)。
公开LSP先RED（没有changes RPC），接通后局部写1/同input后继写0；复合场景再发现删除多层父目录丢watch。
路径4例原1PASS/3FAIL，证明祖先/未知保守/逃逸及exact-parent修复后4PASS，真实LSP完整复合场景通过。
输入队列有界单在途/单后继，确认前撤销父端旧资格；pump-finally漏唤醒、已取消失败wait的unhandled、
未accepted对账提前消耗版本各有独立公开/合同RED→GREEN，15生命周期+9队列24PASS/0skip。
file terminal只能数据快照不能完整资格，scope进度有真实Native RED/GREEN；guard/库存23PASS。
上一候选完整Rust401PASS/0FAIL/1原ignored，820.11s；之后Native元数据有变，此成绩不覆盖本片最终候选。
当前完整pnpm check:fast继续运行，有RSS采样权限失败；普通ps被sandbox拒绝，授权同探针可读，
未修改的采样相关文件授权环境26PASS，保留原失败轮并待终态后授权重跑，不预归因其余失败。
保存入口、未通知/未知目录/重连、资源-only调度及持续输入公平等仍未闭环，未宣称IX-03/整体完成。

## 2026-11-05 保存/旧端口/工作区退役的RED→GREEN

[详细问题、候选边界及命令证据](../reports/2026-11-05-index-save-compatibility-and-cache-retirement.md)。
parent仍298d65f，冻结checkfast85973继续；为避免中途改输入，后续源码在临时next副本实施。
INPUT-005无watch save真实LSP资格缺失RED→保存组合/旧watch语义29PASS；
COMPAT-001三个既有显式refresh失败→旧端口保留默认legacy/生产显式协商，相关100PASS；
GC-003公开native正常关闭仍unsafe-cache-entry→识别owner目录后unsupported-schema→补已知身份后GREEN。
新增合法形状非空owner反证RED保留，修正后旧20+新6=26PASS；严格Clippy通过。
能力矩阵22项/相关五文件34PASS；旧大辅助文件2144→2142及936→902，剩余债记录在报告。
Node21跨平台URL options限制有Node20同源码27PASS对照；采样权限文件对照26PASS只覆盖单文件。
两个正在执行的完整/后续receipt不预报终态；新源码尚待进入集成工作树，禁止以副本GREEN称最终验收。

## 2026-11-05 本片23文件集成与补全覆盖回退

[补全/集成后续](../reports/2026-11-05-index-save-compatibility-and-cache-retirement.md)。
原冻结完整Node2365项2228/137失败、0skip，源码无漂移；一次自有失败fixture清理有单独干预证据。
Core/SQLite253与默认release/实际cache关闭通过，实验GC首轮24/26失败保留，5轮后续26/26未关闭偶发来源。
新target补全不完整标记公开RED1/2→原两项GREEN，再提取batch trace；相关五文件23PASS，原完整/partial约束不减。
23路径按前后hash复制回真实Git隔离分支；新正常采样权限/Node20固定候选全量session67718在执行，不能预报GREEN。

## 2026-11-05 资源路由/精确输入订阅/GC-004退出回归

父版本298d；[逐命令和原始证据](../reports/2026-11-05-index-input-wait-and-retirement-ownership.md)。
resource-only错误排catalog的公开RED，后四文件36PASS；旧input被新input替代仍等共享ACK的公开RED，
后队列/生命周期28PASS、六文件47PASS，abort订阅归零不冒称heap已证明。
GC-004有界观察第11轮失败，实际cache-use.tmp残留；真实Native受控正常shutdown可切断退役RED，
runtime owner/FIFO/join修订后首项GREEN、正常布局五文件28PASS。
双配置Rust冻结在跑，旧集成完整checkfast两项constructor失败仍开放，后继尚未集成，不说全量通过。

## 2026-11-05 GC-004进展补齐、INPUT-008/009及完整检查阴性

[收据](../reports/2026-11-05-index-input-wait-and-retirement-ownership.md#后继验证与修订不把中间green当成完整交付)。
owned退出首片完整Rust暴露force后private未退役；保留RED，新增按namespace合并轮转重试后完整410PASS/1旧ignored，
双布局相关/严格Clippy/release通过，crates输入未变。EOF fixture前缀并发碰撞另修，不混为产品异常。
真实LSP暂时目录/源码不可用后同Worker恢复RED→四例GREEN；原缓存置源码树产生5次namespace漂移有插桩记录，
测试输入与产物分离，完整Location/取消/fence断言不减。仅原始full其余3项阴性仍需定位，未全绿。
ignore规则watch缺失公开RED→Native/路由/注册/队列七文件66PASS；仅规则不发Worker mutation，SDK合同不变。
旧W全检2360/2365/0skip FAIL，4049.20s；新代码仍next-only，整体IX00–08不完成。

## 2026-11-05 目录类型与准入后继

[详细记录](../reports/2026-11-05-index-namespace-lifecycle-and-admission.md)。
INPUT-011正式3场景1PASS/2FAIL后修订，后继6种目录生命周期及相关68PASS/0skip；
INPUT-010完全静默新增在命中/不命中答案缓存时均陈旧，仍OPEN；有根目录提示的恢复已通过。
INPUT-012完整任务仍等待global flush，两条取消/替换RED已建立，精确input准入验证中。
旧完整2360/2365失败及新完整中断130独立保留；上下文oracle29PASS、实际token取消/恢复26PASS。
32+3明确文件已集成；目录/准入后继尚待验证后集成。整体IX-00–08不提前标完成。

### 2026-11-05 next-only boundary / frozen gate negative

Resource-named directory delete formal6/8RED, then4 related files23PASS after
namespace fallback. Not yet integrated into frozen W. Actual old/new Native
shared-cache safety refusal2PASS recorded in namespace lifecycle report.
Frozen W full Node has archive consumer negatives and one test-process OOM;
actual Git inventory includes477877756 bytes of experimental build artifacts.
Wait for terminal, preserve/re-home those outputs under canonical target/ and
rerun unchanged collector contract plus complete candidate checks. No source
filter relaxation or V8 increase. All remaining original scale/soak/UI scopes
stay OPEN; no merge/deploy.

INPUT-014 checkpoint: actual source/rule directory-to-file changed-only2RED.
Next now preserves metadata URIs, scopes known descendant updates, and treats
regular source replacement as admission. No new wire field/SDK configuration.
Extra canonicalization first failed the original3-call contract; same-phase
sharing restored it without memoizing final identity fences. Final9files93PASS,
0skip plus tsc PASS. Ten explicit pending source/test paths are recorded in
ix03-kind-next-only.json; W full source remains frozen and negative. Wider kind
transitions and large descendant-removal scaling are not inferred from2-file
fixtures. Same full checks and original scale/soak remain required after assembly.

2026-11-08 continuation: INPUT-015 stale resource-directory index symbol now has
formal RED and current source-domain105PASS; real Stage disjoint/symlink/hardlink
controls included. Source exclusion is conditional, not filename-based. Frozen
whole Node2370/2374 failed and both Rust retirement gates failed. ENV-001 artifact
isolation restores unchanged collector24PASS; ENV-002 stale Cargo library is
proved by binary/dependency mismatch, fresh default/experimental2/2 behavior.
Next gate must force3 owned package rebuilds and preserve full input identities.
No scales/endurance launched; IX00-08 overall remains IN_PROGRESS.

### Final assembled candidate checkpoint (2026-11-08)

[Current check/scale evidence](../reports/2026-11-08-versioned-index-candidate-acceptance-progress.md): full pnpm checkfast2393/2393 PASS, source before/after identical. Parent298d; source snapshot c475777e9563966f47b75c66dbb36351b63e7a5023e78b6f01048ce6f75a7deb. Rust410PASS/1existing ignored, experimental28PASS, release/fmt/strictClippy PASS; original100K store cost PASS. The455 ignored release correctness entry was explicitly rerun and PASS with clean fixed455 hashes; measured cold3168.92ms exceeds3s and is timing-only user-waived, never labeled a timing pass.

Two calibration oracle failures were independently reproduced on old/current public responses, retained and corrected without product changes: consumer-local alias versus direct-origin rename and separate barrel API identity. Strict range/text/open-version checks remain. New round final-acceptance-03 calibrates17 operations PASS and is running the full serial matrix. SDK remains partial; phase complete is not SDK READY. Scale/2h/UI/Windows are still open; Proposed ADR status and no commit/push/deployment policy unchanged.

### IDX-V1-SCALE-001: valid dependency graph exceeds retained proof capacity

[Root-cause evidence](../reports/2026-11-08-scale-dependency-witness-capacity.md): final scale round03 stopped at real-dependency20000 first definition -32803. Old298d ordinary control fails identically; independent candidate trace records configuration-witness-capacity at4096 facts. Native indexed20000 and all databases passed integrity; no guard/OOM/crash. Witness source unchanged from parent7af6a4b7...; count means two-map facts, not4096 unique files.

Real framed LSP minimum regression against exact final artifacts:128PASS/4608FAIL,6.53s, minimal isolated SDK. Next-only test `tests/semantic/large-dependency-input-proof.test.mjs` is registered in bundle-e2e (316 entries); manifest4PASS. No product source has changed yet, so the prior complete2393PASS does not cover a future capacity fix.

ADR0036 decision3/6 explicitly retains this4096 boundary and rejects capacity-loss as safe source reset. Any correction must explicitly amend that scope, preserve every actual load-owned fact/final fence, distinguish mandatory validation state from optional caches, and prove owner/reset/namespace retirement. Do not merely raise4096, drop proof, clear/restamp caches, force healthy Program rebuilds or reactivate Rejected0039 directory caching. The unrelated global result-cache/Host performance TODO stays deferred. Large persisted save/watch write counters and original30K2h/platform scope remain required, not inferred from overlay-only timings.

### ADR0044 / IDX-V1-SCALE-001 implementation checkpoint (2026-11-08)

Mandatory load-owned proof retention replaces the healthy4096-fact quota; source provenance covers all retained facts.
Failure-detail bound and real unprovable/SDK/input/epoch/final-fence rejection remain unchanged. Explicit design revision:
[ADR0044](../adr/0044-load-owned-input-proof-lifetime.md), Proposed, no fabricated acceptance.
New lifetime RED1/7 then final8 plus manifest4 =12/12 PASS; actual LSP128/4608 and original source/SDK regressions26/26 PASS.
Separate approved-sampling20K diagnostic: ordinary cold/warm and trace cold PASS17 actions each so far;
trace warm in progress. Initial sandbox run17 correct actions but /bin/ps EPERM remains FAIL, not discarded.
New-source final fullcheck is queued behind the diagnostic; prior2393 PASS belongs to the prior source only.
Round04 controller has8 Python policy/gate tests PASS and separates confirmed baseline capacity failures from candidate correctness:
old failures remain FAIL, later unexecuted old operations remain UNMEASURED; timeout/resource/closure/integrity errors still stop.
No claim of full scale,2h,UI or Windows completion. Large persisted save/watch Native counters remain a required follow-up.

### Complete-checkout revalidation checkpoint (2026-11-08)

ADR0044's proof repair passes four actual20K diagnostic sessions68 exact operations with integrity/process closure;
ordinary edit-first references7.89–7.91s remain slow. Full details and hashes are in the
[capacity report](../reports/2026-11-08-scale-dependency-witness-capacity.md).
IDX-V1-ENV-003: N was partial staging, so its full-suite CLI/editor/bench ENOENT failures were preserved and stopped.
Exactly five repair inputs plus one test trailing-blank correction were integrated into complete W.
Fresh full checkfast now freezes2375 tracked/unignored inputs, including required bin/editor/bench files.
Old2393 PASS and N26/12 focused evidence do not become a new W whole-suite pass.
Round05 and its byte/reference-density supplement are queued behind complete prerequisites, not yet executed.
Persisted save/write scaling and original30K2h remain required; no UI/Windows/whole performance success claimed.

### Runtime completeness checkpoint (2026-11-08)

IDX-V1-OBS-004: immutable candidate mirrors omitted standard-library/diagnostic/runtime assets.
Prior20K subset-runtime query checks remain evidence, not complete-package acceptance or strict baseline performance comparison.
Direct N full-dist public128/4608 regression remains scoped GREEN. Missing-asset contribution to latency/SDK state is unmeasured.
[Root report correction](../reports/2026-11-08-scale-dependency-witness-capacity.md#idx-v1-obs-004-runtime-mirror-completeness-audit-2026-11-08).
Test-first runtime copier7PASS, controller/package15PASS and density8PASS. Complete built79 runtime assets and historical
installed77 assets (both70 library names) are now pinned separately; baseline3-JS layout is preserved, no defect assumed.
Round05 waiters stopped before load, evidence preserved; complete W fullcheck continues unchanged.
Round06/density06 wait behind strict prerequisites; no new scale/persisted-save/2h result yet. No product change/deploy/publish.

### IDX-V1-INIT-001: cold namespace RED/GREEN checkpoint (2026-11-08)

Previous complete checkfast2402/2403 FAIL is retained, source unchanged. Its failing assertion was Native catalog phase,
not an observed semantic READY transition. [Detailed causal chain and limits](../reports/2026-11-08-cold-cache-multi-root-initialization.md).
Cold shared directory creation is a confirmed independent defect: public Rust cold race64/64 plus lease-dir-only58/64 failures;
real Native initialize third pair IO/File exists; controlled two-root public LSP8/8 degraded, actual Native IO frames retained.
Original full failure lacks raw Native error, so exact historical equivalence remains unproven; no false claim otherwise.
Minimal AlreadyExists + original no-link/type/reparse revalidation repairs valid concurrent creation without accepting files/links,
adding retries, locks, thresholds or a schema change. Native release now9c65ce... versus retained409b08....
Rust cold/record concurrency9PASS; formal public cold/warm/root semantics/symbols/close plus original lifecycle/manifest15PASS;
same controlled public sequence8/8PASS; real Native64 pairs/128 initialize all succeed, all exits0. Focused ClippyPASS.
New source needs fresh full Node/Rust/default/experimental/pinned455 correctness checks; old410/28 not reused as new whole PASS.
Complete runtime79 assets and unchanged70 standard libraries remain required before resumed scale/30K2h. UI/Windows untested.

### Fresh combined candidate checks (2026-11-08)

The previous complete2402/2403 FAIL and stopped round06 remain preserved; new controlled public evidence confirms
IDX-V1-INIT-001 can produce that same catalog state from real Native IO/AlreadyExists. Directory idempotence repair,
no-link/type/reparse rejection and original initialization/root isolation assertions remain intact.
Fresh combined candidate checks, no reused old Rust results: workspace414PASS/0FAIL/1existing ignored;
experimental retirement28PASS; experimental namespace/use-record9PASS; release/fmt/strictClippyPASS.
Original pinned455 correctness explicitly rerun:1PASS, source455 hashes/head585feb and clean input unchanged.
Measured cold3089.691304ms exceeds3s; standing user timing-only waiver, not a timing pass.
Fresh complete Node checkfast is now running, not yet a final whole-candidate verdict.
Receipt `ix03-cold-namespace-final-checks.json` freezes2381 tracked/unignored/compiler inputs and backups all owned sources.
Round07 only starts if the six checks AND both declared supplements pass; gate17 controlsPASS, density8 controlsPASS.
Proper runtime79 assets, persisted-source1/0 counters, all ordinary/trace scale trials and original30K2h remain queued.
No user data/real cache deletion, deployment, commit, push or merge. Real UI/Windows not verified.

### IDX-V1-OBS-005: pinned driver and restored-content oracle (2026-11-08)

Pre-load audit stopped round07 and density07 while both were WAITING with zero runs/no child process.
Their receipts remain `ABORTED_BEFORE_LOAD_DRIVER_AUDIT`; the full candidate check continues unchanged.
Two test-driver errors were found before load: the controller hashed generation07 persisted scripts but invoked
the original unpinned `persisted-source-scale/run.py`, and its output receipt path disagreed with the configured directory.
The pinned generation08 now invokes its own run.py and reads that same configured output receipt; path regression
on generation07 is RED (1FAIL/1PASS), generation08 GREEN (2PASS).

The prior restored-input oracle required one new document write and derived publication outcome from write count.
That conflicts with sealed-content reuse: `maintenance_file_engine.rs` find_version may publish a new mapping/head
with zero new facts. Existing real Native `maintenance_reuse` regression, included in fresh workspace414PASS,
asserts data-updated/zero writes and correct searchable symbols across undo/redo with no parser calls.
Generation08 keeps strict unique-save=1, duplicate=0/unchanged/same-head checks. Restore accepts only0 or1 writes
with dataPublished=true, data-updated, strictly advancing head, matching complete qualification and zero qualifier writes;
zero writes must have zero fact rows. Persisted symbol presence/absence and restored disk manifest are still mandatory.
Six new oracle tests PASS after retained module-missing RED, including false unchanged/publication, nonzero hidden rows,
head mismatch, extra qualification writes and incomplete input negative controls. This is a driver correction, not product repair.

Generation08 controls: Python gate/baseline/runtime17PASS plus path2PASS; density8PASS; write oracle6PASS.
New controllers38297/69173 are waiting on fresh complete checks/main acceptance respectively. Product source/artifacts
remain frozen. No scaling, two-hour protocol or real UI completion is claimed. Raw evidence and old drivers remain under
`.bench/index-versioned-maintenance-20261104/{final-acceptance,persisted-source-scale,density-acceptance}-0{7,8}`.

### Fresh final whole-candidate gate GREEN (2026-11-08 10:10 UTC)

The actual frozen integrated candidate passed complete `pnpm check:fast`: **2406/2406**,0failed,0skipped,0cancelled;
Node test duration3527845.166422ms. Fresh workspace Rust414PASS/1existing ignored, experimental28+9PASS,
release/fmt/strictClippyPASS and pinned455 correctness1PASS complete the six checks and two declared supplements.
The455 cold3089.691304ms timing-only user waiver remains explicit. SourceAfter equals all2381 SourceBefore hashes.
Receipt: `.bench/index-versioned-maintenance-20261104/ix03-cold-namespace-final-checks.json`.
This replaces no historical failures and does not imply true UI/Windows or whole scale/endurance acceptance.

Round08 copied/verified all79 current runtime assets, with the exact server145f982c/semantic19715a2b/
referencefc3b7229/Native9c65ce08 identities recorded in the receipt. Persisted source public LSP calibration128
and formal128/2048 sessions PASS, including exact Native file-write1/duplicate0/full-qualification0 counters,
disk-derived symbols after close, forged-save-payload rejection, restored source manifests, normal closure and DB integrity.
20K is currently executing;30K and the full multi-round semantic baseline/current matrix plus original30K2h remain pending.
2048 changed-save observed~656–733ms; zero-write duplicate~634–745ms. These are preliminary end-to-end maintenance
observations including scheduling and qualification, not parser-only timings or physical IO claims; no phase attribution inferred.
Source counts204 changed/new handwritten files audited,0new/growing over500-line violations;7shrinking legacy debts retained.
Evidence: `ix08-integrated-source-size-audit.json`. Product W remains frozen; no commit/push/deploy/merge.

### IDX-V1-GC-005 and OBS-006: round08 stopped, not endurance complete

Round08 persisted calibration128/formal128+2048 passed their symbol/write/input/integrity checks.20K FAIL:
save15848.6ms (1document write), duplicate unchanged0writes but qualification missing within original30s.
All observed LSP-owned PIDs closed/server0/integrityPASS. Raw failure and controllersSTOPPED remain.
Independent same-release Native-only128/20K and protected stack samples locate GC SQL scanning while the incoming
writer waits on Collection::Barrier. Native20K operation labelsPASS do NOT establish complete success: teardown
needed protection kill(-9); validated interpretation records closureFAIL, ACK signed offsets not request latencies.
SQL VM regression (actual bundled3.53.2/public collector) RED512549k->20488488k; rewriteGREEN28k->116k.
No deleted-data/owner/fence/budget/schema rule weakened. NULL/live-pin/current-data characterization passes original,
removing NULL guard from rewrite fails, final guard restored. Default focused testsGREEN; experimental/release and
new final complete checks still required. Prior complete2406PASS applies only pre-GC-repair frozen snapshot.
OBS006 audit adapter lost CLI argv; corrected after RED with3PASS and real empty isolated cache-GC CLI0/schemaPASS.
Earlier raw automatic-GC errors are driver-invalid evidence, not proven product CLI failures. Shared observer changed
only after all round08 controllers terminated. Full scale/30K2h/UI remain incomplete.
[Detailed report](../reports/2026-11-08-versioned-index-gc-query-cost.md).

## Final repair focused/public checkpoint (2026-11-08)

Default focused GC12PASS and experimental WITHOUT ROWID GC12PASS, including actual bundled collector VM work.
Release rebuilt13.84s; Native6553ab87ff0c9d20a36344062fa9b38fa095251fbbaeae0d91adf3395d2c9b2e.
Independent complete79-asset public LSP replay on new20K/30K fixtures passes original30s observations,3unique saves,
3duplicate watches and restore, exact symbols/forged payload refusal, source manifest restoration, process exit0/closure
and integrity. No automatic cache-GC error after adapter argv correction.
20K save median2355.2ms/max2440.5ms; duplicate median2377.9ms/max2381.1ms.
30K save median3376.2ms/max3484.1ms; duplicate median3358.0ms/max3360.0ms.
These are3 in-session samples, not independent cold trials. Earlier failed20K first save15848.6ms and duplicate30s
failure remain, not a valid many-round performance ratio; adapter argv also differs, while direct Native stack/VM
experiments independently isolate SQL scan cost. Full scans still grow with real source count; no500ms success claim.
Evidence `driver-failure-20261108/repaired-public-summary.json` and all underlying runs.
Fresh combined whole-candidate checks and gated full scale/original30K2h are next, not yet passed.

### Current execution after GC repair (2026-11-08 10:35 UTC)

New candidate full gate is RUNNING: `ix03-gc-query-final-checks.json`, frozen2384 inputs, fresh workspace Rust
currently executing. Six main checks plus three mandatory supplements (experimental namespace, experimental GC
work and pinned455 correctness). Previous complete2406PASS remains a pre-GC-repair result. Round09 controller
82102 waits for that gate; density09 controller29593 waits for main acceptance/restoration. No simultaneous pressure
load, no product source or queued-driver mutation during this freeze. Formal30K2h has NOT_STARTED.
Latest independent same-scenario20K/30K diagnostic PASS is described above; not final-scale/UI/endurance approval.

### OBS-007/008 pre-load driver audit (2026-11-08)

Generation09 remained WAITING/zero-runs and was stopped before load; full product check49098 continues untouched.
Static30K target catalog omission was discovered before any long-run launch. Public generator on preserved isolated
30060-input/30000-source Photos produced the exact prior44-target catalog609fb35c; generation10 pins that input
and baseline identity before its full gate and refuses missing/invalid/symlink inputs without starting load.
A real framed child acknowledges shutdown then ignores exit and handles protectiveTERM with code0, proving old
code0/cleaned-up PID evidence insufficient. New shared closure policy requires observed normal exit, shutdown ACK
and no close/cleanup protection; all scale/persisted/density/Photos wrappers enforce it. No deadline/budget changes.
Baseline known refusal exception also requires strict normal closure; historical failure remainsFAIL.
Python21 +Node32 +path2 controlsPASS; initial sandbox/formal-env and patch-script failures retained.
[Detailed evidence and limits](../reports/2026-11-08-index-acceptance-inputs-and-close-evidence.md).
Generation10 main76464 waits for fresh full gate, density63088 only after main/restored. Whole scale/2h/UI NOT_COMPLETE.

### Final GC-005 candidate full gate GREEN, strict-close round10 started (2026-11-08 11:43 UTC)

Fresh `pnpm check:fast`2406/2406PASS,0failed/0skipped/0cancelled; test duration3573390.392551ms.
Fresh Rust416PASS/0FAIL/1existing ignored, fmt/strictClippy/releasePASS; experimental retirement28, namespace9,
GC work12 and pinned455 correctness1PASS.455 cold3135.678718ms exceeds3s and is user-waived for timing only.
All2384 frozen inputs equal final sourceAfter. Receipt `ix03-gc-query-final-checks.json`, Native6553ab87,
server145f982c/semantic19715a2b/referencefc3b7229. This is the actual post-GC-repair whole check, not reused prior2406.
Round10 verified/copied79 runtime assets. Actual persisted128 calibration and formal128 PASS with strict NORMAL
closure: shutdown acknowledged, observed code0/no signal, zero protection/cleanup interventions; DB integrity and
input restoration remain required.2048 is running. Three-round semantic matrix/original30K2h/density/UI still incomplete.
No W product/doc or queued-code changes after full freeze; canonical ID documentation corrections remain outside W
with explicit pending manifest. Original failures and old frozen draft IDs remain retained. No commit/push/deployment.

### 2026-11-08 ENV-004 continuation driver (no product changes)

Parent remains298d; W product/compiler and all2384 frozen full-check inputs unchanged.
Original round10 baseline20K profile initialization observation overlaps pmset Clamshell Sleep, retainedFAIL;
user confirmed awake and exact new-cache cold/warm17query controls bothPASS/NORMAL.
New-only E/final-acceptance-11/resume_policy_test.py firstRED (missing implementation), then3PASS:
retain originalFAIL, require exact explicit successful retry, do not silently skip unknown failures;
only the separately proven old-baseline refusal can count as a recorded failed comparison cell.
`python3 -m unittest resume_policy_test power_window_test`:7PASS after separate power-window RED;
sleep before the window/wake inside isFAIL, uncovered log isUNPROVEN, prior completed sleep isnot a new failure.
Density continuation controller validRED3PASS/1FAIL on missing sleep-free gate, then controller/fixture/prepare9PASS.
Initial test setup/path-red and sandbox py_compile cachePermissionError retained; actual compile with isolated
PYTHONPYCACHEPREFIX succeeds. These are driver tests, not new product/UI acceptance or two-hour evidence.
All new handwritten driver/test files under500lines. Main session24433 and postflight waiter51394 continue;
postflight starts no density/Cargo load after main failure or absent7200s/restored-input/sleep-free proof.
No change to product deadline, query45000ms observation, V8 or memory protections; no deployment/restart.

### IDX-V1-SCALE-003 / round11 stopped on a real completion deadline

Actual30K dependency profile-warm first completion LSPid4/Workerid5 failed-32603 after30132ms;
parentwatchdog execution-deadline30000ms, not external45s cutoff, notOOM or systemSleep.
Admission/send0.486ms and Workerdispatch0.433ms: distinct from SCALE002 activeBGqueue wait.
Program/checker returns4/4, sync19/19, phase=request/terminalnone; exact hot substageUNMEASURED.
NORMALshutdown/no protective termination and integrityPASS; originalFAIL kept. Two bounded same-input ordinary/trace
controls started, ordinary firstcompletionPASS23948ms sofar; not yet completed or proof of trace-only cause.
Main24433 and waiter51394 terminatedFAIL; Photos7200s/density notstarted. Only control51588 live.
[Timeline/source/remaining uncertainty](../reports/2026-11-08-30k-profile-completion-deadline.md).

### SCALE003 call-stack diagnostic (separate modified bundle, 2026-11-08)

Two exact wrappers instrument only compiler.getProgram and synchronizeHostData in a copied semantic bundle.
Original79-asset runtime and2384 frozen product sources unchanged. Injection guard tests2PASS; initial incorrect
absolute/relative runtime-copy input refused before load, then corrected. No product patch/rebuild/threshold change.
Context7 TypeScript resolve again failed transport; actual installed4.9.5-r10 and its bundled source are authoritative.
One protected run52680 failed firstdefinition~30015ms/NORMALclose/integrityPASS, not a new formal sample.
Required getDefinitionAtPosition preflight: getProgram27028ms includes sync27027ms. Later getProgram1.58ms
from definitionCandidates, residentcapture0.79ms, programStats0.995ms. No extra slow Program build fromstats here.
Compiler query callback28777.898ms includes groupedcreateProgram26408.986ms; these nested values MUST NOT sum.
Trace eventdefinitioncomplete at15:00:24.012Z and certification at.013; parentexecutiondeadline at.423 with all
Program/checker returns. Last statsgetProgram returned23.331Z, so remaining observation/event span~681ms, not27s.
Do not assign the remaining public-result interval to a specific finalfence/IPC stage without direct measurement.
`scale003-stack-probe/causal-evidence.json` retains full call stacks/inclusive timings and modified-bundle identity.
The slow extra-statistics-Program hypothesis is falsified in this sample; required real30K dependency compilation
is a major measured cost. It does not prove the exact same hot stage in earlier uninstrumented failures.

Independent original Photos30K slice14799 was then started on the UNMODIFIED79-asset runtime, exact preserved
30060 input identities and full original scenario matrix; it calibrates44targets before its own7200s formal phase.
SCALE003 staysOPEN, original profile/whole acceptance remainsFAILED/incomplete. This independent slice doesnot
turn a failed gate green or omit failing Photos scenarios; no realZedUI/Windows claim. Density/finalCargo stillpending.

### IDX-V1-INIT-002 OPEN: originalPhotos cold validation silence (2026-11-08)

Independent Photos14799 terminalFAIL:30000 staged sources, thenexact30s no progress and parentdegraded;
zero useractions/formalSeconds, originalinput30060 restored, NORMALshutdown. NOT a7200s success.
NativeRSSpeak81.6MiB/Node740MiB. Privatecandidate1.83GB, manifesthead1/publishedgroup1/sealedversions30000/
qualification1 but user_version0 and control stilllegacy: private data logically sealed, physicalactivationnotcomplete.
ActualcodeCatalogMigration.try_activate writesprivatequalification then prepare_catalog validates quick/FK/FTS,
then setsformat andsourcefences/publishescontrol. State bounds locate failure within pre-format validation, notquerySDK.
PostflightCLI integrity_check timedout60s; this isUNPROVEN integrity, NOT observed corruption. Other2DB checksPASS.
Original raw resultpostflightFAIL preserved. Separate readonlystate/schema/count receipts inphotos-soak-20261108-awake.
Same bundledSQLite3.53.2 onAPFScloned DB:quick_check executes60s thencontrolledVMinterrupt; FK21.29s/0violations;
FTSintegrity1.34sPASS; fullintegrity60s interrupted. No original DB writes; diagnostic interruptionsnotchecksuccess.
Currentdefault2MiB pagecache vs legacybulk64MiB is a hypothesis: existingCatalogBuildSession explicitlysets65536KiB;
newversionedbootstrap hasnoequivalent. Independent diagnostic40164 compares exactsamecopy, no product changes.
Do notblindlyraise deadlines, skipvalidation, or claimcachecausebeforemeasurements. Context7rusqliteresolvefailed;
actual0.40.1 hooks/bundled3.53.2 APIsused. Postscan SQLliveness/progressgranularity also requiresdirectevidence.
Photosrepeat/7200/density/Cargo pending; SCALE003 remainsseparateOPEN; wholecandidateacceptanceNOT_COMPLETE.

### 2026-11-09 INIT002 implementation checkpoint

RealPhotos cold failed after30000staging/30s silence, noactions/formal time. SameSQLite3.53.2 copiedDB
quick_check42.6s but actualVM callbackmaxgap282ms; cache64 hypothesis notsupported, no cache/timeoutchange.
Scoped realSQLprogress/cancel+Native relay+strict parent DTO+workspaceaggregation+LSP validationstatus implemented.
PublicRust firstRED->GREEN, cancellation/retry/realFKcorruption2PASS+existingretry3; Native actualNDJSON RED->GREEN1;
realframedLSP RED->aggregationgapRED->GREEN2; publicadapter/lifecycle25PASS; focusedstrictClippyPASS.
Old2406/416 fullgate belongs to preINIT002 source. Fresh integrated full check and original30K/7200s notcomplete.
[Detailed mechanism, evidence and boundaries](../reports/2026-11-09-cold-photos-sql-validation-liveness.md).
Temporaryworktree lost654 baselinefiles aroundmidnight; hashverifiedrestorepreservedchanges, causeUNKNOWN.
No productbudget/V8/timeout/validator/identitypolicy change, no merge/release/deployment. SCALE003 remainsOPEN.

### 2026-11-09 OBS009 fixture isolation repair and fresh full restart

INIT002 firstfull defaultRust419PASS/1existing ignored; strict/release/experimentalretirement/GC/validation/455
correctnessPASS. Experimentalcoldnamespace failedbeforeproductAPI due sharedtesthelper time-key collision.
Publicconstructor actual32x32 RED837/1024; formalSQLiteRED765/1024 andNativeRED776/1024. Atomicsequence+mkdir
fixes bothsamepatternhelpers, no less concurrency/adopt-existing; focusedSQLite15/Native2PASS.
Only failedfullattempt's13ownedprocesses stopped,0remaining; partialNodecheck isNOT PASS, oldsupplementFAILkept.
[Cause/repair/raw evidence](../reports/2026-11-09-test-directory-clock-collisions.md). Newcomplete check required.
No product timeout/cache-size/RSS changes; INIT002 fullchecks/realPhotos7200s/density stillpending; SCALE003 OPEN.


## 2026-11-09 INPUT-010 完整准入与范围后继

父提交298d65f5d7f796c347fe8be5c739e428066489d8，修改在W隔离副本。
E=`.bench/index-versioned-maintenance-20261104/namespace-final-20261109`。
1. `node --test --test-concurrency=1 tests/semantic/references-silent-source-lifecycle.test.mjs`：
   原候选缓存命中/避缓存两条RED，成功旧3，应5；`two-route-public-red.log`。
2. 请求路由提取：现有公开 membership recovery + Native preopen 5/5 GREEN，`entry-refactor-characterization.log`；
   保留原行为，随后实施新准入。Proxy499行，新增文件均≤500。
3. SourceNamespace名称候选GREEN后，独立内容不变名反例RED `silent-existing-caller-probe.log`，再补实际字节准入；
   Node39项GREEN `source-input-related-09.log`，包括Native只写1/复用2及候选恢复，绑定独立源码收据。
4. Native ignored source反例RED `scope-public-red.log`，源码核对后复用 CompleteScanInputs 的现有摘要；
   `scope-candidate-controls-10.log` 28/28，包括实际Mac Native特殊文件名，以及Windows模拟共享URI向量。
5. `node --test --test-name-pattern='cached reference input certification' tests/semantic/interactive-diagnostic-fairness.test.mjs`：
   新缓存校验排在诊断前台屏障外，`cached-diagnostic-barrier-red.log` RED；移至屏障内后完整8/8，
   `cached-diagnostic-barrier-green.log`；再加严活动诊断/终态顺序断言1/1（7按名过滤），`cached-diagnostic-barrier-final.log`。
6. 合并相关集 `namespace-related-11.log` 实际57/57、0skip，源码/构建绑定`namespace-related-57-pass-receipt.json`；尚非完整 check:fast。

错误oracle留证：Main导入局部重命名不是全局重命名，不能算产品RED；纠正为导出声明后，保留H13构建有效RED
`global-rename-baseline-red.log`，候选精确3文件5编辑GREEN。scope日志工作区终态无scope字段，早期等待workspace字面值
造成测试自身失败；05目录ENOENT亦为测试错误。原日志保留，不统计为产品失败。

1798行worker-protocol移出就绪参数解码到现有就绪wire责任模块后为1795，仍属迁移债；没有增长。
最新全检、最终rename fence、受管缓存排除及受影响规模/耐久未完成，不合并或部署。


7. 恢复入口：同一真实LSP+受控Registry清理故障打开共享熔断；修复输入后引用仍先失败 -32603，
   `explicit-reference-recovery-red.log`。内部完整输入工作改用现有显式准入与根创建，普通状态仍不探测；
   既有watchdog健康证明未放松。`explicit-reference-recovery-green.log`5/5；加严无输入/仅时间流逝两条不重建断言
   `explicit-reference-recovery-final.log`1/1（4按名过滤），精确3位置、主Worker历史5/峰1/关闭0，清理错误0。
   `after-explicit-recovery-check.log`TSC PASS。57项是修订前构建；不累加或追认为全量通过。
8. 文件名追加中文：`encoded-chinese-final.log` Mac实际Native1/1（5按名过滤），文件`Late 空间😀'!%.ets`；
   Windows仍只有共用URI向量模拟。

下一片仍需：热缓存/有效Native资格历史后的熔断恢复对照、rename最终namespace fence、受管缓存实际物理命名空间排除，
以及最新完整门禁/受影响规模与长测。此次不提交、合并、部署或清理真实缓存。

### 2026-11-09 热缓存恢复历史与受管缓存源码排除 RED

热答案命中+Native 已裁剪后耗尽恢复预算，再撤销实际故障和修复未保存输入：定向1PASS/5filtered，
证据 `namespace-final-20261109/warm-circuit-04`。前两次夹具错误及诊断栈保留，不宣称新产品缺陷。
原计划受管缓存源码树边界标识 IDX-V1-CACHE-NS-001：实际 Native-owned 叶内 Generated.ets
被当 caller，预期5实际7，公开 LSP RED。见 `namespace-final-20261109/managed-cache-red.log`。
正常 Cache/User.ets 必须仍纳入，禁止屏蔽整个配置缓存根；实现/平台/全量/耐久未完成。
最新产品仍是之前52项组合对应构建，本片仅补测试/夹具参数；不能宣称新增 RED 已修。

### 2026-11-09 受管缓存排除：Native 所有权证明第一片

IDX-V1-CACHE-NS-001 原公开 LSP RED 仍保持；Native 实际 CacheLease→CatalogStore→
initialize/cache/namespace 的证明已实现，绑定持有目录对象而非 cache-use.json 或目录时间。
目录替换拒绝、旧 owner 不写入替代目录 metadata；legacy/versioned（根可等于源码根）有公开 Native 回归。
[调用链、证据及尚未接通的边界](../reports/2026-11-09-managed-cache-source-namespace.md)。
Node/Worker/Native walker/watch 的同源排除、恢复重放与最终整体验收未完成，不把此原语当完整修复。
ADR0043/0044 状态仍 Proposed；不修改 ADR0039 内容证明决策或 SQLite 发布/最终新鲜度合同。

### 2026-11-09 managed source namespace integration

IDX-V1-CACHE-NS-001 has public semantic 7-to-5 and Native scope 4-to-3 RED/GREEN
chains. Node live proof admission, root-scoped ordered policy/removal, mutation
coalescing, Worker data, Store/Native scan fences and watcher filtering are wired.
Both nested and source-root cache layouts preserve real source siblings, regain
qualified narrowing and keep the answer cache across private cache notifications.
Related pinned 153/153, later spelling/policy controls 29/29 plus actual LSP13/13,
and final layout controls 2/2 (7 filtered) are separately identified in
[the implementation evidence](../reports/2026-11-09-managed-cache-source-namespace.md).
Lifecycle replacement, actual Worker replay, overlapping multi-root and final
full/scale/soak remain unverified. ADR0043/0044 remain Proposed, with no invented
review or Accepted status; ADR0039 and final freshness/publication rules stand.


### 2026-11-09 CACHE-NS original-owner retirement / Worker replay checkpoint

IDX-V1-CACHE-NS-001 actual public directory replacement: source results recover but old Native owner
writes new metadata RED; first guards then exposed late publication-lock-only RED. Original-owner
lease admission and immutable live publication-lock identity repair ->2 lifecycle PASS, five serial
independent replacement repeats exit0. Controlled actual Worker exit17 ->one replacement, same5refs,
source count3, primary peak1, afterclose0; graceful shutdownComplete precedes replacement exit1.
Related22 Node/0skip, focused14Rust, SQLite199/0ignored, strictClippy/release PASS; latest native
be0845065bf75480e91d7ebe57934a742d8fbda070646d0374391ed5a8db5d43. Parent298d65f.
[Report](../reports/2026-11-09-managed-cache-source-namespace.md), raw receipt
`.bench/index-versioned-maintenance-20261104/namespace-final-20261109/managed-retirement-current-receipt.json`.
All40 other Root files hashmatch. Not full current gates, Windows/UI, scale or fresh formal endurance;
overlapping roots/Native owner-failure and in-flight replacement remain pending. No publish/deploy/merge.


### 2026-11-09 CACHE-NS optional Native failure/source-role fix

Parent298d65f; real isolated public LSP+minimal SDK. Controlled Native SIGTERM with unchanged cache
first returned3refs then wrongly5 including Generated cache callers (native-owner-exit-red-02.log/raw).
Keep previously attested directory role until workspace close, retaining per-scan physical validation;
index failure/qualification semantics unchanged. GREEN exact3 and readiness2; after actual directory
replacement same-session query exact5 real locations and replacement source-only. Final portable
spawn-observer Mac control1/1PASS/0skip, native identity count1/no restart/LSP exit0. Not Windows/UI.
Report: [managed-cache source namespace](../reports/2026-11-09-managed-cache-source-namespace.md).
Evidence `.bench/index-versioned-maintenance-20261104/namespace-final-20261109/native-owner-portable-audit-green/`.
New complete checks pending; earlier22Node/199SQLite belong to preceding identity. Multi-root overlap,
current scale and fresh formal endurance remain open. No commit/merge/deploy/cache deletion.


### 2026-11-09 CACHE-NS cross-root public RED / complete checkpoint intentionally stopped

IDX-V1-CACHE-NS-001 overlap subcase: two roots/source2each/actual same cache owners; adding generated
caller in B's real private leaf yields references3->3 with external cache, **3->5 WRONG** when cache
is inside A. New durable `tests/semantic/managed-cache-multi-root.test.mjs`, fast manifest, Mac1PASS/
1FAIL. Source exclusion is owner-root-only in adapter, Store view, Worker invalidation and Native
walker signature; Native post-change indexing is UNMEASURED, so Node-only map repair is insufficient.
[Report and next execution constraints](../reports/2026-11-09-managed-cache-source-namespace.md);
raw `.bench/index-versioned-maintenance-20261104/namespace-final-20261109/managed-multi-root-public-red/`.
ix11 release PASS, full Rust interrupted with all logs; checkfast not reached. Controlled stop only
own4processes, verified gone,2415frozen inputs unchanged through stop. **STOPPED_NOT_COMPLETE**,
not a fullgatePASS. Earlier native-failure/Worker-replay controls retain their own identities.
Next: versioned owner-set propagation and affected-root invalidation in semantic+Native, then new
full freeze/scale/30K soak. No merge/deploy; ADR0043/0044 Proposed. This is not UI or Windows.


### 2026-11-09 CACHE-NS cross-root repair implemented / final gates pending

IDX-V1-CACHE-NS-001 two-root RED3->5 ->final public **4/4PASS/0skip**,10.125s: two root orders,
inside/external shared pool, exact3refs, real source edit/currentNative2/private symbols empty;
inside cases peer-directory replacement ->exact5refs/currentNative3/recovered symbol1, shutdown0,
replacement onlyRecovered.ets. Native public2PASS: forged ID/no input advance, null RED->rejected,
[]revoke/ordinary point discovery/held old snapshot cancelled without late success. Actual scope
removal receipt indexed1/written0/factRows0/reused1, not a physical scale measurement.
Node42/42 current ordering/immutable multi-owner wire/late stale-peer/bootstrap/open-isolation controls.
Earlier31Node+18Native are distinct prior checkpoints; latest TypeScript/release passed, Clippy passed
before final null guard. Owner-vs-containing-root registry +existing revision/ACK barriers, Native
source views and explicit requalification read floor; no SDK reset/wholeparent ignore/deadline/budget
change. Conservative optional-index unavailability until complete scope qualification is explicit;
not all partial-index cases, different cache pools, realSDK-in-source-layout, Windows/UI or endurance.
[Detailed report](../reports/2026-11-09-managed-cache-source-namespace.md). Evidence under
`.bench/index-versioned-maintenance-20261104/namespace-final-20261109/managed-multi-root-lifetime-final/`
and `managed-peer-native-evidence-final/`. ADR0043/0044 remainProposed. Fresh full gates/scale/new30K
soak pending; no merge/publish/deploy/real cache deletion.


### 2026-11-09 IX12 production Worker regressions: route + recovery

Parent298d65f5d7f796c347fe8be5c739e428066489d8, isolated W candidate; real framed stdio,
Node20.19.5. All files below under namespace-final-20261109 evidence.
Original IX12 had6Node failures, then incomplete hang/controlled stop; Rust425PASS/1existing ignored.
`occupancy-wire-01` proves overlayOnly=false/forceLegacy=true. Remove dirty-index strategy override
only, keep source/candidate/publication fences: actual product five occupancy regressions5PASS.
Original whole production file after route repair6PASS/1FAIL (diagnostic delivery), no new hang.

`pressure-catch-inplace-02` actual-runtime probe: Other v2 current epoch/controller, unavailable
from retired Worker; Entry v2 fresh. Worker response alone is not public diagnostic publication.
Public minimal `diagnostics-after-worker-recovery.test.mjs` forces one exit during held diagnosis,
waits successful replay and sends no further editor/query event: RED missing notification,
`diagnostics-recovery-red-02.log`. First outer20s attempt CANCELLED, retained separately.
After recovery subscription + fresh debounce scheduling: original7production + new public recovery
pass; enlarged initial run28PASS/1FAIL solely stale test catalog count. New half-open event contract
RED emitted too early, GREEN waits explicit healthy; ordinary success does not keep refreshing.
Catalog count/assignments updated exactly, not bypassed; manifest current4PASS.
[Detailed report](../reports/2026-11-09-reference-route-and-recovery-diagnostics.md). Final expanded
source-fence/public suite and fresh whole gates still pending; old snapshots not current acceptance.


2026-11-09 后继定向收据：`namespace-final-20261109/route-and-recovery-final-focused-02.log`
32/32PASS、0skip，72.605s；完整源码/新鲜度、恢复、目录生命周期与清单同候选串行验证。
缺/有效SDK结果缓存对照2PASS；主工作树其他40文件哈希未变。旧失败不覆盖，新全量/规模/
30K正式长测仍需执行。详细范围见reference-route-and-recovery-diagnostics报告。


### 2026-11-09 IX13停止后的必要正确性修正

完整IX13停止时1693PASS/84FAIL（部分计数），不是完整通过；Photos15/density16未执行。
IDX-V1-INDEX-ADMISSION-002首次观测误标脏已修正，公开组合22PASS；
IDX-V1-INPUT-ADMISSION-001 Store成员刷新绕过旧负解析证明已修正，公开组合43PASS。
owner真实Native资格驱动修正2PASS；anchor/资源清理完整组合仍待完成，其他原失败待重放。
[根因、代码及原始证据](../reports/2026-11-09-reference-route-and-recovery-diagnostics.md)。
后继候选仍需新完整检查及对应身份规模/两小时协议验收；ADR0043/0044保持Proposed，
不改失败断言获得绿色，不把旧长测或Windows/UI未执行当已通过。不提交/发布/合并。


2026-11-09后继：IDX-V1-INPUT-ADMISSION-002首份catalog收据缺失已修正，组合35PASS；
IDX-V1-INPUT-ADMISSION-003失效容量证明未重扫已修正，组合36PASS（含原20K恢复）。
锚点/清理/SDK/目录组合37PASS；均为小型公开协议/契约回归，不是UI或新两小时验收。
原84失败的过滤重放52执行15PASS/37FAIL（修正前），完整门禁尚未GREEN；真实别名Native
28/语义26范围不匹配有manifest证据，不能删校验换命中。未验证token实验已撤出。
详见当日reference-route-and-recovery-diagnostics报告；全部原失败与插桩限制保留。


IDX-V1-INPUT-PROOF-004（2026-11-09）：实际4608份输入事实在SourceResetAdmissions.begin
触发4096健康capsule总配额，接口回归RED。依ADR0044移除此处配额，保留全事实新鲜度、
失败明细上限及context/配置/clear释放；末尾输入变更及跨context所有权回归GREEN。
最终该组46PASS/0skip；收据/容量/Store形状兼容组89PASS/0skip。不是扩大规模/UI认证，
当前完整门禁和新30K仍未通过；原失败与无效实验均在最新报告关联。


### 2026-11-09 输入证明用途与语义交付阶段

- IDX-V1-TEST-QUALIFICATION-001：真实Native匹配/superset配对；正例SDK及显式READY前提，
  按实际resident作用域注入并另存所有hash成本；8PASS，原1/6/溢出/终态断言保留。
- IDX-V1-PROOF-PURPOSE-001：legacy已知SDK partial仍为无资格缓存全读源码；内部cache
  用途省去该可选成本，未知/过期Program仍完整观察，严格协议/公开组合33PASS。
  当前摘要与历史比较分离先RED后GREEN，后继公开/资格组合39PASS。
- IDX-V1-PREPARE-REUSE-001：一次RPC重复prepare；仅unchanged且root/revision精确匹配
  才复用第一次view，仍枚举/终检；40PASS。
- IDX-V1-DIAG-HANDOFF-001：取消preparing仍等待1200ms准备任务，明确互斥scheduled/
  preparing/semantic阶段后19PASS，实际Worker终态屏障保留；缓存15.44/15.21/15.01ms。
- 内部Worker ABI3拒绝旧1/2，不改变Native或公开LSP；最终ABI3组合80PASS/0skip，类型检查exit0。

[根因、原始失败、SDK/参数差异和限制](../reports/2026-11-09-input-proof-purpose-and-diagnostic-handoff.md)。
各组合有重叠，不相加；不是完整门禁/当前30K/Windows/UI验收，不提交部署或合并。


IDX-V1-TEST-QUALIFICATION-001后续：原19项遗留失败逐项获得GREEN对照，原始RED与无效试验不删。
真实Native正例、候选响应故障注入、legacy无资格拒绝、在途变更单终态、SDK旧域/替代域/关闭清算分开验证。
原断言涉及的结果位置、候选/批次、组/依赖扩展不以伪资格通过；对违反ADR0005/0043的新旧合同预期显式迁移，
证据和剩余范围见2026-11-09-input-proof-purpose-and-diagnostic-handoff.md。新完整门禁未通过前不称最终验收完成。


## 2026-11-10 SCALE003 ordinary partial-completion root retention

Current worktree `.bench/worktrees/index-versioned-maintenance-20261104`, same parent298d65f.
Before product edit, new real child/stdin-framed LSP test fails Program identity despite correct definition/list;
RED command and metadata in `namespace-final-20261109/scale003-public-root-retention-red.log`.
One minimal planning refinement then rebuild, targeted partial-completion-admission + auto-import-completeness:
4/4PASS,0failed/skipped,29.489s. Discovery-selected-after-partial still uses explicit candidate roots;
partial list/detail completeness and rejection of truncated full references remain asserted.
[ADR0030 proposed refinement](../adr/0030-completion-scope-and-navigation-liveness.md) and
[current failure/fix report](../reports/2026-11-10-30k-ordinary-completion-deadline.md).
Ordinary30K replay in progress; current full check pending. Prior2455/2455 belongs to the old frozen runtime.


## IX18 current whole candidate gate PASS (2026-11-10)

Fresh full `pnpm check:fast`:2456/2456PASS,0fail/cancelled/skipped/todo,4141.296s wall;
raw Node test duration4132.627s.2439 source inputs unchanged before/after; no mid-run source edit.
This includes the new partial definition->member-completion Program-retention regression.
Receipts: `namespace-final-20261109/ix18-complete-check-receipt.json`, `ix18-pnpm-check-fast.log`,
`ix18-terminal-summary.json`, and exact4-file `ix18-root-retention-review.patch`.
Rust is explicitly reused from identical249 inputs/Native5f648342 with check-log hashes revalidated, not a fresh cargo run.
Photos27 gate has actually released into isolated originalPhotos input preparation. New formal7200s not yet started;
Photos23 completed endurance remains old-candidate evidence. Scale28/density29/topology30 wait serially.
Original scale24 failed95 results, full30K references/rename limits, definition tails, partialSDK, OBS012,
Windows SSH timeout and real UI tool-host failure remain recorded. No full feature/platform/performance acceptance.
No product threshold change, commit/push/merge/deployment or daily process restart.


## 2026-11-10 evidence-only ordinary summary CLI

Parent298d65f; frozen product candidate untouched. New evidence scripts outside product worktree:
`namespace-final-20261109/session-analysis/scale_metrics.py`(68lines), `scale_metrics_test.py`(205lines).
Public CLI RED/GREEN vertical slices preserve logs: missing entry, missing matrix cell, duplicate cell,
nonterminal cell, artifact identity drift, distinct errors, invalid elapsed data, unexecuted operations;
calibration/profile exclusion is an existing-behavior GREEN characterization. Final9testsPASS, stdlib toy fixtures,
not product/LSP validation; not added to2456check:fast count. Ordinary real48-cell result aggregation and fixed-input
replay are byte-identical. Commands/source hashes/log hashes/parent/scope in `scale-metrics-cli-proof.json`.
These short metadata-only calls do not analyze full Native/resource/rawwire streams; heavy aggregation remains deferred.
[Actual three-round regression and scope](../reports/2026-11-10-unrelated-file-query-latency-regression.md).


## 2026-11-10 evidence-only Program observation mapping

Initial manual mapping (definition/completion) was invalid for Worker define/complete and completion.program.complete;
all resulting missing classifications retained in `scale28-profile-program-observations-unqualified-01.json`, not used as counts.
Parent298d; corrected standalone stdlib evidence CLI RED(missing entry), GREEN, nonterminal RED/GREEN;
ambiguity/missing/wrong-URI are GREEN characterizations.3 public CLI testsPASS,4 guarded subcases;
67/98line helper/test outside frozen product. All32 closed profile inputs yield112 uniquely-associated observations,
4unmeasured rejected first requests/12not-executed operations. Fixed-input independent replay BYTE_IDENTICAL.
Commands/logs/source hashes and unqualified-input SHA in `namespace-final-20261109/program-observations-cli-proof.json`.
No product source/controller mutation or added product gate tests. Program/SourceFile identity snapshots are not
exact construction/parse/read counts, and trace-only post-query getters remain attribution limits.


## 2026-11-10 SCALE004 diagnostic-copy realpath argument counters

Parent298d65f; no product source/runtime or live timed controller edited. Independent helper test
`python3 -m unittest namespace_probe_test -v` in
`.bench/index-versioned-maintenance-20261104/namespace-final-20261109/session-analysis`:
RED9tests/1error (missing realpathArguments) in `namespace-probe-paths-red.log`;
minimal helper counter implementation GREEN9; added two-distinct-string/Buffer/nested-scope
characterization GREEN10 in `namespace-probe-paths-characterization-green.log`.
The earlier9-test helper and exact sources remain in `namespace-probe-prepared-v1`; v2 has its own
source hashes and in-memory exact Worker layout proof, `namespace-probe-preparation-proof-v2.json`.
This is tooling preparation only: no actual project API count or performance result, no syscall/physical-file claim.


## 2026-11-10 SCALE004 admitted-read physical path reuse

Parent298d65f; three stable DocumentStore-port characterization casesGREEN before implementation.
Fourth performance contract RED: expected two live realpath calls, actual three.
Complete native-catalog expected-path derivation now avoids the redundant initial call; existing
guarded pre/post realpaths, regular-file gate, admission token and content checks remain.
Injected/partial/unknown relative paths retain ordinary canonicalization. Same-inode alias retarget,
root aliases, replacement and cancellation boundaries are explicit.
Logs in namespace-final-20261109: scale004-read-proof-characterization-green.log (3PASS),
scale004-read-proof-red.log (3PASS/1FAIL), scale004-read-proof-focused-final-green.log (22PASS),
scale004-read-proof-public-lsp.log (22PASS, real child/framedstdio,25.129s), tsc/buildPASS.
Two intermediate manifest count failures preserved; exact332entries/138unit files and explicit new
assignment retained. No assertion relaxed. Source-size debt document-store1567->1561; new helper27lines.
Receipt scale004-first-optimization-receipt.json; fresh IX19 check:fastRUNNING on2441frozen inputs.
No optimized20K timing yet; previous frozen candidate statistics not relabeled as new acceptance.


## 2026-11-10 closed matrix analysis tool qualification

Outside frozen W: factor_metrics CLI RED6tests before implementation, GREEN6 with complete72/108
grids, cold/warm separation, profile/calibration exclusion, missing/duplicate/mixed input rejection,
invalid numeric samples, retained error outcomes and output no-overwrite. Actual72density/108topology
ordinary matrices extracted and replayed BYTE_IDENTICAL; receipts factor-metrics-cli-proof.json.

program_observations v1 archived before extending static closure metadata: density bytes/reference
fixtures RED2subcases (incorrect total-file fallback), unknown axis RED (must stay UNMEASURED).
Minimal explicit staticClosureFiles handling GREEN5tests; prior scale32profile output replays
BYTE_IDENTICAL using original relative input spelling. New24density/36topology profiles yield96/144
single-associated snapshots, all project2048/SDK256/other113/total2417. These are not Program
constructor counts. A first replay differed only by absolute executionPath metadata and is preserved;
nice priority change was denied, no sandbox bypass. No product source/runtime/controller changed.


## 2026-11-10 IX19 teardown failure and fresh successor

Actual IX19 full check2462PASS/1FAIL/0skip, unchanged2441inputs; early audit-root after-hook
ENOTEMPTY prevented session.close and stalled one test LSP/Native tree. Read-only exact PID evidence
and owned-server SIGTERM intervention preserved; remaining whole check completed, never normalPASS.
Independent publicLSP copy probes prove original active writer at removal versus reordered close;
existing createTestResourceScope controls cover normal/body/setup failure without suppressing errors.
After terminal, actual test adopts that existing helper and normal Native-exit assertions; focused
4/4GREEN6.853s. Fresh full IX20 source68aa4629 nowRUNNING, old receipts retained.
Prepared serial acceptance tools: Photos32 33PythonPASS, scale33 19Python+9NodePASS, density34
20Python+5NodePASS, topology35 6Python+8NodePASS. Their waiters are live, workload still gated.
Complete runtime guard uses all79 after-build assets and exact source snapshot; same249Rust inputs/
Native5f648342/check-log hashes explicitly reused, not a fresh Rust execution. No Node threshold,
correctness assertion, release, merge, dailyZed deployment or real cache changed.


## 2026-11-11 IX-05 GC-006 isolated successor (not integrated)

Parent298d65f/source68aa4629 Windows baseline: empty public VersionedFacts control
64serial closes,256GC quanta →66owners/66paths,2live,0groups/versions, held readPASS.
`cargo test --locked -p arkts-index-sqlite --test diagnostic_owner_metadata_retention -- --nocapture`
RED exit101 at owners66!=2; no product injection. Local test and raw-log SHA are
in `windows-ix20-20261110/owner-retention-red-qualified-summary.json`.

Isolated next-overlay implements stable lock slots + non-reused logical owner
sequence, preserves creator/pin/receipt references and bounds dead-row GC work.
New component9/109 layout is not deployed or integrated; prior-format migration
remains required. First empty controlGREEN2owners/3slots; existing15controlsPASS.
The next publication/replay control was RED on unchanged baseline (17paths), with
current facts, old-fact GC and lost-ACK replay all correct.

A shared Cargo target then ran format8 against next's actual format9source after
a baseline rebuild. The false next-association is retained, not hidden. All
subsequent next builds use dedicated `arkts-owner-slots-next-20261111-target`;
baseline builds use separate `arkts-owner-slots-v8-baseline-20261111-target`.
Fresh next run17/17PASS/7binaries,0ignored/filtered, actualformat9, with executable
hashes. Publication/replay scenario retains16headers but only2lock paths, original
replayhead1/currenthead16, old facts collected. It does not bound published receipt
history or close migration/full gate/Native release/UI/soak requirements.

Authoritative next slice receipt: `namespace-final-20261109/owner-retention-control/fresh-target-qualified-summary.json`.
Current independent overlay remains outside frozen W; Mac topology35 is still
running and its IX20 artifacts remain unchanged. No commit/push/deploy/cache
deletion. A fixture producer naming mistake was rejected by the existing API
before migration; both that failure and its corrected fixture use are separate
from product RED. See [GC-006 report](../reports/2026-11-11-versioned-index-owner-metadata-retention.md).


### 2026-11-11: private previous-layout upgrade and style evidence

The isolated successor now accepts only the matching known previous8/108 layout
as a private migration parent, using the old unique-lock lease ABI. Ordinary
VersionedFacts opens remain strict9/109. A same-domain previous layout is still
MigrationRequired: identical domain text cannot make incompatible facts current.
The initial parent-open RED and the later same-domain migration-gate RED are
preserved. After the two fixes, the gate passed2/2; a separate real8→9 private
publication passed, including new qualification and an old held reader's old
snapshot. No in-place schema migration or real-cache deletion occurred.

Native cache retirement initially passed3 and failed1 because the management
format allowlist did not recognize9. The exact known-format allowlist now covers
8/9 and108/109 with the existing physical-layout checks; all4 cases passed.
Twenty-four public cache safety cases also passed as characterization. Windows
strict Clippy initially rejected a pre-existing cfg-dependent unused_mut; moving
the mutation into the Unix-only branch preserves policy without suppressing
warnings. cargo fmt --all -- --check and cargo clippy --workspace --all-targets
-- -D warnings subsequently exited0. Raw logs and the formatted source were
retrieved in owner-next-formatted-source-and-v8-fixture.tar, SHA256
92db274d993124f85d4752878cd69417a88ae98f52b18e5527063d1a947b0fcc.

These are separate focused runs on the successor, not new full Rust/Node checks,
release builds, UI tests or a long soak. Real previous-format fixtures are being
converted to per-test copies before integration; the experimental108 producer
has passed and was verified to emit108. Published receipt/header retention remains
unfinished. The frozen Mac IX20 source and runtime have not been changed.


### Windows full native gate and isolated Mac integration (2026-11-11)

The isolated successor completed cargo test --workspace:423PASS,0FAIL,1existing
ignored pinned455 release-fixture case,0filtered. The ignored case is not waived
for correctness; it must run separately with its pinned input. Relevant release
build exited0; Windows Native SHA256 e9b797567c841c981e811cb9190f7f8caf569a733f64547e2e46ebb3fc92b232.
Full raw log SHA2563d0a7d751f71562f3f7910c747e683484626734a96d2fd11b198a9d7d855b1a2.
Receipt: owner-retention-control/portable-and-workspace-qualified-summary.json.

After verifying all2441previous W inputs byte-identical,27coherent source/test/
compatibility-fixture/provenance files were copied into the isolated Mac worktree.
Previous files are backed up and frozen IX20 test/runtime evidence remains intact.
The new Mac candidate now requires fresh validation; old2463PASS/Photos32 does not
validate it. A separate focused Mac check is running. No original-root product
files, daily runtime or user cache was modified. Published receipt retention is
still open. No merge, publication or full acceptance claim.


#### Real previous-producer peer-head race: both profiles passed

An additional controlled Windows cross-process experiment uses a separately
compiled actual8/108 producer executable to update the selected old data while
new9/109 has already pinned it as migration parent. Old producer public facts
API publishes head1→2 and verifies the new document. The already-pinned new
candidate then reports is_current_parent=false, rejects activation with
InvalidGeneration **before** invoking the source-scan callback, and leaves the
old physical store at head2. Both profiles passed. This closes the previously
unmeasured previous-layout peer-head boundary for this controlled sequence;
it is not a claim about every OS/filesystem failure interleaving or real UI.

The two diagnostic sources and verify-real-previous-peer.ps1 are retained under
owner-retention-control; previous-peer-qualified-summary.json binds both old
executable SHA256s and raw logs. They are explicit cross-version diagnostics,
not environment-dependent tests added to the Mac full suite. No product source
was changed for this experiment. The earlier423-case Windows full check precedes
this additive diagnostic and is not relabeled as including it.


### Mac native final slice and test-observer integration checkpoint

Mac native gate completed430PASS/0FAIL/1existingignored in cargo test --workspace;
the ignored455fixture was then run explicitly and passed correctness1/1. Its cold
catalog measured3234.09ms; only the3s timing assertion uses the existing user
waiver. All455postflight source hashes match the pinned fixture. Experimental
focused15PASS, default focused20PASS, fmt/strictClippy and releasePASS. Source
inputs2459 matched after each gate. Native release SHA256
fae5cce64796177724558ed04790b493a6ef09e8cecffa05963240085378dee5.
These overlapping test sets are not summed as unique tests. Receipt:
owner-retention-control/mac-native-qualified-summary.json.

Windows new-Native protocol followup:13casesPASS,12actual Native identities all
SHAe9b797567c841c981e811cb9190f7f8caf569a733f64547e2e46ebb3fc92b232,
all12closed normally. A first13PASS was not sufficient:8directory cases' helper
hardcoded a default path, shadowing inherited candidate selection. That attempt
is retained with reduced attribution. The second run uses explicit per-fixture
selection and passive identity/exit observation. No real UI/Photos claim.
Receipt: owner-retention-control/windows-new-native-lsp-qualified-summary.json.

The shared test helper selection bug now has a real public LSP RED: requested
copied executable but observed default installation; minimal helper fix honors
ARKTS_TEST_NATIVE_BINARY, retains explicit per-test override, and chooses the
Windows.exe default. Its public identity test GREEN follows. A separate Mac
observer RED (1PASS/1FAIL missing wire file) becomes2PASS with optional passive
wire observation, preserving ownership output, split UTF8, callbacks and actual
write backpressure. Exact same oldNative5fwas used for that observer control;
it is not new-native behavior acceptance. Existing ownership fixture is extended,
not duplicated as a permanently separate portable implementation.

Eight test/support files were integrated after native gates; no product JS or
Rust source changed. Initial focused launch used the wrong cwd and found no test;
that setup failure is preserved. Corrected run20PASS/1FAIL exposed the expected
stale inventory332versus334 after2new executable test files. Inventory was updated
to exact334 with explicit assignments; Native-backed public test belongs in the
bundle layer. This retains the completeness assertion rather than relaxing it.
Fresh focused attempt3 is running before new whole pnpmcheck:fast.


### 2026-11-11：GC006 资源引用与逻辑身份分离（当前隔离候选）

本节修正前述“将 owner 置 NULL”的中间提议；该提议未成为最终实现或已接受决策。
历史成功回放与 group ID 不复用要求保留创建者身份。实际格式9对照通过身份保持测试，
中间格式10原型A却失败，因此已封存并放弃原型A。

当前原型B保留 `manifest_groups.owner` 为不可变逻辑创建者，另设可空外键
`resource_owner`。仅当组已经 published/abandoned、没有剩余 manifest entries、
资源所有者经现有租约协议证明已结束时，预算内GC才可解除这个资源引用。
仍活跃或不能证实结束的所有者、当前 facts 创建者和 reader pins 继续保护资源。
组ID、状态、提交序号、精确历史回放及同head资格合同不变；不采用TTL、删除历史回执、
复用ID或删除锁文件来换取有界资源数量。逻辑回执本身仍可增长，不宣称所有元数据有界。

这是10/110组件布局变化，支持私有迁移真实8/9及108/109输入；普通查询打开旧布局仍拒绝。
旧8与9使用各自实际租约ABI。新格式必须检查逻辑身份列与资源外键的不同角色，
不能只改格式标签接受旧结构；布局不匹配在注册owner/获取锁槽前拒绝。

截至本检查点：隔离Windows原型B的17个Rust测试目标共41项通过；默认与实验布局的
迁移/失败重试/旧快照/错误布局测试各7项通过；四组真实旧写者8、9、108、109推进后，
新候选拒绝过期父版本（每组2项通过）。预算1、活跃引用保护、SQL失败回滚后重试、
原始创建者不可变均有回归。故障注入只证明对应事务失败，不替代真实进程崩溃测试。
这些集合有重叠，不相加称唯一测试数。证据：
`.bench/index-versioned-maintenance-20261104/namespace-final-20261109/owner-retention-control/terminal-owner-split-qualified-summary.json`。

新布局尚在隔离目录，未集成到冻结的Mac格式9候选，也未部署；其全目标回归与release
构建在进行中。Mac同源2462输入的正常权限 `pnpm check:fast` 另行运行，不能用于证明
格式10已通过最终验收。最终同候选全量、规模与两小时协议验收仍待完成；真实UI未验证。


### 2026-11-11 最终10布局：Windows完整Rust与公开LSP检查

修正夹具缺失后，隔离Windows `cargo test --locked --workspace --all-targets`
433PASS/0FAIL/1existing455ignored，实验布局25PASS；`cargo build --locked
--workspace --release` 退出0。276项Rust及外部夹具输入逐项后验无差异。
Native SHA256 a64504fa9edc2f5340441f73d16d046a8972995cfb5b485303e9affb01ea2832。
另外公开LSP13PASS；12实际native身份均匹配新构建，12正常exit0。
仍不是Windows真实UI、Photos混合长测或Mac最终全量验收。
收据：owner-retention-control/terminal-owner-final-native-qualified-summary.json
与 terminal-owner-windows-lsp-qualified-summary.json。原始首次缺夹具失败保留。

Mac格式9基线 `pnpm check:fast` 已完成2466PASS/0FAIL/0skip/0cancel，
3860.864秒，2462输入无变化；不将其归给格式10。随后备份并集成26文件，
当前格式10工作树2475输入，快照1a45cd7845b48eee826fcdbe28c08036a6b6dad3e58a60c688738e7cae2c54d0。
Mac新native检查正在运行，最终全量与同候选规模/两小时协议测试仍未完成。


### Mac格式10最终native终态与IX22启动（2026-11-11）

`cargo test --locked --workspace --all-targets` 440PASS/0FAIL/1existing455ignored；
该455用例另外显式运行，正确性1PASS。实验物理布局25PASS，fmt、严格Clippy、
`cargo build --locked --workspace --release` 均退出0。2475输入每阶段无变化。
Mac Native SHA256800e66281afb57afe4c129a17923b7778fbd0fbf4cf817d2f591caa4685bc07c。
证据：owner-retention-control/mac-format10-native-qualified-summary.json。

随后启动最终候选全新IX22 `pnpm check:fast`，旧格式9的2466PASS不替代它。
Photos36控制器只等待IX22完整成功、Rust输入/检查日志及79项产物精确核对后才启动
校准与7200秒单会话；当前尚未开始实际负载。控制器失败即停止，不自动换候选重试。
规模37/密度38/拓扑39驱动回归通过，实际矩阵未开始，按Photos后串行顺序执行。

工作树沿用前次格式9时已存在的4个8/108 fixture WAL/SHM旁文件，已记录在冻结输入
中；测试只include完整DB字节并物化scratch，不使用旁文件。它们不是产品输入或待提交
文件，后续整理候选时须排除；当前不在检查运行中删除导致快照漂移。新集成清单已排除
全部8个归档旁文件，原始证据保留。没有删除用户缓存或日常安装文件。


### Final format10 IX22 terminal and live endurance checkpoint (2026-11-11)

Fresh full pnpm check:fast exited0 at2026-11-10T22:59:29.788603Z:2466PASS,
0fail/skip/cancel/todo,3815.775729s; all2475source inputs unchanged. Strict combined
gate revalidates exact282-input same-candidate fresh Rust checks reused by this
Node gate, the actual Native800e binary and79complete runtime assets. Raw gate
log SHA25653c28f8c42c07d4e055f488120048f65d9624ef3cfa6dc38e02354570df0d86f.
Receipt: namespace-final-20261109/ix22-terminal-qualified-summary.json.
This is final10 verification; older9 full PASS is historical only.

Photos36 then copied verified artifacts and original isolated inputs, calibrated,
and started formal single session2026-11-10T23:06:46.905Z. At00:21:02.560Z it had
4455.655formal seconds,709formal actions/3192completed formal requests (provisional
snapshot), no failed actions or protective stop.183full-scope refusals remain
functional gaps, not successful references/rename. Current sampled peaks include
Node1164.14MiB/Native245.06MiB/tree1419.50MiB; independent peaks are not additive.
Do not infer final stability, memory leak absence or full feature completeness.
Readonly audit waits for true normal close, SQLite integrity, original restoration,
fixedSDK/actualruntime and logged sleep-free formal window. Scale37/density38/
topology39 wait for exact predecessor receipts and run serially only after review.
No matrix load yet, no realUI claim, no publication/merge/deployment.


### Functional closure after scale37 / Photos36 (2026-11-11)

Parent298d65f, isolated worktree; pre-change complete candidate IX22 source receipt
namespace-final-20261109/ix22-terminal-qualified-summary.json. No commit claims.
Public30003source exact full-reference/export-rename RED and corrected GREEN:
functional-closure-20261111/membership-public-red.log and membership-public-attempt2.log.
First post-fix attempt had a local-import/global-export oracle mistake; retained.
Three strict original17operation scale cells PASS zero limitations; Photos90s
initialization FAIL and CPU diagnostic retained, not hidden behind generated PASS.
Configured initialization resolution regression RED: node --test
tests/semantic/relative-candidate-reuse.test.mjs, initial-resolution-red.log,
1PASS/1FAIL;60same relative imports cause62candidate probes. Unconfigured control1.
Minimal change enters existing synchronous resolution/freshness scope for each
initial group compiler preparation. GREEN and real replay pending at this checkpoint.
All evidence under .bench/index-versioned-maintenance-20261104/functional-closure-20261111.
Old2466PASS and completed Photos36 are historical, not new-source full acceptance.


Initialization scope GREEN9public tests (initial-resolution-green.log) followed by
real Photos90s FAIL, so scope repair alone did not close initialization. Bounded
relative candidate LRU retains1MiB and all freshness/physical-boundary contracts.
Final same-fixture characterization against preserved pre-LRU runtime FAILS,
relative-lru-final-red.log; new runtime nine related tests PASS/0skip,
relative-lru-green-attempt3.log. Probe regex corrected to count only the original
.ets negative candidate, not also.d.ets; prior outputs retained. No full fast
gate or real Photos complete acceptance claimed. TypeScript check PASS.


Cold admitted-read identity slice: public302source RED92duplicate guards/46paths
(cold-snapshot-proof-red.log). Descriptor-owned readSnapshot replaces only those
extra cold diskIdentity reads. First post-fix attempt counts0but fails a broader
unnotified-body auto-recovery expectation; source admission needs its real watched
revision, not silent restamping. Focused watched/current-location assertions and
read-window/parent-retarget controls11PASS/25filtered, green-attempt2.log. TypeScript
checkPASS. Eight-file unfiltered contract run is ongoing, no full/Photos claim.


Expanded cold-proof contract97tests:92PASS/5FAIL/0skip. Four are old exact-string
observer rejection before Worker start; fixed the driver to observe exactly one
actual old/new read entry, retained-lazy4PASS unfiltered including GC. Remaining
complete unknown-symbol fallback re-enumerates actual namespace2to5opens; public
RED remains, final proof must be optimized with full directory/file/configuration
evidence. Do not remove assertion, restore20Kpartial or drop the final fence.
Large30003 exact refs/rename and existing admission/read-window contractsPASS.
Evidence: cold-snapshot-contract-classification.json; no new whole-gate success.

## 2026-11-12 complete-proof weak-ID boundary

Parent298d65f5; actual public LSP RED:
`node --test --test-name-pattern='stable-directory-ids=false' tests/semantic/navigation-partial-membership.test.mjs`
Observed2directory opens vs required5; log functional-closure-20261111/complete-proof-weak-identity-red.log.
Native inode/device eligibility now falls back to full enumeration when unknown.
Unfiltered navigation-partial-membership + project-membership-read-proof +
readiness-catalog-input-windows + retained-lazy sources:24PASS/0skip.
Typecheck/build PASS; complete-proof-final-regression.log and complete-proof-typecheck.log.
This is targeted verification, not a fresh full check:fast or UI/endurance result.

Expanded Node20 serial13file complete-proof suite47PASS/0fail/0skip.
Current partial-completion-admission unfiltered2PASS/1FAIL: full20004file
semanticPreparation still exceeds existing20s observation. Stack-observer
attribution is opt-in, full paths/counts unchanged; combined6PASS/1sameFAIL.
No timing/complete-result assertion relaxed. See functional-closure-20261111/
complete-proof-verification-checkpoint.json. This remains a real OPEN failure.

## 2026-11-12 cold SourceFile provenance RED / GREEN

Parent298d65f5; Node20.19.5. Public actual-child test command:
`node --test --test-name-pattern='cold compiler snapshots' tests/semantic/large-dependency-input-proof.test.mjs`.
RED46actual readiness rereads of46guarded cold files in302source Program,0duplicate
lazy physical guards (the earlier repair already worked). Transfer original read
identity only to actual registry snapshot/SourceFile with exact matching raw bytes.
GREEN46->0 with independent source-change and watched recovery oracle unchanged.
Build/typecheckPASS. Focused1PASS/3name-filtered; expanded current suite running.
See functional-closure-20261111/cold-source-provenance-{red,green}.log and
cold-source-provenance-current-runtime.json. Previous47case receipt predates this
new product change and does not certify it. No runtime timeout/resource changes.

## 2026-11-12 SDK module candidate vertical slice

Node20, parent298d65f5. Public child/framed test sdk-module-candidate-reuse:
60SDKwrappers reexport one shared JS fallback module. Exact definition is valid;
positive/negative exists probes122/244RED. Initial LS-only memo leaves62/124RED;
SDK-only export-index owns the remaining direct lookups. Same1MiB-per-owner LRU
query/build-local contract added there; probes2/4GREEN. Creation of previously
absent higher-priority ETS declaration refuses old result -32803; no missing-result
success. Source and all final proof/physical/admitted guards unchanged.
Two first combined receipts retained (7PASS/3FAIL, then9PASS/1manifestFAIL).
Static inventory with newly registered test is335entries/173bundle tests; exact
assignment asserted. Current nine-file whole SDK suite RUNNING, no borrowed gate.
Log sdk-module-candidate-{red,green,green-attempt2}.log; manifest separate log.

SDK candidate expanded selected9whole-file suite completed74PASS/0fail/0skip
in103.632s; Node20, unchanged production inputs while running. Exact manifest
4PASS verifies335entries/173bundle-e2e files including the new2case public test.
Photos14 is separately running after this suite, not part of74test acceptance.

## 2026-11-12 package root physical value lifetime

Node20/298d65f5 public LSP test local-file-dependency-alias, name repeated local
package imports:122value loadsRED ->1GREEN. Independent before/after/final guards
are counted separately and still run; closed declaration exact; directory replacement
refusesoldresponse. Original canonicalRoot8entry LRU reused only with an original
configuration witness; no-witness callers still live-read. BuildPASS, tscPASS.
Focused1PASS/3filtered, not4PASS. Subsequent same-session recovery assertion and
sixwhole-file local/installed/group/namespace regression RUNNING.
Logs package-root-identity-{red,green,expanded}.log. Photos14 still90sFAIL; no fix
claim from the small count result. No product timeout/admission/RSS policy changes.

### 2026-11-12 witnessed generic compiler fallback

Parent298d65f5, isolated dirty worktree. Before product edit, Node20 public framed
LSP sdk-module-candidate-reuse missing-SDK saturation test FAIL: one11 versus
sixty660actual stat probes. Exact native answer memo, same owner/query and1MiB LRU,
then GREEN11/11 including later missing-file creation refusal. Native metadata
control against frozen pre-memo runtimePASS (same-version package redirection);
whole4files10PASS/0skip/0cancel, final tscPASS. Raw commands/results in
functional-closure-20261111/initialization-breakdown-20261112/fallback-*.log.
Prior full check remains2470PASS/7FAIL, no successor full-green claim.

### 2026-11-12 enumeration-race probe restoration and remaining timing failure

Fresh whole gate2470/7 provides RED for three directory race tests. Retained complete
proof avoided enumeration; invalidate followed by refresh alone also does nothing
without a prior catalog. Explicit public invalidate+membershipFor restores the
actual race, using original module-close hook. Refusal/partial/recovery assertions
unchanged; assert race executed before cleanup. Whole17/17PASS final3, earlier
failed probe attempts retained. tests/semantic/project-target-membership489lines.

20K completion parser observer counted initialization along with interaction. New
interval proves all20001noise files initially parsed, but zero extra noise parses
for interactive operations. It reaches these checks then original60s timeout;
whole2PASS/1cancel. Stage diagnostic fixture2.915s/READY20.738s/interactive58.905s,
reference await60.003s,0PASS/1cancel/2filtered. Not GREEN, no timeout increase.
Root actual30K OOM is separately reproduced with raw Worker error and clean resource
closure; bounded4000callback attribution is an explicit diagnostic stop, not PASS.

### 2026-11-12 known SDK refusal / project warmup order

Parent298d65f5 plus dirty candidate. Public framed LSP test in
tests/semantic/partial-project-initialization.test.mjs: target-unverified98-source
configured module returns partial but parses96unrelated project ASTs before it.
Command Node20 --test --test-name-pattern='known unverified SDK preparation'
tests/semantic/partial-project-initialization.test.mjs => RED96!=0, saved
sdk-preflight-order-red.log. Shared SDK-only preparation before known SDK refusal
=> whole3PASS, source catalog98unchanged, unused SDK+standard lib prepared, exact
definition works and watched configuration repair recovers READY in same Worker.
Compatible control still prepares all96noise sources and full98coverage.

First expanded6files57PASS/2FAIL: introduced additional SDK synchronization raised
actual candidate probe counts3/5vs asserted2/4. Kept assertions, inspected the SDK
condition without compiler sync on the compatible path; whole7files62PASS/0skip
sdk-preflight-expanded-final.log, tsc/buildPASS. Frozen runtime and changed source
hashes: initialization-breakdown-20261112/sdk-preflight-final-runtime-identity.json.
TypescriptLanguageService remaining size debt2978lines (pre-change2979), no claim
of whole-goal completion. Real30Kcold05 ongoing, current first-query scope unresolved.


### 30K local scope follow-through, 2026-11-12

Parent298d65f. WIP candidate stays unaccepted while real30K first definition fails.
Public partial-project initialization suite: background/detail RED2 (full100 roots),
GREEN11; then unsaved-only global RED -32803 and GREEN13/0skip after using live Store
overlay authority before disk tokens and rechecking it at publication. Native
canonicalization assertions and real compiler-time mutation refusal retained.
Logs: initialization-breakdown-20261112/operation-scope-background-completion-red.log,
operation-scope-background-completion-green-attempt.log, operation-scope-overlay-only-red.log,
operation-scope-overlay-green-attempt.log. tsc/build PASS, not whole check:fast.
Actual30K07 remains FAIL despite normal partial terminal: first query fallback hits
30s deadline; 08 observes the precise native package map trigger inherited from
parent-repo @types/node. See the initialization root-cause report, not a success claim.


### 2026-11-15: SDK-partial omission proof and retained failures

Parent298d65f. Correct automatic-type fixture first publicly RED101!=5; exact SDK
baseline package owners plus positive dependency-free omissions GREEN. Adding a
dependency revokes the proof, removing it restores5; both exact definitions remain.
The earlier4!=5 was an invalid type-root fixture, retained as driver error. Watched
manifest control already passed; no speculative product fix followed that control.
Nine files95/95, zero skip; tsc/build PASS. Not whole check:fast.

Frozen operation-omission-runtime worker096bf526..., server76e09144... . Cold17
local results exact, warm18 local results exact but full DB60s postflight FAIL.
Driver now asserts integrity.status; original14 false top-level status retained.
Independent16 (earlier89 candidate) measured actual Program421/project87, not59990;
its postflight also FAIL. Probe19 intentionally stops before project Program:28901
omissions,25420 dependency-bearing. Not product failure or a query pass.
See docs/reports/2026-11-15-30k-initialization-follow-through.md for complete paths.


### 2026-11-15 continuation: dependency influence and shared boundary ownership

Parent298d65f, current dirty isolated candidate. Cold typeDefinition before
fallback publicly RED on95. Cyclic importer beyond256 delivery with external
global declaration RED on95; graph GREEN including unsaved removal/undo.
Repeated imports publicly measured3 boundary realpaths for1 file; shared original
file/root witness GREEN1. Logs under initialization-breakdown-20261112:
scope-graph-cycle-overlay-{red,green}.log, scope-boundary-reuse-red.log,
scope-boundary-reuse-public-green.log (19/19,0skip). Manifest inventory336/174
bundle entries,4/4 PASS; tsc/build PASS. Existing full package-owner fallback and
compiler-time input mutation refusal retained. No whole check:fast PASS claim.
Ordinary30K20 and profiled21 both FAIL product definition deadline before project
Program, despite SDK-partial terminal; this supersedes no old failure. Latest
boundary-sharing candidate22 is undergoing separate original-path cold replay.


### Preparation-to-query proof handoff and baseline source completeness

Actual framed-LSP RED scope-preparation-handoff-query-red.log measured early
uncached graph union scans for Augment/Main/Unused0. Preparation now collects
nested lookup owners for the actual query's final union; standalone initialization
still fences itself. New import after disk edit and exact target assertions GREEN.
Original SDK capsule plus full baseline AST-text/fresh-source SHA matching avoids
confusing configuration and Registry source ownership. Current seven files64/64,
zero skip: scope-source-hash-expanded.log. tsc/build PASS; manifest4/4 PASS.
Earlier54 suite's immediate unnotified SDK renewal expectation was a test-contract
error; final version refuses3 old-input attempts, then configuration triggers real
SDK re-sync and exact recovery, preserving the existing contract.
Real original-path28 remainsFAIL product30s after both Programs/checkers returned;
CPU/capacity diagnostic29 is running. No whole gate/UI/endurance acceptance.


## 2026-11-16：最终门禁失败续修

父提交298d65f，源码隔离WIP，未提交/合并/部署。完整旧候选aab73500
check:fast2502条：2480PASS/22FAIL/零skip，1239输入前后一致；原始日志
`initialization-breakdown-20261112/final-global-checkfast.log`。不是当前全绿。

- 旧核心无canonicalRootId适配器：先原失败，保留完整scope而非授权投影，定向13PASS。
- 公开默认补全缺Greeter先RED；源码export primitive摘要仅规划superset，实际compiler验证。
  SDK partial/incomplete仍真实保留；140候选跨批、不遗漏、未打开编辑/撤销、默认/别名/循环barrel及details整组9PASS。
- 原有同名补全RED worker-unavailable，诊断证实父端拒绝共享JSON数组，非OOM。
  每项独立recipe数组，协议校验不变；Unicode及默认补全原有4项PASS。
- 原package symlink overlay RED：view25/catalog26同revision2。Store本地原始catalog/view配对收据，
  刷新完整catalog精确比较，仍保持物理路径及包边界校验，4类escapePASS、相关14PASS（与scope9重叠）。
- partial旧驱动错误依赖已取消的20K上限：真实5MiB源码令source-unavailable，引用/来向调用继续原严格拒绝。
  功能整组4PASS，提取独立测试文件后manifest总数338/bundle176，清单回归4PASS。
- 生命周期原3项RED，未修改expected计数。原始事件证实SDK配置后同reset标记重复驱逐刚建上下文。
  每context只消费一次已有reset epoch，保留无epoch保守行为、新epoch/owner/content/path独立检查；21PASS。
- 历史长路径8351输入回归384→4→2目标identity扫描，保留加载及最终独立freshness；不删除证明。
- 20K完整场景当前仍FAIL：新回放初始化ready19.59s，交互步骤55.46s完成，60s总期限超时，
  不调大期限或记为通过。正式30K候选32精确定义14.87s/11.20s正确、初始化109.70s真实SDK-partial；仍严重慢，非完整验收。

证据统一位于`.bench/index-versioned-maintenance-20261104/functional-closure-20261111/initialization-breakdown-20261112/`。
完整根因、命令边界及尚未完成事项见[续修报告](../reports/2026-11-16-final-gate-closure.md)。

## 2026-11-16 continuation: optional receipt budget priority

Parent remains298d65f5d7f796c347fe8be5c739e428066489d8 with existing isolated WIP.
Latest SDK-target/logging/metadata candidate first passed184/184 unfiltered focused
regressions, but real30K cold35 and reopen36 exposed definition regression23.57/19.64s
and23.61/19.74s. These are retained failures of the performance objective.

RED command (Node20.19.5, isolated worktree):
`node --test --test-concurrency=1 tests/membership-validation-union.test.mjs`.
New case observes64configuration identities117times after unconsumed native receipts
fill the existing32MiB phase budget. No product deadline or result assertion changed.

Minimal fix in request-input-validation.ts: actual observations evict optional
unconsumed receipts before admission; consumed metadata and proof owners remain.
Raw fallback, cancellation disposal and uncached final union remain. Safety command:
`node --test --test-concurrency=1 tests/membership-validation-union.test.mjs tests/observed-source-directory.test.mjs tests/project-membership-read-proof.test.mjs`.
Result21PASS/0FAIL/0skip; typecheck/buildPASS. These21are after the change; the184
result precedes it and is not substituted for current expanded/whole checks.

Frozen Worker283f06ab2aab21e303d56598b4e3019ac5d2504676f3c041ef9d858f1bc5240e,
only one product source changes from35. Matched protocol39 repeat definition11.21s,
59170realpath versus37's20.22s/211168; exact ScreenManager range remains correct.
Instrumentation is explicitly separate from ordinary/UI timing. Remaining~11s tail,
ordinary20K references5s failure, fresh whole gate, fullNative qualification and
real30K complete references/rename are OPEN. SDK remains original API24 while project
requires20; content audit3536files unchanged. No merge, deployment or UI claim.

## 2026-11-16 body-only dependency topology reuse

Same parent298d65f and isolated WIP. Closest public real-child framed-LSP test:
`node --test --test-concurrency=1 --test-name-pattern='body-only overlay edits' tests/semantic/scope-dependency-lifecycle.test.mjs`.
RED body-role-reuse-public-red.log: dependency graph cumulative2,3,4 despite
unchanged imports/exports/global metadata. Hover already returns fresh body types.
Private fixture observes cumulative rebuilds across background requests too.

Only ProjectOperationScopes.ensure changes product behavior: compare dependency
digest plus ambient/opaque/dependencyFree; reuse structural role object only.
Always advance source key and operation revision on content change. No compiler
AST, result or old input proof is reused as current. GREEN whole file13/13, zero
skipped, actual number/string/number and cumulative2,2,2; typecheck/buildPASS.
Artifact operation-body-role-runtime Worker9aa07ec6b4068861677aaa02f8c1c68338bfcde2ec8d7180fa15edb1a315725e.
Expanded17files157/157PASS, zero skipped,179345.60ms. Actual30K warm overlay46
returns exact edits/undo/close/reopen; first/hot12466.04/8695.66ms, edit9485.55ms,
undo8907.18ms. One repeat24189.75ms includes parent queue wait15442.23ms behind
already dispatched diagnose; Worker receive-to-dispatch0.2635ms. Native30000/30000
ready, DB integrityPASS, shutdown/exit0, two owned processesCLOSED. No UI/endurance claim.
Latest original20K5s reference gate still2PASS/1FAIL, unchanged deadline; full
check:fast body-role-final-checkfast is RUNNING with before/after input hashes.
No whole acceptance/merge claim.

## 2026-11-16 post-whole-gate recovery and membership-domain repair

Frozen9aa whole check:fast2542tests2527PASS15FAIL0skip,2517inputsunchanged; original logs retained.
Public negative-role mutation RED refuses the immediate retry. Read-only probe
observes expected member2, store2→3 inside scope admission. Minimal invalidated
proof state + refresh before document transaction/source load makes original
public RED GREEN; original request remains-32803. Existing4-file51PASS before
cache-read/LRU/public-view extraction; current7-file70PASS after, zero skipped.
Store1540→1524lines; new coherent accessor41lines. Unit locks monotonic retirement,
no lending by a retired owner, and actual fresh proof recovery. Parent298d65f.

SDK counter RED independently records actual injected Module._compile error before
any Program/checker. Update the counter's supported before-site, preserving every
96file/2identity/zero-reread assertion; original3/3PASS. Long-path counter observes
actual identity factory rather than removed realpath;8351files96groups retain2
logical guards and independently reject any new native-realpath call; GREEN.

Four package retarget cases RED in frozen35/39/46, GREEN31/32/33/34. One diagnostic
variant removes only broad resolver generation from native membership current;
all real model/config/directory/leaf/final guards retained,4PASS. Formal source
same minimal change gives whole references-batch-search-coverage26/26PASS zero
skipped. Keep SDK/source/config load facts; no budget/timeout/field weakening.
Catalog5 and original20K5s latency still OPEN; current combination full/30K rerun
pending. Root-stage observer first version invalid, recorded separately; no false
phase/OOM conclusion. No merge/deployment/UI/endurance claim.


## 2026-11-16 reference preparation and lexical metadata continuation

Original ordinary 20K file retains client5s/test60s; repeated RED in
reference-refresh-large-green-attempt.log, namespace-encoding-public-regression.log,
source-digest-large-public-regression.log. No threshold/flags changed. Extended
independent diagnostic reference-refresh-diagnostic returns exact3locations in
5930.51ms; namespace-encoding-ordinary-diagnostic returns exact3 in5110.78ms. These
are diagnostic results, not a GREEN original transcript or multi-round statistic.
Path/cache characterization12/12PASS precedes lexical encoder refactor. Namespace
encoding weak ownership, actual-read digest reuse and observed-Program coverage
metadata are undergoing original public + freshness regression. No final IO check
is removed or inherited from a previous phase/request.

The hypothesis that finalization constructs unused pending receipts is disproved:
retainPendingFileIdentity already rejects finalizing. Added boundary characterization
passes16/16 immediately; final-unused-receipts-red.log is explicitly NOT a RED or
new product fix. No corresponding product code modification was made.
Catalog actual-stage correction8/8PASS0skip, independent of these performance slices.


## 2026-11-16 real initialization cancellation and metadata-path slices

CPU50 actual30K graph: realpath22.76s sampled self,58662binding owners/164SDK/
19811boundaries. Public400source RED metadata realpaths800; observeResolutionPath
makes0,41/41PASS. Add real cyclic imports: installed-source realpaths800RED→0,
68/68PASS0skip. Keep actual raw byte load guards and final independent union;
new same-size/restored-mtime metadata-window refusal is GREEN. Freeze129bdb5e,
Photos51 prepare85.421s vs49's113.355s; graph32.844vs48.389s; single instrumented
pair, unchanged role code variance not causally attributed. First/hot12.937/8.952s
remain slow. No READY/UI/endurance claim.

New actual shared-cell didOpen cancellation public RED450role calls/400unique/
first twice: initial-scope-resume-public-red.log. Draft metadata retained separately
from active scope; original configuration/SDK/profile and all current source keys
still checked. Dirty graph never certifies interrupted edges/effects. GREEN400calls;
binding-stage cancellation400; SDK replacement450; changed completed source401
with another unchanged fact retained and exact newglobal definition. Final8/8PASS,
0skip ininitial-scope-resume-final-boundaries.log. Expanded91=90PASS1manifest strict
bundle-count failure, corrected348files/181bundle and explicitly reverified. This
is not a final whole gate. Freeze305sources/Worker769b3c2f for actual30K controlled
late-cancel baseline/candidate comparison; retain early47 external45s failure.


2026-11-16 post-full769 closure: exact final full check produced2550 tests,
2543PASS/7FAIL/0skip,2525inputs unchanged (sampling-permitted run); retain all seven
failures. Before that run the original20K5s file passed three serial rounds9/9,
reference median4760.94ms/max4827.32ms. Actual30K controlled late cancellation
52baseline times out at external45s after55000role calls;53candidate retains29995
facts and exact definition returns30043.129ms. Subsequent24904.369ms includes
15889.177ms parent wait behind an in-flight diagnostic; hot9340.096ms remains slow.
Neither those observations nor local tests imply UI/endurance/full SDK readiness.

Current RED loop: original references-silent-source-lifecycle two managed-cache
cases hit0vs1. B/managed-cache-state-current.ndjson proves no cache set took place;
B/managed-cache-ownership-current.ndjson shows same-owner reset epoch0→1,
resolution1→2,previous refresh intenttrue→false. Same-owner refresh intent now
survives successful replacement; selection detects reset epochs/resolution and
retired observations. It never transfers a READY proof. Original four files
23/23PASS0skip (readiness-refresh-reset-public-regression.log); expanded full
lifecycle/20K and final check remain in progress. Probe repairs and no-authority
checkpoint fix preserve all original functional and six-checkpoint assertions.


2026-11-16 final same-owner refresh slice: original4files23/23 and expanded8files68/68
PASS, then complete pnpm check:fast2550/2550PASS0skip/cancel/todo. Frozenadad28ac,
2525inputs/runtime hashes unchanged through postflight. Actual30K coldNative56
single401.577s protocol session: semanticpartial95.582s, exact first/hot definitions
12.044/8.461s before Native publication, Native30000/30000ready0skip, all SQLite
integrity/foreign-key checksPASS, oneWorker orderlyshutdown and ownprocessesCLOSED.
Original55/independent60s integrity timeouts remainFAIL; sameSQL separate26sPASS
and56postflight37.644sPASS do not establish their fluctuation cause. Original/clone
30000source hashes unchanged. User confirms noAPI20SDK; actual24/target20partial,
severequerylatency/earliest47/UI/Windows/new2h/fullrefsrename remainOPEN.
No accepted-review history, merge, deployment or product-threshold change claimed.
See report2026-11-16-final-gate-closure and readiness-refresh-final-checkfast/summary.


## 2026-11-17 NAV-REPEAT-001：重复定义成本（父298d65f，隔离工作树）

- 公开RED：`node --test --test-concurrency=1 tests/semantic/scope-dependency-lifecycle.test.mjs`，400源码根overlay无用查询17630；修复为0且直接checkpoint17630。
- 真实取消公开回归：`tests/semantic/initial-scope-retry.test.mjs`，真实$/cancelRequest和共享cell先置1，公开-32800、同Worker恢复；旧adad亦通过，为取消行为特征对照。
- 正文编辑/撤销派生影响RED2/1/1，GREEN2/0/0；原图构建2/2/2、number/string/number结果不变。扩大56/56PASS。
- Native延迟格式化RED：`node --test tests/membership-validation-union.test.mjs`，unused directoryProof实际1/预期0；GREEN24/24，原独立叶子至少6次断言保留，扩大60/60PASS零跳过。
- 语义Worker c4280daa（引用验证Worker35975f9d），ordinary61待验；上一6d实际30K重复中位4.223s/max4.373s仍慢。新全量待验，不沿用adad2550全绿。
- 拒绝Native/配置跨模式复用实验：原断言失败，实验已回滚，补丁/失败证据保留。原20K5s旧adad/新6d均2PASS1FAIL，仍OPEN。
- 命令使用Node20.19.5；证据根`functional-closure-20261111/initialization-breakdown-20261112`中的`deferred-native-identity-{public-red,unit-green,expanded-public}.log`等。协议非UI，无合并部署。


第四个纯格式切片：`primitive-configuration-stamp-red.log`2次数字元组JSON比较分配/预期0；
GREEN `primitive-configuration-stamp-unit-green.log`31/31、扩大67/67零跳过，
原双lstat保留、身份精确一致、六字段中途变化均拒绝。冻结语义Worker b19fdc9f。
普通63重复中位3795.499/max4122.422ms，精确结果/Native/SQLitePASS；仍严重慢。
64独立诊断实测同Native owner89985=3×29995叶子检查，准备1+最终2轮；
配置身份热调用56964但不同路径/总体IO未测。进一步终检优化未实施，
不删除新鲜度检查。当前新全量未跑，旧2550不能沿用；20K原5s最终复验进行中。


## 2026-11-17 PR118跨平台夹具修订

父415f84b，首次Linux完整2560项2557PASS/3FAIL/0skip保留。
CI-PORT-001原stream.write固定false在Linux实际true；改为记录同次实际底层返回值，
严格核对观察器透明性，真实Native数据/回调/退出断言保留。
CI-PORT-002规范TMPDIR的Mac原公开用例复现102≠101（1FAIL/16名称过滤），
改为显式外部包目录+node_modules链接，保留全部原101/5和155/58断言。
两整个文件规范路径19/19PASS、常规路径19/19PASS，均零跳过；最终Linux CI另验。
仅测试/文档，未改产品或阈值，原Mac完整门禁在未改写的415工作树继续。
详细见`2026-11-17-integration-portability-regressions.md`与PR118实际CI记录。


CI-EXEC-001 RED：GitHub43995951008最大执行60分钟取消，三项可移植性用例已通过、
停止前连续通过且无新断言失败，但未完成。Mac完整2560/2560实际72m37.6s。
最小CI变更仅validate总作业预算60→90，所有canonical release步骤/单用例和产品截止原值保留。
既有`tests/release-pipeline.test.mjs`用于保护覆盖不删减；最终CI重跑结果另见PR118。


## 2026-11-18 NAV-REPEAT-001 原身份解析表示复用

父main1e3886d。公开RED：`node --test tests/semantic/repeated-navigation-input-formatting.test.mjs`，
800身份JSON构造，0源码重读、2800叶子观察；GREEN0构造/0热解析、2800观察不变、精确结果与单Worker。
单位生命周期53/53、扩大公开57/57零skip/cancel，类型检查/构建通过；初始manifest新增2文件计数失败保留，
准确增加对应入口和层计数，无测试跳过。Native3轮及所有原freshness/取消/SDK恢复守卫未改。
四会话main/candidate交替30K普通对照进行中，不以计数减少代替实际耗时收益或UI结论。
见`2026-11-18-repeated-query-receipt-representation.md`与`.bench/repeated-query-proof-plan-20261117/`。

第二切片：stamp-red公开同查询1612临时数值数组比较→stamp-green0，仍2800原始叶子检查；
六字段分别漂移回归及原资格/生命周期合计59/59PASS零skip。未改变Native三轮或独立最终校验。
第一切片普通四会话热中位3991.93→3632.70ms（9.00%），仍OPEN；main-a SQLite60s失败保留。
独立profile内dispatch为inspector自身开销，不能归因Native。第二切片四会话普通对照进行中。

最终第二组main-c/stamp-a/main-d/stamp-b：16次定义全部精确，Native/SQLite/关闭4/4PASS；
main热中位3974.69/max4331.03→最终3595.94/max3974.57ms，9.53%改善但仍OPEN。
最终候选TSC PASS，59单元+57公开+7大证明/SDK回归PASS，零skip/cancel/todo；无新全量check:fast宣称。
inputs-after确认30K、3955 SDK声明/metadata、冻结源码/产物均无变化。无提交/合并/部署。
