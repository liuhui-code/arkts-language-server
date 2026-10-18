# L08 最终产品验收执行记录

状态：IN_PROGRESS；用户目标为完成 L08。2026-10-10 用户明确确认正式
P95 上限为 550 ms，500 ms 保留为优化目标；其余原门槛均不变。
初始父 HEAD：`1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`；下方实施记录
各自绑定当时构建。当前 main 为 `a111235bc4bfcb55b126752f95b3ba095f2996af`。

2026-10-11 六项有效组合默认开启，已通过 PR #95 合入 GitHub main，见
[ADR 0015](../adr/0015-default-resident-optimization-policy.md)。合入时完整
check:fast 1585/1585 和 GitHub CI 通过；本交付不等待全部产品验收 PASS。
后续代码修改仍须新完整 check:fast GREEN 并通过分支／PR。
L08 IN_PROGRESS及性能、资源、ready、平台失败结论保持。

2026-10-17最新：默认transient统计候选机制4→0及受控相关39/39通过，完整SDK
固定8会话32引用／8 READY／12诊断一致，但时延无一致净收益，正序磁盘两项
慢约19–20%，已REJECTED／逐字回退。原睡眠干扰FAIL及全部数据保留，恢复审计
435453a9核对1748仓库文件／82产物均本轮前字节。productionac4c136b、217总／
210-fast及原whole1864/1865 FAIL／403首次引用20s超时不变，不借39项或历史
1862授予新GREEN。继续冷Program／完整SDK／复杂closure和L08全部原合同，
详见[OP00候选结论](../tdd/op00-transient-statistics.md)。

前一检查点：productionac4c136b修复磁盘依赖真实在途变化后仍发布旧定义。
打开调用方与从未打开磁盘源两入口、显式READY拒绝／恢复均经公开保护，十四
完整文件96/96、exit0；源1747份／7a04271a，联合审计6c0812bb。固定8正常完整
SDK会话48语义／32当前READY／12诊断／8退出一致，但一对采样RSS1.2566，资源
假说FAIL。局部保留必要正确性修复，不称净内存收益或产品达标。原完整check:fast
1861/1865、4FAIL、exit1及身份／退出经独立审计daf7fc3c；四项缺失磁盘夹具
RED→真实文件GREEN22/22，提取后六完整文件49/49，生产不变。旧测试1213→1120
仍迁移债。随后新完整check:fast已1864/1865、1FAIL、exit1、零注解；当前217总／
210-fast、1748源码／SDK／构建和真实退出审计0ab1d0e0。四项夹具在整轮通过，
唯一为历史403文件首次引用id2的20s超时，原oracle／期限不变、不追加有利复测，
不称whole GREEN；继续冷Program／完整SDK及复杂closure。原FAIL保留，旧1862
只属于旧72358623。六默认／预算／
owner不变，L08仍IN_PROGRESS，550ms及PSS不前置；详见
[OP04输入修正](../tdd/op04-versioned-overlay-snapshot.md#在途磁盘依赖的发布前输入修正)。

前一检查点：production72358623补上READY准备的既有有界解析作用域，
两入口默认目录探测60→1、显式0仍60，相关64/64；原完整check:fast现已
1862/1862、exit0、零注解，209入口／1744源码／SDK／产物和实际退出审计8c5cc269。
完整安装SDK固定8会话的真实编辑中位约3.42→2.97s，但一对RSS1.1595，
资源≤1.10假说未通过；保留全部样本及旧FAIL，不当P95/PSS／L08 DONE。
六默认／1024MiB／owner不变；详见[OP04终态](../tdd/op04-versioned-overlay-snapshot.md#当前72358623完整回归终态)。
下一项区分存活owner驻留／自然GC／实际驱逐回落，并继续原完整产品余项。

前一局部检查点：OP04重复磁盘通知实际RED→GREEN，production5e7bffc4，
12完整文件93/93；完整安装SDK新34源／32依赖hop固定8会话96精确／当前READY、
诊断及退出一致。两入口重复通知definition中位3.50/3.43s→79/77ms，真实修改
仍3.27–3.48s、RSS四对含一对上升。沿用同内容缺省1／显式0，真实写入及原
新鲜度／取消fence保持，无新LS/AST缓存或预算。原工具误判FAIL保留，audit
a20ba24f，详见[OP04](../tdd/op04-versioned-overlay-snapshot.md#2026-10-16重复磁盘通知的独立输入切片)。
不是403修复、一般编辑收益、Settings/P95/PSS／soak／物理释放；216总入口／
209-fast，当前原完整check:fast1858/1858、exit0、零注解；1744源码／SDK／产物／
启动器及实际退出审计47ad6dda，原403本轮四份oracle／原期限通过，不称以前超时
修复。旧1837/1839 FAIL保留。全部产品余项继续，550ms不前置阻塞局部切片；
代码回归GREEN不是L08 DONE，后续执行改动仍须新回归及获授权的分支／PR交付。

权威要求：[主计划](2026-10-06-budgeted-resident-semantic-plan.md)、
[最终验收协议](../benchmarks/semantic-ready-acceptance.md)、
[原内存流程](../benchmarks/product-gate.md)。L07 DONE 不代表本阶段通过。

## 冻结范围与执行顺序

[机器可读矩阵](../../config/semantic-release-matrix.json)固定原 L04–L07
核心能力，其中 references 两种声明策略独立；8 正常场景桶、3 平台，
共 336 格。每格按环境及构建身份进一步分组，不跨 SDK、配置或构建混采。
用户再次明确确认API24兼容，当前不另设版本匹配门禁；DevEco/PSS仍独立。
其它既有能力保留完整公开回归，不因未列入核心 SLO 矩阵而移除。

1. 建立 fail-closed 最终证据入口，保留每格样本、状态与证据路径；
   不以已有 candidate-control、手写 PASS 或仅单次快速响应代替验收。
2. 在既有 semantic owner 内继续核验输入/Program/覆盖绑定的真实 ready 合同；
   保留已有公开保护，补真实输入缺口，准备不预跑目标池。
3. 按[OP-00–OP-05 后续计划](2026-10-11-query-performance-follow-up-plan.md)
   固定真实 Settings/API24 输入，定位候选/重复核验/编辑/恢复长尾；优化不提高
   1024 MiB 政策值、不关闭诊断、不缩小合法 scope、不截断结果。
4. 冻结构建/目标池/分类后，执行 ≥100 请求/能力×桶、≥5 独立会话与
   ≥100 交替任务/编辑循环；记录完整响应、原始资源采样和生命周期。
5. 运行原规模/DevEco/PSS及三平台发布矩阵，冻结完整回归并逐门禁审计。

PR #95 已完成默认策略交付。后续小切片按阶段正确性与回归要求通过 PR
合入；产品发布与 L08 DONE 仍要求全部最终门禁 PASS。

所有发布必需门禁 PASS 才可 DONE；当前六项默认继续按 ADR 0015。
以上顺序不缩减完整目标；缺失环境只影响对应实测，不停止其它安全工作。

## 当前基线与剩余执行队列

研究报告已经对照当前 main 审核，结论和逐切片验收见
[查询性能后续计划](2026-10-11-query-performance-follow-up-plan.md)。
下一步 OP-00 用六项默认开启配置做 A/B/C 分层归因，Zed 独立测量；
OP-01–OP-05 根据真实成本改善路由、核验、诊断/ready、编辑和资源恢复。
OP-06 补齐目前固定拒绝的最终 evaluator，再执行 336 格原产品门禁。
2026-10-12 [逐请求证据消费首切片](../tdd/op06-release-sample-evidence.md)
已公开RED→GREEN，工具20/20、七文件相关81/81及独立终态身份审计通过；
重复尝试、计划未执行、混构建、完整payload／位置差异和缺oracle均fail-closed。
真实compiler五进程100次repeat正例通过对应三项判定，但资源／生命周期／平台／
完整回归／DevEco/PSS接线与全证据发布正例仍未完成；OP-06／L08不标DONE。

当前推进见后续计划的[下一执行批次](2026-10-11-query-performance-follow-up-plan.md#下一执行批次)：
OP-00 已有分层实测，OP-01及OP-02选定切片已按自身合同收口，仍未合入；
继续OP-03等待／ready归因、OP-04编辑准备及OP-05/06剩余合同。
Snapshot默认推广已按无稳定净收益拒绝，显式1实验保留；最终门禁不提前阻塞。

main 在 PR #95 合入时的代码回归1585/1585通过；旧OP-02 whole1608/1610
及后续5cf9d618 whole1757/1757均保留为各自身份的历史证据。前一production
1ab95acd首次whole1794/1795、exit1，源码／产物／SDK前后一致；唯一失败是
私有GC结果JSON发布竞态，不是语义payload不一致。真实分段写入公开RED后，
仅测试fixture改为原子独占发布，十三完整相关文件79/79及strict通过。
修复后的原完整check:fast已1795/1795、exit0、零注解，2671965.974116ms；
全部202个fast入口、源码／产物／SDK／启动器身份及真实根PID退出审计PASS
（b38d39c4）。只标该构建代码回归GREEN，原1794/1795 FAIL与旧生命周期缺口保留，
不授予时延、PSS、客户端或跨平台毕业。
最新OP03a readiness冗余admission切片已公开RED→十二完整相关文件70/70，
真实最终输入guard仍在完整report构造之后；production eabe24ef，旧1795不覆盖。
四固定路径规范化受控variant共36exact／36当前公开READY／24编辑／28诊断，
audit125adc35；编辑中位两个方向改善约8.6–8.7%、采样RSS更低，只支持局部
采纳。四原CLI1／FAIL及其它门禁BLOCKED保留，不当直接生产／Settings／PSS／
550ms验收。新203-fast入口完整check:fast终态1779/1797、18FAIL、exit1、零注解，
完整身份／真实退出审计d16e6667通过，仍是FAIL。定向原两文件11/11、另五文件
90/91；403源20s超时稳定复现，trace确认反复冷Program与无效anchor成本，其余
复测通过不称修复。用户已确认两种未打开入口均支持；definition／typeDefinition／
hover随后各自公开RED→GREEN，真正请求级磁盘source且无合成overlay。真实
client version0的close残留缺陷也已修复，原调用层级disk follow-up迁移到显式
source传输。随后signatureHelp／completion／completion resolve／prepareCallHierarchy
分别RED→GREEN，完整入向／出向链路也相同；磁盘补全句柄绑定exact source SHA，
不缓存源文本，同size／mtime变化仍拒绝旧句柄。其后implementation、references
两声明策略、prepareRename／rename也分别公开RED→GREEN；核心14项两种入口
已有基本完整oracle，磁盘事务编辑为version null，origin／local alias语义另证。
跨文件磁盘引用旧结果经完整当前READY证明绑定修复且仍有真实cache hit；相同
请求合并、独立取消、工作区变化撤销全组和完整恢复也通过。当前production
bd4010b6，二十八完整相关文件313/313、exit0、零注解，源码／构建／SDK／真实
退出独立审计b36e8173，strict／build通过。新增源测试的私有SDK full profile不是
安装SDK产品计时，600ms verifier窗口只作机制保护。当前213总入口／206-fast
新whole NOT_RUN，旧1779/1797 FAIL保留；更多输入／压力／真实成本、403冷准备
及完整产品性能／资源／平台验收均不由这些基本入口正例通过。L08与其余OP范围不变。
[组合真实对照](../reports/2026-10-11-resident-effective-combo-comparison.md)
仍是原冻结构建的短样本，保留秒级编辑、无明显 RSS 收益及 DEGRADED。
[压力后通用请求恢复](../tdd/l08-pressure-recovery.md) 的功能缺陷已修复，
恢复时延仍约 3.3–6.0 秒，不能重列为“尚未实现 Worker 恢复”。
完整 ready、未打开入口的全部场景、incoming/编辑长尾、原内存/PSS/DevEco、soak 与平台
继续验收；550 ms 未通过不阻止前面各优化切片按自身合同完成。

## 历史实施证据与当时环境

以下按发生顺序保留当时构建、失败与检查点。旧“未合 main”“默认关闭”及
“新 whole 未运行”等措辞不代表当前状态，也不改写各旧样本的原判定。

[L07 审计](../reports/2026-10-10-resident-l07-completion-audit.md)保留 1511/1511
功能回归及真实 62/62，但 semantic-ready 未实现、秒级编辑/恢复及高 RSS
均未毕业。其旧构建不能被重 pin 为新的 L08 证据。

当前 macOS x86_64 可进行真实 Settings/API24 开发实测；读取本机 Docker
状态得到 Cannot connect to the Docker daemon，不能假设可执行 Linux PSS。
Windows、Linux/PSS、DevEco 对照环境/原始数据待取得。
Mac RSS 不能自动替代这些门禁；已向用户询问可用测试主机或证据路径。

起始工作：最终验收 CLI 的无证据反例。详细 RED/GREEN 记录随每个垂直
切片追加，完成审计不得用该工具自身 GREEN 代替产品门禁 PASS。

首轮[TDD证据入口](../tdd/l08-final-evidence-entry.md)已实现无证据336格、
声明策略/构建/SDK/配置独立分组、trace-on归因隔离与矛盾exact结果拒绝。
[当前真实两进程基线](../reports/2026-10-10-resident-l08-baseline-v1.md)
各15/15完整exact、配对完整payload/诊断/身份相同；秒级时延与未就绪
如实保留。本轮无trim/evict，下一步转向输入核验和回调外准备/校验，
不把所有慢请求归因于压力驱逐。工具完善和基线不是L08完成。

本轮验收工具/原门禁/登记focused17/17 GREEN、类型/构建GREEN；新增
脚本与测试均≤500行。完整新check:fast尚未执行，L07旧1511不冒作当前
完整统计。两轮benchmark已终态，CLI1/raw FAIL明确保留，无遗留运行。
本goal turn为progress：修改权威实施状态、建立五个CLI合同，并取得
改变下一诊断方向的当前真实证据。目标仍active，未缩减为工具或基线完成。

接续输入核验切片已取得真实stdio rename P95=994.5ms的RED；独立CPU
调用栈确认重复freshness扫描，最小显式capture/一次完整验证实现后，
公开输入/诊断/恢复22/22保持，隔离十次开发控制GREEN。并发污染的
540.7ms失败不删除；[当前构建的原15项真实配对复测](../reports/2026-10-10-resident-l08-input-freshness-v2.md)
各15/15精确、八项配对检查全真。重复rename467.7ms，入向调用约1.28s/
正文编辑约972ms仍失败；无trim/evict，不把全部长尾归因给压力。接续
冻结1557输入的新完整check:fast已终态1516/1516、根退出0、无
fail/cancel/skip/todo；全部输入/产品/SDK/测试入口/产物身份相同。
第8段trace输出观察截断保留，不称逐字完整stdout。最终ready/500ms
全矩阵与内存等门禁仍未完成。
详见[TDD记录](../tdd/l08-query-input-freshness.md)。

完整336格证据入口v3纳入两代各两真实报告，共60请求，其中30产品/
30归因，构建/配置/trace分组不混采；CLI1/BLOCKED、releaseEligible=false。
实际ready公开反例在两文件catalog完成、未打开/未查目标后得到
MethodNotFound -32601；下一切片为既有owner内的代际/输入/完整覆盖合同，
不是把candidate ready重命名为semantic-ready。
接续[公开ready合同切片](../tdd/l08-semantic-readiness.md)已完成首个真实
root准备正例：完整官方Program/Checker及实际r10后端、SDK/stdlib/source/
overlay/配置/覆盖身份，状态读取不创建Program，随后未打开模块导航全等。
旧能力/Worker传输联合86及接线后语义联合112通过；它们是focused证据，
不替代新whole和最终336格、内存/soak/三平台门禁。编辑/必要输入/取消
反例已验证，SDK/驱逐与其它生命周期反例继续补齐，benchmark尚未消费
真实ready合同，当前不得宣称L08 DONE或合main。
真实Settings当前两代root准备均degraded，最新首个compiler必要输入为
SettingsDataUtils.ts导入@ohos.data.DataShareResultSet的TS2307；当前SDK
四实际候选缺失，synthetic有/无声明公开counterfactual排除基本解析遗漏。
详见[实际就绪诊断](../reports/2026-10-10-resident-l08-semantic-readiness.md)。
已询问匹配完整SDK路径，保持原固定输入/阈值，不补假声明或预查目标。

接续实际输入检查的取消RED显示：stdio已取消，但编译检查仍完整结束。
最小显式CancellationToken适配后公开GREEN，取消真正抛于编译器检查
内部，后续完整准备、正常诊断和exact导航恢复。L2 trim与同工程/同缓存
进程重启也完成公开特征；联合92与fixture抽取后12通过，新重启1通过。
这些局部证据不涵盖所有parse/bind/global准备阶段，也不完成整个G-READY。
后续补物理Worker替换、multi/nested roots、未知影响范围与严格结果schema，
再接真实benchmark；当前新构建仍需新的冻结whole。进度及身份见
[就绪TDD记录](../tdd/l08-semantic-readiness.md)，L08未DONE、未合main。
固定Node20.19.5接续公开联合51/51已终态退出0，包含全部13个ready案例；
旧物理Worker多根overlay/取消/回收与正常诊断保留。单项取消复测通过，
12个name-filter未运行项不算whole。构建/SDK/固定工程后置身份全等；
新whole与原最终门禁未完成，现有SDK必要输入问题也未被synthetic替代。

接续严格root-ready传输边界：11项逐次RED/GREEN，防止无proof/空能力/
错根/错代际/不完整覆盖/原始undefined省略或snapshot矛盾冒充ready；
另2项MessageChannel与恶意字段特征首次GREEN。固定Node20.19.5联合
140/140终态退出0、无fail/cancel/skip/todo，保持真实stdio13及所有相关
原公开保护；类型/构建/差异检查GREEN。协议文件抽出完整字节计数职责
由2054减为1998，supervisor894不增长，新增源/测试均≤500行。
本轮新build身份与历史Settings失败/whole独立，下一步完成ready证明的
物理替换/multi/nested根及未知影响范围，再接真实benchmark；不提前
宣称全部G-READY、L08 DONE或合main。
本轮后置全部18项构建/输入/SDK/固定工程身份相同，Settings仍clean。
分类证据`.bench/l08-readiness-wire-regression-v1.json`明确新whole NOT_RUN/
releaseEligible=false；历史1516不冒作本轮whole。目标保持active。

只读远端核查：当前分支无PR，未执行外部写。父main的Linux canonical
release run37708947810有取消控制正例失败（1326/1327），旧Windows安装
smoke通过；均不算当前L08平台毕业。固定Node20.19.5本机24次CLI控制
未重现Linux失败，三个相关文件与父版本字节相同；原失败和raw报告缺失
继续保留，最终新Linux运行仍必需。记录在`.bench/l08-inherited-main-ci-*`。

接续多根公开RED定位到共享配置见证的追加revision：准备独立B使A错误
失效，而原输入未变。最小区分reset与记录追加，每次仍完整验证全部当前
加载事实并封锁扫描中变更；没有新owner、缓存有效结论或扩大容量。
反例及原保护18/18 GREEN，接续嵌套根真正依赖编辑、后来加载包事实的
无通知retarget、实际物理Worker替换/新epoch/overlay重放均公开GREEN。
新增生命周期4案例注册bundle-e2e，保留178入口/171 fast与原阈值。
见[TDD详细记录](../tdd/l08-semantic-readiness.md)；新构建身份另存
`.bench/l08-readiness-lifecycle-build-v1.json`，不重pin旧Settings/whole。
Node20.19.5联合配置/协议/取消/回收保护202/202终态退出0，完整stdout
另存。接续无通知新增未查询模块/删除必要依赖的未知范围特征首次GREEN，
新file覆盖2→3、缺失实际2307/修复后正常2322/精确新UTF-16定义保留。
当前生命周期共5案例；全部18 ready/fixture/登记的新公开组27/27终态
退出0、无fail/cancel/skip/todo，完整stdout保留，不将与202重叠数量相加。
后置全部18项输入/产物/SDK/固定Settings身份相同、工程仍clean；
分类`.bench/l08-readiness-lifecycle-regression-v1.json`保留新whole
NOT_RUN/releaseEligible=false。
benchmark真实消费、新冻结whole及全部最终门禁继续推进。
本goal turn已取得可核验实现/反例进展，目标保持active；L08未DONE，未合main。

接续benchmark真实根准备观察已接线：真实stdio root prepare，不带目标，
检查完整cap/代际/input/coverage与实际root/backend pins，保留必要输入
诊断和独立准备耗时；不把unsupported、degraded或伪proof统称ready。
公开四case/四次垂直RED-GREEN，最终Node20.19.5联合71/71终态退出0；
旧三项真实SDK/recycle测试改为精确DEGRADED原因，原所有执行保护保留。
179入口/172fast，类型/构建/差异检查通过，新whole尚未执行。
固定Settings/API24新零查询观察仍为实际TS2307缺DataShareResultSet、
degraded/null proof，约25秒终态；实际SDK选择日志、完整诊断transcript/
RSS/退出与不变pins保存，未改SDK/工程。首个只准备清单预检失败保留。
18项输入/产物/SDK/固定工程与14份harness文件前后全等，Settings clean；
详细[实现记录](../tdd/l08-semantic-readiness.md)及
[当前观察](../reports/2026-10-10-resident-l08-semantic-readiness.md)不重pin历史性能。
当前仅观察根准备，未认证每请求的就绪代际；请求仍控制样本，ready观察
也不自动通过G-READY/SLO。下一切片继续请求级准入、首次未打开/编辑/
驱逐/重启完整计时，不将普通更新另当初始准备。全部原门槛及full objective
保留，本goal turn有已执行实现/反例/当前运行证据进展，仍active，未合main。

接续静态请求准入已实际RED/GREEN：candidateControl=false只在实际根
READY下运行，显式查询文件在初始prepare前打开，不预跑答案；请求后
prepare=false证明generation/input不变且无编辑/驱逐时，未查/重复
definition两请求exact并认证semantic-ready-snapshot。旧对照不升级；
trace-on/不足样本仍latency BLOCKED，不是整个G-READY。原完整计时保留。

直接查询未打开文件真实失败：READY前后报告全等，definition返回[]、
缺manual oracle Location；入口要求documents.get存在，未进入compiler，
不是URI/范围误差。保留失败，不改oracle或测量前didOpen。已向用户
确认最终桶是否还需直接查询未打开文件；它与打开调用文件导航到未打开
模块不可混称。后者已有路径，前者尚未补齐；新负向分类保护让实际错误
明确ready FAIL，不把分类测试GREEN称为能力修复。

当前Node20.19.5联合73/73退出0、108437.057715ms、零fail/cancel/skip/todo，
保留原编辑/驱逐/Worker回收/矩阵保护；pnpm check/diff check通过。
18项产品/SDK/工程及15份harness前后全等，Settings clean。生产源码/
预算/默认均未改；[TDD记录](../tdd/l08-semantic-readiness.md)保留全部失败。
新whole/动态认证/336格/资源/soak/三平台等原门禁未完成，最终矩阵入口
尚未认证新样本；目标active，仅全部验收后经PR合main。

接续修复CLI proof一致性漏洞：options摘要改变但generation/总摘要相同，
或coverage改变但整个input相同，均真实RED；最小完整input/coverage
比较后分别7/7、8/8 GREEN。边界故障注入不冒作实际compiler故障或加密
认证。实际正文return 1→2的三请求exact且立即计时，末尾只读状态精确
DEGRADED/prepared-inputs-no-longer-current，旧快照不认证；不是动态ready毕业。
全部新file/登记13/13退出0、20099.574221ms、零fail/cancel/skip/todo，
Node20构建/diff check通过，源/SDK/工程/默认未改；详细[TDD](../tdd/l08-semantic-readiness.md)。
现在冻结当前所有执行输入并接新的完整Node20 pnpm check:fast；实际
进程和终态以ignored `.bench/l08-readiness-whole-node20-v1-*`记录为准，
不提前宣称通过，也不借旧1516/73统计完成当前whole。所有L08门槛不变。

当前冻结Node20 whole已实际结束：1556/1556、根退出0、零fail/cancel/
skip/todo，测试duration2328656.379685ms。1578全repo输入、18产品/SDK pins、
179登记/172fast、5产物及18 harness前后全等，Settings clean；此后才
追加这份记录，不声称追加后的全repo文档摘要仍是冻结值。44段观察日志
及完整终态保存，一次输出观察截断明确保留，不称逐字全stdout。
`.bench/l08-readiness-whole-node20-v1-regression.json`记录当前完整回归PASS
但releaseEligible=false；[TDD详情](../tdd/l08-semantic-readiness.md)可核验。
这解除新whole未运行项，不解除真实SDK必要输入、动态请求认证、完整
336格/500ms/原资源/soak/三平台等缺口，原计划全目标保持，不合main。

接续入向调用真实500ms开发控制：原P95=1411.6ms实际RED；独立CPU
归因后，先共享同次范围判断的物理路径，再以单次完整扫描的有界目录/
容器证据避免重复解析，最后给原项目快照加≤256模块的物理祖先索引。
范围/枚举/身份/未通知变更/正常诊断/原预算均保留，根绑定、目录及末尾
容器复核不省略。源根重复解析曾触发既有4次上限RED，修复重复工作后
旧预算保持、实际新bundle114/114 focused GREEN；未放宽断言。
最深模块归属/无效模块不回退/129模块查找成本及所有模型合同36/36
GREEN，索引新bundle的实际入向P95=700.5ms、13请求完整精确及正常
诊断，但仍未过500ms。详见[同次扫描TDD](../tdd/l08-query-input-freshness.md)。
上述新生产源码已不等于1556 whole的冻结身份；那份终态只保留为旧
切片历史PASS，新源码的whole重新是NOT_RUN，不冒称当前完整验收通过。
L08整体继续未完成，正式矩阵/SDK必要输入/资源/soak/平台门槛不变，
仅在全部原验收通过后才能经branch+PR合main，当前不合main。

索引新bundle的六入口 focused 已实际116/116 GREEN，根退出0、
51941.067881ms、无fail/cancel/skip/todo；仍仅本切片回归，不把700.5ms
时延RED或当前whole NOT_RUN转为PASS。证据与下一步见上述TDD及
`.bench/l08-incoming-scan-optimization-v1-state.json`。

接续目录身份单扫描证据实际RED→GREEN：51源/55目录170次native路径
解析，改为根真实绑定/每层BigInt身份及mtimeNs/ctimeNs开前后/结束复核，
保留不可用inode时native检查、原末尾容器验证与取消清理；无跨扫描
有效性缓存、无scope/诊断/预算裁剪。旧及新六入口118/118 GREEN，
真实incoming P95=567.3ms仍RED。再经当前CPU确认重复relative成本，
99源1209次路径比较公开RED，已归一化绝对路径仅用带separator的
contains比较、host大小写规则及词法/物理范围均保持；main-shadow根名
前缀不能加入范围。当前模型/预算/retarget保护GREEN，六入口新bundle
120/120 GREEN、52084.808324ms，仍不算新whole。
同构建隔离真实SDK两个原控制0/2 FAIL：incoming501.8ms、rename562.1ms，
500ms门槛不四舍五入、不放宽；完整payload/输入/退出断言已通过。
当前source cf24dc、产品/原始/分类见上述[TDD](../tdd/l08-query-input-freshness.md)
及 `.bench/l08-resolved-path-final-state-v1.json`。继续处理rename重复核验，
新whole NOT_RUN及其它原ready/SDK/336格/内存/soak/平台缺口保持。
本goal turn有源码/公开反例/真实测量进展，目标active，L08未完成未合main。

重命名重复完整输入校验已按真实562.1ms RED→统一返回前完整核验修复；
失败分支仍核验所有当前事实，prepareRename/取消/范围/编辑版本保护不变。
37项公开特征先GREEN，最小版本再37/37 GREEN后才抽取115行原子rename
事务职责，TSLanguageService减少69行至3378，剩余超限债保留。
抽取后37/37 GREEN、类型/build/diff检查通过；同构建真实两项开发控制
2/2 GREEN：rename277.0ms、incoming493.1ms，后者余量很小，不认作
正式稳定SLO。各10次完整exact、输入不变、产品退出0及正常诊断保留，
也保留先前501.8/562.1ms失败与沙箱RSS首样本失败。当前产品36defd53e，
分类/全样本见上述[TDD](../tdd/l08-query-input-freshness.md)和
`.bench/l08-rename-extraction-final-state-v1.json`。将冻结全repo/SDK/工程/
产物/登记/工具后启动新Node20 whole，运行及终态单独记录，不借用旧1556。
原全部L08门槛未解除，目标active；只有全部验收PASS后经PR合main。

36defd53e新whole已终态FAIL：1565项/1563 pass/2个原5秒stdio超时，
退出1，1583 repo/18产品SDK pins/登记/产物/工具/分支终态身份全等。
隔离原二case及原文件19/19通过不能消除全轮失败。独立CPU显示冷
createProgram包含约1.75s加载身份查验，最终校验仅52/95ms；没有以
旁路诊断或少加载SDK换通过。预期缺失路径异常分配的新public预算
fixture先因不触及相对SDK依赖意外GREEN，补齐真实形态后978个异常
实际RED；原64预算不变，最小非抛ENOENT观察改动已GREEN，完整前后/
最终见证、未知错误和边界保留。源码198/test384/preload41行，类型/
build/diff通过，联合六入口已65/65 GREEN、零skip、退出0；原两个冷
用例约3818/3817ms，5秒边界保持。三项缺失/身份守卫通过，20项仅名称
过滤。新source82e141f7的真实SDK控制2/2通过：rename P95=213.3ms、
incoming P95=448.5ms，各10样本/1会话，仅开发控制，非正式认证。
当前分类/全样本/pins见`.bench/l08-lstat-no-throw-current-state-v1.json`；
新whole NOT_RUN，原失败记录与所有
SDK/动态认证/336格/资源/soak/平台缺口保留。细节见上述扫描TDD；
L08尚未完成，未提交/推送/经PR合main。

接续普通编辑即时query的新proof已完成公开RED→GREEN：认证在原query
lease与完整响应计时内，后台diagnostics与状态读取不再准备；完整实际
Program输入/诊断/字节/覆盖/配置保护不变。新增缺失依赖仍degraded，
修复后的立即query另经真实RED→GREEN恢复新proof。消费者逐请求读取
只读receipt，核对实际overlay字节/版本，保留初始provenance与最终校验；
不发编辑后prepare、不等诊断。原input/coverage矛盾拒绝、假新标签旧
overlay和无通知新模块保护保持，直接未打开query的失败也保持。
详细[新快照TDD](../tdd/l08-semantic-readiness.md)记录三条真实RED及harness
修正，不将fixture正例或新增防线的首次GREEN当作整个产品毕业。

当前source f8c2155a公开12入口120/120、退出0、166913.905154ms，零
fail/cancel/skip/todo。随后隔离真实SDK控制1/2：rename P95=244.3ms
PASS，incoming P95=558.4ms FAIL；完整exact/输入/退出与正常诊断检查
通过，500ms门槛不改，旧448ms不替代。11组完整冻结向量终态全等，
LS经GREEN下职责抽取3378→3375，剩余超限债保持；registry500不增长。
原始/分类/全样本/pins见`.bench/l08-dynamic-ready-current-state-v1.json`。
新whole NOT_RUN；最终矩阵消费者尚未认证新receipt，全336格/足量样本/
直接未打开文件/真实SDK/PSS资源/soak/平台门禁仍缺。下一步先定位
incoming当前实测失败，再推进这些缺口；目标active，L08未完成未合main。

## 当前口径与复核：550ms上限，500ms目标

2026-10-10 用户明确回复“550”，已同步矩阵、ADR、产品契约、验收规范
和prepared报告/真实开发控制。正式完整响应P95≤550ms，500ms为目标；
100请求/5独立会话/336格及正确性、ready、资源、soak、平台等不变。
三条工具合同实际RED→GREEN，550/551、错误/超时/不足样本及合同
漂移保护保持；合成分类fixture不是产品性能证据，历史失败不改写。

物理父目录复用尝试虽经公开预算RED→GREEN与实验149项回归，但真实
incoming710.2ms仍失败、CPU未证明收益，已撤销额外生产复杂度和性能
fixture，只保留原实现也通过的两条SDK路径负例。临时探针归档移除，
原始失败/快照保留，详见[扫描TDD](../tdd/l08-query-input-freshness.md)。

当前source1c9dfeca、server9510101a、worker60156e4e，类型/build/diff
通过；新14入口151/151、退出0、零skip，后续隔离真实控制1/2：
rename P95=234.7ms PASS，incoming P95=596.4ms FAIL（10/10>550ms）。
完整exact/输入/产品退出/正常诊断检查通过，各10请求/1会话仅开发控制。
11组冻结向量终态全等，分类/pins/全样本见
`.bench/l08-550-contract-v1-current-state.json`及[合同TDD](../tdd/l08-semantic-readiness.md)。
文档证据在终态复核后追加，新whole仍NOT_RUN，旧whole失败保留。

后续先接最终矩阵的真实ready receipt消费与直接未打开source查询，
同时保留incoming596ms未达上限项，不用重复跑到偶然通过阻塞其它
安全切片。真实SDK/PSS/DevEco/336格足量样本/soak/规模/跨平台继续
按既有计划验收；L08仍IN_PROGRESS，只有全门禁通过后经分支PR合main。

## 当前设备验收执行批次

用户要求不再以SDK版本匹配阻塞，固定现有兼容API24；机器矩阵移除该
独立匹配项，其余550ms/100请求/5会话/336格及完整输入保护不变。
当前设备macOS x86_64、16GiB RAM，已存在10k/100k确定性fixture，优先
复用，避免在仅约11GiB剩余磁盘上重复生成。无下载/修改SDK或启动服务。

执行顺序：兼容合同RED/GREEN → 最终矩阵真实ready receipt消费及负例
→ 当前冻结完整check:fast → 隔离真实开发控制/100次交替编辑与压力恢复
→ 10k/100k本机工作流与RSS记录 → 终态输入身份复核与逐项报告。
本机可验证项不等待其它平台/PSS；执行FAIL也是需保留的验收结果，
不能把未执行/不足证明或错误结果改为PASS。严格未打开query若仍失败
保留为本机代码缺口，不重命名为SDK或外部环境阻塞。

## 2026-10-11 当前设备批次终态

本批可执行验收已完成到实际终态，产品FAIL、L08仍IN_PROGRESS、未合main。
sourceInput b5f4b2f；工具23/23、类型/build通过；新whole1580项中
1579 PASS/1超时、退出1、零skip，原超时隔离通过不能关闭整轮失败。
5独立真实会话220/220 exact，rename/incoming各100重复样本：
P95=365.6/763.9ms，incoming98/100>550ms；真实ready未通过，
开发控制不升级正式SLO。

100编辑分别验证legacy和选定indexed路径：前者91预算拒绝；
后者100/100完整，但编辑P95=5557.8ms、首轮构造器预算拒绝。
indexed 5次L3均applied，1次恢复exact、4次无驱逐证明，整轮FAIL。
静置RSS分别1.632GB/0.441GB，峰值1.897GB/1.288GB；trace-on仅归因，
RSS不认证PSS。默认10k与同选定配置10k/100k均在L3后completion
报Semantic worker restart required，无完整规模资源报告。

全批11组冻结向量及两fixture全部字节/路径前后全等。
7真实报告最终矩阵CLI1/FAIL、releaseEligible=false；336格8有观测、
424格内请求中220产品/204归因，压力专用1条不换桶。
详见[当前验收报告](../reports/2026-10-10-resident-l08-semantic-readiness.md)
与[RED/GREEN记录](../tdd/l08-final-evidence-entry.md)；原始索引
.bench/l08-local-acceptance-v2-current-state.json保留全部失败与分母。

本地后续实现缺口已具体化：L3后的通用请求Worker恢复、首次/长期内存
准入、incoming及编辑长尾、整轮冷查询超时、严格未打开source入口。
它们不是SDK版本匹配或其它平台环境问题；未放宽任何门槛或推广默认。
必要输入的真实ready、完整资源/PSS/DevEco、全336格及其它平台仍待认证。
仅全部门禁PASS后按分支/PR合main，本次不执行合并。

## 2026-10-11 独立缺陷：压力后的Worker恢复

用户授权只修复本机压力后请求失败。已完成[公开TDD及实际规模复验](../tdd/l08-pressure-recovery.md)：
原32条journal保护保留，fault恢复在既有生命周期owner内替换Worker、
重放全部根和最新打开文本，保留延迟staging并隔离旧代结算。
最终source f5585462/server00272459，相关110/110/exit0；默认10k、
选定10k和选定100k均完整cold3/warm10/stress5，54会话、15次压力后
补全成功，原SDK/夹具/输入后置全等；该功能缺陷DONE。

恢复仍约3.3–6.0秒、不是550ms性能毕业；新whole NOT_RUN、旧whole
1580轮FAIL及引用超时保持。其它ready/资源/平台/全矩阵门禁继续，
L08仍IN_PROGRESS、实验默认和1024MiB政策不变，不因本缺陷修复合main。

## 2026-10-13 当前代码回归检查点

[后续OP计划](2026-10-11-query-performance-follow-up-plan.md)的source-root模型重载
修复及OP-00超时/异常退出证据切片完成公开RED→GREEN。当前生产source输入
c2a50003完整check:fast已1648/1648、exit0、零skip/cancel/todo，真实根退出及
source/产物/SDK/repo前后身份全等；日志与完整digest见
[OP-02记录](../tdd/op02-resident-input-proof-reuse.md)。原403文件和source-root
创建合同通过，期限未变；历史whole失败仍保留，不推断唯一设备或优化原因。

这是当前代码回归GREEN，不是550ms、内存/长期生命周期、真实ready或全336格
最终验收。各候选直接保护、成本/采纳、OP-03/04/05/06剩余工作继续，六项
生产默认和1024MiB政策不变，L08仍IN_PROGRESS，本检查点不授权合main。

## 2026-10-16 冷批次成本检查点（非最终验收）

当前bd4010b6的核心14项两种入口基本完整oracle及28文件313/313见
[OP03a记录](../tdd/op03a-completion-diagnostic-priority.md)。当前206-fast仍须
新完整终态；旧1779/1797 FAIL、403原20s及其它未定位失败不改写。

[OP00有限对照](../tdd/op00-query-layer-attribution.md)在原403文件公开case、
同完整SDK/closure/预算/原期限下，固定64/128/128/64全部16响应exact：
整套观察耗时约36/22/22/36s，两对下降39.12%/38.20%，采样tree RSS最大值
未上升。独立trace确认7→4批/miss、SDK255/全部403覆盖与每批约2s Program
准备。128仅候选，默认64/六默认/1024MiB/原瞬态生命周期不变。

此单语料不认证真实复杂closure、direct-source/proof成本、编辑/取消/压力、
READY后336格、最终P95≤550ms（目标500ms）、PSS/DevEco、长期资源或平台。
新旧FAIL与collector启动失败原样保留；本机继续能做的合同，不以最终门槛
阻塞前序，也不以本检查点授权合main或默认推广。L08仍IN_PROGRESS。

## 2026-10-16 完整回归与两入口安装SDK成本

原完整206-fast真实1822/1824、2FAIL、exit1、零skip/cancel/todo，
3043887.808356ms、身份审计5e4670c8；不是新whole GREEN。原403通过原期限，
历史失败不抹去。旧未打开空结果前提已改真实成功正例＋显式空响应负例，
相关26文件207/207；构造器seed路径原整轮失败尚未定位，单例/完整30通过不算修复。
只改四个测试文件，生产bd4010b6与六默认/64batch/1024MiB保持；新head须fresh whole。

安装完整SDK的受控1000workspace/500active工程（不是Settings）18独立进程，
每入口/能力3会话、每进程一目标、准备单列、不预查询：完整数组/READY/诊断/关闭
核对通过，definition中位511/448ms，引用仍3.9–4.2s。原18CLI/report继续FAIL，
latency/memory BLOCKED，不能拿单值小于550或RSS样本最大值充当最终验收。
另两trace均在resident证明inputs-changed后启动单批fullSDK255/project501验证，
Program约3.20–3.34s、query72–73ms；下一局部合同先区分缺少观察与真实签名变化，
原输入/完整scope/config/最终物理fence不删。证据与完整SHA见
[OP03a记录](../tdd/op03a-completion-diagnostic-priority.md)。
最终336格、≥100请求/≥5会话、P95≤550ms/目标500、PSS/DevEco、物理释放、
soak、规模、真实客户端和平台门禁全部保留，L08不据此DONE或合main。

## 2026-10-16 READY证明交接局部合同完成

新生产81d6e876已用公开RED→GREEN修复“根已READY但普通resident proof未观察”
的重复Program构建；仅原owner交接只读元数据及既有Program，未减输入／scope／
最终物理fence，未增加LS/默认开关。完整9文件75/75（ac7407c4）覆盖两入口、
SDK／磁盘／版本变更、取消、压力回收和Worker替换；主引擎3256→3253仍记超限债。
新构建同完整SDK/语料/oracle/预算/默认64batch的18个独立首次查询，完整结果、
同一READY、诊断／关闭均通过；打开调用方引用中位229–230ms，未打开源464–470ms。
root准备仍4.14–5.52s；两独立trace均同Program、0 transient verifier/额外owner。
正常audit69d6dac6／trace4f77a846；详细SHA及原始证据见
[OP03a记录](../tdd/op03a-completion-diagnostic-priority.md)。
这是新构建的局部正确性和成本观察，不是最终P95/PSS、物理释放或产品毕业；
18份原CLI/report仍FAIL，旧1822/1824及未定位构造器失败不改写。
当前head仍须fresh完整check:fast＋分支PR；先继续可执行的复杂真实closure／
冷准备、OP04输入和压力资源，不以L08最终指标阻塞前序。全336格及上述所有
最终门禁保持，L08 IN_PROGRESS、未合main。

## 2026-10-16 完整回归终态及下一公开RED

生产81d6e876冻结原完整check:fast现已1826/1826、exit0、零skip/cancel/todo，
3093552.887731ms，206入口／全部源码／构建／SDK／原启动器及PID退出审计1de2bf76。
正式评估器真实消费该receipt＋18份安装SDK查询，macOS回归PASS、最终BLOCKED，
audit70eca240；旧1822/1824及未定位构造器失败原因保留，不追认修复或产品毕业。
随后一个新公开反例RED：watched磁盘依赖编辑后3处当前引用全部正确、正常退出，
但根仍DEGRADED/旧输入证明失效。该时点生产未改；新增测试head不属于此前1826 GREEN。
有效RED及完整原始证据审计83952896，下一步在原owner/预算/取消/最终fence内
最小承接引用查询的显式READY刷新，不以手动重prepare或隐式overlay掩盖缺口。
证据见[OP03a记录](../tdd/op03a-completion-diagnostic-priority.md)。全部最终门禁、
旧失败和原OP00–06范围不变，L08仍IN_PROGRESS、未合main。

## 2026-10-16 引用刷新局部完成及真实编辑后成本

上述公开RED现已最小GREEN：当前production88ad7e9b，9个完整相关文件81/81、
exit0、零注解，源码／构建／SDK身份与实际退出独立审计987689db。两入口×
两声明策略、缺输入修复、普通引用中真实compiler取消／无迟到READY均保护；
status与bounded resident-only不隐式编译，原输入／预算／最终fence不放宽。
安装完整SDK受控1000/500副本4独立编辑会话结果／当前READY／诊断／退出一致，
auditb5c51a6b；RPC仍3.51–4.00s，采样RSS最大约508–566MiB，非Settings／PSS／
连续峰值／P95或A/B收益。独立两trace auditffa33bbd确认一次磁盘revision context
替换后完整检查869输入，无额外owner／transient批次；不声称磁盘增量已实现。
旧1826 whole及正式评估器BLOCKED保留，不能覆盖当前生产；当前fresh whole
NOT_RUN，合入前仍须原完整check:fast＋分支PR。下一切片先验证其它ordinary
能力在磁盘编辑重建后的动态READY，再继续冷Program／OP04／压力资源与全336格。
这里只关闭局部引用刷新合同；全部最终门禁不变、550ms不前置，L08仍IN_PROGRESS。

## 2026-10-16 普通查询与诊断先完成／follow-up动态保护

当前a6ae3b97已逐项修复definition、诊断先完成时的原意图丢失和两入口outgoing
follow-up的完整scope缺口。原两条未知输入负例不改；首轮宽根触发86/88 FAIL
保留（audit07112a09），选择性准备后9完整相关文件88/88、exit0、audit e4c7eaa1。
诊断不认证根，实际L2/L3清除意图、普通定义真实compiler取消和最终物理fence保护。
当前安装完整SDK两独立定义会话exact/current READY／诊断／正常退出，首次
220/228ms、编辑后3.69/3.84s，离散采样RSS最大559/557MiB（audit7becc0ca）。
它们不是P95、PSS、A/B或正式发布report，冷重建与完整最终门禁仍待。当前原
完整collector`.bench/op03a-ordinary-ready-refresh-current-whole-v1/whole*`实际
FAIL／exit1；原ENOSPC使fixture与Node harness输出失败，没有根摘要，counts=null。
独立审计23bd83d0确认206入口／1734源码归档／SDK／构建／启动器与实际退出一致；
证据完整性通过不授予whole GREEN，也不据中断作语义根因结论。原失败证据保留，
先处理本任务重复派生存储，再新前缀原完整命令重跑。旧81d6e876 whole1826不授予
当前GREEN。继续原完整队列，
合入须fresh whole＋分支PR，L08仍IN_PROGRESS、未合main。

## 2026-10-16 存储恢复后的完整终态与观察资格修正

原storage-recovery-v2完整check:fast已1837/1839、2FAIL、exit1、零注解，
3303432.414356ms；206入口／1734源码归档／SDK／构建／启动器与实际PID退出
独立审计4ab388e2。本轮无ENOSPC，原v1中断／counts=null与全部历史失败保留。
失败分别为verifier观察旧前提和原403引用id4的20s超时，不称整轮GREEN。
原样RED与两个真实公开CLI对照确认默认合法resident路径不启动verifier；
专用fallback两个verifier均有正哈希、native dispose／Registry清零／原生退出，
auditd9ea6d3d。只修该测试资格并增强默认编辑／cache完整保护，三个完整相关
文件30/30、exit0、auditacf11315；494行，生产a6ae3b97／默认策略不变。
不据非终态owner记录推断LS dispose／物理释放或泄漏，也不把私有SDK诊断当
安装SDK、PSS或正常性能资格。当前新测试head whole NOT_RUN，403仍待，合入须
fresh whole＋分支PR。全部原最终门禁和OP00–06余项保持，L08仍IN_PROGRESS。

## 2026-10-16 真实restart两入口机制与逐进程证据

原403同输入／原期限仅一次有限复测1 PASS／2未选、exit0，完整oracle到达，
auditc67ed6b0；不是修复，原whole1837/1839 FAIL不改。独立OP06实际restart首切片
随后公开RED→GREEN：两source入口、新进程先UNPREPARED再READY、当前未保存目标
编辑／版本重放、混合／两次重启、逐进程canonical／raw消费及异常前缀／尾项保护。
19完整相关文件171/171、exit0、零注解，224972.646174ms；1739源码／SDK／构建
身份、原日志与PID退出独立audit SHA
`0b95855d209819f7216688dbf245936a88ee4dbca7e8b44134a78debe9b596cf`。
两私有SDK原生入口共4服务进程正常退出；原CLI/report仍FAIL，正式消费BLOCKED。
不是安装SDK性能、P95／PSS、native LS dispose或物理释放证明。只推进definition／
typeDefinition机制，不代替14能力restart、resolve/call旧句柄、配置／取消／压力资格。
全证据releaseEligible=true正例、336格／每格100请求／5会话、P95≤550ms／目标500、
100循环和原全部资源／平台门禁保留。生产a6ae3b97／六默认／1024MiB／batch64／
ADR0003不变，工具head whole NOT_RUN；合入仍须fresh whole＋分支PR。
L08 IN_PROGRESS、不阻塞前序切片；原命令／剩余项见[OP06](../tdd/op06-release-sample-evidence.md)。

### 后续补全／调用层级实际来源保护

两入口完整completion/resolve、prepare/incoming/outgoing、新旧补全UUID隔离及
本进程更早／同快照／版本的实际来源绑定已验证；call item按现有root／位置与
当前源语义处理，不另加会话UUID。20完整文件176/176、零注解；四个私有SDK原生
案例12精确请求／8服务PID正常退出，独立audit SHA
`6d359df322546edfad5efc573c60d2d52d822a6618ce1c952b7ea303c48b2383`。
原报告FAIL／正式消费BLOCKED，不是安装SDK性能、P95/PSS或物理释放；其它restart
能力／异常／真实工程、全证据PASS路径、336格与全部最终门禁仍保留。生产a6ae3b97／
六默认／预算不变；本工具head whole NOT_RUN，合入仍须fresh whole＋分支PR。
