# L01 真实 Settings/API24 legacy queue-start 取消控制

日期：2026-10-06。结果：**单次 PASS（取消响应与恢复精确性）；不证明 compiler-in-flight 抢占、长期资源安全或 500 ms**。

## 固定输入与命令

- Server parent HEAD `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`，工作树 dirty；`dist/server.cjs` SHA-256 `99d16dc05bd8ca74cf538de80b39ac805c47de92ec98b2079924995220e0f5b2`。Node `v26.3.0`，macOS `Darwin 25.6.0 x64`。
- 干净的真实 `applications_settings` checkout `ecc550dfaed880e04e38a2477eb7235cd50475b9`，私有 `git clone --local --no-hardlinks` 运行后原件和克隆均保持 clean。项目声明 compile SDK 23；本控制明确使用 API24 `6.1.1.125` 兼容测试轨，声明 digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`，不冒充匹配 API23/DevEco 对照。
- sidecar SHA-256 `84597a63c396ceaf2a84a3ded455b5cc29d21b6c4ad3c049f7b3ca820c2fd796`；`semantic-worker.cjs` SHA-256 `3353b595a6822970079655d5643be63d385702600f34110fd87a494e2fc12b57`。输入见[固定 manifest](../../bench/references/manifests/settings-resident-l01-cancel-legacy-api24.json)，完整协议、日志、规范化 Location、诊断与外采 RSS 见[原始 JSON](../../.bench/semantic-ready-l01/cancel-legacy-current-01.json)。
- 目标 `product/phone/src/main/ets/Setting/Home/controller/HomePageMenuManager.ets` 的 `HomeInitData`，零基 UTF-16 `40:37`，`includeDeclaration=false`；独立[九位置 oracle](../../bench/references/oracles/settings-homeinitdata-api24-no-declaration.json) SHA-256 `58908aa4ee2554864cd4467ccf7a51b3aa8e6dd570fc0f66decc6500bf7f937b`。正常自动诊断未关闭。

```sh
node scripts/bench/replay-settings-cancel-control.mjs \
  --workspace .bench/real-projects/settings-ecc550 \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --manifest bench/references/manifests/settings-resident-l01-cancel-legacy-api24.json \
  --oracle bench/references/oracles/settings-homeinitdata-api24-no-declaration.json \
  --strategy legacy --session-reuse off \
  --out .bench/semantic-ready-l01/cancel-legacy-current-01.json
```

输出采用 `wx`，重播需指定**新的** `--out` 路径。macOS 外部 RSS sampler 用只读 `ps`，在受限沙箱内运行需相应采样权限。该控制单独固定 `ARKTS_REFERENCES_STRATEGY=legacy`、full SDK、1024 MiB 当前策略预算、trace-on，生产默认 indexed-batched 未改变；trace-on 的时延不是产品样本。

## 公开 LSP 结果

| 相对时刻 | 事件 | 结果 |
| ---: | --- | --- |
| 0 ms | Server PID 启动 | Node RSS 外采约 58.1 MB |
| 14,206 ms | Catalog complete | `Indexed 1846/1846 files; skipped 1 entries` |
| 17,242 ms | 正常 `publishDiagnostics` v1 | 1 条，code `2339`，范围 `60:70–60:85`，与 manifest exact |
| 17,243 ms | `textDocument/references` id 2 发送 | 目标先前未查询 |
| 17,257 ms | 观察同 trace 的 `references.queue.start`，发送 `$/cancelRequest` id 2 | 未观察到完成响应才发送；不是 batch 或 compiler-in-flight 证明 |
| 17,260 ms | id 2 唯一终态 | error `-32800`、无 `result`，无第二响应或部分结果 |
| 25,203 ms | 同进程新请求 references 恢复 | 9/9 规范化 URI＋UTF-16 range exact，0 missing/extra |
| 25,255 ms | definition 恢复 | `HomeInitData.ets` `16:13–16:25` exact |

恢复 references 从取消终态后到完整响应约 **7.94 s**；definition 随后约 **52 ms**。外采 211 点，配置采样间隔 50 ms，实测间隔中位约 122 ms；整次 Node PID RSS 峰值下界 **789,999,616 B**，process-tree RSS 峰值 841,129,984 B，sampler/harness 分别单列，不重复加 worker thread RSS。该整次峰值不能归因给取消请求本身。

取消成功只证明公开协议 id 2 正确终止且后续语义可完整恢复。server trace 中，同一已取消 trace 的 `document-prepare` 阶段仍延续约 1.2 s；因此此回放**不能证明**同步 compiler 计算在 queue-start 后被抢占，也不能作为真正 in-flight cancellation、L01 完整资源/soak 或 ≤500 ms 毕业证据。只有一个真实进程，未做统计性 P95 推断。

## TDD 与回归

行为修改仅在复现工具：新增可选 `--strategy legacy`，观察 queue-start 后取消；原 indexed-batched batch-start 仍是默认控制。公开 CLI 测试先 RED：`node --test --test-name-pattern='observes a legacy queue start' tests/replay-settings-cancel-control-cli.test.mjs` 因 `unknown argument: --strategy` exit 1；最小实现后 GREEN。第二个 RED 命令为 `node --test --test-name-pattern='rejects a partial result racing' tests/replay-settings-cancel-control-cli.test.mjs`，partial result 与取消竞速被错误标 `NOT_CANCELLED`；现要求非取消终态也必须与九位置 oracle 完整一致，否则 FAIL。全部 `node --test tests/replay-settings-cancel-control-cli.test.mjs` 为 **11/11 PASS**，含原 indexed 控制；`node --check` 和 `git diff --check` PASS。源码、测试分别 482/289 物理行。首次无 macOS `ps` 权限的 GREEN 尝试卡在采样并触及 CLI 测试自身 10 s timeout，不是语义失败；授权只读采样后原命令通过。
