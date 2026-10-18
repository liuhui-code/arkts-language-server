# OP00：SDK AST 缓存后的 9.8s 引用耗时归因

日期：2026-10-18。父修订：`a111235bc4bfcb55b126752f95b3ba095f2996af`。

维护者明确要求：**每次完整引用响应必须在 500ms 以内**。20s 只是旧测试的防挂死超时，不能作为性能验收标准。本轮实测 **500ms FAIL**；原始 Location 正确性通过不等于时延通过。本要求不采用旧计划中 550ms 的宽限，也不能用缓存命中或四次请求的平均值代替未缓存请求。

## 测量边界和复现

原来的 9,838.246ms 是整个测试用例，未保存它当次的内部 profile，不能事后伪造该次的精确占比。本轮用同一生产产物重新执行原始公开 LSP 测试，通过真实子进程和 Content-Length stdio；原测试源码、403 文件、完整 SDK、四个 Location 集合断言及四个 20,000ms 防挂死超时全部不变。

Node 为 `v20.19.5`。三个仅在父进程记录收发时间的样本依次运行，没有并发运行整套测试、强制 GC 或 CPU profiler：

| 样本 | 整个用例 | 首次查询，排除声明 | 同参数缓存命中 | 改为包含声明 | 同参数缓存命中 |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline-1 | 9,756.18ms | 6,008.47ms | 1.59ms | 3,504.72ms | 1.28ms |
| baseline-2 | 9,848.71ms | 5,862.49ms | 1.74ms | 3,729.74ms | 1.43ms |
| baseline-3 | 9,814.12ms | 6,005.72ms | 1.62ms | 3,555.27ms | 1.50ms |

完整响应按父进程发出请求到收到完整响应帧计时。首次查询约为 500ms 预算的 **11.7–12.0 倍**，改声明策略后的未缓存查询约为 **7.0–7.5 倍**。

原始用例命令仍可复现慢路径：

```sh
node --test --test-concurrency=1 \
  --test-name-pattern='finds unopened rewritten struct references' \
  tests/semantic/references-completeness.test.mjs
```

另设实际时延预算断言，读取上述三份真实公开请求记录，逐次断言 `durationMs <= 500`。命令和父修订已记录；结果为 **6 次未缓存请求超标，exit 1**，不是超时或正确性失败：

```sh
node .bench/op00-post-sdk-attribution-v1/check-budget.mjs
```

## 第一层：接近 9.8s 的完整用例分布

`trace-1` 使用现有阶段计时，整个用例 **9,903.944ms**。14 个引用批次均有完整收据。下表属于这同一次运行，阶段互不重复计数，总和等于完整用例：

| 阶段 | 耗时 | 占完整用例 |
| --- | ---: | ---: |
| 14 批 Program 就绪 | 8,358.68ms | 84.40% |
| verifier 启动及批次派发 | 315.49ms | 3.19% |
| 外层 semantic Worker 准入与启动 | 317.12ms | 3.20% |
| 工作区文件准备，3 次 | 137.47ms | 1.39% |
| 每批 host 准备，14 次 | 23.17ms | 0.23% |
| 实际引用查询，14 次 | 97.76ms | 0.99% |
| 批内其余工作：核验、统计、释放及通信等 | 335.72ms | 3.39% |
| initialize、fixture 创建/清理、缓存命中及其余批外工作 | 318.53ms | 3.22% |
| **合计** | **9,903.94ms** | **100%（舍入误差）** |

批内其余工作由批次总时间减去已计时阶段得到，不把残差冒充某一个函数的净成本。外层启动使用准入到发出命令的实测窗口，包含当时的启动/等待。verifier 启动与派发包含首次约 302.66ms 冷启动，以及后续复用 Worker 的派发；物理 verifier 只有一个。

两次重查询各 7 批，其 Program 就绪分别累计 **5,024.41ms / 3,334.27ms**。诊断安静期等待合计 **0.51ms**，合并结果 **0.16ms**，均不是主要来源。

## 第二层：Program 就绪究竟做了什么

为观察真实编译器内部函数，私有 preload 对**当前固定的** bundled 编译器函数做计时包装，原函数体和结果不变。包装分别记录 inclusive/exclusive 时间，并标记 host/program/query/fence/dispose 边界；下表使用同一个 `program-ready` 边界内的 exclusive 时间，避免把解析、绑定、文件读取叠加到包含它们的 createProgram 时间上。

这是独立的 `sections-final` 诊断样本：整个用例 **10,297.42ms**，Program 就绪 **8,543.01ms**。探针样本比正常样本约高 5%；不把它的各项时间直接拼成之前那次 9,838.246ms。

| Program 就绪内部 | 耗时 | 占 Program 就绪 |
| --- | ---: | ---: |
| SDK 相对 import 解析、候选路径探测和边界/身份核验 | 4,805.20ms | 56.25% |
| SDK 第一次解析，255 个文件各一次 | 1,162.31ms | 13.61% |
| 重新读取 SDK 文本、取得缓存 SourceFile | 884.94ms | 10.36% |
| 标准库反复读取、解析、绑定，52 文件 × 14 批 | 768.02ms | 8.99% |
| SDK 绑定调用 | 192.29ms | 2.25% |
| 工程文件取得、解析和绑定 | 117.56ms | 1.38% |
| TypeChecker 初始化其余部分 | 46.57ms | 0.55% |
| Program 组织与 host 同步其余部分 | 497.10ms | 5.82% |
| 就绪统计及未单独包装的就绪工作 | 69.03ms | 0.81% |
| **合计** | **8,543.01ms** | **100%（舍入误差）** |

SDK 绑定的 192.29ms 中，第一批 **189.92ms**，后面 13 批合计仅 **2.38ms**。当前复用 AST 已保留 SDK 绑定可达状态，后续 binder 对已有 locals 主要是快速返回。**不能再把剩余几秒笼统称为“每批重复绑定 SDK”或“重新创建 Checker”。** 新 Checker 的创建次数确实是 14，但其包含的 SDK 绑定并没有重复付出完整成本。

`service.getProgram()` 内部的 `synchronizeHostData()` 已调用 `program.getTypeChecker()`。因此现有 trace 后置测得的 `workerGetTypeCheckerMs ≈ 0` 只表示第二次 getter 很快，不能拿它证明首次 Checker 初始化免费。本轮直接计时真实 `createTypeChecker` 和 `bindSourceFile` 入口解决这个歧义。

该样本的 verifier 工作窗口累计 8,987.08ms，当前线程 CPU 累计 8,871.28ms，约 **98.71%**。不是数秒的空闲排队或等待诊断；同步文件系统路径核验本身就是活动线程上的工作。

## 最大热点的具体调用链

```text
每批新建 LanguageService / Program
  → processImportedModules / resolveModuleNames
    → TypeScriptLanguageServiceEngine.resolveModule
      → relativeModuleCandidate
        → witnessedFileExists
          → LoadedConfigurationWitness.observe
            → lookupIdentity（lookup 前、后各一次）
              → lstat / realpathSync.native / stat
```

对应责任分别位于：

- `src/core/types/typescript-language-service.ts` 的 `resolveModule`。
- `src/core/types/typescript-relative-module-candidate.ts` 的扩展名与 index 候选次序。
- `src/core/types/typescript-resolution-witness.ts` 的 `witnessedFileExists`。
- `src/project/loaded-configuration-witness.ts` 的 `observe`、`lookupIdentity`。
- `src/semantic/backends/ohos-typescript/sdk-registry-cache.ts` 负责 AST 复用；它没有复用整个 Program 的模块解析结果。

独立的高频观察 `detailed-final`（11,424.80ms，额外探针开销更高，只用于核对调用次数/调用链）实测：

| 同一组 SDK 在 14 批中的操作 | 次数 |
| --- | ---: |
| SDK 相对模块解析 | 5,754 = 411 × 14 |
| SDK 文件候选存在性探测 | 28,770 = 2,055 × 14 |
| SDK `lstatSync` | 155,736 |
| SDK `realpathSync.native` | 67,200 |
| SDK `statSync` | 88,746 |
| SDK 三种路径系统调用合计 | **311,682** |

即使路径相同、AST 已存在，每批新 Program 仍重新处理同一组 SDK import，并重新证明其输入。每批约 411 个相对 import、平均 5 个候选探测，又放大成真实文件路径与前后身份核验。CPU profile 独立确认 `realpath → lookupIdentity → observe → witnessedFileExists → relativeModuleCandidate` 为主要调用链；profiler 自身启动/停止开销不计为正常产品时延证据。

标准库也有独立的重复成本：52 个 `lib.*.d.ts` 各真实解析 14 次，共 **728 次**，因为当前缓存只 pin SDK 文件。SDK 255 文件则确实只解析 255 次，没有退回重复 SDK 解析。

## 为什么是 14 批，以及索引退化的环境原因

两个不同声明策略分别 miss 结果缓存；缓存 key 明确包含 `includeDeclaration`。每个查询完整扫描 403 文件，分成 7 批，共 14 批；每批都有同一组 255 SDK 声明和 52 标准库。两组查询的前 6 批均没有命中位置，最后一批分别得到 2/3 个位置。

原慢样本及本轮默认样本都记录 `workspace index is not open`，最终索引状态为 `degraded`。仅凭这个日志不能断言“后台索引稍后就能解决”。私有失败观察保留了 Rust sidecar 的真实响应：

```text
failed to create index cache directory: Operation not permitted (os error 1)
```

它在受限环境中无法创建默认 `~/Library/Caches/arkts-language-server/index` 下的工作区缓存子目录，索引初始化失败。日志位于 `index-error-complete.index-errors.jsonl`，原 sidecar 响应不被替换或吞掉。

单变量对照仅把 `ARKTS_INDEX_CACHE_DIR` 指向仓库内可写的私有目录。同一测试/生产产物中，索引成功 **ready、403/403 indexed**；首次请求仍在索引打开前进入完整扫描，第二次包含声明查询则因隔离锚点得到 **0 个定义**，记录 `definition-count` 后再次完整回退。共 **14 个引用批次 + 1 个额外锚点作业**，整个用例 **10,599.96ms**，两个重查询 **6,144.52ms / 4,189.85ms**，全部原始 Location 断言通过。

因此目录权限确实解释默认索引退化，**修正目录权限并未消除该用例的完整回退，也未达到 500ms**。不能把这个对照冒充优化收益，或把默认退化样本包装成已 ready 工程的产品 P95。

## 结论与 500ms 的实际缺口

1. SDK AST 复用解决了重复解析，剩余最大热点是每个 Program 重新处理 SDK 相对 import，并重复执行路径/身份核验。
2. 相同 SDK 的重新读取、52 个标准库重复解析，以及两套声明策略的 7+7 批完整扫描，继续放大成本。
3. 诊断等待、结果合并、后续 SDK 完整绑定均不是当前主要来源。
4. **当前实现未满足每次完整引用响应 ≤500ms。** 即使单独消除约 4.8s 的 SDK import 路径工作，首次 SDK 解析仍约 1.16s，且其他准备成本还在，不能据此承诺 500ms 已有解。下一实现必须检验首次请求前的准备边界及完整回退的重复工作，不能只继续优化引用查询本身的约 100ms。

本轮只做诊断和文档，不修改生产代码、公共测试、库文件、超时或 Location 断言。测量前、后及索引对照后的 **690 个代码/输入文件、82 个运行时产物、SDK 声明摘要和编译器身份** 全部相同，并与上轮完整 `check:fast` 1,869/1,869 PASS 的输入逐一相同。该旧全量结果仍是代码回归证据；本轮没有重跑全量，也没有授予 500ms 性能通过。

原始证据：`.bench/op00-post-sdk-attribution-v1/`。`summary.json` 由 `analyze.py` 从原始收发帧、阶段/系统调用记录重算，并绑定输入与原始生产器快照/hash；500ms 失败命令输出为 `500ms-red.log`。早期高频探针、profile 与对照运行均独立保留，未把不同样本拼成同一条时间线。
