# L05 阶段完成审计

日期：2026-10-09。状态：DONE，A～E PASS。
当前公开合同、固定构建真实对照和完整 check:fast 1467/1467 均通过，
退出0、无 fail/cancel/skip/todo，终态身份复核一致。未以 focused、旧 L04
whole 或真实回放替代完整回归。最终性能、内存、
semantic-ready、长期和平台毕业仍由 L08 判定，实验默认关闭。

## 要求与直接证据

范围来自[主计划 L05 完成清单](../plans/2026-10-06-budgeted-resident-semantic-plan.md)
及 [ADR 0012](../adr/0012-query-routing-and-fallback.md)。
implementations 沿用完整 compiler 路径与已有预算/生命周期 owner，
不使用 references 投影、答案缓存或词法继承猜测证明完整实现集合。

| 要求 | 当前证据 | 状态 |
| --- | --- | --- |
| L05-A 独立完整语义和真实复用 | interface/generic/alias、继承/override/成员、未打开实现、同名排除完整 oracle；277-source fixture 新目标同 Program/零 createProgram。当前真实两个 trace 新 About 同完整 2261-source Program，1496 project/652 SDK SourceFile 全复用；R-09 OFF，没有 references 答案投影 | PASS |
| L05-B 新鲜度和诊断 | v2/v3 增删与 UTF-16、配置/SDK/package 切换、打开文本优先、多根 close/reopen；未通知 package 及未知 membership 严格完整最新结果或 -32803/no result；通知/输入恢复后完整集合和最新 2322/2416 code/range/version | PASS |
| L05-C 预算/取消/恢复 | 选定 L03 RSS/成本/压力政策、正常 1024 MiB/原滞回/lease；真实 compiler-call 进行中取消唯一 -32800、无 partial/第二终态、完整4003位置恢复；驱逐/物理 Worker/trace OFF/默认完整路径均公开通过 | PASS；低预算仅功能 qualification |
| L05-D 当前同构建真实对照 | 两个独立冷进程/目标重新核验 IService6/About1；四新进程22/22 exact、两对完整集合/最新诊断一致，输入不变、产品退出0；trace/timing 分开，实际复用/38晋升/准备/响应/RSS/冷恢复完整保留 | PASS，仅阶段控制；raw ready FAIL 仍保留 |
| L05-E 完整回归和交接 | pnpm check:fast 1467/1467、退出0、无 fail/cancel/skip/todo；164 fast入口、310份测试/脚本及13份修改源码/测试与构建/工程/SDK等终态身份一致，四份真实清单/oracle也未改变。配置回滚、失败记录及阶段/L08交接齐备 | PASS，当前完整回归与终态证明 |

## 实施与回归边界

[本轮公开 TDD](../tdd/l05-budget-policy-implementation-contracts.md) 保存父 revision、
失败命令、最小 RED/GREEN、GREEN 后职责抽取及历史检查点。当前十文件
联合 132/132 PASS、退出0、无 fail/cancel/skip/todo，319,656.691919 ms；
23 个 L05 公开合同全部通过，原始 `.bench/l05-witness-final-focused-132.log`。

完整 Program 根集合修复先清理旧 removed delta、再应用当前 membership，
并保护同 revision 快速路径的集合数量。partial 恢复通过原 DocumentStore
root invalidation 同步刷新 membership/配置/依赖，完整稳态不新增扫描。
compiler 与 PackageResolver 的加载见证从现有 registry 初次加载前记录，
独立于 R-09；返回实现前核验 freshness，不让新建 Program 成为旧配置的
完整性借口。完整空集合法，缺输入不成功返回旧子集或空集。

core 错误为 editor-neutral IncompleteImplementationError，经原 Worker
workspace-incomplete 码及独立 LSP adapter 映射固定 -32803；取消第一原因、
旧代与普通错误合同保持。可选 trace observer 异常不得改变语义结果；
trace OFF 不做附加 Program 观察。不新增 capability、公共协议或语义 owner。

本轮修改的三份既有超限文件已凝聚职责并缩减：TypeScript service
3504→3489、semantic capability adapter 733→721、LegacySemanticEngine
1058→1057 行。它们仍为迁移债务；其它本轮修改手写源码/测试/夹具均≤500行。
既有未修改 proxy 563 行及 references batching test 1517 行债务继续保留。

## 失败记录与校准限制

真实生产 RED 保留：根 membership 缩为 preload 256 而丢失实现；
source-unavailable/partial 却返回成功子集；未通知 package main 变化返回
旧 First 实现，以及 R-09 OFF 的同一反例。兼容扩大联合曾129/132、三失败：
配置先加载后观测、partial 恢复配置缓存未刷新、故意 dangling-link 暖机
不再可证明。前两者最小修复，后者严格验证 -32803/no result，后续
references 完整 fallback/独立 legacy oracle 断言保持，未删测试或跳过失败。

错误 class-only alias 预期、SDK 2420 而实际2416、仅初始化一根的多根夹具、
1024 MiB 下 pressure-recovered 拒绝，都保留为无效预期/设置/资格证据，
不包装为生产缺陷修复。沙箱曾阻止失败用例清理子进程；只终止该临时
server/sidecar，235,887 ms 用例终态不是产品请求时延。

原始反例、探针、first GREEN 与107/130/132检查点见 TDD 的具名 `.bench`
证据；旧构建 pin 与第一次 IService discovery 不计入当前真实分母。
没有提高真实预算、preload 或超时，没有禁用诊断/GC硬压峰值或缩小scope。

[真实对照报告](2026-10-09-resident-l05-budget-policy-integration.md) 记录
单 timing 未查628/677ms、body edit1017/1087ms、编辑后稳态768/1477ms，
trace恢复13.17/13.21s、峰值约1.25GB Node/1.43GB产品树。ON保持38个
相同指纹脚本generation，但新目标两侧都复用，所以不归因错误。
每配置只有一个进程，macOS RSS 外采为下界，不证明P95、稳定提速、
长期泄漏、最终降幅或PSS。raw report仍FAIL/READINESS_UNSUPPORTED。

## 终态身份、回滚与交接

冻结后完整 pnpm check:fast 的类型检查、构建和 release sidecar 前置
通过；根测试1467/1467、退出0、无 fail/cancel/skip/todo，
2,140,654.306236 ms。工具返回输出保存在
`.bench/l05-completion-full.part-001.log` 至 `part-028.log`；part-008
有大量嵌套夹具trace的传输截断，标记和范围保留在
`.bench/l05-full-output-truncations.json`，不冒称完整逐字stdout。
根终态计数与退出完整保存在part-028及完成摘要；嵌套故意失败/skip/todo
夹具不作为根回归失败。当前whole不沿用旧L04的1449或focused132。

终态复核为 `.bench/l05-completion-post-full-identity.json`，八项检查均true：
产品pins、修改文件、fast入口、测试/工具、registry/runner/build script及
真实清单/oracle一致。源码与产物、工程/SDK/backend/stdlib/lock/sidecar
全部保持本轮真实控制的固定身份；没有回归后偷偷改测试或构建。

产品输入 `905fca366c83298af4f66c8c89af822fdd124cdb468d482edb90ad382ae384d7`；
修改文件/产物/工程/SDK/backend/stdlib/lock/sidecar pins 见
`.bench/l05-independent-inputs-build-identity.json`。fast入口映射摘要
`22641e4b1f3d32715ae569e2e2918bad47854beea3b0e0df3b340b49544c056d`，
310份测试/工具输入摘要
`b7b47f809b0d9ab8b08418c5da0b56e6240c7e94634764642fbd525dc15e6391`，
分别保存在两份 pre-full freeze artifact。

关闭 L02/L03实验flags回到原 dispose 配置；R-09/S05保持关闭。
新鲜度/未知输入保护与完整 compiler 路径保留，无生产默认推广，
未提交、推送或合并。L08继续最终500ms/P95、原内存降幅、semantic-ready、
soak/PSS/DevEco/规模/跨平台门禁，不作为L05前置。

`.bench/l05-completion-summary.json` 保存A～E及证据路径，主计划、Ledger、
ADR和semantic-ready入口同步为L05阶段DONE。本阶段无剩余实施验收项；
L06–L07自身合同和L08最终产品门禁仍开放，不自动开始下一阶段或推广默认。
