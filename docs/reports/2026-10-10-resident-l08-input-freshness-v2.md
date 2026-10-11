# L08 输入核验优化：当前真实配对复测

结论：输入 freshness 的重复扫描已减少，同快照 rename 开发控制通过；
L08 仍 IN_PROGRESS，真实 semantic-ready、编辑/入向调用时延及其余产品
门禁未通过，不可默认推广或合并 main。

父 HEAD：`1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`。实现/公开 RED 见
[TDD 记录](../tdd/l08-query-input-freshness.md)，原门槛见
[最终验收协议](../benchmarks/semantic-ready-acceptance.md)。

## 冻结输入及原始证据

当前输入摘要 `b9c5192003bcd94377cb42add44f3ce21a77569adcea791be95ffcdc1a89fd3e`，
server `b7b5bd8329065856c2bfb145510f2e4014473807e949324671b8349fdbce8f31`。
Settings ecc550、API24/6.1.1.125、backend 4.9.5-r10、1024 MiB 选定
政策、正常诊断和完整 SDK 均不变；其余 Worker/SDK/目标池 pins 保存于：

- `.bench/l08-input-freshness-on-timing-v2-manifest.json` / `.json` / `.metrics.jsonl`
- `.bench/l08-input-freshness-on-trace-v2-manifest.json` / `.json` / `.metrics.jsonl`
- `.bench/l08-input-freshness-v2-analysis.json`：原报告 SHA 和八项配对检查。

两独立进程各 15/15 COMPLETE、exact、无 missing/extra/duplicate/invalid。
完整 payload、最新诊断、目标池和产品 pins 配对一致；终态输入不变，
产品退出 0。两个 CLI 均退出 1 / raw FAIL / READINESS_UNSUPPORTED，
candidate catalog ready 不冒充整体语义 ready。trace-on 不并入产品分布。

## 单轮时延，不是 release P95

历史 baseline v1 与当前构建分别保留；表中为单次完整响应，不能混采或
视为 ≥100 请求/5 会话毕业。首次 warm 是语义准备尚未完成的控制，
不是合法的 ready 后首次请求样本。

| 正常控制 | 历史 v1 ms | 当前 trace-off ms |
| --- | ---: | ---: |
| 未查询 lazy prepareRename | 577.4 | 343.1 |
| 重复 prepareRename | 470.7 | 240.9 |
| 重复 rename | 924.4 | 467.7 |
| 重复 prepareCallHierarchy | 455.9 | 230.2 |
| 重复 outgoingCalls | 456.7 | 237.5 |
| 重复 incomingCalls | 1530.9 | 1278.2 |
| 正文编辑后 rename | 1831.1 | 971.9 |
| 编辑后重复 rename（诊断重叠） | 1408.4 | 730.1 |

首次 warm implementation 仍 15.381 s；catalog 准备 7.586 s，真正
time-to-semantic-ready 仍 null。首次 rename 1.911 s，未完成整体 SLO。

## 归因和资源边界

当前 trace-on 没有 trim/evict。重复 rename 回调 466.1 ms、零 Program
重建；重复 incoming 回调 259.9 ms、零重建，但完整响应 1357.5 ms，
约 1.10 s 在回调以外，不能归咎于 compiler 查询本身。正文编辑有一次
859.4 ms createProgram，1495/1496 项目 AST、652/652 SDK AST 实际复用；
大量 AST 复用不证明增量 wall time 达标。编辑后重复窗口有正常 v2 诊断。

trace-off 外采 Node 峰值下界 842.2 MiB，server+sidecar 1011.5 MiB；
采样实际间隔 P50/P95/max=127/136/150 ms（请求 50 ms），293 点、
采样器 stderr 空。未包含实际 Zed，不是完整产品 tree；Mac RSS 不是
Linux PSS，单对结果不证明最终内存收益或 DevEco/规模门禁。

当前freshness构建已冻结全部1557份源码/测试/工具/文档/输入，执行全新
check:fast：1516/1516、根退出0、无fail/cancel/skip/todo，
2166120.94808ms；终态全部内容/路径、产品/SDK pins、175登记/168fast
及运行产物身份实际核对相同。第8段trace输出截断如实保留，不称逐字
完整stdout。原始freeze/19段输出/postflight均位于`.bench/l08-input-freshness-v2-*`。

下一步在既有semantic owner内锁定真实ready合同，再处理回调外等待/
编辑长尾。当前结果只关闭本切片的重复扫描开发控制，不关闭L08。
