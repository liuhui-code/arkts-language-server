# L01：Settings/API24 完整 LS 准备后的跨模块 definition

日期：2026-10-06。状态：**三个独立进程的六条语义请求均完整、精确；此前未查询的跨模块 definition 三次均超过 500 ms。** 这补充了 L01 的真实 definition 控制，不代表 semantic-ready、内存发布门禁或整体 500 ms 目标通过。本轮只新增固定回放清单、精确位置 oracle 与报告，不改生产语义、诊断或工程边界。

## 固定输入

- [prepared-suite manifest](../../bench/references/manifests/settings-resident-l01-hot-definition-api24.json)，SHA-256 `0146346fe4787d91fb280720e25e49e03744b25faea4489b78f24ca95204cc7a`；[definition oracle](../../bench/references/oracles/settings-homeinitdata-definition-api24.json)，SHA-256 `fecba615ba40067e80b421369ad670f226364b5426243c6db789cb9a499a7a35`。Oracle 的单位置来自既有[真实跨模块 LSP 证据](2026-09-29-semantic-ready-s05-context-lifecycle.md)，本轮又由当前构建的三次完整响应逐位置验证。
- 真实 Settings checkout `.bench/real-projects/settings-ecc550`：干净 HEAD `ecc550dfaed880e04e38a2477eb7235cd50475b9`，workspace 文件摘要 `4becf56c…b0d40`。原工程声明 compile SDK23；本轮显式使用本机 DevEco ETS API24 `6.1.1.125`，SDK 声明摘要 `8098b8ab…d4c6e4`。这是 API24 兼容测试，不声称 API23/DevEco 等价。
- Server HEAD `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`，dirty source-input 摘要 `c5f961a4…30a`；`dist/server.cjs` 摘要 `99d16dc0…f5b2`、semantic worker `3353b595…49e`、sidecar `84597a63…796`、Node `v26.3.0`、`ohos-typescript@4.9.5-r10`。完整 pin 在 manifest 和原始 JSON；三次前后均 `inputUnchanged=true`。源码或构建产物变化后不得把新结果混入本轮。
- 作为完整 LS 准备对照，固定运行 `ARKTS_REFERENCES_STRATEGY=legacy`、full SDK、1024 MiB、`ARKTS_SEMANTIC_SESSION_REUSE=off`、`ARKTS_REFERENCES_TRACE=0`。生产默认仍是 `indexed-batched + closure + full SDK`；这里没有比较生产 indexed definition 路由。

复现命令（`--out` 必须不存在；将尾号改为 `02`、`03` 可再跑两个独立进程）：

```sh
node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-resident-l01-hot-definition-api24.json \
  --out .bench/semantic-ready-l01/hot-definition-01.json
```

工具整体输出 `PREPARED_SUITE=FAIL`、`READINESS_UNSUPPORTED` / exit 1，因为现有服务没有绑定输入代际的公开 semantic-ready 合同；这与下述 `correctness.status=PASS` 分开判定。三次候选 catalog 均 ready（1846/1846 文件、skipped 1）。

## 真实协议序列和精确结果

每次启动新的 `dist/server.cjs --stdio`，采用 Content-Length LSP。候选 catalog ready 后，先 `didOpen` 两个真实文件，均为 v1：`common/src/main/ets/core/controller/MenuController.ets` 与 `product/phone/src/main/ets/Setting/Home/controller/HomePageMenuManager.ets`。同快照中依次查询：

1. `textDocument/references`，`MenuController` 声明处零基 UTF-16 `70:13`、`includeDeclaration=true`，按[既有 248 位置 oracle](../../bench/references/oracles/settings-menucontroller-api24.json)验证并支付首次完整 LS 准备成本。
2. 此前未查询的 `textDocument/definition`，`HomePageMenuManager.ets` 中跨模块 `HomeInitData` 用法零基 UTF-16 `40:37`。该光标此前仅预打开，未发送 completion/definition；期望精确声明 `common/src/main/ets/sendable/HomeInitData.ets` `16:13–16:25`。

| 独立新进程 / 原始 JSON | Node PID | 首次 refs 248/248 | 未查询 definition 1/1 | v1 自动诊断 Menu / consumer | 外采 Node 峰值 RSS | 外采进程树峰值 RSS | 采样间隔 p95 |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| [01](../../.bench/semantic-ready-l01/hot-definition-01.json) SHA `e774330a…0b8d1f` | 33782 | 10,670.6 ms | **1,059.8 ms** | 1×TS2307 / 1×TS2339 | 786,427,904 B | 835,661,824 B | 139 ms |
| [02](../../.bench/semantic-ready-l01/hot-definition-02.json) SHA `32419fe7…fe83984d9` | 34150 | 9,785.2 ms | **857.8 ms** | 1×TS2307 / 1×TS2339 | 824,512,512 B | 873,500,672 B | 132 ms |
| [03](../../.bench/semantic-ready-l01/hot-definition-03.json) SHA `69f63b87…76a6a43a` | 34394 | 9,293.2 ms | **776.8 ms** | 1×TS2307 / 1×TS2339 | 791,465,984 B | 835,780,608 B | 131 ms |

三次共 6/6 `COMPLETE`、`correctness.status=PASS`。每条结果均 `missing=[]`、`extra=[]`、`duplicates=[]`、`invalid=[]`；definition 三次均仅返回 `HomeInitData.ets` `16:13–16:25`。无空结果、超时、OOM、部分成功或 LSP error，三次均正常 shutdown / exit 0。Menu 的 TS2307 和 consumer 的 TS2339 是这份 API24 checkout 的实际自动诊断，均正常观察到；本轮没有静默诊断。完整位置、请求／诊断时间线和外部 RSS 曲线都在原始 JSON。

definition 三次都标记 `priorCompleteSnapshot=false`，中位 **857.8 ms**，0/3 次低于 500 ms。三个样本不足以给出可靠 P95，更不能推广到全部跨模块符号。与另一个已测的 [implementation 目标](2026-10-06-resident-l01-hot-implementation.md)相比，该符号在首轮完整准备后仍有显著额外成本；模块、目标和机器负载不同，不能用这两组数据单独定位成本来源。

## 证据边界

`ARKTS_REFERENCES_TRACE=0` 保持时延测量不受探针影响；本轮未取查询后的 Program/Checker 身份，因此不能说同一 Program 或 TypeChecker 被复用，也不能把 777–1060 ms 归因于某一个内部阶段。外采请求间隔 50 ms，实际 p95 为 131–139 ms，峰值只是观测下界。Node worker threads 算在同一目标 Node PID 内；进程树 RSS 另列，不是 PSS，也不是 DevEco 对照。

这项证据关闭了此固定符号的“结果是否精确”问题，同时给出一个真实的热态跨模块定义跳转时延反例。`READINESS_UNSUPPORTED` 仍然存在；L01 的完整取消、编辑、L3 长期稳定性与全部能力覆盖，以及最终产品 500 ms/内存发布门禁仍需各自验收。本报告没有改变任何生产开关、缓存预算、worker 数或 fallback 规则。
