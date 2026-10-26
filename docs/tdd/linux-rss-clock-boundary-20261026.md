# Linux RSS 采样中的新生子进程时钟边界

日期：2026-10-26。集成 PR：[#99](https://github.com/liuhui-code/arkts-language-server/pull/99)。
初始候选：`8def69d5490e74807a5e99365825a2ed403ccb9f`。

本轮仅修复合并检查暴露的开发工具采样缺陷；不修改语言服务缓存合同、30K Program 准入或 SDK 策略。
缓存性能 TODO 继续暂停。455 文件冷目录 3 秒门槛继续按用户授权豁免，其余检查不跳过。

## 原始失败与完整性

初始候选完整 Mac `pnpm check:fast` 为 2039/2039，零 fail/skip/cancel/todo，退出 0，
测试时长 3104570.628697ms；812 项冻结输入前后无变化。
这是修复前候选的结果，不能作为本次后续提交的全量通过证明。

同一候选的 [Linux 正式 CI](https://github.com/liuhui-code/arkts-language-server/actions/runs/40247806374)
完整 fast 为 2038/2039，零 skip/cancel/todo。唯一失败为
`resource watchdog retains the completed answer and the unfinished attempt before its unexecuted tail`。
报告为 `QUERY_LAYER_RSS_SAMPLER_FAILED`，采样器退出后 driver 将 probe SIGTERM，故障中断 marker 尚未产生。
本次失败不是已豁免的冷目录门槛，不能以该豁免绕过。

原断言缺少 sampler stderr。独立诊断分支仅增强该断言的失败信息，保留全部条件，
在相同 Ubuntu 24.04 / Node 20.19.5 下串行重放公开 CLI。
[原样复现](https://github.com/liuhui-code/arkts-language-server/actions/runs/40251457396)
第 1–5 轮通过，第 6 轮失败，记录：

```text
samplerStderr: process 4358 started after the reported uptime
samplerCloseResult: code=2, signal=null
sampleCount: 12
timeline: []
```

诊断分支 `e931c10d4446154e8c51f5e5c15673a3d6f3d9f9` 的采样实现与初始候选一致；
诊断 workflow 不纳入产品 PR。没有将旧失败重标为通过。

## 实际调用链和根因

`tests/query-layer-resource-cli.test.mjs` → `scripts/bench/measure-query-layer.mjs` →
`scripts/bench/sample-process-tree-rss.mjs` → `createProcessResourceProbe({ platform: "linux" })`。

`tests/support/process-resource-probe.mjs` 在 sample 开始时读一次 `/proc/uptime`，随后异步读取进程树。
子进程可以在这些读取之间出生并累积 CPU ticks；其 startTimeTicks 晚于采样开始时的 uptime。
旧 `lifetimeCpuPercent` 对这样的非正 lifetime 抛 `EPROBE_PARSE`，从而丢掉本来有效的 RSS 采样，
使监督故障场景尚未执行就被错误中止。不是语言服务器的 watchdog 断言过严。

## RED → GREEN

证据根：`.bench/merge-main-20261026/`。

1. `sampler-clock-red.log`：在独立工作树通过公开 `createProcessResourceProbe` API 构造时序，
   初次 uptime=100.00s，后续读取到 startTimeTicks=10005、已有 2 ticks CPU 的子进程。
   父实现抛 `process 411 started after the reported uptime`，而应保留真实父/子 RSS 并使用新的实际时钟。
   RED 命令：

   ```sh
   node --test tests/resource-sampler-boundary-cli.test.mjs
   ```

2. 只在已累积 CPU 且初始 clock 不晚于进程出生时，重新读取一次真实 `/proc/uptime`，再计算 CPU lifetime。
   正常进程路径不增加读取；不伪造零 CPU、不钳制时钟、不放宽 PID/父目录身份、进程退出或解析错误。
   RSS 仍来自原实际读取；sample 的开始与完成边界保持原样。
3. 新增反例：新读取的 uptime 仍不一致时，继续精确抛出原 `EPROBE_PARSE`；不能吞错后发布假值。
4. `sampler-clock-green-with-rejection.log`：以下三个完整文件 24/24 通过，零 skip/cancel/todo：

   ```sh
   node --test tests/process-resource-probe.test.mjs tests/resource-sampler-boundary-cli.test.mjs tests/resource-sampler.test.mjs
   ```

5. 修复后 Linux 原样公开 CLI 循环验证独立记录于
   [诊断运行](https://github.com/liuhui-code/arkts-language-server/actions/runs/40251829935)，
   不将名称过滤的循环当成完整 fast；最终完整检查以 PR 最终提交的 CI 及本地原始日志为准。

同时保留新的失败消息字段 samplerStderr、sampleCount、samplerCloseResult 和 timeline，
后续失败无需再丢失真正的采样原因。没有放宽原 watchdog、请求完整性或中断终态断言。

## 证据与边界

- `ci-job-raw.log`：初始候选完整 Linux job，包括最终 2038/2039 汇总。
- `linux-sampler-original-repro.log`：第六轮真实 Linux 失败及 stderr。
- `sampler-clock-red.log`、`sampler-clock-green*.log`：确定性时序 RED、修复及仍拒绝错误时钟的反例。
- `check-fast-initial-candidate-result.json`：初始 Mac 完整检查收据；没有冒充最终修复版本。

进程树采样本身不是原子快照，已存在的 sample 完成时间仍用于识别跨操作区间的采样；
本修复不把 CPU lifetime 近似值或一次采样当成语言服务器的独占阶段时间。
30K OOM、20,000 成员上限和超过 500ms 的操作仍按原报告保留。
