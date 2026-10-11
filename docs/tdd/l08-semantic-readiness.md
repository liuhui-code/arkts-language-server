# L08 公开语义就绪合同

状态：IN_PROGRESS；父 revision `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`。
本记录不代替完整 L08 ready、550ms P95验收（500ms目标）、内存、soak
或跨平台门禁；历史500ms判定保留，用户授权与当前复核见末节。

## 首个垂直切片：catalog 不冒充 semantic-ready

正式 RED：
`node --test --test-concurrency=1 tests/semantic/semantic-readiness.test.mjs tests/test-layer-manifest.test.mjs`。
生产 bundle/native sidecar、实际两文件 catalog ready，未打开/查询目标。
根退出1，5测试中3 PASS/2 FAIL；188.388513ms 的公开反例返回
`-32601 Unhandled method arkts/semanticReadiness`，另一失败为新测试未登记。
原始输出：`.bench/l08-semantic-readiness-negative-red-v2-output.log`。
此前未登记实验 RED 与其初始 harness 断言修正保留，不混作本次正式证据。

最小接口 `arkts/semanticReadiness {rootUri, prepare:false}` 验证配置根、
参数、停止状态及预先取消。返回 unprepared/null/空能力，不创建 Worker
或 Program。登记 bundle-e2e，176入口/77 bundle；不新增标准能力广告。
初次联合39测试中38通过、层计数仍旧76造成1失败，已修正为77；
接口与层登记终态5/5、退出0，462.16376ms。传输特征联合82/82退出0。
这只是诚实的未准备查询，尚不宣称正向 ready 合同已完成。

## GREEN 下的职责抽取

此前 completion opaque handle、配额边界、stale/cancel/shutdown/能力公开
特征34/34 GREEN后，抽出 completion-resolution-store，类型/构建后同组
34/34、退出0、12651.167761ms。初次类型漏导出 record 已纠正，不称
初次构建成功。更早句柄因输出观察丢失，已确认无遗留进程后重新建立
可观察基线；未知退出结果不算 GREEN。

Worker错误策略抽取前联合82 GREEN，抽取后原传输/队列/取消/范围77/77、
退出0、2495.30005ms。既有公开语义/资源/生命周期/stdlib特征80/80、
退出0、199068.761497ms后，再抽取准备阶段观察、command input类型、
资源分类、legacy结果映射、entry provider metadata和compiler测量职责。
后置联合终态162/162、退出0、203773.816931ms。已有 dirty L02–L07改动保留。

迁移债仍存在：run-language-server792、worker-protocol2047、
document-store2033、typescript-language-service3429、legacy913、proxy551、
supervisor893行；均比本切片修改前减少，新增源/测试/脚本≤500。

## 下一垂直切片

公开正例先 RED：显式、root-anchored、无目标池/位置/符号的完整官方
Program/Checker准备，绑定当前实际后端/SDK/stdlib/config/membership/
source/overlay及Program身份，之后查询此前未请求/未打开模块。
沿用 DocumentStore、官方LS、coordinator lease和现有epoch/revision/cancel
传输。无 ReadyManager、第二LS、目标答案预跑或默认实验推广。
后续分别验证overlay、未知/缺失必要输入、取消、trim/evict/restart/multiroot，
再让benchmark消费真实合同。不停留于负状态端点作为最终产品完成。

正向准备正式RED：同一公开测试文件，2测试中1 PASS/1 FAIL、退出1，
516.357104ms；prepare:true得到-32602。原始输出保留在
`.bench/l08-semantic-readiness-positive-red-v1-output.log`。
最小实现使用Store自身的成员锚点准备完整官方Program/Checker，比对
Program实际文本与当前字节，检查必要依赖、SDK/stdlib、load-owned配置
见证与完整覆盖，未预查询符号。生产build嵌入实际r10 package/compiler
摘要，不使用历史r4声明或仅ts.version=4.9.5。普通代码错误与必要输入
缺失分别处理，原诊断未关闭。类型收窄首次失败保留，修正后类型/构建
及公开2/2、退出0、1273.087882ms；状态查询无新script admission，随后
未打开模块定义全等，正常版本诊断为空。
联合86先85通过/1旧21方法allowlist失败，补齐22方法含root/null版本正例
后86/86、退出0、5409.238513ms。此GREEN后抽取测试bundle driver职责，
995行既有传输测试向500迁移，不缩减旧反例。
overlay/取消/回收/多根反例、真实Settings-ready及完整新回归仍未完成。

接线后原语义/生命周期/标准库、协议与登记联合112/112、退出0、
204901.408986ms（包含当时5个公开ready案例）。新增overlay、缺失依赖/
普通代码错误、early取消均是已有防线的characterization：初次即GREEN，
未据此编造新的产品RED或改动实现。最新5/5、退出0、4329.953152ms；
SDK身份失效/通知后新metadata绑定也GREEN。L3反例首次使用了不存在的
semantic.context.dispose事件，正确性状态已非ready；核对既有实际
semantic.context.evict事件后修正harness，不把它说成产品缺陷。
7案例修正后7/7、退出0、6203.848027ms；加参数/停止和超限成员反例后，
公开9+登记4共13/13、退出0、7079.020398ms。仍缺midflight取消、
L2/restart/multiroot及严格结果schema等，不宣称G-READY全部完成。

真实Settings/API24首轮root准备诊断：`.bench/l08-settings-ready-probe-v1.json`。
固定原SHA/干净checkout，实际当前构建/SDK/stdlib和终态pins相等，catalog
1846文件ready；零目标请求。initialize至prepare终态24176.197385ms，
实际semanticState=degraded/dependency-inputs-incomplete，generation=null/
空能力。产品/采样器退出0，无采样错误/停止线触发；工具1/1通过只证明
合同执行，不是产品ready PASS。188原始样本，server+sidecar peak RSS
953528320字节（无实际Zed，非PSS，下界），实际间隔P50/95/max
130/140/153ms。1536MiB为预声明开发停止线，不提高1024MiB政策或
原release阈值；原RSS/缺失输入失败不改名。

首个缺失输入可观测性新公开RED：9中8/1、退出1、6525.581518ms，
missing.result.unavailableInput.uri为undefined而非真实Main.ets URI；原始
输出`.bench/l08-semantic-readiness-missing-detail-red-v1-output.log`保留。
最小字段只报告compiler首个必要输入诊断的URI/code/message/UTF-16位置，
明确非完整诊断列表，不增加假语义/缩减查询域。类型/构建与ready/能力/
登记20/20、退出0、8839.405825ms。新构建真实probe v2继续同停止线，
取得具体源前不猜测是历史mpchart/controller问题。

v2真实probe已终态：1/1诊断执行通过，产品/采样器退出0；实际仍degraded，
不是G-READY PASS。initialize至prepare23176.170522ms；首个必要输入为
SettingsDataUtils.ts零基26/31的@ohos.data.DataShareResultSet，TS2307。
180样本，server+sidecar采样RSS peak951287808字节，实际间隔130/141/160ms；
终态所有pins相同，零目标查询、无停止线或sampler错误。
[真实诊断报告](../reports/2026-10-10-resident-l08-semantic-readiness.md)记录当前构建。

只读SDK四候选均不存在、完整ETS声明无同名/ambient module。先列出三项
可证伪假说后，加入synthetic SDK精确模块有/无counterfactual：先degraded/
真实2307，只有临时SDK真的存在该声明并通知配置后ready、SDK覆盖2、
正常诊断为空、声明字段导航精确。10/10、退出0、7742.575632ms；首次
即GREEN的characterization，不编造RED。此结果支持输入缺失并排除该
精确模块的基本SDK解析遗漏；不证明真实API23/24兼容或全部运行时SDK
日志已闭环，不把synthetic声明写入真实SDK/固定Settings。已异步询问用户
匹配完整SDK路径/已有证据；其余本机反例仍可推进，goal保持active。

上一代冻结全回归1516与性能报告继续绑定其旧构建；任何后续构建都
需要自己的验证，不能将旧证据重新pin。L08全门禁PASS后才经PR合main。

## 输入检查在途取消、L2及进程重启

本轮沿用tdd及karpathy-guidelines；先公开观察实际Program逐输入依赖
检查，不预查询符号。原target-independent正例新增检查入口/完成覆盖
断言，正式RED为0而非55个Program输入，退出1、933.952287ms。
命令：`node --test --test-concurrency=1 --test-name-pattern='target-independent preparation' tests/semantic/semantic-readiness.test.mjs`。
最小可选trace只包裹真实getSemanticDiagnostics；collector失败不改变
检查结果/取消，默认trace关闭时无观察开销。初次callback字段类型不兼容
使pnpm check退出1，收窄为既有primitive trace字段后类型/构建通过，
公开10/10、退出0、8039.10682ms。原两个超限owner仍3447/500行，不增长。

正式在途取消RED的父revision仍为本文件顶部HEAD，命令：
`node --test --test-concurrency=1 --test-name-pattern='cancelling an entered preparation' tests/semantic/semantic-readiness.test.mjs`。
先用20000个真实函数的夹具，两次20秒内未进入检查，属于harness前置
阶段超时，不冒作取消缺陷证据。缩为5000函数、实际内容小于2MiB后，
真实检查start已出现，stdio取消得到-32800，但源检查仍完成104.026091ms，
未抛compiler OperationCanceledException；1/1失败、退出1、3320.1ms。
原始终态输出保留在`.bench/l08-readiness-input-check-cancel-red-v1-output.log`。

核对当前文档及仓库固定ohos-typescript4.9.5-r10实际types/implementation：
HostCancellationToken仅boolean方法，Program诊断API需要带throwIfCancellationRequested
的CancellationToken；当getSemanticDiagnostics内部抛OperationCanceledException时，
此版本Program会清理中断的TypeChecker。最小适配使用原SharedArrayBuffer
host token/checkpoint，将显式token传入Program检查；不建立第二取消owner、
LS或调度器。GREEN必须在真实检查调用内观察interrupted、没有complete，
先用排队状态等待旧操作排空，证明无generation/proof，之后重新完整准备、
正常2322诊断及未打开定义精确，无重复取消终态。初次联合15/15、退出0、
11355.440253ms。此证据只证明已进入的semantic输入检查阶段；不把它
外推为所有parse/bind/global准备阶段的中断证明。固定fork的options/global
实现虽接受API调用中的可选参数，但未在函数体内消费它，相关边界仍需核验。

既有L3公开特征GREEN下参数化并增加实际L2 trim：两者清理后旧ready
失效，显式恢复得到新Program代际。初次即GREEN，是characterization，
不编造产品RED。公开ready、协议/队列/取消、能力及层登记92/92、退出0、
21982.852864ms；无fail/cancel/skip/todo。

在此GREEN下把fixture的同一生产配置复用于新的实际child process，并
由原cleanup关闭所有自有会话；抽取后12/12、退出0、12109.252829ms。
新增同工程/同磁盘缓存重启反例初次GREEN：新PID、catalog恢复后status
仍unprepared且不创建semantic Worker，重新准备才得到新Program generation，
相同输入identity；1/1、退出0、1717.267785ms。不假造“旧ready”持久化。

本轮build身份另记`.bench/l08-readiness-cancel-build-v1.json`：源码input
0a81bb1e…、semantic Worker bd3cdbac…；server字节未变，但Worker已变。
该文件仅身份记录，不是新的Settings-ready、性能/内存或发布证据；
真实Settings v1/v2诊断和旧whole1516仍保留各自的历史构建身份。
最新13公开ready案例通过；专门绑定ready证明的物理Worker替换/multiroot/
未知影响范围、严格结果schema、真实benchmark消费及最终全矩阵仍未完成，
L08保持IN_PROGRESS。

固定Node20.19.5完整focused命令：
`/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 tests/semantic/semantic-readiness.test.mjs tests/lsp-production-semantic-worker.test.mjs tests/lsp-semantic-request-reliability.test.mjs tests/semantic/semantic-worker-recycle.test.mjs tests/semantic/standard-library-diagnostics.test.mjs`。
51/51、退出0、141982.169347ms，包含全部13个ready案例及物理回收/
多根overlay/取消/正常诊断旧公开合同，无fail/cancel/skip/todo；此运行没有
逐字完整stdout文件，仅保留已观察工具输出与终态统计，不声称完整raw。
单独再复测输入检查在途取消，退出0、实际执行1 PASS，另12项因name
filter未运行并显示SKIP，3847.722108ms；它不是whole或发布矩阵样本。
Node26的92项完整观察输出保存为
`.bench/l08-readiness-cancel-protocol-green-v1-output.log`；分类摘要见
`.bench/l08-readiness-cancel-regression-v1.json`，不把重叠集合相加当独立数量。
后置源码/三个Worker/server/sidecar/stdlib/backend/lockfile/原内存门槛
摘要全部相同，Settings仍clean且内容、实际SDK摘要未变。pnpm check、
pnpm build、git diff --check均退出0；新whole仍NOT_RUN，不复用旧1516。

## 严格的root就绪传输边界

本轮使用tdd/karpathy-guidelines，保留现有owner/调度/default-off；不以
schema形状代替实际Program和输入新鲜度证明。父revision仍为顶部HEAD。
公开Worker协议、call hierarchy及实际生产stdio就绪基线53/53、退出0、
14885.350575ms后，抽出完整UTF-16/JSON raw/wire字节计数职责；保留独立
原始字节/序列化字节、lone surrogate与边界错误。类型/构建后原组53/53、
退出0、14889.599665ms。worker-protocol由2054降至1993，未先制造RED再重构。

新增`tests/semantic-worker-readiness-protocol.test.mjs`注册unit-contract：
177入口/85 unit/77 bundle/170 fast，其它分层不变。每次一个反例RED，
再最小实现GREEN；共同命令为
`node --test --test-concurrency=1 tests/semantic-worker-readiness-protocol.test.mjs`。
首个RED还联合test-layer-manifest，登记已GREEN，唯一失败确为缺失证明。
各原始终态保留在`.bench/l08-readiness-wire-<名称>-red-v1-output.log`：

| 名称 | 拒绝的实际反例 | RED pass/fail | RED总ms |
| --- | --- | ---: | ---: |
| missing-proof | ready无输入/覆盖证明 | 4/1 | 362.613802 |
| root-version | root请求携带文档版本0 | 1/1 | 226.390486 |
| states | warming伪装合法就绪状态 | 2/1 | 382.985293 |
| capabilities | ready空能力集合 | 3/1 | 259.321659 |
| identity | 输入SHA=bad | 4/1 | 274.718767 |
| coverage | dependenciesComplete=false仍ready | 5/1 | 302.650184 |
| root-correlation | 响应属于另一合法root | 6/1 | 315.331608 |
| generation | claimed-ready无实际代际绑定 | 7/1 | 340.926986 |
| diagnostic | degraded首个输入诊断为空对象 | 8/1 | 337.795869 |
| raw-args | symbol:undefined被JSON省略 | 9/1 | 345.041722 |
| snapshot | raw校验后snapshot完整性值改变 | 10/1 | 375.791895 |

严格校验root null版本、精确字段、三种状态不变量、冻结完整14能力、
非空必要输入原因、正常零基UTF-16诊断、完整counter/hash/backend/覆盖
字段。完整Program计数须覆盖每个类别，类别可能重叠，不错误求和。
成功响应须关联派发的canonical root，generation绑定当前envelope的
epoch/appliedRevision、Program UUID及输入SHA。supervisor传入已派发URI，
原epoch/revision/cancel fence不删除；错误响应仍经过固定安全错误策略。
raw schema先检，随后已有bounded JSON canonicalization与immutable
snapshot再检，防止未知undefined字段被省略、恶意descriptor导致两者矛盾。
这是传输结构/一致性防线，不是对未知producer的密码学认证，也不替代
semantic owner真正的compiler/加载输入见证。

上述11个反例逐次GREEN；最后11/11、退出0、368.645486ms后，纯GREEN
下统一strictArgs命名，并补两个首次GREEN的characterization：真实
MessageChannel完整就绪DTO克隆及深层冻结，原始record/array的额外字段、
孔洞、accessor/超限拒绝且getter零调用。协议联合53/53、退出0、
1744.506155ms。新源94/52行、新测试243行；协议终态1998，supervisor894
不增长，其余历史超限债仍保留。本轮没有编造这两个特征的产品RED。

固定Node20.19.5接续全组140/140、退出0、54035.974531ms，无fail/cancel/
skip/todo，包含全部13个wire案例、13个真实stdio就绪案例、旧协议/
call hierarchy/队列/取消/物理资源/能力/正常诊断合同及分层登记。
完整观察输出`.bench/l08-readiness-wire-node20-green-v1-output.log`保留实际
终态命令；类型/构建及git diff --check退出0。
本轮源码input ebbb8b63…/server cfb99c70…/semantic Worker b9288e35…，
完整身份另记`.bench/l08-readiness-wire-build-v1.json`。它不是新的Settings
准备或性能/资源证据，不重pinSDK失败的v1/v2或旧1516whole。
后置全部18项输入/构建/SDK/固定Settings身份相同，固定工程仍clean；
分类摘要`.bench/l08-readiness-wire-regression-v1.json`保留releaseEligible=false。
新whole仍NOT_RUN。物理Worker就绪证明替换、
multi/nested roots、未知影响范围及benchmark真实消费继续推进；L08仍
IN_PROGRESS，不把严格codec毕业当作G-READY或最终产品通过。

## 多根就绪证明与真实Worker替换

本轮使用tdd、diagnose及karpathy-guidelines；父revision仍为顶部HEAD。
不提高预算、不新增语义owner、不取消输入核验。公开ready/LspSession/
登记基线22/22、退出0、18874.472877ms后，在GREEN下从既有fixture抽出
未initialize的创建职责；原命令再22/22、退出0、18524.221807ms。
命令为`node --test --test-concurrency=1 tests/semantic/semantic-readiness.test.mjs tests/lsp-session.test.mjs tests/test-layer-manifest.test.mjs`。

新增公开stdio生命周期文件登记bundle-e2e，现178入口、85 unit/8 protocol/
78 bundle/3 artifact/1 sealed/1 large/2 real-sdk、171 fast，未降低覆盖。
独立根A准备后，再准备B并编辑B，不应撤销A的有效证明。首轮命令
`node --test --test-concurrency=1 tests/semantic/semantic-readiness-lifecycle.test.mjs tests/test-layer-manifest.test.mjs`
真实5项4 PASS/1 FAIL、退出1、1529.469217ms：A错误degraded，原因
prepared-inputs-no-longer-current。进一步在B刚准备、尚未编辑时检查A，
单项仍FAIL、981.184737ms，排除仅overlay串根的假设。

diagnose先排序假设：共享resolver记录追加、overlay版本串根、真实配置
变化/内存清理。仅临时stderr探针定位compiler见证仍current、package
见证失败；最终实际记录为unprovable=false、revision 3→5、content事实
0→0、path事实2→4，未改变原输入。探针RED退出1、985.574794ms。
原始输出保留`.bench/l08-readiness-lifecycle-{sibling-first-red,sibling-isolated-red,witness-growth-red}-v1-output.log`。
所有DEBUG-l08-root探针已删除，不保留生产调试副作用。

最小实现仅区分LoadedConfigurationWitness的resetEpoch与记录追加revision：
每次准入扫描全部当前load-owned事实（也包括后来追加的事实），以本次扫描
revision和捕获的resetEpoch前后封锁；reset、unprovable、事实字节变化或
扫描中追加仍拒绝。没有缓存“已验证”、重stamp旧值、忽略新事实或增加
容量。独立根反例GREEN，联合原13 ready及登记18/18、退出0、
15137.142415ms。

接续首次GREEN的保留行为特征，不编造产品RED：

- 嵌套根父级确实依赖子级，覆盖4/2；子级未保存编辑撤销双方旧证明，
  再准备得到新代际，父/子调用均精确定位当前子级UTF-16声明。
  两个根案例联合2/2、2586.616839ms。
- A先READY、B后加载命名包配置；随后无通知retarget B入口，两根旧证明
  均不可用，证明旧predicate也检查后来追加的事实。通知清缓存后再准备
  READY，正常2322诊断和新入口精确位置保留；1/1、1240.694038ms。
- 真实物理Worker替换：线程ID不同、根epoch不同，L3确有context evict，
  旧ready/null-proof边界保留；两份最新v2 overlay重放后显式prepare才
  获得新ready，source/overlay/SDK/stdlib摘要一致，精确导航与v3普通
  2322诊断保留。只显式开启benchmark recycle并关闭cost-aware以资格
  控制，不改1024MiB或默认策略。1/1、1893.684489ms。

Worker测试先对fixture环境override合同RED：实际-32601，退出1、
1248.376494ms。最小支持可选env后GREEN；这是fixture未转交opt-in的
工具合同RED，不是生产recycle缺陷。原始输出
`.bench/l08-readiness-lifecycle-worker-override-red-v1-output.log`。
其它各次GREEN及fixture前后原始输出也分别保留同名前缀文件。

类型/构建/差异检查退出0，新源码input6d3568a5…、server3d9ca90d…、
semantic Worker968878fa…，完整身份
`.bench/l08-readiness-lifecycle-build-v1.json`。Node20.19.5联合16文件202/202
终态退出0、310688.594292ms，无fail/cancel/skip/todo；完整命令和stdout
`.bench/l08-readiness-lifecycle-node20-green-v1-output.log`。这包含全部原13
ready/新4生命周期、协议/取消/独立与嵌套根、真实Worker回收、包配置/
SDK/automatic-type/安装链接/negative presence保护，不是新的whole。

接续未知影响范围特征首次GREEN：无通知新增从未查询的Disconnected.ets
缺失必要导入，旧READY立即失效，显式prepare给该新文件真实2307。
仅以当前overlay修复并保留普通2322后，重新准备覆盖3文件而非原2。
再无通知删除原Unopened.ets，旧proof无效，prepare给Main的真实2307；
恢复实际依赖并通知后再准备，当前UTF-16定义和正常Main诊断精确。
准备前后均无目标预查询；不把“未知影响范围”只理解成当前查询文件。
固定Node20.19.5 name-filter单项1 PASS/4未运行、退出0、1539.900134ms；
不是5案例整组通过，也不编造该保留行为的产品RED。接续完整命令
`/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 tests/semantic/semantic-readiness-lifecycle.test.mjs tests/semantic/semantic-readiness.test.mjs tests/lsp-session.test.mjs tests/test-layer-manifest.test.mjs`
终态27/27、退出0、25994.531545ms，无fail/cancel/skip/todo，含全部18
ready/fixture/登记；完整输出
`.bench/l08-readiness-lifecycle-latest-public-green-v1-output.log`。
202组与27组重叠，不将相加当作独立案例数。新增生命周期现5案例、测试318行，
fixture64行、见证187行，均≤500；历史超限迁移债不变。
运行后全部18项输入/产物/SDK/固定Settings身份相同，Settings仍clean；
分类摘要`.bench/l08-readiness-lifecycle-regression-v1.json`保留
releaseEligible=false、新whole NOT_RUN。差异检查再次退出0，无临时
DEBUG-l08-root探针。未修改原SDK/Settings、预算、最终门槛或main。
benchmark真正消费合同继续推进，原Settings SDK缺口/
336格/500ms/资源/三平台门禁仍未完成，不合main。

## Benchmark根准备观察入口（尚未认证请求级就绪）

本轮按tdd/karpathy-guidelines实现公开CLI的根准备观察，diagnose只用于
外部采样权限排查；生产owner、标准能力、预算及默认策略未变。
父revision仍为顶部HEAD。先跑旧prepared CLI及登记基线，沙箱ps实际
EPERM导致首样本失败，原运行中断，不算产品RED或whole。排序并检验
采样权限/PID追踪/采样器启动三假设后，仅批准只读ps/RSS权限，同一
Node20.19.5命令28/28终态GREEN、19835.721833ms。
命令：`/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 tests/prepared-suite-cli.test.mjs tests/test-layer-manifest.test.mjs`。

新增`prepared-suite-semantic-readiness.test.mjs`登记bundle-e2e；179入口/
79 bundle/172 fast，其它层不变。单步公开RED/GREEN：

| 垂直切片 | 实际RED（总ms） | 最小GREEN |
| --- | --- | --- |
| observe | 5项4 PASS/1 FAIL，2490.608463；真实catalog完成却未请求Program准备 | 真实根stdio prepare，不带目标/位置；原proof/耗时/状态单列，5/5，2595.929704 |
| missing-proof | 2项1 PASS/1 FAIL，3392.557336；空proof伪READY被观察为READY | 完整capability/代际/input/coverage必要条件，2/2，3448.657838 |
| identity | 3项2 PASS/1 FAIL，4468.405245；首个malformed-options反例失败，后五变体未跑 | 所有摘要/计数、实际canonical root和当前compiler/package pins核对；六变体全过，3/3，8354.296077 |
| bucket-reason | 4项2 PASS/2 FAIL，10681.127959；真实READY/DEGRADED仍被分桶标为unsupported | 区分请求代际未认证/实际必要输入缺失，4/4，10595.301087 |

各RED原始命令/stdout保留`.bench/l08-prepared-ready-<名称>-red-v1-output.log`。
首项联合新file及登记，后续共同命令为Node20.19.5
`--test --test-concurrency=1 tests/prepared-suite-semantic-readiness.test.mjs`。
第四公开案例为首次GREEN特征：真实编译器缺依赖给2307/精确URI及
UTF-16位置、degraded/null proof，不能再硬编码unsupported。
不是额外编造的产品RED；另保留全部各次GREEN输出。

旧benchmark联合首轮68/71、退出1、103756.315373ms：仅三项真实L3/
Worker回收测试仍硬编码unsupported。保持原fixture、deadline、预算、
所有exact/诊断/驱逐/回收断言，改为实际DEGRADED/null generation/空cap
及sdk-coverage-unproven。元数据原本无path:ets；不补完整SDK冒作ready。
迁移时tiny-budget分支曾误预期resource-budget-exceeded，实际仍是SDK
原因，2/3失败输出保留；精确修正后3/3、15155.516141ms。
最终12文件联合71/71、退出0、103735.524788ms，零fail/cancel/skip/todo，
包括旧编辑即请求、超时分母、完整payload/handle、RSS、L3/回收、release
矩阵及登记。完整stdout`.bench/l08-prepared-ready-node20-green-v1-output.log`；
首轮失败及断言迁移记录均保留，不把新状态伪装为旧合同不变。

固定Settings/API24仅准备清单v1因残留查询前的pre-open诊断前提，预检
以PREOPEN_DIAGNOSTIC_BARRIER/exit2拒绝，未启动产品；保留原清单/输出。
v2仅去除这份零查询观察中的查询阶段屏障，不改原性能清单、目标池/
工程/SDK或阈值。Node20真实终态CLI1/raw FAIL、产品退出0，catalog1846
ready但semantic DEGRADED/dependency-inputs-incomplete；仍为
SettingsDataUtils.ts line26/character31的@ohos.data.DataShareResultSet
TS2307。实际零didOpen/目标请求，完整诊断transcript73条、dropped0；
sdk.selected日志确认实际配置路径、API24/6.1.1.125、metadata identified，
dialect仍unverified，不推导API23/DevEco成功。
catalog观察8542.170938ms、实际根prepare16464.335046ms、进程起点到
prepare终态25006.671283ms；time-to-ready为null而非25秒成功READY。
外部server+sidecar RSS峰值921141248bytes、195样本，实际采样P50/P95/
max129/139/151ms、sampler错误为空。Mac RSS只是下界且无Zed，不是PSS/
最终内存门禁。原始`.bench/l08-prepared-settings-ready-observation-v2.json`。

当前仅观察真实根准备；请求仍candidate-ready-control，READY观察也令
ready gate BLOCKED而非PASS。后续必须接完整请求级准入/首次未打开/
编辑/驱逐/重启计时，不能借根prepare为普通更新预热或隐藏恢复耗时。
新whole/336格/100请求×5会话/100循环/原资源/三平台仍未完成。
类型/构建/差异检查退出0；新脚本58行、runner412/report113、测试164/
fixture187/旧L3 173/回收98，均≤500，历史超限债未变。
源码input6d3568a5…/server3d9ca90d…/Worker968878fa…与上一生命周期
切片相同；benchmark已变化，不能重pin历史性能。18项产品/SDK/固定
工程及14份harness文件前后相同，输入证据
`.bench/l08-prepared-ready-inputs-v1.json`，本goal turn有实际进展，仍active。

## 静态快照请求准入与未打开查询反例

本轮继续tdd/karpathy-guidelines；diagnose用于实际公开空响应。生产源码、
SDK/Settings、预算、默认策略和标准能力声明均未变，父HEAD同顶部。
先在GREEN下使根观察显式传prepare=true/false；原公开基线8/8、
11192.824397ms，改名后8/8、10807.541447ms，均退出0。

静态准入实际RED：根READY但candidateControl=false仍执行0请求，
5项4 PASS/1 FAIL、退出1、12754.513106ms；最小接线后5/5、退出0、
12812.88003ms。仅在真实READY下运行该模式；显式preOpenTargetIds
先于初始prepare，不自动打开所有目标或预查答案。其它正常桶若查询
文件未在READY前打开，保持计划分母并BLOCKED，不偷偷didOpen。
candidateControl=true仍是旧对照，即使观察到READY也不认证其请求。

原完整计时保留；所有请求后只发prepare=false状态读取。当前仅在无
编辑/驱逐、原Program generation与input SHA不变时，认证请求为
semantic-ready-snapshot，记录originGeneration/originInputSha256。
这不是更新/恢复后的新代际证明。真实definition未查/重复两项exact、
前后完整报告全等、正常诊断/退出/pins有效；有限run ready PASS不代表
整个G-READY。trace-on两项仍latency BLOCKED，100请求/5会话原门槛不变。

首次未打开查询正向尝试保留为失败：首次6项5 PASS/1 FAIL、
14810.155957ms，被UNOPENED_QUERY_PATH_NOT_VERIFIED阻止。允许实际查询
并把诊断didOpen推迟到所有查询及只读验证后，仍6项5 PASS/1 FAIL、
15343.824707ms。public definition实际返回[]，manual oracle要求
Query.ets line0/character13–18；无extra/duplicate/invalid URI。初始与
末尾实际READY/Program/input proof全等，仍不能令错误结果合格。
最小单案例1 FAIL/5 name-filter未运行、2430.588805ms；完整差分
`.bench/l08-ready-requests-unopened-empty-response-v1-output.log`。

三假设排序是来源/范围、未打开文档空路径、/var URI别名。公开empty
payload及入口确认SemanticRequestRunner在documents.get缺失时以
document-unavailable返回fallback，未进入compiler。未改oracle为[]、
未在测量前didOpen目标或补假SDK。现有合同要求查询文件已打开，返回
结果可以属于未打开模块；已向用户确认最终桶是否还需直接查询未打开
文件，两种范围不可混称。目前后者仍为缺口，不能把分类GREEN说成修好。

负向验收保护保持expected Location，要求错误明确run/bucket ready FAIL
及EXACT_QUERY_FAILED，而不只记样本不足BLOCKED。真实分类RED为
0 PASS/1 FAIL/5未运行、2678.591575ms；最小修正后原CLI+新file30/30、
34769.116497ms，均有raw `.bench/l08-ready-exact-fail-gate-{red,green}-v1-output.log`。
该特征锁定现有缺口的失败分类，不证明磁盘查询已实现。若明确补齐范围，
应另做正向RED/GREEN并保留此代失败证据。

固定Node20.19.5最终12文件联合73/73、退出0、108437.057715ms，零
fail/cancel/skip/todo；完整命令与上一节71组相同，新file增加2案例。
raw `.bench/l08-ready-requests-snapshot-node20-green-v1-output.log`；
73与30/旧71重叠，不相加。pnpm check/diff check退出0，新whole NOT_RUN。
18项产品/SDK/固定工程与15份harness文件前后全等，Settings clean；
输入 `.bench/l08-ready-requests-snapshot-inputs-v1.json`，分类与后置身份
`.bench/l08-ready-requests-snapshot-regression-v1.json`，releaseEligible=false。
源码input6d3568a5…/server3d9ca90d…/Worker968878fa…仍是原构建，harness
独立冻结，不重pin旧性能。runner447/report119/observer58/测试238均≤500；
历史超限迁移债未变。最终矩阵入口尚未认证新样本，动态准入/336格/
资源/soak/三平台和真实SDK缺口仍未完成，目标active，未合main。

## 完整输入/覆盖证明一致性与普通正文编辑

本轮沿用tdd/karpathy-guidelines，父HEAD同顶部。旧harness15份实际
hash均与上代冻结一致，基线6/6、退出0、14995.089865ms；GREEN下抽取
已存在的reportedProof测试夹具后6/6、15242.288004ms。不是生产重构。

公开CLI边界故障注入分别真实RED：input proof的optionsSha改变，但
generation/总摘要不变，实际错误ready PASS，0 PASS/1 FAIL/6 name-filter
未运行、1092.806271ms。最小完整inputIdentity深比较后7/7、16121.238267ms。
接续Program coverage由3变4而整个input相同，再次错误PASS，0 PASS/
1 FAIL/7未运行、1271.237879ms；最小增加完整coverage比较后8/8、
17383.289804ms。这些是伪造/矛盾证明的CLI接收保护，不宣称实际官方
compiler产生这种错误，也不是producer加密认证。capability仍按完整集合
检查，不把无语义差异的数组顺序当作输入变化。
两代raw `.bench/l08-full-ready-proof-{input,coverage}-{red,green}-v1-output.log`。
fixture只为prepare=false支持独立边界响应，不改产品Wire/标准能力。

真实生产stdio正文特征：函数count的return 1→2仅未保存overlay改变，
首次/编辑后/重复三请求均exact，版本1/2/2、快照0/1/1；didChange之后
紧接request-start，不等诊断、不发重新prepare。只在末尾prepare=false
观察到DEGRADED/prepared-inputs-no-longer-current，空cap/null generation，
旧proof不认证这些样本，仍保留初始origin。正常最新诊断、干净磁盘、
退出及pins有效；此特征不证明更新后动态ready路径已补齐。
首次误写UNPREPARED预期而失败2693.457316ms，精确匹配既有公开状态
后1 PASS/8未运行、2689.770387ms；这是特征断言修正，不编造产品RED。
对应raw `.bench/l08-full-ready-proof-body-{first,green}-v1-output.log`。

当前全部新file/登记13/13、退出0、20099.574221ms，零fail/cancel/skip/todo；
命令Node20.19.5 `--test --test-concurrency=1 tests/prepared-suite-semantic-readiness.test.mjs tests/test-layer-manifest.test.mjs`，
raw `.bench/l08-full-ready-proof-focused-green-v1-output.log`。pnpm build与
diff check退出0。runner449/测试347/fixture190，均≤500；历史源迁移债不变。
下一步在不再修改执行输入下冻结所有repo字节、实际18项pins/产物及
179入口/172fast，运行新的Node20 `pnpm check:fast`，状态与终态证据以
`.bench/l08-readiness-whole-node20-v1-*`为准；启动前不宣称whole通过。
上代1516/73及本13不相加或替代当前whole。全部原产品门禁/真实SDK/
未打开查询范围缺口保留，默认不变，目标active，未合main。

接续这次冻结whole已取得真实终态：Node20.19.5 `pnpm check:fast` 根退出0，
1556/1556、零fail/cancel/skip/todo，测试duration2328656.379685ms。
1578 repo输入、18实际pins、179登记/172fast、5产物及18 harness身份前后
全部一致，Settings clean；没有借旧1516/73/13统计或重启正在跑的进程。
证据`.bench/l08-readiness-whole-node20-v1-{frozen-inputs,postflight-inputs,state,regression}.json`
及terminal.log/44段实际观察日志。一次40941-token输出超过当时24000返回
上限，明确保留截断；不称逐字完整stdout。根终态统计/退出未截断。
后置核验完成后才追加本段文档，不冒称记录追加后的全repo摘要仍等于冻结值。
当前只是本机构建完整fast回归PASS，原真实SDK/动态准入/336格/资源/
soak/三平台及API23/DevEco等最终门禁未完成；releaseEligible=false。
源码input6d3568a5…/server3d9ca90d…/Worker968878fa…仍与冻结一致，
无生产默认/预算或main变更；目标active，继续原全目标，不提前合main。

## 普通查询内的新快照认证与即时修复

父HEAD仍1b910152；沿用TDD/karpathy，标准LSP及root readiness wire不变。
正文return 1→2后不等诊断、不再prepare，立即definition精确后读取状态的
正例实际RED：旧proof得到degraded/prepared-inputs-no-longer-current，
退出1、1 fail/14名称过滤。旧characterization初次负向lookahead未排除
新例，实际19 pass/1 fail；改为旧例明确名单后19 pass/1过滤、退出0，
19492.771069ms。两条观察均不冒称全文件GREEN或新产品缺陷。

最小实现把再认证放在现有同步query lease内，完整响应返回前；仅显式
成功ready会话启用，普通后台diagnostics不认证，prepare=false仍只读。
完整Program/Checker、全部必要输入diagnostics、actual text/overlay/disk/
SDK/stdlib/config/覆盖与最终admission保护全部保留；不预查答案、不另建LS。
稀疏交互view沿用后端实际已加载membership事实，最后状态仍面对Store
新枚举的完整scope核验，不能以旧membership隐藏无通知新增模块。
原正文正例1 pass/14过滤、退出0；原ready/lifecycle加新例20/20 GREEN，
23731.397656ms后才抽取整个就绪观察生命周期到原readiness模块。
抽取后20/20、33786.191959ms；LS最终3378→3375，剩余超限债保留。

下一垂直反例新增实际缺失import时局部definition仍exact，但全工程正确
degraded/2307；修复后的立即query仍保留旧2307，真实RED退出1、1 fail/
15过滤、1160.493279ms。最小保留已显式ready会话的更新意图，完成的
degraded更新后可在后续query内重新完整核验；cancel/throw或生命周期
clear不保留假proof。原例GREEN退出0、1 pass/15过滤、2217.553654ms，
修复query完整响应117.081542ms仅fixture单样本，非正式SLO。

产品已经给新READY但benchmark仍BLOCKED的公开CLI正例实际RED，
退出1、1 fail/8过滤、3163.174776ms。最小消费者逐请求在完整响应后
读取prepare=false证明；静态快照要求完整input/coverage/generation一致，
编辑快照另核对实际发出的overlay字节和版本摘要，不能只换generation
标签。末尾再核验最后receipt，未知/矛盾/回收保持未认证；原查询计时
包含query内编译与认证，额外只读验证耗时单列，没有诊断屏障或再准备。
首轮已过产品ready断言但测试误读不保留params的诊断转录，TypeError
保留；修正为转录计数及timeline的prepare标志，不改变产品或断言范围。
联合34/34、退出0、47122.186885ms；三请求v1/v2/v2、快照0/1/1，
第二个proof变更、第三个与第二个全等，ready PASS仅这份fixture合同；
latency仍BLOCKED。旧完整input/coverage矛盾拒绝和未打开查询exact FAIL保留。

追加两个已有防线characterization：新标签但旧overlay证明仍未认证；
query再认证不能隐藏新建Disconnected.ets的真实缺失依赖。初次后者漏
导入fixture为ReferenceError，不算产品RED；修复测试导入后2 pass/
14名称过滤、退出0、2581.163847ms，未因此修改产品实现。
新trace-off/真实SDK/每能力全桶动态恢复仍需独立验收，不能把本段功能
正例称为所有G-READY或L08完成。

冻结当前source f8c2155a、server9510101a、worker60156e4e后，12入口
公开联合120/120、退出0、166913.905154ms、零fail/cancel/skip/todo；
含原冷查询4050.891627/3858.676507ms（原5秒不变）、旧能力、取消、
正常诊断、L2/压力保护及新proof消费。随后单独真实Settings/SDK开发
控制1 pass/1 fail、退出1、89903.683392ms：rename P95=244.256802ms
PASS，incoming P95=558.350474ms FAIL（十个样本均>500ms）。两项完整
exact/输入不变/产品退出0及incoming正常诊断通过；各10样本/1会话，
candidate-ready-control，不是正式ready/SLO。此前82e141f7的448ms PASS
不能替代本轮558ms失败，也不无依据归因给认证逻辑或宿主负载。

全repo/18 pins/179登记172fast/5产物/19 harness/Node/branch/main refs
11组前后完全相同；终态复核后才追加本文。原始三条RED、最小/抽取/
联合GREEN、harness失败及两项控制均在`.bench/l08-dynamic-ready-*`；
全样本/pins/分类见`.bench/l08-dynamic-ready-current-state-v1.json`。
源/测试/脚本均≤500，除已有LS3375迁移债；registry500不增长。
新whole NOT_RUN，36defd53e整轮1563/1565的两项失败仍保留。最终矩阵
入口目前仍统一BLOCKED，需另接真实receipt；直接未打开文件、真实SDK
必要输入、完整336格/资源/soak/平台等原缺口保持。下一步定位本构建
incoming真实时延失败；目标active，未提交/推送/经PR合main。

## 用户确认550ms：验收合同、目标统计与当前复核

2026-10-10 用户先允许约500ms，随后明确回复“550”。因此正式完整响应
P95上限改为550ms，500ms保留为优化目标；仅这一门槛调整，100请求/
5独立会话/336格、完整正确性、实际ready、资源/soak/平台等不变。
父revision仍`1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`，没有提交。
沿用TDD/karpathy最小切片，三条真实RED逐次修复，不重判历史产品数据：

1. Node20 `--test --test-name-pattern='user-approved 550' tests/semantic-release-matrix-cli.test.mjs`：
   合法550契约被旧规则报`L08_MATRIX_CONTRACT_DRIFT`，CLI2而非1，
   test退出1；最小配置及精确合同规则修改后完整6/6、退出0。
2. Node20 `--test --test-name-pattern='separates requests above' tests/semantic-release-matrix-cli.test.mjs`：
   525ms合成分类样本的above500被错误算0，实际RED退出1；拆分500
   目标与550上限统计后完整7/7、退出0，不把候选证据升级ready。
3. Node20 `--test --test-name-pattern='prepared controls use' tests/semantic-release-matrix-cli.test.mjs`：
   合成候选分布98×525ms+2×700ms的P95为525ms，却被旧500规则FAIL，
   实际RED退出1；最小消费者改用配置P95上限后8/8、退出0。
   max700/100次>500/2次>550原样保留。此处合成数据只验证工具分类，
   不是实际产品性能或足量独立会话。

三条RED与6/7/8项阶段GREEN输出分别归档
`.bench/l08-550-{contract,counters,prepared}-{red,green}-v1-output.log`。
新增现有防线特征：550接受，551拒绝；9样本BLOCKED、错误结果或
timeout FAIL，篡改551上限/600目标/平台/请求/会话/soak仍拒绝。
原trace-on归因、逐差分错误和NOT_RUN/候选不认证保护保持。
与全部8项真实stdio生命周期合同联合17/17、退出0、11352.500447ms，
含撤销父复用后仍通过的两条SDK路径负例。

同步ADR/产品契约/验收规范及L08计划后冻结当前输入：source1c9dfeca、
server9510101a、worker60156e4e，Node20.19.5；类型/build/diff通过。
完整14入口命令和实际pins在`.bench/l08-550-contract-v1-frozen-inputs.json`。
本切片新联合151/151、退出0、190838.547626ms、零fail/cancel/skip/todo，
stdout`.bench/l08-550-contract-focused-v1-output.log`。它不是whole。

之后独立命令Node20 `--test --test-concurrency=1 tests/release/resident-semantic-latency.acceptance.mjs`：
真实Settings/API24 trace-off控制1 pass/1 fail、退出1、90348.080371ms。
rename P95=234.683504ms PASS；incoming P95=596.390637ms FAIL，
其十个样本均>550ms。两项完整exact、输入不变、产品正常退出0及
incoming正常诊断已通过；每项10次/1会话candidate-ready-control，
正式latency仍BLOCKED，不能借新阈值认证旧558ms或当前少量样本。
原始全样本与身份见`.bench/l08-550-contract-latency-both-v1-output.log`。

1585 repo输入/18 pins/179登记172fast/5产物/19 harness/Node/branch/
main refs等11组终态全等，Settings仍clean；复核后才追加这段证据文档。
当前分类`.bench/l08-550-contract-v1-current-state.json`保留
releaseEligible=false和新whole NOT_RUN，36defd53e的1563/1565 FAIL
仍保留。工具source/test/script均≤500，已有LS3375迁移债不增长。
最终矩阵真实receipt、直接未打开文件、必要SDK、336格足量样本、
PSS/DevEco/soak/规模/平台仍需推进；本轮不再以重复控制偶然GREEN
覆盖596ms失败，未提交/推送/合main。
