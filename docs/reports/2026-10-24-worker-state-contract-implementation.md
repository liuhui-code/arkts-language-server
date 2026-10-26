# Worker 状态合同实施与验证

日期：2026-10-24。状态：S1/S2/S3 实现及最终验证完成；未提交、合并或发布。
依据：[状态合同](../plans/2026-10-24-worker-recovery-state-contract.md)、[ADR 0020](../adr/0020-failed-semantic-build-recovery.md)、
[边界审查原始反例](2026-10-24-state-machine-boundary-validation.md)。

后续已将同字节候选安装到 Windows，并执行真实 Zed UI 操作，见
[Windows 安装与真实 UI 报告](2026-10-24-windows-zed-ui-validation.md)。发现补全 resolve 错误、重命名能力协商不可用和秒级慢操作；
下文较早的固定 LSP 测试通过结果不能替代这份实际 UI 结论。

## 候选身份和范围

分支 `fix/windows-path-identity-20261022`，父 revision `e35459131366a32c48c10d1d74adef74357cd3dc`。
这是保留全部前轮未提交工作的工作区候选；不把 Git 父 revision 当作当前代码版本。
919 项源码/测试/数据输入 SHA 清单：`.bench/state-machine-implementation-20261024/final-source-before.json`，
清单 SHA256 `e634a5662d0d04535744e39da7c7abf0042daad85fc098f16657d5ca0fdb19a9`。
另有 4 项配置 `final-config-before.json` 及原始起点相同的 rust-toolchain.toml `final-build-inputs-before.json`。
生产产物 76 项另列 `final-production-runtime-before.json`；其余 dist 项为测试生成物，变动单独核对。

- server.cjs：`ade1d78e8240c742595aefecb77bc7bb69f6f29745f70dfa71d3bfc858c543d5`
- semantic-worker.cjs：`17a806c36eac090e1f66ac7ded6a4ba6a4bb7a33fef6dde8a092ec8ee697d95d`
- 固定 compiler：`ohos-typescript@4.9.5-r10`，原文件 SHA256 `af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`。

不改引用缓存策略、输入新鲜度、SDK 身份或路径大小写规则；不重启暂停的索引路线，无发布/合并。
455 文件冷目录 3 秒性能门槛继续按用户授权排除，不能据此声称该性能门槛通过。

## 实现与所有权

### 恢复重放保留每个文档

`SemanticWorkerRecycle.defer` 仅合并同 root、同 URI 的相邻 open/change 全文更新。
此前 A→B 会覆盖 A；A→B→A 可在版本相同的 A 上返回旧依赖 B 的非空错误范围，READY 也不能证明正确。
保留 close/open/文件事件边界、32 条/4MiB 文本限制；不为该修复增加全项目扫描。
13 项精确跳转与独立 UTF-16 三编辑模型覆盖两文档组合、CRLF/emoji、关闭后磁盘权威和重开版本重置。

### 清算失败保留 owner 并隔离

`recoverableLanguageService` 使用 live/empty/retiring/quarantined/disposed 判别联合。
正常构建/同步异常：撤销同步证明，结清该 owner，进入 empty；同版本再试建立干净 LS，保留正常 SDK pins/其他 owner。
清算异常：保留旧 service/lease journal；`compiler-resource-lifetime` 强持有失败 owner 并关闭本 isolate 的编译准入。
`ownedDocumentRegistry` 在 release 抛错后记住不确定性，releaseRemaining 不盲目重复该 release。
生效前抛错和生效后抛错都测试过，不能从异常推断底层计数未变。

Worker 通过独立的 `{workerEvent:"fault",protocol,reason:"cleanup-ownership-uncertain"}` 通知父端。
该有界信号不携带 AST/LS/任意 Error，Host 校验版本/原因及当前物理 Worker 身份后进入原 workerFailed 预算。
请求照原取消合同结算：真实 $/cancelRequest 仍得到唯一 -32800；资源故障同时拥有监督责任。
退休过程中只允许旧命令结算其已取消的终态；新 Worker 身份/epoch 和退出围栏继续拒绝旧结果。
配置不能在同一污染 isolate 内通过换 SDK/新建 facade 绕开隔离；父端保存的配置和未保存文本在新 Worker 重放。

### 物理退出与 Promise 结果分开

`SemanticWorkerRetirement` 保留 handle、退出见证、drain、共享 pending 任务和失败原因。
Host 不再在任意 finally 清空退休责任。terminate 报错但没 exit 时禁止替代者；迟到 exit 不补充恢复预算。
预算允许的后续显式探测先停止同一个旧 handle；恢复 catch 不免费重试。关闭可再次完成同一资源的最终收尾，不能创建替代者。
terminate 报错且已 exit、pending terminate 时取消调用方、pending terminate 与关闭并发，均有独立公开测试。
`semantic.worker.retirement.failed` 记录 threadId、exitConfirmed 和原因；错误不等价于 exit。
LS dispose 异常也在 shutdown finally 中执行嵌套 verifier 收尾和 shutdownComplete；原关闭反例与 GREEN 均保留。

### 半开探测准入补证

第一轮扩大回归 83 项中 1 项失败，原日志 `31-focused.tap` 保留，不算通过。
单独复现及 queue trace 证明：重放唤醒的 background diagnose 先发送并卡在根枚举；
foreground semanticReadiness 尚在队列，它的准备执行预算没有开始。不是 prepare 已执行却丢了 watchdog。
probing 期间拒绝非显式工作，并在共享等待后的真正发送点重新检查，保证后台任务不能先占这次探测。
未延长预算/测试等待，未删除诊断功能；普通 READY 的诊断调度继续由原模块负责。

### 父进程的编译器隔离

本轮提取 shared fault 模块时，错误分类的传递依赖意外把 compiler 带入 Host。
构建产物由原 v8 的 924260 字节膨胀至 9574742 字节；新增公开 LSP 初始化/定义测试实际记录到父线程初始化 compiler。
`41-compiler-isolation-red.tap` 保存该回归；拆开纯故障协议和 compiler-aware 请求分类后，
`44-compiler-isolation-green.tap` 5/5，父线程初始化数为 0，Worker 标记实际执行。
最终 server 为 927188 字节。文件大小用于定位依赖边界，不能换算成 RSS 收益。
首轮全量检查因此主动停止，186855.509ms、真实 exitCode=-15，封存为 `v1-check-fast-final.log` 和 `v1-final-check-result.json`；
此前 Mac/Windows 数据是中间候选，最终候选全部重新验证。

## 可观察证据和回归

详细 RED→GREEN、命令及校准失败见 [TDD](../tdd/worker-state-contract-20261024.md)。
原审查测试已迁入 8 个正常快测入口，manifest 精确总数更新为 245（bundle-e2e 124）。
`.audit.mjs` 仍可显式运行，内部转入相同断言；原包失败数据未改写。

- 重放：精确 URI/范围，而非只断言非空或 READY。
- 清算：记录真实 Registry ref counts；共享 owner 反例中 Beta release 前 Alpha refs=1，恢复后两组可查，配置退休后项目 refs=0。
- 取消：使用真实取消通知进入生产共享单元；传输逐 id 验证一次终态。
- 物理资源：每次 created/exit、实际 stop 注入次数；关闭后 active=0，任何 audit-only orphan cleanup 都使测试失败。
- 预算：重复/迟到故障不额外恢复；4 次清算失败只允许 3 次自动重建；stop 重试有共享频率约束。
- 初始部分失败、普通可合作取消、健康 Program 普通取消、配置变化、致命退出、跨根及 mutation 溢出沿用原公开回归。

所有新故障点仅在隔离测试预加载器。Node terminate reject before/after 和外部迟到 exit 是防御性模型，尚无自然触发证据。
正常引用 verifier 的 job 失败/取消由 ReferenceVerifierClient 退休并等待其 Worker；本轮不重写其独立策略。

## 检查与真实项目结果

最终 v2 Mac 焦点 `45-focused-v2.tap`：84/84 PASS，零 fail/cancel/skip/todo，280028.688ms。
Windows v2 `recovery.log`：92/92 PASS，零 fail/cancel/skip/todo，325681.444ms（另含 8 项路径回归）。
Rust 路径合同 `40-rust-path-contract.log`：1/1 PASS；TypeScript `46-typecheck.log` 通过。
首轮 Windows v1 88/91、3 FAIL：测试包漏传 memory-release-gates.json，三个场景在夹具创建时 ENOENT；
未进入其测试主体。原包、原日志和逐次数据封存，补齐四份配置后重新运行全部 92 项，不把首轮改记通过。
Windows v2 六条串行命令全部退出 0；1003 项传输输入逐个核对且前后不变。
后验验证目录 Node/索引进程为 0，真实 `D:/code/applications_photos` Git 状态仍干净。
第二轮完整检查实际出现空白 hover 5 秒超时，保留并中断为 -15、1522523.682ms；不算通过。
原用例独立通过，原 13 项整文件表征通过；原失败无完整阶段证据，不能归因成初始化或任一 compiler 阶段。
对功能测试明确前置状态：先以 13/13 表征内聚提取 525 行旧夹具，再用真实 stdio/Worker 启动门栓得到 RED，
最小改为在原默认预算内等待公开初始化 complete/failed；failed 明确拒绝，之后才打开文档并运行原查询断言。
受控前置状态、失败初始化及编辑能力/manifest 为 19/19，加入原冷启动重叠查询场景后 `57-editor-startup-final.tap` 28/28。
产品截止和查询 5 秒预算均未改变，不据此声称修复冷启动性能。该变更仅测试代码，76 项生产产物逐字节仍等于 v2，
所以前述 Mac/Windows Photos 计时仍适用于最终产品；补充 Windows 功能验证独立记录。
第三轮完整检查在 Windows 补验发现旧测试路径断言后，主动停止以冻结最终测试版本，未记为通过。
Windows 补验 v3 为 115/116；隔离输出实测 SDK 仅一行、原生路径与完整目标相同，旧 POSIX 后缀得到 0。
测试改为 path.join 的完整目标精确相等，次数仍为 1，全部引用位置和不产生额外 batch 的断言不变；Mac 28/28 再次通过。
第四轮最终完整 `pnpm check:fast` 已正常退出 **0**：**2016/2016 PASS，0 fail/cancel/skip/todo**。
命令实际总耗时 3189009.985ms（约 53 分 9 秒），Node 测试阶段 3178961.101ms；这是整套检查时间，不是查询时延。
运行时间为 2026-10-24 09:36:14.599–10:29:26.168 UTC；TypeScript 检查、运行包构建及相关 release sidecar 构建均完成。
完整日志 `check-fast-final.log`、命令终态 `final-check-result.json`；5 秒测试进程树/主机资源原始采样 `check-fast-resources.ndjson`。
没有更改产品路径相等、大小写或身份核验，也没有为了测试通过修改产品行为。
最终 Windows v3 补验 `recovery.log`：**116/116 PASS，0 fail/cancel/skip/todo**，387272.589ms；
包含上述初始化前置状态、编辑能力、路径及恢复边界。1001 项传输输入在执行前后全部一致，
后验 Node/索引进程为 0，真实 Photos Git 状态干净。命令结果、指纹和后验摘要见 `windows-v3-verified-summary.json`。
原包 `windows-v3-evidence.tar.gz` SHA256 `1918f2ce7300225e0ef17dc621f82675cc186e5e5afe992a8e8ac999dc52d01b`；
解包路径 `windows-v3/state-machine-implementation-20261024/`。115/116 的首轮失败及原路径诊断仍独立保留。

全量结束后 `finalize-evidence.py` 核验：919 项源码/测试输入、4 项配置、rust-toolchain.toml 及 76 项生产产物全部与冻结版本一致，
`git diff --check` 通过。83 项 dist 清单仅 `dist/sdk-discovery-driver.cjs` 这一测试生成物在 SDK 发现回归中重建，
差异单独记入 `regenerated-test-artifacts.json`，不声称全部 83 项逐字节不变。
`cross-platform-candidate-equivalence.json` 另核实 Windows 最终补验与 Mac 的全部 919/4/76 项输入对应一致。
候选身份和最终统计为 `candidate-metadata.json`；`final-source-snapshot.tar.gz` 保存 924 项源码/配置/构建输入，
`final-docs-snapshot.tar.gz` 保存改动文档，`candidate-tracked.diff` / `candidate-status.txt` 保存继承工作与当前工作区状态。
这些检查不包含独立 large/发布矩阵；455 文件冷目录 3 秒门槛按用户授权未执行、不计 PASS。

### Photos 普通计时

使用 `applications_photos@a2c993829c46d965abefc5d2143187fa54fa4604` 的隔离副本：574 跟踪输入、288 磁盘源码。
288 不是实际 Program 成员数；本轮未测各 Program 成员总数，不用于规模复杂度分析。
Mac：Darwin 25.6.0、x64、i7-9750H/16GiB，1670 项 API24/6.1.1.125 SDK 输入；Windows：10.0.19045、i5-7300HQ/16GiB，1674 项同版本 SDK 输入。
两端均含 1580 个 `.d.ts`/`.d.ets` 声明；共同 1670 项逐文件 SHA 相同，Windows 仅额外包含 4 个说明/NOTICE 文件。
`compare-sdk-inputs.py` / `sdk-cross-host-input-summary.json` 保留核对过程；SDK 输入总数不等于声明数或 Program 成员数，平台间时延不作单因素因果对比。
两端均 Node20.19.5，生产 server/Worker SHA 与上述候选完全相同；Windows 复用已存在依赖和同源原生程序，非干净 pnpm install 验证。
Mac plain11/12/13；Windows plain1/2/3，每轮新进程/新索引目录，三个固定成员依次 first-open、repeat、edit-overlay、after-edit-repeat、close-reopen。
SDK、日志和隔离索引路径为必要配置；普通轮使用默认产品参数、无故障或诊断预加载，Mac 计时结束后才启动全量检查。
计时为 request 调用前至完整 LSP 响应；未重新操控 Zed UI，不等于键盘到像素时延。
first-open 指初始化终态后的首次打开，目标 Program 不保证全冷；未清 OS 缓存。repeat 是热态重复，不宣称结果缓存命中。

| 平台 | 状态 | n | 中位数 ms | 最大 ms | >500ms |
| --- | --- | ---: | ---: | ---: | ---: |
| Mac | after-edit-repeat | 9 | 148.170 | 270.475 | 0 |
| Mac | close-reopen | 9 | 316.324 | 399.135 | 0 |
| Mac | edit-overlay | 9 | 284.620 | 312.430 | 0 |
| Mac | first-open | 9 | 332.492 | 398.716 | 0 |
| Mac | repeat | 9 | 170.301 | 258.153 | 0 |
| Windows | after-edit-repeat | 9 | 283.073 | 312.877 | 0 |
| Windows | close-reopen | 9 | 481.385 | 512.088 | 1 |
| Windows | edit-overlay | 9 | 465.860 | 523.504 | 1 |
| Windows | first-open | 9 | 470.572 | 552.525 | 2 |
| Windows | repeat | 9 | 302.453 | 369.945 | 0 |

每个目标/状态 n=3 的中位数和最大值见 `measurement-summary.json.perTarget`；每次操作含文件、符号、位置、版本、序号、状态见 `photos-operations.csv`。
所有 90 项成员文本校验通过；额外按原始 didOpen/didChange/didClose 帧重放文本，独立 UTF-16 变换映射的 90 项范围检查通过（`edit-range-oracle.json`）。
该范围检查以首次实际定义为基线，不能替代对初始符号绑定或全项目语义的独立证明。
所有普通轮均 1 个语义 Worker、0 恢复、源/SDK/runtime 前后不变、退出 0。
六个普通轮另按每轮 `logs/server.log` 审阅（不重复累计相同的 stderr）：共 180 条结构化记录，
error/warn 为 0，公开 LSP 错误响应为 0，未出现无法找到源文件、client-cancelled 或退休失败记录。
各轮 stderr 的 30 行与对应结构化日志逐行计数相同，额外 stderr 行为 0（`photos-stderr-audit.json`），未漏算只写 stderr 的异常栈。
复现脚本 `audit-photos-logs.py`、逐轮明细 `photos-log-audit.json`；结论限于这六轮固定操作，不能推广到任意 Zed 操作。

初始化至 semanticPreparation 终态：Mac 中位数 19401.704ms / 最大 20998.953ms；Windows 中位数 35908.648ms / 最大 35960.603ms。
六轮均自然 degraded：2307，`@ohos.filemanagement.userFileManager` 缺失，不能把局部定义成功当作全工程 READY。
Windows 四项慢查询：

| trial / sequence | 文件、符号、0 基位置 | 状态 | ms |
| --- | --- | --- | ---: |
| 1 / 6 | `feature/browser/src/main/ets/default/view/photo/RenameMenuOperation.ts`，menuContext，33:10 | first-open | 524.852 |
| 1 / 13 | `feature/editor/src/main/ets/default/view/PcMainMenuBar.ets`，selectedMode，37:16 | edit-overlay | 523.504 |
| 2 / 11 | 同上，selectedMode，36:16 | first-open | 552.525 |
| 3 / 10 | `RenameMenuOperation.ts`，menuContext，33:10 | close-reopen | 512.088 |

原始 LSP 帧和编辑全文在各轮 `wire.ndjson` / `report.json.edits`，全部慢项见 `slow-operations.json`。
本轮未对这些慢项内部阶段做互不重叠的耗时拆解，不猜测 CPU/IO/GC 归因，也不把相较旧轮变化归因于某一修复。

### 受控卡死与资源

Mac fault11、Windows fault1：真实 SDK/Photos 的 checker bind 接缝受控同步不返回，随后真实 $/cancelRequest。
同一文件 `common/src/main/ets/default/view/browserOperation/ThirdDeleteOperation.ts` 的 callback，0 基32:10。
两端均一个唯一 -32800；调用方取消至终态分别 1.619ms / 2.637ms。这是调用方终态，物理退休随后独立完成。
两轮均 created1→exit1→created2→exit2，物理语义 Worker 峰值 1、总 2 个、一次恢复，关闭后 0；原请求不自动重放。
同输入恢复后单独新发的冷查询为 4986.948ms / 7774.914ms，随后 15 次编辑/重复/重开查询完成且成员校验通过。
仍有秒级冷查询，不据此宣称 500ms 性能目标完成；未测各内部阶段独占比例。

观察轮各一次：100ms 采样的整个 Node 进程 RSS 峰值 Mac 767.43MiB、Windows 732.39MiB。
RSS 包含所有 Worker，按 PID 只计一次，不按线程相加；会漏采两次采样间峰值，不代表内存上界或长期稳定性。
原生索引 RSS 未测，仅观察到一对 spawn/exit；不能据此给出全部进程内存总额。
资源结算依据实际 Worker exit、Registry 计数、关闭及进程后验，不用 RSS 是否即时下降代替生命周期证明。
`lifetime-summary.json` 包含取消原帧、查询时间、创建/退出顺序、观测口径和关闭证据。

### 调用链与复现入口

公开 definition：`run-language-server.ts:485` → `SemanticRequestRunner` → `SemanticWorkerEngine.define` / `WorkerProjectPreparation` →
`SemanticWorkerRecycle.request` → root supervisor → Host → Worker dispatch/answerRequest → Ohos engine → LS facade → 固定 compiler。
初始化和 mutation 通过同一 Host/恢复 owner，未给它们增加独立重启额度。

| 边界 | 最终源码位置 |
| --- | --- |
| 重放合并 | [SemanticWorkerRecycle.defer](../../src/semantic/semantic-worker-recycle.ts#L106) |
| 同 owner 退休与同版本重试 | [retire/available](../../src/semantic/backends/ohos-typescript/recoverable-language-service.ts#L32) |
| acquire/release 配对 | [ownedDocumentRegistry](../../src/semantic/backends/ohos-typescript/owned-document-registry.ts#L14) |
| 强持有隔离 owner | [compiler-resource-lifetime](../../src/semantic/backends/ohos-typescript/compiler-resource-lifetime.ts) |
| 故障消息与实际发送围栏 | [Host](../../src/semantic/semantic-worker-host.ts#L200)、[纯协议](../../src/semantic/semantic-worker-fault.ts) |
| 物理退休/退出见证 | [replaceWorker](../../src/semantic/semantic-worker-host.ts#L158)、[retirement.stop](../../src/semantic/semantic-worker-retirement.ts#L23) |
| 共享准入与预算 | [assertHealthy/admit/workerFailed](../../src/semantic/semantic-worker-failure-recovery.ts#L48) |
| Worker 准入/终态/关闭 | [dispatch](../../src/semantic/semantic-worker-runtime.ts#L106)、[answerRequest](../../src/semantic/semantic-worker-runtime.ts#L248)、[dispose](../../src/semantic/semantic-worker-runtime.ts#L482) |

复现：仓库根目录固定 Node20，`pnpm build` 后执行 TDD 的串行 node --test 命令；完整检查为 `pnpm check:fast`。
Photos 证据根 `.bench/state-machine-implementation-20261024/`：
`run-mac-validation.py`、`windows-v2-setup.ps1` / `windows-run.cjs`、`summarize-final.py`、`verify-edit-ranges.py`。
普通运行命令分别为 `node .bench/state-machine-implementation-20261024/photos-validation.mjs plain <trial>`；
故障为 `node .bench/state-machine-implementation-20261024/photos-fault-validation.mjs fault <trial>`。
每次需新 trial 输出目录；脚本不会覆盖已有证据。Mac/Windows 根、SDK、完整编辑和实际输入指纹均在逐轮 report/wire 中。
Windows 数据在 `windows-v2/state-machine-implementation-20261024/`，原包 SHA256
`f297127136b10e01f794a9c8221d4c98fca4b877cdc98d844e2ce2820f8082a0`。
V1 和早期失败仍封存，不混入最终 v2 统计。

## 资料依据及适用界限

本轮再次请求 Context7 resolve Node.js，HTTP transport 仍失败。沿用已核验的
[Node 20.19.5 Worker 文档](https://nodejs.org/download/release/v20.19.5/docs/api/worker_threads.html#workerterminate)、
固定版本内置源码和 [ADR 的 TypeScript/tsserver、rust-analyzer、clangd 资料](../adr/0020-failed-semantic-build-recovery.md)。
Node 正常 terminate Promise 在 exit 时兑现，内置 JS 没有普通 reject 分支；本轮额外模型验证的是错误路径所有权。
协作取消不能抢占任意同步 compiler JavaScript，所以监督和必要的物理终止归父端；不能机械套用 rust 的 unwind。
普通输入缺失的 degraded 是语义资格，quarantined/retiring 是资源责任，两者分别观察。

## 剩余限制

原 Windows 无限循环现场尚未自然复现；可控同步不返回/取消/异常测试不能证明其自然触发根因。
无 exit 的不可中断 native、自然 OOM、时钟回拨、任意 SDK/scriptKind/node-format 组合和长期 soak 未由本轮证明。
pending terminate 仍保留真实资源责任，调用方可以取消；Node 不提供的物理退出保证不伪装成已实现。
RSS 包含所有线程，按整个 Node 进程计一次；未立即回落不等于 AST 永久泄漏。
Photos 自然 degraded 和缺失声明限制整体语义完整性，局部精确定义成功不能替代全项目 READY。
仍有超过 500ms 的操作、规模增长成本未闭环；本轮没有重新跑 2 万文件规模实验，缓存性能 TODO 继续暂缓。
本轮触及的源码/测试/脚本均未超过 500 行；继承的超限源码债务（例如 typescript-language-service、legacy-semantic-engine、supervisor）未借机重写。
