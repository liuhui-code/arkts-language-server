# 完整检查发现的引用路由与恢复后诊断缺口

状态：隔离候选已修正并取得定向回归；当前完整检查、规模及新30K长测尚未完成。
这是 ADR0043/0044 后继候选的必要正确性修复，不扩展无关缓存优化。

## 身份与证据

实现工作树 `/private/tmp/arkts-index-versioned-maintenance-20261104`，父提交
`298d65f5d7f796c347fe8be5c739e428066489d8`，未提交候选。
Node20.19.5；小型 LSP 夹具采用本地 conformance SDK 或人工 SDK；不是 Photos/Windows/UI。
源码与四项运行产物 SHA256 见
`.bench/index-versioned-maintenance-20261104/namespace-final-20261109/route-and-recovery-current-receipt.json`。
以下文件均相对于该 namespace-final 证据目录。

完整 IX12 收据为上一级 `ix12-managed-peer-final-checks.json`：Rust425通过、1既有ignored；
release/fmt/strict Clippy/相关实验检查通过。随后 check:fast 在生产 Worker 文件中出现六项失败，
并遗留自己的测试进程等待，受控停止；**不是完整检查通过**。保留原日志及冻结2420份输入。
后继只修引用路由后，原生产文件实测6通过/1失败并正常退出，未再次复现同一进程等待。
此前等待是否由失败清理顺序造成尚未证实，没有据此改产品资源清理。

## IDX-V1-REF-ROUTE-001：索引变脏被误当成必须使用全局语义路径

调用链：`ReferenceNamespaceAdmission.read` 首次观察当前源码集合 → 更新引用输入证明、
将 Native 候选索引标脏并安排对账 → `SemanticWorkerEngine.references` 选择策略 →
`runWorkerReferenceQuery` / Worker 执行。

原 `forceLegacy = indexDirty || overlayOnly` 把两种含义混在一起：候选索引暂不可用，
以及存在尚无磁盘身份的纯内存源码。前者不需要回退全局 Program；已有分批路径可以
在当前完整源码集合上不使用索引种子地验证。

`occupancy-wire-01/fixture/audit-worker.ndjson` 记录实际 `overlayOnly:false` 却
`forceLegacy:true`。公开引用返回精确6个位置约85.9ms，但实际分批验证任务峰值0；
这不是引用提前报错或采样漏报。复制产物对照中，明确固定 Native 的路由修改用例通过；
首次缺 Native 的实验保留但不当作有效单变量对照。

修复仅移除 `indexDirty` 对语义策略的强制回退；纯内存新增文件仍走原保守路径。
`prepareReferenceIndexSearch.beforeSearch` 的候选资格、新鲜度、源码内容证明、最终检查
和结果完整性保持；不能为了恢复资格又跳过所有脏索引准备，造成永远无法重新认证。
原五项物理验证占用/取消/恢复公开 LSP 测试在实际工作树产物上5/5通过：
`index-dirty-route-product-regressions.log`，16.172s。不是恒定复杂度或30K验收证明。

## IDX-V1-DIAG-RECOVER-001：旧世代失败诊断没有恢复触发事件

原压力用例：两个嵌套工作区，Entry诊断处于受控1500ms等待；修改另一根的Other未保存文本，
创建并开关20个文件，再改Entry，执行压力及取消/补全。父端按现有截止退役第一份Worker，
重放最新两个文档，前台查询恢复。Other的在途诊断收到 `worker-unavailable` 后只记录错误；
没有后续编辑事件时，诊断调度器没有理由再运行。

因果边界：`SemanticWorkerSupervisor.#fail` 结清旧 endpoint 请求 →
`SemanticWorkerFailureRecovery` / `SemanticWorkerRecycle.recover` 退役并重放 →
`workerDocumentRequest` 向 `createDocumentDiagnostics` 传播旧请求失败 →
catch记录失败且清除pending。此前恢复结束没有通知诊断队列，客户端缺最新版本诊断。

`pressure-catch-inplace-02` 在实际W路径以内存加载钩子记录：Other v2、当前epoch2、
pending匹配、未取消，却收到 `worker-unavailable`；Entry v2最终发布条件均有效。
因此不能继续声称两份诊断都丢失，也不能因替代Worker曾算出Other正确诊断就断言已公开发布。
应按 `(threadId, epoch, id)` 关联Worker请求，不能只用id跨逻辑根匹配。
日志插桩改变时序：`pressure-catch-inplace-01`通过、02失败，说明是竞态而非固定解析错误。
复制到其他目录的运行产物会改变Native/配置解析，相关通过不冒充实际候选通过。

最小公开LSP回归先使Main诊断进入受控等待，再仅令Worker致命退出一次；
等重放成功，不发送新的编辑或查询，要求客户端获得同版本缺名诊断。
`diagnostics-recovery-red-02.log` 在恢复完成后仍等不到 publishDiagnostics，0通过/1失败。
初次外层20s的测试超时样本保留；它是取消结果，不当作明确通知缺失断言。

修复通过可取消订阅的 `SemanticEnginePort.onDidRecover`，在物理替换与权威输入重放
成功后，合并安排各打开工作区的**新诊断快照**。它不重放原请求，不复用旧结果，不标READY，
不触发额外Worker恢复；仍经过原75ms debounce、文档版本/工作区epoch/controller最终fence。
熔断后的半开恢复仍由显式语义证明占有：重放成功不通知后台，实际成功解除探测后再通知。
对应状态契约先RED（过早通知），再GREEN：`recovery-probe-events-{red,green}.log`。
取消订阅与会话关闭清除监听；失败重放/停止状态不发成功事件。

## 回归与剩余验收

首轮扩大回归 `diagnostics-recovery-public-green-01.log`：28通过/1失败；
原七项生产行为、新增公开恢复行为、不可响应/共享预算及配置恢复均通过。
唯一失败为显式测试目录计数仍319而实际323，新增第二份契约测试后应为324；
现已更新精确计数及归属断言，保留原失败，不移除目录完整性检查。
最终定向结果将在命令完成后补记；没有以这个中间结果宣称全量GREEN。

相关ADR：0020保留单终态、不重放旧请求、共享恢复预算；0026保留取消截止与实际终态边界；
0043保留索引资格与语义完整性分层；0044保留当前输入证明的生命周期。
这两处是不同直接缺陷，均被新源码集合观测/多根时序暴露，不强行归为同一个根因。
ADR状态不追认Accepted；未合并、发布、日常部署或删除真实缓存。


### 最终定向组合（冻结完整检查之前）

`route-and-recovery-final-focused-02.log` **32/32 PASS、0FAIL、0skip，72.605s**，
真实W产物串行执行。包括原7项生产Worker、恢复后公开诊断、半开通知契约、Native首次
候选恢复、结果缓存正负资格、未通知源码变化、多根及目录所有权生命周期、测试目录完整性。
`reference-cache-qualified-controls.log`独立2PASS：缺SDK不能存结果缓存；有效SDK首次
缓存可用、编辑后分批结果仍正确但不能存旧Program证明；显式建立新完整证明后可存并命中。
没有为满足旧测试放宽生产资格。原expanded-01的29PASS/2FAIL保留：旧缓存前提及分层计数。
最终清单精确324入口/unit132/bundle169；`test-manifest-final-green.log`4PASS。
`root-other-work-after-route-and-recovery.json`核对主工作树40份其他文件，全部哈希未变。
当前重新冻结后将执行全量检查；本节不提前标记全量、规模或长测通过。


### IX13 live checkpoint（不修改正在检查的W冻结文档）

新冻结2423输入：`ix13-route-recovery-final-checks.json`。release、Rust工作区425PASS/
1既有ignored、fmt、严格Clippy及全部六项必要补充检查exit0。`pnpm check:fast`仍在执行，
不得当作全量通过。冻结W后本节只写主工作树的观察报告，保留测试输入不变。
`final-acceptance-15`是新单独轮次，启动器等待本轮完整门禁PASS及产物核验后才复制输入/
校准/正式7200s，不累计H13；驱动/电源控制11PASS。目前尚未启动Photos负载。
`density-acceptance-16`仅准备并控制验证8Python+5Node通过，未启动规模负载；后续必须等
新Photos完成、源恢复和对应无系统睡眠证据，不能借用旧长测收据。
持续状态及实际session ID保存在证据根progress.json；不合并发布或部署日常Zed。


### 平台连接复查（IX13运行期间）

只读命令 `ssh -o BatchMode=yes -o ConnectTimeout=8 windows-pc <PowerShell工具路径查询>`
实际exit255：`192.168.31.14:22 Operation timed out`。原始日志
`namespace-final-20261109/windows-connectivity-20261109.log`。没有启动Windows测试、
部署/重启或实际UI动作；该平台验证仍未执行。Mac完整检查与新Photos启动器的进程句柄
均已重新确认存活；检查继续，Windows连接失败不阻止可独立完成的Mac验证。
截至本观察，Node已有565条通过报告且无失败报告，这只是进行中计数，不是最终通过率。


## IX13停止与后继修正（2026-11-09，取代上面的运行中观察）

IX13实际停止状态为 `STOPPED_AFTER_NODE_FAILURE_HANG`。停止前Node部分报告1693通过/
84失败；不是执行完毕总数，不是全量通过。完整原日志、冻结输入、失败列表及受控终止树
分别见证据根 `ix13-route-recovery-final-checkfast.log`、`ix13-route-recovery-frozen-inputs`、
namespace-final目录 `ix13-failed-cases.json`、`ix13-controlled-stop.json`。
Rust425通过/1既有ignored、release/fmt/Clippy及补充检查的通过仅适用当时冻结身份。
Photos15控制器因门禁失败停止，**没有加载Photos项目或开始新长测**；density16也未运行。
Windows连接超时仍未完成平台/UI验证。旧长测不能替代后继候选验收。

### IDX-V1-INDEX-ADMISSION-002：第一次观察被误认成输入变化

`ReferenceNamespaceAdmission.read` 原先在没有previous时调用changed，导致已与当前源码
完全匹配的冷Native资格被标脏。`beforeSearch`捕获此版本作为失效基线，于是第一次查询
拒绝实际有效的候选。这是实际产品缺口，不是增加sleep即可解决的测试时序问题。

修正：首次只记录观测；确实出现名称/内容差异才推进失效。如果Native带有真实资格但
与当前sourceFingerprint不一致，则按当前命名空间/磁盘证明合并一次对账。对账不能把
当前语义查询凭空标成旧版本。没有证明、纯内存输入或过期证明仍不能授权候选收窄；
undefined与undefined相等也不能冒充匹配的证明。发现用候选和有权收窄候选保持分层。
公开LSP新回归 `references-first-qualification.test.mjs` 先RED，原始证据
`first-qualified-query-red.log`；后继组合 `first-qualified-query-focused-02.log`
22/22通过，43.964s。包括真实Native/noop、未通知变化、overlay证明及目录生命周期。
六项旧夹具等待改为实际初始qualified input，不再等待原误触发的冗余第二次no-op；
精确位置、文档计数、替换/资源生命周期断言保留。

### IDX-V1-INPUT-ADMISSION-001：Store先发现新文件后丢失旧负解析证明

调用链为成员目录刷新 → Store contentRevision/changedPaths → prepareContextEntry →
替换旧context。原先在检查旧编译器未命中依赖的负证明前就替换旧引擎，发现新文件的
请求可能直接成功。这违反ADR0036的发现请求拒绝、后继新请求恢复约束。

先抽取 `project-membership-refresh.ts`，纯提取组合22通过；随后公开原失败重现
`unnotified-namespace-after-extraction-red.log`。修正使用命令级resolution admission
记录未通知的实际名称变化，在旧context替换前保留原非源码证明并检查旧完整输入。
普通内容编辑、已送达watch和真实配置授权分别处理；不把SDK变化借源码恢复洗成有效。
`unnotified-namespace-guard-focused.log` 43/43通过，71.981s；包含SDK晚变更/构造失败/
动态依赖恢复以及目录生命周期。`source-admission-typecheck.log` exit0。
Store行数1626降至1576，仍为迁移债务；未把私有测试当成公开协议证明。

### 测试证据的资格与清理

旧scripted sidecar的数值水印不等于版本化源码资格。向JSON伪造indexProof的实验被弃用，
没有放宽生产验证。当前anchor夹具让真实Native生成全部facts及proof，只拒绝Query.ets
直接usage发现，以真实声明候选回包验证编译器锚点路径；原正确性/范围断言保留。
首次夹具没有可执行权限导致的失败是测试部署错误，不能归因产品。
完整30项后继组合尚在执行；仅两项已确认通过见
`real-native-anchor-discovery-executable-green.log`，不要把先前14通过/16失败误写成最终结果。

owner测量先前遗漏生产 `fileMaintenance:true`，已对齐；初次同步使旧Program证明失效，
因此保留前两次cacheHit=false，增加显式第三次稳定查询检验hit，不隐式prepare。
`owner-versioned-qualification-controls.log` 两项通过，既有精度/成本断言保留。

Node20最小独立验证发现前一个after钩子失败会使后续资源关闭钩子不执行；
`node-after-hooks-probe-events.log`记录只有remove-start。新test-resource-scope用同一钩子
按逆序关闭所有已注册资源后再删夹具，并汇总报错。原IX13实际rm异常仍未捕获，
因此这仅证明一种可重现的遗留进程机制，不宣称已证明那次hang的唯一根因。
初次新回归子Node继承NODE_TEST_CONTEXT而不执行，保留失败；后继显式去掉该变量，
正在验证。产品LspSession已有finally及有界TERM/KILL，没有按错误假设重复改写。

尚待：其余原84失败重放、健康大SDK reset capsule边界、最终完整门禁、当前规模与新两小时
Photos协议验收。未提交/合并/发布/部署；不因局部通过标完成。


## 后继公开对照与两个恢复边界

下列结果取代前节“尚在执行”的观察；证据仍位于 namespace-final-20261109。
`native-anchor-cleanup-sdk-final-03.log` **37/37PASS、0skip，107.641s**：完整30项
真实Native锚点、资源清理、测试目录及128/4608声明SDK恢复。磁盘变化两项增加了变化前
精确6位置的真实锚点查询，变化后严格要求workspace-changed、没有新索引授权/锚点，
并保留精确位置及全成员回退。早期scope会拒绝已知过期输入，因此不再要求变化后先建
单独的锚点；不是删掉位置或完整范围断言。生产7项Worker原行为在新清理驱动下7PASS，
cleanup新用例在37项组合中也通过。最初脚本生成换行错误和继承NODE_TEST_CONTEXT的
失败保留，不能归因产品。

大SDK实际通过triple-slash把128/4608声明装入SDK依赖；起始degraded来自故意缺失Created，
而非SDK不全。发现请求-32803、后继同输入补全value和正常退出均通过。
观察性 `large-sdk-observed-capsule.log` 实际保留capsule.factCount均14，见
`capsule-observed-counts.jsonl`。所以它**没有证明**4096条保留证明溢出；SDK文件数不等于
capsule条数。没有据此删除SourceResetAdmissions配额或声称该容量边界已验收。
初次空预算配置/错误READY假设的夹具失败单独保留，不是产品容量RED。

### IDX-V1-INPUT-ADMISSION-002：第一份目录收据被后续扫描替代

原公开 `readiness-catalog-input-windows.test.mjs` 的pre-after/source稳定失败。
`stale-catalog-read-token-red.log`保留普通计时失败；第一次假设是token读取失败被当作冷
回退。但改为throw仍未转GREEN（`stale-catalog-token-focused-green.log`实际有失败，
文件名不代表结果），该实验已撤出并封存 `abandoned-stale-token-throw-type-delta-inputs.ts`。

真实链路：prepareReadinessCatalog第一次scan → prepareCompleteProjectWorkspace可能
再次scan/prepare → 原始workspace stamp捕获第二次版本 → refreshInteractiveReadiness
只核验第二次与之后prepareRoot版本。第一次scan之后、原始workspace之前的变化因此
被第二次版本覆盖，markerEnd响应成功而原契约要求拒绝本次发现请求。
`catalog-admission-review-03-pre-after-source.json`及events-03记录实际变化、上下文
contentRevision由0至2与替换顺序；refresh额外观察钩子误用了构建变量current而实际名
current3，probe-error明确保留；没有使用该失败观察声称完整扫描细节。-02插桩本身
造成-32603是无效运行，-01未进入Worker也不是阶段证据。

最小修正为refreshMembershipSnapshot返回第一次扫描结束时不可变catalogStamp，并由
prepareReadinessCatalog原样传递。进入query准备时首先比较早期收据与原始workspace，
随后仍保留原终检；不再把第二次扫描作为第一次的权威，也不额外枚举/读取。SDK、
目录身份、真实配置授权和请求单终态合同不变。
`first-catalog-admission-focused-green.log` **35PASS/0skip，49.781s**，包括原7个扫描
窗口、24个SDK/源码读取窗口、2个大SDK及2个stamp用例。尚需接口兼容与扩大回归。

### IDX-V1-INPUT-ADMISSION-003：失效的容量失败证明未触发重新枚举

原20,003源码用例在未通知删除noise、增加Ambient后持续-32803，最初没有capsule采集
事件；不能据此判为SDK证明永久污染。实际是definition-fallback已判容量证明失效，
后续prepareCompleteProjectWorkspace却只刷新complete/enumeration-error/source-unavailable，
遗漏了path-count/path-byte旧失败的证明已失效情况。
修正仅在容量证明不再current时恢复真实枚举；有效失败证明仍避免反复扫描，不放宽成员
上限、不返回截断结果。原用例不改为强制“第一请求拒绝”——没有旧compiler负事实时，
允许捕获前对账后直接正确恢复，不能机械套用ADR0036。
`capacity-and-catalog-admission-green.log` **36PASS/0skip，59.433s**，原20K失败用例及
其两个源文件修复控制、所有7目录窗口、24读取窗口、2大SDK通过。

### 尚未关闭的范围资格与其他失败

原84失败过滤重放 `ix13-remaining-replay.log`：52项实际执行，15PASS/37FAIL，81名称
过滤未执行；不是完整门禁结果。这先于上面收据/容量修正，不能直接当作当前失败总数。
实际Native别名对照取证：语义26文件、Native28文件；Native额外含entry/ghost与ghost两份
未激活GhostUse.ets。`alias-scope-diagnostic-02/scope-difference.json`关联实际语义manifest、
复制并只读打开的Native manifest_entries及日志。首次插桩因证据目录未创建而改变响应，
不是有效产品对照。当前scope-mismatch有真实输入集合差异，不能关闭校验强迫accept。
仍需处理正例夹具资格、实际不一致范围的保守行为、其余缓存/队列/输入窗口回归；
当前不宣称全量GREEN或Photos长测完成。主树40份其他工作再次逐哈希核对全部未变。


### 当前接口兼容、实际capsule及验证收口

新增catalogStamp最初可枚举，使5项原刷新形状断言失败，原始
`catalog-refresh-receipt-compatibility-red.log`54PASS/5FAIL保留。现为不可枚举的内部不可变
元数据，既有changed/removedPaths形状不变，新增stamp回归检验无重扫、旧收据不被后续
变更和目录创建改写。`receipt-and-capacity-public-final.log` **89/89PASS、0skip，37.285s**，
覆盖Store取消/原缓存接口、实际项目目标成员、目录窗口及20K容量恢复。Store现1573行，
仍超限但较本轮开始1626行减少，剩余迁移债务可见。

IDX-V1-INPUT-PROOF-004：SourceResetAdmissions.begin仍按pending capsules累计4096事实
拒绝健康证明。与前面大SDK“实际14条”的对照区分：新契约测试通过真正的
LoadedConfigurationWitness读取4608份JSON文件，生成完整capsule交给admissions，
`source-reset-real-capsule-capacity-red.log`在begin稳定抛错。此为实际事实容量RED，
不是以磁盘文件数猜测；它是生命周期组件接口测试，不冒充LSP大工程规模实验。
按ADR0044既有决定移除该健康证明计数/拒绝，保留同context去重、匹配complete释放、
另一context独立所有权、失败替换保留原末尾事实、真实配置授权及clear，且不保留原LS/
Program。失败来源明细4096上限未动。新增回归同时修改第4608份原输入，要求拒绝、不得
遗漏末尾事实或因释放另一context洗白；clear后可重新开始。
`complete-capsule-and-input-admission-final.log` **46/46PASS、0skip，71.793s**，含实际
capsule/loaded witness、测试目录、24源码/SDK窗口、7目录窗口及2大SDK公开对照。
四项运行产物、最终源码及旧Rust身份对照将写入current-admission-repairs-receipt.json。
当前再次运行最终类型检查和完整锚点/生产Worker/缓存/恢复组合；仍不构成全量门禁。


最终本轮收口：`final-current-anchor-worker-cache-controls.log` **43/43PASS、0skip，132.645s**；
`complete-admission-final-typecheck.log` exit0。它们使用capsule最终修正后的实际产物。
与46/89组合存在重叠，不相加为总通过数。未再次启动完整check:fast；原IX13失败状态保留。
`current-admission-repairs-receipt.json`记录2429份输入及4项产物哈希；249份Rust输入与IX13
完全一致、Native哈希不变，因此425/1ignored只是同身份Rust证据复用，非本轮新运行。
Worker协议文件1783行未新增；Store1573行债务保留。整体目标ACTIVE，剩余原失败需逐项
重放并修复，之后才能开始新完整门禁及当前身份Photos/规模验收。不提交、部署或发布。


后继取证/实施见[输入证明用途与诊断交付阶段](2026-11-09-input-proof-purpose-and-diagnostic-handoff.md)：
当前过滤重放17PASS/35FAIL为修正前；用途/当前资格/重复prepare/交付阶段分别有33/39/40/19
定向PASS，新ABI3完整门禁仍待，不把旧收据覆盖成当前全量通过。
