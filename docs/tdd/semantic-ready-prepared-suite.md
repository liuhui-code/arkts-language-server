# S01 prepared-query suite：公开 CLI TDD

日期：2026-09-29。Parent revision：
`911ae43c274175614559b63f0311504747d8393d`。
本阶段只增加复现/报告工具，不修改生产语义行为。

## Characterization 与范围

复用 `replay-references.mjs`、真实 `LspSession`、Content-Length stdio、
正常诊断、现有 Location oracle 和独立进程 RSS sampler。
原 runner 的日志/catalog/采样 helpers 抽至 `reference-replay-evidence.mjs`；
旧 CLI 的 11 个 characterization 在提取前后均 GREEN。
原 runner 收缩至 352 物理行，新手写 source/test/script 均低于 500 行。

原 CLI 的第一次沙箱执行因 `ps` 被拒绝而 9/11 FAIL；授权外部只读采样后
11/11 PASS。这是采样权限阻断，不是产品 RED，也未放宽测试或 deadline。

## RED → GREEN

以下均通过子进程公开 CLI/report 验证，不把缺 build/导入失败当语义 RED。

| 公开测试命令 | RED（exit 1） | 最小 GREEN 行为 |
| --- | --- | --- |
| `node --test tests/prepared-suite-cli.test.mjs`（初始单例） | 收到 `--workspace is required`，未识别新输入模式 | 空 target pool 在启动服务器前以 `EMPTY_TARGET_POOL` / exit 2 拒绝 |
| `node --test --test-name-pattern 'candidate catalog readiness' tests/prepared-suite-cli.test.mjs` | 合法 pinned suite 未执行，实际 exit 2，预期报告 exit 1 | 执行真实 stdio 查询；candidate ready 仍报告 `READINESS_UNSUPPORTED` / ready FAIL |
| `node --test --test-name-pattern 'edited snapshots' tests/prepared-suite-cli.test.mjs` | 编辑被接受到 repeated 桶；实际 exit 1，预期 preflight exit 2 | `EDIT_BUCKET_MISMATCH`，禁止编辑与缓存重复桶混合 |
| `node --test --test-name-pattern 'cannot change method' tests/prepared-suite-cli.test.mjs` | declaration policy 改变仍被接受为 repeated | query-kind/cursor/includeDeclaration/snapshot 必须相同 |
| `node --test --test-name-pattern 'diagnostic observations' tests/prepared-suite-cli.test.mjs` | 只有 exact Locations 时诊断 gate 缺失 | 诊断未观察到时 gate FAIL，不删除普通诊断要求 |
| `node --test --test-name-pattern 'pinned unsaved edit' tests/prepared-suite-cli.test.mjs` | pinned TextEdits 输入被拒绝为 `EDIT_PIN` / exit 2 | 复用现有 UTF-16 edit helper，发 didChange 后立即请求；overlay 优先 |
| `node --test --test-name-pattern 'partial capture\|different target after edit' tests/prepared-suite-cli.test.mjs`（两个公开负例） | partial bucket 10/11仍标PASS；编辑后另一目标仍使用旧 oracle，actual exit1而预期2；**0/2 PASS，exit1** | 未执行样本显式计数/阻塞；capture failure不能通过整体 correctness；缺新 snapshot oracle在启动前拒绝 |

额外公开回归：互斥旧 CLI、pin mismatch、重复 unseen、伪 ready timer/flag、
timeout 保留在分母且继续后续请求、相同数量但范围错误的 missing/extra、
不同能力分桶、无法证明的 eviction/restart 明确 BLOCKED。
采样至少获得两个外部样本后才初始化，以便报告实际间隔；不是语义预热。

## 验证记录

```sh
node --test tests/prepared-suite-cli.test.mjs \
  tests/references-replay-cli.test.mjs \
  tests/references-replay-catalog-state.test.mjs \
  tests/test-layer-manifest.test.mjs
```

初轮公开 focused gate：27/27 PASS。独立 review 后新增上述两个 RED，
最终公开 focused gate：**29/29 PASS，exit 0**，零 fail/cancel/skip/todo。
`pnpm check`、`pnpm build` 和现有 locked native release build 均 PASS。
产品 bundle 与 native artifact hashes 在构建后未改变。

最终 `/usr/bin/caffeinate -i pnpm check:fast`：**1147/1147 PASS，exit0**，
零 fail/cancel/skip/todo；Node测试 duration `1542727.009706 ms`。
这是本轮实际整套检查，不是挪用前一构建的1133/1133。
whole gate 开始前冻结452份 source/test/script/config/benchmark输入文件的字节摘要；
不在运行期间改受验工具/测试。文档状态更新不改所测构建。
当前真实 Settings 两个 suite：命令均 exit 1，均如实保留 readiness FAIL；
第一组诊断观察 FAIL，第二组诊断观察 PASS。这不是 harness 测试失败。
输入、完整请求结果、RSS 与覆盖缺口见
[唯一 S01 证据报告](../reports/2026-09-29-semantic-ready-s01-baseline.md)。

没有修改预算、worker 数、SDK、deadline、golden 或项目边界；
没有提交、push、创建 Issue/PR 或合并。

## L01 可选预打开：同一快照的跨文件未查询目标

2026-10-06，parent revision `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`。
只扩展 prepared-suite 输入和真实 LSP replay，不改变 production semantic 路由。
可选 `preOpenTargetIds` 在 candidate catalog ready 后、首个语义请求前，
按清单顺序向已校验的 workspace target 文件发送正常 `didOpen`；
未配置时继续按 scenario 首次使用时打开。每个预打开文件仍观察正常诊断。

公开 RED：`node --test --test-name-pattern 'pre-opens pinned target documents' tests/prepared-suite-cli.test.mjs`。
普通沙箱首次被 macOS `ps` 采样权限阻断，不能算行为 RED；同命令授权只读采样后
exit 1，首请求前只有 `thing` 的 `didOpen`，缺 `second`。
最小实现后同命令 exit 0，1/1 PASS；双文件真实 Content-Length transcript 的
Location oracle 和两份正常诊断均通过。未知/重复 target ID 与越界文件在启动前拒绝。
输入 pin 和 readiness 语义未改变；预打开不冒充 server semantic-ready。

整份 `node --test tests/prepared-suite-cli.test.mjs` 首轮 22/23 PASS：
并行重型检查期间，原有 timeout-case 的 CLI 子进程触及测试自带 15 秒限时
（`spawnSync.status=null`）。负载结束后以原命令的单用例过滤、相同只读 RSS
采样权限隔离复测，1/1 PASS，耗时约 1.90 秒；未修改测试限时。
