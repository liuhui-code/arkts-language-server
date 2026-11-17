# 30K重复跳转：取消检查耦合路径访问与影响范围重复计算

状态：实施与验证中。没有合并、发布、部署。实现位于
`.bench/worktrees/index-versioned-maintenance-20261104`，父298d65f5d7f796c347fe8be5c739e428066489d8。
原项目与用户窗口未动；协议验证不是UI验收。500ms仍是允许波动的体验目标。

## 问题 NAV-REPEAT-001

用户指出重复定义跳转8.46秒仍不可用；正确性门禁通过不能证明性能达标。
固定实际30K隔离项目、SDK24/项目20、Node20.19.5/defaultclosure、同一picker53:20
到ScreenManager81:9–20。证据根目录仍为
`.bench/index-versioned-maintenance-20261104/functional-closure-20261111/initialization-breakdown-20261112/`。

旧普通56重复8461.163ms；独立CPU57重复10890.570ms，不能把插桩时间冒充普通计时。
CPU57请求id3的10822.129ms采样，按调用栈互斥分区：

| 分区 | 采样ms |
| --- | ---: |
| 用根目录overlay查询充当取消检查 | 3946.261 |
| 物理配置身份，不含上述取消回调 | 1498.260 |
| 入口影响计算，不含上述两项 | 1359.443 |
| 其他执行 | 2529.155 |
| GC，未归因 | 437.976 |
| Inspector启停 | 1051.034 |

`getDefinitionAtPosition`包含栈采样仅1.136ms，不能把整个8.46秒称为编译器查定义。
这是独立插桩样本；不能把各项直接搬到普通8461ms，也不能叠加重叠的包含栈。
原始cpuprofile、repeat-definition-cpu57-summary/partition.json均保留。
57收尾SQLite原60秒超时，整轮FAIL保留；不否定已采集的查询/栈，但不算整体验收通过。

## 第一项修复：直接取消检查

实际调用链：公开definition→Worker answerRequest/invoke→runNavigationQuery→
prepareInteractive→ProjectOperationScopes.ensure/project→ScopeDependencyGraph/currentNodes→
LoadedConfigurationWitness.freshness→checkpoint→DocumentStore.overlayFor(root)→path.resolve+Map.get。
后两步不用于任何结果，只为间接触发operationControl.checkpoint，导致百万级重复路径工作。

给ProjectFileAccessPort提供可选checkpoint；生产Store直接委派原operationControl，
保留调用次数。旧适配器继续原fallback，未删除取消、延后终态或增加超时。
Store将原有token读取委派同域project-membership-access，保持修订/路径规则及原检查点；
超长Store从1524缩至1520行，没有借机增长。既有LS2974行仍为迁移债。

公开RED：400源重复导航17630次无用根目录查询；GREEN根查询0、直接检查仍17630。
原4文件24/24PASS。真实$/cancelRequest先观察共享cell状态1，再放行暂停的Worker，
公开-32800且同Worker可恢复；旧adad对照和当前均通过，未用注入异常代替真实取消。
扩大37项36PASS/1FAIL：原20K引用5秒超时，保持失败及原门槛，冻结adad与6d候选独立串行对照均2PASS/1FAIL，不能因基线也失败忽略。

同条件串行普通58旧adad与59新dffb3210（各一会话、首次+3重复，非3轮冷启动）：

| 条件 | 首次ms | 三次重复ms | 重复中位ms | 最大ms |
| --- | ---: | --- | ---: | ---: |
| adad旧 | 12839.963 | 8856.516 / 9368.883 / 8895.819 | 8895.819 | 9368.883 |
| dff直接取消 | 9166.789 | 5171.892 / 5804.388 / 5083.575 | 5171.892 | 5804.388 |

中位减少41.86%，但5.17秒仍未达到良好体验。四次结果均精确、单Worker正常关闭；
两轮收尾SQLite均原60秒超时，整体仍FAIL。原始失败不能抹去或算全绿。
`direct-checkpoint-matched-series-controller.json`、`direct-checkpoint-matched-summary.json`保留所有逐次数据。

## 第二项修复：派生影响范围复用

同图和组入口未变时，roots仍重新计算SDK全局独立性、反向传播和全组入口筛选。
新增回归：正文编辑/撤销原图构建2/2/2不变，但影响计算2/1/1；要求2/0/0。
本轮实现owner局部WeakMap：以入口数组+完整顺序拷贝、图修订和仍有效的SDK输入胶囊
决定能否复用纯派生集合。可变数组逐项核对；相对路径不缓存；dirty图不命中/不发布。
复用保存/恢复相应globals/natives及independent状态，避免交叉语义组污染。

ensure、全部binding/source/membership当前检查、最终独立union均保留；
SDK基线失效仍走原算法/拒绝，新增global、import/SDK变化必须令旧选择失效。
配置替换销毁旧owner，弱键随语义组回收；不保存Program/AST或跨请求valid布尔值。
最新该切片扩大56/56PASS、零跳过，包括SDK变化发生在真实Program构建内的拒绝、
合并SDK全局4→100→4、循环依赖、成员范围恢复、真实取消和两道输入栅栏。
普通60（6d3235bb，首次+3次重复，同58/59条件）：首次9583.126ms；
重复4088.229 /4373.490 /4222.851ms，中位4222.851、最大4373.490；
相对58中位降低52.53%。四次定义位置正确，Native完整资格及SQLite完整性通过，
单Worker正常关闭。仍是4.22秒，不能宣布体验目标达到。
原始`influence-selection-ordinary-series.json`及`photos-repeat-series-influence-60/result.json`。
新候选完整门禁尚未完成，不能用前一候选2550全绿代替。

## 第三项：延迟格式化未消费的Native身份

原Native文件资格检查为每个源码立即拼接物理文件路径和JSON身份，
其中大量记录在本请求内没有消费者，仍付出字符串/对象分配成本。
现仅保留原验证者已有的物理父目录与五字段磁盘token，在同一请求、
同owner/epoch/revision已成功验证后，消费者第一次需要身份时才恢复原格式。
父目录身份在原目录证明捕获时取得，不从后来的磁盘观测补填旧证据。

所有源码的原始lstat、目录边界、内容/命名空间资格与最终独立检查均保留；
原32MiB请求元数据预算、驱逐后原始读取fallback、失败/取消无权借用均不变。
Native和配置两个owner的独立首/末叶子检查未合并。新回归先在旧实现观测到
1次不必要directoryProof访问而失败，修复后0，按需构造的身份与原磁盘身份精确相同。
单位24/24、扩展公开协议与单位合计60/60PASS（零跳过/取消）。
语义Worker c4280daa（引用验证Worker35975f9d），普通30K61首次8776.906ms，重复3893.129/3892.700/4238.603ms，
中位3893.129、最大4238.603；四次结果精确、Native/SQLitePASS、单Worker关闭。
132/157秒短协议会话不能算UI或耐久。

一个曾尝试跨Native/配置模式借用叶子观测的实验未通过原有“首末独立至少6次叶子观测”
回归，已撤销，原断言未放松。补丁与失败日志保留在
`native-leaf-reuse-rejected-experiment.patch`和`configuration-native-leaf-reuse-unit-green.log`
（文件名含green但实际24PASS/1FAIL，以内容为准）。当前候选不包含该实验。

## 验证限制与操作审计

原20K完整引用的5秒公开请求在adad与6d均超时；独立诊断放宽的仅是复制驱动等待，
不能当原用例通过。Worker前后semanticReadiness各约2秒，引用Worker约1.49秒，
合计超过客户端原5秒；单独Worker13 CPU诊断显示Native首末和Program末叶子lstat
合计约590ms，不能直接拿包含Inspector的样本替代普通计时。
证据`reference-deadline-baseline/`、`reference-deadline-candidate/`、
`large-root-readiness-profile/`；此项仍OPEN。

一次回滚实验时误在主工作目录执行构建，刷新其dist生成物；产品源码未改、
无进程使用该dist、未部署/重启用户服务。已记录`accidental-root-build-audit.json`；
本轮所有冻结候选及实际30K运行均使用隔离工作树的显式绝对产物路径。

## 对照边界与剩余项

历史354ms记录06虽是同一真实30K路径，但显式current单文件入口profile，
没有现有依赖作用域构建；不能与当前defaultclosure直接作同条件百分比。
历史1.68秒等还使用/private/tmp的另一夹具路径。对应元数据在existing-timing-audit.json。
这不豁免当前8.46秒的性能问题；本轮用严格同条件58/59重测证明实际收益。

用户确认没有匹配API20SDK。SDKpartial与完整引用/重命名资格仍OPEN，
不将SDK不匹配当作局部重复跳转慢的笼统原因。
原60秒SQLite检查波动、最早初始化47、真实UI/Windows/正式耐久仍未闭环。
455冷目录3秒门槛沿用授权；不调产品阈值、V8或RSS策略。


## 后续剩余成本与第四项纯格式优化

独立CPU62（语义Worker c4280daa，1次热请求）采样4947.202ms，互斥分区：
Inspector983.940、配置物理身份1336.543、Native成员验证881.984、
准入token查找101.178、GC184.130、其他1459.427ms。
这是独立插桩样本，不替代普通61时间；调用链显示Native成员验证有多处调用来源，
但采样不能证明完整扫描次数，64正在补原始计数与阶段证据。
`repeat-definition-cpu62-partition.json`和原cpuprofile保留。

第四项只将配置首末两次Stats的六个数字元组改为逐字段比较，避免比较前分别JSON分配，
原JSON数字等价（含非有限值）保留；两次真实lstat及checkpoint未减少，
published identity/loadGuard按原格式只构造一次。
RED原每次2个独立元组JSON分配→GREEN0；断言实际叶子读取仍2，身份完全相同；
dev/ino/mode/size/mtime/ctime六个中途变更分别拒绝。31/31单位、67/67扩大PASS，
零跳过/取消，类型检查及构建成功；没有将先前2550全量结果用于新候选。
当前语义Worker b19fdc9f、Server675d151f、引用验证Worker42278839、Native800e6628。

同条件普通63：首次8672.612ms；重复3795.499/3767.605/4122.422ms，
中位3795.499、最大4122.422；比58中位下降57.33%，仍严重慢，问题OPEN。
四次精确结果、Native完整资格、全部SQLite完整性/外键PASS、1Worker正常关闭。
正式起止18:58:21Z–19:00:33Z，单会话132.189秒（北京时间11月17日）。
`primitive-stamp-ordinary-series.json`、`photos-repeat-series-primitive-63/result.json`
保留逐次请求/输入/资源/退出证据。只是一次会话的3次重复，不是3轮独立冷启动。


## 64计数确认：复用Program仍重复全范围核验

对冻结b19f候选独立诊断，首次和热请求均为同一Native proof owner=1、revision=2：

1. 准备期，`preparation=true/finalizing=false`：`ProjectOperationScopes.ensure → sameMembership → refreshProjectMembership → completeProof.current`。
2. 终检，`preparation=false/finalizing=true`：最终联合直接调用该owner的原始validate闭包。
3. 终检，`preparation=false/finalizing=true`：作用域证明的current再次调用sameMembership，重新进入同Native owner；终检不借用首检缓存，故再扫。

每请求Native叶子lstat共89985=29995×3，首次8674.611ms、热3779.706ms为插桩Worker计时，
不能替代63普通LSP计时。热`configurationSourceIdentity`调用56964次，
这不是56964个不同路径或总stat次数，尚未统计其路径去重与fallback总体IO。
Native资格/SQLite/精确结果PASS、单Worker正常退出。
`membership-phase-count-summary.json`含每轮阶段、计数、原始堆栈；
`photos-membership-phase-count-64/worker-causes.ndjson`、控制器/可复现脚本均保留。

因此“Program没重建”并不意味着热查询与总文件数无关。前两种纯计算优化已实测收益，
最终证明仍按实际read set和成员范围增长（ADR0044第6项从未承诺常量终检）。
额外嵌套终检需要结合依赖/终检顺序及中途变更反例审查；
不能仅记住Native刚检查过就跳过后续嵌套检查，那会漏掉两者之间的磁盘变化。
此结构性成本仍OPEN，没有将本轮减少57%的局部收益称为彻底解决。


## 当前原20K5秒回归复验

冻结b19f通过原文件`tests/semantic/partial-completion-admission.test.mjs`，
3/3PASS、0skip/cancel/todo，未改原5秒请求/60秒测试限制；大项目引用
39145.350−34351.350≈4794.000ms，仍很接近原截止。
原始`reference-deadline-primitive/console.log`及逐fixture服务器/阶段日志保留。
这是一次恢复通过，不能代替旧adad/6d曾2PASS1FAIL的历史或证明长期稳定。
当前完整pnpm check:fast尚未运行，不使用旧adad2550作为当前通过证据。
