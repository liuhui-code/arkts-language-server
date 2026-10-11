# L04 预算政策下的引用合同

日期：2026-10-09。状态：PASS，L04 阶段 DONE。既有 R-09 路由与 L03
选定 RSS 政策的联合公开合同、八轮真实对照和当前完整回归已通过；
不新增生产快路径、owner、capability 或预算。实验仍默认关闭，最终
资源与时延判定在 L08。

## 固定起点与公开路径

父 HEAD 为 `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`，保留已有工作树。
产品源码输入 `dfa8f9e17decc768fb761a5335cc7457abfaeefcc4af6609cbfb3a752719a1ab`，
server `7d2b9d6705eff75d5b1e7ef16858d3bba2d2906f17b98321dfc6c67a83fc0884`。
起点公开 resident 合同单独 6/6 PASS、18,188.93145 ms；原调度合同
单独 1/1 PASS、871.079215 ms，不相加冒充同一运行。
完整输入复核见 `.bench/l04-precalibration-identity-and-derived-oracle.json`。

测试使用真实 Content-Length stdio 子进程、完整人工或独立 legacy
oracle 和正常版本化诊断。选定配置为 budget-aware retention、成本
感知回收、压力准入、transient 诊断，R-09 与同内容晋升显式开启；
自动 owner 替换关闭，正常预算仍为 1024 MiB。

## 联合 characterization

九个新增功能组合分别单独 1/1 GREEN，属于现有实现的 characterization，
不伪造产品 RED：热引用/编辑/驱逐后完整 fallback、alias/re-export、
未打开 native struct、compiler trace OFF、高 RSS 完整验证、高 RSS
多批显式拒绝、物理 verifier 取消/退出/恢复、refs 在途交互与编辑失效，
以及热 resident 请求取消后的完整恢复。

热路径对未查符号检查两种 declaration policy、sameProgram 与
completeScope，零 Program build/Worker start/答案 cache hit。编辑
v2/v3 逐完整集合及诊断 code/range/version 比较；压力 miss 不能冒充
空结果。1 MiB 高压力夹具只用于功能控制，不作真实工程资源指标。
取消响应仅为 `-32800`，编辑中旧引用为 `-32801`，未完成范围预算拒绝
为 `-32803`；公共结果与实际清理共同核验。

各独立原始输出在 `.bench/l04-selected-policy-*-characterization.log`。
首轮七文件串行联合回归 83/83 PASS、退出 0，318,803.365895 ms，
见 `.bench/l04-completion-focused-first.log`；它先于最后一条热 resident
取消组合，不冒称该后续测试集的 84/84。新增热取消单独 1/1 PASS、
2,545.044484 ms，完整输出保留。当前四文件选定政策控制 10/10 PASS、
退出 0、无 skip/todo/cancel，34,528.366214 ms，见
`.bench/l04-selected-policy-joint-controls.log`。不以单例、focused 或
L03 的 1439/1439 替代新测试集完整回归。

## 配置失效回放的工具 RED 与 GREEN

新增未通知 package entry A→B 的公开组合，必须拒绝旧 resident proof，
与变更后新 legacy 进程的两种完整集合相同，并实际运行选定 retention。
回放夹具原来不消费 `runtimeEnv`，结果已正确但运行的是 dispose；
公开断言“actually run the selected budget policy”真实 0/1 FAIL，
6,045.03694 ms，见 `.bench/l04-selected-runtime-env-red.log`。

仅为共享测试回放增加默认空的 runtimeEnv 并传入子进程；既有默认参数
不变。最小实现后首次 1/1 PASS、5,934.58042 ms，见
`.bench/l04-selected-runtime-env-first-green.log`。这是测试工具配置
传递的 RED/GREEN，不是生产 package freshness 缺陷或生产功能修复。

## 真实工程与收口边界

当前八份 Settings/API24 ON/OFF、两种 policy、独立 trace/timing 清单
均通过输入、oracle、编辑与场景 schema 校验；独立串行真实回放已完成，
八进程共 52 项 exact，四对完整集合和最新诊断一致，不与重测试并发。
每份固定新 pins，不倒改旧 8ff3938 热命中或旧失败报告。含声明编辑的
十一位置预期由已独立验证的编辑引用集和未变化声明位置合成，明确
记录为 derived expected set，不冒称新 compiler discovery；实际回放
已逐位置校验通过。

[阶段 A～E 清单](../plans/2026-10-06-budgeted-resident-semantic-plan.md)
均 PASS。[完成审计](../reports/2026-10-09-resident-l04-completion-audit.md)
记录当前完整 `pnpm check:fast` 1449/1449、退出 0、无 fail/cancel/skip/todo，
2,034,653.968483 ms；原始 full 分段日志保留。终态后的五个修改文件、
164 个 fast 入口、源码/构建及工程/SDK/backend/lock/sidecar/stdlib 与
冻结身份一致，见 `.bench/l04-completion-post-full-identity.json`。
配置、回滚、失败记录和 L08 风险交接齐备；raw readiness FAIL 及 runner
退出 1 保留，不以 ready/500 ms/P95 或最终内存门禁阻断本阶段，也不将
其失败重标为 PASS。
