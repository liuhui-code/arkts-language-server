# Windows真实UI三项修复TDD

父提交`4859f76c46265a885332d7141c99698bf749c61e`，分支`fix/windows-ui-completion-navigation-recovery`。
用户顺序WUI-001→WUI-003→WUI-002。[计划](../plans/2026-10-29-windows-ui-fixes.md)，
[ADR0030](../adr/0030-completion-scope-and-navigation-liveness.md)。证据`.bench/windows-ui-fixes-20261029/`。

## WUI-001

均通过生产server子进程/Content-Length stdio，不替换私有server内部。

1. `node --test tests/semantic/partial-completion-admission.test.mjs`，父版本RED：
   20,003文件、32字符编辑后completion3与真实UI相同-32803，见`wui001-red.log`。
   当前成员集合partial却使用includeWorkspaceFiles，重扫后assertCompleteProjectMembership拒绝。
2. 有界范围选择后首项GREEN，`wui001-green-1.log`；添加局部变量列表及详情，详情5同文案RED，
   `wui001-details-red.log`。列表/详情统一准入后GREEN，`wui001-green-2.log`，4/4包含既有auto-import与namespace拒绝。
3. 添加20K外ZNeedle索引候选默认自动导入：列表显式isIncomplete但空，`wui001-import-red.log`。
   partial通过现有ready候选分批、compiler实际验证，详情使用签发的候选根后GREEN，`wui001-green-3.log`。
4. 增加真实目录打开/编译parse观测，补全/详情不再次枚举noise，无关文件不进入Program，
   candidate确实由compiler解析；完整references仍-32803。12/12，`wui001-proof-green.log`。
   同组覆盖partial初始化、未通知SDK/package变化仍拒绝旧结果/句柄，不放松最终输入证明。
5. `pnpm check`通过，`typecheck-stage1.log`。这是阶段收据，非最终完整fast或Windows UI通过。

范围规划提取到completion-batch-planning；旧legacy-semantic-engine由756降到745行，仍为>500行迁移债。
保持默认workspace配置、20K上限及全局完整性合同；partial列表显式isIncomplete，不将局部列表宣称全量完整。

## WUI-003

`node --test tests/semantic/navigation-foreground-scheduling.test.mjs`在一份有限合作诊断后，
排入3份highlight/8份codeAction再发定义。调度修复前RED定义dispatch index11，`wui003-red.log`；
此时父4859f76上已保留前一补全切片，不宣称三个RED均为完全干净父树。
穷尽策略表新增foreground层后，定义index0、原队首highlight随后执行，12份原请求正确结清、同epoch。
连同既有completion优先/公平/屏障/交互回归14/14，`wui003-green.log`。
不以短墙钟时间替代真正dispatch顺序，不抢占在途编译。

## WUI-002与最终验收

`node --test tests/semantic/overlay-save-synchronization.test.mjs`：真实Program调用插入有限1800ms无检查点工作，
保存同一open overlay触发watcher，原产品换代2份Worker而非1份，`wui002-red.log`。
原因许可与终态发布撤销分离后，有限同步正常返回、原Worker保留；不是把恢复正确当原Worker健康。

5项新公开回归：有限同步；永不返回仍在原绝对截止终止；随后真实编辑恢复原1000ms取消截止且save不能软化；
磁盘与open overlay不同，overlay仍权威、关闭重开转磁盘；同步完成后丢终态仍在1000ms交付宽限退役并恢复正确定义。
`wui002-controls.log`26/26包括其中前4项及既有无响应/恢复预算/配置/文档重放，
`wui002-delivery-controls.log`5/5为5项新测试（与前组重叠，不能相加计31项）。
原1000ms数值、绝对截止、恢复预算、RSS默认null及455冷目录授权排除不变；
清算许可仅对合格overlay磁盘通知覆盖已有同步，不再声称它仍受旧1000ms无检查点静默退役策略。

## 平台与最终检查

Windows隔离副本Node20.19.5对三份新公开测试首轮6/7：观察到编译器返回`C:/...`、fixture为`C:\\...`，
单个parse观测字符串比较失败，前面的语义与auto-import编辑断言已通过。
仅将该断言改为`realpathSync.native`的物理身份比较，运行产物未改；重跑7/7。
原失败及测试单独delta分别在`focused-windows.decoded.txt`、`focused-windows-retry.decoded.txt`，
`focused-windows-retry-result.json`exit0。未用全路径转小写替代身份核验。

新测试登记bundle-e2e；manifest断言RED补登记后GREEN4/4，总文件267→270，bundle136→139。
首轮restricted完整fast因进程观测权限受限主动中断exit130，`check-fast-final-1.log`及`restricted-check-interruption.json`；
相同prepared-resource CLI在获权限后3/3，`resource-permission-control.log`。不将受限失败计通过，
获权限的最终完整轮`check-fast-final-2.log`已2103/2103/exit0，见末节。`pnpm check`阶段两次通过。

Windows30K真实UI独立于协议：原Picker注释v33/90:32完成1430ms、空合法列表且isIncomplete；
真实Log.列表/详情及接受已执行，20份resolve0错误；客户端主动取消单列。
十宏混合首个启动因前台焦点保护停止，0宏完成，原记录归档；当时前台PID20104在读取身份前已退出，
不能确定来源，不宣称由用户或启动器造成。重试采用非交互文件队列生产器，继续保留桌面焦点保护。
实际覆盖与最终全量收据见后续报告，不追认原UI正式轮FAILED为通过；不自动合并发布。

## Windows UI收尾收据

16:26:55.063Z–17:00:33.629Z单会话输入范围2018566ms/533批次；十宏344586ms、
原Album四轮149898ms、完整目录移动撤销三次定义51821ms，三组控制器目标/文档断言完成。
首组手工移动后因焦点在项目树没有产生目标请求，截图证明后明确不计通过，再完整重做；未改产品。
定义1027/1118/1145正确，749.848/1321.085/429.805ms；Album881/923/965/1007正确，
387.736/354.809/506.716/368.624ms。单一Worker，无运行期退役/恢复，关闭后所属五进程均退出。
完整项目/SDK/运行产物/父源+overlay+test-only delta及日常安装分别MATCH，活动缓冲区全部恢复。

1207功能请求1093成功、109份实际客户端取消、5份非取消失败；不存在重复终态。
5份为SDK缺失模块定义2（3.6/3.5s）和完整范围引用/实现/入站调用3；**不称全功能通过**。
144补全中126正常、18真实取消、0份-32803；96详情正常返回，10份签名enriched、86份通用条目未enrich，
不把回退当全部语义详情成功。shutdown1209在关闭时无观察到答复，code0/无残留与握手正确性分别记录。
最终wire包含serverExit元数据使旧observe后处理TypeError，原始归档未丢失；离线分析显式保留该元数据及pending。
[修复报告](../reports/2026-10-30-windows-ui-fixes.md)给出冷热索引阶段分布、排队、资源和限制。

Mac完整检查环境macOS26.6.2(25G83)、Node26.3.0、pnpm8.3.1；Windows7项为Node20.19.5，
不能将Mac完整fast称为Windows全量。

## 最终完整fast

`pnpm check:fast`最终**2103/2103、exit0，fail/cancelled/skipped/todo均0**，Node测试阶段3735520.048ms。
`check-fast-final-2.log`/`final-check-receipt.json`，262个fast入口含三份新文件；本轮实际新增7项，不借历史2096当新版本结果。
完整轮已打印最新`candidatePath`物理身份断言观测，最终15份源/测试SHA与`final-source-identity.json`相同，
产品源与Windows运行产物的overlay构建一致。后续只补报告，没有再改产品或测试。
原restricted exit130、原Windows观测断言6/7、原UI焦点停止和原正式FAILED均原样保留。
455冷目录3秒性能项按用户授权排除，不能将其宣称为未经豁免全量性能门槛通过。
