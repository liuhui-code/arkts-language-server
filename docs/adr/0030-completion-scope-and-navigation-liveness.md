# ADR0030：补全范围准入、导航调度与有限同步活性

2026-10-30 后续修订：[ADR0031](0031-cancelled-read-compiler-synchronization.md)在公开 RED 后
将普通读取取消与在途同步物理生命周期分开；下方普通编辑/客户端取消的短静默退休规则保留为原决定历史。

- 日期：2026-10-29。
- 状态：**Proposed；用户授权实现，按切片验证，不追认独立设计审阅或Accepted。**
- 问题与顺序：[WUI-001/#102](https://github.com/liuhui-code/arkts-language-server/issues/102) →
  [WUI-003/#103](https://github.com/liuhui-code/arkts-language-server/issues/103) →
  [WUI-002/#104](https://github.com/liuhui-code/arkts-language-server/issues/104)。
- 现场：[Windows真实UI验收](../reports/2026-10-29-windows-zed-30k-ui-stress.md)。

## 已证明的补全缺口

默认auto-import范围是workspace。非成员补全（包括注释位置）未命中discovery批次时，
`LegacySemanticEngine.complete`把includeWorkspaceFiles设为true；partial成员集合会再重扫一次，
然后`assertCompleteProjectMembership`抛通用输入不可用，尚未进入compiler补全。
因此真实30K编辑后错误不能归为缓存失效。20,003源码公开LSP按相同输入RED，
普通局部变量列表修复后，其详情又在相同全范围准入分支RED；必须一起解决。

## 决定：范围与有效性分离

1. 先按当前DocumentStore已有成员状态确定补全范围，不为partial重复全项目扫描。
   全范围仍可证明时保留原workspace行为及stale-index的compiler完整回退。
2. partial不否认当前overlay和已准入依赖闭包。局部列表及详情共享同一有界范围，
   不跳过源码/物理身份、SDK、配置、resolver namespace和响应前最终联合校验。
3. partial中可使用现有ready索引候选的有界批次，但必须由compiler验证候选与实际导入编辑；
   索引不成为语义权威。详情使用服务端签发item中已验证的discovery根，不再依赖运行时profile推测。
4. 无法证明全工作区补全覆盖时保留`isIncomplete=true`，不把局部列表宣称全量完整。
   LSP补全允许显式未完列表；此范围合同不授予references/rename/implementation/calls不完整成功。
   真正输入失败继续显式拒绝，不能捕获一切返回空列表。默认配置与20K上限不变。

拒绝仅拦注释的词法特判、提高文件上限、默认换配置、清空缓存或吞错：它们无法覆盖普通局部变量、
SDK全局、详情及索引冷态等同类范围错误。范围选择集中在completion-batch-planning，避免列表/详情再次分叉。

## 导航：有限优先，不改变读写顺序

公开LSP在相同输入先排3份highlight与8份codeAction，再定义，旧实现dispatch第12位RED。
ADR0027的穷尽策略表增加foreground层：定义/类型定义、hover/signature、格式化、codeAction resolve、
局部call hierarchy高于自动高亮、codeAction列表、符号、折叠及inlay等读取；列表/详情补全仍最高。
队首最多被越过一次，随后必须运行；mutation优先、global屏障、正在执行的编译不被抢占，
不新建Worker。新回归先派发定义、下一条仍原队首；14项公平/屏障/交互回归GREEN。
LSP没有可靠的鼠标/F12与预取来源标记，此为方法类别策略，不能辨别所有自动definition；
同优先类积压及长在途编译仍可能造成长尾，不能承诺所有操作500ms。

## 保存、取消与同步清算

WUI-002的实际phase=program/静默1026ms，与ADR0026旧的离开phase后计时倒退不同。
公开回归在真实Program调用内注入有限1800ms无检查点工作，保存同一open overlay时，
原产品退役并重建Worker，证明“恢复后结果正确”不足以判定没有不必要换代。

借鉴tsserver的open-buffer authority：安装ohos-typescript4.9.5-r10的tsserver.js，
`ProjectService.onSourceFileChanged`对Changed仅在`!info.isScriptOpen()`时重载。
本服务有更强的磁盘/物理身份证明，因此**不照搬丢弃磁盘通知**，选择分离发布撤销与已有同步清算：

1. 只有rootDirty/resource标记均false、非空changes全部为已打开同root源码的changed事件，
   才允许匹配epoch/id的现有synchronize/program/checker完成。不要求假定磁盘字节等于overlay，
   不忽略通知；原mutation仍排队应用，旧结果立刻因contentModified失去发布资格。
2. 未打开依赖、创建/删除/目录、配置、SDK、真实overlay编辑和客户端取消沿原中断规则。
   新的硬取消可撤销已授予许可；之后的保存不能重新软化它。同请求至多采用一次清算许可。
3. 许可仅覆盖匹配命令的已有同步，不覆盖request/idle/terminal等待。同步完成或首次观察离开同步后，
   转settling，从此交接边界执行原1000ms终态交付宽限；收到合法终态才释放所有权。
   重复保存不能重置该settling参考点，不凭sent/idle视为已收到终态。
4. **原started起算的绝对执行/准备截止持续有效**。没有进展的允许清算仍被原绝对截止终止；
   真正客户端取消/新编辑仍用原取消截止。未提高任何数值阈值、恢复预算或V8/内存策略。
5. 取消cell仍为contentModified，所以旧响应不能成为健康成功来补充恢复预算。
   单终态、最新文档/配置重放、旧世代隔离和异常Registry清算沿现有所有者处理。

| 状态 | 允许的推进 | 禁止 |
| --- | --- | --- |
| 正常执行→finish-sync | 合格open-overlay磁盘通知、匹配现有同步；绝对计时不变 | 推广到rootDirty/未知依赖或别的请求活动 |
| finish-sync→settling | 真实synchronized事件或首次观察离开该同步；一次交接参考点 | 循环idle续期、用postMessage代替receipt |
| finish-sync/settling→interrupt | 真实编辑、强失效、客户端取消 | 后续save重新授予清算许可 |
| 任意状态→终态/退役 | 合法单终态；取消/绝对截止及物理退出、共享预算 | 无限等待、重建风暴或旧结果发布 |

此为明确的取消原因/阶段规则修订，不是声称旧1000ms静默策略能同时保证任意有限CPU工作不退役。
拒绝全局延长宽限、取消绝对截止、伪造heartbeat和仅按phase一律豁免；共享监督端仍负责活性。
5项新公开回归分别覆盖有限清算、永不返回、再次真实编辑、外部磁盘与overlay相异、清算后丢终态；
26项恢复/清算/重放组（含前4项新测试）及5项新测试组阶段GREEN，不将重叠计为31项。
自然30K现场的具体CPU热点与精确时间窗尚未证明相同，不强行合并三项根因。

## 来源与适用边界

Context7查询`/microsoft/typescript`给出官方[补全实现说明](https://github.com/microsoft/typescript/wiki/codebase/services/Codebase-Services-Completions)：
`getCompletionsAtPosition`返回与位置相关的CompletionInfo，模块导入候选不同于全局工作区完整性证明。
检索另含TS7 snapshot API，不适用于本仓库固定ohos-typescript4.9.5-r10，未照搬。
实际行为以安装编译器源码及真实子进程LSP回归为准；与ADR0005/0019/0021/0022/0025保持输入与namespace约束。

## 验收与回滚边界

每切片先独立RED/GREEN，保留父4859f76及原失败；补全覆盖partial注释/局部变量/详情、
20K之外索引候选的compiler验证与导入编辑、无关文件不解析/不重复目录扫描、真实旧SDK/namespace仍拒绝。
后续调度覆盖公平/屏障/取消，取消覆盖真实有限进展/无进展/绝对截止与恢复文档，不能用sleep特判。
最终完整fast与Windows30K实际UI单列，普通/插桩、受控/自然窗口区别记录；500ms是体验目标。
不改RSS/V8/超时/规模阈值，不自动合并发布。补全、导航、取消可独立回滚，不能串改已有ADR历史状态。

## 2026-10-30候选验证收据

最终Mac完整fast2103/2103、exit0、0 skipped/cancelled/todo；Windows Node20新增公开回归7/7。
真实30K Zed输入范围33分38.566秒/533批次，十宏＋原Album四轮＋完整目录移动恢复/三次F12目标断言完成，
1Worker/0运行期退役恢复，正常关闭后所属进程均退出；不是两小时耐久或全功能通过。
144补全0份-32803；96详情0错误但仅10份实际签名、86份通用回退，SDK缺项定义2次失败、全量范围3次失败，
秒级自动读取与索引99%写入慢、未观察到shutdown答复等限制详见[最终报告](../reports/2026-10-30-windows-ui-fixes.md)。
测试及运行产物身份、原失败和豁免均保留。本文状态仍Proposed，不以实现/检查通过伪造Accepted或独立审阅记录。
