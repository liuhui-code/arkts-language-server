# L05 预算政策下的实现查找合同

日期：2026-10-09。状态：阶段 DONE，完成审计 A～E PASS。选定 L03 政策下的独立
implementation 语义、实际复用、输入新鲜度与执行保护逐项验证；
不新增公共协议、capability、语义 owner 或生产默认。最终产品指标在 L08。

## 起点与公开 RED

父 HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`，保留既有工作树。
原五类公开合同在当前构建独立 5/5 PASS，退出 0，9,010.690217 ms，
原始 `.bench/l05-parent-public-contracts.log`。旧 L04 whole 不代替 L05 收口。

新增选定政策的未查泛型接口公开请求保持完整三处 oracle，包括 compiler
拥有的 import alias 链接；要求暖机与新目标有完整 Program 身份和构建
成本见证。未实现观测时，公开结果正确，但缺少回调完成事件，真实 RED：

```sh
node --test --test-name-pattern='L05 selected policy witnesses' \
  tests/semantic/resident-session-implementations.test.mjs
```

0/1 FAIL，退出 1，1,344.312575 ms，`0 !== 2`；原始
`.bench/l05-route-trace-minimal-red.log`。最初同时要求 compiler-call 观测
的失败另存 `.bench/l05-route-trace-red.log`；先缩为单项完整回调见证，
不把尚未执行的 compiler-call/cancellation 子切片算作 GREEN。

## 最小 GREEN

沿用 trace 开关和 compiler collector，在原 leased implementation
回调后观察现有 Program、结果数量与 RSS，不另行准备 Program。
trace OFF 不做额外观测；可选 observer 异常不能改变完整答案。
类型检查和构建退出 0；首次同一公开命令 1/1 PASS、退出 0，
1,328.299337 ms，`.bench/l05-route-trace-first-green.log`。
新目标与暖机同一 Program，完整 277 个工程源码、零 createProgram，
完整三处结果，无 references cache/batch 冒充。

## 执行中取消与保持语义的抽取

完整实现过滤从旧超限 TypeScript service 抽为独立职责；先有当前六项
公开合同 6/6 GREEN，抽取后公开合同与既有 cooperative cancellation
characterization 联合 28/28 PASS、退出 0，54,840.01867 ms，原始
`.bench/l05-extracted-implementation-characterization.log`。旧 service
从 3504 降到 3478 行；其余修改手写文件均未超 500 行。

新增 4000 个合法实现的公开取消合同，等待真实 compiler-call start 才
发送取消。无调用级观测时真实 0/1 FAIL，退出 1，11,538.592204 ms，
`.bench/l05-compiler-cancel-observation-red.log`。最小实现仅扩展现有
trace 的同步调用边界，保留 host cancellation cell 与原 compiler 语义。
首次 1/1 PASS、退出 0，3,773.15087 ms，
`.bench/l05-compiler-cancel-first-green.log`：调用本身抛取消、唯一
`-32800`、无 partial result/第二终态；同进程重试完整 4003 处精确，正常退出。
这是观测缺口的 RED/GREEN，不冒称本轮修复了原有取消机制，也不以
夹具总耗时宣称真实工程取消时延或长期资源门禁通过。

选定政策的 v2/v3 完整集合和诊断单独 1/1 GREEN、2,352.351194 ms；
继承/override/泛型成员单独 1/1 GREEN、1,735.862938 ms，分别保留
`.bench/l05-selected-edit-characterization.log` 与
`.bench/l05-selected-inheritance-characterization.log`。这些为已有机制
组合 characterization，不伪造生产 RED。

## 压力与配置新鲜度

1024 MiB 正常预算及 1 MiB 持续高 RSS 功能夹具联合 2/2 PASS、退出 0，
7,228.140053 ms；完整查询、v2 最新诊断及阶段后新采样确认 context、
lease、transient 均归零，见 `.bench/l05-selected-pressure-fresh-characterization.log`。
1 MiB 只用于功能边界，不当作真实工程预算或 hard RSS 上限。

初始选定政策的手动 Worker 替换用 1024 MiB 夹具，真实 RSS 已回落；
现有保护正确拒绝 `pressure-recovered`。该单例及 12/13 联合失败保留在
`.bench/l05-selected-recycle-pressure-recovered-failure.log` 和
`.bench/l05-joint-before-recycle-qualification.log`，不是生产回归 RED。
不改回收保护；64 MiB 持续高 RSS 功能资格下独立 1/1 PASS、退出 0，
4,926.978196 ms，`.bench/l05-selected-recycle-qualified-characterization.log`。
只在该资格测试显式打开手动替换；真实选定配置仍关闭自动/手动替换。

SDK 切换的第一预期误写 2420，实际为 property override 的 2416；
失败另存 `.bench/l05-selected-sdk-first-expectation-failure.log`。随后先用
独立冷公开进程核对第二 SDK 的完整实现及 2416/value 范围，再验证
选定政策下 v2 切换及 v3 恢复；不把错误预期纠正称作生产缺陷修复。
当前公开回放与原正常诊断仍启用；SDK fixture 不更改真实 SDK。

## 配置失效后的完整工程成员恢复

SDK v2/v3 查询本身与独立冷 oracle 正确，但随后旧打开接口的三处实现
曾返回空集；独立公开回放与联合回归连续复现，联合为 13/14 FAIL，原始
`.bench/l05-sdk-switch-other-implementation-red.log`、
`.bench/l05-joint-sdk-recovery-red.log`。这是生产正确性 RED，
不把正常 2416 预期纠正或其它 13 项通过作为完成证明。
单纯切换查询文件/诊断，无 SDK 或配置变更，8 源码与超过 preload window
的 278 源码控制均通过；该假设被排除。最小 root configuration 失效
仍失败：Program 从 277 根缩成 256 根，三处实现丢失。关闭晋升同样
失败，接口自己的定位仍正确；排除晋升资格和 overlay 丢失，原始
`.bench/l05-root-membership-minimal-red.log` 与
`.bench/l05-root-membership-no-promotion-red.log`。

根因是旧 removed delta 在新完整 membership 后执行，移除了仍合法但
不在 preload window 的源码；同 revision 的快速返回也可能保留被改小的集合。
最小修复先清理旧记录，再应用当前完整 snapshot，并复核路径数量。
不增大驻留/preload/预算，不恢复当前 membership 排除的真实删除或 inactive 输入。
类型检查与构建退出 0；两个晋升状态的最小回归及原 SDK 场景首次
3/3 PASS、退出 0，6,297.792964 ms，`.bench/l05-root-membership-first-green.log`。
随后移除 `[DEBUG-l05-*]` 临时探针，正式断言完整 277 根；八文件扩大
回归 107/107 PASS，退出 0，0 fail/cancel/skip/todo，263,401.37544 ms，
原始 `.bench/l05-membership-focused-107.log`。其中 18 个 L05 公开合同
全部通过；同时覆盖旧输入失效与 references scope、取消和生命周期回归。
当前指纹保存在 `.bench/l05-current-build-identity.json`，状态为
CHECKPOINT_NOT_FINAL；后续实现变化须重新冻结，不代替完整 check:fast。

## 未知范围的显式失败和恢复

夹具职责从公开测试抽到 `tests/support/resident-implementation-lsp.mjs`；
先有 107/107 GREEN，抽取后原 18 个公开合同再次 18/18 PASS、退出 0，
36,826.03694 ms，`.bench/l05-fixture-extraction-characterization.log`。
测试入口不变，夹具拥有临时工程、协议会话及独立 UTF-16 oracle。

加入一份超过现有 4 MiB 安全读取上限的合法实现源码后，工程 membership
已为 partial/source-unavailable，implementation 却成功返回一处子集。
真实公开 RED 0/1、退出 1，1,462.063488 ms，
`.bench/l05-unknown-membership-first-red.log`；临时诊断证明旧完整 membership
已失效，而 implementations 没有消费失败状态，见
`.bench/l05-unknown-membership-debug-red.log`。临时探针均已移除。

查询前后核验既有 membership/source-unavailable 状态，通过现有 Worker
`workspace-incomplete` 错误码映射为固定 LSP `-32803`；取消第一原因仍优先。
完整空结果仍是合法结果，缺输入不能冒充完整子集。第一修复已拒绝未知范围，
但文件恢复可读后仍缓存 partial，恢复步骤继续 RED；原始
`.bench/l05-unknown-membership-recovery-red.log`。该次失败的清理还受到
沙箱终止子进程权限限制；人工终止仅本次临时服务/sidecar 后获得终态，
235,887.504447 ms 不是产品请求时延或性能样本。

全工程准备仅在 partial 时通过 DocumentStore 重新核验范围，不在完整稳态
增加扫描；仍缺输入则明确失败，恢复后返回完整三处实现及最新 v2/2322
诊断。独立 1/1 PASS、退出 0，1,621.430797 ms，
`.bench/l05-unknown-membership-first-green.log`。随后 L05 全部 19 个合同
与现有 LSP 取消/旧代/错误映射联合 30/30 PASS、退出 0，
43,576.104445 ms，`.bench/l05-pre-adapter-characterization-30.log`。

GREEN 后将准备逻辑归入现有 interactive-workspace，将 implementation 的
协议错误适配抽为独立 capability adapter。旧 LegacySemanticEngine 从本轮
1058 降到 1057 行，semantic capability adapter 从 733 降到 721 行；
二者及 3484 行 TypeScript service 仍为迁移债务，其余本轮修改手写文件
均不超过 500 行。抽取后的五文件扩大回归 79/79 PASS、退出 0，
127,666.192123 ms，`.bench/l05-scope-extraction-focused-79.log`。

完整范围中确实无实现的接口保留正常空集；未知输入仍报错，独立 1/1
PASS，1,711.246743 ms，`.bench/l05-complete-empty-and-unknown-green.log`。
package main 从 First 切到 Second 后，完整两处实现及 v2/2416 诊断与
独立冷进程的完整 payload 一致；打开文本覆盖故意不同的磁盘文本，原
GenericContract 完整三处仍保留。独立 1/1 PASS，2,701.40826 ms，
`.bench/l05-package-input-first-green.log`，不是新的生产缺陷修复。

两根初始化使用真实 workspaceFolders；第一用例只配置一根，第二根
无正常诊断，0/1 设置失败保存在 `.bench/l05-two-root-harness-setup-red.log`。
仅补测试夹具多根初始化，没有改生产 scope。随后两根同名接口各完整
三处、第二根 v2 删除/2322、L3 后各自完整恢复，以及 close/reopen 后的
磁盘/overlay 优先级均独立 1/1 PASS，2,696.137275 ms，
`.bench/l05-two-root-first-green.log`。

最终十文件联合 130/130 PASS、退出 0，0 fail/cancel/skip/todo，
284,280.98358 ms，`.bench/l05-input-contracts-focused-130.log`，其中
21 个 L05 公开合同全部通过。当前源码/产物及十一份修改源码/测试
指纹为 `.bench/l05-input-contracts-build-identity.json`；此前 107 检查点
已被这轮未知范围修复更新。两份指纹均不是完整 check:fast 终态证明。

## 独立配置见证和未通知输入

未通知的 package main 变化曾成功返回 First 的旧实现，独立冷 oracle 为
Second。真实 RED 0/1、退出 1，2,362.767425 ms，
`.bench/l05-unnotified-package-first-red.log`；重复现有 trace 显示 Program
确实重建，配置见证为 configuration-unproven，而 v2 overlay 的范围仍
正确，见 `.bench/l05-unnotified-package-probe-red.log`。这不是晋升误保留
Program 或丢失打开文本，而是 implementations 没有消费加载配置的新鲜度。

结果返回前核验现有 compiler/PackageResolver 元数据见证。未知输入必须
完整最新结果或固定 `-32803`，不能发布旧集合；收到通知后用最新版本
恢复完整结果及诊断。已通知/未通知联合 2/2 PASS、退出 0，
5,339.600613 ms，`.bench/l05-unnotified-package-first-green.log`。
关闭 R-09 仍出现同一旧集合，独立 RED 0/1、2,253.646737 ms，
`.bench/l05-independent-implementation-witness-red.log`，因此输入保护不能
依赖 references 的快捷路由或答案投影。

现有加载见证独立于 R-09 记录，原 references 路由仍默认关闭。直接构造
底层引擎时没有根模型，取消后完整重试曾被误拒绝；三种 package 合同
通过而三种原取消 characterization 失败，原始
`.bench/l05-independent-witness-characterization-failure.log`。初始化现有
根模型后六项联合 6/6 PASS、退出 0，8,120.682646 ms，
`.bench/l05-independent-witness-first-green.log`。

首次扩大联合为 129/132 PASS、三项 FAIL，317,920.300761 ms，
`.bench/l05-independent-inputs-joint-failure.log`，保留为真实兼容失败。
正常 R-09 OFF 暖机的配置缓存曾先加载后观测；现在由现有 budget registry
在首个加载前记录。partial 恢复通过 DocumentStore 的完整 root invalidation
同步刷新 membership、配置与依赖缓存，不在完整稳态新增扫描。
故意不可证明的 dangling-link 用例严格要求 implementation 暖机 `-32803`
且无 result，仍核对后续 references 完整 fallback 与独立 legacy oracle；
不删除、跳过或放宽后续语义断言。三项回归单独 3/3 PASS、退出 0，
5,236.826378 ms，`.bench/l05-witness-regression-first-green.log`。

类型检查和构建通过，临时探针清理完毕；最终十文件联合 132/132 PASS、
退出 0，0 fail/cancel/skip/todo，319,656.691919 ms，原始
`.bench/l05-witness-final-focused-132.log`，含全部 23 个 L05 公开合同。
当前十三份修改源码/测试及构建指纹见
`.bench/l05-independent-inputs-build-identity.json`，产品输入
`905fca366c83298af4f66c8c89af822fdd124cdb468d482edb90ad382ae384d7`。
TypeScript service 为 3489 行，仍低于本轮起点 3504 行；721 行 capability
adapter 和 1057 行 LegacySemanticEngine 也仍为已缩减的迁移债务。
此前 130/130 与第一次 IService 六处 discovery 属于配置修复前的
检查点，不代替当前真实控制或完整 check:fast 终态。

## 完整回归和阶段交接

[主计划 L05-A～E](../plans/2026-10-06-budgeted-resident-semantic-plan.md)
已 DONE。代表性压力/输入失效、trace OFF、Worker 与多根恢复
公开组合已通过；[当前真实工程对照](../reports/2026-10-09-resident-l05-budget-policy-integration.md)
四新进程 22/22 exact、最新诊断配对一致，输入不变、产品退出 0。
冻结后完整 pnpm check:fast 1467/1467 PASS、退出0、无 fail/cancel/skip/todo；
终态源码/产物、13份修改文件、164入口、310测试/脚本及工程/SDK等
身份一致，真实清单/oracle未变。[逐项审计](../reports/2026-10-09-resident-l05-completion-audit.md)
A～E PASS；focused 未替代 whole 或终态身份复核，原失败和旧检查点保留。
分段工具输出及part-008嵌套trace截断标记见审计，不将其伪称完整逐字stdout。
500 ms/P95、最终内存、readiness、长期 soak/规模/跨平台由 L08 判定，
不作为本阶段提前门禁，也不将其失败改标 PASS。
