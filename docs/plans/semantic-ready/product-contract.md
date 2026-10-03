# 产品契约：首次语义准备与就绪后交互

状态：根据用户提供的文档包整合需求口径；**没有宣称性能达标**。
技术选型仍受 S02/S05 可证伪实验与后续逐能力验收约束。
决策见 [ADR 0007](../../adr/0007-semantic-readiness-and-500ms-slo.md)，
执行顺序见 [当前计划](../2026-09-29-semantic-ready-execution-plan.md)，
具体统计见 [验收规范](../../benchmarks/semantic-ready-acceptance.md)。

## 不可交换的要求

| 要求 | 契约 |
| --- | --- |
| 正确性 | 完整合法语义范围；零遗漏、额外位置或陈旧结果；overlay 高于磁盘与持久化数据 |
| 时延 | 各核心能力 × 各正常场景独立报告完整响应 P95 ≤500 ms，另报 P99/max/失败/fallback |
| 内存 | 首次准备、持久化恢复、编辑追赶、交互和回收都计量；原门禁不变 |
| 复用 | pinned `ohos-typescript` 是唯一代码语义权威；不重建现有 ProjectGraph/文档/index/cache/scheduler owner |
| 协议 | 稳定 `--stdio` 与标准 LSP；Windows/macOS/Linux 分别验证 |

首次准备允许超过 500 ms，**不豁免内存、正确性、可取消和失败可观测性**。
不能把 5 GB 成本转入后台后只展示查询时 RSS。

## 场景与计时边界

| 场景 | 500 ms 要求 | 必须报告 |
| --- | --- | --- |
| 首次打开、尚无有效语义输入/覆盖 | 准备阶段豁免 | initialize、time-to-semantic-ready、准备 CPU/峰值/磁盘量 |
| 重启恢复有效持久化事实 | 恢复单列；ready 后适用 | 输入校验和恢复成本；之后未查询目标的完整响应 |
| ready 后首次查询新符号 | 必须 | 与答案缓存命中分桶；fallback 等待仍计时 |
| ready 后首次访问未打开模块 | 必须 | 不可重新命名为初始化 |
| 同快照重复查询 | 必须 | 缓存命中单列，不稀释慢桶 |
| 普通函数体/引用/公共 API 编辑后立即查询 | 必须 | 增量、排队、诊断等待和完整响应全部计时 |
| 正常淘汰/空闲回收后的首次查询 | 必须 | 不排除冷恢复样本 |
| SDK/target/预先定义的大分支重配置 | 可单列重新准备 | 变更原因、恢复时长与资源；不是普通字符编辑的豁免 |

采用客户端单调时钟：开始写完整 LSP 请求至完整终态响应接收并解析。
只报首条/部分结果或 server 内部查询耗时不满足该定义。
首次 ready 后的 `updating` 不重置 SLO 会话。
正常 timeout/error/重试最终失败保留为失败；用户主动取消与故意 ContentModified 单列负例。
大量结果编码若超过 500 ms，记录未达标，不截断结果。

## 语义就绪的含义

在现有 semantic owner 中拟议增加最小记录，而非新建 ReadyManager：

- `discoveryState` 沿用候选索引 warming/ready/degraded，不改变原义。
- `semanticState` 区分 unprepared/preparing/ready/updating/degraded/cancelled。
- `semanticGeneration` 绑定有效编译输入、source 身份、覆盖与投影版本。
- `readyCapabilities`/`unavailableReasons` 明确每项能力可用范围和未就绪原因。

只有已冻结产品支持矩阵中的必需能力都有完整、有效的查询路径，才可宣称总体 ready。
局部 capability-ready 不等于总体 ready；不得将困难符号或模块移出范围。
候选 catalog 提交、某个 cache 命中或预跑完基准查询均不能证明语义 ready。

诊断不必然阻止所有能力：普通代码错误和缺少必要分析输入分别记录。
必要 SDK/依赖/source 缺失或未知语义影响完整性时，该能力不得标 ready。
支持矩阵在取样前冻结，不按性能结果收缩。

## 身份与路由

输入身份绑定 canonical root、product/target、backend/patch、SDK/stdlib、options、
ProjectGraph/membership revision、source manifest、authoritative overlays 及投影/schema 版本。
准备/变更时维护内容摘要；不每次全仓哈希。mtime/size 不足以证明相同语义。
未知监听、嵌套 root、realpath 别名影响范围不能证明时保守失效。

拟议路由：有效完整结果 cache → 该 query-kind 的有效 compiler-derived 投影
→ 配置/版本/搜索覆盖足够的热 LS → 原 exact fallback。
References/implementations 的投影分别证明；completion/hover/signature 优先复用官方 LS。
Fallback 慢仍是性能失败；未知不等于 complete 空数组。

## 证据与范围

真实工程继续使用固定 Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9`。
现有 API24 兼容轨用于同 SDK 因果比较，不静默换 SDK，不冒充匹配 SDK/DevEco 等价。
匹配 SDK 与 DevEco 对照是独立门禁，不阻止记录授权兼容轨的实际失败/收益。

Pinned compiler 是否能批量产出精确投影尚未知；遍历 identifier、`getSymbolAtLocation`
或词法 `extends` 不自动等价于 references/implementation。
S02 失败则停止生产 schema 投入，保留完整慢路径并评估受预算热 LS 或另行批准的边界实验。
没有承诺任意规模、任意负载下全部请求必然低于 500 ms。
