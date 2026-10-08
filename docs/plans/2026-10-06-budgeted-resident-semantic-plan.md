# ArkTS 预算约束长驻语义会话：L01–L08 执行计划

日期：2026-10-06。状态：**当前实施主线；L01 IN_PROGRESS（首轮精确控制通过，性能稳定性未达标，100-edit 资源控制未获准入）**。
本计划接续 [2026-09-29 semantic-ready 计划](2026-09-29-semantic-ready-execution-plan.md)
的需求与失败证据，不把旧 S-series 的阶段或 S05 候选重标成功。
[ADR 0014](../adr/0014-budgeted-long-lived-semantic-session.md) 仅批准可证伪的
实验实施；生产默认仍是 `indexed-batched + closure + full SDK`、
`dispose` 策略、逐 batch transient verifier。达到 500 ms 尚未证明。

## 路线决策和停止线

S02 compiler-derived facts v1–v6 保留原始反例；**不进行 v7**，除非有
新的独立假说、明确决策及同一反例合同。S03 的 facts 持久化/发布仍
**BLOCKED**，不是 L02 的前置。旧 S05 compatible-disk local-LS 候选
`DECISION_COMPLETE / REJECTED`：曾有 1.600× RSS 峰值和编辑后
definition P95 约 1.6 s 的负面证据。新 L01 是首次完整 LS 准备后
不销毁、测先前未查询符号的**不同机制**，不沿用其毕业结论。

```text
L01 resident-LS 可证伪基线
  → L02 版本化增量刷新
  → L03 预算/压力/滞回准入
  → L04 resident references + exact transient fallback
  → L05 implementations
  → L06 definition/completion/hover 等交互能力
  → L07 rename/call hierarchy
  → L08 soak、跨平台与 release 评审
```

| Stage | 当前状态 | 实施资格与结果 |
| --- | --- | --- |
| L01 | **IN_PROGRESS；真实符号、单次未保存编辑、单次 L3 恢复及 `findReferences` 进行中取消/恢复精确；500 ms 稳定性 NOT_MET，前置准备取消及时性/长期资源门禁未完成** | [首轮](../reports/2026-10-06-resident-l01-baseline.md)：42/42 exact，同文件未查符号 286/1,025/267 ms；[预打开](../reports/2026-10-06-resident-l01-preopen.md)：15/15 exact，跨文件未查符号 166/156/165 ms；[声明位置 A/B/C](../reports/2026-10-06-resident-l01-declarations-ab.md)：默认 indexed 与 legacy 各 2 个新进程、每进程 4/4 exact，indexed 跨文件未查符号 8.061/23.880 s，legacy 同快照 178/225 ms；[未保存编辑](../reports/2026-10-06-resident-l01-unsaved-reference-edit.md)：三进程 12/12 exact、9→10 引用及 v2 诊断，编辑后首次 1.371–1.597 s；[L3 恢复](../reports/2026-10-06-resident-l01-l3-recovery.md)：显式驱逐后未查符号 10/10 exact，trace-on 13.797 s，后续又见自动驱逐；[取消控制](../reports/2026-10-06-resident-l01-cancel-control.md)：queue-start 后唯一 `-32800`、无部分结果，随后 9/9 refs 与 definition exact；[调用级取消](../reports/2026-10-06-resident-l01-find-references-cancel.md)：三进程在 TypeScript `findReferences` 内 2–12 ms 抛取消，9/9 exact 恢复；首次进入该调用前仍用约 7.9–9.0 s；[跨模块 definition](../reports/2026-10-06-resident-l01-hot-definition.md)：三进程 6/6 exact，未查符号 1,060/858/777 ms。Program/Checker 身份只在有 trace 的查询后观察，definition 本轮无身份探针；不改变生产路由 |
| L02 | NOT_STARTED／provisional | 仅在 L01 精确性、新鲜度、取消及新路径资源安全通过后研究；L01 性能 FAIL 如实带入 |
| L03 | NOT_STARTED／provisional | 依据 L01/L02 实测 RSS/PSS 定 soft budget，不先提高上限 |
| L04 | NOT_STARTED／provisional | 完整 scope 与资源准入后逐能力试 resident references；transient exact fallback 保留 |
| L05 | NOT_STARTED／provisional | implementations 独立语义与资源门禁 |
| L06 | NOT_STARTED／provisional | definition/completion/hover 等交互能力逐项门禁 |
| L07 | NOT_STARTED／provisional | rename/calls 独立合同 |
| L08 | NOT_STARTED／release-blocked | soak、分桶 P95、原内存与跨平台产品门禁均未通过 |

L01 正确性/完整性/新鲜度/取消/资源安全失败时停止该新路径并归因；
实测新符号 >500 ms 时，保留 `PERFORMANCE_FAIL`，仍可继续 L02
**增量有效性实验**，但不能生产接线、默认推广或声称目标达成。
不为了让结果通过而缩小合法工程边界、提高预算、禁用诊断、改超时
或用已缓存目标替代新符号。后续阶段都是 **provisional**，不是
已获生产准入。最终产品毕业仍要求全部适用性能和原内存门禁通过。

## 固定输入、共同合同

- 使用真实 `applications_settings` checkout，记录精确 commit、dirty 状态、
  已声明依赖与实际安装状态；API24 是已授权兼容测试轨，记录其 SDK
  绝对路径、声明 digest 和 compiler revision。不得把它写成 API23
  matched-DevEco 结论，不改工程边界或复制文件造规模。
- 每次记录 server HEAD/build/flags、Node、macOS 硬件与内存、实际 LSP
  request/response、UTF-16 光标、oracle 的 URI＋range、诊断时间线。
  使用现有 LspSession、Content-Length stdio、外部 Node PID RSS sampler；
  trace-on 只用于归因，trace-off 才作产品时延对照。测试工具自身内存
  单列，不重复计 worker thread RSS。
- 工作树现有改动由原 owner 保护。源码行为以公开 LSP RED 开始，
  最小 GREEN 后跑相关 focused test；请求合并前 `pnpm check:fast`。
  手写 source/test/script ≤500 物理行，既有超限文件不得增长。
- 所有结果必须区分 PASS、FAIL、BLOCKED、NOT_RUN。一个完整响应包括
  排队、更新等待、fallback、结果映射及序列化；错误、超时、OOM、
  空结果和部分成功分别记账，不从分母删除。

## L01 — 一个完整 LS 的真实工程基线（当前）

目标是验证因果假说：首次 Program/Checker 准备成本若被有效 LS 支付并
留在同一进程，**另一个此前未查询的真实符号**是否能在预算内完整回答。
第一轮只加默认关闭的实验/观测和复现测试，不改生产默认或 worker 数。

1. 固定真实 Settings/API24 工程、SDK、依赖与准确 UTF-16 目标；先取
   stock/legacy 的完整逐位置 oracle，并保持正常自动诊断。分别选
   未查询的 definition、references（`includeDeclaration` 两种设置）、
   implementations 目标；同名、alias、跨模块不得被合并成一个目标。
2. A/B/C：A 新进程现行生产路由；B 新进程完整 LS 的首次准备及首次查询；
   C 在 B 的同一 LS 不 `dispose` 后，查询**先前未查询**符号。准备
   不是静默预查询目标池。对同快照重复查询另列 cache-control，不能
   计入 C 的新符号桶。
3. 记录首次 `createProgram`、`getTypeChecker`、`findReferences` 等阶段，
   C 的完整 LSP 时延、Program/SourceFile/TypeChecker 身份，外部 50 ms
   RSS 曲线及 heap，准备后 steady、峰值、空闲期和诊断。LS identity
   连续并不能证明 Program 没有重建；每个身份字段注明其可观察范围。
   用独立实验进程及预声明压力停止线保护本机；达到资源停止线、OOM
   或超时均记录为相应 FAIL，绝不当作完整响应或隐藏样本。
4. C 的逐位置 exact set、诊断、快照、新鲜度与取消/显式错误必须正确，
   现有内存/资源门禁不得回归。通过这些**安全门禁**才允许 L02 的
   增量有效性实验。另记新符号完整响应是否≤500 ms；超出则时延
   `PERFORMANCE_FAIL`，保存曲线并调查具体重建/等待阶段，但不把
   L02 错标为禁止研究。不提前实施 L04 生产路由或宣称 L01 毕业。
   一次 C 成功也不等于分桶 P95 产品毕业。

L01 交付：一条可重放命令、固定 manifest、原始响应和规范化 oracle、
时序与 RSS 曲线、Program 身份证据、A/B/C 差分、分开的安全继续判定
与性能/产品判定；性能 FAIL 不被安全 GO 冲淡。

当前声明位置对照进一步隔离了缓存误判：`MenuController` 和
`HomeInitData` 都使用真实 declaration 光标、`includeDeclaration=true`、
预打开两文件、正常自动诊断；先前未查的跨文件 `HomeInitData` 在 legacy
已支付首次全域准备成本后两次低于 500 ms，而生产默认的两次仍为秒级。
重复同符号的约 2 ms 响应是 exact-result cache 对照，**不能**充当新符号
LS 复用证据。四次样本、机器负载和采样抖动不足以宣布 P95 或内存收益；
该报告冻结在较早的 dirty-build digest，源码演进后须新建 pin 重测，
不可直接改旧清单 pin 后合并统计。

当前构建的[未保存编辑控制](../reports/2026-10-06-resident-l01-unsaved-reference-edit.md)
已验证真实 Settings `HomeInitData` 新引用的 v2 overlay 权威、结果缓存失效与
正常诊断，三次编辑后首次 refs 均超 500 ms。单独 trace-on 中 context 保持，
Program 在编辑后从序号 1 换为 2；同一个 Program 的查询后 Checker 序号也
曾从 1 换为 2，因此 Checker 序号**不作复用门禁**。分组 `createProgram`
事件约 1.08 s 是编辑后成本线索，不是精确构建调用次数，也不与 trace-off
时延合并。该控制只关闭一个 freshness 用例，不提前判定 L02 增量有效性；
真实 Settings 上的取消、L3 恢复和完整资源安全仍待独立门禁。

[L3 单次恢复控制](../reports/2026-10-06-resident-l01-l3-recovery.md) 已在真实
Settings 上观察到控制响应和 sequence 1 的 `memory-level3` 驱逐，随后
未查的 `HomeInitData` 10/10 exact、诊断正常；但恢复请求 trace-on
13.797 s、外采 Node RSS 峰值下界 1,087,504,384 B，且又发生 sequence
2/3 的 L3 驱逐。它关闭一个结果完整性用例，不关闭重复压力、长期驻留、
trace-off 产品时延或正式内存门禁。

[真实 Settings/API24 queue-start 取消控制](../reports/2026-10-06-resident-l01-cancel-control.md)
在 legacy 全域路径的 `references.queue.start` 后发取消，得到唯一 `-32800`
而非部分结果；同进程恢复 refs 9/9 和 definition 均 exact，诊断正常。
这只关闭一个公开协议的早期取消/恢复用例。已取消 trace 的文档准备仍继续
约 1.2 s，不能据此声称 compiler-in-flight 抢占、长期资源安全或 500 ms。

[早期回调取消复核](../reports/2026-10-06-resident-l01-compiler-cancel.md)
在三个独立 Settings/API24 进程中得到唯一 `-32800`、无部分结果、9/9
精确恢复，但发取消后 **5.76–6.90 秒**才见 references 回调抛异常；
旧事件包围整个回调，不能证明 TypeScript 内部何时停止。
后续[实际 `findReferences` 调用级复核](../reports/2026-10-06-resident-l01-find-references-cancel.md)
在另三个独立新进程中等到该调用进入才发取消：同一调用 12/2/2 ms
后抛取消，公开 LSP 19/4/4 ms 后唯一终态，9/9 refs、definition、正常
诊断均精确。首次进入该调用前仍等待约 7.9–9.0 秒；因此只能说
`findReferences` 本体可及时取消，**不能**把更早的 Program/定义准备、
重复取消资源安全或 L01 安全继续 GO 标成完成，更不是 500 ms 响应。

`textDocument/implementation` 现有一个真实 Settings 目标：[两独立新进程
发现](../reports/2026-10-06-resident-l01-implementation-discovery.md)均将
`IAboutDevicePageCtrl` 精确定位到同一实现类，固定为完整一位置 oracle；
冷请求 12.933/13.042 s。[三新进程预打开、首次全域 references 后的新目标
控制](../reports/2026-10-06-resident-l01-hot-implementation.md)则 6/6 exact，
此前未查 implementation 为 280.4/255.2/350.9 ms，正常诊断和外采 RSS
均保留。这只证明该预打开/已支付首次成本的目标有低于 500 ms 的样本；
未获得 semantic-ready 身份、Program/Checker 查询内部复用证明、可信 P95
或 L05 全能力/内存毕业，生产 implementation 路由保持不变。

[跨模块 definition 控制](../reports/2026-10-06-resident-l01-hot-definition.md)
在三个新进程中先完成 `MenuController` 248/248 全域 references，再对
预打开但此前未查询的 `HomePageMenuManager.ets` 中 `HomeInitData` 发
`textDocument/definition`：三次均精确落在声明 `16:13–16:25`，正常诊断
保留，但完整响应分别为 1,060/858/777 ms，0/3 低于 500 ms。
该 trace-off 控制明确反驳“首个完整 Program 建好后，所有跨模块新符号
都会小于 500 ms”；它不证明同一 Program/Checker 复用，也不因
`READINESS_UNSUPPORTED` 而把结果精确性改写成失败。

同输入的[单次 trace-on 归因](../reports/2026-10-06-resident-l01-hot-definition-trace.md)
显示 definition 完整协议 1,309.4 ms，而已插桩的 compiler definition 回调
仅 2.56 ms、该回调无分组 `createProgram` 记录。请求窗口中两个预打开
文件的自动诊断先后完成，第二个诊断完成后才出现 definition 回调；
Program/Checker 的后置序号在第二个诊断处由 1 换为 2。此时间顺序支持
“诊断/队列重叠”假说，但缺少 definition queue 与完整 document/project
准备边界，**不能**从一次 trace 算出各阶段占比。下一控制应保持诊断正常，
仅等待两个 v1 诊断都完成后再发送同一个未查询 definition，独立比较
trace-off 完整响应；不能把等待时间藏进 semantic-ready 声明。

该[诊断屏障 A/B](../reports/2026-10-06-resident-l01-diagnostic-barrier-ab.md)
现已完成：三次独立新进程的先前未查跨模块 definition 均精确，等待两份
正常 v1 诊断后响应为 11.6/8.8/12.2 ms；追加的无屏障新进程仍为
747.7 ms。屏障在发送第二请求**之前**额外等待 792.6–923.4 ms，首次
references 响应到第二 definition 响应的总间隔未明显降低。故这是归因
实验：支持诊断恢复/预热与请求重叠，却不证明任意点击时刻的跳转已达到
500 ms，也不能把 FIFO 与诊断预热的贡献唯一分开。随后[排队优先级
切片](../reports/2026-10-06-resident-l01-diagnostic-priority.md)用真实子进程
LSP 先得到稳定 RED，再允许 `define`/`hover` 有限越过尚未执行的自动
诊断，同时保证变更优先、旧请求新鲜度、v2 诊断和精确跳转。真实
Settings/API24 三个新进程均在第二份 v1 诊断前精确返回 definition，
但完整时延仍为 **824.4/703.9/691.0 ms，0/3≤500 ms**；正常诊断未关闭，
READINESS_UNSUPPORTED 和资源门禁也未改变。接下来须分辨已执行诊断
的剩余等待与未预热目标的 compiler 准备，不能将修复排队顺序等同于 L01
或产品时延毕业。

[脚本晋升追踪](../reports/2026-10-06-resident-l01-script-admission.md)现将此
剩余成本定位得更细：三个独立 trace-on Settings 进程的未查跨模块
definition 为 1,043/1,030/1,040 ms，其中 `createProgram` 为
748/762/782 ms，结果均 exact；另一次默认关闭观测点的真工程回放记录
第二文件准备新增 13 条 resident script，13 条此前经 lazy host 读取且
源码指纹完全相同，host generation `257→270`，紧随 Program `1→2`
和约 710 ms 重建。最终构建通过 `pnpm check:fast` 1299/1299 后的独立
新进程复测仍见 13/13 同指纹晋升、Program `1→2`，`createProgram`
749.4 ms、完整 definition 1,004.7 ms，248/248 references 与 definition
1/1 exact；输入 pin 前后不变，自动诊断正常。没有编辑、context 驱逐
或 SDK/root 数增加。这是
**强观察证据，不是“保留 host version 即安全”的因果证明**。L02 仅在
L01 安全继续门禁后，以默认关闭的同输入 A/B 检验同指纹 lazy→resident
晋升是否可保持 host version；任意真实内容/工程/SDK 变化仍必须失效。
本轮不改生产语义加载/默认路由，500 ms 和长期资源门禁保持开放。

[100 次未保存引用增删的资源回放](../reports/2026-10-07-resident-l01-resource-soak.md)
在真实 Settings/API24 的三个独立新进程完成。带初始诊断屏障的 trace-off
轮 102/102 URI＋UTF-16 位置精确、正常 v1/v101 诊断通过，但 100 个编辑后
references 的 P50/P95 为 2.484/4.437 s，外采 Node RSS 峰值下界
1,452,896,256 B。trace-on 轮 107/107 精确且五次显式 L3 均恢复，
同时观察到 104 次 context 创建和 104 次 `memory-level3` 驱逐，不能称为
稳定长驻。另一无诊断屏障 trace-off 轮虽 102/102 精确，但 `MenuController`
v1 诊断超时，必须保留 FAIL。此切片仅关闭单一符号的 100-edit 精确性；
资源准入仍 BLOCKED，不能推进 L02 生产变更、提高预算或改默认路由。
Mac RSS 不是原 PSS 门禁；原始 >3 GB／50% 目标也未关闭。

[短诊断回放](../reports/2026-10-07-resident-l01-pressure-attribution.md)又在两个
独立真实 Settings 进程中，以 20 次未保存编辑、**不发送显式 L3 控制**
观察到 13/13 和 14/14 次 context 创建/驱逐，22/22 exact 且正常诊断
通过。原 100-edit 的 104 次驱逐均发生在 RSS 高于 92% 进入阈值时；
第二个短回放仅 1 次驱逐低于该阈值但高于 85% 滞回目标。因而主要
已证实的是高 RSS 下的创建→驱逐反馈循环，不是滞回本身造成全部驱逐，
也**不是**已证明的 compiler/registry 对象泄漏。L01 资源准入继续
BLOCKED；先完成同输入生产默认对照与 post-eviction live-heap/PSS
归属，不能据此提高预算或改生产路由。

[同输入生产默认对照](../reports/2026-10-07-resident-l01-production-comparator.md)
已完成第一项：两个独立 Settings/API24 进程只切换 `legacy` 与
`indexed-batched`，22/22 位置集合逐请求完全相同，正常诊断均通过。默认
策略的 `HomeInitData` 基线与 20 次未保存编辑均实际走 indexed 单 batch，
并非编辑后持续 fallback legacy；其编辑 P50/P95 3.693/4.145 s，较 legacy
的 2.422/2.524 s 更慢，外采 Node RSS 峰值下界从 1.245 GB 降至
0.843 GB。首次 `MenuController` 因候选身份不完整进入 24 个保守批次，
111.220 s 中 93.275 s 为累计 Program-ready，不能误归因于最终引用
查询。该对照仅是 trace-on 诊断样本，非统计 release gate；post-eviction
live-heap/PSS 归属尚未完成，L01 资源准入仍 **BLOCKED**。

[两次新进程 Registry 所有权探针](../reports/2026-10-07-resident-l01-registry-ownership.md)
进一步在相同 Settings/API24、正常诊断及无显式压力的 20 次编辑中复现
L2 trim→重建→L3 dispose：两轮都是 22/22 exact，初次采样的 2261 个
路径的 registry 引用计数均为 `trim 2261→2261`、重建后
`dispose 4522→2261`；后续新 context 的 dispose 只临时加减一份。
这与上游 `cleanupSemanticCache()` 丢弃 Program 而不释放 registry 引用的
源码行为吻合，是具体的 backend 生命周期缺陷候选。refcount 不能换算为
保留字节；探针会调用 `getProgram()`，故其 RSS/时延仅用于归因。
下一步先以 real-LSP RED 锁定 trim→重建→dispose 的零残余要求，再做最小
backend 修复和同输入复核；L01 资源安全仍 **BLOCKED**。

[L2 backend recycle 回归与两轮真实回放](../reports/2026-10-07-resident-l01-registry-recycle.md)
已补齐该切片：真实 LSP 子进程在旧实现中 L2 后首次查询报 `-32603`，
改为旧 LS 持有 Program 时由其自身 dispose、随后用同一 host/registry
建立空 LS 后，精确 references/definition 与诊断通过；真实 Settings 两轮
各 22/22 exact，采样的 L2/L3 registry 残余引用为 0。但固定构建 A/B 的
编辑最大时延达 28.227/27.004 s，冷 `createProgram` 可达约 21–24 s；
RSS 峰值下界分别为 1.518/1.030 GB，差异很大。故只关闭具体所有权
缺陷，**不**把 L01 资源/时延门禁改为 GO，也不据此进入 L02 生产接线。
[`L2 → 查询重建 → 再次 L2` 控制](../reports/2026-10-07-resident-l01-l2-rearm.md)
已补：真实 LSP RED/GREEN 区分第二次真实 trim 与无查询的连续 L2，
Registry 每次归零；但 Settings 固定构建 20 次编辑虽 22/22 exact、诊断
正常，仍有四次自动 L3 驱逐、七次 >20 s 响应及至少 1.969 GB Node RSS
峰值。故 re-arm **仅 `ARKTS_BENCHMARK_CONTROL=1` 加显式实验 flag 生效**，
生产默认保留一次 L2 行为；该功能正确性不能替代资源准入。
[后续公开 LSP RED/GREEN](../tdd/l01-l2-program-witness.md) 已收紧实验性
re-arm：无效 rename 不再触发第二次 trim，只有本次查询观测到正的 compiler
`createProgram` 事件才 re-arm。该信号不证明严格的 resident Program 身份，
更不使真实 Settings 资源门禁转绿。下一安全切片仍须在持续 L3 时阻止 full resident
LS 反复再准入，保持完整 transient 兜底或显式资源错误。不能只延迟/跳过
L3 驱逐掩盖预算超限，也不能据此进入 L02 生产接线。
[持续 L3 准入实验](../reports/2026-10-07-resident-l01-pressure-admission.md)
已用公开 LSP RED/GREEN 证明：自动 L3 下若 legacy refs 照常运行，会把
resident context 从一次创建变成三次；双重基准开关可令小夹具精确地走
conservative transient verifier，不再重复准入。但相同真实 Settings/API24
的 20-edit 回放只有 20/22 完整精确响应，另外两次在 24-batch 计划的
第 14 批前达到 180 s 超时，虽外采 Node RSS 峰值下界为 1.410 GB，
仍判 **NO-GO**。该标志保持默认关闭；“遍历全部文件”不等于可接受延迟，
也不自动证明所有跨 batch 语义等价。下一步仍在 L01：必须找到不重复
构建完整 resident Program、也不为陈旧索引重建二十余个冷 Program 的
完整语义路径；否则应明确资源错误，不能返回部分引用或宣称资源门禁通过。
上述 L2 阶段曾有固定 3–5 s 冷查询在本机超时；该历史失败保留在原报告。
本轮隔离 alias/barrel 公共 LSP 测试后，使用 fixture SDK 和允许 macOS 外部
RSS 采样的环境完整重跑 `pnpm check:fast`：**1322/1322 PASS，0 FAIL**。
这关闭当前源码的测试门禁，不改变真实 Settings 资源或产品时延判定。
[同构建 Settings indexed 控制](../reports/2026-10-07-resident-l01-indexed-pressure-control.md)
进一步区分了两类真实符号：`HomeInitData` 的三次请求均被当前代 index proof
收敛为一批且结果 exact，但耗时 11.088–13.624 s；`MenuController` 的
proof 不适用，仍走 24 批并在 180.011 s 超时。两次拟执行的 L3 控制因
`EVICTION_NOT_OBSERVED` 未运行，诊断/整体状态失败。故 index 缩小不是
所有符号的资源安全兜底，更没有取得 L3 准入；L01 仍 BLOCKED。
[同构建 legacy 对照](../reports/2026-10-07-resident-l01-matched-strategy-ab.md)
六次请求全部精确，但首个构造器查询 60.734 s、两次 L3 恢复 26.990/
23.468 s，外采 Node RSS 峰值下界 1.537 GB。indexed 只完成四次中的
三次，两次 L3 控制未执行，故两边峰值不能当作等量工作因果收益。
[L3 多批次准入保护](../tdd/l01-pressure-multibatch-rejection.md) 已以公开
LSP RED/GREEN 增加默认关闭实验的 fail-closed 边界：压力下计划超过一批
则在启动 verifier 前显式报资源错误，不返回部分位置，也不重试 seeded
anchor。小夹具的单批精确仍通过；这不限制单批 RSS，更不是 Settings 或
原始 >3 GB 用例的资源门禁通过。L01 仍 BLOCKED、L02 未获准入。
[真实 Settings 两次 L3 复核](../reports/2026-10-07-resident-l01-pressure-guard-settings.md)
进一步确认：六次请求四次完整精确，两次 24-batch 计划在 verifier 启动前
84.5/96.9 ms 返回明确 `-32803`，诊断正常；整体仍 **FAIL**，不能把拒绝
请求计入完整语义成功，亦未证明 1,024 MiB 的硬上限或 500 ms 产品目标。
[两次独立新进程的 L3 后所有权复核](../reports/2026-10-07-resident-l01-post-eviction-ownership.md)
又确认：每轮四次 references 精确、一次 L3 后显式资源错误；第一次驱逐后
正常自动诊断重新创建 resident context，使 Node RSS 再增加约 173/156 MB。
第二次驱逐后两轮 Registry 引用均归零，但 30 秒空闲终点仍约 1.024/1.008 GB
Node RSS。该结果证明诊断重建与 RSS 平台，**不证明**存活 AST 泄漏；
post-GC live heap 与 PSS 归属仍未取得。下一 L01 安全切片须在不关闭或
漏报诊断的前提下，阻止持续 L3 下诊断反复准入重 resident Program，
并用公开 LSP、真实 Settings 与独立内存观测验证；在此之前 L02 不获准入。
[同构建诊断准入级别复核](../reports/2026-10-07-resident-l01-diagnostic-admission-level.md)
纠正了“L3 驱逐之后”等于“诊断在 L3 准入”的推断：显式控制后的 v3
诊断虽创建 context 2，完成时实际为 `level1`；无显式压力的 20-edit
回放 22/22 exact、诊断通过，四次自动 L3 驱逐，最终 v21 诊断的
423-file Program 在完成时实测 `level3`。只对该最终诊断有直接见证，不归因
全部四次创建。下一安全切片先用公开 LSP 锁定**实际处于 L3** 的自动
诊断准入与版本发布，再复核真实 Settings 和独立内存；正常诊断须保留，
L01 资源准入仍 BLOCKED，L02 未获准入。

[L3 transient diagnosis 真实 Settings A/B](../reports/2026-10-07-resident-l01-transient-diagnostic-ab.md)
完成了下一项默认关闭的机制检验。真实子进程 LSP RED→GREEN 保持未保存
v2 诊断并避免在实际 L3 再准入 resident context；但固定 API24 工程的
1,024 MiB、20-edit 自然压力对照中 ON 路径 **0 次调用**，峰值差异不能
归因于该机制。另一个单次 512 MiB 人为 L3、2-edit A/B 确实有 3/3 次
transient 诊断，references 4/4 exact、诊断 payload 相同、resident
创建/驱逐从 7/7 降为 4/4，却使 Node/process-tree RSS 峰值分别增加
20.2%/19.8%，空闲尾值也更高。因此本轮**资源 no-regression FAIL**；
实验双开关保持 default-off，不批准生产推广、预算提高或 L02 准入。
两组 `READINESS_UNSUPPORTED` 与已执行语义/诊断检查分列；Mac RSS 是
外采下界，不替代 PSS/post-GC 归属，也不能据此断言泄漏。下一 L01
安全工作必须同时核算 resident 与 transient compiler state 的总成本。
[后续两组反序、同构建的诊断阶段归因](../reports/2026-10-07-resident-l01-transient-diagnostic-phase-attribution.md)
均保持 4/4 exact 引用和完整诊断，但 ON 峰值相对 OFF 分别为 +17.0%
与 −19.6%；连同首次 +20.2%，**差值方向不稳定**。最后 v3 诊断启动前
两个 ON 进程已分别占 1.460 GB 与 0.809 GB Node RSS，单次实验不能区分
GC 时机、父线程保留状态与 Worker 成本。第一次 no-regression FAIL 是该
次运行的真实结果，但不是可重复回归结论；同样没有证明收益。路径保持
default-off，下一步取得受控 post-GC live-heap/object 归属和可用平台的
PSS，再作更多独立样本。L01 资源准入仍 BLOCKED，L02 未获准入。
[同构建三对真实 Settings L3 后 GC 归因](../reports/2026-10-07-resident-l01-post-eviction-gc-attribution.md)
已取得这一切片的受控存活堆证据：六个新进程各有四次 exact references
和完整自动诊断，末次压力请求均为明确 `-32803`，所以整体仍 FAIL；三次仅在
benchmark 双开关下的 Worker GC 使已淘汰 context 后 `heapUsed` 从
638–646 MB 降至约 33 MB，但即时 Node RSS 只降 29–31 MB。Registry
采样引用均归零。这反对**该已淘汰 context**存在持续强引用，却不证明
生产 RSS/PSS 达标，也不能把强制 GC 设为产品策略。下一 L01 安全切片应
防止可回收的旧 compiler heap 与正常诊断重新准入发生重叠，同时保留
完整诊断、精确全局响应和预算边界；真实 PSS、原始 >3 GB 案例及 500 ms
门禁继续开放。L01 资源准入仍 BLOCKED，L02 未获准入。
该 GC 控制显式使用 `legacy` 和默认关闭的压力准入保护；24 批请求的
`-32803` 是完整性拒绝，不代表生产默认 indexed 路径也必然拒绝。
[随后三次独立 Settings indexed-after-L3 控制](../reports/2026-10-07-resident-l01-indexed-after-l3.md)
确认同一固定 SDK 下实际发生 context sequence 1 的 L3 驱逐后，
`HomeInitData` 的 ready/identity-complete proof 收敛到一批，三次均
10/10 exact、正常诊断通过；完整响应 4.557/4.564/4.586 秒。
这仅证明该符号的精确恢复，不覆盖索引不支持的构造器：后者即使
generation ready，仍须保守验证 1,496 个文件／24 批，不能用类名导出
冒充构造器身份。prepared-suite 的 semantic readiness 仍
`READINESS_UNSUPPORTED`，资源稳定性与 500 ms 门禁均未通过。
[L3 后显式 Worker 回收三对反序 Settings 对照](../reports/2026-10-08-resident-l01-semantic-worker-recycle-ab.md)
进一步在默认关闭的 benchmark 双开关下，以固定修复后构建、正常诊断和
等长 10 秒观察窗口证明控制可安全替换已驱逐且静默的 semantic Worker：
六轮 definition 1/1、未查 refs 10/10 全部精确，三对采样 Node 峰值相对
对照低 31.3%／31.6%／29.3%，但 refs 中位仍为 4.524→4.574 秒。
独立公开 LSP RED/GREEN 还修复了 witness 超时与并发未保存编辑导致的
stale-overlay 缺陷。该结果不是自动回收许可：查询前 RSS 没有同比即时
回落，100-edit/保守多批/原始 >3 GB/PSS/跨平台与 ready-state 门禁未过；
L01 资源准入继续 BLOCKED，L02 不进入生产接线。

## L02 — 增量刷新与语义新鲜度（L01 GO 后）

先对函数体普通编辑做 real-LSP RED/GREEN：未保存 overlay、文件版本和
compiler snapshots 必须指向同一最新输入；记录 Program 是否换代、
未变更 SourceFile/SDK AST 的真实复用、重建阶段和 complete answer。
**Program 换代本身不等于增量失败，也不应要求编辑后保持同一个 Program；**
L02 要证明的是正确的新代际能避免不必要的全域重做，并在资源预算内
缩短完整响应。当前 L01 trace 已见编辑后 1495/1496 个 project
SourceFile 和 652/652 个 SDK SourceFile 被复用，但分组 Program 构建仍
约 1.08 s，故仅 AST 复用远不足以判 L02 通过。之后分别验证 public API、import、文件
创建/删除、package 和 SDK/target 变化，按失效范围重建而非复用旧状态。
任何未知依赖、版本跳跃或不可验证 delta 均保守重建；若结果滞后，
停用该快路径。S05 rejected compatible-disk flag 不作为 L02 已通过证据。

## L03 — 统一预算与成本感知回收（L02 安全后）

先实测 initial、steady、编辑、global query 和 recovery RSS/PSS，
再确定 soft budget、pressure target、hysteresis、lease 与冷上下文
驱逐顺序；一个进程内 resident LS 和 transient verifier 的内存合算。
不盲增现有 1024 MiB 策略值，不把它当硬限额。压力下优先停后台/
低优先任务与回收 unleased 状态；未保存文本和执行中语义状态不能
因节省内存丢失。20 次切换及更长 soak 无单调增长，L3 恢复精确。

## L04–L07 — 逐能力接线，逐能力回退

| 阶段 | 实施切片 | 不可省略的门禁 |
| --- | --- | --- |
| L04 | Resident references，缓存 → 已证明完整覆盖的热 LS → 现行 indexed-batched/transient exact fallback | 两种 declaration policy、alias/re-export、overlay、全合法 scope 与 legacy exact set；miss/旧代/内存压力仍完整，不能冒充空结果 |
| L05 | Implementations 独立路由 | interface/override/generic/继承/同名与编辑后结果分别 exact；references 的投影不替代 implementation proof |
| L06 | Definition/typeDefinition、completion/auto-import、hover/signature 与正常诊断 | 精确 URI/range、补全 edit/sort/snippet/isIncomplete、当前 overlay 和诊断 code/range/version；references 进行时交互不被阻塞 |
| L07 | PrepareRename/rename 与 call hierarchy | 完整 WorkspaceEdit/冲突/版本及应用后验证；incoming/outgoing 方向与 `fromRanges` 单独对照 |

每阶段只有独立完成公开 transcript 且通过正确性、快照、取消与新路径
资源安全后才可试验路由；逐能力 feature flag 可回滚。现行 transient
verifier 仍为兜底，不能因长驻 LS 存在就推断它的全局 scope 足够。
超预算/unknown 走完整安全 fallback 或显式错误。逐能力默认切换需
单独审查，ADR 0003 不被本计划自动 supersede。

## L08 — Soak、性能与发布评审

Settings 真实工程的冷准备、未查询符号、未打开模块、普通编辑、驱逐
和重启恢复分桶报告完整响应 P95；目标为适用能力各桶≤500 ms，
不能用 cache hits 稀释。保留旧 references >3 GB 复现/50% 目标、
DevEco 对照 PSS、100k 工作区缩放、post-eviction 与 Windows/macOS/Linux
可移植性门禁；Node RSS 不代替 Linux PSS。长时 repeated/edit/pressure
soak 不得单调增长，0 exact diff、0 partial-success、0 OOM。

任一发布必需门禁 FAIL/BLOCKED/NOT_RUN，则当前实验能力保持 default-off，
不宣称项目计划或 500 ms 产品目标完成。只有明确验证的 release review
才可逐能力毕业；旧 S02/S03/S05 失败记录永久保留。
