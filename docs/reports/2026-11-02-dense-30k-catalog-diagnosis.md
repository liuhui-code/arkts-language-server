# 30K 初始化：历史巨事务、当前校验成本与输入提前释放候选

日期：2026-11-02。**三对插桩对照终核；最小候选已集成，局部集成门禁PASS，新的完整CI待发布。**
本轮用户未提供真实日志；按其要求从 ADR 历史追溯，再用隔离 Linux 合成负载诊断。
不能把本轮结果当作用户现场根因或 Windows/Zed 修复验收。

## 结论与范围

历史 99% 长时间停留有真实证据，但当前实现已采用
[ADR0034 私有分批构建与原子发布](../adr/0034-private-catalog-publication.md)，
不应继续把所有剩余等待称为原来的单次大型事务。当前合成 30K 冷/强制构建
均完成；仍需数分钟，主要长区间包括发布前校验和可变的发布后返回尾部。
独立计时探针定位到 quick_check、其次 foreign_key_check；一次控制库提交仅约15ms。
候选仅提前释放已写完的 documents payload，不删除或抽样校验、不延长超时、
不提前报告 READY、不改变来源证明、锁、复用或持久化策略。

## 1. 历史事实，不覆盖旧失败

[2026-10-29 Windows 真实 Zed 报告](2026-10-29-windows-zed-30k-init99.md)
记录旧版 `9d47e550` 的冷启动225.761s和补充重开577.723s；
协议99%分别持续218.302s和569.607s。旧全量替换含引用写入、重建索引和单次提交；
commit分别115.147s/268.181s，内部 checkpoint/fsync 比例没有测量。
另一次非正常结束后重开30.061s进入degraded，遗留约5.2GB WAL；
原退出码/调用栈缺失，不能升级成已证明OOM或主动终止。
这些是真实历史现场，不是本轮用户提供的新日志，亦不与新版 Linux 数据混算。

## 2. 当前生产二进制：Linux 合成 30K

父版本 `f451d1bf253cc2804afcdaff331f5ace6ea36741`；release native SHA256
`48d050f610fa91c233f6635036973721643c34a175d3f47fe2aed0ee6dbe71e0`。
独立 native NDJSON 公共协议，不是 LSP、真实 Zed/UI、Windows 或编译器语义验收。
30,000源码/72,000,000字节；10,500,000 occurrence、3,000,000 identity、
30,000 alias、240,000 binding；词法密度接近旧负载但不是原184MB项目副本。
同机单负载逐次运行，冷仅指无持久化索引，不清OS页缓存；观测开销未测。

| 指标 | Cold | Reuse | Force |
| --- | ---: | ---: | ---: |
| 观察器开始至READY，s | 269.919 | 6.721 | 314.982 |
| validating观察区间，s | 106.386 | — | 96.367 |
| 已提交批次 | 667 | 0 | 667 |
| 采样峰值RSS，KiB | 3,021,416 | 2,947,364 | 3,016,196 |
| 采样最大单WAL，bytes | 16,654,152 | 16,440 | 16,670,560 |

三场均公共shutdown后exit0、源码哈希不变、全部表计数一致，四个完整词法查询
在移除servedGeneration后相等；generation依次1/2/3。复用保留物理库但仍扫描/解析，
其瞬态RSS并不低。Force最大批次8.656s/checkpoint3.914s的异常长样本保留。
采样峰值不是硬上限；每模式一场不是分布或平台倍率。
校验期间status/search仍响应并读取旧的完整代际，不暴露新库中间结果。
该证据支持“仍慢但此次不是已证明死锁”，不证明所有30K项目可用。

## 3. 独立插桩归因，不能混入生产计时

探针SHA256 `aaa6c684e5cb0ee26717f5c7db88daeccbef8129b94b0028a683edcd71bd2734`；
同输入force构建，READY280.141s、正常exit0、四查询与表计数相等。
shared-monotonic边界：quick_check92.729s、FK14.651s、FTS0.605s、
control commit0.015s、build返回边界到worker接收返回12.320s。
最后区间包含隐式析构/调度，不能未经反证全部归为单一对象。

严格内窗口的进程级计数显示：quick_check约90.986s窗口内CPU32.10s、
read_bytes增加6,508,527,616；返回尾部约12.060s内CPU12.30s、读仅4,096字节，
RSS下降。前者不符合“92s全部单核用户计算”，后者支持CPU密集释放工作假设。
没有iowait/off-CPU栈/设备延迟/PSI/reclaim证据，不能断言I/O等待或内存压力因果。
校验期可用内存仍超过5.2GiB，未触发保护；MemAvailable也不是缓存命中率。

## 4. 候选：写入结束后释放 documents

`write_documents`成功后、`Validating`事件和三项校验之前执行
`drop(std::mem::take(&mut batch.documents))`。独立source witnesses继续用于
发布前源码长度/mtime/SHA256校验，rejected URIs等其余状态保留。
保持 quick_check、foreign_key_check、FTS外部内容检查、最终FULL/TRUNCATE、
控制库发布事务、输入/代际fence、取消和reader/publication lease，以及既有复用路径。
不引入不安全的异步析构，也不把释放移出完成条件。

经公开Rust构建API的分配器观测测试观测实际拥有的字符串和Vec缓冲区释放，包含取消/发布对照。
已报告的RED→GREEN、focused8/8、fmt/release和独立review属于隔离候选，
主任务已集成两行产品改动及157行测试。集成门禁实际exit0，987/987冻结输入一致：
Rust workspace/all-targets 235 PASS/0 FAIL/1原有ignored外部455 fixture；
fmt、strict Clippy、release、pnpm check/build通过，7个完整相关Node文件24/24 PASS，
零fail/skip/cancel。ignored的外部455 fixture留待CI显式执行，不记作本地通过。
**这是局部集成PASS，不是完整check:fast；新的完整CI待发布。**
生产未插桩release SHA256 `508a7b9b7ed14c15d159af5093ee26214e765c5a2fa549940af28c90e30a1b7f`，
与隔离候选一致，区别于用于三对性能归因的插桩二进制。

复现入口（仓库根，Node20.19.5/Rust1.95.0，依赖已准备）：

```sh
cargo test --offline -p arkts-index-sqlite --test catalog_input_lifetime
cargo fmt --all -- --check
cargo test --offline --workspace --all-targets
cargo clippy --offline --workspace --all-targets -- -D warnings
cargo build --offline --release -p arkts-index-sidecar
pnpm check && pnpm build
node --test --test-concurrency=1 \
  tests/index-catalog-adapter.test.mjs \
  tests/lsp-production-index.test.mjs \
  tests/lsp-workspace-symbol.test.mjs \
  tests/semantic/catalog-storage-progress.test.mjs \
  tests/semantic/index-catalog-phase-trace.test.mjs \
  tests/semantic/references-initial-catalog.test.mjs \
  tests/index-search-protocol-lifecycle.test.mjs
```

上述是对应范围的复现命令，不将聚合校验或单独focused次数相加成新的测试总数。

### 三对完整对照：分开前置差异和释放后的区间

A为诊断探针控制，B为提前释放候选探针；这些是插桩实验，不混入生产基线。
6/6场READY、公共shutdown后exit0，八表计数一致、四个查询去除servedGeneration后
与原cold结果相等，源码哈希不变。单负载逐场运行，无保护停止、无丢弃失败场次。
全部场次沿同一物理缓存谱系force:true，不手动删除缓存、不清OS页缓存、无额外钉住reader。

| 场次 | READY s | pre-drop s | 写完→Complete s | drop s | quick_check s | FK s | FTS s | 返回尾部 s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A1 | 280.141 | 149.604 | 126.141 | — | 92.729 | 14.651 | 0.605 | 12.320447 |
| B1 | 231.497 | 154.505 | 67.624 | 1.738 | 59.650 | 5.345 | 0.344 | 0.001486 |
| A2 | 250.494 | 149.292 | 97.172 | — | 78.647 | 7.294 | 0.322 | 5.094919 |
| B2 | 227.589 | 130.459 | 93.390 | 3.928 | 82.951 | 5.430 | 0.310 | 0.001834 |
| A3 | 253.891 | 141.031 | 104.798 | — | 81.709 | 10.629 | 0.333 | 6.889057 |
| B3 | 231.807 | 155.198 | 72.353 | 5.108 | 61.637 | 4.760 | 0.279 | 0.001744 |
| A中位数 n=3 | 253.891 | 149.292 | 104.798 | — | 81.709 | 10.629 | 0.333 | 6.889057 |
| B中位数 n=3 | 231.497 | 154.505 | 72.353 | 3.928 | 61.637 | 5.345 | 0.310 | 0.001744 |

pre-drop body截止改动执行之前；写完→Complete包括B的显式drop及全部未变校验、
源码检查、发布和清理，二者用同一探针单调时钟。READY从观察器进程启动计，
不强行拼成精确等式。中位数逐指标独立计算，不能把中位数列相加重建某一场。

首对候选pre-drop反而慢4.901s，写完至Complete少58.516s；第二对候选
pre-drop已经早18.832s，而写完至Complete仅少3.782s。第二对READY总计少
22.905s，不能把其中前置差异归因于其后才发生的drop，且quick_check反而慢4.304s。
第三对候选pre-drop慢14.167s、写完至Complete少32.445s。
因此不能声称“提前释放每次都会加速校验”，也不能把总耗时差额全算作释放收益。
固定A→B顺序不是随机/平衡顺序；页缓存、调度、启动/解析、写入/checkpoint波动未隔离。
三对总READY是观察值，不外推稳定因果、Windows或全局改善百分比。

| 场次 | quick_check内窗口RSS KiB min–max | 内窗口read_bytes | 内窗口CPU s | 全程采样峰值RSS KiB |
| --- | ---: | ---: | ---: | ---: |
| A1 | 3,016,028–3,016,028 | 6,508,527,616 | 32.10 | 3,016,028 |
| B1 | 1,666,836–1,666,836 | 5,395,189,760 | 17.76 | 3,015,228 |
| A2 | 3,015,864–3,015,864 | 6,506,897,408 | 22.96 | 3,015,864 |
| B2 | 1,671,140–1,671,140 | 5,394,128,896 | 31.82 | 3,015,164 |
| A3 | 3,015,272–3,016,124 | 6,593,871,872 | 27.52 | 3,016,124 |
| B3 | 1,925,812–1,925,812 | 5,509,918,720 | 19.95 | 3,015,188 |

直接证据聚焦实际payload生命周期、三对更低的校验期保留RSS和更短的发布后返回尾部。
**全程采样峰值仍约300万KiB，没有实质峰值改善**：释放发生在解析/写入累积之后。
候选显式drop为1.738/3.928/5.108s，释放成本没有消失；原返回尾部包括隐式函数清理，
不能将每毫秒都算作已直接测到的documents析构。资源约1s采样，严格内窗口不含边界，
read_bytes不是设备延迟，没有off-CPU/PSI/cache-hit计数来证明内存压力因果。

A二进制SHA256为前述`aaa6c684…`；B为
`3ca789055608c0474095619889b580ba70db63dd40122ab0fde933876470e32d`。
输入concat SHA256为`0289e71a677dccb3faf80f69a6bda6f4f82e555a93ce7ad98498de58fa6dbee0`。

## 5. 未闭环与验收边界

- 三对插桩终核完成，不能代替最终集成产物的回归或新的完整CI。
- 局部集成门禁PASS，新的完整CI待发布；既有PR112绿CI只覆盖其原revision。
- 当前Windows、真实30K项目和真实客户端未复跑，旧脏缓存/WAL初次恢复未解决。
- 磁盘满、强杀、双窗口、Windows句柄和长期资源行为不由本合成实验毕业。
- 保留ADR0034的Proposed及历史实施NOT RUN；不自动合并或改变超时/正确性门槛。

## 证据索引（维护者本地，不冒充仓库链接）

`/workspace/scratch/dcdb41e16594/dense-catalog-20261102/`：
`REPORT.md`、`PROBE-REPORT.md`、`RESOURCE-ATTRIBUTION.md`、
`THREE-PAIR-REPORT.md`、`full30000/three-pair-comparison.json`及各自引用原始收据。
`/workspace/scratch/dcdb41e16594/iteration-evidence/30k-early-release/`：
`candidate.patch`、RED/GREEN日志、构建日志及独立候选二进制。
`integrated/validation.log`、`integrated/final-monitor-receipt.json`、
`integrated/exit.json`及`integrated/inputs-verified.json`保存局部集成终态。

SQLite参考：[quick_check](https://www.sqlite.org/pragma.html#pragma_quick_check)
为O(N)，不会代替所有FK/FTS外部内容检查；
[WAL](https://www.sqlite.org/wal.html)与
[checkpoint](https://www.sqlite.org/c3ref/wal_checkpoint_v2.html)解释生命周期/模式边界；
[FTS integrity-check](https://www.sqlite.org/fts5.html#the_integrity_check_command)
说明外部内容校验。上述参考不证明本机所有耗时的唯一原因。
