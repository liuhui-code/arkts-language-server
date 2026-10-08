# L01：Settings/API24 长驻 LanguageService 基线（阶段性证据）

日期：2026-10-06。状态：**L01 IN_PROGRESS；正确性控制 PASS，500 ms 稳定性 NOT_MET，产品 readiness/memory gate BLOCKED**。
本轮没有修改生产语义路径、预算默认值、worker 数、诊断或结果范围；没有提交、推送或合并。

## 固定输入与回放

- Server HEAD `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`；本轮 `pnpm build` exit 0，`dist/server.cjs` SHA-256 `99d16dc05bd8ca74cf538de80b39ac805c47de92ec98b2079924995220e0f5b2`；sidecar SHA-256 `84597a63c396ceaf2a84a3ded455b5cc29d21b6c4ad3c049f7b3ca820c2fd796`。
- Settings checkout `.bench/real-projects/settings-ecc550` clean，HEAD `ecc550dfaed880e04e38a2477eb7235cd50475b9`。工程声明 compile SDK 23、target/compatible 20；本次明确使用已安装的 DevEco OpenHarmony API24 `6.1.1.125` 控制环境，不声称 SDK23 产品等价性。SDK declarations digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`；backend `ohos-typescript@4.9.5-r10`。
- macOS Darwin 25.6.0 x64，Intel i7-9750H、12 logical CPU、16 GiB RAM，Node `v26.3.0`。目标 Node PID 与 replay harness/sampler 分开计；worker threads 不重复相加。
- [固定 manifest](../../bench/references/manifests/settings-resident-l01-api24.json) SHA-256 `cc3f05c992bd6a9a6028faec1bec549bf6d9d6523bbb191cac28c63b44d61965`。`ARKTS_REFERENCES_STRATEGY=legacy`、`ARKTS_SEMANTIC_SESSION_REUSE=off`、full SDK、默认内存预算 1024 MiB、trace-off。这是验证**同一长驻 LS** 的隔离实验，不是把 legacy 重新设成产品默认，也不是被拒绝的 S05 磁盘增量复用。当前产品 indexed-batched/transient 路由未动。
- Runner `scripts/bench/replay-references.mjs` SHA-256 `3be215bf42618960a67a91eca9c2cb4a6088195c3957e6ae65fb5f9ca361be06`；`prepared-query-suite.mjs` `167d81c276e061345bb6974510423872927a2ba2bf14a3d878d4236b60db947c`；`prepared-suite-input.mjs` `f86a5036ee26ee5931042696051f424ae96a16fdcd34deccd78ce42c007151d0`。runner hashes 单列，因为 suite 的 server-input pin 不覆盖 benchmark runner。

本轮原始执行命令如下（每次使用不存在的新 `--out` 路径；macOS 外部
`ps` 采样须有权限）。它只适用于上面记录的源码输入与 `dist` 字节；
后续 L01 trace 改动已改变构建产物，当前工作树直接运行旧 manifest 会被
pin 校验拒绝，不能把这种拒绝算成实验失败或暗中重写历史 pin。

```sh
pnpm build
node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-resident-l01-api24.json \
  --out .bench/semantic-ready-l01/resident-default-05.json
```

`prepared-suite` 即使 14/14 查询正确也固定以 exit 1 / `PREPARED_SUITE=FAIL` 报告尚不存在的 generation-bound semantic-ready 公共合同；不能把该退出码解释为查询失败，也不能改写为产品 PASS。最初沙箱尝试的 [default-01 原始记录](../../.bench/semantic-ready-l01/resident-default-01.json) 因外部 sampler `spawn EPERM` 在 initialize 前失败，0/14 请求执行，记作**采样环境阻断**；没有关闭采样伪造成功。随后只读采样获准，三个独立新进程完成。

## 查询序列与结果

所有位置为 zero-based UTF-16，`includeDeclaration=false`：先打开 `common/src/main/ets/core/controller/MenuController.ets`，在构造器使用处 `90:17` 发 full-scope `textDocument/references`（267 个 exact Location）；不修改文档，接着查此前未请求的同文件 class declaration `70:13`（247 个 exact Location）；然后同 snapshot 重复 class 10 次。最后另开 `common/src/main/ets/sendable/HomeInitData.ets`，查 class declaration `16:13`（9 个 exact Location）并重复一次。构造器与 class 属同一声明家族但**查询位置与结果集合不同**；HomeInitData 前有 `didOpen`，不能当作“未变 snapshot 的跨文件热查询”。自动诊断保留，因此也可能在首个 references 前参与 Program 准备；首个请求耗时不能独占归因为 Program 创建。三个目标都使用现有已验证 oracle 和完整 URI+range diff，非仅比较计数。

| 独立 trace-off 进程 | index candidate-ready，查询前 | 首次构造器 refs | 同文件新 class refs | HomeInitData（另一次 didOpen 后） | Node PID 采样 peak RSS | 正确性/诊断/退出 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| [default-02](../../.bench/semantic-ready-l01/resident-default-02.json) | 30.270 s | 16,938.6 ms | 285.5 ms | 174.1 ms | 684,232,704 B | 14/14 exact；v1 诊断 1+0；exit 0 |
| [default-03](../../.bench/semantic-ready-l01/resident-default-03.json) | 29.648 s | 20,687.2 ms | **1,025.0 ms** | 878.6 ms | 676,147,200 B | 14/14 exact；v1 诊断 1+0；exit 0 |
| [default-04](../../.bench/semantic-ready-l01/resident-default-04.json) | 20.548 s | 16,130.2 ms | 266.8 ms | 171.4 ms | 741,556,224 B | 14/14 exact；v1 诊断 1+0；exit 0 |

各进程均是 `index.catalog.terminal=ready`、1846/1846 catalog files（skipped 1）；这是 **index candidate-ready**，不是 semantic-ready。三个冷请求中位 16.94 s；同文件新符号中位 285.5 ms、三次中最大 1,025.0 ms，最近秩 P95 同样 1,025.0 ms（样本仅 3，不作正式 P95 推断）。30 次 class 重复为 2–22 ms，原始日志给出 `references.cache.hit`，所以不能把重复查询速度归因于 compiler 复用。三进程的 class、constructor、HomeInitData 均无 missing/extra/duplicate/invalid Location，普通自动诊断未关闭。

外部 RSS 原始曲线在上述本机 JSON 的 `memory.samples`，请求/诊断时间线在 `timeline`，每次采样包含目标 PID 与独立 sampler RSS。要求 50 ms 采样，但实际 p95 间隔约 218–422 ms；上述峰值是**观察到的下界**，不是保证捕获瞬时峰值，更不是 PSS/DevEco/最终 50% memory gate。三个进程的目标 Node peak 为 0.676–0.742 GB，未观测到默认 1024 MiB 压力策略驱逐；这不能外推到其他真实工程或长时间 churn。

## 独立 trace-on 归因与边界

把 manifest 中唯一字段 `ARKTS_REFERENCES_TRACE` 临时改为 `1` 后做一次独立 [trace-on 原始回放](../../.bench/semantic-ready-l01/resident-trace-01.json)，完成后恢复 trace-off manifest（当前 SHA 如上）；trace-on suite digest `3edb5d9370568e215995aaefa42b98a3aadeddf834ce512091eee53f3980afe3`。该 run 14/14 exact、诊断正常；首次构造器请求 31.08 s，不纳入上述时延分布。

- `semantic.context.create` 1 次，`contextSequence=1`；后续 `semantic.context.reuse` 11 次，没有 context eviction。三次不同目标为 `references.cache.miss`，11 次重复为 hit；同文件新 class 不是 result-cache hit。
- 两个 `diagnostics.program.complete` 观察点均见本 worker isolate 的 `programSequence=1`、2261 SourceFiles（1496 project、652 SDK、113 other）。两个观察点跨第二次 `didOpen`，但 references 本身未直接打 Program 身份事件；不能据此声称每个请求一定复用同一 TypeChecker。`contextSequence` 只证明 LS context，`programSequence` 只证明被观察到的 Program 对象，不等于 compiler build count。
- trace-on 冷请求的 document prepare 中 project-membership phase 为 2.81 s，后续两个 cache-miss 查询该 phase 约 0.15/0.07 ms；这只说明 membership 可热复用，**没有**给出首次 `createProgram/getTypeChecker/findReferences` 的各自占比。trace-on 会放大时间，只用于归因。

## 判定与下一步

- **Correctness control PASS**：三独立 trace-off 进程、42/42 完整响应及正常诊断、固定输入前后 pin 相同；另一次 trace-on 14/14 exact。
- **L01 性能筛查 NOT_MET/不稳定**：同文件未查新符号在 1/3 新进程超过 500 ms；首次 full-scope refs 16–21 s。缓存重复很快，但不能替代新符号样本。
- **Release readiness BLOCKED**：现有公开 harness 只证明 index candidate-ready，不提供 capability/snapshot-bound semantic-ready；跨文件同 snapshot 未查符号、定义/实现、TypeChecker 身份、编辑/压力恢复、长期 PSS 与原始 >3 GB reproducer 均未验证。不能宣称 500 ms 或内存产品目标完成。
- 后续 L01 应先在首次 full Program 查询**之前**打开两个目标文件，再比较同一 snapshot 的未查跨文件符号，并补独立 compiler phase/Program/TypeChecker 可观测证据；在实验范围内继续保持现有产品默认和 per-batch verifier。
