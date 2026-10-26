# ArkTS 查询性能后续执行计划

日期：2026-10-11；最新推进：2026-10-18。状态：IN_PROGRESS；OP-00继续补齐，
OP-01路由与OP-02选定复用切片已采纳／DONE；OP-03a及OP-00／04／05／06继续。
最新切片：[403冷引用原因专项定位](../tdd/op00-query-layer-attribution.md#2026-10-18-403冷引用超时专项定位)
已原样复现id2，分离7批冷Program／完整SDK与附加锚点，44份profile及实际线程CPU
确认准备工作为主导成本；SDK缺失负对照原四份oracle通过，不能作为SDK删减方案。
11次原场景3 PASS／8 FAIL全部保留，30完整payload精确；含声明完整失败实际
20.39s、其中线程CPU19.29s，原20s判FAIL未改。audit3ec32e14；只定位、未修复，
productionac4c136b／82产物／原测试未改，whole1864/1865 FAIL保持。

前一切片：默认transient统计候选已REJECTED／精确回退。公开访问4→0、四新
用例及受控11完整文件39/39通过；完整安装SDK固定8会话32完整引用／8 READY／
12诊断一致，但分项时延无一致净收益，正序磁盘两项慢约19–20%。保留两个受
1803s系统睡眠干扰的原FAIL，不把墙钟作CPU或有利重采；候选源／native完整封存。
恢复审计435453a9：全部1748仓库文件／82产物恢复本轮前字节，productionac4c136b、
217总／210-fast，原whole1864/1865 FAIL／403首次引用20s超时不变。没有新默认，
不借39项授予whole GREEN；下一项仍为冷Program／完整SDK／复杂closure。
详见[本候选结论](../tdd/op00-transient-statistics.md)，不是最终550ms／PSS阻塞前序。

前一检查点：productionac4c136b修复在途磁盘依赖已变而发布旧定义的真实反例，
两入口及显式READY拒绝／恢复共3公开回归、十四完整文件96/96、exit0。
发布前重读原Store有界源闭包，核对最终命名路径并保留最后SDK／配置guard；
不增加LS／AST／owner／开关。完整安装SDK固定8会话48完整语义／32当前READY／
12诊断／8正常退出一致；编辑中位约2.63／2.62s，一对RSS1.2566，资源假说FAIL。
必要正确性修复局部保留，不授予资源收益。原完整check:fast已1861/1865、
4FAIL、exit1，身份及退出独立审计daf7fc3c通过；四项缺失真实磁盘夹具已原样
RED18/22→GREEN22/22，提取后六完整文件49/49。生产ac4c136b不变，旧测试文件
1213→1120仍迁移债。随后新完整check:fast已1864/1865、1FAIL、exit1、零注解，
210入口／1748源码／SDK／构建及真实退出审计0ab1d0e0。四项夹具在整轮均通过，
唯一为历史403文件首次引用id2的20s超时；原oracle／期限不变、不追加有利复测，
不称whole GREEN。原FAIL与资源假说保留，继续冷Program／完整SDK及复杂closure。
当前217总／210-fast，不借旧1862。联合审计6c0812bb，详见
[OP04输入修正](../tdd/op04-versioned-overlay-snapshot.md#在途磁盘依赖的发布前输入修正)。

前一检查点：production72358623修正READY准备绕过既有同步解析复用作用域。
两入口公开RED为默认各60次目录探测，GREEN各1次；十完整文件64/64、exit0。
完整安装SDK固定8会话，48完整定义／hover、32当前READY及正常诊断／退出相同；
真实编辑definition中位3.43/3.42s→2.98/2.97s。RSS四对含1.1595，≤1.10资源
假说未通过，不称净内存收益；作用域接线局部保留，资源验收留OP05／06。
六默认／预算／缓存上限不变，不跨请求保留LS／AST。当前原完整check:fast已
1862/1862、exit0、零注解，209入口／1744源码／SDK／产物／启动器及实际退出
独立审计8c5cc269通过；不借前一1858/1858，也不覆盖旧FAIL或产品门禁。
详见[最新OP04切片](../tdd/op04-versioned-overlay-snapshot.md#当前72358623完整回归终态)。

后续两入口存活owner诊断已完成原首次执行：40次计划中34完成、2次在第18次编辑
后真实自动L3／READY撤销失败、4未执行；原FAIL保留，无有利重采。每次观测原生
dispose均lease0，L3存活20秒后两入口旧Program随自然GC清空；disk L2未出现
major GC，WeakRef存活不判泄漏。disk的17个同LS后继Program复用全部SDK／stdlib
对象，不能把两个Program误判为两次SDK解析；实际内容变化的冷LS重建成本仍待。
联合audit-v2 d8acb52e，仅资源归因，不改变六默认／1024MiB或授予净内存／P95／PSS。
disk自动L3后同一定义RPC内再建owner；下一切片转SDK／stdlib冷准备和请求内
驱逐再建的两入口公开成本反例及复杂真实closure，见
[OP05当前记录](../tdd/op05-recovery-cost-calibration.md#两入口存活owner与真实自动回收)。

同日后置认证候选已REJECTED并回退：公开压力反例证明同一定义的context创建
2→1，候选12完整相关文件87/87；固定旧／新／新／旧8会话完整结果／READY／诊断
一致，编辑中位约2911→2670ms／2995→2686ms，但反序RSS比1.2450／1.2822，
违反预声明每对≤1.10比较假说，不能只选正序采纳。源码／native完整封存，恢复
72358623及本轮前全部原字节，原whole1862仍有效；无新默认、whole或远端写入。
审计0a597d18／恢复4e744a73；继续独立delta／未知在途、复杂真实closure及其它冷准备
机制，不重采该候选，见[OP05候选回退](../tdd/op05-recovery-cost-calibration.md#延后认证候选回退)。

前一5e7bffc4检查点：OP04已修复相同字节／物理身份的重复磁盘通知重建，沿用同内容
缺省1／显式0；真修改仍保守，不增加LS/AST缓存。当前production5e7bffc4，
12完整文件93/93；完整安装SDK新34源／32依赖hop固定8会话96exact／当前READY。
两入口重复通知definition中位3.50/3.43s→79/77ms；真修改仍3.27–3.48s，
RSS四对含一对上升，不称整体内存收益。原工具误判FAIL保留；审计a20ba24f。
详见[OP04当前切片](../tdd/op04-versioned-overlay-snapshot.md#2026-10-16重复磁盘通知的独立输入切片)。
该构建原完整check:fast已1858/1858、exit0、零注解，209入口／1744源码／SDK／
产物／启动器前后相同，实际根进程退出，独立audit47ad6dda；旧1837/1839 FAIL
保留原状态。原403的四个完整oracle及20s期限本轮通过，不称以前超时已修复。
代码回归缺口关闭，不是P95/PSS／soak／平台或L08毕业；全范围继续。
当前未提交、推送、创建PR或合并；文档同步及generic go on不替代远端写入授权。
以下5e7bffc4及更早检查点均是各自原构建证据，不重标为新产物。

此前：引用之后，普通definition／诊断先完成／call follow-up刷新也已逐项
公开RED→GREEN。当前生产a6ae3b97的9完整相关文件88/88、exit0，审计e4c7eaa1；
原未知输入负例不改，根完整准备只针对必要context重建／不完整loaded scope。
当前安装SDK两入口定义exact/current READY，首次220/228ms、编辑后3.69/3.84s、
采样RSS最大559/557MiB（audit7becc0ca）；不是A/B/P95/PSS，冷重建成本仍待。
旧whole1826、v1 ENOSPC／counts=null及最终BLOCKED保留，不覆盖新结果。
回收派生存储后的原完整v2已真实1837/1839、2FAIL、exit1、零注解，审计4ab388e2；
206入口／1734源码／SDK／构建／启动器及退出一致，本轮0 ENOSPC，不标whole GREEN。
其中观察用例误把默认resident路径当必经verifier：原样RED后，两个真实公开CLI
对照确认默认无verifier、专用fallback两次实际dispose／零Registry残余（auditd9ea6d3d）。
只修测试资格并增强默认编辑保护，三个完整相关文件30/30、exit0，auditacf11315；
测试494行，生产a6ae3b97／默认组合不变。原403 id4的20s超时保留；同输入、原期限
的一次有限复测1 PASS／2未选，四个完整oracle比较均到达，但只是未复现、不是修复
（auditc67ed6b0）。冷Program／复杂closure继续；128仍未采纳，不重采闭合语料寻优。
随后OP-06实际restart两入口机制完成首切片：新服务先UNPREPARED，重放当前编辑后
重新READY；逐进程证明／归档／资源消费及异常退出／失败尾部均保护。19完整相关
文件171/171、exit0／零注解，独立audit0b95855d；私有SDK原生两入口共4服务进程
正常退出。不是安装SDK性能、P95／PSS／soak或14能力全部restart资格。
详见[实际重启证据](../tdd/op06-release-sample-evidence.md)。当前新工具head whole
NOT_RUN，合入仍须fresh whole＋分支PR。全部余项保持，不授予L08 DONE。
后续补全／调用层级restart来源切片也已完成局部资格：实际旧补全UUID失效、新
UUID可解析；两入口completion/resolve与prepare/incoming/outgoing完整payload一致，
采集器／消费者要求本进程更早、同快照／版本的真实来源请求。20完整文件176/176、
零注解，四个私有SDK原生案例12请求精确／8服务PID正常退出，audit6d359df3。
仅验收工具／测试改变，生产／默认／预算不变；原报告FAIL／最终消费BLOCKED。
调用item是root／位置路由，按当前源校验，不把它改为补全式会话UUID。
继续复杂closure／冷Program与OP04独立输入切片，并补其余restart能力／配置／
取消／压力／真实工程、全证据PASS路径及原最终门禁；当前工具head whole NOT_RUN。
审核基线：main `a111235bc4bfcb55b126752f95b3ba095f2996af`，PR #95 已合入。
依据为用户指定的 `1-arkts-query-performance-deep-research.md`
（[项目归档](../reports/2026-10-11-arkts-query-performance-deep-research.md)）
和当前实现。本计划落实其中的有效建议，接续
[L01–L08 主计划](2026-10-06-budgeted-resident-semantic-plan.md)，管理 L08
剩余优化切片；L03–L07 的阶段完成结论继续有效，L02 剩余增量合同由 OP-04 承接。

目标是减少重复准备、检查与等待，同时控制驻留和 transient compiler 的总成本。
正式验收为完整响应 P95 ≤550 ms，500 ms 为优化目标。OP-00–OP-05 按各自
功能、正确性和机制证据验收；最终时延、内存、就绪、soak 和平台门禁统一在
OP-06／L08 判定，未达最终目标的样本继续作为下一切片的输入。

2026-10-15最近冻结完整回归检查点：production input `5cf9d618`，真正冻结完整
`check:fast`已1757/1757、exit0、零skip/cancel/todo，全部源码／产物／SDK身份
一致并独立审计。原403文件和两个alias失败用例均通过；这是当前代码回归GREEN，
不是整体产品净收益或L08毕业。随后真实模块访问／失败原报告留存工具81/81，
最新SDK／并发嵌套根输入边界与原保护十文件84/84、exit0、零注解；生产产物
不变；随后OP-03a输入／错误提取及四层等待／认证观察、归因采样的正式出口
保护已推进，当前production `0fb92f3e`、十六完整相关文件172/172。真实Settings
OFF／ON共10/10完整oracle及最新诊断一致，仍FAIL／DEGRADED，不作产品毕业。
随后OP04当前400编辑408exact／404诊断一致，Snapshot净收益仍不稳定，拒绝
默认推广并保留显式1。新production `1ab95acd`十三完整相关文件79/79；六默认
不变。当前首次fresh whole为1794/1795、exit1，唯一失败是私有GC结果文件
发布前被读取的竞态；原FAIL完整保留。真实分段写入RED后改为完整临时文件的
原子独占发布，十三完整相关文件79/79、strict通过；生产1ab95acd不变。
修复后的原完整check:fast已1795/1795、exit0、零skip/cancel/todo，全部202个
fast入口、源码／产物／SDK／原启动器身份及真实根PID退出独立审计PASS
（b38d39c4）。这是历史1ab95acd代码回归GREEN，不替代各候选净收益或L08门禁。
随后OP03a仅readiness模块消除新准备后的重复admission，保留完整输出构造之后
的真实最终guard；当前production eabe24ef，十二完整相关文件70/70、exit0。
固定四向受控对比36exact／36当前READY／24编辑／28诊断一致，两方向编辑中位
改善约8.6–8.7%、采样RSS更低，支持局部采纳（audit125adc35），不当全产品收益。
新203-fast入口完整check:fast已终态1779/1797、18FAIL、exit1、零注解；源码／
产物／SDK／完整入口与真实退出审计d16e6667通过，不标whole GREEN。两个原文件
独立11/11、另五文件90/91，只有403源引用稳定超时，其余复测通过不称修复。
一次原403 trace确认7批反复冷Program约2.0–2.5s／批、无效anchor额外约2.8s，
保守完整搜索与原20s期限保留。用户已确认两种未打开模块入口均支持；随后
definition／typeDefinition／hover各自公开RED→GREEN，真正请求级disk-source
已实现，不创建overlay。真实client version0误判与close残留也经公开RED修复，
原调用层级磁盘follow-up改为显式source传输。随后signatureHelp／completion／
completion resolve／prepareCallHierarchy各自公开RED→GREEN，完整incoming／
outgoing也与opened-caller oracle一致；补全旧句柄按exact disk SHA拒绝，原512
条记录界限及列表256界限保留，不额外留source文本。其后implementation、引用
两声明策略及prepareRename／rename也分别RED→GREEN；核心14项已有两种入口
的基本完整oracle，冷引用、origin与local-alias事务编辑分别验证，不代表336格。
新发现的跨文件磁盘引用缓存陈旧，经同一完整READY证明绑定修复，仍有真实
cache hit；相同disk引用互相supersede也已接回原coalescer，独立取消／工作区
变更撤销全组与完整恢复通过。当前production `bd4010b6`，二十八完整相关文件
313/313、exit0、零注解，源码／构建／SDK／真实退出独立审计`b36e8173`，strict／
build通过。新增源测试是full profile私有SDK fixture，不冒充安装SDK产品计时。
登记213总入口／206-fast，当前新whole NOT_RUN，旧1779/1797 FAIL保留。下一项
继续真实完整SDK下的新路径／proof成本、冷Program重复准备及原资源／平台门禁。
原77/78生命周期失败未定位，复测通过不宣称修复。下一批次以更新后的表格为准。

## 当前默认策略和证据基线

[ADR 0015](../adr/0015-default-resident-optimization-policy.md) 已默认开启
budget-aware retention、resident references、同内容晋升、压力准入、成本回收和
持续高压力下的 transient diagnostics。后续实验以这六项开启的生产配置为基线，
显式关闭组合只用作同构建反事实对照。保留 1024 MiB 政策值、原滞回、一个
semantic owner、最多两个 resident contexts，以及完整 transient fallback。

PR #95 的测试 head 为 `bdacd812267d36d42cd16c443b56da1beb92c8de`，与上述
main 的 tree 相同。本机 `check:fast` 1585/1585、GitHub
[run 38109980966](https://github.com/liuhui-code/arkts-language-server/actions/runs/38109980966)
通过；这些是合入时的代码回归证据。
[最新组合对照](../reports/2026-10-11-resident-effective-combo-comparison.md)
属于默认值修改前的独立冻结构建：40/40 exact，新引用 974–1007 ms，新增引用后
4319–4337 ms，删除引用后 4064–4149 ms，RSS 没有明显收益；这些短样本不是 P95。
[压力恢复修复](../tdd/l08-pressure-recovery.md) 已使原三组规模流程完整成功，
54 会话中 15 次压力后补全成功，但恢复仍约 3.3–6.0 秒。L08 保持 IN_PROGRESS。

## 研究建议审核与实施映射

下表区分审核基线 `a111235b` 的源码事实、历史修复和待测成本，文件路径按
当前仓库校正，原报告保留原文。OP-01 的工作树实现与验证进度单列在对应
阶段，不把未合入实现冒充 main 状态；报告中的成本判断是待验证假说，不是
已证实的故障或性能收益。

| 研究建议 | 审核基线核验结论与证据 | 后续工作 |
| --- | --- | --- |
| resident 应先于 candidate | [proxy.references](../../src/semantic/semantic-worker-proxy.ts) 在缓存 miss 后先调用候选选择；[type-engine.references](../../src/core/types/type-engine.ts) 在 owner 内已先尝试完整 resident，再进 verifier。优化点是 proxy 到 owner 的分流，不能只交换 owner 内已经正确的顺序 | OP-00 量化候选耗时；OP-01 实现有界 resident-first 尝试 |
| `admit()` 重复扫描 | [resident state](../../src/core/types/typescript-resident-reference-state.ts) 会校验配置、输入签名、覆盖、overlay 和磁盘身份；[residentReferences](../../src/core/types/typescript-language-service.ts) 查询前后均 admit。重复工作存在，前后新鲜度 fence 各有职责，不能直接删除结束校验；L08 已有 rename 核验优化，不重复实施 | OP-02 按请求／证明事务复用等价计算，保留开始和结束保护 |
| 快照缺少 change range | [Host](../../src/core/types/typescript-language-service.ts) 的 resident 和部分磁盘快照使用 `ScriptSnapshot.fromString()`；源码没有 `getChangeRange`。这证明缺少文本变化范围，不证明每次都重解析全工程；既有 L02 已观测未改 SourceFile 复用 | OP-04 有界版本化 Snapshot 与正确性／解析成本对照 |
| 每次查询等诊断结束 | [reference capability](../../src/lsp/register-reference-capability.ts) 缓存 miss 后 suspend；[diagnostics.suspend](../../src/lsp/document-diagnostics.ts) 取消待执行任务并等待已启动任务结算。等待依赖实际在途工作；definition/hover 已有排队优先级修复 | OP-03a 量化实际结算等待，保留最新版本诊断与取消保护 |
| 普通编辑都会销毁 LS | [Store.sync](../../src/core/workspace/document-store.ts) 对普通 overlay 更新文本；[engine.prepare](../../src/core/types/typescript-language-service.ts) 更新 scripts。[reset reason](../../src/core/types/type-context-reset.ts) 针对 reset、owner、epoch 和 content revision；磁盘通知、关闭与未知影响可能重建。原报告把所有编辑概括成同一种失效不成立 | OP-04 分开测 overlay、保存／磁盘 delta、边界变化；未知影响仍保守重建 |
| trim 应只 cleanup cache | [registry recycle](../../src/semantic/backends/ohos-typescript/registry-pool.ts) 在 L2 重建 LS 是对锁定 compiler 的 Registry 所有权缺陷的修复，见[原始反例](../reports/2026-10-07-resident-l01-registry-recycle.md)。直接恢复 `cleanupSemanticCache()` 会丢失已验证的释放保护 | OP-05 测触发／重建成本；任何更轻回收先证明 Registry 零残余 |
| 普通查询总做全工程 ready | [readiness.afterQuery](../../src/core/types/typescript-semantic-readiness.ts) 仅显式准备建立刷新意图后、当前证明失效时重新准备；刷新确实逐 SourceFile 检查必要输入，并在[查询 lease](../../src/core/types/type-workspace-entry.ts) 内计时。它是条件性成本，不是所有请求固定成本 | OP-03a 归因 query refresh；增量证明必须保持完整输入／覆盖，等待计入响应 |
| Zed 未自动发送 ready | 当前[扩展](../../editors/zed/src/lib.rs) 负责启动命令，无自定义 readiness 请求接线；server 的[公开入口](../../src/lsp/register-semantic-readiness.ts) 已存在。报告给出的客户端回调需要先核实扩展接口支持 | OP-03b 验证客户端能力后接入准备进度，unsupported 路径单独记账 |

补充发现：[最终矩阵工具](../../scripts/bench/assert-semantic-release.mjs) 当前始终
输出 `releaseEligible=false` 并退出 1，独立环境与保留能力回归仍为 NOT_RUN。
OP-06 必须完成严格的证据消费和 PASS 判定，不能只重复执行现有拒绝入口。

原报告的 A/B/C/D 定义前后不一致、数字表为示例、脚本为模板；后续统一如下。
`tsserver --project --query`、extractor／consumer 模板不作为执行命令，也不引入
已暂停的 S02/S03 facts 路线。报告中期任务按下面的范围承接，不重复编号，
也不采用示例甘特图作为已承诺的日期：

| 报告中期方向 | 现有阶段与后续切片 | 边界 |
| --- | --- | --- |
| 常驻 LS 基线稳定 | L01 证据由 OP-00 继续归因；OP-01/02 改进热路径 | 不重新启动第二套 resident 基线或语义 owner |
| 增量维护和并发 | L02 剩余合同由 OP-04 承接；等待调度归 OP-03a | 不重开已拒绝的 S05，不先增加重任务并发 |
| 内存和生命周期策略 | L03 保持 DONE，OP-05 校准，OP-06 最终验证 | 不提高预算换通过，不把 Registry 修复退回 cleanup-only |
| 能耗和并行机制 | OP-05 记录 CPU/资源成本；现有路径仍有瓶颈时再提出独立决策 | 本队列不默认新建后台语义索引、checker 或 Worker 并行体系 |

是否新增 ADR 由切片产生的实际决策决定，不提前占用 0016–0018 或改标历史 ADR。

## OP-00 分层归因与当前构建基线

状态：IN_PROGRESS。对应 R-20/21/22/29/30/34；后续修改以本阶段数据选定成本中心。

[当前 TDD 与真实基线](../tdd/op00-query-layer-attribution.md)：六个独立完整 LSP
会话 30/30 exact，trace-off 的未查引用 915–1024 ms、编辑后约 3.93–4.36 秒，
正常诊断与进程退出通过，readiness DEGRADED 保留。不含声明的同输入 A/B/C
各三进程，共 45/45 exact；A 新引用 183–192 ms、编辑后 680–714 ms，
B 新引用 983–1016 ms、编辑后 4.07–4.41 秒，外部资源曲线已保留。
三轮独立 trace 指向 resident 核验与编辑后的 Program 准备成本；十项公开工具测试
已有 GREEN 检查点（连同库存登记 14/14；不代表后续工具改动已验收）。
definition／incomingCalls 公开 CLI 已实现；真实
Controller incomingCalls 的 A/B/C 各三进程完成，45/45 exact，保留逐轮变慢的样本
与未解释变动，不计算正式 P95。跨模块 definition 的 A/B/C 各三进程完成，
27/27 exact，全部慢样本与稀疏采样间隔保留；readiness DEGRADED 不变。
压力／重启场景必须有真实控制见证；缺少见证时明确失败，不能当普通查询假 PASS。
其它场景、实际读操作／Program 身份计数与生命周期归因
继续补齐；共享工作树首轮完整 check:fast 为 1571 PASS / 30 FAIL，不能凭
小样本或工具 GREEN 关闭 OP-00，失败分类及后续检查见 OP-01 TDD。

实际输入操作计数首切片已完成公开 RED→GREEN，相关工具 focused17/17。
三个独立 A 层诊断观察会话 15/15 exact、pins/driver/observer 一致；未查引用
每轮 stat254、native realpath261、hash update259／2144457 字节，编辑各
hash update1500／约 10.67 MB。明确是 official driver run 内的同步 native API
尝试，不是内核 I/O 或独占耗时，正常计时不启用。随后 B 层公开 owner／嵌套
verifier 观察 RED→GREEN，职责提取后的最新工具联合 19/19、零 skip/cancel/todo。
三个独立真实 owner 进程 15/15 exact；清单、产物、driver、observer 和原始
Worker 快照审计一致。每轮真实 semantic Worker 发出 14 个累计快照，两个编辑
verifier 各发出一个；未查引用前后响应间的累计差均为 stat12063、lstat19775、
native realpath12074、hash update1031／7636169 字节。这只是消息间实际尝试的
差量，包含该区间其它工作，不是 RPC 独占成本或完整 Worker 生命周期。
readiness DEGRADED 保留，诊断观察不作为正常时延／内存证据。
上述旧计数切片未含对象与调用点；后续实际证据见下，B/Worker仍待补齐。

实际official公开返回身份/区间首切片已RED→GREEN，相关工具29/29、类型通过，
有界事件/Program容量溢出明确拒绝归因但保留全部结果。新三个真实API24会话
15/15 exact、工厂每轮1次、pins/repo稳定；每轮3个实际Program各2261 SourceFile，
编辑换代每次仍复用2260个对象，只有HomeInitData一个换代。查询窗已观测公开
getProgram约0.02–0.11ms，编辑compiler查询约586–619ms；均为诊断wall而非正式
P95/CPU或所有构建/解析计数。必要输入DEGRADED保留，不把Program换代等同全工程重解析。
生产源码c2a50003不变；本次新工具／五个测试不借用之前whole1648授予完整head
GREEN。源码/原始证据、未测容量分支和剩余生命周期范围详见OP-00 TDD。

随后真实目标API与Registry收尾两项公开RED→GREEN，工具联合31/31；
新三个official会话15/15 exact、身份稳定。每轮Registry acquire2261/
update4522/release2261，successful dispose1，公开统计收尾refCount0；这不是GC/
RSS回落证明。新增/删除引用主要成本在第一getDefinitionAtPosition内部，
约662–719/570–617ms，随后findReferences约123–142ms，不能只凭此区分内部
同步/解析/checker。保留全部慢值及DEGRADED，不算产品P95或净收益。
含声明A/B的三个独立进程各15/15亦已补齐完整结果与输入计数：A新增/删除
约832–843/767–798ms，B约5164–5670/5423–5441ms，全部慢值保留。
B每轮semantic Worker14个累计快照与两个编辑verifier各1个；B对象/Registry
终态仍NOT_OBSERVED，不借用A释放结论，不当正常P95或CPU独占成本。
继续B/嵌套Worker对象、其余场景、正常资源曲线和压力回收，不退回cleanup-only。

后续Worker原生compiler观测工具已公开RED→GREEN、相关32/32：诊断exports
钩子使用完整生产源码，先复现原产物字节，实际诊断Worker另列digest；不当正常
产品计时/资源实验。保持原stdlib路径、WorkerData/消息及预算，无额外LS或预查询。
同期发现旧reportStats只列`_`前缀bucket，故旧空统计不能独立证明native零残余，
该解释撤回，原成功release流量/raw保留。新fork refcount采样限于公开已观测
path-kind，当前真实分层数据须另冻结，不把旧样本改身份。详见OP-00 TDD。

随后新A/B各三会话30/30 exact、pins/产物/raw审计一致。纠正后的A native路径
统计收尾0；B每轮原驻留LS starts2/dispose1，两个编辑verifier各实际676 SourceFile。
六个verifier的getProgram约4.69–4.79秒，后续目标API仅约53–56ms；冷准备是
当前已观测大成本，不把它当纯CPU或盲加Worker并发。B最后消息仍见676个lease、
无dispose终态，不能推断泄漏或已释放。继续parent exit/native dispose见证、
驻留服务替换的实际触发原因及内存资格，最终P95/物理内存仍留OP-06/L08。

后续父侧退出/native调用来源已公开RED→GREEN、四文件33/33。固定三个真实
owner会话15/15 exact且全部身份审计PASS；三轮替换实际都由内存timer触发
L2 trim/recycle，不能归纳为普通编辑必然重建。九个Worker均有真实父侧退出，
六个编辑verifier的冷getProgram仍4.47–4.77秒。线程停止不等于native dispose/
GC/RSS回落；最后compiler lease与未观测dispose如实保留。继续冷准备路径、
独立物理内存/其余场景和当前工具whole，不放松预算或把最终门禁前移。

引用 trace 中候选规划为 72.45–74.11 ms，resident 段为 847.64–884.91 ms；
编辑后 Program 准备段为 3173.85–3533.39 ms，查询本体为 62.33–70.61 ms。
这些区间可能重叠，resident 段也不是核验独占计时，不能相加或等同于纯
compiler 时间；后续优先验证 OP-02 输入核验与 OP-04 编辑准备假说。
OP-01 消除候选工作后仍须验证
净收益，不能仅靠调整路由顺序推断达到最终时延目标。

固定真实 Settings checkout、API24 SDK、已声明依赖、Node、编译器与标准库、
target/options、source/overlay bytes、产物 digest、默认组合、预算及目标池。
重建当前 pin，不改旧报告的构建身份。准备过程不得预查询目标池。

| 层 | 测量边界 | 用途 |
| --- | --- | --- |
| A 官方完整 LS | 仓库锁定的 `ohos-typescript@4.9.5-r10`、相同完整 Host／SDK／scope，直接 compiler 查询；优先复用[生产宿主 oracle](../reports/2026-10-04-semantic-ready-s02-production-host-oracle.md) 的已验证输入合同 | compiler 成本与完整结果 oracle；不把简化 Host 或不同 compiler 的时间当等价对照 |
| B ArkTS owner | 公开 SemanticEnginePort 调用，保留现有 proxy 候选规划和真实 Worker IPC；内部分段观测准备、增量、resident 查询与输入证明，保持同一 Host 和搜索边界 | 定位语义端附加成本；B 已包含的候选／IPC 不重复算入 C−B；不是 LSP capability 验收 |
| C 完整 ArkTS LSP | 真实子进程 Content-Length stdio，客户端发出请求到收到并解析完整终态 | 产品延迟、队列、候选、IPC、诊断结算、编码和 fallback |
| D Zed 客户端 | 同一 server artifact 和请求目标，用户触发到客户端显示完整结果；记录编辑器版本与准备进度 | 量化客户端附加等待；可用环境下独立执行 |

至少覆盖未查引用两种声明策略、未查 definition/implementation、incomingCalls、
普通 body/reference/API 编辑、重复 cache 对照和压力后恢复。constructor／保守多批
另列，保留超时与预算拒绝。冷准备、ready 后新目标、编辑后首次与缓存命中分开。
真实必要输入不足时记录 DEGRADED 与受影响能力，功能归因仍可执行，不能计入
ready 后正式 SLO；API24 兼容性沿用现有决定，不增设版本匹配门禁。

trace-on 独立记录阶段边界、实际执行次数、读取／stat／realpath 数、Program 和
SourceFile 身份、Registry 与 Worker 生命周期。trace-off 独立测完整时间与资源。
按互斥时间区间解释排队／准备／核验／查询／返回，重叠阶段不直接相加。
未被观测边界解释的时间单列；不以分组 trace 事件数冒充实际 Program 构建次数。

工具失败保留切片已公开RED→GREEN：第一结果已完成、第二场景实际开始时，
watchdog原本丢失全部requests；突然SIGKILL的报告原本没有failure原因。
现在在实际完成边界保留完整核对行，中断请求记录失败/耗时下界，未执行尾部
明确列出；报告仍FAIL、不伪造完成时间或postflight。官方与真实owner两种
中断及prepare→incomingCalls依赖保护通过，最新工具四文件24/24、身份稳定，
见OP-00 TDD。生命周期、剩余预声明场景和成本归因仍补齐；不因此关闭OP-00。

阶段验收：A/B/C 各至少三个独立进程会话，同输入结果、完整时序、资源采样和
可重放命令齐备，明确主成本及下一切片假说；D 有实测或明确待执行状态。机制实验的小
样本保留逐值范围，不能宣布正式 P95。客户端环境不足不阻止 OP-01/02/04。

OP-00 的场景范围在 manifest 中预声明，不扩展成 OP-06 的 336 格最终矩阵。
各方向已有对应路径的可重放归因、完整 oracle 和执行保护后，即可启动其优化切片；
不以 OP-00 整体 DONE、其它能力的补测或客户端实测作为共同前置。
OP-00 自身仍按上述范围补齐证据后收口，未测项不能改标 PASS。

## OP-01 提前尝试完整 resident 引用

状态：DONE（路由切片采纳；2026-10-15）。对应 R-09/21/33。
采纳完整驻留命中前移，保持缺省／1开启、0独立回退、缓存最前及冷根跳过试探。
依据原固定12 timing／4 trace、80/80完整位置与正常最新诊断，以及最近冻结
生产1757/1757保护；当前8个路由／保护文件与该whole归档字节相同。
十个直接保护合同覆盖冷热、编辑miss、取消／lane、package retarget、压力和
不完整scope；16份原对照文件digest再次核对。独立audit SHA
`1fa7716d52960a6636368aa785cbd7ea0fe541f92ea4df7f3f72b798eb44aa6e`。
限定收益是新目标6对中5对更快、热命中少一次候选规划；编辑与RSS方向混合，
不宣称整体稳定提速或内存收益，不将旧计时重盖当前构建身份。原FAIL／DEGRADED
及旧whole失败保留；550ms／物理内存／完整ready仍由OP-06／L08判定。
后续新工具head必须完成fresh whole才能请求合入，不重开已验收路由切片。
以下为历史推进记录，其中“IN_PROGRESS／下一步采纳”等为当时状态。
[公开 RED GREEN](../tdd/op01-resident-first-routing.md)已证明默认完整 resident
查询两种声明策略无需候选规划，缓存仍最前；旧顺序可独立 opt-out。
最小修复编辑后旧观察的重复核验，实际 SDK 叶文件重查 3→0、完整引用及
最新诊断通过；修复后十文件联合 55/55、独立冷 miss 新/旧表征已通过。
首轮冻结完整回归已终态：1571/1601 PASS、30 FAIL、exit 1，源码／产物／SDK
前后身份一致。27 个原 5 秒冷启动超时、一个原 20 秒引用超时与两处物理 RPC
计数／trace 断言分别保留。两个冷用例原测试重跑通过，新旧构建各三轮同输入
对照也 12/12 PASS；尚未证明整轮超时的唯一原因。两处旧断言已公开 RED→GREEN，
按逻辑请求区分有界 resident 试探与完整 fallback，不关闭默认优化或删减结果
证明。职责提取后 20 个公开 LSP 用例通过、库存 4/4；十五文件联合复核仍为
74/85 PASS、11 个原期限超时。403 文件原合同在旧构建及当前路由 OFF 上通过，
当前 ON 无 trace 的失败保留，独立 trace 两边均通过，却揭示新试探改变首次
候选规划时机并多建约 1.8 秒 anchor。冷根保持原规划顺序的最小反例已 2/2
GREEN、strict/build 通过，十四文件联合保护 79/79、原 403 文件合同复核通过；
新源码身份独立，单会话不授予稳定收益或最终验收。
不推广尚未证明净收益的候选。
修复后[真实同构建对照](../reports/2026-10-12-op01-resident-first-comparison.md)已
终态：12 timing／四独立 trace，80/80 exact，pins／最新诊断／产品 exit 0 一致。
新目标五对更快、一对更慢；编辑仍 3.53–5.41 秒、RSS 无一致收益。两种声明策略
ON 零候选／verifier，OFF 各先做一次候选。raw FAIL／DEGRADED 保留，不宣布正式
P95。新 whole 已终态 1589/1601 PASS、12 FAIL、exit 1，全部前后身份一致；
十一项原 5 秒响应超时、一个原 20 秒／403 文件首次引用超时保留。随后五个原
失败用例单跑通过；覆盖全部原失败所在五文件的完整缩短序列也 45/45、pins
一致，仍没有复现整轮失败，不能宣布修复或唯一原因。候选继续
做可复现成本归因、新完整 GREEN 和阶段采纳／回退审计，尚未 DONE；
不追加有利采样代替判断，也不把该审计变成 OP-02/03/04 的共同启动屏障。
已核对的前两对不含声明 timing 中，新顺序相对旧顺序分别为约 982/1373 ms
与 1209/1053 ms，收益方向反转。机制成立不等于稳定提速；不删慢样本，
不通过反复运行直到偶然达标来结束本阶段。
该首版的 12 timing/4 trace 会话均已终态、分别 60/60 与 20/20 exact；
trace 证明新符号零候选规划，也揭示编辑后重复检查旧观察的代价。首版身份
保留为修复前证据，新源码必须重新冻结，不把旧样本自动升级为修复后收益。

在 proxy 的候选规划前，设计复用现有 semantic owner 的 resident-only 尝试。
沿用 root、变更队列、当前 overlay、取消、lease、预算和完整覆盖证明。
仅“没有可用完整 resident”属于普通 miss；incomplete、配置变化、取消与资源
拒绝按现有公开合同处理。miss 后进入原候选／完整 verifier，不把首次试探变成
隐式全域建 Program，也不额外创建 LS、owner 或第二套 source cache。尚无完成
查询记录的冷根跳过提前试探；该提示只影响优化机会，不证明有效性或限制完整
fallback，Worker 替换时清除。
`ARKTS_REFERENCES_RESIDENT_FIRST` 缺省／显式 1 使用新顺序，显式 0 恢复
原候选优先顺序，仍保留 R-09；它是路由对照／回退，不改变六项资源与复用默认。

阶段验收：公开 LSP RED→GREEN 证明有效完整 resident 回答未查目标时，候选
选择和 transient verifier 启动均为 0，完整位置与独立 oracle 一致；缓存命中
仍是最前路径。旧代／overlay／无通知磁盘与配置变更、scope 不完整、关闭开关、
取消、L3 和 resident miss 均保留正确终态及 fallback，不能重复结算或发布部分结果。
同构建 trace-off 对照报告新目标收益、miss 的额外成本与 RSS；550 ms 留给 OP-06。
按预声明对照范围完成判断；净收益仍无证据时不推广，保留表征和原始结果，
撤销无益候选并以 REJECTED 收口，不反复扩展采样直到偶然通过。
不因本候选未获采纳而阻塞 OP-02/03/04。

## OP-02 请求内输入核验复用

状态：DONE（选定请求内复用切片及采纳审计；2026-10-15）。可独立于OP-01推进。
对应 R-13/22/30/33，复用已有 loaded configuration witness 与 resident proof owner。

完成范围是已选定的纯字符串hash、官方模块解析及实际目录存在性复用，不新增
“再寻找可选计算热点”作为本阶段完成条件。原SDK候选Map因固定对照无净收益
已撤回，保持REJECTED。配置／覆盖／磁盘扫描不被本决定删减或改成缓存有效性。

模块／目录组合ADOPT：沿用缺省1／显式0、一次同步query，模块解析最多32次后
普通回退；目录最多32项／32K code units，所有出口清空。原首查load-window和
完整结束guard、1024MiB／六默认／owner／完整fallback保持。原固定12个正常
会话60/60完整结果及24诊断全部原文件重新核对；新引用／新增引用快慢各3/3，
删除引用6/6较快、RSS三升三降。四进程冷ABBA只保留原有限标签／时点RSS资格，
不补作完整payload、预先冻结来源、独立峰值或当前构建性能。限定采纳依据是
减少已观测重复查找及局部成本改善，不宣称稳定整体提速或内存收益。
当前五完整保护文件36/36、原SDK／并发根等十文件84/84，以及最近冻结生产
whole1757/1757共同保护选定路径。五相关源／保护文件与whole归档字节相同。
采纳audit SHA `356305f195538bd2c355996b20e8dfaba23dd173679b56f3c73cb9c7411d6bc5`；
原18449053／2303c3e7实验身份与当前5cf9d618分开，原FAIL／DEGRADED不改标。

| 阶段合同 | 已有直接证据 |
| --- | --- |
| 选定重复计算／I/O减少 | 实际overlay hash6→1，真实Worker区间1031→255；SDK重复目录首查保留、原58→1，关闭仍普通查找 |
| 有界容量和结束清理 | 512项／4M hash、32次解析／32目录／32K；超限回退，取消及新事务重新计算 |
| 执行中新事实、缺失路径／目录变存在 | 原SDK叶之间创建文件、true→absent、负向祖先容量与实际目录创建控制；拒绝旧证明并正常恢复 |
| SDK／配置／package／symlink／同大小替换 | 真实加载及返回窗口、SDK重配置、package entry／installation retarget、完整物理身份和metadata存在性保护 |
| 并发overlay／multi/nested／取消／scope | hash中的真实双根编辑ContentModified／无result，完整5/6恢复；取消单终态／压力及不完整scope保护 |
| 当前代码回归与有限采纳 | 最近冻结生产1757/1757、当前84/84及36/36；固定原对照和不利值保留，候选Map撤回 |

这些只关闭OP-02独立切片，不完成OP-00其余归因或OP-06／L08的550ms、完整
ready、物理内存／生命周期／平台门禁。新工具headfresh whole仍在请求合入前
完成，不能借用最近生产whole授予新增工具GREEN。以下为历史推进记录。

2026-10-15纯hash子切片ADOPT／DONE：保持缺省／1与独立0回退，512项／4M
code units／单事务finally清空；不缓存任何磁盘／配置有效性。原固定六诊断／
十二正常会话90个完整结果，以及全部manifest／report／stdout／metrics／原生
Worker计数文件再次核对；旧3d6cc93f成本与当前5cf9d618身份分开。
实际hash减少及新目标5/6较快支持有限采纳；编辑和RSS混合，不承诺整体稳定收益。
当前直接[SDK／并发嵌套根边界](../tdd/op02-native-input-boundaries.md)和原容量／
取消／同大小替换／配置／package／scope／alias保护十文件84/84；最近冻结
whole1757/1757中的6个相关生产文件字节未变。独立采纳audit SHA
`383773a255e1b7714026db4d34713dfa5b474544cee2a721c0b625f8f5c6db73`。
上述纯hash采纳当时尚未关闭整个OP-02；模块／目录组合已在本节最新审计收口。
新工具headfresh whole仍是请求合入前条件，不等于L08完成。
以下“尚未采纳／直接窗口待补”等为当时的历史记录，原FAIL／慢值保留。

先为一次真实公开请求记录 inputsFor、配置验证、覆盖集合、文本 hash 和磁盘
检查的调用与时间，区分开始捕获、执行中加载新事实、返回前验证三个职责。
选择已证实等价的签名／集合计算或配置遍历复用，生命周期限于请求或证明事务。
结束 guard 仍发现请求中和无通知的外部变化；仅文件监听或旧 mtime 不授予有效性。

OP-00 已有 A 的请求窗和 B 的真实 Worker 同输入计数；B 未查引用区间三轮
hash update1031／7636169 字节，是追踪 inputsFor／签名计算调用点的入口，
不是“四次等价计算”或可删除磁盘检查的证明。首切片先把这些实际调用映射到
输入身份和调用方，再选择一个有公开计数反例的纯计算；不先建立跨请求缓存。

首个[公开 RED→GREEN](../tdd/op02-resident-input-proof-reuse.md) 已确认并改进实际
字符串 SHA-256 的重复计算：每个完整 resident 请求的选定 overlay 文本6→1，
两种声明策略与显式关闭对照完整；请求结束清空，512项／4M code units 有界，
容量不足仍按原方式计算。配置／磁盘／覆盖检查和两个边界的新输入观测不复用。
当前分支候选 `ARKTS_RESIDENT_INPUT_HASH_REUSE` 缺省／1 开启，0恢复原计算；
尚未合入或采纳。新鲜度窗口控制、原四文件27/27与扩展八文件41/41已通过；
六诊断B反序会话30/30 exact、pins／raw审计通过，三对未查引用区间hash update
均1031→255、输入7636169→2151275字节，stat/lstat/native realpath不变；
这不等于独占耗时。十二正常C反序会话已终态60/60 exact、最新诊断／pins／
产品退出审计通过；[完整对比](../reports/2026-10-12-op02-input-hash-reuse-comparison.md)
保留全部raw FAIL／DEGRADED。新引用五对更快、一对更慢，四对改善约21–28ms，
编辑仍约4.10–5.41秒，RSS无一致收益；不追加有利样本、不计算正式P95。
当前直接容量和native hash期间取消控制通过，合计文件4/4；扩展41项中的
部分SDK/package回归走definition或R-09 OFF，不能代替本候选直接路径覆盖。

同大小同mtime返回窗控制发现真实旧结果：结束admit正确拒绝，但fallback
的磁盘文档缓存仍仅按mtime/size复用旧文本；关闭hash复用同样失败。
已保留实际公开RED并最小修复完整磁盘身份判等；strict/build及五个直接用例
5/5、exit0，当前三位置恢复；关闭对照也通过，修复后九文件联合53/53、
零skip/cancel/todo。当前source input5248dc65与旧3d6c对比身份分开。
该正确性保护按公开结果验收，
不能拿局部机制或最终550ms目标代替；修复后的新源码不借用旧对比pins。
新冻结whole1608/1610、两项原期限超时、exit1，前后全部身份一致；403文件首次
引用和继承补全的独立trace观察均通过，仍未复现整轮超时。symlink／新加载事实／
并发overlay等直接保护、当前完整GREEN与采纳／回退仍待完成。

新请求内官方模块解析切片已公开RED→GREEN：20个SDK导入相同缺失模块，原生
目录stat40→2，关闭仍40；40导入OFF80/ON18，超过32次解析clear后诚实回退。
无通知missing→present明确拒绝，完整SDK副本切换后新查询/诊断恢复；不缓存
物理guard或结束有效性，不改owner/Worker；初次owner切片未接入transient。
source边界职责提取保护26/26，新构建5160732d十二文件83/83、exit0，所有pins
一致；有限原5s冷交互OFF/ON各2/2，不覆盖旧whole或403文件失败。
工作树`ARKTS_QUERY_MODULE_RESOLUTION_REUSE`缺省/1、0对照，仍待真实净成本/
资源判断、新whole GREEN与采纳，原六项默认不变，不授予550ms毕业。

后续transient切片已接入一次同步请求scope：独立anchor/final Worker各40→2，
OFF40，完整SDK/范围/诊断/生命周期不变。真实SDK目录短暂出现→消失的公开RED
证明原verifier缺少实际加载保护；最小修复增加自身见证及返回前完整输入检查，
保留-32803错误分类与v2查询/诊断恢复，完整直接文件3/3、exit0。
GREEN下输入fence职责提取18/18，core3289→3282；新source18449053有限执行
403文件引用与两个原5s冷交互3/3、exit0、全部pins稳定。不是新whole GREEN、
真实净收益或L08毕业；随后冻结16文件115/115、exit0、全部身份稳定，包含
403文件及取消/恢复/SDK/package保护。同构建固定12个真实反序会话全部终态：
60/60完整结果、24份最新诊断/资源/pins审计PASS；原始均FAIL/DEGRADED保留。
新引用与新增引用各三对快/三对慢，删除引用六对快（0.23–4.64%），RSS三升三降，
编辑仍5.47–6.22秒；不宣称总体稳定收益。当前whole/其它直接窗口/正式采纳仍待
完成，下一冻结whole串行执行不与计时重叠，详见OP-02 TDD。

新source18449053整轮已终态1640/1642、2 FAIL、exit1，全部身份稳定、零注解。
三个原期限超时已在本整轮通过；仍有悬空symlink加载与目录创建后缺失相对
路径的两项-32803失败，需区分正确拒绝与见证容量回归。保留原FAIL，不关闭
完整返回保护、不扩大4096上限；当前完整GREEN/直接窗口/采纳仍待收口。

两个失败的有限关闭对照仍2 FAIL。容量最小修复保留实际negative叶加载前后
父目录epoch，原800路径/目录创建例1/1、冻结原三个保护文件19/19 GREEN；
新真实SDK叶查询之间创建文件控制在cache缺省/OFF均拒绝旧结果，完整SDK
切换及v2查询/最新诊断恢复，不允许后续加载restamp旧epoch。
悬空link仍是未知输入；新的两策略明确拒绝/恢复合同先公开RED，证明legacy
缺少返回保护而成功返回6位置。既有lease内补上完整输入fence后1/1 GREEN，
两声明策略拒绝、目标修复/watch通知/v2 overlay后完整结果及诊断恢复。
新source ef30254b、strict/build通过；保留原whole FAIL，接着包含原失败文件
的新相关批次及fresh whole，不能将这些局部结果改标整体GREEN或550ms毕业。

该17文件批次已139/139、exit0、全部身份稳定；新ef30254b完整check:fast
终态1642/1643、1 FAIL、exit1、零注解且前后身份一致。上述两个原失败及
新SDK窗口均在本整轮通过，原403文件/两个5s冷交互也通过、期限未变。
唯一新失败为声明source root首次创建/watch后warm命名引用-32803。
一次原用例RED及分层诊断确认compiler/resolver通过，旧项目模型缺失见证
失效：新LS仍沿用旧model快照。新上下文创建时真实重载model的最小修复，
原创建/同大小同mtime变更/删除与fresh完整oracle一致1/1 GREEN，strict/build
通过，source c2a50003。临时诊断已清除，20文件新相关保护173/173、exit0、
零注解及全部前后身份一致。OP-00中断证据切片亦24/24后，当前c2a50003
冻结完整check:fast已1648/1648、exit0、零skip/cancel/todo，真实根退出且全部
production/SDK/repo身份稳定，见OP-02 TDD。原source-root及原期限用例通过。
其余直接窗口与采纳仍待；保留旧FAIL，不以完整代码GREEN替代实验/最终门禁。

阶段验收：对选定可复用计算有明确计数反例和 GREEN（同一事务身份内降到一次）。
开始与结束的独立新鲜度观测不算可删除的重复计算。
保留开始／结束新鲜度、执行中新增加载事实、SDK/package retarget、缺失路径变为
存在、同大小替换、symlink、扫描中变化、并发 overlay、multi/nested roots 与取消。
发生变化时重新验证或明确拒绝，完整结果和正常最新诊断一致。记录减少的原生
I/O、hash／集合构造及完整响应；若无收益，撤销该候选并记录结论。

## OP-03 诊断 就绪与客户端准备

状态：a IN_PROGRESS，b IN_PROGRESS（接口核验；接线/真实客户端验收未完成）。
对应 R-20/22/23/29；a、b 是可独立交付的小切片。

### OP-03a 查询等待与就绪证明更新

依赖 OP-00 等待／ready refresh 归因，必要时复用 OP-02 的证明事务。
2026-10-15当前四完整公开调度／readiness文件31/31、exit0、零注解，全部源码／
SDK／产物身份稳定，audit SHA
`c3f7b68999b3d5529c3048824a8dd10cb1aba802a6a15685730c900b7caf7f86`。
它补齐当前已有功能／正负例基线，不证明正常实际等待或净成本改善，私有hold
不进入正常计时。下一切片先区分LSP suspend／在途结算、supervisor pending、
Worker接收后的等待与afterQuery；不把一段冒充全部或把重叠段相加当CPU。
现已先以原六完整文件提取前／后68/68保护输入验证／错误职责迁移，再完成
父侧准入→send成功返回、Worker原消息回调→dispatch两次公开RED→GREEN。
`ARKTS_SEMANTIC_QUEUE_TRACE`仅精确1开启、缺省OFF；完整payload／v2诊断ON/0
相同，取消／发送失败无伪造成功记录；当前九完整相关文件78/78。
supervisor894→726→732行仍为超限债，新模块≤139、runtime494均在限制内。
两段独立本线程计时，不含未交付消息／全部compiler等待，不相加当CPU；普通
私有fixture只验证记录。随后LSP原cache-miss suspend结算与查询内整段认证均经
公开RED→GREEN，未设置／0／1、cache hit／缺输入／新旧ready保护保留；内部
queryScope状态及实际返回证明元数据不冒充公开根级ready。当前十六完整文件
172/172，queue观测1也被采集／正式时延及内存入口强制标为仅归因。
当前真Settings五正常＋五归因结果均exact／最新诊断一致，但原报告FAIL／
DEGRADED2307保留；OFF新引用664ms、编辑4.5–4.9s，ON所测quiescence12.283／
0.285／0.362ms，成功query认证仅degraded范围0.110ms，不是成功ready刷新。
普通繁忙补全优先级净成本／真实成功ready刷新仍待，下一归因优先编辑准备与
完整fallback，详见[当前TDD](../tdd/op03a-completion-diagnostic-priority.md#当前真实settings有限观察)。
不改调度、增owner／并发／预算或暂停正常诊断，不用部分等待或ON/OFF观察差值
冒充CPU、优化净收益或正式P95。
随后普通繁忙补全已完成原Settings四组固定OFF→ON→ON→OFF：48/48完整补全／
96份当前诊断一致，退出及全部身份／原始记录独立audit4692ffbd通过。原oracle／
两次ENOSPC失败各自保留；隔离采集与关闭缓存整理三完整工具文件8/8，组间
精确回收派生缓存，不改产品。ON先于第二诊断发布，但合并补全P50 OFF2.52s／
ON10.75s、尾值较低而诊断更晚，两个ON的RSS峰值均高于各自OFF；无稳定整体
净收益可宣称，不追加有利采样。保留已有一次越过正确性修正，不增调度／开关。
当前生产1ab95acd／1795不变；下一项成功ready刷新及慢准备／压力回退成本，
OP03a/03b不据本有限DEGRADED对照毕业。
成功ready刷新成本已另用固定生成1000-workspace／500-active语料和真实完整SDK
补齐：三正常＋三独立归因54/54完整定义／54当前公开READY证明、36编辑／42最新
诊断一致，audit b3079b3f；不是Settings毕业。正常编辑RPC827–921ms，归因整段
认证501–573ms、每编辑869个实际依赖检查调用；六原CLI1/FAIL及其它门禁BLOCKED
保留。下一切片公开证明哪些输入认证是真正重复计算，保持最后新鲜度guard，
不以相同快照跳检查或把准备移到响应前；当前生产／1795基线仍不变。
随后新准备重复admission的公开RED原10次SDK叶lstat超过预算8；仅readiness
模块返回最终guard后的新report，完整构造期无通知SDK变更仍撤销READY，正常
配置重绑定后恢复。十二完整相关文件70/70，strict／build通过，production
eabe24ef。相同原生产stdlib路径的双向baseline/candidate四组36exact／36当前
READY／24编辑／28诊断一致，固定局部对照支持采纳，不追加有利采样；不是直接
生产计时或Settings毕业。随后完整203-fast入口whole1779/1797 FAIL及定向冷准备
归因见上方最新状态；旧1795不覆盖。OP03a仍IN_PROGRESS，核心14项两种入口的
基本完整oracle已补齐；更多输入／压力边界与真实成本仍需验证，最新身份见上方。
首个队列切片公开RED已证明：未查继承成员补全在正常诊断队列中不能越过
尚未执行的第二份诊断，尽管完整成员和两份最新诊断都正确。范围仅将complete
接入原define/hover的一次越过公平规则；不抢占在途compiler、不增加并发，
不宣称解决前述冷补全或403文件whole超时。详细记录见
[OP-03a TDD](../tdd/op03a-completion-diagnostic-priority.md)。
最小GREEN后同窗两补全证明最老诊断最多被越过一次；取消只一次-32800、
v2新成员与最新诊断恢复，全局implementation屏障也通过，两文件6/6。
当前eae466b5构建十文件完整相关回归89/89、exit0、零skip/cancel/todo；
同输入实际等待成本、当前新whole及采纳审计仍待完成，OP-03b和ready refresh
没有据此完成，原cold/403文件whole超时也未被宣称修复。
为 references suspend、已有 compiler 工作的结算、队列及 afterQuery 分别记账。
沿用已有 definition/hover 有限越过未执行诊断的策略，改善真实等待主因。
若瓶颈为 ready refresh，只有足够的输入／依赖证据才缩减重复认证；未知输入
保留完整验证。只读 status 不启动准备，正常诊断不自行发起全根认证。

用户2026-10-16明确两种入口都支持：“从已打开caller导航到未打开模块”和
“直接查询从未didOpen的source”。后者先以公开READY根／未打开两源的definition
返回[]建立RED，随后definition／typeDefinition／hover分别公开RED→GREEN。
请求级disk-source、物理归属、当前磁盘／overlay竞争、取消和返回前guard已接入；
真实version0与磁盘source显式区分，原follow-up不再伪造open/close。完整hover
文档／Unicode／range及跨模块类型位置均与独立opened-caller完整oracle一致。
随后signatureHelp／completion／completion resolve／prepareCallHierarchy也分别
RED→GREEN，完整调用层级prepare／incoming／outgoing逐字段相同；磁盘补全
句柄绑定exact source SHA，同size／mtime变化仍拒绝，重新准备／补全后恢复。
随后implementation、references两声明策略、prepareRename／rename分别RED→GREEN。
完整全局编辑使用origin声明oracle；import alias另证仅修改局部caller、保留origin。
磁盘引用缓存原先仅凭未变的查询源返回其它文件旧位置；公开差分确认owner新查询
正确而旧key仍陈旧。现在hit重新核验原owner完整READY代次／identity，存储须查询
前后同证明，metadata仍计入原128条／8MiB界限；无当前证明走原完整查询，未关闭
缓存，普通打开文档cache绕过诊断的原保护仍通过。证明只读、不额外启动prepare，
所有检查均计入完整响应，其真实安装SDK成本尚未资格化。
相同disk引用也接回原coalescer：读源与执行共享，但各client独立取消；工作区变更
撤销全部旧请求，新查询完整恢复，不增加语义并发或跨批保留compiler对象。
当前二十八完整相关文件313/313，只关闭这些功能／正确性缺口，不替代新whole、
所有压力／配置场景或正式性能门禁。下一项回到完整SDK下实际成本和重复冷准备；
可研究预算内减少重复完整准备的有界批次编排，但未验证前不改默认64、不扩大
1024MiB／并发、不省SDK或scope、不跨批保留LS／AST，须保留完整oracle和资源对照。
不能靠基准先didOpen或内部伪造overlay隐藏失败；该缺口不只留OP-06重复报错，
也不冻结其它优化切片。详见[最新TDD记录](../tdd/op03a-completion-diagnostic-priority.md)。

阶段验收：繁忙诊断期间真实查询的等待反例 GREEN，后台任务可取消并有界结算；
连续编辑后的最新诊断 code/range/version 完整，队列无永久饥饿。显式准备、普通
query 和 status 各有正负例；无通知依赖／配置变更、缺必要输入、编辑新代、
驱逐及取消不能沿用旧 ready。所有编辑追赶／认证等待计入当前完整响应，不能
移到发送前等待或恢复为首次准备豁免。

### OP-03b Zed 准备与可见状态

2026-10-14接口核验已启动。先用Context7官方文档，再补读锁定版本的
[Extension接口](https://docs.rs/zed_extension_api/0.7.0/zed_extension_api/trait.Extension.html)、
[Worktree接口](https://docs.rs/zed_extension_api/0.7.0/zed_extension_api/struct.Worktree.html)与
[API源码](https://docs.rs/zed_extension_api/0.7.0/src/zed_extension_api/extension_api.rs.html)。
0.7.0提供启动、配置和展示钩子；从其19个Extension方法、5个Worktree方法及
lsp类型导出推断：没有支持的通用LSP连接请求/进度回调入口，不能假设扩展可
直接调用现有readiness连接，也不能把安装状态当semantic READY。先评估server
拥有的标准进度方案；自定义公开契约扩展仍须独立ADR，不另起第二个LS代替。
本机Zed1.23.3/build20261012.135353存在，但安装server SHAaec84852与当前
e832f9b6不同；真实验证须绑定当前候选并隔离用户安装/运行实例。证据
`.bench/op03b-zed-sdk-interface-audit-v1.json` SHA
bedd425ba7a3c53cb9c00f8f187bd5ca36474c08951b824ed1d438fdbcd5d765。
这里只完成接口与安装身份研究，尚无实际Zed请求/显示/取消转录，不授予体验PASS。

2026-10-16追加只读核查：Context7连接失败后转官方CLI文档、锁定0.7.0 API和
[v1.23.3路径源码](https://raw.githubusercontent.com/zed-industries/zed/v1.23.3/crates/paths/src/paths.rs)。
本机CLI真实`--help/--version`确认1.23.3；[CLI的new](https://zed.dev/docs/reference/cli)
只声明新workspace/window，不证明独立进程。该tag源码将custom data用于config/
extensions/db，但macOS的logs/state/cache仍有home-derived路径；这是源码推断，
不是已观察到的客户端隔离或安装二进制等同源码的证明。当前用户安装server仍
aec84852且是旧单bundle布局，不等于候选server9ae12f90／当前Worker；不能借其
结果认证新head。完整只读receipt在
`.bench/op03b-zed-isolation-readonly-v1/research.json`，SHA238fc71d；最初误假设旧包
存在split-Worker文件的ENOENT也保留。没有启动编辑器或修改用户安装/配置。
后续实际验证须绑定全部当前产物，确认真实PID/argv/配置/扩展路径及独立协议
转录，不截断或混用用户共享Zed.log。自动/手动触发策略尚未采纳；不阻塞server
已有READY刷新与输入缺口的推进，也不将CLI/help和研究当OP03b体验验收。

先验证仓库锁定的扩展接口是否支持自定义请求／进度；实施时查官方当前文档。
支持则复用 `arkts/semanticReadiness` 和现有 work-done progress，按根去重、可取消、
正确失效，并区分 catalog-ready、semantic-updating、READY 与 DEGRADED。
若只能启动进程，则评估 server 标准协议进度接线，记录具体限制与方案。
现有[架构约束](../architecture.md)把 Zed 定位为只依赖稳定 CLI 的薄适配器。
如接入自定义 readiness 请求需要扩展该公开契约，先以独立 ADR 明确允许的
协议边界，再实施接线；不得让客户端依赖 owner、缓存或 Worker 内部结构。

阶段验收：可用 Zed 环境中有真实请求／进度／取消记录，编辑后的新输入状态正确，
未打开目标随后完整可查询，正常诊断保留；不得用客户端 API 假设或只测启动命令
宣布体验完成。客户端接线不豁免 server ready／资源／时延门禁。

### 2026-10-24 真实 Zed UI 问题待办

以下为2026-10-24诊断状态，后续实现进展逐项补记；[跨平台原因与覆盖审计](../reports/2026-10-24-zed-cross-platform-causes-and-coverage.md)
关联[原 Windows UI 证据](../reports/2026-10-24-windows-zed-ui-validation.md)。不是 Mac 无问题：旧普通三轮只有45条定义，
且原始协议已有与 Windows 相同的源码诊断；新 Mac/Windows 公开接口复现也一致。

- [x] **ZUI-01（候选修复与目标UI验收完成）**：审查补全详情的生命周期与错误分类。关闭后句柄删除、无关 mutation 使在途结果失效分别覆盖；
  后者已证 supervisor content-modified → runner null fallback → resolve -32602，同一未删除句柄随后又成功。
  保留真实取消、新鲜度与陈旧 edits 拒绝；不能以吞错或重建 Worker 处理普通失效。
  2026-10-25：已按 [ADR 0022](../adr/0022-completion-resolution-lifecycle.md) 实现；
  过期签发项安全返回原始条目，512项淘汰亦不误报，禁止旧自动导入编辑，保留取消/伪造/输入未证明/后端故障的独立错误。
  完整fast 2,035/2,035、Mac/Windows 公开生命周期及 Photos 三轮通过，见[修复报告与原始证据](../reports/2026-10-25-completion-resolve-lifecycle.md)。
  前次三次真实UI复测在首个F6前被前台保护拦住，第三次前台为Edge；保留当时失败证据。
  后续已完成[实际前台验收](../reports/2026-10-25-windows-zed-foreground-acceptance.md)：243条详情零错误，
  含39条关闭后晚到、11条目标不变的无关mutation交错；6次编辑接受和实际跳转均正确。
  本勾选只表示候选修复及目标场景验收；日常安装未更新。500ms未达标，关窗/受控清理有3条Zed日志另列，未宣称全部UI问题解决。
- [ ] **ZUI-02**：补真实 Zed 能力协商验收。实际 client 不声明 failureHandling，当前服务因此不广告 renameProvider；
  两端仅增加一个 textOnlyTransactional 字段的对照会广告。兼容方案须先审查安全合同，不直接删除事务前提。
- [ ] **ZUI-03（继续暂缓）**：将引用视图 open/close 纳入既有 OP-04 缓存 TODO 的后续评估。
  Mac 控制场同快照重复约2ms，目标不变而其他视图文件开关后743.887ms且miss；编辑后首查581.473ms。
  Windows UI 编辑后首查中位4146.941ms、最大4620.979ms；内部差额未测，不启动缓存优化。
- [ ] **ZUI-04**：明确初始化期间到达的前台查询与初始化后热态的验收口径。
  新 Mac 冷定义23222.927ms；Windows id6的34523.123ms中，33153ms区间位于初始化终态之前。
  普通请求等待共享初始化 Promise；SDK/Program/checker等内部独占比例未测，500ms目标未解决。
- [ ] **ZUI-05**：补真实 SDK 资格与协议诊断验收。userFileManager缺失造成2307/degraded；
  两端声明版SDK还缺少ets-loader/tsconfig，ets.components未加载。仅内存补传现有128组件名可消除相同源码的1005/1128。
  原 Mac 三轮也已有2307/1005/1128/2304，不能只看日志级别/RPC error而漏列publishDiagnostics，也不能把phase=complete当READY。
  2026-10-25：按 [ADR 0021](../adr/0021-sdk-input-quality-and-service-availability.md) 分离 SDK 输入质量与服务可用性；
  工作树已实现 SDK partial、官方 runtime globals 加载、组件元数据回退及部分 loader 选项的中性默认值。
  Mac/Windows 公开回归验证局部 SDK 缺项不连锁阻断健康查询，并覆盖显式补桩/SDK 更新后的同会话恢复。
  未补齐的声明仍保留真实诊断；完整 READY 证明、实际 Zed UI 后续验收及性能目标不得据此宣称完成。
  证据与最终检查状态见 [SDK 分层报告](../reports/2026-10-25-sdk-input-quality-and-availability.md)。
  最终固定候选：`pnpm check:fast` 2,028/2,028、Windows SDK 10/10、Mac 实际 SDK 11/11 通过；
  实际 Photos 的组件 height 与定时器跳转/补全通过，SDK 缺项仍保留为 partial；未替换日常 Zed 安装。

证据根 `.bench/windows-ui-cause-20261024/`；正常与只读观测分开，逐次请求和健康对照保留。
GitHub外发记录被自动审批拒绝，已改为本地待办/报告持久化；未重试、未对外发布。
以上登记不恢复暂停的缓存/索引路线，不修改新鲜度合同，不授权发布或合并；455文件冷目录3秒门槛仍按用户授权排除。

## OP-04 有界增量快照与编辑失效

状态：IN_PROGRESS。依赖 OP-00 编辑解析／准备归因；对应 R-13/31，承接 L02。

- [ ] TODO（2026-10-23，用户决定暂缓）：后续再评估缓存失效范围与编辑后首次查引用优化，
  本轮不实施、不重跑性能测试、不执行合并。已确认根级引用答案缓存失效、无关语义组
  Host project version 推进、全局 Program 更新，以及 query/final 两轮全范围身份核验。
  Mac 隔离夹具 2048 个活动项目源码、每类三轮的首查中位数基线：局部编辑约 **1.43s**、
  无关组编辑约 **1.39s**、import 变化约 **1.99s**、配置变化约 **3.47s**；仍超过500ms目标。
  具体测量合同、调用链和限制见[路径修复与缓存失效报告](../reports/2026-10-22-path-fix-and-cache-invalidation.md)。
  原始证据：`.bench/20261022-path-fix/invalidation/*-final*-2048/` 下的 `report.json`、
  `wire.ndjson`、`server.stderr.raw`、`probe-*.ndjson`；汇总见同证据根目录的
  `invalidation-summary.json`、`invalidation-phases.json`、`invalidation-operations.csv`，
  执行顺序与命令见 `invalidation-matrix-final-ledger.json`。

2026-10-25补充诊断，优化仍暂缓：Windows真实Zed编辑后的3999.476ms补全，
其中3799.583ms为父队列等待、197.404ms为发给Worker至响应；前序真实客户端取消打断同步，
安全退役内部LanguageService后，诊断重新构建Program/checker，完整任务耗时3074.037ms。
该诊断中172/174项目SourceFile、279/279 SDK SourceFile复用，不能把AST复用等同于保留语义状态。
证据、取消恢复与调度的独立缺口见[编辑后补全耗时拆解](../reports/2026-10-25-edited-completion-latency-breakdown.md)。
此次只取证记录，没有恢复缓存优化或修改产品代码。

随后用户授权参照主流实现解决该补全问题，按[ADR0023](../adr/0023-completion-cancellation-and-synchronization.md)
实施“已开始的原地Program同步安全完成＋一次有界补全优先”。这不修改根级引用结果缓存的失效合同，
上述引用缓存/Host版本/全范围核验TODO继续暂停。
阶段观测显示取消构建能正常返回，未再出现此前约3秒的重建峰值，但仍有补全超过500ms；
普通对照及最终检查状态以[实施报告](../reports/2026-10-25-completion-shared-preparation-and-priority.md)为准。
最终本切片完整fast2039/2039、Windows相关50/50通过；普通6条补全中位647.820ms、最大807.603ms，
4/6仍超500ms。同步取消/排队缺口的修复不等同于OP-04或L08完成，缓存TODO仍暂停。

2026-10-15 Snapshot默认推广决策已REJECTED／收口，缺省／0完整解析、显式1
实验保留。当前原十完整表征63/63；同0fb92f3e正常trace-off／完整SDK，冻结
OFF100→ON100→ON100→OFF100，共408完整定义／404当前诊断逐字段相同。
正序编辑RPC P95 OFF2002.8／ON1984.5ms，反序OFF1275.3／ON2011.7ms；
合并OFF1958.2／ON1996.2ms，RSS峰值正序略降、反序上升，idle占用混合。
这不是稳定净收益，不能只取正序或缓存值采纳；不是正式P95/PSS或API版本门槛。
按候选回退规则，只取消未采纳Snapshot的缺省开启，六项ADR0015默认及overlay-sync0
不变。公开RED证明default仍走增量；最小改动后14用例及十三完整相关文件79/79
通过，真实AST重用／八代range等断言迁至显式1，默认0／完整payload另有直接保护。
当前source1ab95acd与测量source0fb92f3e分开；新whole1795/1795已通过，不把候选决策当整个
OP04完成。后续推进未知／在途输入、独立磁盘细粒度delta与一般配置合同，或基于
新的不同假说提出独立切片；不重跑当前候选追求有利值，不重开已拒S05。

[有界Snapshot首切片](../tdd/op04-versioned-overlay-snapshot.md)公开RED→GREEN，
script-record责任提取及strict/build通过。真实compiler接受精确UTF-16 delta、
新SourceFile复用2/4未变语句（OFF0）；八个numeric范围，不保存旧全文/AST。
连续/跳跃/历史淘汰、插入删除/API/语法错误/撤销、close/reopen及diskless/
同内容晋升、resident GC、真实L3/SDK/restart、积压并行查询、磁盘权威/target
双向切换十三个直接用例通过；
历史工作树候选曾缺省/1、0回退；当前默认推广REJECTED，缺省／0完整解析、显式1保留。
冻结十五文件140项137 PASS／3 FAIL、exit1，前后身份一致：403含声明首次20s、
继承补全5s、struct定义5s超时。有限同构建OFF/ON诊断两边0/3，不能唯一归因
开关或诊断等待；当前source9cbb9a1b与前序分开。两次独立冷CPU观察在5s内
正确返回，但Host同步约3.3s、解析约1.5s、模块解析约1.2s的嵌套成本仍在；
不能用单次PASS覆盖原失败。采集器逐版诊断屏障公开RED→GREEN，缺通知即停且
保留未执行分母；strict及冻结七文件86/86通过，生产身份未变。
完成预声明OFF→ON→ON→OFF各100真实Settings编辑：408查询/404诊断完整，
两方向整份payload相等，raw仍DEGRADED/FAIL。合并RPC P95约2911/2893ms，
正反序收益不一致，ON两组idle RSS约886/901MiB、OFF417/411MiB，原数据保留。
独立同输入OFF100/ON100诊断206查询/202诊断相等、context9不变且无trim/evict/
create；GC后Worker live heap199.4/199.9MiB，支持垃圾/heap容量与收集时点解释，
不支持大量持续保留的结论，不能推广到全部生命周期。正常计时不强制GC，
不是PSS或正式SLO；raw仍DEGRADED，未完成采纳。新冻结九文件59/59、exit0，
所有pins不变；公共fixture提取后新十文件62/62、exit0、179952.963809ms。
target表征按既有工程补全和当前诊断范围分别保护，不增加全根诊断支持。
三个原期限用例已在18449053/ef30254b整轮通过，历史超时仍保留；这不证明
Snapshot的独占收益或原失败的唯一原因。
2026-10-13新增显式default-off暖owner相邻overlay同步实验，消费原lease/上下文，
重新观察当前native Program，再作完整前后证明；不是默认采纳或第二个owner。
公开冷owner、版本跳跃、实际L3、关闭重开保护通过。未通知磁盘+overlay反例
确实漏引用，两边开关均FAIL；最小store-owned磁盘身份前后fence修复后20/20，
合法索引缩小/语义单元合同保持。强制全scope首修的2项兼容失败原样保留，
该实现已撤回；证据见OP-04 TDD。新source d6d525cf，不能借用C2工具whole1663。
同source正常trace-off真实对照已24/24请求、16诊断及整份payload相等，独立audit
PASS：编辑5.56–5.97s→2.12–2.25s，ON峰值RSS较低但idle较高，仍DEGRADED，
不据此采纳；[完整记录](../reports/2026-10-13-op04-warm-overlay-reference-comparison.md)。
随后四组各100引用增删已416/416 exact、408诊断及两方向完整payload相等。
短收益未持续：ON只有前11/10次<3s，两个100组P95较各自OFF更高；第三组
RSS因墙钟倒序FAIL保留，第四组原NOT_RUN恢复后只补执行一次，未重跑前三组。
末组隔约12小时，全部当候选控制而非正式SLO；独立审计功能PASS/资源FAIL。
实验不默认采纳。随后固定15编辑独立trace已19/19 exact、17完整当前诊断：
实际L2 trim后第12编辑level2 miss，随后L3驱逐，context2–4 inputs-incomplete
并各L3驱逐，RPC约1.9s退回5.0–5.2s；原始身份/完整oracle/raw审计PASS。
仅证明本窗口链，不当所有慢值唯一原因或GC/PSS释放。未来RSS单调采集公开
RED/GREEN及九文件97/97已过，旧墙钟倒序FAIL保留。下一步OP-05资格/恢复
净成本、其它未知/在途编辑窗口、磁盘细粒度失效/一般配置
组合、实际净成本审计和新完整GREEN；不重跑至偶然通过。

先表征当前 ordinary overlay、同内容晋升、保存／磁盘通知、close/reopen、
API/import、创建／删除、配置／SDK/target 与未知 delta 的行为。区分 LS context
销毁、Program 换代、SourceFile 重用和单文件重解析，不以 Program identity 不变
作为编辑验收，也不靠再次开启已拒绝的旧 S05 sessionReuse 来解释收益。

在现有 Script 权威中实现有界版本化 Snapshot。仅已知祖先版本且能准确合并
变化范围时提供 change range；未知／跳跃／淘汰历史返回未证明状态，保留 compiler
完整解析。记录版本链容量与保留字节，避免每次编辑留住全文件和旧 AST。
磁盘 delta 的细粒度失效另做独立切片；推断导出类型、全局影响和未知依赖仍保守
扩大失效，不能以“只改函数体”或“签名文字未变”证明不影响其它模块。

阶段验收：插入／删除、引用增删、UTF-16、连续编辑／撤销、跳跃版本、语法错误、
同内容晋升、diskless overlay、关闭再开、缓存淘汰和压力恢复均与无增量完整
oracle 一致；最新诊断和完整 capability payload 保持。可信 delta 实际减少
解析／准备工作，版本链容量可停止增长；同时报告 ≥100 次交替编辑的时延和资源。
若假说被反驳，保留表征和失败证据、回退候选；不把最终 550 ms 设为阶段前置。

## OP-05 回收与恢复成本校准

状态：IN_PROGRESS。使用 OP-00 的生命周期基线及已完成切片的新构建；对应 R-03/32。

输入现已包括OP-00实际timer→L2 trim/recycle、六个verifier冷getProgram4.47–4.77s，
以及OP-04独立有界L2/L3→暖资格丢失→约5s回退链。先固定当前构建做≥100
交替任务/编辑/压力和10k/100k原工作流的成本校准；该归因不等于政策已优化。
记录真实当前压力、lease/contexts、完整恢复结果/最新诊断、Registry与物理
资源各自证据，缺测不推断零。沿用原1024MiB/滞回/owner；不放宽回收换速度。
首批[固定校准](../tdd/op05-recovery-cost-calibration.md)复用当前d6及真实单调RSS工具，
100原Settings增删编辑、每10次一次显式L3恢复，计划114查询/102当前诊断/
10控制；trace-only，六默认/full SDK/正常诊断和原期限不变，实验overlay-sync关闭。
实际驱逐见证按身份去重，不伪称100驱逐或正式P95；未执行/失败全部保留。
该首批不完成反序政策、规模工作流、native Registry/GC/PSS或整个OP-05。
随后首批已真实终态114/114 exact、102份完整当前诊断与同source正常控制相等，
10个恢复RPC均有独立lease0驱逐见证，全部输入/raw独立audit PASS；无blocked。
恢复仍4.89–5.38s，Node观测峰值1229MiB；5605真实单调RSS样本核对PASS只表示
内部一致。原CLI1/FAIL/DEGRADED保留，不授予ready/P95/PSS或阶段DONE，继续原范围。
规模工具的实际SDK身份错记已公开RED→GREEN，完整product-gate9/9，生产d6不变。
下一批固定原10k/100k各cold3/warm10/stress5；冻结全部夹具和源码/产物/SDK，
只作原工作流与RSS开发校准。现有CLI的成员数量/label检查不是完整oracle/最新
诊断证据，阶段剩余精确性和生命周期合同仍须补齐，当前whole30FAIL也未消除。
该两组已真实终态：36/36会话、10/10压力后补全、目录完整、两CLI exit0，
全部源码/产物/SDK及夹具字节独立audit PASS；不是完整oracle/资源释放毕业。
原peak RSS410.62/587.88MiB，暖尾值381.29/573.46MiB、增长比1.504；恢复
3.42–3.69s，不隐去增长或慢值，也不把RSS当PSS。100k中途保留的累计日志含
77个ok查询、5个实际Worker恢复；native指标仅覆盖后10会话，缺测保留。
详见OP-05 TDD。下一切片补规模工具的完整结果/当前诊断/raw/实际退出留存，
继续资格/成本排序与固定反序校准、其它能力和Registry/CPU/GC，不重跑至偶然通过。
成功响应留存首切片已公开RED→GREEN：逐条原生id/result与文档版本、控制回执
进入报告，生成成员完整definition/reference位置公开重比通过，相关四文件42/42。
原规模报告仍归旧工具，不借格式升级改变资格或追加采样；下一项补请求params/
独立oracle绑定、当前诊断/raw/退出及失败尾部，最新whole30FAIL与全部阶段范围保持。
实际params绑定与可选冻结oracle已公开RED→GREEN：真实SDK/全部夹具字节/目标
绑定，完整definition/inc-declaration references位置比较、八类矛盾拒绝，结束
再核输入和原oracle摘要；实际初始pin后变化的旧PASS反例与等价JSON顺序误拒
均修复并保留RED。相关四文件46/46及独立当前pins/repo/raw审计PASS，仅工具
资格化，completion完整oracle及诊断/raw RSS/退出/失败尾部仍未完成。旧规模
报告不重标，30个whole失败及全部阶段/最终门槛不变；详见OP-05 TDD。

已准入工作流的四类失败/退出和逐点资源留存进一步公开RED→GREEN：引用不匹配
保留原响应、真实退出与17个未执行会话；结束输入漂移保留18会话/82回执但仍
incomplete；真实native exit17不再因查询成功误报PASS；真实压力-32601回执完整
保存且不声称已施压。现在保存每个PID/启动身份/RSS/单调时钟及全部解析native
指标，峰尾值公开重算一致；不是PSS、GC-live或Registry释放证明。三个职责提取
均在GREEN保护下，当前四文件50/50、完整production/SDK/1655个repo字节与14批
原始终态独立audit PASS，生产d6/六默认/预算/期限不变，库存191未变。
详见OP-05 TDD。旧规模报告不升级或重跑，没有新whole GREEN，30FAIL继续保留。
下一项先补当前版本diagnostics、初始化/超时的已发请求和采样/后置指标失败的
完整留存，隔离未成功施压的stress尾值与postEviction汇总；然后做真实规模
精确性/生命周期与资格成本、固定反序政策校准。全阶段/最终范围不缩小。

随后五个公开纵向切片已推进：未成功施压尾值不进入postEviction；最终当前版本
3/4诊断完整留存，18会话与两个独立fresh正常诊断逐项相等；native指标缺失/
真正解析错误仍FAIL，但保留结果、诊断、退出、17未执行和完整UTF-8原文；
真实已发补全帧后SIGKILL的尝试不再丢失，记录原错误/耗时而不填伪响应。
完整四文件54/54，全部11批原始终态/完整SDK/production/1658个repo字节独立
audit PASS，测量源码原字节已封存；生产d6、默认/预算/期限及库存191不变。
这是工具资格化，不是全诊断oracle、内存收益/GC/PSS或新whole GREEN。
下一项先保护初始化、实际原期限超时、sampler错误及指标schema异常，再继续
真实规模完整结果/诊断/生命周期和回收资格/净成本、固定反序政策校准。
它们服务于同预算下保留成本、回收残余与恢复代价的平衡，不放宽回收换速度；
30个whole失败和完整OP-00–06/L08范围保持。详见OP-05 TDD的新检查点。

随后实际native ps退出失败、真正原30s超时、四种指标schema矛盾与初始化中断
均已公开RED→GREEN；保存真实样本/原文/请求/响应或错误、原期限与耗时、实际
退出和未执行尾部，缺测峰值不转零。完整四文件58/58、独立9批/完整SDK与
production/1660个repo字节audit PASS，原测量源码已封存；生产d6及所有默认/
预算/期限不变，仍只是工具资格化，没有新whole GREEN、内存收益或全异常毕业。
只读策略检查确认cost-aware排序只有至少两个未租用候选、全部正实际重建成本
且不相等时生效；单上下文基线不能资格化排序。下一项在现有公开流程中先
确认两个合格上下文的实际cost/lease/evict，再做同构建默认ON/显式costOFF
固定反序、完整结果/当前诊断/生命周期与资源对照，继续真实规模证据和恢复
净成本。最多两contexts/一个owner/1024MiB/滞回保持，不强制GC或放宽回收；
原30个whole失败及完整OP-00–06/L08范围不缩小。初始化原生错误响应/晚到帧
仍是未覆盖边界，不把当前保护冒充全部失败路径完成；详见OP-05 TDD。

完整API24 SDK的公开多根资格随后已取得实际双context正成本与lease0驱逐。
固定OFF→ON→ON→OFF四进程成本校准终态，60完整语义结果/16当前诊断相等，
全部原期限/源码/产物/SDK/夹具字节审计PASS；ON两次选择便宜context，显式L3
各释放一个后按原实际RSS停止，OFF两次仍LRU并各释放两个。固定被保留根的
容量恢复约477–482→50–55ms、L3恢复约2369–2424→27–28ms；两方向15语义RPC
合计降低13.81%/14.44%，仅trace-only本序列，不是正式P95或自然压力释放。
ON Node峰RSS612.62/630.84MiB、OFF561.51/621.27MiB，资源未见一致改善；
保留这项代价，现有默认策略不变。实际16个进程身份退出、1660源码原字节封存。
这是排序/滞回有限校准，不是整个OP-05；下一项继续真实10k/100k原工作流的
独立完整oracle（含completion）、当前诊断/生命周期及其它能力/Registry/CPU/
GC-live，修复当前whole30FAIL。不为格式重跑旧36会话，不提高预算/减成员/
关诊断/强制GC，完整阶段与最终550ms/PSS/平台门槛保持；详见OP-05 TDD。

完整补全oracle/原始运行日志随后已公开RED→GREEN，相关62/62、零skip与全部
SDK/产物/1663源码字节审计及源码封存PASS；仍生产d6、六默认/预算/期限不变。
独立原生API+声明事实构造v1/v3/v4完整预期，不复制待测LSP回答。实际新资格
批次10k原18会话全部完成，77完整语义结果/18当前诊断相等、5压力恢复成功；
暖补全仍约3.51s，恢复3.42–3.56s，RSS peak/暖尾398.89/384.94MiB，慢值保留。
100k只完成前两个cold，第三cold首次语义查询前FAIL，15会话未执行；8结果/
2诊断相等，但不能借旧18会话补齐。实际目录约41s就DEGRADED，CLI仍等
percentage100至原180s，源码确认该终态识别缺口；实际降级原因尚未证明。
新四进程正常诊断控制、85完整结果/20诊断/1345原始RSS与日志/全inputs独立
audit PASS仅表示完整性，functional PARTIAL、CLI1原样保留；42原进程身份退出。
该批当时的下一项是用快速公开stdio反例修复DEGRADED/end留存与空等，再查真实索引
状态请求/stall/提交/退出原因，依证据修复并补失败/未执行范围；不放宽期限、
改DEGRADED为READY或重跑成功范围。完整阶段/最终门槛及whole30FAIL保持，
没有新whole GREEN或合入，详见OP-05 TDD最新检查点。

2026-10-14最新补充：真实DEGRADED/end反例已RED→GREEN，目录终态版本相关
63/63、原SDK/产物/1664源码字节审计/封存通过；仍拒绝降级，不空等180s。
有限三次真实100k catalog-only均READY，未复现原失败，原降级根因仍未证明。
显式cold后缀与暖缓存连续性两个公开边界随后RED→GREEN，联合3/3（非whole）；
保留18项原计划、排除项和PARTIAL，禁止从warm/stress中途新缓存冒充原链路。
只补原cold2及后续15会话，16/16完成、69完整语义结果/16当前诊断/5压力恢复
全部exact；32实际进程身份退出，16 server0，sidecar2优雅/14既有有界SIGTERM
回退。原100k FAIL和前两cold、10k成功会话均不覆盖/重跑，不拼新同轮18/18。
peak/暖尾RSS600.77/568.61MiB；暖补全约5.03s，恢复4.78–5.04s，暖目录重建
90–106s，慢值保留。磁盘安全清理仅已结束专属冷缓存，原字节/回执保留；
已记环境干预，数据仅功能/生命周期诊断，不作受控性能比、PSS或最终P95。
独立audit SHA dc6e8f532740d421668679fdda1b6d4cab88af94434393e512c7c36d3f7efa0c，
详见OP-05 TDD。下一项定位暖目录/有界关闭净成本并补其它能力、Registry/CPU/
GC-live/≥100交替循环和whole30FAIL；六默认/原预算/期限与最终门槛不变。
起点版本没有新完整回归或whole GREEN，完整阶段及L08不据此毕业。

随后暖目录切片已取得原公共成本RED→GREEN。原100k目录轻量归因确认暖旧
数据删除49.86s是主要成本之一；FTS单独清理仍未通过原反例，结合原事务内
子表批量清理后通过，不减数据、改schema/预算或延长期限。旧代完整查询、
晚失败回滚/触发器恢复、后续增量刷新和重开保护通过，Rust存储包72/72、
公开相关12/12、严格Clippy/check/fmt及实际release构建通过。新sidecar8e9babc3
不混绑旧产物；综合audit SHA48cd0e79f4fef0ed68434a133881c08bf0e6a1147ad8aa2a3755491e75e9463f。
有限新100k冷/暖各一次全READY、均优雅exit0；暖SQL85.47→46.59s、目录
108.09→67.70s，而冷SQL相近但整体31.84→49.09s变慢，全部慢值和首候选FAIL
保留。只是有限成本切片，不是内存、PSS、正式P95或完整阶段毕业。
下一批优先处理当前whole30FAIL、取得当前源码完整回归，并归因SQL外冷成本；
其它能力/Registry/CPU/GC-live/≥100循环和客户端/最终矩阵继续按原合同推进。
原cold2降级根因仍未证明，六默认和最终550ms门限不变，详见OP-05 TDD。

随后当前整轮实际1697/1698、1 FAIL、exit1、零注解；原30失败项在该整轮
全部通过，期限未变，旧失败和未证明的唯一原因保留。独立audit SHA
b6156f4a5de0a1c9ee61b8e24f32873e1f78f7882a27654d87e708eafb40fd28。
唯一失败为自然L3用例末尾200ms空闲观察不足，不是前面的引用/诊断/驱逐失败。
两个公开CLI反例随后分别证明200ms idle和120ms驱逐后窗口会在timer提前时
过早结束；各自RED→单调deadline最小GREEN，不伪造时钟/RSS、放低时长或加预算。
七文件完整相关65/65，原自然L3/Worker回收/最新诊断/资源消费保护通过，slice
audit SHA2c5e3de74dbc2efa6998cb2a9460b75fdcafbaf326f88ecd7fd0b06aa942a8d3。
这是工具观察资格修复，不是产品时延/内存收益。下一步取得修复后fresh whole，
再推进SQL外冷成本及剩余原合同；原1697/1698 FAIL保持，不授予完整GREEN、
合入或OP-05/L08毕业，详见OP-05 TDD最新检查点。

观察窗口修复后fresh whole实际1699/1700、1 FAIL、exit1、零注解，两个窗口、
原自然L3和旧30失败项全通过；唯一新auto-import首次completion为-32803。
终态audit SHAe7349cbcead826a6d6b5320dc03c85b170427c6e8a80afcb221749d14f03d624。
固定六单例与原完整19/19未复现，原唯一原因NOT_PROVEN。1000ms目录提交控制
只证明另一个弱测试前置条件：缓存搜索可用不等于已提交目录，实际完整fallback
25根不能被当宣称的ready两根。150/300/450ms控制均PASS，不伪装原原因已定位。
该case在GREEN保护下独立提取，1777→1606行债保留、新文件192行，精确库存
192/87-bundle；公开前置条件RED→真实标准目录终态GREEN、完整相关26/26。
slice audit SHA835e41f32da867029945bd8cd564509276cbd9f599858d31726101c8cedcd51d。
仅测试准备证明/失败stderr留存，生产代码、完整fallback和原期限/六默认不变。
下一步运行当前fresh whole并继续原输入拒绝/SQL外成本和剩余合同；原1699/1700
FAIL保留，不靠孤立PASS或该不同反例授予原-32803修复、wholeGREEN或阶段毕业。

在六项默认策略下比较初始准备、热查询、编辑、实际 L2/L3、空闲、重复驱逐和
故障恢复。保留已修复的 journal-overflow recovery、多根最新文本、version0 staging
及旧 epoch 隔离合同。量化 resident／transient 重叠、准备成本、驱逐原因、Registry
引用、CPU 时间、GC 后 live heap 与 Node PID RSS；Worker threads 不重复加到 RSS。
GC 探针只用于独立归因，正常计时不强制 GC。

优先校准回收资格、滞回与成本排序；更轻的 trim 候选先保护旧 Registry 反例和
lease，证明确实释放后再比较重建代价。现行 1024 MiB 是政策值，不能宣称为硬
RSS 上限。预算提高、删合法工程成员、关闭诊断不作为本轮优化手段。

阶段验收：同构建反序对照、≥100 交替任务／编辑／压力循环和复用现有 10k/100k
fixture 的工作流都有完整结果、最新诊断与生命周期证据；释放残余、峰值、尾值、
增长趋势、恢复时间和拒绝／超时全部记录。所选政策的正确性、lease、取消和恢复
公开合同 GREEN；收益缺乏证据时保留当前政策。最终 PSS/DevEco、比例及550 ms
仍在 OP-06，不以放松回收或缓存隐形状态换通过。

## OP-06 最终验收工具与 L08 完成审计

状态：IN_PROGRESS。功能接线与各切片状态可分别收口；最终毕业使用冻结后的产品。
对应 R-21/22/34，沿用[验收规范](../benchmarks/semantic-ready-acceptance.md)、
[原内存协议](../benchmarks/product-gate.md)和[机器矩阵](../../config/semantic-release-matrix.json)。

本地2026-10-16实际restart首切片：两个source入口、混合查询／两次重启、未保存
目标编辑／版本重放，以及跨进程缓存历史隔离、重复首查拒绝、逐进程READY/RSS
消费、原始资源缺失、最终非零退出、后置校验失败的前缀／尾项保护均已公开验证。
19完整相关文件171/171、零注解；独立原生两入口各一次，audit0b95855d。原报告仍
FAIL、正式消费仍BLOCKED，RSS不是PSS／物理释放；productiona6ae3b97和默认／预算未改。
这是definition/typeDefinition机制资格，不是全部restart能力／异常／安装SDK资格。
下一项补completion resolve／call follow-up新会话来源与旧句柄拒绝、配置／取消／
压力边界及真实工程，再继续全证据PASS路径、336格／100请求／5会话／100循环。
命令、原始失败、完整SHA及资源限制见[OP-06证据](../tdd/op06-release-sample-evidence.md)。

后续本地2026-10-15：[产品内存对照消费](../tdd/op06-product-memory-comparison.md)
公开RED→GREEN，复用原全部阈值/3-10-5流程/身份校验；新memory-comparison入口
重读原文件，绑定SDK/当前构建/flags/选定策略，缺文件仍保留query行。
给定proc原文按PID/角色/数值/读取时钟重算，合法记录仅内部一致PASS；统计
配方、采样覆盖和真实产品scope未验，comparison仍BLOCKED，不能当Linux实测。
七文件75/75、零注解、source/SDK不变，audit SHA
443fb2ab083e52bf5d4a4f874942b1647f1ca2b5cbf8cf9e4232ec2ce4568aaf。
原whole9FAIL不改；继续真实scope/统计/覆盖/OOM、native生命周期/Registry/100循环、
平台/真实客户端/DevEco-PSS、完整正例与336格及全部OP-00–05合同/采纳审计。
不提高预算，不把合成记录或工具GREEN当产品毕业，也不重跑原规模对照追求有利值。

最新本地2026-10-15：首轮真实公开collector已终态1727项1718 PASS/9 FAIL，
exit1、零注解、所有source/SDK/产物身份稳定，真实PID退出；独立证据audit SHA
8b986396ef17f9628fcd792ee7ea4aba93d8e069050db77d3a7a5bf253c61471，
不把完整性PASS当实际回归PASS。随后原始RSS文件留存与hash/长度/全部JSONL
绑定公开RED→GREEN、落回项目，七文件73/73、零注解、身份稳定；旧报告明确
未绑定，仍不是PSS。原失败五文件有限24/24未复现，原9FAIL与所有历史失败保留。
详见[资源文件TDD](../tdd/op06-raw-resource-artifact.md)，相关audit SHA
ad449f9816f9250bbf13859acb86d4c1653033f9dfc5d3d13d510abfb3b12abf。
下一步建立原失败快速反馈环及归因，不调期限/开关、不重跑整轮碰运气；继续
原资源覆盖/OOM、native生命周期/Registry/≥100循环、产品workflow/平台、
独立DevEco-PSS、全证据releaseEligible=true正例和336格。六项默认/1024预算/
单owner不变；没有新whole GREEN、合入或OP-06/L08毕业，不阻塞OP-00–05。

最新2026-10-14：补齐同平台/构建完整回归receipt的首次消费，公开CLI
`--regression-state`重读实际终态log/source archive，校验完整fast入口、原exit/
根计数、当前代码库存与全部构建/SDK身份；旧/过期/缺失/重复/矛盾证据拒绝。
单平台PASS不能充作其它平台，合成三平台正例只验证工具；通用采集接线及
全证据releaseEligible=true仍未完。新增测试与Node根退出/报告失败诊断相关
九文件119/119、零注解、身份稳定；原默认sandbox103/119权限FAIL保留。
audit SHA313dc8c476da34eb8f9c3fc3788efc825aba53f94c8d562291cab4278878cc4d，
详见[OP-06 TDD](../tdd/op06-release-sample-evidence.md#2026-10-14当前构建完整回归证据消费)。
此前auto-import修复后的整轮实际exit1且无最终根总计，counts=null，不能判
1700/1700或整轮GREEN；旧失败/原原因NOT_PROVEN及磁盘382MiB风险都保留。
仅清理本任务已关闭可重建cache607686656字节，原日志/源码/fixture不删除。
下一步当前工具新完整check:fast，然后继续原外部资源/生命周期/平台/DevEco-PSS/
100循环和最终矩阵；不以该最终门禁阻塞OP-00–05，不改原550ms/内存合同。

随后该freshwhole完整终态1711/1712、1 FAIL、exit1、零注解，所有身份稳定，
已跨之前异常退出位置。唯一FAIL为资源用例把异步OS读开始时间当快照时刻；
旧额外PID命令/原完整时序未保留，唯一原因NOT_PROVEN。固定单跑PASS保留，
不宣称修复。两个真实跨任务快照反例RED→真实读取完成时间GREEN；原窗内≥1/
无builder子进程断言及全部raw/peak/tail保留，结束字段损坏另立RED→GREEN。
新七文件63/63、零注解、身份稳定，audit SHA
7b3caf5fe7245973c14b7921906087b0a5c4ae7421a46352c95add40964f8724；
详见[OP-00采样资格](../tdd/op00-query-layer-attribution.md#2026-10-14异步os采样的完整读取区间)。
不是内存/时延收益；原1711/1712FAIL保留，当前新whole未跑，不能合入。
继续通用采集和全部原资源/生命周期/客户端/平台/最终矩阵，不缩范围或加预算。

最新本地2026-10-15：通用完整回归采集公开入口已接线，固定check:fast，实际
child close/退出、原始log/source、前后构建/SDK和完整fast选择都封存。
SDK/源码复查失败也留下TERMINAL，缺log/根总计不补造，启动器漂移/0执行/原生
失败拒绝；实际collector→消费端发现输入指纹算法与生产不一致，已沿既有规则
修复、未删检查。九文件相关100/100、零注解、身份稳定；原fake数据仅验证工具，
原错误互操作及spawn-red-v1源码漂移记录保留。
详见[公开采集TDD](../tdd/op06-retained-regression-collector.md)，audit SHA
4d7a73e56602981677bf05ab9998f5dfa0432527fbd3242e8153b979e1a760c3。
下一步用该命令启动当前修复后实际whole，随后继续全部原资源/生命周期/平台/
DevEco-PSS/≥100循环和336格。原1711/1712FAIL不覆盖，无产品毕业、不能提前合入。

首个[逐请求证据切片](../tdd/op06-release-sample-evidence.md)完成公开RED→GREEN：
重叠尝试拒绝、计划未执行判FAIL、混构建BLOCKED、target绑定、完整payload／
引用位置重新比较，缺完整oracle不授予PASS；collector归档完整expectedLocations。
20/20工具保护及冻结七文件81/81通过，含真实compiler五进程100次repeat正例；
原控制器字段路径错误与真实child exit0均保留，独立终态身份审计PASS。
生产仍eae466b5，未改变预算／默认策略。该slice不完成资源／生命周期／平台／
DevEco/PSS／全能力回归消费，尚无全证据releaseEligible=true正例；
原整轮超时不据此修复，当前新whole也未运行，OP-06／L08不标DONE。

2026-10-13补充原始RSS消费的三项公开RED→GREEN：摘要peak、采样失败和
实际gap摘要不能被忽略；矛盾会话保留完整结果并明确FAIL。原矩阵/库存及
边界表征30/30、exit0、全部身份稳定，生产C2未变。合法RSS只能证明记录内部
一致，memory仍BLOCKED，不能当PSS、RSS硬上限或释放/峰值毕业证据。
八文件真实collector回归87/87、exit0，五进程100repeat的真实RSS核对正例通过，
所有前后身份一致；仍不是Settings产品P95/PSS。最新工具head whole1663/1663、
exit0、零注解，全部production/SDK/repo身份与独立audit一致；详见OP-06 TDD。
全证据正例、原始文件/范围
绑定、OOM、生命周期/soak、平台与DevEco/PSS未由该补充完成。

后续真实墙钟回拨反例已公开RED→GREEN：新sampler独立记录进程内monotonicMs，
报告明确clock、消费者重算间隔并保留原UTC/raw；旧格式仍严格拒绝倒序。
缺失/混用/恶意clock或损坏样本继续FAIL且保留成功查询行。九文件97/97 GREEN，
包含真实回拨collector和五实际compiler进程100repeat；v1错误字段测试FAIL保留。
仅内部RSS一致性，不是PSS/完整release正例；当前d6生产与新工具fresh whole
仍需运行，不借用C2旧1663，详见OP-06 TDD。

先完成现有 fail-closed evaluator：消费逐请求真实 ready receipt、完整结果、
时延分桶、环境／构建身份、资源／生命周期／平台证据、独立 DevEco/PSS 与保留
能力完整回归；足证据全部 PASS 才能 `releaseEligible=true`／exit 0。
以公开 CLI RED/GREEN 证明全证据正例及缺失、矛盾、过期、重复、构建混采、
trace-only、错误、超时和不足样本负例。合成正例仅验证判定工具。

随后在默认组合开启、正常诊断、trace-off 的新构建执行产品矩阵：

- 14 个 capability 项 × 8 个正常场景桶 × 3 平台，共 336 格；每格 ≥100 请求、
  ≥5 独立会话，引用的两种声明策略独立，P95 ≤550 ms，500 ms 为目标。
- 零完整 payload/oracle 差异、零 partial-success、零 OOM；错误、拒绝、超时和
  取消单列，不能删除失败样本或用 cache 命中填新符号桶。
- 原内存门禁全部保留：DevEco steady/peak PSS 比 ≤0.75/0.85、100k/10k 比
  ≤1.25、post-eviction/initial-warm 比 ≤1.20、warm P95/baseline 比 ≤1.25；
  原 >3 GB references 复现及 ≥50% peak reduction 继续验证。
- ≥100 交替任务与编辑的 soak、全部受支持能力回归、Windows/macOS/Linux
  与原产品工作流完成；Mac RSS 独立报告，不能替代 Linux PSS。

本机可执行的真实查询、编辑、取消、readiness、压力恢复、规模与 RSS 先做；
缺少其它环境只影响对应证据。最终全部必需门禁 PASS 才标 L08 DONE，
工具 GREEN、main 已合入、单次快速响应或 Linux/Windows CI 不授予产品毕业。

## 下一执行批次

| 工作项 | 实施范围和验收产物 | 启动条件 |
| --- | --- | --- |
| OP-01 路由切片已收口 | ADOPT／DONE：保留完整驻留前移和独立0回退；原对照／保护已审计。编辑秒级／RSS无一致收益不改写 | 不追加有利采样、不等待550ms；最终效应留OP-06。当前72358623 whole1862/1862已独立审计；后续执行改动仍须新回归，远端交付须授权及分支PR |
| OP-00 补齐实际成本和生命周期 | 冷SDK准备及READY作用域缺口已定位；修正后两入口正常编辑中位约3.42→2.97s，RSS一对1.1595。存活owner见native lease0及L3自然GC回落，两个Program不等于两次SDK解析。后置认证候选虽消除公开重复冷建，反序RSS1.2450／1.2822而REJECTED并回退；转独立冷准备机制／复杂真实closure，不重采403／64/128／该候选 | 恢复72358623原字节、whole1862/1862仍有效；候选audit0a597d18／恢复4e744a73。原40编辑诊断34完成／2失败／4未执行、audit-v2 d8acb52e不覆盖。collector不与正常性能并发；RSS／Program令牌／PID退出不当PSS／物理释放 |
| OP-02 已收口／转交后续 | 纯hash和有界模块／目录组合ADOPT／DONE；SDK候选Map保持REJECTED。原直接输入保护与对照已审计；READY作用域修正由OP04负责，不扩大容量或重开候选 | 不增可选热点／有利重采；最终指标留OP-06。当前72358623 whole1862/1862通过；后续执行改动须新回归，远端交付须授权及分支PR |
| OP-03a 与 OP-04 分别推进 | 两入口14项基本oracle／proof交接／刷新及重复通知局部DONE保持。新ac4c136b修复在途依赖发布旧值：两入口／READY共3公开回归、十四完整文件96/96；固定8正常会话功能完整但RSS比较FAIL，新whole终态待取得。继续SDK准备、一般delta／未知在途／配置／复杂真实closure和恢复，不重开S05或已拒绝延后认证候选 | 首查／完整scope／返回前fence、取消／压力／全部出口清空不变；六默认／1024MiB／owner及32解析／32目录上限不变。RSS≤1.10假说未通过，资源门禁继续；Snapshot推广REJECTED、overlay-sync0，550/PSS不前置 |
| OP-06 证据消费继续接线 | 原restart／resolve/call来源176/176保留原身份，正式消费仍BLOCKED。72358623的64/64及48有限查询不是正式矩阵；继续其它restart／配置／取消／压力／真实工程、资源／生命周期／soak／平台／历史峰值及全证据PASS路径 | 当前whole1862/1862通过，audit8c5cc269；旧1858及FAIL不重标。RSS一对1.1595不删，不能授予PSS／净内存／全GREEN。DevEco不假定LSP，77/78及seed原因未定位；550ms不阻塞前序 |

当前72358623原完整回归已1862/1862、exit0，独立审计8c5cc269；不追加整轮
或原403／64/128有利重采。两入口真实编辑的READY作用域功能已局部收口，
固定正常对照中位约3.42→2.97s，但一对RSS高16%，净资源资格未通过。
存活owner切片现已区分native LS／Registry、live heap／自然GC和PID RSS，
手动L2／L3释放及恢复已见证，18次编辑后的真实自动L3保留READY撤销FAIL；
不是物理释放／PSS或≥100循环验收，不能把无GC的WeakRef存活当泄漏。
针对请求内驱逐再建的后置认证候选已完成公开RED／87相关／8正常会话，因反序
RSS超过比较假说而REJECTED，7个owned文件变化已精确回退并完整归档，不默认采纳。
下一切片转独立一般磁盘delta／未知在途、复杂真实closure及其它实际冷SDK准备机制；
先形成不同的可证伪公开反例／归因，再最小实现并独立验证正确性、输入／取消和资源。
不把已通过的重复通知、restart来源或统计护栏反复扩写为新的阶段目标。
九个既有超限文件均已缩短、无新增超限；完整清单见[OP04回归记录](../tdd/op04-versioned-overlay-snapshot.md#当前新构建完整回归终态)。
本地验证不扩大用户安装／配置或远端写入的授权；当前没有提交、推送或创建PR。

OP-03b 客户端接线和 OP-06 evaluator 可在独立条件满足时推进；OP-05
使用已冻结的新构建校准资源和恢复。队列的目标是同时减少等待、编辑准备
和驻留／transient 重叠成本，而不是把所有候选默认叠加后再尝试最终验收。

2026-10-16冷批次切片见[OP-00记录](../tdd/op00-query-layer-attribution.md)：
正常trace0完整client对照与独立trace1批次归因已封存；8次未进入服务端的
collector启动失败独立保留。不能把小样本约22s整套、2ms cache或RSS最大值
改写成550ms/P95/PSS通过。下一次候选资格只补真实工程/复杂依赖、完整结果、
编辑/取消/压力、两种source入口及预算合同，不重采同403寻优；128未采纳，
ADR0015六默认、默认batch64、1024MiB及ADR0003瞬态生命周期不变。

2026-10-16新增入口成本切片见[OP03a记录](../tdd/op03a-completion-diagnostic-priority.md)：
安装完整SDK的受控工程并非Settings。18进程每次只查询一个目标，两个入口每项
能力各3会话；definition中位511/448ms、引用约3.9–4.2s，准备另报、无目标预查询。
两次独立trace定位到resident证明inputs-changed与单批重复Program，而不是缺失
proxy根提示；该假说已证伪。下一步先公开RED区分未观察与实际签名项变化，
不得移除generation/完整scope/config/物理最终fence或把READY标签当复用许可证。
原1822/1824 FAIL、旧FAIL和新测试head whole缺口保留；各前序切片继续，不等待
最终550ms/PSS，也不据本批小样本默认推广128或授予L08 DONE。

同日后续：上述READY后首次引用已以真实公开RED区分普通proof未观察，并完成
最小同owner证明交接，保留所有原输入/完整scope/配置/最终物理fence。新生产
81d6e876、完整9文件75/75，auditac7407c4；新构建固定18个完整安装SDK进程，
两入口/能力各3会话，结果/同一READY/诊断/退出一致。打开调用方引用中位
229–230ms、never-didOpen源464–470ms，根准备仍4.14–5.52s；正常audit69d6dac6，
独立trace4f77a846确认原Program hit、无transient verifier/额外owner，覆盖不变。
旧基线与新18份最终report的FAIL均保留，不是最终P95/PSS或净资源资格。
本局部合同DONE后继续复杂真实closure/冷准备、磁盘delta/未知在途及压力资源，
不再对闭合语料寻优；当前head须原完整check:fast实际终态＋分支PR，不提前合main。
当前collector前缀`.bench/op03a-ready-proof-current-whole-v1/whole*`，只依实际
终态记录，不预报GREEN。最终550ms和全部产品门禁继续仅约束OP06/L08。

后续真实终态已1826/1826、exit0、零注解，3093552.887731ms，全部身份独立审计
1de2bf76；正式消费真实Mac收据与18报告，最终仍BLOCKED，audit70eca240。再新增
公开watched依赖编辑RED：完整3处引用正确，但原READY会话未刷新，根仍DEGRADED，
audit83952896。该时点只新增保护测试，生产81d6e876不变，新测试head RED不借前一
whole GREEN。下一最小修复引用READY刷新及其原完整保护；全过程不假造READY、
不弱化输入/最终物理fence、不让bounded resident-only隐式准备、不启旧实验。
详细原始命令/SHA/当前状态见[OP03a记录](../tdd/op03a-completion-diagnostic-priority.md)。

随后引用刷新最小实现及两入口／声明／缺输入恢复／编译器取消已完成，当前
88ad7e9b的9完整文件81/81、exit0，audit987689db；旧RED与旧whole原样保留。
安装完整SDK4独立编辑会话exact/current READY／诊断一致／正常退出，auditb5c51a6b；
编辑RPC3.51–4.00s、采样RSS508–566MiB，不作P95/PSS或A/B收益。两独立trace
auditffa33bbd确认每入口一次content-revision context替换、869完整输入检查、
普通owner compiler查询，无额外owner或transient批次。当前fresh whole NOT_RUN；
先补其它ordinary能力的磁盘编辑动态证明，再继续上述成本／资源与原完整队列。
这是局部引用合同DONE，不关闭OP03a/OP00–06/L08，也不启旧实验或提前合main。

再后续实际普通查询切片现已完成局部修复：definition、最新诊断先完成时的
意图传递、两入口outgoing follow-up分别公开RED→GREEN。首轮宽触发根准备
86/88 FAIL保留（audit07112a09）；原两个负例不改，收窄至必要context重建／
不完整loaded scope，最终9完整文件88/88、exit0、audit e4c7eaa1，生产a6ae3b97。
安装完整SDK两独立会话首次定义220/228ms、编辑后3.69/3.84s，采样RSS559/557MiB，
exact/current READY／诊断／退出通过（audit7becc0ca），非A/B/P95/PSS或正式矩阵。
完整记录见[OP03a](../tdd/op03a-completion-diagnostic-priority.md)。当前原完整collector
前缀`.bench/op03a-ordinary-ready-refresh-current-whole-v1/whole*`实际FAIL／exit1，
原日志有24处ENOSPC，最终Node测试子进程exit7且没有根摘要；counts=null，不把
11条已观察失败行当最终总数。独立审计23bd83d0确认1734份源码归档、206入口、
SDK／构建／启动器及实际退出一致；这是证据完整性通过，不是语义失败定位或
whole GREEN。先核验并回收本任务重复派生存储，再用新前缀运行不变的完整命令。
旧1826不覆盖本构建，合入仍须fresh whole＋分支PR。全余项保持。

## 交付和推进规则

执行顺序：OP-00 → OP-01/OP-02 → OP-03a/OP-04 → OP-05 → OP-06。
该顺序表达主队列，不新增整阶段完成屏障；实际前置以各切片声明的归因与合同为准。
OP-03b 和 OP-06 evaluator 接线可在独立条件满足时推进；没有性能收益的候选
以 REJECTED 收口，随后继续有证据的切片。OP 编号管理后续工作，不新增第二套
Ledger 或重开已完成的 L03–L07。

每个代码／工具切片一份小 PR：先记录父修订和公开 RED，最小 GREEN 后
保留 characterization、相关回归、真实同构建对照、完整命令和原始证据摘要。
合入前 `pnpm check:fast`；Rust 改动补 focused cargo tests 和相关 release build。
源、测试、脚本 ≤500 行，既有超限责任提取并记录，协议 stdout 保持专用。
新增实验候选的默认值与回退随 PR 明确；既有六项默认保持 ADR 0015 策略。

每次更新本计划切片状态及原 Ledger 对应 R-ID，保留 PASS/FAIL/BLOCKED/NOT_RUN
和 REJECTED 原因，更新受影响 ADR 的实际决定。DONE 只表示本切片合同与
交付审计通过，REJECTED 表示候选回退且结论收口，两者都不授予产品毕业。
最初研究审核本身不新增生产修改；随后按阶段合同推进已有 OP-00/01 与
OP-02实施。OP-00继续补证据、OP-01继续验证，OP-02输入指纹及fallback
新鲜度审计IN_PROGRESS，OP-03a独立队列与OP-06逐请求证据切片已开始；
OP-04有界Snapshot首切片已开始，OP-03b已开始接口核验、尚无真实客户端接线
验收；OP-05随后已启动固定资源校准。
下一步按上述批次推进，
历史whole1589/1601、1608/1610、1640/1642 FAIL均保留，不被孤立PASS覆盖。
最近ef30254b冻结whole1642/1643、1 FAIL、exit1，证据前缀
`.bench/op02-negative-owner-legacy-whole-v1*`，真实根退出、完整日志及全部
before/after身份一致；原两个输入失败与三个期限用例已在该整轮通过。
唯一source-root创建失败已原用例RED→最小模型重载GREEN，source c2a50003，
新20文件相关173/173、身份稳定；OP-00中断请求证据切片亦24/24 GREEN。
当前冻结whole已1648/1648、exit0、零skip/cancel/todo，source/产物/SDK/repo
前后身份一致；证据 `.bench/op02-source-root-model-reload-whole-v1*`，log SHA
862da85ca90f3274aea3bfc344c74fe7585fc4a4ec805c682a74a16fac5bcc4e。
当前代码回归GREEN，不借用PR #95的旧结果，也不授予L08毕业。
下一步独立补齐OP-00实际Program/SourceFile/Registry及生命周期归因、
OP-02剩余直接窗口和各候选采纳/回退；OP-03a/04/06继续按各自合同推进。

随后OP-00 official对象返回/时钟首切片29/29及真实三会话15/15已经通过。
新工具的fresh whole仍NOT_RUN；不改变生产c2a50003/六默认/1024MiB，不把旧
whole升级成新工具head结论。随后目标API/Registry收尾首切片31/31、新A15/15
通过；含声明A/B各三会话功能/计数30/30随后补齐。
下一切片继续B/嵌套Worker对象、正常资源与压力回收，
其它直接保护和候选审计保持原范围。

随后Worker native工具32/32与纠正后A/B30/30已完成，旧reportStats零持有解释
撤回，原始结果不改。下一切片按冷verifier getProgram证据验证驻留资格/回收
触发原因、parent exit与实际dispose尾部，不把功能或最后消息当物理释放。

本地2026-10-14新d6/单调RSS工具完整`check:fast`已经终态1643/1673、30 FAIL、
exit1/signal null、零skip/cancel/todo，全部前后源码/产物/SDK/仓库/归档身份一致。
`.bench/op04-op06-current-whole-v1*`，完整log与独立audit见OP-06 TDD。
原失败逐项分类为29原期限超时、1首次补全-32803（watched变更尚未发生）；
原首次补全用例独立一次PASS，不能宣称修复。midflight CPU speed limit42%、
swap7284.5MiB仅单次诊断观察，不当所有失败唯一原因。优先固定缩短前序及
实际加载输入窗口复现，依证据最小修复；不放宽期限或反复whole碰通过。
OP-04七个新guard及RSS工具在本整轮通过，不替代完整GREEN，不允许合入。
OP-05资格/恢复校准和OP-06全部未完目标继续，不用550ms/PSS阻塞前序切片。

最新2026-10-15生产成本切片见[OP-02目录存在性TDD](../tdd/op02-request-directory-presence.md)：
真实冷profile区分解析、加载身份与结束guard；公开60导入RED58次目录探测→
默认1/OFF120。同步query最多32目录/32K code units，既有32次解析容量、
完整load/end fences、六默认和1024MiB不变，无跨请求缓存或新owner。
七文件59/59、原五失败文件一次24/24；原57/59、工具采集失败与整轮9FAIL不覆盖。
固定四进程正常ABBA冷补全2.98/3.23s对3.30/3.53s，只是当前解析组合标签对照，
不当增量独占收益/P95/PSS或已复现修复整轮。新production2303c3e7与三个Worker
已变；下一步冻结新源码/文档一次真正whole，再继续所有原OP-00–06剩余资格/
采纳、资源/生命周期/≥100循环、客户端/三平台/DevEco-PSS/正例336格。
OP-02/OP-06/L08 IN_PROGRESS，未合入/push，最终550ms/内存不阻塞前序切片。

随后真正新whole终态1750/1751、唯一pin用例OUTPUT_EXISTS、exit1，
零注解/完整身份稳定，原九失败对应case均有正向PASS但旧失败不改写。
[独立输出TDD](../tdd/op06-pin-output-isolation.md)在冻结期间先隔离复现并GREEN，
实际终态审计后只修改该测试，保留首次report/raw原字节、pin/覆盖拒绝；
主工作树四文件15/15。下一步冻结修正后输入新完整check:fast，不用15/15
替代完整回归；全部原OP-00–06资格/采纳与L08资源/生命周期/客户端/平台/
DevEco-PSS/100循环/正例336格仍继续，无毕业或合入声明。

修正pin后的真正whole已1750/1751、1FAIL、exit1、零注解，完整身份稳定：
pin通过，唯一为原403文件含声明id4的20秒超时，不同于旧id2观察。
[SDK相对候选审计](../tdd/op02-sdk-relative-candidate-review.md)保留原失败／有限trace：
每逻辑请求7批完整SDK冷Program，query本体仅约107–110ms。新增有界SDK候选
Map公开RED→GREEN、62/62及真实探测168→4，但固定正常OFF/ON/ON/OFF16次
完整结果中ON首次引用均更慢，净收益NOT_PROVEN；**本候选不采纳，Map已撤回**。
不归因为SDK缓存唯一慢因，不追加有利采样；此前目录复用及六默认不变。
保留负向加载／后续创建／配置恢复回归，撤回后八文件65/65、strict/build通过。
库存201/fast194、core3274→3260仍迁移债，当前源码不能借实验或旧whole GREEN。
下一切片优先冷Program准备的可证伪成本，不扩大预算／scope限制／期限、并发，
不绕过ADR0003跨批保留LS／SDK AST。原完整回归与OP-00–06／L08剩余范围继续。

随后[OP-00发布前native收尾](../tdd/op00-transient-verifier-release-order.md)已公开
RED→GREEN：结果先于finally dispose的顺序缺口改为先收尾后发消息，错误亦然。
成功55/56→0、真实SDK输入拒绝57→0；八文件40/40，含原403／取消恢复／完整scope。
三新冻结Settings会话15/15完整oracle一致，六个verifier各实际dispose1／676 lease
归零，父侧退出另证；补齐正常完成路径收尾，不把terminate或lease0当物理释放。
六默认／1024MiB／完整SDK／每批transient和并发不变；编辑诊断wall仍4.92–5.80s。
当前production0fbafd7b，库存202/fast195；旧完整1750/1751 FAIL不改写。
下一步冻结新源码／文档取得真正当前完整check:fast，再继续冷Program及全部原
资格／采纳、资源／生命周期／soak、客户端／平台／PSS／正例336格，无毕业或合入声明。

最新真正whole终态1752/1754、2FAIL、exit1，零注解、完整身份稳定；原403与
native收尾guard均PASS，两个原协调器alias输入拒绝保留，不宣称整轮GREEN。
[package存在性切片](../tdd/op02-package-metadata-presence.md)以真实负向lookup和
有界私有目录控制证明父目录epoch的过度依赖，公开LSP RED→GREEN；真实package
创建仍-32803，新进程恢复完整结果。九文件86/86含原协调器22/22、SDK窗口及
取消／收尾／库存。仅package存在性使用既有presence观察，内容／源码／SDK
负向fence和六默认／1024MiB保持；core3256仍迁移债，production5cf9d618。
下一步修复标准失败SPEC尾部消费、保留原计数／FAIL，再冻结当前构建执行whole；
全部原OP-00–06资格／采纳、冷Program、资源／生命周期／soak、客户端／平台／
PSS／历史峰值与正例336格仍继续，550ms不前移，未毕业／合入／push。

随后[失败SPEC尾部消费](../tdd/op06-failed-spec-tail.md)公开RED9/10→GREEN10/10，
八文件80/80、全部身份稳定。标准失败详情只在真实非零整数／无信号退出且
fail>0时接纳实际计数，仍为FAIL；信号、零退出、伪造绿色标题及任意尾部保护保留。
生产5cf9d618和库存203/fast196不变，当前代码／文档将新冻结执行真正check:fast。
该切片不授予旧whole或产品毕业，全证据正例、全部336格与原优化采纳／资源／
生命周期／soak／客户端／平台／PSS合同继续，最终550ms不阻塞前序切片。

随后[原始PSS峰值下界保护](../tdd/op06-product-memory-comparison.md#2026-10-15声明峰值的必要下界保护)
公开RED13/14→GREEN14/14、八文件82/82，前后身份一致；server／DevEco同名
原始峰值高于汇总即明确FAIL，后续更高样本也不能漏掉。未覆盖的更高汇总仍
BLOCKED，不把合成proc文本、必要下界或内部一致性当PSS实测／完整统计绑定。
生产5cf9d618和六默认不变；新工具代码需后续fresh whole，旧冻结1757/1757
保持原身份。继续统计／workflow／采样scope、生命周期／平台／soak／历史峰值与
全证据正例，不逐小改重跑旧整轮或以最终550ms阻塞原前序合同。

随后固定八项PSS统计配方公开RED15/16→GREEN16/16，提取共享fixture前后
表征16/16。新增中位数／偶数／first／maximum、八项矛盾与缺失、未知配方和
不安全算术控制；库存首联合88/89的漏改精确计数原FAIL保留，补正后九文件89/89。
[统计协议](../benchmarks/product-gate.md#6-bind-raw-pss-summary-arithmetic)要求明示
配方、完整原观测重算八项和汇总全等；数学绑定PASS不认证产品／运行／采样scope，
comparison仍BLOCKED，不补造旧数据或称本机PSS实测。库存204/unit98/fast197。
当前production5cf9d618与全部产物不变，新工具head仍须fresh whole；继续原
工作流／拓扑／run／PID／窗口绑定、采样覆盖、生命周期／平台／soak／历史峰值／
全证据正例和336格，不因最终550ms停住前序。详见[产品内存TDD](../tdd/op06-product-memory-comparison.md)。

随后原PSS拓扑／run／PID／读取窗口声明绑定公开RED16/17→GREEN17/17，
rehashed manifest类型反例17/18→18/18；十文件联合97/97，前后身份稳定。
保留原七拓扑／两产品／每拓扑3-10-5共252槽位；原manifest文件重读、唯一run
与样本完整读取区间及PID／role／startIdentity绑定。缺拓扑／run／owner仍BLOCKED，
重复／矛盾／越界FAIL，允许真正声明并观测到的动态进程cohort。库存205/unit99/
fast198。只是DECLARED_MANIFEST_RUN_WINDOW_OWNER_BINDING_ONLY；完整执行、
进程树和samplingCoverage仍未验证，comparison不授予PSS或产品PASS。
下一步真实动作／payload／缓存／ready、采样覆盖／OOM及生命周期／平台／soak／
历史峰值与全证据正例；原336格和550ms不变，旧1757不覆盖新工具head。
协议和原证据见[产品内存TDD](../tdd/op06-product-memory-comparison.md)，不把合成
fixture或声明计数当本机Linux／DevEco实测，前序优化合同仍独立推进。

随后采样窗口／实际空洞／原错误绑定公开RED18/19→GREEN19/19，原error留存
反例5/6亦最小修复；十一文件104/104、原身份稳定。完整252个run的计数、
边界空洞、最长读取区间、实际P50/P95/max重算并与原摘要全等；单点／截短／
缺摘要BLOCKED，原error和矛盾FAIL。80ms实测不能改写50ms，内部大空洞保留，
仅DECLARED_RUN_WINDOW_GAP_ACCOUNTING_ONLY，不认证连续峰值或PSS产品范围。
库存206/unit100/fast199；生产和六默认不变，新工具head还需fresh whole。
继续真实执行／结果／缓存／ready、原生方法／采样树／峰值覆盖／OOM、生命周期／
平台／soak／历史峰值与全正例／336格，最终550ms不前移，详见[产品内存TDD](../tdd/op06-product-memory-comparison.md)。

随后[真实原工作流模块访问与失败留存](../tdd/op06-native-workflow-receipts.md)
公开RED→GREEN：每个stress原20组didOpen／didClose实际send记录保留，SENT
不冒充服务器确认。原完整联合77/78失败的生命周期报告已随fixture清理丢失；
单次原名称复测1PASS／32过滤未重现，不修猜测原因。补上意外退出时原报告
字节的测试诊断，仍保留断言失败；真实exit17及preflight无报告控制通过。
默认沙箱spawn EPERM的独立FAIL保留，授权原生只读采样后完整八文件81/81。
source／SDK／产物稳定，audit SHA
`bc4342bd3e198f9c8302b9db57de637b7059d92e04a76f49a687a8ef4f583a6a`。
临时诊断探针已删除；库存207/unit101/fast200，所有本切片源文件≤500行。
继续真正产品执行消费和原剩余范围，不将Mac／私有fixture SDK／通知send记录
升级为DevEco／Linux PSS或L08毕业；合入前新工具head须fresh whole。
