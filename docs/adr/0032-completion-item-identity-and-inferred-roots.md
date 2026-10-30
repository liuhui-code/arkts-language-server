# ADR0032：请求身份、同输入复用与有界读取准入

- 日期：2026-10-30。
- 状态：**Proposed；已授权实施，未追认独立评审或Accepted。原C1/C3/C4真实UI失败均保留；最终C4完整2136/2136、Windows91/91通过，但SDK新诊断RED0/1及UI未闭环，未追认独立评审。**
- 问题：WUI-004、WUI-003/WUI-005、WUI-006/WUI-008；[现场](../reports/2026-10-30-windows-zed-ui-endurance.md)、[后续修复及原失败](../reports/2026-10-30-ui-remediation.md)。
- [实施计划](../plans/2026-10-30-ui-remediation.md)；最初父4859f76，工作期间外部main推进至78a3158；本轮分支保留新增外部改动、ADR0030/0031和原失败历史。

## 官方参考与边界

Context7按LSP、vscode-languageserver、SQLite分别resolve，均传输失败；退回官方资料，未假称Context7核验成功。

- [LSP completion/resolve](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/language/completion.md)：
  请求对象是具体item，不能因为同文档另一个item到达就把仍有效的前项视为过期。
- [VSCode TypeScript completions](https://github.com/microsoft/vscode/blob/main/extensions/typescript-language-features/src/languageFeatures/completions.ts)：
  MyCompletionItem.resolveCompletionItem维护逐项共享promise、消费者计数和独立底层取消源。
  这里复用现有InFlightRequestCoalescer，不复制其300ms取消延迟，也不缓存跨输入变化的最终详情。
- [TypeScript4.9.5 synchronizeHostData](https://github.com/microsoft/TypeScript/blob/v4.9.5/src/services/services.ts#L1251)：
  getProjectVersion相同会提前返回；根文件列表也是输入，不能只停止推进版本却暗中改变根列表。
  实际安装ohos-typescript4.9.5-r10沿用这一机制，不采用TypeScript7/snapshot的新架构。
- [clangd读写队列](https://clangd.llvm.org/design/threads)：取消失效读取、合并更新，读取使用此前有序更新的AST。
  这里保留单Worker、mutation/global屏障与有限公平；不复制每文件线程或旧preamble补全策略。
- [clangd TUScheduler源码](https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/TUScheduler.cpp)：按文件归属保存更新与独立读取；有效读取不能仅因后到读取丢弃。
  这是归属与顺序的参考，不声称clangd采用下文64来源/4MiB的本项目准入数值。
- [LSP请求取消与响应顺序](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/specification.md)：取消绑定请求ID，取消也须产生终态；独立响应可乱序，不授权同文件后请求作废先请求。
- [TypeScript4.9.5 Session](https://github.com/microsoft/TypeScript/blob/v4.9.5/src/server/session.ts#L3267)：执行时绑定具体request.seq，在finally清除取消上下文。借鉴逐请求所有权，不照搬其同步调度器。
- [SQLite WAL](https://sqlite.org/wal.html)：commit可能包含自动checkpoint，移出提交线程是官方支持的选项，
  但会改变WAL维护及关闭生命周期。当前只有commit区间330秒，不能直接认定其中各I/O成本或据此关闭checkpoint。

上述是适配机制，不是其他语言服务器在本项目规模下的性能保证。

## 已确认缺陷与边界

WUI-004：正式510次详情中487次通用回退；文档生命周期/版本未变、无对应客户端取消，父端同区间487次superseded。
公开反例：两个item串行均有签名，并发则前项通用。另一个反例证明同item重复请求也会相互取消。
根因是最新请求lane只有method+URI，错误地把不同item视为一个不断更新的操作。

WUI-003/WUI-005：请求5957等43.519秒才send，期间同revision896派发18个高亮、17个codeAction、7个定义、1个类型定义。
高亮队列不断将当前Program中已加载的闭包依赖提升到resident scripts；partial项目没有完整member准入，
旧L02 promotion只覆盖完整成员lazy路径，fallback snapshot不受益。Host把新resident自动加为入口，推进版本，
产生多份约1.2–1.5秒的无内容变化Program更新。公开20007文件反例中Program1→2；修复后仍1且根数量不变。
这是队列服务成本放大机制，不是断言所有导航长尾只有这一个原因；公平队首、同类FIFO和真实新输入仍有成本。

WUI-006：上述候选正式UI第53宏，F12请求4516被同URI其他位置的自动定义突发取代，返回空而没有跳转。
无编辑、无客户端取消、无Worker换代。补全item的身份修复没有覆盖其他读取入口；公开反例证明默认语义读取、
call hierarchy专用入口及workspace/symbol仍有隐式替换。它与WUI-004共享错误的请求所有权机制，
与Program重复更新是不同缺陷；不能用后者解释空结果。

## 决定A：逻辑身份与失效范围分开

1. SemanticRequestRunner可接受identityKey。详情使用已认证的服务端item UUID；不采用客户端任意标签/路径作为身份。
2. 不同item的lane独立；同item/文档版本共享现有在途操作。每个请求保留自己的取消token与唯一终态。
   最后一个消费者离开才取消共享工作，不让第一个消费者拥有全体请求的物理生命周期。
3. 文档失效scope仍为document；编辑、关闭/重开、旧句柄和最终输入校验保持原合同。
   disk-source路径也使用同样的lane键，不改变其exact source SHA和workspace最终校验。
4. 完成结果不做新缓存；跨配置/依赖更新仍走原证明。引用请求已有合并合同保留。
   初始候选保留列表latest-wins；WUI-006真实反例后由下文决定C替代，保留决策变更记录。
   通用合并日志使用semantic.request.coalesced，引用历史事件名称继续兼容。
5. 逐项独立后，公开128项有效预取反例暴露共享Worker64项物理队列溢出，不能将该反例视为编辑器错误。
   CompletionResolutionQueue在coalescer之后按workspace串行准入详情；底层本就单Worker串行，
   不增加checker并行度。初始候选未改变共享64条请求上限；WUI-008真实反例后该计数门槛由决定D替代。
   详情总在途/等待项数沿用既有句柄上限512，超量明确RequestFailed。
   同项订阅只占一项；取消立即移除未执行项，正在执行的项到Worker真正结束才释放准入，避免取消风暴穿透背压。
   shutdown停止接纳并结清等待项；编辑/关闭仍由Freshness取消，各项执行前再检查记录身份。
   不改变其他前台/后台公平策略或mutation屏障，保证真实新鲜度而不是返回伪成功详情。

拒绝仅把resolve改成全局并发、吞掉取消或把原通用item算详情成功；它们不能解决同item多消费者所有权。

## 决定B：推断入口与源码缓存分别拥有生命周期

1. 提取TypeScriptHostRoots。推断根是语义输入，resident scripts只是文本缓存；依赖提升不自动成为新根。
   实际新入口、开放overlay及当前查询文件仍进入根集合并推进Host版本；显式语义组/完整成员根保持原覆盖。
2. 仅在真实Program已返回、记录的Host版本与当前版本相同，且Program确有该SourceFile时考虑复用。
   不调用getProgram强制构建来证明命中，也不扫描所有SourceFile或项目文件。
3. fallback snapshot在读取前后以相同完整磁盘身份登记弱引用证明；提升时要求实际SourceFile持有同一已证明snapshot，
   文件身份仍相同、snapshot文本等于SourceFile文本，并与当前生成后的compiler文本逐字相同。
   不仅比较原source SHA；ArkUI转换导致compiler文本变化时仍重建。
4. 满足上述条件才保留原compiler version、Program和原根列表。证明缺失、Host已推进、真实编辑、删除或新增入口均走原更新。
   不删除真实路径/符号链接/命名空间/响应前校验，不全路径小写。
5. Program只用WeakRef，snapshot证明用WeakMap；失败/回收/trim清除相应证明。
   推断根随resident删除而移除，不建立永久追加的源码/AST缓存。既有内存/恢复策略不变。

拒绝无条件固定版本、取消ProjectVersion、扩大partial为完整、修改队首公平断言或新建并行checker；
本次通过减少不必要工作改善排队，原mutation顺序、global屏障与有限公平不改。

## 决定C：独立语义请求不相互替换

1. 普通语义读取、磁盘来源读取、call hierarchy三个入口及workspace/symbol统一使用startConcurrent。
   identityKey表示逻辑分组，不表示后到请求拥有前一请求的取消权；相同位置的两个独立请求也各有终态。
2. 仅真实客户端取消、文档/工作区输入变化、关闭重开和shutdown触发既有失效；最终文档/磁盘/工作区围栏保留。
   取消一个请求不取消无关消费者；已有引用/详情合并器仍按各自完整输入键共享物理工作。
3. 初始C3不增加结果缓存、未提高Worker物理队列、不并行checker；后续决定D替代该队列计数部分。交互分类、有限公平及mutation屏障不变。
   普通读取继续受既有物理队列及背压约束；详情预取另受决定A的有界准入约束。
4. RequestFreshness.start工具保留显式替换能力，但生产LSP入口不再用method+URI隐式替换独立请求。
   不改为method+URI+position作为修补：这仍会漏掉重复请求、多消费者、workspace query及未来方法。

验收：不同位置、相同位置、不同workspace query与9请求Zed突发独立完成；显式取消、编辑及同版本关闭重开仍失效。
公开17项新回归覆盖定义/类型定义、hover、signature、补全列表、高亮、引用、prepareRename、三类调用关系及workspace symbol。

## 决定D：按源码归属和待处理输入计量，替代全局64条读取门槛

C3真实UI关闭回盘第4宏，1.2秒出现80个不同参数读取；未取消有效读取后，旧64条上限返回30份queue-full错误。
原9请求测试覆盖不足，不能靠已有48项GREEN否认现场；80个不同位置的公开stdio反例稳定RED。
不是重复请求，不能靠合并不同位置或返回空结果降低队列。也不把上限直接改128/1024来追逐某次流量。

1. 提取SemanticWorkerPendingReads，最多保留64个不同canonical源码URI的等待归属，
   同源码不同方法/位置仍是独立记录，不作结果合并；aggregate canonical输入UTF-8字节沿用4MiB受管输入边界。
   **这替代原64条请求计数，不能宣称旧计数策略没有变化。**4MiB是序列化输入计量，不是RSS/JS对象实际占用承诺。
2. 活动命令和detached reference仍各由原生命周期管理；等待记录受来源与字节双界约束。
   超出任一边界仍明确queue-overflow，不取消有效请求、隐式截断结果、无界增加外层等待promise或重建Worker。
3. 在原单一调度队列中准入，复用原有限优先、同类FIFO、队首一次绕过及global/mutation屏障，
   不增加一层FIFO破坏前台优先。每次dispatch、排队取消、输入失效、故障和dispose都归还归属/字节计量。
4. 字节只从已校验、冻结、无getter的canonical输入计算；URI沿用现有身份校验，不全路径小写或删边界校验。
   不修改V8、产品截止、恢复预算、默认RSS策略或真实项目成员上限。

验证包括80个不同位置正确结果/每ID单终态、单消费者取消、编辑和同版本关闭重开、
64不同来源拒绝第65来源、同一来源大payload触及4MiB、取消/失效后容量恢复；原公平/屏障/故障回归保持。
原“64同源位置必须拒第65”测试为被替代策略，原件保留；其真正超载保护改由来源和字节边界分别验证。
不将本次容量策略升级为所有突发或所有尾延迟已解决；最终整轮及真实UI需按新候选重跑。

## 记录与验收

证据根`.bench/windows-ui-remediation-20261030/`；completion-red/duplicate-red/promotion-red保留父版本及失败命令。
对应GREEN、128项背压、排队取消/关闭重开、单消费者取消、编辑失效、磁盘回退、伪造句柄、SDK/包/入口切换、完整引用和调度公平34项通过。
第一候选完整2113/2113不能覆盖决定C/D。C3 server de22cc02/690源清单在Windows48/48后真实UI仍因WUI-008失败。
C4 server dd3feefd/Worker bf8433e7、694源清单冻结，相关聚焦89/89；Windows初次57/60的三个路径fixture缺陷，
改用平台file URI后Mac/Win各3/3，唯一测试overlay及新694清单另记，运行产物未变。Windows最终整组60/60、exit0，原57/60保留；完整检查和真实UI复验尚待结束。
原生索引打开0文件degraded（WUI-007）仍待取证；不以机制GREEN、校准或新局部成功抵消初始化失败。
初始化99%的原生全量写入、完整30K引用/重命名、SDK缺项仍分别跟踪，不承诺这份ADR将它们一并解决。
默认无RSS预算、V8/绝对截止/恢复预算及500ms体验口径不变，不自动合并/发布。


### C4完整资格更正

首次C4完整2133/2136失败，旧implicit-latest-wins两项与Freshness替身接口一项，不计完整通过。
严格独立completion结果、显式ID取消抵抗代码动作及原预算preflight迁移后31/31，原失败/源码保留。
695清单a7c278e6只有测试资格变更、产品不变；最终完整重新执行。详细理由和命令见报告/TDD。
C4真实UI仍因[ADR0033](0033-client-navigation-ownership-and-ui-input-context.md)记录的晚到导航竞争失败，
并有Program不重建的父队列11.7秒长尾及原生index0degraded；均不由本ADR局部GREEN关闭。


最终Windows同轮91/91、0fail/cancel/skip/todo，695清单a7c278e6、产品五hash不变；
实际Photos30000源码/30287输入、SDK1580输入、日常安装及10个打开overlay均最终MATCH。
这仍不关闭真实UI新WUI-009/010、SDKruntime globals缺口、原生索引0degraded及父端长尾；Mac完整资格另记。


最终完整`check-fast-burst-qualified-allowed.log`exit0、2136/2136、0fail/cancel/skip/todo，695源/五产物再核MATCH。
状态仍Proposed，未因实施授权伪造评审；真实UI仍FAILED，新SDK跟随目标诊断RED0/1留在报告与TODO，不能称交付完成。
正常关闭全部已知测试PID后生命周期封存7保留输入/日志/截图/复现脚本；shutdown未录响应的边界另列，不称完整握手通过。
