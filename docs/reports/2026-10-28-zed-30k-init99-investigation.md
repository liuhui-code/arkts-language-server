# 真实Zed 30K初始化99%与Worker退出：权限复核及只读取证

后续更新：22:03已安装最新main；22:08用户手动打开真实Zed。
新的[实时现场报告](2026-10-28-zed-30k-init99-live.md)记录本轮15分2.860秒后索引ready、SQL调用栈和Worker未退出的证据。
下文BLOCKED是此前助手自动UI控制的历史状态，不应当作后续用户真实打开也未发生。

2026-10-28。本轮状态：**真实UI复现BLOCKED，0次操作、0秒UI测试；已执行安装身份核验、历史日志诊断及120.100秒被动资源观察**。
没有用协议模拟替代UI，没有启动新测试窗口/profile/LSP、替换安装、清缓存、修改产品代码或改变V8/保护/截止参数。
保留上轮未提交的index缓存调查报告和现有窗口/未保存内容。
证据根：`.bench/zed-30k-init99-20261028/`（下称B）。

结论不能写成“最新版未复现”或“99%之后必然OOM”：**最新版UI初始化尚未执行**。
已取得的旧安装现场显示，语义Worker因取消截止监督而被换代/退役，原生索引后来完成；
没有该现场99%首次出现的时间，也没有该现场fatal OOM或实际Worker退出码证据。

**本轮真实控制前置检查**

12:44:52–12:44:56 UTC（本地20:44:52–20:44:56）实际检查：

| 项目 | 实际结果 |
| --- | --- |
| 电脑控制工具原生表面 | apps=[]，只有in-app browser |
| `AXIsProcessTrusted()` | false |
| `CGPreflightScreenCaptureAccess()` | false |
| 排除文件系统沙箱后的只读Zed窗口查询 | exit1，System Events明确拒绝“osascript不允许辅助访问”，`-1728` |
| 真实UI打开/初始化/点击次数 | 0；新测试进程未启动 |

见`B/evidence/permissions-now.json`，不是引用早先权限结果代替复核。
只调用权限preflight，没有请求/修改TCC、截取未授权屏幕或用其他输入方式绕过辅助访问。
当前控制宿主进程链记录在`control-host.json`，实际宿主为
`/Users/liuhui/.codex/packages/app-server-daemon/releases/0.164.0-x86_64-apple-darwin/bin/codex`。
系统权限页里的显示名称没有仅凭路径猜测。

真实UI需要用户在**系统设置→隐私与安全性→辅助功能**中允许对应控制程序；画面核验还需
**屏幕与系统音频录制/屏幕录制**权限。只给Zed本身授权不能证明本会话控制端已获准。
依据[Apple辅助访问说明](https://support.apple.com/guide/mac-help/allow-accessibility-apps-to-access-your-mac-mh43185/mac)及
[屏幕录制权限说明](https://support.apple.com/guide/mac-help/control-access-screen-system-audio-recording-mchld6aa7d23/mac)。

**用户再次授权后的实际复核（本地21:39–21:53）**

用户已明确授权控制电脑，本任务不缺少操作授权；以下是执行通道的实际限制。

- 21:39:54–55再次运行权限preflight：AX=false、screen capture=false。
  这次窗口查询的`-1728`原文为“不能获得process Zed”，与20:44的“osascript不允许辅助访问”不是同一个错误，不能混称。
- 重新加载电脑控制文档后，`cua.getState()`仍仅返回in-app browser、`apps=[]`；
  实际尝试`cua.getApp("/Applications/Zed.app")`返回`cua.getApp is not a function`。
  因而除了独立权限探针未通过，**当前会话还没有可调用的原生应用控制接口**；仅切换macOS权限不保证补齐该接口。
  没有继续用其他输入技术绕过该限制，没有把授权文字当成UI操作成功。
- 21:50:48过滤进程及21:53:08完整快照均已无Zed/LSP/native进程。
  最新Zed日志21:32:36为`timed out waiting on app_will_quit`；LSP最后三条为同一分钟的
  documentHighlight cancelled、codeAction superseded、documentHighlight superseded。
  这些记录不能证明Worker OOM、崩溃或具体退出码，也没有在本次检查中触发新初始化。
- 安装仍指向下表的旧release，main与旧server/Worker哈希仍不同；没有因为用户再次授权就改记为main UI已测。

证据：`B/evidence/permissions-after-user-authorization.json`、`control-and-process-recheck.json`、
`after-user-authorization-identity.json`及`after-user-authorization/`完整日志副本。
**真实UI仍为BLOCKED/NOT_RUN，操作数0**。需要本会话开放原生电脑控制接口，并由实际控制端通过系统权限检查；
无需用户重复授权本任务本身。现有资料可以诊断历史监督事件，不能替代99%可见停留与Worker退出的现场复现。

**版本、产物和当前真实进程**

GitHub只读`ls-remote`与本地HEAD均为`9d47e550ee7c0a3ba9e0e889f62e04bb9fd4a78a`。
当前main产品源码与已验证candidate11零差异，dist哈希也与原验证一致；本轮没有重建后假称已加载。

| 层级 | 现有用户安装/进程 | main候选 |
| --- | --- | --- |
| Zed | 1.25.3，bundle20261023.131359；PID91860，2026-10-27 07:55:30本地时间启动 | 本轮没有新开测试实例 |
| 扩展 | ArkTS0.1.0-local-beta.1，release`eb601694…a18474b7`；WASM SHA256 `3776f76d011d2e3b2fafc5df67a6361558704107d51c9bbfa284b4889a5da774` | 版本名/WASM相同不能证明server更新 |
| 默认launcher | `~/Library/Application Support/Zed/extensions/work/arkts/bin/arkts-language-server`，SHA256 `2dfc4917100d959744587f2aeacfad8a345c217615e0dc7cfd7e5599c28834d8` | 本轮未替换 |
| launcher目标 | `~/.local/libexec/arkts-language-server/0.1.0-local-beta.1-f672888291183081cc957e9d291bb3c372ee8f91f582ec8211e4128eb34dc400/bin/arkts-language-server` | 不指向本轮已验证main运行副本 |
| server磁盘SHA256 | `118d7575dfbb6cbd65ae87037e64a95fee03fad9d69d759cd785684643270b81`，Node PID92778，父PID91860 | `913efb35639b32bfb7cc978eac5aa8f6e654a8a96147c9acf2b3572b8c161665` |
| Worker磁盘SHA256 | `d600e3c40ac2acdeab70c8521b87ba6c80af75c39aad492aab57fe1531595462` | `77d318293de68f8701e108dd836790fac685e0eef9c87af7af8f273ef36377f0` |
| 原生索引 | PID92783，父PID92778；现有安装与main均为SHA256 `8e9babc3bdaaa32747e5f55df9016dc196431e2baa1250180de1f20301674016` | 相同native字节不代表Node/Worker相同 |
| Node | lsof确认实际映射`~/.nvm/versions/node/v26.3.0/bin/node`，当前文件`--version`为v26.3.0；SHA256 `e2763aa08bc579e2b9d1b95b76821f863ca60c7b5ef451c5e1a483b0f4ac488a` | 没有用另一个Node运行新UI测试 |

当前release目录没有可证实LSP源码commit的manifest；不能把content-addressed release名当Git SHA。
以上Worker是当前磁盘产物身份，**没有附加历史进程来证明线程当年加载的字节**。
现有安装和main哈希明确不同，旧日志不能归为本轮main UI结果。
见`before-identity.json`、`after-identity.json`、`node-identity.json`、`remote-main.txt`。
12:44–12:57前后安装/产物哈希无变化，PID集合为91860/91861/92778/92783；
21:50以后复核这些进程已不在，不能将前一观察窗口的存活状态延伸为当前状态。

**项目和缓存前置状态**

只读检查实际项目`/Users/liuhui/Documents/code/applications_photos_30k`，
13,900 ETS＋16,100 TS=30,000源码，当前长度合计173,645,330字节。
没有将其加载到新的测试窗口，也没有把历史输入逐字节等价作为已验证结论。
旧会话`SDK selected`记录为DevEco默认OpenHarmony API24/component6.1.1.125；
新main UI的实际SDK选择、完整声明树与加载行为本轮未测。

用户原缓存未删除：`~/Library/Caches/arkts-language-server/index/workspaces/918ea384…cbe369/`。
DB5,291,745,280字节、WAL5,322,739,272字节、SHM10,354,688字节，合计约9.895GiB。
这是**现有持久化缓存/已运行会话**的只读观察，不是一次冷启动或热重开复现。
没有切换原项目缓存根或让新窗口和原窗口竞争此数据库。见`project-cache-state.json`。

**99%实际指哪条链**

若UI显示的是本LSP的`ArkTS workspace index`：

1. `src/lsp/workspace-index-initialization.ts:17`创建这个work-done任务；`:70–72`按文件比例计算，
   用`Math.min(99, ...)`封顶，只有`:37–54`收到ready终态才报告100并done。
   当前安装bundle的`:20276–20278`也能直接核对到相同99封顶公式。
2. 同一native产物的`crates/index-sidecar/src/catalog.rs:446–478`在最后一批解析后才设置
   `total_files=discovered`并发出Activating；在本次30K、无跳过情形下，全部解析完成时的比例也仍显示99。
3. `src/index/sidecar-workspace-index.ts:1224–1232`将activating映射为indexing。
   native随后在`catalog.rs:509–518`打开SqliteStore并调用`WorkspaceIndex.activate_catalog`，完成后发送Complete；
   `main.rs:445–466`提交状态ready，然后UI进度才能结束。

所以该99不是“剩下1%的SDK/Program构建”，还可包含数据库打开/迁移、事务持久化/激活和终态传递等待。
`prepareInitialSemantics`在`run-language-server.ts:174`独立启动；索引在`:193`启动，不能合成同一百分比。
但**没有本轮屏幕或旧会话的`$/progress`逐包记录**，不能直接确定用户描述的UI标题、99首次出现时间或停留时长。
旧会话也未打开native SQL子阶段trace，因此未给这些阶段补填毫秒数或断言SQLite是该次卡点。

**从现有真实Zed日志还原的旧安装现场**

以下日期为**2026-10-27，本地UTC+8**，不是本轮新开的测试；原始JSON时间为UTC。
Node PID92778及项目根与Zed旧日志中的启动命令相符。按PID和当前进程生命周期过滤，
共1180条LSP记录；没有将其他测试PID的错误算入此会话。

| 本地时间 | 实际记录 | 来源 |
| --- | --- | --- |
| 07:55:33 | Zed从默认launcher打开该30K根的LSP | `zed-existing-session-start.txt`，原Zed.log.old约6194行附近 |
| 07:55:35.208 | server.started | LSP.log.1:20656附近，精确行见timeline |
| 07:55:35.217/221 | semantic.initialization.started；Worker thread1启动 | LSP.log.1:20658/20659 |
| 07:55:43.244 | semantic初始化8027.408ms后complete，状态degraded；Zed通知原因`project-membership-incomplete` | LSP.log.1:20663＋Zed原通知 |
| 07:57:40.245 | watchdog报`cancellation-deadline`，method=complete，epoch1，Worker commandId70，limit1000ms，phase=request | LSP.log.1:20834 |
| 07:57:41.062/364 | thread2启动，recovery.complete，恢复2份文档 | LSP.log.1:20840/20841 |
| 07:57:44–49 | 出现completion、definition等ok终态 | timeline；没有UI/payload校验，不能等同完全恢复正常 |
| 07:57:52、59；07:58:09 | epoch2/3/4再次取消截止；第三次恢复后预算停止，thread4退役 | LSP.log.1:20865、20903、20936–20941 |
| 08:01–08:12 | 输入revision变化后多次half-open、替换；部分又停止恢复 | lifecycle JSON保存完整顺序 |
| 08:15:52.659 | **index.catalog.terminal=ready，30000/30000，skipped0** | LSP.log.1:21766 |
| 23:00:44.651/46.274 | epoch9又因取消截止进入thread10恢复，发生在索引ready很久以后 | LSP.log:4631–4633 |

从server.started到索引ready间隔**1217.451秒（20分17.451秒）**；
这包含多条并发链，**不是99%停留时长，也不是已分解的纯SQL/索引运行时间**。
首次监督事件距server.started125.037秒。旧日志缺少99起点及native各阶段开始点，无法继续精确相减。

整段日志累计10次Worker.started、9次unresponsive、9次recovery.complete、5次recovery.stopped/retired。
它们跨越约16小时，不是10个并发Worker，也不是无限无预算重建的证明。
627条error/218 superseded/128 cancelled/98 ok/2 stale是1073条request.completed的服务端分类，
不是本轮UI操作数、成功率或正确结果验收。

**退出原因和根因线索的证据边界**

- 可确认直接分支：以上9次unresponsive都记录`reason=cancellation-deadline`。
  旧bundle `:16456–16496`的watchdog检查取消期限并调用failed；恢复代码`:16924`起调用replaceWorker，
  `shutdownSemanticWorker`(`:16287–16310`)路径会调用`worker.terminate()`。
  是明确的监督/恢复路径，不应仅把线程换代称为异常崩溃。
  [Node Worker官方API](https://nodejs.org/download/release/v26.3.0/docs/api/worker_threads.html#workerterminate)支持owner主动终止；
  本场景缺少实际exit code，未填一个推测的code1。
- 首次事件的Program3/3、checker3/3、synchronization94/94均已记录返回，phase=request。
  不能归因为“Program没返回”或“synchronize死循环”；这些计数也不足以证明整个命令已完成终态发送。
  Worker commandId70不是已证实的公开LSP请求ID，旧日志没有该映射。
- `elapsedMs=1112.847`是watchdog的`now-entry.sent`，不是实测客户端取消后等待了1112.847ms。
  旧日志没有cancelled/activityAt/终态produced-sent-received时间，不能编造精确取消时序。
- 最新main的`src/semantic/semantic-worker-watchdog.ts:96–100`已单调保留接受的活动参考点；
  旧bundle在phase退回request后使用较早的entry.cancelled。
  这与[ADR0026](../adr/0026-cancellation-grace-terminal-handoff.md)的交接问题相关；
  但仅凭本旧日志，无法证明它实际因参考点倒退误退役，或新版已复现/已修复这一具体用户窗口。
- 当前复制日志中没有该会话的fatal OOM、ERR_WORKER_OUT_OF_MEMORY或未捕获异常证据，
  Node主进程与native进程在12:55–12:57被动观察时仍在；21:50复核已不在，退出原因未测。
  不排除日志未覆盖的历史内存压力，初始化真实峰值未测。
  唯一另外匹配到的unresponsive是PID49140、10月26日的已知独立旧测试，已单列而未混入。
- native最后ready，与语义Worker的取消监督独立。现有证据不支持“初始化一直无法完成然后native直接崩溃”。
  Zed在旧日志仍发请求，恢复后也有ok日志；不是这几条记录能证明的Zed断连。

**本轮120.100秒被动观察，不是启动验收**

2026-10-28 12:55:19.500–12:57:19.509 UTC，59次约2秒间隔采样，无任何UI输入或主动LSP请求。

| 进程 | RSS起→末/最大MiB | ps CPU最大 |
| --- | --- | ---: |
| Zed91860 | 68.762→70.355/70.355 | 0.3% |
| Zed crash-handler91861 | 3.805→3.805/3.805 | 0.4% |
| Node92778（含其Worker线程） | 30.598→31.418/31.648 | 0.5% |
| native92783 | 2.727→2.727/2.727 | 0.2% |

Node RSS只计一次，没有叠加每个线程。Worker实时线程数、独立heap、Program/checker当前活性未测；
没有附加inspector/preloader或强制GC。ps百分比不是初始化阶段CPU分摊。
`memory_pressure -Q`报告全机free始终74%；全机swap used9796.5–9828.5MiB，不归属到该Node。
低RSS是长期既有会话此时的驻留快照，不能解释为30K初始化只需这些内存或证明无泄漏。
历史request.completed的最高RSS样本741.871MiB同样不是运行峰值。
本轮前后PID和两份LSP日志哈希均未变，无新增已记录Worker事件；Zed.log仅有后续自身日志变化。
没有把“无新请求期间未见新错误”记为功能通过。

沿用500ms体验目标、测试Node RSS2048MiB提前停测豁免；本轮没有施加初始化负载，
不据低RSS判验收通过，也未修改产品4GiB压力策略、V8、请求/取消截止或其他保护。

**证据、剩余验证与复查**

B下保留`collect.py`、`analyze.py`、原权限probe、before/after完整日志副本和复制时稳定性/哈希manifest，
`existing-session-timeline.json`保存精确原文件行号与时间，`existing-session-lifecycle.json`保存换代/退役记录，
`existing-session-summary.json`保存分类与时差；`resources.ndjson`和`resources-summary.json`保存逐次资源数据。
`read-only-identity-verification.json`核对未替换安装、未新开服务、main来源及未使用协议模拟。

仍未执行：独立真实Zed窗口、main候选实际加载、打开时刻、99首次出现/可见停留、初始化CPU/峰值、
新Worker实际退出码/堆与故障后交互恢复。权限开放后，才可用独立profile和隔离30K副本执行这一轮UI场景，
记录明确冷/热缓存并保留终态阶段证据；不能用旧安装日志或既有协议长测补写这些结果。
本轮没有产品修复、发布、合并或删除任何用户缓存。

**后续：按用户要求安装最新默认server/扩展，等待用户手动打开Zed**

2026-10-28 22:03:18–22:03:42本地时间，运行仓库标准`pnpm zed:install`成功（exit0）。
重新核对GitHub main仍为`9d47e550ee7c0a3ba9e0e889f62e04bb9fd4a78a`，与本地一致。
安装使用pnpm8.15.9、Rust1.95.0，保留现有Node26.3.0；没有修改产品源码、SDK设置、索引缓存或内存/截止参数。
上文旧安装身份是安装前现场，**安装后默认launcher已切换**至：

`~/.local/libexec/arkts-language-server/0.1.0-local-beta.1-9814f85971bd1a0abf021ca99ef82f9bec69b15a41d0174646d8f203b7561e6c/`

安装后server SHA256为`913efb35639b32bfb7cc978eac5aa8f6e654a8a96147c9acf2b3572b8c161665`，
Worker为`77d318293de68f8701e108dd836790fac685e0eef9c87af7af8f273ef36377f0`；
公开launcher、server、两种Worker、native、扩展WASM、grammar和manifest均与本地main构建逐项哈希相等。
扩展版本名仍为0.1.0-local-beta.1；WASM与main本就一致，因此内容寻址扩展目录复用原目录，不代表server没有更新。

22:05:35–39以安装后的真实launcher、仓库外cwd、独立日志/索引根、`rootUri=null`执行
Content-Length stdio的initialize→initialized→shutdown→exit：PASS，initialize3350.332ms，进程exit0。
这是安装启动检查，**没有覆盖SDK/30K Program或真实Zed UI**；没有新开Zed或启动30K负载。
用户下次手动启动Zed将加载默认安装；若用户另设binary.path，该显式配置仍具有最高优先级。
本次已检查的默认设置及30K项目配置未发现此覆盖。

安装证据根：`.bench/zed-default-install-20261028/`。
`before.json`及`before/`保存旧CLI/扩展链接、launcher内容和原日志，旧immutable release未删除，可回退；
`install.log`、`install-receipt.json`、`installed-identity.json`、`installed-smoke.json`和原始stdio保存安装及检查结果。
用户复现日志仍为`~/Library/Logs/arkts-language-server/server.log`与`~/Library/Logs/Zed/Zed.log`。
真实UI状态仍待用户手动复现，未将这次安装检查写成99%问题通过或已修复。
