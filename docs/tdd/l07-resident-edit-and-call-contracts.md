# L07 长驻会话的重命名和调用层级公开合同

日期：2026-10-08；父 HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`。
L07 已进入 IN_PROGRESS，取得 11 个独立公开合同，并修复本地 alias 冲突
漏检及调用层级 follow-up 导致诊断丢失的缺陷。最终资源、500 ms、
整体 readiness、soak 和跨平台验收仍在 L08，不作为前序实现的前置。

## 公开合同和输入范围

[rename 测试](../../tests/semantic/resident-session-rename.test.mjs) 与
[call hierarchy 测试](../../tests/semantic/resident-session-call-hierarchy.test.mjs)
均通过真实生产子进程、Content-Length stdio 运行。每个夹具包含 276 个
合法源码，先用无关 WarmContract implementation 支付完整准备，再打开
此前 lazy 的消费者；目标不是预先查询的结果缓存。晋升 ON/OFF 使用
独立进程、相同源码，完整 payload 深比较；ON 另见证 matching promotion
及 generation 不变。小 SDK 的目录可被发现，但测试 metadata 的 version
为 `test`，运行报告 `metadataStatus=invalid`、`dialectCompatibility=unverified`；
这里证明 TypeScript-compatible 源码合同，不是完整 API24/native SDK 验收。

六个 rename 合同分别验证：

- prepareRename 的完整 UTF-16 range/placeholder；barrel public rename
  的完整 versioned WorkspaceEdit，包含未打开消费者、排除同名类。
  实际应用编辑后，正常诊断为空，definition 仍指向未更名的 origin。
- origin、barrel-public 和 consumer-local 显式 alias 三层独立，不把
  references 位置直接替代带 prefix/suffix 的重命名编辑。
- 顶层 class 同作用域冲突和非法 identifier 原子拒绝，不返回部分编辑；
  随后的有效 origin rename 保留 barrel API，磁盘源码未被服务修改。
- v2 新增用法与范围移动后立即返回完整当前版本编辑集；实际 L3 驱逐和
  old/new threadId 不同的 Worker 替换后保持 v2，再验证 v3 恢复。
- prepareRename 和 rename 各一次早期取消，唯一 `-32800`、无编辑；
  后续完整 rename 恢复，正常退出后无重复终态。
- 消费端显式 import alias 改为同模块已存在的 class 名时，先原子拒绝；
  改为无冲突名称仍返回完整 v2 编辑集，不污染原声明或磁盘。

五个 call hierarchy 合同分别验证：

- prepare item、incoming/outgoing 方向及全部 fromRanges；显式 alias
  的两个 UTF-16 调用点、未打开调用者和未打开目标的 stateless follow-up。
- overlay 编辑后旧 item 以 `-32801` 拒绝，新 item 返回三个最新调用点；
  未通知的磁盘调用者移除仍被发现，不把旧边保留为完整答案。
- 实际 L3 后物理 Worker 替换恢复 v2/v3 overlay 及双向完整结果。
- prepare/outgoing/incoming 各一次早期取消、唯一错误，随后完整恢复。
- 未打开目标的 outgoing follow-up 与正常诊断重叠，不能永久丢掉当前
  v2 overlay 的 2322 code/range/version；最新双向调用图仍完整。

这些早期取消不冒称 compiler-in-flight 抢占或重复取消资源验收。
没有新增公开 capability、flag、答案缓存、第二 checker 或语义 owner。

## 本地 alias 冲突的 RED 和最小修复

```sh
node --test --test-name-pattern='consumer-alias rename rejects' \
  tests/semantic/resident-session-rename.test.mjs
```

旧输入 `62e6d09180dbc31343d7b24bf03de69176258582efaf7d1efb6cadc1b0153436`
连续两次 0/1 FAIL：服务返回把 LocalProfile 改成 Occupied 的三个编辑。
当前 overlay 正常诊断已完成；锁定 `ohos-typescript@4.9.5-r10` 能从声明
与使用位置解析到相同 ImportSpecifier。独立 compiler 探针应用错误编辑
后出现 2440 等错误，排除了“测试期待了允许的合并”与旧快照假说。
原始 `.bench/l07-consumer-alias-conflict-red.log`。

旧预检仅覆盖顶层 class。[独立预检模块](../../src/core/types/typescript-rename-conflict.ts)
复用当前 Program/TypeChecker，从 compiler declarations 识别本地显式
import alias，使用其模块作用域与 value/type/namespace meanings 检查冲突。
保留 class characterization 和 alias 层次，冲突分类按 compiler meanings
而非一概禁止同名；合法 namespace 合并只经独立 compiler 探针核对。并未
宣称一般成员、嵌套捕获、所有 re-export 冲突已全部覆盖。
公开回归 GREEN；引擎从 3576 降到 3505 行，未扩大既有超限文件。

## 调用层级和诊断竞态的 RED 和最小修复

第一次默认并行九文件组合为 69/71 FAIL，两项等待 v2 诊断超时；
串行同构建 71/71 PASS 不能关闭该竞态。原始分别为
`.bench/l07-focused-parallel-71-fail.log`、`.bench/l07-focused-serial-71-pass.log`。
随后固定诊断已进入 Worker 的时序，复现命令：

```sh
node --test --test-name-pattern='unopened call-hierarchy follow-up preserves' \
  tests/semantic/resident-session-call-hierarchy.test.mjs
```

使用现有 `ARKTS_TEST_WORKER_DIAGNOSE_HOLD_MS=500` 和 URI suffix 控制，
真实 hold-start 之后发未打开 work item 的 outgoing。输入
`6a30639e4121534ba1da389b09405c9afbcdd9c85797be13f0e89f09eb5fb16f`
连续两次失败：follow-up 完整返回，诊断却报 `Semantic document changed`
且 20 秒内不再发布。原始 `.bench/l07-call-followup-diagnostics-red.log`。
这是临时 disk-source open/close 使 root snapshot 失效后，没有重调度诊断，
不是仅由机器负载推断的原因。

[DocumentDiagnostics](../../src/lsp/document-diagnostics.ts) 保留失效 fence，
只对 `content-modified`、当前仍打开且仍由本任务持有的文档，经原 75 ms
debounce 重调度最新 snapshot；真实错误不重试，关闭、superseding update、
suspend 和 shutdown 仍服从原取消/清理流程。回归约 2 秒 GREEN，原并行
组合也转为 72/72 PASS；没有提高请求超时或跳过诊断。临时失败探针已清理。

## 测试登记和不成立的预期

两个新 entry 分别先得到真实 tooling RED：discovered test has no layer。
原始 `.bench/l07-rename-layer-registration-red.log` 与
`.bench/l07-call-layer-registration-red.log`；登记为 bundle-e2e，entry 169、
bundle 73，manifest 4/4 PASS，没有从 fast 清单排除它们。

初始 rename 客户端缺少 transactional failureHandling；补齐已存在的
能力协商条件后通过，没有修改广告逻辑。初始 call 光标 `indexOf("caller")`
在新增注释中误中同名词；改为明确函数声明光标，全部范围断言保留。
诊断探针不完整的 delay 配置没有进入 hold，也不算行为 RED。
这些夹具问题与上面两个有效生产缺陷分开记账。

## 当前构建和剩余范围

当前 sourceInput `7bbba83781e5b56270f3bbaf94092583264d834deaea694178020976e87d328a`；
server `b05ac3c8a2029b39a2a11f40f0dbe93676bfe6f9772d3f77b86bd8b0767de8ca`；
semanticWorker `de935d1579efdd6e5c68bf1decb456e45a99b8affe196bb4e9a96ccaaba5ceb1`；
referenceVerifier `a731bb8dd2e2aa1f7a2b818e21407b3d49425d14d734a02699be09e20648cdc2`。
Sidecar、compiler、SDK、lockfile 和 Settings checkout 的 pins 保持。
先前 L04/L06 固定构建报告与 manifests 不重新 pin，不能当作当前源码重测。

`pnpm build`、`pnpm check` PASS；当前并行组合 72/72 PASS、退出 0，
0 fail/cancel/skip/todo，38,999.118578 ms，原始
`.bench/l07-focused-parallel-72-pass.log`。随后十二文件串行 focused
**88/88 PASS**，退出 0、0 fail/cancel/skip/todo，130,711.803862 ms；
新增诊断关闭/旧版本/refs quiescence、调度和 L06 完整交互回归全部通过。
原始 `.bench/l07-rename-call-diagnostics-focused-88.log`。新源码 whole 仍 NOT_RUN，合并前
须 fresh `pnpm check:fast`，不沿用 L02 的 1338/1338 或其它旧检查点。
该 88-case focused 命令为：

```sh
pnpm build
node --test --test-concurrency=1 \
  tests/lsp-diagnostics.test.mjs \
  tests/semantic/references-diagnostic-scheduling.test.mjs \
  tests/semantic/resident-session-interactive.test.mjs \
  tests/semantic/resident-session-call-hierarchy.test.mjs \
  tests/semantic/resident-session-rename.test.mjs \
  tests/semantic/rename-completeness.test.mjs \
  tests/semantic/rename-depth.test.mjs \
  tests/semantic/semantic-worker-recycle.test.mjs \
  tests/semantic/semantic-same-content-promotion.test.mjs \
  tests/lsp-call-hierarchy-reliability.test.mjs \
  tests/semantic-worker-call-hierarchy-protocol.test.mjs \
  tests/test-layer-manifest.test.mjs
```

rename 测试 343、call 测试 264、预检 59、诊断 165 行；登记文件 296/340。
剩余迁移债务：type engine 3505、legacy engine 1068、proxy 563 行。

L07 保持 IN_PROGRESS/provisional：更多冲突/组合、真实工程与预算准入
继续；R-22 semantic-ready、其它 root/成本感知及完整能力矩阵未因此完成。
性能数据不从这些功能测试推导，最终内存、P95、soak/规模/平台与发布在 L08。
