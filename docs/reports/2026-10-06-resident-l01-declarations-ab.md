# L01 Settings/API24 `includeDeclaration=true` A/B/C 回放

状态：**查询正确性 PASS；L01 semantic-ready / 500 ms / memory release gate 未通过。** 本报告是 2026-10-06 当前未提交 server 输入的诊断性对照，不是生产策略切换依据。

## 固定输入与重放

- Settings checkout：`.bench/real-projects/settings-ecc550`，`ecc550dfaed880e04e38a2477eb7235cd50475b9`，工作树干净；工程 catalog 为 1846/1846，跳过 1 条目。没有改工程边界、造文件或关闭自动诊断。
- SDK：`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`，API 24 / `6.1.1.125`，声明 digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`。这是显式 API24 兼容性实验，不冒充项目声明的 API23/26 SDK。
- Server HEAD：`72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`；未提交 server 输入 digest `732e7a6f48005573989243c1c2064e7ad071011246c11269bb1ae0462ccf9951`；`dist/server.cjs` digest `99d16dc05bd8ca74cf538de80b39ac805c47de92ec98b2079924995220e0f5b2`。后续源码变化会使清单 pin 预检拒绝执行，不能仅凭 HEAD 重构本次 dirty build。
- macOS Darwin 25.6.0 x64，Intel i7-9750H，12 logical cores，16 GiB RAM；Node `v26.3.0`；backend `4.9.5-r10`。真实子进程启动参数是 `node dist/server.cjs --stdio`；测试工具自身 RSS 与目标 Node PID 分别记录。
- [indexed-batched 清单](../../bench/references/manifests/settings-resident-l01-declarations-indexed-api24.json) 和 [legacy 清单](../../bench/references/manifests/settings-resident-l01-declarations-legacy-api24.json) 除策略字段与 benchmark ID 外相同：`closure + full SDK`、64 roots、`dispose` context retention、`ARKTS_SEMANTIC_SESSION_REUSE=off`、1024 MiB、trace off、正常自动诊断；两份文档均在首次请求前 `didOpen`，之后没有 `didChange` 或第二次 `didOpen`。

历史冻结输入的重放命令如下（每条命令一个全新 server/sidecar 进程；输出路径必须不存在）。本报告形成后源码和构建产物已继续演进，当前工作树预检实际返回 `PREPARED_SUITE_BLOCKED=PIN_MISMATCH:serverInputSha256`；须恢复上述 digest 对应的源码/构建，不能改 pin 后将新结果混入本次 A/B/C：

```bash
node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-resident-l01-declarations-indexed-api24.json \
  --out .bench/semantic-ready-l01/declarations-indexed-next.json

node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-resident-l01-declarations-legacy-api24.json \
  --out .bench/semantic-ready-l01/declarations-legacy-next.json
```

现有 runner 通过 Content-Length stdio 向真实 server 发 `textDocument/references`，正常收集 `publishDiagnostics`，并由独立进程采样 server Node PID 与 sidecar。`readPreparedSuite` 的 pin、UTF-16 位置、oracle 及 postflight 输入检查均通过。**命令退出码 1 是 `READINESS_UNSUPPORTED` 的整体门禁结果，不是查询失败**；四次 raw report 内 `correctness.status=PASS`。

## A/B/C 与精确结果

两个目标都是 class declaration 位置（零基 UTF-16），`includeDeclaration=true`：

| 符号 | 相对文件与位置 | 已验证 Location oracle | 规范化集合 SHA-256¹ |
|---|---|---:|---|
| `MenuController` | `common/src/main/ets/core/controller/MenuController.ets`，70:13 | 248 | `7a8049b364e7cb2da8c7b4a0b1c77f34c85fdccbd9bac33f557c5e45d319a4ee` |
| `HomeInitData` | `common/src/main/ets/sendable/HomeInitData.ets`，16:13 | 10 | `93a304c4f97d9f0bdd943b9d5db29253a26d725a5cb39530fec9f8eaf4b75a8c` |

¹ 对报告内已规范化、按 ordinal 排序的 Location tuple JSON 行连接后计算；四次运行均与各自 oracle exact equality，missing/extra/duplicate/invalid 均为 0。原始 Location、URI/range 校验结果在以下 raw JSON 中。

| 新进程 | 进程启动→catalog ready | B：首次 `MenuController` | C：同快照、跨文件首次 `HomeInitData` | 两次相同请求 | 自动诊断 |
|---|---:|---:|---:|---:|---|
| A indexed-01 | 19.508 s | 9.162 s | 8.061 s | 2.5 / 1.7 ms | 两文件 v1：1 / 0 条 |
| B/C legacy-01 | 16.260 s | 12.773 s | **177.8 ms** | 2.5 / 2.0 ms | 两文件 v1：1 / 0 条 |
| A indexed-02 | 34.899 s | 16.060 s | 23.880 s | 13.7 / 3.6 ms | 两文件 v1：1 / 0 条 |
| B/C legacy-02 | 20.438 s | 15.691 s | **225.0 ms** | 5.4 / 1.6 ms | 两文件 v1：1 / 0 条 |

这里的 A 是当前生产默认 `indexed-batched + closure + full SDK`；B 是 `legacy` 首次全域请求；C 是**同一个 legacy 进程中不同且此前未查询的跨文件符号**，不是结果缓存命中。重复列才是 exact-result cache control，日志明确出现 `references.cache.hit`，不能作为 LanguageService 热复用证据。A 的两次首次请求均有 `references.index.accepted`：候选分别 60、3 个文件；第二次查询前 `references.context.retention` 为 `profile=dispose, residentBefore=1, residentAfter=0, removed=true`。这直接证明当前默认路径把现有 resident context 移除，却不能单凭 trace-off 数据精确分摊 `createProgram`/checker/worker 耗时。

两次 indexed 的首次跨文件查询都远超 500 ms；两次 legacy C 低于 500 ms，但 B 首次查询仍是 12–16 秒。因样本仅每策略 2 次且机器负载波动，不计算正式 P95、置信区间或可信内存收益比。

## 外部 RSS 与请求时间线

所有 RSS 数字为**独立 sampler 对目标 Node PID 的采样下界**，不是强制 GC 后 heap；worker_threads 的 RSS 已包含在同一 Node PID，不重复相加。`product` 是 Node + sidecar；sampler 自身不计入产品 RSS。

| 新进程 | Node PID | 采样 Node peak | Node+sidecar peak | 请求 B 开始→结束² | 请求 C 开始→结束² | 50 ms 目标的实际采样间隔 p50 / p95 / max |
|---|---:|---:|---:|---|---|---|
| indexed-01 | 18489 | 757,653,504 B | 763,744,256 B | 19.513→28.800 s | 28.800→36.863 s | 147 / 190 / 250 ms |
| legacy-01 | 19125 | 750,350,336 B | 801,824,768 B | 16.264→29.172 s | 29.173→29.352 s | 141 / 157 / 183 ms |
| indexed-02 | 19711 | 571,936,768 B | 576,417,792 B | 34.913→51.505 s | 51.505→75.401 s | 192 / 455 / 1167 ms |
| legacy-02 | 20586 | 690,659,328 B | 744,673,280 B | 20.444→36.311 s | 36.312→36.538 s | 155 / 200 / 246 ms |

² 单位是从各自 server-process-started 起的单调时间。两次 `didOpen` 均紧邻 catalog ready 且早于 B；`publishDiagnostics` 在四次运行中都出现，部分晚于 C（正常异步诊断），没有被禁用或错误归因到 references。indexed-02 的 catalog 准备 34.9 秒、采样 p95 455 ms/max 1167 ms，说明系统当时存在明显负载/调度波动；短暂峰值可能被漏采。单次 indexed/legacy RSS 高低不能用于发布内存判断。

原始时间线、逐次外部 RSS 曲线、目标 PID/sidecar/sampler 独立记录、完整 normalized Location、serverEvents 与 LSP transcript 保存在以下本机 ignored artifacts：

- `indexed-01`：`.bench/semantic-ready-l01/declarations-indexed-01.json` — SHA-256 `2c99b59e5c7ae58d61b39800f01fa74aed7fbbc510eb77a5dab04b0e46f6ce2c`
- `legacy-01`：`.bench/semantic-ready-l01/declarations-legacy-01.json` — SHA-256 `378fc0e6ca46f2a207def0d7c825301d6c8d60be4dafdff9e341e6420823299d`
- `indexed-02`：`.bench/semantic-ready-l01/declarations-indexed-02.json` — SHA-256 `200b71a3269bfa64e90b24a77d32b39132e68067bdb3bf84c50e9035cf528f79`
- `legacy-02`：`.bench/semantic-ready-l01/declarations-legacy-02.json` — SHA-256 `58ec39c8f962aebb9532bd3779c79b7234bfd5e3d74a5f7c209a6e5a696a2919`

回放代码快照：`replay-references.mjs` SHA-256 `3be215bf42618960a67a91eca9c2cb4a6088195c3957e6ae65fb5f9ca361be06`，`prepared-query-suite.mjs` `9d36849d593e8f53ed3b503e32b208d3a1d1566ac348e483fd3ca952b6c1b7bf`，`prepared-suite-input.mjs` `34c13859c87ed600fff54939df8d1f332cde8da96381d16c09a4352ebe5669dd`。

## 结论边界

1. 两策略的 `includeDeclaration=true` 两个真实符号均 4/4 精确；总计 16/16 请求正常完成，诊断和 pin 检查正常。当前默认 indexed 确实使用了 index（不是隐式 legacy fallback），但它仍未让第二个不同符号在 500 ms 内完成。
2. legacy 的同快照跨文件 C 两次达到 178–225 ms，支持“昂贵语义状态已经支付时，新的全域 references 可以快速回答”的方向；**没有 trace-on Program identity 或 checker 直接证据，不能据此断言具体内部复用对象。**
3. `readiness.semantic=READINESS_UNSUPPORTED`，整体 gate `FAIL`、延迟与 memory release gate `BLOCKED`。不得把 catalog ready 当 semantic-ready，也不得把两次 C 的 <500 ms 宣称为项目目标达成。下一步需要官方 LS/Program generation-bound readiness、受预算的 resident 生命周期、同语义快照失效与 memory/soak gates；本回放没有修改这些策略。
