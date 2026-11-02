# 有界 catalog / hash-first 实现与 TDD 整合记录

2026-11-02；[ADR0042](../adr/0042-bounded-catalog-streaming.md)仍 **Proposed**。
[执行清单](../plans/2026-11-02-streaming-catalog-execution.md)与既有
[Feature Ledger](../plans/references-feature-ledger.md)同步，不另建ledger。

## 当前结论与未完成项

M1 force有界payload流水线、M3默认cold单parse流写/完整键hash-first热命中已实现，
独立Rust功能回归和release小夹具通过；累计候选已静态整合到主仓e69c7eb，
124个native/Cargo输入与冻结candidate逐项匹配。**最终主仓native259PASS/1FAIL/1原ignored，成本门禁失败保留；诊断已收口，允许draft发布接受fresh完整CI。**
Node scoped14文件38/38通过，但完整check:fast/目标HEAD CI尚未跑，不能称整合全绿。
本报告不是发布、Accepted、Windows/UI毕业或M4完成声明。

M1单对Linux合成30K/1050万occurrence：全进程采样最大RSS3,015,224→104,096KiB（约102MiB），
但READY293.040→327.349s慢34.31s。观察支持消除全项目payload累计，不证明总RSS硬界，
不称整体提速。M3的512资格10runs已通过，但miss单次1.958→7.778s更慢且未归因。
M3的30K cold/hot四runs全部终态通过（下表），30K miss/force未跑；不能称M3修复上述回归。
首次M3全量Rust中既有cache_gc断言protected≠observing失败原因未知；单独和全量重跑通过，
没有GC代码修复，不隐藏首次失败。真实项目、Windows、UI和全故障矩阵未验收。

## 最终主仓门禁：失败保留，诊断收口后仅允许draft发布

仓库外收据`iteration-evidence/streaming-catalog/main-integration-gates/`，
`COMMANDS.md`、`node-files.txt`和`RESULT.md`记录精确命令/范围。

- Node20.19.5/pnpm8.15.9 check/build exit0；14完整文件38PASS，fail/skip/cancel/todo均0，60.877s。
- `cargo test --offline --workspace --no-fail-fast`：259PASS/1FAIL/1原ignored，exit101，
  51harness含doc-tests，覆盖最终hotcancel。失败child输出在Cargo日志中重复，不重复计数。
- 失败为`catalog_replacement_allocations.rs::large_catalog_replacement_does_not_spend_more_on_removal_than_fresh_activation`：
  cold total32679.111ms，warm deleteDocuments113042.933ms，违反removal≤cold；child耗时218.15s。
  `native-workspace.log`完整保留，未重跑/调阈值/称flaky；与512miss慢无同根因证据。
  这是新的最终门禁失败，不能拿之前独立candidate通过或30K通过覆盖。
  只读定位确认走旧activate_catalog→replace_all→clear_documents，不走M3；相关实现/test/settings相对e69无diff。
  这不解释本次时延，也不证明512miss原因；已执行唯一一次持久child诊断并通过，详见下节；原全量失败不覆盖。
- fmt/strictClippy exit0。1447源/config/fixture输入与84runtime/artifact pins末次全一致。
  890862冻结release通过ENV及主target/release精确绑定；scripted sidecar仍按测试指定，不能冒充真实native。
- 首次pnpm遗漏COREPACK_HOME的环境错误发生在tsc前，另存；不计产品RED。
  原candidate cache_gc未知失败仍保留，本轮GC通过也不构成修复解释。
- 固定诊断范围已收口，不再本地重跑或扩大架构；允许draft发布接受fresh完整CI，不称ready-to-merge/全绿。
  完整本地check:fast因既往约70分钟重复成本未跑，后续目标HEAD完整CI仍必要，不能标全门禁通过。

## 唯一一次100K child诊断终态

原full失败后，按预定范围直接运行现有精确test binary的child分支，不重编译，不父套child，
不改源码/阈值/SQLite配置。`--exact ... --nocapture --test-threads=1`，独立持久COST_TEST_DB与SQL trace。
证据`main-integration-gates/cost-child-once/`保存identity/stdout/stderr/两代SQL/resource/exit/summary及数据库。
二进制前后SHA：`82a3d949b2b7d8be5d91a3a26d119b7e6203cfc771b40406d11fb7a87362a9d1`。

唯一此次PASS/exit0，进程109.965s；cold total48485.075ms、warm total39713.420ms、
warm deleteDocuments7660.407ms，满足原阈值。固定一次后停止，原full32679.111/113042.933ms失败仍保留。
109个约1s样本，最大间隔1.259s；观测窗口user/sys CPU92.38/15.34s，major faults0，
全child采样最大RSS529252KiB。三个/proc/pressure路径均不存在，109次/项错误完整保留，无升级权限；
有loadavg/diskstats并不等于得到因果归因。不能用本次正常样本解释原失败，亦无512miss同根因证据。
1447源及84runtime/artifact pins诊断后仍全部匹配；仅工具夹具生命周期RED→GREEN，不是产品修复。

本轮诊断收口，允许draft发布以取得目标HEAD完整CI；不是消除原失败、正式性能验收或ready-to-merge。

## 实现边界

- Writer公开懒事件API：Document、Rejected、Complete，显式Result错误；严格URI顺序，
  Complete后必须正常EOF。裸EOF/producer错误/panic/尾随事件均不能发布半库。
  每次poll前检查取消，含Complete后的EOF探测；正常旧FullCatalog API继续适配。
- 4persistent parser单项交付槽按URI pull，无worker内64文档chunk或无界reorder。
  Writer继续64docs/32768估算行/8MiB，超大文档4096元素/4MiB，消费后drop再拉取。
  账本含writer、lookahead、超大分块临时复制和最多4个源码/解析中/完成未交付单项。
  完整parser输出不可预知膨胀，因此不是精确字节credit/总heap/RSS硬cap。
  URI/SourceStamp/reject等紧凑metadata允许O(N)，allocator/SQLite和原progress队列另计。
- Cancel/error先断全部job/result端点再join所有worker；终态在join后。
  所有结果消费且worker join后进入Activating，发布仍须Complete+EOF；提前写只增加storage子进度。
  Writing相同状态250ms合并。
  原progress mpsc仍无界，不能声称慢stdout下全系统有界。
- `CatalogBuildSession`先固定parent、expected generation和旧代lease，命中不调用payload factory，
  不分配新private DB；miss共用原写入/校验/封存/Checking/短原子publish路径。
  保留NORMAL、PASSIVE、final FULL/TRUNCATE、quick_check/FK/FTS与最终length/mtime/SHA。
  错误/取消/竞争不清现用库，旧reader lease和会话存储根不变。
- 新格式`arkts-complete-scan-v2:<producer64hex>:<sources64hex>`表示完整scan资格；
  producer包括二进制/schema，sources按URI排序含源码digest。旧opaque写入隔离到
  `arkts-legacy-fingerprint-v2:`，普通历史raw仍兼容；reserved域不能被旧adapter误识别。
  typed输入是调用者声明，不是防恶意Rust调用的安全边界，无schema迁移。
- Nonforce无合格候选时轻量manifest→实际read/parse一次→流写，最终记录实际读入digest。
  有候选时bounded读取/UTF-8/准入/hash，无parser；匹配则0parser/0parserworker、同physical小事务。
  Miss二读length/mtime/SHA必须与首遍吻合，再parse一次；失败整次不发布，不混合版本。
- 正常ignore/不支持扩展/symlink/policy超限保留准入定义；ignore规则、目录、entry、file-type、
  metadata/read/UTF-8实际错误显式禁用资格，不从聚合rejected计数猜扫描是否完整。
  Parse拒绝保留原partial语义，但不持久化可复用key。Root目录失败保留旧代。
- 未实施文件级payload缓存、变更集增量、shard、默认RSS阈值或新retry。

## TDD与回归（作用域不可相加）

父基线`5e9ecf0b7b2bd72f6853649fb7c8ec92c8b7a060`；Rust1.95，offline。
以下路径是维护者保存的仓库外证据标识，不是仓库内可点击附件：
`iteration-evidence/streaming-catalog/implementation/`（M1），
`iteration-evidence/streaming-catalog/hash-first/`（M3）。

| 切片 | 实际RED | GREEN与强化 |
| --- | --- | --- |
| 懒writer | `red.log`旧eager公开adapter首次写chunk仍持有旧payload | lifecycle/release-before-next-pull、Complete/error/ordering/cancel/panic |
| EOF取消gap | `complete-cancel-red.log`Complete设cancel后仍多poll | EOF探测前observer检查，正常EOF/尾随检测仍有效 |
| forceproducer | `slice2-red.log`首次private commit已parse全部130源 | 首次写indexed<130且discovering；慢首项4槽、慢writer64+4、canceljoin、旧代查询 |
| progress | `slice2-progress-red.log`154updates暴露逐poll放大 | 复用250ms合并，无丢终态 |
| 固定parent/lazyfactory | `m3-1-red.log`旧API factory调用1而期望0 | 同physical命中、parentrace hit/miss、factory/finalizer error/panic、legacy隔离 |
| cold/hash-first | `m3-2-red.log`cold未生成complete-scan资格 | cold8parse/0hashread；hot0parse/0worker、同physical、无bulk阶段 |

其他强化：membership新增/删除/改名miss各parse一次；正常exclude/policyskip可热复用；
坏ignore与非法UTF-8禁止复用且恢复走cold。7类scanner真实错误分支通过debug I/O注入覆盖。
Late源在private commits后同length/mtime换字节、删除、增长超限，二读失败join4worker，旧代/查询/key不变。
Hot最终SHA改变拒绝发布，hot activation门取消无parserworker、旧代保留。
4×20K occurrence + near2MiB源在cold/hot/force间9张表全值/ordinal/identity一致，3类公开查询一致。
parser/read计数和panic/I/O注入最初缺失的RED属于测试工具，不伪装产品缺陷；夹具/环境错误独立保留。

各切片独立candidate命令（最终主仓执行结果见前述门禁节）：

```sh
cargo test --offline -p arkts-index-sqlite --test catalog_stream_contract --test catalog_stream_lifetime
cargo test --offline -p arkts-index-sqlite --test catalog_lazy_factory --test catalog_session_contract
cargo test --offline -p arkts-index-sidecar --test catalog_hash_first --test catalog_hash_qualification --test catalog_hash_fences --test catalog_scan_errors
cargo test --offline --workspace --no-fail-fast
cargo test --offline -p arkts-index-sidecar --test catalog_hash_fences --test catalog_stream_equivalence
cargo fmt --all -- --check
cargo clippy --offline --workspace --all-targets -- -D warnings
cargo build --offline --release -p arkts-index-sidecar
```

- M1 fullRust245PASS/0FAIL/1原ignored；M3-1 full252PASS/0FAIL/1原ignored。
- M3-2首次full在cache_gc既有用例失败（`m3-2-workspace.log/.exit`）；
  单独复跑PASS；no-fail-fast全量259PASS/0FAIL/1原ignored，exit0（51harness含doc-tests）。
- 上述全量编译后追加hot取消characterization；最终focused4PASS覆盖该新例及dense oracle，
  不把重复测试相加，也不声称全量跑过260例。
- 最终fmt/strictClippy/release PASS。真实release130源defaultcold→hot烟测exit0：
  cold首写discovering/indexed64/generation0，23progress events；hot同physical/key，
  仅reusing/checking/publishing、查询generation2。故意设置debug暂停/panic/I/O错误env均inert。
- 原ignored外部455fixture不计PASS；Node、真实项目/Windows/UI不在这些收据中。
- 独立只读review两片终核无must-fix；已修Complete EOF取消gap，保留review过程记录。

## 冻结与整合身份

主仓基点`e69c7ebfbcbf0a6f015b837559b39201f7fdfd65`，native与5e9基线diff为空。
累计patch先`git apply --check`后应用；124项`m3-2-inputs.sha256`在主仓全部OK。
候选路径`iteration-evidence/streaming-catalog/hash-first/candidate`；
`FROZEN-FILES.txt/.sha256`列出patch、报告、pins、二进制和原始终态收据。

| Artifact | SHA256 |
| --- | --- |
| M1 combined.patch | `3695cde38e4ad2c2c4f5bb753e15de70a8e32feab33dde3d9a1d2527f4c93628` |
| M3-1 patch | `2f6ae42eb577e5316d9af9c79527bc07d6a4a923e933aeb832bcec5c03264d68` |
| M3-2 patch | `ec9587bb844acd4b2cb4f73228ad19db0cdff41c7ebb1c682f8abb7bda4cf2bf` |
| 累计m3-combined.patch | `087939c42854d2c5035329b227fdc124b3f096595fa37478ef9b477aa6790841` |
| M3 release bin/m3-2-sidecar | `8908620036d86c3628261501e53ef01d9c1c652237a48072ed0ce15c19b4427f` |

除既有sqlite lib.rs债务外，新/改文件均≤500行；lib.rs1647→1645的剩余债务明确保留，
catalog_build439→328；scanner按职责抽取后391，producer285，planner168。
M3删除原eager批parse/activation helper，未改原SQL核心写入/校验。

## M3 512资格运行更新（2026-11-02 16:26 UTC）

仓库外证据`dense-catalog-20261102/hash-first/calibration512/m3-512-{A,B}-{cold,hot,miss,miss-hot,force}/`。
各`streaming-check.json`记录8表/4query/sourcehash/READY/exit0；hot另`hot-check.json`
验证samephysical/key、阶段与noBulk。10runs均通过；不等于性能全部改善。

| 路径 | A508a秒 | B890862秒 |
| --- | ---: | ---: |
| cold | 2.754075 | 3.290478 |
| hot | 0.140240 | 0.054678 |
| miss | 1.957891 | 7.777866 |
| miss-hot | 0.237575 | 0.340272 |
| force | 4.092875 | 3.397754 |

这是单次校准，miss明显更慢、原因未知；短hot的1s采样仅启动RSS，不当作峰值。
执行者在独立512副本追加注释后恢复原bytes/mtime，没有修改30K原fixture。
实际方案与过程记录在`dense-catalog-20261102/hash-first/PLAN.md`和`execution.log`。
30K cold/hot结果如下；不能以hot单次较快泛称M3提速。

## 固定512 AB/BA复核终态（不追加试到通过）

仓库外`dense-catalog-20261102/hash-first/MISS-RECHECK-REPORT.md`，固定A1→B1→B2→A2，
每臂cold预构建/miss/miss-hot，共12进程全部READY/8表/4query/hash/exit0，未额外加跑。
Miss READY：A1=46.655045s、B1=6.945197s；B2=5.983482s、A2=2.858529s，方向混合。
A1主要异常在first writing40.395425s之前；不能用batch/checkpoint或validation解释整个差额。
既不能称一致回归，也不能称修复；原B miss7.777866s、A1慢样本及M1+34.31s均保留。
此复核与后续100K旧API成本失败无同根因证据，不延伸更多重复测试。

## M3 30K cold/hot单对终态（不是100K失败的替代门禁）

证据`dense-catalog-20261102/hash-first/REPORT.md`与`SUMMARY.json`；
`full30000/m3-30k-{A,B}-{cold,hot}/`保存wire/resource/count/query/sourcehash/terminal。
A508a先cold→hot，再B890862 cold→hot，独立freshcache、同源URI、无OS缓存清理、一次只跑一个native。
四runs均READY/query/exit0，8表精确计数、4query oracle及原源SHA一致；不是完整compiler语义验收。

| 指标 | A cold | B cold | A hot | B hot |
| --- | ---: | ---: | ---: | ---: |
| READY秒 | 289.834674 | 247.097461 | 14.949469 | 1.749629 |
| 全进程采样max RSS KiB | 3021432 | 105496 | 2947344 | 44136 |
| validation开始秒 | 167.952383 | 168.096944 | — | — |
| validation结束秒 | 284.250167 | 245.999508 | — | — |
| validation间隔秒 | 116.297784 | 77.902564 | — | — |

Cold单对快42.737213s，但写完/validation起点几乎相同，主要差额在未改变SQL校验的validation区间；
不能把全部收益归因于pipeline，也不说明之前M1 force慢34.31s已解决。Hot同physical/key，
仅reusing/checking/publishing且无bulk trace；0parser证据来自独立debug公开合同，不是release直接计数。
全进程采样含READY后4查询/关闭；B hot最大44136KiB发生READY后，只有2个READY前样本，
不能当精确初始化峰或RSS硬cap。A cold关闭附近有一次/proc/io拒绝，原样保留，无升级权限/改道。
30K miss/force、Windows/UI、总LSP/Worker内存、长稳态和全语义操作未跑。

## 范围决策与后续门禁

1. **诊断范围已收口，仅允许draft发布**：100K旧replace_all路径单次隔离child通过，原全量失败保留；
   不继续本地重复测试，不改变阈值/SQL，目标HEAD fresh完整CI待验。
   512miss固定AB/BA十二进程已终态方向混合；不再延伸重复，所有失败/慢结果保留。
2. Node scoped已通过：原13文件组加lsp-production-index，共14完整文件38/38。
   覆盖adapter/stamp/storage/replay、storageprogress/phasetrace/referencesinitial与readinesscatalog六文件。
   Mock不代替生产native；完整`pnpm check:fast`与目标HEAD CI未跑，不沿用旧绿CI。
3. **M4本轮范围决定：defer文件级payload缓存、已有事实复制/变更集增量和不可变shard。**
   当前保留hash-first与完整SQLite代发布；先厘清100K/512miss成本，避免无证据扩大持久化/GC/失效合同。
   范围决定完成不等于M4交付完成；未迁移schema或加入缓存依赖，后续需独立TDD/ADR与证据。
4. ADR保持Proposed；Windows/真实项目/UI、完整故障矩阵与性能分布仍未毕业。
