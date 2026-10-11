# L08 最终产品验收执行记录

状态：IN_PROGRESS；用户目标为完成 L08。2026-10-10 用户明确确认正式
P95 上限为 550 ms，500 ms 保留为优化目标；其余原门槛均不变。
父 HEAD：`1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`；继承 dirty 工作树保留。

2026-10-11 维护者更新交付要求：六项有效组合默认开启，先通过分支和PR
合入main并push GitHub，不等待本阶段全部验收PASS，见
[ADR 0015](../adr/0015-default-resident-optimization-policy.md)。本授权替代
下方旧的验收后合入/默认推广限制；新完整check:fast仍须GREEN。
L08 IN_PROGRESS及性能、资源、ready、平台失败结论保持。

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
2. 在既有 semantic owner 内完成输入/Program/覆盖绑定的真实 ready 合同；
   准备不预跑目标池。公开 stdio 反例先 RED，再最小实现。
3. 固定真实 Settings/API24 输入，定位编辑/压力恢复重建长尾；优化不提高
   1024 MiB 政策值、不关闭诊断、不缩小合法 scope、不截断结果。
4. 冻结构建/目标池/分类后，执行 ≥100 请求/能力×桶、≥5 独立会话与
   ≥100 交替任务/编辑循环；记录完整响应、原始资源采样和生命周期。
5. 运行原规模/DevEco/PSS及三平台发布矩阵，冻结完整回归并逐门禁审计。

用户追加交付要求：L08完成后将相关代码合入main。仅在全部验收门禁
PASS后，通过实现分支和PR执行合并并验证远端main与PR终态；不直接
push/merge到main，不在L08仍FAIL/BLOCKED/NOT_RUN时提前合并。

所有发布必需门禁 PASS 才可 DONE；FAIL/BLOCKED/NOT_RUN 保持实验默认
关闭。以上顺序不缩减完整目标；缺失环境只影响对应实测，不停止其它安全工作。

## 起点证据与环境

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

