# 30K：初始化范围、重复候选与取消监督的 TDD 记录

父提交：`17e923f0cb8c430b6a10793a0f3d2f9097febfec`。
分支：`fix/partial-program-lifecycle-20261026`；不发布或合并。
逐项任务：[清单](../plans/2026-10-26-30k-interactive-recovery-checklist.md)。
实现决定：[ADR0024](../adr/0024-partial-initialization-and-progressing-synchronization.md)。
原始证据根：`.bench/30k-optimization-20261026/`（以下简称 E）。

## 逐个 RED 与最小实现

所有语义行为测试均用真实 child LSP、Content-Length stdio；私有观察器只观察实际编译器/FS，
不会替代其结果或取消状态。故障测试使用的截止设置和有界延迟明确属于受控测试，不是普通性能测量。

| 切片 | 首个失败命令 / 证据 | 最小实现 | GREEN |
| --- | --- | --- | --- |
| partial 初始化 | `node --test tests/semantic/partial-project-initialization.test.mjs`；E `s1-red.log`，20005源码下 SDK 初始化解析0次，期望1次 | partial 只准备显式空项目根的 SDK/标准库上下文，初始化预装不进入交互根 | `s1-green.log`，与原初始化10/10 |
| 相对候选重复探测 | `node --test tests/semantic/relative-candidate-reuse.test.mjs`；`s2-red.log`，60个 SDK 导入导致同一缺失候选 stat 61次 | 查询内1MiB有界候选复用；逐 importer 来源/边界和独立终检不省略 | `s2-green.log`，与目录/输入/读取窗口21/21；候选后来创建仍拒绝旧资格 |
| 活跃同步被关闭取消退役 | `node --test tests/semantic/progressing-synchronization.test.mjs`；`s3-red.log`，有限持续构建期间close/reopen后前台-32603 | 父端观察匹配请求/epoch的真实同步活动，只调整取消宽限参考点；绝对截止不续期 | `s3-green-v3.log`，相关16/16；`s3-absolute-boundary.log`，2/2，持续假活动仍按绝对截止终止 |
| 全局失败污染局部根 | 扩展第一个公开测试；`s1b-red.log`，references/rename失败后局部查询又加入无关正文 | 完整范围准入先于修改编译器范围；既有 planner 已要求完整 membership | `s1b-green.log`，相关20/20 |
| partial 仍浪费预装正文 | 同一公开入口；`s1c-red.log`，252次无关正文打开，期望0 | partial 不预读无关正文；保留清单、实际依赖和目录/输入资格；提取初始化锚点职责 | `s1c-green.log`，相关13/13，正文读取0 |
| 拒绝的打开文档全局请求伪造rootDirty | 扩展partial公开回归；`s4-red.log`，未改依赖构造解析2次，期望仍1次 | 重试完整范围时只执行真实membership重扫，不伪造配置/源码mutation；真实变更仍沿原失效规则 | `s4-green-v2.log`，33/33；`s4-freshness.log`，4/4，静默磁盘依赖变化后返回新行号 |

S3 仅在 Host token 记录活动的初版仍失败，活动 hook 初次放置错误也失败；
`s3-green.log`、`s3-green-v2.log` 均保留，不用最终 GREEN 追认中间候选。

## 第一次完整检查暴露的兼容性问题

E `final-check-fast.log` 是候选 v2 的第一次完整 `pnpm check:fast`。
已确认三项失败后中止（退出130，`first-check-interruption.json`），不是完整通过：

1. 两项公开 incoming-calls 回归要求原有具体错误
   `Call hierarchy result is incomplete: project-membership-incomplete.`，新准入提前抛出通用错误。
   提取 `prepareIncomingCallMembership`，保留原 source-unavailable 优先级和具体错误合同；原断言没有放宽。
   `incoming-compatibility.log`：两项目标公开用例通过。
2. 原低层用例把保留的成员路径和预装的正文混为一谈。
   将该职责移到 `tests/partial-project-source-delivery.test.mjs`：partial清单前缀不变、正文不预读；
   complete仍预读；实际依赖即使不在partial清单前缀仍必须加载。
   新3项加manifest4项共7/7，见 `source-delivery-compatibility.log`。

中止只对本任务已核验 PID/启动时间的进程组执行，保留已有 Zed 和其他 LS；
`first-check-cleanup-verified.json` 确认该组及原成员均已退出。

最终候选 v3 的来源、制品和完整检查结果以
[实施报告](../reports/2026-10-26-30k-optimization-execution.md)后续验收记录为准。

## v3实测揭示的第二层失效

独立 `real30k-v3-workflow-trace/` 中，打开文档的rename因partial拒绝后，下一次局部编辑又构造解析87个项目文件。
`prepareInteractiveWorkspace` 为重试成员清单调用 `workspaceFilesChanged(rootDirty=true)`，
该API表示实际根/配置变化，会清解析器缓存、推进重置epoch；请求随后仍因同一partial清单失败。
因此S1b只阻止了错误的根范围扩张，尚未阻止拒绝请求造成下一次冷构建。

新公开RED先于S4实现，原源码/制品为候选v3；用例补上了此前缺少的“打开文档→全局失败→局部查询→局部编辑”顺序。
S4保留全目录重扫的恢复能力，改用现有 `refreshProjectMembership`，不改变实际增删改或配置通知的失效合同。
附加静默磁盘变化回归要求下一次定义返回新行号，不能只测未变化输入时的缓存保留。

首次S4 GREEN尝试未先重建dist，夹具仍执行v3 Worker，故仍失败；`s4-first-green-runtime.json`保留实际旧SHA，
`s4-green.log`不作新实现证据。重建后33/33及额外4/4通过。
正在运行的v3完整检查为避免版本混用而中止，退出130，原日志为 `final-check-fast-v3.log`，
归属与原因见 `v3-check-interruption-new-gap.json`；不能写成完整通过。
最终候选改为v4：`candidate-v4-manifest.json`，源码摘要
`9bb486753cb394636a464c8c724321e5e4cd5c66108bfeb6375e045af2d71fb0`。
复用字节固定的旧main对照数据，重新测全部九档候选各三轮；v3及其两次资源保护中断不删除或追认通过。

## v4完整检查与引用错误合同

`final-check-fast-v4.log` 完整结束：2050项、2049通过、1失败，零cancel/skip/todo，退出1。
唯一失败是 `references-completeness.test.mjs` 的公开partial引用用例：提前准入错误被通用runner映射为
`Semantic query requires current workspace inputs`，原合同要求 `References require a complete workspace snapshot`。
检查前后760项源码/测试/配置输入及生产产物身份由 `validation-before-v4.json` / `validation-after-v4.json` 实际核验；
项数以这两份文件为准，不能把这轮写成通过。

S5复用该公开RED：与implementation相同，让引用适配层处理结构化的 `workspace-incomplete` 错误并保留原能力文案，
不按错误字符串匹配，不吞错或改变freshness/cancellation判定。新partial回归同时检查未打开、打开的公开错误文案。
重建后的 `s5-green.log` 13/13通过；此修正只改变LSP父进程错误呈现，Worker SHA与v4逐字节相同。
冻结v5，源码摘要 `328cccff06061a673878e283290427314e5dc5290f5c264f3687c308bbed81c9`；
最终规模计时仍重新测所有九档候选各三轮，再对该版本执行完整检查，所有中间版本数据单列。

最终v5完整`pnpm check:fast` **2050/2050 PASS，退出0，零fail/cancel/skip/todo**，日志`final-check-fast-v5.log`。
检查前后760项源码/测试/配置、实际编译器和5项生产制品SHA相同，且server/Worker匹配冻结v5。
性能矩阵、保护失败、原生索引未在等待预算内完成及UI/OOM限制仍按实施报告保留；fast通过不等于500ms或全功能大项目验收通过。

## 回归边界

保留真实取消、无活动同步不返回、假活动绝对截止、单终态、当前文档/配置重放、
共享恢复预算、物理退出后才能替换、失败 Registry 租约清算、来源和符号链接边界等原用例。
新测试不扩大文件上限，不返回截断的全局引用，不提高生产截止时间或内存限制。
完整规模样本包含失败，普通计时与插桩计时分开；真实 Zed UI 未执行不标通过。

现存超限迁移债：DocumentStore 1773→1765行、LegacySemanticEngine 785→783行、
project-file-set-cache 测试2190→2170行；TypeEngine 500→499行。
大文件均未增长，相关提取按职责进行。新手写文件不超过500行。
