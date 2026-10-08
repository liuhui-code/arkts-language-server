# L01：Settings/API24 完整 LS 准备后的未查询 implementation

日期：2026-10-06。状态：**该目标三次 6/6 精确；未查询 implementation 单次响应三次均 <500 ms；semantic-ready、内存发布和 L01 整体毕业仍未通过。** 此轮仅新增固定回放输入与报告，没有改变生产语义、缓存、worker、预算、诊断或工程边界。

## 固定输入与命令

- [prepared-suite manifest](../../bench/references/manifests/settings-resident-l01-hot-implementation-api24.json)，SHA-256 `7321520ad68d88547ff9156a859015535956cfa9081cad29254ba377866bc4c0`。真实 Settings checkout `.bench/real-projects/settings-ecc550` clean HEAD `ecc550dfaed880e04e38a2477eb7235cd50475b9`；workspace 文件 digest `4becf56c…b0d40`。本机显式选用 DevEco SDK API24 `6.1.1.125`、声明 digest `8098b8ab…d4c6e4`；原工程配置为 compile SDK23，本报告**不声称 API23 或 DevEco 等价**。
- Server HEAD `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`，本轮 dirty source-input digest `c5f961a4…30a`，`dist/server.cjs` digest `99d16dc0…f5b2`，semantic worker digest `3353b595…49e`，sidecar digest `84597a63…796`，Node `v26.3.0`，`ohos-typescript@4.9.5-r10`。完整 pin 及 SDK 元数据见 manifest；三次报告均 `inputUnchanged=true`。后续 source/build 变化不得改旧 pin 把新结果混入本轮统计。
- 使用 `legacy + full SDK` 作为完整 LS 对照；`ARKTS_SEMANTIC_SESSION_REUSE=off`、策略预算 1024 MiB、`ARKTS_REFERENCES_TRACE=0`。**生产默认仍为 indexed-batched + closure + full SDK**；本轮不切换默认。

回放时 `--out` 必须不存在；每条命令启动独立 server 进程，并由独立采样进程观察目标 Node PID 和 sidecar 的 RSS：

```sh
node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-resident-l01-hot-implementation-api24.json \
  --out .bench/semantic-ready-l01/hot-implementation-01.json
```

把输出名依次换为 `hot-implementation-02.json`、`hot-implementation-03.json` 重复两次。工具固定输出 `PREPARED_SUITE=FAIL`、`READINESS_UNSUPPORTED` / exit 1，因为只有 workspace catalog 候选 ready、没有输入代际绑定的 semantic-ready 公共合同；这**不是**本次 Location 对照失败。macOS 外部 `ps` 采样需要只读进程权限。

## 真实 LSP 序列与结果

每个新进程等 catalog 候选 ready（1846/1846 文件，skipped 1），在首个语义请求前 `didOpen` 两个真实文档：`MenuController.ets` 与 `IAboutDevicePageCtrl.ets`。随后仅发送两条语义请求：

1. `textDocument/references`：`MenuController.ets` 类声明零基 UTF-16 `70:13`、`includeDeclaration=true`，使用[既有 248 位置 oracle](../../bench/references/oracles/settings-menucontroller-api24.json)支付完整 LS 首次准备成本。
2. `textDocument/implementation`：先前**未查询**的 `IAboutDevicePageCtrl.ets` interface `17:20`，使用[两新进程发现后冻结的一位置 oracle](../../bench/references/oracles/settings-iaboutdevicepagectrl-implementation-api24.json)。预打开文档不等于预查询 implementation；同快照无 `didChange`。

| 独立新进程 / 原始 JSON | 目标 Node PID | 首次 Menu refs 248/248 | 未查 implementation 1/1 | v1 自动诊断 Menu / Interface | 外采 Node PID 峰值 RSS | 外采进程树峰值 RSS | 实际采样间隔 p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| [01](../../.bench/semantic-ready-l01/hot-implementation-01.json) SHA `857d3746…24c99` | 30481 | 11,557.3 ms | **280.4 ms** | 1 / 0 | 653,320,192 B | 656,449,536 B | 154 ms |
| [02](../../.bench/semantic-ready-l01/hot-implementation-02.json) SHA `cc5c9e27…a72bd` | 30889 | 11,119.8 ms | **255.2 ms** | 1 / 0 | 729,645,056 B | 762,511,360 B | 144 ms |
| [03](../../.bench/semantic-ready-l01/hot-implementation-03.json) SHA `aec47f80…4541e64` | 31183 | 9,119.4 ms | **350.9 ms** | 1 / 0 | 793,309,184 B | 841,453,568 B | 131 ms |

三次共 6/6 `COMPLETE` 且 exact：每次 refs 248 个、implementation 1 个；所有 normalized URI／UTF-16 range `missing=[]`、`extra=[]`、`duplicates=[]`、`invalid=[]`。implementation 三次均返回 `AboutDevicePageController.ets` `44:13–44:38`，与正式 oracle 完全相同。无空结果、超时、OOM、partial-success 或 LSP error；三次均正常 shutdown/exit 0。原始 JSON 内 `requests[].correctness.locations` 保存完整集合，`timeline` 保存 request/诊断时间线，`memory.samples` 保存外部 RSS 曲线。

三个 implementation 都是该进程/快照对该符号的**第一次**请求，`priorCompleteSnapshot=false`；协议 transcript 的语义顺序仅为 references → implementation，没有目标 implementation 预热，也没有重复缓存查询。此处不能将别的符号的首次 references 算作 implementation 缓存命中。三次 255–351 ms 的中位数约 280 ms，说明在这个预打开、首次全域准备已付费的**具体**场景能低于 500 ms；只有 3 次，不能据此计算可信 P95 或推论未打开模块、编辑后、驱逐后同样达标。

## 归因及未关闭门禁

`ARKTS_REFERENCES_TRACE=0` 用于不带探针的延迟对照；本轮没有查询后的 Program/Checker 身份探针，不能把“同一 server 进程 + 快速响应”表述为**同一 Program 或 TypeChecker 复用已证明**。也没有对 implementation 做生产 indexed 策略 A/B；它是 L01 完整 LS 的候选证据，不是 L05 热路由发布授权。

采样目标为 50 ms，但实际间隔 p95 为 131–154 ms，故峰值为观测下界。Node worker thread 属于目标 Node PID，不把 worker 上报的 RSS 再相加；进程树 RSS 另列但不是 PSS，也不能和 DevEco 发布门禁直接比较。三次 Node 峰值差异较大，需保持机器负载、采样及更多样本对照，不据此宣称内存收益或低于原始 >3 GB 用例。prepared-suite 的 `readiness.semantic.status` 三次均为 `READINESS_UNSUPPORTED`；L01 的真实工程取消、重复压力/L3 资源稳定性、全面增量新鲜度及全部能力精确性仍分别受独立门禁约束。[单次真实 L3 恢复](2026-10-06-resident-l01-l3-recovery.md)已有独立结果完整性控制，但不关闭长期资源门禁。本次只是为 implementation 补足真实符号热态控制。
