# L01：Settings/API24 预打开双文件、同快照新符号回放

日期：2026-10-06。状态：**实验正确性 PASS；三次 trace-off 控制中两个新符号均 <500 ms；产品 semantic-ready/内存门禁仍 BLOCKED。**
本轮仅增加冻结 benchmark 输入和本报告；生产默认 `indexed-batched + closure + full SDK`、worker、诊断、缓存、内存阈值均未修改。以下前三次属于**历史冻结源码**，不是当前工作树的性能分布；后续 trace 观测代码有独立修正时必须重锁 pins，不能沿用此分布的构建身份。

## 冻结输入、语义范围和命令

- 原始 Settings checkout `.bench/real-projects/settings-ecc550` clean，HEAD `ecc550dfaed880e04e38a2477eb7235cd50475b9`；工程声明 compile SDK23、target/compatible SDK20。本轮明确选择本机 DevEco SDK API24 `6.1.1.125`（`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`），declaration digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`，不主张 API23 工具链等价。
- Server HEAD `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`，当时未提交的 source input digest `2c2ba1dc4eb6e16efe65d5403b3fb354ff3a5bcc3c25914548009b0d36850a60`；`pnpm build` exit0，server bundle SHA-256 `99d16dc05bd8ca74cf538de80b39ac805c47de92ec98b2079924995220e0f5b2`，semantic worker `42889a8e4d988064998e32f78edc6a6989fdd7eca4fdb3234b9f4a67fcbfb22c`，sidecar `84597a63c396ceaf2a84a3ded455b5cc29d21b6c4ad3c049f7b3ca820c2fd796`。Node `v26.3.0`，`ohos-typescript@4.9.5-r10`。
- 冻结 trace-off [manifest](../../bench/references/manifests/settings-resident-l01-preopen-api24.json) 原 SHA-256 `6be8a7af1fc517ea79e727a1b78f3fa3b10d2798463fa24d4fe7bcfea96dbe9d`；`ARKTS_REFERENCES_STRATEGY=legacy`、`ARKTS_SEMANTIC_SESSION_REUSE=off`、full SDK、默认 1024 MiB、trace-off。`legacy` 仅用来实验 full long-lived LanguageService；当前产品默认未切换。
- Frozen runner SHA-256：`scripts/bench/replay-references.mjs` `3be215bf42618960a67a91eca9c2cb4a6088195c3957e6ae65fb5f9ca361be06`；`prepared-query-suite.mjs` `9d36849d593e8f53ed3b503e32b208d3a1d1566ac348e483fd3ca952b6c1b7bf`；`prepared-suite-input.mjs` `34c13859c87ed600fff54939df8d1f332cde8da96381d16c09a4352ebe5669dd`。suite 的 server-input pin 不包含 benchmark runner，故单列。
- macOS Darwin 25.6.0 x64，Intel i7-9750H、12 logical CPUs、16 GiB RAM。外部 sampler 分别记录目标 Node PID、sidecar process-tree 和 sampler；worker thread RSS 不重复相加。

当冻结 source/build 与 manifest pins 相符时，原命令为：

```sh
node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-resident-l01-preopen-api24.json \
  --out .bench/semantic-ready-l01/preopen-default-next.json
```

`--out` 必须不存在；macOS `ps` 只读采样须获权限。冻结 source input 后来变更则该命令会因 `PIN_MISMATCH` 拒绝，不能偷偷重建/覆盖此分布。prepared-suite 总状态固定为 `PREPARED_SUITE=FAIL`、exit1，因为仍没有 generation-bound semantic-ready 公共合同；下面的 **correctness PASS** 是单独的查询/诊断控制，不是完整产品 PASS。

## 不变快照的实际请求序列

每个新进程先完成 sidecar catalog（1846/1846、skipped 1，状态 `ready`），然后在**首个显式 LSP references 请求前**顺序 `didOpen`：

1. `common/src/main/ets/core/controller/MenuController.ets`；
2. `common/src/main/ets/sendable/HomeInitData.ets`。

之后无 `didChange`、`didClose` 或新的 `didOpen`，依序发 `textDocument/references`，全部 `includeDeclaration=false`、zero-based UTF-16：构造器使用处 `MenuController` `90:17`（267 个 Location；首次 full-scope 请求），同文件 class declaration `MenuController` `70:13`（247 个；此前未请求但与构造器属于同一声明家族），**另一已打开文件、独立符号** `HomeInitData` `16:13`（9 个；此前未请求），再分别重复 HomeInitData 和 MenuController class 一次。两文件同属 `common`，所以本控制证明跨文件，不证明跨 module。普通自动诊断仍开启并等待两个 v1 publication；它们可能在首次 refs 前/期间做编译工作，不能把首次请求全部归因于 Program 创建。

| trace-off 独立新进程 / 本机原始数据 | catalog candidate-ready | 首次构造器 refs | 同文件新 class | 预打开跨文件新 HomeInitData | 两次重复 | Node PID peak RSS | 外部采样 p95 间隔 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [01](../../.bench/semantic-ready-l01/preopen-default-01.json) | 17.708 s | 13,683.4 ms | 280.0 ms | 165.9 ms | 1.4 / 2.3 ms | 743,383,040 B | 175 ms |
| [02](../../.bench/semantic-ready-l01/preopen-default-02.json) | 19.335 s | 14,015.4 ms | 254.0 ms | 156.2 ms | 1.5 / 2.4 ms | 754,839,552 B | 187 ms |
| [03](../../.bench/semantic-ready-l01/preopen-default-03.json) | 17.430 s | 13,640.0 ms | 276.7 ms | 165.3 ms | 1.3 / 1.9 ms | 794,796,032 B | 176 ms |

三进程各 5/5 `COMPLETE`、精确 URI+UTF-16 range 与既有 oracle 相等，总计 **15/15**，zero missing/extra/duplicate/invalid；版本 1 诊断各为 MenuController 1 条、HomeInitData 0 条，正常 shutdown/exit0，pre/post input pins 一致。首次 full-scope refs 中位 13.68 s；同文件新 class 中位 276.7 ms；预打开跨文件新符号中位 165.3 ms。每次重复请求均是 `references.cache.hit`，其 1–3 ms 不能归因于 compiler reuse。

原始 RSS 曲线在各本机 JSON 的 `memory.samples`、请求/诊断时间在 `timeline`、精确 Location 集在 `requests[].correctness.locations`。要求 50 ms 外采样，实际 p95 间隔 175–187 ms；这些 peak 是采样观察下界。三进程 process-tree peak RSS 约 747/795/847 MB；不是 macOS PSS 或 DevEco 对照，也不能关闭原 >3 GB/50%/post-eviction 内存门禁。

## 分离的 trace-on 归因

只把同一 manifest 的 `ARKTS_REFERENCES_TRACE` 临时改为 `1` 后，用独立新进程得到 [trace-on 原始数据](../../.bench/semantic-ready-l01/preopen-trace-01.json)，suite digest `f37cd75009f38c02296200a5c264de67adfc747d2ecf9e7c2944d23a264c19e5`；随后恢复 trace-off manifest。trace-on 的 5/5 请求也 exact、诊断/退出正常，但时延不与 trace-off 产品数据混合。

三个 cache miss 均记录 `semantic.references.complete`：首次 compiler references callback 10,567.8 ms，fork collector 中 `createProgram` grouped event 1 个、累计 8,496.0 ms；后续同文件 class 与预打开跨文件 HomeInitData callback 为 203.5/129.0 ms，期间 `createProgram` event 均为 0。观测到 `semantic.context.create` 1 次、reuse 13 次、无 eviction，两个重复为 result-cache hit。三个**查询后**的 `getProgram()` 观测均给出本 isolate `programSequence=1`、2261 SourceFiles（1496 project、652 SDK、113 other）；两个正常诊断观测也见 sequence 1。该 post-query probe 可能自行 build/refresh，`programSequence` **不是查询内部 TypeChecker 身份或准确 Program 构建次数**；0 grouped events 也不排除 prepare/诊断/后置观测中的工作。

## 状态与剩余证据

- 本次**跨文件、同预打开 snapshot、未查询符号控制 PASS**：独立 HomeInitData 的三次 trace-off 完整响应为 156–166 ms 且 exact。pre-open 同时正常触发诊断；没有为了时延关闭能力。
- **不是 500 ms 产品毕业**：只有一个跨文件符号/一个 module、三次进程、无编辑/驱逐/重启；prepared-suite 的 `READINESS_UNSUPPORTED` 仍使产品 latency gate BLOCKED。上一 L01 非预打开控制还有 1,025 ms 新符号样本，不能因为本次 3/3 <500 就宣称稳定。
- **不是内存毕业**：外部采样分辨率、真实 >3 GB 案例、长时间 churn、PSS/DevEco、release memory gates 尚未完成。更大工程 full Program 的峰值及 budget-aware 淘汰要继续测；本轮没有提高 1024 MiB 默认预算。
- 这里的 frozen manifest/runtime 与原始 .bench JSON 属本机证据；一旦 trace helper 后续源码修复进入工作树，应另跑新 pin 的 smoke，并与此三进程分布分列，不将不同源码版本混算。

## 后续观测隔离修复后的当前工作树 smoke（不并入三次分布）

在默认关闭的 trace helper 增加“观测异常不能使已成功的 refs 变成 LSP 错误”保护后，重新冻结源码并构建。此时 `serverInputSha256=732e7a6f48005573989243c1c2064e7ad071011246c11269bb1ae0462ccf9951`、`semanticWorkerSha256=e1847aa42e52e1340e29a6c5bedf3250ed563148c4d8495fe0f186a854e8fb60`；server/sidecar/Settings/SDK 其余 pin 不变。现在的可重放 [manifest](../../bench/references/manifests/settings-resident-l01-preopen-api24.json) SHA-256 为 `132df2c6bd757bdec495d78b75f616e779282d2384de4778303914fd0479ec5a`，`readPreparedSuite` pin 预检通过。前一节的 `6be8a7...` 是历史 suite digest，不再是当前 manifest 文件摘要。

当前源码与构建保持不变时，执行命令（选择新的、不存在的 `--out`；外部 macOS `ps` 采样须有权限）：

```sh
pnpm build
node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-resident-l01-preopen-api24.json \
  --out .bench/semantic-ready-l01/preopen-current-smoke-next.json
```

独立新进程 [smoke 原始 JSON](../../.bench/semantic-ready-l01/preopen-current-smoke-01.json)，SHA-256 `99d7ef227036ebfc63e658fc31c2718583668057b3472c5a3e4ebc67e82d8bd1`：catalog candidate-ready 19.428 s；两个 `didOpen(preOpen=true)` 均先于首个请求且之后无新打开/编辑；首次构造器 14,010.9 ms / 267 exact，同文件未查 class 260.5 ms / 247 exact，预打开跨文件未查 HomeInitData 164.8 ms / 9 exact，两次缓存重复 1.6/2.5 ms。5/5 `COMPLETE`、zero missing/extra/invalid/duplicate，普通 v1 诊断 1+0，输入前后 pin 一致，server shutdown exit0。外部目标 Node PID RSS 采样 peak `743,866,368 B`，process-tree peak `793,890,816 B`；222 样本、要求间隔 50 ms、实际 p95 191 ms（最大间隔 568 ms）。采样峰值仍是下界。

`prepared-suite` 仍如实以 `READINESS_UNSUPPORTED`、整体 exit1 结束：这是**当前构建功能/资源 smoke PASS**，不是 semantic-ready 500 ms、长期内存或产品发布 PASS。它只有一个新进程，不能与历史三次凑成四次同构建统计；未来任何 source/build/SDK 变化还需重新 pin。

最终工作树验证：`pnpm build`、`pnpm check`、`tests/prepared-suite-cli.test.mjs`
23/23、`tests/semantic/semantic-context-lifecycle.test.mjs` 18/18 通过；
`git diff --check` 通过。一次 `pnpm check:fast` 在外部工作目录 CLI
冷补全用例出现失败，继续运行约 15 分钟后于长测试期间中止（exit 130），
故**没有全套 GREEN**；该 CLI 文件无并行负载隔离复测 3/3 通过。
这支持负载敏感的可能性，但没有取得失败时完整错误，不能认定根因或
把隔离复测当作整套门禁的替代。
