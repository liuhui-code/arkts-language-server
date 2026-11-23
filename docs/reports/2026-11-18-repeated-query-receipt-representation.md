# NAV-REPEAT-001：复用原始输入身份的解析表示

状态：本轮两个表示复用切片及针对性验证完成；NAV-REPEAT-001仍OPEN。未提交、合并、发布或部署；真实UI未测。
父main1e3886df3c4d27755a53c073462f1456b0a3de7e。
实现工作树`/private/tmp/arkts-repeat-query-20261117`。
证据`.bench/repeated-query-proof-plan-20261117/`。
保护原主工作区既有未提交工作与真实Photos项目；所有产品改动位于上述独立工作树。

## 证据与范围

承接[三轮核验与旧3.8秒](2026-11-17-repeated-definition-checkpoint-cost.md)。
此次只改输入证明的纯解析/字符串表示，Native准备1+终检2轮保持不变。
假设顺序：重复身份构造可消除；Native三轮是独立剩余成本；排队或Program变化须由日志另证。

公开真实stdio子进程、400源码循环import、重复typeDefinition(GlobalThing)：
RED800次完整身份JSON构造，0源码重读、0图重建、2800叶子检查；
GREEN0构造、0重复解析，仍2800检查、同精确Global.ets位置与单Worker。
每次公开查询都实际进入Worker，不能将结果缓存命中冒充验证优化。
`public-red.log`、`public-green.log`保留逐项观测。源码增加新用例后，manifest准确登记两个新文件，
总入口348→350，unit144→145、bundle181→182；保留最初manifest失败，不跳过/放宽分类检查。

## 改动与正确性边界

- `configuration-source-plan.ts`只解析并冻结原load receipt的路径、六个数值字段；不做IO，不证明当前有效。
- `LoadedConfigurationWitness.sourcePlans`按原有identity字符串拥有缓存；reset/retire/真实权威重读清理对应旧表示。
- `configurationSourceIdentity`继续原目录证明、前后两个lstat和全部checkpoint；仅在新观察逐项匹配原表示时返回原字符串。
- 有变化仍构造真实新identity，交给既有拒绝/恢复；不把未知输入强制当regular，也不更新原事实。
- 链接/负探测/不支持格式/弱身份/异常数字保留原路径；源字节读取前后守卫和独立最终union原样保留。

缓存随实际owner/read set增长；不缓存AST、Stats、valid=true或历史版本；不是全局永久SDK磁盘有效性缓存。
这不是取消终检或以watch/目录mtime代替文件验证。ADR0044不宣称规模无关，本轮也不作该承诺。

## 回归

`unit-final.log`53/53PASS零skip/cancel：原≥6次独立叶子观测、末尾变更拒绝、reset/retirement/真实替换生命周期，
以及负探测/链接/弱身份等解析fallback均保留。`expanded-public.log`57/57PASS零skip/cancel：
真实取消与SDK同步、SDK变化、范围恢复、相对解析、磁盘字节终检及SDK-partial初始化等。
TSC/build通过。Rust未修改，复用main既有800e6628产物，不称重跑Rust。

## 30K普通对照（已完成四会话）

固定原隔离Photos30000物理源码、Node20.19.5/x64、SDK路径/默认closure、查询picker53:20→ScreenManager81:9–20。
SDK24/project20partial及完整引用/重命名缺口保持；3955个SDK声明/metadata身份快照不等于实际解析数。
只读预检30000源码与此前冻结输入逐字节一致。完整记录inputs-before.json。

main-a/plan-a/main-b/plan-b四独立会话串行；每会话首次+3次重复。
进程冷启动，Native复用同一已关闭56测试缓存；按原驱动查询后再等Native终态，不改原前置条件。
不是全新磁盘冷索引，不是UI，不是2小时验收。每版本两次会话/六次热样本，不能称六次独立冷启动。
原资源与SQLite60秒保护保持；仅沿用Node2GiB测试停线豁免，不改产品/V8/请求限时。
失败样本及SQLite波动均保留，不排除失败后宣称整轮通过。

| 版本/会话 | 初始化ms | 首次跳转ms | 三次重复ms | SQLite后检 |
| --- | ---: | ---: | --- | --- |
| main-a | 98463 | 9356.90 | 3912.16 / 3933.51 / 4415.67 | FAIL（原60秒完整性检查超时） |
| plan-a | 87395 | 9230.64 | 3618.17 / 3647.22 / 4089.07 | PASS |
| main-b | 86688 | 9400.24 | 3994.81 / 3989.05 / 4351.76 | PASS |
| plan-b | 85975 | 9064.91 | 3611.20 / 3602.78 / 3960.86 | PASS |

各版本六次热样本：main中位3991.93ms/最大4415.67ms；plan中位3632.70ms/最大4089.07ms，
中位改善9.00%。首次中位9378.57→9147.78ms。样本小且存在进程/文件系统波动，不能推断所有项目收益。
四会话精确结果与Native ready均通过，已采样自有进程均关闭；main-a仍计为整轮失败。
当前复用查询慢仍未解决，不能称毫秒级热态。完整来源matched-series.json、ordinary-summary.json和四个run目录。
冻结Worker main d39a901d78d3c3f0dfc5b993e1c0690318a96169a0aed0687175ad61465a8f61；
plan 641655a04eae66312fb813306b3dcbed2d4af24a960ed0ec898c5a4b759ecd6e。
Native 800e66281afb57afe4c129a17923b7778fbd0fbf4cf817d2f591caa4685bc07c，两者相同。
另起plan-cpu独立插桩运行定位剩余热点，不把其耗时混入普通计时。

复现：`python3 .bench/repeated-query-proof-plan-20261117/matched-series-controller.py`（工作目录为主仓库）。
该命令需新run目录避免覆盖原证据；源码/产物已冻结runtime-main/runtime-plan与identity JSON。

## 第二切片：保持原观察次数，移除临时数值数组

`stamp-red.log`：在第一切片上，公开重复查询仍有1612次数值stamp数组比较，精确结果/0重读/2800叶子观察不变。
`stamp-green.log`：使用相同六字段直接比较后为0；仍2800叶子观察、0JSON构造/解析、同结果和单Worker。
`stamp-unit.log`59/59PASS，新增dev/ino/mode/size/mtimeMs/ctimeMs逐字段在前后原始观察之间变化时拒绝；
原末尾变更、独立Native最终核验、同mtime同大小修改、原事实不能重盖章及生命周期回归均保留。
有限数值与原始非有限比较语义保持；未知原身份仍走原raw fallback。
最终冻结Worker为5b638a7bb36ca2c7a724086490157861280bfc0715b006fc82098303d2140b22。
另开main-c/stamp-a/main-d/stamp-b串行普通对照，不能用上一切片57项通过冒充最终全量已通过。

## 独立 CPU 诊断与不可叠加区间

plan-cpu共四个请求，普通结果仍精确，Native ready/SQLite完整性PASS、自有进程关闭。
首次10710.97ms、重复4778.30/4802.28/4875.45ms，含剖析扰动，不混入普通分布。
以重复id3采样为例：整个profile4725.7ms，其中inspector启动调用栈下dispatch为1035.1ms。
**这个dispatch属于剖析器自身，不能归到产品Native IPC或SQLite**。
实际产品调用栈约3523.3ms，准备1642.1ms与查询1881.3ms是兄弟区间；
查询内终检等包含在查询区间中，不能再相加。getDefinitionAtPosition采样约1.45ms。
`LoadedConfigurationWitness.scan`累计1550.87ms、`sameMembership`626.13ms为包含子调用的区间；
所有lstat叶子self1259.1ms是分布在上述区间内的样本，不能与这些inclusive数字相加。
`ensure`1118.66ms含`update`769.43ms，亦不能叠加。
由此证明热点仍在输入资格与证明遍历，而不是重复构造checker或执行跳转算法；
采样近似值不代表每次精确阶段计时，源码行映射以冻结runtime-plan为准。
完整profile及热点栈在plan-cpu/，profile-hot-summary.json保留stack/selfMs。

四轮第一切片Node峰值MiB：main1695.96/2047.34，plan2079.34/2091.64；
Native各自136.05–139.49MiB。Node RSS按进程计一次，Worker线程不重复叠加；
这些是短会话样本，GC与初始化也包含在峰值，不能据此分离计划缓存的净增量或认定泄漏。

身份补充：初次冻结的runtime-main/runtime-plan identity JSON沿用了历史verification描述字段。
保留原文件，新增identity-verification-correction.json纠正；仅逐文件source/runtime SHA及实际本轮日志可作当前验证依据。
不能将该历史字符串视为本轮或最终候选验证收据。

## 最终第二组普通对照及验证收据

| 会话 | 初始化ms | 首次定义ms | 三次重复定义ms | Native / SQLite / 自有进程关闭 |
| --- | ---: | ---: | --- | --- |
| main-c | 86882 | 9368.56 | 3977.83 / 3971.54 / 4327.54 | ready / PASS / CLOSED |
| stamp-a | 87492 | 9189.14 | 3588.21 / 3568.32 / 3930.42 | ready / PASS / CLOSED |
| main-d | 86802 | 9304.90 | 3938.10 / 3950.78 / 4331.03 | ready / PASS / CLOSED |
| stamp-b | 87690 | 9242.09 | 3596.52 / 3595.36 / 3974.57 | ready / PASS / CLOSED |

main六次热查询中位3974.69ms、最大4331.03ms；最终候选3595.94ms、最大3974.57ms，中位改善9.53%。
首次中位9336.73→9215.62ms。与第一组相比，临时数组消除的单独时延收益小于可证实范围，
不根据不同组之间几十毫秒差距宣称独立收益；可证实的是临时分配路径消失及最终候选相对本组main的分布。
每个会话仅4次公开定义，合计第二组16次，第一组16次，独立CPU4次；不称耐久或UI。
第二组4会话均精确返回预期原文件/声明范围，没有取消、超时、OOM或Worker恢复事件；
每会话创建1个Worker，关闭后所有采样自有进程均结束。仅测试覆盖范围内的结论，不宣称普遍稳定。

第二组Node峰值MiB：main-c2060.89/main-d2054.43；stamp-a2022.42/stamp-b2062.90。
Native137.86–141.02MiB，进程树同时采样峰值2159.89–2201.74MiB。
不能相加各进程不同时刻峰值充当实际进程树峰值，也不单独重复计算Worker线程RSS。
原资源日志与stamp-resources-and-worker.json保留。短会话不足以验证长期内存斜率。

最终类型检查PASS（final-check.log），59/59单元/生命周期、57/57扩大公开LSP回归、
7/7大证明/SDK回归均PASS，0skip/cancel/todo。后者覆盖30003个合成源码的完整引用/重命名、
128/4608真实依赖闭包、冷字节来源窗口及128/4608声明SDK的源码恢复；
**该最小SDK合成项目通过不代表真实Photos SDK24/项目20已具备完整引用/重命名资格**。
未对本轮候选运行完整pnpm check:fast，不能沿用main既有2560/2560记录作为本轮全量收据。
Rust没有改动，复用原hash，不宣称新Rust验证。Windows真机与真实Zed UI未测。

inputs-after.json确认30000源码、3955个SDK声明/元数据及最终冻结源码/运行产物均无增加、删除或hash变化。
生产改动仅原始证明表示复用与比较分配；没有改Native三轮、独立终检、磁盘权威、预算/V8或任何截止。

## 仍需解决的成本及后续边界

NAV-REPEAT-001保持OPEN：典型重复仍3.6秒，首次9.2秒，不能交付为“热查询问题已解决”。
实际Worker观察中重复请求Program/checker starts/returns保持2/2，未新增相应构建阶段；
同步Host入口仍每查询进入约3次，不等于每次真实重建Program，也不能由计数推断其全部耗时。
first/hot、准备与最终证明、实际字节读取/存在探测的作用范围需继续区分。

剩余明确调用链：runNavigationQuery→prepareInteractiveContext→ProjectOperationScopes.project/ensure→
ScopeDependencyGraph.update/currentNodes→ScopeModuleBindings的各load-owned witness→
LoadedConfigurationWitness.freshness/scan→requestConfigurationIdentity→configurationSourceIdentity；
sameMembership→refreshProjectMembership→CompleteMembershipProof.current贡献完整Native成员核验。
最终查询通过withRequestInputValidation重新执行独立联合核验。以当前源码为准，
这些扫描包含按实际成员/lookup read set增长的循环；不能据单个30K样本证明总响应的精确复杂度。

下一步应先将**同一同步阶段中已经完成的原始观察如何安全共用**与**必须独立的最终观察**列为不同责任，
以旧原始事实逐字段匹配、成功生产者、owner/epoch/revision与最终变更拒绝作可测试合同。
本轮没有实施这种跨owner观察共用，也没有改写原两次原始叶子或Native三轮；
不能只返回一次cached valid=true来消掉遍历。该结构性成本是下一阶段对象，当前纯表示优化不能代替它。
原第一组main-a SQLite60秒失败继续保留，不因第二组全通过改标签。

可重复普通单会话命令（仓库根目录，选取尚不存在的run名）：
```sh
PHOTOS_RUNTIME_NAME=runtime-stamp PHOTOS_RUN_NAME=stamp-replay-new PHOTOS_WAIT_NATIVE=1 \
PHOTOS_CACHE_DIR=/Users/liuhui/Documents/code/arkts-language-server/.bench/index-versioned-maintenance-20261104/functional-closure-20261111/initialization-breakdown-20261112/photos-readiness-refresh-cold-56/index \
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node .bench/repeated-query-proof-plan-20261117/photos-series-probe.mjs
```
计时采用无CPU剖析普通observer；需要读取测试自有进程资源的系统权限。先确认缓存没有活动使用。
