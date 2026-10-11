# L07 当前预算政策的编辑与调用合同

日期2026-10-10；父HEAD`1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`。
用户授权L06完成后继续L07至完成。[L06完成审计](../reports/2026-10-10-resident-l06-completion-audit.md)
A～E PASS、完整1492/1492及终态身份一致是本轮起点；不代替L07收口whole。
实验默认关闭，正常1024MiB/原滞回/完整SDK/诊断和原超时保持。
最终P95/内存/ready/soak/规模/平台发布仍在L08，不作为本阶段阻塞。

## 切片顺序与当前进度

[主计划L07清单](../plans/2026-10-06-budgeted-resident-semantic-plan.md)按A～E收口，
保留[原11公开合同](l07-resident-edit-and-call-contracts.md)的完整编辑及应用、
alias/冲突、双向fromRanges/未打开follow-up、编辑/取消/物理Worker恢复。
先公开RED/GREEN及必要characterization，再真实当前固定构建ON/OFF，
最后冻结完整回归和逐项审计；不穷举L08最终矩阵，不新增语义owner。

新entry先实际得到tooling RED：discovered test has no layer，3/4、退出1，
163.252439ms，`.bench/l07-edit-call-inputs-entry-red.log`。
登记bundle-e2e并同步严格入口/层计数和单项归属：173入口、bundle76；
manifest4/4、退出0，166.791589ms，没有排除fast或削弱发现检查。

首个生产公开RED命令：

```sh
node --test --test-concurrency=1 --test-name-pattern='L07 unnotified package retarget' \
  tests/semantic/resident-session-edit-call-inputs.test.mjs
```

当前选定L03政策、正常1024MiB、R-09关闭；真实stdio package入口从First
未通知切换Second，prepareRename仍成功返回旧已加载输入的range/placeholder，
而不是-32803/no result。0/1 FAIL、退出1、1300.209673ms，
`.bench/l07-prepare-rename-package-inputs-red.log`；产品输入仍L06
f3f22d83f9f5d67c5303de9505a81c469da80e334c3bf5828423969c180a00b5。
测试随后补通知及最新v2完整prepare/2322 code/range/version恢复断言；
根配置、磁盘和overlay通过真实文件/公开通知控制，不伪造compiler结果。

既有rename六合同和原result-mapping取消characterization先7/7 GREEN、
退出0，13909.492578ms，`.bench/l07-rename-edit-characterization-before.log`。
仅在此GREEN保护下把完整rename编辑排序/重叠检测提为独立cohesive模块，
语句/64项协作检查语义不变；不机械拆分或新增checker。抽取后的相同
characterization7/7 GREEN、退出0，13894.358788ms，
`.bench/l07-rename-edit-characterization-after.log`；随后prepareRename只在
真实getRenameInfo后接入已有加载见证，1/1 GREEN、退出0、1687.960068ms，
`.bench/l07-prepare-rename-package-inputs-green.log`，通知后v2完整range及2322
诊断code/range/version通过。错误复用L06的editor-neutral映射，不新增协议。

下一rename反例先独立冷进程核验Second入口下First未关联消费者，完整
当前编辑集仅First一个定义；暖First后未通知切Second，旧路径却返回
First定义及消费者import/use三处编辑，是实际extra/stale编辑而非只猜缓存。
0/1 RED、退出1、2322.688407ms，`.bench/l07-rename-package-inputs-red.log`：
`node --test --test-concurrency=1 --test-name-pattern='L07 unnotified package retarget rejects stale rename' tests/semantic/resident-session-edit-call-inputs.test.mjs`。
在getRenameInfo后及完整编辑集返回前核验同一实际加载见证，保留原
membership/版本/重叠/取消保护；两项2/2 GREEN、退出0、4197.107933ms，
`.bench/l07-prepare-rename-package-pair-green.log`，当前完整编辑集与冷oracle一致。

第三条prepareCallHierarchy反例同样先独立冷Second核验完整work item，
再暖First/未通知切Second；旧路径实际返回First URI/完整range/selectionRange/
data，而不是当前Second item或显式错误。0/1 RED、退出1、2097.518919ms，
`.bench/l07-prepare-call-package-inputs-red.log`，命令的pattern为
`L07 unnotified package retarget cannot publish a stale prepareCallHierarchy`。
只在完整prepare返回边界接入同一加载见证；首次三项2/3、退出1，
6323.880093ms，名为`.bench/l07-package-input-triple-green.log`的尝试日志
实际是FAIL，不因文件名当作成功。输入已拒绝，但独立call prepare runner
没有现有workspace-incomplete映射，暴露-32603而不是固定-32803。
在它原取消/旧代优先之后补同一错误映射，不改变freshness fence；
三项及原call hierarchy七协议合同10/10 GREEN、退出0，7997.584622ms，
`.bench/l07-package-triple-call-protocol-current.log`；原取消/旧代/停机保持。

第四条outgoing反例保留独立冷Second完整edge，再以真实公开prepare返回
的caller item查询暖First；未通知切Second仍成功返回First目标和完整
fromRanges，实际与当前oracle不同。0/1 RED、退出1、1852.240943ms，
`.bench/l07-outgoing-call-package-inputs-red.log`，pattern为
`L07 unnotified package retarget cannot publish an old outgoing`。
只在完整outgoing返回前接同一见证，独立follow-up runner在原取消/旧代
优先之后映射workspace-incomplete；四项及原协议11/11 GREEN、退出0，
9963.697172ms，`.bench/l07-package-quad-call-protocol-current.log`。

第五条incoming先用独立冷Second核验First work确为完整空caller集，再
暖First得到唯一完整caller。目标声明/范围/data未变，未通知切Second却
保留该旧caller，实际stale edge。0/1 RED、退出1、1987.730806ms，
`.bench/l07-incoming-call-package-inputs-red.log`，pattern为
`L07 unnotified package retarget cannot retain stale incoming`。
在incoming完整返回前接同一见证，不把未知输入变成成功空集；通知后
真实当前空集须与冷oracle一致。五项、原11合同及七协议23/23 GREEN，
退出0、32005.654098ms，`.bench/l07-five-inputs-original-contracts-current.log`。

实际复用观察先得到独立公开RED：五类完整功能结果均已返回，但没有
实际post-query Program记录；首prepareRename观察0而非1。
0/1、退出1、1405.116254ms，`.bench/l07-edit-call-program-observation-red.log`，
pattern为`L07 selected policy witnesses actual unqueried`。
现有同一leased callback只在trace ON时记录已成功ready/complete查询的
collector/实际Program/SourceFile身份及RSS；不为拒绝查询强制getProgram，
trace OFF不额外观察，observer失败不改变结果，不新增语义owner。
该观察1/1 GREEN、退出0、1547.150425ms，
`.bench/l07-edit-call-program-observation-current.log`；两类未查prepare与
暖机同Program、零create，其余实际调用记录保留，不把序号当答案cache。
registry恰500行、引擎3451（本轮起点3470）、编辑模块33。
预算/trace OFF/默认完整安全路径的客户端应用与双向调用、最新诊断及
低预算物理Worker恢复qualification已验证；不改正常1024MiB。
rename四配置完整编辑应用/旧版本客户端拒绝/诊断及definition一致，
1/1、退出0、5272.626479ms，`.bench/l07-rename-budget-traceless-default-current.log`。
调用四配置全量方向/fromRanges、v2旧item拒绝/最新诊断与低预算物理Worker
恢复2/2、退出0、9342.262587ms，`.bench/l07-calls-budget-traceless-worker-current.log`。
rename选定政策物理Worker old/new threadId不同、完整v2编辑恢复1/1，
退出0、3882.061894ms，`.bench/l07-rename-selected-worker-current.log`。
两项64MiB仅功能qualification，自动回收关闭，不宣称正常预算下RSS下降。

代表性同一class owner成员冲突先独立生产诊断证明错误编辑出现2300，
随后暖有效overlay，rename value→occupied却成功返回编辑，0/1 RED、
退出1、2107.001436ms，`.bench/l07-member-conflict-red.log`；pattern为
`L07 same-owner member collision`。预检只补compiler实际成员/所属class及
static/instance类型中的同owner冲突，复用当前checker；合法改名仍要求
完整versioned edits、实际应用后空诊断和精确definition，不冒称一般
嵌套捕获/继承/所有方言冲突矩阵。

SDK配置五类输入/完整最新payload与独立冷oracle的新增合同，初次在冷
基线误预期import编辑为LocalTarget，实际compiler为PackageTarget as
LocalTarget，1125.118516ms FAIL；这是无效oracle预期，不算生产RED，
`.bench/l07-sdk-config-edit-call-current.log`保留。修正为完整prefix/suffix，
未删字段/范围/版本断言。随后成员1/1 GREEN、退出0、2119.856223ms；
SDK冷基线仍空诊断而预期2322，联合1/2、退出1、3531.357522ms，
`.bench/l07-member-sdk-current.log`。read-only核对发现fixture显式editor
sdk.path优先于local.properties，Next根根本没有被选择；这是无效控制，
不包装为生产SDK缺陷。SDK测试明确以空editor SDK选择进入实际project
配置路径，保留冷oracle/五类拒绝/通知后完整v2及诊断断言，1/1 GREEN，
退出0、2857.946882ms，`.bench/l07-sdk-project-configuration-current.log`。
当前24个生产公开case（原11+本轮13）；新增五类选定政策早期取消的
唯一终态/无partial及逐能力恢复断言，不能称作compiler-in-flight抢占。
七文件联合53/53 GREEN、退出0，无fail/cancel/skip/todo、63730.541018ms，
`.bench/l07-public-budget-protocol-focused-current.log`；包含24个真实生产
公开case，另外29是协议/取消映射/登记，不能称53个生产case。
尚待工具接线、当前
真实D、冻结whole及完成审计，不以L061492或局部GREEN完成L07。

## 透明回放工具合同（不冒充生产语义证据）

现有prepared-suite缺少rename/calls query kind，公开CLI新增合同先0/1 RED、
退出1、596.105925ms，PREPARED_SUITE_INVALID=QUERY_KIND；
`.bench/l07-prepared-edit-call-tool-red.log`。最小适配保留五类完整payload、
版本化WorkspaceEdit、item全部字段及独立方向/fromRanges，只从明确已
通过完整oracle的当前prepare目标选真实item；不偷偷补prepare或刷新。
全量10个计划请求完整、分母不缩，第一项工具合同1/1 GREEN、退出0，
1229.561573ms，`.bench/l07-prepared-edit-call-tool-current.log`；raw readiness
仍FAIL/READINESS_UNSUPPORTED，不被工具功能PASS覆盖。
共享模块只校验协议/source/UTF-16及参数/选择器，不投影代码语义，
也不丢弃item data或任何字段。其scripted server只是工具边界夹具，
不能当Settings/API24或Program复用证据；本轮真实控制尚未运行。
独立冷发现器先0/1 RED、退出1、453.136852ms，INVALID_MANIFEST，
`.bench/l07-cold-edit-call-tool-red.log`；接同一完整payload/参数/协议验证，
五类各两冷进程、显式单次prepare及全部字段1/1 GREEN、退出0，
5429.743157ms，`.bench/l07-cold-edit-call-tool-current.log`。
缺失/编辑前call source两反例立即通过，计入完整计划分母且零隐藏刷新。
旧版本编辑oracle与实际错误响应同错的反例需要scripted fixture提供
wrong-rename-version控制；首次2/3、退出1、3139.601175ms是未实现该
夹具控制，不算生产RED，`.bench/l07-edit-call-tool-negative-fixture-trial.log`。
只给该测试模式返回version+1，验证已有current snapshot校验不会接受
“两个同错payload相等”；五文件工具联合50/50 GREEN、退出0，
无fail/cancel/skip/todo、63371.354795ms，
`.bench/l07-edit-call-tool-focused-current.log`。十五文件生产/其它rename/
calls/预算/诊断联合正在扩展复核，保持正常预算和所有原断言。

功能fixture的SDK version=test，metadata invalid/dialect unverified；它们
证明pinned compiler的TypeScript-compatible公开合同，不冒称完整API24
native SDK验收。真实D另用Settings/API24固定checkout和完整SDK。
十五文件联合157/157 GREEN、退出0，无fail/cancel/skip/todo，
252280.398911ms，`.bench/l07-expanded-functional-focused-current.log`。

首个真实冷发现v1在任何server启动前PIN_MISMATCH、CLI退出2，
`.bench/l07-policy-prepareRename-cold-v1-1.log`；不是产品请求失败或D成功。
read-only比对发现cold关闭transient diagnostics，却拿了包含该Worker的
选定配置pins，实际capture按未启用资产省略该字段。保留v1未执行清单，
另建v2：明确使用benchmark-controlled原transient diagnosis、晋升/成本/
压力/自动回收均关闭，完整安全语义及正常1024MiB不变，完整pins与该
运行配置一致。当前14独立冷进程重新采样，不重写历史报告/身份。

v2真实冷发现prepareRename/rename/prepareCallHierarchy/outgoing各两进程
DISCOVERED/VERIFIED、产品退出0及输入不变；incoming首轮则FAIL、CLI退出1、
产品正常退出0，`.bench/l07-policy-incomingCalls-cold-v2-1.json/.log`。
公开错误为固定-32803/source-unmappable，不能当作完整空图或D成功。
目标为真实UiRefresher.refreshUi，outgoing已精确给出adjustIdIfNeed及
fromRange175源方法内的实际调用；原目标池保留，不换目标缩小scope。
按diagnose定位实际失败caller/映射，再缩为独立生产stdio RED，修复后
重新固定产物与当前控制；八个已通过冷进程是该构建历史，不重pin冒用。

真实诊断probe捕获MenuComponent.ets整文件module调用者，selectionSpan
为{start:0,length:0}、span为完整240676 UTF-16单位；严格非空token映射
误拒绝它。probe只写stderr，已全部移除；其独立manifest/report保留在
`.bench/l07-incoming-diagnostic-probe-{manifest,report}.json`，不是D成功。
最小生产stdio反例先因未打开prepare目标而source-unavailable，属于夹具
条件错误，`.bench/l07-whole-module-incoming-red.log`；补真实didOpen及诊断
屏障后，0/1 RED、退出1、1309.107817ms，真实incoming报source-unmappable，
`.bench/l07-whole-module-incoming-red-v2.log`，父revision仍1b910152。
只允许编译器整文件module/file的零长度选择，保留普通symbol、嵌套module、
不精确boundary/roundtrip的拒绝。边界映射按既有157/157公开合同抽为
typescript-call-hierarchy-range.ts，原超限服务3470→3448行，仍为迁移债。
第一修正后incoming完整，实际返回的module项follow-up却-32801；
`.bench/l07-whole-module-incoming-green.log`实际0/1，名称不代表GREEN。
原因是编译器prepare在0处定位首个token，而incoming/outgoing在0处明确
定位SourceFile。只对整文件零选择follow-up，以当前Program真实SourceFile
文本/模块类型/文件名/整范围重新校验；不使用项缓存，不放宽普通符号。
真实module incoming及其outgoing在晋升ON/OFF均1/1 GREEN、退出0，
2647.108692ms，`.bench/l07-whole-module-incoming-green-v2.log`。随后补
伪造name/kind/截断range反例必须-32801且无result；四文件calls公开合同/
取消/limits/Worker协议联合正在复核。v3重新固定新产物并重采全部冷oracle，
绝不把v2或诊断构建的成功payload重pin成当前结果。

四文件93/93 GREEN、退出0、无fail/cancel/skip/todo、150056.32249ms，
`.bench/l07-calls-postfix-focused-current.log`。当前25生产公開case，联合
包括协议/adapter，不称作93生产case。修复后v3全部14独立cold通过，
原真实incoming四调用者包含两个真实整文件module；全部字段及原目标
保留。v3四控制54/54语义通过，但Controller已resident，晋升数为0，
不足以证明晋升反事实；如实保留，不把原相等结果推断成promotion成功。
v4增加真实MenuComponent lazy目标prepareRename/同快照重复，独立两个
同产品cold全payload和62条原正常诊断一致。四控制62/62、两对完整
payload/最新诊断/目标池/pins相同；ON11源同指纹晋升、generation不变、
首次prepareRename同暖机Program1/零create；OFF generation+11及Program2/
一次create。当前完整编辑/双向图不投影或删字段；代表性真实编辑/恢复
为rename，实际应用后验证另由生产公开合同证明。
[当前真实控制](../reports/2026-10-10-resident-l07-budget-policy-integration-v4.md)
完整保留准备/完整响应/重建/高RSS，raw FAIL和CLI1不是stage失败的改写。
2026-10-09T20:48:40.481Z冻结319测试/工具、207产品源输入、173登记/
167fast、301benchmark历史及当前输入、41 tracked修改；未跟踪新增
也进全向量。随后全新完整pnpm check:fast1511/1511、根退出0，无fail/
cancel/skip/todo、2103025.227621ms；分段000–022及根终态完整保存，无
传输截断/观察缺口。全部冻结源码/产物/测试/工具/benchmark/工程/SDK
字节与入口列表一致，四控制/16cold前后pins实际复核通过，
`.bench/l07-completion-post-full-identity-v4.json`全部检查true。
不借用L06 whole1492或focused；[完成审计](../reports/2026-10-10-resident-l07-completion-audit.md)
A–E PASS、L07阶段DONE，实验默认关闭，最终门禁不由单对控制毕业。
临时probe第一次类型检查因读取LazySnapshotRecord没有的sourceContent
退出2，移除该非业务诊断字段再构建；不是生产语义RED。最终所有probe
已移除，类型/构建及本轮完整根命令均通过。
