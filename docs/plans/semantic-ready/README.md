# Semantic-ready：就绪后 500 ms 目标 / 550 ms 验收文档入口

初始日期：2026-09-29。初始整合基线：`911ae43c274175614559b63f0311504747d8393d`。
2026-10-06 路线更新：本目录保留原产品契约与历史设计输入；当前实施主线改为
[L01–L08 预算约束长驻语义会话计划](../2026-10-06-budgeted-resident-semantic-plan.md)，
决策见 [ADR 0014](../../adr/0014-budgeted-long-lived-semantic-session.md) 和
[当前默认策略 ADR 0015](../../adr/0015-default-resident-optimization-policy.md)。

2026-10-11 PR #95 已合入 main `a111235b`，六项组合默认开启，合入时
check:fast 1585/1585 与 GitHub CI 通过；L08 仍 IN_PROGRESS。
下一执行队列见[研究审核后的 OP-00–OP-06](../2026-10-11-query-performance-follow-up-plan.md)。
该队列承接 L08 优化与最终验收；L03–L07 保持阶段 DONE，L02 剩余合同由 OP-04 承接。

2026-10-17最新：默认transient统计候选公开4→0、受控相关39/39，但完整安装
SDK固定8会话32引用／8 READY／12诊断一致后，时延无一致净收益，已REJECTED
并逐字回退。原睡眠干扰FAIL保留，恢复审计435453a9确认1748仓库文件／82产物
回到本轮前字节；productionac4c136b、217总／210-fast，原whole1864/1865 FAIL／
403首次引用20s超时不变。不增加默认／预算，不用最终门槛冻结前序；继续冷
Program／完整SDK／复杂closure，见[OP00候选结论](../../tdd/op00-transient-statistics.md)。

前一检查点：ac4c136b修复在途磁盘依赖发布过期定义，已打开调用方与从未
打开磁盘源两入口均保护，另含显式READY拒绝／恢复；十四完整文件96/96、exit0。
固定8个正常完整SDK会话48完整语义／32当前READY／12诊断／8正常退出通过，
一对RSS1.2566使资源比较假说FAIL，保留必要正确性修复，不称资源或最终达标。
联合审计6c0812bb；原210-fast完整check:fast已1861/1865、4FAIL、exit1，身份／
退出审计daf7fc3c。四项缺失磁盘夹具原样RED→真实文件GREEN22/22，提取后六
完整文件49/49，生产不变；旧测试1213→1120仍迁移债。修正后的新完整check:fast
已1864/1865、1FAIL、exit1、零注解，210入口／1748源码／SDK／构建及真实退出
审计0ab1d0e0；四项夹具整轮通过，唯一为历史403文件首次引用id2的20s超时。
原oracle／期限不变，不追加有利复测，不称whole GREEN；继续冷Program／完整
SDK及复杂closure。原FAIL保留，旧1862不覆盖新代码。
六默认／预算不变；全部原余项继续，见[发布前输入修正](../../tdd/op04-versioned-overlay-snapshot.md#在途磁盘依赖的发布前输入修正)。

前一检查点：72358623修正READY准备的既有有界解析作用域，两入口公开
RED→GREEN、相关64/64；原完整check:fast1862/1862、exit0、零注解，独立审计
8c5cc269。完整安装SDK固定8会话真实编辑中位约3.42→2.97s，但一对RSS1.1595，
资源假说未通过，不能授予P95/PSS／soak／物理释放或L08毕业。六默认／预算
不变，不新增跨请求LS／AST；下一项为存活owner／实际驱逐资源归因及原剩余
范围，见[OP04终态](../../tdd/op04-versioned-overlay-snapshot.md#当前72358623完整回归终态)。

2026-10-15 OP-03a已补缺省关闭的父侧／Worker、原诊断结算和查询内完整认证
观察，当前十六完整相关文件172/172；内部queryScope不冒充公开根级ready，
归因开关也不能绕过正式时延／内存入口。真实Settings正常／归因共10exact，
最新诊断一致但原FAIL／DEGRADED保留；所测结算很短，编辑仍4.5–4.9s，继续
编辑准备／fallback、普通繁忙补全净成本及成功ready刷新归因，不额外改调度。
supervisor894→732仍记超限债，owner／预算／并发不变；该归因切片source0fb92f3e
与下述新1ab95acd分开，旧1757不升级复用，OP03／L08不据小样本毕业。

同日OP04当前固定400次编辑408/408完整定义、404诊断一致，Snapshot仍无稳定
净收益，默认推广REJECTED：缺省／0完整解析、显式1实验保留。原六项默认不变，
新source1ab95acd首次whole1794/1795、exit1，唯一失败为私有GC文件发布竞态。
保留原FAIL；真实分段写入RED→原子独占发布GREEN，十三完整相关文件79/79、
strict通过，产品源码／构建未变。修复后的原完整check:fast已1795/1795、exit0、
零注解，全部入口／源码／SDK／产物身份独立审计b38d39c4通过；不替代净收益或
最终产品门禁，也不覆盖原FAIL。Snapshot候选默认决策
不再悬置，独立磁盘delta／未知在途等剩余合同继续，不用最终门槛冻结阶段。

OP03a普通繁忙补全四组已执行并审计：48完整补全／96当前诊断相同，audit4692ffbd。
排序改善但补全中位数／诊断等待／RSS代价不稳定，不宣称整体净收益、不追加有利
采样；保留一次越过的正确性修正。原oracle／两次ENOSPC失败分别保留，隔离工具
三完整文件8/8，只整理确认关闭的派生缓存，原始证据和源码不删。继续成功ready
刷新及慢准备／压力回退，六默认／产品1ab95acd不变，OP03a与L08仍IN_PROGRESS。

成功ready成本另有真实完整SDK／固定生成语料六会话54exact／54当前公开证明、
36body编辑／42最新诊断，audit b3079b3f；正常编辑827–921ms、归因完整认证
501–573ms。原CLI1／其它门禁BLOCKED保留，不冒充Settings或L08毕业。下一项
公开证明可消减的重复输入认证，保持真正返回前新鲜度和原单owner／预算。

随后重复admission切片公开RED10>8→GREEN：完整report构造后的真实最终guard
保留，仅直接返回刚准备的新证明；新输入／构造中SDK变更／恢复正负例仍通过。
当前production eabe24ef，十二完整相关文件70/70，旧1ab95acd whole1795不覆盖。
固定四向路径规范化baseline/candidate共36exact／36当前公开READY、24编辑／
28诊断一致（audit125adc35）；两方向编辑中位改善约8.6–8.7%、采样RSS更低，
支持局部采纳，非直接生产／Settings／PSS／最终550ms毕业。新203-fast入口
完整whole随后终态1779/1797、18FAIL、exit1、零注解，身份审计d16e6667通过，
不称whole GREEN。原文件一次复现11/11与90/91，403源20s超时再次出现并确认
7批冷Program及无效anchor成本，其余复测不称修复。用户2026-10-16确认两种
未打开入口均支持；直接未didOpen源definition首条RED随后经真正请求级disk
传输GREEN，typeDefinition／hover也分别RED→GREEN，与独立opened-caller完整
oracle一致。未伪造overlay；同大小／mtime磁盘变化、实际send后变更、取消、
物理逃逸、open竞争与关闭恢复均有公开保护。真实client version0误判及close
残留已修复，原磁盘调用层级follow-up也不再合成open/close。
随后signatureHelp／completion／completion resolve／prepareCallHierarchy各自
RED→GREEN，完整incoming／outgoing相同；磁盘补全旧句柄按exact source SHA
拒绝（含同size／mtime变化），只保留有界hash不额外驻留源文本，恢复正常。
其后implementation、引用两声明策略和prepareRename／rename逐项RED→GREEN；
核心14项两种入口已有基本完整oracle，冷引用、origin／local alias事务编辑独立
验证。跨文件磁盘引用旧cache结果已用原owner完整READY证明绑定修复，仍保留
真实cache hit；相同disk请求复用原coalescer，独立取消／全组失效／完整恢复通过。
当前production bd4010b6、二十八完整相关文件313/313、exit0、零注解，独立身份
审计b36e8173；strict／build通过，登记213总入口／206-fast。新增源测试的私有SDK
full profile不是安装SDK产品性能证据。随后原206-fast已终态1822/1824 FAIL2，
身份审计5e4670c8；旧1779/1797不改写。旧空结果预期改为真实完整正例，同时
补独立空响应拒绝负例，相关26文件207/207；构造器路径整轮失败尚未定位，
原断言与实际诊断保留。修正测试head的新whole仍NOT_RUN。另已完成安装完整
SDK受控1000/500工程18个独立首次查询（非Settings）：两入口结果/READY一致，
definition中位511/448ms、引用仍约4s；两独立trace显示inputs-changed拒绝resident
后单批Program3.20–3.34s。先公开RED判断proof未观察或实际签名差异，不放宽准入，
不实现已证伪的“缺根提示”假说。原18份最终report仍FAIL，更多输入／压力、
真实工程／物理资源／完整矩阵与产品门禁仍待。六默认／
预算／owner不变，OP03a与L08仍IN_PROGRESS，证据见
[OP03a记录](../../tdd/op03a-completion-diagnostic-priority.md)。

同日后续已完成上述proof未观察问题的公开RED→GREEN：只有同owner、同SDK及
root/epoch/content authority的只读证明元数据才交接给普通resident状态，完整
输入/最终物理fence保留，不另建LS。新生产81d6e876的9完整文件75/75，auditac7407c4。
新构建固定18个完整安装SDK首次查询仍exact/current READY/正常诊断：打开调用方
引用中位229–230ms，never-didOpen源464–470ms，根准备仍4.14–5.52s；audit69d6dac6。
独立两trace证明同Program、无transient verifier/额外owner，audit4f77a846。
旧约4s基线与原FAIL保留；新18份最终report也仍FAIL，不能当P95/PSS/336格毕业。
局部proof交接DONE，OP03a及L08全范围不变；当前head完整check:fast待实际终态，
旧1822/1824与构造器seed未定位缺口不被75项通过覆盖。随后继续真实复杂closure、
冷准备、磁盘delta/未知在途与压力资源，最终550ms只留OP06/L08。

随后原完整check:fast已1826/1826、exit0、零skip/cancel/todo，206入口及全部源码/
SDK/产物/原启动器独立审计1de2bf76。正式评估器真实消费该receipt与18份report，
macOS回归PASS但总BLOCKED，audit70eca240，不是P95/PSS/336格毕业。旧FAIL保留。
再新增公开watched磁盘依赖编辑反例：完整3处引用正确、无didOpen或诊断预热、
正常退出，但只读根仍DEGRADED/旧证明失效；有效RED审计83952896。生产81d6e876
在该反例时点未改，新增测试head为RED，不借此前1826宣称当前全GREEN。下一项最小引用READY
刷新，在原owner/取消/预算/最终fence内承接显式准备意图，bounded resident-only
仍不隐式编译；S05与默认关闭实验不重开。OP03a与L08全范围仍IN_PROGRESS。

上述引用刷新现已最小RED→GREEN：已有显式意图才可随原context替换完整认证，
status／bounded resident-only不隐式准备，最终物理fence不删。当前88ad7e9b的
9完整文件81/81、exit0，audit987689db；两入口×两声明策略、缺输入修复与实际
编译器取消均保护。安装完整SDK4独立编辑观察exact/current READY，但RPC仍
3.51–4.00s、采样RSS508–566MiB（auditb5c51a6b）；两独立trace指向一次context
重建／869输入认证，无额外owner／transient批次（auditffa33bbd）。不是P95/PSS／
正式矩阵或磁盘增量毕业。旧1826 whole不覆盖当前生产，fresh whole NOT_RUN；
下一公开切片先验证其它ordinary能力的磁盘编辑动态意图，再继续冷准备／OP04／
压力资源与原完整目标。六默认／预算不变，L08仍IN_PROGRESS，未合main。

该后续已取得新检查点：普通definition、诊断先完成仍保留意图、两入口outgoing
follow-up均逐项RED→GREEN。原完整相关9文件88/88、exit0，audit e4c7eaa1，当前
production a6ae3b97；宽触发时的86/88 FAIL保留，原未知输入负例不改，完整根准备
只针对必要context重建／不完整scope。诊断不准备根，实际L2/L3与输入检查取消仍
清除意图。安装完整SDK两定义会话exact/current READY：首次220/228ms、编辑后
3.69/3.84s、采样RSS559/557MiB（audit7becc0ca），非P95/PSS／净收益／正式矩阵。
原完整collector`.bench/op03a-ordinary-ready-refresh-current-whole-v1/whole*`实际
FAIL／exit1：ENOSPC使fixture和最终harness输出失败，无根摘要，counts=null。
独立审计23bd83d0确认206入口／1734源码／SDK／构建／启动器及实际退出一致，
不等于whole GREEN。保留原失败，先处理任务重复派生存储，再新前缀原命令重跑；
旧1826不覆盖本构建。继续其它动态／复杂closure、冷Program、
OP04／压力资源／实际Zed／OP06正例与全336格，L08仍IN_PROGRESS，未合main。

storage-recovery-v2随后已真实1837/1839、2FAIL、exit1、零注解，独立审计4ab388e2，
206入口／1734源码／SDK／构建／启动器与退出一致，本轮0 ENOSPC。观察用例依赖
默认必经verifier的旧前提已由原样RED和两个原生公开CLI对照定位；仅修专用
fallback测试资格，增强默认完整编辑／cache保护，三个完整相关文件30/30、exit0，
auditacf11315，测试494行，生产a6ae3b97和默认组合不变。另一原403 id4仍20s超时；
此前FAIL不重标，当前测试head whole NOT_RUN，不授予L08毕业。原冷成本／复杂closure、
独立增量／未知输入、实际Zed、正常资源／物理释放／soak与OP06全证据正例／336格
继续，不采纳128或重开S05来换通过。详情见[OP00](../../tdd/op00-query-layer-attribution.md)。

原403／原期限随后仅一次有限复测1 PASS／2未选、exit0，完整oracle到达，
auditc67ed6b0；仅未复现，不称修复、不覆盖旧whole FAIL。独立OP06实际restart
首切片完成两入口：已打开调用方→未打开目标、查询源从未didOpen；新进程重新
READY、未保存目标编辑／版本重放、混合两次重启及异常尾部均保护。19完整文件
171/171、零注解，两个私有SDK原生入口共4服务进程正常退出，audit0b95855d。
逐进程RSS不是PSS／native LS dispose／物理释放，原CLI仍FAIL、正式消费BLOCKED；
不称14能力restart或L08完成。生产a6ae3b97／默认／预算不变，工具head whole
NOT_RUN，全部余项和分支PR要求保持。见[OP06](../../tdd/op06-release-sample-evidence.md)。

后续两入口completion/resolve与prepare/incoming/outgoing完整结果、实际旧补全
UUID失效／新UUID恢复、当前进程来源依赖已保护。调用item仍按root／位置和当前
源校验，不新增会话UUID语义。20完整文件176/176、零注解；四私有SDK原生案例
12精确请求／8服务PID正常退出，audit6d359df3；原CLI仍FAIL／最终消费BLOCKED。
仅工具／测试改变，生产／默认／预算不变；其余能力、复杂closure／冷Program／
OP04输入／资源／平台与原最终门禁继续，whole NOT_RUN，不授予OP06/L08 DONE。

前一OP04重复通知切片production5e7bffc4，12完整文件93/93；完整安装SDK新34源／
32依赖hop固定8会话96exact／当前READY、诊断及退出一致。两入口重复通知中位
3.50/3.43s→79/77ms，真实修改3.27–3.48s、RSS四对含一对升高，不称整体收益。
仅物理身份与有界重读全文均相同才去重；同内容缺省1／显式0，真写入（含
metadata碰撞）及原fence保持。原工具FAIL保留，审计a20ba24f，见[OP04](../../tdd/op04-versioned-overlay-snapshot.md#2026-10-16重复磁盘通知的独立输入切片)。
216总入口／209-fast，随后原完整check:fast1858/1858、exit0、零注解，全部源码／
SDK／产物／启动器及实际根退出审计47ad6dda。原403四份oracle／原期限本轮通过，
不称以前超时修复；旧a6整轮1837/1839 FAIL保留。六默认／预算不变，真正编辑
准备／复杂真实工程／压力／生命周期／soak及全部产品门禁继续；未提交或推送。

2026-10-10 用户明确确认“550”：L08正式完整响应P95≤550ms，500ms保留
为优化目标，其它验收门槛不变。当前实测与剩余项见
[L08报告](../../reports/2026-10-10-resident-l08-semantic-readiness.md)，历史
500ms失败不重标；各阶段旧统计不代表当前构建或产品毕业。

用户授权本轮补充治理文档。**文档整合不代表技术提案已毕业、生产代码已实现，
也不是创建 GitHub Issue、提交、推送或合并的授权。**

## 当前主线与历史路线

当前：固定真实 Settings/API24 基线 → L01 长驻 LS 可证伪实验 → L02 增量
新鲜度 → L03 预算与回收 → L04–L07 逐能力接线及 exact fallback → L08 发布评审。
2026-10-08 用户确认：最终产品验证统一放在 L08，不用最终目标阻塞
L01–L07。前序阶段逐切片验证功能、完整结果、快照、取消和执行保护；
时延、内存、整体 ready、长期 soak 和跨平台未达标如实带入后续阶段。
后续切片使用已有基线继续；六项默认由 ADR 0015 管理，产品发布等待 L08 全套验收。

以下阶段审计和默认关闭措辞保留各自日期的实施配置；当前默认见上方 ADR 0015。
2026-10-09 [L03 完成审计](../../reports/2026-10-09-resident-l03-completion-audit.md)
A～E PASS，阶段实施与校准 DONE；实验默认关闭，最终指标仍在 L08。
同日 [L04 完成审计](../../reports/2026-10-09-resident-l04-completion-audit.md)
A～E PASS，references 接线与校准 DONE；当前完整 check:fast 1449/1449
及终态身份复核通过，R-09 仍默认关闭。
同日 [L05 完成审计](../../reports/2026-10-09-resident-l05-completion-audit.md)
A～E PASS，独立implementation接线与校准DONE；当前完整check:fast
1467/1467及终态源码/产物/测试/工具和工程/SDK等身份一致，实验默认关闭。
2026-10-10 [L06完成审计](../../reports/2026-10-10-resident-l06-completion-audit.md)
A～E PASS，交互接线/校准DONE；19公开case、联合252、真实62及全新
完整1492/1492，终态身份一致。按用户授权继续L07，最终产品门禁仍在L08。

[L07当前审计](../../reports/2026-10-10-resident-l07-completion-audit.md)A–E
直接证据通过：25生产公开case、当前62完整真实请求及最新诊断一致，
实际lazy晋升/未查Program复用有OFF重建反事实。冻结完整1511/1511、
根退出0及终态身份一致，L07阶段DONE；原失败、慢准备/重建/恢复和
高RSS如实保留，默认不推广。

原先的 compiler facts → SQLite 投影路线是历史研究：S02 v1–v6 未通过，
S03 BLOCKED；S05 相容磁盘 LS 复用候选已 REJECTED。不得把它们改标为
新路线的成功证据，也不得未经新决策继续接生产 schema。

| 文档 | 唯一职责 |
| --- | --- |
| [产品契约](product-contract.md) | 首次豁免、正常工作负载、语义就绪、500 ms目标与550 ms验收 |
| [当前执行计划](../2026-10-06-budgeted-resident-semantic-plan.md) | L01–L08 顺序、安全与产品门禁 |
| [查询性能后续计划](../2026-10-11-query-performance-follow-up-plan.md) | 研究建议审核、OP-00–OP-06 依赖、验收与回退 |
| [历史 S-series 计划](../2026-09-29-semantic-ready-execution-plan.md) | 保留 S00–S12 原始证据与停止线 |
| [Feature Ledger](../references-feature-ledger.md) | 当前优先级、状态与历史证据 |
| [MoSCoW](../references-moscow.md) | 取舍与停止条件；不重复管理阶段状态 |
| [ADR 索引](../../adr/README.md) | 当前与历史决策的状态及关系 |
| [历史设计合同](design-contracts.md) | S02/S03 投影模型的未实施研究记录 |
| [验收规范](../../benchmarks/semantic-ready-acceptance.md) | 正确性、就绪、时延、资源与跨平台门禁 |
| [本轮整合记录](../../reports/2026-09-29-semantic-ready-plan-integration.md) | 文档检查与保护范围；不是产品测试报告 |

来源：用户提供的 `ArkTS-Semantic-Ready-500ms-Plan.zip`，完整 SHA-256 记录在整合报告。
没有将离线包整目录覆盖仓库，也没有复制包中的第二份 Ledger、MoSCoW、运行时配置或校验工具。
Markdown 是本次唯一治理正文；未引入并行的机器阶段状态表。

## 与已有实现的关系

- KEEP：compiler、DocumentAuthority、ProjectGraph、单一 SQLite owner、完整结果 cache、
  coalescing、references lanes、index recovery 和 L3 hysteresis。
- R-09 已在 main 实现且默认开启，产品指标未毕业；OP-01 工作树已提前尝试
  既有 owner，验证 IN_PROGRESS，稳定净收益和新完整回归尚未确认，不冒作已合入。
- R-07 已消费 empty/literal-root 证据，但一般 constructor 范围仍未证明；不把词法事实当最终答案。
- `indexed-batched + closure + full SDK`、budget-aware retention、完整 resident 及 transient fallback 共享原预算。
- S02 不等价：阻断生产 facts/schema 路线，保留反例和正确 fallback；不添加第二 checker。
- 原 >3 GB 复现、最终 50% 内存、DevEco/PSS 等任务继续独立开放。

以下为各阶段原配置与历史构建的接线记录，当前剩余项以 OP 后续计划为准。
L01 历史基线保留；L02 同内容晋升当时默认关闭，阶段仍 IN_PROGRESS。
L03 [回收请求等待](../../tdd/l03-recycle-request-wait.md) 后已实现默认关闭的
[自然 L3 自动回收](../../tdd/l03-automatic-pressure-recycle.md)，组合 86/86 PASS；
[真实自然压力对照](../../reports/2026-10-08-resident-l03-natural-worker-recycle.md)
88/88 exact；单 timing 峰值下降、编辑长尾变慢，最终门禁未关闭。
前序证据见 [L02 报告](../../reports/2026-10-08-resident-l02-same-content-promotion.md)。
后续 [失效与编辑控制](../../reports/2026-10-08-resident-l02-invalidation-and-edit.md)
已修复 target 首次空定位并取得七类独立公开合同；真实编辑 exact，但没有
晋升机制的可归因提速。L02 固定源码独立 `check:fast` 1338/1338 PASS、退出 0；
当前 L03 固定实现独立 `check:fast` 1439/1439 PASS、退出 0，终态源码/
构建、测试与输入身份一致，不沿用 L02 的旧 whole。[当前政策校准](../../reports/2026-10-09-resident-l03-budget-policy-calibration.md)
选定配置/对照 26/26 exact、诊断一致；保留 1024 MiB 与原滞回，不纳入
自动 Worker 替换，不宣称最终资源收益。L04 [公开组合合同](../../tdd/l04-promoted-resident-reference-contracts.md)
及 [历史八轮 Settings 两种声明策略控制](../../reports/2026-10-08-resident-l04-route-control.md)
已推进，16/16 real exact，但 trace ON 都 miss，不能宣称热收益。
后续准入 trace 定位 level1 下 4096 条配置见证触顶；缺失祖先共享的
公开组合 43/43 PASS，但新的真实 2/2 exact 回放仍触顶并完整 fallback，
原因与下一证明压缩切片见同一 L04 TDD，不把它重标为真实复用成功。
随后直接加载目录的证明共享经真实 RED/GREEN，该检查点串行组合 48/48 PASS；
新构建两种 declaration policy 的独立 Settings 回放各 2/2 exact、
9/10 refs 实际 resident hit、零 batch、诊断 PASS，容量拒绝消失。
该构建完整响应为 1.31/1.21 s，没有整体 ready、P95 或内存毕业。
当前 [选定预算政策的公开组合](../../tdd/l04-budget-policy-reference-contracts.md)
10/10 PASS，完整回归 1449/1449、终态源码/构建、冻结测试与输入一致；
[同构建真实对照](../../reports/2026-10-09-resident-l04-budget-policy-integration.md)
两种声明策略的 ON/OFF、独立 trace/timing 八进程共 52 项 exact，四对
完整集合/最新诊断一致，两份 ON trace 首次新符号均实际 resident hit。
新引用 timing 915/937 ms，准备与冷恢复更慢、峰值更高；阶段 L04 DONE
不等于最终资源、时延或 semantic-ready 毕业，raw ready FAIL 保留给 L08。
L05 [选定政策独立implementations合同](../../tdd/l05-budget-policy-implementation-contracts.md)
23项及联合132/132通过，补齐执行中取消、SDK/package/配置/未知输入、
多根/close-reopen和trace OFF。四进程[当前真实对照](../../reports/2026-10-09-resident-l05-budget-policy-integration.md)
22/22 exact、两对最新诊断一致，R-09 OFF仍有独立完整Program复用；
同内容晋升保持38个脚本generation。完整whole和终态审计齐备，L05 DONE；
未查628/677ms、约13s恢复和峰值风险留给L08，不宣称最终收益。
L06历史起点[交互公开合同](../../tdd/l06-resident-interactive-contracts.md)
与相关回归 57/57 PASS，包含完整导航/hover/signature、completion/resolve、
同名 auto-import、snippet、API 编辑、回收和 refs 进行时交互；不新建 owner。
[历史固定构建Settings控制](../../reports/2026-10-08-resident-l06-interactive-control.md)
8/8 exact，13 个同内容晋升实际避免一次重建；单 timing 新 definition
686→165 ms，原 v1 2307/2339 诊断保留，不能宣称整体 ready/P95/内存达标。
[L07 rename/call hierarchy 合同](../../tdd/l07-resident-edit-and-call-contracts.md)
已推进完整编辑及应用、alias 分层、双向调用点、未打开 follow-up 与
编辑/回收/取消，修复本地 alias 冲突及诊断丢失，当前 focused 88/88、
并行 72/72 PASS。这些是功能回归，不重用旧构建的 Settings 性能结论；
该段88/72为历史起点；当前真实工程/预算组合及冻结完整E见上方审计。
全部冲突/方言/平台矩阵仍在L08。L03–L07阶段DONE，L02仍IN_PROGRESS；
L06当前19公开case/252联合/62真实及whole1492见上方完成审计；旧timeout原因、其它能力的真实
admission 和 L08 产品门禁仍开放，不提前毕业。
现有 `--prepared-suite` 真实 LSP 回放和公开 readiness 合同可复用；旧
`READINESS_UNSUPPORTED` 留在原构建证据，当前必要输入／完整覆盖及性能资源
继续在 OP 后续计划与 L08 验证，候选索引 ready 不等于语义就绪。
