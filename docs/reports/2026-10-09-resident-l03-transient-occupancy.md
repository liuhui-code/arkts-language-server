# L03 真实 Settings 的 resident 与 verifier 重叠占用

日期：2026-10-09。两轮真实工程对照合计 **8/8 exact**，正常诊断和退出
通过；新生命周期指标确认了 resident context 与 transient verifier 的
重叠占用。保留 context 未在本轮带来可判定的 RSS 收益，且首次引用中
发生自然 L3 驱逐。L03 继续校准全进程预算与重建代价，最终验收仍在 L08，
不阻塞 L04–L07。

## 固定输入与实验范围

沿用 [生命周期核算切片](../tdd/l03-transient-worker-occupancy.md) 的构建，
parent `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`；
源码输入 `732279696995b0b40854dca9d380bb672155bae413e564a0c8802beddf2561be`，
server `392e27f80f172ed0dfc4af54336ddcbbf0fc67a3864e00bb8beeeb41b6bdb204`，
semantic Worker `e845e7648fb2af0eefdb32055ad1f0dd9bb77b33e10415ceea2886c55c9ed5b2`，
reference verifier `eecbc18b45eef4b41525581006d00b82d68facf17af02251dae203aa7a61808c`。
Settings clean `ecc550dfaed880e04e38a2477eb7235cd50475b9`，
工程 digest `4becf56cb2ff65cc58bd1ae53b6937b194f9020770ad397e526f3a51b85b0d40`；
API24 SDK digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`，ETS 6.1.1.125。
Node v26.3.0、backend 4.9.5-r10、Darwin 25.6.0 x64、12 logical CPU、
16 GiB RAM；完整 SDK、sidecar、lock、stdlib 身份在清单与原始报告中。

独立清单为 [dispose](../../bench/references/manifests/settings-resident-l03-occupancy-dispose-trace-api24.json) 与
[budget-aware](../../bench/references/manifests/settings-resident-l03-occupancy-retain-trace-api24.json)。两份输入除 retention profile、
benchmark ID 和指标文件目的地外深比较一致。旧清单的 pins 没有倒改。
每轮运行前、后及本轮结束的输入身份一致，真实工程及 SDK 没有修改。

顺序为 dispose → budget-aware，每轮独立进程，串行运行；资源采样期间
不并发测试或其它 benchmark。固定 `indexed-batched + closure + full SDK`、
batch 64、1024 MiB 策略、trace ON、请求 50 ms 外采、180 s 请求及诊断
deadline、10 s 正常关闭 deadline，诊断结束后观察 3 s idle。
1024 MiB 不是硬峰值限额。本轮没有显式 L3、强制 GC、诊断屏障或预算上调。

先查询 `IAboutDevicePageCtrl` implementation，再首次查询此前未查询的
`HomeInitData` class 引用，不含声明；随后仅在 LSP overlay 增加、移除
一个调用。沿用已固定的 source/edit hashes 和逐 URI/UTF-16 range oracle，
没有缩小工程边界。正常自动诊断保持，R-09、L02 晋升、自动 Worker 回收、
成本感知驱逐、L01 压力准入与 transient 诊断固定关闭。这是保留上下文的
资源归因对照，**不是 resident fast path 的效果对照**。

## 精确响应与物理生命周期

每轮 4/4 COMPLETE/exact：implementation 1/1，引用随 v1→v2→v3 为
9→10→9。两轮全部位置集合深比较一致；About v1 与 Home v3 最终正常
诊断均为空，完整诊断 payload 深比较一致。两轮 failure=null、
inputUnchanged=true，无 timeout、OOM 或 partial，LSP 子进程退出 0。
三次引用均为 cache miss，没有拿重复答案缓存充当 LS 复用。

每轮 32 个 owner 指标快照记录三段 reference verifier 存活，逐段
`0→1→0`，最大 owner 加 transient 数为 2；计数非负，PID 与真实 LSP
子进程相同，时钟单调，最后 transient 数为 0。anchor 和诊断 verifier
未在此控制中启动，不能以其零计数宣称这些重叠组合已经验证。

dispose 第一次引用前将 resident context 从 1 移除到 0，三段 verifier
均未观察到 resident context 重叠。budget-aware 第一次保留 1 个 context，
指标观察到它与 1 个 reference verifier 同时存活；该 verifier 生命周期
内，正常压力政策以 `memory-level3` 驱逐无 lease 的 context，第二、第三次
引用前 resident 已为 0。两轮均创建两次 owner context，第二次用于后续
正常诊断；不是保留策略始终保持原 LS。

每次引用仍新建 transient verifier，准备的 Program 都含 676 个 source，
其中 project 153、SDK 410；分组 `createProgram` 观测耗时为
2,478.5–2,789.5 ms。R-09 固定关闭，不能据此推断它不能减少重建。
SourceFile/文本数量及这些耗时不是独占内存字节或未来冷恢复保证。

## RSS 与本次响应耗时

以下为单进程、trace ON 归因样本，不是产品 P95 或稳定收益。

| 观测 | dispose | budget-aware |
| --- | ---: | ---: |
| 首次 implementation | 10,254.7 ms | 9,313.7 ms |
| 新 Home 引用 | 3,920.6 ms | 3,623.4 ms |
| 增加未保存引用 | 3,461.7 ms | 3,422.0 ms |
| 移除未保存引用 | 3,458.5 ms | 3,609.9 ms |
| 外采 Node RSS 峰值 | 1,173,614,592 B | 1,169,137,664 B |
| 外采产品树 RSS 峰值 | 1,351,475,200 B | 1,347,121,152 B |
| 3 s idle 最后 Node RSS | 749,842,432 B | 785,633,280 B |

Node/产品树峰值差异仅 -0.38% / -0.32%；每种策略只有一个归因进程，
顺序没有反转，**不能宣布资源收益或 no-regression**。所有引用仍 >500 ms。
外采实际 P50 为 121–122 ms、P95 为 128–130 ms、最大间隔 136–143 ms；
请求区间均有采样覆盖，峰值是采样下界，Mac RSS 不是 PSS。

指标 RSS 是整个 Node PID 一次计量，包含其 Worker threads；不得将
verifier 日志里的同一进程 RSS 再相加。heapUsed 等字段只观察 owner
isolate，不代表 verifier heap，更不能从总 RSS 差值算出某个 Program
的独占字节。dispose 第一次 verifier 已退出、resident/transient 计数均
为 0 时，Node RSS 快照仍为 1,121,243,136 B。因此移除 context、物理退出、
RSS 回落必须分别记账，不能把对象计数清零当作立即归还内存。

## 后续预算工作与验证状态

继续以当前全进程 RSS、实际存活区间及成功准备耗时校准 admission：
保留上下文的收益必须与完整覆盖见证/R-09 命中、避免的重建成本以及
与 verifier 重叠的峰值一起判断。已处置 context 不能按虚拟字节扣减，
未测成本不能用文件数、源码长度或单次 RSS 差值补造。下一实现切片
围绕这些约束推进，另保留单批、anchor/诊断重叠及恢复的公开正确性合同；
不盲调高 1024 MiB，不推广 budget-aware 默认。

本轮只新增实验清单、证据及计划记录，没有修改产品源码、构建脚本或
生产默认。现有重放器回归 **24/24 PASS**，退出 0，
19,804.871373 ms，完整 transcript；同源码最近的语义组合仍为
153/153 PASS，不把两次不同运行相加成一次组合。完整 check:fast
**NOT_RUN**，合并前须 fresh 运行。

两份原始 suite 顶层仍为 **FAIL / READINESS_UNSUPPORTED**，runner
退出 1；与 8/8 exact、诊断 PASS 和产品进程退出 0 分开记账。没有伪造
semantic-ready。最终内存、500 ms/P95、soak、DevEco/PSS 与跨平台评审
统一留在 L08，不作为 L01–L07 的实施阻塞。

原始 [dispose 报告](../../.bench/l03-occupancy-settings-dispose-trace-1.json) /
[budget-aware 报告](../../.bench/l03-occupancy-settings-retain-trace-1.json)、
[dispose 指标](../../.bench/l03-occupancy-settings-dispose-trace-1.metrics.jsonl) /
[budget-aware 指标](../../.bench/l03-occupancy-settings-retain-trace-1.metrics.jsonl)、
[配对校验摘要](../../.bench/l03-occupancy-settings-pair-analysis.json) 和
[重放器回归](../../.bench/l03-occupancy-settings-runner-tests.log)
保留可重放输入、原始位置集合、全部外采 RSS、时序、指标及 hashes。
