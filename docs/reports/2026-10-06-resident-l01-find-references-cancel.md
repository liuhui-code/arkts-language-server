# L01 Settings/API24：TypeScript `findReferences` 进行中取消

日期：2026-10-06。结论：**3/3 独立新进程均在实际 TypeScript
`findReferences` 调用进入后发出 LSP 取消；该调用抛出
`OperationCanceledException`，公开请求唯一以 `-32800` 结束，精确恢复
通过。此切片的取消正确性 PASS；L01 长期资源安全与正常导航时延仍未过门禁。**

前一轮[references 回调取消](2026-10-06-resident-l01-compiler-cancel.md)
把整个回调抛取消误称为 compiler 查询中断。本轮增加默认关闭的
`references.find-references.start/complete/throw`，只包围
`service.findReferences` 本身；回放工具还要求同一 `traceId`/`callIndex`
的 start 在客户端取消前、`throw(cancelled=true)` 在取消后，且该次调用
没有 complete。模拟的“调用先完成、仅结果映射取消”和“取消事件早于客户端
取消”均判 FAIL。

## 固定输入与回放

- 真实 `openharmony/applications_settings` clean commit
  `ecc550dfaed880e04e38a2477eb7235cd50475b9`；私有克隆回放，
  原工程未修改。项目声明 compile API23；本机使用 DevEco ETS API24
  `6.1.1.125` 兼容测试轨，SDK 声明 digest
  `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`。
- 目标 `product/phone/src/main/ets/Setting/Home/controller/HomePageMenuManager.ets`
  的 `HomeInitData`，零基 UTF-16 `40:37`，`includeDeclaration=false`；
  固定 oracle 九个位置。保留自动诊断，v1 code `2339` 与范围
  `60:70–60:85` 精确一致。
- Server HEAD `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86` 加未提交
  观测/回放改动；macOS `Darwin 25.6.0 x64`、Node `v26.3.0`，
  `ohos-typescript@4.9.5-r10`。
  `dist/server.cjs` SHA-256
  `d03fb34c69c70c4a1c26350acd9e752683ced9cdff145beec8f8434952abd54e`，
  `dist/semantic-worker.cjs` SHA-256
  `4058e8996cc00ebd33b710d8405faa13905e99a6d66cb9ee1cd4125a3968b84c`。
  [固定 manifest](../../bench/references/manifests/settings-resident-l01-cancel-find-references-api24.json)
  SHA-256 `3a4bd87389986575ab8e4cf032008f24f80635b8d040e4553a83f017ad00d3e9`。

```sh
node scripts/bench/replay-settings-cancel-control.mjs \
  --workspace .bench/real-projects/settings-ecc550 \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --manifest bench/references/manifests/settings-resident-l01-cancel-find-references-api24.json \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --strategy legacy --cancel-stage compiler-query --session-reuse off \
  --out .bench/semantic-ready-l01/cancel-find-references-new.json
```

`--out` 必须为不存在的新路径。三份[原始结果 01](../../.bench/semantic-ready-l01/cancel-find-references-current-01.json)、
[02](../../.bench/semantic-ready-l01/cancel-find-references-current-02.json)、
[03](../../.bench/semantic-ready-l01/cancel-find-references-current-03.json)
保留 framed LSP transcript、阶段日志、外部进程 RSS 曲线、恢复结果和输入 pin。

## 结果

| 新进程 | 首请求→`findReferences` start | 发取消→该调用 throw | 发取消→LSP 终态 | 该调用耗时 | Node PID RSS 全程采样峰值 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 01 | 8,971 ms | 12 ms | 19 ms | 27.5 ms | 742,412,288 B |
| 02 | 8,252 ms | 2 ms | 4 ms | 8.2 ms | 628,948,992 B |
| 03 | 7,921 ms | 2 ms | 4 ms | 10.6 ms | 736,497,664 B |

三次均为同一 TypeScript 调用 `start → 客户端 $/cancelRequest → throw`，
没有该 `callIndex` 的 complete；每次目标请求恰有一个响应、无 `result`
或部分位置。随后同进程重试 refs 九位置 URI＋UTF-16 range 与 oracle
精确一致，definition 落在 `HomeInitData.ets` 的 `16:13–16:25`；
正常 v1 诊断保留，原工程未改变。

`start` 由包装器在调用 TypeScript 方法的紧前一刻写出，`throw` 由
该方法抛出的异常触发；它们准确区分了“方法返回后才在映射阶段取消”。
没有上游方法内部进度标记，因此不能据此细分取消瞬间已经走到
TypeScript 搜索算法的哪一个内部检查点。

外部采样请求间隔 50 ms，但本机 `ps` 采样实测中位约 123–128 ms；
这足以保留过程曲线，却不能解析 2–19 ms 的取消瞬间峰值。
RSS 为整个 Node PID，一次计入 worker threads；sidecar、采样器和
harness 分别记录，不把 worker RSS 再叠加。表中峰值是整个回放
（含恢复查询）的采样峰值，不应解释为取消调用单独耗费的内存。
这个 Settings 符号未复现用户最初报告的约 5 GB 峰值，本数据不能
用于宣称那个案例已经解决。

## 对 L01 的意义

TypeScript `findReferences` 本体的取消检查点可用；**首次请求的
约 8–9 秒主要发生在进入它之前**，包含工程/Program/定义准备等工作，
本控制不能进一步定量拆分这些阶段。回放在发送目标请求前已经等待
catalog 和目标文档 v1 诊断，因此这 8–9 秒不是把二者的等待时间
算进目标请求。前一轮在回调起点取消却等
5.8–6.9 秒的事实仍成立，说明较早阶段的取消及时性问题尚未排除。
本轮不修改 production 默认 `indexed-batched + closure + full SDK`、
worker 数、预算、诊断或结果范围。L01 的 repeated/edit/idle/L3
资源曲线尚未完成，不能据此开启 L02、宣称 `<500 ms`，或宣布
长期内存门禁通过。最终 `pnpm check:fast` 为 1304/1304 PASS；
回放 CLI 的 15 个正反例测试全部通过。
