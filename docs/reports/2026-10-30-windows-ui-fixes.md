# Windows 30K UI三项修复与验证

状态：**三项修复候选完成，最终完整fast2103/2103、Windows新增回归7/7、针对性真实UI回归完成。
真实UI仍有已知缺口，未授予全功能通过；未提交/合并/发布。**
父提交`4859f76c46265a885332d7141c99698bf749c61e`；
分支`fix/windows-ui-completion-navigation-recovery`，工作树候选未提交、未合并、未发布。
用户授权顺序为WUI-001补全→WUI-003导航→WUI-002换代。
[原真实UI失败报告](2026-10-29-windows-zed-30k-ui-stress.md)及其证据保持原状态。

## 问题、根因与改动

| 问题 | 已证明的直接原因 | 实现与边界 |
| --- | --- | --- |
| [WUI-001 / #102](https://github.com/liuhui-code/arkts-language-server/issues/102) | 非成员补全及详情仍要求完整workspace成员；30K的partial状态在compiler调用前被完整性断言拒绝。不是编辑缓存失效，也不能归因SDK局部缺项 | 局部列表/详情共享范围准入；ready索引候选沿已有批次由compiler验证；不能证明全覆盖时`isIncomplete=true`，真正输入失效仍拒绝 |
| [WUI-003 / #103](https://github.com/liuhui-code/arkts-language-server/issues/103) | 导航与highlight/codeAction等自动读取同级FIFO；原9221ms中8848.952ms在父队列 | 穷尽方法策略新增foreground层；completion最高，导航高于自动读取；原队首最多被越过一次，mutation/global屏障不变。不抢占在途同步编译 |
| [WUI-002 / #104](https://github.com/liuhui-code/arkts-language-server/issues/104) | 普通保存的磁盘通知立即取消在途诊断；有限Program同步没有检查点也按1000ms静默退役。原自然现场为phase=program，并非OOM | 对已打开同根源码的纯changed通知，仅允许匹配请求已有同步清算；旧响应立刻失去发布资格，通知仍应用。真实编辑/配置/创建删除/客户端取消仍硬中断，原绝对截止持续有效 |

三项是范围准入、调度分类、取消原因策略的不同缺口，没有以同一“缓存全部失效”强行统一。

### 补全调用链

公开`textDocument/completion`→语义proxy/Worker→`LegacySemanticEngine.complete`（179行）→
`completionQueryPlan`（completion-batch-planning.ts:24）→`prepare`（legacy-semantic-engine.ts:677附近）→
`prepareInteractiveWorkspace`（interactive-workspace.ts:83）→`interactiveWorkspace`（105行）→
`assertCompleteProjectMembership`（workspace-membership-admission.ts:5）。
旧路径includeWorkspaceFiles=true，partial先再次枚举目录后拒绝，尚未执行compiler补全。
详情旧路径也独立计算完整workspace，故只修列表仍会失败。

新范围规划集中在`completion-batch-planning.ts`，使用DocumentStore已有成员状态；
partial的普通列表及详情使用当前overlay/实际依赖，optional auto-import使用ready索引候选、compiler验证和签发根。
完整成员场景仍保留原workspace与stale-index compiler回退；没有提高20K上限、更换默认profile或清全缓存。
full references/rename等完整性合同未放宽。测试证明补全/详情不再次打开noise目录，
20001份无关源码不被compiler解析，而20K枚举外ZNeedle实际被解析并产生正确导入编辑。

### 调度调用链

公开导航→proxy admission→`RootSemanticWorkerSupervisor` pendingRequests→
`takeNextSemanticWorkerRequest`（semantic-request-lanes.ts:39附近）→单Worker派发→compiler→最终输入证明→公开响应。
策略表`REQUEST_CLASS`（6行）/`PRIORITY`（31行）将列表/详情设3、foreground设2、自动读取设1。
队首有界绕过与原mutation/global屏障沿用，不创建并行compiler或额外Worker。
LSP没有可靠来源区分用户F12与自动definition/typeDefinition；同类自动请求仍可能排队。
已有detached-reference通道未改，不能声称所有队列及在途Program成本消失。

### 保存与Worker生命周期

真实Zed保存→watched-files事件→proxy文档快照→supervisor mutation（stateGeneration立即推进、旧结果撤销）→
`invalidateActiveWorkerRequests`（semantic-worker-invalidation.ts:15）→Host watchdog许可→cancelCell=contentModified。
`canFinishOverlaySynchronization`（7行）要求非空变化全部是已打开同根源码changed，且无root/resource强失效。
不假定磁盘与overlay字节相同，更没有丢弃通知；磁盘变化须在关闭后重新成为权威。

watchdog `invalidate`（45行）区分finish-sync/settling/interrupt：只有匹配epoch/id、
phase=synchronize/program/checker的已有提交可清算；原started绝对截止不重置。
同步完成或首次观察离开该同步，转settling，从此边界应用原1000ms终态交付宽限。
真实编辑/客户端取消使许可变interrupt；后续save不能软化、重新授予或重置已结束的清算。
丢终态、永久同步、异常退出仍有界退役；旧取消响应不补充健康恢复预算。
这明确补充了取消策略，不能声称所有取消仍按旧1000ms无检查点静默规则执行。

## 方案依据与ADR

[ADR0030](../adr/0030-completion-scope-and-navigation-liveness.md)保持Proposed；实现授权不是独立设计审阅或Accepted。
[ADR0026补充](../adr/0026-cancellation-grace-terminal-handoff.md#2026-10-30后续缺口保存通知与已有同步)与
[ADR0027补充](../adr/0027-completion-details-diagnostic-priority.md#2026-10-30后续缺口导航与自动读取同级)保留原决策历史。

TypeScript官方[补全实现说明](https://github.com/microsoft/TypeScript/wiki/Codebase-Services-Completions)以SourceFile和位置产生候选；
位置补全与全工作区完整性是不同范围。[LSP CompletionList](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/languageFeatures/#completionList)
提供显式未完成列表，不授予完整引用缺项成功。
安装的`ohos-typescript@4.9.5-r10`（typescript npm alias）`lib/tsserver.js:160477`，
`ProjectService.onSourceFileChanged`仅在非open ScriptInfo的Changed时重载。
这里借鉴open-buffer authority，但因本服务更强的身份/新鲜度合同，保留磁盘通知和最终证明。
Context7前置查询及后续连接失败、安装源码SHA/摘录和官方链接见`official-source-evidence.json`；
未将检索到的TS7 snapshot API套用到固定4.9分支。

## TDD与检查

全部语义行为通过真实server子进程和Content-Length stdio断言；故障夹具只控制compiler执行窗口或终态传送，
不以私有server单测替代公开结果。
[完整TDD](../tdd/2026-10-29-windows-ui-fixes.md)保存命令与先RED后GREEN顺序；
后两个RED保留前一切片修复，不能误称三个都在同一个完全干净的父树运行。

- WUI-001注释、局部列表/详情、ready auto-import分别RED→GREEN；新鲜度/SDK/namespace等12项对照通过。
- WUI-003受控公开队列定义派发第12→第1、原队首随后运行，14项调度/屏障/交互对照通过。
- WUI-002五项公开回归覆盖有限1800ms真实Program调用、永不返回、再次编辑、异字节磁盘/overlay、丢终态。
  `wui002-controls.log`26项包含其中前4项；`wui002-delivery-controls.log`5项与其重叠，不能相加计31项。
- Windows Node20.19.5三份新文件7/7。首轮6/7只因新parse观测断言比较正反斜杠字符串，
  改为物理身份后7/7；运行产物未改变。原失败、观察日志、test-only SHA delta全部保留。
- 最终完整`pnpm check:fast`：**2103/2103、exit0、cancelled/skipped/todo均0**，262个fast入口含三个新文件，
  `check-fast-final-2.log`与`final-check-receipt.json`；Node测试阶段3735520ms。
  macOS26.6.2(25G83)/Node26.3.0/pnpm8.3.1，不能将该Mac全量收据称Windows全量。
  首轮restricted因进程观测权限受限主动停止exit130，`check-fast-final-1.log`与中断凭据保留。
  相同权限对照3/3，不把首轮记成通过。最终源/测试15份SHA核对未再变化，最新物理身份断言已在完整轮实际执行。
- Rust/native未修改，完整fast按正常流程构建release sidecar。455冷目录3秒项沿用用户授权排除，未删除索引功能或其他正确性检查。

## Windows真实UI身份与已执行覆盖

专用目录`D:\DevSetup\diagnostics\zed-ui-fixes-20261030`，project/profile/index均独立；
30287份项目输入、其中30000源码，与原真实UI输入逐文件SHA一致；SDK/API24声明1580份一致。
Node20.19.5、Zed1.25.3、声明SDK `openharmony-api24-6.1.1.125`；不是完整DevEco安装，局部SDK缺项仍可能报告诊断。
已安装ArkTS扩展`0.1.0-local-beta.1`，extension.wasm SHA
`d311ff6ea43914aaa8ff2de1ad5ed817da64c958fe055e2f08e2b627bf8e79a8`。
本轮私有profile binary override经被动stdio观察器启动候选；managed launcher保留/核对、未在本会话调用，日常安装未改。

| 运行身份 | SHA256 |
| --- | --- |
| overlay ZIP | `66495b5c0a31fc369d9d71dece9e61565d41d1d80c9f6da1524e697023303979` |
| server.cjs | `6c99b6e8184253a848a72a7384cdd2f631cf3320740dd12df163ae485a6d1324` |
| semantic-worker.cjs | `8cec9b49b3ed7b68a172ac7069fa375bbe3f9021f0c6d9de3445461255eb1ab2` |
| native exe（未改） | `9fe04072d48cd29f4bb0f287ed4f18dc102590454bf1e410a44dc63f154fbf4d` |

父4859f76+15文件overlay是工作树候选，不标成已合入main。安装元数据sourceFiles=2027是继承的父输入数，
需另计5份新增源/测试文件；单个测试路径观测断言的后续SHA见`test-portability-delta.json`，产品源及构建仍与ZIP相同。
实际运行Zed PID10280/server PID13724/Worker thread1由relay、服务日志与进程命令行交叉核验。

通过Windows InteractiveToken/Default输入桌面真实SendInput/按键/鼠标及CopyFromScreen截图执行；
每次输入验证自有Zed是前台。SSH生产器只写命令队列，不发送LSP；wire观察器不合成协议请求。
测试没有关闭用户日常窗口或处理其未保存内容。

- 冷index（目录名run-warm是沿用驱动参数，不表示缓存暖）：原Picker末尾32字符、v33/零基90:32，
  请求78正常1430ms、空合法列表、isIncomplete=true；原冷/暖4244/3653ms均-32803。
  此为同输入对照，缓存/SDK状态与首轮窗口有差异，不据此宣称严格提速比例。
- Log.真实列表、详情、Tab插入合法Log.d，随后全部撤销至原字节；客户端随持续输入取消的旧请求单列。
- 十宏混合16:40:35.860Z–16:46:20.446Z，344586ms，444条驱动命令（含等待/截图，不能全部当用户动作）。
  跨模块阅读/定义/hover、保存及未保存编辑撤销、列表详情接受、异字节外部磁盘/overlay关闭重开、
  快速取消后恢复、当前版本2322出现与撤销后消失、空闲恢复均有断言。
  完整references、implementation、incomingCalls三项仍-32803，结果为COMPLETED_WITH_OBSERVATIONS，不是全功能通过。
  首次启动0宏因焦点保护停止，前台PID20104读取前已退出、来源未确认，原记录归档后再独立执行。
- 已通过真实项目树移动ScreenManager到`__ui_formal_move__/ScreenManager.ts`、Undo恢复并删除空目录，
  原文件SHA核对一致；完整序列16:56:18.320Z–16:57:10.141Z，3次F12正确指向ScreenManager零基81:9。
  请求1027/1118/1145分别749.848/1321.085/429.805ms，父准入至send返回411.450/987.425/111.438ms。
  Worker接收至派发0.153/0.120/0.311ms；各线程本地区间不与wire重叠相加。
  原9221ms/父8848.952ms证据保留；当前负载/排队组成不同，不作严格提速率。
- 原发生换代的AlbumGridItemNewStyle四轮实际编辑、保存、撤销、再保存、跨文件跳转：
  16:53:12.862Z–16:55:42.760Z，149898ms/244条驱动命令；4次目标定义正确，
  387.736/354.809/506.716/368.624ms。原Album字节恢复，Worker始终thread1，没有退役/恢复。
- 第一组手工移动后的u016–u018留在项目树重命名焦点，未产生目标定义请求，**不计通过**。
  输入54:21被Zed作为非法Windows文件名拒绝；项目30287份SHA审计无改动。
  `manual-navigation-targeting-failure.json`及截图保留；上述完整序列是后续重新执行，增加编辑区点击/活动文件/目标断言。

### 实际覆盖与未成功结果

UI输入范围16:26:55.063Z–17:00:33.629Z，**33分38.566秒**，533次输入批次（含组合按键、文本输入批次和点击）、
5409个输入字符、100张可见截图。853条驱动命令中851完成、2条焦点保护错误；不能把等待/截图或字符数算成用户动作。
此范围包含人工校准、静置与取证，混合负载独立为344.586秒，Album149.898秒、移动51.821秒；
不是连续33分钟满负载或新的两小时耐久通过，更没有把旧协议两小时计入UI时长。

1209条client请求含initialize和shutdown；1207条功能请求中1093成功、109条-32800、5条-32803。
109条取消错误**逐条存在终态前真实客户端cancel通知**，不将正常旧请求取消归为补全错误；238条cancel通知含合法晚到/已结清取消。
1208条请求有观察到的单终态，无重复；唯一未观察答复的是关闭窗口时shutdown1209，见下方限制。
功能成功率不能将取消或已知缺口包装为成功：原始分类和每请求参数/文档版本/结果见`requests-analyzed.ndjson`。

5条非取消失败：全量references698、implementation699、incomingCalls701仍为上述partial完整性限制；
另定义617/629均为Picker零基21:45的`@ohos.uiExtensionHost`模块串，3605.655/3545.217ms，
SDK诊断实际2307，普通Log/ScreenManager随后仍正常。
源码`LegacySemanticEngine.define:285`在局部无目标时要求完整workspace回退，partial不能证明该回退；
日志仅有通用输入不可用/inputs-incomplete，**没有捕获精确异常堆栈，不将具体throw阶段归为已实测**。
LSP没有用户/预取来源字段，这两个请求不在计划的Log F12目标上，不凭空认定由某次鼠标动作触发。

144份completion：126成功、18真实客户端取消，**0份-32803**；96份resolve0错误。
其中10份返回实际签名（d/debug/e/error/toString），其余86份仅保留原generic条目，属于安全回退/未enrich观察，
不能宣称96份详情全部语义enriched；未逐份证明86份回退原因。真实Tab接受d/debug及公开number详情断言另有成功证据。

### 时延分布

下表仅成功请求，单位ms；所有失败与取消的逐次耗时仍在原数据，不丢弃后宣称全功能通过。
“冷索引期/ready后”依据真实index progress终态16:34:32.401Z，**不是结果缓存命中的精确分类**。
当前UI未逐条插桩cache hit，不把快请求一律叫缓存命中。p50为中位数，p95/p99用nearest rank。

| 方法/阶段 | 成功数 | p50 | p95 | p99 | 最大 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 补全，冷索引期 | 21 | 45.259 | 669.408 | 1430.231 | 1430.231 |
| 补全，ready后 | 105 | 46.392 | 260.197 | 564.804 | 1034.274 |
| 详情，冷索引期（含安全回退） | 20 | 0.506 | 529.796 | 727.351 | 727.351 |
| 详情，ready后（含安全回退） | 76 | 3.852 | 487.818 | 760.731 | 760.731 |
| 定义，冷索引期 | 26 | 51.848 | 776.768 | 863.062 | 863.062 |
| 定义，ready后 | 236 | 58.244 | 688.827 | 1438.046 | 1838.481 |
| 类型定义，ready后 | 198 | 48.337 | 752.114 | 1952.539 | 2117.211 |
| 自动codeAction，ready后 | 163 | 364.255 | 6459.991 | 9168.836 | 9588.639 |
| 自动highlight，ready后 | 192 | 257.442 | 3809.252 | 7539.256 | 7799.623 |

ready后成功定义22/236、补全3/105、详情3/76超过500ms；仅观察波动频率，不设新硬门禁。
原同级FIFO反例由公开受控队列闭环，实际导航仍可能等一份在途/被保障公平的自动请求，不能承诺全部500ms。
初始化最早自动highlight/codeAction分别18.847/18.866秒，不能被较好的热态中位数掩盖。
缺失SDK目标失败另有约3.5秒长尾，自动读取还存在持续秒级积压，均记录为剩余体验成本。

### 资源、关闭与输入保护

900份OS采样，实际采样间隔中位2154ms、p955475ms、最大10349ms；下列为**采样峰值**，不是连续测量绝对峰值。
Node WS660.613MiB，Worker指标Node RSS661.207MiB、Worker isolate heapUsed598.268MiB；
native WS3395.227MiB、Zed主窗口170.055MiB、relay32.059MiB。
Worker始终1个；无unresponsive/运行期退役/恢复、无OOM/非JSON致命输出，无整机或磁盘保护触发。
Node在index ready约599.17MiB、混合开始591.16、混合结束568.96、Album结束577.88、移动结束619.80、
最后523.32MiB。实际依赖/overlay/namespace会变化，此短窗不能证明长期无泄漏，更不以RSS不立即下降等同泄漏。
2822份Worker isolate指标最后residentContext1/openDocuments8/lease0；这些是关闭前快照，不代表dispose已执行。

正常UI关闭后server17:00:33.961Z exit0，17:01:02核验Zed10280/relay6948/server13724/native18464/agent22492均不存在，
也没有命令行属于本测试root的其他Zed/Node/native残留；未使用强杀命令。
但wire有shutdown1209、若干didClose，然后code0，**没有观察到shutdown答复或exit通知**；
现有观察器未记录stdin EOF/pipe close的先后，不能判定是客户端提前断连还是server清算顺序，不能称关闭协议握手通过。
常规stdio shutdown回归与此真实窗口关闭事实分别记录。

后处理observe.cjs未处理wire的serverExit元数据行而TypeError；原始日志/归档未丢失，
collect脚本exit0不代表该外部后处理成功。离线`analyze-ui-final.py`显式保留元数据、pending shutdown和失败，
`analysis-tool-notes.json`保存限制，没有伪造终态。

30287项目/1580 SDK输入、2032候选源（2027父输入+5新增）、6项运行产物、3项日常安装检查全部MATCH。
所有活动缓冲区恢复磁盘；已关闭的历史移动URI因原路径移回而不存在，这是预期，不将其错判为未保存编辑。
保留用户真实项目/缓存与旧失败；测试SQLite/WAL未拆删。

Worker线程共享Node RSS，不重复相加；原生索引/Zed/relay分别列，privateBytes不加到WorkingSet上。
默认预算null、无NODE_OPTIONS/V8或产品阈值更改；2GiB/4GiB不是测试停测线，保留磁盘与整机保护。
普通产品/受控故障/真实UI计时分开，UI带观察/trace开销未独立测量，不与普通协议微基准混算。

## 复现与证据

根目录`.bench/windows-ui-fixes-20261029/`，原现场`.bench/windows-zed-ui-30k-20261029/`只读保留。
核心：三个`*-red.log`、`wui001-proof-green.log`、`wui003-green.log`、`wui002-controls.log`、
`wui002-delivery-controls.log`、Windows focused原失败/重跑、`installation.json`、overlay manifest、
`official-source-evidence.json`、`test-portability-delta.json`。
UI的原始命令JSON/receipt、ui.py/remote.py、formal-controller-final.cjs、ui-targets.json、
server/Worker trace、wire、screenshots、输入审计与资源采样分别封存，不仅保留汇总。
最终原始归档`final-ui-evidence.zip`，15901542字节，SHA256
`5448afd0ecf1e3ed2dd05d434e2789cc2054d73d00c42039b8743c941b402611`；解包`ui-final-closed/`。
`final-ui-verification.json`、`selected-ui-queue-spans.json`与`ui-final-closed/analysis.json`为可重算汇总，
`input-audit-final.json`、`source-audit-final.json`、`owned-processes-after-close.json`为独立收尾凭据。
代表性真实画面本地副本`ui-selected-after-move-navigation-1.png`（实际getInstance82行）、
`ui-selected-completion-details-3.png`（Log.d/debug签名）、`ui-selected-diagnostic-present-6.png`（当前2322），
原归档文件名/副本SHA对应`selected-screenshots.json`，不修改原图。

```sh
pnpm check:fast
node --test tests/semantic/partial-completion-admission.test.mjs
node --test tests/semantic/navigation-foreground-scheduling.test.mjs
node --test tests/semantic/overlay-save-synchronization.test.mjs
python3 .bench/windows-ui-fixes-20261029/analyze-ui-final.py .bench/windows-ui-fixes-20261029/ui-final-closed
python3 .bench/windows-ui-fixes-20261029/summarize-fixes.py
```

UI需真实交互Windows会话、独立profile与foreground guard，先保存输入/SDK/构建身份；
已存在的run、命令ID与证据不得覆盖。控制脚本通过真实界面产生请求，不用上方公开协议回归替代UI结论。

## 剩余边界

500ms是允许波动的体验目标。长在途Program、同foreground预取、冷建/索引99%及native全量SQLite替换未由此消除。
本轮初次99%停438984ms后正常结束；native第一代replace435.971秒、第二代965.626秒，第三代UTC16:57:34.135启动，
在本轮关闭前无complete记录；不宣称后续索引更新全都ready，也不将这三代原生写入称为Worker换代。
完整30K引用/重命名能力与声明SDK局部缺项仍为独立已知缺口；不将拒绝完整结果记作成功。
本轮项目树F2执行的是资源路径移动，不是语义重命名通过；当前Zed没有协商workspaceEdit.failureHandling，
server未宣告renameProvider。符号重命名没有在本轮UI验收，不将项目树移动代替它。
WUI-002受控有限同步反例已闭环，但原自然现场的精确CPU热点/竞态窗口没有稳定最小复现，
本轮无换代也不能证明全部自然故障消失。
两份原有>500行源文件迁移债保留并缩减：legacy-semantic-engine 756→745，supervisor 732→725；
规划与失效职责分别提取；新增手写源/测试均≤500行。
本轮未自动提交、push、合并、发布或部署日常Zed，不擅自删除真实缓存。
