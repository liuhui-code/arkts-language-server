# L07 阶段完成审计

日期：2026-10-10。状态：DONE，A–E PASS。25生产公开编辑/调用case、
当前真实62/62及全新完整check:fast1511/1511通过；根退出0，
无fail/cancel/skip/todo，终态源码/产物/测试/工具/工程/SDK身份全部一致。
实验默认关闭，最终性能/内存/semantic-ready/soak/规模/平台发布门禁留在L08。

## 要求与直接证据

要求来自[主计划L07完成清单](../plans/2026-10-06-budgeted-resident-semantic-plan.md)
与[ADR0012](../adr/0012-query-routing-and-fallback.md)。
[当前公开TDD](../tdd/l07-budget-policy-edit-call-contracts.md)保留父revision、
真实RED/GREEN与失败类别；[真实对照](2026-10-10-resident-l07-budget-policy-integration-v4.md)
保留完整cold oracle、实际晋升反事实、正常诊断、准备/完整响应/RSS。

| 要求 | 当前权威证据 | 判定 |
| --- | --- | --- |
| L07-A 编辑/调用及实际复用 | 25生产公开case：完整prepareRename/版本化WorkspaceEdit、实际应用后源码/定位/诊断，三层alias、class/local-alias/同owner成员冲突原子拒绝；两调用方向及完整UTF-16 fromRanges，真实整文件module空选择及其follow-up，伪造name/kind/range拒绝。未查有效完整Program见证，当前真实11源晋升ON同Program1/零create，OFF Program2/一次create | PASS |
| L07-B 当前输入及诊断 | 五类package陈旧payload均真实RED→实际加载见证保护，通知后完整cold恢复；SDK项目配置五类未知输入明确拒绝，当前v2完整payload与2322 code/range/version一致。旧item、移除caller及旧编辑版本拒绝，正常诊断仍发布 | PASS |
| L07-C 预算/取消/恢复 | 选定L03 RSS/成本/压力组合、正常1024MiB/原滞回/lease；四配置rename完整实际应用及调用编辑、trace OFF/default完整安全路径；五类唯一早期取消/无partial及恢复，旧代拒绝，实际L3驱逐/物理Worker恢复。64MiB仅恢复功能qualification，不作为产品预算，不冒称compiler-in-flight | PASS |
| L07-D 当前固定真实对照 | 16同产品独立cold进程，四真实控制62/62，两对完整编辑/调用payload、最新完整诊断、目标池和前后pins一致，产品退出0。实际lazy晋升/Program反事实成立，trace/timing分开；body edit及恢复为代表性rename，真实控制不应用编辑，应用证明来自公开合同 | PASS；raw readiness FAIL保留 |
| L07-E 冻结完整回归/审计交接 | 新完整check:fast1511/1511、根退出0，无fail/cancel/skip/todo；319测试/工具、207产品输入、173登记/167fast、301benchmark及41tracked修改终态身份相同，全部新增未跟踪源/测试/工具也在全向量。四控制/16cold前后pins实际复核一致，配置回滚、失败记录、治理与L08交接收口 | PASS |

此前十五文件157/157、五工具文件50/50及新caller修复后四文件93/93均
退出0，无fail/cancel/skip/todo；联合并非全部生产stdio，不代替E完整根统计。
功能fixture SDK metadata invalid/dialect unverified，证明pinned compiler
的TypeScript-compatible合同；真实API24正常baseline诊断保留，不称为
所有native方言/冲突/平台组合的最终毕业。无新capability/语义owner，
沿用原lanes、完整安全fallback和正常诊断，stdout仍仅协议。

## 修复与不可覆盖的失败记录

五类未通知package曾返回旧range/edit/item/edge，按真实stdio RED逐切片
加入实际compiler/resolver加载见证检查；调用专用runner原映射成-32603，
补现有workspace-incomplete→固定-32803映射，取消/旧版本第一原因保留。
同owner成员冲突经独立坏编辑产生2300证明再修；不宣称全部成员/嵌套捕获。
trace observer只在ready/complete后观察实际Program，不强建Program或
把错误查询伪造为复用，trace OFF直接原查询。

真实incoming v2明确FAIL/source-unmappable，原目标和八个旧成功cold保留。
stderr probe实际抓到编译器整文件module零长度selectionSpan；最小stdio
真实RED→精确映射修复。第一次修正后真实module follow-up仍-32801；
当前Program真实SourceFile文本/名字/模块类型/完整范围校验修复，不靠缓存。
普通符号/嵌套module不接受非法空选择，伪造项仍拒绝。临时probe均移除。
最初未didOpen的夹具source-unavailable、SDK editor优先级/错误oracle、
缺失scripted错误版本模式、cold v1 preflight pins失配，分别记为夹具/
工具条件错误，不当作生产RED或完整成功。

v3真实54/54正确，但目标已resident/未发生晋升，不能认证晋升反事实。
v4保留原覆盖并增加真实lazy目标；未重写旧报告，不改预算/超时/SDK/
诊断/断言，不隐藏慢重建、预热或恢复。

手写服务从L07起点3470降到3448，rename edit排序/重叠和调用边界各有
清晰职责抽取；新增手写源/测试/工具≤500。3448行服务及继承dirty基线
的register-semantic-capabilities721、legacy-semantic-engine1057、
semantic-worker-proxy563仍是迁移债；不宣称仓库全部已达限。

## 冻结完整终态与身份

2026-10-09T20:48:40.481Z冻结，随后全新完整`pnpm check:fast`通过类型、
构建/release sidecar前置及167 fast入口。根1511/1511、退出0，
2103025.227621ms，无fail/cancel/skip/todo；终态观测21:25:36 UTC，
身份复核21:26:42.735 UTC（本地10月10日）。不是L06 whole1492或
focused157/50/93的重复计数，根命令与实际完整统计是权威证据。

`.bench/l07-completion-full-v4-terminal.log`及分段000–022完整保留本轮
观察输出；最大段41181 tokens使用50000预算，无传输截断或观察缺口，
见`.bench/l07-full-v4-observation-state.json`。嵌套故意失败的工具夹具
不当作根失败，也不通过可见PASS行累加推断完整成功。

`.bench/l07-completion-post-full-identity-v4.json`全部检查true：实际完整
产品pins、全部319测试/工具及207产品输入逐文件字节/聚合，登记/fast
列表、301历史/当前benchmark输入及41tracked修改一致；另实际逐项
核对四D控制/16cold初始和postflight pins、完整正确性、产品退出及输入
不变。测试/工具聚合a43204885a53cc9498e687e18ad047e051f3ff761683b74d56c6ada5e55767a6，
产品源向量聚合dc2b5923b57697587e2287775bfe3eb3a2009a1d05f8cdd71e11d5e1185a0894。
产品输入77293cd17655cae591c48ac82616c62a2a3d5abe115205ea1549d4dd3cac3975；
server405b94f3c30c1f9a5666fcf6e8d016820b210f325c43f217193e4462511bfa25；
semantic Worker25a27af079b3917bd7c90aa27e80e3d290098a8aaae0a8f8d723a6e994bdfc4f。
父HEAD1b910152、Settings干净ecc550、API24/ETS6.1.1.125、backend4.9.5-r10、
Nodev26.3.0；其它Worker/sidecar/stdlib/lockfile/gates/SDK及工程digest
详见复核artifact。未改写L06及L07旧构建、失败或未发生晋升的历史证据。

## 回滚与L08交接

关闭opt-in晋升及相关成本/压力/transient实验即可回到原完整安全路径；
新鲜度/版本/取消保护及正常诊断不依赖trace。正常1024MiB/原滞回保持。
真实trace OFF首次lazy prepareRename541/1226ms、rename2759/2836ms、
incoming1600/1611ms；编辑后重复约20–25s，trace恢复约13s。
Node采样峰值1270.26–2577.86MiB，产品树1439.67–2747.11MiB；
trace OFF缺观测事件不等于无驱逐，LS释放不保证物理RSS下降。
单配置单进程、采样P95间隔130–132ms，仅采样下界，不证明稳定P95、
最终内存降幅、PSS、泄漏或ready。原>3GB/50%、DevEco/Linux PSS、
100k、soak和平台发布仍由L08验收，不阻塞本阶段接线，也不批准默认推广。
