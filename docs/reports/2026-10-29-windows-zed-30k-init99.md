# Windows真实Zed：30K初始化99%与进程退出对照

执行时间：2026-10-28晚至10-29凌晨，UTC+8。原始JSON为UTC。
结论：**Windows也存在99%持续数分钟的问题；另一次非正常结束后的缓存重开发生30秒退化失败，不能算通过。未复现语义Worker OOM或恢复风暴。**
Mac前置：[真实99%现场](2026-10-28-zed-30k-init99-live.md)。
证据根：`.bench/windows-zed-30k-init99-20261028/`（B）；Windows：`D:/DevSetup/diagnostics/zed-init99-20261028/`（W）。

## 真实执行范围与身份

通过`ssh windows-pc`连接。使用官方Zed CLI，在已登录用户Session5的limited交互任务中创建独立窗口/profile；
确认MainWindowHandle、窗口标题、PID/父子关系，以及真实Zed发出的initialize和后续请求。
**没有LSP请求重放、合成点击/按键或用headless服务代替Zed。没有直接截图/读取UI像素；99%时长来自真实进度帧，非屏幕绘制时长。**

| 项目 | 实测身份 |
| --- | --- |
| 源码 | main `9d47e550ee7c0a3ba9e0e889f62e04bb9fd4a78a`，与Mac同版；Git archive传输，未修改产品源码 |
| Windows | Windows10 `10.0.19045.0`，DESKTOP-REQCEV6，i5-7300HQ，4核/4线程，物理内存17059520512字节 |
| Node | 20.19.5；SHA256 `e6ff5f7fefa7a94fb97ed86a9578dcf65df1bd5d0ab3117e6cb9b9c0bc74e17a`；Mac为26.3.0 |
| Zed | `1.25.3+stable.382.8dd255c3eafb5231056fe4e6f601cedd011f1c93`；exe SHA256 `9e8902cf9ee5e6a25367120e1e1a95d9185fbaf18c1ba9e84a0f93a8e13cc6a9` |
| 构建 | pnpm8.15.9、Rust1.95.0；标准安装最终明确exit0，仅安装到W/profile和W/local/bin |
| server | SHA256 `913efb35639b32bfb7cc978eac5aa8f6e654a8a96147c9acf2b3572b8c161665`，与Mac逐字节相同 |
| semantic Worker | SHA256 `77d318293de68f8701e108dd836790fac685e0eef9c87af7af8f273ef36377f0`，与Mac逐字节相同 |
| Windows native | SHA256 `1ce759bc55aead4eb6fc78c797881e96252c28a1b46340d16bc6958f135c6e95`，本轮同源码Windows release构建 |
| 扩展/grammar | WASM `d311ff6ea43914aaa8ff2de1ad5ed817da64c958fe055e2f08e2b627bf8e79a8`；grammar `700dc7496fcd9ed29ce4a0c68b98d9380b89e738f410edf596cf1f8dbe03a7b1` |

Windows不可变release：`W/local/libexec/arkts-language-server/0.1.0-local-beta.1-40caadcac77d57c0e122c6ff89fa2280f26e973e0d587e150f088737178b872f/`。
真实启动链是独立Zed→被动stdio relay→该release的server→同release Worker/native。
relay原样转发，另记完整帧/单调时钟；其开销未测，未从结果中随意扣除。

项目来自Mac原30K项目的磁盘快照，Windows隔离路径`W/project`。
30287个原文件、184046513字节、30000源码，传输前后及事后逐项SHA256一致；不含Mac未保存buffer。
仅额外增加测试`.zed/settings.json`；未改Mac原项目、Windows真实Photos或用户未保存内容。
公开initialize的rootUri明确为`file:///D:/DevSetup/diagnostics/zed-init99-20261028/project`，native终态独立核对30000文件。
打开目标：`product/phone/src/main/ets/picker/PickerUIExtensionAbility__copy_003.ets:44:9`（CLI的1基位置）。

SDK使用Windows既有声明版`D:/DevTools/sdk-declarations/openharmony-api24-6.1.1.125`。
1580份非build-tools声明逐项与Mac同相对路径/哈希一致，但Windows不是完整DevEco SDK，loader/build-tools等未对齐，不能宣称全SDK输入等价。
两侧日志均API24/component6.1.1.125、metadata identified、dialect unverified、typescript-compatible-only。

## 三个正式场次：失败不排除

所有场次保留产品默认超时/内存/规模策略，不清OS页缓存。
“冷”指没有持久化索引；“重开”指新Zed/server/Worker进程，不是同会话AST或结果缓存命中。

| 场次 | 本地server开始→索引终态 | server至终态ms | 协议99→end ms | 实际结果 |
| --- | --- | ---: | ---: | --- |
| 冷索引 | 10-28 23:55:18.388→23:59:04.149 | 225761 | 218302.481 | ready，30000/30000，跳过0 |
| 外部结束后的缓存重开 | 10-29 00:10:40.136→00:11:10.197 | 30061 | 未进入99% | **degraded，0文件；native消失** |
| 原生缓存正常结清后补充重开 | 10-29 00:35:12.752→00:44:50.475 | 577723 | 569606.980 | ready，30000/30000，跳过0 |

每个场次各1轮，不能报告成多轮中位数/最大值，也不能推导平台倍率或复杂度。
Mac已有缓存场次为902860ms至ready，精确99%时长未测；Windows开窗/恢复文件状态、Node、硬件、SDK完整度和观测方法有差异。
因此只能确认两侧存在相同的native完整替换链，不能将Windows各阶段比例倒填给Mac。

| 场次 | Zed / relay / server / native PID | 语义准备ms | Worker与结果边界 |
| --- | --- | ---: | --- |
| 冷 | 21248 / 17892 / 21652 / 8468 | 15655.638 | 1次started，0次退役/恢复 |
| 失败重开 | 13680 / 13908 / 11240 / 5964 | 14789.640 | 1次started，语义Worker仍在；退出者为native |
| 补充重开 | 2488 / 13716 / 5012 / 17652 | 16012.028 | 1次started，0次退役/恢复 |

三次是独立会话，不把3次初始Worker创建算作3次自动恢复。
语义准备均degraded，公开报告原因`project-membership-incomplete`，不是全工程READY。
源码默认成员路径预算20000/路径字节4MiB；本轮没有采集实际成员快照或各Program文件数，不能把native的30000当成Program文件数。
完整30K引用/重命名的既有限制仍未闭环；本轮没有将其计为成功。

## 99%中的非重叠SQL阶段

SQL trace为产品已有观测开关，两次完成场次均启用，未更改产品判断。
表内为`catalog_replace::replace_all`的互斥计时，单位ms；括号为其占SQL总计的比例。

| 阶段 | 冷索引 | 补充缓存重开 |
| --- | ---: | ---: |
| 预检/事务开始/移除辅助索引 | 312.102（0.14%） | 823.631（0.15%） |
| 清旧文档及关联表 | 0.403 | **62196.382（11.07%）** |
| 写文档/符号/导出等 | 9118.741（4.22%） | 8391.578（1.49%） |
| 引用写入，父区间 | **80187.622（37.14%）** | **173933.938（30.97%）** |
| 重建辅助索引 | 11136.430（5.16%） | 48170.096（8.58%） |
| transaction.commit | **115146.861（53.33%）** | **268181.356（47.74%）** |
| 拒绝表/元数据/剩余未覆盖 | 1.243 | 1.559 |
| SQL总计 | **215903.402** | **561698.540** |

两次均写10551978条occurrence、3031704条去重occurrence identity、22773条alias、227237条binding。
这是词法索引数据，不是语义确认的1055万条引用结果。
引用父区间内，occurrence分别53387.961/121247.065ms，identity22420.036/45658.500ms；
这些已包含在父区间，**不能再相加到SQL总计**。
commit包括其内部SQLite工作，未测其中checkpoint、fsync或系统I/O各自占比，不能全部归为某一种系统调用。
SQL最后stage到LSP ready仍分别间隔约2387/7899ms；文档析构、连接结清、跨线程/IPC等未逐项计时，未猜测归因。

调用链与Mac一致：
`workspace-index-initialization.ts:70`将解析文件比例封顶99 →
`sidecar-workspace-index.ts:1224`将activating映射indexing →
`crates/index-sidecar/src/catalog.rs:509–518`打开store并activate →
`crates/index-core/src/lib.rs:922`调用replace_all →
`crates/index-sqlite/src/catalog_replace.rs:80–180`完整事务 →
`catalog_reset.rs:9`清表 / `reference_insert.rs:35–43`写引用 →Complete→ready/100/end。

**源码未变的重开仍建立generation2并完整重写**，证明持久化文件存在不等于启动内容复用。
清旧只解释补充重开总差额的一部分：写引用、建索引、commit也更慢；布局/页缓存/设备I/O等未做独占控制，不武断归因。
没有将纯解析、SDK或Program准备算成整个99%阶段，也没有把并行的语义准备时间再加一次。

## 30秒失败：事实、强推断与未证实部分

失败重开之前，冷场索引已经ready。测试驱动确认无didChange后外部结束自有Zed及后代，保留缓存。
**这是非正常结束后的恢复场景，不能冒称正常Zed UI关闭重开。**

失败场真实记录：

- 进度仅begin“ArkTS workspace index/Discovering project files”；30秒后degraded0并end，未报告99。
- native5964在00:10:41.998–00:11:08.298仍可采样，随后00:11:10.361已不在；最大WorkingSet仅6.031MiB。
  server11240与语义Worker仍在，无semantic.worker.unresponsive/recovery或fatal OOM记录。
- 失败前后的cache已在未被其他native持有时整体复制到`W/cache-before-native-diagnostic/`，原样保留。
  DB5181833216字节、WAL5212331512字节、SHM2326528字节；DB header user_version=11/application_id正确。
  两份WalIndexHdr的isInit/pageSize/mxFrame均0。WAL为4096字节页，共1265129个frame槽位。
- 库版本为Cargo.lock的libsqlite3-sys0.38.2，实际bundled SQLite3.53.2。
  `sqlite3.c:67763`定义isInit；`:68826`的walIndexRecover读取WAL frame并重建索引。
  官方[WAL格式与生命周期](https://www.sqlite.org/walformat.html)说明未正常关闭可留下WAL/SHM，且wal-index可能需要恢复。

`SidecarWorkspaceIndex.openWorkspace`（`:146`）等待native initialize；
`SidecarSession.sendRequest`（`:635–663`）默认30秒，超时调用fail(...,true)，
`:794–828`进入terminateProcess。native initialize在`main.rs:169`附近同步打开SQLite、校验schema/身份，再返回元数据。
**30.061秒终态、前后进程与未初始化wal-index与这条超时/恢复路径高度一致，是强推断；
原场没有记录kill调用、实际退出码或native调用栈，不能把它写成已完全证实的主动终止，更不能称OOM。**
标准父端`:599–601`只drain而不保留native stderr；degraded进度也不带失败原因，是本轮归因的可观测性缺口。

随后独立运行同一个未修改的native，仅发公开initialize→shutdown，不算Zed通过：
initialize成功15437.409ms，返回相同workspaceIdentity及committedGeneration1；shutdown响应后约14825ms正常exit0。
诊断前复制缓存会预热OS缓存，并且没有并行语义准备，**不能用15.44秒代替原失败的内部时长**。
正常结清后的补充真实Zed场次才得到上表577.723秒/30000的结果；原30秒失败仍保留。

官方还说明最后连接关闭通常执行checkpoint和WAL/SHM清理。
产品正常shutdown在`:689–707`等native关闭的默认宽限为1000ms；本独立诊断关闭实际约14.8秒。
这暴露需要后续验证的关闭/恢复预算交界，但**没有实测正常Zed UI关窗，不认定其必然同样失败**。
未调高初始化或关闭截止，也未删除WAL绕过恢复。

Windows事件日志另有冷场期间的RADAR_PRE_LEAK_64（23:58:25，event1001）。该native随后完成并释放大部分内存；
此事件没有warm退出码，不能拿它证明warm OOM或永久泄漏。原始事件完整保存。

## 资源、取消与保护

单位MiB。WorkingSet为每个进程采样一次，Node包含其Worker线程；private bytes是另一口径，不能与WorkingSet相加。

| 场次 | server峰值WorkingSet/private | native峰值WorkingSet/private | native操作后WorkingSet/private |
| --- | ---: | ---: | ---: |
| 冷 | 606.785 / 640.238 | 3119.430 / 3516.234 | 34.910 / 27.137 |
| 失败重开 | 607.074 / 641.336 | 6.031 / 0.766 | 进程已不在，退出码未记录 |
| 补充重开 | 603.785 / 637.332 | 3367.977 / 3771.012 | 28.008 / 31.367 |

另有relay约28–31MiB，不算作Worker；Zed峰值约153–159MiB；详细句柄/线程/CPU时间在逐样本observer中。
父线程heap日志不代表Worker堆，未测各Worker heap、Program/AST数量或系统I/O峰值。
Mac连续RSS采集开始较晚且不是完整启动峰值，不据不同口径断言平台内存高低或泄漏。

Node2048MiB停测线豁免。后两场沿用native5120MiB/树6144MiB/系统free15%/磁盘1GiB保护；无触发。
冷场旧采集器只配置了磁盘及512MiB极限free保护，已纠正；原始样本亦未越过上述原保护水平，未借配置差异排除失败。
500ms作为体验目标；本轮数分钟持续慢启动仍列为问题，没有因偶发超标单独判失败或降低产品正确性断言。

冷场实际Zed流中记录57条definition响应，来源动作未记录，不能等同57次人工点击。
全流另有48条RPC错误（含definition/hover）全部为-32800，逐条有更早的真实客户端取消通知，无未配对取消错误；无Worker换代。
保留`cancel-audit.json`，不把取消算成功语义结果，也不把这些RPC当成已完成连续点击正确性验收。
Zed自身日志另有ACP registry图标网络超时WARN，未归入ArkTS SQL或Worker耗时。

## 采集器失败与事后核验

以下属于准备/采集失败，不计入产品时延，但不删除证据：

- 初始Windows Home无quser，探针exit1；改读explorer Session5。
- 聚合inventory-v2超时后远端仍运行，按EncodedCommand SHA256精确核验后停止PID17740；
  它的WorkingSet64样本为17871093760字节。不能把这项严重采集失败误记成server OOM。
  后续使用固定标量/纯字符串；浅层审计也观察到Get-Content扩展PSDrive元数据膨胀至约502KB，原失控具体CPU热点未采栈。
  **不要再次运行inventory-v2.ps1。** 正式场次之前health显示free约12.65GB，且该探针已退出。
- 安装包装器等待未返回，停止的仅是SHA匹配自有脚本；重新用明确进程等待取得标准installer exit0，未借旧产物继续。
- 首次CLI同时传目录/文件导致LSP根仅picker，108文件。保留`calibration-108/`，状态INVALID_30K_SCOPE。
  正式场改为先开目录，再`--existing`打开文件，并由initialize/30000终态验证。
- 事后全量哈希核验超过本地SSH等待期限；远端最终完成。最终结果来自已落盘收据，另用audit-safe重新核验，不重复假称超时即通过。

事后30287个原文件、30000源码、1580 SDK声明、server/Worker/native配置哈希全部匹配。
额外文件仅`.zed/settings.json`。自有测试进程及计划任务归零，默认Zed launcher仍指原日常安装，未替换用户默认环境。
各场末尾的外部清理时间/PID明确写入cleanup-intent，不能把这些退出计为产品自发崩溃或正常LSP shutdown证明。

## 证据与复跑

本地结果：`B/cold-final/`、`B/warm-failure/`、`B/cleanwarm-sealed/`；各有完整wire、server日志和资源，完成场次有SQL阶段。
`B/warm-sealed/`另存原失败后的外部清理标记，不覆盖首次失败快照。
`comparison.json`、`sql-exclusive-breakdown.json`、各场`analysis.json`提供可重算数据。
`native-open-final/`为独立native诊断，`failure-cache-header.stdout`及`sqlite-wal-source-evidence.txt`保留头部/源码依据。
`project-input-manifest.json`、`installation.json`、`transfer-manifest.json`、`postflight-result.json`、最终audit及Zed日志保存身份与清理证据。

实际入口脚本：`finish-install.ps1`、`configure-full.cjs`、`run-full.ps1`、`start-full-cold.ps1`、`start-full-warm.ps1`；
补充场为`configure-clean.cjs`/`run-clean.ps1`/`start-cleanwarm.ps1`，均以交互limited计划任务调用官方CLI。
`remote.py SCRIPT LABEL TIMEOUT`封存远程stdout/stderr；`analyze.py RUN_DIRECTORY`重算协议/资源。
复跑须换唯一基目录、profile和任务名，先核对输入/实际root，不覆盖现有场次；独立native诊断不得当UI复跑。

本轮未改产品、未重跑完整pnpm check:fast、未推送/合并或发布。
剩余重点是持久化目录有效内容复用、全量替换/提交成本、原生初始化/关闭恢复和失败原因可观测性；
需后续有对照回归的修复，不能靠提高截止、删校验或提前报告ready掩盖。
