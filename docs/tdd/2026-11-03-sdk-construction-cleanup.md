# SDK export 构造交付前清理：RED/GREEN 记录

日期：2026-11-03。父版本：`298d65f5d7f796c347fe8be5c739e428066489d8`；tree：`8b1f9789b4337f882133b493620b726ab3dca571`。
关联：[ADR0043](../adr/0043-semantic-working-set-evidence.md)（Proposed）、[M1清单](../plans/2026-11-03-semantic-working-set-review.md)。
**本片确认并修复一个交付前异常路径的 Registry 所有权缺口；局部回归通过，不等于用户现场高内存根因或 RSS 已降低。**

## 输入与验证范围

- Node20.19.5、pnpm8.15.9、Rust/Cargo1.95.0，固定 `ohos-typescript@4.9.5-r10`；lockfile不变。
- 源码为明确的 sparse materialization：2212/2213 tracked files 已按 Git blob SHA 核对；缺 `editors/zed/grammars/arkts.wasm`，未伪造替代物。
- 最终focused冻结2216个实际存在的tracked/runtime输入，末次2216/2216一致；不包含缺失WASM。
- 原始收据位于仓外证据标识 `sdk-construction-evidence/`：`REPORT.md`、`RESULT.json`、`candidate.patch`、
  `candidate-pins.sha256`、`focused-input-pins.json`及下列日志/frames。这是保留证据标识，不是仓库内文件链接。
- 外部保留器 `retain-evidence.mjs` / `retain-evidence-all.mjs` 保存原始LSP frames与临时夹具，未写入生产或测试提交。
  这些带观察运行证明机制/正确性，不是性能试验；未测真实RSS/PSS/heap斜率或耐久。

## 真实失败路径与RED

`sdkExportLanguageService` 已创建LS、注册fence并安装组合dispose。
initialPreparation内 `index.getProgram()` 完整返回SDK-only Program/checker后，
`index.current()` 的freshness capture经真实Host token抛出 `OperationCanceledException`。
该点位于 `sdkExportIndex.buildProgram` 的已有catch之外，factory尚未返回，coordinator未安装新entry。
因此外层未取得可清理的服务，SDK index已经取得的Registry引用没有正常归还。

仅测试preload精确包住现有initialPreparation分支的 `index.getProgram()` 返回点，不额外调用编译器getter。
真实Program有53个source files、一个SDK ambient根、没有项目source；先原子写marker，再由父进程发framed `$/cancelRequest`。
gate只轮询保存的原Host token，10ms间隔、5s夹具失效保护，不写取消cell、不合成异常、不修改生产deadline。
确认原token为true后，一次delegate另记未改 `index.current()` 实际调用原token也为true；异常由生产checkpoint产生。
串行 `readiness(false)` 完成后再取refcount，证明取消构造已清算；另断言context-create未增加及Worker仍为一个。

最终基线 `red-token`：pin baseline SDK refs1 → gate2 → 清算后2，断言 **2 != 1**；projectRefs始终0。
这些是被观察Registry键的引用数，不是coordinator请求lease数；交付前定位另由未增的context-create证明。
该refs差1不证明整份SDK Program/checker仍在live heap，也不能推出其字节大小或RSS收益。
raw cancel到-32800为11ms，未触发Worker恢复；不是timeout、缺marker或合成异常导致的RED。
生产已恢复并重建父版本，server/worker/compiler/lock/native hashes均与基线一致。

## 最小修复与GREEN

生产只在initial warmup增加try/catch（净增7行）：构造抛错时调用已安装的 `service.dispose()`。
安全清理后原样抛回原错误；清理失败抛 `AggregateError([originalError, cleanupError])`，
沿已有SDK owner quarantine/物理Worker退役路径处理不确定释放，不吞错或转成可选SDK不可用。
正常或可选incomplete返回、已交付健康owner、SDK pins与全部默认策略不变。

新增三例通过：三次真实取消同Worker各归还SDK refs2→1后精确重试定义；取消后不重试直接正常关闭；
release-after-effect保留原取消与 `CompilerOwnershipUncertainError`/cause的AggregateError，恰一次恢复后精确重试。
候选五次raw cancel响应10–18ms仅证实测试未走超时恢复，不认证产品延迟。

## 完整保留执行历史

各PASS范围分开，不相加成全套通过。

| 收据 | 真实结果与解释 |
| --- | --- |
| `baseline-failed-build-recovery.log` | 原始完整文件20/21，1FAIL，exit1，61988.44525ms；首case原10s semanticPreparation超时，原因未知。自动清理后原失败夹具不可得，不重建历史 |
| `baseline-rerun.log` / `baseline-rerun/` | 未改基线仅一次完整重跑，外部保留器启用：21/21，0fail/skip/cancel，exit0，42687.04528ms；不解释或覆盖原超时 |
| `red.log` / `red/` | 新测试前置错误：旧已注册context正常保有SDK index，refs2；尚未到新gate，不是产品RED。改用原配置退休后采单pin基线 |
| `red-window.log` / `red-window/` | 早期300ms门的真实post-build取消，refs2 != 1；机制证据保留，最终门替代其脆弱时序 |
| `red-deterministic.log` / `red-deterministic/` | response-before-release握手无效：1009ms触及原取消deadline；曾误以短事件列表证明无恢复，该说法撤回 |
| `green-new.log` / `green-new/` | 同无效握手两例过、一例因Worker换代计数重置失败，不是可接受GREEN；未放宽deadline或恢复预算 |
| `red-token-build.log`、`red-token.log` / `red-token/` | 重建原生产后的最终真实token RED：1FAIL、23名称过滤skip、exit1，1481.566274ms；有效断言2 != 1，1Worker |
| `green-token-check.log`、`green-token-build.log` | 候选Node20 typecheck/build PASS |
| `green-token.log` / `green-token/` | 最终三新增例3PASS、21名称过滤skip、0fail/cancel、exit0，5784.332932ms；不是完整文件通过数 |
| `focused.log` / `focused/` | 九个完整相关文件101/101，0fail/skip/cancel/todo，exit0，169450.868539ms；最终2216/2216输入一致 |

九文件包含完整原故障/健康取消控制、SDK切换/多root隔离、ownership quarantine、稳定组保留、同步保护与manifest。
其中现有合成30000-source/private-SDK案例通过，不是用户真实项目或UI验收。独立审阅未发现本片剩余must-fix。
`git diff --check`通过；三份手写改动分别83/175/434行，均≤500。

## 实际历史执行命令

工作目录：`/workspace/scratch/dcdb41e16594/arkts-memory-audit`。先载入隔离工具环境：

```sh
. /workspace/scratch/dcdb41e16594/arkts-audit-toolchain/env.sh
node --test tests/semantic/failed-build-recovery.test.mjs
```

最终RED，生产恢复父版本并带最终fixture/test：

```sh
pnpm build
SDK_CONSTRUCTION_EVIDENCE=/workspace/shared/sdk-construction-evidence/red-token \
node --import /workspace/shared/sdk-construction-evidence/retain-evidence.mjs \
  --test --test-name-pattern='SDK construction cancellation rolls back' \
  tests/semantic/failed-build-recovery.test.mjs
```

最终候选验证：

```sh
pnpm check && pnpm build
SDK_CONSTRUCTION_EVIDENCE=/workspace/shared/sdk-construction-evidence/focused \
node --import /workspace/shared/sdk-construction-evidence/retain-evidence-all.mjs \
  --test --test-concurrency=1 \
  tests/semantic/failed-build-recovery.test.mjs \
  tests/semantic/hms-kit-resolution.test.mjs \
  tests/semantic/project-sdk-selection.test.mjs \
  tests/semantic/startup-synchronization-liveness.test.mjs \
  tests/semantic/worker-registry-cleanup.test.mjs \
  tests/semantic/worker-ownership-fault-boundaries.test.mjs \
  tests/semantic/semantic-group-retention.test.mjs \
  tests/semantic/typescript-synchronization-cancellation.test.mjs \
  tests/test-layer-manifest.test.mjs
```

## 普通完整checkout的建议复现命令

使用Node20.19.5、pnpm8.15.9及受支持的Rust工具链；checkout须包含真实的tracked WASM资产。
以下命令不依赖本环境env.sh或仓外保留器，使用仓内测试夹具。**它们是建议复现步骤，未作为本片额外的未插桩PASS收据执行。**
实际历史运行及观察条件以上节和原始日志为准。

```sh
pnpm install --frozen-lockfile --ignore-scripts
cargo build --locked --release -p arkts-index-sidecar -j 2
pnpm check && pnpm build
node --test --test-concurrency=1 \
  tests/semantic/failed-build-recovery.test.mjs \
  tests/semantic/hms-kit-resolution.test.mjs \
  tests/semantic/project-sdk-selection.test.mjs \
  tests/semantic/startup-synchronization-liveness.test.mjs \
  tests/semantic/worker-registry-cleanup.test.mjs \
  tests/semantic/worker-ownership-fault-boundaries.test.mjs \
  tests/semantic/semantic-group-retention.test.mjs \
  tests/semantic/typescript-synchronization-cancellation.test.mjs \
  tests/test-layer-manifest.test.mjs
```

## 候选身份与未验收范围

SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| `src/semantic/backends/ohos-typescript/sdk-export-language-service.ts` | `2ea8635ea2caeed7a41a883eeb2214d8580a2c19a37a48a21c749472b05ff1f0` |
| `tests/fixtures/failed-semantic-build.cjs` | `81122deccb61b00ac6ff2f27b39f2accf50a95efde475ee50403b74f6d697b5c` |
| `tests/semantic/failed-build-recovery.test.mjs` | `3b63c731666ad0d2dcb29a5cb7cb511df69c59d079282b0bfa7cb69e77ccf628` |

`pnpm check:fast`、目标HEAD完整CI均NOT_RUN；本地缺WASM，不能称完整验证checkout。
artifact/Windows/macOS/真实SDK/真实UI/用户项目/资源性能/scale/soak未验收。
本记录是提交前验证快照，当时未commit/push/开PR；后续发布与完整CI以新PR收据为准，未合并或部署。
默认主Worker1、maxResidentContexts null、RSS预算null、ADR0031清算与原deadline、455豁免均不变。
M1通过不升级M2工作集归因、M3策略实验、ADR0043审批或R项产品毕业；现场高内存根因仍未知。
