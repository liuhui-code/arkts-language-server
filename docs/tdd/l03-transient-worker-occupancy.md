# L03 transient Worker 生命周期核算

日期 2026-10-08。接续 [准入前 RSS 刷新](l03-reference-pressure-sampling.md)，
本切片补齐 reference、anchor 与诊断 verifier 的实际存活计数和
带时钟的进程内存快照，为后续统一预算校准提供输入。RSS 按 Node
PID 只计一次，计数不换算成 Program 字节；预算、调度、默认路由和
正常诊断不变。L03 仍 IN_PROGRESS，最终资源验收仍在 L08。

## 指标责任抽取与公开 RED

父 HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`，起始源码输入
`8222df6560f09e8ffb1cf33d94b73287340b69505656ec8599035f4cccea063a`。
旧指标的 `semanticWorkerCount=1` 表示单个 semantic owner，不包含
临时 verifier。它不是整个 Node PID 中所有语义 Worker 的存活数；
一个 resident context 也不是一个独立 Worker。

先以现有 production LSP 与 metrics/policy characterization
2/2 PASS，4,942.387155 ms，保护旧单 owner、两个 contexts、RSS
不叠加及 v2 completion 合同。随后将指标 I/O 从 runtime 抽到
既有 metrics 模块，压力决策仍留原处；重构后同命令 2/2 PASS，
4,997.194434 ms。旧 `semanticRuntimeMetrics` 格式化 API 的严格
对象合同保持，持久化记录随后才在行为切片中增加字段。重构有新
产物，不声称字节相同或已有资源收益。

四步逐项真实 Content-Length LSP RED，再做最小 GREEN：

1. reference：正确返回六处 Locations 后，旧指标仍无法表示
   resident LS 与物理 verifier 同时存活。父源码
   `ce07dec852a25168f3da0c7ccde249b62627226d1059a167539df52026e43e3b`；
   0/1 FAIL，2,806.845989 ms；1/1 PASS，3,029.242528 ms。
2. anchor：既有 compiler anchor 和完整引用正确，但 anchor 存活
   未核算。父源码
   `1fb9dd5deb852fd34444ae1369f2b9425e2918fb004a293a53d3cb07c51c88f8`；
   0/1 FAIL，1,883.783154 ms；1/1 PASS，2,024.303063 ms。
3. diagnostic：既有实际 L3 的 transient 诊断保持 v2 TS2304，
   却没有物理存活计数。父源码
   `c5fff752519625d62b3ff6bdab1e9df5c84273de48013ea1801816cb5cded42a`；
   0/1 FAIL，1,599.221866 ms；1/1 PASS，1,641.805105 ms。
4. 时钟：计数已正确，但记录不能按时钟与阶段/外部采样对齐。
   父源码
   `d1c3b7e1c665023b8298b4d05c887e15fdf45a1c625c8e736302fc39b13a7889`；
   0/1 FAIL，2,711.481689 ms；1/1 PASS，2,920.600183 ms。

这些 RED 是观测缺口，不是错误引用、丢失诊断或 OOM；旧语义断言
均先通过。原始转录 `.bench/l03-occupancy-*-red.log` 和
`*-first-green.log`，每步命令与身份见结构化 summary。
reference/时钟的同一命令后来扩为三用例，不把扩展控制重标为初始 RED。

```sh
node --test --test-name-pattern='physical transient references' tests/lsp-production-semantic-worker.test.mjs
node --test --test-name-pattern='usage-site anchor keeps transient isolation by default' tests/semantic/references-anchor-reuse.test.mjs
node --test --test-name-pattern='experimental L3 diagnosis publishes' tests/semantic/semantic-l3-reference-admission.test.mjs
```

## 实际退出与数据范围

只有配置已有 `ARKTS_MEMORY_METRICS_FILE` 才安装生命周期 observer；
未配置时不安装额外 Worker exit listener，也没有新实验 flag。
三处成功创建 Worker 后计入一次，直到 Node Worker 真正发出 `exit`
才减计数。启动、等待、语义查询和清理都包含在这个存活窗口中。
查询 result 或 cancellation response 本身不等同于物理退出；
没有 exit 见证就不伪造零计数。没有第二缓存/预算 owner、Program
身份表或随请求累积的历史 map。

记录保留原 `semanticWorkerCount=1`，分别增加三类 active count，
`transientVerifierCount` 为三类之和，`totalSemanticWorkerCount`
为 owner 加当前 transient 数。它们不是 Program/Checker 数量，也
不含主线程、独立 sidecar 或测试工具。原 `residentContextCount`
仍是 semantic owner 的 Coordinator 状态，不包括 transient 内部 LS。

`processId` 与 `rssScope=node-process` 明确 RSS 覆盖同一 PID
全部线程，只记录一份；`heapScope=semantic-worker-isolate` 明确
heap/external/arrayBuffers 是当前 owner isolate 的观测，不将其
误称整个进程或所有 Program 的独占内存。`epochMs` 与单调
`monotonicNs` 标识快照记录时刻，不提供独占 CPU 或精确 peak 保证。

周期快照保持原压力顺序。生命周期边界的额外快照只记录内存与
轻量 Coordinator stats，不调用 `getProgram`、不运行 GC、不更新
MemoryPolicy、不驱逐或调整准入。记录异常不改变 Worker 生命周期
和查询；I/O 错误仍写 stderr，stdout 仍仅用于协议。

## 公开控制与恢复

三类计数、tracing 关闭和客户端取消五用例串行 5/5 PASS，
12,067.530630 ms。reference 使用既有 `budget-aware` retention
功能配置，直接见证一个 resident context 与一个 verifier 共存，
total 为 2；这不是生产默认 retention 的推广。正常成功的物理
计数变化为 `1→0`，取消后恢复为 `1→0→1→0`，不早清零、
不负计数，取消仍唯一 `-32800`、无部分 Locations。
同进程恢复完整六处引用，正常 v2 诊断和 emoji 后 UTF-16 definition
精确，shutdown 退出 0，无 Worker fatal。

reference fixture 的 SDK version 为 `test`，属于未验证的
plain-TypeScript-compatible 合同；anchor 复用既有 scripted catalog
与 missing-SDK 控制。诊断的 1 MiB、reference 的 1500 ms delay
均为功能干预，不当作真实工程预算或产品时延。三类独立控制不
声称已测得 reference 与 transient diagnosis 同时存活的资源效应。

## 当前验证与后续预算

`pnpm check` 和 `pnpm build` PASS；十五文件串行 focused
**153/153 PASS**，0 fail/cancel/skip/todo，退出 0，658,839.672415 ms。
包括完整 anchor/reuse/seed 合同、resident 新鲜度、批次/semantic units/
constructor 覆盖、取消合并和调度、pressure admission、成本/lease、
十六个回收合同与 production Worker。完整转录
`.bench/l03-occupancy-focused.log`；逐步计数、命令、身份和文件哈希
见 `.bench/l03-occupancy-summary.json`。

当前源码输入
`732279696995b0b40854dca9d380bb672155bae413e564a0c8802beddf2561be`，
semantic Worker
`e845e7648fb2af0eefdb32055ad1f0dd9bb77b33e10415ceea2886c55c9ed5b2`。
server 与 reference verifier 主产物未变，diagnostic verifier 单独记录。
focused 前后源码/产物和只读 Settings/SDK pin 一致；focused 使用
夹具，不是该真实工程回放。手写代码与测试本切片均不超过 500 行；
runtime 因指标责任抽取从 483 减至 470 行，type engine 483 行，
metrics 81 行、lifecycle observer 21 行、production test 228 行、
压力测试 458 行、anchor 测试 495 行。本切片未修改既有超限文件；
Legacy 1058 行等迁移债务仍保留。

whole `pnpm check:fast` NOT_RUN，旧 1380/1380 不覆盖本源码；
请求合并前仍须 fresh whole。真实 Settings 同构建资源对照尚未
运行，不宣称峰值或时延收益，也不把物理计数归零当成 RSS 回落、
对象无残留或泄漏归因。统一 resident/transient 字节成本与 soft
budget 校准、candidate/anchor 准备和诊断重叠、单个已启动 Program
峰值、真实工程压力组合继续在 L03 实施；最终内存、时延、soak、
平台验收统一在 L08，不阻断前面的默认关闭能力切片。
