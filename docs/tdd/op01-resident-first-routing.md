# OP-01 resident-first 引用路由

日期：2026-10-11。父修订：`a111235bc4bfcb55b126752f95b3ba095f2996af`。
沿用 `codex/op00-query-attribution`，保留研究审核和 OP-00 改动。
依据为[OP 后续计划](../plans/2026-10-11-query-performance-follow-up-plan.md)的
引用路径归因：proxy 候选约 72–74 ms，owner 内已有完整 resident 优先。
本切片把已有 owner 尝试提前，不新增 compiler、owner、缓存或公开 LSP capability。

## 表征与职责提取

先运行现有公开 Worker 协议与真实 LSP 引用合同；focused 七项引用通过，
23 项协议完整通过。提取引用参数解码、请求路由事务与 resident 观测；
原开始／结束 snapshot fences 和 in-flight 生命周期保留。第一组联合
35/35、exit 0，39582.261174 ms，零 skip/cancel/todo。

Legacy 引用桥接提取时误移除了其它调用仍使用的 fileURLToPath 导入：
strict 编译报缺名，公开 LSP 12/12 失败，244397.398771 ms；Worker fatal
而非 SDK／设备问题。一次新行为 focused 也因此失败，20479.486938 ms，
不作为有效 resident-first RED。恢复导入并重建，strict 编译恢复 exit 0。
随后完整文件原 12 项全通过，唯一失败是下面的候选规划反例；不倒改失败记录。

旧生成构建冻结于 `.bench/op01-baseline-a111235-v1`，server sha256
`3e65d6b1ac66385e72b6b3216d9d2dbcd0c744d011296e2db3cd785c78dc86f5`。
新构建的同构建对照另用路由开关，不能把关闭整个 R-09 当成只关闭 OP-01。

## 真实 LSP 的 RED GREEN

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 \
  tests/semantic/resident-session-references.test.mjs
```

有效 RED：12 PASS / 1 FAIL，40692.58112 ms，零 skip/cancel/todo。
275 文件工程中完整 Program 的新引用两种声明策略均 exact／resident hit，但
candidate-selection 次数为 2 而非 0。反例没有缺失模块、启动失败或假 SDK 跳过。

最小实现：references RPC 的 residentOnly 模式只检查当前可用的完整 resident；
无可用证明返回 null，不准备 LS／Program、不启动 verifier。正常 fallback 的
null 则明确报错。proxy 仍先查完整答案缓存，resident-only 后和候选／正常查询后
都验证原请求 snapshot。配置、overlay、取消、lease、压力及完整 scope 保护保留。

focused GREEN：1/1、exit 0，3570.335389 ms，12 个未选中。
两种声明策略默认 0 次候选、0 verifier、非答案缓存；重复请求各命中完整缓存。
`ARKTS_REFERENCES_RESIDENT_FIRST=0` 仅恢复候选优先顺序，既有 resident 仍启用。
新顺序缺省开启，显式 1 开启；R-09 关闭或 legacy／dirty-index 路径不提前试探。
预算仍为 1024 MiB，六项原默认与 SDK／搜索边界不变。

## 剩余验收

协议边界 RED：residentOnly 混合候选字段仍被接受，0/1、210.101969 ms；
只允许位置、声明策略、模式和 trace 字段后 GREEN 1/1、208.547452 ms。
非布尔模式拒绝，显式 false 保留原候选合同。
新测试登记 RED 因 unclassified entry 失败（252.816168 ms），随后补 unit-contract
登记和实际 183／88 库存；不隐藏新增测试或跳过检查。

前版六文件联合回归 52/52、exit 0，237565.370905 ms，零 skip/cancel/todo。
覆盖分层工具、原引用生命周期与最新诊断、两种声明策略、alias/native、压力／
Worker 恢复、完整答案缓存、原顺序回退和公开协议。最新 strict 编译 exit 0。
另补冷状态真实 LSP 表征：resident miss 前 owner context 创建为 0，随后候选／
verifier 完整返回未打开文件中的两处引用，1/1、2003.101743 ms。
新表征登记 RED 为 unclassified entry（210.409282 ms）；补 bundle-e2e 后
实际库存为 184，unit-contract 88、bundle-e2e 81。

冻结同构建 timing 清单 12 份，两种声明策略各三对 ON/OFF，反序执行；
六項原默认变量均未设置，只有新顺序在 1/0 间切换。source pin 包含加入索引的
三个新源模块，serverInputSha256 为 2d113f7f…，server 9827de82…；
`.bench/op01-lsp-{no-declaration,with-declaration}-{on,off}-r{1,2,3}-timing-v1-manifest.json`。
沿用原目标、oracle、SDK、预算、180 秒实验停止线和正常诊断；不覆盖旧报告。

已核对的不含声明前两对同构建 timing：r1 新/旧顺序 981.8/1373.4 ms，
r2 反序 1209.2/1053.1 ms；四会话各 5/5 exact、最新诊断 PASS、输入不变、
产品 exit 0。必要输入仍 DEGRADED，raw 报告 FAIL/CLI1 不重标；方向反转
不证明稳定净收益，也不独占归因给设备负载。报告在对应上述 manifest 的
`.bench/op01-lsp-no-declaration-{on,off}-r{1,2}-timing-v1.json`，全部慢值保留。

后续旧代／无通知配置／scope 联合合同、真实 Settings 同构建反序 timing、
独立 trace 和新完整 check:fast 的结果见下文；各构建证据不混用。
OP-01 保持 IN_PROGRESS，OP-00 未完成范围继续补齐；550 ms、最终内存／ready
及完整产品毕业仍在 OP-06／L08，不能以一个 focused GREEN 收口。

## 编辑后失效观察的重复核验

上述 12 个独立 timing 会话已全部终态，60/60 exact、最新诊断 PASS、产品
exit 0、输入不变；新顺序的六对新符号中五对更快、一对更慢，不计算正式 P95。
四个另起进程的 trace 也终态，20/20 exact；新顺序的新符号没有候选规划，
但引用编辑后先拒绝旧输入，进入 fallback 时又拒绝同一份观察。
不含声明 ON 的首个编辑：第一次拒绝前约 287 ms，后续 owner 再检查约 266 ms。
这是 trace-on 的阶段观察，不混入时延统计，不能把整段当成纯 I/O 或 CPU。
旧构建和全部 FAIL/DEGRADED 原始记录保留，不重 pin 到后续修复。

实际循环的三个假说：保留失败观察导致重查；配置核验顺序使已知输入差异
仍付检查成本；两个 RPC 各自执行 metadata 准备。先只验证并修复第一项。

新增真实 stdio 测试与显式私有 fixture 的实际 fs.lstatSync 观察，不 mock
compiler、owner 或内部方法。完整 Program 的初始两处引用精确且 resident hit；
未保存新增引用后完整三处精确。首次 miss 到 transient batch 启动之间，同一
semantic Worker 又执行三次 SDK leaf 身份观察，预期应为零。

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 \
  tests/semantic/resident-first-edit-admission.test.mjs
```

RED 0/1、exit 1，2127.523178 ms；补完整 fixture oracle 和新增 SDK 的 pin 后
重复 RED 0/1、exit 1，2398.756324 ms，均实际 3≠0、零 skip/cancel/todo。
父修订仍为 `a111235b`；RED serverInput `2d113f7f…`、server `9827de82…`。
修复只撤销已证明输入签名不相容的 observation；返回前 fences、有效 Program
开始/结束 admit、配置/磁盘保护与后续完整 fallback 均不得删减。

冷 miss 新/旧顺序的公开表征 2/2、exit 0，5115.566836 ms；两处完整引用、
各一次候选、完整 verifier 保留。完整响应分别 1472.5/1439.9 ms，单对夹具
样本只用于成本控制，不是正式 P95 或真实工程净收益结论。

最小修复后原反例 GREEN 1/1、exit 0，2284.040493 ms；实际重复 SDK leaf
观察 3→0，三处完整引用、正常 v2 诊断和进程退出通过。只在输入签名已不匹配
时清除旧观察，下一次成功 compiler query 才可建立新观察；没有缓存有效结论、
省略结束核验或新建语义 owner。resident state 212→219 行，无超限增长。

登记反例 0/1、189.61361 ms（另三项未选中），明确未分类新文件；登记为
bundle-e2e 后完整库存/引用模式 5/5、exit 0、328.131612 ms，零 skip/cancel/todo。
当前 185 个入口，unit-contract 88、bundle-e2e 82。新增 test/私有 I/O observer
均 ≤500 行；新的联合保护、修复后同构建真实对照和完整 check:fast 仍待执行。

修复后十文件联合 55/55、exit 0，214518.373638 ms，零 skip/cancel/todo。
覆盖旧代/候选阶段 SDK 与文档变更、多根/嵌套根、无通知源/包/SDK/type-root/
symlink、选择性范围、constructor、coalesced 独立取消、交互 lanes、压力/Worker
回收、完整缓存及正常最新诊断；新增实际 I/O 反例也通过。strict 编译/build/
diff 检查通过。一次联合日志观察被工具截断，不能宣称逐字完整 stdout，
根退出/完整终态统计保留；后续完整回归另保存完整日志。

修复后源已不同于 `2d113f7f…` 的 60 timing/20 trace 样本。同构建真实工程
calibration 仍须重新冻结、独立执行，不改旧报告身份。

## 首轮完整回归与计数合同修正

Node 20.19.5 的 `pnpm check:fast` 已终态：1601 项、1571 PASS / 30 FAIL、exit 1，
3472602.782184 ms，零 skip/cancel/todo。完整日志为
`.bench/op01-whole-node20-v1.stdout.log`，SHA256 `2f3e7d29…`；before/after
清单均为 1613 文件、repo digest `400533f0…`，全部输入 pin 一致。
源码 `e09e66db…`、server `9827de82…`、semantic Worker `d4a701bd…`、
reference verifier `3c32f976…`、diagnostic verifier `f5379894…`；SDK 声明、
compiler、stdlib、Settings checkout 与 sidecar 身份同样不变。
该 FAIL 不被 main 的 1585 GREEN、十文件 joint55 或后续 focused 通过替代。

失败包含 27 个原 5 秒冷启动超时、一个原 20 秒大工程引用超时，以及两处
新增 resident-only 试探令物理执行数增加的旧计数断言。没有放宽期限、移除
SDK 必要输入或关闭生产默认优化。诊断先比较同输入旧／新构建，再考虑 SDK
输入和环境变化，未将超时预先归因给 SDK 不兼容或设备。

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 \
  --test-name-pattern='publishes versioned ArkTS diagnostics|resolves a definition through an import alias' \
  tests/lsp-diagnostics.test.mjs tests/semantic/definition-alias-barrel.test.mjs
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 \
  .bench/op01-cold-baseline-replay.test.mjs
```

原测试单独重跑 2 PASS / 0 FAIL，7616.104696 ms，另五项未选中。随后用同一
API24 SDK、fixture bytes、初始化和公开协议，冻结旧构建与当前构建各三轮
反序对照，12/12 PASS、exit 0、43627.73714 ms，零 skip/cancel/todo。
旧／新版本诊断范围约 3449–3523 / 3313–3539 ms，definition 3329–3635 /
3429–3614 ms；原期限都是 5 秒。不证明整轮失败已修复或存在唯一环境原因。
诊断 harness 明确保留在 `.bench/`，只回放真实 stdio，不替代正式回归入口。

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 \
  --test-name-pattern='batched references preserve|opt-in unaliased re-export seed' \
  tests/semantic/references-batching.test.mjs tests/semantic/references-direct-proof-trace.test.mjs
```

父修订仍为 `a111235b`。单独 RED 为 0 PASS / 2 FAIL、exit 1、8693.504704 ms，
另 18 项未选中：批量两种声明策略已有完整 Location 相等，但 4 个物理 queue
被旧断言当作 2 个逻辑请求；seed 的完整位置／接受／anchor 保护也通过后，
12 个准备阶段被旧断言当作一个六阶段序列。没有修改生产 event 或隐藏试探。
最小 GREEN 2 PASS / 0 FAIL、exit 0、8679.423806 ms，另 18 项未选中。
此版 seed 要求两次有界物理 RPC 共用一个逻辑 trace，每次都有完整六阶段及
可用时长；最终 transient batch 非空且逐批 compiler anchorVerified。

GREEN 后把批量完整结果／根范围／队列 transcript 及其专属 replay 提取到
`references-batch-transcript.test.mjs`（201 行）。该版表征明确两个逻辑 trace、
四个唯一物理 requestId、每个逻辑请求恰好试探一次并 fallback 一次，原 overlay、
同名排除、声明策略、逐批根范围和 compiler 时间合同保留。旧文件 1517→1349
行，仍为迁移债务，未机械拆分其它取消／恢复责任。
新入口登记 RED 为 0/1、exit 1、152.383557 ms，另三项未选中；随后登记
bundle-e2e，库存 186、unit-contract 88、bundle-e2e 83。首次四文件完整运行
23/24 PASS，155251.343409 ms，唯一失败是漏更新 bundle 总数（实际 83≠82）；
全部 20 个公开 LSP 用例 PASS。补统计后库存完整 4/4、exit 0、158.549862 ms，
零 skip/cancel/todo。没有把两次运行拼称为一次 joint24 GREEN。

随后对原 28 个超时所在的完整文件及引用／库存，共 15 文件作一次联合复核。
85 项、74 PASS / 11 FAIL、exit 1、382888.888351 ms，零 skip/cancel/todo；
十个原 5 秒冷启动失败与一个原 20 秒大工程引用失败保留，trace 两项不再失败。
日志 `.bench/op01-followup-regression-v1.stdout.log`。新 whole 仍需重新执行，
没有通过隔离 SDK 或关闭默认优化改写该结论。

两个 prepareRename 原合同的旧／新构建对照为 4 PASS / 0 FAIL，14840.957344 ms，
另四项未选中；该孤立样本不复现联合运行中的超时，尚未给出唯一原因。
403 文件的原合同用完整两种声明策略和原 20 秒单请求期限作同输入对照：旧
冻结构建 PASS（用例 30619.715772 ms），当前构建 FAIL（用例 39233.428106 ms，
第三次请求／含声明超时）。联合根为 1 PASS / 1 FAIL、70049.917288 ms，另四项
未选中。这些用例总时长包含四次请求与清理，不能冒充单次响应耗时。
同一当前构建仅设 `ARKTS_REFERENCES_RESIDENT_FIRST=0` 则原合同 PASS，
根 28896.163986 ms，另两项未选中，六项既有默认仍开启。此结果提高新增路由
额外成本的调查优先级，不证明唯一原因或稳定收益。随后两个独立 ON/OFF trace
均通过原完整合同，根 30200.969486 / 27799.802321 ms，各两项未选中；
先前 FAIL 保留。两边各 14 个完整 transient batches、每批 255 个 SDK SourceFile，
Program ready 约 1.46–1.62 秒／批。ON 未查／含声明响应约 14932/14957 ms，
OFF 13004/14467 ms，两个重复 cache 请求分别约 0.5–0.8 ms；不是正式 P95。

ON 在候选规划前多一次 metadata 准备（冷 65.64 ms、下一声明策略 13.84 ms）。
更大的区别是：OFF 首次规划时 index 尚未 open，直接走原完整 fallback；ON
等待试探后 index 已 ready，unsupported direct proof 再建一个约 1779 ms 的独立
anchor，仍得到零 definitions，再进同样完整七批。两边下一声明策略都执行 anchor。
这是已观测的规划时序差异，不将 1.8 秒全部归为试探的 metadata CPU，也不凭
单对样本认定它解释全部超时。trace 文件位于
`.bench/op01-large-routing-{on,off}-trace-v1-logs/server.log`。

修复后真实 calibration 已预声明 12 timing／4 独立 trace 的有限清单
`.bench/op01-calibration-v2-jobs.json`，pin 为 `e09e66db…`，仍为 NOT_RUN；
下面的新源码不能沿用该清单，后续重新生成身份而不改历史样本。
不在合同回归运行时并发采样，不把首版 60/20 样本升级为修复后收益。

## 冷根避免提前派发试探

按上述归因选择最小候选：没有已完成查询记录的根先保留原规划顺序，不先发
resident-only RPC。记录仅是可以漏掉优化的提示，不授予 resident 有效性、不
永久否定结果，也不替代 owner 的开始／结束 freshness、lease 与预算保护。
根的成功 RPC 会更新提示；只读 readiness 不建立提示，Worker 回收／故障恢复
和 dispose 清除提示。未知或并发状态仍可走原完整 fallback。

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 \
  tests/semantic/resident-first-miss.test.mjs
```

父修订 `a111235b`，RED source `e09e66db…`／server `9827de82…`。
真实两处未打开引用与正常 fallback 已相等，但新路由在 candidate-selection 前
实际派发一次 references RPC，预期零；RED 1 PASS / 1 FAIL、3290.156501 ms，
零 skip/cancel/todo。最小实现后 GREEN 2/2、exit 0、3222.768575 ms，零注释跳过；
两种路由冷根都只派发一次完整 fallback，原 20 秒期限不变。

strict `pnpm check`、build、diff 检查通过。新 source `7816d51d…`、server
`a2df8bb0…`；三个 Worker、stdlib、compiler、SDK 与 sidecar pin 不变，见
`.bench/op01-cold-owner-skip-v1-build-identity.json`。proxy 相对父版本 560→550
行，沿用已提取的 route／transport 职责，仍为待迁移的超限文件。
批量表征现在按两个逻辑请求各 1–2 个唯一物理 RPC 作有界断言；seed 逐 RPC
保留完整六阶段，不再假定冷根一定要试探。原完整位置、overlay、根范围、
最终非空逐批 compiler proof 与正常诊断合同不删减。

十四文件完整联合回归已终态 79/79、exit 0、293782.177036 ms，零 skip/cancel/todo，
完整日志 `.bench/op01-cold-owner-skip-joint-v1.stdout.log`。热路径零 candidate/verifier、
编辑实际 I/O 3→0、配置／磁盘／多根／取消／恢复／缓存与库存共同 GREEN。
新构建的 403 文件原合同已复核 PASS、exit 0、根 27950.088018 ms，另两项未
选中；包含两种声明策略和两个 cache 重复请求，四次请求均在原 20 秒期限内
返回完整位置。日志 `.bench/op01-large-cold-owner-skip-on-v1.stdout.log`。
新构建真实 calibration 已终态，见下文；随后新 whole 的完整结果另列于末节。
该单会话不证明稳定提速或 P95。
现有 1601／85 的 FAIL 不因本反例 GREEN 改写，OP-01 仍 IN_PROGRESS。

本分支尚存的已改文件迁移债务：LegacySemanticEngine 917 行、worker protocol
1927 行、semantic proxy 550 行、原 batching 测试 1349 行，均低于各自父版本；
已提取的路由、参数解码、resident 观测及完整批量 transcript 均 ≤500 行。

## 当前构建真实对照

[2026-10-12 结果](../reports/2026-10-12-op01-resident-first-comparison.md)：固定
source `7816d51d…`／server `a2df8bb0…` 的 12 timing／四独立 trace 已全部结束，
60/60 与 20/20 exact、正常最新诊断及产品 exit 0、完整前后 pins 一致。
六项默认变量未设置，只有新路由 ON/OFF；不重 pin 旧 v1 或未执行的 v2。
新目标五对更快、一对更慢；编辑 3.53–5.41 秒，各有两对方向反转，RSS 无一致
收益。trace 证明两种声明策略 ON 零候选／verifier，OFF 各一次候选、零 verifier。
16 份 raw FAIL／DEGRADED 和 CLI1 保留，必要依赖 TS2307 未修复，不计算正式 P95。
finite 清单、终态摘要及逐文件 digest 在 `.bench/op01-calibration-v3-*`。
机制和当前有限对照支持候选继续审计；原 1601／85 FAIL 不改写，OP-01 尚未 DONE。

## 当前构建完整回归与原失败复现

同一 Node 20.19.5／source `7816d51d…`／server `a2df8bb0…` 的新
`pnpm check:fast` 已结束：1601 项、1589 PASS／12 FAIL、exit 1，
2842451.362002 ms，根统计零 skip/cancel/todo。工具负例自己的子运行不替代根统计。
完整日志 `.bench/op01-whole-node20-v2.stdout.log` 的 SHA256 为
`a736559b0c6a2f32d23250dd373fbdf281c93a585b833b35fd1c1b2f28d2ec9d`。
before/after 均为 1615 文件、repo digest `754252ce…`，全部源码、产物、SDK、
compiler、stdlib、sidecar 和真实 Settings pins 一致；审计为
`.bench/op01-whole-node20-v2-audit.json`。没有并行 benchmark、输入缩减或期限放宽。

十一项为原 5 秒响应超时，涉及 hover、rename／prepareRename、补全与 definition；
另一个为原 20 秒／403 文件引用超时。这次大工程失败是首次不含声明请求 id 2，
日志先记录 index 尚未 open 的原完整 fallback，不能仅用历史后续声明策略的
resident 试探／anchor 时序差异解释。两处计数／trace 断言这轮未失败。

之后同一构建单独重跑原 hover、两个 prepareRename、补全、struct definition：
5 PASS／0 FAIL、exit 0，20574.15714 ms，另 31 项因 name pattern 未选中。
仍用实际默认 SDK 与原 5 秒期限；用例总时间为 3825.9–4373.6 ms，包含初始化与清理，
不是单请求耗时。原始日志 `.bench/op01-original-cold-repro-v2.stdout.log`。

实际复现命令如下；历史输出已存在，重放必须换新日志名，不能覆盖：

```sh
set -e
test ! -e .bench/op01-original-cold-repro-v2.stdout.log
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 \
  --test-name-pattern='unopened imported alias and member|prepareRename returns the source alias range and placeholder after an emoji|prepareRename rejects a non-symbol|completes inherited fields and methods after this dot|maps a definition in a rewritten ArkTS struct back to source coordinates' \
  tests/semantic/editor-capabilities.test.mjs tests/semantic/rename-depth.test.mjs \
  tests/semantic/semantic-characterization.test.mjs \
  > .bench/op01-original-cold-repro-v2.stdout.log 2>&1
```

单跑没有复现整轮超时，不证明修复、唯一环境原因或新路由的独占责任。
随后预声明只执行一次五个失败所在完整文件的缩短序列，保留全部原截止时间：

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 --test-reporter=spec \
  tests/semantic/editor-capabilities.test.mjs tests/semantic/references-completeness.test.mjs \
  tests/semantic/rename-completeness.test.mjs tests/semantic/rename-depth.test.mjs \
  tests/semantic/semantic-characterization.test.mjs
```

45/45 PASS、exit 0，133997.288216 ms，零 skip/cancel/todo；覆盖全部十二个原
失败用例，但仍未复现整轮超时。全部源码／产物／SDK／compiler pins 和五个测试
文件字节前后一致，审计 `.bench/op01-five-file-sequence-v1-audit.json`；完整日志
SHA256 `15a0332f0dda12b4a4bc0dbb92dd3b5180190aff86697dcefb29d00dd4d86828`。
该缩短序列不是新 whole，也不证明修复。下一步完善可复现序列或同输入父构建
对照，独立 OP-00 先补实际操作计数；量化成本后再修改。
完整回归仍为 FAIL，新的 GREEN 与阶段采纳／回退审计尚缺，不阻塞独立 OP-02/03/04。

2026-10-12共享分支在OP-02同大小磁盘修复后的source5248dc65新冻结whole为
1608/1610、2 FAIL、exit1，所有前后pins一致。剩余为原403文件首次引用20秒
及继承补全5秒超时；完整记录和一次独立trace观察在[OP-02 TDD](op02-resident-input-proof-reuse.md)。
两个隔离用例通过不证明整轮缺陷修复；OP-03a新的completion排队反例是独立问题，
不能冒充解决这两个超时。没有重新执行相同whole追求偶然GREEN。

## 2026-10-15：路由切片采纳／DONE

采纳缺省完整驻留前移，保留0独立回退、完整答案缓存最前和冷根跳过试探。
原固定12 timing／4 trace共80/80完整位置、正常最新诊断与exit0保持原身份；
重读16份report／manifest／stdout，全部digest与原审计一致，不追加有利样本。
热目标6对中5对更快，实际少一次候选规划且零verifier；编辑和RSS方向混合，
采纳不代表稳定整体提速、内存收益或正式P95。

最近生产input5cf9d618冻结whole1757/1757、exit0、零注解已通过。当前8个路由／
保护文件与whole源码归档字节一致；十个直接合同的原PASS行再次核对，覆盖
冷热、编辑miss、取消／lane、package retarget、压力准入和不完整scope。
独立复核 `.bench/op01-routing-adoption-integrity-v1.json`，SHA
`1fa7716d52960a6636368aa785cbd7ea0fe541f92ea4df7f3f72b798eb44aa6e`。
旧计时生产7816d51d不重盖为当前5cf9d618；旧FAIL／DEGRADED及整轮失败均保留。

本结论只完成OP-01路由合同及有限采纳决定；新工具headfresh whole、原新工作流
77/78生命周期失败、OP-00其余归因及OP-06／L08最终资源／时延／ready仍待完成。
没有合入或发布资格，历史“下一步采纳／IN_PROGRESS”段落保留当时事实。
