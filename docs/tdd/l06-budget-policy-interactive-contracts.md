# L06 预算政策下的交互能力合同

日期：2026-10-09。状态：IN_PROGRESS。本轮按用户确认的A～E完成L06，
覆盖definition/typeDefinition、completion/resolve/auto-import、hover/signature
和正常版本化诊断。沿用现有compiler、DocumentAuthority、resolve及预算
owner；不新增公共能力或生产默认，不把最终性能和内存验收提前到L06。

## 起点和职责抽取

父HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`；保留当前工作树，
L05冻结产品输入为
`905fca366c83298af4f66c8c89af822fdd124cdb468d482edb90ad382ae384d7`。
[早期八项合同](l06-resident-interactive-contracts.md)和当时57项组合、
旧definition真实8项请求保持历史身份，不冒充本阶段选定政策和当前真实分母。

先重跑当前八项真实Content-Length/stdio公开characterization：

```sh
node --test --test-concurrency=1 tests/semantic/resident-session-interactive.test.mjs
```

8/8 PASS、退出0、无fail/cancel/skip/todo，25,840.870373 ms；
原始 `.bench/l06-parent-public-contracts.log`。GREEN后将临时工程、SDK、
协议会话、完整导航oracle和completion句柄校验归入
`tests/support/resident-interactive-lsp.mjs`，原入口473→313行，
支持模块166行。相同八项再次8/8 PASS、退出0，26,833.134544 ms，
`.bench/l06-fixture-extraction-characterization.log`；没有改变合同或生产行为。

## 阶段范围和顺序

未通知package main从First切到Second，独立冷公开definition为Second，
已加载First的选定政策进程却成功返回First旧URI。真实RED：

```sh
node --test --test-name-pattern='L06 unnotified package' tests/semantic/resident-session-interactive.test.mjs
```

0/1 FAIL、退出1，2,728.499489 ms，
`.bench/l06-unnotified-package-first-red.log`。打开overlay故意不同于磁盘，
必须最新完整结果或明确错误，不能以成功旧定位通过B。此为修复前的
失败记录，不把前面characterization的GREEN当作本轮完成证明。

定向现有trace再次复现：v2查询使用新overlay第3行，host generation增加，
Program序号2→3且createProgramEvents=1，仍返回First；v2诊断为空而
独立Second为2322，见`.bench/l06-package-program-overlay-probe-red.log`。
因此不是overlay丢失或晋升跳过Program重建，而是导航接受了旧配置解析。

definition返回前消费现有compiler/PackageResolver加载配置见证，未知输入
由editor-neutral错误沿原workspace-incomplete码映射固定-32803；取消第一
原因与原implementation错误文案保持。通知后最新overlay定位Second，
诊断与独立冷oracle一致。原始回归首次1/1 GREEN、退出0，
2,638.259214 ms，`.bench/l06-unnotified-package-first-green.log`。临时
`[DEBUG-l06-package-definition]`已从源码/测试移除；其它能力组合仍需补齐。

原API编辑合同扩展为正常、选定L03政策和选定政策trace OFF三个独立配置；
类型/签名/导航立即使用当前v2/v3文本、诊断2322范围与版本精确，恢复后为空。
同一公开合同直接GREEN，1/1、退出0，6,361.870248 ms，
`.bench/l06-selected-api-and-traceless-characterization.log`。三配置均验证全部
payload，不把一个case的多配置执行伪称三个独立test或生产修复。

第一条选定政策组合使用正常1024MiB、成本回收/压力准入/transient诊断，
R-09关闭。未查导航的完整payload与人工oracle一致，completion完整
run/value；暖机、definition及completion同Program，276个工程sources、
definition零createProgram，没有references cache/batch冒充。新增公开
characterization直接GREEN，1/1、退出0，1,602.154784 ms，
`.bench/l06-selected-reuse-characterization.log`；不是生产缺陷修复。

definition修复及输入/struct范围职责抽取后的五文件联合回归62/62 PASS，
退出0、无fail/cancel/skip/todo，145,833.514295 ms；原始
`.bench/l06-input-span-post-extraction-62.log`。既有真实LSP struct源坐标合同
抽取前1/1 PASS、5,275.125309 ms，抽取后1/1 PASS、4,421.947897 ms，
分别为`.bench/l06-struct-span-pre-extraction.log`和
`.bench/l06-struct-span-post-extraction.log`。TypeScript service从本轮3489
降到3457行；此处62项是该检查点，不冒充后续源码终态whole。

typeDefinition使用独立冷进程的完整class定位oracle，连续两次成功返回
First旧URI，均0/1 FAIL、退出1：1,978.810830和1,964.815625 ms，原始
`.bench/l06-unnotified-package-type-definition-red.log`与repeat-red文件。
查询返回前消费同一加载配置见证，不能确认时沿既有错误码拒绝；通知后
恢复Second和当前诊断。definition/typeDefinition联合2/2 PASS，
4,213.523258 ms，`.bench/l06-package-definition-type-definition-green.log`。

GREEN后将两个package场景的临时工程、独立冷oracle、未通知切换和
通知后恢复归到`tests/support/resident-interactive-package.mjs`；完整payload
oracle仍由各公开合同提供。首次抽取有语法/变量转录笔误，失败原始
`.bench/l06-package-extraction-transcription-failure.log`，不算生产行为RED；
修正后同两合同2/2 PASS、4,169.751844 ms，
`.bench/l06-package-extraction-two-green.log`。未跳过或放宽语义断言。

hover独立冷完整markup/range为string，新overlay的UTF-16范围已被采用，
却仍成功返回旧number，0/1 FAIL、退出1、1,947.372545 ms，
`.bench/l06-unnotified-package-hover-red.log`。由当前范围排除overlay丢失，
独立冷oracle及通知后的恢复排除人工类型猜测；返回前使用相同配置保护。
当前三个package合同3/3 PASS、退出0，6,179.432231 ms，
`.bench/l06-package-three-capabilities-green.log`。signature/completion/resolve
及其它代表性输入和预算组合仍继续，不由这三项宣称B/C整体通过。

signatureHelp独立冷oracle为`run(count: string): string`，热进程却成功
返回旧number签名和参数；0/1 FAIL、退出1，1,989.435943 ms，原始
`.bench/l06-unnotified-package-signature-red.log`。最小保护后四项package
合同4/4 PASS、8,302.875017 ms，`.bench/l06-package-four-capabilities-green.log`。

completion的独立冷oracle逐字段保留detail、kind、insertText、sortText、
textEdit和isIncomplete；只在校验UUID句柄形状后移除会话随机ID。第一次
oracle遗漏detail，`.bench/l06-package-completion-oracle-omission.log`，
属夹具错误，不算生产RED。补齐后真实RED成功返回firstOnly而非secondOnly，
0/1 FAIL、2,156.410547 ms，`.bench/l06-unnotified-package-completion-red.log`。
返回前消费实际加载见证；未知输入明确拒绝，通知后完整恢复。五项联合
5/5 PASS、退出0、10,403.015732 ms，`.bench/l06-package-five-capabilities-green.log`。

resolve独立保持文档v1不变，只在磁盘切换package main；旧句柄仍成功返回
`(property) ValueTarget.value: number`。真实行为RED为
`.bench/l06-unnotified-package-resolve-behavior-red.log`，0/1 FAIL、
2,734.141314 ms。此前文件名含resolve-red的首次记录只因冷oracle误期待
空additionalTextEdits而失败，并非生产缺陷；误提前加入的保护已撤回和
重建，再由该真实行为RED开始最小修复。没有以版本变化提前挡住查询来
冒充配置新鲜度证明。当前旧句柄明确-32803，通知并更新后新句柄保留原ID、
完整payload与独立冷string结果相同，诊断精确；1/1 PASS、退出0，
2,819.594541 ms，`.bench/l06-package-resolve-green.log`。

当前六类package查询均有各自公开合同；TypeScript service3468行，仍低于
本轮起点3489，新增package支持模块64、交互入口478行。六类修复后的
联合回归正在运行；SDK/配置其它代表性输入、诊断未知输入及预算恢复
组合仍待补，真实多能力对照和终态whole均未据此完成。

六类修复后的五文件联合为66/67 PASS、退出1、158,229.059570 ms，
`.bench/l06-package-six-capability-focused-66-of-67-fail.log`。失败为既有
object-property补全复杂度合同：10000个声明的语法上下文查询观察36次
checkpoint，超过原`<20`断言；定向重复仍36，0/1 FAIL、2,982.138247 ms，
`.bench/l06-checkpoint-complexity-repeat-red.log`。未放宽断言或更改测试。
加载元数据逐路径调用原边界产生额外固定检查点；新鲜度 helper改用既有
CooperativeWork的64单位间隔，入口/出口仍立即检查取消，各实际身份仍
完整核验，不新增cache或重盖旧身份。原定向合同1/1 PASS、退出0，
2,935.959034 ms，`.bench/l06-checkpoint-complexity-green.log`；类型/构建
通过，完整同一联合正在重跑，不由一个GREEN消除先前失败账。

相同五文件联合重跑67/67 PASS、退出0、无fail/cancel/skip/todo，
157,049.428775 ms，`.bench/l06-package-six-capability-cadence-focused-67-green.log`。
22项底层compiler边界/取消测试与真实LSP合同分开计；不把它们全部称作
公开stdio合同，也不以此代替阶段完整check:fast。

GREEN后把六项package合同凝聚到
`tests/semantic/resident-session-interactive-inputs.test.mjs`，原名称/完整断言
保留；交互主入口343、输入入口132、共享会话模块176行。新增入口登记先
tooling RED：discovered test has no layer，3/4 PASS、退出1；原始
`.bench/l06-interactive-inputs-layer-registration-red.log`。明确纳入bundle-e2e
及fast后4/4 PASS，171个入口、bundle75；
`.bench/l06-interactive-inputs-layer-registration-green.log`。旧164个fast入口
是L05起点，新增入口不得排除；两个入口全部公开合同正在复核。

两个入口抽取后的15项真实stdio合同15/15 PASS、退出0、
37,292.439620 ms，`.bench/l06-interactive-inputs-split-public-15-green.log`。
随后诊断合同单独验证未通知package切换：独立冷进程的v2文本应有完整
2322 code/range/message，热进程却成功发布v2空诊断；0/1 FAIL、退出1，
2,031.713215 ms，`.bench/l06-unnotified-package-diagnostics-red.log`。
diagnostics返回前消费同一加载配置见证，未知输入经既有协议错误报告而
不发布伪当前空诊断；通知后的v3完整payload恢复。单项1/1 PASS、退出0，
2,329.410268 ms，`.bench/l06-unnotified-package-diagnostics-green.log`。
正常诊断保持开启，未改变debounce/重调度、预算和当前版本保护。

SDK/runtime配置合同使用正常1024MiB的选定政策，独立冷SDK-second为
完整基线，再在同一暖进程中切换SDK与恢复。六类payload保留URI/UTF-16、
markup、signature参数/激活位置、补全全字段、declare来源元数据和同句柄
resolve；v2/v3权威overlay与诊断精确，原工程导航仍有效。首次冷oracle
漏写completion的declare modifier，原始
`.bench/l06-sdk-completion-oracle-modifier-omission.log`，不算生产RED；
补齐后直接1/1 PASS、退出0，3,161.878449 ms，
`.bench/l06-sdk-configuration-all-payloads-green.log`。小SDK metadata version
仍为test，这不是API24/native或最终readiness毕业；真实SDK留在D。

完整member completion/resolve的ON/OFF对照扩为正常、选定L03政策与
选定政策trace OFF三配置，全部语义字段和同句柄保持；同一公开case
1/1 PASS、退出0，6,819.176158 ms，
`.bench/l06-member-completion-three-profiles-green.log`。正常1024MiB未变。

references在途合同保留原2000ms功能延迟，在默认组合和选定政策各运行
一次。实际batch启动且尚未终态时四类导航/completion完成，编辑使旧refs
唯一stale，最新两种声明策略完整恢复并见证物理verifier启动；1/1 PASS、
退出0，13,341.540015 ms，`.bench/l06-references-inflight-two-policies-green.log`。
这是一项case/两个配置，不冒称P95或性能改善。

取消合同同样扩至正常/选定政策/trace OFF三个独立配置，并增加有效
completionItem/resolve早期取消；六类每次唯一-32800、无result，原句柄
resolve与完整导航恢复，正常退出后无第二终态。1/1 PASS、退出0，
3,701.758429 ms，`.bench/l06-six-kind-cancel-three-profiles-green.log`；
仍只宣称早期取消，不把这些样本当compiler-in-flight抢占或重复资源soak。

snippet-capable/non-snippet客户端的完整插入与resolve合同扩至相同三配置，
1/1 PASS、退出0，7,520.032017 ms，`.bench/l06-snippet-three-profiles-green.log`。
同名auto-import的来源、完整编辑应用、v2诊断/definition和旧句柄拒绝也
在三配置逐项保持；1/1 PASS、退出0，4,601.827822 ms，
`.bench/l06-autoimport-three-profiles-green.log`。均为一项公开case的多配置，
不伪称新增六个独立test或生产功能。

物理Worker替换合同保留原正常配置，再加选定政策的64MiB功能qualification：
实际L3驱逐、old/new threadId不同，v2/v3 overlay、导航、2322范围与最新
诊断完整恢复。1/1 PASS、退出0，6,573.137230 ms，
`.bench/l06-worker-replacement-two-profiles-green.log`。64MiB只使小夹具
满足实际压力回收资格；正常预算1024MiB、滞回及自动替换默认关闭未改变，
不将此低预算样本用作真实工程资源校准。

当前主入口378、输入入口275、支持176/64、输入保护25行；TypeScript
service3470行，相比本轮起点3489仍减少19行，超500的剩余迁移债务保留。
最新输入/预算组合的联合回归待终态；D/E仍未完成，未从这些functional
样本推导整体内存收益、readiness或发布资格。

最新十文件联合103/103 PASS、退出0、无fail/cancel/skip/todo，
220,646.655177 ms，`.bench/l06-input-policy-latest-focused-green.log`。
包括17项交互公开case（各自多配置不重复计数）、当前SDK/诊断/Worker合同、
L05独立implementation、底层补全配额/复杂度/取消和显式入口登记。
没有用focused替代阶段冻结后的完整check:fast；D/E仍NOT_RUN。
git diff --check通过，源码/测试无临时DEBUG-l06日志。真实Settings副本
干净且HEAD仍为ecc550dfaed880e04e38a2477eb7235cd50475b9，仅只读定位
后续多能力目标，未预查询这些目标或提前固定尚会变化的构建指纹。

## 多能力回放工具

沿用prepared回放器，不新建第二套计时/RSS/诊断owner。原24项CLI合同
先24/24 PASS、20,437.510008 ms，
`.bench/l06-prepared-tool-parent-24-green.log`。GREEN后把临时固定工程、
输入pins和CLI启动抽到`tests/support/prepared-suite-fixture.mjs`，入口491→439行。
第一次相对导入转录错误单独保留为fixture-import-transcription-fail，修正后
同24项24/24 PASS、20,223.410417 ms；不是生产语义RED。

新增交互CLI入口先登记RED：discovered test has no layer；明确加入
unit-contract/fast后登记4/4 PASS，172入口、unit83/bundle75，未排除新测试。
hover、signature、completion及独立completionResolve分别由真实CLI
QUERY_KIND拒绝开始RED→GREEN，原始feature-red/green日志均在`.bench/l06-prepared-*`。
完整JSON深比较保留markup/range、参数/激活位置、edit/sort/snippet/
isIncomplete、来源与文档；只校验并移除单一UUID会话data，不删除语义字段。

resolve引用前一条已声明、同快照且完整匹配oracle的completion实际句柄；
唯一selector匹配、返回同一data后才归一化。每条completion/resolve独立
计时、计入原分母，stdio transcript证明无隐藏预查询。无效/语义data、
替换UUID、编辑后的旧来源均明确判错。selector字段重排曾错误接受
同一resolve为新目标，真实RED→固定语义身份后在启动前DUPLICATE_TARGET，
见`.bench/l06-prepared-resolve-identity-red.log`及green；未用重复目标稀释未查桶。
夹具函数抽取的作用域转录错误单列scope-transcription-fail，修正后的原合同
通过，不作为工具或生产行为RED。

最新九文件工具联合48/48 PASS、退出0、无fail/cancel/skip/todo，
60,398.634694 ms，`.bench/l06-prepared-tooling-joint-green.log`；原Location、
超时分母、正常诊断、L3、Worker回收、GC/诊断Worker pins和独立implementation
冷发现合同全部保留。工具仍报告READINESS_UNSUPPORTED，未放宽任何
L08门禁。多能力独立冷oracle与当前真实Settings ON/OFF仍待执行，不把
这48项边界夹具测试当作D的真实工程证据。

## 独立冷发现与编辑基线

现有冷发现CLI补齐definition/typeDefinition、hover、signature、completion
和resolve，分别从INVALID_MANIFEST或QUERY_KIND的真实工具RED开始。
完整结果跨两个独立进程深比较；completion只移除已校验的随机UUID，
resolve明确记录一次前置completion及其耗时，返回句柄须与实际来源一致。
六项冷发现合同6/6 PASS、9,493.480324 ms，
`.bench/l06-discovery-navigation-green.log`。这些新增合同使用边界夹具，
原implementation合同仍运行生产stdio；不能据此宣称真实Settings已验收。

编辑冷基线新增固定v2 overlay及changes摘要，原磁盘SHA仍必须匹配。
真实工具RED为SYMBOL_POSITION，见`.bench/l06-discovery-overlay-red.log`；
最小实现通过didOpen原文本、didChange v2，再取当前完整结果和v2诊断，
不修改工程磁盘。原错误参数名和transcript误断言的两次转录失败另存
overlay-initial-failure和overlay-transcript-assertion-failure，不算生产RED。
修正后全部七项7/7 PASS、11,839.381430 ms，
`.bench/l06-discovery-overlay-green.log`；两进程overlay结果一致、磁盘不变，
changes摘要漂移在启动前拒绝。

最新九文件联合54/54 PASS、退出0、无fail/cancel/skip/todo，
67,725.463594 ms，`.bench/l06-prepared-discovery-joint-green.log`。
先前沙箱禁止ps导致外部RSS采样无首个样本，该次运行已中断并完整保留
`.bench/l06-prepared-discovery-joint-sandbox-interrupted.log`。只改变运行权限后
相同命令通过；未改工具、超时、分母、预算或断言。D/E继续以当前真实
多能力控制及冻结后的完整回归为准，不由54项工具合同替代。

## 完整回归发现的删除重试误拒绝

修复前构建完成16个独立冷基线进程和四组真实控制62/62 exact，详见
[固定构建报告](../reports/2026-10-09-resident-l06-budget-policy-integration.md)。
冻结315份测试/工具、172入口（fast166）后首次pnpm check:fast发现既有
document-store取消/删除重试合同FAIL；已失败的回归中断，原始分段日志为
`.bench/l06-full-output-part-{000,001,002}.log`，不宣称完整回归通过。

定向命令为node --test --test-name-pattern='cancellation at workspace assembly
preserves' tests/document-store-cancellation.test.mjs。父HEAD仍为1b910152；
定向0/1 FAIL、3,378.898882 ms，错误为SemanticInputUnavailableError，原始
`.bench/l06-deleted-dependency-retry-red.log`。现有检查点和删除delta断言均
通过，最终define重试误拒绝；定向witness/root探针再次复现，定位compiler
配置仍当前，package proof在canonicalRoot缓存realpath上使用目录内容stamp。
删除普通源码改变root目录mtime，不是目录路径身份或package配置变化。

LoadedConfigurationWitness新增实际加载的路径身份见证，仅canonicalRoot
的realpath使用。目录identity保留dev/ino/mode、词法link、实际physical路径，
内容mtime不冒充路径身份；加载前后仍使用完整guard，根替换/retarget和
未知输入不能重盖旧proof。文件、目录枚举、负路径、metadata内容的原见证
保持完整，两个见证集合共享4096路径上限，取消checkpoint和reset仍保留。
未移除六类输入保护，未返回伪空答案，也未更改既有测试断言。

原合同1/1 PASS、3,602.985153 ms，
`.bench/l06-deleted-dependency-retry-green.log`；LocalPackageResolver497行、
LoadedConfigurationWitness156行，原超限测试未修改，全部临时
DEBUG-l06-deleted-dependency已清除。组合仍待终态，新产物身份必须重新
固定和验证D/E；修复前62项及原冻结不冒充新构建收口证据。

新构建十四文件联合176/176 PASS、退出0、无fail/cancel/skip/todo，
429,737.746972 ms，`.bench/l06-path-witness-focused-terminal.log`。保留原十文件
L06/L05/诊断/SDK/底层取消和登记合同，额外完整运行document-store取消、
local-package-resolution、references-anchor-reuse和semantic-l2-rearm-witness。
直接覆盖删除重试、链接/配置变化、逃逸拒绝、未通知package保护和L03
政策；底层/适配器合同与生产stdio合同分开计，不把176项全部称为公开LSP，
也不以focused替代新的完整check:fast。

修复后新16个冷进程全部复核通过，全部canonical语义payload与修复前
也一致，v2诊断、输入pins及产品退出0保持；四个新固定构建控制62/62
exact、两对完整payload/最新诊断/目标池/pins深比较一致，见
[修复后真实对照](../reports/2026-10-09-resident-l06-budget-policy-integration-v2.md)。
当前产品输入c0200935a9fe93c27082198e53d03adf316529759a716897a03125890f95e440，
旧d7015d45构建的报告/pins不重写。D已具备新构建直接证据，raw readiness
仍FAIL/READINESS_UNSUPPORTED，最终指标留L08。

再次冻结315份测试/工具、172入口（fast166）及40份本轮历史/当前清单和
oracles，`.bench/l06-stage-frozen-inputs-v2.json`；该轮完整pnpm check:fast
后来发现下一节的目录身份误拒绝并中断。E未取得终态GREEN，不能以176项
focused或该固定构建62项真实请求替代。

## 无 SDK 首次补全的目录身份误拒绝

第二轮完整check:fast通过原删除重试位置，但既有生产stdio文件变更合同
失败。命令node --test --test-name-pattern='watched create delete and rename
are visible' tests/lsp-workspace-file-changes.test.mjs定向0/1 FAIL、
1,147.065895 ms，`.bench/l06-watched-source-immediate-red.log`；实际失败在
首次beforeCreate补全，尚未发送任何文件变更，错误为固定-32803，不是
watcher排序问题。已失败的whole中断，原始分段为
`.bench/l06-full-v2-output-part-*.log`，不宣称终态GREEN。

实际Worker中的定向probe显示root目录内容stamp变化，路径实体与physical
realpath未变；调用栈锁定HarmonyProjectModel.load的physicalPath，而非
已修复的package canonicalRoot。未重建Worker的首次probe不算有效定位，
重建后的拒绝与调用栈保留在`.bench/l06-watched-witness-probe.jsonl`及
watched-source-rebuilt/root-probe-red日志。physicalPath只读取realpath，
因此改为既有observePath路径身份见证；文件/负路径仍完整、目录枚举和
metadata的observe保护不变，没有跳过输入保护、补全合同或断言。

去除全部DEBUG-l06-watched-source临时源码、重新构建后，该文件全部七项
真实生产stdio合同7/7 PASS、退出0、无fail/cancel/skip/todo，
12,421.520698 ms，`.bench/l06-watched-source-full-terminal.log`，覆盖立即
create/delete/rename、嵌套/overflow/symlink输入及bounded watcher注册。
HarmonyProjectModel383行、LoadedConfigurationWitness156行，未扩大文件。
组合与新产物固定构建重测继续；第二轮62项和其pins保持历史身份，不能
冒充这次修复后的D/E收口。最终500ms/内存/ready仍留L08。

当前十五文件联合183/183 PASS、退出0、无fail/cancel/skip/todo，
440,212.746370 ms，`.bench/l06-project-path-focused-terminal.log`。
包含前一十四文件176项和完整公开文件变更七项；17项L06交互case、
早期取消/在途references/物理Worker恢复、配置/SDK/package未知输入、
补全配额/复杂度及删除重试均保持。该联合不替代新固定构建D和完整E；
后续代码、测试、工具保持冻结，历史两次whole失败与旧pins保留。

第三轮固定构建真实D四进程62/62 PASS、新16个独立冷进程全部通过，
配对完整payload/最新诊断/目标池/pins一致，实际Program复用成立。
第三轮whole随后发现SDK普通engine热查询回归，已失败并停止，不能
将其计为whole成功。`tests/sdk-discovery.test.mjs:146`原合同定向复现：
100个新importer触发1600次配置路径探测，期望0；0/1 FAIL、退出1、
4,233.585717ms，`.bench/l06-sdk-warm-red.log`。父HEAD仍1b910152。
命令为`node --test --test-concurrency=1 --test-name-pattern='warm SDK queries' tests/sdk-discovery.test.mjs`。
完整运行的部分工具输出发生截断，`.bench/l06-full-v3-failure-observation.log`
明确记录丢失，不将分段文件称为完整原始stdout。

原因是L05为生产registry保护配置而加入的无条件witness，被L06逐能力
返回保护消费，连直接构造的原generation-fixed SDK engine也逐请求验证。
LocalPackageResolver暴露既有witness是否启用；engine只在resolver已显式
管理配置或residentReferenceReuse启用时捕获compiler witness。生产registry
一直显式启用，ON/OFF、R-09 OFF和trace OFF均不跳过保护；直接engine保持
原generation固定选择合同。没有新环境flag、缓存、语义owner或探测API规避。
原测试1/1 GREEN、退出0、3,317.962497ms，`.bench/l06-sdk-warm-green.log`；
类型/构建通过，LocalPackageResolver499、TypeScript service3470行不增长。
当前十六文件联合194/194 PASS、退出0、无fail/cancel/skip/todo，
440171.248804ms，`.bench/l06-sdk-boundary-focused-v4-terminal.log`。
生产registry的六类未通知package拒绝/正常诊断恢复、SDK配置、取消及
Worker恢复均保留；直接engine原100新importer零配置探测合同通过。
修复改变身份，第三轮D保持历史。第四轮当前构建重新运行16个独立冷
进程，8份完整oracle均VERIFIED且与前轮payload一致；四进程真实ON/OFF
62/62 PASS，两对完整payload、最新诊断、目标池和pins deep-equal，
实际Program复用/成本/RSS在[当前报告](../reports/2026-10-10-resident-l06-budget-policy-integration-v4.md)
记录。raw readiness FAIL/READINESS_UNSUPPORTED不改为最终成功，
OFF单轮峰值超过正常软预算如实交L08，不推导稳定内存收益。
重新冻结315测试/工具、172入口（fast166）、80历史与当前benchmark输入
和40份修改文件，`.bench/l06-stage-frozen-inputs-v4.json`；第四轮完整
pnpm check:fast运行中，仍待终态GREEN、身份复核及A～E审计。

第四轮完整`pnpm check:fast`实际1488/1490、退出1，无cancel/skip/todo，
2037442.497539ms；`.bench/l06-completion-full-v4-terminal.log`及分段001～035
保存终态，part005的工具传输截断单独列在
`.bench/l06-full-v4-output-truncations.json`，不冒称完整逐字stdout。
失败为target首次合法definition被-32803拒绝、canonical owner重建后的
补全被同一保护拒绝。第四轮D62项保持历史，不再当作新修复构建的D/E。

定向两项复跑1/2：target当次通过、owner稳定失败，原始
`.bench/l06-target-owner-v4-focused-red.log`。owner拒绝路径为旧ProjectModel
捕获的workspace/build-profile缺失见证，physical owner仍指向first而实际
已切second；实际LS已重建，但model没随已确认的owner重建失效。原始
`.bench/l06-owner-witness-probe-red.log`。仅在canonical-owner-change边界
invalidate对应ProjectModel，避免重盖旧证据或清空其它根。原合同1/1
GREEN、退出0、5233.587015ms，`.bench/l06-owner-canonical-model-green.log`。

target先在重复第4轮复现，再在带调用栈的第6轮复现，原始
`.bench/l06-target-witness-probe-v4-run-4.log`及
`.bench/l06-target-stack-probe-v4-run-6.log`。真实Worker栈锁定
TypeScript getDefaultTypeRoots的directoryExists，而非target通知次序：
临时父目录的node_modules/@types实际缺失，加载窗口只有父目录sibling
变化，却被通用内容加载guard永久标为unprovable。此前单次GREEN不据此
关闭竞态；未提高等待或放宽原target合同。

新增真实Content-Length/stdio稳定反例使用隔离Node preload，只在真实
Semantic Worker的私有fixture目录stat边界创建无关sibling并改变父stamp；
directoryExists仍真实返回false，磁盘无node_modules，不伪造语义响应。
四类导航及最新诊断要求完整当前payload。0/1 RED、退出1、909.053459ms，
`.bench/l06-presence-sibling-public-red.log`；父HEAD仍1b910152。
`node --test --test-concurrency=1 --test-name-pattern='L06 absent type roots' tests/semantic/resident-session-interactive-inputs.test.mjs`。

LoadedConfigurationWitness为真实布尔存在性读取增加observePresence：
实际路径/链接/实体和存在状态须一致，false不消费临时目录内容；目录枚举、
文件读取及非布尔读取仍保留完整加载窗口guard。true的missing→present→
missing不能成为负证据；实际已观测缺失ancestor用于去重，合并4096容量
不变。两处compiler directoryExists共享同一薄适配，不新增环境flags、
checker/cache/语义owner或读取预算。第一个公开合同1/1 GREEN、退出0、
961.188977ms，`.bench/l06-presence-sibling-public-green.log`。

随后增加真实stat返回true、目录已撤回的独立合同：必须-32803/no result，
通知后最新v2四类完整导航及诊断恢复。两项2/2 PASS、退出0、1922.664182ms，
`.bench/l06-presence-sibling-transient-public-pair.log`，证明没有用当前缺失
重盖瞬时正读取。所有DEBUG-l06-target-owner源码和临时诊断已移除；
类型/构建通过。TypeScript service3470不增长、registry498、resolver499、
witness172、目录适配18、输入测试319、隔离preload34行。
当前十九文件联合正在复核，加入owner/原target及完整reference负路径/
目录容量合同；仍待新固定构建D和完整E，不借用1488或旧194为成功whole。

十九文件联合251/252、退出1，无cancel/skip/todo，600309.394ms，原始
`.bench/l06-presence-owner-focused-terminal.log`。owner、原target和19项L06
公开case通过，但原observed-directory容量合同warm实现失败；定向重复
0/1 RED、退出1、5143.038865ms，
`.bench/l06-presence-directory-capacity-repeat-red.log`。定向probe实际记录
configuration-witness-capacity、retainedPaths4096、probe-package-510.js，
`.bench/l06-directory-capacity-probe-red.log`；不是时延或资源资格假设。

新的presence只记路径身份，未保留原实际观测到的目录full stamp，原负
child查找因而逐包占用。修复仅对实际true且完整before/after stamp稳定的
目录保留该原始full证据；后续实际负child可复用精确相同的已加载owner
stamp，旧stamp不同仍拒绝，绝不在cache hit重盖。presence-only及内容
记录共用原4096上限；不猜测目录listing、不新增cache owner、提高容量或
省略负路径。800缺失descendants、800缺失package/目录变更、false sibling、
true瞬时目录四合同4/4 PASS、退出0、40661.596058ms，
`.bench/l06-directory-presence-capacity-focused-green.log`。临时DEBUG-l06-dir-capacity
已移除、support恢复原158行。当前witness180行，类型/构建通过；相同
十九文件联合重跑中，仍须新D及完整E，不借用局部GREEN或旧whole。

相同十九文件终态252/252 PASS、退出0，无fail/cancel/skip/todo，
615962.51742ms；`.bench/l06-presence-capacity-final-focused-terminal.log`
及分段日志保存完整工具返回。19项L06公开case、原target/canonical owner、
reference加载/负路径/目录容量、原SDK零探测和其它输入/取消合同均通过；
不将252项都称作公开stdio，也不将其代替whole。代码/测试/工具随后保持
固定，当前第五轮真实D及完整E继续，所有旧pins和四轮失败保持历史身份。

第五轮固定构建16个独立冷进程全部通过：八个完整oracle各DISCOVERED与
VERIFIED，payload与上一轮相同但本轮产物/pins独立固定；原历史不覆盖。
四个Settings/API24控制62/62、两对完整payload/最新URI版本诊断/目标池和
全部pins一致；实际Program ON复用、OFF重建，不以答案cache推断。
[本轮真实控制报告](../reports/2026-10-10-resident-l06-budget-policy-integration-v5.md)
保留trace/timing分离、准备/完整响应/RSS及raw readiness FAIL；产品子进程
退出0，CLI退出1来自不支持的最终readiness，不更改分母或毕业判断。

随后2026-10-09T18:17:33.475Z冻结316测试/工具、172登记入口（fast166）、
100份v1–v5基准输入及42修改文件，`.bench/l06-stage-frozen-inputs-v5.json`；
测试/工具聚合23241a120daf65851f408a21e2546322017931a26a2c4801b949a61a120bc05d。
该全新pnpm check:fast最终1492/1492 PASS、退出0，无fail/cancel/skip/todo，
2039816.131497ms，2026-10-09 18:52:11 UTC终态；类型/构建/release前置通过。
`.bench/l06-completion-full-v5-terminal.log`及分段000–057保存返回输出。
终态冻结身份全部一致，四份真实报告初始/postflight pins实际核对相同；
`.bench/l06-completion-post-full-identity-v5.json`和完成摘要保留检查。
[完成审计](../reports/2026-10-10-resident-l06-completion-audit.md)A～E PASS，
L06阶段DONE/default-off，接续用户授权L07；最终产品门禁仍在L08。
运行输出逐段保留，part008有28521tokens/25000预算的传输截断；
一次观察工具在消费stdout后因累计值类型错误而失败，
该段无法恢复，`.bench/l06-full-v5-observation-gaps.json`明确记录，不称
完整逐字日志；最终判定只使用根命令实际终态及统计，不用可见PASS行计数。

A：完整payload与独立oracle/完整基线一致。导航范围、hover markup/range、
signature参数和激活位置，以及补全edit/sort/snippet/isIncomplete/resolve
都保留；此前未查目标须有实际LS/Program复用见证，不由答案缓存推断。

B：overlay/API、配置、SDK/package等代表性变化后使用当前输入；
版本化诊断code/range/version准确，旧resolve句柄不得应用。未知输入
完整安全回退或显式错误，合法补全截断须如实isIncomplete。

C：选定L03 RSS/成本/压力组合、正常1024MiB/原滞回/lease保持；
取消、编辑旧代、驱逐和物理Worker恢复安全，references实际在途时
交互能完成。trace OFF、默认关闭和完整安全路径均保留。

D：当前固定构建Settings/API24代表性多能力ON/OFF对照，未查/稳态/
编辑/恢复完整结果与最新诊断一致。trace与timing分开，实际复用、
准备成本、完整响应、RSS及工程/SDK/backend/产物pins不变均记录。

E：阶段实现冻结后的完整pnpm check:fast GREEN、终态输入身份一致，
完成审计、实验配置/回滚、失败记录和L08风险交接齐备。L05的1467项whole
是当前起点，不替代L06收口后验证。

逐项公开characterization或RED→最小GREEN后才追加下一项；必要refactor
只在GREEN时进行。源码/测试/脚本≤500行，既有超限源码如需修改必须
同时凝聚职责并保持行数不增长。真实工程重放串行，不提高预算、改超时、
静音正常诊断或缩小合法工程范围。

500ms/P95、最终内存下降、semantic-ready、长期soak、PSS/DevEco、
100k及跨平台/发布毕业在L08；如实保存不足和失败，不阻塞本阶段实施。
