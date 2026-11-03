# Windows source-path physical identity

日期：2026-11-03。父版本：`a311fab4eec5af4229f220f98c60a51cc3d57ad7`。
状态：5c61bb 原生路径与恢复子集通过，Windows 整任务14/15FAIL因既有向量CRLF解析；
test-only修正局部验证完成，修正后新head完整CI/原生结果待取得。此前失败全部保留。
依据：[ADR0005](../adr/0005-index-proof-trust-boundary.md) 的物理源证明与
[ADR0013](../adr/0013-evidence-and-release-gates.md) 的分层证据；不改变任何 ADR 状态。

## 首轮 CI：保留失败，不用局部 GREEN 覆盖

[PR116](https://github.com/liuhui-code/arkts-language-server/pull/116) 的
[run41611920609](https://github.com/liuhui-code/arkts-language-server/actions/runs/41611920609)，
attempt1，Windows job125835677935；Node20.19.5、pnpm8.15.9、Windows Server2022。
实际 checkout 为 `fe32781f49a1fd203e4e3c11fa6ff6dd3b152612`，与发布 head 同 tree。
安装、重装和 installed pressure/LSP smoke PASS；构建目录完整恢复文件
`tests/semantic/worker-recovery-configuration.test.mjs` **1PASS/4FAIL、0skip**，
14635.9864ms，exit1，原期限及精确结果断言均未放宽。
截至09:44UTC，Linux validate 仍运行，09:49UTC复核仍无完整终态；Windows 失败已经确定。
此轮诊断未 rerun 该 CI，不以未来新 head 的结果覆盖此失败。

失败分层如下：

- SDK ambient 声明用例通过；它不覆盖跨文件相对导入。
- 既有 readiness 用例在故障注入前已得到 `degraded`，不是预期 `ready`。
- 两个 collapsed-file 用例在初次 definition、故障注入前已返回
  `Main.ets` import alias 0:9–21，而非 `Unopened.ets` 声明 0:16–28。
- 无效事件负例经过原准入检查，最终恢复定义仍落在同一 import alias。

因此不能把4项失败直接归因于新增的压缩文件事件恢复逻辑。
首轮完整日志没有普通/native realpath 配对值和完整 preparation 输入；
`RUNNER~1` 出现在失败 URI 中，但不是单凭字符串就能确认原生根因。

## Linux 定向反例与最小变更边界

`canonicalExistingPath` 与非 resident 源已使用 `fs.realpathSync.native`，
但 resident 源的 `prospectiveRealPathSync` 以及 call-hierarchy 根/源比较使用普通 realpath。
Linux Win32 路径模拟让普通 realpath 保留8.3别名、native返回长名：
合法 resident 源被错误拒绝，非 resident 源仍被接受，逃逸路径仍被拒绝。
仅修改 prospective helper 又会令未保存源的 call-hierarchy 根/源身份不一致。

三个独立真实 framed-stdio LSP 子进程给出同一机制的公开反例：

1. 普通路径对照：`ready`，精确 `Unopened.ets` 0:16–28，exit0。
2. 仅模拟短名/长名 realpath 差异：`degraded / dependency-inputs-incomplete`，
   `./Unopened` 报2307，definition精确落在 `Main.ets` 0:9–21，exit0。
3. 仅在内存统一三个既有 realpath 调用：重新 `ready`，精确目标0:16–28，exit0。

这是 Linux 故障模型，不是 Windows 原生 RED/GREEN。诊断期间未修改候选源码或构建产物；
内存变换严格匹配三个调用。初次探针缺少 esbuild stdin TypeScript loader 的失败单独保留，
修正后证据才进入本结论。真实 Linux 文件系统的 helper-copy before/after 共26/26通过，
覆盖已存在/未保存/嵌套缺失源、根内链接、根外链接（含未保存叶）、父路径、大小写不同目录
及 call-hierarchy 缺失/越界；不冒充原生 Windows、完整 LSP 安全回归或正式补丁验证。

最小补丁限定 `src/core/types/typescript-source-boundary.ts` 的三个普通 realpath 调用：
源、根和最近已存在祖先使用同一 native 物理身份；保留缺失后缀拼接、词法与物理双重边界。
不全局 lowercase，不移除包含校验，不重写客户端 URI，不改夹具期望，不用长路径 TEMP 掩盖产品问题。
原有宽 catch/fallback 与 dangling-link 处理不因此获得额外安全认证，仍须权威层负向回归。
不新增 owner、扫描、协议或恢复策略；配置/SDK/overlay/freshness/退出围栏均不放宽。

## 正式 TDD 与新 head 门禁

父版本a311fab上新增 `tests/lsp-path-identity.test.mjs` 的真实子进程用例；
仅测试preload模拟普通/native realpath差异，native API与产品compiler算法不被替换。
定向命令：

```sh
node --test --test-name-pattern='lexical and native realpath spellings' tests/lsp-path-identity.test.mjs
```

初版 RED0PASS/1FAIL、2名称过滤skip，896.636019ms，exit1，明确报告2307与Main alias；
三处native补丁的初版 GREEN1PASS/0FAIL、2名称过滤skip，809.795421ms，exit0，
同时验证无磁盘叶overlay的精确跨文件定义。Node20.19.5、pnpm8.15.9 check/build通过。

随后加入未保存源 `pendingCall` 的 prepareCallHierarchy 精确URI、完整范围与selectionRange断言，
不以初版GREEN认证新测试。正确的“只改最近祖先helper”控制仍能通过readiness/definition，
但在call-hierarchy返回 `-32803 / source-outside-workspace`：0PASS/1FAIL、2名称过滤skip，
851.636052ms；完整三处修复的强化版1PASS/0FAIL、2名称过滤skip，864.271144ms。
一次反向变换误改原有 `canonicalExistingPath.native` 的控制单独归档为
`partial-control-invalid.*`，不作半修复证据；正确控制为 `partial-fix-red.tap`。

初版9个完整相邻文件131/131PASS（112个顶层case），0fail/skip/cancel，exit0，
100136.829552ms；8项源码/测试/构建SHA前后一致。
强化版重跑下节相同的3完整文件命令：15/15PASS，0fail/skip/cancel/todo，exit0，
22709.515388ms；`final-before.json` / `final-after.json` 的8项SHA一致，check/build通过。
产品源码与9文件验证时相同，仅两个测试增强。两组不相加成全套通过；未运行新的完整 `pnpm check:fast`。
四路径补丁随后在发布worktree逐字节核对并整合，Node20 check/build通过；相同3完整文件
15/15PASS，0fail/skip/cancel/todo，exit0，23027.377985ms，2225/2225输入前后不变。
这是发布候选的Linux整合复核，仍不是新head的CI或原生Windows结果。

初版完整相邻命令：

```sh
node --test --test-concurrency=1 \
  tests/path-identity.test.mjs \
  tests/lsp-path-identity.test.mjs \
  tests/semantic/worker-recovery-configuration.test.mjs \
  tests/lsp-call-hierarchy.test.mjs \
  tests/semantic/definition-alias-barrel.test.mjs \
  tests/semantic/navigation-close-reopen.test.mjs \
  tests/semantic/unopened-source-query.test.mjs \
  tests/semantic/project-module-resources.test.mjs \
  tests/semantic/changed-source-read-witness.test.mjs
```

### 原生 Windows 工作流入口

既有 `Validate native Windows recovery` 步骤扩展为以下三个完整文件，无名称过滤；
保留 `pwsh`、原安装/重装/installed smoke 顺序、默认 TEMP 和原期限：

```sh
node --test --test-concurrency=1 \
  tests/semantic/worker-recovery-configuration.test.mjs \
  tests/lsp-path-identity.test.mjs \
  tests/path-identity.test.mjs
```

`tests/release-pipeline.test.mjs` 的 Windows 合同单例先 RED0PASS/1FAIL，
87.055546ms，再 GREEN1PASS/0FAIL，78.769859ms；两次各5名称过滤skip。
这是工作流覆盖合同，不是原生执行结果。新输入的完整合同5PASS/1FAIL、0skip，
113.494491ms，exit1；唯一失败仍是 `editors/zed/grammars/arkts.wasm` 缺失ENOENT。
保留旧输入完整5/6失败；定向GREEN不能覆盖新旧完整合同FAIL。
日志在证据根 `path-workflow-{red,green,complete}.log`。
路径测试记录真实 root/Main 普通/native 值，覆盖根内未保存/嵌套缺失源与真实链接逃逸；
Windows使用junction、Linux使用directory symlink。未保存源call-hierarchy有上述公开精确断言。
以上为发布5c61bb前收据，原生后续结果见下节，不以局部结果预先宣称CI全绿；
完整 Linux gate、原生 Windows 和正式局部结果各自记账，互不替代。

证据目录（维护者本地，非仓库下载链接）：
`/workspace/shared/windows-fixes-publication/` 下的 `ci-windows-failure.json`、
`ci-windows-native-full.log`；后者 SHA256
`00762484f1303964a199c104df4226ada3b8e44bffc154c9bd22f0f3bc002c60`。
诊断在 `short-path-audit/`：`README.md`、`candidate-pins.sha256`、
`public-lsp-summary.json`、`boundary-simulation.json`、`physical-boundaries.json`。
正式收据在其 `formal/`：初版 `red.tap` / `green.tap`、正确 `partial-fix-red.tap`、
强化版 `final-green.tap`、首轮 `related.tap`、最终 `final-three-files.tap`，
两轮前后输入JSON与check/build日志。源码补丁 `short-path-audit/native-path-fix.patch`
SHA256为 `af86fec5356f7e33d85c5deb84058e2d7998db1831c685cb075da2cbdbec88e7`；
最终产品源码SHA256为 `2c8351659025feba5d0d8e33bfb69044ea3f9bf13f3542f91a91c416172213c9`。
发布整合收据在证据根 `path-main-{check,build}.log`、`path-main-three-files.log`、
`path-main-before-pins.json` / `path-main-postflight.json`。

## 5c61bb 原生结果与 CRLF 向量修正

发布head `5c61bb0b250c9d4eb121eafb7c72c7d2b947dd78` 的
[run41615220013](https://github.com/liuhui-code/arkts-language-server/actions/runs/41615220013)，
attempt1、Windows job125846873397，实际checkout `a64ecece9fd40eb735dbe1ebd774107d9b5358f0`。
安装、重装、installed pressure/LSP smoke PASS；同3完整文件 **14PASS/1FAIL、0skip/cancel/todo**，
26928.5882ms，exit1，整任务仍为FAIL。

分层结果：原恢复5例全部通过，LSP路径3例全部通过，新物理边界例也通过；
真实root/Main的普通realpath保留 `C:\Users\RUNNER~1\...`，native返回
`C:\Users\runneradmin\...`，resident边界正确接受。该原生配对证实此前身份差异机制，
路径修复与原恢复用例已有原生证据，不再仅凭Linux模拟；仍不等于整体CI或产品门禁通过。

唯一失败是既有 `Node accepts shared native URI vectors without changing filename case`：
实际URI为 `file:///d:/Photos/MixedCase.ts`，期望字段却多出末尾 `\r`。
TSV的CRLF输入被旧 `split("\n")` 拆行后将CR保留在URI字段，属于测试输入解析错误。
修正只改 `tests/path-identity.test.mjs`：先构造LF和CRLF两组相同原向量，
逐项运行既有身份与URI roundtrip精确断言，再将拆行改为 `split(/\r?\n/)`。
原平台规则不变；无新增skip、URI trim、向量内容改写或产品代码变更。

```sh
node --test --test-name-pattern='Node accepts shared native URI vectors' tests/path-identity.test.mjs
```

两种换行输入在旧拆行下RED0PASS/1FAIL、6名称过滤skip，127.022903ms，exit1；
最小修正后GREEN1PASS/0FAIL、6名称过滤skip，119.483344ms，exit0。
独立审查接受。相同Windows入口的3完整文件在Linux15/15PASS、0fail/skip/cancel/todo，
22297.577757ms，exit0；2226/2226输入前后一致。
产品源码/runtime与已发布5c61bb相同，本test-only修正未重新build，不将旧build写成新build。
5c61bb的原生产品与相关子集PASS只覆盖其输入；修正后新head完整Linux/native CI仍待运行，
原a311fab的1/5和5c61bb的14/15整任务FAIL均保留，不用局部GREEN替换。

证据根仍为 `/workspace/shared/windows-fixes-publication/`；原生完整日志
`path-repair-publication/ci-windows-full.log` 的SHA256为
`63f69597cd535c6d02806eaa90d3dcb52721ad95b7b9a05ad1331fcb88770982`。
原生分层摘要在 `path-repair-publication/ci-windows-summary.json`。
测试修正收据：`crlf-vector-fix/{red,green,three-files}.log`、
`crlf-vector-fix/before-pins.json` / `crlf-vector-fix/postflight.json`。

## 不外推的结论

这与[压缩事件恢复](2026-11-03-worker-file-event-recovery.md)及
[诊断 worker 交付](2026-11-03-installed-diagnostic-worker.md)是不同失效层。
不变更安全准入、生产超时、恢复预算或默认内存；不宣称修复用户23,787 memberships、
900秒 createProgram、90秒 definition、30秒 watchdog 所涉大依赖闭包首故障。
没有一般性能/RSS收益、真实 Zed UI、长期恢复风暴或 L08 毕业结论。
