# 产品契约：首次语义准备与就绪后交互

状态：产品要求仍有效，**没有宣称性能达标**。2026-10-06 的技术实施
改走 [L01–L08 当前计划](../2026-10-06-budgeted-resident-semantic-plan.md)：
预算约束长驻官方 LS 与现行 exact transient fallback。S02 未通过、S03
BLOCKED、S05 旧候选 REJECTED，均不再是当前实施前置。
决策见 [ADR 0007](../../adr/0007-semantic-readiness-and-500ms-slo.md)，
执行顺序见 [当前计划](../2026-10-06-budgeted-resident-semantic-plan.md)，
具体统计见 [验收规范](../../benchmarks/semantic-ready-acceptance.md)。

2026-10-10 用户明确确认“550”：当前 L08 完整响应 P95 验收上限为
550 ms，500 ms 保留为优化目标。仅调整时延上限；100 请求/5 独立会话、
336 格、正确性、真实 ready、内存、soak 与平台要求不变。下文阶段历史
中的 500 ms 失败不改写，旧证据不能自动成为新口径的认证。

## 不可交换的要求

| 要求 | 契约 |
| --- | --- |
| 正确性 | 完整合法语义范围；零遗漏、额外位置或陈旧结果；overlay 高于磁盘与持久化数据 |
| 时延 | 各核心能力 × 各正常场景独立报告完整响应 P95 ≤550 ms；500 ms 为优化目标，另报 P99/max/超过目标及上限的样本/失败/fallback |
| 内存 | 首次准备、持久化恢复、编辑追赶、交互和回收都计量；原门禁不变 |
| 复用 | pinned `ohos-typescript` 是唯一代码语义权威；不重建现有 ProjectGraph/文档/index/cache/scheduler owner |
| 协议 | 稳定 `--stdio` 与标准 LSP；Windows/macOS/Linux 分别验证 |

首次准备豁免交互时延上限，**不豁免内存、正确性、可取消和失败可观测性**。
不能把 5 GB 成本转入后台后只展示查询时 RSS。

2026-10-08 用户确认验收顺序：最终产品验证统一在 L08。L01–L07 按
阶段功能与公开 LSP 回归推进，继续测量并保留未达标项；500 ms、最终
内存、整体 ready、长期 soak、规模与跨平台目标不作为前序实现的阻塞
条件。完整结果、overlay/快照新鲜度、取消和可停止/回收的执行保护仍
逐切片验证；默认推广、发布和产品目标毕业须在 L08 通过全部原门禁。

2026-10-10 [L06阶段审计](../../reports/2026-10-10-resident-l06-completion-audit.md)
A～E完成，19公开case/252联合、当前62真实请求和全新whole1492通过，
终态身份一致；不是产品性能/内存/ready毕业。用户授权继续L07，
当时的500ms/P95、原内存、完整能力/场景与平台要求不因阶段DONE而降低；
当前时延口径仅按上方用户明确授权调整。

[当前L07审计](../../reports/2026-10-10-resident-l07-completion-audit.md)A–E
直接证据通过：完整版本化编辑/实际应用、独立调用方向/输入/预算合同与
当前62真实完整payload/最新诊断一致，实际晋升复用反事实成立。全新冻结
完整1511/1511、根退出0和终态身份一致，L07阶段DONE；下列最终产品
阈值、正常诊断和默认关闭均不改变。

## 场景与计时边界

| 场景 | 550 ms P95 验收（500 ms 目标） | 必须报告 |
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
大量结果编码也计入完整响应；超过 500 ms 记录目标偏离，超过 550 ms
保留为上限外样本并参与分桶 P95 判定，不截断结果。

## 语义就绪的含义

在现有 semantic owner 中拟议增加最小记录，而非新建 ReadyManager：

- `discoveryState` 沿用候选索引 warming/ready/degraded，不改变原义。
- `semanticState` 区分 unprepared/preparing/ready/updating/degraded/cancelled。
- `semanticGeneration` 绑定有效编译输入、source 身份、官方 LS/Program
  覆盖及后端版本；只有将来另行批准投影时才加入投影版本。
- `readyCapabilities`/`unavailableReasons` 明确每项能力可用范围和未就绪原因。

只有已冻结产品支持矩阵中的必需能力都有完整、有效的查询路径，才可宣称总体 ready。
局部 capability-ready 不等于总体 ready；不得将困难符号或模块移出范围。
候选 catalog 提交、某个 cache 命中或预跑完基准查询均不能证明语义 ready。

诊断不必然阻止所有能力：普通代码错误和缺少必要分析输入分别记录。
必要 SDK/依赖/source 缺失或未知语义影响完整性时，该能力不得标 ready。
支持矩阵在取样前冻结，不按性能结果收缩。

## 身份与路由

输入身份绑定 canonical root、product/target、backend/patch、SDK/stdlib、options、
ProjectGraph/membership revision、source manifest、authoritative overlays；
投影/schema 版本仅在将来批准对应能力时纳入。
准备/变更时维护内容摘要；不每次全仓哈希。mtime/size 不足以证明相同语义。
未知监听、嵌套 root、realpath 别名影响范围不能证明时保守失效。

拟议路由：有效完整结果 cache → 配置/版本/搜索覆盖足够且资源允许的
官方热 LS → 当前 exact transient fallback。各能力独立证明覆盖和新鲜度；
S02 的 compiler-derived 投影不在当前生产路线，不能冒充已实现的中间层。
Fallback 慢仍是性能失败；未知不等于 complete 空数组。

## 证据与范围

真实工程继续使用固定 Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9`。
用户再次确认 API24 兼容并要求完成本机可执行验收；当前不另设版本匹配
门禁，不静默换SDK。SDK字节/必要输入/正确性/ready要求不变，DevEco/PSS
对照仍独立，不能用本机RSS冒充。

Pinned compiler 的 S02 批量事实 v1–v6 未通过真实工程门禁；遍历 identifier、
`getSymbolAtLocation` 或词法 `extends` 不自动等价于 references/implementation。
目前停止生产投影/schema 投入，保留完整慢路径并实测受预算热 LS。
没有承诺任意规模、任意负载下全部请求必然低于 500 ms。
