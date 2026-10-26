# 路径身份与目录边界回归：2026-10-22

父版本：`e35459131366a32c48c10d1d74adef74357cd3dc`。
分支：`fix/windows-path-identity-20261022`。
范围：用户授权的路径修复；缓存部分仅诊断，不实施优化或改变新鲜度合同。

## RED → GREEN

证据目录：`.bench/20261022-path-fix/`。下列失败日志保留，没有用通过结果覆盖。

1. `node --test tests/path-identity.test.mjs`：`parent-red.log`证明exact parent的
   `relative=..`被错误接受。先最小修复，再提取统一包含规则；`parent-green.log`通过。
2. 同命令：`drive-red-confirmed.log`证明native的`file:///d:/...`与Node的`D:\...`
   不等价。统一Windows盘符字母，保留文件/目录拼写；`drive-green.log`通过。
   更早的`drive-red.log`是测试工具误用esbuild同步插件导致的工具错误，不算产品RED。
3. 同命令：`worker-red.log`证明两个Worker包含入口拒绝相同卷的不同盘符拼写。
   Worker、索引重映射、物理目录边界共用包含规则；`worker-green.log`通过。
4. 同命令：`case-alias-red.log`证明已有大小写别名未被接受。差异拼写仅在当前
   realpath证据能证明等价时接受；`case-alias-green.log`含相关30项通过。
5. 同命令：`fold-red.log`证明旧Windows范围比较把未知的不同大小写目录直接合并。
   删除范围比较中的全路径小写，项目物理范围键改用同一保留拼写的身份函数。
   `scopes-characterization.log`的36项通过保护项目范围及物理边界行为。
6. `tests/lsp-path-identity.test.mjs`使用真实Content-Length stdio子进程。
   从父版本git archive独立构建runtime，通过`ARKTS_PATH_TEST_RUNTIME`选择它，
   `public-parent-confirmed.log`保留completion的`Invalid semantic worker request`。
   修复版本成功打开大小写别名、补全、定义及编辑后更新；原生索引返回保留大小写的文件名。
   父版使用同一真实native binary；没有把缺失侧车当作身份故障。
   更早`public-parent-red.log`第二项是baseline目录缺少native路径的工具问题，已单独保留。
7. Node/Rust共读`tests/fixtures/path-identity-vectors.tsv`，覆盖盘符、文件名大小写、
   中文、空格、#/%编码。Rust只运行当前平台向量；Mac通过不能冒充Windows Rust通过。

## 实现边界

- 新`src/project/path-identity.ts`只折叠Windows卷字母，不改整个路径大小写或Unicode形式。
- `relativePathWithinRoot`用于已解析路径的词法关系；`relativeResourcePath`在不同拼写时
  使用当前物理路径/已存在父目录证明别名，不以未知身份推断相同。
- Worker输入的canonical URI校验、物理源准入、读前后检查、发布围栏继续保留。
- UNC完整支持、SDK/缓存策略、更大架构及暂停的事实索引均未混入。
- 新增两项Node测试入口已登记层清单。清单缺项和固定入口计数的RED均保留，计数232→234。

## 检查和环境限制

`rust-path.log`：`cargo test -p arkts-index-sqlite --test path_identity_contract`，1/1通过。
`rust-release.log`：`cargo build --release -p arkts-index-sidecar`，exit0。
`public-green.log`中两项公开LSP通过；该次文件内另有旧清单计数失败，不能宣称整条命令通过。

第一次`pnpm check:fast`在沙箱中遭遇内存采样`spawn EPERM`，见`check-fast.log`。
核验本次check进程树后停止，记录`sandbox-stop.json`；完整重跑另存
`check-fast-unsandboxed.log`，最终结果见本轮报告，不以EPERM失败场冒充通过。

Windows 最初三次授权重试连接超时；10月23日恢复后在全新 `D:\code\arkts-path-identity-20261023` 真机验证。
最终构建/类型检查与15项回归通过，Rust路径测试1/1、release构建通过。完整收据见本轮报告；
Windows目录级大小写敏感、UNC与junction的完整端到端验收仍未完成。
455文件冷目录3秒门槛按用户授权继续跳过；不删除索引，不放宽其他正确性检查。

## 真机追加的 RED → GREEN 与统计修正

8. Windows `tests/semantic/retained-source-evidence.test.mjs` 的 READY 场景实际 degraded，
   原始 `windows-evidence/sdk-counter-final.log`、`sdk-readiness-diagnostic.log` 保留。
   独立公开报告给出 `standard-library-unavailable`；内存插桩
   `standard-library-paths.ndjson` 记录标准库根 `D:/.../dist` 与实际 `D:\\...\\dist`，
   共52个库文件，证实比较分隔符错误。`typescript-semantic-readiness.ts` 改用
   `sameResolvedPath`，没有删除标准库证明；最终 Windows `all-focused-verified.log` 15/15通过。
   更早 `sdk-path-diagnostic.log` 是私有插桩匹配 bundle alias 失败，不算新的产品 RED。
9. Windows公开路径LSP先前在清理hook报SQLite EBUSY：临时目录删除注册在关闭服务之前。
   `public-path-initial-cleanup-failure.log`保留；改为同一个async hook先等待session.close，
   finally删除目录（有限重试），不吞关闭失败。Mac与Windows公开回归均重新通过。
10. 完整 `pnpm check:fast` 原始结果1953/1954，唯一失败是SDK身份次数统计窗口混入后台诊断。
    原断言不改时，父版与候选版的独立公开LSP诊断均复现：diagnose192次、references192次，
    合计384。原全量失败中的额外18次没有请求栈，不能逐次追认，但统计缺陷已有对照反证。
    在现有无warm-reference场景强制等待version2诊断后先运行真实测试得到
    `counter-window-red.log`；仅在fixture内用AsyncLocalStorage按实际Worker请求归属记录引用身份。
    保留全窗口原始计数并断言背景诊断确实进入统计窗口；每文件两次引用核验要求不变。
    `counter-window-green-node26.log` 3/3；最终Node20含路径、LSP、该SDK回归及清单15/15。
    无产品缓存/新鲜度改动。修正后的最终候选尚未再次运行完整check:fast，不能宣称全量GREEN。

最终正式矩阵在标准库修复后重新固定源码/runtime/SDK，normal final1～3、diagnostic final1，
与修复前24会话分开；本轮没有为了455冷目录3秒门槛添加优化。
