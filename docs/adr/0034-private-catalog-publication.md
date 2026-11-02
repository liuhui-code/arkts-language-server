# ADR 0034：私有 catalog 分批构建与原子发布

日期：2026-10-30。状态：**Proposed；用户已授权实现，回归测试未执行**。
父版本：`04282ed34ebab7cd01726bb0291af53bd278ff00`。

## 问题与证据

真实 30K 项目不是停在最后一个解析文件。`CatalogUpdate::Activating` 之后，
旧实现对现用 SQLite 库执行全量清理、插入、建索引和单次大提交，期间不报告存储进度。
250 ms 心跳重发解析计数，LSP 又将解析文件比例封顶为 99%，掩盖了后续持久化工作。
[Windows 报告](../reports/2026-10-29-windows-zed-30k-init99.md)和
[UI 调查](../reports/2026-10-30-ui-remediation.md)记录了数 GB WAL 和分钟级提交。
`commit` 调用可能包含自动 checkpoint，不能把整个调用耗时都归因于一次 fsync。

普通文本编辑保留现有语义增量及打开文档覆盖；原生 `refresh/apply_batch` 提供增量事务。
文件监听原本仍调度全量 catalog，本轮不改其调度方式。本决策改变全量 catalog 激活，
保留增量事务、官方编译器的语义权威和现有超时、恢复次数限制。

## 决策

1. **新库构建，控制库发布。** 同一 workspace 缓存目录新增
   `catalog-state.sqlite3`，以一条 FULL synchronous SQLite 事务记录当前数据库名。
   完整新库使用唯一的 `catalog-<pid>-<nonce>-<serial>.sqlite3` 文件名。
   原 `symbols-v2.sqlite3` 是兼容导入的起点，`workspace_cache_location.database_path`
   保持这个逻辑入口；产品通过 `CatalogStore` 打开，具体物理库通过控制库解析。
   不覆盖、重命名已打开的 SQLite 文件，不通过复制 `.db` 丢弃 WAL。
2. **有界事务和私有 checkpoint。** 普通批次最多 64 文档，并受 32,768 估算行、
   8 MiB 估算数据预算约束。超大文档进一步按最多 4,096 元素、4 MiB 估算数据拆分，
   保持符号、引用、别名、绑定及类声明 ordinal；引用 identity 跨批次去重。
   单个值仍受 native 2 MiB 源文件准入约束；估算预算不是物理 WAL 字节硬上限。
   保留索引和 FTS 触发器，避免最终一次巨型 CREATE INDEX；每批提交后在私有连接
   执行 PASSIVE checkpoint，不受旧库读者钉住。NORMAL 和 SQLite 自动 checkpoint
   保持开启。发布前 FULL 提交最终元数据、完成 TRUNCATE checkpoint，Unix 同步目录。
3. **发布前校验，发布时比较起点。** 新库完成 quick_check、foreign_key_check、
   外部内容 FTS integrity-check。发布前再次核对已读取源码的长度、mtime 和 SHA-256。
   文件变化则放弃该次构建，既有 watcher 排队机制负责后续刷新。
   文件集不是文件系统原子快照，后续变化仍由现有输入 fence 和编译器校验保护。
   跨进程 publication 共享/独占锁协调增量写入和发布；发布前比较活动文件及其
   committed generation，起点改变时丢弃结果，禁止旧窗口覆盖新结果。
4. **查询只看到完整库。** 每个 storage 操作解析并固定一个已发布连接，操作内
   metadata 和 rows 仍由原有 SQLite snapshot 读取。新库中的中间事务不会暴露给查询。
   已打开的旧连接持有文件使用权，切换后的旧连接在后台关闭，避免旧 WAL 的关闭
   checkpoint 卡住协议线程。缺失或不完整的已发布库报错，不创建空库冒充成功。
5. **取消与恢复。** 私有构建可在批次/阶段边界取消；SQL、同步 I/O 本身不承诺立即
   中断。进入短发布边界后不再接受取消。崩溃前未发布的新库可回收；发布事务提交后
   重启直接解析完整新库。错误、磁盘不足、取消或竞争失败都不清理现用库。
6. **安全退役。** 所有文件保留 ADR 0028 workspace namespace lease。
   每个已打开的物理库还持有共享 reader lease；退役必须取得独占 reader lease 和
   SQLite VFS 字节锁，跳过当前库及被使用的库。DB 删除失败时停止，不继续删除其 WAL。
   后台关闭之后重试退役，也识别未发布、异常退出和部分删除留下的组。
   后台维护使用 existing-only 打开，不重建已经移除的缓存目录。
   零长度 reader lease 文件保留至整组 GC，避免删除锁 inode 后与并发打开者失去互斥。
   整体缓存 GC 识别控制库、代际库及 sidecar 文件，检查每个 DB 的字节锁，并通过
   已发布库核验 workspace identity；原有资格、宽限、未知文件保护策略不变。
7. **未变更复用。** 全量扫描记录 URI、源内容 SHA-256、schema 和生产者二进制指纹。
   同指纹、无拒绝文档且非 force 时只推进小元数据事务，不重新写入 catalog。
   普通增量写入先使复用指纹失效；失败时保守放弃复用。升级生产者或改变输入需要重建。
   复用仍会扫描、解析和校验文件，不宣称零扫描启动。
8. **真实进度。** 协议保留顶层 `activating`，增加可选 storage 对象：writing、
   committing、checkpointing、validating、checking、publishing、reusing，
   已提交文件/行数、WAL/checkpoint frame 观察值、阶段耗时和实际 activity sequence。
   心跳可推进耗时，不能伪造活动序号。UI 初始化保持不确定进度，仅发布成功报告 100%。
   存储阶段与定时摘要进入服务结构化日志，不记录源码内容；stdout 仍专属协议。
   `ARKTS_INDEX_CATALOG_BUILD_TRACE_FILE` 可选记录逐批提交和 checkpoint frame/耗时，
   默认 stderr 按阶段族和时间节流，避免产生新的日志管道背压。

## 依据与取舍

- [SQLite WAL](https://www.sqlite.org/wal.html)：大事务、自动 checkpoint、旧 reader
  与 WAL 文件长度各有不同作用，不能靠延长超时或 journal_size_limit 解决活动大事务。
- [SQLite synchronous](https://www.sqlite.org/pragma.html#pragma_synchronous) 与
  [checkpoint modes](https://www.sqlite.org/c3ref/wal_checkpoint_v2.html)：分批持久化期间
  保留 NORMAL；私有库完成持久化后再由 FULL 控制事务发布，不默认关闭同步保障。
- [FTS integrity-check](https://www.sqlite.org/fts5.html#the_integrity_check_command)：
  校验外部内容一致性，不能只检查 SQLite 表结构。
- [原子 alias 切换](https://www.elastic.co/docs/manage-data/data-store/aliases#multiple-actions)
  提供新索引构建后一次切换的成熟实践；这里只使用该发布模式，不引入 Elasticsearch。
- 原 schema 的多张表不以 generation 为复合主键；同库多代 staging 会扩大 schema、FK、
  FTS 和查询迁移范围，故采用独立库。代价是构建期同时占用旧、新两份数据空间。

## 验证边界

[实施记录](../tdd/2026-10-30-private-catalog-publication.md)列出静态检查与待执行用例。
用户要求不运行测试，不能将已编译的用例记为 RED/GREEN 或验收通过。
30K 冷/热启动、磁盘满、断电/强杀、双窗口和真实 Windows 仍需运行回归及性能验证。
现有数 GB 遗留 WAL 的第一次 SQLite 打开/恢复仍可能耗时；本决策不能声称历史脏缓存
在旧初始化超时内必然恢复，也不自动删除正在使用的遗留 WAL。

## 2026-11-01 冷构建性能候选

SDK 分支的发行门禁暴露原生455文件 debug 冷启动回归，详见
[验证记录](../tdd/sdk-release-gates-20261101.md)。新建私有库采用16KiB页（32KiB候选未取得稳定CI改善，已撤回），
连接使用64MiB建议页缓存目标，并按文档URI主键顺序写入；普通打开/增量连接
不改变缓存设置。页大小是SQLite原生文件参数，不迁移表结构或启用实验布局。
force构建跳过不会使用的复用指纹，发布前源码SHA256校验仍保留。
引用identity保留256行批量SQL，绑定不可变文档的借用值，减少重复字符串分配；
公开激活分配契约从每identity最多3次收紧为1次，实测4290→477次。
NORMAL、自动checkpoint、每批PASSIVE及最终FULL/TRUNCATE保持原决策。

该候选已通过Rust workspace221项（1项原有ignored性能门禁另行显式执行），
本地严格3秒门禁仍为RED；不据此宣布性能验收完成。原实施阶段未运行测试的
历史记录继续保留。真实30K、磁盘满、断电/强杀、双窗口及Windows压力验证
仍未毕业；64MiB是缓存建议值，不是总RSS或物理WAL硬上限。

源码发布校验在原64文件边界内复用4个解析worker的并发预算，scoped线程全部
join后返回；任何读取失败或panic仍拒绝发布，长度/mtime/SHA256完整保留。
同长度同mtime字节替换的公开协议用例保护这一约束。UTF-16位置换算对ASCII
前缀直接使用字节长度，非ASCII仍走原换算。三对同机固定二进制对照均保留
455文件、225630行与四个确定性查询，并显示校验阶段缩短；不据此宣称本地
3秒门禁、30K、总内存或跨平台性能毕业。

## 2026-11-02 catalog-open corrective evidence — integrated, joint gates pending

The [continuous review](../reports/2026-11-02-continuous-ide-review.md) confirms
existing missing/truncated legacy data and malformed control could be silently
reinitialized, including rollback to surviving legacygen1 while namedgen2 exists.
Observed empty/rolled-back results were STALE, not falsely READY. Absent-control
bootstrap/import remains; existing control/data open without CREATE and reject
missing schema/row/empty data. Bootstrap connection handoff preserves original
WAL close behavior; its intermediate failed candidate is retained. No incremental
control-generation writes, globally immutable DB policy or automatic deletion.

Six reviewed files integrated02:05UTC with matching hashes. Final isolated Rust
workspace234PASS/0FAIL/1existingignored external455 fixture, strictClippy/release
and real release recovery smoke PASS;98/98 inputs match. Independent malformed-
control and12concurrentbootstrap probes pass. Original RED4/7 and stronger
controlRED7/9 remain. Joint integrated gates/fresh CI are pending; publishedb129
CI is separate. No status promotion, nativeWindows/UI or resource graduation.

## 2026-11-02 04:27 UTC local verification terminal

The [continuous candidate](../reports/2026-11-02-continuous-ide-review.md) is
implemented and locally verified: final42 complete Node files401/401 PASS,
zero fail/skip/cancel/todo, `pnpm check` exit0;1416/1416 source inputs and all
production runtime hashes match. Rust234PASS/0FAIL/1 original ignored external455
fixture, fmt/strictClippy/release and Node20 build passed on the same production
input. Only the six-file generation-fixture correction followed the failed
joint gate. Independent review found no new confirmed must-fix in scope.

Fresh complete candidate CI awaits publication. Original joint399/401 FAIL and
rerun400/401 FAIL are retained; the two historical timeouts remain unexplained,
non-reproduced observations, not fixed. Lost original fixture generation is not
reconstructed. No ADR approval change, whole-suite pass, UI/native-UNC/30K/
endurance qualification or general performance claim follows from local scope.

## 2026-11-02 合成30K归因与输入生命周期候选（局部集成PASS，完整CI待发布）

[本轮诊断报告](../reports/2026-11-02-dense-30k-catalog-diagnosis.md)区分旧Windows
巨事务与当前私有分批路径。当前Linux release合成30K/72MB、1050万occurrence
冷/复用/force均READY和exit0，四查询一致；耗时269.919/6.721/314.982s。
这不是用户现场日志、真实项目、Windows或语义30K验收；96–106s校验仍明显慢。
独立探针quick_check92.729s、FK14.651s、FTS0.605s、控制提交0.015s、
隐式返回尾部12.320s；不能把尾部都算作控制事务或未经验证的特定析构。

已集成的最小候选仅在写完后、校验前释放已不再借用的documents payload，独立源码证明
仍保留。三项完整校验、源码SHA256/mtime/长度、锁/代际fence、复用、FULL/TRUNCATE、
发布与取消契约不变。经公开Rust构建API的分配器观测RED→GREEN和配对性能观察不是完整验收。第二对候选quick_check
反而变慢，其总READY差额主要已有写完前的差异，不能全归因于其后的释放；
直接证据为生命周期/校验期保留RSS/发布后返回尾部，不承诺每次校验加速。
三对6/6均READY/exit0、计数/查询/源码哈希一致；中位READY253.891→231.497s、
写完至Complete104.798→72.353s、返回尾部6.889057→0.001744s均是观察值，
非随机顺序/页缓存控制实验。校验期保留RSS降低，峰值仍约300万KiB。
987/987冻结输入一致，局部集成exit0：Rust235PASS/0FAIL/1原有ignored外部455
fixture，fmt/strictClippy/release及pnpmcheck/build通过，7完整Node文件24/24、
零fail/skip/cancel；非完整check:fast，外部fixture留待CI显式执行。
新的完整CI待发布，不以原PR112绿CI覆盖本候选，不宣称跨平台收益。
原Proposed状态、历史NOT RUN/失败收据和Windows遗留WAL恢复风险保持原样。
