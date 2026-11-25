# NAV-FRESH-002续：完整语义组证明的生命周期

状态：实现与回归中。继承
[最初缺口](2026-11-19-full-sdk-membership-proof.md)，不将其82项局部GREEN当作完整验收。
第二工作树 `/private/tmp/arkts-binding-input-delta-20261119`，父1e3886df；无合并/部署。
I为主仓库`.bench/repeated-query-proof-plan-20261117/implementation-20261118/`。

## 全量检查发现的问题

原冻结0a8898a0运行完整pnpm check:fast，退出1：2661项，2657PASS/4FAIL，
0skip/cancel/todo，4147312.662167ms。类型检查/构建通过不能覆盖测试失败。
日志 `full-sdk-member-fence-checkfast.log`，四项全部保留：

1. 本地包目录替换后的下一次定义仍-32803。
2. 20K补全场景等待semanticPreparation20秒超时（不能直接归因CPU或OOM）。
3. A/B/C/A组切换后打开合法未保存新文件返回-32803。
4. 具名watch创建Missing依赖后第一次查询返回-32803。

## 根因与修复边界

### 解析器与新成员证明的建立顺序

包目录替换：第3个Worker请求撤销原目录证明；第4个请求重建revision3的新证明，
但在解析器输入代次准入前，它仍依赖旧配置/目录见证，立即再次失效，尚未进入Program。
冻结b0d旧路径原回归PASS；0a新准入路径失败，确属本次缺口。
证据 `full-sdk-package-recovery-{pre-fence,diagnostic}.log`；诊断源码已归档到
`package-root-recovery-diagnostic-fixture.cjs`，正式fixture恢复，无Error子类插桩混入验证。

现在先通过既有membershipFor完成解析器输入准入和需要时的catalog重建，再取得
原成员证明。旧请求仍拒绝，后续显式请求恢复；不在校验中把旧expected改成新observed。
对应25/25公开回归 `full-sdk-package-recovery-expanded01.log`。

### 缓存被淘汰不等于没有最终证明义务

新增公开多根用例：warm主工作区后，显式prepare另外4个根，淘汰原四项catalog缓存，
保留Program；编译结果形成后修改原未引用源码。旧实现返回成功，漏掉原成员final fence。
证据 `full-sdk-catalog-eviction-red01.log`；原wait/结果断言未放松。
准入现在先确保当前catalog存在，再捕获其原始证明；GREEN见同名前缀green01。

### 证明必须跟着实际查询，不依赖调用者恰好有全局准备作用域

hover缺少导航的外层同步准备域，原首检无法进入实际查询的final union。
`full-sdk-hover-final-fence-characterization.log`2个公开RED证明source/create两种漏洞。
采用Worker本地Symbol将原证明胶囊随workspace视图传递，projection保留，JSON不序列化。
`runPreparedSemanticQuery`在实际租约中、source/config/scope核验后消费原胶囊。
强目录使用原producer和mandatory consumer，保留独立终检；不是仅复制版本数字。

### 弱目录与不可保留枚举的回退

控制Node目录ID为0，SDK仍READY；disk/open两个旧用例都返回陈旧[]。
见 `full-sdk-weak-membership-red01.log`。此为受控弱ID，不是Windows现场。
无原强目录证明时，用原完整路径/token快照和真正的全量权威枚举进行首/末核验。
弱元数据快照按entry/revision不可变共享，**不缓存有效性**；每次消费及独立final仍重扫。
已撤销代次才可后续刷新；迟到的旧代次失败不能撤销新代次。
`weak-membership-generation-red.log`证明旧失败曾污染新代次；
`weak-membership-generation-final.log`55/55PASS固定原事实、独立final、恢复及版本边界。
`full-sdk-weak-final-fence-expanded.log`4个source/create×typeDefinition/hover选中用例PASS。

### 已知输入更新不能当作新发现的静默变化

原proof对应旧成员列表；watch已创建新依赖或didOpen已增加合法overlay-only成员后，
catalog已经推进，而原proof尚未重建。直接验证旧proof会给正常输入更新制造额外-32803。
新增无IO的原catalog元数据比较，发现producer已明确准入新列表/token时，先通过
原权威重枚举建立新证明，再捕获查询。静默磁盘修改没有更新producer元数据，仍拒绝旧请求。
`matchesCatalog`只比较元数据，不能作为文件系统有效性，原current/final/raw仍运行。
两个原语义组失败在 `full-sdk-group-retention-recheck.log`稳定复现，随后
`full-sdk-known-membership-expanded01.log`52/52PASS，零跳过/取消，原断言不变。

## 代码与身份

`project-membership-access.ts`承担原proof捕获/弱回退/代次撤销，
`DocumentStore.validateProjectMembership`保持既有准入顺序；
`semantic-workspace-view.ts`定义本地证明Symbol，`interactive-workspace.ts`随视图传递，
`type-workspace-entry.ts`在实际查询租约消费；`complete-membership-proof.ts`区分元数据匹配和有效性。
Store1520行，等于父1520，迁移债保留；相关新/其他修改文件均低于500行。
没有删除路径/字节/链接检查、压低结果范围、延长超时或改内存策略。

冻结最新Worker0d609a5d919e890ac0b6b2333c4e383bb53de521970590d9213607a77c541590，
I/runtime-m4-binding-and-membership-capsule；源码/产物/Native哈希见其identity.json。
旧0a完整检查不能代表该版本通过；最新最终全量尚未执行。

## 剩余验收

20K初始化超时仍需分类。重测01是父/子测试进程重复加载retainer造成的驱动启动错误，
零LSP请求，不是产品失败；保留日志。重测02使用原测试等待/断言，选中1PASS/2未选中，
fixture开始至READY14674.506ms，交互检查30643.895ms，全局引用34843.892ms。
这不是已解决全量超时的证据，也不代替原超时。03/04串行、GCoff对齐全量runner，
记录于complete-20k-recheck-series.json；完整stdio和服务日志单独保留，结论待终态。

还需不可用/partial目录恢复、跨代旧证明、取消/SDK变化、最终全量与同条件性能重测；
原Photos SDKpartial完整引用/rename、M4余项/M5、Windows/UI/耐久仍未关闭。


### Unchanged 20K serial rechecks completed

Rounds02/03/04 all passed the original selected public test, preserving its20s
initialization notification wait, request waits and exact assertions. This is
three selected-test runs, not three complete test-file passes; each reports two
not-selected tests. Rounds03/04 explicitly disable test cache GC to match the
fullcheck runner; round02 did not explicitly set that flag. A parent capture
wrapper retains framed traffic and server logs, so these are not uninstrumented
performance acceptance or UI runs.

The actual server `semantic.initialization.complete.durationMs` median is
12146.997ms, maximum12168.751ms. Earlier14.67s is elapsed from fixture test start,
including fixture creation, and must not be labeled initialization-only latency.
Evidence: `implementation-20261118/complete-20k-recheck-summary.json`, reproducible
with `summarize-complete-20k-rechecks.py`; original logs and the fullcheck timeout
remain preserved. Passing these repetitions does not explain or fix the original
fullcheck timeout. Latest final typecheck passes; broader final regressions are
running separately and are not yet advertised as successful.
