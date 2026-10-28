# 30K三项缺陷：公开回归与实现收据

父提交 `17e923f0cb8c430b6a10793a0f3d2f9097febfec`，保留已有工作树；本轮起点4项产物SHA及757项输入在
`.bench/30k-three-fixes-20261027/baseline.json`。此前完整源码清单含根package/lock/tsconfig共760项，口径区别明确。
本轮维护者授权产品修复与验证，不授权自动合并/发布。ADR0025–0027继续Proposed，未虚构独立评审。

## M001：证明域与解析消费者

RED：`node --test --test-concurrency=1 tests/semantic/resolution-namespace-lifecycle.test.mjs`。
移动依赖、恢复并删目录后公开definition #4为-32803，原制品Worker `6c583128…efe3`；`m001-red.log`。
改动前26项包解析表征GREEN（`m001-characterization-before.log`），再提取resolver的缓存/证明所有权。
GREEN：域代次变化后旧Program不能获得新证明资格；同会话恢复精确URI/range，普通body编辑不退役解析代次。
未通知的package manifest切换one→two→one也返回对应当前声明。两新增＋包解析26＋读取窗口6，34/34通过，`m001-focused.log`。
真实30K仍需独立重验；小夹具不证明500ms或所有命名空间边界。

补充消费者RED：中间候选未通知target切换后仍返回TabletOnly（`m001-target-consumer-red.log`）。
仅刷新resolver/LS不足，旧DocumentStore closure/membership也消费了旧解析事实。
补绑定生产者代次和缓存代次，准备视图前协调该域；原子body save与普通body编辑均保留合法代次。
`m001-consumer-focused.log`20/20包含3个namespace公开用例和17个target/membership表征；
`candidate3-focused.log`16/16还包括独立Worker引用核验，跨Worker不比较本地Symbol代次。
中间typecheck漏传generation失败及补齐后的GREEN均保留，没有放宽读取/realpath上限。

## M002：同步至终态交付

RED：`node --test --test-concurrency=1 tests/semantic/synchronization-terminal-handoff.test.mjs`。
真实有限SDK图60节点，每次实际Host读取延迟40ms；早取消、原终态包延迟50ms，后继公开定义-32603，`m002-red.log`。
只读终态观测RED：丢失终态时缺少produced/sent边界，`m002-terminal-observation-red.log`。
GREEN：取消参考点在匹配同步活动后单调保留至父端合法终态；request/idle不能倒退，也不能续活动。
Worker记录终态产生/发送里程碑，父端收到/校验才结清。短交付窗口通过，永久丢失终态仍按原1000ms取消宽限退役并仅恢复一次。
原“持续检查点不能突破绝对执行截止”对照仍通过。注入仅在私有测试preloader，不改产品超时、SDK安装或取消cell。
原自然30K竞态的精确终态窗口未证明，不能由本回归追认其全部时序。

## M003：分类与实际策略一致

RED：`node --test --test-concurrency=1 tests/semantic/interactive-diagnostic-fairness.test.mjs`。
真实issued item详情仍等待其余诊断，公开结果正确但到达时B已发布，优先断言失败，`m003-red.log`。
GREEN：穷尽22种Worker方法，统一completion/interactive/diagnostic/global策略，列表与详情同优先。
同级FIFO、global屏障、队首仅一次绕过、mutation由supervisor先应用、原队列上限/取消合同不变。
公开对照覆盖详情、hover、signatureHelp、documentSymbol、documentHighlight、prepareCallHierarchy、outgoingCalls；全部诊断v1/2322保留。
另保留既有列表跨prefetch公平性、detached references；单位合同检查每个interactive实际可绕过诊断、所有global屏障及256步混合到达有界公平性。
矩阵首轮signature光标错误（位于左括号之前）是测试驱动问题，失败日志保留；改为由源码计算括号内位置，没有修改产品以适配错误输入。

## 检查与原始证据

新增4个test entry，manifest原未登记及分层数量断言RED，显式更新为261 entries；没有放宽断言。
探针/harness保留原6项oracle/隔离写入/背压表征，新增真实Worker/SAB只读观测先RED再GREEN。
原始失败、GREEN及中间驱动失败均在`.bench/30k-three-fixes-20261027/`，不覆盖前轮raw。

完整fast首轮在sandbox中出现`spawn EPERM`及采样超时，已记录`check-fast-candidate1.log`、
`check-fast-environment-stop.json`，只停止核对PID/启动时间的本轮测试树；该轮不是完整PASS。
第二轮在允许进程采样环境运行；因上述新target反例暴露中间候选不完整，核对所属PID后中断，exit143；
`check-fast-candidate2.log`与`check-fast-candidate2-stop.json`保留，不称完整PASS。最终候选须重跑。
455冷目录3秒门槛沿用此前授权，不扩大豁免。
真实30K单会话7200s尚未完成；不得用本文件的机制GREEN代替耐久验收。

第三轮candidate3完整fast确实发现3项root-dirty回归，不是环境失败：无关root闭包被全域代次清掉，
`m001-root-dirty-full-regression-red.log`3/3失败；`check-fast-candidate3-final.log`保留全量执行到中断的输出。
核对PID48180/start17:45:54，仅终止8个检查所属进程；`check-fast-candidate3-regression-stop.json`。
candidate4区分已知namespace退休与未知全域失效：范围外原始证明保留，解析值清理，Program epoch仍推进；
原3项缓存保留/alias/零snapshot I/O断言不变。未知或unprovable仍全域重建，不删除路径/新鲜度校验。
新增`tests/project-resolution-domain-lifetime.test.mjs`两项先GREEN表征，验证无关manifest在已知事件前后未通知变化仍被拒旧/重载。
`m001-scoped-proof-green.log`52/52，`candidate4-typecheck.log`通过；新entry登记RED→GREEN，262 entries、unit110。
此前candidate3校准只证明其本身，不代表candidate4耐久资格；须重新冻结产物并校准/完整检查。

## 测试驱动Node RSS临时豁免

2026-10-27T09:37:18.954426Z记录用户最新授权，仅取消本轮驱动Node RSS>2048MiB提前停测。
旧条件`calibration-candidate3`在2069.5MiB被外部保护停止，保留为失败结果，不是OOM；
旧产物同条件对照`calibration-baseline`90.125s完成（50动作107请求），两者都不构成耐久通过。
新驱动合同先RED（缺少policy export，`node-waiver-red.log`），再GREEN：
`node-waiver-green.log`9/9，证明旧条件仍触发、豁免仅跳过Node、native5120/tree6144仍触发。
环境变量`SOAK_IGNORE_NODE_RSS_GUARD=1`；原2048数值保留并显式标记waived，独立run tag及哈希。
产品策略、V8上限、超时和所有正确性断言未改；磁盘/整机/原生/进程树/无响应保护保持。

长测驱动额外收紧原场景oracle：原fileMove的rmdir失败被catch忽略，可能把保留目录误记删除覆盖。
`probe-delete-oracle-red.log`→`harness-qualification-contracts-green.log`，必须实际删除并记录路径；
非空/删除失败不伪装成功，不发额外目录watch事件改变原复现条件。该改动只在本轮`.bench`驱动，产品候选4不变。

## candidate5：不改变当前请求的新鲜度合同及派生结果来源

candidate4完整fast已跑完：2069 tests、2063 pass、6 fail、0 skip/cancel/todo，duration3015316ms。
`candidate4-issued-inputs-red.log`独立复现原6项；实际返回新package目标/详情，违背不变已准备输入应拒绝的原合同，
不把这些样本误写为已经证明旧URI/结果损坏。原6项断言保持不变。

一次prepare的布尔标记不足：incomingCalls先membershipFor，后prepare会丢掉重载事实。
`candidate5-admission-focused.log`5/9 GREEN、4 FAIL保留；改为整个Worker命令的admission范围，
嵌套保留/并发隔离/异常清理以`admission-scope-lifetime-red.log`→`admission-scope-lifetime-green.log`验证。
source create/delete在原mutation屏障协调解析事实；`candidate5-scoped-mutation-controls.log`52/52，原缓存/读取上限断言不改。
`candidate5-command-scope-focused.log`9/9包含原6项及M001三项，原错误合同与同会话恢复同时通过。
新M001未通知用例加上基线v1诊断完成前置条件，明确断言当前请求-32803、后继同版本/无watcher请求精确恢复，
修正中间用例未约束背景诊断且误要求静默重载的假设；没有删掉最终URI/成员断言或改原6项。

`completion-namespace-origin-red.log`另证明旧item能重新附新域详情；两种watched/unnotified回归绑定nonce/epoch后GREEN。
自动导入的preResolved还有父端绕过路径：`candidate5-artifact-lifetime-regressions.log`39/40、1 FAIL，
完整保留为额外消费入口遗漏，不能由成员详情的GREEN代替。
父端WeakMap receipt记录原root/config revision，所有缓存详情通过Worker小请求准入；namespace/期间mutation失配回原item，真实故障继续抛出。
`parent-cache-admission-red.log`→`parent-cache-admission-green.log`3/3覆盖400KB载荷不回传、期间mutation/失配、旧revision及错误不吞；
`candidate5-cached-authority-public.log`6/6包含真实5000-export自动导入预计算详情/编辑失效、两种旧item及M001三项。
新增receipt测试登记后264 entries、unit111/bundle135；最终完整检查和7200s必须对新候选重跑，不能复用candidate4结论。

candidate5完整fast：2075 tests、2074 pass、1 fail、0 skip/cancel/todo，3012048ms，exit1。
唯一失败为原有“同词法路径切换真实canonical owner时重建”表征；`candidate5-canonical-owner-red.log`独立RED。
已明确捕获的新物理owner本来就属于新输入，不能套用“不变准备输入”拒绝规则。
candidate6复用既有`typeContextResetReason`的canonical-owner-change判断，不增加路径相等规则，不放宽身份终检；
旧owner仍清算，只允许当前新owner重建。`candidate6-owner-and-namespace-controls.log`75/75及
`candidate6-unchanged-input-controls.log`9/9 GREEN，原unnotified同输入-32803合同和原owner断言均保持。
candidate5冻结产物/完整失败原样保留，candidate6须再次完整检查。

## candidate6最终检查与真实运行（跨日）

`pnpm check:fast`最终完整退出0，2075 tests/2075 pass/0 fail/cancelled/skipped/todo，3317590.785ms；日志`B/check-fast-candidate6-final.log`。
`ARKTS_REAL_SDK_PATH=... pnpm test:e2e:real-sdk`退出1，11项SDK功能通过，2项Settings驻留控制各180s超时取消；不记完整GREEN，不调整阈值。
`candidate6-pre-soak-integrity.json`核对774输入/87产物/原与隔离项目各30287文件无差异，SDK44894文件指纹另存。
16:11Z启动模式soak、7200s、单会话`functional-2h-candidate6-node-waived`；仅驱动NodeRSS原2048MiB保护按用户授权豁免，其他保护不变。最终结果待记录。

## M004：partial compiler fallback → overlay → save

父提交仍17e923f，产品父候选为冻结candidate6（两轮同动作212失败，原产物/工作树patch保留）。
单/多标签保存、瞬时create/delete、嵌套atomic-save均GREEN表征，未据此关闭真实失败。
`node --test --test-name-pattern='saving a promoted lazy source' tests/semantic/resolution-namespace-lifecycle.test.mjs`
在相同SDK/源码下complete GREEN，真实20001无关文件partial RED；同断言保存前返回最新行号，保存后-32803。
证据`promoted-lazy-source-save-current-range-red.log`1/2；新增source witness ownership协调后`...-green.log`2/2。
Helper只对当前overlay的已观察源事实做真实读取与物理边界核验，不改变SDK/config/负证明；原完整catalog token-read提取但行为不变。
追加未通知SDK变更负对照及相关读中竞态/overlay回归，最终全量与7200s尚待新候选。

## 候选7删除边界→候选8

保存回归GREEN后额外公开probe发现partial nested overlay的磁盘删除仍拒绝（原阈值/身份检查不变）。
正式`promoted-lazy-source-delete-candidate7-red.log`complete1通过/partial1失败，故候选7全量主动中断exit143，不计PASS。
候选8将source created/deleted namespace事件在mutation屏障显式推进消费者epoch，不以package witness是否失效为条件；普通body事件不推进。
扩展矩阵含保存当前行号、删除后virtual source、恢复磁盘、重复查询和SDK未知变更负对照。相关/最终全量另存候选8收据。

候选8相关全组79/79、0fail/cancel/skip/todo，59.339s；build/typecheck通过；新完整fast以`check-fast-candidate8-final.log`记录。
源文件775项/冻结87产物见`candidate8-identity.json`，没有用候选6通过或候选7中断冒充最终通过。

## 候选8全量11项失败→候选9

完整2081/2070pass/11fail，SDK3项因counter唯一Host读点定位在新helper字符串上冲突、模块注入先抛异常；实际bare Worker错误另存。
删除8项定义结果正确，但过早按resolution epoch退役遮住原content-revision-change；保留原断言，改统一决策顺序。
`candidate8-sdk-and-deletion-full-regression-red.log`为原11项RED；候选9收敛fixture到真实compilerScriptSnapshot函数、标准reset判定优先，
`candidate9-sdk-and-deletion-full-regression-green.log`11/11GREEN，含96 SDK声明0重读及每项2次独立身份检查。
TypeEngine498，旧SDK SourceFile/Host文本复用断言均不弱化；仍待新完整fast和7200s。

随后`candidate9-related-and-full-regression-controls.log`128/128、0fail/cancel/skip/todo，146.534s。
775项输入/87份冻结产物见`candidate9-identity.json`，完整工作树差异含新增文件保留。
最终完整`pnpm check:fast`正在以`check-fast-candidate9-final.log`独立执行；尚不宣称其通过或两小时完成。

## 候选9完整检查的首次查询前置条件歧义

候选9出现`creating a previously absent package owner`原断言失败；原用例独立串行1过/1败，
`candidate9-absent-owner-repeat-2.log`和只读封存`absent-owner-diagnostic`保留失败，未删日志。
精确结果与fresh进程相同；19:06:36.843Z旧context1退役，36.866Z新context2创建，
37.018Z新Program完成完整引用，37.046Z第二次查询合法命中context2。不是旧owner命中或已证错误结果。
原断言把第一次未知输入拒绝与随后重建后复用混成一个阶段；不能通过禁止合法复用来使它GREEN。

候选10只修正测试前置条件：两种includeDeclaration各用独立会话，先等实际打开文档的基线诊断完成，
再warm、无通知创建manifest、只查第一次引用；保留原no-resident-hit及fresh完整结果相等断言。
新增`results.length===1`防止驱动暗中执行第二次已恢复查询；未加sleep或改任何产品/限额。
`absent-owner-first-query-qualification-red.log`在原helper上实际2/期望1 RED，helper支持限定查询后
`...-green.log`GREEN；完整相关文件正在另跑。测试489→493行，helper171→174行。
候选9完整检查停止exit143，9个自身进程核验后SIGTERM且无残留，收据`candidate9-check-stopped-for-cold-query-qualification.json`；
未执行尾部不算验证，不以局部GREEN冒充最终完整通过。

候选10整份引用文件24/24 GREEN，103.970s。随后独立完整`pnpm check:fast`退出0，
2081 tests/2081 pass/0fail/cancelled/skipped/todo，3132348.135ms。
`candidate10-fast-final-receipt.json`核对775输入/87冻结产物及当前dist零差异；7200s和真实SDK层仍独立验收。

## 候选10耐久M005：关闭依赖后跳转拒绝

普通候选10第212动作已精确通过，255动作/1236请求后-32803，正式7200s未完成。
原始证据`functional-2h-candidate10-node-waived/anomalies/A001`保留，不以2081/2081冒充耐久绿色。
简单关闭overlay/恢复磁盘的complete/partial两格均通过，文件名`closed-overlay-source-proof-candidate10-red.log`
是首次尝试命名，内容实际2GREEN，**不是已找到失败回归**；追加显式resident0/1四格仍4GREEN。
`closed-overlay-resident-matrix-candidate10-red.log`亦按实际4GREEN表征记录，不伪造RED；产品尚未修改。
独立只读日志前缀`diagnostic-candidate10-255-prefix`在相同普通序列取证，诊断产物哈希另存；不算正式耐久。
事后审计工具4项从not-implemented RED到GREEN，CLI对原候选6的已知失败正确退出1。

独立日志产物同255/1236、版本183/revision2885再失败942.734ms，证明ScreenManager.ts旧17243字节fact而当前17200字节，
LS.define compiler调用前核验；不是容量或队列。`candidate10-m005-proof-root-cause.json`保留栈及两次计时差异。
最小例需先以import-type留下fallback事实、再ordinary-import使其成为已准入磁盘snapshot；直接ordinary-import亦四格GREEN。
`closed-fallback-admission-resident-matrix-candidate10-red.log`3/4 GREEN，partial/default resident1 RED。
候选11把脚本安装协调覆盖overlay与已准入disk，后者真实稳定读须逐字等于snapshot，保留全部physical/SDK/最终fence。
`...candidate11-green.log`4/4，新增健康context不重建、未知SDK变更仍拒绝断言均通过。
`candidate11-source-authority-regressions.log`82/82、0fail/cancel/skip/todo，83.009s，含原读中竞态、SDK共享与跨root原断言。
冻结775输入/87产物，Worker77d31829…36377f0；当前完整`check-fast-candidate11-final.log`，预计2085 tests。

候选11完整fast实际退出0，2085 tests/2085 pass/0fail/cancelled/skipped/todo，3122831.819ms。
检查后775输入/87产物及dist均零差异，收据`candidate11-fast-final-receipt.json`；SDK层和新7200s继续独立验证。

真实SDK最终13项11pass/2既有Settings180s控制取消，exit1，不算整个测试层通过；未改其限制。
校准94.559s/50动作/107请求、1Worker/0恢复、exit0，Node峰2312.2MiB按授权豁免Node项继续，其他保护不变。
实际30K同SDK/默认配置快速对照：有效fallback primer后，旧candidate10关闭后952.456ms -32803，
candidate11精确返回，分别13.355/13.236s流程，`closed-authority-...-named-export`原始记录保留。
辅助脚本此前.default具名导出写错的三份primer失败另存`closed-authority-invalid-primer-attempts.json`，不是产品RED。
新7200s正式`functional-2h-candidate11-node-waived`已启动，禁止累计前述失败/短对照时间；最终结果仍待实际完成。

## candidate11最终两小时与独立审计收据

2026-10-28完成：mixed单调7204.609272s，1197动作/5681操作RPC，1Worker、0恢复/运行期退役。
原M001移动恢复实际rmdir37次，原M004动作212精确75.369ms、M005动作255精确1005.862ms；不算后者达到500ms。
304份详情全enriched，57次最新版本2322加入/清除通过。请求唯一终态与进度end、关闭/完整输入恢复独立审计passed。
审计工具新增“异步意外RPC错误必须失败，partial全范围错误单列而非成功”两项RED→GREEN，
`B/audit-error-classification-red.log`、`...-green.log`6/6；原失败candidate6 CLI负对照仍失败。
`B/candidate11-endurance-audit.json`、`...-summary.json`及`...-final-derived-evidence.json`保存最终证据。
775输入/87产物自最终fast未改，原/隔离各30287及SDK44894零差异；shutdown exit0、owned PID精确身份无残留。
37完整范围不可用（20引用、17rename）不记功能成功，170取消及80输入更新单列；原自然M002精确窗口仍未闭环。
SDK两180s控制取消及1981份成功操作>500ms保留；最终报告[此处](../reports/2026-10-28-three-soak-defects-final-verification.md)。
没有复用短校准/失败轮凑7200s，没有真实UI或Windows本轮验收，没有安装/提交/合并/发布。
