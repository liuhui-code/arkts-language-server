# ADR0050：查询资格与驻留引用执行分离

- 日期：2026-11-26。
- 状态：Proposed；已本地实施，公开RED/GREEN及真实Photos AST复用已验证；完整check:fast2816/2817，1项初始化进度超时，独立评审待完成。
- 父版本：cc92b50370c0a2471f8315bab2119e59996fd2cb。
- 事项：NAV-REPEAT-001、NAV-HOT-DIGEST-001；[诊断与两轮自审](../reports/2026-11-26-main-performance-root-causes.md)。

## 问题与证据

历史Photos局部引用编辑后4800.95ms：前后完整证明约2.1s，隔离verifier1.514s，
其内getProgram1.083s/query11.49ms；规划30批而只执行一个根的词法验证。
这些为历史W7协议数据，不是新main的全链路复测。
当前main只读语义初始化约91s、30K热输入组件约935ms仍未解决，500ms为体验目标。

组件机制对照确认：已有真实Program时，SDK mismatch仍使OfficialReadinessState.prepare清理
resident证明并在getProgram前返回partial，hasPreparedProgram=false。兼容对照进入观察阶段，
但缺标准库仍degraded；没有伪造READY。该机制不唯一解释原30K现场所有owner/时序。

## 决策

### 1. 分离资格，复用现有生命周期

全局SDK/工作区READY、具体owner的成功编译观察、某次查询的完整覆盖/当前输入是不同资格。
沿用现有coordinator、语义组、Host、DocumentRegistry和请求/lease；不新增全局状态机、缓存管理器或默认压力阈值。
SDK partial不得自动授予所有查询成功，也不得自动禁止已经能够证明独立性的局部查询。

已明确兼容配置和真实依赖投影的组可正常prepare并使用其LS；请求结束归还lease，
不逐请求dispose项目LS。稳定组身份不含光标/版本；roots不因文档预载或历史查询不断累加。
未知图/原生包作用域等不得以文件数量推测；保留完整安全回退。

### 2. 首个实现片：词法资格在现有全输入围栏内消费

仅支持既有lexicalReferenceProof生产者认可的直接函数体block-scoped单声明变量。
语法提示只决定尝试顺序；最终必须有实际compiler的lexical-block证明，并通过原文、光标、
声明/范围、编译器身份与Locations边界核验。属性、export、shorthand、解构、转换文本、解析恢复等不放宽。

在父端候选/锚点选择与隔离快照/全局batch plan之前，可通过互斥的内部qualifiedOnly请求，一次完成owner准入。父端纯文本提示先筛选直接let/const声明名，
不在父进程引入编译器，也不把提示当作用域/完整性/新鲜度证据。
`group`只尝试合法分组；`retained-first`按原策略先同步已有可准入根owner，再尝试分组。
它不授予未知根冷建权限；空结果不能再由父端重复发retainedOnly请求。
已有完整根owner沿用原完整覆盖证明；分组新增资格仍必须为实际compiler lexical-block。
成功且覆盖证明成立才返回；普通覆盖不支持不贡献任何结果/完整性，继续原完整路线。
输入失效、取消、编译/所有权异常按既有终态处理，不吞掉后重签为成功。

第一片**保留**root-wide结果缓存失效、前后readiness、原始加载/路径/成员证明与独立final union。
因此不宣称已消除N相关成本、不承诺500ms或完整30K跨文件引用/重命名已可用。
不修改SDK gate/READY布尔，不强制构建30K完整Program，不开启实验环境开关作为修复。

### 3. 编译状态与异步边界

编译查询和当前输入核验在原同步lease/输入scope内完成，不把活LS/AST留给跨await的其它任务。
取消先撤销发布资格；同步安全提交或失败清算结束、实际drained后才归还lease。
保持ADR0049 job上下文、世代/终态与旧消息隔离，故障仍共用原预算。
重型完整回退保留隔离；混合前台长尾需实测，不以统一owner为由全部搬回主语义执行路径。

### 4. 后续范围明确，不能隐含放宽合同

输入资格的lexical特化需要另外的实际生产者证据及完整消费者迁移，覆盖入口、缓存键、
驻留覆盖、隐藏成员观察/派生集合和final义务。当前lexical receipt只证明覆盖，不替代freshness。
本片不执行该优化；将其作为后续片保留，不能用第一片通过关闭整个性能事项。
全局导出引用须防无通知在旧无关文件新增import/use的反例，不能只验证旧Program读集。

## 与历史ADR的关系

| ADR | 关系 |
| --- | --- |
| 0018/0019 | 落实已授权长期LS、稳定组、连续delta与请求输入复用；无需重新发明该架构 |
| 0016 | 原SDK-only隔离Worker及未迁移完整回退保留；迁移组按0018/19归还lease而非每job销毁 |
| 0004/0047/0048 | 保留根级结果失效、查询receipt校验和完整namespace/final合同；本片不缩小输入证明 |
| 0037/0044/0045 | 保留原加载/路径/完整成员/旧请求失败终态，不以新stat授权旧AST |
| 0023/0031/0049 | 保留不可中断提交段、取消与实际drain、每job上下文与既有恢复预算 |
| 0029 | 默认无RSS预算不变，生命周期释放与故障恢复不变 |

## 替代方案

- 直接启用旧实验开关或放开hasPreparedCompilerState：无法证明输入/覆盖/所有权，不采用。
- 每次隔离新LS、只共享SDK AST：安全回退保留，但重复项目准备成本仍在。
- 强制完整根Program、扩大批次/超时/内存：放大初始化和前台风险，不采用。
- 先删前后全namespace证明：既有lexical receipt未承载这些义务，不采用。
- 新增Salsa/另一套owner缓存：现有机制可承接，扩大架构范围，不采用。

## 验收

从公开child LSP默认策略起步，先RED再最小实现。SDK partial+真实module配置下
open→引用→edit→引用→undo→引用，精确3→4→3与当前文档版本；实际LS/Worker/Program观察
确认没有每次隔离构建，允许合法增量Program换代，不仅检查Worker未退出。

覆盖不支持/property/shorthand、SDK/配置/未通知变化、原始路径替换/目录恢复、
连续编辑/取消A后B复用、构建失败同版本重试和lease清算；不能以SDK complete暖态替代partial回归。
最终必要完整检查与同条件真实Photos/规模/混合请求分别报告。保留所有失败、500ms非硬线、
455冷目录3秒门槛用户豁免；UI/Windows与协议证据分开。本任务不自动合并、发布或部署。

## 实施跟踪（2026-11-26）

[实现与实测](../reports/2026-11-26-retained-lexical-reference-implementation.md)、
[TDD/中间失败](../tdd/2026-11-26-query-qualified-retained-references.md)。
前后全namespace/final仍保留，故不以LS复用等同端到端性能目标达成。
未知group直接拒绝本尝试；包投影拒绝不隐式扩成完整语义单元，而是走原完整隔离路线。
投影根较少不证明实际import依赖闭包较小：首次合法组查询仍可构建Program，
稠密依赖的同步工作、前台竞争与真实Photos适用性需另验，不能把简单拓扑实验外推。
覆盖不支持后的fallback不得在本请求内再尝试同一局部查询。

## final03准入调度补正

final02完整检查发现两项首次冷查询及一项已编辑SDK-partial根owner回归：多发一次探测。
不能通过改事件名称或增加断言容忍掩盖。原冷查询零前置队列、已准备owner一次请求断言保留。
新增同样根owner下局部绑定的反例，证明仅靠文本筛选仍会产生2次请求，故采用一次准入job。
`RESIDENT_FIRST=0`保持有效，对应group模式；默认已知根意图对应retained-first，最终权限仍由原owner检查决定。
纯文本提示允许假阳性（例如注释），Worker实际解析/编译才决定结果；复杂声明可安全走原完整路线。
不将提示失败解释为没有引用；不新增第二套缓存或管理器，不改变取消/drain/全输入final合同。

补充：0047结果缓存两版均已可用，普通串行对照各4次query-qualified/lexical-block实际命中。
0050针对缓存miss下的驻留owner消费，不重定义结果缓存语义；编辑需要重算结果不等于必须重建LS/SDK AST。
实际对象复用、结果完整性和请求输入新鲜度分别取证，不互相代替。
