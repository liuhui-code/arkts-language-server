# 输入证明用途、重复快照与诊断交付阶段

状态：隔离候选的必要修正及定向验证；整体完整门禁、当前规模及新30K长测仍未完成。
承接[上一轮根因与检查记录](2026-11-09-reference-route-and-recovery-diagnostics.md)，不覆盖原失败。
没有提交、合并、发布、日常部署、重启用户进程或删除真实缓存。

## 身份、普通失败与本轮范围

实现：`/private/tmp/arkts-index-versioned-maintenance-20261104`，分支
`feat/index-versioned-maintenance-20261104`，父提交
`298d65f5d7f796c347fe8be5c739e428066489d8`，未提交差异。Node20.19.5、pnpm8.15.9。
本报告的小型SDK都是生成的API24或补齐识别元数据的本地conformance API20；不是Photos真实SDK/UI。
证据前缀 `E=.bench/index-versioned-maintenance-20261104/namespace-final-20261109/`。

本轮先核验前一候选2429份输入与收据一致，再串行过滤重放原失败：
`current-remaining-replay.log`，52项执行，17PASS/35FAIL、81名称过滤未执行，211.832s。
这是后续修正前的诊断结果，不是当前完整检查；原IX13部分1693PASS/84FAIL及停止状态保留。
Photos15从未加载，density16未开始；没有累计旧长测时长。

## IDX-V1-TEST-QUALIFICATION-001：夹具前提和故障窗口

### Native范围正负对照

原别名正例的语义范围26文件，而Native实际28，额外两份inactive ghost已有manifest证据。
`local-file-dependency-alias.test.mjs`现将索引正例固定为匹配范围，另保留完整原ghost输入的
superset反例，要求拒绝收窄且与legacy精确Location集一致。构造函数的未知身份回退保留。
原corpus SDK仅有synthetic sdk-pkg标记，不能支持完整结果缓存资格；本地副本补实际可识别
ets组件元数据，显式公开prepare并断言READY。关闭resident仅为强制检验索引路径，profile
明确称indexed，不冒充生产默认场景。原accept/cache计数、UTF-16位置及声明策略断言保留。
中间失败含“2次accept而非1”和“SDK partial不能READY”，说明范围与SDK/Program资格是
两个前提；没有为它们关闭生产验证。`alias-native-and-ready-terminal-final.log`5执行PASS，
7名称过滤，其中也含下面两项认证窗口对照；后继完整资格组合另留证。

### 故障不得被新增早期工作消耗

`reference-ready-final-window.cjs`原只按文本匹配hash，在新源码范围校验先触发，未进入
测试声称的prepareOfficialReadiness。现额外限定原认证调用栈，原调用栈断言不删。
父端实际观察到在途输入变化时，公开终态为ContentModified(-32801)，符合ADR0005/0006；
与没有当前输入证明的RequestFailed(-32803)区分，不使用允许任意错误的宽松集合。

resident输入观测同理：新增readiness/namespace工作不能抢走resident故障窗口。
观测器仍执行并另存全部hash事件，只在实际queryAdmittedReferences栈内启动resident
屏障/故障。原resident日志记录其真正作用域，all-scopes日志保留其他实际成本。
普通请求观察到9次hash=namespace2/readiness6/resident1；opt-out为2/6/6=14。
没有把总成本9次说成只有1次，也没有降低1/6、容量溢出、取消独立事务等断言。
`resident-proof-scoped-system-observation.log`8/8PASS，33.241s，含SDK变更和嵌套根恢复。
默认indexed路径的额外校验成本仍存在，不据此声称性能优化或规模无关。

## IDX-V1-PROOF-PURPOSE-001：无资格缓存仍读取全项目内容

原`request-input-validation`8250 filler用例在首次引用等待5000ms后超时；这是测试驱动的
等待上限，不是产品30s截止、OOM或Worker崩溃。普通原始日志
`program-input-publication-sizes-red.log`保留320两例通过/8250失败。
legacy查询不用Native候选收窄，SDK已明确partial，不能取得完整结果缓存资格；原
referenceCacheAdmission仍前后要求全源码字节摘要，增加无用的可选校验成本。

第一份便宜探测实验令大例恢复，但破坏健康对照，已撤出并封存
`abandoned-staged-cache-admission.ts`。后继if-ready初稿也不完整：尚未READY的Program
可能被本次查询恢复；跳过其前置字节观察会把查询前已送达的编辑误判成在途变化。
`conditional-source-proof-protocol-and-public.log`实际29PASS/2FAIL，不按文件名当GREEN。

正式用途合同：

- 内部captureSourceInputs=true：保持完整源码观察。indexed/batched及rename完整输入证明不改弱。
- 内部captureSourceInputs=cache：仅当已证实SDK partial且sdk-inputs-incomplete时省略可选
  结果缓存内容观察；未知/过期Program仍观察，完整缓存资格仍要求READY及前后相同全证明。
- 此用途只用于legacy新计算结果的缓存准入；已有缓存命中仍独立检查完整当前证明。
  它不是用户配置或公开LSP新参数，不绕过实际语义搜索及最终输入校验。
- 先取资格、再观察字节的正路径，最后仍重新认证，不能把先前报告与之后字节拼成伪READY。

调用链：reference-query-entry → reference-cache-admission.ts:21 → WorkerProjectPreparation.read
→ Worker运行时严格解码 → project-readiness.ts:22 → projectSourceNamespace / engine readiness。
只跳过无意义的可选内容观察，不清全部缓存、不改内存/超时/规模阈值。
`cache-purpose-input-proof-controls.log`33/33PASS，56.849s，涵盖严格协议、索引正负资格、
legacy缺/有效SDK缓存、全部9项公开输入/终检用例。8250恢复时实际Program包含8255项目
源码+1 SDK+52标准库=8308 SourceFiles，保留8254项目AST、首次观察1份，不截断输入。

### 当前证明与比较历史

ReferenceNamespaceAdmission.read（约15行）保留last disk用于发现真实变化，但currentDisk
只由本次返回的完整观察授权。名称证明/范围缺失立即清当前资格，不能拿历史值收窄；
没有内容证明不等于证明内容变了。真实名称变化仍推进失效并合并对账，未知内容键不授权。
组件生命周期接口先RED：`current-vs-historical-namespace-proof-red.log`；再GREEN，
公开强弱证明对照见`optional-proof-and-current-authority-final.log`39/39、59.225s。
生命周期单例不冒充公开LSP/规模证据；同组另有真实子进程framed-LSP验证。

### 有边界的运行补证

`publication-size-runtime-final`在阶段重构之后、ABI3提升之前，先封存4项运行产物SHA，
只在正常关闭后复制日志，不在请求中插入计时。source/SDK由原测试生成，负载和5000ms等待不改。
`runtime-identity.json`、`request-summary.json`及其logs/server.log逐次留存：

| 顺序/驱动请求ID | 内容 | 服务端完整耗时 | 结果 |
|---|---|---:|---|
| 1/2 | Target.ets导出TargetOne；初始化并打开后的首次引用 | 1621.57ms | 精确结果 |
| 2/3 | TargetTwo；控制终检期间改ZZCaller，保持字节数/mtime | 1340.81ms | 预期-32803；没有旧完整成功 |
| 3/4 | 送达ZZCaller watched change，再查TargetTwo | 1970.70ms | 精确新引用，原Host恢复 |

ID由确定的驱动序列关联，request.completed本身不含ID。单进程仅1个semantic.worker.started。
这些是单轮generated故障回归，不是三轮中位数、Photos、缓存热命中或真实UI。
RSS为同一Node进程（包括线程）完成时采样，不是峰值；父端heapUsed不包含Worker isolate。
原生/系统资源未采样，不能合计成进程树峰值。首次响应仍远高于500ms体验目标。
该收据早于ABI3，不能追认为最终ABI3性能验收；ABI3后的公开功能另有下面的回归。
另一个未同步封存产物身份的早期采集publication-size-runtime只作辅助，不当作最终身份。

## IDX-V1-PREPARE-REUSE-001：同一RPC重复组装workspace

原references-direct-proof-trace公开回归：同一物理RPC出现两套6阶段准备。
原因是prepareCompleteProjectWorkspace先prepare、再refresh、即使unchanged也再次prepare。
使用已有不可变catalogStamp：只有refresh.changed=false、canonicalRoot和revision与第一次
捕获精确一致时复用第一次view；枚举和最终输入校验不跳过。不同root/version仍重新捕获。
这是去掉重复组装，不宣称跳过全范围新鲜度扫描。
`single-workspace-capture-public-controls.log`40/40PASS，85.535s，保留精确一次阶段序列、
所有7扫描窗口、24读取窗口及20K容量修复/不重复扫描控制。

## IDX-V1-DIAG-HANDOFF-001：等待已取消但未语义交付的任务

原缓存测试缺有效SDK，先补齐READY前置后仍3/3失败，稳定在“缓存答复晚于诊断结束”
断言；`diagnostic-cache-qualified-program-controls.log`不是SDK问题的最终掩饰。
原pending.started仅表示LSP timer callback已运行，suspend却等该任务整个settled；其中
测试准备延迟1200ms尚未调用semantic.diagnose，取消后无Worker资源需要等待。

正式阶段为scheduled → preparing → semantic，移出pending并settle为终态。
取消scheduled清timer并结清；取消preparing撤销发布/分发资格，交付前重查controller、
workspace epoch及pending owner，不能迟到再进入Worker。suspend只等待已semantic交付
的scope结清；活跃/排队语义诊断仍共享原取消和Worker终态屏障，恢复finally及重排保留。
不是把缓存输入校验放到Worker安全屏障外，更没有新增Worker或取消预算豁免。

`diagnostic-handoff-and-active-worker-controls.log`19/19PASS表征后才重构互斥阶段；
`diagnostic-phase-characterization-identity.json`保留表征源码/产物身份。
`diagnostic-phase-final-public-controls.log`19/19PASS，65.855s：实际Worker hold必须先终结
才能校验、前台有限优先、旧请求取消、恢复后诊断、生产Worker原7项，以及原缓存三模式。
缓存响应15.44/15.21/15.01ms；非语义准备延迟尚未结束，cache.hit各1、当前版本诊断后续发布。
500ms旧硬时延断言按用户指示改为观测；阻塞/结果/终态/Worker数等结构性断言保留。
真正缓存校验现在也拥有屏障，trace严格要求2个对应wait/settled收据，而非假定缓存不访问Worker。

连续热点请求下的长期公平性没有被19个小例证明，须在最终混合耐久覆盖；不据静态可能性
把它记成已证实新缺陷，也不声称本节解决所有调度长尾。

## Worker ABI边界

新capture用途不能发给旧严格解码器后仍称兼容。旧ABI2接纳反例先RED
`source-proof-peer-abi-red.log`；内部SEMANTIC_WORKER_PROTOCOL_VERSION提升至3，
codec上下文使用同一类型，不松成任意number。旧ABI1/2明确拒绝；Node各Worker须成套构建。
公开JSON-RPC/LSP和Native索引协议/格式不变，不清索引库，不新增用户参数。
首轮ABI组合79PASS/1FAIL为旧调用关系测试还写死解码版本2；已保留失败并修其当前/旧版
正负断言。`source-proof-abi3-final-typecheck.log` exit0；`source-proof-abi3-protocol-and-lsp-final.log`
80/80PASS、0skip，15.420s。旧版请求/响应拒绝、监督器mutation/终态及真实LSP缓存均保留。
同一ABI内的历史产物身份仍须独立核验哈希；ABI3不是通用“永远最新Worker”保证。
触碰的旧调用关系测试原720行，依80项GREEN表征按envelope/request与response payload责任
拆成185/448行，共享90行夹具；断言原样保留。`source-proof-abi3-bounded-final-controls.log`
85/85PASS、0skip，16.098s；Node目录330入口/unit136，未降低文件大小/目录完整性检查。

## 剩余范围

当前完整check:fast仍未GREEN；剩余legacy scripted sidecar的资格、状态/发布/重试竞态、
缓存性能与新完整门禁仍需逐项处理。当前30K新两小时未开始，不用旧H13/旧完整通过替代。
Native完整范围与语义范围不匹配继续保守搜索，未引入ADR0043明确暂缓的部分scope projection。
indexed默认仍有O(文件范围)读取及排序/哈希成本；此处仅消除无效可选观察/重复组装，不推出
整体O(N)、O(N²)结论或声称随规模增长成本已解决。Windows/UI未在本轮执行。


### 冻结后的当前复验（W文档保持冻结，当前观察仅回写canonical报告）

`proof-purpose-phase-repairs-receipt.json`冻结2433输入及ABI3四项产物；
`abi3-current-replay-receipt.json`实际终止：生产Worker/恢复8PASS，随后原失败过滤重放
33PASS/19FAIL/82名称过滤（134报告，52实际执行），212.228s。全部冻结输入未变。
`abi3-remaining-failures.json`使用TAP原location而非第一个helper栈帧，记录19份完整失败块。
这不是完整check:fast。相比本轮修正前35失败减少16，但不把19都断言为产品缺陷或夹具问题。
观察包括：7个索引收窄期望、状态/发布与SDK/语义组；两个构造函数用例收到-32801而
原期望同请求成功；一个新引用已正确出现但缺旧resident拒绝事件；一个断言不许候选阶段
事件。它们需逐项用真实Native/调用链对照，不能以改错误集合或删除结果断言直接验收。
当前8项生产复验不是UI/长测；Photos15/density16仍未运行。不合并发布或部署。


## 后续：真实 Native 夹具与当前输入权威回归

冻结 ABI3 重放的 19 项中，本轮 12 项已由公开 framed-stdio 回归复验通过；连同一个原有故障对照，
`qualified-native-and-current-authority-regressions.log` 实际 13 PASS / 0 FAIL，57 项按名称过滤，74.161秒。
这是过滤回归，不是 `check:fast`；另 7 项 catalog 生命周期问题仍 OPEN，完整门禁、Photos15/density16及新30K长测状态未改。
产物和产品源码与上次冻结 ABI3 相同；测试身份见 `namespace-final-20261109/native-fixture-authority-migration-receipt.json`。

- 正向批处理改用实际 release Native，通过真实维护资格与完整源码范围检查。收窄、直接锚点、包入口/绑定/子路径和 SDK 终端的原结果与候选/批次断言保留。
- 断链及未解析来源分类是候选响应边界的受控故障注入，单独记录 `fixtureFault`；资格、head、输入 token、内容指纹不生成或修改。
  中间失败原样保留在 `real-native-batch-probe.log`、`native-qualified-negative-batching.log`，没有将故障注入称为真实 Native 解析缺陷。
- 两项构造器在途变更测试改为要求旧请求 `-32801` 且无 result；同会话新请求必须与独立完整搜索逐位置相等并包含新增引用。
  依据 ADR0005 Candidate-stage production freshness / ADR0006，不再允许旧请求发布捕获的旧结果。旧请求批次与新恢复请求分开统计。
- SDK 语法池复用与完整答案缓存不同：测试显式建立当前 READY Program；SDK切换后要求旧 Worker 计数先归零，
  替代域使用不同线程且只解析一次，最终 shutdown 再归零。不能把切换后合法创建的替代 Worker 当成旧域残留。
- 未通知磁盘编辑可以先由 Store 撤销旧 owner，再建立当前 Program，并不保证一定走到 compiler 的 proof.rejected 日志。
  原首 RPC miss、两轮新增引用及精确结果保留；后续 hit 必须位于实际 prepare/build 之后。
- 隐藏磁盘修改与 overlay 同步的实际路线会检查过期索引状态并回退；没有冷 verifier 批次，仍用同一物理语义 Worker。
  `candidate-selection.complete` 仅说明选择函数返回，不能当作接受候选或发生冷构建的证据。
  测试直接约束无 index.accepted、无 verifier batch、候选返回 fallback/0、实际当前 Program覆盖及完整位置集合。

本轮仅迁移/校正测试前提和观测，没有修改产品阈值、完整范围、新鲜度合同或产品实现。


## Catalog 兼容与真实资格边界的后续验证

原19项失败均有对应GREEN证据，但没有据此宣称全量门禁通过。除上述13项组合：

- `initial-catalog-legacy-and-native-boundaries.log`：完整6 PASS / 0 skip，8.478秒。
  保留legacy generation-zero warming、候选查询顺序、取消和超时；没有完整源码资格的legacy数值水位不得授权收窄。
  真实release Native“初始化回复仍在测试传输层延迟时开始查询”作为独立正向对照，精确5位置及资格接受均通过。
- `native-preopen-and-proof-contract-current.log`：完整10 PASS / 0 skip，3.366秒。
  包括真实Native跨会话持久库恢复、未打开前编辑/新增、两种声明策略及资格合同；改2文件只写2、复用2仍成立。
- `catalog-input-and-scope-controls-final.log`保留3 PASS / 2 FAIL的中间状态；
  legacy普通与显式1MiB压力重同步、旧缓存未打开前变更的3项已GREEN。
  真正触发level3驱逐和完整保守计划都校验；不能要求它经过在候选资格拒绝之后才存在的indexed压力分支。
- `native-unit-and-legacy-generation-final.log`：完整2 PASS / 0 skip，9.202秒。
  legacy竞态保留旧generation2不得覆盖第二次编辑、当前定义第2行与完整引用结果；最终generation3仍缺当前证明时继续回退，
  不再把“数值变大”当作完整范围恢复。真实资格恢复另由Native跨会话对照验证。
  真实Native语义组初始匹配范围时按原分组/4候选检查；配置缩小后先等实际token资格，再要求10文件Native超集不得收窄4文件语义范围。
  underdeclared依赖扩展恢复匹配的3模块夹具后独立验证，原路径指纹、扩展一次、组边界与精确结果断言保留。

重同步旧夹具实际3个catalog/start已由请求记录证实：初次、watch输入、后续实际磁盘摘要观察产生的对账。
`legacy-resync-scheduling-diagnostic.log`保留原“恰好2次”的超时与全部请求。它不是生产Native写了3次全库的证据。
Native同head可重资格、精准文件写与后继对账免facts写继续由真实Native回归约束；额外完整输入确认成本没有宣称消除。

`native-first-catalog-current-qualification.log`保留无效的pre-ACK门闩试验失败：未确认的输入不能被数据读取认证，
不能靠扣住maintenance/start ACK强造可用的warming状态。该门闩已撤回，源码归档为`abandoned-pre-ack-native-start-gate.mjs`。
本轮没有放宽产品截止时间、预算、完整性/身份检查，亦没有把协议验证称为UI或30K耐久通过。
