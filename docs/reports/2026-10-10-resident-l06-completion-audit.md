# L06 阶段完成审计

日期：2026-10-10。状态：DONE，A～E PASS。
当前19项交互公开case、十九文件联合252/252、固定构建真实控制62/62，
以及全新完整`pnpm check:fast`1492/1492均通过；根命令退出0，
无fail/cancel/skip/todo，终态源码/产物/测试/工具/工程/SDK身份一致。
最终性能、内存、semantic-ready、soak和平台毕业仍在L08；实验默认关闭。

## 要求与直接证据

范围来自[主计划L06完成清单](../plans/2026-10-06-budgeted-resident-semantic-plan.md)
和[ADR0012](../adr/0012-query-routing-and-fallback.md)。
[公开TDD](../tdd/l06-budget-policy-interactive-contracts.md)保留父revision、
真实RED/GREEN、兼容回归与冻结顺序；
[当前真实控制](2026-10-10-resident-l06-budget-policy-integration-v5.md)
独立保留完整oracle、正常诊断、实际复用及准备/响应/RSS成本。

| 要求 | 当前证据 | 状态 |
| --- | --- | --- |
| L06-A 完整交互语义与真实复用 | definition/typeDefinition、hover markup/range、signature全部参数/激活位置；completion/resolve/auto-import的来源、edit/sort/snippet/isIncomplete完整保留。公开独立oracle/完整基线一致，未查目标同有效完整Program；当前真实ON新definition复用Program1、零createProgram，OFF为Program2/一次create，不是答案cache推断 | PASS |
| L06-B 当前输入与诊断 | overlay/API、配置、SDK/package代表性变化，最新诊断code/range/version；未通知package及同版本resolve旧句柄明确-32803/no result，通知后完整恢复；未知输入不发布旧子集，合法补全截断如实标记。false存在性读取允许无关sibling，true瞬时目录必须拒绝；owner/target/负路径容量兼容均通过 | PASS |
| L06-C 预算、取消与恢复 | 选定L03 RSS/成本/压力组合、正常1024MiB/原滞回/lease；三配置交互/取消、编辑旧代拒绝、实际refs在途交互完成、驱逐/物理Worker恢复、trace OFF及默认完整安全路径。64MiB恢复仅功能qualification，不充当正常产品预算 | PASS |
| L06-D 当前同构建真实对照 | Settings/API24八目标各两独立冷进程重新核验；四新进程62/62、两对完整payload/最新URI版本诊断/目标池/pins一致，产品退出0。trace/timing分开，实际Program/SourceFile复用、准备/完整响应/RSS和恢复成本全部记录 | PASS；阶段控制，raw readiness FAIL保留 |
| L06-E 冻结完整回归与交接 | 新完整check:fast1492/1492、退出0；316测试/工具、172登记/166 fast入口、100历史及当前benchmark输入、42修改文件与产品/工程/SDK等终态身份一致。逐项审计、配置回滚、失败记录与L08交接齐备 | PASS |

252项联合还包含既有compiler/registry/tooling，不称作252项公开stdio。
真实编辑/恢复以hover为代表，不冒称所有能力×所有输入的最终矩阵。
无新capability、第二checker/语义owner，沿用现有lanes、完整安全fallback、
取消第一原因、版本fences和正常诊断；stdout仍仅协议，临时DEBUG均移除。

## 最小修复与失败记录

最初六类package及旧resolve返回陈旧结果、v2诊断仍为空，均有真实公开RED。
compiler/resolver在实际加载前记录输入见证，在provider/返回边界核验，
editor-neutral输入错误沿现有workspace-incomplete→固定-32803映射；
新建Program不成为旧配置完整性的借口。检查保留64项协作cadence及边界，
没有削弱取消断言。struct definition span先characterization再职责抽取。

四轮whole失败及后续兼容RED永久保留，不能由当前PASS覆盖：

1. 第一轮删除重试被resolver canonicalRoot目录内容变化误拒绝；改为真实
   realpath身份见证，内容读取/枚举仍严格。确认失败后中断，非完整whole。
2. 第二轮watched create首补全被ProjectModel physicalPath内容guard误拒绝；
   实际Worker堆栈定位后同样分清realpath与内容。中断，非完整whole。
3. 第三轮原SDK热查询从0变1600配置探测；生产registry明确管理resolver，
   直接generation-fixed SDK引擎恢复原0探测。保留RED与最小GREEN；中断。
4. 第四轮自然结束1488/1490、退出1、2037442.497539ms：canonical owner
   变化只重建LS而未invalidate对应旧ProjectModel；target首查询真实false
   directoryExists窗口遇无关父目录变化。分别最小invalidate对应model，
   以及真实布尔存在性/内容见证分离；新增false和true窗口两公开合同。
5. 新十九文件联合曾251/252，原800-package目录容量warm合同失败；
   probe为retainedPaths4096，不是时延猜测。恢复真实稳定目录full stamp
   和相同已加载owner的负child聚合，不重盖cache、不增4096容量。
   四重点合同4/4后，相同十九文件252/252、当前D和本轮whole全部通过。

无效oracle字段预期、夹具参数和观察工具转录问题与生产RED分开记账。
没有提高预算/preload/超时、静音诊断、缩小合法范围或用GC压峰值。
测试-only preload仅控制私有夹具的实际fs.stat窗口，不伪造LSP答案；
不是生产或真实benchmark的NODE_OPTIONS干预。

TypeScript service从L06起点3489降到3470，span/输入/目录适配责任明确。
本轮其它修改手写源码/测试/夹具均≤500；registry498、resolver499、
witness180、runtime485、runner350、两个交互测试319/378、隔离fixture34。
3470行service仍为迁移债务；本轮未修改的proxy563和references batching
test1517等既有债务保留，不宣称仓库全部已达限。

## 完整终态与身份

冻结时间2026-10-09T18:17:33.475Z；完整check:fast的类型、构建和release
sidecar前置通过，根1492/1492、退出0，2039816.131497ms；
终态2026-10-09 18:52:11 UTC（本地10月10日）。
`.bench/l06-completion-full-v5-terminal.log`及完成摘要保留完整根统计。
分段000–057中part008传输截断（28521 tokens/25000预算），另外一次
观察消费输出后因累计值类型错误而丢失该段；分别记录在
`.bench/l06-full-v5-output-truncations.json`与
`.bench/l06-full-v5-observation-gaps.json`。不冒称完整逐字stdout，
也不从可见PASS行累加判定；嵌套故意失败夹具不等同根失败。
当前whole不沿用旧L05的1467、第四轮1488或focused252。

终态复核`.bench/l06-completion-post-full-identity-v5.json`全部检查true：
完整产品pins、全部316测试/工具字节及聚合、登记/fast入口、100基准输入、
42修改文件，并实际核对四份D报告的初始/postflight pins与inputUnchanged。
测试/工具聚合23241a120daf65851f408a21e2546322017931a26a2c4801b949a61a120bc05d。
产品输入f3f22d83f9f5d67c5303de9505a81c469da80e334c3bf5828423969c180a00b5；
server e352097a37ff30fca109172757af649cde44de5beef29cbc60345ca12f8bf5ac；
semantic Worker297d44a6a8fbe7cefe5f0128dff0302ab3817491e139fd154c5c9935cac19d8b。
父HEAD1b910152；Settings ecc550dfaed880e04e38a2477eb7235cd50475b9干净，
API24/ETS6.1.1.125、backend4.9.5-r10、Nodev26.3.0。
全SDK/工程/sidecar/Verifier/stdlib/lockfile/memory-gates身份在复核artifact；
不可变v1–v5清单和旧报告不重pin。

## 回滚、L08风险与下一阶段

关闭benchmark-controlled晋升及成本/压力/transient实验即可回到已有
默认完整安全路径；本轮输入新鲜度、取消/版本保护和正常诊断不随trace
关闭而绕过。原indexed-batched/closure/fullSDK、dispose/transient默认保持。

单timing未查definition672/1336ms、typeDefinition1470/1458ms，body edit
1113/1092ms、trace恢复5814/5767ms；准备7307–7502ms。
Node采样峰值804.19–1075.82MiB、产品树972.91–1244.87MiB；trace超正常
软预算，释放LS不证明物理RSS下降，自动Worker回收本轮关闭。
每配置单进程、外采实际间隔P95约131–133ms，是峰值下界；不证明稳定
P95、最终内存降幅、长期泄漏或Linux PSS。raw FAIL/READINESS_UNSUPPORTED、
原>3GB/50%、DevEco/PSS、100k、soak和跨平台发布门禁继续在L08。

按用户2026-10-10授权，L06完成后立即继续L07：以rename完整版本化编辑
和实际应用、独立调用方向/fromRanges/旧item保护、当前输入/预算组合、
同构建真实对照、冻结whole及审计收口。不用L08最终目标阻塞L07。
