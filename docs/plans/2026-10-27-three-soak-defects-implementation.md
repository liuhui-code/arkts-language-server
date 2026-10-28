# SOAK-30K-M001/M002/M003 实施与耐久验证

2026-10-27，父提交 `17e923f0cb8c430b6a10793a0f3d2f9097febfec` 上的既有候选；本轮维护者明确授权正式修复与验证，不发布/合并。
原工作树完整差异/757项目录内输入及4项产物指纹：`.bench/30k-three-fixes-20261027/baseline*`。
原2h失败记录及诊断证据不修改；用户Zed及真实项目只读。保留SDK、30K规模与种子817954798。
用户后续明确授权临时豁免本轮测试驱动Node RSS>2048MiB提前停测；仅此项变化，详见下方。

2026-10-28再补充：500ms为体验目标，偶发超过不独立判功能失败或阻塞交付；
按典型体验、分布、频率及持续性评估，持续严重慢响应/超时/不可用仍记录，不设替代硬线。
见[当前时延评估](../benchmarks/interactive-latency-assessment.md)；原逐次证据/历史判定不重写，不修改产品或测试阈值。

## 契约与切片

- [x] M001：公开LSP移动/恢复依赖、清理目录的RED；明确resolver/缓存/证明域及命名空间代次。
  普通body编辑保留合法状态；namespace/config变化同时废弃解析答案和证明，重建消费者域。
  未通知变化仍拒绝旧证明，后继请求允许有界重载；不得仅给缓存盖新戳。
- [x] M002：公开LSP有限真实编译图、早取消和终态延迟交付的RED。
  父端负责sent/started/cancel-observed/terminal-received/retiring/settled边界；
  合格活动参考点单调，绝对截止不变；真实无响应仍有界物理终止和共享恢复预算。
- [x] M003：公开LSP详情积压RED，再覆盖其他交互方法。
  用穷尽的方法策略表统一分类与派发，不另设遗漏的绕过白名单。
  所有交互有限优先；补全列表/详情同等级；队首一次绕过后必须运行；mutation与global屏障保留。
- [x] 各切片独立RED→GREEN→相关回归；新增测试纳入fast清单；改大文件时提取内聚责任并不增长行数。
- [x] 更新ADR0025/0026/0027的依据、取舍、边界与实施状态。保持Proposed，记实现授权，不虚构独立评审/Accepted。
- [x] 最终候选完整 `pnpm check:fast`：candidate11完整2085/2085、exit0，0fail/cancel/skip/todo，检查后身份一致。相关SDK层另列，Rust未改。
- [x] 校准后至少7200s单会话混合负载：candidate11实际7204.609272s、1197动作，纳入原移动/删目录，不使用continuation排除模式、不主动重启。
  保留逐动作/请求/取消/版本/正确性、尾延迟、RSS/heap、Worker世代、退出原因及资源保护证据。
- [x] 原项目/隔离副本及SDK逐文件零差异；关闭exit0、owned进程无残留，协议终态/进度审计通过；最终报告与稳定待办更新。

## 研究与适配

Context7三次resolve均为transport failure，记录真实失败，不声称已获取文档；以官方文档/源码回退。
调研范围：TS解析缓存的依赖/负查找失效与实际安装4.9编译器的同步边界；clangd单可变AST owner的更新/读取顺序、取消和debounce；
rust-analyzer revision/snapshot取消的安全前提；LSP取消终态和版本顺序；Node消息/exit/terminate边界。
来源及具体适配写入实施报告，借鉴契约而不引入Salsa、clangd过期答案或第二套编译器权威。

## 耐久合同

沿用此前真实模块拓扑的隔离Photos、SDK/API身份、正常用户节奏、并发上限。
用户授权记录`.bench/30k-three-fixes-20261027/node-rss-test-waiver.json`（09:37:18.954426Z）；
新运行设置`SOAK_NODE_GUARD_MIB=2048 SOAK_IGNORE_NODE_RSS_GUARD=1`，原数值保留、仅标记不执行Node RSS提前停测。
native5120MiB、tree6144MiB、系统free15%、磁盘1024MiB及45s无响应保护不变；实际OOM/错误/崩溃仍失败。
旧条件两轮校准完整保留，新条件独立tag；不为压入2GiB扩大无关内存优化。
固定7200s从mixed开始，不用初始化/检查时间凑时长；故障/保护提前停止即FAIL，不隐藏失败后再报通过。
已知完整30K references/rename的-32803仍记用户可见功能缺口，不计成功，且不阻止观察局部功能。
原生索引高内存、SDK不完整/degraded和UI权限缺口单列。协议混合会话不冒充真实Zed点击。
若出现新的相关缺陷，封存、最小复现、修复、重新跑最终候选；不无限故障循环或放任OOM。

## 当前状态

最终candidate11三项及M004/M005产品修复与公开回归GREEN，完整fast2085/2085，7204.609s单会话协议验收及事后审计通过。
37次完整范围不可用、反复尾延迟、SDK层2项180s控制取消及原自然M002精确窗口仍保留；不是产品整体全部通过。
详见[最终验证报告](../reports/2026-10-28-three-soak-defects-final-verification.md)。
以下保留候选演进与失败历史，不以中间候选结果代替当前验收。
中间M001 target消费者反例已修复并保留RED；完整fast两次中断不计PASS。
旧条件candidate3校准触及Node2069.5MiB提前停止；对照旧产物90.125s完成50动作107请求。
candidate3新条件校准91.503s完成；随后完整fast发现3项root-dirty跨root缓存保留回归并停止，原始失败保留。
candidate4区分已知namespace退休与未知全域失效，保留范围外原始证明；52项DStore和32项联合公开回归GREEN。
中间candidate4亦完成独立校准；后续候选分别保留，不覆盖历史证据。
后续candidate4全量2063/2069失败6项不变输入合同；candidate5补命令admission与旧item/父端预计算收据，54项联合GREEN。
candidate5全量2074/2075失败1项canonical owner既有新输入表征；candidate6复用原owner分类，75+9项对照GREEN。
真实30K原移动/恢复/删除目录短复现34.438s通过、1Worker；恢复定义193.9/58.1/47.3ms，关闭重开1097.7ms。
最终`check-fast-candidate6-final.log`退出0，2075/2075，无skip/cancel/todo。真实SDK层11功能通过、2项附带Settings驻留控制180s超时，尚需定位，不能计整个测试层通过。
`functional-2h-candidate6-node-waived`于16:11Z启动，原M001动作6已完成，后在动作212失败；不把此前失败/短复现算耐久通过。

首轮最终6耐久FAIL：mixed1484.441s、第212动作/1027请求，保存另一文件后打开AlbumDataImpl.ts跳转-32803；1Worker/0恢复，非资源保护。
封存`functional-2h-candidate6-node-waived/anomalies/A001`，正在独立诊断/最小化，7200s保持未验收。

候选7追加partial nested overlay磁盘删除反例，完整fast主动停测exit143，原反例/日志保留。
候选8显式推进已分类source created/deleted的解析命名空间，普通changed不推进；775输入/87产物冻结，Worker e5857d35…5ceb4f。
`candidate8-source-and-namespace-regressions.log`79/79通过（含原跨root缓存保留及SDK/配置/读中竞态负对照）；后续完整2081/2070pass/11fail，原日志保留。
candidate9修正原fixture唯一Host读点定位及reset原因顺序，原11项全部GREEN，另128项相关控制GREEN；
775输入/87冻结产物、Worker b57d54dc…94ca2aba，正在执行`check-fast-candidate9-final.log`，7200s仍未验收。

候选9又发现首次/已重建后查询混淆的旧测试断言，原始新进程结果相等；日志证明context1退役、context2真构建后才命中。
全量停止143且无自身进程残留。候选10仅把两种首次查询分为独立会话并收齐基线诊断，原no-hit/fresh结果断言保留。
完整引用文件24/24通过，775输入/87产物冻结，产品哈希同9，随后执行`check-fast-candidate10-final.log`。

候选10完整fast已退出0，2081/2081，3132.348s；检查后775输入/87产物及dist均与冻结身份一致。
正在核对原/隔离项目及SDK后执行最终真实SDK层；7200s仍未计开始。

candidate10真实SDK11pass/2既有Settings性能控制180s取消；95.639s校准完成。
正式长测原212同输入通过67.448ms，随后255关闭依赖后-32803，mixed1477.767s FAIL；不能算2h。
独立插桩同255/1236在942.734ms复现，ScreenManager.ts旧磁盘17243→17200事实未随overlay→disk交接。
最小4格complete/partial×resident0/1中partial/default1 RED；候选11协调每个当前安装source snapshot，非overlay须实际读等于准入内容。
四格GREEN及82项原输入/SDK/竞态控制GREEN；775输入/87产物，Worker77d31829…36377f0，完整fast2085项重新运行。

candidate11完整fast最终2085/2085、exit0，3122.832s；检查后775输入/87产物及dist零差异。
正在独立重跑真实SDK层；后续新校准和7200s不累计此前失败轮。

candidate11最终SDK11pass/2既有180s取消、exit1，未豁免；逐文件身份含SDK44894及原/隔离各30287零差异。
94.559s校准50/107完成，Node2312.2MiB超过旧2048而按授权继续；其他保护不变。
真实30K有效primer后的M005旧RED952.456ms、新精确GREEN短对照保留，错误.default前置三次不算产品证据。
全新`functional-2h-candidate11-node-waived`正式运行中，7200s尚未完成，全部原场景保留。

2026-10-28最终：上轮实际完成，mixed7204.609272s；1197/1197动作、5681操作RPC（5394成功、170取消、80输入更新、37不可用）。
1Worker/0恢复，37次实际删探测目录、原212/255和57次当前版本诊断验证通过；关闭/逐文件/协议审计无异常。
Node2048MiB仅驱动豁免继续有效，原条件与失败保留，校准2312.2MiB实际超旧线继续；没有改产品/V8/截止或其他保护。
上方各中间候选“正在/待完成”均为保留的当时记录，不是最终状态；SDK2控制超时保留，时延按当前体验目标评估，不以偶发超500ms阻塞交付。
