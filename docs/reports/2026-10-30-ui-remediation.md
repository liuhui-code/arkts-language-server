# Windows UI 补全与导航修复实施记录

状态：尚未整体验收通过。C1/C3真实UI失败促成WUI-006/008修复；C4聚焦89项、Windows最终91项通过，但正式UI仍因晚到导航/输入竞争（WUI-009）失败。C4完整2133/2136的旧契约测试失败已保留；严格迁移后最终完整2136/2136、Windows最终91/91。另有新SDK诊断RED0/1、真实UI仍FAILED，不能称全部问题已解决。
最初父提交`4859f76c46265a885332d7141c99698bf749c61e`；外部main推进后当前父为`78a3158ed2f0400c51111c2d51ddd97c443c202e`，分支`fix/windows-ui-independent-semantic-reads`。
保留既有ADR0030/0031、原53分27秒FAILED及全部未提交工作；本轮不合并、发布或部署日常Zed。
[ADR0032](../adr/0032-completion-item-identity-and-inferred-roots.md)、[TDD](../tdd/2026-10-30-ui-remediation.md)、
[原UI现场](2026-10-30-windows-zed-ui-endurance.md)。证据根`.bench/windows-ui-remediation-20261030/`。

## 采用机制与根因

三类问题分开处理，不能把没有Worker退出的慢操作归因于Worker换代。

| 问题 | 已确认原因 | 实施及边界 |
| --- | --- | --- |
| WUI-004 有效详情退回通用描述 | method+URI lane把同文档不同item误判为互相替代；原510次详情487次superseded，文档未变 | 按已认证UUID隔离；同item共享在途操作、消费者独立取消；文档版本/关闭/磁盘SHA和响应前校验保留 |
| 修复后预取背压边界 | 放开逐项身份后，128项有效预取出现57份Worker队列满；不能靠抬高64项上限处理 | 专用详情队列逐workspace串行准入；最多512项沿用句柄上限；取消等待项立即移除，活动项等真实结束再让位；无新最终结果缓存 |
| WUI-003/005 一部分导航/后台长尾 | 请求5957父端等43518.557ms；同revision896前序18高亮/17codeAction等操作反复将已加载依赖提升为新root，造成1.2–1.5秒Program更新 | 将推断入口与resident文本分开；真实Program、snapshot、磁盘身份及compiler文本均一致才保留原版本和根列表；不是取消全量正确性证明，也没有改变有限公平 |
| WUI-002 Worker换代 | 前轮真实UI单Worker无退出；已有ADR0031修复有限同步取消阶段的过早退役 | 保留既有有限同步/终态交接与绝对截止、恢复预算；本轮继续验证，不把每个慢响应算新世代 |
| WUI-006 正常F12被自动请求取代 | 同method+URI隐式替换，没有区分独立请求所有权 | 普通、disk、call hierarchy及workspace symbol统一独立读取，保留真实取消/输入失效和最终围栏 |
| WUI-008 取消修复后真实突发溢出 | 正常Zed在1.2秒发80个不同参数，旧全root64条计数不适配 | 提取64源码归属/4MiB等待输入准入；明确替代旧计数，复用原调度与超载拒绝，不提高RSS/超时/规模阈值 |

Context7对LSP、vscode-languageserver、SQLite的resolve均传输失败，收据`official-research.json`；
已查官方[LSP item resolve](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/language/completion.md)、
[VSCode TypeScript逐项promise/消费者取消](https://github.com/microsoft/vscode/blob/main/extensions/typescript-language-features/src/languageFeatures/completions.ts)、
[安装基线相应TypeScript4.9 Host同步合同](https://github.com/microsoft/TypeScript/blob/v4.9.5/src/services/services.ts#L1251)、
[clangd读写顺序与取消](https://clangd.llvm.org/design/threads)。这里复用已有合并器和单Worker，不照搬300ms延迟、C++线程模型或重写调度框架。

## 实现位置

- `registerCompletionHandlers`：`src/lsp/register-completion.ts:63/79/83`，服务端UUID同时用于lane与coalescing，执行前检查记录生命周期。
- `SemanticRequestRunner.run`：`src/lsp/semantic-request-runner.ts:98/112/141`；lane定义`request-freshness.ts:28`，disk-source使用同一规则。
- `CompletionResolutionQueue.run/clear`：`src/lsp/completion-resolution-queue.ts:21/64`，共享现有512句柄上限，位于coalescer之后、Worker准入之前；C4共享Worker准入已改为64来源/4MiB，见决定D。
- `TypeScriptLanguageServiceEngine.prepare/updateScript`：`src/core/types/typescript-language-service.ts:284/1733`；
  `TypeScriptHostRoots.observeProgram/snapshot/promotionVersion`：`typescript-host-file-names.ts:55/61/71`。
- `recoverableLanguageService.synchronize`：`src/semantic/backends/ohos-typescript/recoverable-language-service.ts:64/80`，
  仅实际getProgram返回后登记；owner失效清除证明。未新增主动getProgram或SourceFile全量遍历。
- `RequestFreshness.startConcurrent`：`src/lsp/request-freshness.ts:60`；call hierarchy专用两入口和workspace symbol同样使用独立请求。
- `SemanticWorkerPendingReads.add/take/remove/drain`：`src/semantic/semantic-worker-pending-reads.ts:16/29/35/44`，计量在dispatch/取消/失效/故障/dispose结清。

## 可复现验证

`completion-resolve-lifecycle.test.mjs`公开stdio11项通过：不同项并发、同项共享、128项预取、排队取消、编辑/关闭重开、
旧版本/恶意句柄/真实mutation等。`partial-completion-admission.test.mjs`20007源文件反例旧Program1→2，
修复后多次相同输入查询仍Program1且根数不变；实际未保存类型编辑、关闭回盘及disk watch新类型仍生效。
B不以只比source SHA证明安全，要求SourceFile实际持有读取时登记且身份未变的snapshot，生成后compiler文本逐字一致。
独立诊断保留`promotion-program-observations.json`及`promotion-diagnostic/`：20007总源码中实际Program项目文件5、
总SourceFile58（另含SDK1、标准库52），三个实际定义的Program/checker均1、根均4；后二次createProgramEvents均0。
对应编译器回调39.91/4.87/2.62ms仅是该夹具插桩观测，不冒充真实30K项目端到端收益或普通计时。

最终Mac聚焦34/34：`final-targeted-v2.log`；首次完整默认`pnpm check:fast`记录`check-fast-final.log`，2113项中2110通过/3失败、exit1。
最终冻结源码完整复跑`check-fast-verified.log`已exit0，**2113/2113**，fail/cancelled/skipped/todo均0，3278904ms。
`check-fast-verified-summary.json`保留最终汇总；689源码/测试及五份运行产物复核MATCH，`git diff --check`通过。
455文件冷目录3秒独立门槛继续按用户授权跳过，未宣称该项通过。
该轮完整检查随后发现SDK观测fixture三项失败：插桩在整个包中唯一匹配的语句因合法新增HostRoots变为两处，
在产品代码执行前主动throw。`sdk-counter-compile-proof.json`实际记录异常及加载栈，公开RED保留。
改为定位唯一驻留引用校验类后，Mac三项与Windows三项分别GREEN，96输入重读0、身份192/每输入2的断言未改。
这里只改观测fixture，冻结产品产物不变；第一轮完整失败不能抹掉或被聚焦结果代替，最终完整复跑另记。
Windows最后一轮详情逐次数据汇总在`windows-public-completion-analysis.json`：128项有效预取全部真实签名、0错误，
请求端到端中位801.32ms、最大1482.81ms（含排队）；普通两个item对照4次中位22.24ms、最大59.32ms。
这是私有SDK受限突发/小夹具数据，不是实际Photos UI时延；不能宣称全部500ms以内。
其他故意取消/伪造句柄用例的-32800/-32602为明确断言的协议终态，统计时不误算成正常操作故障。
初次沙箱进程采样EPERM及中间主动停止的check保留，不能算最终通过。无Rust修改。
TypeScriptLanguageService从3085缩至3077行，仍是文件体量迁移债务；新增职责模块均≤500行。
第一候选C1当时另有`legacy-semantic-engine.ts`745行、`semantic-worker-supervisor.ts`725行债务，
两者当时与起始SHA一致；C4后续supervisor已改并提取至716行，不能沿用C1“未改”结论。
最终source/test体量与其余迁移债务在最终核验另列。

Windows最后冻结产物（Node20.19.5、Zed1.25.3、API24 `6.1.1.125` SDK1580声明）：
这里API24指专用UI配置/输入审计；公开回归按各fixture使用私有SDK，不能冒充真实Photos/API24全功能验收。

| 产物 | SHA256 |
| --- | --- |
| server | `55def416a707a01a29be885c93bd461a43ff185dacde5d13db8be255dab802b8` |
| Worker | `bf8433e77e53a280afca48eaa8cb62d9a20ab20a2596a4353e50a09deda78afa` |
| native index（本轮未改） | `9fe04072d48cd29f4bb0f287ed4f18dc102590454bf1e410a44dc63f154fbf4d` |

候选标识`4859f76+working-tree-624c665d34b537c2`，不是新commit；完整文件/源码manifest在`runtime-identity-final.json`、`source-manifest-final.json`。
打包后最终源码/测试清单为`source-manifest-verified.json`和`verified-source-freeze.json`，689文件、manifest SHA
`68258d33f5862f0170d44c36f22ec1b7ca2039ef757904c63d52e7be3c7879a6`（Python sorted-key JSON规范化口径）；
manifest文件字节SHA为`2e887c0248def38d3968582dbd2f91bfaee4c5bda06aab10216e1da044229368`。
与打包时清单三处差异为engine EOF空行、startup夹具生命周期及SDK读计数插桩归属；五份运行产物SHA未变。
`source-after-package-delta.json`是较早的两项差异快照，不替代最终三项清单；Windows两个测试fixture源SHA也已核对。
Windows专用目录`D:\DevSetup\diagnostics\zed-ui-remediation-20261030`；前一候选保留candidate-history，日常安装未动。
初始30287项目输入（30000源码）+1580 SDK字节hash审计MATCH；原始before审计scope文字沿用了“after”模板，
实际时间01:05:23–01:07:07Z在UI输入前，数据未改，不能按该模板文字解释成UI之后审计。

Windows公开回归不同条件分开：

- 普通C临时目录中间候选24pass/1cancelled；独立诊断证实夹具生成65952ms，initialize在65955ms才发送，
  初始化完成、首定义成功、退出0；75秒总截止截断后续轮次。原始失败保留，不归因未测的安全软件。
- 有界异步生成实验仍63336ms、同样失败，实验已排除；原始同步30K/四轮/75秒断言恢复未改。
- 中间候选专用D临时目录3项通过，78秒测试墙钟保留，不冒充最终候选或C条件通过。
- 最终候选专用D完整回归27pass/1cancelled（`windows-final-regressions.*`），30K用例104744ms总截止取消；
  其运行与输入全hash审计有重叠，不能仅据旧C证据断言本次全部原因相同。最终串行补验独立保存。
- 最终候选单独串行3用例仍2pass/1cancelled，30K用例79189.9ms触及75秒总截止，
  `windows-final-startup-serial.*`保留；不能将第一次重叠视为该失败的充分解释。相同D条件独立诊断补具体阶段。
- 最终独立诊断：准备63233ms后才发送initialize，初始化5729ms，前三轮定义1413/1428/1437ms成功，
  第四轮在测试总截止触发shutdown时superseded；1 Worker、0退役、退出0。原始`final-startup-diagnostic.zip`、
  `final-startup-timeout-analysis.json`保留；插桩时间不混入普通基线。
- 测试驱动正式将29998真实噪声文件放到before钩子准备、同临时卷rename进入两源码fixture，实际数量断言30000。
  服务场景仍75秒、四轮、每请求10秒/诊断12秒及全部内容/单终态/Worker断言不变；准备另用75秒hook预算。
  **计时边界改变，不能把新GREEN解释为原“准备+验证总75秒”通过，更没有变更产品超时。**
  `windows-startup-separated-fixture.*`3/3：准备62815ms、服务16848ms、进程墙钟85583ms，四轮/版本37/1Worker/0恢复。
  Node20官方before/after机制与最小probe记录在研究收据；同产物28项整组复测另记。
- 最终整组`windows-final-regressions-separated-fixture.*`28/28、exit0，01:22:32–01:25:18Z；
  无全量哈希审计并行，原失败仍独立保留，使用修正后的测试计时边界，不能称真实UI通过。

## 真实UI状态与验收边界

本轮专用profile/30K隔离副本，已验证InteractiveToken桌面Session5/Default/WTSActive。
01:08:06Z启动专用Zed PID17796，01:08:09Z首次截图前焦点保护停止，前台PID4872为SearchApp；
尚无本轮实际UI输入，不将公开协议测试或仅启动窗口计入UI验收时长。
已请求用户激活专用窗口，测试等待任务只读观测前台，不抢焦点/向其他窗口发送按键。
01:15:34Z另按官方UIA对已确认的专用Zed根元素尝试一次SetFocus，实际IsKeyboardFocusable=false并报“目标元素无法接收焦点”；
`uia-focus-attempt.json`保留。它不是系统辅助功能授权缺失的证据；当前明确阻塞是该窗口不能取得前台。
后续校准/正式UI结果如执行另补；若未执行须保留未覆盖。

本轮等待最终结束：专用窗口始终未到前台，实际键鼠输入0、无formal-start、无wire/LSP启动。
`windows-final-state.json`与`windows-final-evidence.zip`保存证据；三个本轮已停止自动化任务导出后移除，
专用Zed PID17796窗口保留，未关闭或丢弃编辑。事后30287项目输入/1580SDK、两套候选/测试产物及日常安装均MATCH；
Windows最后startup测试SHA `992c00e4ed4128fea3d4ea271737e38de30674444616c68626d300469be3ccd9`与Mac源一致。

后续阶段更新：上述“UI未执行”是截至01:31封存的阶段状态，原件不覆盖。
02:10可见截图确认隔离项目的信任提示；02:13在同一代理内、窗口命中核验后点击当前测试副本Trust and Continue，
父目录信任选项未勾。前台截图及资源采样成功，未再等待重复授权或修改系统权限。
02:14:17真实快捷打开原Picker，relay15344/server6736/Worker1、上述BF哈希、无RSS预算/NodeOptions已核对。
02:16:13实际四宏校准开始；实际UI时长从输入开始计算，不累计之前约一小时闲置/焦点阻塞。
后续校准/正式持续混合结果待补；本阶段运行证据继续append，最终另封存，不覆盖旧阶段ZIP。

计划复用原12类混合操作、种子202610305339、单一UI输入者；前轮Undo/Redo驱动按实际undo事务数修正，
原FAILED保留。强化真实详情断言：选中Log.debug必须取得具体方法签名后才接纳插入成功，通用item不算详情通过。
所有UI动作、Zed生成请求、截图、服务器/Worker/native资源分开记录，未保存内容和真实项目不动。

## 真实UI校准与正式持续测试（运行中）

第一次四宏校准93.100秒/136命令FAILED，保留`calibration-failed-1.zip`及全部截图/帧。
失败来自新增驱动读取观察缓存的顺序：取baseline版本后才refresh，把既有4字输入误判为新编辑。
`calibration-observer-baseline-proof.json`证明检查区间0 didChange，真实debug签名170已先返回；可见截图也显示debug具体签名。
修正入口先refresh，仍严格校验后续版本不变，不改产品或时限；一次真实UI撤销使所有打开文档hash恢复磁盘原文。
第二次calibration2在同一会话完成，02:24:36–02:26:12Z，96.731秒/4宏/145命令，无校准异常。

02:27:34正式12类混合UI开始，计划60分钟，实际起止以formal-start/end及controller结果为准；不累计校准/闲置。
selected Log.debug必须具备实际签名并由Tab插入正确文本；原保存、关闭回盘、移动恢复删除目录、诊断和取消/闲置恢复均保留。
30K完整全局查询/已知SDK目标错误单列，不算功能成功；原FAILED也不被本次校准GREEN覆盖。
本节最终操作/时延/资源和结果待补，不预告正式通过。Mac冻结源码完整复跑`check-fast-verified.log`已2113/2113、exit0。

## 尚存事项

- native首次99%原467206ms，replace约464210ms/commit约330016ms；SQLite提交可能含checkpoint，
  当前不能把整个330秒归因checkpoint，没有Rust/SQLite产品更改，不宣称已解决。[官方WAL边界](https://sqlite.org/wal.html)。
- 30K完整引用/重命名/实现/incoming限制、SDK缺失`@ohos.uiExtensionHost`及SDK目标超时，单列功能缺口，不能算成功。
- 同内容复用减少重复构建，真实依赖闭包增长、新入口、真实编辑及公平队列仍有成本；真实Windows尾延迟须验证。
- 既有根级引用缓存/无关组Host推进等增量性能TODO继续保留；本次修复同输入promotion不代表该TODO已完成。
- 500ms是允许波动的体验目标；默认无RSS预算；测试仅豁免Node2GiB停线，保留整机/磁盘必要保护。
  不更改产品V8、超时、完整性、路径校验、恢复预算或455冷目录性能豁免范围。

### 运行中观测补充（02:37Z，非最终验收）

正式已完成15宏/69断言，仍server6736/thread1，未见退役/恢复或资源保护。
首次99%实际02:14:33.577–02:22:09.918Z，456341ms后进度结束；没有Worker崩溃证据，原生耗时未解决。
Picker的-32803位置明确是缺失的`@ohos.uiExtensionHost`导入（SDK清单无该模块）。
另有SmartPickerDataImpl__copy_003.ts零基35:45（`AsyncCallback<MediaItem[]>`右尖括号）自动定义511，
3508ms后-32803；不能归入上述SDK缺项，直接失败站点尚未测定，保留为待诊断症状。
局部后继显式跳转仍正确，但不把此错误算成功；原始帧/队列/当前源码在`interim-0236/`、`windows-ui-passive-errors-1.stdout`。

## 正式UI失败：跨位置语义请求被隐式取代（WUI-006）

02:27:34.013–03:02:51.693Z，35分17.680秒，第53宏rapid停止；52宏完成、252断言、2637驱动命令，
`formal-result.json`保持FAILED，未凑足60分钟。封存`formal-failure-sealed-1.zip` SHA
`6a7f5788d54c876bd7a41bdc167353b45d46ef55c1ddf87a6c5d521f98858ff7`，3261文件，任何后续实验均在封存后。
最终F12命令开始03:02:50.895Z，实际按键注入03:02:50.911Z，目标ScreenManager.ts零基76:9（Log.info）。请求4516在50.931Z发出，
51.034Z得到[]；无编辑、无客户端取消，父端03:02:51.032Z明确outcome=superseded。
约70ms后的自动定义/类型定义突发查询同文件其他位置（4525–4539），只有末项4539保持并返回自身声明。
最终截图仍停在ScreenManager的Log.info，而未跳到Log.ts；因此不是仅驱动误选了一个已取消旧请求。
根因是SemanticRequestRunner按method+URI调用Freshness.start，把不同位置的有效读取视为替代关系。
完成详情的逐item修复没有覆盖默认读取及call hierarchy专用入口；目前仍单Worker，无退出/保护/OOM。
新增独立stdio回归后统一请求所有权，真实取消/编辑/关闭及现有在途合并、队列边界保持；最终候选须重验。

## WUI-006正式修复候选及复验边界

不是只把取消键补上position：所有独立语义读取、call hierarchy三入口、磁盘读取和workspace/symbol统一逐请求所有权，
不因同文件/相同位置/同方法的后请求作废先请求。内部identityKey只表示逻辑分组，详情及引用保留已有在途合并。
真实取消、编辑、关闭重开、工作区变更和最终身份/版本围栏保留；没有新结果缓存，没有提高物理队列或产品截止。
官方LSP按请求ID取消及TypeScript Session逐request.seq上下文是参考，来源和适配边界见[ADR0032](../adr/0032-completion-item-identity-and-inferred-roots.md)。
Context7再次resolve仍传输失败，原收据`navigation-industry-research.json`保留。

- RED：`navigation-red.log`原10 fail/2 pass，另有workspace symbol独立RED；所有原失败保留。
- 最终新增17项公开stdio回归，Mac聚焦33/33：`navigation-final-focused.log`。
- Windows最终48/48、exit0、无fail/cancel/skip/todo，03:43:48–03:46:55Z：
  `windows-navigation-complete-regressions.*`、`windows-final-regression-attestation.json`。使用fixture SDK，不等同Photos SDK/UI通过。
- 工作期间外部main从4859f76推进到78a3158（PR105/106），保留外部变更后建立`fix/windows-ui-independent-semantic-reads`；
  `external-main-transition.json`记录。本轮没有自行提交、合并或推送。
- 冻结候选`78a3158+working-tree-69c5ffb814738336`，690个src/tests文件；
  server SHA `de22cc02c4371ee3e4b0b108770938d89802d81367876d5bb3f2e5298b2a1539`，
  Worker SHA `bf8433e77e53a280afca48eaa8cb62d9a20ab20a2596a4353e50a09deda78afa`。
  `runtime-identity-navigation-complete.json`含源清单、包、其余产物SHA；Worker未变化是因为WUI-006在父端修复。
- 最终完整`check-fast-navigation-complete.log`重新运行，完成结果另补；旧2113不是该候选最终完整结果。

### 最终候选真实UI：校准通过，索引打开退化待诊断

私有candidate-navigation3/profile/原30K隔离输入与API24 SDK；日常安装未改，缓存未删、同一私有SQLite缓存暖启动。
实际Zed19400、relay17468、server3988、Worker线程1；server/Worker SHA与冻结候选相符，memoryBudget及NODE_OPTIONS为空。
03:51:24.686–03:53:00.062Z完成四宏校准，95.376秒/145命令，无校准异常。
**这只是校准；正式混合复验尚未开始，不将上一候选35分钟加到本候选或预告通过。**

索引03:49:09.883开始，03:49:41.180终态degraded、discovered/indexed均0；原生PID13780随后消失，语义Worker仍存活。
初始资源采样显示native约1.47→6.98MiB及CPU推进，不构成OOM证据；服务层catch未记录底层异常。
私有缓存DB 5439492096字节、WAL 5471430072字节；它们存在不能直接证明损坏或超时原因。
全缓存备份后另做有界原生initialize诊断，保持产品30秒initialize截止不变；原始结果另补。
`windows-final-index-state-1.*`、`final-ui-start-evidence/`保留UI启动、日志、原生资源和0文件终态。

原35分钟正式测试的固定目标池按实际formal-plan是**8个文件**，不能宣称20个独立依赖闭包；多数是Log热点。
原始宏/断言/输入计数仍如前；已知SDK/完整30K全局功能缺口不计成功，不用短校准或公开回归掩盖。


### 索引独立诊断结果与正式复验前提

04:03:06–04:04:12Z整份私有cache备份至Windows `index-before-open-probe`，包含DB/WAL/SHM，未删除或拆改文件。
04:04:12.269–04:04:57.279Z直接native initialize无响应，45秒外部诊断保护停止；不是产品延长超时，亦不能证明原UI相同卡点。
随后独立插桩LSP（不是UI）04:05:50–04:06:31Z实际能够打开并开始catalog；观察40秒后主动shutdown，
捕获的“workspace index closed during cataloging”来自诊断自己的dispose，**并非原UI错误**。
因此目前不能把原0文件直接归为损坏、OOM、永久无法打开或确证30秒超时；服务层缺失原错误日志是取证限制。
`windows-index-probe-result.*`、`windows-index-error-result.*`保存上述不同条件；WUI-007登记待继续定位。

最终候选正式混合复验04:07:14.292Z开始，**不重启当前Zed/Worker**，原8目标/12宏/真实UI操作及已知全量范围用例保留。
`formal-preconditions.json`明确原索引初始化FAILED；只验证该实际退化会话的局部功能稳定性及原修复，
即便宏完成也不能抵消初始化失败或宣称30K全功能通过。原校准、35分钟失败和其他会话不计本次连续时长。


## WUI-008：真实突发暴露全局64条门槛不适配（原失败保留）

C3正式04:07:14.292–04:10:20.698Z，3分6.406秒、5宏完成，进入第6宏前按已观测queue-full主动保护停测。
并非完成60分钟；`formal-result`的直接停止原因Driver stopped/protection与底层30份queue-full分开记录。
04:08:59.606Z首个错误：typeDefinition请求430，43.869ms返回-32603，message含`Semantic worker queue is full`。
此前1.2秒80个不同参数请求：36定义、35类型定义、8高亮、1codeAction，**80个不同输入**，无法靠相同请求合并消除。
关闭回盘宏正常Zed自动流量，非协议压力生成；该次仍server3988/Worker1，无换代/OOM/资源触线证据。

`formal-failure-sealed-2.zip` SHA `5d13ef214a25738da5989a430aa6df99cbf02cabf098eafcdf8caad4b3dcba39`，6404258字节；
`wui008-burst.json`保留首错、完整请求参数及30份错误。全封存后才做额外诊断；8个打开overlay逐字等于磁盘，正常AltF4关闭。
旧9请求回归没有覆盖这个真实负载边界；此前公开48/48不能支持稳定验收。

修复见ADR0032决定D：源码归属与读取位置分离，待处理canonical输入按UTF-8字节受控，
64不同源码归属和4MiB等待输入两项边界；这明确**替代原64条请求计数**，不宣称计数策略未变。
保留同一条原调度队列、有限优先/FIFO、公平绕过、global/mutation屏障和单一终态，
不是新建无界promise外队列或机械调大请求数，更没有改变RSS/V8/产品截止/项目成员上限。

公开80不同位置RED原10份queue-full；新4项覆盖正常突发、单取消、编辑、同版本关闭重开。
最初两个测试把客户端发出编辑等同服务端已处理，87/89失败保留；补真实compiler入口可控屏障，
以等待请求在释放compiler前因公开输入事件终态来证明失效，未放宽“所有仍在途旧结果失效”的断言。
测试helper的preload选项先RED（两个入口未进入），再实现；屏障仅在隔离测试，不写产品sleep或改截止。
修正后相关完整聚焦89/89，`burst-final-targeted.log`；正常80读取约1.1s是小fixture整场，不作为30K/UI性能结论。

C4冻结`78a3158+working-tree-8fff8d3afe576134`，694源码/测试；server SHA
`dd3feefdb5e2011739046c58080858ca0aeb426950b00ec07487435644a1b82d`，Worker仍BF哈希。
`runtime-identity-burst.json`含其余hash与归属；C3完整检查明确SIGINT停止，不计完整通过。
新完整`check-fast-burst-final.log`从04:21Z运行，Windows私有部署/原输入全hash核验及新公开回归、UI另记。
Supervisor725→716行、原supervisor测试1574→1545行，提取有界等待读取及对应测试；仍有超过500行的迁移债务。


C4 UI驱动额外强化：每次refresh保留终态后，若公开响应为-32603内部错误、队列满或Worker不可用，立即封存失败；
原C3曾继续完成部分宏才被被动日志检查发现，不能以某次F12仍成功抵消后台错误。
这里只加强bench检查，不更改产品断言/时间门槛，原controller备份`ui-endurance-controller-before-internal-error-guard.cjs`保留。


C4初次Windows整组57/60失败：新增三个supervisor容量测试用`file:///workspace`作根，
Windows在构造时正确拒绝缺盘符的URI，尚未进入队列行为。原错误、栈和收据`windows-burst-regressions.*`保留。
只将fixture根/子路径改由`pathToFileURL(os.tmpdir()/...)`生成，保留全部计数、字节、取消/失效断言；产品身份校验没有修改。
Mac与Windows该三项分别3/3；Windows整组60项重新串行运行，不能把57+3拼成同一轮60通过。
`runtime-identity-burst-portable.json`、`source-manifest-burst-portable.json`记录原694文件清单上的唯一测试overlay，
旧清单/zip保留，五份运行产物不变。Mac完整检查修正时尚在prepared-suite-diagnostic-barrier，
新测试文件尚未fork加载，`portable-fixture-full-run-loading-proof.json`保留父子PID/串行模式与源码SHA；
最终日志必须实际通过修正版三项，才将该完整检查作为最终证据。


C4 Windows最终整组`windows-burst-portable-regressions.*` **60/60、exit0、fail/cancelled/skipped/todo均0**，
04:28:12.666–04:31:25.178Z，原57/60失败没有覆盖。`windows-burst-regression-attestation.json`绑定server dd3、Worker BF及
最终694源清单canonical SHA `6159d9f3248b127de1fee0d336223514043867d7727da54312ccad35f5ac205b`。
该组是公开子进程/协议与Supervisor合同回归、fixture SDK；真实API24 Photos SDK/UI结果另记。


## C4正式UI仍FAILED：晚到导航改变输入目标（WUI-009）

04:40:53.538–04:43:33.048Z，2分39.510秒、4宏完成/20断言/214命令，第5宏rapid未完成。
原60分钟计划未完成；没有将后续定向操作或进程存活时长相加。没有queue-full、内部错误、Worker换代或OOM，
但界面已出错，不能凭这些计数宣称稳定。`formal-failure-sealed-3.zip` SHA
`0888f33669061ab5f407cc11e2bed36b8b04ef7b3523c71c5c9268bab1b1f1b4`，6149801字节，先封存再实验。

| UTC时间 | 实际事件 |
| --- | --- |
| 04:43:23.356/23.362 | 实际F12注入；AlbumGridItemNewStyle__copy_003.ets零基160:9请求582 |
| 23.465/24.222 | 返回快捷键；打开文件选择器 |
| 24.579 | 开始逐字输入Picker完整路径，原驱动25ms/字符且每字符检查窗口归属 |
| 28.427 | 582在5064.901ms后返回正确Log.ts零基31:9–13；没有针对582的客户端取消 |
| 28.432/28.462 | Zed打开Log；随后路径后缀覆盖选中的info，Log产生didChange版本1起 |
| 29.912/31.415 | 路径末尾已进入Log；原Enter也变成源码换行，最终版本38 |
| 32.563 | 可见截图仍Log，预期Picker；驱动停止，原文件磁盘没有保存该输入 |

这是合法服务器响应晚到后，客户端导航与选择器输入发生竞争；不是WUI-006返回空、SDK符号找错或Worker退出。
安装Zed精确commit `8dd255c3eafb5231056fe4e6f601cedd011f1c93`源码已下载只读并存hash：
`zed-navigation-source-identity.json`。go_to_definition_of_kind等待结果后直接navigate；
目标激活路径读取当前active pane，没有在这条路径检验导航代次。源码支持现场机制，但没有这次UI动态调用栈；
单次真实时序不代表所有客户端情况，最小客户端对照另记。[ADR0033](../adr/0033-client-navigation-ownership-and-ui-input-context.md)
参考官方VSCode状态token/结果前取消围栏，并明确Zed Extension API0.7不提供修改既有导航任务所有权的接口。
本轮没有通过全局取消合法请求来掩盖客户端状态，也没有修改/升级日常Zed。

测试驱动只有窗口PID/前台保护，不足以保证选择器始终获得输入；这同样是测试保护的缺口。
封存后计算精确差异：removed=`nfo`、inserted=`ckerUIExtensionAbility__copy_003.ets\n  `，
与已记录路径后缀完全一致才允许在真实Zed Ctrl-Z撤销。04:50:58Z恢复原Log SHA
`46381c56a20353c9e156ec3a4061b2413e9983d3769c0338866eb91fab03651f`，没有保存/强制丢弃；
所有打开overlay之后均逐字等于磁盘，证据`windows-burst-owned-restoration-proof.*`。

### 残余跳转长尾的直接测量

关闭回盘后的请求463（Picker零基53:20→ScreenManager81）耗时11746.157ms，界面目标正确。
唯一同method/URI/v68、相差1ms的父端enqueue438匹配send及Worker352；队列记录不直接带公开ID，关联口径如实保留。
父端准入到send **11531.117ms（98.17%）**，外层剩余约215.040ms包含准入前、传递、执行/返回/最终校验；其中Worker接收到派发0.140ms，已包含在剩余区间中，
**未进一步分测，不能把其余全当编译时间，也不能把重叠区间相加**。
等待区间包含此前38份dispatch及该目标；记录的20份正定义均Program17、0次createProgram、单份约56–70ms，
另有一个约3.7秒间隔，但该间隔内部阶段未测。没有证据将这一长尾再归为同内容Program重建。
数据`interim-burst-0444/tail-463-evidence.json`；Program复用修复有效不等于整体排队或真实依赖校验成本已解决。

### 新原生诊断的边界

C4索引在04:32:28.035Z以0文件degraded结束，原错误仍未记录；与C3约31秒不同，不能直接判为同一个截止。
独立原生probe2（非UI，非性能通过）04:36:05开始，initialize6352.885ms成功、committedGeneration5；
shutdown答复6353.678ms，退出0在27288.057ms，即答复后约20934ms才退出。
这不是崩溃，也尚未测定关闭内部时间，不能把21秒直接全归checkpoint；产品正常退出1秒等待与该现象的关联需要另证。
该探针的正常关闭改变了私有DB/WAL状态，发生在正式UI前；不同缓存条件已经单列，不能当严格冷态A/B。

04:58:26Z同一server21112/thread1开始**独立定向功能补测**：诊断、保存、关闭回盘、详情、移动恢复、标签及闲置。
此组在输入前等待前一导航终态，保护输入；它明确没有覆盖原快速交错，不替代原FAILED或累加成60分钟。
结果另补。未发布、提交、合并、删除用户缓存或重启用户日常进程。

## C4独立定向补测与移动恢复的瞬时失效

04:58:26.733–05:01:48.586Z，**3分21.853秒、243条UI命令，FAILED**。
诊断出现/消失、编辑保存撤销、关闭回盘/重开、有效Log.debug详情及接受四个宏的正确性断言通过，
宏耗时分别14.974/38.028/96.907/22.870秒；包含界面打开/输入/截图/等待，**不是单次LSP时延**。
第五个文件移动恢复宏首次F12返回空而停测；不能用前四项或后续复试把此轮记为通过。
注意原`postfailure-targeted-result.json`的case.file是外层名义随机目标；saved实际固定AlbumGrid，close实际ScreenManager/Picker，
move实际ScreenManager。以内部assertion、UI命令与wire的实际路径为准，保留该测试元数据缺口，未改原数据。

先封存`targeted-failure-sealed-4.zip`（SHA
`2e73b157c1a1a08ed3e27752bcf66d1b3343aaf889ec5a0e4da8196399b3700f`）后再复试：

| UTC时间 | 实际事件/结果 |
| --- | --- |
| 05:01:35.217 | 真实UI Undo恢复ScreenManager并删除`__ui_formal_move__`空目录，内容SHA与原文件一致 |
| 05:01:45.477 | Picker零基53:20的F12请求1310 |
| 05:01:47.932 | Zed迟到的watched-files批次：1852份Created，包含同目录大量既存副本，不含原ScreenManager.ts本身 |
| 05:01:48.24–48.25 | 父端67份request.completed记录stale；不带公开ID，仅能按method、时间及耗时关联1310 |
| 05:01:48.269 | 1310在2791.826ms后返回[]；同一Worker，未崩溃/恢复 |
| 05:09:23.373–31.820 | 原位置连续三次实际F12，均正确到ScreenManager81；无重启、重开、编辑或保存，共18UI命令 |

单份受文件事件打断后返回空与现行输入新鲜度围栏一致；已有证据支持瞬时失效，**不支持永久解析缓存损坏**。
三次复试的整动作耗时1575/1301/1293ms包含截图/返回/等待，不能冒充LSP耗时；逐请求另从wire提取。
精简证据`move-transient-stale-evidence.json`、`windows-postmove-retry-collection-1.stdout`。
该现象仍是用户可见体验缺口，尚未验证客户端能否自动重试；不能为消除空结果而绕过真实输入变化校验。

## 最终完整检查的契约迁移（产品产物不变）

`check-fast-burst-final.log`实际结束exit1：2133/2136、0cancel/skip/todo、3010315.987ms。
不是全量GREEN；三项失败分别是：

1. call-hierarchy补充unit的Freshness替身只实现旧start，当前入口已调用startConcurrent，进入预算断言前TypeError。
2. completion旧用例假定第二个位置隐式取消第一项；第一项故意只在取消后返回，按新独立请求契约不会被取消。
3. code-action resolve旧用例假定第二消费者使第一项失效；两份相同有效输入现在均合法，原断言不再适用。

原源码备份`full-contract-red-sources/`、旧完整日志及原产物身份保留。
补全改为在故意延迟、忽略取消的服务上断言两份当前位置均返回真实候选且没有被abort；
code-action改为**显式按ID取消第一请求**再由第二请求释放忽略取消的底层，严格断言首项-32800且没有编辑，第二项完整有效。
原编辑/关闭/同版本重开/文档版本变化和显式取消回归均保留，不接受旧内容或吞错。
feature evidence名称/claim与严格行为同步，历史文档中的旧决策保留并标记后继。

旧3755行call-hierarchy测试中已有预算preflight职责提取到118行新unit，修正替身接口，
原文件缩到3671行；生产stdio预算反例仍在原文件，不能以private unit替代。文件体量仍是迁移债务。
初次迁移聚焦因manifest layer count未同步失败并保留；修正后`full-contract-migration-focused-final.log` **31/31、exit0**。
最终695份src/tests清单`source-manifest-burst-qualified.json` canonical SHA
`a7c278e681156dddc7640c42ea06f77ae648e6fe508d4a6590c25637f4557855`，
相对先前694清单只有测试/证据映射变更；server dd3/Worker BF及其余产品产物不变。
05:13:49Z起`check-fast-burst-qualified.log`重新运行，结果待实际结束核对；旧2113和新31均不替代最终完整检查。


### 受限检查环境不作为产品失败归因

05:13Z完整资格复跑`check-fast-burst-qualified.log`在prepared-suite多例失败。
该命令被放在默认受限沙箱：实际`ps`返回`operation not permitted`，采样就绪屏障没有建立，诊断状态NOT_RUN而非期望FAIL。
同一`exact Locations cannot qualify a baseline without normal diagnostic observations`、相同源与断言：
`full-environment-diagnostic-default.log`0/1、10641ms；允许进程采样后`full-environment-diagnostic-allowed.log`1/1、2068ms。
未以“环境”猜测略过；核对本轮91313测试父进程stdout确指向qualified日志后，仅对自有PG91216发SIGINT，exit130，
进程与停止证据`qualified-full-environment-process-proof.json`/`qualified-full-environment-stop.json`。
该受限复跑不是完整结果；不改任何源码/断言/截止，以可采样环境重新完整执行
`pnpm check:fast > .bench/windows-ui-remediation-20261030/check-fast-burst-qualified-allowed.log 2>&1`，最终结果另补。

## WUI-010：跳进外部SDK声明后工作区归属错误（新发现，未关闭）

独立符号UI补测05:14:20.999–05:17:17.702Z、176.703秒、187条UI命令，**FAILED**。
预定17符号，完成9条结果：7份正确物理路径/符号；2份setTimeout跳转-32803。
第10个Want定义本身正确，但跳入SDK后自动高亮立刻内部错误，驱动停止；未执行余下项，不把7/9当17项通过。
案例覆盖getInstance/destroyMainWindow/UserFileManagerAccess.getInstance/initializationSize/parseWant/genAlbumsInfo/getMainWindow；
同文件三项的服务器精确range已核对，截图/标题只证明文件可见，光标落点还需人工逐图复核。
七份正确定义分别249.839/16427.801/9566.748/250.012/245.339/2189.964/218.988ms，尾延迟仍严重。

| UTC时间 | 公开帧/状态 |
| --- | --- |
| 05:17:16.912 | Picker import Want，定义请求1682，零基18:8 |
| 05:17:17.158 | 1682正确返回外部SDK `ets/api/@ohos.app.ability.Want.d.ts` 零基44:21–25 |
| 05:17:17.166 | Zed didOpen该声明，languageId arkts/version0，原项目外路径 |
| 05:17:17.248/17.251 | 自动documentHighlight1683，44:25，3ms后-32603 `Invalid semantic worker request` |
| 05:17:17.278/17.286–17.287 | 同SDK文件自动definition/typeDefinition同样内部错误；随后codeAction亦错误 |

直接调用链：`SingleRootProjectResolver.projectFor`（single-root-project-resolver.ts:19–23）找不到包含根时返回第一个workspace；
LSP snapshot（run-language-server.ts:479）因此把SDK文件标成原项目workspaceId。
`SemanticWorkerProxy.sync`（semantic-worker-proxy.ts:178–181）正确拒绝同步根外文件；
而`workerDocumentRequest`（semantic-worker-document-request.ts:9–15）随后仍以原root提交该SDK URI；
`RootSemanticWorkerSupervisor.request`（semantic-worker-supervisor.ts:247）正确拒绝URI不属于root。
该父端异常未映射为明确的外部来源能力/归属失败，公开层变为内部错误。version0合法，不是版本零或URI `@` 转义问题。
同一server21112/thread1，**不是Worker换代**。这与ADR0032请求互取消不同，不删root守卫/扩大整盘权限解决。
需要明确外部声明与实际语义项目的归属、只读查询权限及生命周期；不能随意为每个SDK目录新建永久Program，
也不能把内部错误吞成空的“成功”。作为新功能缺口单列，尚未实施这种更大的来源权限合同变更。

封存`sdk-file-failure-sealed-5.zip`，SHA
`cfe9dae0e59020cb44093ba61fbaef76720216be271edbf1d292f688360eca47`，15671899字节。
首个非成员补全/重命名tour因前一项失败未执行，不能自动算覆盖。

实际SDK只读审计`windows-real-sdk-timer-declaration-audit-2.*`：1450份`.d.ts`（1580是原SDK全部受管输入数量，口径不同），
找到`ets/api/@internal/full/global.d.ts`的`export declare function setTimeout(...)`，SHA
`dfd522d9714c2c6fe01596739b0093d0c371fcfbd9b2835509cc63e7bf5ad837`；JS full/lite亦有声明。
因此两处setTimeout跳转-32803不能直接归因“SDK没提供函数”，其选中profile、全局投影及实际Program是否包含该声明仍需补证。
没有将声明存在等同于它已进入Program，或把工作区外SDK高亮和未解析全局函数强行合为一个原因。
初版只读审计脚本与PowerShell自动变量Matches重名、序列化失败，原收据保留；第二版变量修正后才得到上述数据。


全局输入进一步只读核验`windows-runtime-global-input-audit-1.*`：
`discoverSdkAmbientDeclarations`（typescript-sdk-ambient.ts:18–22）两份runtime候选
`ets/build-tools/ets-loader/declarations/global.d.ts`及`ets/component/global.d.ts`在实际SDK均不存在。
选中component index-full/common无timer；找到的internal/full/global含export，属于模块，不能直接当ambient全局脚本。
这是“API声明文件存在”与“正确runtime全局输入可用”的具体区别；没有证据将其视为同一个WUI-010根外请求错误。
Program是否有其他间接全局投影未采样，不把上述磁盘核验升级为完整编译器包含证明；也未更换SDK、伪造浏览器/Node全局或默默打桩获得测试通过。


## 独立非成员补全与重命名UI观察

SDK失败封存后，只关闭已证明overlay=磁盘的测试SDK标签，保留同server/Worker；没有重启或改产品/SDK。
新驱动按phase开始时间区分已封存历史错误与本phase错误；历史错误不删除，新-32603仍立即停测。
这只是允许其他功能单独取证，不把原FAILED变绿；`close-sdk-after-seal-result.json`记录未改动关闭。

非成员补全05:23:10.432–05:25:07.806Z，**117.374秒/164命令，COMPLETED_WITH_FINDINGS**：

| 实际输入/位置类型 | 预期候选 | 结果 | 公开LSP毫秒 |
| --- | --- | --- | ---: |
| Picker EOF输入Lo，Ctrl+Space | Log | 存在，128项 | 1720.666 |
| 方法内输入Lo，Ctrl+Space | Log | 存在，128项 | 1631.668 |
| 方法内输入TA，Ctrl+Space | TAG | 存在，128项 | 1903.980 |
| 方法内输入SelectPar，Ctrl+Space | SelectParams | 存在，3项 | 1733.476 |
| 方法内输入setTime，Ctrl+Space | setTimeout | **缺失**，1项 | 1745.273 |
| 新局部声明uiKnownProbe后输入uiKnownPr | uiKnownProbe | 存在，1项 | 1737.407 |

每项UI撤销回原内容并保存、磁盘精确一致；末尾跳转正确。
这些是候选存在/缺失检查，**不是六项详情全部正确或完整项目auto-import完整性证明**；没有把128项截断的候选列表当全项目完整。
所有位置、实际输入行/版本/SHA、返回候选与截图位于`completion-tour-separate-result.json`/同名events。
编辑后1.63–1.90秒是持续体验观察，500ms非硬失败线；缺失候选单独算功能缺口。

F2观察05:25:07.862–05:26:13.514Z、65.652秒/35命令，结果**INCOMPLETE/NO_TERMINAL**。
实际F2后没有定位到prepareRename/rename请求，不能说已测到服务器全量重命名拒绝，也不能算改名成功。
没有提交rename或改名编辑；后续局部定义2008正确，3088ms。另做真实命令面板入口核验，结果另补。
完整30K引用/重命名原功能缺口仍保持，当前F2入口未覆盖与既有服务器限制分别记。


F2未发请求的原因已由实际initialize双向帧确认：Zed发送`documentChanges:true`、`prepareSupport:true`，
但`workspace.workspaceEdit.failureHandling`缺省；服务器响应没有`renameProvider`。
`register-semantic-capabilities.ts:587`要求transactional或textOnlyTransactional后才公布带prepareProvider的rename能力（configure:387）。
真实命令面板截图`rename-palette-probe.png`确有“editor: rename / F2”，因此不是把不存在的UI快捷键当作执行。
**入口可见不等于LSP能力已启用**；本轮不伪造客户端能力、放宽事务安全要求或拿直接协议调用冒充UI改名。
此前NO_TERMINAL用例的“等待40秒”是驱动在不公布能力下等不到请求，不能归为Worker执行耗时。
已关闭测试命令面板，原INCOMPLETE保留；没有提交rename。实际UI重命名未覆盖，事务能力适配与30K完整范围限制独立跟踪。


残余队列的离线分解补证（不新增产品插桩）：`tail-463-dispatch-intervals.json`将父等待11531.117ms
按连续send.returned切成39段，和原区间精确相等，包含19段define后间隔、19段typeDefinitions后间隔、1段高亮后间隔。
这些是**相邻派发间隔，不是相应方法的纯执行时间**；不能在它们之上再加compiler耗时。
最长3728.884ms为Worker336派发52.532Z至337派发56.261Z。
336的实际definition compiler trace在52.683Z已结束（69.597ms、Program17、0构建），下一派发前约3.58秒没有细阶段观测；
该次公开424在56.262Z是-32803，位置Picker44:14，`uiExtensionHost.getUIExtensionHostWindowProxy`，并非目标463本身失败。
`LegacySemanticEngine.define`（legacy-semantic-engine.ts:285）空局部结果会再prepare全范围，
`prepareInteractiveWorkspace`在partial时还会主动refreshProjectMembership。
这是与时间线一致的**待测热点假设**，没有该段枚举/读取计数，不能直接把3.58秒全算目录扫描或据此改缓存合同。
19份在目标派发前完成的正定义trace合计1139.047ms，包含于上述派发间隔；目标自身trace在其后，不与父等待混加。
因此既有同输入Program优化已消除该场景重复构建，但没有消除串行请求的其他证明/服务成本及失败查询回退成本。

WUI-010修复边界建议：参考tsserver的文件所属语义project，而非把外部文件强行塞给第一个workspace。
需明确配置SDK声明的只读查询上下文、输入证明、多个workspace引用同一SDK时的归属及关闭后的owner/lease释放。
现有root guard保持；未知根外文件不能获得整盘访问权。不能只把projectFor兜底改为dirname，
否则可能每个SDK子目录新增永久Program、改变全局引用范围且没有关闭生命周期。
回归需通过公共stdio模拟真实“定义→目标didOpen/version0→自动高亮/类型定义/代码动作”，
再覆盖源编辑、SDK/配置切换、并发workspace、关闭重开与返回源项目；这些未实测项不能以现有单次定义URI检查代替。
静态上SDK误归属还会走onDidOpen的cancelWorkspace；实际是否取消过在途全局请求未测，不把潜在级联写成此次已观察事件。


## Windows最终资格整组

`windows-qualified-tests-final.ps1`核对最终695份源/测试SHA、只覆盖私有测试源码overlay，运行产物仍dd3/BF。
2026-10-30 05:30:16.768–05:33:54.271Z，Windows Node20.19.5串行17文件、**91/91、exit0、0fail/cancel/skip/todo**，
203366.907ms测试body；包含之前60项及完整契约迁移31项，不是不同轮次拼接。
`windows-qualified-final-regressions-1.*`/`windows-qualified-final-attestation.json`绑定695清单a7c278e6及五份运行hash。
其中真实30000源的私有SDK同步fixture四轮、1Worker/0恢复；准备62999.619ms与原75000ms服务场景分开，
不是Photos API24或UI场景，原准备计时失败仍保留。
这是最终机制/公共子进程资格，**不替代真实UI原FAILED、SDK源归属、setTimeout缺失、索引初始化或长尾问题**。
Mac最终完整仍运行中；原2133/2136与受限环境SIGINT130均保留，不能被Windows91替代。


### 实际输入与运行身份最终只读核验

`windows-qualified-final-input-runtime-audit-1.*`完成30287项目输入+1580SDK输入逐字SHA及日常安装/六产物MATCH；
随后目录盘点因旧证据文件已存在而保护退出，**exit1保留，不算整个核验命令通过**。
不覆盖旧盘点，改用新文件名`inventory-qualified-final.cjs`，仅补其余步骤；
`windows-qualified-final-input-runtime-audit-2.*`05:36:44.218–47.176Z **exit0**，包含先前逐字核验报告的明确引用。
最终实际源码30000、缺失/新增源码/历史移动目录均0，唯一额外文件是测试`.zed/settings.json`。
695src/tests无差异；server/Worker/其他运行产物与冻结五hash一致；Node实际命令仍candidate-burst4/server.cjs，PID21112。
10份仍打开overlay全部等于原磁盘；关闭/移动历史buffer不要求等于已不存在的旧路径，不把历史证据误判残留。
日常launcher、WASM及settings三份均未改；没有部署日常Zed、合并、发布或删除真实缓存。
原库存与每轮hash证据保留，最终空闲观察从上述只读核验后单列，不计混合UI时长。


## 封存C4整体观测分布（不等于功能通过率）

最终UI封存`final-ui-observation-sealed-6.zip`，19353955字节，SHA
`c2b337faf86ca28852e16a384d9f056f2f2f845dc842104590b2682540ec2c73`。
`analyze-ui-observations.py`只读复跑生成`c4-ui-observation-analysis.json`；百分位采用nearest-rank。
同一连接截至封存2021请求/2021唯一终态、0未结清、0重复；1Worker、0退役/恢复、无OOM记录。
这些是生命周期/协议事实，**不能把错误响应、空结果或UI目标错误算成功**。

| 请求类别 | 样本数 | p50 ms | p95 ms | p99 ms | 最大 ms | 错误/口径 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| completion全部 | 228 | 45.620 | 672.432 | 1737.407 | 1903.980 | 含11份-32800；未按每项候选完整性认证 |
| definition全部 | 484 | 4424.366 | 17403.490 | 20230.919 | 21562.433 | 25份-32803、1份-32603；含自动查询，持续严重慢仍在 |
| typeDefinition全部 | 405 | 5724.470 | 17605.047 | 20446.782 | 21777.674 | 1份-32603；含自动查询 |
| documentHighlight全部 | 342 | 603.439 | 12747.803 | 18749.409 | 19541.012 | 46份-32800、1份-32603 |
| 当前选中、实际富签名Log.debug详情 | **3** | 532.875 | 550.991 | 550.991 | 550.991 | 由UI断言+当前UUID/版本/实际返回签名确认；样本有限 |

179份原始resolve的p50=0.601ms包含通用回退/可能旧句柄等，未逐项证明其当前性和富签名，
**不拿这个中位数宣传详情性能**。三个正确selected样本来自校准、正式及独立定向，各阶段不累加成耐久。
三份references全部-32803，无完整结果；rename未公布/无请求；均不是全局功能通过。
正式C4只有2分39.510秒，214条驱动命令中真实输入事件92份keys、24份text-input、21份click；
wait/screenshot等另计，不把214条命令全算用户点击。字符逐字25ms输入，绝对路径及Ctrl快捷键均如实保留。

5557份Worker遥测：Node全进程RSS峰值932368384字节（889.18MiB）；Worker isolate heapUsed峰值900082464字节（858.39MiB）。
两者不可相加。1674份Windows进程采样按PID去重，同一时刻Zed/Node/relay/相关原生进程WorkingSet求和的峰值
1106178048字节（1054.93MiB），**不是PSS**，共享系统页仍可能跨进程重复；未把各PID不同时间峰值相加。
原生index在开始约15.5秒后0文件degraded且进程消失，之后低进程树内存不能作为健康完整索引的内存收益。
输入/实际依赖闭包随符号tour变化，活跃阶段heap增长不单凭RSS判泄漏；空闲阶段另测，不做未经证实的释放承诺。
2048MiB测试停线豁免、默认无RSS预算、产品V8/绝对截止及资源保护口径均保持。

### 客户端自动请求与取消的证据边界

封存410份`$/cancelRequest`分别对应completion213、codeAction98、hover35、highlight64，
**definition/typeDefinition均0份**；不少取消在终态后到达，不能把410全当及时中断。
[安装版hover-links](https://github.com/zed-industries/zed/blob/8dd255c3eafb5231056fe4e6f601cedd011f1c93/crates/editor/src/hover_links.rs#L175)
在Ctrl/Shift等交互中选择符号/类型链接并建立异步任务，hide时移走hover state；源码支持自动请求来源，
但未动态证明每条definition均由该路径发出、或移走state必然该如何发送LSP取消。用户F12与自动definition在标准LSP同方法不可区分。
UI代理在每次text输入前检查Shift/Ctrl/Alt/Win未按下，未观察到“Modifier held”保护失败，
没有证据认定本轮负载只是输入器粘住Ctrl；真实Ctrl快捷键仍会产生编辑器自动请求。
这解释为何不能用服务器“同URI后到覆盖”模拟客户端意图；客户端取消/最终激活围栏与服务器有界服务成本都要各自成立。

外部文件归属再核官方[tsserver project system](https://github.com/microsoft/TypeScript/wiki/Standalone-Server-(tsserver)#project-system)：
配置、外部与inferred project分别建模，文件可属于多个project，归属改变时调整/释放旧project。
这是WUI-010后续设计参考，不是当前适配层已经使用tsserver；没有照搬inferred-project默认扫描范围或改用其他编译器。
本次Context7额外resolve仍传输失败，`sdk-project-ownership-context7.json`留存；使用官方资料，不伪造成功结果。


### WUI-010公共最小复现补证（Mac，非UI）

`node --test .bench/windows-ui-remediation-20261030/sdk-follow-target-diagnostic.test.mjs`
在相同最终695源/五产物上实际**RED0/1**；不用30K、不改SDK、不改产品。
fixture源`export const selectedLength: ArkUILength = 1`先正确定义到配置SDK的arkui.d.ts零基0:5–16，
随后真实didOpen该SDK目标/version0，再documentHighlight0:7，得到同样-32603 Invalidsemanticworkerrequest。
随后源项目hover仍正确显示selectedLength:ArkUILength；没有Worker致命退出。
`sdk-follow-target-diagnostic-result.json`、wire、stderr及.log完整留存，
运行799ms只是正确性诊断耗时，不与Windows实际SDK/UI性能对比；与Mac完整检查并行，不计入其测试数。
这证明缺陷跨平台、与规模无关、位于请求归属/路由而非编译器已开始处理；**仍未修复，不能因check:fast绿色忽略这个RED**。
已有sdk-runtime-globals等公共测试验源文件返回的定义位置，但未继续打开SDK目标并触发后续请求，因而漏检。
旧Mac真实Zed窗口是否用另一语言服务处理.d.ts，本轮没有其路由证据，不能拿它当已证原因。
后续正式修复需将此transcript迁入正式suite，并实现有生命周期的语义project/来源归属；不能只改错误码或返回空成功。


## 最终同会话空闲恢复、关闭与验证结论

最终归档`final-ui-lifecycle-sealed-7.zip`，21494084字节，SHA
`66d7bbbab237f7f3dbdd6d9348e1fc1c4841ecc0ebf70f667cdb27df6c388297`；
包含全部C4 UI帧/截图、项目/SDK输入清单、695源/产物身份、最后原始盘点及带SHA的复现脚本。
先前失败seals1–6均保留。`analyze-ui-observations.py <final-ui-lifecycle-sealed-7>`可重算最终统计，
`c4-ui-lifecycle-final-analysis.json`与先前snapshot6分析分开，不覆盖其范围。

- 05:37:00.000–05:50:11.705Z：13分11.705秒没有客户端语义请求；没有主动重启、重开或预热。
  783份内存样本中leaseCount始终0、residentContextCount始终1。
  首分钟Node RSS中位578275328字节，末分钟210616320；Worker heapUsed约572645112→572606328字节，基本相同。
  这是保留上下文、Windows驻留集变化的观测，不把RSS下降等同完整GC，也不凭一次空闲证明无泄漏。
- 05:50:11.329–30.066Z：独立实际UI恢复18.737秒/35命令通过。
  原文件/原光标首F12请求2022，567.246ms，正确定义Log.ts31；随后当前Log.debug详情2047，164.599ms，
  UI接受后精确撤销、保存回原输入。不替代原快速交错、SDK或整体耐久验收。
  最终当前选中富签名详情共4份，nearest-rank p50=520.367ms、最大550.991ms；样本数有限。
- 最后重新全量逐字核验`windows-input-audit-after-idle-1.*` **exit0**：30K原内容/SDK/日常安装仍MATCH，
  新文件名目录盘点、10份打开overlay、695源及五运行hash均一致。无真实项目/SDK/缓存删除。
- 05:54:52.117Z真实Alt+F4正常关闭专用窗口，未强杀或丢弃内容。
  05:55:17Z六个本轮已知PID均不存在、代理任务Ready；日常窗口/安装未动。
  客户端shutdown2094于52.232Z；随后10份didClose；server于52.475Z **code0/signal null**退出。
  **未捕获shutdown响应或exit通知帧；relay未记录EOF先后，无法据此归因，也不宣称关闭协议握手完整。**
  最终2094请求/2093响应、0重复；唯一未录响应为shutdown，其余语义请求全部结清。
  不能把这个关闭阶段未观测终态倒算成原语义请求挂死，亦不把进程已消失等同所有owner dispose回调逐一证明。

最终Mac适用完整命令：

```sh
pnpm check:fast > .bench/windows-ui-remediation-20261030/check-fast-burst-qualified-allowed.log 2>&1
```

以允许进程采样环境运行，实际**exit0，2136/2136、1suite、0fail/cancelled/skipped/todo，3006467.152ms测试body**。
`check-fast-final-qualified-summary.json`含日志SHA/父78a3158/分支及695源清单；
`final-identity-audit.json`复核695源0差异、五份运行hashMATCH、`git diff --check`通过。
原2133/2136、最初2110/2113、Windows57/60、受限环境SIGINT130与所有真实UI失败没有覆盖。
455文件冷目录3秒独立门槛仍按用户授权不执行；不称其通过。无Rust产品变更，本轮未另改/验证新的Rust实现。

最终修改文件的体量债务：TS language service3085→3077、supervisor725→716、
call hierarchy测试3755→3671、supervisor测试1574→1545；都已提取职责且未增长，新模块/测试≤500。
`final-source-size-debt.json`保留明细；旧legacy engine745行本轮未改。

**结论：服务器侧请求身份、同输入promotion和有界准入修复已实际实现并回归；整体Windows UI验收仍未通过。**
持续严重跳转排队、WUI-009客户端导航意图/输入焦点、WUI-010外部SDK源归属仍OPEN；
SDK runtime-global缺失、原生0文件degraded、30K全量引用/重命名及Zed事务能力限制也未解决。
Mac SDK跟随目标最小诊断仍RED0/1，不能因最终常规suite通过隐藏。
没有实现不受现有扩展API支持的Zed核心修改、去掉校验/吞错、调大阈值、擅加浏览器/Node全局或删除缓存以制造绿色。
本轮未提交、push、合并、发布或部署日常扩展；私有Windows候选部署和实际UI验证范围如上。
