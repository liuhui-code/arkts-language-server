# M4-b：节点复用、输入证明版本与拓扑版本

2026-11-19；A方案的一片，整体目标仍未完成，不合并、不部署。
工作树 `/private/tmp/arkts-repeat-query-20261117`，父main `1e3886df3c4d27755a53c073462f1456b0a3de7e`。
冻结Worker `2c00fff53b6890dd31d842ae310d9489ebad686f43ca36844c2ebb4661d04d4a`，
Node20.19.5/x64，Native沿用800e6628，无Rust改动或新Rust构建。
E为主仓库 `.bench/repeated-query-proof-plan-20261117/implementation-20261118`。
309份源码/产物hash见 `runtime-m4-node-topology-identity.json`。

## 已证原因

`ProjectOperationScopes.ensure`发现源文件版本变化后，将完整角色目录交给
`ScopeDependencyGraph.update`。只要一个旧证明失效，原实现就对全部节点重新分配对象、
逐边调用 `ScopeModuleBindings.resolve`，再全图构造反向影响集合和SHA摘要。
底层已有绑定缓存，不代表派生图真正增量更新。

公开stdio最小复现：400个TS模块组成环，只保存 `Unused350.ts` 的数值表达式；
查询另一个文件中的GlobalThing。结果原本正确，但400个节点和400条绑定全部重做。
RED `m4-node-retention-red.log`。输入变化由实际磁盘写入和watch通知产生，没有改阈值。

## 实现与边界

调用链：公开typeDefinition → Worker `typeDefinitions` → SemanticGroups.select →
ProjectOperationScopes.ensure → ScopeDependencyGraph.update → ScopeModuleBindings.retain/resolve →
scope selection/编译器 → 原独立final输入核验。

1. 未变角色节点只有在原source/boundary/binding证明仍有效时复用。绑定必须仍是缓存中的
   **同一owner对象**，不能拿同字段的新结果替代。复用节点仍保留其SDK和边界owner，
   `finish`不会因为本次未再次resolve而误删；不再使用的owner仍正常清理。
2. `inputRevision`在节点替换/删除前推进，防止旧证明借用新owner。binding自己的版本、
   ProjectOperationScopes内容版本、Host/文档版本和原final核验继续独立存在。
3. `revision`只表示派生拓扑变化。比较角色完整依赖摘要、ambient/opaque/dependencyFree、
   native/opaque状态和有序边；角色摘要包含global/export/reference信息，绝非只比较imports。
   相等不代表语义类型/API相等：数值常量从literal变number时Program仍更新，hover必须变新。
4. 删除每次全图SHA摘要；拓扑未变时不重新计算影响集合。真正拓扑变化仍保守重算影响集合，
   当前仍有全量证明遍历、visited/角色目录构造，不宣称完整O(delta)图算法已完成。
5. `topologyDirty`必须在写节点前设置并跨异常/取消保留；只有完整effects成功后才清除。
   `rebuilding`期间原证明不能有效。不能使用每次update的局部dirty变量，否则半次更新的
   新节点在重试中被复用，恰好导致变化被遗忘。

这些版本是Graph私有元数据，**不是Host project version、Program返回或Worker世代，也不是READY**。
未改变结果新鲜度合同、SDK能力边界、产品超时、V8/内存/规模阈值或索引DB格式。
路径/配置/namespace不确定时保留原回退；没有截断正确结果。

## 回归与对照

- `m4-node-retention-green.log`：保存、撤销各只替换349/350两个节点，绑定resolve各2次；
  精确跳转和350自身hover literal→number→literal正确。一个Worker，关闭0。
- 第一片扩大 `m4-node-retention-expanded.log`：66/66 PASS，零跳过/取消。
- 新RED `m4-topology-work-red-and-cancel-characterization.log`：上述2节点已复用，但
  update内全图迭代仍2次、影响重算1次；同时旧全量逻辑取消恢复的行为表征通过。
- 当前正常 `m4-topology-version-contextual-cancel-fixed.log`：2/2 PASS。
  body保存/撤销：全图拓扑扫描2→0，update内影响重算1→0；当前/final证明不省略。
- 取消场景在真正node Map.set之后暂停，通过公开 `$/cancelRequest` 设置实际共享取消单元；
  按具体Worker wire ID匹配winner1，公开请求81得到-32800。同Graph1、同Worker重试后
  新全局声明AfterCancelledGraph精确返回。取消时topologyDirty=true/rebuilding=true，
  inputVersion862；重试无新节点替换、inputVersion仍862，但拓扑版本1→2、dirty清除。
- 冻结旧fb37运行 `m4-topology-cancel-frozen-characterization.log`：取消场景1 PASS/1名称过滤，
  不是整文件全绿。证明已有行为应被保留。
- **对照故障**：仅私有测试fixture在重试时故意清除dirty，
  `m4-topology-cancel-mutant-retained.log`稳定返回错误空数组，测试按预期FAIL。
  这不是当前产品失败，也不是原现场复现；证明取消回归能抓到丢状态。
  `m4-cancel-{baseline,candidate,mutant}-evidence/`保留输入、响应、服务日志、Graph计数及有界协议元信息。

信号文件放在日志目录，避免污染被测源码目录；最初全局取消观察没有请求身份，
无法归因返回的2。已改成准确wire ID/方法/原因/世代匹配；未把该夹具问题当产品竞态。
旧夹具bundle变量名不匹配导致的EPIPE、createHash导入误删的TSC失败均留有原日志；
外部源hash仍需createHash，修正后TSC/build通过。
最终扩大 `m4-topology-version-expanded.log` **67/67 PASS、零跳过/取消**，包含原角色目录取消、
namespace移动恢复/删目录、未通知package/目标变化、SDK相对依赖、原始身份及final交错等。
普通规模/30K编辑计时对照仍待完成，不能把这些机制回归当时延验收。

## 检查工具失败，独立于产品问题

完整unit-contract：1338条，1315 PASS/23 FAIL、零跳过；23条归并为生成目录链接进入
源码归档的同一原因，不能算23个独立产品缺陷。受限进程采样的先前中断另行保留。
`.gitignore`原规则仅忽略目录，隔离工作树的node_modules/target链接被git列为源码，
收集器readFile触发EISDIR。新增隔离Git仓库回归先RED，再用同时匹配目录/链接的规则修复，
保留普通未提交源码。未改采集完整性断言，未删除链接或缓存。
正确隔离工作树聚焦collector/L08/manifest：`m4-generated-links-ignore-green.log`29/29 PASS。
误在原工作树运行的28/28日志已改名 `wrong-cwd`，不计入候选验证。
没有据此宣称完整unit重新通过或check:fast通过；最终仍需完整重跑。

## 剩余

真正变化集分发、反向影响维护、热查询证明遍历、M5不确定性恢复、普通规模/30K编辑时延、
完整check:fast及正式耐久仍开放。没有从400节点计数推断真实30K时延或500ms达标。
Windows只读SSH仍在192.168.31.14:22超时，未进行Windows构建/UI；原Photos SDKpartial及
完整引用/rename缺口仍保留。回滚可分别撤销节点retention与拓扑版本优化，恢复原完整重算；
不能只去掉持久dirty或inputRevision却保留条件重算。
