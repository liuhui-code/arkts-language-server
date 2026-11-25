# 最终成员观察的明确消费关系：M2-b / M3

状态：IN_PROGRESS，用户授权A路线；不改变ADR历史状态，不合并/部署。
父main1e3886df3c4d27755a53c073462f1456b0a3de7e，隔离工作树/private/tmp/arkts-repeat-query-20261117。
证据I为主仓库.bench/repeated-query-proof-plan-20261117/implementation-20261118；保留全部历史失败。

## M2-b：比较固定观察，而非缓存整个有效性

requestConfigurationIdentity已有每final阶段的固定观察Map。此前同一Witness反复复制/遍历原事实，
尽管实际lookup已经被该Map共享。新增compareRetainedConfigurationFacts仅共享这一比较，
每个事实都确实保留在本阶段Map才允许；未知/嵌套/空/预算不足回到原遍历。
ownerCurrent、epoch/revision、失败标记、取消和目录最终围栏仍执行，不复用准备或查询阶段的观察。
元数据仍计原32MiB额度，最终结束/异常清理释放，非产品RSS阈值。

公开RED1200重复比较→GREEN0，原prepare400/query400/final1600叶子观察不变。
扩大m2-final-facts-expanded.log124/124PASS，零跳过/取消；TSC/build通过。
冻结86d48e943a6ac262619ba664a3bcee8e54996ad4f2f5bcec2b3e0b3e7d6b8f50；
串行m2-final-facts-series.json对照be4a候选→86d4普通→86d4独立诊断，原30K/SDK/暖56缓存。
普通控制init74081ms/first5738.07/hot3183.46、3140.18、3547.23；
新普通init73907/first5616.98/hot2997.77、2976.12、3347.53，热中位约下降5.83%，仅每版一会话。
三轮精确结果/Native/SQLite/owned进程关闭PASS，SDK仍partial；不能外推完整能力或UI。
诊断热id3 Worker3677.36ms，final.union1873.26ms（包含Native两次647.52ms及其他子阶段）；
273270次比较请求实际执行79513次事实遍历。实际遍历746.30ms包含子调用，不能再加到union。
诊断耗时受探针影响，不能当普通2997.77ms的精确分摊。初始化未显示实质改善。

## M3：只替代已由必须消费者执行的重复顶层观察

原路线（同一Native owner）：准备Q → 查询 → 顶层最终N1 → 配置/解析Witness F →
作用域sameMembership中的原始最终N2 → 图/配置后置检查 C → 目录终检D。
新增路线只在有明确消费者时省掉N1，保持N2在原位置：Q → 查询 → F → N2 → C → 消费义务O → D。
N2仍完整执行原Namespace/叶子/资格/取消检查；不是仅从revision认定磁盘不变。
F不从Q借最终叶子，实际读窗不改变。原目录提供者只是原命名空间事实，物理观察仍按原阶段重取。

validateRequestInput第五参数仅内部可信生产者声明：
- membership：CompleteMembershipProof中的实际成员观察；
- membership-consumer：assertCurrentOperationScope的必须消费关系。

查询期间只在成功消费者中记录成功成员观察，绑定原owner对象和epoch/revision。
最终账本仅对仍匹配的生产者/消费者组合省掉顶层重复；旧/混合/无消费者输入保留原顺序。
消费者必须再次通过同一生产者的实际观察，且版本匹配，每个消费者各自结清义务。
失败、吞掉false、遗漏、换成同revision的新owner都不能产生成功；未结清在返回结果前拒绝。
仅省顶层重复，不缓存或省掉其他隐式成员观察，不把Native统一挪到所有SDK/配置之后。

这种限制重要：裸Native/未知消费者若被简单延后，会漏掉Native观察期间的SDK变化。
现实现对此保持原顺序；有作用域消费者时，其原有Native之后的配置/SDK检查继续执行。
新owner不是旧owner的证明。目录变了但成员列表/revision相同也不能用新证明给旧操作盖章。
所有状态局限同步操作，finally清理，未修改Worker监督、重建预算、租约、产品阈值或READY资格。

## 可观察反例与验证

m3-required-member-red.log：真实LSP400源，最终Native两次而期望一次。
GREEN：prepare400/query400/final1200；最终为Native400+配置800，总2000，配置两侧raw不减少。
m3-required-member-green.log7/7；原计数差异保留first-green.log（不是吞掉功能失败）。

m3-required-member-safety.log70/70；后追加两例逐消费者结清/吞false，纳入扩大回归。
m3-required-member-expanded.log142/142PASS；namespace-expanded.log46/46PASS，零跳过/取消。
涉及原六字段漂移、恢复、SDK/配置、别名/源码命名空间、晚加入事实及真实共享取消等。
这不是全量check:fast，也不是Windows/UI资格。

公开stdio定点修改为m3-required-member-public-races.log4/4，事件均发生真实Worker/文件系统：
1. before-source：旧成员证明invalidated=true，scope=false，-32803；恢复后可找到新全局符号。
2. before-directory-cycle：旧证明失效，新证明创建，成员scope=true但旧owner消费义务仍1，返回-32803。
3. after-created：scope=true且义务0，最后成员观察后目录新增仍由终端目录围栏拒绝-32803；恢复可找新符号。
4. during-sdk：实际成员观察true、义务0，后置scope配置检查false，拒绝-32803；SDK配置通知后恢复。

SDK未通知变化仍拒绝，不能拿源码修复洗白；每个场景同Worker恢复，未主动重启。
竞态是受控真实文件操作，不声称复现用户原30K/Zed全部现场；无UI点击或Windows实测宣称。
原30K串行普通/诊断M3已结束，m3-membership-series.json与m3-membership-stage-summary.json保留完整计数。
冻结Worker84346e9c9611b6e022d43b4580fd1d735f5db6d52958ff83d482347978982bc5；
原SDK/30K/暖56缓存、Node20.19.5/x64，协议而非UI。
控制86d4 init74688ms/first5800.39/hot2968.15、3043.96、3338.22；
M3普通init73689/first5235.83/hot2686.39、2716.52、2806.68，热中位约下降10.76%，每版一会话。
控制/普通/独立诊断三轮精确结果/Native30000/30000/SQLite/owned进程关闭PASS；SDK仍partial。
M4/5、全量check:fast、规模/正式耐久及Windows/UI继续开放，不把该单组当整体完成。

## 备选方案及不采用的捷径

- finalizing时直接启用通用memo：会跳过Native晚观察或非缓存IO，拒绝。
- 所有Native都移到最后：改变SDK/配置相对顺序；裸成员反例可漏检，拒绝。
- 只看成员revision或新owner同revision：证明生命周期不同，拒绝。
- 义务未结清也发布，或重盖旧事实/清掉旧拒绝：违反原snapshot输入资格，拒绝。
- 对未知边保留原路线；消费者更换证明时旧请求拒绝，由后续正常新输入准备恢复。

回滚边界：M3只涉及request-input-validation、complete-membership-proof和operation-scope-execution，
可单独撤回消费标记与义务调度，恢复重复顶层观察；M2-b保留事实比较共享及原raw观察。
输入格式/索引DB/schema、SDK配置、LSP能力均未改变；Windows边界和最终门禁仍待实测。
