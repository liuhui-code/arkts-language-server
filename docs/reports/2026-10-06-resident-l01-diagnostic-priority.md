# L01：诊断排队优先级与 Settings/API24 复核

日期：2026-10-06。状态：**公开 LSP 排队回归 GREEN；真实 Settings 定义跳转 500 ms 门禁 FAIL（0/3）；semantic-ready 与正式内存门禁仍 BLOCKED。**

## 变更与边界

在持久语义 Worker 的待执行队列中，变更仍具有绝对优先权。非 detached 状态下，仅允许首个 `define` / `hover` 越过队首的连续自动 `diagnose`；该队首诊断最多被越过一次，然后必须执行。不得越过已排队的 references、rename 等全局请求；已经执行中的同步诊断无法被抢占。Detached references 的既有交互插队规则保持不变，不受“一次越过”约束。没有改 SDK、诊断能力、语义范围、Worker 数、内存预算或 verifier 生命周期。

[TDD 记录](../tdd/l01-diagnostic-priority.md)中的真实子进程 Content-Length LSP 测试在旧 FIFO 上三次同点 RED：第二份诊断先于新 definition 响应；最小调度修改后 GREEN。另一条编辑交错测试确认旧 definition 不返回过期位置，v2 诊断发布，新 definition 精确跳转。测试钩子只在显式 `ARKTS_TEST_*` 环境变量下启用，真实回放没有设置。

## 固定输入与命令

[新 manifest](../../bench/references/manifests/settings-resident-l01-diagnostic-priority-api24.json) SHA-256 `75a876f209dfb0e8490c34fea24f5fa3cf73958ec68deb34c298096a018c31e9`；Settings clean HEAD `ecc550dfaed880e04e38a2477eb7235cd50475b9`，DevEco ETS API24 `6.1.1.125`、SDK 声明摘要 `8098b8ab…d4c6e4`，server HEAD `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`，本次 dirty-build bundle SHA-256 `d03fb34c…d54e`、语义 Worker `de1d5a5d…12c4`，Node `v26.3.0`、`ohos-typescript@4.9.5-r10`。全部输入前后 pin 相同。API24 是兼容测试轨，不是匹配 SDK23 的 DevEco 对比。

每次使用独立新进程和新报告路径，不覆盖历史对照：

```sh
pnpm build
node scripts/bench/replay-references.mjs \
  --prepared-suite bench/references/manifests/settings-resident-l01-diagnostic-priority-api24.json \
  --out .bench/semantic-ready-l01/hot-definition-diagnostic-priority-01.json
```

回放仍先对 `MenuController.ets` `70:13` 发 248-Location references，再对预打开、此前未查询的 `HomePageMenuManager.ets` `40:37` 的 `HomeInitData` 发 definition，精确目标为 `HomeInitData.ets` `16:13–16:25`。没有预先等待两份诊断；`ARKTS_REFERENCES_TRACE=0`。两个打开文档的 v1 自动诊断均正常发布，且各有一条实际诊断。

| 独立进程 | 首次 refs ms | 新 definition ms | 首次 refs 响应到 definition 响应 ms | 第二份诊断相对首次 refs 响应 ms | Node PID 峰值 RSS 采样下界 B | 原始曲线与完整结果 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 10,750.2 | **824.4** | 825 | 851 | 766,865,408 | [JSON](../../.bench/semantic-ready-l01/hot-definition-diagnostic-priority-01.json) |
| 2 | 9,419.1 | **703.9** | 704 | 738 | 749,469,696 | [JSON](../../.bench/semantic-ready-l01/hot-definition-diagnostic-priority-02.json) |
| 3 | 9,176.6 | **691.0** | 691 | 724 | 815,161,344 | [JSON](../../.bench/semantic-ready-l01/hot-definition-diagnostic-priority-03.json) |

三次均为 references 248/248、definition 1/1，规范化 URI＋UTF-16 range `missing=[]`、`extra=[]`、`duplicates=[]`、`invalid=[]`；诊断 `PASS`，server shutdown/exit 0。第一份诊断分别在首次 refs 响应后 133/142/127 ms 发布；definition 响应先于第二份诊断约 26/34/33 ms。由此证明真实请求不再必须等第二份诊断发布，但不证明已运行的第一份诊断被抢占。外部 sampler 每 50 ms 请求一次，实际采样受系统调度影响；峰值只作下界，Node worker thread RSS 不重复计数，不能代替 PSS 或正式内存门禁。

最终工作树 `pnpm check:fast` **1297/1297 PASS**，包含两条新公开 LSP 回归；`git diff --check` PASS。测试中没有禁用诊断或缩小合法引用范围。

回放工具总状态仍为 `PREPARED_SUITE=FAIL`、`READINESS_UNSUPPORTED`，因为服务端缺少与输入代际绑定的公开 semantic-ready 合同；这与本次精确结果和诊断 `PASS` 分开记录。相较历史无屏障 1,060/858/777 ms，现有三个样本仍全部 >500 ms；构建及运行时间不同且未随机配对，不应据小样本宣称统计性加速或把剩余 0.69–0.82 s 全部归因于 compiler。先前诊断屏障的 9–12 ms 是把约 0.8–0.9 s 等待移到请求之前，也不能作为产品结果。

下一步应在不改变正常诊断和资源策略的前提下，分别测量已运行诊断的剩余等待、定义请求的排队等待以及未预热目标的 compiler 准备；按同一 Settings pin 做 trace-on 归因、trace-off 时延对照。L01 与 500 ms 目标保持未完成。
