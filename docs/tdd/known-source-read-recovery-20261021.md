# 已知源码读取窗口失败后的原 LS 恢复（2026-10-21）

> 原始逐次日志只保留在本地，见[证据保留说明](../reports/local-performance-evidence.md)。
> 本片已完成 Mac 定向 RED→GREEN；同候选完整检查和 Linux CI 资格由合并流程另行记录。

## 父版本与复现边界

- 父提交：`a3c7a91990be6e9e189afe337b7abeb3e0f97f21`。
- 原始 Linux [CI 39522257830](https://github.com/liuhui-code/arkts-language-server/actions/runs/39522257830)
  的 `mutation=read-window` 在恢复请求 id4 返回 `-32803`。
- Mac 复现时共享构建已包含独立的 Host 大小写策略修复：
  `typescript-language-service.ts` 与 `sdk-preparation.ts`；
  `loaded-configuration-witness.ts` 仍与父提交相同。
  因此本片 RED 不是纯父提交产物，也不是 Linux 单变量对照。
- 实际使用 Node20.19.5、合成 SDK 和隔离的403份源码文件：Main、ZZModel、
  原 fixture 的 Unopened，以及400个 filler。使用真实 child process、Worker、
  Content-Length framed stdio，`ARKTS_BENCHMARK_CONTROL=0`。

初始化为 `ready`，首次补全返回 `markerOld`。关闭的 `ZZModel.ets` 从
`markerOld` 改为 `markerNew`，发送 watched-file changed 并把 Main overlay 改为
`model.markerNew`。私有 fixture 只在实际 Worker 的
`observeChangedSourceRead` 原生第二次 fstat 返回前，把同一文件改成等字节的
`markerEnd`；显式漂移变体使用真实 utimes 将 mtime 增加约2000ms，不伪造 stat。
id3 必须拒绝。再次发送该源码 changed 并将 Main 改为 `model.markerEnd`，
id4 必须返回新成员、排除旧成员。

只增加 mtime 漂移时，Mac 原逻辑仍通过：日志确认失败见证已发生，但恢复前
context.create 由1变为3，自动诊断触发 content-revision-change 重建，不能证明原 LS 恢复。
强漂移变体因此使用已有 `ARKTS_TEST_DIAGNOSTIC_DELAY_MS=5000` 延后自动诊断，
不增加等待或重试；断言恢复时 context.create 仍为1，避免重建掩盖失败。
原三例保持其原有诊断调度。

## 实际 RED 与最小修复

以下命令中的 `node` 是已执行的 Node20.19.5 绝对启动器的公开化表示，
并非原始 shell 转录。所有测试串行执行，不与基准或其他测试负载重叠。

```sh
node --test --test-concurrency=1 --test-name-pattern='mutation=read-window-drift' tests/semantic/changed-source-read-witness.test.mjs
```

修复前同命令连续两次 exit1：目标用例分别1822ms、1884ms，
各为0通过、1失败、3项名称过滤跳过。两次 id3、id4 均为 `-32803`，
context.create 均1→1，日志明确记录 `configuration-changed-source-read-unproven`。
原始日志为本地 `h1-delayed-drift-red.log` 和 `h1-delayed-drift-red-2.log`。

根因是已知源码的瞬时读取失败被写入全局永久 `unprovable`。
下次该源码真实稳定读取虽然更新了自身事实，却不能恢复该全局状态。
初版只分离 pending 仍失败：编译器随后对同一源码的普通存在性查询发现旧事实不同，
又把它升级为 `configuration-loaded-identity-changed` 的全局失败。
这次失败同样保留，不能把名为 `h1-delayed-drift-green.log` 的初次尝试算作通过。

最终改动仅在 `LoadedConfigurationWitness` 内：

- 已有确切路径事实、前后均可证明为 regular source 的已知源码读取失败，记录到 `failedSourceReads`；
  其路径数受原有4096份见证上限约束，不保存文本或新增跨请求成功缓存。
- 任何 pending 都拒绝 freshness，包括 capture、查询核验和独立最终核验。
- pending 期间同一 resolved 路径、同一事实键、前后均为 regular source 的普通旧身份差异继续保留拒绝，
  不 restamp 旧事实，也不升级为不可恢复的全局失败。
- 只有同路径 `observeChangedSourceRead` 完成真实读取并通过原有读前/读后守卫，
  才更新其已有事实并清除自身 pending；其他 pending 保留。
- 不同路径、目录/负查找 owner、未知 SDK/config、容量及其他 load-window
  失败继续使用原有全局 `unprovable`；源码恢复没有清除全局标记的路径。
  reset 仍清除该 owner 全部事实并推进 epoch。

本片遵守 ADR0019 的“已知源实际读取只重建自身事实”，不改变 ADR0007
readiness、完整输入资格、500ms及独立发布围栏。

## GREEN 与回归

```sh
node scripts/build-runtime.mjs
node --test --test-concurrency=1 --test-name-pattern='mutation=read-window-drift' tests/semantic/changed-source-read-witness.test.mjs
node --test --test-concurrency=1 tests/semantic/changed-source-read-witness.test.mjs
node --test --test-concurrency=1 --test-name-pattern='loaded SDK identity|old SDK proof|return-time disk change|same-size same-mtime' tests/semantic/request-input-validation.test.mjs tests/semantic/resident-input-proof-boundaries.test.mjs tests/semantic/resident-input-proof-reuse.test.mjs
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
```

- 强漂移目标1通过、0失败、3过滤，2001ms；id3仍拒绝，id4精确返回
  `markerEnd`、没有 `markerOld`，context.create 为1→1。
- 完整 changed-source-read-witness 文件5/5通过、0跳过：保留原3例，新增
  同 owner 强漂移恢复，以及恢复前额外修改 SDK metadata 后 id4仍拒绝的组合例。
  组合例 context.create 同样1→1；不以重启接受变化的 SDK。
- 紧邻输入回归4通过、0失败、13项明确名称过滤；不是三个完整文件全部通过。
  其中96个已载 SDK 输入仍各核验2次（查询与最终发布），旧 SDK proof、
  返回窗口磁盘改动、同大小同mtime替换均保持原保护。
- build、types 均 exit0。原有30s测试超时和初始化10s watchdog未放宽。
- 第一阶段文件行数：产品254、测试78、私有 fixture38，均低于500行。

## 证据身份与资格限制

原始日志的 SHA-256（完整内容仍只在本地）：

| 日志 | SHA-256 |
| --- | --- |
| h1-delayed-drift-red.log | 8ea0586a72c4dff1739f2e172962fb62e8975f8694f6cbb70c68fd5b6e77661b |
| h1-delayed-drift-red-2.log | 346b743fd389d828ef6281493dba325e68bb417287ae4276e5baf5e60df80b1b |
| h1-delayed-drift-green-2.log | b0843be892ee6935f507549dff045214098996ec8d6a530435251378f61b7849 |
| h1-source-witness-full-green.log | 58c318d02f93b2d0a761385bc120b800c182286fe9d1ced1fe06c852e1a56d5e |
| h1-related-green.log | 23d952ce6d896acd5741ef9553b0e783e1780021ca05b7637bed835b3a36b186 |
| h1-types.log | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |

复现前 semantic-worker SHA-256为
`4df46c2367dbc132b49c0cd2a21e90dbf116820fb9562d688d3a3c4f9bc12eaf`；
第一阶段 GREEN 构建为
`8d5d2209086b3c063822581f7e21a22ba2277f21a22105162f68542f73610f52`。
第一阶段产品文件 SHA-256为
`2559b47629e087d62b0250c34303e8c15ebceef4d22fa343b6ab5e6771a0eb94`。

本片不宣称 Linux 完整 GREEN、同候选完整 check:fast/check:release 通过，
也没有新增性能测量或修复全局 root Program、ambient gap、规模成本及500ms遗留。

## namespace 审查收紧与最终定向资格

独立审查发现：仅比较 pending 和字符串路径还不够。
`observePathLoad` 可能实际消费同名目录或负事实；之后普通文件恢复不应抹去该消费。
最终 `lookupIdentity` 增加由本次原生结果直接得出的 `regularSource` 分类：
没有缺失祖先，且 lexical lstat 与 target stat 都为 regular file；不接受叶 symlink。
不能把该限制只理解为错误恢复：普通已通知编辑同样必须满足实际读端口的源码资格。
祖先 symlink / ABA 未整体覆盖，本片不宣称解决这些既有 namespace 证明问题。
普通身份差异只有 before/after 均满足该分类时才可继续保留自身 pending，
`observePathLoad` 还明确排除 directory 消费。目录、absence、identity-unavailable、
不同 namespace owner 仍走全局拒绝。
首次 `observeChangedSourceRead` 的任一侧不满足该分类也立即标记全局
`changed-source-namespace-unproven`，不能进入可恢复的源码 pending。
稳定源码读取和原有完整读前/读后守卫才允许更新自身事实。

追加真实 LSP `mutation=read-window-namespace`：同一实际读取窗口把文件改为目录，
id3拒绝；原生 stat 观察记录确认实际 Worker 在 `lookupIdentity` /
`observeChangedSourceRead` 栈下看到了该目录。恢复为普通源码并发送 changed，
id4仍拒绝，context.create 1→1。该例在收紧前 runtime 已通过，
因为其他事实仍能挡住恢复；它是 **characterization，不是漏洞 RED**。
它没有证明 TypeScript 的 directoryExists 消费了该路径；该分支由实际代码形状审查覆盖，
不把源读取期间的目录观察冒充 directoryExists 公开复现。

最终构建后完整 H1 文件 **6/6通过、0跳过**，保留原5例与上述表征；
沿前述定向回归命令增加
`|L06 absent type roots|L06 a true transient|unrelated package-parent` 名称选项，
并增加 `resident-session-interactive-inputs.test.mjs`、`package-json-presence-guard.test.mjs`，
结果 **7通过、0失败、21明确名称过滤**。96个 SDK 输入仍各核验2次；
真实负 package.json、目录瞬时存在、workspace symlink alias 和最终发布保护保持精确。
最终 types、build、diff检查均exit0；没有运行完整门禁。
最终行数：产品260、测试90、fixture50。

| 最终本地证据 | SHA-256 |
| --- | --- |
| h1-namespace-before.log | 277b78c86b858aa7ab57d15cb35fbdb789589013160cab5184048e718121269f |
| h1-tightened-source-full-green.log | f36db0b79368d17715c1fa4ea459a0f0af3a9c898479f37b09edd2c500a81d5b |
| h1-tightened-related-green.log | 4f37126a7a5c1a4c3a8ab92a86477b2b297d8e4849552e104150860a19493da6 |

最终产品 SHA-256：`0adfc1ac1253e6cd4053738859a61448e57a4233cbdbbe3b10c33485b7458f1b`；
最终 semantic-worker SHA-256：`4949df431e3334622dfc2d4650be5ac7314ff65a73379f1dad9bb9c8343fdd28`。

### 叶 symlink 的实际调用边界（只读核对）

已知输入和变更路径并非全部先 realpath：`typescript-compiler-inputs.ts:16`、
`typescript-content-versions.ts:15`、LS membership 的
`typescript-language-service.ts:1820` 都只做 `path.resolve`；
`local-package-resolver.ts:331` 虽读取 physicalSource，普通相对依赖分支在第355行仍可返回 lexical candidate。
因此不能宣称 leaf alias 必然在进入新守卫前变成真实普通文件路径。

当前唯一调用者 `typescript-language-service.ts:1863` 要求完整 membership 含有该路径，
再经 token/read 回调调用 `observeChangedSourceRead`。
普通磁盘成员扫描在 `document-store.ts:1150` 明确跳过叶 symlink；
watcher 在 `watched-source-notifications.ts:49` 要求 lstat 为普通文件，
不合格的旧关闭成员会在 `document-store.ts:521` 移除并触发 reset。
已打开 overlay 可通过 `document-store.ts:1194` / `1214` 保留 lexical alias 为成员，
这条路径没有给新 alias 添加 disk token。
即使 alias 已持有 token，现存 `document-store.ts:326` 仍要求 lexical lstat 为普通文件，
叶 symlink 的 read 返回 null；父版本 a3 的 `observeChangedSourceRead` 也已把 content=null 全局拒绝。
所以该唯一路径的源码依据没有显示“此前可成功的稳定叶 symlink 普通编辑”被本次新守卫改为拒绝；
本片也没有新增 leaf-alias 的权威磁盘读取或同 LS 增量支持。
如果事件/解析实际交付的是 physical regular target，新分类看到普通文件，不受叶 symlink 条件影响。
以上是调用链审查结论，没有新增运行实验，不替代后续 alias/namespace 完整回归。

## 最终Linux定向对照（不代替完整门禁）

[Actions 39527839863](https://github.com/liuhui-code/arkts-language-server/actions/runs/39527839863)
对应独立诊断提交`2d3f14db28093f9395dda53943c447191991f8e0`。
最终公开树692项源码/测试/脚本/配置与该诊断树逐文件相同；辅助workflow不纳入合并。
三个串行轮次分别6项通过、0失败、33项名称过滤，共18项匹配执行通过。
筛选覆盖读取窗口、明确mtime漂移、SDK变化拒绝、namespace表征、重建后有效引用命中
及Linux同大小写缺失源恢复。原失败和中间版本保留，不能将名称过滤当作完整检查通过。
完整`pnpm check:release`、PR Linux/Windows检查仍须由最终公开提交独立取得资格。
