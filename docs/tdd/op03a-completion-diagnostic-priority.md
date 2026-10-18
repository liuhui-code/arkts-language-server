# OP-03a 补全在正常诊断队列中的有限优先级

日期：2026-10-12。状态：IN_PROGRESS；父修订a111235bc4bfcb55b126752f95b3ba095f2996af，
工作分支codex/op00-query-attribution。接口保持公开Content-Length stdio，能力不变。
使用diagnose、TDD与最小改动原则；遵守[ADR0006](../adr/0006-semantic-request-scheduling.md)。

2026-10-16最新交接：72358623仅让原lease内的READY准备进入既有有界解析
作用域，不改变诊断认证意图／调度／owner。两入口公开RED→GREEN、64/64，
原完整check:fast1862/1862、exit0、零注解，独立审计8c5cc269；真实编辑仍约3s、
一对RSS1.1595，资源假说未通过。见[OP04终态](op04-versioned-overlay-snapshot.md#当前72358623完整回归终态)。
本地功能与代码回归收口不完成OP03a／OP04／L08或产品资源资格。

前一交接：OP04重复磁盘通知切片production5e7bffc4，12完整文件93/93；
原根准备／诊断意图／queryRefresh／unknown及返回前fence保持。仅相同物理身份
及有界重读全文才去重，通知修订／取消屏障照常前进，实际写入仍保守。
完整SDK新34源／32依赖hop的8固定会话96exact／当前READY；重复通知中位
3.50/3.43s→79/77ms，真修改仍3.27–3.48s、RSS方向混合。审计a20ba24f，原工具
FAIL保留，见[OP04](op04-versioned-overlay-snapshot.md#2026-10-16重复磁盘通知的独立输入切片)。
随后原完整check:fast1858/1858、exit0、零注解，输入及实际退出审计47ad6dda。
旧a6及1837/1839 FAIL保留，原403本轮通过不称超时修复。无新调度／GC／owner策略；
复杂动态closure、其它能力／冷准备／压力和完整L08继续，不以局部毫秒查询毕业。

## 归因与边界

前一生产构建5248dc65的whole1608/1610、exit1、两个原期限超时保留。
只执行一次原用例独立trace观察：403文件引用各七次完整SDK verifier，准备为
主要成本；补全3.705秒，诊断在它之后。该观察没有复现整轮失败，不能把本切片
视为其修复，也不重复整轮直到PASS。完整身份与日志见[OP-02记录](op02-resident-input-proof-reuse.md)。

独立队列问题可通过真实Worker有限hold反例稳定验证：第一份诊断已入Worker，
第二份已过正常debounce并提交队列，再发送未查继承成员补全。既有策略只允许
define/hover越过尚未执行的诊断，complete会等待第二份诊断。目标只扩展一次
越过名单，不取消正常诊断、抢占在途同步compiler、增加global并发或第二语义owner。
最老diagnose仍最多被越过一次，mutation及global屏障不变。

## 原合同表征与公开RED

原diagnostic scheduling两项加detached lane一项3/3、exit0、6189.440674ms，
零skip/cancel/todo；日志 `.bench/op03a-diagnostic-queue-characterization-v1.stdout.log`。

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test \
  --test-name-pattern='uncached inherited completion overtakes' \
  tests/semantic/references-diagnostic-scheduling.test.mjs
```

实际RED：0/1、exit1、4335.324367ms，另两项未选中。完整三成员/kind正确，
两份最新v1诊断均含2322并正常发布，但第二份已经发布后补全才返回，true≠false。
这不是人为缩短期限、输入缺失或伪造compiler结果。fixture使用真实完整测试SDK、
原Base/Derived源码、正常诊断及六项生产默认；hold是已有私有控制，计时不作SLO。
日志 `.bench/op03a-completion-diagnostic-queue-red-v1.stdout.log`。

最小实现在semantic-request-lanes的原一次越过分支仅加入complete，48→49行。
strict/build及原两文件完整联合4/4、exit0、10505.442478ms，零skip/cancel/todo；
日志 `.bench/op03a-completion-diagnostic-queue-green-v1.stdout.log`。
首次GREEN后再增加两个独立Derived文档的同窗请求，验证第二个补全不能再次越过
最老诊断；这是原公平规则的直接表征，不虚构生产RED。两文件4/4、exit0、
10511.380765ms：第一项在诊断B发布前返回，第二项在B发布后返回，均为完整三成员。
日志 `.bench/op03a-completion-diagnostic-fairness-green-v1.stdout.log`。

随后独立公开取消/编辑控制：在第一份诊断仍被hold时取消排队补全，id50只一次
-32800、无result；v2移除继承关系后完整返回build/currentTitle，最新v2诊断1003
仍发布，shutdown/exit0。两文件5/5、exit0、14124.579593ms，零skip/cancel/todo；
日志 `.bench/op03a-completion-queue-cancel-edit-v1.stdout.log`。

下一项global屏障：同窗先发出implementation再completion，完整implementation
先发布；补全不越过它或其前面的诊断，完整三成员及正常诊断保留。两文件6/6、
exit0、17680.426215ms，零skip/cancel/todo；日志
`.bench/op03a-completion-queue-global-barrier-v1.stdout.log`。
这些是现有保护在新complete名单上的直接表征，不是另一个生产缺陷的RED。
测试文件447行、production lane49行，无新over-limit源文件或协议日志。
当前production source input为eae466b5…、server97cfc046…，三个Worker产物
仍为OP-02修复的1b5e8324…／2a1e3198…／98d8be75…；完整身份保存在
`.bench/op03a-completion-priority-build-v1-identity.json`。SDK/Settings/Node/预算等
不变，不能借用source5248dc65的旧whole结果为当前构建毕业。

十文件完整相关回归已终态89/89、exit0、148243.524343ms，零skip/cancel/todo；
前缀 `.bench/op03a-completion-priority-focused-v1*`。包括原完整semantic characterization、
交互复用/压力恢复/取消、真实生产Worker、supervisor队列/故障保护、references
lanes/coalescing、OP-02输入新鲜度与库存。所有原期限及完整payload保留；
没有并发性能校准或编辑源码/测试。postflight production pins核对单独保存，
不把focused89拼成新完整check:fast。
仍需同输入实际等待/净成本、新完整check:fast及采纳审计。OP-03b与ready refresh
未完成，原whole两超时仍未解决，最终550ms/内存在L08。

2026-10-13 当前共享源码c2a50003完整check:fast已1648/1648、exit0、零注解，
全部production/SDK/repo身份稳定，详见[最新OP-02记录](op02-resident-input-proof-reuse.md)。
本队列合同也在该整轮通过；上述eae466b5/更早whole为历史身份，保留FAIL，
不声称本队列改动独自修复那些超时。同输入实际等待/净成本、ready refresh及
采纳仍待，OP-03a/03b及L08不因此完成。

## 2026-10-15：当前调度与就绪合同基线

OP-02选定请求内复用切片及有限采纳已收口，继续真实等待成本归因，不以最终
550ms／PSS阻塞。当前production5cf9d618没有变化；先冻结四完整公开文件：
references-diagnostic-scheduling、references-scheduling、semantic-readiness及
semantic-readiness-lifecycle。31/31、exit0／signal null、零skip／cancel／todo，
43575.60645ms；source／完整设备SDK／产物前后稳定、真实PID退出。
测试实际使用各自私有SDK／真实compiler，不把它们当Settings完整ready实测。
原6项队列／公平／取消／编辑／global保护与status不准备、显式准备／query刷新、
未通知输入变化、缺必要输入／取消／驱逐／重启的新旧ready保护均通过。

前缀 `.bench/op03a-current-readiness-scheduling-characterization-v1*`；log SHA
`4ab586ef0e1b7d81a6501c89edcb0d90b1ef9b7efc0b50635ccfbf60071f64f9`，
audit SHA `c3f7b68999b3d5529c3048824a8dd10cb1aba802a6a15685730c900b7caf7f86`。
原私有diagnose hold／test delay仍仅用于可重复排序合同，不解释成正常设备
等待或净收益。整case毫秒数也不是单RPC、compiler CPU或正式P95。

下一切片先让真实请求等待可复核：区分LSP references suspend／在途compiler
结算、supervisor pending、物理Worker已接收后的等待及afterQuery认证；不能把
其中一段当全部等待或将重叠段相加当CPU。现有supervisor894行是迁移债，
触及前先在本公开表征与原supervisor保护下提取cohesive输入验证／错误职责，
不增加其行数，再以公开RED→GREEN接入缺省关闭的边界观察。
不增加owner／全局并发／诊断暂停，不改变调度／预算／公开期限；普通计时
关闭观察，全部编辑追赶与认证仍计入完整响应。实际普通等待／净成本、采纳
与OP-03b／真实客户端仍未完成，新工具head完整check:fast亦待执行。

## 2026-10-15：两层队列观察的公开TDD与当前相关回归

在父修订a111235b的现有脏工作树上，先冻结原六个完整supervisor／公开LSP文件：
提取前68/68、exit0、45071.16928ms；提取后同组68/68、exit0、44825.014516ms。
前缀分别为 `.bench/op03a-supervisor-extraction-before-v1*`／`after-v1*`，
audit SHA分别为 `92acd0128bbc7cf1d6530994498fcb2f5dcdfc5a4affd4b51fe2f6972b37a9e6`／
`172c8ed12ea9bca5417d3704d3d1444f9a2e7a1e3a426fbb564c62bd41ee4f84`。
仅逐字提取校验和错误／取消转换，原导出保留；supervisor894→726行，
新input-guards139／supervisor-errors52行。剩余726行当时仍为迁移债，不宣称已达500。
提取后production input f5782f4e，server aabec72c；旧5cf9d618不再是当前源码。

第一垂直切片：完整公开补全／正常诊断／一次越过公平性先通过，再要求两条
父侧发送返回记录。原构建实际0而不是2，RED exit1、选中0/1，另4项未选中。
命令为Node20 `--test --test-reporter=spec --test-name-pattern='uncached inherited completion overtakes'
tests/semantic/references-diagnostic-scheduling.test.mjs`，父修订同上。
前缀 `.bench/op03a-queue-boundary-red-v1*`，log SHA
`5e78ceadfb4c42545b28c7690d1482ee9d0eb8d273105f95c9c0d634ec0bea6b`。
最小GREEN完整文件5/5；再验证缺省无日志、真正入队后取消无发送成功记录、
私有原生postMessage故障只返回一次-32603且无result／无成功发送记录。
故障仅在受限私有fixture的complete边界抛出，其余真实compiler消息原样转发。
ON／0独立进程的v1／v2完整补全字段和最新诊断逐字段相等，仅验证并归一化
公开响应中进程内随机UUID，不按标签／计数代替完整payload比较。
第一层九完整相关文件78/78，audit `24992673c8f76ce0bc15a6281316b7a2784db526f5f05a654061c5216d7626c1`。

第二垂直切片：要求独立Worker dispatch记录，原父侧GREEN构建0而不是1，
实际RED exit1、选中0/1／另4未选中，前缀 `.bench/op03a-worker-queue-boundary-red-v1*`，
log SHA `e46c96fe043d60f23bb47aa4e290cd5c29ecf00fa3c0172d4b2258f22e212692`。
在原Worker已有receivedAt／dispatch入口接只读观测，原serial队列不变；两完整
公开文件7/7后，当前九完整文件78/78、exit0／signal null、零skip/cancel/todo，
48913.794139ms，源码／完整SDK／产物前后稳定，真实测试PID已退出。
前缀 `.bench/op03a-worker-queue-boundary-related-v1*`；log SHA
`43870e5a9e47e530ef5f76d1a66984547126497e9122bb92d650a3ec4f028b46`。
terminal audit SHA `cda1cf40990084aa0dbdc2a1e01d99cc8d51d37a4609856746986271a849df8f`。

`ARKTS_SEMANTIC_QUEUE_TRACE`缺省关闭，只有精确1开启。父侧用WeakMap绑定现有
请求输入，不增加拥有型请求列表；容量、优先级、owner及并发均不变。
`semantic.queue.enqueued`在合法请求已准入后记录；`semantic.queue.send.returned`
仅原send成功返回后记录，以root／epoch／traceId配对并保留wire requestId／修订。
`supervisorAdmissionToSendReturnedMs`包含原pump及同步send／序列化和观测成本，
不是纯pending或真实Worker已执行／已确认。`semantic.queue.worker.dispatch.started`
保留Worker threadId及原回调receivedAt到dispatch的本线程单调时差；它不包括
消息尚未交付／同步compiler占用事件循环之前的时间，也不是compiler执行或CPU。
两线程时间不相减，不把两段相加冒充全部等待；日志不可用即缺证据，不改变请求结果。

无hold／额外test delay的普通私有fixture原始事件、完整payload／诊断已嵌入上述
最终原始log。OFF v1／v2完整响应51.590／31.043ms；ON 50.307／31.018ms，
父侧0.402／0.369ms，Worker段0.443／0.287ms。只有每配置两请求，不是独立真实
Settings对照、净收益、P95或L08毕业；正式性能计时仍关闭观察。
当前production input0039016a、server47aca4f2、semanticWorker a6ad72de，严格检查／
build通过。supervisor最终732行仍超500迁移债，core3256债未触及；runtime494、
新trace66、公开调度测试487、新测试141及故障fixture24行均未新增超限。
库存209／unit101／protocol8／bundle93／fast202，原非fast7不变。
下一切片补LSP suspend／在途结算及afterQuery条件性认证的独立成本，再做正常
真实输入等待／净成本及采纳判断；OP-03a仍IN_PROGRESS，不以最终550ms/PSS阻塞。
当前0039016a／新工具head的fresh完整check:fast尚未运行，旧1757不被升级复用。

## 2026-10-15：诊断结算、查询内整段认证和正式证据出口

父修订仍a111235b。原公开diagnostic-cache用例的完整返回／缓存快速命中／最新
诊断先通过，新增等待记录实际0≠1，RED0/1、exit1，前缀
`.bench/op03a-diagnostic-quiescence-red-v1*`，log SHA
`60b16cb8f978e1ae67005fb6afa5fb5d363ba0696f2c4a7d1ddd4e6bca0bdce1`。
仅将原cache miss后的suspend调用交给已有request runner观察，缺省／0直接
调用原suspend；1在原完整响应区间记录started／settled及单调时差。它包含
pending取消与原quiescence，不等于compiler CPU；settled只描述等待，不描述
请求成功。cache hit不进入观察；未设置／0／1三公开控制3/3、完整结果与正常
诊断保留，原私有1200ms delay只验证边界，不作普通性能。

第二项原即时v2导航／当前ready合同增加查询内整段认证记录，实际0≠1，
RED选中0/1／另15未选中，exit1，前缀 `.bench/op03a-query-certification-red-v1*`，
log SHA `61e3a381e55a3de4e8938b0d0504b28c106ab6619913638353235d968b0f91ad`。
观察在原query lease／request-local scope内包住唯一原semanticReadiness(query)
调用，包括输入构造、afterQuery及最后current admission；不把认证移到发送前，
不减少输入／检查、另建Program或强制准备。普通未准备查询不开始全根证明，
status及正常诊断也不产生查询认证事件；原缺依赖／取消／编辑等合同保留。

扩展原十二完整文件先92/93失败；诊断用原公开用例复现：正确v2查询内的旧
两源快照仍可返回内部ready，但随后新鲜公开status已degraded，原断言并未失败。
新增观察错误地混用这两个范围；范围字段改为queryScopeSemanticState，并要求
实际证明元数据后第二轮92/93暴露外层workspace没有加载成员事实。最终只从
本次原调用返回report取membershipRevision／coverage，不补造、不额外查询。
最小全生命周期8/8；公开根级非ready、semanticGeneration null、空能力和
显式准备后的Disconnected.ets／2307保护全部不变。不是修复compiler或放宽
公开ready。两次93失败及带标签复现均保留，临时DEBUG已移除。
最终事件名semantic.readiness.query.certification.complete只表示调用终态，
queryScope状态／范围绝不能作为新的公开根级ready或产品门禁。

同时新增公开CLI反例：reference trace0、queue trace1被旧采集器误标trace-off。
归类修复后，再以实际发布CLI证明伪造trace-off标签不能绕过queue flag；旧
reference trace两控制通过，新queue两控制RED。统一谓词接到采集器、bucket
summary、发布时延／产品内存入口；41完整消费用例通过。消费fixture只验证
工具，未创造真实产品测量；未覆盖的全证据正例／生命周期／平台仍未完成。
选名GREEN2/2另24未选中不冒充whole；通用whole审计因此拒绝，最终完整回归覆盖。

当前十六完整相关文件172/172，exit0／signal null、零skip／cancel／todo，
122767.610621ms；strict／build／diff检查通过。前缀
`.bench/op03a-wait-attribution-current-related-v1*`，log SHA
`d112c650307e66fc78e1c45493414761d5e3e63ee9162780e16edb7e4cf4444c`，
audit SHA `ec9d5cd8637ec47e1b44071309dc4a6db236b5c64aeadd1e5f2cabfee3a80187`。
源码／完整SDK／产物前后稳定、真实测试PID退出。当前production input
0fb92f3e、server9c52c111／semanticWorker80df72bf／diagnosticVerifier fd61f3dd；
referenceVerifier01f9551c不变，完整身份在相应identity文件。
type-engine500、entry115、runner383、readiness测试480／423、suite477／CLI测试474
均≤500；未触及core3256及supervisor732的既有超限债。库存仍209／fast202。

### 当前真实Settings有限观察

预声明OFF→ON两个串行fresh进程，每项原五场景、完整SDK、六默认开启、原
oracle／seed／180s期限；无hold／额外delay。初版NODE_OPTIONS误放ARKTS-only
runtime被预检RUNTIME_ENV拒绝，exit2且未启动server，原记录不覆盖；v2仅在
真实启动环境清空它，不放宽预检、不修改输入。前缀
`.bench/op03a-normal-settings-wait-observation-v2/`，cohort-plan在启动前冻结。

| 原场景 | 完整Locations | OFF正常完整响应ms | ON归因完整响应ms |
| --- | --- | --- | --- |
| 未查implementation | 1 | 1096.047 | 1198.807 |
| 未查references | 9 | 664.382 | 677.095 |
| 相同快照缓存 | 9 | 1.311 | 1.423 |
| v2新增引用 | 10 | 4912.015 | 5730.807 |
| v3删除引用 | 9 | 4527.680 | 4761.662 |

10/10逐完整oracle一致，两项最终完整版本诊断一致；原CLI均exit1、报告FAIL、
ready DEGRADED，SettingsDataUtils.ts:27真实缺@ohos.data.DataShareResultSet声明／
2307保留，最终时延／内存BLOCKED。不能因5/5 exact改标产品PASS或归咎版本匹配。
ON仅归因，三个引用quiescence为12.283／0.285／0.362ms；10项原成功send与
Worker dispatch逐ID配对。引用父侧段0.297–0.622ms，Worker回调后段0.215–0.892ms；
两个排队diagnose父侧约1119／1178ms是背景任务，不挪入引用CPU。1项仅入队无
send记录不表示执行，现有三事件本身不分类它的终止原因。
仅一项implementation查询认证0.110ms、queryScope degraded；未建立成功ready
意图，所以这不是有效full-ready refresh成本。未测消息交付／事件循环阻塞、
IPC／compiler／重叠成本不相加，不用两进程ON/OFF差值宣称优先级净收益或P95。
这组已测等待不能解释编辑数秒成本，下一归因优先编辑准备／完整fallback；
正常繁忙补全优先级净成本和真实成功ready刷新仍待，不把最终550ms前置。

OFF／ON原生审计SHA分别ccc7bf4f／4dbb2562；两份原始report／stdout／metrics／
RSS／manifest均重读散列、根CLI／server／sampler真实PID均退出，非物理PSS释放。
联合cohort-integrity SHA
`acfac21c44fd53208f4feb9a7530192238e269b581241f4caed0268f755fb432`。
OP-03a仍IN_PROGRESS；当前0fb92f3e／新工具head的fresh完整check:fast未运行，
旧5cf9d618／1757仍仅历史检查点，未请求合入main。

### 后续普通繁忙补全对照：工具故障已定位，净成本尚未验收

当前production1ab95acd完整check:fast1795/1795及独立审计b38d39c4通过，
不再沿用上段0fb／旧whole待跑描述。本批只在`.bench/op03a-normal-busy-priority-v*`
隔离实验目录工作，生产源码／六默认／预算／owner／协议均未改动。

反事实只从当前server产物的唯一队列predicate撤掉complete，server SHA由
9c52c111变为03ae3d55；其余74个Worker／stdlib文件逐字相同。原完整公开调度
五用例当前5/5，反事实4/5，唯一失败为原继承补全排序断言；完整payload、诊断、
取消／编辑／global及原期限保留。联合10项9PASS／1预期control FAIL，audit
`.bench/op03a-normal-busy-priority-v1/control-characterization-audit.json`。
私有hold仅用于这个功能表征，不进入正常性能测量。

预声明OFF→ON→ON→OFF四fresh进程、每组12补全／24逐版后台诊断；原Settings
HomeInitData新增普通成员访问overlay，后台为原AboutDeviceUtils／WifiUtils，
80/90/100/150ms用户侧发送间隔各三轮，完整SDK、trace-off、无额外诊断delay。
v1首组1次实际请求因oracle漏写显式public的detail失败，后三组未执行；9成员、
顺序及UTF-16替换范围均一致，但完整比较必须FAIL。独立普通class／public源码
表征通过后，v2仅修正这项预期，原失败、原慢值及未执行分母不覆盖或混池。

v2首组最终写盘真实ENOSPC，空report后外层JSON.parse异常；原状态残留RUNNING，
实际外层会话65839已exit1、原CLI46175／server46205均退出。server日志12项ok
不证明客户端完整payload已保留；内层／server退出码未持久化，不补造0。
后三组未执行，净成本仍NOT_COMPLETED，独立外部终态审计SHA
`9c1e099497f56594c1c946088727bda2c845816cd28aaafbceec6fe41d7dc653`。
只删除两个已关闭实验的4个SQLite派生DB/WAL/SHM，共1051828664字节；原进程／
lsof无占用及逐文件SHA先验证，10份原始证据完整，缓存可由固定输入重建。
清理前审计08126a3e；未删除源码、数据集、report、日志或原失败状态。

以实际stdio／真实compiler完成后，仅在私有最终文件写入边界注入ENOSPC，
不填满磁盘／伪造响应。两次独立TDD：空报告终态原RUNNING≠TERMINAL，RED后
只补解析错误留存，真实child exit2及三个未执行组进入FAIL终态；第二项原已完成
结果仅在内存，RED后增加有序逐事件文件，完整原响应／UUID、当前诊断、逐轮
全字段比较及真实退出在最终汇总失败后仍可读取。原无journal的12项日志不据此
追认合格；后续采集器多了原始记录I/O，不能混用旧计时或冒充无观测CPU。

v3两完整工具文件4/4、exit0／signal null、零skip/cancel/todo，14327.574689ms；
log SHA `569110c531888f0f6926b10b3bbdb898f8ba991f15a5a5b34a5189dbe144113e`，
audit SHA `4267f371f25d1be4572373624ed7299d38892a184ccdee5b2931104678f4f99a`。
driver158／runner76／test113、108／故障fixture14行，完整当前实验源码另归档；
main库存／生产输入1ab95acd未变，原1795仍是产品代码基线，不是新实验工具全量。
下一步先固定充足磁盘及逐会话关闭缓存整理方式，再完整执行预声明四组并独立
比较全部payload／诊断、RPC与变更到完成时间、原始RSS。普通繁忙净成本、成功
ready刷新、OP03b及其余OP00/04/05/06/L08范围仍开放，不把550ms／PSS前置。

### 2026-10-15：固定四组普通繁忙补全实测已完成

关闭缓存整理先经公开TDD：只清理精确派生SQLite文件，活动原生fd／未知源码
必须拒绝，原始报告／事件／日志不动；真实四会话先RED，最小接线后逐会话
exit0、PID退出与lsof关闭验证、清理收据先于下一次启动。三完整工具文件8/8，
23144.99075ms、exit0、零注解，log0bb3c2dc；所有手写实验脚本／测试≤158行。
v3新首组准备阶段仍实际ENOSPC，0个测量RPC，FAIL／三个未执行及完整错误／
诊断／原生exit0已保留；不把这次失败变为计时样本。再整理明确关闭的当前
392097792字节及旧OP05缓存950888512字节，后者35份原始证据保留。

新v4启动前实查空闲3304349696字节（约3.08GiB）；完全相同的v3采集器／runner／
清理字节，原Settings输入／完整SDK／六默认／预算／顺序／12轮／间隔／原期限／
public完整oracle不变。`.bench/op03a-normal-busy-priority-v4/`四组只各运行一次，
真实会话87555已exit0；48/48完整补全及96份当前后台诊断跨四组逐字段相等，
完整原始响应／UUID、事件日志、身份、采样和实际退出重读审计PASS。
每组结束后只清理392097792字节的已关闭派生缓存，共1568391168字节；散列／
关闭／原始证据保持收据齐全，清理不与下一组计时重叠。

| 固定序列 | 完整补全P50 / 观察P95（ms） | 最新后台诊断观察P95（ms） | 采样进程树RSS峰值（MiB） |
| --- | --- | --- | --- |
| OFF正序 | 2583.183 / 23137.315 | 12682.192 | 2073.609 |
| ON正序 | 13318.711 / 15010.825 | 25386.590 | 2180.352 |
| ON反序 | 1677.382 / 15130.015 | 19193.641 | 1965.711 |
| OFF反序 | 2479.613 / 17446.181 | 11586.178 | 1701.930 |

每组仅12次，nearest-rank P95即该组max，不是正式P95。合并每状态24次，
补全P50 OFF2522.892／ON10748.473ms，观察P95 OFF19072.358／ON15010.825ms。
ON24次在第二份诊断发布前返回；OFF23/24在两份发布后返回，另1次发布顺序
不同，不以客户端通知顺序冒充精确Worker执行边界。单predicate控制确实改变
用户可见排序，但快慢、诊断延后及RSS代价不能只选一个尾值解释为稳定收益。
默认策略下实际transient诊断start/complete分别8/13/5/3对；这是原运行日志事实，
不是额外trace或所有慢值唯一原因。原始慢值、压力影响及两方向差异全部保留。

四组公开ready均DEGRADED，必要DataShareResultSet声明缺失2307继续报告；
不能认证ready后550ms。协议留存有同步I/O，客户端时间含采集成本，不当纯CPU。
RSS请求采样100ms，实际间隔中位151.0–151.9ms、P95 162.3–163.4ms、最大313ms，
不是连续峰值／PSS。独立联合audit SHA
`4692ffbdf37bb18c810fe6201447040ae41452e522936c3b4666bf897a858879`。

决策：本次预声明普通繁忙对照已收口，不追加有利采样；没有稳定整体净收益
可宣称。保留ADR0006中已由完整公开反例证明的一次越过正确性修正，不另加生产
开关或扩展调度／owner／并发，不把排序修复宣传为整体提速。OP03a仍IN_PROGRESS：
成功ready刷新成本及按证据消减重复准备仍待；将已观测的慢准备／回退／压力成本
转回OP00/04/05，OP03b／OP06/L08范围继续。production1ab95acd与1795基线不变。

### 成功READY后的普通编辑认证成本基线

同日复用既有`generate-large-fixture`与公开`replay-references --prepared-suite`，
未新增生产代码、采集器或SDK声明。固定生成1000个workspace文件／500个active
依赖，实际项目成员501；完整安装SDK、原语料seed20261015、当前production
1ab95acd。私有语料git HEAD61cbf50e，6清单启动前全部通过现有严格预检。
每对normal(trace0)→attribution(queue trace1)，三对串行、每份仅执行一次；
每会话先公开prepare（零目标预查询），未查定义／相同快照／6次body编辑／
最后repeat，共9查询。每次编辑绑定完整oracle与最新诊断屏障，磁盘源码不动。

六会话公开状态实际READY，54/54完整定义位置与源声明oracle相同；54个查询
的公开当前证明独立重算overlay摘要／输入identity摘要／代次／coverage，36次
编辑后sourcesSha及generation变化，最终status与末次证明一致。42份v1–v7完整
诊断均为空。实际coverage每次project501／SDK255／stdlib52／Program869，完整
依赖证明成立；不是把Settings缺必要输入的DEGRADED改标READY，也不由生成
样本推出真实产品／全部workspace语义能力已毕业。

| 固定会话 | 正常／归因编辑RPC P50 / 观察max（ms） | 编辑查询内认证P50 / max（ms） | 采样进程树RSS峰值（MiB） |
| --- | --- | --- | --- |
| normal1 | 828.458 / 854.552 | 未开启观察 | 407.316 |
| attribution1 | 858.579 / 895.948 | 522.562 / 572.541 | 411.551 |
| normal2 | 826.715 / 860.146 | 未开启观察 | 412.980 |
| attribution2 | 868.029 / 902.014 | 526.102 / 573.114 | 410.551 |
| normal3 | 892.682 / 921.137 | 未开启观察 | 382.438 |
| attribution3 | 861.867 / 904.430 | 521.574 / 571.519 | 377.461 |

正常未查定义409–436ms、同快照repeat185–193ms；样本数不足正式P95／五会话
门禁，不作正常／trace差值净收益。三个归因进程各9条实际query certification，
均queryScope ready／membership1／501项目源，与各自公开当前证明元数据对应。
18个编辑认证每次869个不同实际SourceFile检查，共15642次，原完整API调用
wall记录之和45.7–106.0ms；整段认证500.8–573.1ms，未编辑认证120.6–127.3ms。
这是同线程嵌套wall观察，不当CPU／内核I/O或把各层重叠时间相加；不能把
869次调用等同869次完整重新类型检查。输入构造／原afterQuery／最后admission
仍在完整响应内，所有原输入／缺依赖／取消／生命周期保护不因这组观察删减。

六原CLI全部exit1／报告FAIL保留：ready与诊断gate PASS，其它时延／内存BLOCKED、
平台／生命周期NOT_RUN；真实server均exit0、实际PID已退出，不证明物理释放。
普通样本trace-off，queue1仅attribution-only，不能进入正式时延／内存门禁。
前缀`.bench/op03a-successful-ready-refresh-v1/`保存全部manifest/report/raw RSS/
原生metrics、真实终态及完整源码归档，联合审计SHA
`b3079b3fb0a0e2649805120dd972647988279464210b38c3e4245d3e3e7730cf`。

仅“成功ready刷新实际成本未知”缺口收口，OP03a仍IN_PROGRESS。下一切片先给
紧邻重复输入认证建立可重复的公开计数反例，区分真正开始／返回前新鲜度与纯
重复计算；若调整校验位置，完整输出构造之后仍必须有真实最终guard。不能以
语句相邻／相同快照为由缓存有效性、跳依赖检查、移出响应或增owner。按固定
净成本规则决定采纳／回退，不用最终550ms阻塞本切片；其它OP及L08范围继续。

## 2026-10-15 新准备证明的重复 admission 切片

父修订仍为a111235bc4bfcb55b126752f95b3ba095f2996af。先以原readiness／
lifecycle及登记四完整文件28/28表征，再在真实stdio子进程加入公开计数反例。
私有native观察只统计真实SDK叶文件lstat，不改变返回值；原实现每次10次，
区分四次必要观察、两组独立开始／最终admission各两次、紧邻返回的额外两次。
首个预算4的失败留存，修正为准确预算8后原代码仍10，RED0/1、exit1。

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test \
  --test-reporter=spec --test-concurrency=1 \
  tests/semantic/semantic-readiness-admission.test.mjs
```

RED前缀`.bench/op03a-ready-admission-red-v2`，log SHA f663ca24。
另一原代码表征在完整输入identity哈希期间真实修改SDK，保持大小／mtime；
公开准备必须撤销READY与能力。恢复走正常配置重绑定与新overlay，再显式准备。
初次恢复预期失败保留，修正恢复协议后选中1/1通过（非whole，另一项未选中）。

仅生产readiness模块215→223行：新prepare返回刚构造的report，query失效刷新
也直接使用这份report；未变化的query及readonly status仍走原新鲜度检查。
完整report／UUID／identity digest先构造，随后真实最终proof.admit仍检查当前
输入，通过后才发布proof与program ID。不缓存有效性、不省依赖诊断、不移出
完整响应，不改变取消／degraded刷新意图／owner／预算，也无新增开关。
新SDK变更撤销、构造期间变更撤销及恢复均通过；四完整文件30/30、exit0，
audit f3f850f1；十二完整相关文件70/70、exit0、零注解，audit6e89d05f。
strict／build通过，生产input eabe24ef；旧1ab95acd whole1795不覆盖它。

受控采纳对比固定baseline→candidate→candidate→baseline各一次，不追加样本。
保留旧真实75份产物和原215行模块；同一esbuild配置先逐字节复现新旧四份生产
bundle，再仅替换该模块，并对双方作相同原生产__filename／stdlib路径规范化。
因此下表是路径规范化诊断variant，不冒充直接生产artifact计时。构建审计fc67fb7f。
真实完整SDK／同一固定1000-workspace／500-active语料、六默认开启、trace／
overlay-sync／snapshot均0，无preload／hold／强制GC；每组9个完整请求、6次编辑。

| 固定组 | 编辑RPC中位／观察最大值 ms | 采样RSS峰值 MiB |
| --- | --- | --- |
| baseline-forward | 968.378 / 1009.806 | 423.715 |
| candidate-forward | 883.679 / 945.358 | 381.262 |
| candidate-reverse | 901.196 / 945.239 | 367.855 |
| baseline-reverse | 985.707 / 1071.193 | 413.180 |

36/36完整Location／36份当前公开READY、24次编辑／28份最新诊断一致；实际输入、
覆盖、SDK／stdlib／构建／源码及原生退出独立审计PASS。两方向中位改善约8.6–
8.7%，观察尾值和采样RSS也更低，支持局部采纳；样本最大值不称正式P95，RSS不
称PSS或物理释放。原四CLI1／FAIL保留：ready／correctness PASS，其它最终门禁
BLOCKED／NOT_RUN；不是Settings、全产品或550ms毕业，不与旧54观察样本混池。
全部原始证据`.bench/op03a-ready-admission-adoption-v1/`，联合审计SHA
`125adc354b2e7d84142790de65f4dc7d2a5e49d7e73bea63b409d680124820d1`。
当前eabe24ef仍需全新203-fast入口完整check:fast；OP03a保持IN_PROGRESS，
慢准备／压力回退、未打开入口及其余OP／L08合同不缩减。

## 2026-10-16 完整回归终态、冷准备复现与未打开入口

eabe24ef新完整203-fast入口原check:fast终态1779/1797、18FAIL、exit1、
零skip/cancel/todo，3986965.985619ms。源码／全部入口／实际启动器／SDK／
产物前后一致及根PID退出独立审计PASS，SHA d16e6667；原完整FAIL保留在
`.bench/op03a-ready-admission-current-whole-v1/whole*`，不称当前whole GREEN。
失败为原5s交互／诊断、20s的403源引用及一次hover采集；未放宽原期限。

两个原完整启动／采集文件只复现一次11/11、exit0（audit8bb87cbf），另五个
原完整文件只复现一次90/91、exit1（audit66d25627）；源码／SDK／产物均未变。
此前5s失败未在独立集合重现，不宣称修复。403引用再次在带声明请求超时：
第一份无声明完整结果约19.4s、cache repeat约0.83ms，后续完整请求未完成。
按diagnose区分重复冷准备、anchor覆盖和索引时序假说，再仅原403用例trace1
归因一次：选中1FAIL、另2未选中，不当whole或正常性能对照，audit0fdb64ac。
从原日志恢复精确PID35294的82条完整native事件，SHA
`2b21925b7df0f22d22a5971259ca93fd9e1838d629224d31ebdd0577bb54b663`；
14批启动／13批完成。首次7批完整返回2个Location；每批完整SDK255，Program
准备约2.0–2.5s，查询多为3.5–4.4ms，最后有效批约103ms。带声明请求先有
约2.8s／project1的anchor且definitions0，再进入7批保守完整搜索，第7批未终态。
索引已ready仍发生该fallback，故索引时序不能单独解释；冷Program是已证实的
主要成本，尚未修复，不删完整scope、放宽期限、跨批留LS／AST或增加并发。

用户2026-10-16确认两种入口都支持：已打开caller导航到未打开模块，以及直接
对从未didOpen的源发送语义请求。后者按独立公开入口合同实施，不靠benchmark
预先打开目标。首条真实stdio RED：私有SDK fixture根（full profile）已公开READY、两源
均未打开，直接Main→Unopened definition实际[]而非完整精确Location；
871.153012ms。新增测试还要求查询后overlay digest不变、无合成didOpen诊断。
连同完整登记测试4/5、exit1，audit0e45a55f；production仍eabe24ef，登记现在
211总入口／204-fast。前缀`.bench/op03a-unopened-source-definition-red-v1*`。
下一项实现真正disk-source权威与执行／返回前新鲜度保护，逐能力公开RED→GREEN；
不是把disk文本伪装成open overlay。当前入口未实现，OP03a／L08保持IN_PROGRESS。

## 2026-10-16 两种入口：真正请求级disk source及三个公开能力

承接上节RED；父修订仍a111235bc4bfcb55b126752f95b3ba095f2996af。用户已确认
opened caller→unopened module与直接never-didOpen source均支持，未新增LSP
参数／能力／开关。先以五原完整文件86/86保护现有合同；纯责任提取后六原
完整文件94/94，再实施首条definition RED的最小GREEN5/5。字符位置保持UTF-16，
使用真实stdio framing／子进程、锁定compiler与full profile私有测试SDK fixture，
不mock结果。该fixture只含测试声明，不冒充本机安装SDK的全量产品执行。

```sh
PATH=/Users/liuhui/.nvm/versions/node/v20.19.5/bin:$PATH NODE_OPTIONS= \
  /Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test \
  --test-reporter=spec --test-concurrency=1 \
  tests/semantic/unopened-source-query.test.mjs \
  tests/semantic-worker-disk-source-protocol.test.mjs \
  tests/test-layer-manifest.test.mjs
```

LSP先启动workspace freshness，再由已有source authority解析canonical／实际
physical最具体root、有界regular UTF-8磁盘文本。只读source字段与显式Worker
diskSource传输表达磁盘权威，不用version0猜来源、不sync成overlay、不写Worker
open map、不增加mutation revision。仍走原semantic owner／Program准备及预算；
返回前重新检查实际磁盘身份、overlay竞争、请求代次与取消。磁盘call-hierarchy
follow-up也改用请求级source，不再临时open/close。真实open version0正常sync／
close，不能与server内部disk snapshot所用的数值0混淆。

每个进一步能力独立公开RED→GREEN：typeDefinition13/14→14/14，独立opened
caller完整class Model位置正确而未打开源原为[]；hover14/15→15/15，独立opened
caller完整markdown／Unicode文档／range正确而未打开源原为null。仅各自LSP与
严格Worker白名单准入，不把其它未验证方法一并放开。已存在opened caller路径
继续验证，两个入口逐字完整oracle一致，不靠基准预didOpen目标或caller。

新增公开保护：无通知同size／mtime源变化必须读到新绑定；查询后旧READY撤销，
显式prepare后新sourcesSha与相同空overlay digest恢复。真实Worker.postMessage
原send返回后私有fixture修改实际磁盘，保留native PID／requestId／sentText见证；
旧请求不得发布旧Location，显式准备后完整新结果恢复。fixture仅此受控case启用，
不当普通计时／净收益。物理symlink逃逸、根外文件、目录拒绝后同进程有效查询
恢复；真实open版本7优先，close后磁盘权威恢复。早取消只发一次标准-32800
`Request cancelled by client`，之后无需先prepare也能冷disk查询；整个完整framing
转录dropped0、只有一个终态，不只数已消费的response队列。

真实client version0反例也保留：open0新overlay定位正确，但close后disk请求
返回-32603；旧engine.close以version0当disk而跳过清理。显式source判别及原disk
follow-up迁移后24/24，新增open0完整prepare/outgoing oracle后四文件25/25；
八个原resident call-hierarchy case（含L3／取消／最新诊断）全部通过。

严格协议保持own-data无getter执行／exact keys／不可变副本／原4MiB text与8MiB
escaped wire上限，磁盘文本与256KiB查询args分开但仍计入原消息总预算。只准
define／typeDefinitions／hover的expectedVersion0及原incoming/outgoing跟进的
expectedVersion null；其它direct方法仍拒绝source，不因宽传输扩大能力承诺。

| 冻结证据前缀（均在`.bench/`） | 完整终态 | 独立audit SHA前缀 |
| --- | --- | --- |
| op03a-unopened-source-contract-before-v1 | 86/86，exit0 | 6540a030 |
| op03a-unopened-source-extraction-v1 | 94/94，exit0 | b06ce09b |
| op03a-unopened-source-definition-green-v1 | 5/5，exit0 | 30335d32 |
| op03a-unopened-source-type-definition-red-v1 / green-v1 | 13/14 FAIL → 14/14 PASS | 13ed7086 / be92c316 |
| op03a-unopened-source-hover-red-v1 / green-v1 | 14/15 FAIL → 15/15 PASS | 9ab6448c / a0b88a46 |
| op03a-unopened-source-version-zero-red-v1 / green-v1 | 15/16 FAIL → 24/24 PASS | 4877650a / 3ceb9673 |
| op03a-unopened-source-version-zero-calls-v1 | 25/25，exit0 | b9867f3a |
| op03a-unopened-source-current-related-v1 | 十六完整文件229/229，较早构建 | 03ec3bb3 |
| op03a-unopened-source-current-related-v2 | 当前十六完整文件233/233，exit0 | 2260f860 |

中间失败不覆盖：fresh-disk-v1为错误预期无通知修改后仍READY（实际新结果正确），
修正为撤销／显式准备恢复后v2通过；cancellation-red-v1确有非标准错误文案，
最小修正后green-v1错误地从已消费队列数终态而失败，改为整个framing转录后
green-v2通过。原日志／源码归档／退出／独立审计均保留，不删除失败样本。

最终current-related-v2执行上列三个文件及原Worker协议／supervisor／调用层级
协议、readiness admission／lifecycle／原readiness、resident call hierarchy、原LSP
call-hierarchy reliability／workspace freshness／characterization／document lifecycle／
diagnostics／call hierarchy，共十六完整文件，原期限与六项默认不变、并发1。
233/233、零skip/cancel/todo、206457.25452ms、exit0／signal null；全部1730源码
归档、SDK／构建／实际子PID退出独立审计PASS。当前production input
`78112f9767f4f378bd291b9076f207162d0c0b8ebb501b901a6da426d426cffb`，
stdout SHA `760a666354b45e13a0b83dd4c8e2c7c4964df778ee9c28d18a4bcc27f8b3cf1c`，
terminal audit SHA `2260f860634a411a73136e102ac778be75a3ee321158b9fa52d2a2a1b48f4a86`。
strict／build通过；212总入口／205-fast。新handwritten均≤500；触及的旧超限
责任经表征提取缩小protocol1927→1904、proxy550→522、legacy917→901，仍有债务。

这是三项直接能力及原保护的功能GREEN，不是全部未打开能力、真实产品P95／
PSS／物理释放或新whole。旧eabe24ef whole1779/1797 FAIL、403冷Program超时
及未定位旧5s失败继续保留，当前205-fast完整check:fast NOT_RUN，合入前必须新
完整GREEN／分支PR。下一项对completion／signature等逐能力公开RED→GREEN，
其它配置／未知在途／压力与OP00–06剩余合同不缩减。六默认、一个owner、最多
两个context、1024MiB、verifier并发1及逐批终止不变；OP03a／L08 IN_PROGRESS，
最终550ms／内存门禁不前置阻塞这些切片。

## 2026-10-16 继续：签名、补全及解析、调用层级完整链路

沿用同一父修订与用户两种入口授权，逐能力垂直推进，不整体放开Worker白名单。
signatureHelp公开RED未打开源实际null，独立opened caller完整签名／两个参数／
activeParameter1／Unicode文档正确；18项17/18→18/18。仅LSP／wire方法准入，
开始／最终物理source guard及原准备／取消保持，非新scheduler或owner。

completion公开RED实际空列表，而opened caller返回完整run／value。最小接入
保留请求内已验证snapshot的URI／version供原LSP mapper使用，不创建TextDocument
或overlay。逐个验证opaque UUID只含原单字段且唯一，再只排除这些不透明ID，
其它完整item／textEdit／列表字段逐字比较；不只比标签或数量。原256条输出与
512条resolution记录界限不变。五原完整文件44/44保护之后，纯提取completion
mapper127行、再跑同五文件44/44；server792→670，行为不变。

completion resolve再建立独立公开RED：opened caller完整文档／detail正确，
disk条目却被-32602拒绝。最小修复为有界服务端记录增加exact disk SHA；每份
列表只算一次hash，不为每条重复hash、不额外驻留磁盘文本。解析在原请求区间
重新取得真实磁盘文本并比SHA，拒绝source竞争；普通open版本校验保留，client
version0仍普通open。只信server保存的completion，客户端伪造label不能替代。
同size／mtime真实注释变化后，旧句柄-32602且无result；显式prepare的新sourcesSha
变化／overlay摘要不变，重新补全和解析后完整oracle恢复。disk不调用sync或
open-only version-bound preResolved捷径；全部原取消／伪造／stale保护继续通过。
五完整文件44/45 RED→45/45 GREEN，不外推auto-import等未补的直接场景。

prepareCallHierarchy独立公开RED：opened caller完整prepare／outgoing／incoming
均精确，而未打开源报-32803 source-unavailable。仅将原prepare的已验证disk
resolution构造成显式server-owned snapshot，沿原回调／Worker／owner执行；
保留结果工作预算、每个结果源physical验证、取消与最终source identity guard。
完整item的URI／name／kind／range／selectionRange／root data及两个方向全部
fromRanges逐字段相同，root READY／空overlay摘要／零合成诊断保持。
五完整文件45/46 RED→46/46 GREEN；follow-up已有的明确incomplete/stale语义
不变。合计七种直接文档方法及两种既有follow-up链路，不类推其余direct能力。

| `.bench/op03a-unopened-source-`后缀 | 原完整终态 | audit SHA前缀 |
| --- | --- | --- |
| signature-red-v1 / signature-green-v1 | 17/18 FAIL → 18/18 PASS | b876384d / aa166c24 |
| completion-red-v1 / completion-green-v2 | 18/19 FAIL → 44/44 PASS | 4bff610e / de05a2ef |
| completion-mapper-v1 | 同五文件44/44，纯提取 | fd30482c |
| completion-resolve-red-v1 / completion-resolve-green-v1 | 44/45 FAIL → 45/45 PASS | bcb78e76 / 080f02eb |
| call-prepare-red-v1 / call-prepare-green-v1 | 45/46 FAIL → 46/46 PASS | 99b8e950 / a5098f36 |
| current-related-v3 | 十九完整文件271/271，exit0 | bc4ebe96 |

completion-green-v1启动器误漏`--test --test-reporter=spec --test-concurrency=1`，
只执行首个文件12/12、实际native0，但recorder2／counts null；其余四路径只是
普通脚本参数。原state／TAP／源码／退出和invalid-invocation audit21e3722f保留，
不冒称五文件GREEN，也未改写为正确命令。无产品修改后修正命令green-v2，才
取得真实五文件44/44；这是修正无效执行，不是重跑产品失败追求有利值。

最终v3固定Node20原test runner／SPEC／concurrency1，完整执行v2十六文件，加
原lsp-reliability、lsp-transcript、resident-session-interactive三完整文件。原请求
期限、完整SDK profile、六默认及所有原保护不变；测试各用自己的私有SDK fixture，
完整安装SDK／Settings身份额外前后核对，不据此声称测试用了安装SDK或产品计时。
271/271、零skip/cancel/todo、286817.898202ms、exit0／signal null；1731份源码
归档、全部产物／SDK与实际PID缺席独立审计PASS，strict／build通过。
production input `dce6888a38bbde2723c59c9b0d95508dbeb2d4148a973a5d64315583f9f6dbfa`，
stdout SHA `60a48119ad064f2bc0683ec815c1e0afdb63b0dda77e262a309938ac224e6b27`，
terminal audit SHA `bc4ebe9644748e35cd1b8a3e776029408598b0b99076684274b7d7532df3c47a`。
当前新文件／测试≤500（unopened测试474、mapper127）；最终server792→677、
protocol1927→1906、proxy550→522、legacy917→901仍是已缩小但未清零的迁移债务。

库存仍212总入口／205-fast；当前新whole NOT_RUN，旧1779/1797 FAIL、403源冷
Program超时、未定位5s失败与旧77/78生命周期问题不被这些PASS覆盖。下一项
references两声明策略／implementation／prepareRename／rename直接入口，以及
原未知输入／配置／压力和OP00–06剩余合同；不放宽完整结果、预算或原期限，
不重开S05，不追加已收口候选采样。OP03a／L08保持IN_PROGRESS，未合入／push，
合入仍需新完整check:fast GREEN和分支PR；最终550ms／PSS不作为前序门槛。

## 2026-10-16 全部核心入口基本合同、引用缓存与共享请求保护

前轮271基线与post-docs工作树逐字复核通过（80ad6316）；父修订仍a111235b。
继续用户已授权的两种入口，不新增LSP参数、能力或生产开关。新测试独立放在
`tests/semantic/unopened-workspace-query.test.mjs`，保留原474行source测试不超限。
implementation独立opened caller完整3个workspace实现均正确，disk实际[]，新
入口未登记也被清单拒绝：6/8 RED→最小准入／登记8/8。原Workspace全scope、
物理source权威与最后guard不缩减。库存现在213总入口／206-fast。

```sh
PATH=/Users/liuhui/.nvm/versions/node/v20.19.5/bin:$PATH NODE_OPTIONS= \
  /Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test \
  --test-reporter=spec --test-concurrency=1 \
  tests/semantic/unopened-workspace-query.test.mjs \
  tests/semantic-worker-disk-source-protocol.test.mjs \
  tests/test-layer-manifest.test.mjs
```

GREEN保护后将disk方法／版本准入提取到原disk-source模块，六完整文件62/62。
提取首个strict报TS2345（unknown未被旧boolean检查窄化），参数接受unknown并
仍做原精确比较后strict／build通过；不以失败类型检查的构建取得回归资格。
协议1906→1901，未扩大方法／版本或4MiB文本／8MiB消息界限。

references两声明策略分别完整比较3个使用位置／额外原声明，repeat也相同；
disk原-32801 RED8/9→GREEN9/9。parent不把disk sync成open；owner准备与anchor
显式消费disk snapshot，core position不携带客户端overlay版本。先前未准备／未
打开／未预查询的cold两策略10/10，也不新增首次准备豁免。

进一步真实修改另一文件，把一个引用改到其它函数，保持size／mtime、查询源
字节不变、无通知。旧key仍返回已删除Location：10/11 FAIL。使用diagnose的
公开循环区分三假说：父结果cache、owner旧源、位置映射。仅增加另一声明策略
的未查询cache-miss对照、产品不变：新策略已返回当前完整集合，旧key仍陈旧，
再10/11 FAIL；因此定位cache准入，不改compiler／位置映射冒充修复。

新增38行`reference-cache-admission`：disk hit通过现有owner只读readiness核验
当前完整READY代次／identity SHA／对应声明策略，cache存储要求查询前后相同
证明。status prepare=false不建立Program或伪造READY；无证明／漂移走原完整
resident-first／candidate／verifier查询，不返回空数组。不关闭cache：独立正例
明确观察到真实disk cache hit。proof字符串计入原128条／8MiB缓存预算，不跨
Worker传LS／AST／SourceFile，不额外驻留整源；普通open缓存没有额外owner
请求。端口允许异步admission，原消费者await，全部等待仍在完整响应计时内。
11/11 GREEN后位置适配移到原interactive-workspace，legacy901→885；十二完整
相关文件93/93保护原cache绕过诊断、resident miss／编辑／取消与新鲜度。

prepareRename事务客户端能力已正确协商，opened完整range／placeholder正确而
disk -32801：11/12→12/12。rename首次13项失败是测试选中了local import alias，
却错期待改origin；实际正确添加`neverQueried as freshlyBound`并只改caller。
保留该FAIL，再将全局oracle定位到origin声明，opened完整两文件正确而disk仍
-32801：12/13 RED→13/13 GREEN。逐字段比较所有edit／URI／range／null或open
version，用受控版本应用WorkspaceEdit后全部文本正确；服务端磁盘不写、非法
newName无edit。另增local alias表征14/14，明确保留origin语义，不弱化oracle。

相同未打开源引用并发，原先前一参与者错误-32801：14/15 RED。最小接回已有
coalescer，重叠请求的真实读源与执行共享；每位client仍有自己的freshness／
cancel，实际共享操作独立于首位client token。未通知物理变化继续最后source
guard裁决，URI／key不被当新鲜度证明，不增加语义并发。15/15 GREEN且一次
实际`references.coalesced`。沿用原600ms verifier窗口／trace只作机制保护：取消
首位只得一次标准-32800，survivor完整、后续恢复16/16；真实磁盘写入＋标准
watched通知使两旧请求都ContentModified／无result，最新查询含全部新增引用、
完整framing每ID单终态／dropped0，17/17。没有把私有延迟当正常成本。

| `.bench/op03a-unopened-source-`后缀 | 原完整终态 | audit SHA前缀 |
| --- | --- | --- |
| implementation-red-v1 / implementation-green-v1 | 6/8 FAIL → 8/8 PASS | c424e0ad / 05e6c285 |
| admission-extraction-v1 | 六完整文件62/62 | 097095f4 |
| references-red-v1 / references-green-v1 | 8/9 FAIL → 9/9 PASS | fac492ae / 11b6bad1 |
| references-cold-v1 | 10/10 | 930b0cca |
| references-disk-freshness-v1 / v2 | 两次10/11 FAIL，单变量公开对照 | 973632b2 / 21544e43 |
| references-disk-freshness-green-v1 / references-related-v1 | 11/11／十二完整文件93/93 | 22cf91f4 / 02bb0eb1 |
| prepare-rename-red-v1 / prepare-rename-green-v1 | 11/12 FAIL → 12/12 PASS | 3c4c5b49 / 5afadd5a |
| rename-red-v1 / rename-red-v2 / rename-green-v1 | 错误alias预期FAIL／正确origin RED → 13/13 | 37a94b7f / 48e4a2f1 / b8387a84 |
| rename-alias-v1 | 14/14 | 7a75f28c |
| coalescing-red-v1 / coalescing-green-v1 | 14/15 FAIL → 15/15 PASS | 6d4e8a82 / 19665dd0 |
| coalescing-cancel-v1 / coalescing-edit-v1 | 16/16／17/17 | 2001fc19 / a2999c7b |
| current-related-v4 | 二十八完整文件313/313，exit0 | b36e8173 |

最终v4完整执行v3十九文件，加新workspace源测试、原result-cache／diagnostic-cache／
resident-first miss／edit-admission／diagnostic-scheduling／coalescing／rename-completeness／
capability-contract九文件；无选中／跳过、原期限不变。新基本入口正例六默认ON，
1024MiB／full SDK profile；原回归保留各自压力／反事实配置，不混为单一性能组。
新增源测试用私有SDK fixture，整轮其它测试各用既有环境；安装SDK／Settings身份
额外前后核对，不冒称全部使用安装SDK或正常产品计时。
313/313、零skip/cancel/todo、379799.563245ms、exit0／signal null，1733份完整
源码归档、全部产物／SDK与实际PID缺席独立审计PASS；strict／build通过。
production input `bd4010b6532a6a5f377099b2f0c416565f99ef2d2be3a042e88c2a651c8545b1`，
stdout SHA `b8ea3f17b843729d3350a1fb66fc2e91336cc803bd2abf8a3e660dc67544d934`，
terminal audit SHA `b36e817314f061e7905ba629a20f62b0582e652748de85f065808da3c2592b93`。
新workspace测试356／cache admission38／disk runner84行，新增均≤500；旧触及
债务protocol1906→1901、legacy901→885、proxy522在提取后未增长；server677为
前轮剩余债务。未修改默认batch roots64、六默认、预算、owner／context／并发或
逐批LS／AST终止合同。原FAIL及所有中间源码／日志／审计不删不覆盖。

核心14项两种入口仅基本功能／完整oracle缺口收口，不等于所有8桶×3平台或
≥100请求／≥5会话、P95／PSS／物理释放／真实客户端验收。当前206-fast新whole
NOT_RUN，旧1779/1797 FAIL、403冷Program超时、未定位旧5s及77/78问题仍保留。
下一项真实完整SDK的新路径／证明成本、减少重复冷准备且保持预算的候选与
更多配置／压力／生命周期／soak／平台合同；不能提高预算、删scope／SDK、增
并发或跨批留LS／AST换通过。OP03a／OP00–06剩余范围及L08 IN_PROGRESS，目标
仍active；新完整check:fast GREEN＋分支PR前不合入，最终550/PSS不前置阻塞。

## 2026-10-16：完整回归、未打开基准合同与安装 SDK 的首次查询成本

父修订a111235bc4bfcb55b126752f95b3ba095f2996af、分支codex/op00-query-attribution。
本批生产输入始终bd4010b6532a6a5f377099b2f0c416565f99ef2d2be3a042e88c2a651c8545b1，
server9ae12f908c051223aa322cd443674f32c714683007e970782895b6f901593d5a；
没有修改生产、Rust、默认组合、SDK/scope、预算、并发或期限。

### 原完整206-fast真实终态，不用内部子摘要替代

公开retained collector执行原`pnpm check:fast`，Node20.19.5，根环境无产品实验
覆盖或observer。真实终态1822 PASS/1824、2 FAIL、exit1/signal null，零
skip/cancel/todo，3043887.808356ms；source/build/完整安装SDK/实际启动器前后
一致，原PNPM PID56127退出。原403文件case在本整轮通过，35146.655197ms、
原20s请求期限不变；这不是已定位旧超时根因或产品SLO通过。
前缀`.bench/op00-cold-batch-current-whole-v1/whole*`；独立audit SHA
5e4670c8b799dd90647542f180fe2e40fc23939626995bfea3ea98d4c9714019。
历史1779/1797、其它未定位5s/77/78和所有FAIL继续保留。

两条真实失败：

- `prepared-suite-semantic-readiness`旧用例把生产未打开definition的空结果当作
  负例前提。新入口已返回完整正确Location，原`correctness.equal===false`
  断言失败；不是结果变空或READY证明失效。
- `references-anchor-reuse`构造器用例在indexed profile的seed拒绝事件断言失败；
  当时还没有执行最终四profile全集对照。后续单例及完整文件通过，不能因此
  抹掉原FAIL或宣布根因已修复。

### 公开基准合同修正，空响应负向保护不删除

原未打开用例单独复现0 PASS/1 FAIL/11名称过滤，2483.928962ms，
audit17bcf75291927cd33f5bf4a18e00655fbce3e90485dcceeed690ed97190ecaf5。
将真实生产案例改为完整成功oracle，仍要求查询之前不didOpen、不预查询目标、
实际READY证明前后全等、完整Location、最新诊断和正常shutdown/exit；GREEN
1 PASS/11名称过滤，2473.31356ms，audit988704fa799bc6fa44712563d7d97322861ff76dde602fb57eb7cdc16f47cd3e。
CLI整体exit1/FAIL仍由未完成最终门禁决定，不将ready PASS冒充发布。

完整12/12绿色表征后，将productionSuite和明确synthetic的reportedProof移入
原shared fixture，保持公开行为和原profile，包括原selectedL03Policy的显式
resident-fast-path0。它不是六默认/安装SDK产品性能控制。提取前后12/12，
audit分别f56a436b396d9a3d92b426a0849e9caee1106006ad9f13e3539aa1516032df68、
e4df393a3b148a9df41f03948d0373def7c8dc258cbe9d31fdeadd70d2b6c36c。

再单独新增reported-proof协议fixture负例：保持所报READY输入证明完全不变，
显式要求未打开查询返回空数组，完整oracle仍非空。RED0/1、12名称过滤，
1046.283116ms；原fixture未注入空数组，实际返回零宽Location。最小5行fixture
实现只在reported-readiness模式＋测试flag＋源码未打开时发送`[]`，GREEN1/1、
12名称过滤，1109.203265ms。equal/ready/correctness必须FAIL、missing必须等于
完整expectedLocations、正常诊断和关闭仍PASS。Synthetic证明明确不当真实Program。
两份audit为bb2944286d6fa0ce3f2c738c87802f8de3b41760a210514674ff498725cc0869、
862d32bc7a8b4b91b3950a61fb613045feb6424ff58fbdc5fa3dc84df52488a0。
原始前缀`op03a-unopened-ready-{expectation-original-red,expectation-green,
pre-refactor-characterization,fixture-refactor-green,empty-fixture-red,empty-fixture-green}-v1*`。

### 构造器原失败未定位，保留断言和实际诊断

仅在原查询和session关闭后输出既有完整results/legacy oracle与原生events，
不更改请求、来源、优化开关、scope或原期限。原单例1 PASS/29名称过滤，
133001.651156ms；完整原文件30/30、204205.842125ms。两次indexed profile实际
均4次seed拒绝、0 resident命中，完整结果与legacy一致；实际final batch74/58，
不能把可变发现路径当固定性能分布或唯一主机原因。
单例audit86658e50d400f0255cdecff469b4cd0d3972d2b8214ea226ea6373c86140c4e3，
完整文件audit8331f618b092edf5c4ae0dc680fe8d28325631cf94e1b5fab4bd40abe8bc9804；
native artifact SHA分别f93b3d503e59d2783af54105db79dc86e8b5b641455d1add104bea828f158768、
4ea10076665724592a09e138a66e6b4ab802679c2e4e83161e8bad7f2835f867。
前缀`op03a-constructor-route-{original-diag-red,complete-sequence-diag}-v1*`；
名字red表示来自原失败的复现任务，不改写本次实际PASS。
原拒绝/fallback/full-scope断言全部保留；诊断输出保留用于下一次实际失败的
完整路径证据，不声称构造器问题已修复，也没有为变绿关闭默认优化。

四个测试/fixture文件为474/109/198/497行，均≤500；生产超限债务未增长。
共享fixture直接/间接消费者、原构造器、两种source入口及库存共26完整文件
207/207、exit0/signal null、零注解，621626.434914ms；独立audit
b52bce01b402057826c5302f23048ed640c6b27d3f502b716a1451dad5f6fbb8，
log1d27b5633dd279b958760af385b464842a86016c681af2a81a948f18fd46c68d。
前缀`op03a-unopened-ready-correction-related-v1*`。本轮只改四个测试文件；
库存仍213总入口/206-fast，新增一条负例不等于新增fast文件。
测试修正后的新whole仍NOT_RUN，不能用相关GREEN覆盖原1822/1824 FAIL。

### 安装完整SDK：两种入口、每能力三个独立进程

采用原可READY受控工程（1000 workspace/500 active dependency files，
HEAD61cbf50e42c60b022c11a1ff386c9ee1baed853f），不是实际Settings。
安装SDK digest8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4，
full profile、closure、1024MiB、batch64、六默认ON、trace0、Snapshot/overlay-sync0。
静态oracle独立按未改源码的完整class/import范围构造，不按观测结果改答案。
预声明18进程：打开Main调用方→未打开Active000000模块，与源码Main从未打开；
definition/两种references声明策略各3会话。每进程仅一个目标查询，避免definition
提前暖化references。同root实际准备单列；source disk测量后先作非准备状态验证，
最后才打开Main观察正常诊断，不将didOpen提前。无基准/重回归并发。

| 入口/能力 | 完整client时延ms（3独立会话） | 中位数ms |
| --- | --- | ---: |
| 打开调用方 definition | 487.67/510.76/535.88 | 510.76 |
| 源码未打开 definition | 444.49/447.95/447.75 | 447.75 |
| 打开调用方 references不含声明 | 3944.88/3829.87/3918.22 | 3918.22 |
| 源码未打开 references不含声明 | 3986.65/4156.24/4231.94 | 4156.24 |
| 打开调用方 references含声明 | 3962.49/3810.80/4035.21 | 3962.49 |
| 源码未打开 references含声明 | 4396.57/4050.78/4218.68 | 4218.68 |

18/18完整数组exact、READY输入证明前后相同、prequeries0、正常诊断PASS、
18个不同native LSP正常exit0；根准备另耗4629.64–5035.40ms。
采样tree RSS最大值351.70–622.54MiB，是样本值而非PSS/连续峰值/物理释放。
两种入口不是优化ON/OFF对照，不把上述差异写成优化收益。
原18份CLI及report均exit1/FAIL，latency/memory BLOCKED等门槛原样保留。
数据只覆盖3能力/3会话，不是14×8×3、≥100请求/≥5会话或最终P95。
目录`.bench/op03a-full-sdk-source-entry-v1/`，原plan/preflight/18manifest/report/
CLI/metrics及execution均留存；terminal-audit SHA
aa711a123308112a353da79e14efd0084cb3db867f76b45e6b4cfca9daf454f0。

### 独立trace：实际拒绝与重复准备链，而非猜测修复

再预声明打开/未打开各一次不含声明trace，生产和scope不变，不混入正常时延。
两次完整结果/READY/诊断仍匹配；每次均2个resident admit拒绝`inputs-changed`、
2个miss、0独立anchor、1个transient final batch，candidate2/membership501、
project Program501/SDK255。Program准备3339.03/3195.68ms，query73.33/72.37ms，
startup receipt319.91/306.65ms；字段可重叠，不按互斥CPU求和。
正常metrics也观察到one resident context/one owner＋至多one reference verifier，
尾样本verifier0；这不是native LS dispose/Registry/物理内存证据。
目录`.bench/op03a-full-sdk-source-entry-trace-v1/`，audit SHA
13c009961892b76331bba8f2638da39b83ad107c14bd184dc3c1761efb7b9164。

“proxy未记录prepare-root提示”假说已被现有共同request路径证伪，不实施该改动。
`inputs-changed`也可能来自缺少已观察reference-proof，而不一定是实际签名
差异；当前代码中explicit READY使用独立proof，普通resident proof另有生命周期。
下一切片先用真实公开“未打开source＋prepare:true READY＋首次references”RED
区分未观察与实际generation/owner/membership/roots/overlay差异，再做最小修复。
若需发布已验证proof，只能在原owner内、保持实际同Program、只共享有界只读
元数据，并保留最终物理/输入fence；不放宽准入、猜测签名、额外建LS或跨批留AST。
不重采已封存的403或上述正常18格寻优；新候选再作预声明同构建反序对照。
OP03a/OP00–06/L08全范围仍IN_PROGRESS，最终550/PSS不阻塞该局部合同；
未有新完整GREEN＋分支PR前不合入main。

## 2026-10-16：READY证明交接的公开RED→GREEN及两入口安装SDK复核

承接上节，不重采旧候选寻优。父revision仍为
`a111235bc4bfcb55b126752f95b3ba095f2996af`；dirty工作树以每轮完整source
archive独立冻结。新生产输入为
`81d6e876eda2b23145a3f0cb469bdb607f71e87d599174d699c3644fb68dc7ce`，
semantic Worker为`d016a62b03dd7f32a683f9cadc68b6d751525e124f15cbc5c226701d75d18418`；
server仍9ae12f90，安装SDK digest仍8098b8ab，六默认／1024MiB／batch64不变。

### 最小修复与真实失败链

原15项公开特征测试15/15后，先把已有Program观察职责移回resident-proof模块；
同15项再GREEN，才新增行为测试。主引擎3256→3253行，仍是超500行迁移债，
本次未增长、未机械拆分。新测试使用真实child-process/Content-Length stdio：
源Use从未didOpen，无目标预查询，显式根READY后首次references，核对完整数组、
同一当前公开证明、无隐式overlay／诊断及正常退出，再检查是否复用既有Program。

| 前缀 `.bench/op03a-ready-resident-proof-…-v1` | 原始结果与独立audit |
| --- | --- |
| pre-characterization | 15/15，dece8d97 |
| capture-refactor-green | 实际2/15、13FAIL：沙箱禁止采样器的`/bin/ps`，原FAIL保留，f1b309b9；名称不代表GREEN |
| capture-native-characterization | 同源码有原生只读采样权限，15/15，a187be50 |
| original-red | 0/1＋2未选：测试误用能力名`references`，尚未发目标请求，INVALID_RED而非产品缺陷，a9284440 |
| route-red | 有效RED，0/1＋2未选；完整结果/相同READY已通过，但0 hit、2个inputs-changed拒绝、1 transient batch，4c7837fa |
| route-green | 同一测试1/1＋2未选；两个声明策略各独立新会话均exact/current READY、1 hit／0 batch，f039bddd |
| fences | 完整9文件75/75、exit0、零skip/cancel/todo，139616.457218ms，ac7407c4 |

有效RED/GREEN命令均为Node20的`--test --test-reporter=spec --test-concurrency=1`
加`--test-name-pattern='^explicit READY lets the first never-opened reference use the existing complete Program$'`
和`tests/semantic/resident-first-miss.test.mjs`，原20s RPC期限不变。每轮state/log/
source archive/SDK/产物与native PID退出独立审计；两个无效前置失败不充当产品RED。

原因已由代码路径、公开RED和同输入GREEN区分：显式READY使用独立有效proof，
普通resident proof未观察该Program；generic `inputs-changed`并不证明真实签名已变。
修复仅在原完整report构造及最终fence成功后，以同engine的opaque owner token、
同SDK roots身份和root/epoch/content authority核对，O(1)交接只读proof元数据及
既有Program引用。两个可变proof包装仍独立；失败／取消／clear撤销普通观察。
每次实际引用仍执行原generation、完整scope、配置、overlay／磁盘与前后物理fence，
未用READY标签替代准入、未额外建LS、未跨Worker/批次保留AST，未新增优化开关。
75项包含冷回退、版本／磁盘变更、SDK在途修改、两个根、取消、合并请求、压力
trim/evict、Worker替换及完整两入口oracle；不是当前全206-fast通过证明。

### 新构建固定18格：完整SDK、原语料及原oracle不变

新目录`.bench/op03a-ready-proof-source-entry-v1/`预声明同18个进程、每进程仅一
目标、每入口/能力3会话，顺序仍O/D/D/O/O/D；trace0、正常诊断、完整安装SDK、
1000workspace/500active受控工程，仍不是Settings。打开入口只打开Main，目的模块
未打开；disk入口在目标及最终只读status之前不发didOpen，之后才做正常诊断。
旧18格不重跑；比较确认同语料／SDK／oracle／flags／deadline和bench脚本，仅三个
生产文件、一个保护测试及前次六文档变化。是顺序前后观察，不冒充随机交错A/B。

| 入口 | 能力 | 旧构建中位ms | 新构建中位ms |
| --- | --- | ---: | ---: |
| opened caller→unopened destination | definition | 510.76 | 303.62 |
| 同上 | references false | 3918.22 | 230.36 |
| 同上 | references true | 3962.49 | 229.33 |
| never-didOpen source | definition | 447.75 | 243.51 |
| 同上 | references false | 4156.24 | 463.68 |
| 同上 | references true | 4218.68 | 470.13 |

18次均完整exact/current同一READY、零目标预查询、正常诊断及18个独立native
进程exit0；原CLI/report仍18份exit1/FAIL，latency/memory BLOCKED，不改写。
根准备另报4.14–5.52s；采样product RSS最大值327.59–383.40MiB，不是PSS、
连续峰值、物理释放或所有场景的净内存改善。正常audit完整SHA为
`69d6dac68e25cfb73db90cf2f582416381a60cc0387b0e436d8e28d49d1dc028`；
同输入前后比较receipt为`bf7cf632a4cf36908b3885662092ddd90d5608c4128d490e9868cde00281d759`。
18份原始RSS JSONL的bytes/digest及逐行样本也独立绑定，不仅复用report摘要。

独立两次trace目录`.bench/op03a-ready-proof-source-entry-trace-v1/`，不混入正常
时延：各1 resident hit、0 reject/miss/anchor/final batch，原ProgramBuilds0、
verifierStarts0；完整覆盖501project/255SDK/52std/869Program不减，metrics最大
1 resident context／1 semantic owner／0 transient verifier。两次client墙钟240.28/
471.09ms；trace不能当正常P95。audit完整SHA为
`4f77a8467850ce7b990487e8c00d37e5fa20b63a3279ec3aa449c7294ef77414`。

本局部proof交接合同完成，不据18格授予OP03a、OP00–06或L08全范围DONE。
原1822/1824 FAIL、构造器seed整轮失败未定位及全部历史失败保留。下一次使用
原公开collector执行当前冻结head的`pnpm check:fast`，前缀
`.bench/op03a-ready-proof-current-whole-v1/whole*`；只按实际终态判定，本文不预报GREEN。
随后继续复杂真实closure／冷准备、磁盘delta／未知在途、正常压力／物理资源及
完整产品证据，不重采本闭合小样本寻优；550ms最终指标仍只在OP06/L08，不阻塞
前序。合入仍要求fresh whole及分支PR，当前未合main。

## 2026-10-16：当前生产完整回归GREEN、正式消费及编辑后引用READY反例

上一节预声明的原公开collector现已真正终态。目录
`.bench/op03a-ready-proof-current-whole-v1/whole*`，Node20原`pnpm check:fast`、
206个fast入口、1826/1826、exit0、零skip/cancel/todo，3093552.887731ms。
全部1733源码、SDK／构建／stdlib／原PNPM启动器前后相同，真实根PID退出；
独立audit完整SHA为
`1de2bf76088a1bac498821349ea1bb72c0c1df192a5f7927c70628c4d8c0e24c`，
原stdout SHA为`bbb7b7c4ae5bc23fa7e31aa9475b1bb408d7ac58ec022afe8f3cbf6648171d94`。
生产仍81d6e876，冻结repo SHA0709c418。原403用例约34370.40ms整项通过，
构造器完整对照132277.07ms通过；其原整轮失败原因仍NOT_LOCATED，不能追认修复。
原1822/1824 FAIL与此前失败原样保留。本GREEN只覆盖新增下述测试之前的冻结head。

原正式`assert-semantic-release.mjs`随后消费这份真实whole和同生产18份完整SDK
首次查询report，不构造替代receipt。目录
`.bench/op06-ready-proof-whole-consumption-v1/`，实际exit1、总BLOCKED，
macOS retained regression PASS，Linux/Windows NOT_RUN；6/336格各3请求/3会话，
完整结果／READY PASS，latency/memory仍BLOCKED、lifecycle/portability NOT_RUN。
独立audit SHA为
`70eca24065007ce5e5d705413f99a5e535460e73a15135c94474fbc4edb87b50`。
小样本中全部数值小于550也不升级正式时延/PSS，`releaseEligible=false`保持。

### 下一实际RED：编辑后的完整引用没有恢复原READY会话

根据原产品“ordinary edit后立即查询，updating不重置会话”的合同，新增一个公开
stdio测试，不改生产源码／预算／默认／期限。原full-SDK私有fixture，显式READY、
baseline完整两处引用后，修改已加载且未打开的Unopened依赖，加入第三处引用并
发送标准watched-file通知；只读status先确认旧证明撤销。随后仅一次正常references，
三个新位置全部逐字段相同，无didOpen／版本零overlay／任何后台诊断预热，正常退出。
最后的只读status却仍DEGRADED，reason为`prepared-inputs-no-longer-current`；
没有把错误结果或取消误认作目标RED。

命令为Node20 `--test --test-reporter=spec --test-concurrency=1`
加`--test-name-pattern='^a complete disk reference query refreshes its explicit READY session after a watched dependency edit$'`
和`tests/semantic/unopened-workspace-query.test.mjs`，RPC仍20s。
原parent revision仍a111235b，完整archive独立绑定；测试文件356→411行，未超500。
前缀`.bench/op03a-reference-ready-refresh-public-red-v1*`真实0/1＋10未选、exit1、
1573.440810ms、全部输入稳定；独立audit完整SHA为
`839528969ba85148c2f8edc67b932ce11fa969c83c5a8b0a36ac3c035d673568`。
源码调用链另封存于`.bench/op03a-reference-ready-refresh-source-research-v1.json`：
普通interactive经过runPreparedSemanticQuery/afterQuery，indexed references直接
resident／transient路径没有该普通认证调用。新RED证明公共缺口，不等同于已选定修复。

该时点生产未改，新增测试head处于RED，不能借1826宣称新head whole GREEN。
当时选定的下一最小实现只承接已有显式READY意图，在原owner／预算／取消及完整最终fence内
更新当前证明；不能靠再次手动prepare、后台诊断、假的READY或移除输入检查使测试过。
bounded resident-only探测仍不得隐式准备／建Program；不重开旧S05/sessionReuse，
不默认开启overlay-sync/Snapshot。全部编辑准备和认证计入真实RPC，随后单独验证
完整声明策略、缺输入/恢复、取消/压力与实际内存和等待成本；最终550仍只约束L08。
OP03a/OP00–06/L08全范围保持IN_PROGRESS，尚未合main。

## 2026-10-16：引用刷新RED→GREEN、两入口保护与安装SDK编辑后成本

上述原始RED保留。最小实现已完成：普通references先通过原registry准备当前
workspace的READY证明，再执行实际引用；只有已有显式READY意图的owner可以
进入这条刷新。意图可随原content-revision规则更换context，但不是跨owner的
有效性证明；新context必须重新完整检查输入，缺依赖仍DEGRADED。完成的负例
保留原显式会话的后续修复意图，抛错／取消的准备不保留该意图。只读status、
无既有owner和bounded resident-only均不隐式准备；L2/L3／lease／最终owner身份
和完整report构造之后的物理输入fence保留。未新增owner、Worker、后台准备、
开关、跨批AST或LS缓存；原64根／并发1／六默认／1024MiB和实验关闭策略不变。

实现只涉及原readiness状态、registry入口及普通reference桥接。初次同一公开
测试1/1＋10未选GREEN，audit
`fa4b10cbe329aa85775124dce9570393b898c998e53a046a713eb50e67305b9f`；
随后在GREEN上提取compiler-host文件名投影，保持原数组／extras顺序和缓存语义，
不是机械按行拆分。既有超限TS engine 3253→3252行，仍为迁移债；registry
500→491，readiness238、workspace-entry150、桥接86、新helper14行。

公开stdio保护现覆盖两种入口×两种声明策略：Main已打开而Unopened目标从未
打开，以及Main/Unopened都未didOpen；真实磁盘依赖编辑、标准watched通知后
分别完整3/4处新引用与最新UTF-16声明范围精确相同，旧证明先撤销，普通查询
后只读根READY／新sources hash／原overlay hash与完整覆盖一致。额外负例验证
缺依赖2307不会READY，修复后不用再次手动prepare即恢复完整引用与READY。
取消用例先观察普通reference刷新实际进入5000函数文件的编译器输入检查，再
发送标准取消，得到单一-32800且真实compiler interrupted，无complete或迟到READY，
之后显式准备恢复。不是在队列前取消或只丢弃已完成结果。

冻结当前9个完整相关文件共81/81、exit0、零skip/cancel/todo，147502.124812ms。
前缀`.bench/op03a-reference-ready-refresh-current-fences-v1*`，全部1734源码、
构建／安装SDK／stdlib前后相同、真实根子进程退出，独立audit
`987689dbfdb609a4c0d45143c559aed9e9f339e1071b2a521aa857b5fd18a602`；
原log SHA `84c1ca83caa7f28c01a50e873bab5c34591f6d685eebf62b9f9fe5b53c5c7f48`。
Node20 `pnpm check`和对应build均通过。当前production input为88ad7e9b，
semantic Worker SHA为519a9a66；旧81d6e876的1826 whole不覆盖新生产，当前
完整check:fast仍NOT_RUN，合入前仍须fresh whole与分支PR。本次不合main。

### 单独安装完整SDK验证：正确性通过，编辑等待仍为秒级

预声明4格、每格1个新进程，按opened-false、disk-false、opened-true、disk-true
固定顺序执行，任一失败停止；不是闭合首次查询18样本的重采，也不是A/B收益。
目录`.bench/op03a-reference-ready-refresh-installed-sdk-v1/`内保留plan、harness、
4份完整report、原始RSS、终态与独立audit。输入为原受控1000文件／500-active
链的独立副本，安装SDK API24/6.1.1.125，非真实Settings；正常trace0／无preload，
原始语料与SDK不改。只向未打开的Active000000磁盘增加精确alias，正常退出后
才恢复副本原字节。disk入口在测量和最终只读READY之前无任何didOpen／诊断。

4/4完整编辑后引用、当前根READY、501工程／255SDK／52标准库／869 Program
覆盖、14项ready能力、诊断与正常退出均验证一致。四次编辑后真实RPC分别
3973.51、3997.46、3512.57、3946.70ms，全部准备与认证在RPC内；不是P95。
全会话采样product RSS最大值507.63／558.99／566.05／564.94MiB；请求50ms的
实际采样P50约98–104ms、最大间隔约117–138ms。RSS不当PSS／连续峰值／物理释放。
独立audit完整SHA
`b5c51a6be312d96ab854f31d6f560936e4d0b972dec68cc63dc7c7c3329dd0c7`。
此PASS仅是一次性公开功能／资源观察，非正式发布report或最终门禁PASS；
之前正式18份FAIL、最终BLOCKED和全部缺失格保留，不能用这些4格替代。

另两份独立trace只做归因，不混入正常计时池，目录
`.bench/op03a-reference-ready-refresh-installed-sdk-trace-v1/`，audit
`ffa33bbd69613cf23f60dfe83c8ad260cb88aaa27582eb1caff360b946fc46f9`。
两入口均1个semantic owner、最大同时1个context；编辑前原Program resident hit，
编辑后index因workspace-changed保守fallback，原context因content-revision-change
回收并新建一次，随后869个输入检查与普通owner compiler查询，无transient批次。
context新建到首个输入检查约3012／2751ms，到引用compiler查询约3607／3274ms；
输入检查自身合计约116／98ms，实际引用compiler查询约68／59ms。这是冷Program
及认证路径的边界观察，不将前段全部冒称独立纯parse成本，也不宣称磁盘增量
已实现、无context替换或物理资源已释放。

### 下一切片与不变边界

本局部引用刷新合同DONE，OP03a/OP00–06/L08全范围仍IN_PROGRESS。当时下一项先以公开
两入口编辑用例验证其它ordinary能力在磁盘revision更换后是否也丢失原显式
刷新意图；这是待验证假说，不将本次引用GREEN外推为全部能力的动态证明。
OP00/04随后承接上述冷Program／已知disk delta、未知在途和配置边界成本；
不直接打开已REJECTED的S05/sessionReuse，也不凭export文本推断影响或重采
闭合小样本寻优。任何独立增量方案先声明与旧失败方案的差异并验证完整结果、
不确定输入保守重建及驻留／恢复成本，再按证据决策。OP03b实际Zed、OP05正常
压力／物理资源、OP06全证据发布正例和336格仍保留；550ms最终指标不前置。

## 2026-10-16：普通查询完整scope、诊断意图与call follow-up刷新

继续上一节的实际下一项，而非外推引用结果。新增公开disk definition用例：
显式READY、精确baseline后标准watched依赖编辑，普通definition返回最新声明
位置且正常退出，但只读根变为UNPREPARED。有效RED前缀
`.bench/op03a-definition-ready-refresh-public-red-v1*`，audit
`e2eabb9a240a0b472b5198778077f507d92b380f57f607dcc0954c7c6b5917e2`。
第一次仅传刷新意图的尝试仍FAIL／DEGRADED／project-membership-incomplete，
audit155639ca；不能把交互局部scope改标完整。改用原根级完整准备后同一用例
GREEN（audit7b3d40b7），随后GREEN上把交互准备职责提取到既有interactive-workspace，
五项完整文件通过（audit6797138f），不是新增第二套就绪管理器。

下一真实RED先让磁盘编辑后的最新普通诊断完整结束：诊断未认证根且definition
位置正确，但原显式会话意图已丢失（auditaf154046）。现在只在原
content-revision-change替换中承接原布尔意图，不传旧观察／Program／证明；
诊断仍不准备／认证根。普通查询需要时用原根准备完整检查；trim、配置失效、
取消的准备和dispose仍清除原意图。六项完整GREEN audit016c5180；随后真实
definition输入检查取消也保护，七项audit601e0c9a。不是队列前取消或迟到结果丢弃。

实际L2 trim／L3 evict均验证意图清除，后续普通定义精确但无暗中输入认证，
显式准备可恢复。首轮7/9因命令返回即读取异步Worker见证过早而FAIL，原记录
audit1fc3c26d保留；加原合同的只读状态排空屏障后9/9（audit8bfd4e85），生产
未改，不冒称压力缺陷修复。正常OS压力／soak／物理资源仍是独立剩余工作。

调用follow-up也单独实测。首轮callee完整range误排除前导注释，未到READY
断言的oracle失败audit094351c6保留。独立opened-current进程的完整公开item与
锁定compiler的createCallHierarchyItem一致：range含注释、selectionRange指向
当前声明；只规范化两fixture的URI/root，不删字段。修正oracle后完整调用边
精确且正常退出，根仍DEGRADED，得到有效RED auditd4df8f13。复用同一根准备
入口后十项GREEN（audit0fd86cbf），再补已打开调用方／未打开callee入口；
disk入口测量前无didOpen，item自身未改而callee真正改变，非重prepare掩盖。

### 原负例约束触发条件，而非放宽旧断言

首次9完整文件为86/88、exit1（audit07112a09），两个原负例指出提前根准备
触发过宽：改写原两源query-snapshot观察，以及对无通知同size/mtime源编辑
过早恢复根READY。原失败与两个原断言均保留。现在先构造真实当前查询workspace，
只有原显式意图存在且原context需content-revision重建、或尚未加载完整membership
时才进入完整根准备。已有完整owner上的普通编辑仍沿原afterQuery／scope／最终
物理fence；已有完整owner上的未知reset不作为单独触发理由。metadata只选择准备路径，不是
缓存有效性答案。13选中用例／20未选先GREEN（audit78063e74），未冒充整文件。

最终原9个完整文件88/88、exit0、零skip/cancel/todo，155223.789281ms，前缀
`.bench/op03a-ordinary-ready-refresh-final-fences-v1*`。全部1734源码／构建／SDK／
stdlib前后相同、根子进程退出，独立audit完整SHA
`e4c7eaa11ddf32628986e82345a4ad06fd6ae74ffba6f810618f9aa50ffa7faa`；
原log SHA `6499a60c4942d8e58e55569d081900a924a69a51228420299a3ab51d9c3cb01b`。
当前production input a6ae3b97、semantic Worker4f6462ce。Node20 check／对应build通过。
同GREEN提取严格UTF-16反向位置校验至既有text-position；原钳制拒绝语义不改。
超限债TS engine3252→3241、Legacy885→874；registry499、readiness241、交互helper108、
text-position61、验收测试363行。两大文件仍是迁移债，不以超限继续增长。

### 当前安装SDK，两入口普通definition的独立正常观察

`.bench/op03a-ordinary-ready-refresh-installed-sdk-v1/`预声明两格、每格一个新进程，
trace0／无preload，原1000文件／500-active受控语料的新副本，非Settings或A/B。
安装完整SDK、六默认／原预算和关闭实验均独立核验。声明前加真实Unicode注释
并增加alias，全部磁盘变更只发生在副本，进程关闭后恢复；disk入口在最终只读
READY之前无didOpen／诊断。2/2完整定义、当前READY、501工程／255SDK／52标准库／
869 Program覆盖、14项capability、诊断一致和正常退出均通过。首次定义分别
219.55／227.91ms；磁盘编辑后3692.15／3838.86ms；初始显式准备2056.06／4510.08ms，
opened入口之前已有正常诊断，不能与disk冷准备当A/B。全会话离散product RSS
最大558.95／556.55MiB；实际采样P50约99ms、最大间隔113／123ms，不称连续峰值。
完整raw、plan、harness、report／终态与audit保留，audit完整SHA
`7becc0ca1fb2cc7f9d275fd3e719735aa50f95ceedc2d331648737fa0ef93ab5`。
单样本不是P95、PSS、净收益或正式矩阵；秒级编辑成本仍待，旧所有FAIL不重标。

### 当前整轮与后续完整范围

上述是局部普通刷新合同与原保护的GREEN，不关闭OP03a/OP00–06/L08。旧81d6e876
whole1826不覆盖当前a6ae3b97；此处预声明再次通过原公开collector运行原完整
check:fast，前缀`.bench/op03a-ordinary-ready-refresh-current-whole-v1/whole*`，只按
真实终态记账，不预报GREEN；合入仍要求fresh whole＋分支PR，未合main。
随后继续其它能力的真实复杂closure／动态编辑、冷Program／OP04已知delta与未知
在途／配置边界、OP03b实际Zed、OP05正常压力／物理资源和OP06全证据正例及336格。
本批不重开S05、Snapshot默认推广或overlay-sync；六默认／1024MiB／原滞回／
单owner／context上限2／verifier并发1不变，最终550ms／PSS仍只约束OP06/L08。

### 当前整轮实际中断：存储不足，不补造最终计数

上述原完整collector实际终态FAIL／exit1，运行23:31:25至23:50:36 UTC。
原始日志有24处ENOSPC：fixture创建／写入失败，最后Node测试harness自身输出
也写失败，child-exit7；没有最终根SPEC摘要，counts=null、countsValid=false。
11条可见失败标题只是中断前观察，不是最终失败总数；本轮不证明语义错误根因，
也不能借此前88/88、旧1826或正常SDK两会话标whole GREEN。

证据仍在同一目录；独立`incomplete-result-audit.json`完整SHA
`23bd83d00305be53f9b73aaad43a9731cee51db4e8a01420acbc89c25571b7c6`。
核验原命令、206个fast入口／三层、1734份源码归档与before/after当前源码、
构建／SDK／标准库／启动器、原CLI收据、日志SHA及三原PID退出，全部一致。
原日志SHA`5b09eb181e8328ccc0b92cea14167c8812c73a349dd9cfc75eb6ebe945a9edb0`。
空间诊断先只读区分主机卷余量、任务派生增长和故障注入；未在fixture中找到
ENOSPC注入，repo与临时目录同卷、余量约1.3GiB且波动，不据事后余量倒推峰值。
只回收已核验本任务的重复封存派生文件，保留所有原路径／SHA和失败日志；
空间足够后新前缀重跑原完整命令，不删测试、不放宽期限／保护或最终门禁。

存储处置已完成：385份封存source archive中55个逐字节相同副本改为硬链接，
每个原路径／SHA保留，实际可用空间增加约1.03GiB；收据
`.bench/source-evidence-hardlink-dedup-v2.json`，SHA
`c79705d49562be3aa3e7d9a26ad1783d2d8826a8af063eb2499c3ca83fc53d70`。
再精确清理闲置`target/debug/incremental`可再生缓存8885文件（原分配约796MiB），
未碰debug产物／deps或release sidecar；后者SHA前后不变。收据
`.bench/op03a-enospc-rust-incremental-cache-recovery-v1.json`，SHA
`7523bac8f808f5610f9f34118fae805599ece179dd8f5531b128f791a4f3708b`。
缓存可由后续Rust编译再生；当时可用约2.9GiB，不将事后余量当原峰值证明。
原archive的透明压缩仅复制试验未通过字节校验，未替换任何原文件、不计回收。

现预声明新前缀`.bench/op03a-ordinary-ready-refresh-current-whole-storage-recovery-v2/whole*`，
同a6ae3b97生产与不变206入口原collector／pnpm check:fast；重跑前独立校验仅这六份
文档改变、构建／SDK不变并冻结源码，随后不编辑冻结输入。原v1 FAIL永久保留；
v2只按真实终态判定，不预报通过、不与正常性能采样并行。

### v2实际终态与观察用例的资格修正

原完整storage-recovery-v2已真实1837/1839、2FAIL、exit1、零skip/cancel/todo，
3303432.414356ms。206入口、1734源码归档、SDK／构建／标准库／启动器、原CLI
收据及三个原PID退出独立审计通过，完整SHA
`4ab388e2f644aa6e75fe962a4c32476cad3093c6b072d547b16f0fbedc6d54fa`。
本轮无ENOSPC；666份离散空间观察最小约1.86GiB、最大间隔5070ms，不称连续覆盖。
两条失败分别是owner输入观察的verifier哈希断言和原403引用id4的20s超时。
后者前两次响应完成不等于该case完整oracle通过：其完整比较在第三次请求之后。

整轮终态审计之后才开始原样复现及修改。原观察用例仍RED；真实公开CLI默认／
唯一resident opt-out对照各3次完整结果一致，默认仅原owner、没有verifier，
fallback有两个真实verifier、各1次native dispose、Registry零残余与原生退出。
观察钩子未漏记；旧测试隐含必经fallback的前提已失效。只对该专用控制显式关闭
resident fast path，保留全部旧断言；另增强原默认观察用例的未保存引用编辑／
完整结果／旧答案缓存失效／无虚构verifier记录。三个完整相关CLI文件30/30、
exit0、零注解，auditacf11315；Node20 check及diff检查通过，测试494行。
详情及全部SHA见[OP00记录](op00-query-layer-attribution.md)。生产a6ae3b97与默认策略
不变；这不是生产LS修复、正常性能采样或整轮GREEN，当前新测试head whole NOT_RUN。

原403超时、此前所有FAIL与完整OP00–06/L08余项继续。先推进实际冷Program／
复杂closure资格与其它独立切片，不改20s期限、不采纳128或重开S05来掩盖失败；
最终550ms／PSS不前置，合入仍须fresh whole＋分支PR。

### 一次有限403复测及独立切片推进

同生产／原用例／20s期限仅一次有限复测1 PASS／2未选、exit0，四个完整oracle
比较均到达；auditc67ed6b0，`.bench/op00-original403-current-finite-repro-v1*`。
仅未复现，不称修复；原whole403失败、冷Program／额外anchor成本不改写。
继而推进独立OP06真实restart：两入口新进程重新READY、当前未保存目标编辑／
版本重放及异常／逐进程证据保护，完整19文件171/171、audit0b95855d，生产未改。
详情见[OP06记录](op06-release-sample-evidence.md)。当前工具head whole NOT_RUN；
复杂动态／closure、独立磁盘增量／未知输入、正常资源／客户端与最终336格仍继续。

随后独立OP06来源切片已有20完整文件176/176、audit6d359df3：两入口真实重启后
completion/resolve与prepare/incoming/outgoing完整，补全旧UUID失效、当前来源依赖
按进程／先后／snapshot／版本核验。四私有SDK原生案例12精确请求／8服务PID正常
退出，原报告仍FAIL／最终消费BLOCKED。仅工具／测试改变，不称LS性能修复；
原冷Program／复杂closure／403失败及完整余项保留。见[OP06](op06-release-sample-evidence.md)。
