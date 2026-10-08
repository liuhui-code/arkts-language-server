# L01：Settings/API24 热态跨模块 definition 的 trace 归因

日期：2026-10-06。状态：**独立 trace-on 回放的 2/2 请求完整且精确；definition 的 1,309.4 ms 协议时间中，实测 compiler definition 回调为 2.6 ms。其余时间不能由现有事件精确分摊。** 这份报告只解释一次固定输入的执行顺序，不是新的产品时延或内存门禁结果。

## 固定输入与原始记录

- [trace-on manifest](../../bench/references/manifests/settings-resident-l01-hot-definition-trace-api24.json)，SHA-256 `c3110a0af657ac23cf983043df4d25f0b86833fda1c5f570c9d6642be4275675`，只从[既有 trace-off manifest](../../bench/references/manifests/settings-resident-l01-hot-definition-api24.json)改变独立 `benchmarkId` 与 `ARKTS_REFERENCES_TRACE=1`。两项查询、精确 oracle、自动诊断、外部 RSS、50 ms 请求采样间隔及其余 runtime/pins 均相同。
- 真实 Settings checkout clean HEAD `ecc550dfaed880e04e38a2477eb7235cd50475b9`，workspace 摘要 `4becf56c…b0d40`；显式使用 DevEco ETS API24 `6.1.1.125` SDK，声明摘要 `8098b8ab…d4c6e4`。这是 API24 兼容回放，不代表工程原声明的 SDK23 或 DevEco 性能。
- Server revision `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`，source-input 摘要 `c5f961a4…30a`，`dist/server.cjs` 摘要 `99d16dc0…f5b2`，semantic worker `3353b595…49e`，sidecar `84597a63…796`；Node `v26.3.0`、`ohos-typescript@4.9.5-r10`。完整 pins 与回放后的逐项相等证明在原始 JSON（`inputUnchanged=true`）。实验固定 `legacy`、full SDK、`ARKTS_SEMANTIC_SESSION_REUSE=off`、1024 MiB；没有修改生产配置或构建。
- [trace-01 原始 JSON](../../.bench/semantic-ready-l01/hot-definition-trace-01.json) SHA-256 `48d85958…f016c1` 保留首次失败：sandbox 中外部 RSS sampler `spawn EPERM`，0/2 请求，未到 initialize，属于**采样环境阻断**，不用于语义或时延归因。取得只读进程采样权限后独立重跑的有效[trace-02 原始 JSON](../../.bench/semantic-ready-l01/hot-definition-trace-02.json) SHA-256 `3525da8e35415c4eb2dd37a836ad87a49330e86286dc6d3378526db0b7fa758b` 是下文唯一分析样本。

有效回放命令（新回放请换一个不存在的 `--out` 路径，并先满足所有 pin）：

```sh
node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-resident-l01-hot-definition-trace-api24.json \
  --out .bench/semantic-ready-l01/hot-definition-trace-02.json
```

真实 `dist/server.cjs --stdio` 子进程经 Content-Length LSP 交互；外部独立进程采样目标 Node PID。工具整体仍以 `PREPARED_SUITE=FAIL`、`READINESS_UNSUPPORTED` / exit 1 结束，因为当前没有输入代际绑定的公开 semantic-ready 合同。这里的 `correctness.status=PASS` 与该门禁分开判断。

## 协议结果与外部采样

候选 catalog ready（1846/1846 文件、skipped 1）用时 19.048 s，随后 `didOpen` MenuController 与 HomePageMenuManager 的 v1 文件。第一个 `textDocument/references` 完整准备同一 LS；第二个是该会话此前未查询的 `HomeInitData` 跨模块 `textDocument/definition`，而非重复结果缓存。

| 查询 | 协议用时 | 精确结果 | 备注 |
| --- | ---: | --- | --- |
| `MenuController` 声明处 references | 14,094.6 ms | 248/248 Location | `priorCompleteSnapshot=false`；首次完整 LS 准备 |
| `HomePageMenuManager.ets` `40:37` definition | **1,309.4 ms** | 1/1：`common/src/main/ets/sendable/HomeInitData.ets` `16:13–16:25` | `priorCompleteSnapshot=false`；预打开、未预查询 |

两次都是 `COMPLETE`；均 `missing=[]`、`extra=[]`、`duplicates=[]`、`invalid=[]`。正常 v1 自动诊断照常发布：MenuController 1×TS2307，consumer 1×TS2339；`gateStatus.diagnostics=PASS`。没有空结果、超时、LSP error 或部分成功，server 正常 shutdown / exit 0。

外部采样 230 个点，目标 Node PID `49051` 峰值 RSS `750,268,416 B`，目标进程树峰值 `753,553,408 B`；sampler RSS 单列，未加进产品 RSS。请求采样间隔 50 ms，实际 p95 `185 ms`、最大 `464 ms`，峰值只是采样下界，亦非 PSS 或 DevEco 对照。trace-on 观察 getter 和日志本身会影响时间及内存，故这些数值不与[三次 trace-off 结果](2026-10-06-resident-l01-hot-definition.md)合并成分布。

## 事件顺序与归因边界

第一条 references 的 `references.queue.start.queueWaitMs=1.47`。其 document preparation 分组耗时 `1,806.1 ms`，其中 project membership `1,573.9 ms`、workspace preload `107.6 ms`、dependency closure `83.8 ms`、overlay authority `39.4 ms`；`semantic.prepare.complete` 为 `19.2 ms`。compiler references 回调 `11,692.2 ms`，其中 fork 的 **1 条分组** `createProgram` 事件累计 `9,872.4 ms`；回调其余 `1,819.8 ms`。这些阶段只归于首次 references，不能转给第二条 definition。

第二条请求的关键事件按 UTC 顺序如下。日志时间戳是毫秒粒度；小间隔不要当作独立精确耗时：

| 事件 | 时间 | 观察 |
| --- | --- | --- |
| harness 发送 definition | `04:50:01.557` | 协议计时开始 |
| Menu v1 `diagnostics.program.complete` | `04:50:01.691` | post-diagnostic Program / Checker sequence `1 / 1` |
| consumer v1 `diagnostics.program.complete` | `04:50:02.802` | post-diagnostic sequence `2 / 2`；1,483 个工程 SourceFile 对象曾观察、13 个首次观察，652 个 SDK SourceFile 曾观察 |
| `semantic.prepare.complete` | `04:50:02.809` | registry engine prepare `0.24 ms`、`newEntry=false`；不是整个 document/project prepare |
| `semantic.definition.complete` | `04:50:02.864` | compiler definition 回调 `2.56 ms`，collector available，`createProgramEvents=0`、`createProgramMs=0`；post-query sequence `2 / 2`，1,496 个工程及 652 个 SDK SourceFile 曾观察 |
| 完整 LSP definition 响应 | 约 `04:50:02.867` | harness `1,309.4 ms`、exact |

全程一次 `semantic.context.create`，之后观察到 reuse，没有 context eviction。第一次 references 后 Program / Checker sequence `1 / 1`；第二条 definition 前完成的 consumer 诊断已观测到 `2 / 2`，definition 后仍为 `2 / 2`。这说明对象身份变化**在诊断后置观察时已可见**，不能把它归因于 2.56 ms 的 definition 回调，也不能凭稳定的最后两个 sequence 证明内部对象没有变化。`createProgramEvents` 是 fork 的分组 trace 记录数，不是精确 Program 构造次数；definition 的零记录仅覆盖该回调，诊断及未插桩阶段没有相同 collector 计数。

definition 没有对应的 queue-start 或 document/project-prepare 分组事件。两条自动诊断确实落在其协议等待区间内，但现有 trace 不能定量区分 worker 排队、诊断执行、文档/工程准备及回调后的结果观察。`semantic.prepare.complete` 只计 registry engine prepare；不能据 `0.24 ms` 推断整个准备免费。Program / Checker sequence 与 SourceFile 复用计数均来自后置探针；尤其 `getProgram()` / `getTypeChecker()` 可能改变后续 trace-on 执行，Checker sequence 也不是查询内部复用证明。

因此本轮仅支持“这个完整 definition 响应的大部分墙钟时间发生在已插桩的 compiler definition 回调之外，且自动诊断和一次 Program 身份变化与该请求重叠”。单个 trace-on 进程没有稳定分布，不能将 `1,309.4 ms` 当作产品 SLO 样本，不能单独判定重建原因或证明 L02 增量 Program 复用；semantic-ready、500 ms 产品门禁与内存发布门禁仍需各自验收。
