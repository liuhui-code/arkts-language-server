# 安装产物包含压力诊断 Worker

日期：2026-11-03。父版本：`c0a6da0db115de563c41de0f959b0f60aad9538c`。
范围：已确认的独立交付缺陷，不是 Windows 用户全部跳转失败的现场根因认定。
依照 [ADR0013](../adr/0013-evidence-and-release-gates.md) 分开实际安装产物、合成压力和原生平台证据；
[ADR0029](../adr/0029-opt-in-rss-memory-budget.md) 的默认无 RSS 预算及显式压力语义保持不变。
以下原始收据为提交前验证快照；后续独立main整合见文末，发布和完整CI以新PR收据为准。
未合并、部署或重启用户进程。

## 反例与最小修改

构建已生成 `diagnostic-verifier-worker.cjs`，L3 默认临时诊断会加载它，
但 Windows runtime、Unix 本地安装、portable builder 和 manifest installer 的交付清单均遗漏该文件。
初始化及一般 definition 可以成功；到实际 L3 诊断才失败。
缺诊断 Worker 的独立隔离实验仍能精确跳转，不能用本修复解释主 semantic Worker unavailable。

先增加稳定接口测试，再修复四处现有清单：Windows 文件指纹/复制/复核，
Unix 指纹/复制/复核，portable 构建及 manifest 安装的必需 runtimePaths。
不改主 Worker、诊断算法、压力阈值、恢复预算或查询输入证明。

真实安装测试使用已构建生产 bundle 经 `buildWindowsRuntime` staging，
测试结束安装后删除构建输入目录，实际启动安装路径 server/sidecar，走 Content-Length stdio。
Linux 使用真实 Linux sidecar 放在 Windows 布局的 `.exe` 路径，不模拟其运行平台。
最小 SDK、1MiB 显式预算用于可靠触发 L3，不是实际1MiB内存占用或大项目压力验收。

检查初始化 READY、v1空诊断、v2精确2304错误及UTF-16范围、修改前后精确 definition、
实际 `diagnostics.transient.complete` v2事件、一个主Worker、无恢复、正常shutdown/exit0。
同一公共检查接入原生 Windows 安装 smoke，以及实际 portable 安装验收。
portable调用保留原poison PATH和隔离HOME后再叠加压力设置，不能绕开安装验收边界。
Windows CI路径过滤补入独立runtime安装脚本，后续仅改该文件也会触发相应工作流。

## 首轮 RED / GREEN

Node20.19.5，Linux x86_64；命令从仓库根运行，先使用锁定工具链PATH。

```sh
node --test --test-concurrency=1 tests/windows-zed-local-install.test.mjs \
  tests/portable-artifact-builder.test.mjs tests/semantic/default-pressure-diagnostics.test.mjs
```

RED：5PASS/4FAIL/0skip，exit1，23262.375084ms，`packaging-red.log`。
三例无法读取已安装/构建产物中的诊断worker；真实安装LSP进入L3后20秒内未发布诊断。
源码运行的原压力诊断例通过。补充缺必需文件和Unix交付断言RED为9PASS/4FAIL/0skip，exit1。
不放宽任何诊断等待、语义结果或生产timeout。

`tests/local-delivery-config.test.mjs` 原526行，先取得原6/6 PASS characterization，
再把完整假pnpm/cargo构建工具fixture提取到独立support模块，现495行。
其余修改的源码、脚本及测试均≤500行；portable acceptance现498行。

## 审查补充：阻止旧安装器静默漏装

仅追加文件但保持artifact manifest v1不安全：旧安装器验证manifest每个文件，
却只复制自己的硬编码runtimePaths，仍可能成功激活漏掉新worker的release。
仓库已有严格schema版本门，没有可安全依赖的“未知必需角色自动安装”兼容合同。

新artifact manifest采用v2，新安装器仅接受v2并要求诊断worker；
标准库manifest和sealed-build输出schema不变。用户应使用该artifact附带的新安装器；
旧安装器对v2在创建安装目录/切换激活之前拒绝，不做隐式降级或不完整迁移。
原v1产物也不被新安装器误认为满足本版运行角色合同，应重新生成完整v2产物。
这只是交付格式兼容门，不完成运行身份/自动更新/历史release回收的完整方案。

`tests/fixtures/install-from-manifest-v1.mjs` 为父版本安装器的逐字冻结副本，
SHA256 `2b5d988e86a93fce322e74bc8c105b8e6035df3953fa080e562b64f76e68f10d`。
新增回归直接执行它，不使用简化mock：初版v1新artifact被旧安装器成功接受，
触发 `old installer silently accepted an incomplete runtime` RED。
连同显式v2元数据断言，共9PASS/2FAIL，exit1，`packaging-v1-red.log`。
v2后同一旧安装器明确拒绝，新安装目录未创建，已有activation字节不变；
新安装器实际安装v2并完成公开语义/压力检查。

## 最终收据与未覆盖范围

```sh
node --test --test-concurrency=1 tests/windows-zed-local-install.test.mjs \
  tests/portable-artifact-builder.test.mjs tests/local-delivery-config.test.mjs \
  tests/release-artifact-topology.test.mjs tests/semantic/default-pressure-diagnostics.test.mjs \
  tests/test-layer-manifest.test.mjs tests/zed-adapter.test.mjs tests/artifact-manifest.test.mjs
node --test --test-concurrency=1 \
  --test-name-pattern='installs one verified artifact without source dependencies or a rebuild' \
  tests/release/portable-install.acceptance.mjs
```

最终v2：8完整文件37/37 PASS，0fail/skip/cancel/todo，exit0，10966.279167ms，`packaging-v2-final.log`。
真实portable安装选定例1PASS/3名称过滤skip，exit0，9867.326334ms，`packaging-v2-portable-installed.log`。
脚本语法检查及 `git diff --check` PASS。原test manifest仍303个入口，没有把release验收混入fast。
早期仅v1清单修复的23/23、36/36和portable1/3skip是中间收据，不覆盖最终v2输入。

额外扩展/release contracts为18/19，保留FAIL：本地缺已有必需的
`editors/zed/grammars/arkts.wasm`，`release-pipeline`校验ENOENT；不是补造grammar或改skip使其通过。
本地也没有真实Zed extension WASM构建产物，未宣称其余portable完整文件/原生Windows可执行。
完整check:fast、真实Windows CI/Zed UI及用户实际SDK/大工程未跑，不能称完整跨平台验收。

测试使用共享候选中已有独立file-event恢复补丁的server，但未修改其源码。
运行输入SHA256：server `a95433d1c112da39c657f9854430d35933365757511edb6109fe11e161f04748`；
semantic-worker `1ec5156f3345f7e15293b30cda2f3ecf630b79176ea54f8d17b1f9382d10bbfe`；
diagnostic-verifier-worker `2213a6bb5e7474820f3fe729164494e5afe5ffdc0019c15e9eb4eb0bd0a6cc26`。
原始RED、所有中间GREEN和缺grammar失败均保留在维护者本轮证据中，不覆盖或累加成整仓PASS。

## Independent main integration

新PR独立基于 `298d65f5d7f796c347fe8be5c739e428066489d8`，不依赖或夹带PR115。
保留以上c0a6da0原始RED/GREEN；冻结v1安装器同时与main原文件逐字一致。
只移植本轮两修复与ledger新增段落，另核PR115的七个非ledger路径维持main内容或不存在。

普通完整checkout先具备真实tracked grammar WASM，再准备构建输入：

```sh
# Node20.19.5、pnpm8.15.9、仓内固定Rust工具链
pnpm install --frozen-lockfile --ignore-scripts
cargo build --locked --release -p arkts-index-sidecar -j 2
pnpm check && pnpm build
```

本地独立main重新运行Node20check/build；未重新安装依赖或编译无改动的native，复用已核hash的工具/sidecar。
以下17个完整文件实际通过142/142，0fail/skip/cancel/todo，exit0，199165.70419ms；2224输入前后一致。

```sh
node --test --test-concurrency=1 \
  tests/semantic/worker-recovery-configuration.test.mjs \
  tests/semantic/unresponsive-worker-recovery.test.mjs \
  tests/semantic/worker-recovery-replay.test.mjs \
  tests/semantic/worker-recovery-replay-model.test.mjs \
  tests/workspace-configuration-authority.test.mjs \
  tests/workspace-file-change-coordinator.test.mjs \
  tests/lsp-workspace-file-changes.test.mjs \
  tests/lsp-workspace-global-freshness.test.mjs \
  tests/windows-zed-local-install.test.mjs \
  tests/portable-artifact-builder.test.mjs \
  tests/local-delivery-config.test.mjs \
  tests/release-artifact-topology.test.mjs \
  tests/semantic/default-pressure-diagnostics.test.mjs \
  tests/test-layer-manifest.test.mjs \
  tests/zed-adapter.test.mjs \
  tests/artifact-manifest.test.mjs \
  tests/semantic/failed-build-recovery.test.mjs
```

另按上节原命令运行实际portable安装选定例：1PASS/3名称过滤skip，0fail，exit0，7727.95592ms。
两者独立，不相加成完整fast。原始证据标识 `windows-fixes-publication/` 下有main-check/build、main-integration-tests及main-portable-installed日志。

为用户要求的原生Windows验证，随后仅补Windows workflow步骤及既有release-pipeline测试合同：
安装/reinstall/installed smoke后，从仓库根运行 `node --test --test-concurrency=1 tests/semantic/worker-recovery-configuration.test.mjs`。
安装步骤已提供依赖、生产bundle和原生sidecar；不放宽测试/生产期限。独立静态审查核对Windows路径、Node预载和执行先后。
合同先RED 0PASS/1FAIL/5名称过滤skip，错误为缺少完整恢复命令；加步骤后GREEN 1PASS/0FAIL/5名称过滤skip。
完整release-pipeline文件5PASS/1FAIL、0skip，唯一FAIL仍为缺grammar WASM的ENOENT，完整失败日志保留。
最后在Linux预验同一完整恢复文件加manifest文件：9/9PASS、0fail/skip/cancel/todo，20334.863735ms，2224输入前后一致。
这些不是原生Windows运行收据；新head完整CI须分别报告Windows installed smoke和全部5例恢复结果。

最终29路径；源码/脚本/测试均≤500行。上述运行后只补本文及ledger等文档，不变更已测产品代码。
本地完整fast仍NOT_RUN；真实用户Windows首故障、SDK/大工程与长期恢复风暴仍未定，不从本次功能证明推断RSS收益。

现场补充：用户另报告23787 memberships的大闭包，createProgram持续900s未返回、definition持续90s未返回，以及30s watchdog反复终止Worker。
本PR不修复或解释这个大闭包构建/响应停滞根因；不改watchdog/查询期限，也不以恢复和交付修复宣称上述现场已解决。
