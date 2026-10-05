# S02 第三假说：隔离 compiler bulk hook

日期：2026-10-03。父修订 `c4df943e5ff9dc1d724bb2aee75d7c4a197efcf4`。
结论：**精确性窄切片通过，但批量提取假说未通过；`NON_BULK`，S02 门禁仍为 FAIL，S03 BLOCKED。**
这是实验脚本与临时编译器产物，不接生产 LSP、依赖或 SQLite；没有提交、推送、合并。
既有未提交改动均保留。它不证明 500 ms、低内存或真实 Settings 工程表现。

## 产物身份与边界

项目实际安装 `ohos-typescript@4.9.5-r10`，解析为 `typescript` 的 bundle SHA-256 为
`af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`。
builder 只接受这一精确输入字节，在外部临时目录以 `wx` 创建 `.cjs`，不覆盖
`node_modules`。本次产物 SHA-256 为
`ca6f6feaed4eb9937073626e7745524c584a5fa1ab19c6e949030f318874eb52`。
未修改源码中的生产 compiler import、默认 references 策略、worker 数或 schema。

npm 的 r10 元数据给出 `gitHead=5165f2f98adcf533c3b7e40c17761cdb231b6e47`，
但该提交在上游 checkout 的 `package.json` 标为 `4.9.5-r4`。因此这个 gitHead
不能被当作安装包 r10 的逐字节源码证明；本实验以已安装 bundle 的实测哈希锁定。

实验入口为 `FindAllReferences.Core.bulkConstructorReferenceGroups`。提取子进程只接收
fixture 源文件，不接收查询池；独立 consumer 仅读取序列化 facts；第三个、使用原版
r10 的子进程运行 definition→findReferences oracle。普通未修改 bundle 在该 CLI 下
返回 `FAIL/HOOK_UNAVAILABLE`、退出码 42，不会静默执行旧投影。

## 实测差分与工作量

| 固定 fixture | 原版 oracle / consumer 位置数 | 精确差分 | 内部逐目标查询 | 共享候选文件搜索 | 其它 container 搜索 |
| --- | --- | --- | ---: | ---: | ---: |
| 继承别名、括号继承；`includeDeclaration=false/true` | `0/1` / `0/1` | missing/extra `0/0` | 1 | 0 | 1 |
| 重载构造；`includeDeclaration=false/true` | `2/5` / `2/5` | missing/extra `0/0` | 4 | 0 | 5 |

两组 `requestedQueries=0`、提取 host `findReferencesCalls=0`、`bulkHookCalls=1`；
提取、consumer、oracle 的 PID 各不相同。`fullProgramPasses=1` **仅指共享
NameTable 索引的外层文件遍历**，不是全部 compiler 工作只经过 Program 一次。
每个构造器仍调用一次内部 `findReferencedSymbols`；这些用例的
`candidateFileSearches=0`，compiler 走 container/special 路径，因此共享索引
在该门槛用例里没有减少逐目标语义工作。它只证明这两组答案精确，**不证明
N 个目标的提取成本有界，也不能当作真正 bulk producer**。

CLI 因此即便 `differences=[]` 仍输出 `status=FAIL`、`failureCode=NON_BULK`、
`s02Gate=NOT_MET`，退出 42。测试覆盖编译器源哈希拒绝、stock hook 缺失、
构造器枚举、继承别名和重载的精确对照。没有运行真实 Settings/API24、SDK
声明、其它语义种类、overlay、提取时间/峰值对照；不可从这个小 fixture 推算内存收益。

## 复现与停止线

从仓库根目录，在已安装锁定依赖的环境中运行；每次使用新的临时目录，因为
builder 和 evidence writer 均拒绝覆盖：

```sh
bench_tmp="$(mktemp -d /private/tmp/arkts-s02-v3.XXXXXX)"
node scripts/semantic/semantic-facts-spike/build-bulk-hook.mjs \
  --out "$bench_tmp/typescript.cjs"
node scripts/semantic/semantic-facts-spike/run.mjs \
  --mode run --hypothesis compiler-bulk-reference-groups-v3 \
  --compiler-artifact "$bench_tmp/typescript.cjs" \
  --input tests/fixtures/semantic-facts/constructor-heritage-counterexample.json \
  --queries tests/fixtures/semantic-facts/constructor-heritage-counterexample-queries.json \
  --out "$bench_tmp/heritage"
```

第二条命令预期退出 42；详见 `$bench_tmp/heritage/report.json`。
本次原始输出在 `/private/tmp/arkts-s02-v3.5CBuzK/heritage` 和
`/private/tmp/arkts-s02-v3.5CBuzK/overloads`，为本机临时证据，不保证永久保留。

验证采用公开 CLI 先 RED 后 GREEN：stock hook 缺失先从用法错误修为
`HOOK_UNAVAILABLE`，继承别名 hook 的 exact 对照又先失败于未实现提取，
最后对每目标内部查询增加明确的 `NON_BULK` 失败门禁。
`pnpm check` 通过；semantic-facts v1/v2/v3 与 test-layer manifest 集中测试
28/28 通过，`git diff --check` 通过。本隔离切片未运行整套 `check:fast`，
不能引用此前修改前的整套检查作为当前实验的通过证据。

下一次若仍投资此路线，必须让 compiler **在一次共享工作计划中**生成
多目标分组，并用内部计数证明不再按目标重复扫描；之后再逐项跑继承、重载、
import/re-export、implementation、Settings/SDK 和资源门禁。不能仅把现有
单目标内核包进一个导出函数就进入 S03。阶段实现可暂不达 500 ms，
但 S02 精确性及批量成本门禁不可豁免。

## 后续只读源码审计：小型补丁的停止线

同一已锁定 r10 bundle 的 `findReferencedSymbols`（约 140472 行）是单光标入口；
`Core.getReferencedSymbolsForNode`（约 140818 行）每目标建立自己的 `State`
（约 141061 行）。global 分支、名称搜索和候选文本位置计算分别在约
141078、141257、141373/141447 行执行；constructor 的继承关系还会追加
搜索（约 141608/141680 行），import tracker 的 direct-import map 又可能
按 State 遍历全部文件（约 139867/140145 行）。这些行号仅定位此哈希的 bundle，
不能当作稳定上游 API。

因此，继续给 v3 wrapper 添加共享 NameTable 或词法索引，无法证明
“多目标共享一次精确 compiler 搜索”。真正的 hook 需在 fork 内先建立多个
目标 State，再按文件调度搜索 worklist，处理动态新增的 alias/heritage/import
任务，保留各目标的去重、符号关系、取消与完整范围，并计量所有次级全域遍历。
这超出安全的小补丁；**本轮不修改实验产物或生产后端**。若启动下一独立
实验，应先以多目标同名/跨模块用例和内部扫描计数 RED 固定成本合同，
再做受控的 compiler 内部 worklist 原型。现有 `NON_BULK` 与 S03 阻断不变。
