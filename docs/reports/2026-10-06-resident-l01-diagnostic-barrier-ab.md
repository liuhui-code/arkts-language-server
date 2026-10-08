# L01：Settings/API24 自动诊断屏障对跨模块 definition 的影响

日期：2026-10-06。状态：**归因控制完成，产品 500 ms 门禁仍未通过。** 三个独立新进程在两份预打开文档的 v1 自动诊断发布后才发送先前未查询的跨模块 definition，完整 LSP 响应为 **11.6 / 8.8 / 12.2 ms**；无屏障的三个既有对照为 **1,059.8 / 857.8 / 776.8 ms**，随后追加的无屏障新进程仍为 **747.7 ms**。全部跳转逐位置精确，诊断没有关闭。屏障是 benchmark-only 控制：它把约 0.8–0.9 s 等待移到了请求前，**不是产品修复或 semantic-ready 证明**。

## 固定输入与复现

[屏障 manifest](../../bench/references/manifests/settings-resident-l01-hot-definition-diagnostic-barrier-api24.json) SHA-256 `1f4cdf514c2835b5ab465ebbe60e6cb8bb7e864f7aaad34b16e982b285389b4a` 与[无屏障对照](../../bench/references/manifests/settings-resident-l01-hot-definition-api24.json)仅在独立 `benchmarkId` 和第二场景 `waitForPreOpenDiagnostics: true` 上有差异；机器断言 `PINNED_CONTROL_DIFF=ONLY_BARRIER` 已通过。Settings clean HEAD `ecc550dfaed880e04e38a2477eb7235cd50475b9`；DevEco ETS API24 `6.1.1.125` 声明摘要 `8098b8ab…d4c6e4`；server HEAD `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`，bundle `99d16dc0…f5b2`；Node `v26.3.0`、`ohos-typescript@4.9.5-r10`。完整 pins 见 manifest 与原始报告，全部回放 `inputUnchanged=true`。这是一条 API24 兼容测试轨，不是原工程 SDK23 matched-DevEco 对比。

回放命令（每次将 `--out` 换为新的路径，不覆盖原始记录）：

```sh
node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-resident-l01-hot-definition-diagnostic-barrier-api24.json \
  --out .bench/semantic-ready-l01/hot-definition-diagnostic-barrier-new.json
```

实际 `dist/server.cjs --stdio` 子进程处理 Content-Length LSP；第一个请求是 `common/src/main/ets/core/controller/MenuController.ets` `70:13` 的 references（248 个 oracle Location），第二个是预打开但未预查询的 `product/phone/src/main/ets/Setting/Home/controller/HomePageMenuManager.ets` `40:37` 的 `HomeInitData` definition（1 个 oracle Location：`common/src/main/ets/sendable/HomeInitData.ets` `16:13–16:25`）。屏障只在第二请求前等待两份 v1 `textDocument/publishDiagnostics`；没有目标预查询、额外 overlay、SDK/worker/budget/语义策略变更。`ARKTS_REFERENCES_TRACE=0`，正常诊断 TS2307 与 TS2339 均发布。

## 原始数据和时间线

| 新进程 | 模式 | 首次 refs ms | 第二 definition ms | 首次 refs 响应至 definition 响应 ms | Node PID RSS 峰值采样下界 B | 原始报告 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| A1 | 无屏障 | 10,670.6 | 1,059.8 | 1,060.5 | 786,427,904 | [JSON](../../.bench/semantic-ready-l01/hot-definition-01.json) |
| A2 | 无屏障 | 9,785.2 | 857.8 | 858.2 | 824,512,512 | [JSON](../../.bench/semantic-ready-l01/hot-definition-02.json) |
| A3 | 无屏障 | 9,293.2 | 776.8 | 777.1 | 791,465,984 | [JSON](../../.bench/semantic-ready-l01/hot-definition-03.json) |
| B1 | 诊断屏障 | 10,242.8 | **11.6** | **920.5** | 812,331,008 | [JSON](../../.bench/semantic-ready-l01/hot-definition-diagnostic-barrier-01.json) |
| B2 | 诊断屏障 | 10,402.3 | **8.8** | **932.8** | 779,612,160 | [JSON](../../.bench/semantic-ready-l01/hot-definition-diagnostic-barrier-02.json) |
| B3 | 诊断屏障 | 9,775.8 | **12.2** | **805.1** | 714,297,344 | [JSON](../../.bench/semantic-ready-l01/hot-definition-diagnostic-barrier-03.json) |
| A4 | 无屏障，B 后追加 | 9,216.9 | 747.7 | 748.0 | 771,801,088 | [JSON](../../.bench/semantic-ready-l01/hot-definition-control-04.json) |

每个进程两个请求都是 `COMPLETE`，refs 248/248、definition 1/1，`missing=[]`、`extra=[]`、`duplicates=[]`、`invalid=[]`；catalog ready，v1 诊断两份，server shutdown / exit 0。屏障 B1/B2/B3 在第一次响应后分别等待约 **908.3 / 923.4 / 792.6 ms**，收到第二份 v1 诊断后才记录 `pre-open-diagnostics-barrier-complete` 并发送 definition。无屏障 A4 则在第二请求发送后约 123 ms 收到首份诊断，第二份诊断约 727 ms 后到达，definition 再约 21 ms 完成。此前[trace-on 控制](2026-10-06-resident-l01-hot-definition-trace.md)也观测到两份诊断跨越第二请求，已插桩的 definition compiler 回调仅 2.56 ms。

外部采样独立监控目标 Node PID；原始 JSON 包含每点 RSS、请求/诊断时间线、规范化结果及完整环境。采样请求间隔 50 ms，但实际间隔受系统调度影响，峰值是下界；不把 worker thread RSS 再加一次，也不拿这些样本宣布 PSS/DevEco/内存 gate。七个原始报告均 `correctness.status=PASS`、`gateStatus.diagnostics=PASS`；工具整体仍为 `PREPARED_SUITE=FAIL` / `READINESS_UNSUPPORTED` / exit 1，因为服务端没有与输入代际绑定的公开 semantic-ready 合同。该状态不是语义结果失败，也不能被跳过。

## 结论与下一步

这个 A/B 强支持：此前 0.75–1.06 s 的 definition 协议等待与 references 完成后恢复的自动诊断工作重叠；在这项工作真正完成后，同一新符号的热语义查询只需约 9–12 ms。代码上 references 在执行前 suspend diagnostics、结束后 resume；诊断恢复后会计算并发布 v1 结果，因此这种顺序不是人为关闭诊断造成的。但屏障同时允许诊断预热目标文件的 Program，现有证据不能把全部差额唯一分解为 FIFO 排队、诊断本身或其预热效应。

屏障的[公开子进程 RED/GREEN 记录](../tdd/l01-preopen-diagnostic-barrier.md)包含迟到双诊断、缺失第二份时拒绝后续查询及默认路径不变的用例；最终树 `pnpm check:fast` **1295/1295 PASS**、`git diff --check` PASS。第一次未获 macOS 进程采样权限的全量尝试因 sampler EPERM 中断，最终通过是在允许只读采样后重跑；不把前者记成语义失败。

更重要的是，**从首次 refs 响应到 definition 响应的总等待没有随屏障降低**：B 为 805–933 ms，A 为 748–1,061 ms。现在只能说“诊断已完成时跳转很快”，不能说“用户任意时刻点击跳转均 <500 ms”。后续应在保持诊断结果完整的前提下，验证交互请求与诊断的调度隔离/优先级及快照安全；不能通过 benchmark 前等待来宣布 L01、L06 或产品时延达标。当前 L01 仍 `IN_PROGRESS`、即时跳转性能 `FAIL`、semantic-ready 与正式内存门禁 `BLOCKED`。
