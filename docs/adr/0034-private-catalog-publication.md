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
