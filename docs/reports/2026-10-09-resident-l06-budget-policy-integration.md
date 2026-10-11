# L06 预算政策下的真实交互能力对照

日期：2026-10-09。本报告固定构建的L06-D功能控制 PASS；后续完整回归发现
删除依赖重试误拒绝，修复改变产品身份，当前终态必须重新真实取样。本报告
保留原pins和结果，不作为修复后构建的D/E完成证据。
该固定构建 Settings/API24 的四个独立进程共62/62请求完整exact，
两对ON/OFF完整payload及最新版本诊断一致。原始报告仍为FAIL／
READINESS_UNSUPPORTED，不宣称semantic-ready、P95或最终资源收益。

## 固定输入和政策

父HEAD为1b9101520b0d7d3358e4ce8f27f0bfcc06db902f；工作树保留既有变更。
工程HEAD ecc550dfaed880e04e38a2477eb7235cd50475b9，工作区干净；SDK为
DevEco默认OpenHarmony API24、ETS 6.1.1.125。当前产品输入与产物：

- serverInputSha256：d7015d45cb0b9d5921ae4d78013f47cff33207994b7867709a794b11b0e79fab
- serverSha256：649ebfd12a2de5ce32cfe3e0462064ab946f866f88ce821e9b4b83c82fa82208
- semanticWorkerSha256：3f2f72bab0e7e65a24daf4449456c3fee0d7d41a80f82641c75fe2b78512d089
- referenceVerifierWorkerSha256：c778dbc2f87993392476bf0efb7b3a305986241ab8ffb4363dfa80cffc146bd5
- diagnosticVerifierWorkerSha256：c58b2c0752e63990401a6487889841041a3b64b7cdff31e3b4dae1ddf86ae8da

sidecar、标准库、backend、lockfile、memory gates、工程全部源码和SDK声明
digest均在12份本轮manifest的pins中，并由每个进程终态复核一致。
旧definition-only 8项及L05的22项真实控制不纳入本轮分母，不重写历史pins。

两侧均使用选定L03政策：正常1024MiB、原target/hysteresis、budget-aware、
成本感知驱逐、压力准入和transient诊断；R-09、anchor/session reuse、手动
Worker回收与自动替换均关闭。ON/OFF仅切换现有L02同内容晋升，trace与
timing为独立进程。正常诊断保持开启，未提高预算/超时、预加载目标答案、
强制GC或缩小工程范围；实验生产默认不变。

## 独立完整基线

六类交互目标位于AboutDeviceSettingsComponent的真实setPageModel调用：
definition指向Controller方法，typeDefinition指向Controller类，hover与
signature保留完整markup/参数/激活位置，completion保留全部7个条目与
isIncomplete=false，resolve使用实际会话句柄并返回完整元数据。
与目标无关的IService完整6处implementation用于支付准备，不投影为交互oracle。

每个基线由两个独立冷生产stdio进程发现/复核，另含v2未保存body注释编辑
后的hover与诊断基线，总计16进程均成功、输入不变、产品退出0。
resolve的前置completion和耗时显式记录；仅校验后移除单一随机UUID，
不删语义data或其它payload字段。各能力的完整oracles及来源见
`bench/references/oracles/settings-resident-l06-policy-*-api24.json`；
原始冷报告为`.bench/l06-policy-*-cold-{1,2}.json`。

## 同构建公开回放

trace每组16项：独立暖机、六类首次未查、六类稳态、立即v2 body编辑、
编辑稳态及实际L3驱逐后的完整hover恢复。timing每组15项，包含相同非回收
序列；trace OFF没有伪造驱逐控制或把未运行恢复计入成功。代表性真实
编辑/恢复采用hover，其它输入变化和六类取消/恢复由17项当前公开合同
覆盖，不宣称这里已跑每能力乘每输入的最终矩阵。

| 独立进程 | exact请求 | candidate准备秒 | Node峰值MiB | 产品树峰值MiB | 采样间隔P95毫秒 |
| --- | --- | --- | --- | --- | --- |
| on-trace | 16/16 | 7.463 | 1043.422 | 1212.715 | 133 |
| on-timing | 15/15 | 7.376 | 809.348 | 978.258 | 132 |
| off-trace | 16/16 | 7.368 | 1278.785 | 1448.168 | 134 |
| off-timing | 15/15 | 7.652 | 829.844 | 999.688 | 134 |

外部RSS读取同一Node PID，Worker线程不重复相加；产品树另含sidecar。
采样目标50ms，但实际间隔如表所示，峰值为采样峰值，不替代PSS或硬上限。
ON/OFF目标池及pins一致；完整canonical payload和最新版本code/range/message
诊断深比较一致。62项均COMPLETE且exact，无blocked或隐藏resolve前置刷新。
原始报告为`.bench/l06-policy-{on,off}-{trace,timing}-1.json`，直接配对审计为
`.bench/l06-policy-control-analysis.json`；所有产品进程正常退出0，回放CLI因
readiness门禁保留退出1。

ON trace的首次未查definition与暖机共用Program序号1、createProgramEvents=0；
OFF首次definition为Program2、一次重建。两侧后续completion/resolve分别
实际复用Program1/2、1496个工程sources及652个SDKsources；同一Program不
等于所有checker身份不变，ON暖机checker1与后续checker2均如实保留。
这些是实际LS/Program见证，不由context计数或答案cache推断。

## 完整响应与 L08 交接

下表为独立trace OFF进程的单次完整响应毫秒，不是稳定P95，也不与trace样本混合。

| 能力 | ON首次未查 | OFF首次未查 | ON稳态 | OFF稳态 |
| --- | --- | --- | --- | --- |
| definition | 671 | 1367 | 474 | 485 |
| typeDefinition | 1445 | 1458 | 472 | 478 |
| hover | 501 | 512 | 469 | 484 |
| signatureHelp | 471 | 464 | 471 | 474 |
| completion | 502 | 502 | 486 | 484 |
| completionResolve | 487 | 491 | 477 | 479 |

v2编辑hover为ON 1102、OFF 1111ms；编辑稳态为
ON 975、OFF 976ms。
trace归因采样的恢复为ON 5630、OFF 5748ms。
冷completion约14秒，且当前首次新目标/编辑仍有超过500ms的样本。
ON本次采样峰值较低不构成最终内存收益证明；trace恢复Node峰值超过正常
soft预算，LS释放后RSS不保证立即下降，自动Worker替换仍未纳入选定配置。

500ms/P95、各能力完整最终矩阵、长期edit/pressure soak、内存目标、
DevEco/PSS、100k及跨平台验收交L08。错误结果、旧快照或执行保护缺陷
须回滚对应实验路径；资源/时延不足保存为L08风险，不以最终目标阻塞L06。
回滚使用现有L02开关关闭，必要时撤销选定政策实验配置回到原安全完整路径；
不得把诊断、scope或输入保护关闭当回滚。逐项完成与发布评审仍分别等待E和L08。
