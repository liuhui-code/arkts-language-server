# ADR 0025：命名空间变化后的解析证明域恢复

- 日期：2026-10-27。
- 状态：**Proposed；维护者已授权实现，candidate11机制回归及7204.609秒协议混合验证完成；未记录独立设计评审，不追认Accepted。**
- 问题：[SOAK-30K-M001](../plans/2026-10-11-query-performance-follow-up-plan.md#soak-30k-m001)。
- 依据：[根因报告](../reports/2026-10-27-30k-issues-root-causes-and-adrs.md#m001)。

## 背景与现有合同

移动依赖、查询、恢复文件与 import，再删除临时空目录后，resolver 保留的负向
`oh-package.json5` 探测仍依赖原目录的物理身份。拒绝旧证明是正确行为；
Worker 的源码 delta 没有同时重建这个解析证明域，反复查询便反复拒绝。
保留空目录通过，删除空目录失败；配置重载可在同一 Worker 恢复。

[ADR0019 §决定5/7及合并前跨平台恢复约束](0019-stable-programs-and-request-inputs.md)
要求新鲜度和未知变更保守处理，明确未证明祖先 namespace ABA 恢复。
[ADR0005](0005-index-proof-trust-boundary.md)保留负向探测、物理身份及包含边界。
本草案补充失效后的恢复所有权，不放宽这些证明。

## 拟议决定

2026-10-27实施修订：选择现有resolver实例作为证明域，明确下列可执行合同；不把事件通知当作唯一有效性来源。

1. 解析缓存与其 load-owned 正负证明属于同一域。目录/包归属/成员命名空间
   变化使该域失效时，废弃对应缓存与证明，再从当前输入实际加载；不得仅
   reset 证明却保留旧缓存答案，也不得给缓存命中重新盖当前身份戳。
2. 先选择现有 Worker `LocalPackageResolver` 的有界域重建，避免另建第二套
   解析权威。父线程 resolver 的 invalidation 不能代替 Worker 内实例的处理。
   单纯普通文件内容编辑继续沿现有 delta，不一律 reset 整个项目。
3. 事件不完整或实际终检发现旧身份不成立时，当前请求仍拒绝发布；下一次
   显式前台请求应能在有界、可观察的重载后重试。每次输入代次限制重试，
   不在一个请求中无限清空/重建，也不依赖 watcher 必达。
4. 相关 LS/Program 若消费了被废弃的解析事实，同步更新或退役该 owner；
   保留其他可证明兼容的 SDK/AST。是否需要更细域由回归和实际依赖决定，
   不预先宣称常数成本或收益，不重启无关缓存性能 TODO。

## 候选的所有权与状态转换

`LocalPackageResolutionOwner`集中管理manifest正负缓存、目录归属、installation、canonical root、
project model及其实际load-owned witness；现有条目上限和4096见证上限不变。
同一实例原本跨root共享证明，因此候选的generation也是这个实例的域；并未伪称已经有逐文件精确失效。

完整候选回归进一步区分两个边界：全域`inputGeneration`用于未知/未通知变化后的保守消费者重建；
已知root-dirty范围由DocumentStore现有物理/词法alias与closure反向匹配确定，先退役这些消费者，
只移除该命名空间内的原始证明。范围外事实保持**原加载值**，范围外project model及有效closure/membership保留。
解析元数据值仍同步清理，Program使用的owner generation仍推进，旧Program不能重新利用空证明。
若已有证明unprovable/失败读，不能切分范围，退回全域失效；未知事实改变也仍由原始证明触发全域重建。
不是通知到来就给幸存缓存盖新戳，也不是删除身份校验。额外对照覆盖无关manifest在已知事件前/后未通知变化。

每次编译消费者准入先验证该域和当前project model的已有证明。
有效则保持generation，不因普通body编辑/打开文件/光标变化清缓存。
过时、无法证明或已有见证容量耗尽则同步清理**该解析域的全部元数据和证明**并推进generation，
随后实际加载；无循环重试，没有同时清结果缓存、SDK Registry、索引或全部文档。
rootDirty/配置替换仍沿既有显式invalidate；创建/删除/移动使已有负向或路径证明变化时由准入检查识别，
未送达watcher也走同一检查。变更若发生在当前查询中，独立终检仍拒绝旧结果，后继显式查询才重建。

上述“全部”仅指未知/无资格证明的域重建；已知root-dirty采用前述范围退休，配置选择整体替换仍全域重建。
中间candidate3把二者混在一起，完整fast三项root-dirty无关closure缓存保留断言失败；
candidate4修正生命周期范围，原断言不放宽，52项文档存储/跨域证明对照通过。验收收据继续跟随最终全量结果。

编译witness绑定创建时的解析generation；旧Program不能在reset后的空证明集上重新取得资格。
coordinator条目借用前核对generation，不匹配则先退役/清算原owner，再创建消费者。
有未归还lease则明确拒绝，不能越过该owner并行重建；其他旧条目也不得发布，其后续借用/压力回收/关闭负责释放。
旧事实有界并随证明域退休解除引用，不在每次编辑reset，也不以TTL掩盖真实身份变化。

消费链还包含DocumentStore的dependency closure及project membership，不能只退役LS。
中间候选的公开未通知target切换回归返回旧TabletOnly，证明新resolver/LS仍可能消费旧membership。
最终候选在准备视图前核对同一generation；只在代次变化时清理这两个解析依赖缓存，closure本身携带代次防止事务回滚复活。
本地视图以可枚举Symbol绑定**生产者owner及代次**，消费者不能把自己的新代次当作旧视图有效的证明。
Symbol随本地投影传播，不序列化跨Worker；不同isolate的本地计数不可比较，跨Worker原有独立证明/最终联合核验保持。
该额外失败回归及修复收据保留，不能用此前移动用例GREEN掩盖消费者缺口。

candidate4完整检查2069项中6项失败，暴露另一层消费合同：未知包变化触发自动重载后，
同一请求不能把新Program当成原已准备输入的证明。失败样本返回的是**新结果**，未证实这6份是旧声明，
但违反原有prepareRename/rename/call hierarchy/resolve对不变输入的-32803合同，原断言不修改。
candidate5以命令范围的`ResolutionInputAdmission`保存本请求任一准备步骤曾发生的未知重载；
membership预扫、后续prepare和异步子步骤不能抹掉它。嵌套共用事实，并发命令隔离，成功/异常后清理。
没有已见源码delta/reset资格的不变输入请求仍拒绝；新显式请求可从当前事实恢复，无需重启或伪造watch通知。
已知create/delete命名空间事件在原mutation屏障中协调证明，普通body编辑不增加这项工作。

派生的补全recipe也消费解析事实。内部data绑定resolver实例nonce及epoch，避免新Worker的计数0碰巧接续旧recipe。
namespace过期后只保留签发列表字段，不能把新域详情/编辑附到旧item；正常同域详情继续产生完整语义内容。
父端保留的preResolved载荷原先仅凭文档版本直接返回，不能拥有Worker物理输入的发布资格。
现在WeakMap收据只持有root/config revision，Worker用小请求校验namespace后才可复用载荷，前后台调度与mutation合同统一；
大文档/编辑不回传进256KiB请求，400KB边界回归保留。revision变化走普通当前查询，未知输入失败及真实后端故障不吞错。
这不改新鲜度合同或增加LSP方法；[ADR0022](0022-completion-resolution-lifecycle.md)的原item安全回退继续适用。

canonical owner明确改变是既有的新输入，不属于“不变准备输入”的静默重载。
candidate5完整检查2074/2075时该原表征失败；candidate6复用既有canonical-owner-change分类，让旧owner清算后从新输入重建。
此例外不改变路径相等/包含规则，也不绕过producer代次、物理身份及最终新鲜度校验；同owner未知配置的原拒绝合同不变。

## 成熟实现参考与取舍

[TypeScript resolutionCache](https://github.com/microsoft/TypeScript/blob/main/src/compiler/resolutionCache.ts)
关联resolution、实际消费者文件、failedLookup/affecting locations，失效时同时撤销缓存和相应消费者复用。
实际安装ohos-typescript4.9.5-r10的`lib/typescript.js:112330–113029`也有这些失效入口，已记录SHA/片段。
采用“答案与证明同owner、变更后重算消费者”的机制；Harmony自定义包配置/路径边界不等于TS标准resolver，不能直接替换为其内部API。
Context7本轮resolve传输失败，以官方源码和安装包核验回退，未声称获取成功。

替代方案：按每个import及负查找引用计数做精确依赖失效更细，但需要迁移所有长期Program与缓存消费者证明，
本次不叠加第二套依赖图；全项目每次编辑清空会放大开销，删除身份校验或仅reset witness会发布旧答案，均拒绝。
当前共享resolver的跨root代次会有保守重建成本，需如实计量；不放宽原容量或新鲜度边界换取通过。

## 回归与验收

- 公开子进程 LSP：移动/恢复/删目录后精确返回原 URI/range；同会话有限重试恢复。
- 保留目录、同目录重命名、普通 body 编辑为对照；多 root、别名和冷/热 owner 分开。
- 负候选后来创建、配置变化、symlink retarget、未通知变化仍拒绝旧答案。
- 缓存与证明必须一同废弃；独立最终联合核验保留，关闭/取消不发布旧结果。
- 记录域重建次数、读取量、Program 更新和前台耗时；原 30K/2h FAIL 不追认通过。

## 边界与回滚

实现须从公开 RED 开始，独立提交，与 M002/M003 分开审查和回滚。
不删除身份校验、不改全路径大小写、不抬上限、不自动替换整个 Worker 来掩盖此问题。
该草案未记录独立批准；实现/验收收据见[本轮TDD](../tdd/2026-10-27-three-soak-defects.md)及后续实施报告。

## 实施中发现的源码authority切换（M004）

[候选6耐久证据](../reports/2026-10-27-three-soak-defects-implementation-and-endurance.md#m004直接根因与最小公开回归)
补充消费者生命周期：partial catalog中的compiler fallback源码曾留下磁盘load fact，提升为overlay后语义内容已经最新，
随后保存不会产生新的语义内容delta，旧磁盘证明却仍由LS持有。该份证明不能永久拒绝另一文件的查询。

candidate7安装当前overlay snapshot后，只协调同一个已观察project source的旧positive fact：实际bounded byte read，
before/after稳定、词法与物理workspace内、SDK双域排除；读失败或命名空间/配置/SDK变化仍拒绝。
磁盘读不能覆盖overlay，不能用重置全部缓存、取消identity fence或让所有SDK事实重盖戳修复。
完整catalog的既有token-read路径保持；source helper归属LS消费者，不把本地代次当跨Worker身份。
验收新增complete/真实partial对照、编辑后位置、保存后其他文件定义、SDK未知变更及原读中竞态；
候选6失败保持FAIL，新的完整检查/7200s必须以候选7产物独立记录。本ADR仍Proposed，不虚构审阅。

### 源码命名空间与package证明的消费集合不同

候选7补充反例：20K边界后的惰性源码已被提升为overlay，nested磁盘叶删除的公开事件已送达，
本地内容仍有效，却-32803。`promoted-lazy-source-delete-candidate7-red.log`保留complete通过/partial失败。
只检查package resolver是否碰巧观察到该目录，不能决定compiler消费者的source lookup是否仍有效。

候选8在已分类且通过物理边界的source created/deleted mutation处，显式退休该词法/物理父目录的命名空间代次，
再准备下一输入。元数据缓存值与其证明仍一致退役；范围外事实保留原始值并校验，不能重盖戳。
Program消费者随后按既有epoch比较退役；SDK共享语法生命周期不变。普通changed/body/save不触发此分支，
继续原有增量更新与当前overlay自身source read协调，不把每次键入变成全域重建。
替代的“只有package证明失败才更新”遗漏compiler私有查找事实；直接删除旧证明会丢正确性；二者均不采用。
本实现共享resolver域下仍保守推进consumer epoch，不宣称已经实现逐import最小失效图；这是source拓扑变更的取舍。
新增回归必须覆盖virtual overlay删除、恢复、重复查询、保存及SDK未知变化，保留原路径/最终新鲜度检查。

候选9补充重建决策顺序：解析代次不匹配说明旧消费者不可继续使用，但不能提前移除context，
丢失已知内容delta/canonical-owner/reset的具体原因。统一先用现有输入连续性规则确定reset reason，
没有更具体原因时再使用resolution-generation-change，并在唯一退役点结清租约。
未结清的旧owner仍拒绝新消费者；这不改变同版本未知输入的拒绝或身份终检。
原8项删除/fence/reset-reason及96份SDK声明0重复文本读取/两轮独立身份核验断言保持不变并通过。

### M005：overlay返回已准入磁盘快照

候选10普通与独立日志前缀在同动作255/请求1236失败，源为ScreenManager.ts：
compiler witness仍为临时磁盘17243字节，恢复后17200字节；定义的compiler调用前核验拒绝。
不是容量、排队或Worker恢复；与M004共享每份源码证明的authority交接机制，触发边界不同。
既有catalog token更新只覆盖完整membership，候选7协调只覆盖overlay，遗漏partial中已准入的closed disk document。

候选11将协调点明确归属每次script snapshot安装：当前overlay沿原真实有界读更新自身旧fact；
非overlay必须实际稳定读取、与当前DocumentStore已准入的document.content逐字一致后，才更新同一文件的旧fact。
仍核对词法/物理工作区、SDK双域排除、前后身份和4MiB读取上限；读失败或快照不符继续拒绝。
不重置全witness、不删除负/目录/SDK证明、不用新身份给缓存旧字节盖戳，不强制重建健康Program。
最终独立raw snapshot/输入联合核验保持；只能协调已安装的源码快照，不能替未知配置或未准入文件取得资格。

公开回归先以import-type造成compiler fallback，再切换普通import使该源进入显式窗口，
覆盖complete/partial×resident0/1；候选10仅partial/default-resident1 RED，候选11四格GREEN。
额外断言健康context数量不增加、未通知SDK metadata仍-32803，防止以全量reset或放宽证明通过。
简单两文件关闭控制此前四格GREEN的记录保留，不能冒充找到原失败；完整fast/7200s仍须候选11重新验证。

## 2026-10-28最终验证收据

candidate11完整fast2085/2085；独立7204.609s单会话、1197动作完成，原M001移动恢复/实际删目录37次均精确返回。
M004动作212及M005动作255保留原输入/顺序后均通过，后者1005.862ms仍未达500ms。
775输入/87产物、原/隔离各30287及SDK44894零差异，1Worker/0恢复、正常关闭无本轮进程残留。
本机制通过不改变37份完整范围不可用、原生高内存、SDK层2项180s超时等限制；不宣称精准失效图或规模无关。
证据及适用边界见[最终验证报告](../reports/2026-10-28-three-soak-defects-final-verification.md)，历史失败不追认通过；状态仍Proposed。
