# ADR 0015 默认启用预算约束的语义优化组合

日期：2026-10-11。状态：Accepted by explicit maintainer decision。

2026-10-18：[ADR 0018](0018-semantic-groups-and-initial-preparation.md) 接受稳定组与延迟释放，默认压力改为 4GiB、支持配置，首次项目初始化不受压力值限制；下文 1024MiB 和成本优先排序为此前策略。新机制按 TDD 迁移，实际实现状态见 ADR 0018，不借用本记录的旧回归结果。

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

2026-10-16：同内容策略也覆盖已缓存closed普通源的重复changed通知：物理身份
未变且有界重读全文完全一致时不推进语义内容修订；通知自身的appliedRevision、
取消及返回前fence仍前进。沿用同内容缺省1／显式0，不增加第七个开关。
实际内容／身份变化、未知／创建／删除／overlay或别名不确定仍保守失效；
不是S05或实际编辑后的LS/AST跨批复用。见[OP04当前证据](../tdd/op04-versioned-overlay-snapshot.md#2026-10-16重复磁盘通知的独立输入切片)。
该5e7bffc4的原完整check:fast已1858/1858、exit0并独立审计47ad6dda；
旧FAIL与最终产品门禁不重标，也不扩大提交／推送／合并的授权范围。

随后72358623仅修正READY准备进入已采纳的同步模块／目录复用作用域，沿用
缺省1／显式0及原32次解析／32目录上限；不新增默认候选或跨请求LS／AST。
两入口公开探测60→1，十完整文件64/64；固定正常编辑中位约3.42→2.97s，
但四对RSS中一对1.1595，资源≤1.10假说未通过，不称净内存收益。
当前原完整check:fast已1862/1862、exit0、零注解并独立审计8c5cc269，
不借前一1858/1858，也不将RSS未通过项改标；详见
[OP04最新记录](../tdd/op04-versioned-overlay-snapshot.md#当前72358623完整回归终态)。

## 保持关闭的候选和控制

手动 Worker 主动回收、压力下自动替换 Worker、重复 L2 re-arm、旧
`ARKTS_SEMANTIC_SESSION_REUSE`、anchor reuse、scope 缩小、GC 和 trace
均不因此开启。基准接口仍要求 benchmark opt-in；队列溢出故障恢复
独立于主动回收开关，正常自动生效。

2026-10-15：后续OP04版本化Snapshot不是上表六项之一。当前同构建400次真实
编辑没有稳定时延／RSS净收益，默认推广REJECTED，缺省／0完整解析，只有
`ARKTS_VERSIONED_OVERLAY_SNAPSHOTS=1`保留有界实验。显式1的原生增量重用及
全部新鲜度保护仍在；这不撤销上表维护者已授权的六项默认，也不以最终550ms／
PSS前置阻塞其它切片。证据见[OP04记录](../tdd/op04-versioned-overlay-snapshot.md)。

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
