# 路径身份修复与缓存失效取证

执行日期：2026-10-22～23。父版本 `e35459131366a32c48c10d1d74adef74357cd3dc`，
分支 `fix/windows-path-identity-20261022`，候选包含未提交修改。
本阶段只修路径和测试取证问题；没有实施缓存优化、修改新鲜度合同或恢复暂停的索引路线。
没有推送、发布或合并。原有 Windows checkout 修改与真实 Photos 源码均须保持原状。

证据根目录：`.bench/20261022-path-fix/`，以下原始路径均相对该目录。
该目录受 gitignore 管理，保存在本机；文末列出脚本、逐次结果和封存包。
原始失败、初轮矩阵与最终候选矩阵分开保留，不用通过样本覆盖失败。

## 路径修复

1. 新增 `src/project/path-identity.ts`，统一解析路径相等及目录边界。
   Windows 仅折叠卷字母；文件名、目录名和 Unicode 拼写保留。
   未知大小写别名必须有当前 realpath 证据；不存在的叶子可用已存在父目录证明。
2. `src/index/workspace-uri-identity.ts` 使用同一身份与重映射规则，接受 native 返回的
   `file:///d:/...` 与 Node 的 `D:\...`，仍拒绝其他盘、兄弟目录及未经证明的别名。
3. `semantic-worker-uri.ts` 与 `semantic-worker-input-guards.ts` 共用根判断。
   canonical URI、物理源准入和最终发布检查仍保留，未删除身份校验。
4. `physical-path-identity.ts:isInside` 排除 exact parent、同目录及兄弟目录。
   项目 scope 比较和物理范围键不再对整个 Windows 路径转小写。
5. Windows 真机补查发现另一个同类错误：
   `typescript-semantic-readiness.ts` 把标准库根 `D:/.../dist` 与实际目录
   `D:\...\dist` 直接比较，52 个已加载标准库被误判为缺失。
   改用 `sameResolvedPath`；保留完整标准库、依赖与最终输入证明要求。
   证据：`windows-evidence/standard-library-paths.ndjson` 与
   `sdk-readiness-diagnostic.log`，原失败为 `standard-library-unavailable`。

UNC 完整支持、extended-length path、junction 及 Windows 目录级大小写敏感的完整端到端验收
未完成；现有编译器自身的大小写策略也未修改。Mac 函数仿真不代替 Windows 验证。

RED/GREEN、父版本公开 LSP 对照、工具错误与源码范围见
[本轮 TDD 记录](../tdd/path-identity-20261022.md)。

## 测量合同与夹具

Mac：macOS 26.6.2 (25G83)、x86_64、Node 20.19.5。
SDK：`.bench/mac-photos-v1/sdk/openharmony`，API 24，1670 个文件逐一 SHA-256 固定。
默认运行模式：一个语义 Worker、4096 MiB 压力预算，无优化试验开关；只显式指定 SDK、
native binary 和隔离 cache/log 目录。初始化不受该压力门槛限制。
`report.json` 保存 compiler/package/SDK identity、runtime/native SHA 和实际 readiness。

夹具只有生成文件，未修改真实 Photos：初始活动源码 2048 个，磁盘源码 2049 个，另 1 个
`app/src/extra/Extra.ts` 初始不参与 Program。三个模块 app=16、shared=2、noise=2030。
目标 `app/src/main/ets/Target.ts` 导入 Shared：目标依赖闭包为 2 个文件、1 条边、深度 1。
只有这两个文件属于目标闭包，不能把全部 2048 个根解释为有效依赖。

实际引用 Program 在普通编辑场景为项目 2048 + SDK 255 + 其他 113 = 2416 SourceFiles，
根文件 2049（项目 2048 + SDK 入口 1）。其他 113 的实际路径包括 dist 标准库 52 与
`@types/node` 61；后者来自隔离夹具所在仓库的依赖环境。不能与只有 52 个其他输入的
外部夹具直接比较。配置场景将活动项目文件增至 2049，实际 Program 总数 2417。

每个场景启动全新 LS、应用缓存和 native index；OS 文件缓存未清空、未受控。
初始化计时从 initialize 开始到 semanticPreparation 终止通知。
随后打开 Target、app/Unused0、noise/F0、shared/Shared 四个文档，依次：

1. 目标补全；noise hover；shared hover；首次引用；重复引用。
2. 发送一次下表中的编辑/配置事件。
3. 编辑后首次引用；重复引用；目标补全；noise hover；shared hover。
4. 最后读取 readiness（`prepare:false`），再关闭服务。

引用目标固定 `value`，LSP 零基位置 `{line:3,character:24}`，includeDeclaration=true。
精确核对两条位置：声明 `2:2–7`、使用 `3:22–27`；补全须包含 value，hover 非空。
本轮没有 rename。表中首次引用计时与 rename 无关。

| 场景 | 实际输入 |
|---|---|
| local | Target 中 `value: number = 1` → `value: number = 2` |
| same-group | app/Unused0 中 `= 1` → `= 2`，不被 Target 引用 |
| other-group | noise/F0 中 `= 1` → `= 2`，不被 Target 引用 |
| dependency | shared/Shared 中 `= 1` → `= 2`，保留显式 number 类型 |
| import-edge | Target 的 `ets/Shared` → `ets/Other`，闭包仍为两文件 |
| configuration | app/build-profile 的 target.source.sourceRoots 改为 `['./src/extra']`，写磁盘并发送 watched-file event；主源码根保留 |

每类三轮无插桩普通计时 + 一轮独立插桩，全部串行；每轮 11 个 RPC，共 24 会话/264 操作。
计时为本机 Content-Length LSP 请求发出到完整响应，不含 UI/SSH。
编辑通知先于查询发出但无 ACK；查询可能包含尚未完成的编辑应用/排队，完整编辑应用区间未单测。
所有位置、全文 before/after、执行顺序、响应与 UTC 时间均在逐次 report/wire 中。
查询文档是打开状态，下面的 HIT 是 open-result cache；没有把它外推到 disk-result cache。

## 最终候选的结果

最终24会话、264操作全部正确、无超时，初始化与最终readiness均READY；源码/SDK及runtime前后核验不变。
见`input-verification-final.json`。普通计时每格为三轮中位数 / 最大值，单位ms；HIT由实际cache事件确认。

| 编辑 | 编辑后首次引用 | 随后重复HIT |
|---|---:|---:|
| 局部实现 | 1426.568 / 1451.359 | 1.549 / 1.692 |
| 同组无关文件 | 1431.035 / 1458.032 | 1.348 / 1.746 |
| 跨组无关文件 | 1394.117 / 1445.715 | 1.675 / 1.840 |
| 依赖文件 | 1420.470 / 1433.005 | 1.381 / 1.438 |
| import边 | 1988.299 / 2061.249 | 1.484 / 1.662 |
| 配置/成员 | 3467.354 / 3505.551 | 1.324 / 1.440 |

以下是独立插桩单轮，不能与普通轮合并求中位数。Program与身份检查存在嵌套，列间不能求和。

| 编辑 | RPC ms | Program 次数/ms | 项目/SDK对象此前已观察数 | query身份调用/ms | final身份调用/ms |
|---|---:|---:|---:|---:|---:|
| 局部实现 | 1455.64 | 1 / 354.57 | 2047 / 255 | 2412 / 240.24 | 2412 / 198.09 |
| 同组无关文件 | 1540.17 | 1 / 343.87 | 2047 / 255 | 2412 / 253.11 | 2412 / 228.17 |
| 跨组无关文件 | 1385.61 | 1 / 323.04 | 2047 / 255 | 2412 / 241.55 | 2412 / 200.44 |
| 依赖文件 | 1429.73 | 1 / 321.46 | 2047 / 255 | 2412 / 239.24 | 2412 / 200.81 |
| import边 | 2023.02 | 1 / 935.22 | 2047 / 255 | 2412 / 242.60 | 2412 / 197.93 |
| 配置/成员 | 3691.86 | 1 / 1665.53 | 2047 / 255 | 6621 / 616.00 | 4826 / 402.04 |

普通编辑每阶段2412次身份调用=项目2044+SDK255+其他113。配置场景总调用量更高，
query=项目5885+SDK510+其他226，final=项目4090+SDK510+其他226；query存在同路径重复观察。
其中一个query窗口项目调用3840次/唯一2045个；额外1795次调用的具体内部站点未单独插桩，不归因为重新解析。

局部编辑的嵌套区间例子：

- LSP RPC：1455.642ms（相对RPC 100.0%）。
- input-validation外层窗口（含compiler及最终证明）：1244.340ms（相对RPC 85.5%）。
- compiler callback（位于上述窗口中）：591.795ms（相对RPC 40.7%）。
- createProgram（compiler内）：354.568ms（相对RPC 24.4%）。
- findReferences（compiler内）：104.415ms（相对RPC 7.2%）。
- 文档/闭包/成员准备（另一个独立前置区间）：32.800ms（相对RPC 2.3%）。
- Worker received→dispatch排队：0.370ms（相对RPC 0.0%）。
- wrapper内、compiler callback外的差额约652.545ms；这是区间差额，不是已拆完的单一阶段。
  不能再把query/final身份时间整体加到这些嵌套时间上；未测部分不归因。

配置场景先探测retained owner，再fallback；实际有多个含嵌套的validation窗口，不能直接加其wall time。
其余普通编辑在retained owner路径完成，没有进入候选选择/分批验证；config候选选择fallback后仍走完整查询。
精确prepare子阶段（dependency-closure、project-membership、workspace-preload）、队列和compiler trace保存在原始stderr。

## 失效范围与调用链

依赖闭包扫描没有全部失效。独立诊断轮：local MISS 1.323ms，same-group HIT 0.579ms，
other-group HIT 0.625ms，dependency HIT 0.520ms，import-edge MISS 2.578ms；
配置变化首次 MISS 9.123ms、fallback 再次 HIT 0.423ms。数字来自实际 dependency-closure 事件。
这些是闭包结构缓存，不能和引用答案缓存或 Program 对象复用混为一谈。

- **答案缓存**：`semantic-worker-proxy.ts:sync → #mutate → ReferenceInputState.changed →
  ReferenceResultCache.invalidateRoot`。普通 overlay 编辑清除该工作区根的两项答案
  （includeDeclaration true/false）；无关文件、其他组也触发。配置 watched event 先
  `workspaceFilesChanged → clear(all)`，再推进根 revision。后续首次查询 MISS，紧接着 HIT。
  本夹具只有一个 workspace，未用实验声称其他独立 workspace 也被清除。
- **Host clock**：`TypeScriptLanguageServiceEngine.prepare → updateScript → generation++`；
  `getProjectVersion = generation:membershipStatus:contentRevision`。prepare 接收的 overlays
  会推进未使用该文件的其他组的时钟。global、app、noise、shared 都能观察到版本变化；
  这不等于每个组都实际重建 Program。
- **全局引用 owner**：`routeReferenceQuery → dispatch(retainedOnly) →
  LegacySemanticEngine.residentReferences(synchronize=true) → TypeScriptTypeEngine.retainedReferences →
  queryRetainedReferenceContext`。编辑使 resident proof 以 inputs-changed 拒绝后，已有全局 owner
  走 `prepare(view).references` 同步。完整范围检查 `completeReferenceScope` 要覆盖整个
  workspace membership。本次普通编辑在该路由就完成，不执行候选选择/分批验证；不能把
  全局 Program 成本解释成几百批次。
- **Program/AST**：`createHost.getProjectVersion → compiler synchronizeHostData/createProgram`。
  普通编辑的全局 Program 有 oldProgram，只有一个项目 SourceFile 对象变化，SDK 对象复用。
  app 交互 Program 则只有 17 个项目文件（16 个根 + Shared）。跨组编辑后 app 的 Host
  虽变，未观察到 app Program 构建；noise 在实际访问时更新。依赖编辑则实际更新 app/shared。
- **磁盘输入证明**：`withRequestModuleResolution → QueryModuleResolution.query →
  withRequestInputValidation → requestFileIdentity/diskIdentity`；query 与最终 union
  重新开始独立身份缓存。普通编辑每阶段仍检查 2044 个项目磁盘文件、255 SDK、113 其他输入。
  四个打开的 overlay 不属于这 2044 个磁盘输入。元数据检查不是文本读取或重新解析。
- **命中**：`cachedReferenceResult` 对 open 文档直接沿 revision 合同返回；本次重复引用
  没有 Worker references 调度、Program 构建或上述 wrapped diskIdentity 事件。
  disk 文档答案另需 `diskReferenceProof → readReadiness(prepare:false)`，本轮未计时该路由。

配置变化确实改变成员范围，原有 context 退休、新 Host 出现；全局新 Program 无 oldProgram，
但全局 2049 个项目 SourceFile 中有 2047 个此前已在该线程观察到，SDK 255 仍已观察到。
这是跨 Program/registry 的对象复用证据，不能把无 oldProgram 说成全部重新解析。
配置后的 app/noise/shared Program 也在后续实际访问时创建；完整逐次事件见 phases.json。

## 归因口径与不能回答的部分

Program 时间、compiler callback、input-validation wrapper 与 diskIdentity 是嵌套区间，
不能直接相加。diskIdentity 每次计时为该函数本身；query/final 调用统计按当前 wrapper
归属，嵌套 wrapper 的 wall time 仍可能重叠。Host script checks 使用 observedPhase，
不把延迟 flush 时的请求标签当作所有计数的独占归属。

SourceFile 复用来自对象身份比较/WeakSet，不是 parser 入口次数；没有测量所有 fs.readFile、
实际磁盘 IO、全部配置读取、GC、checker/binder 子阶段或完整编辑应用时间。
wrapped validation 以外的身份检查也没有总量统计。不把残余时间归因于这些未测阶段。
依赖图缓存是否命中、成员快照是否复用由现有实际事件给出；不能将 pathCount 解释为本次读文件数。
初始化均 READY 的本夹具不代表 Photos/Windows 20k 的 degraded 环境已解决，也不是新一轮规模曲线。

## 检查、失败与未闭环项

- Mac 最终构建与 `pnpm check` 通过；Node20最终四个文件共15/15、零skip/todo/cancelled；
  `focused-final-after-library.log`。Node26的SDK计数回归3/3通过。
- Mac Rust `cargo test -p arkts-index-sqlite --test path_identity_contract` 1/1通过，
  `cargo build --release -p arkts-index-sidecar` 与rustfmt通过；Rust产品源码未改。
- Windows 10.0.19045、i5-7300HQ、物理内存17059520512字节、Node20.19.5、cargo1.95.0，
  独立目录 `D:\code\arkts-path-identity-20261023`。Rust路径回归1/1（14.84s含编译），
  release构建60.51s、最终Node构建0.893s、类型检查4.837s、15/15定向回归8.294s通过。
  `source-verification-verified.json` 核对1856个文件无差异；runtime/native SHA在runtime-receipt中。
  `windows-existing-work-verification.json`证明Photos仍干净、旧checkout原有6项修改原样保留。
  使用生成96声明与受版本控制的conformance SDK，不是Windows 20k/Zed性能复测。
- Windows最初若干SSH超时、PowerShell把cargo正常stderr当异常、LSP清理EBUSY和标准库READY
  失败均保留。EBUSY失败后只停止已核实的本次测试进程树，见failed-test-process-tree.json；
  该场330.27s到终止不能当成功延迟。最终15/15不抹去这些失败。
- **完整 `pnpm check:fast` 曾实际执行完1954项：1953通过、1失败，零skip/todo/cancelled。**
  原日志 `check-fast-unsandboxed.log`，耗时2708051.5ms。唯一失败是SDK身份次数统计；
  同一窗口混入后台diagnose的缺陷已在父版与候选公开LSP对照复现并用测试专用请求归属修正。
  每文件“query一次+独立final一次”断言没有放宽，全窗口计数仍保留，并增加确实发生诊断的断言。
  原失败多出的18次没有原始调用栈，不追认逐次归因；独立反证详见TDD。
- 初次沙箱check的RSS采样 `spawn EPERM` 后核验进程树并停止，另有完整非沙箱运行；
  不以环境失败当通过。**最终标准库修复和测试修正后未重跑完整check:fast，只有上述最终定向检查；
  当前不是可宣称全量GREEN或已经可合并的收据。** 本阶段未请求合并，也没有合并。


455 文件冷目录 3 秒性能门槛继续按用户授权跳过；本轮未执行该门槛，未删除索引功能，
未增加写入/URI 绑定/SQLite 页缓存等门槛专用优化。历史PR91的原始失败为3.603547961s（[TDD证据](../tdd/shared-catalog-lexical-scan.md)）；
该值不是本轮重测值，本轮记为未测。
当前引用首查仍超过 500ms，规模增长成本、20k 修复后真机性能和更大规模验证均未闭环。
本轮不据此实施缓存优化；下一阶段应以以上失效层次和证明边界讨论方案。

## 复现与证据

```sh
# 同一仓库及 SDK 布局，固定 Node 20.19.5；使用全新前缀保护已有原始数据
python3 .bench/20261022-path-fix/run-invalidation-matrix.py replay20261024
python3 .bench/20261022-path-fix/invalidation-analyze.py replay20261024
python3 .bench/20261022-path-fix/invalidation-phases.py replay202610241
# 独立重放一项时使用新的 trial，保留已有结果
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node \
  .bench/20261022-path-fix/invalidation-run.mjs other-group diagnostic replay1 2048
```

- `input-manifest-before.json`：最终候选源码/SDK SHA；各 report 绑定此 manifest 和 runtime/native SHA。
- `input-manifest-initial-matrix.json`、`initial-invalidation-*`：额外 Windows 标准库修复前的初轮数据。
- `invalidation-matrix-final-ledger.json`：命令、起止、每次 exit code；`invalidation/*-final*-2048/`：
  精确 edit、原始响应、wire.ndjson、server.stderr.raw、probe-pid-thread.ndjson、隔离源码和 index。
- `invalidation-operations.csv`、`invalidation-summary.json`、`invalidation-phases.json`：逐次表、统计和原事件。
- `invalidation-run.mjs`、`invalidation-probe.cjs`、`invalidation-analyze.py`、`invalidation-phases.py`：
  真实 LSP 驱动、仅加载时内存插桩与分析脚本；不写产品源码。
- `windows-evidence/`、`windows-*.ps1`、`windows-verified-source-manifest.json`：真机完整日志、
  原始失败、源快照哈希和 before/after 收据。PowerShell 原 UTF-16 日志保留，另有 UTF-8 阅读副本。
- `counter-parent-raw.ndjson` / `counter-candidate-raw.ndjson` 与对应 log：请求归属的独立反证，
  与普通性能矩阵分开。私有诊断中的 name-pattern skip 不是 fast layer 跳过。

封存包：`path-fix-cache-evidence.tar.gz`（哈希另见同目录sha256文件）；包含逐次原始协议、诊断、失败日志、脚本与源码快照。
生成夹具与index数据库仍保留在原目录，封存包不重复包含这些可重建大目录。
