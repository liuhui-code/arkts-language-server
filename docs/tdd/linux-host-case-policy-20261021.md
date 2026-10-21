# Linux Host 与 Registry 大小写策略（2026-10-21）

> 公开审查记录：原始 CI/本地日志仅保留本地，见[证据保留说明](../reports/local-performance-evidence.md)。
> 独立 Linux 对照已取得原大写文件恢复用例3/3 GREEN；其它失败与最终同候选完整检查仍未闭环，不宣称完整 Linux/release 资格。

- 父提交：`a3c7a91990be6e9e189afe337b7abeb3e0f97f21`。
- 原始 CI：[Actions run 39522257830](https://github.com/liuhui-code/arkts-language-server/actions/runs/39522257830)。
- 该 CI 完整结果为1943项、1940通过、3失败。本记录只处理其中一项，不把其它失败算作已解决。
- 状态：Host 大小写修复的 Linux 定向恢复用例通过；组合修复与最终完整检查及 CI 资格仍为 **PENDING**。

## 已有公开 RED

真实 child-process Content-Length stdio 用例：
`tests/semantic/semantic-group-retention.test.mjs` 的
`a transient group source read failure recovers on the next witnessed same-membership catalog update`。

CI 在第469行失败：`catalog recovery must synchronize the previously unavailable source`。
恢复补全没有返回预期 `restoredMember`，不是测试超时或仅内部计数不符。
完整原始日志保留于[本地证据](../reports/local-performance-evidence.md)，不能仅凭截尾的 failed-log 输出推断全部失败数。

该场景保留大写文件名 `ZRecovered.ets`，270个 filler 使它处于256份 raw 文本窗口之外。
既有 fixture 在实际 semantic Worker 的首次 lazy 读取中注入一次 EIO。
首次补全确认目标成员缺失；随后修改另一个模块的 scalar 源码并发送 watched-file changed，
再查询原文件，要求同成员恢复。修复没有改文件名、等待、重试、watchdog或断言。

## 代码依据与最小改动

原 `TypeScriptLanguageServiceEngine.createHost` 没有提供 `useCaseSensitiveFileNames`。
固定编译器的 `hostUsesCaseSensitiveFileNames` 在该方法缺省时返回false，LanguageService
据此创建 canonical file-name 函数；`registry-pool.ts` 则以
`ts.sys.useCaseSensitiveFileNames` 创建共享 DocumentRegistry。二者在大小写敏感文件系统上可能不一致。

具体恢复路径是编译器 `isProgramUptoDate` 检查
`program.getMissingFilePaths().some(fileExists)`。如果缺失路径已被小写化，
Host membership 的精确路径查找可能失败，后续磁盘存在性检查也可能找不到真实的大写文件。
即使外层 project version 前进，编译器仍可能保留缺失该源的旧 Program。
Linux 对照支持此最小修复能恢复原公开场景；本记录没有把 CI 未保存的内部 missing-path 值写成已测事实。

最小修复在 `typescript-language-service.ts:createHost` 提供
`useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames`。
`sdk-preparation.ts` 原本已从实际 Host 方法取得 canonicalization 策略，因此只更新说明注释；
`registry-pool.ts` 和 SDK retention 继续沿现有 `ts.sys` / 实际 resolvedPath 身份，不另造大小写规则。

LS 中仅等价收紧 `getScriptKind` 三目表达式换行以抵消新增属性，文件保持3096行；
既有 transient recovery 测试保持471行、内容未改。

## 已执行的 Mac 检查

使用实际 Node20.19.5 启动器，完成以下检查：

- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`：exit0。
- `node scripts/build-runtime.mjs`：exit0。
- `node --test --test-concurrency=1 --test-name-pattern='a transient group source read failure recovers' tests/semantic/semantic-group-retention.test.mjs`：
  1通过、0失败、8项明确名称过滤跳过，目标用例约1499ms。

以上命令中的 `node` 是原已执行 Node20.19.5 绝对启动器的公开化表示，不是完整 shell 原始转录。
没有执行 pnpm 或以 packageManager 声明代替启动器版本核验。
构建和定向用例在收到统一暂停通知前已启动；随后已停止新增负载并告知协调者产物变化，
原版 RED 必须使用父提交的独立产物，不能误用该次修复构建。

Mac 的通过不是 Linux GREEN；过滤跳过不算完整文件通过，types/build也不代替公开语义回归。
本片未运行完整 `check:fast` 或 `check:release`，不授予当前合并候选完整资格。

## 已取回的 Linux 单变量对照

修复诊断：[Actions run 39526276859](https://github.com/liuhui-code/arkts-language-server/actions/runs/39526276859)，
提交 `3ac8c8e`。相对父候选的产品修复仅为上述 Host 两文件；未改原用例、大小写文件名、
EIO注入、等待或重试。原版和修复版分别在独立 Linux 作业中串行执行相同筛选三轮：

```sh
node --test --test-concurrency=1 --test-name-pattern='a retained source delta.*read-window|an unnotified source edit rejects the old resident text|a transient group source read failure' tests/semantic/changed-source-read-witness.test.mjs tests/semantic/references-batch-search-coverage.test.mjs tests/semantic/semantic-group-retention.test.mjs
```

| 既有公开用例 | 原版三轮 | Host修复三轮 | 可授予的结论 |
| --- | --- | --- | --- |
| 原 `ZRecovered.ets` transient 恢复 | FAIL / FAIL / FAIL | PASS / PASS / PASS | 原大写文件场景取得 Linux 定向 RED→GREEN |
| `mutation=read-window` | PASS / PASS / PASS | PASS / PASS / PASS | 本次没有复现原CI这一项失败，不能归因为Host修复解决 |
| unnotified-source-edit 的原 no-hit 断言 | FAIL / PASS / FAIL | PASS / FAIL / FAIL | 仍有2/3失败，不能称整场通过 |

修复三轮分别3通过/0失败、2通过/1失败、2通过/1失败；每轮33项名称过滤跳过。
整个诊断作业仍失败。这里没有把筛选跳过当作完整文件通过，也没有把 read-window 的
focused通过反推其完整 CI 失败已解决。后续准确断言与已知源码读取恢复属于另外的修复片。

原始日志仅保留[本地](../reports/local-performance-evidence.md)，SHA-256：

- 原版 `linux-original-focused.log`：`50f7f9ec563057255bb1981cf00d53682b57b88a8c41e77b23417f77b0b106be`。
- Host修复 `linux-hostcase-focused.log`：`de5a32d875824c281adc2830d6c67107d0372808c7eb3a2f71f544cd9661d50e`。

全部修复合并后的 Linux 三轮仍需另行验证；同候选完整 `check:fast`、`check:release`
与远端 CI 均不由本次定向对照替代。最终资格在合并前由协调者更新。

## 最终Linux定向对照（不代替完整门禁）

[Actions 39527839863](https://github.com/liuhui-code/arkts-language-server/actions/runs/39527839863)
对应独立诊断提交`2d3f14db28093f9395dda53943c447191991f8e0`。
最终公开树692项源码/测试/脚本/配置与该诊断树逐文件相同；辅助workflow不纳入合并。
三个串行轮次分别6项通过、0失败、33项名称过滤，共18项匹配执行通过。
筛选覆盖读取窗口、明确mtime漂移、SDK变化拒绝、namespace表征、重建后有效引用命中
及Linux同大小写缺失源恢复。原失败和中间版本保留，不能将名称过滤当作完整检查通过。
完整`pnpm check:release`、PR Linux/Windows检查仍须由最终公开提交独立取得资格。
