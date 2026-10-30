# Windows Zed 30K真实UI压力验收

2026-10-29，已结束并封存。**真实桌面验收已执行，整体不能判为全功能通过。** 原正式驱动在23分49秒因焦点保护停止，保留FAILED；续测40宏完成，但发生一次Worker自动退役恢复，另有补全错误及完整范围功能缺口。没有观察到OOM或Node崩溃；不证明历史OOM已解决。没有完成原计划60分钟未中断驱动。
[计划](../plans/2026-10-29-windows-zed-30k-ui-acceptance.md)。用户授权测试，不修改产品、不合并发布，日常安装和真实缓存未改。

## 实际身份与口径

远端与本地main均`4859f76c46265a885332d7141c99698bf749c61e`；从此commit的Git archive构建，核对2027份源码。
Windows10.0.19045，16GiB内存，Node20.19.5；Zed1.25.3/8dd255c3eafb5231056fe4e6f601cedd011f1c93。
实际GUI SHA256 `9e8902cf9ee5e6a25367120e1e1a95d9185fbaf18c1ba9e84a0f93a8e13cc6a9`；CLI哈希另记，不混用。
独立profile/项目/索引根为`D:/DevSetup/diagnostics/zed-ui-30k-main-20261029/`；项目为此前Windows30K快照的逐字节副本：30287输入、30000TS/ETS。
SDK为`D:/DevTools/sdk-declarations/openharmony-api24-6.1.1.125`，1580份声明核对。此为声明SDK，非完整DevEco，dialect未验证；不外推到完整原生ArkTS SDK。

不可变release指纹`0efe7788806a7286beaee776b33a144dbe66e4c3956f9b800578b6f7833427b9`：

| 产物 | SHA256 |
| --- | --- |
| server.cjs | b44b35414ab08cc34d37defd3c1981aae53997982892e16461636f681d621072 |
| semantic-worker.cjs | 46deedbb3672ad53d2c5d307a6f9093c375df08ee2b677a147459221d130c01a |
| reference-verifier-worker.cjs | 207705821207c5f208f31212b55c3f207b6c534ca75bd47746b1f6ef986a0822 |
| native sidecar | 9fe04072d48cd29f4bb0f287ed4f18dc102590454bf1e410a44dc63f154fbf4d |
| semantic-runtime.json（默认预算null） | 7a6b6c7af7ad332ef93959143916657dd66d35cec0a01036fb661e259e53ff85 |

每份安装文件与Windows构建文件相同；实际server进程7156来自上述release，Worker同目录及哈希已记录。构建包装任务在安装成功输出后未返回，未取得其成功退出码；独立安装核验通过，不把包装任务记成exit0。
扩展WASM`d311ff6ea43914aaa8ff2de1ad5ed817da64c958fe055e2f08e2b627bf8e79a8`，版本0.1.0-local-beta.1；版本号未变不代表server未更新。
为了被动记录Zed原始协议，测试profile的binary override经透明relay直接启动已验证安装server；没有合成LSP请求。
managed launcher已安装并记录哈希，但本轮经override启动，不能声称默认launcher激活路径已验收。

`ARKTS_MEMORY_BUDGET_MB`、`NODE_OPTIONS`均未设置；产品默认预算null。无Node2GiB或4GiB提前停测；只保留整机可用15%/磁盘1GiB保护。
WorkingSet每PID一次，Worker线程不另加RSS；private bytes与WorkingSet分别报告；Worker isolate heap来自实际metrics。
500ms为体验目标，单次波动不作为功能失败，持续慢响应/不可用仍保留。

## 真实桌面与阶段

Session5/WTSActive、Default输入桌面；真实鼠标与逐字符输入回显成功，CopyFromScreen可见截图已目视确认。
SSH本身位于Session0，实际输入来自InteractiveToken/Limited计划任务；没有解锁或绕过安全桌面。
仅自有窗口，日常安装快照已保存；没有关闭用户窗口或丢弃其未保存编辑。

冷Zed窗口11:38:31Z附近打开，LSP initialize11:39:06.590Z；server/Worker/native为7156/线程1/4868。
语义预热18.096s后degraded，实际通知原因只有project-membership-incomplete，metrics的projectFiles为20000准入规模；这不是实测Program.getSourceFiles计数。
索引11:50:31.536Z ready，30000/30000，约685s；99%从11:43:15.034Z至进度end11:50:31.537Z，436.503秒。
初始化中已有真实定义/hover、补全列表/详情、编辑/撤销/保存；初始化阶段未记录Worker退出。后续取消触发换代见下文，不把索引99%停留当崩溃。

工具校准失败与产品结果分开：共享日志读取占用、计划任务控制台抢焦点、过早发送定位键、模糊选择副本、项目树/编辑器控件焦点均保留原证据。
早期32.889s恢复检查发现Zed默认补EOF换行（文档/Context7确认）；仅测试profile关闭补换行/删尾空白，隔离输入已用UI恢复原SHA。
错误控件焦点产生的本轮自有脏缓冲区明确Don't Save；这不是用户未保存内容。无产品改动或重启掩盖工具失败。
十类校准11:57:53.699Z至12:02:53.006Z，299.307s/346驱动命令，10宏；不计正式时长。

原正式驱动12:20:13.305Z开始、UI标记为`12:20:13.396Z`，12:44:02.077Z提前停止，1428.772s/22宏（第22未完成）/939驱动命令；固定种子202610294859，八个真实模块目标，单会话，忙闲交替。
宏间手工专项只暂停自动键鼠，保留相同Zed/server/Worker；实际手工动作与静置时段另统计，不能称整段满负载。
已实际循环：定义/返回/hover、保存撤销、补全详情/Tab接受、43字节磁盘修改与未保存overlay交错/恢复/关闭、当前版本2322出现和消失、全局请求、快速导航、30–90秒空闲恢复。
引用/实现/调用关系完整性拒绝均记functional-gap并保留；不排除它们获得整体绿色。

## 最终分阶段结果与计数

下列时间均UTC，北京时间加8小时。窗口存活时间含等待/人工专项/空闲，不能当持续满负载；不同窗口不累计。

| 阶段 | 实际起止 | 结果 |
| --- | --- | --- |
| 冷窗口 | ready11:38:34.919 → 驱动结束13:25:57.944 | 107分23秒，含准备/校准/正式/空闲 |
| 原正式驱动 | 12:20:13.305 → 12:44:02.077 | FAILED，23分48.772秒，22宏启动/21完成/939命令 |
| 同窗口续测驱动 | 12:52:54.114 → 13:21:39.206 | 28分45.092秒，40宏/1801命令；12项完整范围错误另计，非全功能通过 |
| 暖窗口 | ready13:33:40.348 → 驱动结束14:31:33.960 | 57分53.612秒，独立会话，含长索引等待与专项 |

原正式与续测间隔8分52秒；没有完成计划60分钟未中断驱动，不把两段拼成通过。
暖会话Zed/server/native为13700/20756/12504，Worker线程1；同一安装与SDK、缓存key复用，未清缓存。
正式窗口共**1778个键鼠输入episode**：1212组按键、264次点击、302次文本输入/18021字符；另有288次截图。键组不等于物理按键数，驱动命令包含等待/截图。
冷窗口全阶段2179个输入episode，暖窗口51个；封存冷379+暖26＝**405张真实截图**。

实际覆盖八个文件、五个feature模块及common/product。正式两段共完成61宏：阅读7、保存撤销6、补全详情12、关闭重开6、快速导航6、诊断6、全局操作6、未保存撤销6、空闲恢复6。另一个保存宏因驱动焦点停止未完成，恢复另记。
正式有49次F12目标核验、12次保存后genAlbumsInfo核验、6次2322出现并在当前恢复版本清除；补全Tab接受后恢复原SHA。
此前保存/关闭回退边界：775/genAlbumsInfo约241ms、885/overlay优先360ms、1071/关闭后回退533ms均正确；覆盖相同输入权威交接机制，不冒称重放旧动作212/255全部前缀。
6次依赖overlay/43字节磁盘交错由外部文件系统辅助动作产生，与真实键鼠分开记录，未冒充UI文件修改。UI项目树移动/恢复/空目录删除两次另有截图。
暖窗口真实Ctrl+鼠标5次编辑前、3次编辑后，8次均正确到Log.info，关联LSP成功耗时206–330ms；包含初始化期间点击及完成后点击，不全是同一连续突发。
这组未复现“多点后永久无法跳”，不证明历史问题已修复。Windows实际实现快捷键Ctrl+F12由命令面板核对，未套用Linux快捷键假装完成。

冷窗口4856请求/4856终态（含shutdown），953次客户端cancel通知。4438个无错误、383个-32800，均有在途client cancel；35个其他错误单列，不能全部算取消/成功。
暖窗口关闭前245请求全部终态：224无错误、19客户端取消、2个-32803；cancel通知47次。
关闭时另发shutdown246，未捕获响应，279ms后server code0退出，记录为**关闭握手观测缺口**。不能写246全部终态，也不能推断业务请求卡死或OOM。
两轮无重复终态。截图为离散采样，没有逐帧验证所有瞬态旧内容；最新缓冲区和最终全量输入核验成立。

## 最终时延分布

单位ms，p95/p99最近秩。统计是LSP请求到响应，**不是鼠标到最终绘制时延**；后者未独立测量。
打开文件宏约8–10秒包含长绝对路径逐字符输入、等待和截图，不能归为server耗时。

| 成功样本 | 数量 | p50 | p95 | p99 | 最大 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 正式宏明确F12且核对目标 | 49 | 336 | 9040 | 9373 | 9373 |
| 正式所有definition，含Zed自动预取 | 866 | 49 | 1523 | 5679 | 9373 |
| 正式保存后genAlbumsInfo核验 | 12 | 264 | 286 | 286 | 286 |
| 正式completion | 400 | 47 | 274 | 776 | 1021 |
| 正式completionItem/resolve | 467 | 5 | 581 | 1009 | 1434 |
| 正式hover | 17 | 321 | 1158 | 1158 | 1158 |
| 暖definition | 48 | 42.5 | 1012 | 1600 | 1600 |
| 暖completion | 29 | 47 | 69 | 803 | 803 |
| 暖completionItem/resolve | 33 | 15 | 618 | 646 | 646 |

成功表之外：正式definition另10个-32803/6取消，completion另44取消，hover另67取消；不能只列成功表声称无错。
正式references/implementation/incomingCalls分别9/6/6请求，成功0，最大7021/4235/4563ms。
显式F12长尾远差于自动预取混合中位数；不能用49ms掩盖真实导航等待。

## 最终问题清单与补证

**WUI-001：特定注释输入后的自动补全失败，两次真实UI复现。**
文件`product/phone/src/main/ets/picker/PickerUIExtensionAbility__copy_003.ets`，末尾Enter后输入`// ui30k editable while indexing`，位置零基90:32、版本33，停止输入。
冷请求80/11:43:36.797Z为4244ms；暖请求116/13:55:46.708Z为3653ms，均-32803、相同message/位置/版本。
位于注释内合理结果可以是空列表，不能因此把RequestFailed算成功。暖轮已index ready约两分钟，非只能在初始化发生。
区间无目标编辑、无该请求cancel。撤销后Log.补全、详情和Tab接受恢复。
[Worker错误适配](../../src/semantic/semantic-worker-request-error.ts)将SemanticInputUnavailableError映射workspace-incomplete，
[runner](../../src/lsp/semantic-request-runner.ts#L175)再转换公开错误。具体哪份输入证明/准入检查失败无栈，仍未测，不强行归为全缓存或SDK单一根因。
最终普通definition同文案共9次，7次定位Picker uiExtensionHost import、2次SmartPicker签名；另1次发生于依赖有意缺失。SDK1580声明扫描未找到该module文件或ambient module，仅两处文档提及，是输入缺失线索，不能证明全部同根因。逐次ID/位置保存在requests-analyzed.ndjson。

**WUI-002：真实保存watcher与诊断取消触发一次退役/恢复。**
12:52:55.416Z实际UI撤销恢复AlbumGridItemNewStyle版本27；55.500Z诊断1268发送epoch1/thread1。
保存后56.199Z收到该文件workspace/didChangeWatchedFiles；[watcher](../../src/lsp/run-language-server.ts#L226) →
[proxy.workspaceFilesChanged](../../src/semantic/semantic-worker-proxy.ts#L202) →
[supervisor.mutate](../../src/semantic/semantic-worker-supervisor.ts#L210) →
[invalidateRequests](../../src/semantic/semantic-worker-supervisor.ts#L514)标记在途请求contentModified。
57.282Z [watchdog](../../src/semantic/semantic-worker-watchdog.ts#L75)报cancellation-deadline：等待1766.962ms、取消静默1026.661ms、原limit1000ms。
phase=program，Program starts111/returns110、checker110/110、terminal=none；证明该次Program尚未返回，不证明死循环、OOM或具体compiler内部热点。
58.804Z thread2创建，59.897Z [recover](../../src/semantic/semantic-worker-recycle.ts#L124)完成10份文档恢复；从退役日志到恢复约2615ms。
Node7156未退出，后续2333正确跳转但耗5679ms。取消cell独立写入时刻未记录，watcher/代码链可对应，不扩大成所有取消来源唯一证明。
冷轮创建Worker2次/恢复1次，暖轮1次/0；采样并发均1不能当作零换代。先前进度按并发数和局部日志误报零重建，已通过完整stderr对账纠正。非故障注入，也不是RSS预算回收。
这是一次真实退役/恢复证据，尚未缩成稳定必现最小序列；不把已恢复当作正常保存下零代价或长期稳定通过。

**WUI-003：同级交互队列长尾。** 实际项目树把ScreenManager移入`__ui_formal_move__`，依赖缺失期1588明确不可用（5716ms），没有成功返回旧路径。
项目树Undo恢复文件并删除新空目录；Picker零基53:20请求1688于12:35:18.571Z发起，9221ms后正确返回ScreenManager零基81:9。
父端准入到send返回8848.952ms（约96%），Worker接收到dispatch0.207ms，dispatch日志到公开结果约368ms；不机械相加不同计时域。
前序930–941是3份documentHighlights、1份typeDefinitions、8份codeActions，同epoch1/appliedRevision394，无输入mutation。
[lanes](../../src/semantic/semantic-request-lanes.ts#L5)把它们与define同列interactive/优先级1、稳定FIFO；[pump](../../src/semantic/semantic-worker-supervisor.ts#L302)等active终态才派发下一条。
因此已证实同级自动请求积压，不是此处Program更新9秒、mutation屏障/重建或RSS驱逐；各前序任务内部未细测，不凭并行native写入认定I/O根因。

**WUI-004：99%长期等待是native全量替换，未复现其后崩溃。**
冷initialize→ready约684.946秒，99%停436.503秒；暖initialize13:35:59.098Z→ready13:53:51.602Z约1072.504秒。
暖99%从13:36:32.703Z到进度end13:53:51.605Z，**1038.902秒**。均最终30000/30000且进度end。
早期状态更新曾使用过期采样误称仍在commit，最终严格以wire终态为准。

| SQL阶段ms | 冷generation1 | 暖generation6 |
| --- | ---: | ---: |
| 删除旧documents | 2.511 | 411900.027 |
| insertReferences（含occurrence/identity/alias/binding） | 88576.771 | 216838.321 |
| 创建索引 | 39265.104 | 72880.910 |
| commit | 296383.458 | 305697.178 |
| 整次replace区间 | 433844.513 | 1030146.918 |

其余preflight/dropIndex/insertDocuments/Symbols/Exports见native-sql；**insertReferences不再与子区间相加**。
[replace_all](../../crates/index-core/src/lib.rs#L929) → [SQLite实现](../../crates/index-sqlite/src/lib.rs#L330) →
[catalog_replace](../../crates/index-sqlite/src/catalog_replace.rs#L53) → [commit](../../crates/index-sqlite/src/catalog_replace.rs#L174)。
冷轮另有generation2–5四次30000文件全量替换，893.478/888.711/921.770/1027.872秒；发生在保存/外部磁盘编辑场景，不是四次Worker重建。
每代实际写入10551978个occurrence、3031704个occurrence identity、22773个alias、227237个binding；这些是native索引行数，不能换算成Program源码文件数。
暖轮复用cache key仍generation6全量替换，缓存清理不解决此成本。暖native完成后累计I/O读28.515GB/写21.280GB；完成后采样不证明commit期间磁盘队列或锁等待，内部checkpoint/设备等待未测。

**WUI-005：完整范围与客户端兼容限制。** 30K引用/实现/incoming均明确拒绝，未截断算成功；局部prepareCallHierarchy成功不证明incoming完整。
Zed initialize有documentChanges/resourceOperations/prepareSupport，但没有workspaceEdit.failureHandling；[supportsTransactionalRename](../../src/lsp/register-semantic-capabilities.ts#L587)要求transactional/textOnlyTransactional，所以没有advertise renameProvider。
实际编辑器F2没有rename/prepareRename请求，是现有客户端能力合同限制，与30K上限、SDK缺失、局部导航和native30000 ready分开；未强发协议冒充UI验收。

## 实际Program与资源口径

[project文件集合](../../src/core/workspace/document-store.ts#L34)的20000准入上限仍在，不等于Program实际文件数。
成功诊断/补全profile直接读取已有Program.getSourceFiles：冷234份profile观察总420–458文件，其中项目87–123、SDK281–283，根10–124；暖20份profile为总420/项目87/SDK281、根88。
仅为已采样依赖闭包，不是所有请求/Program普查。[programSequence](../../src/core/types/typescript-program-stats.ts#L40)为Worker本地WeakMap对象序号，不是构建次数。
所有Program构建、重复解析总次数、每源码读取次数未完整测量；不会用Program对象序号充当构建数。

按PID WorkingSet（RSS近似）/private分列，Worker线程不另加RSS；各自峰值不机械相加成进程树峰值。
CPU为相邻累计CPU秒/墙钟秒，1.0是一个逻辑核，不是整机百分比。

| 进程 | 冷WS峰值MiB | 暖WS峰值MiB | 冷/暖private峰值MiB | 最后可采WS冷/暖MiB |
| --- | ---: | ---: | ---: | ---: |
| server Node含Worker | 635.9 | 614.2 | 746.5 / 655.0 | 263.7 / 138.2 |
| native index | 3419.8 | 3414.9 | 3837.8 / 3818.2 | 2805.1 / 23.1 |
| Zed主进程 | 172.3 | 175.0 | 255.5 / 215.5 | 131.9 / 106.7 |

Worker isolate heap峰值冷609.6MiB/暖550.6MiB；暖最后heap仍549.9MiB，WS下降不能证明AST已释放。
正式server WS每10分钟中位数约568→600→537→343→324→329MiB；其间有换代、空闲及页面换出，**不能据下降宣称无泄漏或无需恢复也稳定**。
native反复约2–3.4GiB，结合重复全量替换解释工作负荷，不凭RSS认定泄漏。
冷/暖server CPU核心占用p95约0.946/0.0073，native0.629/0.252，Zed0.338/0.322；暖含大量空闲，不是等负载性能提升。
server句柄峰值208/203、末次198/194；native399/392、末次397/385。短窗不证明所有生命周期无泄漏。
整机最低可用冷4.545GiB/暖6.007GiB，D盘最低余量51.749/51.734GiB，保护未触发。
默认无预算的环境/配置已核对，但实际Node未超过1GiB，**本轮未实证跨4GiB行为**。诊断退役不归因RSS策略。

两轮窗口均经真实UI正常退出，冷server13:25:59.220Z、暖14:31:34.062Z code0；暖关闭握手缺口单列。
最终14:34:27Z核验自有Zed/server/native/采样器全部不在，任务Ready，未终止日常进程。保留安装、测试profile和缓存以复现。

## 缓存治理、保护与最终核验

[ADR0028](../adr/0028-index-cache-lifecycle.md)、[ADR0029](../adr/0029-opt-in-rss-memory-budget.md)分别验证实现范围，未伪造Accepted状态。
冷自动GC两次保护活动30K；暖GC为cooldown，不能再算一次实际清理。活动preview为active-workspace。
关闭后只读`preview --idle-ms 0`为eligible/idle-workspace，证明活动租约解除；**不代表默认关窗立即删除**，没有apply。
行政legacy夹具两轮回收143360bytes与preview字节/mtime不变均有结果；仅夹具0ms grace，默认24h/30d不变。
未清理真实历史12256个缓存或离线卷；DB/WAL/SHM按整体生命周期，不拆删活动WAL。多窗口/拒删重试等未在本UI会话穷举，不拿它替代已提交回归。
12:44:02起1299次尺寸样本，逻辑总长度峰值10782401310bytes（约10.04GiB），关闭后DB/use为5370200190bytes（约5.00GiB），WAL/SHM自然消失。
这是逻辑长度，非物理分配；不补造采样前尺寸。仍使用的测试30K缓存保留。

冷后全量审计与最终审计均MATCH：最终30287份项目输入、1580份SDK声明、6份release产物及日常launcher/WASM/settings哈希不变。
冷后还完整核对原Windows快照和2027份源码；隔离目录额外只有测试.zed/settings，移动目录未残留。原日常项目未编辑。
原冷审计外层240秒远程包装超时，但审计子进程继续并完成MATCH；不把包装退出124写成成功退出0。最终并行只读审计2.493秒完成。

## 最终证据与复跑

Mac根`.bench/windows-zed-ui-30k-20261029/`，Windows完整根同上；均保留，不发布用户数据。

| 证据 | 内容 |
| --- | --- |
| identity-start.json / remote-main-final.txt / installation.json | 源码、SDK/Node/扩展与实际产物身份 |
| checkpoints/cold-final-closed、checkpoints/warm-final | 原始wire/ui-events、逐请求、Worker metrics、native SQL/stage、完整服务日志/封存哈希 |
| ui-screenshots-cold.zip、ui-screenshots-warm.zip | 405张真实截图，ZIP校验通过 |
| server-cold.stderr.raw、server-warm.stderr.raw、zed-ui-final.log、zed-hang-traces.zip | 完整stderr、专用Zed日志及卡顿采样，不混用日常全局日志 |
| worker-recovery-real-ui-timeline.json | 一次真实诊断取消、watcher、退役/恢复的完整关联窗口 |
| real-ctrl-click-correlations.json | 8次Ctrl+鼠标的正确目标关联 |
| completion80-timeline.json / warm-observe-first-edit.stdout | 特定补全两轮失败 |
| queue-before-request1688.json / selected-queue-spans.json | 9.221秒中的队列占比与前序任务 |
| input-audit-final.json / cache-feature-result.json / cache-samples.ndjson | 输入保护、缓存行政夹具与磁盘趋势 |
| acceptance-summary.json / checkpoint的analysis.json、resources.csv | 分布、错误、CPU/heap/WS/句柄与生命周期 |

逐条JSON动作、start-agent*.ps1、zed-ui-agent*.ps1、ui.py、formal-controller-final/continuation.cjs已保留，均为真实OS输入，不是LSP重放。
复跑须新建run标签/输出目录，先核对私有窗口PID/坐标/源码SHA，保持原seed/场景，旧UI命令ID拒绝重用。不要直接覆盖原证据。
离线复核：证据根下分别运行`python3 analyze-ui.py checkpoints/cold-final-closed`、`python3 analyze-ui.py checkpoints/warm-final`，再`python3 summarize-final.py`。
分析工具针对关闭后relay控制记录/PowerShell七位小数UTC做兼容修正，失败命令与旧分析脚本保留于analysis-tool-notes；无产品改动/放宽断言。
本轮无产品修改，未重跑pnpm check:fast；历史2096/2096不算此次UI验收。未提交/合并/发布，也未部署日常Zed。
未覆盖：完整nativeSDK及其历史超时、默认launcher激活、超4GiB Node、历史Mac无限OOM、完整30K引用/重命名成功、outgoing calls、多小时未中断UI耐久及所有多窗口拓扑。
后续优先定位WUI-001输入证明、WUI-002正常保存下取消/不可中断边界、WUI-003同级调度，native全量替换另评估；本轮没有悄悄实施产品修复或改变阈值。
