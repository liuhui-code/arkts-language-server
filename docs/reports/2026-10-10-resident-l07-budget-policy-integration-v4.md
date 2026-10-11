# L07 当前预算政策的真实编辑与调用对照

日期：2026-10-10。L07-D 阶段控制PASS：四进程62/62完整请求通过，
两对完整payload、最新诊断、目标池和前后pins一致，产品退出0。
实际未查lazy目标晋升复用成立；raw FAIL/READINESS_UNSUPPORTED及CLI
退出1保留。随后全新完整check:fast1511/1511、根退出0及终态身份全部
一致，[完成审计](2026-10-10-resident-l07-completion-audit.md)A–E PASS、阶段DONE。
最终性能、内存、semantic-ready、soak和发布准入仍在L08，实验默认关闭。

## 当前输入及独立完整oracle

[公开TDD](../tdd/l07-budget-policy-edit-call-contracts.md)记录package/SDK
输入保护、成员冲突、trace OFF/default、实际Worker恢复及完整应用合同。
当前25个生产公开case；修复前十五文件157/157、工具五文件50/50，
新整文件调用者修复后四文件93/93。联合统计并非全部公开stdio。

父HEAD1b910152；产品输入77293cd17655cae591c48ac82616c62a2a3d5abe115205ea1549d4dd3cac3975；
server405b94f3c30c1f9a5666fcf6e8d016820b210f325c43f217193e4462511bfa25；
semantic Worker25a27af079b3917bd7c90aa27e80e3d290098a8aaae0a8f8d723a6e994bdfc4f。
Settings干净ecc550dfaed880e04e38a2477eb7235cd50475b9，工程digest
4becf56cb2ff65cc58bd1ae53b6937b194f9020770ad397e526f3a51b85b0d40；
API24/ETS6.1.1.125、backend4.9.5-r10、Nodev26.3.0。全资产身份见
`.bench/l07-current-pins-v4.json`，v4与修复后v3相同产品，不重pin旧产物。

五类编辑/调用、v2 rename和无关IService各两个独立冷进程，修复后v3
14进程DISCOVERED/VERIFIED；新增MenuComponent.refreshUi prepareRename
另两个v4独立冷进程，完整payload及诊断一致。四控制直接使用这16个
同产品真实观测，不把v2失败或诊断probe结果改作成功oracle。
冷报告`.bench/l07-policy-*-cold-v3-{1,2}.json`及
`.bench/l07-policy-lazy-prepareRename-cold-v4-{1,2}.json`；当前清单
`bench/references/manifests/settings-resident-l07-policy-*-v4-api24.json`。
oracle完整保留range/placeholder、版本化documentChanges、全部item的
kind/detail/data/range/selectionRange，以及两方向全部UTF-16 fromRanges。
follow-up只有已执行prepare的真实项；显式准备请求计时，无隐藏刷新。

MenuComponent原有62条2552/2304正常诊断全部保留，与独立cold及ON/OFF
最新URI/version/完整诊断deep-equal；不是干净native SDK发布证明。
Controller最终v2及IService v1正常诊断为空，未静音诊断换取时延。

## 真实晋升反事实与完整覆盖

选定L03成本/RSS压力准入/transient diagnostics、正常1024MiB及原滞回/
lease。ON/OFF只切换同内容晋升，R09/anchor/session reuse和Worker自动/
手动回收关闭，fullSDK/closure不减，无新capability或第二语义owner。

原v3四控制54/54完整结果正确，但主Controller已经resident，未发生
lazy晋升：只能证明已有Program复用，不足以证明晋升反事实。原报告和
清单保留；v4在不删原五类未查/稳态/编辑恢复覆盖的前提下加入真正未查
MenuComponent lazy源的prepareRename及同快照重复。trace各16、timing
各15请求；代表性v2编辑/压力恢复仍为Controller rename，不能宣称所有
能力×所有输入的最终真实矩阵。真实控制不应用rename编辑，实际应用后
源码/定位/诊断由公开生产合同独立验证，二者不混称。

ON trace实际11个lazy源以同指纹晋升，generation257不变；首次未查
prepareRename与无关IService暖机同Program1/Checker1、零createProgram。
OFF晋升使generation257→268，prepareRename为Program2/Checker2，
一次createProgram，11工程SourceFile重新观测。有效完整Program为1496
工程及652SDK sources。依据实际Program/SourceFile/collector见证，不以
答案cache、相等结果或references投影推断复用。

所有62计划请求执行并完整校验，两对完整payload、最新诊断、目标池/
pins一致，无partial/error；trace实际L3驱逐后完整恢复。逐项分析见
`.bench/l07-policy-control-v4-analysis.json`，原四报告
`.bench/l07-policy-{on,off}-{trace,timing}-v4-1.json`，CLI退出1原样记录。

## 完整响应与资源成本

下表是trace OFF单进程单次完整响应，不是稳定收益、P95或500ms准入。

| 查询 | ON首次 ms | OFF首次 ms |
| --- | ---: | ---: |
| 未查lazy prepareRename | 541 | 1226 |
| Controller prepareRename | 501 | 484 |
| rename | 2759 | 2836 |
| prepareCallHierarchy | 449 | 456 |
| outgoingCalls | 455 | 469 |
| incomingCalls | 1600 | 1611 |

代表性body edit rename ON1392/OFF13401ms，编辑后重复ON24947/OFF19906ms；
trace压力恢复ON13443/OFF13162ms。暖机14–15s及准备7.2–7.5s单独保留，
不能从热桶隐藏重建/诊断/压力成本。trace ON1次、OFF7次上下文驱逐；
trace OFF无事件可观测，不把缺少trace事件解释为没有驱逐。

| 进程 | 准备 ms | Node采样峰值 MiB | 产品树采样峰值 MiB |
| --- | ---: | ---: | ---: |
| on-trace | 7512 | 1270.26 | 1439.67 |
| off-trace | 7341 | 2254.65 | 2424.04 |
| on-timing | 7218 | 1305.54 | 1475.70 |
| off-timing | 7433 | 2577.86 | 2747.11 |

产品树含Node/sidecar，不含独立harness/sampler；请求50ms、实际间隔
P95为130–132ms，峰值只是采样下界。两侧均可超过正常软预算；释放LS
不保证物理RSS下降，不能由本次配对推导最终内存降幅、长期泄漏或PSS。
原>3GB/50%、DevEco/Linux PSS、100k、soak、平台/发布和semantic-ready
门禁留在L08，正常预算/诊断/SDK/超时/原断言未放宽。

## 冻结与回滚

`.bench/l07-stage-frozen-inputs-v4.json`冻结319测试/工具、207产品输入
文件、173登记/167 fast入口、301历史及当前benchmark输入及41已跟踪
修改文件；所有未跟踪新增源码/测试/工具也在完整文件向量内。
冻结后全新完整check:fast1511/1511、根退出0，无fail/cancel/skip/todo，
2103025.227621ms；全部冻结身份与四控制/16cold前后pins实际复核一致。
本轮分段000–022和根终态完整保存，无传输截断或观察缺口，不用L06
whole1492或focused代替，直接证据见完成审计及终态复核artifact。
关闭opt-in晋升及相关预算实验回到原完整安全路径；新鲜度/版本/取消
保护与正常诊断不随trace关闭绕过。最终收口以独立完成审计为准。
