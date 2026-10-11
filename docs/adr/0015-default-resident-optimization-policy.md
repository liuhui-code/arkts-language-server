# ADR 0015 默认启用预算约束的语义优化组合

日期：2026-10-11。状态：Accepted by explicit maintainer decision。

维护者明确要求当前有效优化组合默认开启，通过分支和 PR 合入 main
并推送 GitHub。本决定替代 ADR 0002、0012、0014 中这六项必须等待
L08 全部通过才可默认推广的限制；不是 L08 验收通过或发布证书。

## 默认策略

保留 indexed-batched、closure、full SDK、1024 MiB、一个语义 owner、
最多两个 resident contexts 和原压力滞回。未设置环境变量时启用：

| 环境变量 | 默认值 |
| --- | --- |
| `ARKTS_REFERENCES_CONTEXT_RETENTION` | `budget-aware` |
| `ARKTS_REFERENCES_RESIDENT_FAST_PATH` | `1` |
| `ARKTS_L02_SAME_CONTENT_PROMOTION` | `1` |
| `ARKTS_L01_PRESSURE_ADMISSION` | `1` |
| `ARKTS_L03_COST_AWARE_EVICTION` | `1` |
| `ARKTS_L01_TRANSIENT_DIAGNOSTICS` | `1` |

分别对应上下文保留、完整 resident 引用复用、同内容晋升、压力准入、
成本感知回收和持续 L3 临时诊断。不再要求 `ARKTS_BENCHMARK_CONTROL=1`。
布尔策略显式 `0` 仍关闭；retention 显式 `dispose` 保留原处置路径。

## 保持关闭的候选和控制

手动 Worker 主动回收、压力下自动替换 Worker、重复 L2 re-arm、旧
`ARKTS_SEMANTIC_SESSION_REUSE`、anchor reuse、scope 缩小、GC 和 trace
均不因此开启。基准接口仍要求 benchmark opt-in；队列溢出故障恢复
独立于主动回收开关，正常自动生效。

完整性、overlay 权威、新鲜度、取消、lease 和执行保护不变。
resident scope 无法证明完整时保留完整 fallback 或明确资源错误，
不能发布部分结果或以空结果冒充成功。

## 已知效果和风险

[同构建真实对照](../reports/2026-10-11-resident-effective-combo-comparison.md)
八进程40请求全部 exact，四对最新诊断一致；新引用974–1007ms，
对照4295–4596ms。编辑后仍约四秒，暖机更慢，RSS未见明显改善。
这是引用专项控制，不是 release P95 或完整能力矩阵。

L08 继续 IN_PROGRESS，550ms、最终内存、readiness、长期稳定性和平台
门槛不变。原 FAIL/BLOCKED/NOT_RUN 不改写。合入要求新完整
`pnpm check:fast` GREEN，并通过 PR，不直接写 main。

## 回滚

启动进程时同时设置以下变量恢复原优化关闭配置，也可单项独立关闭：

```sh
ARKTS_REFERENCES_CONTEXT_RETENTION=dispose
ARKTS_REFERENCES_RESIDENT_FAST_PATH=0
ARKTS_L02_SAME_CONTENT_PROMOTION=0
ARKTS_L01_PRESSURE_ADMISSION=0
ARKTS_L03_COST_AWARE_EVICTION=0
ARKTS_L01_TRANSIENT_DIAGNOSTICS=0
```

回滚不需要 benchmark 控制。默认开启和关闭的公开 stdio 验证见
[TDD 记录](../tdd/l08-default-optimization-policy.md)。
