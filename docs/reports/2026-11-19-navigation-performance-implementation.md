# 30K导航性能实施记录：M0与M1在途

状态：IN_PROGRESS，总目标未完成，不合并/发布/部署。
用户已授权按[执行方案](../plans/2026-11-18-navigation-performance-implementation-plan.md)实施A路线；B一致性变更未采用。
源码工作树`/private/tmp/arkts-repeat-query-20261117`，父main1e3886df3c4d27755a53c073462f1456b0a3de7e。
证据I：主仓库`.bench/repeated-query-proof-plan-20261117/implementation-20261118/`。
Node20.19.5/x64、compiler4.9.5-r10，原Photos隔离30K/SDK24项目20partial、暖闭库56缓存保持。
M0前30000源码/3955 SDK身份快照与之前逐字节一致，Native800e6628/基线Worker5b638a7b。
主工作区既有改动及日常Zed、真实项目和真实缓存未改。开始时可用磁盘约33GiB，原磁盘保护保留。

## M0：已校准并实际运行

外置m0-observer.cjs只在内存中注入现有bundle，产品产物未修改。
公开stdio校准1/1PASS：精确typeDefinition、同Worker、保留原两次最终成员观察、版本早退及非负self区间。
最初一次路径错误未启动校准，m0-calibration.log保留；不算产品RED。实际校准见m0-calibration-retry.log。

普通/诊断严格串行，源码和SDK相同。新普通会话比昨日慢，不能套用昨日87/9.2/3.6秒作为当天配对基线。

| 会话 | 初始化ms | 首次ms | 三次热查询ms | 整轮结果 |
| --- | ---: | ---: | --- | --- |
| m0-ordinary，5b638a7b | 124080 | 11328.34 | 4566.52 / 4964.42 / 4895.23 | FAIL：原SQLite60s后检超时；查询精确、进程关闭 |
| m0-diagnostic，同产物加探针 | 129143 | 11655.80 | 5143.05 / 5459.53 / 5301.40 | 精确结果/Native/SQLite/关闭PASS；SDK仍partial |

诊断初始化额外约5.06秒，热查询也受探针影响；不能把诊断时长作为普通分布。
M0 timing-tree保存每函数inclusive、自身扣除子调用self及未覆盖的envelope余额，不相加包含区间。

诊断初始化Worker命令128357.65ms：initial.contexts118266.8ms包含scopes.ensure110659.1ms；
后者含角色parse46981.7ms（29995次）、graph.update48289.3ms及约15388ms其他ensure路径。
图内bindings.resolve43716.7ms（151631调用）不能再加到48289.3ms；role.fromAST23557.3ms又包含在parse中。
这些是本次诊断值，不是普通124080ms的精确占比。其余未覆盖envelope约8557ms仍待进一步拆分。

首次groups.discover3395.8ms，groups.select7547.6ms包含scope.project4151.1ms和groups.all；
project包含ensure2219.7ms和roots1696.0ms，roots包含independentGlobals887.0ms等。
热查询的4次编译同步入口全部版本早退，无新Program观察；组发现已命中缓存。
实际观测Program1为369个SourceFile，前缀分类0项目/256SDK/113其他；
Program2为482个SourceFile，87项目/282SDK/113其他，热请求复用同对象。
这不是3955个SDK快照全部被解析，也不是29995个成员全部进入Program；other113尚未进一步分类。
createSourceFile计数包含角色解析的临时AST，不可当作Program新增文件数。

热witness.raw调用约query79057/final273270，但configuration.identity约28389/28482：
重复消费者扫描与实际观察复用同时存在。project域lstat分别prepare30772/query56142/final117380，
三者为本次API计数，含目录/配置等，不等同于29995×3的成员叶子数。
新M0结果见m0-timing-tree.json；历史89985/56964仍独立保留，不混成同次测量。

## M1-a：组发现的重复词法归一化

公开RED：`node --test tests/semantic/navigation-group-membership-reuse.test.mjs`，三个组/400共享成员，
首次归一化1200次，精确位置正确、1200叶子检查；m1-group-red.log。
最小实现仅在discover里每member/root归一化一次，保留原始输出路径/顺序、边界分隔符、全局声明和闭包。
不改变物理准入、SDK/配置、磁盘权威及终检；不引入跨请求目录有效性缓存。
GREEN400次、同1200叶子检查，聚焦3/3；扩大31/31，0skip/cancel。
父1e的containment characterization2/2PASS，新候选也PASS：重叠、前缀邻居、循环、大小写及外部声明。
最初characterization追加到了隔离基线测试文件，已仅移除本轮追加并恢复该文件到HEAD，
将用例放回候选并重跑；m1-group-parent-characterization-retry.log才是实际2例收据。

独立冻结M1-a Worker0009139aae7d5d947fd5425e73e2009fa32d426135eb2b16c2c88f61d3ddfd77。
普通30K m1-group-ordinary：初始化178573ms、首次14374.57ms、热5588.26/5479.23/5286.12ms，
精确结果，但SQLite原60秒后检FAIL，**没有证明时延改善**。不能以次数变少把它改为通过。

随后未改5b638a7b控制m0-control-after-group：初始化在180秒产品截止失败，
定义在恢复Worker又触发30秒截止，公开-32603 Semantic worker unavailable。
server日志execution-deadline、terminate-called及exit1证明主动监督退役，未见OOM证据；
采样拥有进程均CLOSED。该控制证明M1-a不是此失败的必要条件，不足以排除候选的独立性能问题。
只读pmset显示CPU scheduler/speed limit100，无温控警告；内存压力记录free46–60%，
尚未证实全部波动原因。停止无意义地重跑相同长初始化，转向已测准备成本与有效回归。

## M1-b：保留角色目录，终检不变

公开RED：同文件第二例，热查询roleCatalogChanges1而期望0，graph无重建、2800原叶子检查；
m1-roles-red.log，1PASS/1FAIL，父候选为M1-a而非原main。
ProjectOperationScopes保留只读角色Map，仅在角色摘要/成员真变更时替换，普通内容版本仍推进。
rolesDirty在修改facts前置位且跨取消保留，避免半途更新后下一轮复用旧Map；
ScopeDependencyGraph仅对同一不可变目录省掉逐项比较，currentNodes和全部磁盘/最终proof照常执行。

m1-roles-green.log23/23PASS；新增公开实取消窗口在facts.set之后、Map发布之前暂停，
实际发送$/cancelRequest并观察共享cell取消成功，恢复后精确定位刚从普通module变为global的文件，
仍同Worker，m1-roles-cancellation.log3/3PASS。未用强制重启掩盖恢复。
M1-b新普通30K及最终完整检查仍未执行，不能用M1-a或旧main收据覆盖。

## M1-c：按当前源事实拥有的纯角色摘要共享

公开RED为m1-role-content-red.log：初始化400份相同原文做400次角色解析，期望1；其余3例PASS。
父版本是已含M1-a/b的未提交候选，不冒称main原版RED。
SourceRolePool归ProjectOperationScopes的不可变语法配置域所有，使用实际已读取文本SHA256和保守文件后缀模式键。
只共享冻结的角色/全局名/导出/原始模块请求摘要，不持有文本、AST、SourceFile、物理证明或解析后的绑定。
每个文件仍独立权威读取、核验路径、依其所在目录绑定相对请求；没有借内容哈希认证磁盘输入。

SourceFact保存roleKey，每次替换先acquire、提交fact后release旧键；删除成员release，最后引用释放即删除摘要。
取消前已经提交的事实仍持有自己的租约；取消恢复原回归保持。owner退休由原owner释放整棵引用，不新增全局历史表。
同内容但.d.ts/.ts/.ets/.d.ets/大小写及JS模式不同不共用；不同配置owner隔离。
SHA256内容键沿用项目已有内容摘要假设，不是新的绝对无碰撞承诺。

公开GREEN初始化400→1，并保持精确跳转/原物理检查；不同目录同语法相对绑定、依赖编辑/撤销各自精确；实取消恢复PASS。
m1-role-content-expanded.log总33/33PASS、零跳过/取消；含3个摘要生命周期/模式隔离单测及公开LSP相关回归。
Node20 TSC与runtime build PASS。test manifest现352文件、unit146，bundle183；完整门禁尚未执行。
冻结Worker dcbaf637bcc0bce15a1163d4bdd875ee70ae7980ad36aeb735d0bdac9ac38fd8，
runtime-m1-role-pool-identity.json含源码及全部产物hash。
普通m1-role-pool-ordinary：init85099ms、first7581.64ms、hot3397.84/3415.99/3802.18ms，精确结果；
Native30000/30000 ready、单Worker、Node峰1782.79MiB/native139.91MiB/tree1909.70MiB。
**整轮仍FAIL**：catalog数据DB的原SQLite60s完整性后检ETIMEDOUT，control DB PASS，所有采样owned进程CLOSED。
没有OOM/执行截止证据；不把后检超时称为DB损坏，也不省略后检宣称通过。
随后启动相同SDK/输入/缓存的未改5b控制m1-role-pool-control，串行且保留原全部deadline。
旧5b控制已完成：init79624ms、first8371.85ms、hot3378.74/3409.53/3845.04ms，
精确结果、Native ready、SQLite数据DB38.071s/control DB PASS、owned进程CLOSED。
这组对照没有证明候选整体提速：候选初始化慢5475ms、首次快790ms，热中位基本持平。
不能用昨日/更早124秒代替该79.62秒控制来宣布初始化提升。原始失败与波动全部保留。
同一冻结候选第二会话m1-role-pool-ordinary-b完成：init73013ms、first6544.41ms、
hot3407.11/3408.75/3750.07ms，精确结果、Native ready、SQLite数据DB26.535s/control PASS、owned进程CLOSED。
Node峰2055.55MiB/native140.15MiB/tree2195.70MiB；Node是进程RSS，含Worker线程且只计一次。
候选两会话init均值79056ms，与单控制79624ms接近，现不足以证明冷准备显著提速；
首次均值7063ms低于单控制8372ms，但只有单控制且混合M1切片，不能单独归功于角色池。
热中位两会话3416/3409ms，对照3410ms，基本持平。继续定位初始化/热态主成本，不称目标完成。
新外置M0观察器在当前候选上公开校准1/1PASS，原两次最终成员观察/版本早退仍在；
m1-role-pool-diagnostic独立运行以核实实际30K角色解析减少及剩余成本，不混入普通时延分布。
若没有实质收益应撤回无益复杂度；保留回归和失败证据。

## M1-d/e：纯组目录交接及活文档生命周期收据

M1-c独立诊断已结束：精确查询/Native/SQLite/关闭PASS，SDK仍partial；init78075ms、first7113ms，
热4007/4334/4176ms含探针扰动。原始spans与计数汇总为m1-role-pool-diagnostic-stage-summary.json。
实际初始角色解析19771次（原M0为29995），约21967ms；graph.update32250ms包含bindings.resolve28453ms/151631次。
冷图调用数未减少；不同时间环境下的诊断时长不能直接相减当产品收益。
热仍query witness79057次、final273270次；Program同步早退，主要瓶颈仍在证明与终检，未声称解决。

纯组交接公开RED：初始化没有discover（0而期望1），m1-handoff-red.log 5PASS/1FAIL。
成功preparePartialWorkspace之后构建纯组目录，既有graph/membership键保持；不建立不完整SDK的项目Program，
不新增ready能力。m1-handoff-green.log13/13PASS；多组归一化跨初始化/查询总共400次，首次不重复discover。
这是工作交接，不能仅凭first减少宣称init+first总量下降。

overlay RED：无输入变化，400成员的两次最终组合仍调用800次overlayFor；m1-overlay-red.log5PASS/1FAIL。
Store的OverlayDocumentMap在所有set/delete/clear路径维护仅活文档的生命周期标识，含restore/rollback/dispose；
磁盘缓存写入/淘汰不伪装成活文档变化，关闭重开同数字版本不会使旧收据复活。
成功ensure从开始到结束确认未变，才让生成的scope捕获该收据；它只能省去活文档查询，
成员、磁盘字节、路径、配置和所有终检证明仍按原合同执行。
收据失效或旧适配器没有该可选端口时保留原逐成员overlay检查，不把全局epoch作为磁盘权威。
不保存第二份文本或overlay列表；DocumentStore原所有缓存事务通过该Map结清生命周期。

父行为characterization19/19PASS；公开GREEN6/6。
m1-overlay-expanded.log99/99PASS、零跳过/取消：公开导航/关闭重开、disk/overlay版本、组交付、
实取消恢复、配置/SDK漂移、叶子晚变更及生命周期/模式单测；原2800叶子检查仍在。
手写新增文件均小于500行；原超限document-store.ts净减少2行，仍为待迁移债务。
manifest353文件，unit147/bundle183；本候选完整check:fast及真实30K最终验收仍未完成。

## M1最终普通对照及M2首片在途

59bf05c03680c86f11ba27527ac07eea4c63c6ba1cf5a3dad5b79f0b8bd01de8冻结M1候选的两会话、
对应5b控制两会话，原30K/相同SDK/暖56索引/串行协议，m1-final-ordinary-summary.json保存全部逐次数据。
候选init87905/72389ms，first5994.52/5723.51ms；hot3203.86/3206.72/3186.19及3265.93/3216.24/3208.53ms。
控制init79624/79187ms，first8371.85/8369.43ms；hot3378.74/3409.53/3845.04及3415.47/3433.23/3735.53ms。
四轮精确结果、Native30000/30000、SQLite及owned进程关闭通过，但SDK仍partial，完整能力资格未证明。
本组首次/热态降低，初始化中位相近且候选波动较大；不能宣称冷准备解决或500ms达标。
此前SQLite超时/180s准备失败全部保持历史失败，不能用这四轮覆盖。

M2公开RED为m2-native-configuration-sharing-red.log：400个成员，prepare400/query800/final1600。
将成功Native成员观察补齐实际mode字段，带producer owner/epoch/revision及物理父目录资格；
配置验证可单次消费同阶段成功收据，替代自己的第一个stamp，仍读取后一个raw叶子。
字段不足、弱ID、不匹配目录/owner/版本、失败/取消或预算不足一律回原始观察；
真正字节读取、descriptor/realpath读窗和独立final不共享，仍保留所有最终观察。
共享仅在已验证Native owner登记成功后允许，不能从尚在构建的pending项取得权威。

首轮GREEN明确暴露7个旧断言需处理（m2-native-sharing-green.log保留）：
一个仍按6次总调用断言；六个只在“第二次新调用”注入漂移，借用后该调用没有发生。
不是删掉漂移覆盖：旧六字段测试显式消费可选收据，继续验证完整两raw回退；
新六字段测试在借用后的唯一raw观察注入漂移，全部拒绝。
总计数改为prepare1+query1+final3=5，final明确仍3，避免用较松下限掩盖少检。
公开400源GREEN为prepare400/query400/final1600，共2400，最终次数没有减少。
m2-native-sharing-green-retry.log38/38PASS；专门资格/失败/取消/六字段与旧回归合计51/51PASS。
测试fixture抽为support/membership-validation-fixture.mjs由两套回归复用，旧文件缩至500行以内。
m2-native-sharing-expanded.log117/117PASS、零跳过/取消；TSC/final build PASS。
冻结M2 Worker be4a442c82671e17784aae0de723d3879dde990028759af40c3d6b109e8942d6，
runtime-m2-observations-identity.json记录源码/产物，普通m2-observations-ordinary已结束：
init72605ms、first5604.23ms、hot3171.27/3145.88/3508.87ms，精确结果/Native/SQLite/owned进程关闭PASS。
此为单会话；不把相邻M1/旧控制差异全部归因M2，最终阶段和大部分热耗时仍在。
M3未实施，不从这片推导少一次最终Native扫描，也不把本117项收据称全量check:fast。

M2后续必须区分validation与真实load-window消费者：observeResolutionPath调用同一个辅助函数，
仍需要自己的实际load前后新观察。当前共享仅替代函数内第一个stamp，函数末尾raw观察仍在，
不把旧Native观察直接当作真实load前的新观察，更不能机械去掉剩余raw调用。
M3前须显式建模最终leaf/composite及依赖顺序；未知回调/会增加事实的验证保留原路径。
不能仅给finalizing开启全局memo：晚变更和新read-set必须继续拒绝，取消不得发布条件性成功。

## M2-b及M3最终消费关系

详见[顺序与反例报告](2026-11-19-final-membership-observation-order.md)。
M2-b事实比较重复1200→0，最终raw叶子不减；124/124PASS，普通匹配热中位3183→2998ms（单会话/版）。
M3仅对必须消费者保持原位置的完整成员观察省掉顶层重复，原owner+epoch/revision义务不允许换代认证。
公开最终Native2→1，prepare400/query400/final1200；配置final800仍在。
扩大142/142与另组命名空间46/46PASS，零跳过；四个公开真实fs竞态各自命中预期拒绝/恢复分支。
本片新30K冻结84346e9已完成串行普通控制/候选/独立诊断，三轮精确/Native/SQLite/关闭PASS。
普通控制热中位3043.96ms，M3候选2716.52ms（约10.76%）；首次5800.39→5235.83，初始化74688→73689。
单组不能宣称初始化改善或500ms；SDKpartial/完整能力限制保持，M4/5及完整验收仍开放。

## 后续与未完成

M1已实现纯组交接和overlay生命周期快路，但仍需当前冻结产物普通30K对照及完整验收；
M2已实现部分typed facts/同阶段共享，M3最终核验消费顺序已实现并有30K对照；
M4源码派生边界正在验收，真正图增量及M5不确定性恢复尚未完成。
初始化角色提取和binding是实测主要成本，不以热态Map复用替代对它们的处理。
当前严格磁盘新鲜度合同没有调整，SDKpartial/真实Photos完整引用重命名缺口保持。
本轮新全量check:fast、Windows真机/UI及正式耐久未完成；500ms不是硬停线。

## M4-a1：实际读取来源的 mode 资格

为后续纯路径边界派生先补齐实际 descriptor 来源，不从五字段 admission token 推造 mode。
公开 stdio RED 通过受控 fstat 元数据漂移暴露原先仍能完成准备；
GREEN 在实际读取窗口拒绝不一致 mode，同会话重试读取后精确跳转、Worker 不换代、关闭正常。
这是受控故障，不是 Windows 现场复现。readDiskSource 原字节/descriptor/realpath 检查保留；
仅 qualified regular read 输出 actual mode，legacy/unpinned 不伪造。admitted snapshot 原样传递。
证据 I/m4-source-origin-mode-{red,green,expanded}.log；扩大41/41 PASS，TSC/build PASS。
此片只补证据生产者，尚未减少边界探测，不宣称性能收益；M4派生/增量图仍开放。

## M4-a2：原始读取身份驱动的纯边界分类

先用既有分类器固定实际文件、缺失overlay、SDK/工作区窄根、别名与逃逸的输出，
再抽取 relativeModuleBoundaryFromPhysical；该函数不取当前FS、不认证新鲜度。
characterization首次因测试夹具误把 /var lexical root 当 physical root 失败，修正夹具后4/4；
该次失败不是产品RED，原日志 m4-boundary-characterization.log 保留。
真正公开RED见 m4-boundary-origin-red.log：已实际读取的源码仍有1次额外边界realpath。
SourceFact保留 actual Snapshot 的强六字段与物理来源，不保留正文/AST；
物理根与原mapping一致才消费，原六字段通过 LoadedConfigurationWitness 在query/final继续检查。
未知/legacy/mode缺失、overlay和外部SDK继续原路径。原成员/root/config及目标/负候选见证保留。
27/27聚焦回归PASS（m4-boundary-origin-green.log），原公开重复边界realpath1→0；
新增只读来源单测证明同文本inode替换、mode变化不能把原事实重盖为当前。
扩大命名空间/取消回归及普通30K对照尚在进行，不能从调用数直接断言速度收益。

Node API资料先调用Context7 resolve(Node.js)，传输失败，未取得library ID或query结果；
回退固定 [Node20.19.5 FS文档](https://nodejs.org/download/release/v20.19.5/docs/api/fs.html)
和 [Node20.19.5内置libuv Windows fs源码](https://github.com/nodejs/node/blob/v20.19.5/deps/uv/src/win/fs.c)。
Windows普通文件mode由fs__stat_handle从file info生成；这不等于本片已经Windows实机验证。

M4-a最终身份fb37ca85已完成串行30K控制/普通/独立诊断，三轮精确/Native/SQLite/关闭PASS。
普通init74285→69979ms，first5243→5358，hot中位2716→2697；一组不宣称稳定冷收益。
完整来源、包含区间/计数口径、资源及未完成项见
[源码来源与纯边界报告](2026-11-19-source-read-origin-and-derived-boundaries.md)。
