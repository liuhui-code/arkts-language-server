# S3：源文件绑定引用的输入资格迁移

状态：本片实现与最终独立完整检查通过：2834/2834，零失败、零跳过、零取消。
首轮工厂约束失败与第二轮测试hook失败均保留；统一官方生命周期修正及最终结果见下文。
不是所有引用/重命名性能问题关闭，也不是 Zed UI/Windows/耐久验收。

## 候选与决策

父提交 `cc92b50370c0a2471f8315bab2119e59996fd2cb`，未提交候选分支
`fix/reference-input-qualification-20261126`，隔离工作树
`/private/tmp/arkts-reference-inputs-20261126`。
承接冻结 final03 的 ADR0050/S0–S2；原工作树和主工作区其他改动保留。
[ADR0051](../adr/0051-source-bound-lexical-reference-inputs.md) 是 Proposed，用户授权实施，
没有伪造独立审阅或 Accepted 记录。
[TDD](../tdd/2026-11-26-source-reference-inputs.md) 保留 RED、失败和驱动修正。

本轮完成的不是“缓存命中就跳过校验”，而是增加一个明确的、固定编译输入域：
实际编译器证明的函数体内单一直接 let/const 声明名引用。
这个绑定不可能由另一文件/SDK 合并，Host 仅提供当前源，不解析项目/SDK；
当前/最终仍读取目标字节并核验原始路径、物理路径、祖先身份、overlay 权威和 root/config revision。
不注册全根义务后再删除它；旧 namespace 凭据不能获得新域资格。
其余查询保留原完整 namespace/Program/最终 union 路线。

## 为什么不能扩大到所有局部使用位置

固定 ohos-typescript `4.9.5-r10`，compiler SHA256
`af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`。
实际完整项目与单源 Program 对照：函数别名调用、tag 调用的使用位置包含额外外部函数定义，
完整 oracle 有5个Locations，单源只能看到2个局部Locations。
声明名位置在当前对照中等价；实际绑定检查与严格语法域共同限制资格。
因此本轮不声称覆盖使用位置、属性、导出、解构、shorthand、namespace、ambient、decorator、struct 等。
后续扩大域需要新的生产者证明及回归，不能仅复用此性能数据。

## 实现与生命周期

| 位置 | 责任 |
|---|---|
| `source-reference-input.ts` | 成本提示、descriptor 目标字节/路径证明、物理 overlay 权威、显式预算准入 |
| `source-reference-admission.ts` | 原 root/config revision、原队列 dispatch、独立最终源证明和缓存资格 |
| `source-reference-owner.ts` | 实际固定编译器、当前单源 LS/Program、真实声明绑定/有限范围结果 |
| `reference-query-entry.ts` / `reference-cache-admission.ts` | miss/hit 一起迁移；不支持时回原完整路径 |
| `legacy-semantic-engine.ts` | 在原 backend/Worker 生命周期内接入和 dispose，不新建监督/恢复管理器 |
| `semantic-worker-reference-args.ts` | 严格互斥 source 资格模式，与原协议世代、mutation 屏障和预算共用 |

单 owner 只保留当前源；edit/undo 更新原 LS/Program。异常/真实取消后丢弃其私有 LS/Registry 域，
避免 fork 在构建前提交 project version 后造成同版本重试中毒。
最终额外RED确认Host返回undefined而构建无当前SourceFile也能中毒；该无异常失败现在同样dispose私有域，
同版本新请求恢复源owner。原RED及最新24项GREEN保留。回调读取当前同步 turn，终态撤销上下文。
保留有界 ReferenceResultCache、root 事件失效和缓存元数据字节计费。
默认 RSS 预算仍 null；显式预算仍使用原 level2Ratio/Worker policy，没有新增固定阈值或产品驱逐路线。
源文件缺失/逃出物理根、未证明语法回原路径；并未删掉项目完整性校验或把 partial 改成 ready。

顺带修复裸 CR 的共享 UTF-16 位置换算及 proof 偏移；公开 RED 曾返回空结果。
移除 Legacy engine 已无调用的重复 resourceEventPath 和孤立 fs/path import，资源回归前后通过。
Legacy engine 和既有 typescript-language-service 仍高于500行，均较父版本缩小，作为迁移债务保留；
完整计数见证据 `source-size-audit.json`，无超限增长；新模块和测试均小于500行。

## 统一工厂校正前的普通协议计时（历史候选）

证据根：主工作区 `.bench/reference-input-qualification-20261126/`。
使用 Node20.19.5、相同生成器、隔离项目/索引、同目标闭包、默认无 RSS 预算。
N包括 Main 和 N−1 个空模块，项目 import 边为0；这是规模控制夹具，不是 Photos 拓扑。
合成 SDK 初始化为 `partial / sdk-inputs-incomplete`，全局 ready 未伪造。
每会话1次首次引用、3次 edit/undo 后首次引用、4次无修改重复引用，全部逐项比对 Locations。
普通计时关闭 trace 和 compiler audit；缓存命中4次来自原默认日志，编译次数在此不测。

| 文件数/候选 | 首次1次 ms | 编辑后3次中位/最大 ms | 热查询4次中位/最大 ms |
|---|---:|---:|---:|
|2048 / 新域首轮|63.36|13.86 /16.59|6.26 /8.21|
|30000 / 新域首轮|72.08|15.41 /19.55|6.80 /7.27|
|30000 / 配对 final03|4034.72|2979.96 /3282.30|1119.19 /1192.89|
|30000 / 紧接配对新域|70.00|13.59 /18.60|6.15 /8.74|

配对执行顺序和起止时间见 `followups-controller.json`；两个普通配对会话串行。
原 final03 历史数据不覆盖，新域复测未使用旧结果缓存；目标源码 hash 在 manifest 固定。
初始化/index计时是从同一起点的包含区间，不能相加：配对 final03 index20.402s、semantic20.403s；
新域 index21.711s、semantic22.058s。初始化未优化，不能将两次波动归因于新域。

`resources.ndjson` 每秒采样实际 Node/原生子进程 RSS，各进程只算一次，Worker 是 Node 线程不重复加算。
配对进程树 RSS 求和峰值约623.26/450.64MiB；不是去共享页后的物理占用或隔离 Worker RSS，
短请求可能落在采样间隙，不能据此宣称已解决内存泄漏。未采到的 heap 峰值标为未测。

代码依据：新域工作量由当前源大小/范围、祖先深度、打开文档数及结果大小决定；不遍历 N 个关闭成员。
当前2048/30000对照支持这一个域摆脱总文件数的逐请求扫描；不是所有语义操作 O(1) 的证明。
真实依赖闭包成本、其他前台调度及全局核验仍可能增长。

## 独立计数诊断

`source-audit-30000-retry/` 与普通计时分开，不混算。
实际 Worker 请求级 FS 审计：8个请求对无关源码 lstat 为0；无文件不等于未校准，
前置 RED 同一审计接口实测2016次（96路径、3请求），缓存 RED 实测192次。
当前诊断4次 miss 的实际 Program 各1个源、SDK0；总新增1个 source LS，4次 source Program构建，
其中3次带 oldProgram；4次 hit 不再构建；verifier LS0、全根 plan0。
首次诊断驱动误将预加载应用到没有私有日志根的父进程而启动失败，原 `source-audit-30000.log` 保留；
修正仅测试驱动、将 hook 限于真实 LSP 子进程，独立 retry 完成。不是产品故障，也不是隐藏失败。

## 统一工厂校正前的真实 Photos 只读组件对照（历史候选）

保留29995源码、实际SDK，隔离历史项目：
`.bench/index-versioned-maintenance-20261104/final-acceptance-36/harness/project`。
目标 `product/phone/src/main/ets/picker/PickerUIExtensionAbility__copy_003.ets`，
`extensionWindow` 声明43:9（0-based）。原源码SHA256
`abde5c958e758df9ae1e8aa248c3353b8517c5eb8ff55bb4f26144aa2d0ab22d`，运行前后相同。
编辑仅 overlay 添加 `void extensionWindow;`，撤销恢复；没有写真实源文件。

`photos-s3-source-qualification/`：初始化83.673s；首次45.09ms、edit12.07ms、undo10.31ms，
精确3/4/3个Locations，LS2稳定、source Program每次1个源、SDK0。
这些组件计时包含目标的独立前后 descriptor/路径证明；内部 owner 时间40.75/8.70/6.93ms是包含子区间，不能相加。
旧 final03 同文件组件首次5017ms、edit2994ms、undo3004ms，作为历史参考，不伪装为同时间配对UI数据。
本组件没有 Native、LSP 队列、公开路由或 Zed UI；公开完整路径证据来自前述协议夹具，不能互相冒名。

## 回归与未闭环

- 原S1项目域SDK AST复用断言保留，新域不伪报SDK成员。
- 最终 source focused：`final-source-focused02.log` 24/24PASS、0skip。
- 输入边界回归44/46通过，两处驱动观察问题保留在 `input-boundary-regressions01.log`；
  取消响应早于Worker drain是允许的，不应在早终态立即断言Host已退出；B完成后检查真实观察。
  时间戳测试预先规范为整秒，使“恢复mtime”确实成立，没有放宽相等断言。
  修正后 `source-lifetime03.log` 9/9PASS，含真正取消、同版本重试、原Worker、单终态、
  同字节路径替换拒绝A/恢复B、显式RSS准入、函数/tag外部引用和不支持形态的项目oracle。
- 其他44项原输入/SDK/完整性回归原断言未改；最终完整门禁需要独立收取，不能把局部通过当全绿。
- 原 final03完整gate 2816PASS/1初始化60s超时保持FAIL；独立原例PASS不能冲销它，原因仍未闭环。
- 初始化、全局/使用位置引用、30K完整引用/重命名、真实Zed/Windows/耐久和调度长尾仍开放。
- 不修改产品超时/内存/成员阈值；455冷目录3秒仅该项沿用用户豁免。
- 未提交、push、合并、部署、重启日常Zed或删除真实缓存。

复跑命令、源/运行产物hash、源码归档、逐请求原始数据见证据根。
最终完整检查结果收取后追加，不从此前候选继承通过。

## 首轮门禁发现的架构缺口与正式校正

原 `s3-check-fast.log` 发现唯一 LS 构造点断言 2≠1：源 owner 绕过了现有官方工厂。
1369 条已报告 PASS 后停止已知失败运行；这不是完整计数，不能与下一轮相加。
原源码归档、产物身份、日志及 `first-s3-stop-reason.json` 保留。

现改用 `registry-pool.createOfficialSourceReferenceService` → `recoverableLanguageService`。
私有源 Registry 不附 SDK/export provider，但租约结清、有限同步、阶段观测和清理不确定时的
quarantine 完全共用原实现。原唯一 raw LS 构造点断言仍为 1，另断言源 owner 不直接创建 LS/Registry。
Host 取消使用当前 job 的原 Host token，有限同步之后重新检查原始取消；未清取消位或修改截止时间。

`official-owner-focused02.log` 63/63 PASS、0 skip；`source-coverage-final.log` 8/8 PASS，
包含源资格、唯一工厂和计算属性值逃逸的范围对照。
选择性机制取证 `source-ownership-final-record.log` 仅选择 1 条，其余 10 条未被 name pattern 选中，
不能冒充零跳过全量门禁。该场景真正记录源域 Registry release 1→0 后异常，调用栈属于
`SourceReferenceOwner.dispose`；一个取消终态、恰一次 Worker 恢复、峰值 1，恢复后未保存新版精确 4 个位置。
原始 wire、stderr 和租约事实见 `source-ownership-controls/1795712388854-55410/`，
事实位于 `report.observations.sourceReleaseFault`。

早期组合夹具因只给 SDK Registry 装 hook 而未命中源域；另一轮因 binder 参数被 bundler 从
`options` 改名 `options2`、旧 hook 硬编码而在加载时失败。Worker 错误栈及原失败都保留。
已修正注入归属；binder 仍必须是固定函数、双参数且唯一匹配，只容许参数重命名。
没有通过跳过、扩大产品阈值或修改完整性断言来放行。

正式工厂候选的普通、计数、Photos 和完整门禁均在 `official-owner-round2/` 独立执行。
前文数值属于校正前历史构建；正式候选的身份、计时和完整终态收取后另行追加。

## 正式统一工厂候选复验

`official-owner-round2/measurements-summary.json` 汇总同一 build06 正式候选；
普通协议、计数审计、Photos 组件依次串行，之后才启动独立完整门禁。
Node、编译器、SDK 口径及精确结果校验与前述对应，原值均保留。

| 文件数 | 首次1次 ms | 编辑后3次中位/最大 ms | 热查询4次中位/最大 ms |
|---|---:|---:|---:|
|2048|59.24|10.81 /14.09|5.16 /6.28|
|30000|54.21|11.38 /13.02|5.13 /5.93|

正式计数审计：无关文件检查0次，4次 miss 各1个源/SDK0，新增1个源 LS、
4次源 Program 构建，其中3次携带 oldProgram；4次 hit 不构建，verifier LS0、全根 plan0。
Photos 仍为只读组件验证：初始化81.376s；首次38.34ms、编辑11.02ms、撤销9.37ms，
精确3/4/3位置，原文件 hash 未变。它不包含公开 LSP 队列、Native 或真实 UI。

完整 `pnpm check:fast` 从 `2026-11-26T17:05:13.847Z` 开始，
`official-owner-round2/candidate-identity-s3.json` 冻结1375个代码/测试/配置输入。
尚未结束时只报告进行中；不得继承上一轮通过条数，也不得继承旧候选或聚焦检查为全量通过。

该完整轮最终2834项：2830 PASS、4 FAIL、0 skip，代码/测试/配置1375输入均未变。
4条均为 `initial-scope-cancellation.cjs` 硬编码 `projectSourceRole(file, text, options)`，
实际 bundle 为 `options2`，导致 hook 在模块执行前失败；静态实际产物证据在
`official-owner-round2/initial-scope-hook-precondition.json`，不把它当作已进入取消阶段的产品失败。
修正仍要求同一函数、三个参数及唯一匹配，并用实际首参数注入；没有放宽任何行为断言/等待时间。
`initial-scope-retry-final.log` 原5项全部PASS、0skip：同输入roles400/unique400/firstCount1，
SDK替换roles453/firstCount2，单事实变化roles401/firstCount2，同Worker恢复通过。
第一次应用修正命令用了错误相对证据路径，未修改文件但旧测试继续失败；单独保留
`initial-scope-retry-wrong-cwd-attempt.log`，不算GREEN，之后绝对路径应用及原5项重跑成功。

最终仅该测试fixture相对上轮冻结输入变化，所有上轮结束产物hash未变；server、Worker、native
也与前述普通计时 manifest 完全相同，故复用正式测量并保留对应身份。
`final-gate-round3/reuse-provenance.json` 记录比较；最终独立完整检查在同目录运行，前轮FAIL不改标签。

## 最终完整门禁与收尾核验

最终 `pnpm check:fast` 于 UTC 2026-11-26 18:28:15.664 开始、19:44:17.525 完成，
2834 PASS、0 FAIL、0 skipped、0 cancelled，退出码0。冻结1375个代码/测试/配置输入未变。
完整原30003源码成员用例40.293秒通过；旧final03的60秒初始化超时仍保留，不能据本轮通过宣称根因已消除。
证据根：主工作区 `.bench/reference-input-qualification-20261126/final-gate-round3/`：

- `s3-check-controller.json` / `s3-check-fast.log`：完整终态与逐项结果。
- `final-verification.json`：冻结输入、正式测量运行产物、编译器、Photos原文件身份核验。
- `source-size-audit-final.json`：新增源码/测试/脚本均不超过500行；既有迁移债
  `typescript-language-service.ts` 2851行（父2852）、`legacy-semantic-engine.ts` 618行（父622）。
- `s3-full-resources.ndjson` 与 `full-case-details/`：采样资源和大项目用例原始协议/日志。

正式性能数字沿用同运行产物的 `official-owner-round2/measurements-summary.json`，没有把插桩耗时加进普通计时。
30K局部声明编辑/撤销后中位11.384ms、最大13.022ms；热查询中位5.126ms、最大5.931ms。
同夹具旧final03编辑中位2979.959ms、热查询1119.191ms；各构建各一个独立会话，
不推断全部拓扑、查询位置或真实UI都有同等收益。实际Photos组件编辑11.022ms、初始化81.376秒。
日常安装未部署；本片不覆盖实际Zed、Windows或新两小时耐久，非声明/全局路线仍有全范围成本。
ADR0051保持Proposed；整体NAV-REPEAT-001仍OPEN。没有提交、推送或合并。
