# L01：Settings/API24 未保存引用编辑后的精确性与 Program 代际

日期：2026-10-06。状态：**L01 新鲜度控制 PASS；编辑后首次完整响应性能 FAIL；L02 增量复用未获证明；产品 readiness / 内存发布门禁仍 BLOCKED。**
本轮只新增固定回放输入、原始报告和本分析，没有修改生产 semantic 策略、worker、预算、诊断或工程边界。

## 可重放输入与命令

- [trace-off manifest](../../bench/references/manifests/settings-resident-l01-edit-reference-api24.json)，SHA-256 `93f656e99e998458493d852ce72533bc5efdcf393ff5fc6dcf1a907bb5bf65e1`；[独立 trace-on manifest](../../bench/references/manifests/settings-resident-l01-edit-reference-trace-api24.json)，SHA-256 `abc80b38dde46e24d7a9cf6cecccc8a6848551524cbfb9493c3373cbc549712d`。
- 真实 Settings checkout `.bench/real-projects/settings-ecc550` clean，HEAD `ecc550dfaed880e04e38a2477eb7235cd50475b9`、workspace 文件 digest `4becf56c…b0d40`。工程原声明 compile SDK23、target/compatible SDK20；本轮显式使用本机 DevEco API24 SDK `6.1.1.125`，路径 `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`、声明 digest `8098b8ab…d4c6e4`。**不是 API23 或 DevEco 等价性结论。**
- Server HEAD `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`，当时未提交 source input digest `cc7444a87204160f0eb8fe5a8c4d97c605238c2726c07c560a42f48f4f1bfb34`；`dist/server.cjs` SHA-256 `99d16dc0…f5b2`，semantic worker `02d3d310…600b`，sidecar `84597a63…796`。Node `v26.3.0`、`ohos-typescript@4.9.5-r10`；macOS Darwin 25.6.0 x64、Intel i7-9750H、16 GiB RAM。
- 回放工具字节身份另行固定：`replay-references.mjs` SHA-256 `3be215bf…1be06`、`prepared-query-suite.mjs` `9d36849d…b7bf`、`prepared-suite-input.mjs` `34c13859…669dd`、`prepared-query-report.mjs` `07379735…a5a`、外采脚本 `sample-process-tree-rss.mjs` `dd57585c…af067`；server-input digest 不涵盖这些 benchmark 脚本。
- 实验标志为 `ARKTS_REFERENCES_STRATEGY=legacy`、full SDK、`ARKTS_SEMANTIC_SESSION_REUSE=off`、`ARKTS_MEMORY_BUDGET_MB=1024`。此处 `legacy` 仅用于测一个 full-scope long-lived LS；**生产默认仍是 indexed-batched + closure + full SDK**。正常自动诊断保持开启。

冻结时源码、构建和 SDK 与 manifest pins 匹配时，可重放单个新进程（`--out` 必须不存在）。报告完成后的观测代码注释与测试断言校正改变了当前 source-input digest；当前工作树需先通过 pin 预检，不得直接改旧 pin 把新构建数据混入这三次结果：

```sh
node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-resident-l01-edit-reference-api24.json \
  --out .bench/semantic-ready-l01/edit-reference-next.json
```

每次执行先验证输入 pins，启动真实 `dist/server.cjs --stdio` 子进程，经 Content-Length LSP 发送请求，并由独立进程采样目标 Node PID RSS。macOS `ps` 只读采样需要相应权限。prepared-suite 当前没有 generation-bound semantic-ready 公共合同，所以即使本轮所有 references 精确，命令仍固定以 `PREPARED_SUITE=FAIL`、`READINESS_UNSUPPORTED` / exit 1 结束；**以下 correctness PASS 不等于产品门禁 PASS**。输入前后 pins 三次均相同。

## 真实请求和逐位置结果

每个独立新进程先等 sidecar catalog 候选 ready（1846/1846 文件，skipped 1），随后在第一个显式 refs 请求前 `didOpen` 两个真实文件：`MenuController.ets` 与 `HomeInitData.ets`。依序发送 `textDocument/references`（均 `includeDeclaration=false`，UTF-16 零基坐标）：

1. `common/src/main/ets/core/controller/MenuController.ets` 构造器使用处 `90:17`，首次 full-scope 查询，精确 267 个 Location。
2. `common/src/main/ets/sendable/HomeInitData.ets` class `16:13`，先前未查，精确 9 个 Location。
3. 向已打开的 `HomeInitData.ets` 发送**未保存** `didChange` v2：在 `28:45` 插入 `\nhomeInitData = new HomeInitData();`，不改磁盘或工程边界；立即在原 `16:13` 查询，同一真实 compiler oracle 精确 10 个 Location。新增位置为 `HomeInitData.ets` `29:19–29:31`，其余九处不变。
4. 同 v2 snapshot 再查同符号一次，只作结果缓存对照，不计入未查询符号时延。

| 独立新进程 / [原始 JSON] | catalog 候选 ready | 首次 full-scope refs | 原快照未查 HomeInitData 9 refs | v2 未保存编辑后 10 refs | v2 重复缓存对照 | 目标 Node PID 采样峰值 RSS | 实际 RSS 采样 p95 间隔 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [01](../../.bench/semantic-ready-l01/edit-reference-current-01.json) | 44.567 s | 17,818.0 ms | 234.5 ms | **1,594.5 ms** | 2.3 ms | 746,459,136 B | 378 ms |
| [02](../../.bench/semantic-ready-l01/edit-reference-current-02.json) | 19.990 s | 16,587.3 ms | 253.5 ms | **1,597.0 ms** | 1.8 ms | 754,806,784 B | 202 ms |
| [03](../../.bench/semantic-ready-l01/edit-reference-current-03.json) | 23.581 s | 17,856.8 ms | 227.3 ms | **1,371.0 ms** | 1.8 ms | 731,164,672 B | 244 ms |

三个进程共 **12/12 `COMPLETE` 且 exact**，`missing=[]`、`extra=[]`、`duplicates=[]`、`invalid=[]`，无空结果、超时、OOM 或 partial-success；server 均正常 shutdown/exit 0。三次目标文件 v2 最新自动诊断均观察到 0 条；MenuController 的正常 v1 诊断各 1 条。HomeInitData 原 v1 诊断观察可能被立即编辑 supersede，因此不把“未观察到 v1”当成关闭诊断。`didChange` 在 v2 请求前约 2–3 ms 发出，v2 诊断在查询后到达，runner 等待其发布才完成报告。原始 JSON 的 `memory.samples` 是外部曲线，`timeline` 为请求/编辑/诊断时序，`requests[].correctness.locations` 是规范化 URI/UTF-16 结果；sampler 和 harness 的内存单列，不把 worker thread RSS 重复相加。

三次编辑后的**首次**完整响应中位 1,594.5 ms，全部超过 500 ms。重复请求 1–2 ms 均有 `references.cache.hit`，不能冒充 compiler 增量响应。外采目标间隔要求 50 ms，但实际 p95 为 202–378 ms，因此列出的峰值只是采样下界；这也不是 macOS PSS、DevEco 对照、原始 >3 GB 案例或最终 50% 内存门禁。

## 单独的 trace-on 归因（不并入时延分布）

[trace-on 原始 JSON](../../.bench/semantic-ready-l01/edit-reference-trace-01.json) SHA-256 `b85c803cf110690a4ca09eff2b30d3534d27146a3dfdd9969e9b9a8addacf463`；4/4 exact，最新 v2 诊断正常。它只用于归因，不与三次 trace-off 时延/内存统计合并。

| 查询 | `contextSequence` | post-query `programSequence` | post-query `checkerSequence` | fork `createProgram` 分组事件 / 累计时长 | compiler refs callback |
| --- | ---: | ---: | ---: | ---: | ---: |
| 首次 MenuController constructor | 1 | 1 | 1 | 1 / 9,673.2 ms | 12,140.4 ms |
| 未编辑 HomeInitData | 1 | 1 | 2 | 0 / 0 ms | 219.4 ms |
| v2 未保存引用编辑后 HomeInitData | 1 | **2** | 3 | 1 / 1,075.8 ms | 1,196.6 ms |

日志只有一次 `semantic.context.create`、后续 reuse、无 context eviction；v2 edit 后 cache **miss**，而不是返回旧 9 位置或直接命中缓存。**这次 overlay 编辑没有观察到 resident context 重置，但查询后的 Program 对象从 sequence 1 换成 2。** `createProgram` 的 record 是 fork 分组事件，不能解释为准确 Program 构造调用次数。`checkerSequence` 在相同 `programSequence=1` 时就从 1 变 2，说明该 trace-only `getTypeChecker()` 后置探针不能作为稳定的查询内部 Checker 复用判据；探针本身也可能影响随后的 trace-on 时间。这里可支持“编辑后有显著 compiler 重建成本”的归因，不能证明 L02 所需的增量 Program 复用，也不能据此断定整个 1.59 秒都花在 `createProgram`。

## 判定和后续边界

- **新鲜度/完整性控制 PASS**：同一预打开真实工程会话，未保存新增引用 9→10 的精确集合、最新 v2 诊断、缓存失效、完整响应和无部分结果均得到三独立进程复核。
- **性能 FAIL**：编辑后首次 refs 1.371–1.597 秒；只在未编辑热态出现的 227–254 ms 不能代表 edit-warm。正常诊断未关闭，未提高预算或延长 deadline。
- **L02 未毕业**：虽然 contextSequence 保持 1，但 ProgramSequence 1→2；尚未证明函数体/公开 API/import 的增量有效性、取消、驱逐恢复或资源长时安全。当前 suite 仍 `READINESS_UNSUPPORTED`，因此 L01 整体不标完成，L04 生产热路由更不能据本轮接线。
- **内存发布 BLOCKED**：本轮只在这一 Settings/API24 测例得到约 0.73–0.75 GB 的外采 Node RSS 峰值；不足以关闭 >3 GB、50% 比例、DevEco PSS、post-eviction 和跨平台门禁。所有原始曲线保留在本机 `.bench` 文件；改变当前 source/build 后必须重锁 pins，不可将后续数据混入这组三进程分布。
