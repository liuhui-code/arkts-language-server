# 保存入口、旧刷新协议与工作区退役：实施检查点

日期：2026-11-05。ADR0043仍Proposed；整体目标ACTIVE，IX-03/04/05未验收。
本记录只描述已发生的局部实现/验证；不等于完整检查、30K耐久、真实UI或Windows验收。

## 候选与执行隔离

- parent：`298d65f5d7f796c347fe8be5c739e428066489d8`，全部改动尚未提交。
- 集成工作树：`/private/tmp/arkts-index-versioned-maintenance-20261104`。
- 冻结的完整`pnpm check:fast`继续在该工作树运行，原始日志`ix03-uri-final-checkfast.log`，
  receipt `ix03-uri-checkfast-receipt.json`。本记录生成时尚未结束，已观察到失败，不能称全量通过。
- 为避免中途改写该轮输入，后续正式修改先在独立临时源码副本
  `/private/tmp/arkts-index-input-save-next-20261105`完成；依赖只读复用，native release实际复制而非符号链接。
  `ix03-next-candidate-location.json`记录来源；`ix03-next-checks-receipt.json`冻结该副本源码/命令与后续产物哈希。
  **副本局部通过不表示这些修改已经进入集成工作树**。待原轮终止后按明确文件清单集成并重验。
- 普通局部Node回归为21.6.2；后续冻结检查选用此前30K基线已有的20.19.5。
  不改日常Node、Zed、SDK、产品RSS预算、V8或超时。

## 逐项问题与处理

| 稳定标识 | 实际问题 | 根因及当前处理 |
| --- | --- | --- |
| IDX-V1-INPUT-005 | 磁盘保存但没有watch时，未取得新输入的完整资格 | LSP未声明save，也没有TextDocuments save订阅。已在临时候选接通，与watch共享磁盘输入处理链 |
| IDX-V1-COMPAT-001 | 原显式文本refresh调用被返回incompatible | 所有适配器调用者无差别协商新协议，而新格式正确拒绝旧写旁路。适配器原调用默认保留旧协议，生产catalog组合明确请求fileMaintenance；没有把旧refresh放行到新格式 |
| IDX-V1-GC-003 | 关闭后的新版工作区一直被保护，不能正常退役 | 清理器只认识平面文件及旧metadata表；`.owners`与schema12/112未接入。已补严格owner命名空间快照及已知格式只读身份解析 |
| IDX-V1-OBS-001 | 两个包别名回归报catalog未ready | 原测试只消费旧协议`index.catalog.phase`；新协议实际已有公开进度终态`index.catalog.terminal`。扩大到实际终态观察后，原accepted/fallback/完整Locations断言全过；不伪造旧generation/阶段 |

### 保存：只消费磁盘，不把编辑缓冲区写进索引

`TextDocuments.onDidSave → registerWorkspaceFileInputs.accept → WorkspaceFileChangeCoordinator →
observeWorkspaceFiles → Native maintenance/changes → 单文件事实更新 → 同token完整对账资格`。
语义失效/取消/诊断仍沿原watch处理顺序；observer在语义dirty基线读取前撤销Native输入证明。
SDK和overlay新鲜度、最后compiler证明没有绕开。

真实Content-Length framed stdio的128/129文件组合用例增加：

1. didChange只改overlay，workspace/symbol正确返回overlay符号；没有maintenance/changes。
2. 实际写盘后只发didSave，不发watch；向didSave故意附带另一份文本，不能把它当磁盘facts。
3. Native收到准确changed URI，单文件写1，对账再写0；关闭overlay后仍返回实际磁盘新符号，伪造payload符号为0。
4. 后续重复watch写0且head不变；原创建、移动、删文件并删空目录、恢复、配置用例继续执行。

公开RED：`ix03-save-public-red.test.mjs`及`ix03-save-red.log`，1失败，
原始`ix03-save-red/{wire.jsonl,lsp-transcript.json,lsp-stderr.txt}`；失败为保存后没有资格。
GREEN：`ix03-save-green-v2.log`四文件29PASS/0FAIL/0skip，约119.87秒；
真实wire/stdio在`ix03-save-green-v2/`。其中SDK缺失的组合索引用例不证明SDK完整语义READY。
保存并非免除完整对账的源集合/身份读取，尚不能宣称O(1)交互或摆脱全项目读成本。

能力及验证模型新增`textDocumentSync.save=true`，required capability从21到22；
保持整个对象的精确断言，新增可执行bundle证据。先有22项既有characterization通过，
再提取doc-sync证据模块；最终相关五文件34PASS，`ix03-save-capability-green-v2.log`。
旧大文件installed-semantic-smoke2144→2142，feature-matrix936→902，仍是迁移债；
本次新源/测试模块均不超过500行，主LSP499→465。

### 兼容：不能把显式文本写入混进磁盘维护域

生产`createProductionLanguageServerServices`明确`fileMaintenance:true`；只有该模式请求新能力，
新协议读取、URI维护、资格与完整对账保持新路径。已有显式`refresh(generation,text)`端口调用者
默认不请求该能力，保留原格式/旧读写合同及调用者generation。两种模式不在同会话自动切换。
显式开启新维护的会话仍不能使用旧refresh绕过CAS、源证明或发布事务。
旧binary的typed invalid_params只允许既有单次兼容重试；IO/身份/协议失败不新增降级。

原候选具备正常采样权限的四文件对照83项：77PASS/6FAIL，
`ix03-full-failure-control.log`，证明refresh/退役/旧日志观察失败不是RSS采样权限造成。
修订后4文件100PASS/0FAIL/0skip：`ix03-refresh-compat-green.log`。
真实生产LSP仍由上面保存组合的实际native wire证明协商新版，不能只靠测试fixture声明。

### 清理：完整组安全退役，保留活跃owner和未知内容

既有CacheLease、namespace排他锁、SQLite byte锁、源卷/路径证明、删除前快照及Windows占用策略保留。
只扩展已知数据DB对应的`.owners`单层目录；不开放任意递归目录。
owner名必须为生产者三段小写十六进制格式，普通无链接空锁文件；目录和文件都记录真实对象身份。
未知条目、非空内容、符号链接/reparse/hardlink等继续保护。

目录自身记录稳定对象身份，而不以删除过程本身会改变的目录mtime/size阻止部分删除重试；
每个子文件仍独立记录长度、mtime和对象身份，新增/替换/未知内容会改变删除前快照。
数据库/WAL/SHM与owner目录随整个工作区生命周期退役，不拆删活跃WAL或在日常30K缓存上试删。

只读识别schema12/112、facts format8/108与对应rowid布局；从manifest_identity取得工作区/store/domain，
再沿既有control/data身份、key和源路径核验。未来schema/facts或错配布局保护；
管理端认识两种物理格式，不表示任一producer被授权跨格式读写。

公开native RED依次暴露`unsafe-cache-entry`和`unsupported-schema`，
`ix05-versioned-retirement-red.log`、`ix05-versioned-retirement-green.log`保留两次失败；
v2首个生命周期GREEN后补安全反证。合法外形名字装入非空用户数据一度被删，
`ix05-owner-content-red.log`保留该反例；加严格空锁文件要求后GREEN。
最终三文件26PASS：既有cache_gc13、cache_gc_safety7、新退役6；
`ix05-versioned-retirement-all.log`覆盖活动保护/正常关闭、未知内容、链接、部分删除重试、
未来schema/facts及已知格式布局错配。strict workspace all-target Clippy通过，`ix05-retirement-clippy.log`。
Mac上的这些结果不能写成Windows文件占用/重解析点实机验证。

## 检查环境与无效准备轮

- 默认sandbox禁止`ps`读取本轮子进程资源；正常审批后的同命令可读。
  未改采样断言/禁用sampler/延长deadline。原失败完整轮保留；权限对照prepared-suite-cli26PASS只能证明该文件。
- Node21.6.2上的Windows跨平台测试使用了该版本未支持的URL windows参数，
  同源码在既有Node20.19.5上27PASS，`ix03-node20-platform-control.log`。
  官方[URL版本历史](https://nodejs.org/api/url.html#urlfileurltopathurl-options)明确options在20.13.0/22.1.0加入。
- Context7两次resolve仍为HTTP传输失败，未声称成功取到文档；save订阅核对实际安装9.0.1
  `vscode-languageserver/lib/common/textDocuments.js:163`：只对已同步文档发送save事件，不以payload替换文本。
- 临时源码副本首次遗漏config目录导致tsc/build失败，随后补齐原样config；
  `ix03-save-{check,build}.log`和首次`ix03-save-green.log`为无效准备/失败轮，不作产品RED或GREEN。
- 新native夹具曾并行复用同前缀，底层时间戳生成目录撞名；改为各场景独立名称后26项通过。
  原失败`safety.log`保留，不推断为产品初始化路径bug。
- 能力矩阵首次修订仍断言旧21项，33PASS/1FAIL保留；更新到真实22项并验证save项后34PASS。

## 尚未闭环

冻结的完整Node轮与临时候选后续检查均按receipt记录实际终态，不把进行中或旧候选结果当最终全量通过。
IX-03还包括漏watch发现/权威对账、未知目录/重连/overflow触发、resource-only免多余catalog、
持续输入下等待订阅与公平性；IX-05包括metadata/qualification/tombstone增长、partial、迁移/ACK等完整生命周期。
仍需规模两因素对照、最终双配置检查、原30K至少2小时单会话混合验收；真实Zed/Windows分别列。
没有提交、合并、部署、重启日常进程或删除真实缓存；原30K完整引用/重命名/SDK及UI缺口不宣称解决。

## 后续：本片集成、完整阴性与补全回退（按发生顺序）

前文“冻结检查仍运行/next尚未集成”为当时状态。该轮现在已结束：
2365项，2228PASS/137FAIL/0skip，checkfast exit1，5021.955秒；
receipt `inputsUnchanged=true`。137个失败逐项保留在`ix03-full-negative-summary.json`，
只对有直接证据的类别分类，其余UNCLASSIFIED，不把137项一概归因采样权限。
一次失败的versioned-overlay-disk收尾留下LSP18470/native18471，
读取确切父子/启动身份后仅给自有LSP发SIGTERM，使余下测试继续；
`ix03-full-stalled-fixture-intervention.json`。这是**有干预的失败轮**，不是全量验收通过。

`ix03-next-checks-receipt.json`六步检查已经终止：类型/fmt、Core+SQLite253、默认release及
实际LSP cache关闭检查通过；实验GC首轮26项中24PASS/2FAIL，不能称该轮全绿。
两个失败为未定位的unsafe-cache-entry，随后增加仅失败时的目录清单诊断，独立6项通过，
又有5轮三文件各26PASS；原阴性保留。问题**IDX-V1-GC-004**继续OPEN：
偶发保护来源尚未捕获，后续通过不证明已修复。没有放宽reason/安全断言或删除未知条目。

### IDX-V1-COMPLETION-001：可选索引污染完整编译器回退的覆盖结论

新全量还暴露项目target切换后completion.isIncomplete意外为true。
Node21和Node20真实Git工作树均复现；next初次非Git身份准备失败不作为该问题证据。
随后为next建立独立临时Git元数据，父298d65f、对象只读借用原库，没有创建提交或更改原Git；
`ix03-next-git-identity.json`。在该候选真实Git身份下再次RED：1PASS/1FAIL，
`ix03-overlay-next-git-red.log`，保留原完整结果/isIncomplete/target/诊断断言。

调用链：`SemanticWorkerProxy.complete → discoverCompletionCandidates → completionQueryPlan →
LegacySemanticEngine.complete → TypeScriptLanguageService.complete`。
Native变更后尚未重新取得资格时提供incomplete discovery；规划已经回退到完整已准入项目范围，
但仍把这份可选不完整discovery传到编译器适配层，最终以OR污染独立完成的覆盖结论。
修复在规划中区分实际编译器覆盖和可选augmentation：
**只有已选择完整workspace范围的回退才移除未取得资格的可选索引提示**，让完整编译器本身完成结果；
真正范围不足时继续保留部分提示与不完整标记。没有直接把isIncomplete设false，
没有消除SDK/截断/匹配overflow等独立不完整原因，也没有把不完整索引当完整结果。

原两项公开LSP用例GREEN后，再将已有batch trace构造提取到规划模块；
LegacySemanticEngine697→683行（仍迁移债），新模块/改动没有机械拆分或降低旧断言。
最后五文件23PASS/0FAIL/0skip，`ix03-completion-and-typed-reopen-regressions.log`：
完整auto-import、实际partial范围、target成员、同overlay连续编辑和native预打开恢复。

预打开Native回归改读实际新维护qualified收据，旧协议仍保留原阶段检查；
新增实际Native计数日志，第二会话必须indexed4/written2/reused2、head推进且两种引用策略均被恢复索引接受。
没有伪造旧discovering/buildingGeneration，原复用/新鲜度/完整Locations约束继续成立。

### 集成与当前验证

上述23个明确源/测试文件已同步到原隔离工作分支；清单/前后hash在`ix03-next-integrated-files.json`。
没有提交/合并/部署或覆盖原工作区其他40份既有文件。source/tdd以parent+dirty集合标识，而非伪造新commit。
新冻结检查已在真实Git工作树启动，正常审批允许读取自有进程资源；固定Node20.19.5、pnpm8.15.9。
完整`pnpm check:fast`、完整默认Rust workspace、fmt/strictClippy及实验GC按顺序执行；
`ix03-integrated-approved-checks.json`及各`ix03-integrated-*.log`，进行中不预报通过。
同候选协议证据输出到`ix03-integrated-approved-protocol/`；没有真实UI或30K长测结论。

另有构造函数scope的失败仍待定位：原全量watched场景未等到batch.start，
局部控制中unnotified场景返回-32803而旧测试期望捕获旧文本成功；
`ix03-full-late-failure-control.log`包含16PASS/4FAIL，其中两项明确是非Git准备失败，不能算产品反例。
将实际构造函数行为与捕获/最终新鲜度合同分开审计，**不通过接受任意错误或放宽成功断言解决**。
全部原IX03–08未完成项继续，尤其resource-only、漏watch/重连/持续流、完整metadata/partial及最终规模/耐久/平台。
