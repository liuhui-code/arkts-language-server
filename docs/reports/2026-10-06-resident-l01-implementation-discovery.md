# L01：真实 Settings/API24 implementation 完整位置发现

日期：2026-10-06。状态：**两独立新进程的该符号 `textDocument/implementation` 位置集合一致、已知实现类包含；L01 性能与资源门禁未通过。** 本轮只建立可重放的 oracle 发现工具与证据，不修改生产语义、缓存、worker、诊断或项目边界。

## 固定输入与回放

- [manifest](../../bench/references/manifests/settings-resident-l01-implementation-discovery-api24.json)，SHA-256 `cb6c0e9ffb23bf3c6491496bc2cec6275d9b01d10d0e85afcb1f8046ac6c1b72`；[CLI](../../scripts/bench/discover-semantic-oracle.mjs)，SHA-256 `04de027d8d3ecead6e616dc988c743d97a3e629984f501952c1c5e729faca0e1`。
- 两个独立原始响应验证后冻结的[该符号 implementation oracle](../../bench/references/oracles/settings-iaboutdevicepagectrl-implementation-api24.json)，SHA-256 `69f75e6dd4a0f09710c99e4b84301a7ef799edc7f5c8da97ef7911af99e9d274`；已机器核验其完整规范化集合同时等于下文 01/02 两份报告，不是只按运行前已知控制位置手写猜测。
- 原始真实工程为 `.bench/real-projects/settings-ecc550`，clean HEAD `ecc550dfaed880e04e38a2477eb7235cd50475b9`，workspace 文件摘要 `4becf56c…b0d40`。原工程配置的 compile SDK 为 23；此次使用本机 DevEco API24 `6.1.1.125`，声明 digest `8098b8ab…d4c6e4`。**这是显式 API24 兼容测试，不代表 API23/DevEco 等价。**
- Server HEAD `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`，此轮 dirty source-input digest `c5f961a4…30a`，`dist/server.cjs` digest `99d16dc0…f5b2`，semantic worker `3353b595…49e`，sidecar `84597a63…796`，Node `v26.3.0`，`ohos-typescript@4.9.5-r10`。所有完整 SHA 和 SDK 元数据均在 manifest 与原始报告，回放前后逐字段比对；源码/构建变化后不能静默重锁旧实验。
- 目标为 `feature/aboutdevice/src/main/ets/controller/IAboutDevicePageCtrl.ets` 中 interface `IAboutDevicePageCtrl`，零基 UTF-16 `17:20`；源码 SHA-256 `87c4921d…ac4`。`AboutDevicePageController.ets` 的类声明 `44:13–44:38` 只是运行前已知控制位置，**没有预设完整 oracle 只有一项**。

当上述 pin 与当前构建仍匹配时，两个独立新进程的命令为：

```sh
node scripts/bench/discover-semantic-oracle.mjs \
  --manifest bench/references/manifests/settings-resident-l01-implementation-discovery-api24.json \
  --out .bench/semantic-ready-l01/implementation-discovery-01.json

node scripts/bench/discover-semantic-oracle.mjs \
  --manifest bench/references/manifests/settings-resident-l01-implementation-discovery-api24.json \
  --out .bench/semantic-ready-l01/implementation-discovery-02.json \
  --compare .bench/semantic-ready-l01/implementation-discovery-01.json
```

`--out` 必须指向尚不存在的文件。CLI 逐项检查干净工程、SDK、源码、构建、worker、sidecar 和 lockfile pin；第二次只能比较同一固定输入且首份状态为 `DISCOVERED/VERIFIED` 的报告。macOS `/var` 与 `/private/var` 的真实路径在构造 root URI 前统一，避免测试临时工程被误判为 root 外文档。

## 真实 LSP 结果

两个回放都由现有 `LspSession` 启动独立的 `dist/server.cjs --stdio`，使用 Content-Length LSP；先 `initialize`、`didOpen`，立即发 `textDocument/implementation`，保留正常后台 catalog 与自动诊断。没有预查询目标、无强制 GC、无诊断静默、无工程边界变更。

| 新进程 / 原始报告 | 目标 Node PID | 完整请求时延 | 规范化位置 | v1 自动诊断 | 输入稳定 | 结束 |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| [01](../../.bench/semantic-ready-l01/implementation-discovery-01.json) SHA `5afdda3d…1498` | 29654 | 12,933.1 ms | 1 | 0 条 | 是 | 正常 exit 0 |
| [02](../../.bench/semantic-ready-l01/implementation-discovery-02.json) SHA `ccc6bd41…c79b` | 29722 | 13,041.7 ms | 1 | 0 条 | 是 | 正常 exit 0 |

完整规范化 `Location[]` 两次均为：

```json
[{"file":"product/phone/src/main/ets/Setting/AboutDevice/SubHome/controller/AboutDevicePageController.ets","range":{"start":{"line":44,"character":13},"end":{"line":44,"character":38}}}]
```

第二次 `comparison.equal=true`；两次均 `knownLocation.included=true`、无 LSP error、空结果、非法 range 或重复位置。原始报告另存 URI 形式 `response.rawLocations`、完整 transcript 摘要、请求和诊断时间线。诊断在响应之后约 14 ms 到达；runner 等待 v1 诊断后才结束，因此未把“诊断未观察到”误当作正常完成。

这仅证明**此固定 Settings/API24 快照、此 interface 光标的 implementation 发现集在两次新进程回放中稳定**，并足以为这个符号冻结一份可供后续差分的 oracle。它不是其它 interface/override/generic 的全面 oracle，也不是 `legacy` 对 `resident` 的差分，更未测编辑后新鲜度、取消或 L3。此轮没有外部 RSS 采样，所以不作内存结论。冷请求约 13 秒，显然不满足 500 ms；不能被重复缓存命中或后续热态数据覆盖。L01/L05 的完整能力、安全、性能和发布门禁仍未毕业。

## TDD 与工具验证

新 [公共 CLI 测试](../../tests/discover-semantic-oracle-cli.test.mjs) 在 parent HEAD `72a2fa8` 先 RED：`node --test tests/discover-semantic-oracle-cli.test.mjs` 因 CLI 不存在 exit 1。最小脚本与 macOS root URI 规范化后同命令 GREEN（1/1）：测试用两个真实 `dist/server.cjs --stdio` 子进程复核基本 fixture 的完整 implementation `Location[]`、自动诊断与已知实现类；SDK 摘要漂移时预启动拒绝且不生成报告。`node --check`、`git diff --check` 通过；新 script 200 行、test 79 行，低于 500 行限制。未运行全量 `pnpm check:fast`；也未提交、推送、合并。
