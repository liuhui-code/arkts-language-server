# Worker 状态边界修复 TDD

日期：2026-10-24。父 revision：`e35459131366a32c48c10d1d74adef74357cd3dc`，分支 `fix/windows-path-identity-20261022`。
父 revision 之外已有 Windows 路径、构建失败和监督改动；本轮起点 772 项代码 SHA 与 8 项审查输入存于
`.bench/state-machine-implementation-20261024/start.json`，原始 semantic 源码在 `before-source/`。
不能只检出父 revision 声称重现了工作区候选。所有测试走真实子进程、Content-Length stdio。

证据根：`.bench/state-machine-implementation-20261024/`。使用 Node v20.19.5；实现不引入新产品开关。

切片前 RED 基线的实际命令与退出回执保存在
`.bench/state-machine-boundaries-20261024/final-results.json` 的 `jobs` 中 `name=current-final` 项：

```sh
ARKTS_AUDIT_EVIDENCE_DIR="$PWD/.bench/state-machine-boundaries-20261024/current-final" /Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-concurrency=1 tests/audits/recovery-configuration.audit.mjs tests/audits/recovery-replay-model.audit.mjs tests/audits/recovery-replay.audit.mjs tests/audits/registry-cleanup.audit.mjs tests/audits/worker-retirement.audit.mjs
```

实际 exit=1、22 项中 12 FAIL / 10 PASS，零 skip/cancel/todo。两轮 start.json 的共同源码及四个运行包 SHA 全相同，
因此该已执行 RED 基线对应本轮产品起点，而非仅凭相同父 revision 推断。
这是历史命令记录；当前兼容入口已经迁入 GREEN 用例，不应在已用证据目录中重跑覆盖原数据。

| 切片 | RED 证据 | 最小修复 / 初步 GREEN |
| --- | --- | --- |
| 两文档恢复重放 | `01-s1-red.tap`，第 4 个请求返回空定义 | 同 root 且同 URI 才合并相邻全文编辑；`03-s1-green.tap` 13/13，包括 A→B→A 精确范围与 8 种独立模型 |
| release 生效后抛错 | `04-s2-red.tap`，配置退休后仍有 1 项目租约 | owner 清算不确定即隔离整个 isolate，独立 fault 事件；`07` 选中项 GREEN；`08-s2-green-all.tap` 19/19 |
| terminate 报错但未退出 | `09-s3-red.tap`，两语义 Worker 重叠 | 持有退休句柄/exit 见证；预算内重试同句柄，catch 不免费重试；`12-s3-green.tap` 3/3 |
| 精确资源回收 | 原 S3 反例 | `13-s3-precise.tap` 3/3；要求精确跳转、进程关闭后零语义 Worker，不能靠 audit 清理获得通过 |
| 重复/迟到故障 | 原清算反例作为表征 | `14-s2-dedup.tap` GREEN：当前故障、重复副本和退休实例迟到信号只拥有一次恢复 |
| 清算共享预算 | 原清算反例作为表征 | `15-s2-budget.tap`：4 次清算失败、3 次自动恢复后熔断；同配置/时间不能旁路，修复输入后受限探测 |
| 退休重试共享预算 | 原退休反例作为表征 | `16-s3-budget.tap`：3 次实际 stop 尝试后频率约束生效；关闭仍能找到并终止旧句柄 |
| 关闭清算异常 | `17-shutdown-red.tap`，缺失 shutdownComplete | dispose 异常也在 finally 执行后续收尾；`20-shutdown-green.tap` 选中项 GREEN |
| 默认快测归类 | `19-manifest-red.tap`，7 个入口未归类 | `24-manifest-green.tap` 4/4；显式归类并更新精确计数，不允许 fast skip/todo |
| 迟到 exit | 原退休反例作为表征 | `21-s3-late.tap`：exit 只结算责任，不自行解锁同输入；修复输入后恢复精确定义 |
| 关闭与 pending terminate | 原 pending 取消 GREEN 作为表征 | `23-s3-close.tap`：关闭共享一次退休，不创建替代者，实际 exit 后正常关闭 |
| 共享 owner | 原正常多 owner 回归作为表征 | `26-s2-owner-physical.tap`：Beta release 生效前 Alpha refs=1，退出后两组重建且最终项目 refs=0 |
| 退出不确定观测 | `27-retirement-log-red.tap`，没有退出未确认的记录 | Host 记录 retirement.failed 的 exitConfirmed，不将报错视为 exit；最终合跑验证 |

补充代码审视发现本轮提取的 shared fault 模块把 compiler-aware 错误分类带入 Host，导致父进程实际加载 compiler。
`41-compiler-isolation-red.tap` 通过真实 LSP 初始化/定义、固定 compiler 初始化标记捕获 threadId=0；
修复仅拆开故障协议与 Worker 请求分类，`44-compiler-isolation-green.tap` 5/5（含 manifest）通过。
server bundle 从 9,574,742 字节回到 927,188 字节；原 v8 为 924,260 字节。
不凭字节数推断 RSS 减少，正式回归同时要求实际 compiler 仅在 Worker 初始化。
首轮 `pnpm check:fast` 因该已确认回归主动停止，186855.509ms、真实 exitCode=-15，
保存在 `v1-check-fast-final.log` / `v1-final-check-result.json`；不算全量通过。新候选全部检查重新执行。

`25-s2-owner.tap` 是观测断言校准失败：固定 compiler 的内部 Registry key 会折叠大小写，
不能把该 key 当原始文件名。本轮观测改为记录真实文件路径并按 fs.realpath 精确比较；
未改变产品路径相等/包含规则，也未为 GREEN 把路径转小写。
类型检查的三次失败记录在 `05/10/29`；修正 TS4.9 判别联合和已拒绝 Promise 的类型收窄，未放宽检查。

实现后用已有 19 项公开 GREEN 表征，LS 状态收敛为 live/empty/retiring/quarantined/disposed 判别联合。
失败 owner 保留在隔离域，release 不确定后不再重试 release；资源由真实 isolate exit 结算。
正常同步失败继续局部清算并同版本重试；健康 Program 上的普通取消不退休 Program。

扩大回归第一轮 `31-focused.tap` 为 82/83 PASS、1 FAIL、零 skip/cancel/todo（306599ms），不算通过。
`33-halfopen-red.tap` 稳定复现；`34-halfopen-trace.tap` 的完整 queue 日志证明：
半开恢复重放后 background diagnose 先发送，foreground semanticReadiness 仍在 supervisor 队列；
根枚举实际卡在 diagnose，未启动 prepare 的 1500ms 执行预算。该 diagnose 受 10000ms 普通请求预算，
早于客户端 5000ms 等待的原断言，因此必须修准入，不能延长测试等待或停用全部诊断。
最小修复：probing 期间拒绝非显式工作，并在共享恢复等待结束、真正发送命令前重新检查，
防止较早通过入口的后台任务在重放完成后抢占；前台单次探测、取消与原恢复预算保持。
`36-halfopen-green.tap` 为原用例 GREEN；最终扩大回归 `38-focused-final.tap` **83/83 PASS，零 fail/cancel/skip/todo**，300175ms；保留首轮 82/83。

正式回归入口：

```sh
PATH=/Users/liuhui/.nvm/versions/node/v20.19.5/bin:$PATH pnpm build
PATH=/Users/liuhui/.nvm/versions/node/v20.19.5/bin:$PATH node --test --test-concurrency=1 tests/semantic/worker-recovery-*.test.mjs tests/semantic/worker-registry-cleanup.test.mjs tests/semantic/worker-ownership-fault-boundaries.test.mjs tests/semantic/worker-retirement*.test.mjs tests/semantic/failed-build-recovery.test.mjs tests/semantic/unresponsive-worker-recovery.test.mjs
PATH=/Users/liuhui/.nvm/versions/node/v20.19.5/bin:$PATH pnpm check:fast
```

故障预加载器仅用于隔离公开测试；before/after release、terminate reject、迟到 exit 是可控模型。
取消由真实 $/cancelRequest 进入生产取消单元；不将可控异常当作自然 Windows 无限循环的复现。
原审查 `.audit.mjs` 命令保留为正式回归的兼容入口；原 RED 包和逐次原始证据不改写。
最终候选全量检查、Mac/Windows Photos 和剩余限制见实施报告；未结束的命令不算 PASS。
455 文件冷目录 3 秒性能门槛按用户授权不执行，其余正确性检查不跳过。无提交/推送/合并/发布。

最终 v2 焦点合跑 `45-focused-v2.tap` **84/84 PASS，0 fail/cancel/skip/todo**，280028.688ms；`46-typecheck.log` TypeScript 检查通过。


## 全量中的 hover 超时与功能测试前置状态

第二轮全量 `v2-failed-check-fast-final.log` 实际出现一项 `returns null hover information on whitespace` 的 5 秒超时，
随后主动停止，实际 -15、1522523.682ms；不记为通过。原失败样本没有完整阶段数据，不能声称耗时全在初始化。
`47-hover-isolated.tap` 原用例单独通过（1990.621ms）；`49-editor-characterization.tap` 原整份 13/13 GREEN。
独立 `hover-diagnostic.mjs` 保留原 5 秒查询预算及超时后的迟到响应观测；修正诊断接缝后，
`50-hover-probe-corrected.log` 的查询 1703.756ms，Program 1068.295ms、checker 工厂 130.789ms。
该单次插桩不解释原超时，也不作为普通时延；首个插桩接缝因固定 compiler 多一个参数而失败的记录保留。

已确认功能夹具未等待公开 semanticPreparation 终态。先在 13/13 表征下内聚提取 openEditorFixture，
旧 525 行文件降至 484 行，`51-editor-extracted-characterization.tap` 仍 13/13 GREEN。
随后用真实 stdio 和受控 Worker 启动门栓证明 helper 提前返回/打开文档：`52-editor-fixture-red.tap` RED。
最小改为在原默认 5 秒预算内等待公开 complete/failed，failed 明确拒绝；再打开文档和按原 5 秒预算查询。
`53-editor-fixture-green.tap` 14/14；补失败初始化不得打开文档和环境清理，`56-editor-boundaries-green.tap` 19/19。
全程未改变产品代码、产品截止、原 hover null/文档/范围断言，也没有扩大查询等待。
冷启动与查询重叠由原 project-initialization 的首查引用等公开回归继续覆盖，不以本夹具改动宣称冷启动性能已解决。
manifest 新入口 RED 见 `54`，GREEN 见 `55`，总入口 245 / bundle-e2e 124；最终全量必须重跑。


Windows 补验 v3 实际 115/116 PASS，唯一失败在原 project-initialization 的 POSIX `/sdk/...` 后缀计数，
观测器实际记录的是 path.resolve 后的 Windows 原生路径。隔离诊断保留原断言并输出 SDK 行，
`windows-path-observation-red.stdout` 实测仅 1 行、原生文件名和完整目标路径相同，但旧后缀得到 0。
最小改为 path.join(sdk, ...) 的完整路径精确相等，次数仍必须为 1，保留全部引用位置和无额外 batch 的断言。
不是放宽身份、大小写或解析次数。第三轮全量因这一最终测试修正主动停止（此前未见失败），
保留 `v3-superseded-*` 真正退出记录；最终全量重新从头执行。

最终 Windows v3 从头串行运行全部补验：116/116 PASS，0 fail/cancel/skip/todo，387272.589ms。
1001 项输入前后不变；关闭后验证目录 Node/索引进程为 0、原始 Photos 干净。
原始日志在 `windows-v3/state-machine-implementation-20261024/recovery.log`，
本地核验结果在 `windows-v3-verified-summary.json`；未覆写 115/116 失败证据。

## 最终同一候选验收

第四轮从头执行的完整 `pnpm check:fast` 正常退出 **0**：**2016/2016 PASS，0 fail/cancel/skip/todo**。
命令总耗时 3189009.985ms，测试阶段 3178961.101ms；原始 `check-fast-final.log`、`final-check-result.json` 和
5 秒采样 `check-fast-resources.ndjson` 均在本轮证据根。此前中止/失败的三轮没有改记 PASS。
空白 hover 原用例本次整例 1702.170ms；它不是独立请求时延，不能反推此前超时原因。

检查后 919 项源码/测试、4 项配置、1 项构建配置和 76 项生产产物 SHA 全部等于检查前；
83 项 dist 清单只有测试生成的 SDK discovery driver 重建，单独保留差异。
Windows 最终 116 项使用全部相同的 919/4/76 输入；Mac/Windows Photos 数据因 76 项生产产物相同适用于最终产品。
`finalize-evidence.py`、前后清单、924 项源码/配置快照、文档快照及 Git 差异一并封存，未提交/推送/合并/发布。
完整范围、真实项目未闭环项和可复现脚本见 [实施报告](../reports/2026-10-24-worker-state-contract-implementation.md)。
455 冷目录性能门槛继续按用户授权未执行；独立 large/发布矩阵没有运行，不以本轮 GREEN 宣称它们通过。
