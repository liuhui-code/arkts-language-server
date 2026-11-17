# IDX-V1-LIFETIME-001：并发使用记录导致合法索引打开/重建失败

状态：已定位、修复并通过当前Mac公开Rust/Native回归；混版/Windows未闭环，不是整体IDX-V1验收完成。
范围：R-13 / R-02生命周期前置问题；仅本地记录，不创建远端issue。
[ADR0043](../adr/0043-versioned-file-index-maintenance.md)、[ADR0028](../adr/0028-index-cache-lifecycle.md)、
[执行记录](../tdd/2026-11-04-versioned-index-maintenance.md)。

## 现场与影响

固定parent为298d65f5d7f796c347fe8be5c739e428066489d8；所有实现位于隔离worktree
`/private/tmp/arkts-index-versioned-maintenance-20261104`，不是原dirty工作树或日常部署。
Mac / Rust1.95.0；SDK、Node、Zed、Windows均未用于本次诊断。
证据根：`.bench/index-versioned-maintenance-20261104`。

执行器职责提取前4份完整Native文件18PASS；提取后的执行中，受控consumer unwind本应返回unknown，
下一有效输入应在同一会话qualified，却收到maintenance_failed / unsafe-metadata-target。
这是第二次构建的实际失败，不是预期的首次故障注入，也不是Worker OOM或新旧世代结论。
单独重复原用例通过，不能把一次重复通过当作排除问题。

公开CacheLease最小复现不需要30K或任何源码/Program：1个受管工作区、8个并发记录写者。
旧4,096次显式record_use有1,120次错误（另有初始化/Drop记录）；例子含unsafe-metadata-target、
ENOENT、EEXIST。说明文件规模不是必要触发条件；更多并发打开、退役和重试可能增加触发机会，未量化其相关性。

## 调用链和失效机制

Native：maintenance/start → Maintenance::launch（现位于maintenance_executor.rs）
→ maintenance_engine::run → CatalogStore::open_for_maintenance / Backend::open
→ 旧格式分支open_published / SqliteStore::open_existing
→ store_open::open_with_page_size → CacheLease::record_use → files::write_json。
CacheLease::Drop也写同一路径；catalog_files::retire的后台关闭可与后继构建重叠。
前者显式record_use错误会传播StoreError::Io并形成失败终态，Drop错误则写stderr。
初次Native失败没有逐连接/目标inode日志；上链依据唯一错误产生/传播代码和独立复现，不伪造原失败的逐函数耗时或inode。

两项独立缺陷：

1. **临时文件命名/归属。** 旧名只有PID与SystemTime.as_nanos；时间单位是纳秒不代表每次调用唯一。
   诊断266次尝试仅264个名称，2组跨线程重复。create_new失败后旧代码仍无条件remove_file，
   可清理竞争者的临时文件；成功rename后也不应再次清理已失去归属的路径。
2. **目标校验与并发替换。** 多个合法写者并发rename同一cache-use.json。
   诊断实际捕获is_file=true、symlink=false、nlink=0：stat查到的旧inode已被另一写者替换/摘链，
   被硬链接防护nlink!=1拒绝。安全检查本身不能简单删除或允许nlink=0来规避。

只修唯一临时名/归属后，256次显式写仍有58次失败，样本均为unsafe-metadata-target；
因此不是把所有错误统一归因于单一计时或解析故障。
`ix05-cache-use-causal-proof.json`含重复名/线程、真实nlink快照，并证明两份旧代码与298d及之前209输入候选相同；
问题早于本轮执行器提取，提取/调度时序变化暴露了它，不能称为提取引入或纯测试噪声。

## 正式修复与安全边界

- write_json增加检查溢出的进程内原子序号；PID/时间戳之外再保证进程内名称不复用。
- create_new失败直接返回，不取得清理权。失败清理前确认临时文件对象身份、普通文件及安全metadata；
  成功rename不再清理旧临时路径。无法证明归属的残留保留，不扩大删除权限。
- CacheLease使用稳定的`.leases/<workspace-key>.use.lock`，仅串行该工作区的使用记录替换，跨线程/进程。
  持有原共享使用权期间另取记录独占锁，不尝试升级已有使用锁；记录锁释放后才释放使用权。
  不同工作区独立，GC现有namespace/usage锁仍是删除活动性的依据；记录锁不替代它。
- 所有原文件身份/硬链接/symlink/reparse检查、sync_all、原子rename以及错误报告保留。
  没有降低断言、吞错、扩大超时、改RSS或源规模阈值。

这是每工作区一个稳定空锁文件，不为每条事件新建目录/锁；本轮不删除稳定锁inode，也不清理真实cache。
使用记录只是LRU观察，不是当前源码、Program或完整资格证明；本修复不改变该合同。
仅用进程内mutex无法协调其他进程；锁住cache-use.json本身又会在rename后更换对象；
升级现有共享usage锁会受其他活跃连接阻挡。故选择单独稳定记录锁，避免全cache粗锁影响无关项目。
单纯增加随机/时间位数只处理名称，不解决已实测的目标校验竞态；忽略安全检查不作为备选。

## 验证与反例

| 场景 | 证据/结果 |
| --- | --- |
| 原失败与偶发性 | ix02-auto-executor-after.log FAIL；unwind-repeat1.log PASS，均保留 |
| 旧并发4,096次 | ix05-cache-use-concurrency-red.log，1,120错误/75.52s |
| 独立诊断 | ix05-cache-use-diagnostic.log，266尝试/264名称、nlink0；插桩改变时序，不与普通计时混算 |
| 仅临时名修订 | ix05-cache-use-unique-temp-still-red.log，256次仍58失败 |
| 完整修订4,096次 | ix05-cache-use-4096-fixed.log，显式调用零错误/83.27s；一次功能对照，不声称吞吐改善或分位数 |
| 库端口回归 | cache_use_concurrency.rs：4项父级功能用例及1个子进程入口；含两独立进程、持锁者被kill后恢复、跨工作区不阻塞、unsafe目标/锁拒绝且不改外部文件 |
| 实际Native恢复 | maintenance_cache_use.rs：先启动另一进程4线程的同记录写负载，再执行受控unwind/下一输入恢复；未逐时刻采样各写线程是否始终活跃，8项正确结果及相同资格；Native维护协调任务2、纯Rust parser线程4，无额外维护重建；不是语义Worker世代证明 |
| 既有Native行为 | ix02-auto-executor-repaired.log，原4份完整文件18PASS |

最终完整检查按新源码重新冻结，命令/产物身份/结果见`ix05-cache-use-v1-final-*`和最终receipt，
不拿之前collector-v1的通过冒充修改后全通过。完整检查未结束时仍标RUNNING。

## 官方机制、兼容和剩余工作

Context7 resolve-library-id再次transport失败，未取得query-docs。回退核对Rust官方
[File锁/create_new](https://doc.rust-lang.org/std/fs/struct.File.html)、
[rename](https://doc.rust-lang.org/std/fs/fn.rename.html)、
[SystemTime](https://doc.rust-lang.org/std/time/struct.SystemTime.html)。
官方在线页此次标1.99.1；1.95版本URL工具不可访问且本机无rust-docs/rust-src，
不能声称已读取精确1.95文档。实际1.95 Mac行为由上述公开回归确认，Windows锁/占用仍须真机验收。
文档支持OS锁、原子排他创建及时间精度的机制；具体锁粒度、对象清理和安全合同是本项目责任。

旧二进制不使用新记录锁，不能声称已强制串行所有历史版本；历史包混跑的元数据竞争尚未专项实测。
新物理索引的producer接管防护保留，但不等于已实现全局release激活/旧进程治理。
错误/不可验证的metadata仍明确失败，未降低身份校验来兼容旧包。

自动对账接线应由持有native input issuer的既有父端workspace调度器统一发起：
workspaceFilesChanged → scheduleCatalog → runCatalog，Native负责验证/单writer执行，
不能再起一套自行制造输入/同token无界重试的循环。本轮尚未完成该接线。
Native自动GC、可复用私库草稿、元数据/锁保留、partial/ACK/schema迁移仍未完成；
默认TS/LSP、pnpm最终检查、规模与原30K2h、真实UI/Windows不因本项通过改变未验收状态。


## 最终候选收据

`ix05-cache-use-v2-receipt.json`：212输入不变，Core/SQLite241、相关Native125、experimental存储74/Native61全通过；
fmt、两配置严格Clippy、两配置release均exit0。v1 Clippy测试borrow失败保留，v2修正后重新跑完整相同范围。
当前归档release37da2d3d/f236b3a1；小夹具双版本迁移再次通过，原始协议/产物哈希见TDD。
这不是pnpm全量、UI、Windows、30K或完整自动维护验收。没有提交/部署/合并。
