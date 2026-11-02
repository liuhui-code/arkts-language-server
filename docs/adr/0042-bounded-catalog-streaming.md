# ADR 0042：有界 catalog 解析—写入流水线

- 日期：2026-11-02。
- 状态：**Proposed；M1 force 与 M3 hash-first 已实现并有独立 Rust 功能验证，最终主仓100K成本门禁失败保留、固定诊断已收口，仅允许draft发布待fresh完整CI；性能/完整产品门禁未完成，不宣称 Accepted。**
- 整合输入：PR112 `5e9ecf0b7b2bd72f6853649fb7c8ec92c8b7a060` 与 main `c5577bb11900d7871d8c8e0ee9e1fb87eb1c169b`；解析调用链静态审查基线为前者。
- 执行跟踪：[M0–M4清单](../plans/2026-11-02-streaming-catalog-execution.md)；状态回写既有[Feature Ledger](../plans/references-feature-ledger.md)，不另建ledger。
- 保留 ADR0034 的完整私有库发布以及 ADR0029 的默认 `memoryBudgetBytes:null`。新队列额度仅控制工作所有权与生产速度，不是产品默认RSS预算、拒绝完整请求或驱逐热状态的策略。

## 问题和已有证据

改动前 scanner 每批最多64文档或约1MiB源码，以最多4个worker解析；结果仍全部追加到 `Vec<DocumentSymbols>`，直到扫描结束才进入storage。
现有storage普通事务最多64文档、32,768估算行、8MiB估算数据；超大文档每块最多4,096元素、4MiB。上述写入分批没有约束扫描阶段全部解析结果的驻留。

`catalog_build.rs` 已在写完后、校验前释放documents；三对云Linux合成30K/72MB源码、1050万occurrence探针显示校验期RSS由约2.88GiB降到约1.59–1.84GiB，返回尾部由5–12s到毫秒，但全程采样峰仍约2.88GiB。B2写完前已存在明显差异且quick_check变慢。三对非随机顺序、无统一页缓存控制；不能把READY差额全部归因于释放，不推导速度百分比或Windows/UI收益。
证据入口：`docs/reports/2026-11-02-dense-30k-catalog-diagnosis.md`；原始实验 `dense-catalog-20261102/THREE-PAIR-REPORT.md` 是维护者保留的仓库外证据标识，不是仓库内链接；复现身份与摘要见该报告。

## 决策：先有界所有权，再扩展复用

### 1. 最小组件边界

- Scanner 保留忽略、路径、2MiB源码准入与拒绝语义，产生轻量manifest而不是全项目解析结果。
- 以URI排序的manifest保持现有主键写入顺序。manifest、source witnesses和fingerprint记录可以随文件数增长；本决策不宣称整个进程恒定空间。
- 最多4个解析worker，通过有界调度/交付把结果交给单一私有库writer；不新增无界工作队列，不在worker内部累积整个chunk的所有结果。
- SQLite侧提取 private build session 的 begin / consume / finish 边界；现有 `build_catalog_with_fingerprint` 公开入口保留适配，增量事务和query入口不重写。
- Writer消费现有64文档/32,768行/8MiB批次和超大文档4,096元素/4MiB分块；事务完成后释放不再被借用的payload，不能仅从队列移除但仍被batch/closure/worker持有。
- 首片不改schema，不引入新存储引擎或分片，不重做官方编译器的语义职责。

### 2. 背压与可证实的内存边界

额度不能只按channel文档数计算。所有权账本至少包含：待解析源码、正在解析任务及预留、已完成待发送结果、URI重排结果、writer当前batch、超大文档和分块临时复制。结果移交只转移计费所有者，不能重复释放或先退credit再隐藏持有。

尽量复用原1MiB读取批、4worker及writer既有行/byte边界；新增推导的窗口/credit必须说明如何来自这些参数，不能凭空加一个默认几百MiB阈值。解析完成后用结构容器/字符串容量等核算payload估计，不把SQL `document_cost` 当精确heap字节。

当前parser返回完整DocumentSymbols；解析前无法从源码字节准确预知展开量。因此预留/估算不足时：停止继续派发，已在途至多4个任务的结果仍须有明确所有者和排空路径；不能把超额结果挡在一个writer永远等不到的队列后造成死锁。URI首项慢、后项已完成时也不得持续补派形成无界reorder。

超大单文档允许一次现有准入文档的展开例外，先排空普通窗口，再用既有writer分块消费；其他在途任务的展开也必须计入观察上界，不能假称它们不存在。若需要真正单文档解析硬界，必须另行证明解析器可分块/外存化，不在本片偷加源准入阈值、截断结果或RSS失败策略。

首阶段承诺：消除全项目DocumentSymbols累计；在固定单文档复杂度下，解析payload驻留由有界在途窗口而非项目文件数决定。非承诺：任意输入总RSS硬封顶、估算等于物理RSS、drop一定立即退还OS。

### 3. 原子发布与取消不变

- 一次构建仍产出完整私有DB，所有中间提交对查询不可见。quick_check、foreign_key_check、外部内容FTS integrity-check全部保留。
- NORMAL、自动checkpoint、逐批PASSIVE、最终FULL/TRUNCATE、目录同步及控制库短原子发布不变；保留索引/FTS触发器。
- 在构建开始固定活动文件和committed generation；发布前独占锁下比较起点，不允许旧构建覆盖后来的增量/发布。
- 解析源码独立保存length/mtime/SHA witness直到Checking。最终检查失败、源读取失败、worker panic、SQL/磁盘错误、竞争失败均不发布、不清现用库，不增加自动retry次数。
- 取消覆盖等待credit、等待结果、重排和writer阶段边界；必须唤醒阻塞方、停止派发、释放所有payload/lease并join所有worker。SQL/同步I/O本身不承诺即时中断；短Publishing边界后仍不可取消。
- 旧reader固定其完整代连接与lease，仍可查旧代；正常后台关闭、退役和GC保留。不得用私有库已完成一部分来报告READY或完整结果。
- 保留[ADR0041](0041-windows-index-storage-location.md)会话级存储owner已选择的实际根；新session、私有DB及维护沿用该根，不重新探测D盘/LOCALAPPDATA、不在活跃会话切根、不复制迁移旧DB/WAL。关闭owner后不得启动流水线或新建存储。
- 扫描与写入可重叠；进度不得提前宣告total_files/100%，activity sequence只计真实活动，继续支持原协议消费者。

### 4. 冷启动与非force复用：先选路，再写库

现有fingerprint是排序URI、源SHA、schema和producer二进制的组合，必须扫描完才知道是否命中。当前在创建/写新库前判断reuse。不允许先写完整私有库再发现“可以复用”，否则约6.7s的既有合成热启动会承担全量写入。

**显式后继决策：** ADR0034“复用仍扫描、解析”记录旧实现方式，不是永久必须重复解析的安全不变量。本ADR优先验证manifest/hash-first命中免解析；保留完整源码扫描/身份验证和发布前source fence，用已验证且输入键相同的旧产物替代重复计算。只有完整输入键与确定性得到证据支持才启用；首片force不依赖这个决定。

静态证据（审查基线5e9ecf0，整合后仍须复核）：

- `index-core/src/lib.rs` 的Document只有URI和text；`document_metadata.rs::parse_document_symbols` 调tokenizer、LineIndex、parse_symbols、class heritage和source provenance，参数均来自同一个Document和词法结果。
- `class_binding_snapshot.rs`/`class_binding_syntax.rs`读取源码/派生facts；`reference_bindings`仅记录源码拼写并输出Unresolved，不在这条解析调用链读取依赖文件或官方编译器配置。core Cargo无第三方依赖，相关源码未发现环境、文件系统、时钟或随机输入。此为静态支持，不替代公开确定性/失效测试；不得把其他语义解析路径也宣称纯函数。
- `CatalogInputs`已把二进制SHA、schema、按URI排序的源SHA组合，URI本身不能省略；真实运行配置若将来进入该解析路径，必须纳入键或使reuse保守失效。按文件缓存若落地也须沿用完整键。
- 当前已存fingerprint仅在rejected_uris为空时写入。但scanner的ignore/目录读取错误只增加progress.rejected，不一定进入rejected_uris。新路线须显式确认扫描完整，不把“rejected_uris为空”等同“没有扫描错误”；这是静态审查发现的资格区分，尚未证明现产品存在错误复用，不据此宣称已修bug。

**保持准入集合定义，未完成扫描不得复用。** 现代码分类应保留，不把任意skipped/rejected计数粗暴当同一事件：

| 现路径（catalog.rs，审查基线行号） | 当前记录 | 新复用资格含义 |
| --- | --- | --- |
| symlink排除约204；硬排除219；正常gitignore命中246 | ignored增加 | 有意排除，不是不完整；同准入集允许命中 |
| 非文件/不支持扩展233 | 不计rejected | 有意不准入，不能因此禁用热路径 |
| metadata长度超2MiB297；读取中越界320 | policy_skipped增加 | 原准入政策；重新分类后的准入URI集合决定键，不把policy skip当I/O失败 |
| .git/info/exclude和.gitignore加载错误99–124 | progress.rejected增加 | 未可靠完成规则读取；保守不reuse |
| root read_dir失败131 | 整次失败 | 沿用失败；无发布 |
| 子目录read_dir失败137、迭代entry失败162、file_type失败189 | progress.rejected增加，无可用URI拒绝项 | 扫描未完成；独立scan-complete/eligibility失效 |
| 源metadata失败279、read/UTF8失败323、parse失败约404 | progress.rejected及rejected_uris | 保留文档拒绝语义；不生成可免解析复用的成功指纹 |

缺失ignore文件是现有正常情况（load_ignore_file对NotFound返回无错误），不与读取错误混淆。最终元数据中的rejected_documents来自rejected_uris，并不等于progress.rejected；原始计数仍用于真实进度，eligibility需表达原因而不是从聚合计数猜测。

**旧指纹迁移资格：** 优先对fingerprint输入域做版本升级（例如从当前`arkts-catalog-inputs-v1`提升到声明complete-scan资格的新域；具体名称由实现固定），不迁移数据库schema。只有本版本完整扫描、无文档拒绝、完整构建验证成功的路径可以持久化该新域fingerprint；hash-first仅消费该域生成的匹配值。旧字符串不兼容时完整重建一次后建立新资格，不因旧fingerprint非空就信任；producer二进制SHA本来也会随实现改变，但不能用这一偶然失配代替明确的资格契约。公开适配入口不得用未证明scan-complete的任意fingerprint冒充新域。

既定分阶段选路如下：首片仅改force，后继M3现已接入非force（已执行范围见状态记录）：

1. **force**：不计算不会使用的复用指纹；按manifest顺序流式读取/解析/写入，保留源码最终fence。
2. **没有可用复用指纹的冷启动**：固定parent后确定不能reuse；单次解析流式写，记录实际输入身份，结束才生成fingerprint写入最终控制发布。Fingerprint只能描述真正写入的源码。
3. **有候选复用指纹的非force启动（优先）**：按原规则重新遍历完整文件集，读取每份准入源码、执行2MiB增长检查与UTF-8解码、记录source witness并hash；此时不解析、不保留全项目源码。忽略规则/硬排除/扩展名/符号链接/读错及policy_skipped分类仍照常执行。hash命中、producer/schema相同、旧代有效且旧rejected为零、当前扫描完整无读取/解码拒绝，才能复用旧已验证产物；同parent/generation fence下走原小元数据事务，不创建/写满新DB。最终Checking仍重读length/mtime/SHA，不靠mtime或watcher推测内容相同。indexed/progress统计应表达已验证复用文件，不能伪造实际parser调用。
4. **有候选但miss**：使用轻量manifest重读并流式解析写入，属于一次hash扫描加一次解析读取，不是两次解析。第二遍每份实际读取须匹配第一遍length/mtime/SHA；变更则放弃本次，不混合两版输入。parse新发现的拒绝仍按原完整构建语义记录，并禁用最终reuse fingerprint。保留源最终fence以及原文件集非原子边界/watch机制，不声称取得文件系统快照。
5. **纯度/完整键尚未证明的兼容回退**：可先采用parse/discard扫描再判reuse，miss二次解析；这是保守临时备选，不是本ADR锁定的最终高效路线。记录启用条件与成本；若发现配置/其他隐含输入，应补键或继续不reuse，而非默默使用不完整键。

命中的正确性依据是“同URI+源内容+完整producer/schema/实际配置键，旧代已成功解析且通过完整构建校验”，不是“旧库看起来可用”。旧rejected/未知producer/不完整扫描、指纹读取失败、增量已使fingerprint失效，均不能走免解析复用。文件集新增/删除/改名/忽略变化须重新枚举进入manifest；若规则改变但结果集及内容完全相同，可复用同一产物，规则错误则拒绝reuse。对旧库打开/损坏处理沿用既有防护，不新增“信任文件存在”的捷径。

内容寻址每file payload缓存、搬运未变事实、变更集增量可以进一步降低miss成本，但需后续证据和身份/失效/GC决策；免解析全库热命中本身不要求schema迁移或引入file cache。

## 业界原理及适用边界（2026-11-02核对官方资料）

- [clangd index](https://clangd.llvm.org/design/indexing)：线程池后台索引、按文件磁盘缓存、打开文件动态层。借鉴“按文件身份复用、冷热分层”；不照搬其索引组合为本产品未校验全量结果背书，也不在首片引入shard格式。
- [rust-analyzer architecture](https://rust-analyzer.github.io/book/contributing/architecture.html#cancellation)：revision变化取消旧计算，边界将取消转成结果。借鉴代际失效和协作取消，不照搬panic取消实现，不替换现有发布fence。
- [Tantivy IndexWriter](https://docs.rs/tantivy/0.27.0/tantivy/indexer/struct.IndexWriter.html)：有限索引线程/共享队列以及commit/rollback边界。借鉴生产与可见提交分离，不把其segment布局或引擎内memory参数当本进程RSS保证。
- [Lucene IndexWriter 10.2](https://lucene.apache.org/core/10_2_0/core/org/apache/lucene/index/IndexWriter.html)：按文档RAM/数量flush，既有reader继续原point-in-time snapshot。借鉴“内存缓冲落盘≠对外发布”，不引入近实时半构建可见语义或全量改引擎。

以上是设计借鉴，不是外部项目对本实现正确性/性能的证明；具体行为以本仓库完整查询、新鲜度和取消合同为准。

## 里程碑与退出条件

所有行为改动遵守AGENTS：最近稳定公开API先RED，记录命令/父revision；一片一GREEN。LSP必须真实子进程framed stdio。源码/测试≤500物理行；已有超限文件不增长并提取内聚职责。以下是完整退出合同；当前已执行范围与未完成项见下节，不能把代码落地等同里程碑全部验收。

### M0：冻结合同与观察基线

- 核对整合后的生产输入身份；冻结query/count/source-hash oracle、RSS/heap/阶段计时收据格式。
- 添加公开构建API生命周期characterization和writer慢消费条件；不依赖私有server状态代替协议测试。
- 验收：旧实现能够暴露全量payload累计的RED；已有完整发布、取消、reuse行为characterization保持可复现。不能拿墙钟偶然更快代替生命周期证明。

### M1：force有界流水线

- 仅force接入新session/producer-consumer，非force保持原路径；建立所有权/credit观测和进度桥接。
- 验收：在固定单文档负载下放大文件数，payload高水位由工作窗口控制；故意慢writer/慢URI首文件不能无限增大队列/reorder。4个高膨胀文件、单个近准入上限文件可完成而不死锁；超大分块ordinal/identity去重和各表/query oracle一致。
- 与旧实现交错配对force，记录峰RSS、校验RSS、解析/写入/校验/READY/尾部和磁盘写量。若payload机制成立而RSS不降，报告分配器/SQLite余量并继续归因，不能宣称降峰已达标。

### M2：并发、失败与完整发布

- 在credit满、worker完成未交付、写入chunk、Checking、Publishing边界测试取消；panic/SQL/磁盘错误/竞争发布不暴露半库，worker和lease收尾可证明。
- 同length/mtime换字节、删除、构建期间增量、双窗口起点竞争；旧reader贯穿构建/发布，跨发布强杀重启保留完整代。
- 验收：现有发布/取消/恢复公开测试及新边界用例GREEN，无自动retry增量、无丢校验。不可复现平台故障记录NOT RUN而非通过。

### M3：冷启动与非force复用兼容

- 实现并验证上文优先选路：无可用fingerprint单遍流写；有候选manifest/hash-first，完整键命中免解析小事务，miss受witness约束地重读并仅解析一次。纯度/键不足才使用显式parse/discard兼容回退。
- 验收：优先路线热命中新DB创建/批量写入/parser调用计数均为零，完整查询一致；cold/miss/force不保留全项目payload。公开API确定性测试覆盖URI变化、Unicode/UTF-16、imports/exports/class facts/坏语法；producer/schema/真实配置/增量/旧拒绝使reuse正确失效。新增/删除/改名/忽略变化须按新准入集判断；目录/ignore读错、UTF-8错误不得reuse。正反用例证明正常ignore/不支持扩展/symlink/政策超限仍按原定义处理，不误伤热路径；读取时越2MiB保持policy-skipped分类。旧域fingerprint及无scan-complete资格不能命中免解析；两遍之间和最终Checking同length/mtime换字节均拒绝发布。各路径记录读取次数、解析次数与写入量。
- 热6.7s是旧合成观察值而非固定秒数门禁；必须用相同输入/环境对照解释任何热回归，不能以“仍最终READY”为完成。miss额外hash/读取及兼容回退双解析成本分别单列，不能声称已实现变更集增量。

### M4：复用扩展决策与最终交付

- 依据M3 miss成本，形成内容寻址每file缓存/已有库事实复制/保持hash-first的明确决定及证据；缓存键至少覆盖URI、source digest、producer/schema以及实际影响parser输出的配置，先验证真实依赖而不假设仅文本决定全部。
- 如决定实现缓存，先定义损坏/缺失精确fallback、原子落盘、workspace namespace/GC、取消/版本兼容、完整重建组装和源码fence，另起TDD片；不默认做schema迁移。变更集增量必须处理删除/拒绝/新增/依赖失效，并继续验证完整结果。
- 不可变shard只在全量私有DB写入/校验仍为有证据瓶颈时立新ADR；本轮以完整SQLite代为发布单位，不把待研究分片算已完成。
- 最终同一生产输入跑focused Rust、release、fmt/strictClippy、`pnpm check:fast`及相关公开协议回归；保留RED/失败/重跑收据。仅在目标HEAD完整CI终态明确后报告该范围验收。
- 云Linux合成/真实项目、Windows/native路径/UI分别标状态；未测平台不能借Linux通过升级。完成报告区分机制成立、性能观察、产品验收，未过门禁不称方案全部完成。

## 实现与验收状态（2026-11-02）

详细实现/TDD、输入身份和保留失败见[整合报告](../reports/2026-11-02-streaming-catalog-implementation.md)。
M1→M3候选从5e9ecf0独立开发，累计patch静态应用到e69c7eb，124个native/Cargo输入逐项匹配；
主仓Node scoped14完整文件38/38、check/build/fmt/clippy通过；最终native259PASS/1FAIL/1原ignored。
100K原replacement-cost测试cold32679.111ms、warm removal113042.933ms，违反removal≤cold；
只读确认100K走未改旧activate_catalog→replace_all→clear_documents，不走M3。
唯一一次既有test binary持久child诊断PASS：cold48485.075ms/warm removal7660.407ms，无build/改阈值；
原full失败仍保留且未解释。诊断收口，允许draft发布待fresh完整CI，不称ready-to-merge/全绿。完整local check:fast/目标HEAD CI未跑，不沿用旧绿CI。

- `CatalogInput::{Document,Rejected,Complete}`懒消费；Complete必须随后正常EOF，错误/断开/尾随事件不发布。
  每次poll（包括Complete后EOF探测）前检查取消。旧FullCatalog/stream入口保留。
- 实际M1采用4个persistent单项交付槽、按URI pull，不在worker收集64文档。
  有界writer+lookahead之外，明确允许4个源码/完整解析或待交付单项；紧凑manifest/witness O(N)。
  这不是精确heap credit或总RSS硬cap；进度仍复用合并/节流，既有update通道不是有界通道。
  所有结果消费且worker join后进入Activating，发布仍须Complete+EOF；提前写入只报告storage子进度。
- `CatalogBuildSession`固定parent/expected generation和旧lease；懒factory保证命中不创建parser workers或私有库。
  新资格格式固定为`arkts-complete-scan-v2:<producer64hex>:<sources64hex>`，legacy opaque写入隔离到
  `arkts-legacy-fingerprint-v2:`；历史普通raw值仍兼容，reserved域不能由旧adapter误冒充。
  类型是调用者的完整扫描声明，不是防恶意Rust调用的安全边界。
- 非force无合格候选时实际read/parse一次并流写；有候选时hash/UTF-8/准入扫描，命中0 parser调用且同physical小事务，
  miss二读必须匹配length/mtime/SHA且每文件只parse一次；仍保留最终SHA fence。
  ignore/目录/entry/file-type/metadata/read错误显式禁用资格，正常exclude/policy skip不粗暴禁用。
- 独立候选全量Rust重跑259PASS/0FAIL/1原ignored；后加hot取消与dense oracle focused4PASS；
  fmt/strictClippy/release及130源release cold→hot烟测通过。首次全量既有cache_gc protected≠observing失败原因未知，
  单独及全量重跑通过但不宣称已修复。具体作用域/重复计数见报告。
- M1仅一对30K force观察：全进程采样最大RSS3,015,224→104,096KiB（约102MiB），但READY293.040→327.349s慢34.31s。
  不是普遍102MiB上界、不是整体提速、不是M3性能证据。M3的512资格10runs已通过；其中miss单次1.958→7.778s更慢且未归因。M3的30K cold/hot四runs计数/查询/hash/exit0通过；cold289.835→247.097s、hot14.949→1.750s仅单对，
  cold主要差额在未改SQL的校验区间，不全归因pipeline；30Kmiss/force未跑，不能覆盖最终100K门禁失败。
- 固定512 AB/BA复核12进程全通过，但miss A1/B1=46.655/6.945s、B2/A2=5.983/2.859s方向混合；
  保留全部慢样本，性能不稳定，不称一致回归或修复，不继续加跑。
- M2已有公开取消/旧代/源变更/竞争/恢复回归，但不可复现平台故障、Windows/真实项目/UI未验收。
  M4本轮明确defer文件级缓存/事实复制/变更集增量/分片，先定位100K和512miss成本；
  范围决定不等于M4交付，完整Node/目标HEAD CI与最终产品验收仍未完成。

## 风险与回退

- 解析膨胀与分配器保留：有界所有权不等于RSS硬界；优先减少所有权重叠，不加默认RSS压力策略。
- FIFO/URI重排阻塞：限制派发窗口并保证前序结果可交付；测慢首项、超大项、取消满队列，不能用无限reorder换吞吐。
- miss额外读取及兼容回退双解析代价：优先明确测量，文件级缓存需独立身份/GC合同；免解析仅适用于完整键命中的旧成功产物，不为速度删除源hash/新解析拒绝合同。
- 取消/线程join与SQL阻塞：保持阶段边界合同，不承诺立即中断；不得让panic后的孤儿线程继续写/发布。
- 冷构建与校验仍有DB/OS工作集：本片不删除quick_check/FK/FTS，不凭流式预计其必然变快。
- 回退单位是独立切片，保留旧公开adapter与完整构建路径供对照；回退不删除用户缓存、不迁移数据库、不扩大重试预算。不要同时运行两条全量构建“保险”，避免双倍资源与竞争发布。
