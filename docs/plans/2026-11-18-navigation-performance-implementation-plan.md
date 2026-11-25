# 30K导航性能：在既有快照架构上的执行方案

日期：2026-11-18。状态：**用户已授权按A方案实施，IN_PROGRESS；未追认ADR审阅/Accepted，B方案未采用**。
进度与失败见[实施记录](../reports/2026-11-19-navigation-performance-implementation.md)。
依据：[固定源码调研与成本账本](../reports/2026-11-18-navigation-performance-industry-review.md)。
本方案不是引入新快照架构，也不追认历史Proposed ADR为Accepted。

## 1. 目标、冻结身份与保留范围

解决三条独立路径：约87秒语义准备、约9.2秒首次定义、约3.6秒重复定义。
以实际正确结果、可用性、延迟分布和稳定性为准；500ms只是体验目标，无证据不承诺达标。
不修改产品/V8/单请求截止、规模阈值或完整性断言。455文件冷目录3秒门槛沿用户既有授权豁免，失败原值保留。
默认无RSS预算；测试仅延续Node RSS2048MiB停线豁免，仍保护磁盘/实际OOM/整机濒临不可用。

冻结父main1e3886df3c4d27755a53c073462f1456b0a3de7e及候选Worker5b638a7b；Native800e6628。
完整SHA、SDK路径、Node20.19.5/x64、compiler4.9.5-r10、输入hash见E`runtime-stamp-identity.json`和`inputs-{before,after}.json`。
E是主仓库`.bench/repeated-query-proof-plan-20261117/`。工作树为`/private/tmp/arkts-repeat-query-20261117`。
使用现有Photos30K隔离副本；原项目、原缓存、日常Zed和其他工作不修改。
Native缓存冷/暖与进程冷/热、OS文件缓存必须分别标注；不能将闭库重开称全新冷索引。

保留DocumentStore权威、原始load provenance、稳定语义组/长期Program、Registry域、Native版本化存储，
现有Worker监督/共享恢复预算、前后台有限公平、mutation屏障、单一终态和客户端导航所有权。
不新增第二个输入数据库或一套Salsa运行时；不启动无关缓存/内存优化。

## 2. 实施前最小测量M0

当前87秒没有完整分解；首次profile与终版身份不同；56964不是不同文件数或全部IO数。
先复用已有ordinary四会话与历史profile，最少新增一组串行的最终身份ordinary/低扰动阶段诊断；
若差异超出已有分布，再增加同条件交替样本，不先重跑两小时。
本轮没有运行这些新诊断；以下为实施阶段的首项任务。

### 2.1 时间轴与互斥记账

每行记录run/request/command ID、PID/thread/Worker generation、root/config/SDK/namespace epoch、
monotonic开始/结束、wall时间、parentSpan、输入版本及实际输出状态。跨进程不直接相减独立monotonic时钟。
记录request.received→parent入队/出队→Worker收到/开始→准备→compiler→最终核验→回传/发送；
queue与执行分开，父span与子span不得相加。只在同边界中计算exclusive remainder。
Node inspector的enable/start/stop/post放在独立diagnostic span；GC单列，不机械从普通请求扣掉。

| 路径 | 必须新增的最小span/计数 | 需要回答 |
| --- | --- | --- |
| initialize握手与语义准备 | 握手、Worker装载、项目配置/SDK发现、字节加载/解析/Registry命中、Program/checker、角色提取、绑定/图更新、各fence、terminal | 87秒中的第一大块是什么，Program第一次返回后仍做什么 |
| Native并行准备 | 发现、缓存资格/读取或写入、ready/failed、队列 | 与87秒的重叠及实际关键路径，不双算约12秒ready |
| 首次导航 | groups.all命中原因/discover、unit/根数、containment次数、ensure、roots/effects/全局域、真实编译同步、终检 | 为什么初始化不能直接交出可复用的派生结构，是否出现不同合法profile |
| 重复导航 | 纯版本/拓扑检查、roles Map复制/遍历、graph traversals、bindings current、各owner验证/复用 | 余下33%到底在哪儿，是否新增Program或只是同步入口 |
| 所有验证 | phase=query/final及owner/epoch/read-set revision；lstat/stat/realpath/open/read/readdir；cache hit/fallback原因 | 三轮Native与配置路径的真实IO如何分布 |

每阶段分别记录：物理源码数、eligible成员N、角色分类数、Program项目/SDK文件数P、
解析/重解析数、Registry acquire/reuse/release、图节点/边/SCC、解析候选/负事实数、
独立路径数与调用次数、事实种类/owner数F、脚本版本推进数、Host实际更新数。
入口计数与实际工作计数分离：synchronizeHostData入口、版本早退、完整同步、真实新Program/SourceFile/checker。

### 2.2 低扰动原则

沿用现有外置observer和逐次原始请求/结果；不每次生成完整Error.stack或打印每个30K路径。
普通阶段计数使用数字ID及聚合直方图；另一个受保护诊断才取精确per-path/owner样本，记录其内存/开销。
同名路径跨逻辑/物理别名、SDK/项目及regular/link/weak/missing必须可区分。
为configurationSourceIdentity记录进入、目录命中、raw fallback、真正叶子观察、共享观察、成功/拒绝，
禁止从56964调用直接推算113928次lstat；所有函数计数与syscall API计数均保留。

停止/失败时保存最近请求与输入窗口、完整stderr、退役原因和已有profile，不反复OOM、不自动重启掩盖累计问题。
最小交付：M0 timing-tree.json、counts-by-phase.json、input/runtime manifest、逐次results和尚未归因余额。

## 3. 实施阶段、依赖及文件责任

所有行为改动按仓库TDD：先创建真实stdio子进程失败回归，记录父revision和命令，再最小实现。
文件不存在导致的测试启动失败不是RED；不以私有方法单测代替公开LSP行为。
每片独立冻结源码/产物；只在GREEN后抽取结构，手写文件≤500行；超限文件不增长并提取内聚职责。
新增用例登记现有test-layer manifest。以下为后续实施责任边界，不是本轮已经完成。

### M1：先削掉冷/首次的纯派生成本，修正overlay全成员检查

依赖M0确认实际命中/未命中与当前角色/根参数。
范围：SemanticGroups、ProjectOperationScopes、ScopeDependencyGraph、已有DocumentStore权威接口。

- 把组根归属作为现有graph/membership/config身份的派生物维护，预归一化已确认的路径元数据；
  避免每unit×member×root重复resolve。嵌套/重叠/包根和全局声明维持多归属，未知回原判定。
- roles snapshot仅在角色事实确变时替换，源码body更新仍更新原内容/脚本版本；
  immutable对象才允许引用快速相等，可变调用者必须有版本/逐项fallback。
- graph无变化时不构造全量临时Map和digest；复用快路径绑定本请求已经成功的实际成员证明、
  原角色输入关联、overlay/config/resolver代次及所需加载事实；只有root revision相同不够。
  保留current输入与最终raw证明。
- overlay索引由既有事件维护open/changed/closed/reopened集合及摘要；
  最终检查参与的所有overlay和集合生命周期，不只查询文件，不保留关闭后的overlay权威。
- 当前SDK-partial初始化分支只preparePartialWorkspace后return，不走groups.prepareInitial。
  可在合法graph/membership身份下预备纯组目录并交给首个查询，不因此预热已知不完整的全项目Program；
  记录all/discover的graph对象、membership/config缓存键，区分真实冷入口与无谓身份失配。
- 初始化已经实际需要的组派生物可交给首个查询；同身份才消费收据。
  不能仅把首次工作搬到初始化：同时报告init、first和init+first，包含后台干扰。

回归：真实同输入两次查询临时roles Map/组discover不再重复，精确结果与原叶子fence次数不变；
源body/签名/global/配置变化、可变集合、同版本关闭重开、未保存依赖、SDK/config无通知修改仍拒绝/恢复。
不得把“Map少了”独立当速度收益；普通30K冷/首/热至少做同条件配对。

### M2：明确证明种类、read set和同阶段观察的归属

依赖M0；可与M1分片实施，但性能对照必须串行。范围：LoadedConfigurationWitness、
request-input-validation、CompleteMembershipProof、ScopeModuleBindings；沿用现有registry而非新通用框架。

- 事实记录包含实际load identity、fact kind、owner epoch/read-set revision和依赖namespace，
  区分内容、元数据、路径、正负存在性、目录、配置/SDK，不能把同一路径不同要求合成一个boolean。
- 只对同阶段允许共用的成功原始观察消除重复IO，消费者各自比较自己的原事实。
  Native提供的metadata必须包含消费者需要的全部字段；token字段不足不能推定mode或物理身份。
- 新加事实进入最后实际read set，原有事实不重盖章；reset/retire/权威重读按原合同更新。
- 未完成/失败Native验证不能借出临时观察；actual byte-load的descriptor/realpath/read-window继续raw。
- 32MiB请求可选metadata溢出走原IO，不截断证明，不重建Program，不引入全局历史valid缓存。

回归：同路径多owner不同原identity、weak ID、symlink/大小写/不存在路径、读中变化、
原生校验失败、预算溢出、取消清理、owner reset后旧收据、晚加事实均精确对照。
保留原每阶段独立终检；M2不能顺手完成M3而缺少顺序证明。

### M3：统一最终核验计划，处理第三轮Native扫描

依赖M2+原所有late-mutation反例GREEN。范围：request-input-validation及operation-scope组合，
Native owner继续由DocumentStore拥有。当前三轮扫描先保留；不是“刚检查过所以省一次”。

1. 将组合型predicate的epoch/依赖关系与执行IO的leaf observer分开登记，捕获查询真实使用的事实。
2. 建立原观察偏序：A以后必须再观察的B不能借用A；SDK、目录、源读取、消费及发送围栏分别标记。
3. 只合并允许处在同一观察区间的并列消费者；每个原事实约束仍被检查。
4. 使scope predicate明确消费成员证明，不在pure组合中意外递归重扫整个Native。
   可将成员/namespace的终端raw fence安排在其所有消费者之后，但必须证明新的顺序覆盖原反例，
   且不能从pure阶段悄悄读取新输入；出现新输入则失效或回原有安全路径，禁止无限重试至“通过”。
5. 未迁移或无法证明等价的边保留原raw核验。最终与准备阶段观察绝不互用，返回前仍校验受管输入/Worker世代。

必须新建反例：在Native首次终检之后、配置/source自身终检之前及反方向，
分别改变source正文/同mtime同size内容、mode、SDK、链接/父目录及负候选；
在最后叶子观察后改变目录/overlay集合；确保原本被拒绝的不能变为成功。
三轮→两轮是待证优化目标，不允许为计数目标放宽正确性断言；若保留三轮仍正确，报告收益不足。

此片需要给ADR0019实施约束、0037§C、0045相应章节补充明确的观察共享/终检偏序决策草案和证明，
保留历史记录；不能声称Rejected0039已复活或未发生合同调整。

### M4：把角色、依赖、候选和影响集合真正按变化维护

依赖M1/M2以及M0实际图参数；并非在热态优化后才考虑编辑。
范围：ScopeDependencyGraph/ScopeModuleBindings/SourceRole及既有changedPaths/contentVersions。

- delta来源包括LSP、watch、重扫及实际磁盘fence发现的StaleFact。旧请求先拒绝，
  通过既有权威读取/成员准入生成新输入版本，不能在校验回调内重盖原证明；预算内后继恢复，未知保守回退。
- 先消费完整delta的文件版本，再更新变更节点、反向边、SCC及必要namespace候选；
  不因当前scope排除该文件而丢未来依赖的版本推进。
- 分开verifiedAt与changedAt；角色/导出/全局摘要相同不传播拓扑失效，但实际编译输入仍更新。
  这只是Salsa机制的局部适配，不复刻它的整个引擎或未经证明的循环backdate。
- body/签名/推断导出/ambient/opaque/配置的影响范围不同；不把“imports没变”当签名不变。
- 正解析条目绑定源/包/config owner；负解析条目绑定实际探测目录。create/delete/rename精准失效相关条目。
- 仅当同原文/ScriptKind/选项/provenance的实际SourceFile已存在，才复用其语法摘要；
  ETS→TS生成投影、不同registry/owner或首次未加载源码不能冒充同原文AST。

回归同时断言精确结果、实际受影响图节点/脚本版本/Program数量、无关组复用，
未知全局影响允许回到保守全域，必须明确原因和成本，不能返回不完整成功。

#### M4-a实施细化：派生边界消费原始读取provenance（已实现首片，验收中）

初始化Binding32s热点不能只靠终检减次数。ScopeSourceBoundaries目前为每个containing file重新读取root/file路径，
relativeModuleBoundary又在派生计算中实时realpath；而ProjectOperationScopes已实际权威读取过该文件，
ProjectSourceSnapshot.identity的原physicalPath被丢弃。优先复用这一原始输入来源，不能拿后来的当前路径盖章。

- 保留实际descriptor读窗产生的physicalPath和完整数值身份；mode必须来自实际读取，不从五字段token推断。
  必要时补齐真实读窗mode比较和返回元数据，先做公开失败回归；旧/字段不足producer继续原路径。
- SourceFact只保留必要provenance，不多留文本/AST；disk实际读取支持，overlay/SDK/weak/不明来源先保守回退。
- 将relativeModuleBoundary拆为原始路径捕获和纯分类，后者只消费原physical origin/原root配置；
  合格ProjectSourceSnapshot的纯派生不再实时realpath，实际字节读窗仍raw，解析目标和负候选仍保留load-owned见证。
- 原始六字段仍作为真正原输入事实在query/final核验，不能因为边界输出未变就删mode/身份事实。
  只可用实际读取身份创建见证，不以当下观察替代；qualified完整性/物理Root不匹配就回原函数。
- 必测反例：root/父路径临时retarget、同名替换、同文本权限或inode变更、hardlink、符号链接、overlay关闭重开，
  确认没有在实时FS派生中消费新来源却给它盖原快照的章。

此片只是减少重复派生/路径捕获；不替代M4后续changed-node/reverse-edge/影响传播维护。
普通初始化与首次之和、首次/热/编辑后、物理probe/实际读窗次数、原拒绝与恢复均要同输入比较。

#### M4-b当前进展：节点owner复用与拓扑版本（部分已实现）

已通过公开RED/GREEN将400环中单文件保存的节点/绑定重做400→2；完整原证明仍校验。
复用节点显式保留其SDK/边界owner，清理只移除真正未使用项。输入证明版本在节点写入前推进，
拓扑版本仅在完整角色摘要/flags/边变化时推进；body/API类型变化仍更新真实编译输入。
不变拓扑不全图重算effects或摘要；真正拓扑变化暂保守完整effects。
pending topologyDirty跨异常/取消保留，effects成功才清除。公开同Graph/Worker取消重试返回新全局类；
私有故意丢标记的对照返回错误空数组，回归如预期失败。最终扩大67/67 PASS。
详情见[节点复用与版本报告](../reports/2026-11-19-dependency-node-reuse-and-topology-versions.md)。

这不是完整M4：证明遍历、visited/角色目录构造、变化集分发及反向影响维护仍开放。
下一步减少热态全成员派生时，必须核对Native成员revision究竟覆盖路径还是源身份变化；
不能仅比较一个成员版本就跳过token/事实维护，需从真实producer取得覆盖磁盘变化的完成收据，
保留未通知修改、同mtime/size、alias/overlay和取消后的失效/恢复对照。
M5、普通规模/30K编辑对照、完整最终检查及UI/耐久不由这67项替代。

### M5：watch不确定性、恢复和剩余跨平台体验

依赖typed namespace和上述回归；优先接现有输入管理，不立即写跨平台原生watch框架。
已知overflow/error、root替换/卸载/重连、监听重建提升uncertainty epoch，并合并一次受影响域重扫。
安装watch/初扫/回放变更/最终fence采用明确顺序；新gap使旧扫描失效，不按收到事件个数假设没有缺口。
Node未暴露的丢事件不能通过自编heartbeat证明不存在；周期对账不替代当前query/final磁盘证明。
Windows路径仍保留文件名原始大小写，仅沿用盘符规则；case-only rename、junction、短名与卷权限失败需实机。
连续输入下合并最新待办并保留有限进展/公平，不每个watch都取消整个初始化/图/index。

若A的剩余严格磁盘成本仍不满足体验，再单独评审“观察到的输入快照”为一致性边界的B方案。
该评审必须列出静默修改发现窗口、能力差别、reload/后台对账、明确失效与UI反馈；
未经新决定不将B当作A的优化实现，不把SDK局部未知升级为全服务器永久不可用。

## 4. 验证矩阵：每个阶段都检验结果及实际重做范围

所有语义行为由真实child-process Content-Length stdio测试；下表前半为协议/夹具，不能计入UI时长。
列中的“成本”包含对应case冷初始化、首次、无修改重复及操作后首次/重复；P50/P95/P99只在样本量有意义时报告，
小样本列原值、中位、最大，不伪造高分位精度。不同独立会话与同会话重复分别统计。

| ID/变量 | 操作与前置状态 | 正确性与重做范围判据 |
| --- | --- | --- |
| V01 无修改 | 同目标/位置首次后重复；另测不同位置/方法 | 精确结果；图/组派生复用；原磁盘/最终证明保留，不能把结果缓存当Worker快路径 |
| V02 总文件数 | 128/2048/8192/20000/30000递增无关模块；保持目标依赖和SDK不变 | 记录N/P/F/E，隔离无关文件成本；全局脚本不是“无关文件” |
| V03 真依赖 | 相同N，分别增大依赖闭包、扇出、深度和循环 | 记录真实受影响集合；允许真实语义成本增长，不拿V02代替V03 |
| V04 单文件体量 | 相同N/图，增加目标/依赖体积；固定符号位置或记录偏移变化 | 解析/摘要成本与全局遍历分开；不使用超过原资格限制的文件冒充等价输入 |
| V05 局部正文 | 打开编辑、短暂语法错、撤销、保存 | 最新未保存内容、错误诊断出现/消失；摘要未变不重做全图，compiler版本按实际字节变化 |
| V06 语义影响 | import、barrel星导出、推断导出类型、ambient/module augmentation | 反向传播和闭包正确，未知扩大；完整引用/rename不能截断 |
| V07 无关组 | 编辑未打开的合法另一组文件，随后切换过去 | 当前组合法复用，未来依赖仍消费新文件版本；不能以当前未用丢delta |
| V08 静默磁盘正文 | 不发watch，原地修改依赖；同size/恢复mtime；修改非目标全局脚本 | 按现有合同拒绝旧位置或返回当前正确位置，通知后可恢复；不许因revision未变放行 |
| V09 静默SDK/config | 不通知更改SDK/config及选择规则 | 原证明拒绝；同路径/同数字版本不可重盖章；SDK缺项只影响对应能力 |
| V10 成员/负解析 | 无通知创建动态类型候选、删除/移动依赖后恢复并删历史目录 | 不持续-32803、不复活旧负证明；真正不存在与离线不可访问分开 |
| V11 替换/别名 | 原子替换同路径、父目录替换、symlink/junction换目标、case-only rename | 检查物理身份和namespace，old source/Registry状态不能洗白，弱身份raw fallback |
| V12 终检交错 | 在各owner/观察屏障间注入正文/SDK/目录变化 | 与原fence oracle等价或更强，保护第三轮合并的每条依赖边 |
| V13 生命周期 | 同版本close/reopen、编辑撤销后马上定义、关闭时磁盘更新 | 新文档epoch，关闭overlay释放，旧请求/详情不能复活 |
| V14 请求交错 | references期间改依赖、旧诊断未完继续输入、恢复期间编辑 | 单终态，旧输入撤销，mutation屏障/有限公平及恢复预算保持 |
| V15 取消/致命退出 | 真取消、同步不返回、初始化部分失败/再成功、Worker退出 | 不发布旧世代，不无限重建，租约/任务/引用释放，延迟计入总等待 |
| V16 watcher异常 | 可控overflow/error/rebind、扫描中再次变化、丢事件及对账 | 只受影响域不确定；不会健康状态冒充磁盘有效；恢复后实际查询可用 |
| V17 长期资源 | 混合热点/不同闭包、忙闲交替、关闭重开 | Worker/native个数、RSS/heap、事实/边/缓存计数及空闲趋势；RSS不降不直接判泄漏 |
| V18 默认/回退 | 无SDK/partial、显式预算或成员约束、旧格式、metadata溢出 | 正确说明能力/范围，fallback不伪装完整成功，不隐含恢复4GiB产品预算 |

V02各规模至少三个独立进程，随机种子固定；进程内重复用于测热态，不作为独立冷启动样本。
V03控制图参数时单独维持总文件数，单文件体量、引用数量再单独递增，避免同时变化无法归因。
保存生成脚本、逐次输入/请求/取消/版本/Worker世代、结果oracle和所有失败；不拿基线也失败免除候选缺陷。

## 5. 原30K与Windows真实Zed验收

每个最终候选先跑原Photos隔离副本，同SDK/编译器/默认closure/目标picker53:20→ScreenManager81:9–20；
原30K源码和SDK快照前后核对。进程冷+索引暖与全新隔离索引冷分别计时，Native/语义进度完整终态分别记录。
恢复SDK匹配前，真实Photos完整引用/rename不能算通过；另用完整最小SDK夹具证明功能，不混淆结论。
原先失败的初始化中打开/输入/查询也必须复验，不能只测准备结束后的首请求。

Windows连接可用后，在专用测试profile可回退安装同候选，先核对server/Worker/native/launcher/扩展hash、
Node架构、SDK/项目身份、缓存路径与冷热；保留日常窗口及未保存内容。
必须实际在Zed操作：打开/跨模块切换、连续定义/返回、引用/rename、补全详情、hover、编辑撤销保存、
关闭重开、文件移动恢复/删目录、取消、长空闲后恢复。定义的目标与可见位置需结果oracle核验。
特别复验保存与关闭回退、编辑撤销后无法跳转、迟到导航抢界面、突发长尾与Worker恢复。

UI实际动作和LSP请求分别计数，记录正式单会话起止/时长、可见响应/正确性、进度终态、错误/取消、
前台等待及服务端执行、Zed/Node/native资源趋势与退出原因。日志和协议成功不能替代真实点击流畅性。
若UI权限/交互会话受阻，具体列缺口，继续可执行协议验证，但UI结果标未执行；本轮没有进行该验收。
稳定短测后再恢复原混合耐久场景；不累计不同会话，不主动重启清除累计问题，保护停测是失败结果。

## 6. 检查、验收与交付物

每片记录parent、RED命令/原始失败、实现范围、GREEN与普通/插桩产物身份。
有意义的现有回归至少包含：membership-validation-union、loaded-configuration-witness-lifetime、
observed-source-directory及公开scope-dependency-lifecycle、initial-scope-retry、references-membership-recovery、
reference-disk-byte-evidence、relative-candidate-reuse、partial-project-initialization、
typescript-synchronization-cancellation、large-dependency-input-proof、large-sdk-source-reset。
新增测试按M1–M5的真实缺陷模式建立，不让实现镜像测试代替公开合同。

最终准备交付/合入候选执行完整`pnpm check:fast`及仓库相关检查；Rust修改另跑聚焦cargo test与release。
若无Rust修改，只能以明确hash说明复用，不能称新跑Rust。保留455门槛用户豁免及所有其他真实失败。
本轮调研没有运行这些测试，不借用之前123定向或main2560全量作为新实现证明。

功能验收：矩阵精确结果/完整性/失效/恢复逐项通过；不能仅检查无崩溃。
性能验收：同条件init/first/hot/edit分布及队列分解确有改善，报告残留及波动；不承诺每次500ms。
机制验收：派生缓存命中不做全量Map/作用域重算，必要raw观察和实际最终fence仍存在；
每项调用减少必须对应结果oracle/反例，不以计数减少单独宣称收益。
资源验收：必需状态与实际N/E/F增长一致，旧owner/reset/取消结束后解除引用，长期稳定阶段趋势单列。

回滚边界：M1纯派生快路径、M2同阶段观察共享、M3终检调度、M4图增量、M5对账分别可回退到原安全路径；
回退导致变慢必须报告，不能伪装已达标。若改变文件事实或DB协议再明确迁移，本方案不需要重写0043存储。
B方案只有明确的新一致性决策才可进入实现，不与A混合发布。

### Scale evidence checkpoint (2026-11-19)

V02 serial candidate evidence is recorded in [fixed-closure controls](../reports/2026-11-19-fixed-closure-scale-controls.md):128/2048/8192/20000/30000 each three terminal sessions (15/15PASS,300 requests), actual definition Program16 throughout; matched baseline still pending. Hot and unrelated-edit latency still grow. This does not close V03 or M4 delta/propagation. Original calibration driver failure is retained and corrected with exact alias-rename payload oracles.

M4-c saved disk role-facts dispatch is implemented using the existing contiguous bounded contentDeltas, guarded by completed store-owned catalog/root/reset/overlay/generation lineage; public401→2 polls and unchanged original raw observations. Final expanded101/101 + source-origin2/2PASS; paired2048/30000 ordinary measurements in progress. See [M4-c evidence](../reports/2026-11-19-saved-role-facts-delta.md). This does not close reverse influence, M5 or final checks.

Known accepted body membership renewal now has109/109 regression and6/6 ordinary session evidence;30K unrelated save3914.81→1017.85ms, dependency save4286.79→1432.68ms, hotunchanged~756ms. Distinct source-generation proof removes redundant enumeration while full raw current/final proofs remain. See [member-proof evidence](../reports/2026-11-19-membership-proof-renewal.md). Parent-main same-fixture growth controls running; full A-plan still IN_PROGRESS.

V08 full-SDK correctness checkpoint: NAV-FRESH-002 is an existing parent-main defect:
READY whole groups bypassed the projected-scope membership owner and returned stale[].
Public disk/open and final source/create races now have82/82PASS on frozen0a8898a0;
[report](../reports/2026-11-19-full-sdk-membership-proof.md) preserves rejected intermediate
approaches and raw REDs. Correctness takes priority over prior full-SDK timing; re-measure
with current/final proof present. Fullcheck, cache lifecycle, M4/M5 and final acceptance
remain open. Parent-main15/15 and numeric minimal-SDK9/9 ordinary matrices completed;
those9 timing sessions did not exercise this silent-change correctness case.

2026-11-19 follow-up: original0a complete checkfast finished FAIL2657/2661,4FAIL and0skip.
Second isolated candidate `/private/tmp/arkts-binding-input-delta-20261119` preserves the first
candidate and its evidence. NAV-BIND-001 removes proven global alias invalidation using actual
binding input reads (400→1 related resolution). NAV-FRESH-002 now carries original proof into
actual query, handles weak raw fallback/catalog eviction/resolver-first/known structural input.
Latest frozen0d609a5d has52/52 focused GREEN and weak helper55/55; NOT new fullcheck acceptance.
20K completion initializer failure remains open; serial same-assertion rechecks with full raw
capture run after original check terminal. See binding and whole-group proof lifetime reports.
All remaining M4/M5, scale axes, actual Photos and Windows/UI/endurance requirements persist.


2026-11-19 M4 reverse-edge slice: public cost RED (one full adjacency rebuild) ->
GREEN zero; exact newly-global/restored/deleted source definitions retained.
Expanded55/55PASS including true cancellation/retry; source/SDK/config/final proof
contracts unchanged. [Implementation and evidence](../reports/2026-11-19-incremental-reverse-edge-index.md).
Current/final whole checks and ordinary speed measurements for this identity remain
open. Latest prior-identity Photos session has correct navigation but whole FAIL
(SQLite60s postflight), queued10.49s definition and10.11s completion tails preserved.
Corrected minimal-SDK scale9/9PASS does not replace Photos/UI/endurance acceptance.


NAV-PREP-001: diagnostic and actual completion-detail compiler preparation missed
the existing synchronous handoff. Public400-file RED4raw membership passes/1600
noise lstat -> GREEN2/800; final51/51 expanded, post-compiler stale diagnosis/detail
refused, fresh inputs recover. Ordinary Photos control -> diagnostic-only reduces
post-undo definition10439.97 ->5305.03ms and completion10492.55 ->5320.12ms; final
details slice7579.54 ->2777.47ms. Not UI/endurance or constant-time navigation;
hot~2.6s,20K references5s and remaining M4/M5/scale gates open. Current final whole
check running; historical fullcheck failures retained.
[Implementation/evidence](../reports/2026-11-19-synchronous-diagnostic-and-details-preparation.md).


2026-11-19 NAV-PREP-001 follow-up: hover and signature help also use the existing
synchronous original-proof handoff; current/final phases, raw load guards, lease
and cancellation/scheduling contract unchanged. Independent public cost RED4raw
passes/1600noise lstat ->GREEN2/800; expanded41/41 plus cohesive completion
extraction32/32. Photos hover median8132.65 ->2862.77ms, signature7375.71 ->2747.43ms;
remaining hot definition~2.6s unchanged. One serial session/version, not UI/endurance.
Prior0f wholecheck2681/2682FAIL and frozen selected proof recheck1PASS8not-selected
remain distinct; historical exact environment mismatch unproven, no validator
relaxation. New041bd03a complete check pending; all remaining A-plan gates open.
[Evidence and limits](../reports/2026-11-19-inspection-preparation-and-checkfast-followup.md).
ADR status/review history unchanged.

2026-11-20 final-source observation slice: completed final member metadata is
borrowed only for the first side of resident-source validation; later raw leaf,
physical-directory and final namespace guards retained. Public64-file RED128 ->
GREEN64checks, expanded105PASS before receipt accounting refinement, final63PASS
plus exact-range/mutation/manifest14PASS. Complete20K ordinary matched original
5s transcript fails in all3old+3new sessions; independent successful full-operation
observation5459.57 ->5261.51ms is one pair only, NOT acceptance. Valid diagnostic
reduces40006project lstats across final reference operation (~16.7% total measured
leaf calls); final resident windows still~461–465ms and multiple command fences
remain. Next: attribute remaining reference~850ms unwrapped work, evaluate proper
proof-owner/terminal scheduling rather than deleting guards. Full M4/M5/scale,
matched Photos, final checkfast and actual Windows/UI/endurance remain open.
[Evidence](../reports/2026-11-20-resident-final-source-window.md).

2026-11-20 NAV-PREP-002: default retained references now use the existing synchronous
preparation and actual leased query fence. Exact64-file oracle320->192leaf
observations, final member raw pass restored. A typed guard distinguishes pre-query
admission misses (fresh complete fallback allowed) from failed fences after actual
reference computation (current request fails). Both resident-hit and prepared-
context lanes covered, with actual source/SDK/namespace changes and old SDK-miss
fallback controls. Final frozenba30d739 expanded105/105PASS,0skip/cancel;1016inputs
unchanged. Three-session-per-version ordinary default20K comparison now running.
The original shared fixture explicitly disables the default resident path; its
5s fallback failures remain, and no original test switch/timeout was changed.
This does not close remaining M4/M5, real Photos, fullcheck, Windows/UI/endurance.
[Evidence](../reports/2026-11-20-resident-reference-preparation.md).

2026-11-20 continued: pure SourceFile/text digest reuse removes64 unchanged hashes
in the public body-edit case without bypassing provenance. Isolated reference
entry now prepares synchronous admission and defers verifier launch until final
proof succeeds;64noise leaf checks256→192. Controlled pre-dispatch and
post-verifier disk mutations refuse current request, next recovers. Expanded93
found3 failures in prepared-context admission classification; actual stack showed
configuration checking after the started marker. Pre-admission check restores
3 selected cases (23 unmatched). Full expanded/current20K/final whole checks are
being rerun; no overall goal completion, UI or endurance claim.

2026-11-20 latest candidate moved to `/private/tmp/arkts-hook-fixed-candidate-20261120`
for fixture-only repair while the previous worktree's whole check remains frozen.
Product Worker7b7b8584 unchanged. Actual source snapshot1020inputs initially equal;
SDK private hook fix then passes the unchanged24-case file (seven formerly failing
public SDK cases included). M5 exact initial strong-scan edit/move versus delayed
accepted/rejected watch registration is now repository characterization:8watch
cases PASS plus manifest4, full wire8sessions/124messages. No watcher contract,
provider, product deadline or assertion change. The old whole's seven hook failures
remain failures, not an overall GREEN; final whole on this new candidate pending.
Finish remaining targeted/performance/scale controls before final whole rerun.
Windows/UI, genuine dependency axes and formal endurance remain incomplete.
[Evidence](../reports/2026-11-20-sdk-hook-and-initial-scan-controls.md).

2026-11-20 old frozen whole check completed2727tests/2705PASS/22FAIL/0skip.
Nineteen SDK-hook startup records are requalified by unchanged consuming38PASS;
8250-input raw-vs-borrowed provider counter retains exact2/4 and adds fresh final
phase assertions (selected1PASS); two historical READY tests exposed product
subtype error mapping and are now GREEN on Worker3f9a6af3. Full adjacent regression
running; final full check/performance/scale/UI/endurance still pending.
[Reconciliation](../reports/2026-11-20-input-validation-gate-reconciliation.md).

2026-11-20 remaining-cost attribution: existing30000-source ordinary telemetry shows
most of the historical/current one-pair initialization increase after the first
observed Program/checker return (9.864→10.910s remaining wall interval),not proven
compiler construction time. Initial256 admitted scripts differ from queriedP16;
no AST parse count inferred. New diagnostic adapter preserves completed-final
state exactly once and passes actual public calibration. Descriptor/FS child-span
coverage first RED,then GREEN1PASS; no product change or timing claim. Current full
check02 still running; after its actual PASS only,ordinary/diagnostic/ordinary
same3f30K series then12graph points x3processes x2versions are queued serially.
Six existing V04density/volume fixtures requalified read-only12288hashes unchanged;
no new-current-runtime V04pass claimed. All main/UI/endurance gates remain open.
[Detailed hypotheses/evidence](../reports/2026-11-20-final-candidate-cost-attribution.md).

2026-11-20 final frozen current3f gate completed: actual `pnpm check:fast` PASS,
2732/2732,0FAIL/0cancel/0skip,exit0,4392971.14ms. Source freeze unchanged before/
after; Worker before/after both3f9a6af3. Terminal23:17:50.959Z on2026-11-19UTC.
Authoritative logs/state: E`input-validation-final-check02.{log,json}`. This proves
current full correctness gate,not performance/UI/endurance completion. Old7b
2705PASS22FAIL remains intact. Same3f cost controls now execute serially; their
ordinary-before exact queries succeeded but DB postflight60s timed out,retained
as FAIL. Do not merge these separate evidence scopes or relabel the failure.


## 2026-11-20 current remaining-validation execution

Current isolated Worker4521a49c follows3f's full2732PASS, then83targeted checks
and an ordinary original30K pair: hot2774.70->2708.23ms, first5146.33->5042.39ms,
init78072->78542ms. This small one-pair difference is not performance closure.
Current whole pnpm check:fast actually RUNNING; no inherited full-pass claim.
New graph4521 controller waits for its actualPASS before12controlled points,
then density4521 reuses six original fixtures and actual Program counters, then
cycle4521 executes controlled SCCs. All are serial,3independent processes per
point/version; real UI/endurance excluded. Previous3f controllers stopped at
0sessions after M0 postflight failure and remain unchanged. New original30K
controls both passed DB integrity/owned closure; historical60s FAIL remains.
No planned point is counted as executed. See current-goal-completion-audit.json
and binding-proof report for state, exact hashes and prerequisites.
