# IX-05：活动索引库自动GC与请求隔离

状态：实现中；9项Native定向回归通过，但完整回归发现IDX-V1-GC-002，当前224输入候选未验收。
后继：已实施[内容租约修复](2026-11-05-index-content-reuse-lease.md)，原恢复断言原样GREEN；
228输入冻结检查进行中。以下224/223失败及设计细化保留为历史证据，不能作后继全量通过。
parent `298d65f5d7f796c347fe8be5c739e428066489d8`，分支
`feat/index-versioned-maintenance-20261104`，工作树
`/private/tmp/arkts-index-versioned-maintenance-20261104`。未提交、部署或修改真实缓存。
证据根 `.bench/index-versioned-maintenance-20261104`，原始UTC时间11-04/本地11-05。
前片219输入结果见[私库重试报告](2026-11-05-private-index-draft-retry-and-reclamation.md)，不是本片候选成绩。

## 已接通的行为

仅协商`versioned-file-maintenance-v1`的Native workspace使用自动GC，默认Node/LSP尚未接线。
每workspace保留一个`arkts-index-collection`线程，线程内保留一个当前物理库的`CatalogCollector`。
不是Node Worker，不是额外原生索引进程；原有4槽parser和独立reader不归它管理。

首次成功发布或取得完整资格（含缓存No-op）后才启用GC；失败bootstrap不能对legacy库启动回收。
此后数据任务完成标记GC待办。调度器一次只派一个量子：owner检查最多64个，数据GC沿用最多4096逻辑项/
4MiB估计facts载荷；单个不可分割超大行的原例外不变。这不是物理I/O或RSS预算。
空闲时继续未完成扫描/清理；安静后每5秒探测，覆盖另一个owner在没有本地watch事件时关闭/异常退出。
5秒是后台巡检间隔，不是用户请求截止时间/性能门禁；未改产品V8、RSS、超时或文件规模策略。

每个数据输入在协调线程等待已派出的一个GC量子，之后独占应用层数据写入路径；
控制线程只发命令/接结果，不执行GC SQL。数据任务活动期间不再派GC；
新输入最多先经过当前量子，不要求先清空全部历史。任务完成又产生GC机会，避免持续输入饿死回收。
命令及结果通道容量各1，且同时只有一个在途GC命令；不积累一个事件对应一个线程/连接。
其他进程的写者仍由SQLite与既有publication/owner保护协调，并非全系统只有一条线程。

`maintenance_executor::launch/poll` → `Collection::before_input/poll/kick` →
`maintenance_collection::step` → `CatalogCollector::collect` → `VersionedFacts::collect_garbage`。
源码：`crates/index-sidecar/src/maintenance_collection.rs`、`maintenance_executor.rs`、`maintenance.rs`，
`crates/index-sqlite/src/catalog_collection.rs`及`versioned_gc.rs`。

GC不修改data head、不生成资格，不覆盖数据任务终态。物理库被peer替换时重开当前库，
报告仍保留实际处理的store身份；不迁移回旧producer。完整owner扫描后无工作才进入低频探测，
一次`work_items=0`不等于扫描完成：新增`owners_examined/owner_scan_wrapped`，有66个活动owner的公开回归证明。
安静时尝试PASSIVE checkpoint；读者钉页允许未完全checkpoint，不TRUNCATE/VACUUM、不删活动WAL。
checkpoint错误在`collection.last.checkpoint.error`单独保留，不反写成功data为失败。

## 新边界问题 IDX-V1-GC-001：等待回收时取消

初版`Barrier::wait`只等待GC结束，没有观察输入取消。真实NDJSON在受控GC gate前开始输入2并取消，
5秒诊断观察期限后仍是`phase=cancelling`、`terminal=null`；GC本身没收到取消，这符合独立取消域设计，
缺陷是尚未取得写入权的输入不能独立退出等待。证据`ix05-auto-gc-wait-cancel-red.log`。
这不证明现场SQL永久挂死：受控gate模拟未结束量子，正常GC可能最终完成，旧逻辑的取消仍会被它拖延。

修复使用同一个Condvar谓词，并按20ms观察已有输入取消原子标志，避免伪唤醒或取消遗漏；
20ms是等待线程检查间隔，不承诺调度/GC/SQL在20ms内完成，也不改变产品超时。
取消只结束输入的等待和公开终态，GC继续；后继输入仍先等待实际GC完成，不越过写入串行约束。
关闭先停新工作、标记输入取消、让GC等待点退出，再join实际线程；没有对用户线程强制kill。
回归故意不打开GC gate，确认查询/状态仍响应，shutdown正常结束。

## 故障与可观察性

`maintenance/status.collection`单独公开active、workerSpawns、collectorOpens、quanta、逻辑facts/version累计删除数、
pending/disabled/fatal、last结果及错误。数值未得到结果时保留null/未知，不能当作0。
GC出错可能已提交部分工作，错误明确保留`work may have committed`；不伪报零回收。
普通SQL错误暂停自动重试，后续新输入可给同一线程一次重试机会；同input不会热循环。
GC线程panic/断连为本workspace GC终态，不随新查询或mutation自动重启，公开fatal/disabled并记录stderr。
数据操作仍可正常完成；显式同进程initialize工作区可以创建新的GC生命周期，不要求重启客户端进程。

受控panic在成功打开物理collector后触发，清算该collector后才释放后继输入的屏障。
这证明故障隔离/无重启风暴与重初始化路径，不宣称复现用户现场OOM或真实编译器死循环。
`SidecarSession`当前会drain但不保留Native stderr；前端可见告警/新状态的严格消费仍是未完成Node接线范围，
不能把Native状态接口等同于Zed已展示告警。

## TDD与复现

Context7 resolve Rust standard library再次失败（transport HTTP，未得到library ID/query-docs），
回退核对官方[Condvar](https://doc.rust-lang.org/std/sync/struct.Condvar.html)、
[有界通道](https://doc.rust-lang.org/std/sync/mpsc/fn.sync_channel.html)、
[JoinHandle](https://doc.rust-lang.org/std/thread/struct.JoinHandle.html)。
在线文档是1.99.1，本机cargo/rustc1.95.0；这里只用早已稳定的API，并在本机实际编译，不冒称查到精确1.95文档。

| 证据 | 结果/证明范围 |
| --- | --- |
| `ix05-auto-gc-sweep-red.log` / `...sweep-green-fixed.log` | 缺进度字段RED；66 live owners时零删除但未扫描完，最终wrap，1项库回归通过 |
| `...native-runtime-red-fixed.log` / `...native-green.log` | 真实更新后没有自动collector的RED；后来无需手动GC/重启，旧版本实际不可再读 |
| `...native-boundaries.log` | 3项机制、5项原维护、1项reader退役回归通过；读者/关闭/活动借用边界 |
| `...fatal-red.log` / `...fatal-green.log` | 受控GC故障接口RED及4项回归GREEN，成功终态保持，3个新输入不重启GC，initialize恢复 |
| `...wait-cancel-red.log` / `...wait-cancel-green.log` | 实际等待取消缺陷RED；5项Native回归GREEN，取消不阻塞也不停止GC，后继输入正确 |
| `...pressure.log` | 连续7次源码更新使数据与GC均进展，1个collector；12000次引用大文件旧facts跨多个量子全删，2项通过 |
| `...bootstrap-red.log` / `...bootstrap-green.log` | 构建失败过早启用legacy GC的RED；坏UTF输入修复后才启用、完整缓存No-op重开仍启用，2项通过 |

表内省略的前缀均为`ix05-auto-gc-`；原始初次borrow-after-move编译失败和一次错误预期
`published-unqualified`的测试失败也保留，二者不是有效产品行为RED。
实际单文件协议终态是既有`data-updated`，没有为测试修改该合同。

```sh
cargo test --locked -p arkts-index-sqlite --test versioned_gc_sweep --test catalog_collection
cargo test --locked -p arkts-index-sidecar --test maintenance_collection --test maintenance_collection_pressure
```

本片是库/真实Native协议的短回归，不是LSP/UI或30K耐久；没有统计为2小时通过。
新增测试/脚本的诊断保护不是产品阈值；不剔除失败日志或放宽已有正确性断言。

## 冻结检查及尚未完成

`auto_gc_checks_v1.py`、`ix05-auto-gc-v1-frozen.json`和`ix05-auto-gc-v1-checks.jsonl`保留223输入的中间检查：
fmt/两套Clippy通过，Core/SQLite249通过（含原100K成本），Native在删除恢复断言失败后停止。
期间补bootstrap用例/修订后输入变化，收据明确`sourceUnchanged=false`，不能称完整冻结通过。
当前224输入快照`ix05-auto-gc-restore-frontier-inputs.json`；尚无最终同候选完整检查/release通过。

活动库自动GC代码已接通，但有下述未解决复用回退，不能启用到默认LSP或宣称验收完成。
published提交收据/ACK重放、墓碑、owner/稳定锁元数据仍保留，
部分初始化/schema迁移/ACK恢复及完整退役仍待完成。逻辑删除不保证DB文件/RSS立即下降，真实磁盘/内存峰值待规模验证。
默认Node/LSP仍legacy，原默认128 RED未关闭。下一片接严格协议消费者及URI/token/完整Q自动对账，
同时完成ReferenceIndexFreshness兼容与旧请求/final fence；最终pnpm、规模、30K2小时、Mac/Windows UI仍为必做项。
缓存性能其他TODO不扩张，没有发布或合并。

## IDX-V1-GC-002：自动GC缺少内容复用租约

完整Native回归`maintenance_changes_lifecycle::deletion_restore_creation_and_late_removed_hint_use_disk_authority_and_reuse_content`
要求删除后立即恢复原字节时解析/写入均0。v1实测writtenDocuments=1，原断言保持。
单独同候选命令再次失败（`ix05-auto-gc-restore-isolated-red.log`），不是仅凭混合构建推测产品缺陷：

```sh
cargo test --locked -p arkts-index-sidecar --test maintenance_changes_lifecycle deletion_restore_creation_and_late_removed_hint_use_disk_authority_and_reuse_content
```

`CatalogMaintenance`只为新写/查得的版本持任务pin；当前输入元数据读取刻意不pin所有N文件。
发布removed映射后旧facts不再被最新entry引用，任务owner结束；新接的自动GC因此按“没有使用权”回收旧facts。
但是Native此前依赖这些未被主动收集的旧sealed内容进行恢复复用，没有工作区级使用权表达这种缓存用途。
直接触发是自动GC开始执行，底层缺口是复用缓存所有权与GC资格合同尚未对齐，不是磁盘新鲜度或符号结果错误。

后续修复须增加明确的工作区内容复用租约，按URI保留有限近期sealed版本，并在新的版本/确认命名空间变化时
释放过旧引用；不永久pin全部历史，不按RSS或插入固定sleep逃避删除窗口，不削弱旧恢复断言。
候选方向是每个仍在工作集的URI保留当前及一步撤销/重做内容，已删除成员在完整权威对账后退役；
跨物理库/producer、异常任务和关闭必须结清。这是待实现/验证的设计，不冒充已完成决策或内存有界证明。
URI数量/删除成员治理、持续变更无完整对账时的保留边界必须与父端自动对账一起闭环。
新的GC定向测试还需覆盖“近期版本受保护、更老版本确实回收”，不能只为了通过GC用例回收所有热事实。
