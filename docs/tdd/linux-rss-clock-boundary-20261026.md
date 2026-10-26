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
   正常进程路径不增加读取；不伪造零 CPU、不钳制时钟、不放宽 PID/父子进程关系、进程退出或解析错误。
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

## 第二个独立收尾竞态

提交 `f3d328827e4c448a88db2319455d5eb136d8ba65` 的
[第二次完整 Linux CI](https://github.com/liuhui-code/arkts-language-server/actions/runs/40252030789)
为 2040/2041，唯一失败为 owner 层 incoming-calls 资源验收，原 watchdog 场景已通过。
原断言只打印进程 stderr 和 probe stderr，缺少资源 report，因此先增强错误信息再做独立复现。

[Linux 原样循环](https://github.com/liuhui-code/arkts-language-server/actions/runs/40255551502)
第 3 轮给出：3 个语义结果全部与完整 oracle 一致、无未执行场景、probe 正常 code=0、
已有 33 条采样、所有 stderr 为空，而 sampler 终态为 signal=SIGINT、code=null。
该 SIGINT 来自 `measure-query-layer.mjs` 在 probe close 后的主动收尾；不是 CPU 时钟再次抛错。

采样器本来就会在目标进程消失时退出循环并刷新输出。驱动在目标已退出后发送 SIGINT，
与采样器自己的退出收尾存在竞态，导致完整结果被收尾信号判失败。
不能把 SIGINT 当作成功码绕过，也不能删掉资源终态断言。

新增 `resource sampler finishes normally when target exit races sampler teardown`，通过真实 CLI
运行真实查询与采样。测试 preload 仅在独立子进程制造“输出已刷新、信号处理器已撤销、OS 进程尚存”的退出窗口；
原驱动在窗口内发送真实 SIGINT，`sampler-teardown-red.log` 得到同样的 SIGINT 终态，先 RED。
该窗口是受控故障模型；原始 Linux 已证明收尾 SIGINT 失败，但没有采样 Node 内部撤销处理器的具体指令时刻。

最小实现移除正常收尾时多余的 SIGINT，等待采样器随已退出目标自然结束并刷新输出；
保留原 5 秒 SIGTERM 收尾兜底和严格 code=0/采样数量/全部语义结果判断。
不增加配置或 IPC 协议，不延长超时，不将信号退出改成成功。
新增场景保留 Windows 等不支持平台的显式失败合同，不以 skip 冒充支持。

`sampler-teardown-green.log` 的四个完整相关文件为 32/32，零 skip/cancel/todo。
修改后的完整 CI 必须再次执行；此前 2040/2041 不追认为通过。原两次 CI 与两次独立复现均保留。

## 零 lifetime 与精度边界

上述退出竞态修复的独立 Linux 循环在第 12 轮仍出现时钟拒绝，见
`linux-sampler-close-fixed-attempt.log`；不能将前 11 轮通过当成问题已完全消失。
当时 stderr 未包含原始 ticks，不能断言该自然失败的确切 ticks 数值。
后续带原始时钟观测的 50 轮和 1ms 诊断采样循环均通过，未捕获新的自然时钟失败；
该结果只限定复现范围，不追认此前失败，也不证明不存在其他 procfs 竞态。

公开 probe API 的最小反例单独证明剩余确定性缺口：uptime×CLK_TCK 与 starttime 相同，
CPU ticks 为 0 或 1 时，无法计算 lifetime 百分比；100.05×100、0.29×100 和 0.07×100
还覆盖浮点运算的两侧舍入。`sampler-zero-lifetime-red.log` 在父提交
`f3d328827e4c448a88db2319455d5eb136d8ba65` 上失败。
新时钟仍明显早于 starttime 的原反例继续拒绝，未放宽成整 tick 容差。

最小修复在初始时钟不晚于 starttime 时重读一次真实 uptime（也覆盖 CPU=0）；
仅在实际 lifetime 为零或浮点 ULP 舍入范围内时，将 CPU 标为 `null` 并附
`cpuPercentUnavailableReason: "lifetime-below-clock-resolution"`，保留独立读取的 RSS。
不伪造 0%、不接受实质负 lifetime、不取消身份或进程关系校验。
采样器保留该缺测原因的公开回归先失败于 `sampler-unavailable-metadata-red.log`，
随后最小修改仅在存在该字段时传递它，正常输出形状不变。

字段依据：Linux [proc_uptime(5)](https://man7.org/linux/man-pages/man5/proc_uptime.5.html)
提供秒数，[proc_pid_stat(5)](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html)
提供以 `_SC_CLK_TCK` 为单位的 CPU/starttime；这些文件不是进程树的原子快照。
这是对无法测量的 CPU 比率明确标缺测，不是将资源门槛改成通过。

最终四个完整相关文件在 Mac 为 34/34，零 fail/skip/cancel/todo：

```sh
node --test tests/process-resource-probe.test.mjs tests/resource-sampler-boundary-cli.test.mjs tests/resource-sampler.test.mjs tests/query-layer-resource-cli.test.mjs
```

原始输出 `sampler-final-boundary-focused.log`。最终 PR 提交仍须运行原样完整发布 CI，
包括完整 `pnpm check:fast`；本地相关回归和诊断循环都不替代该检查。
