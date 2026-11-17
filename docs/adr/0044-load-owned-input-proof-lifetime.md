# ADR0044：加载证明是消费者必需状态，不是可按事实数驱逐的缓存

- 状态：**Proposed；正在实施和验证，未记录独立设计评审，不追认 Accepted。**
- 日期：2026-11-08
- 问题：[IDX-V1-SCALE-001](../reports/2026-11-08-scale-dependency-witness-capacity.md)
- 关系：明确修订 ADR0036 决定6及后续 facts-only capsule 的4096条资格界限；其余拒绝、来源、退役和新鲜度合同保留。

## 证据和问题

父版本298d65f与索引候选均在真实20K依赖闭包的首次定义返回-32803。
候选实际日志为 configuration-witness-capacity / retainedPaths=4096，不是OOM。
最小真实stdio子进程、独立最小SDK、同一候选产物：128源码通过，4608源码失败。
该数字是两张证明Map的条目合计，既不是项目总文件数，也不是Program源码数。

4096条界限原本用于约束元数据，却让正确且可读取的依赖闭包永久无法证明。
仅重试或重复构建不能恢复同一输入；增加无关文件不是这个失败的必要条件。
实现遵循了原ADR界限，故本记录修订设计，不能称为修复违反原决定的代码。

## 决定

1. 每个消费者的实际加载/探测read set是维持缓存答案正确性所需状态。
   保留每个实际事实的原始身份与来源，不按固定条目数丢弃、驱逐或宣布有效输入不可证明。
   同路径同种事实去重，重复查询不追加历史版本。这里取消的是证明条目配额；
   不改变项目成员上限、V8、请求截止、产品内存配置或实际文件读取资格。
2. 事实仍按load window取得。普通缓存命中和重复observe不能给旧答案重新盖章。
   源码权威读仅更新其已拥有事实；所有SDK/配置/负探测/物理路径及符号链接边界保持。
   查询范围共享校验仍以独立最终联合核验结束，不引入跨请求valid=true缓存。
3. 所有实际事实都保留来源标签。source-driven replacement只携带原始非源码事实，
   capsule保留不可变身份，不持有旧LS/Program/解析器/witness或owner回调。
   不因事实数大而截断capsule，不放过后加载的SDK配置变化。
4. 生命周期沿用原owner：reset清空事实和来源并推进epoch，namespace retirement移除已退休范围，
   旧owner失效后其freshness不能再授权。消费者退役解除引用，facts-only capsule仅活到既有替换检查结束。
   不新增全局历史路径集合、磁盘证明库或定期重建机制。
5. 失败明细集合仍有原4096条保护；它只是保守恢复失败记录的界限，不是健康输入容量。
   超出该恢复范围、身份不可读取、load window漂移、明确lost-proof/capacity失败仍fail closed。
   不能把真实丢失证明当作可安全源码恢复。
6. 必需证明内存随实际read set增长，终检也仍遍历实际事实；不宣称常量内存或规模无关查询。
   可选请求局部身份memo的32MiB预算保持原uncached fallback；二者不得混淆。
   默认无RSS预算遵守ADR0029；OOM/泄漏与已知规模成本仍单列观察。

## 备选方案及取舍

- 调高4096：把正确性失败延后，仍存在任意健康容量悬崖，拒绝。
- 到配额后清证明或放过输入：认证旧答案，违反ADR0005/0019/0036，拒绝。
- 每次满额重建Program/Worker：同一图仍超额，造成重建风暴，拒绝。
- 目录mtime代替文件事实或跨请求目录缓存：不能证明已消费字节，且ADR0039已Rejected，不恢复该路线。
- 自建证明B-tree/磁盘spill、强制语义分片：增加恢复和生命周期复杂度，分片也不能缩小真实依赖闭包；当前证据不足以需要这些机制。
- 保留完整必要read set：增加与实际加载成比例的元数据，但最小化改动，保持现有验证和退役协议；采用。

## 分步实施和验收

1. 保留父版本与当前20K失败、128/4608真实LSP RED，以及证明生命周期单元RED。
2. 去掉健康事实配额，覆盖两张Map及来源标签；保留实际失败的全部拒绝分支。
3. 验证超过4096的首/中/末事实变化都拒绝；非源码capsule不截断且不受reset洗白；
   重复读取条目稳定、reset清零、namespace retirement移除范围、旧epoch不能授权。
4. 实际LSP 128/4608、原SDK拒绝与恢复、源码delta/read-window、取消及退役回归通过。
5. 相同20K夹具独立普通/trace运行，比对失败前后；记录初始化/查询/内存，不把trace时延混入普通分布。
6. 新源码身份重新执行适用完整check:fast。未变Rust输入可以以逐文件身份与既有receipt明确复用，不能称为重跑。
7. 恢复ADR0043规模与30K耐久验收，保留所有失败和完整引用/重命名限制。

## 回滚和范围

本改动仅witness健康事实保留规则及相应测试/文档，可独立回滚；回滚会恢复健康大闭包不可用缺陷。
不实施暂停的全局结果缓存/Host性能优化，不改索引发布合同。
ADR0036状态与历史结果不改写，ADR0043继续Proposed，协议验证不替代Windows或真实Zed UI验收。


## 2026-11-09 实施补漏：retire-first capsule的同类边界

LoadedConfigurationWitness已保留完整健康事实，但SourceResetAdmissions仍按所有pending
capsule总factCount的4096配额拒绝。实际SourceResetAdmissions接口对4608份真实JSON
读取事实在begin时抛SemanticInputUnavailableError，命令和RED见
`namespace-final-20261109/source-reset-real-capsule-capacity-red.log`，不是由SDK文件数推断。
因此按本ADR原决定移除此处健康证明配额；同context复用一份capsule，成功匹配complete、
实际配置授权和clear继续解除引用，失败替换保留原末尾事实并拒绝洗白，跨context不互相
释放。LoadedConfigurationWitness失败来源明细的4096上限不变，不据此截断正事实。
公开大SDK样本实际capsule14条，仅证明其恢复，不代替真实事实容量接口回归。
这是本ADR既有修订范围的落地，不新增缓存/内存预算或放宽最终校验；状态仍Proposed。
[实施过程及剩余验收](../reports/2026-11-09-reference-route-and-recovery-diagnostics.md)。

## 2026-11-10 实施澄清：跨命令准入与物理catalog归属

内部namespace字节证明不授予失效语义owner资格。完整输入观察共用既有解析准入，
编辑集前后不得消费rebase绕过原请求拒绝；独立引用验证仍可依据其自身完整证明恢复，
pending失败owner不能因为已退役而被误判成普通“尚未创建”全局Program。该规则不自动重放旧公开请求。
同一物理成员catalog保持稳定且仍有效的词法扫描入口；符号链接改指向必须重扫，
不以别名切换制造删除/新建，不向其他context转移已消费delta。两项为证明归属的实现补漏，
不放松ADR0036/0043输入与发布约束，ADR状态仍Proposed。
[失败、普通对照、mutation边界及验收限制](../reports/2026-11-10-final-gate-regressions-and-input-admission.md)。


## 2026-11-10 验收观察：无关文件查询成本（非新增决策）

[IDX-V1-SCALE-004](../reports/2026-11-10-unrelated-file-query-latency-regression.md)
的三轮普通对照保持目标静态依赖闭包2个文件，20K时局部重命名中位数10.75s、
编辑后首次引用16.47s，父版本分别0.32s/5.68s；30K完整引用/重命名仍拒绝。
这是持续性能回退，不能用健康证明容量修复或facts增量写入正确性将其改写成验收通过。
完整namespace捕获有全范围读取/摘要排序，实际新增耗时归属和Program成员数仍待独立阶段证据，
不把统计相关性当成已证明单一根因。后续先核实本候选引入的重复校验/准入范围，
保持本ADR最终核验与旧请求拒绝；不得恢复跨请求valid=true缓存、目录mtime捷径或改阈值。
不在当前普通计时中修改候选，也不将本问题扩成暂停的无关结果缓存/Host重写。
ADR仍Proposed，未新增审阅或Accepted记录。


SCALE004独立20K局部rename trace进一步记录：前后readiness窗口5014/5290ms，
合占公共wall窗口87.77%；callback18.326ms，已有Program实际含20000项目文件/20369总文件。
这不是把所有窗口时间归为源码读取，也不是全请求零Program构建证明：collector仅覆盖callback，
trace-only后置Program统计另有未独占计时开销。当前namespace包装确实前后captureSourceInputs=true，
优化须定位其内部重复成本与范围，不能直接删最终证明。详见SCALE004原始窗口收据；ADR状态不变。
