# 失败语义构建恢复：TDD执行记录

日期：2026-10-23。父版本`e35459131366a32c48c10d1d74adef74357cd3dc`。
执行[ADR 0020](../adr/0020-failed-semantic-build-recovery.md)。保留原有dirty工作，不提交或合并。

证据目录：`.bench/degraded-repair-20261023/`；原始诊断与调研证据不覆盖。
本次不优化引用缓存；455文件冷目录3秒门槛按用户授权不阻塞，其余检查按实际结果记录。

## 切片记录

实现前先添加公开LSP失败构建同版本重试反例，观察RED后再写最小适配。

### S1：失败LS恢复及Registry所有权

- RED：固定Node20运行`node --test --test-concurrency=1 tests/semantic/failed-build-recovery.test.mjs`，
  原runtime在撤销快照故障后返回degraded/program-unavailable，`01-red.log`保留反例。
- GREEN：`owned-document-registry.ts`逐LS记录canonical path/bucket/kind/node-format及份数，
  在SourceFile观察回调前登记成功acquire；SDK pin在更下层，不混入本LS余额。
  `recoverable-language-service.ts`收拢LS创建/同步/退休。同步失败先dispose再归还余额、撤销证明，
  下次使用同Host与共享SDK创建干净LS，不修改compiler包或伪造输入版本。
- 语义API先通过受保护的getProgram同步，再执行原API（其内部版本快路径不重建）；
  Program完成后的查询取消不触发退休；语法导航API不额外准备Program。
- 首项GREEN见`02-green.log`。继而补三次before/snapshot/after、checker和观察回调异常，
  失败后直接关闭、热更新失败同overlay重试、多语义组其他健康owner保留、真实取消/后续精确定义。
- 真实取消fixture一开始继承旧测试工具的residentFastPath=0，Program已完成后才取消，
  projectRefs=3是合法活跃Program，不能当泄漏。改为当前默认residentFastPath=1后，
  真实构建中取消三轮分别为attempts/completed 2/1、4/2、6/3，项目refs均0、SDK refs均1。
  原校准失败保留在`03-regression.log`/`04-cancel-red.log`，不篡改数据。
- 唯一终态检查改用transport的接收transcript，已被response()消费的消息队列不能用作终态计数。

### S2：致命Worker的有限恢复及生命周期

- RED：`node --test --test-name-pattern='fatal Worker exit' tests/semantic/failed-build-recovery.test.mjs`，
  原proxy failure锁定，同会话准备不能READY，见`05-fatal-red.log`。
- GREEN：提取`semantic-worker-failure-recovery.ts`，复用原recover事务，替换死endpoint、重放
  最新roots/配置/SDK/overlay并使用新epoch。首次出错请求仍失败，不自动重放已取消/已终态请求。
- 默认每180秒最多3次致命恢复；重建期间再次致命失败或超过上限即停止自动恢复并锁定不可用，
  此时需重启语言服务器会话，没有新增公共“解除熔断”接口。关闭时先等待恢复事务收尾再dispose Host。
- 补充退出后latest overlay精确定义、连续四次退出停止重启、恢复中关闭进程exit0。
- RED补证：已READY根在Worker重建后重新得到首次压力豁免，见`07-pressure-red.log`。
  提取`ProjectReadinessLifecycle`，父线程只记录实际完成的prepare（含degraded），
  registerRoot时恢复已消费状态；失败未完成的初始尝试不凭空标记成功。
  1MiB对照现在恢复后仍degraded/resource-budget-exceeded，不借重启绕开运行期预算。
- 初始化/取消/现有压力Worker回收组合`08-regression.log`为38/38。
  更广的新增用例15/15，`09-regression.log`中的额外失败仅为manifest分类计数113→114尚未更新，
  随后已同步manifest及235个入口总数。没有放宽产品正确性检查。

## 实现边界

- 正常Program、共享SDK和其他owner继续复用；只有明确同步失败的LS退休。
  初始degraded的自动重新认证合同不改，显式prepare:true可以认证READY。
- Registry facade只接受固定compiler实际使用的WithKey路径，拒绝无canonical key的旧API，
  不引入新的大小写/路径canonicalizer；正常update必须已经由本LS持有。
- 底层清算抛错时明确锁定该LS错误，不继续复用所有权不明状态；本轮未模拟OOM或native abort。
- 大文件迁移债：typescript-language-service.ts保持3096行，LS创建/恢复抽到独立模块；
  legacy-semantic-engine.ts由787减至785行，根readiness生命周期抽出；proxy由500减至499行。
  所有新手写源、测试及fixture均小于500行。没有宣称这些旧文件已完成体量治理。
- 此前Windows路径修复与缓存性能TODO保留，原始诊断/上游调研均未改写为新版本通过证据。

## 最终候选检查

Mac固定Node `v20.19.5`；编译器实际安装版本为`ohos-typescript 4.9.5-r10`，
`node_modules/typescript/lib/typescript.js` SHA256为
`af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`，未打编译器补丁。
父版本及分支未改变。`final-source-before.json`/`final-source-after.json`固定本轮最终工作区
源码、测试、脚本、配置、Rust与锁文件字节；`verification.json`另记录runtime/native指纹。

| 检查 | 实际结果 | 原始证据（相对证据目录） |
| --- | --- | --- |
| 初次sandbox内全量检查 | 因`ps`/采样权限`spawn EPERM`中止，不能算通过 | `check-fast.log` |
| 首次解除采样限制后的完整检查 | 1968/1969；唯一失败为旧架构断言仍要求原来的LS创建位置 | `check-fast-unsandboxed.log` |
| 架构断言调整后的定向回归 | 2/2 PASS | `10-architecture-green.log` |
| 最终源码完整`pnpm check:fast` | **1969/1969 PASS**；fail/cancel/skip/todo均0，进程exit0 | `check-fast-final.log` |
| Windows同输入公开LSP恢复回归 | **15/15 PASS**；fail/cancel/skip/todo均0，进程exit0 | `recovery.log`、`result.json` |
| Windows输入一致性 | 138文件逐一SHA256一致 | `windows-input-manifest.json`、`input-verification.json` |

架构测试继续约束所有产品LS创建只能通过一个官方受管适配器，整个semantic树只有一处
`ts.createLanguageService`，并继续拒绝旁路`createProgram`及未证明的provider；
没有删掉此约束来换GREEN。最终完整命令包含TypeScript类型检查、runtime/native release构建和
fast层全部测试，测试汇总耗时3,099,145.893ms。该值是整套检查耗时，不是单次用户操作时延。
本轮没有Rust产品修改；当前工作区原有Rust路径回归保留，不把其所有测试宣称为本轮新验证。
455文件冷目录3秒门槛沿用用户授权排除，未将它包装为已通过；未执行独立large/real-sdk层。

## 独立资源生命周期补证

沿用前次`run-case.mjs`/`lifecycle-probe.cjs`，只在隔离夹具与测试预加载器内注入故障并记录
真实Registry计数、Program/AST WeakRef与GC检查点。三个运行均正常shutdown/exit0，
runtime初末指纹一致，每个已发送RPC恰有一个终态。汇总为`lifetime-green.json`，
下表的refs/AST/Program仅统计隔离项目；SDK持有不混入项目余额。

| 场景/检查点 | 实际Program尝试/完成次数 | 项目refs / 活AST / 活Program |
| --- | --- | --- |
| snapshot故障后首次清算 | 1 / 0 | 0 / 0 / 0 |
| snapshot再次故障后清算 | 2 / 0 | 0 / 0 / 0 |
| after-Program边界故障后首次清算 | 1 / 1 | 0 / 0 / 0 |
| after-Program边界再次故障后清算 | 3 / 3 | 0 / 0 / 0 |
| cancel第1/2/3次清算 | 3/2、5/3、7/4 | 每次均0 / 0 / 0 |
| 正常成功Program对照 | 视场景为4/1、4/4或8/5 | 3 / 3 / 1 |
| 同SDK配置退休、尚未重建 | 同上 | 每次均0 / 0 / 0 |

三个原始目录分别为`throw-snapshot-repeat-probe-green1/`、`throw-after-repeat-probe-green1/`
和`cancel-retry-probe-green1/`，各自保存`report.json`、`wire.ndjson`、`stderr.raw`和
`probe-*.ndjson`。同版本显式重试/取消后重试均READY；同SDK后续重建正常拥有3份项目租约，
不需要替换SDK域才能清算旧失败owner。

旧诊断driver在连续故障之间打开overlay，自动诊断可能先消耗一个故障并恢复，所以这里不能
把“第2次显式请求”机械当成“第2次构建”。`lifetime-summary-calibration.log`保留了最初
错误假设导致的分析断言；修正汇总后按原始attempts/completed与活Program判断，未改原始数据。
无overlay干扰的严格“三次失败→第四次成功”由新增公开LSP回归独立证明。
真实`$/cancelRequest`在受控暂停后走实际取消通路；异常与致命exit由预加载器注入，
证明这些边界的恢复控制，不证明任意OOM、硬崩溃或编译器内部所有异常均已覆盖。
未测RSS回落曲线，也不将session正常存活的文档map或有限Host证据缓存宣称为已清空。

## Windows真机范围

Windows `10.0.19045`、Node `v20.19.5`；隔离目录
`D:\code\arkts-degraded-recovery-20261023`，复用此前隔离checkout的node_modules junction与
native exe，生成API24测试SDK，不触碰真实Photos源文件。编译器SHA256与Mac相同；
环境、命令和native/worker指纹在`environment.json`。
所有15个场景均为真实子进程Content-Length stdio，请求、故障控制和断言与Mac输入相同；
总测试耗时32,073.3551ms。此结果不等于Windows 2万文件或完整安装SDK性能验证。

准备阶段的`windows-run.log`只完成了目录解包/junction设置，未执行测试；
`windows-file-run.log`保留PowerShell执行策略拒绝，未修改或绕过该策略。
实际测试改用正常Node入口`windows-run.cjs`，结果为`windows-node-run.log`与远端取回的
`recovery.log`/`result.json`，避免把SSH exit0误记为测试通过。

## 复现与封存

在当前工作区安装依赖并构建后，用Node20串行运行（Mac先将Node20加入PATH）：

```sh
pnpm check:fast
node --test --test-concurrency=1 tests/semantic/failed-build-recovery.test.mjs
node .bench/degraded-repair-20261023/run-case.mjs throw-snapshot-repeat replay-1 probe
node .bench/degraded-repair-20261023/run-case.mjs throw-after-repeat replay-1 probe
node .bench/degraded-repair-20261023/run-case.mjs cancel-retry replay-1 probe
```

诊断trial名必须未存在；完整检查中的OS进程采样须可访问`ps`。
Windows在已备好同输入隔离目录内运行`node windows-run.cjs`，随后`node windows-verify.cjs`；
启动器/输入清单/原始结果均随本地证据封存。

`seal-evidence.py`核验最终源码未变、完整检查零失败/跳过，再保存源码副本和逐文件manifest，
生成`failed-build-recovery-evidence.tar.gz`及`.sha256`。`.bench`不跟踪入Git，需另行保存该归档。
本轮未提交、推送或合并。缓存失效优化TODO继续暂停，既有>500ms、规模增长、完整SDK的
degraded与更大规模验证限制保持未闭环；本轮的恢复通过不改变这些结论。
