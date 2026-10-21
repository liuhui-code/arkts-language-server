# Linux resident 引用证明恢复断言（2026-10-21）

> 公开审查记录：原始 CI/本地日志保留于本地，见[证据保留说明](../reports/local-performance-evidence.md)。
> 本片修复测试的状态转换断言，不修改产品实现；Linux 修复版及最终完整门禁资格由协调者补录。

- RED 父提交：`a3c7a91990be6e9e189afe337b7abeb3e0f97f21`。
- 首个失败：[Actions run 39522257830](https://github.com/liuhui-code/arkts-language-server/actions/runs/39522257830)。
- 保留原断言、仅增加逐 RPC 观测的提交：`6de1609`。
- Linux 三轮原版证据：[Actions run 39525936132](https://github.com/liuhui-code/arkts-language-server/actions/runs/39525936132)，
  本地保存名 `linux-original-focused.log`，观测标记 `UNNOTIFIED_REFERENCE_ADMISSION_SEQUENCE`。
- 公开接口：真实 language-server 子进程、Content-Length stdio；用例
  `an unnotified source edit rejects the old resident text and preserves new references`，
  位于 `tests/semantic/references-batch-search-coverage.test.mjs`。

## RED 的具体含义

初始化隔离四文件项目，打开查询文件和消费方 overlay，通过 implementation 预热 resident Program。
随后直接修改关闭的 `Derived.ets`，新增第 3 行的 `Child` 构造引用，不发送 watched-file 通知。
立即串行执行两次 references RPC，`includeDeclaration` 依次为 false、true。
两次 RPC 都要求包含这条新引用，并将完整 Location 集合与新建进程的 legacy 查询结果比较。

三轮原版结果如下。下表是实际记录的事件顺序，编译耗时只描述该轮插桩事件，不能作为性能基准。

| Linux 轮次 | 第一 RPC | 第一 RPC 拒绝后 | 第二 RPC | 原测试结果 |
| --- | --- | --- | --- | --- |
| 1 | `overlay-content-mismatch` 拒绝旧证明，resident MISS | fresh prepare；同 context 的实际 compiler-build 8.983ms | resident HIT，返回当前新引用 | FAIL |
| 2 | `inputs-changed` 拒绝旧证明，resident MISS | batch 搜索 | 再拒绝旧证明、MISS、batch 搜索 | PASS |
| 3 | `overlay-content-mismatch` 拒绝旧证明，resident MISS | fresh prepare；同 context 的实际 compiler-build 4.724ms | resident HIT，返回当前新引用 | FAIL |

第一、三轮第二次 HIT 的 traceId 分别对应已记录的第二 RPC；它们都发生在第一 RPC 拒绝旧证明、
完成 prepare 和实际 compiler-build 之后。全部六次 RPC 均无 error，均包含第 3 行新引用，
完整 fresh oracle 比较也已通过。原来的 `!events.some(resident.hit)` 断言把
“旧证明必须拒绝”误写为“两次请求期间永远不能使用重新建立的有效证明”。
这里没有观测到成功发布旧语义结果，Linux 自身三轮也有不同路径，不能归结为平台必然差异。

三轮在编辑后都出现一次通用 prepare 事件，原观测没有保存它的触发来源。
本记录不据此将路径差异归因为后台诊断、文件时间精度、GC 或其他未测阶段。

## 最小修复与前置状态

保留完整 fresh oracle 及两次 RPC 的新引用断言，并增加以下因果约束：

1. 两次请求均实际走引用结果缓存 MISS，逐次记录 RPC id、查询变体、起止时间、traceId、error 和新引用数。
2. 第一个 resident 准入事件必须属于第一 RPC，且为 MISS；该 RPC 必须明确拒绝旧输入证明。
3. 任何后续 resident HIT 必须属于这两个已记录 RPC，且只能出现在旧证明被拒绝后的一次
   fresh prepare 和实际 `semantic.context.cost(reason=compiler-build)` 之后。

仅本用例设置既有 `ARKTS_TEST_DIAGNOSTIC_DELAY_MS=5000`，固定第一次准入仍面对旧证明的前置顺序，
避免未来合法后台诊断提前重建后使“首 MISS”再次变成调度假设。没有新增 sleep、重试或扩大 watchdog；
该延迟属于测试调度控制，不作为语言服务操作时延。
事件观测不替换请求、响应或 compiler 行为，后续合法 HIT 仍须通过与 fresh oracle 的完整语义比较。
测试文件由 449 行增加至 489 行，低于 500 行约束。

## 本机检查

使用实际 Node20.19.5 启动器，以下 `node` 为公开化命令表示。
运行时包含同时修复的 LoadedConfigurationWitness 及 Host case policy，本片未自行 rebuild。

```sh
node --test --test-concurrency=1 \
  --test-name-pattern='^an unnotified source edit rejects the old resident text and preserves new references$' \
  tests/semantic/references-batch-search-coverage.test.mjs
```

Mac 定向结果：1 PASS、0 FAIL、23 项名称过滤，6303.237ms；本地保存名
`resident-recovery-focused-green.log`。该轮第一 RPC 拒绝旧证明并 MISS，随后 fresh prepare、
实际 compiler-build 6.934ms；第二 RPC resident HIT，两次都返回当前新增引用。

```sh
node --test --test-concurrency=1 tests/semantic/references-batch-search-coverage.test.mjs
```

Mac 完整文件结果：24 PASS、0 FAIL、0 SKIP，101723.652ms；本地保存名
`resident-recovery-file-green.log`。包括原有 package/type metadata、源编辑、overlay、取消、压力回收、
负见证和完整范围搜索用例。Linux 修复三轮仍待补录；该文件通过不代表完整
`check:fast` 或 `check:release` 资格。

## 最终Linux定向对照（不代替完整门禁）

[Actions 39527839863](https://github.com/liuhui-code/arkts-language-server/actions/runs/39527839863)
对应独立诊断提交`2d3f14db28093f9395dda53943c447191991f8e0`。
最终公开树692项源码/测试/脚本/配置与该诊断树逐文件相同；辅助workflow不纳入合并。
三个串行轮次分别6项通过、0失败、33项名称过滤，共18项匹配执行通过。
筛选覆盖读取窗口、明确mtime漂移、SDK变化拒绝、namespace表征、重建后有效引用命中
及Linux同大小写缺失源恢复。原失败和中间版本保留，不能将名称过滤当作完整检查通过。
完整`pnpm check:release`、PR Linux/Windows检查仍须由最终公开提交独立取得资格。
