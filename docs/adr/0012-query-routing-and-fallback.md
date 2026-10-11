# ADR 0012：按能力查询路由、调度与安全回退

日期：2026-09-29。2026-10-10 状态：**Proposed；L04–L07阶段完成，实验默认关闭，L08最终验收后才可推广**。
S02 事实提取研究已暂停、S03 仍 BLOCKED；现行生产路由不变。

[L04 完成审计](../reports/2026-10-09-resident-l04-completion-audit.md) A～E PASS：
选定 L03 政策的公开组合 10/10、当前完整 check:fast 1449/1449 及终态
身份复核通过；两种声明策略的八轮同构建真实对照 52 项 exact，首次
新符号实际命中有完整覆盖和版本见证的 resident Program。准备/恢复
成本及峰值风险仍交 L08；本 ADR 不因阶段完成转为生产准入或替代 ADR 0003。

同日 [L05 完成审计](../reports/2026-10-09-resident-l05-completion-audit.md)
A～E PASS：23项独立implementation公开合同、联合132/132、当前完整
check:fast1467/1467及终态身份一致；四进程真实ON/OFF共22项exact、最新
诊断配对一致。R-09关闭仍独立保护完整范围和配置新鲜度，并实际复用完整
Program；未知范围/旧配置不得成功返回子集。慢准备/恢复、>500ms新目标及
采样峰值仍归L08，没有新capability、第二语义owner或生产默认推广。

2026-10-10 [L06完成审计](../reports/2026-10-10-resident-l06-completion-audit.md)
A～E PASS：19公开交互case、联合252/252、当前完整check:fast1492/1492，
终态身份一致；当前Settings/API24控制62/62、完整payload和最新诊断配对
相同，实际未查Program复用成立。配置/目录存在性误拒绝及SDK/容量兼容
RED均保留并最小修复；不提高预算、弱化范围/诊断或新建owner。
用户授权L06后继续L07，最终性能/资源/ready仍在L08，默认不推广。

当前[L07审计](../reports/2026-10-10-resident-l07-completion-audit.md)A–E有
直接通过证据：25公开编辑/调用case、整文件caller修复后联合93、同产品
真实62/62完整payload和最新诊断一致，实际11源晋升/未查Program复用及
OFF重建反事实成立。全新冻结完整1511/1511、根退出0及终态身份一致，
L07阶段DONE；高RSS及慢重建/恢复
如实留在L08，不修改生产默认、预算、诊断或能力owner。

## Context

已有完整结果缓存与 references 调度可复用；新符号 miss 仍慢。不同 LSP 能力的语义不能用一套未验证 symbol lookup 代替。

## Proposed decision

- 在现有 proxy/adapter 中按能力路由完整答案缓存 → **已证明覆盖该请求完整范围且版本有效的预算内热 LS** → 当前 exact fallback，不建第二公共语义层。
- 暂停 S02 投影读取；除非将来有新决策及各 query-kind 等价门禁通过，references/implementations 均不得消费失败的事实格式。L04 的 references miss/unknown 使用现行 indexed-batched/transient exact 路径；L05 的 implementations 独立验证。completion/hover/signature 在 L06 评估热 LS。rename 在 L07 额外验证合法性、冲突和编辑集合，不能把引用位置直接当可重命名编辑。
- 复用现有 interactive/global lanes、合并、取消和 revision fences。背景准备只能在实际调度点让出；异步包装同步 compiler 不是抢占。
- 不支持、失效或缺输入时保守回退，返回完整结果或显式错误；不能返回空数组伪装 complete。慢回退全部计入 SLO。
- 只有第二个实际能力出现相同输入/生命周期逻辑时才抽共用代码；投影语义和门禁按能力独立。

## Gate and rollback

真实 LSP 中 references 进行时 definition/hover 仍能结束，编辑使旧结果失效。新符号、新模块、普通编辑及驱逐/重启恢复各桶独立测 P95，不能用缓存命中稀释。rename 应用后的代码与完整 oracle 编辑集等价；调用层级方向和范围单独比较。
L04–L07 验证各切片的完整结果、快照、取消与执行保护；最终资源、
500 ms、长期 soak 和跨平台验证统一在 L08，未达标不阻止前序接线实验。

错误结果、快照或执行保护缺陷回滚对应能力实验路径；时延、内存回归如实带入后续实现和 L08。保留现有可工作的能力和公共响应语义；只有其公共 transcript GREEN 才广告新能力。前后台任务共享内存预算。

## Relations

[ADR 0001](0001-reference-search-default.md) 的 `indexed-batched + closure + full SDK`、[0002](0002-hot-semantic-context-lifecycle.md) 的 `dispose` 和 [0003](0003-reference-verifier-worker-lifecycle.md) 的 transient 默认保持。[ADR 0014](0014-budgeted-long-lived-semantic-session.md) 提供 L01–L03 的机制与预算实现，L04–L07 按功能、scope/快照和执行保护逐能力试路由，不等待最终性能指标；L08 全套验收后才可显式 supersede 对应默认条款。继续复用 [0004](0004-reference-result-cache-validity.md) 的 cache/coalescing、[0005](0005-index-proof-trust-boundary.md) 的索引恢复与 compiler 权威，以及 [0006](0006-semantic-request-scheduling.md) 的现有 lanes。

范围见[产品契约](../plans/semantic-ready/product-contract.md)；边界见[设计契约](../plans/semantic-ready/design-contracts.md)；门禁见[验收协议](../benchmarks/semantic-ready-acceptance.md)。
