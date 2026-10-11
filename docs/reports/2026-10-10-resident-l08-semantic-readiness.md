# L08 真实语义就绪合同与必要输入诊断

## 2026-10-11 压力后请求恢复修复

用户单独授权的恢复失败缺陷已修复；L08仍IN_PROGRESS、未合main。
原因不是SDK版本：20次open/close超过32条journal上限，旧proxy永久
锁存restart-required。现在在原生命周期owner内终止旧Worker、恢复
全部根与最新打开文本，并隔离旧代变更的晚到错误；正常诊断、取消、
临时version0 staging及原queue/字节/1024MiB政策保持。

最终sourceInput=f5585462、server=00272459、Worker=60156e4e，Node20.19.5。
相关九入口110/110、根exit0、零skip；原三组规模流程（默认10k、
选定10k、选定100k）各cold3/warm10/stress5全部CLI0/PASS，共54会话、
15次压力后补全成功。源码/产物/工具/Node、全fixture字节/路径、SDK/
Settings pins及分支/main本地引用后置全等；未修改SDK或工程夹具。

恢复补全仍约3.3–6.0秒，不是550ms SLO通过；原SDK必要输入/ready、
完整资源/PSS/DevEco、336格、其它平台及引用冷超时等门禁未因此关闭。
当前新构建whole check:fast NOT_RUN，下方旧1580轮FAIL不重pin。
详情见[恢复TDD](../tdd/l08-pressure-recovery.md)，机器证据
`.bench/l08-pressure-recovery-final-state.json`保留全命令、三份报告及15样本。

## 2026-10-11 本机验收批次终态（修复前历史）

本轮可执行验收已运行到终态；产品结果为 **FAIL**，L08仍IN_PROGRESS，
未合main。固定用户确认兼容的API24，不另设版本匹配门禁；550ms上限、
500ms目标、100请求/5会话、完整结果、1024MiB政策及其它门槛保持。

| 本机验收项 | 终态结果 |
| --- | --- |
| 验收工具公开回归 | 23/23 PASS；类型/build通过 |
| 当前冻结check:fast | 1580项：1579 PASS、1 FAIL；退出1，零skip |
| 真实工程5独立会话 | 220/220完整exact，正常诊断/退出/输入不变PASS |
| 各100次重复开发控制 | rename P95=365.6ms；incoming P95=763.9ms、98/100>550ms |
| legacy路径100次编辑 | 9次完整、91次预算拒绝；5次恢复未执行，整轮FAIL |
| 选定indexed路径100次编辑 | 100/100完整exact；P95=5557.8ms，非正式SLO认证 |
| indexed首轮/压力恢复 | 构造器首轮预算拒绝；5次L3均applied，1次恢复exact、4次无驱逐证明，整轮FAIL |
| 10k默认与10k/100k选定配置 | 均在L3后completion报Semantic worker restart required；退出1，无完整资源报告 |

整轮唯一失败为公开rewritten struct完整引用用例：includeDeclaration=true
的response 4在原20秒超时。原用例隔离1/1通过（另2项名称过滤）不覆盖
整轮FAIL，尚未确认根因。完整根统计2504452.298559ms；第5段日志观察
截断保留，不声称逐字完整stdout。

两条soak均trace-on、只作归因，不以错误的短耗时认证性能。legacy峰值
1896562688 bytes，静置10秒60点RSS均1632247808 bytes、resident=0；
indexed峰值1288159232 bytes，静置10秒68点RSS均440610816 bytes。
这是不同策略的真实开发资源观测，不是PSS、发布缩放或历史>3GB复现认证。
indexed首轮预算拒绝不是静默截断；267个oracle位置保留为未获得结果。

7份真实报告进入当前336格矩阵：8格有观测、424条格内请求，其中220
trace-off产品计时、204 trace-on归因；压力专用桶另有1条，不重命名成
正常桶。CLI退出1/FAIL、releaseEligible=false；formal ready/SLO仍未毕业。
真实根准备仍因DataShareResultSet必要输入缺失而degraded；不据此推断
SDK版本不兼容。严格直接查询未打开source仍是本机实现缺口。
Windows路径解析fixture不是Windows实机验收；PSS/DevEco、其它实机平台
及全336格发布仍未认证，不阻塞本轮本机验收的执行。

sourceInput=b5f4b2f53346419bc37d1cf50697cc1cd7d2b1071a6a95a7cdbf64efce54b19a；
server=9510101a、worker=60156e4e、sidecar=84597a63，Node20.19.5，
SDK24/6.1.1.125、digest8098b8ab。1586项仓库输入、179登记/172fast、
5构建产物、20harness以及工程/SDK/分支/main本地引用等11组向量全等。
10k/100k全部10006/100007个fixture文件字节/路径前后全等。
证据文档在这些后置核验结束后更新，不重pin历史结果。
未修改生产源码/默认实验开关，未push或操作PR；临时launcher归档后移除。

原始/机器分类：`.bench/l08-local-acceptance-v2-current-state.json`、
`.bench/l08-local-acceptance-v2-matrix.json`、`.bench/l08-local-whole-v2-state.json`；
各会话/soak报告、三个大工作区失败日志及完整输入摘要由current-state索引。
公开RED/GREEN与分母见[本轮TDD](../tdd/l08-final-evidence-entry.md)。

## 历史检查点（以下“当前”仅指对应旧批次）

状态：IN_PROGRESS；不宣称L08/G-READY或性能、内存毕业，不允许合main。
当前source 1c9dfeca按用户明确确认采用P95≤550ms验收，500ms保留为优化
目标；100请求/5独立会话、336格及其它门槛不变。三条公开工具合同
RED→GREEN，类型/build通过；14入口151/151、退出0、零skip。
随后隔离真实SDK开发控制1/2：rename P95=234.7ms PASS，incoming
P95=596.4ms FAIL（十个样本均>550ms）；完整exact/输入/退出/正常诊断
检查通过。各10次/1会话，仅candidate控制，不能认证正式ready/SLO。
11组冻结输入终态全等，新whole NOT_RUN；旧500ms失败不自动重标。
当前分类/pins/全样本见`.bench/l08-550-contract-v1-current-state.json`及
[550ms合同TDD](../tdd/l08-semantic-readiness.md)。最终矩阵仍统一BLOCKED、
直接未打开文件查询及真实SDK/资源/soak/平台门槛未关闭。
无收益的物理父目录复用实验已撤销，真实incoming710.2ms失败、149项
实验回归和CPU归因归档；不能称当前优化收益。保留两条原实现也能通过
的SDK路径负例，临时探针归档后移除，详见[扫描TDD](../tdd/l08-query-input-freshness.md)。
此前f8c2155a的新proof公开120/120、rename244.3ms/incoming558.4ms
按当时500ms判定的失败均保留，见`.bench/l08-dynamic-ready-current-state-v1.json`。
此前预期ENOENT分配切片经公开978异常RED→原64预算GREEN，完整SDK
定义/输入见证保护不变，类型/build通过，联合六入口65/65 GREEN、零skip。
三项缺失/身份守卫通过（其余20项名称过滤）。当时source82e141f7真实SDK
开发控制2/2通过：rename P95=213.3ms、incoming P95=448.5ms；各10样本/
1会话，非正式ready/SLO认证，新whole NOT_RUN。当前完整分类见
`.bench/l08-lstat-no-throw-current-state-v1.json`。
此前36defd53e整轮实际FAIL：1565项中1563通过、两个原5秒冷查询超时；
终态全部冻结输入全等，隔离19/19不能覆盖该失败。详见下方扫描TDD。
此前36defd53e重命名事务抽取bundle公开37/37 GREEN；同构建真实开发
控制2/2 GREEN：rename277.0ms、incoming493.1ms。只有10样本/1会话，
incoming余量约7ms，不是正式ready/SLO认证；该构建whole已FAIL，
原全部门槛保持。此前cf24dc的120/120与501.8/562.1ms失败均保留。
当前证据见[扫描TDD](../tdd/l08-query-input-freshness.md)及
`.bench/l08-rename-extraction-final-state-v1.json`。下方700.5/116为此前检查点。
此前入向扫描切片已改变生产源码；下文1556 whole仅对应旧冻结身份，
该索引bundle focused116/116 GREEN，但当时入向开发P95=700.5ms仍FAIL。
当前whole NOT_RUN。详见[扫描TDD](../tdd/l08-query-input-freshness.md)及
`.bench/l08-incoming-scan-optimization-v1-state.json`；原全部门槛保持。
[TDD记录](../tdd/l08-semantic-readiness.md)包含公开RED→GREEN及保留行为证据。

## 已实现的有限范围

root-anchored `arkts/semanticReadiness`支持显式prepare及无编译构建的状态。
沿用现有Store、官方LS/Program、coordinator lease、Worker epoch/revision/
SharedArrayBuffer取消；不预查询目标、不新增语义owner、不推广R09/default。
准备比较真实Program文本与当前source/overlay/disk字节，绑定SDK/stdlib/
options/graph/membership和实际r10 package/compiler artifact摘要。
必要输入缺失保留degraded/null generation/空能力；首个compiler诊断有
URI/code/message/UTF-16位置，不称完整失败列表。普通代码错误仍发布正常
诊断，不自动判为分析输入缺失。

公开9案例及能力/登记20/20通过；接线后的旧语义、生命周期、标准库及
协议/登记112/112通过。首个prepare正例与缺失输入可观测性都有真实RED。
这些不是全新whole，也未覆盖所有ready状态/平台/规模/长期稳定性。

## 固定Settings/API24原输入

两轮都保持ecc550原SHA、clean checkout、workspace digest4becf56…；
无didOpen/目标查询。各自记录实际新build pins及SDK/stdlib，终态身份全等，
不重pin旧1516或旧性能分布。必要输入缺失不等于SDK版本不兼容；当前兼容约束以用户确认的API24为准。

| 诊断轮次 | initialize至prepare终态 | semanticState | server+sidecar采样RSS峰值 |
| --- | ---: | --- | ---: |
| v1 | 24176.197385ms | degraded / dependency-inputs-incomplete | 953528320 bytes |
| v2（首个诊断详情） | 23176.170522ms | degraded / dependency-inputs-incomplete | 951287808 bytes |

v2诊断当时源码inputSHA `98615898a9a1ec73f160951dd4de30e04a181e923e50bcbc2f5653bdfa7936d4`；
server `ec628209890554f4562ca3e0b916785213c18bcd62b03a5340a127230a717ab7`，
worker `8833aa0a8e84f83d280ef3910aa02da28c6ab8a39c6012b1c04186396df77524`。
原始报告`.bench/l08-settings-ready-probe-v{1,2}.json`及RSS/metrics旁文件。
两轮产品和采样器退出0、无sampler错误、无1536MiB开发停止线触发；
工具1/1通过仅证明合同执行，不是产品ready PASS。1024MiB政策/原门槛不变。
无实际Zed，Mac采样RSS非PSS且是下界。v1/v2样本188/180，实际采样
P50/P95/max分别130/140/153及130/141/160ms，不把请求50ms当实际间隔。

## 当前首个必要输入

实际编译器TS2307：
`common/src/main/ets/utils/SettingsDataUtils.ts`零基line26/character31，
导入`@ohos.data.DataShareResultSet`。该类型实际用于AsyncCallback及返回
结果参数；不是从字符串推测或把无关的普通类型诊断当缺失必要输入。

只读核查当前SDK的resolver四个实际ETS/JS `.d.ts`/`.d.ets`候选均不存在；
完整ETS声明中未找到同名文件/ambient module。来源是当前SDK字节清单，
未因web官方文件检索失败而猜测API/systemapi属性。v2原始报告未保存
sdk.selected日志，不能据它声称独立运行时选择日志已闭环；显式初始化
选择和输入pins、真实compiler失败保留。下一快速synthetic SDK有/无
精确模块的公开counterfactual验证解析路径，绝不将其补入真实SDK或
充作Settings成功。该counterfactual已10/10公开GREEN：声明缺失时真实
2307；仅临时SDK存在声明并通知后ready、SDK覆盖2及完整精确字段导航，
正常诊断为空。它排除这个精确module的基本解析遗漏，不能代替真实SDK。
已询问用户匹配完整SDK/已有真实证据路径；没有下载、修改真实SDK或
改写固定工程，也没有合并/PR外部写。

## 未完成门禁

本轮已通过实际getSemanticDiagnostics在途取消RED/GREEN、L2清理和
同工程/同缓存的真实进程重启特征。取消后无completed检查/ready证明，
恢复正常2322诊断与exact定义；逐输入观察不会预跑目标答案。当前13项
公开ready案例，联合协议/队列/取消/能力/登记92通过；新重启另1通过。
固定Node20.19.5联合51/51通过，包含全部13个ready案例及既有物理回收/
多根overlay/取消/正常诊断公开合同；没有完整stdout文件。取消单项额外
复测1 PASS、12项name-filter未运行，不算whole或发布样本。分类证据见
`.bench/l08-readiness-cancel-regression-v1.json`；类型/构建/差异检查退出0，
后置构建/Worker/SDK/固定Settings身份全等，新whole尚未执行。
新源码input0a81bb1e…/Worker bd3cdbac…见身份文件
`.bench/l08-readiness-cancel-build-v1.json`，不重pin上述Settings v2或旧whole。
上述中断证据仅覆盖已进入的semantic输入检查，不涵盖所有parse/bind/global
准备阶段。严格ready结果schema已完成11项逐次公开Worker协议RED/GREEN，
另2项真实MessageChannel/恶意字段特征首次GREEN；root、完整capability、
counter/hash/backend/coverage/必要输入诊断及实际代际关联均受约束。raw
与immutable snapshot分别验证；不把传输形状当作实际Program证明。
当前Node20.19.5联合140/140、退出0、54035.974531ms，含13个wire和13个
真实stdio就绪案例；完整输出见`.bench/l08-readiness-wire-node20-green-v1-output.log`。
本轮源码input ebbb8b63…/server cfb99c70…/Worker b9288e35…见
`.bench/l08-readiness-wire-build-v1.json`，不重pin历史Settings/whole。
后置全部18项输入/构建/SDK/固定工程身份相同，Settings仍clean，类型/
构建/差异检查通过；分类摘要`.bench/l08-readiness-wire-regression-v1.json`
保留releaseEligible=false，新whole仍NOT_RUN。
接续多根公开反例暴露共享resolver仅追加事实就使独立根旧证明失效。
最小区分reset与追加后，每次仍扫描全部当前load-owned事实，前后revision/
reset fence保留。独立根联合原保护18/18 GREEN；嵌套依赖编辑会撤销双方
旧证明，再准备恢复精确当前位置。额外命名包事实在A就绪后加载，无通知
retarget仍撤销旧证明，通知恢复正常2322和新入口精确导航。真实物理
Worker替换的新线程/epoch、旧proof不可用、最新overlay重放后重新准备
及正常诊断也已公开GREEN。fixture环境opt-in先RED再最小支持，不称生产
recycle缺陷。见[TDD追加记录](../tdd/l08-semantic-readiness.md)。
当前生命周期再加未知影响范围案例：无通知新增未查询模块/缺失导入及
删除旧依赖均撤销旧证明，prepare给真实2307；当前overlay修复保留普通
2322，恢复实际依赖后精确导航。新增5案例（合既有13 ready为18）。
新源码input6d3568a5…/
server3d9ca90d…/semantic Worker968878fa…与上述历史codec构建分开；
身份`.bench/l08-readiness-lifecycle-build-v1.json`，新whole尚未执行。
Node20.19.5联合freshness/协议/生命周期202/202终态退出0、
310688.594292ms；未知范围另1单项通过，最新全公开组27/27终态退出0、
25994.531545ms，含全部18 ready/fixture/登记，无fail/cancel/skip/todo。
不将4个name-filter未运行项计入通过，不把重叠组数量相加。两组完整
stdout另存同名前缀；运行后全部18项构建/SDK/Settings身份相同、固定
工程仍clean。分类`.bench/l08-readiness-lifecycle-regression-v1.json`
保留releaseEligible=false、新whole NOT_RUN。
benchmark请求级准入尚未消费真实合同，336格100请求/5会话、
100循环、原内存、>3GB/50%峰值、三平台/API23/DevEco等未完成。
原入向调用/编辑>500ms长尾继续保留。L08全门禁PASS后才经分支PR合main。

## Benchmark开始观察真实根准备

公开CLI现在实际发送root prepare，区分READY/DEGRADED/unsupported/
invalid/error/timeout；必要输入诊断、完整覆盖/代际及实际根/backend pins
不再被目录ready或手写标志替代。四个公开case、四次垂直RED/GREEN保留，
旧prepared/replay/回收/矩阵/登记联合71/71、退出0、103735.524788ms。
三处旧真实生产unsupported断言改为精确SDK失效原因，所有原exact/
诊断/timeout/lease/eviction/recycle保护保留；首轮68/71失败未删除。
详见[TDD接续记录](../tdd/l08-semantic-readiness.md)。当前179入口/172 fast，
新whole仍NOT_RUN，历史完整1516和协议/生命周期组不重标为本切片whole。

固定原Settings/真实API24、Node20.19.5的零didOpen/目标查询v2观察：
CLI1/raw FAIL、产品退出0，catalog1846 ready，但实际根prepare终态仍
DEGRADED，首个TS2307仍为SettingsDataUtils.ts 26/31的
@ohos.data.DataShareResultSet。catalog8542.170938ms、根prepare
16464.335046ms、进程起点至终态25006.671283ms；没有time-to-ready值。
server+sidecar外部RSS峰值921141248bytes，195样本，实际采样P50/P95/
max129/139/151ms、sampler错误为空；无Zed、Mac RSS非PSS且为采样下界。
完整诊断transcript73条/dropped0；新sdk.selected事件确认实际配置路径、
API24/6.1.1.125与identified元数据，dialectCompatibility仍unverified。
这闭合本次运行的选择日志，不追溯补写早期Settings probe v1/v2的缺失日志。
报告`.bench/l08-prepared-settings-ready-observation-v2.json`保存实际事件/
输入/采样/终态；v1预检因仅准备清单的诊断屏障前提错误而拒绝，未启动
产品，原失败及清单保留，不算产品RED。没有改真实SDK或原固定工程。

源码input6d3568a5…/server3d9ca90d…/Worker968878fa…与前轮相同，
但harness已变；18项输入/产物/SDK/Settings与14份harness前后全等，
固定工程clean。当前只是根准备观察，所有请求仍candidate-ready-control，
观察到READY也不自动通过请求级ready/SLO。接续必须绑定实际请求准入与
完整首次未打开/编辑/驱逐/重启计时；普通更新不得借root prepare预热后
排除成本。L08全目标保持，暂不合main。

本切片新增源/测试/脚本≤500行；type-engine恰500。既有超限文件虽已
抽取完整职责并不比修改前增长，仍有迁移债：run-language-server792、
worker-protocol1998、document-store2048、typescript-language-service3447、
legacy-semantic-engine926、semantic-worker-proxy560、supervisor894，
semantic-worker-protocol测试974。继承dirty改动保留，未直接操作main。

## 静态请求准入与首次未打开文件失败

当前benchmark在candidateControl=false且根实际READY时，显式preOpen
先于初始prepare；测量后仅prepare=false核验。无编辑/驱逐且generation/
input不变的首次/重复definition已exact，记录origin proof及
semantic-ready-snapshot。旧candidate对照不升级；有限run ready PASS只
覆盖这些请求，trace-on/样本或会话不足仍不通过release SLO。
普通编辑/驱逐后的请求不认证为原静态快照，完整计时不变。

直接查询未打开文件的definition得到[]，manual expected仍为Query.ets
line0/character13–18，初始/末尾完整READY证明相同。公共入口缺少
documents.get直接fallback，未进入compiler，不是URI别名差异。未改
oracle、未预开目标，诊断didOpen仅在测量及只读验证后。负向验收保护
让该实际错误ready FAIL/EXACT_QUERY_FAILED；其GREEN不是查询能力修复。
现有路径支持打开调用文件导航到未打开模块；已向用户确认最终桶是否
还需直接查询未打开文件，不混称。完整差分
`.bench/l08-ready-requests-unopened-empty-response-v1-output.log`。

当前Node20.19.5联合73/73、退出0、108437.057715ms，零fail/cancel/skip/todo；
pnpm check/diff check通过，18项产品/SDK/Settings及15份harness前后全等。
Settings clean，源码/构建与前代相同；harness独立冻结，不重pin性能。
新whole NOT_RUN，最终矩阵入口尚未认证新样本；动态认证、原资源/
三平台及真实SDK缺口仍未完成。详细[TDD记录](../tdd/l08-semantic-readiness.md)
保留真实RED/GREEN与范围边界；L08未DONE，不允许合main。

## 输入/覆盖一致性与正文编辑保护

新公开CLI反例确认：只比较generation与总摘要仍可能认证矛盾proof。
options摘要或Program coverage的单变量变化分别真实RED，最小比较
完整inputIdentity及coverage后7/7、8/8；这些是边界伪造保护，不宣称
实际compiler产生错误或已实现producer加密认证。
真实生产函数正文return 1→2后，三次definition仍exact、版本1/2/2，
didChange后立即计时且无重新prepare；只读末尾报告
DEGRADED/prepared-inputs-no-longer-current，旧快照不认证。正常诊断/
退出/unsaved overlay/pins保持；当前仍未认证更新后的新代际。
全部new file/登记13/13退出0、20099.574221ms，无fail/cancel/skip/todo，
Node20构建/diff check通过。当前执行输入将独立冻结后运行新whole；
进程/终态以`.bench/l08-readiness-whole-node20-v1-*`为准，不提前记PASS。
source/真实SDK/Settings/原门槛/默认未改，L08未DONE、未合main；
[TDD记录](../tdd/l08-semantic-readiness.md)保留初始特征断言失败及真正RED。

## 当前冻结完整回归终态

Node20.19.5当前 `pnpm check:fast` 已终态1556/1556、根退出0，零
fail/cancel/skip/todo，测试duration2328656.379685ms。1578全repo输入、
18产品/SDK pins、179登记/172fast、5产物及18 harness前后全等，Settings
clean；后置核验后才追加本段文档，不重写冻结向量或借旧通过数。
raw终态与44段观察日志独立保存；一次输出超过24000-token观察限明确
标记截断，不称逐字完整stdout。分类
`.bench/l08-readiness-whole-node20-v1-regression.json`为当前完整fast回归
PASS/releaseEligible=false，不是所有L08产品门禁通过。当前源码/构建、
SDK/工程、预算/默认与main均未改；真实SDK缺口、动态请求认证、336格/
500ms/原资源/soak/三平台、API23/DevEco仍未完成，目标active，未合main。
