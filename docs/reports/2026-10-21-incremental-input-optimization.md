> 公开审阅副本：保留数值、方法、失败与限制；原始协议、完整响应/编辑、源码快照及归档不随本副本发布。原件和完整 SHA 清单仅在本地封存，见[证据保留说明](local-performance-evidence.md)。
> 本地完整报告 SHA256：`b136386ccdb6e8ce42f5a836a312d43ae6e617a0cc981e6dc3cf87b7e51ea916`。

# Mac 增量输入优化对照：2026-10-21

本轮已实现输入复用、组版本筛选和 import 提取工作量优化。**500ms 目标仍未完成**：
最终候选 v2 在 2 万源码下，首次编辑后引用中位数 2863.594ms、最大 2924.574ms；
重命名 3037.621 / 3159.845ms；第一次关闭重开补全有一次 510.000ms。
2048 文件首次引用已降至 387.823 / 396.491ms，重命名仍为 548.473 / 559.867ms。
最终同源码完整 `pnpm check:fast` 已通过 **1943/1943**（失败/跳过/取消均0）。
功能检查通过与500ms性能失败分开成立，ADR实现/性能验收仍IN_PROGRESS。

公开三轮数值、内存及 Program 计数见[数值证据](evidence/2026-10-21-incremental-input-public/summary.json)。

## 版本和输入

- 旧版：已合入 main 的 `740a771b868f5cf60831906fac1b5c3a4a52c163`。
- 本轮父提交：`110568e54bc1bb13d6eb891d81ef631bcf1232cc`，工作分支
  `codex/stable-program-optimization-20261019`；测量使用 dirty 源码冻结快照。
- v1 候选manifest SHA256（含源码/runtime/附带check日志）：`f837555c1f0b1210d4dc780b30272e97a7a4edcff0be64306cd0cf686a119503`。
  v2 在其上增加纯 import-regex 前缀截断，候选manifest为
  `8c4f61823603b4ba64289d9d010d6738205ba53672a3be0d9a8fa3b81e7fb8a3`。
- v2 冻结 692 项源码/测试/脚本/配置输入、75 项生产 runtime；v1 清单另含7个未被
  server.cjs 使用的测试 driver。全部 runtime SHA 见各 manifest，不以父提交冒充已提交候选。
- Mac x86_64，macOS 26.6.2 / 25G83，16GiB；Node 20.19.5，pnpm 8.15.9，
  `ohos-typescript@4.9.5-r10`，内存压力默认4096MiB。Windows 数据不混入本轮。
- SDK：本地固定声明包，1670文件完整SHA清单。
  native：本地冻结 release 侧车，SHA256
  `8e9babc3bdaaa32747e5f55df9016dc196431e2baa1250180de1f20301674016`。
- 所有规模对照及20k分项诊断仍 **degraded**，Blocker.ts 缺少
  `@ohos.filemanagement.userFileManager`（2307）。答案等价不等于完整 SDK/项目 READY。

## 实现与公开回归

| 改动 | 所有权与边界 | 已保存的真实 RED→GREEN |
|---|---|---|
| 编译器实际 snapshot 复用 | Registry 返回的真实 SourceFile/snapshot 文本完全相等才收养；弱记录不额外保留 Program，仍做当前身份和独立终检 | 两次真实 Worker GC 后未改源码重读18→0 |
| 请求身份元数据预算 | 原8192条截断改32MiB记账；仅同步phase内成功身份共享，query/final分别清空，溢出正常读取，不跨请求缓存 | 8250文件身份读取16612→16500，即每文件两次 |
| 组编译输入版本 | 事件消费、实际组compiler输入、单文件代次分离；所有已见证单文件变更仍失效，负解析/ambient/未知/溢出保守 | 无关组编辑导致A的isProgramUptoDate 1→0；真实跨根及未来依赖变更有独立反例 |
| import提取工作量 | 保持原regex及capture顺序，只去掉最后一个引号后的不可能匹配后缀；不缓存解析路径或输入资格 | 真实LSP三文件补全/定义完全相等，两个提取输入各16494→73 codeUnits |

职责文件：`typescript-compiler-inputs.ts`、`typescript-content-versions.ts`、
`observed-document-registry.ts`、`typescript-lazy-snapshots.ts`、
`request-input-validation.ts`、`import-specifiers.ts`。完整命令/父版本/失败日志见
[输入所有权](../tdd/incremental-input-ownership-20261021.md)、
[身份预算](../tdd/request-input-identity-budget-20261021.md)、
[组版本](../tdd/group-compiler-version-20261021.md)、
[晚加入依赖](../tdd/group-late-dependency-version-20261021.md)、
[import工作量](../tdd/import-specifier-work-bound-20261021.md)。

32MiB是估计metadata预算，不是RSS硬上限；8250案例没有覆盖该新预算的精确溢出边界。
冷owner/压力characterization没有证明旧C的Registry对象仍存活，不冒称该反例为GC复用证明。
现存超限源文件债务：typescript-language-service 3097→3096行，document-store 1774→1773行；
提取职责并保持其行数不增长，新手写源/测试/夹具均≤500行。

## 串行方法与前置状态

v1已完整执行36场：每版×2048/20000×普通/memory/program×3轮；468操作、234完整payload配对
均一致，没有失败样本被剔除。v2同条件重新配对也完整36场：468操作、234完整payload配对均一致，0失败/缺场/解析错误。
两批普通操作分别156次；v2新配对中旧版17次、新版10次超500，未将慢样本视为功能失败后剔除。
每轮新进程、新索引；第二轮倒转版本及规模顺序。不并行测试或服务器，不混合三种模式时延。
所有夹具由原生成器产生，与原各档plan逐文件字节一致；真实Photos与SDK保持只读。

RPC计时从request前performance.now()至完整Content-Length响应解码并await完成，不含编辑器渲染。
初始化为initialize发起前至preparation终态；spawn-to-preparation及initialize RPC另存。
“首次磁盘补全”指文件未打开且首次该请求，初始化已建Program，**不是AST冷启动**。
预检哈希读取全部夹具，OS页缓存不受控；新进程不能冒称文件系统冷。
普通模式无内部trace/heap/Program插桩和人为idle，但保留外部250ms RSS采样。

Target为`app/src/main/ets/Target.ts`，补全位置LSP(3,42)，定义/rename/references目标(3,40)。
完整输入、返回值、事件、文档版本、首次/重复、开关文件、发送顺序逐次保存。
顺序11先rename `value`→`probe`，官方返回4处编辑；客户端在RAM应用至打开文档v4，发送全文didChange。
随后12查询`probe`的4处references（含声明），13完全相同重查；局部变量原本同名probe，未被误改。
rename响应已结束才发编辑和引用，两次RPC独立；普通引用计时可能包含尚未处理完的didChange。
独立诊断测到didChange在引用前已完成，仅0.221ms，不能把rename耗时再加到引用。

“重复补全”只是顺序，不证明结果缓存。precondition.semanticCacheState记录的是请求前UNMEASURED；
普通server.log本身实际存在唯一MISS→STORE→HIT事件序列，分析器据此把操作12/13标为MISS/HIT。
这是结果缓存的事后观察，不是Program/AST状态；不能只从1.4ms耗时推断命中。
Program/AST复用与答案缓存分开计数；完整payload比较只规范化夹具前缀和opaque completion.data，
其它语义字段、数组顺序保持，未删原始响应。

## v2普通三轮完整对照

单位ms，每格为**中位数 / 最大值**，n=3；仅普通模式，初始化单列。

| 顺序 / 操作 | 2048旧版 | 2048 v2 | 20000旧版 | 20000 v2 |
|---|---:|---:|---:|---:|
| 0 初始化至准备终态 | 8251.581 / 8255.553 | 8451.461 / 8501.149 | 22725.748 / 22803.641 | 23033.464 / 23334.250 |
| 1 未打开，首次补全 | 336.121 / 342.353 | 89.968 / 90.512 | 424.598 / 705.165 | 335.361 / 340.694 |
| 2 未打开，重复补全 | 35.042 / 35.654 | 38.911 / 39.914 | 342.860 / 395.016 | 222.817 / 225.503 |
| 3 未打开，定义 | 35.906 / 36.073 | 35.135 / 35.788 | 256.351 / 257.052 | 134.592 / 139.517 |
| 4 打开后首次补全 | 34.859 / 35.235 | 35.172 / 35.473 | 134.290 / 135.594 | 127.931 / 132.707 |
| 5 打开后重复补全 | 33.751 / 34.402 | 32.833 / 32.993 | 236.997 / 237.015 | 231.652 / 235.816 |
| 6 打开后定义 | 33.154 / 33.535 | 30.347 / 33.100 | 114.303 / 118.020 | 111.340 / 112.242 |
| 7 第1次关闭重开，补全 | 351.134 / 361.383 | 112.650 / 113.973 | 424.374 / 518.135 | 404.028 / 510.000 |
| 8 第1次关闭重开，定义 | 62.002 / 62.222 | 62.164 / 68.688 | 554.058 / 606.824 | 273.934 / 286.989 |
| 9 第2次关闭重开，补全 | 323.360 / 342.501 | 90.066 / 95.795 | 413.871 / 422.206 | 173.141 / 176.958 |
| 10 第2次关闭重开，定义 | 61.402 / 63.633 | 60.975 / 61.292 | 234.544 / 579.484 | 223.698 / 225.094 |
| 11 重命名 value→probe | 536.517 / 539.882 | 548.473 / 559.867 | 6222.451 / 6339.783 | 3037.621 / 3159.845 |
| 12 应用编辑后首次引用 | 606.685 / 627.104 | 387.823 / 396.491 | 4320.534 / 7879.264 | 2863.594 / 2924.574 |
| 13 同参数重复引用 | 1.593 / 1.612 | 1.580 / 1.585 | 1.447 / 1.522 | 1.396 / 1.488 |

查询超500ms：2048旧版6/39、v2 3/39；20000旧版11/39、v2 7/39。
v2仅2048的rename三次、20k的rename/首次references各三次、重开补全一次超阈值，仍为FAIL500。
普通20k首次references逐轮：旧版7879.264 / 4320.534 / 4270.319，
v2 2924.574 / 2863.594 / 2826.757ms。所有快慢样本保留；不从单轮GC或排队猜测旧版波动原因。

## v1中间候选及首次补全回退

v1正式普通矩阵与v2重新配对的旧版样本分开，不能跨批挑选最好基线或混池。
其20k rename 5807.053→2624.815ms、首次references 7963.254→3147.600ms；
2048 rename 524.337→545.168、references 625.236→634.113ms，无改善。
20k首次补全反而417.353→717.946ms（最大725.525），新候选15/39查询超500，旧版10/39。
原Photos与历史20k7755.929/7896.150ms仅作历史背景，不加入本次同日统计。

另外独立12场20k idle控制，old/v1各3轮：

| 控制 | 旧版首次补全 med/max | v1 med/max |
|---|---:|---:|
| preparation后立即查询 | 416.107 / 430.909 | 710.112 / 714.884 |
| preparation后等待2s | 478.378 / 521.988 | 478.180 / 480.942 |

该回退对初始化后时间/状态敏感；没有GC暂停证据，不能归因GC。旧版等待后中位数反而增加。
2s位于RPC计时外但推迟用户首次操作，**不是产品优化**。156项跨版/控制payload比较一致。
v2普通首次补全中位335.361/最大340.694ms，以自己的新三轮资格报告，不用idle数据替代。

## 规模、有效输入与放大原因

| 口径 | 2048源码 | 20000源码 |
|---|---:|---:|
| app模块源码（固定） | 19 | 19 |
| 其中查询闭包 | 18，17边，深度17 | 完全相同 |
| 无app import的noise模块源码 | 2029 | 19981 |
| 夹具总文件（含配置） | 2053 | 20005 |
| 全局Program实际项目SourceFile | 2048 | 20000 |
| 全局Program SDK / 标准库 | 255 / 52 | 255 / 52 |
| 全局Program roots | 2049 | 20001 |

app18闭包24890B、Target314B、引用4处不变；Graph16384B，SHA
`7496c0efdaa12ca513c5825dd06972a86150ccd664d765a05fa6be30cab26bba`。
生成器nodes16/depth16只描述内部16节点链，不是整个查询闭包深度。
新增17952文件与目标没有import关系，但仍进入全局rename/reference Program；不能称为有效依赖增加。
全局项目文本73842→504690 codeUnits，SDK10741499、标准库430409固定。

v1独立program三轮均实际createProgram7次/轮：初始化app19、noise N-19、额外全局N各一次；
两次重开补全各一次app19；rename与编辑后首次引用各一次全局N。首次补全本身没有新build。
v2独立program实测84条返回记录，12场每场同样7次、各阶段输入数均与上表一致。
因此v2没有减少全局Program输入范围或构建次数；parser次数另由单次详细诊断测量。

v2从2048→20000：首次引用中位增长约7.38倍，rename约5.54倍，首次补全约3.73倍，
未打开定义约3.83倍，初始化约2.73倍；全项目规模成本仍明显。
代码依据：`type-engine.retainedReferences/rename`与`typescript-resident-reference-state.inputsFor/covers`
仍要求完整目录范围；官方LanguageService的getProgram同步全局输入版本；观察/准入与独立终检遍历实际输入。
组clock筛选只减少有证明的无关编辑对组的同步，不把全局root Program变成app Program。
这里只控制无关文件增长两个点，未控制有效依赖扇出/深度、共享依赖增长和单模块20k；
不能据此宣称O(N)、O(N log N)或O(N²)。保留具体循环与测得计数作为后续复杂度分析依据。
源码夹具均为.ts；真实.ets大型项目及更大源码体量不能由该小型字面量文件夹具代表。

## 独立20k首次引用诊断（各版一次）

普通中位数2864ms与下表插桩4428ms不可混池，也不能把下表占比直接套到普通时延。
以下互不重叠，加总到客户端总时延；build、observe/admit、identity子区间不得再次相加。
实际产品调用链（行号取本候选；完整映射另存phase-call-chain.md）：

- 工作区：`document-store.prepareFromCurrent → collectDependencyClosure → resolveRelativeImports`。
- Program：`typescript-reference-query.ts:44 getProgram` → 固定fork的
  `getProgram:124527 → synchronizeHostData:124351 → createProgram:107890`；不能把它称为全文件parse。
- 驻留捕获：`typescript-language-service.ts:1330` → `typescript-resident-reference-state.ts:72`，
  其`observe:130 / admitInputs:199 / diskInputsCurrent:227`负责输入/范围资格。
- trace统计：`compiler-query-timing.ts:110 → type-engine.ts:303 → typescript-language-service.ts:358`
  → `typescript-program-stats.ts:34`，50/73行有SourceFile及root遍历，仅trace启用。
- 终检：`request-input-validation.ts:58`真实循环调用登记的validator，主要来自
  `typescript-lazy-snapshots.ts:125/127/129`及`typescript-resident-reference-state.ts:221/227`。
  query其余/callback其余是差分区间，未测余量没有单一产品函数，不能猜作排队或GC。

| 阶段 | old ms | v2 ms | v2占比 |
|---|---:|---:|---:|
| 工作区/依赖准备 | 531.118 | 22.742 | 0.51% |
| LS输入准备 | 135.320 | 152.758 | 3.45% |
| 首次getProgram（含build/观察） | 8004.042 | 2202.364 | 49.74% |
| 引用查询其余 | 172.395 | 143.374 | 3.24% |
| 驻留捕获（含observe/admit） | 1895.770 | 314.505 | 7.10% |
| trace Program统计 | 374.878 | 397.380 | 8.97% |
| compiler回调其余/工作区围栏 | 23.707 | 24.863 | 0.56% |
| 独立最终输入union | 1152.845 | 1150.001 | 25.97% |
| 未测余量/封装/传输/探针开销 | 22.550 | 19.993 | 0.45% |
| 总计 | 12312.626 | 4427.981 | 100% |

每版1次createProgram；build7951.216→2148.898ms含于首次getProgram。
v2 build内diskIdentity项目1255.270、SDK23.210、标准库5.752ms，合1284.231ms（59.76%）。
这些是同一同步非递归API的互斥调用，余下864.667ms只可称未归因补集，不能叫纯编译器计算。
其中fs realpath.native 750.933、lstat216.263、stat145.732ms嵌在identity内，不能再相加。
Recorder未记录leaf self，build.raw.selfMs没有扣leaf，均不能冒充CPU独占；细表见build-inner-evidence.md。
实际输入20000项目+255SDK+52lib；SourceFile身份复用19999/255/52。
实际Parser入口只有编辑的Target×1，SDK为测得0；**更新Program不等于重新解析2万文件**。
闭包resolveRelativeImports两版18次、17次实际路径解析，其嵌套耗时508.969→4.540ms。
该闭包固定18文件，不把改善或旧248–522ms全部说成对项目N的扫描。

| 实际调用 | old | v2 |
|---|---:|---:|
| build内项目readDiskSource | 19616 | 0 |
| 请求项目openSync / readSync | 19871 / 39742 | 255 / 510 |
| 请求项目实际读取字节 | 501304 | 30520 |
| owned-snapshot-collected | 19616 | 0 |
| 项目diskIdentity / unique | 83077 / 19999 | 39998 / 19999 |
| SDK diskIdentity / unique | 1020 / 255 | 510 / 255 |

v2查询phase是19616 build+383 observe，独立final是19616 snapshot+383 observation，
各19999磁盘项目输入；Target由overlay提供。没有以缓存命中替代当前及最终证明。
Program范围、构建次数和两轮N级输入核验仍保留；本轮收益来自消除重复文本读取、同phase
重复身份、无关组版本同步及固定闭包regex冗余，尚未解决完整跨组搜索。
未测：compiler更细子阶段、OS IO等待、native内部、精确GC暂停、未hook解析帮助函数、
增量子节点复用、leaf异常完整计数。trace统计397ms只属于插桩模式。

## 内存与资源

v2独立memory12场均完整结束，156操作功能校验通过，无采样错误、OOM或压力停测。
其时延不与普通结果混合。下表各格为MiB中位数/最大值，n明确标出有阶段样本的轮数。
RSS每个PID一次；Worker与server同Node PID，无独立Node子进程，native独立，isolate heap不加到RSS。
250ms采样峰值为下界；操作后为1s观察窗末样本，初始化/最后空闲各2s。
短操作零样本标未测；不同角色峰值不相加冒充同刻树峰值。

| 源码数/版本 | 阶段 | 树RSS med/max | Node含Worker | native索引 |
|---|---|---:|---:|---:|
| 2048 旧版 | 初始化峰值（n=3/3） | 665.098/666.027 | 651.543/652.719 | 13.309/13.555 |
| 2048 旧版 | 初始化后空闲末值（n=3/3） | 674.406/676.605 | 661.098/663.051 | 13.309/13.555 |
| 2048 旧版 | 首次补全期间峰值（n=3/3） | 675.484/677.590 | 662.176/664.035 | 13.309/13.555 |
| 2048 旧版 | rename期间峰值（n=3/3） | 656.844/656.961 | 643.289/643.652 | 13.309/13.555 |
| 2048 旧版 | 首次引用期间峰值（n=3/3） | 666.320/669.145 | 653.137/655.590 | 13.309/13.555 |
| 2048 旧版 | 首次引用后末值（n=3/3） | 671.297/671.656 | 657.988/658.102 | 13.309/13.555 |
| 2048 旧版 | 最后空闲末值（n=3/3） | 671.480/671.688 | 658.133/658.172 | 13.309/13.555 |
| 2048 旧版 | 全程采样峰值（n=3/3） | 675.484/677.727 | 662.176/664.172 | 13.309/13.555 |
| 2048 v2 | 初始化峰值（n=3/3） | 667.152/670.203 | 653.969/657.078 | 13.180/13.184 |
| 2048 v2 | 初始化后空闲末值（n=3/3） | 668.633/669.496 | 655.453/656.371 | 13.180/13.184 |
| 2048 v2 | 首次补全期间峰值（n=0/3） | 未测 | 未测 | 未测 |
| 2048 v2 | rename期间峰值（n=3/3） | 664.188/667.324 | 651.004/654.199 | 13.180/13.184 |
| 2048 v2 | 首次引用期间峰值（n=3/3） | 667.613/670.004 | 654.434/656.879 | 13.180/13.184 |
| 2048 v2 | 首次引用后末值（n=3/3） | 672.504/674.906 | 659.324/661.781 | 13.180/13.184 |
| 2048 v2 | 最后空闲末值（n=3/3） | 672.523/674.996 | 659.344/661.871 | 13.180/13.184 |
| 2048 v2 | 全程采样峰值（n=3/3） | 672.852/675.148 | 659.672/662.023 | 13.180/13.184 |
| 20000 旧版 | 初始化峰值（n=3/3） | 913.777/917.711 | 867.633/871.410 | 67.395/67.484 |
| 20000 旧版 | 初始化后空闲末值（n=3/3） | 832.707/834.602 | 786.562/789.137 | 46.145/46.301 |
| 20000 旧版 | 首次补全期间峰值（n=3/3） | 826.355/827.211 | 780.891/780.910 | 46.145/46.301 |
| 20000 旧版 | rename期间峰值（n=3/3） | 918.375/920.859 | 872.910/874.559 | 46.145/46.301 |
| 20000 旧版 | 首次引用期间峰值（n=3/3） | 991.430/993.012 | 945.965/946.711 | 46.141/46.301 |
| 20000 旧版 | 首次引用后末值（n=3/3） | 997.449/1000.098 | 951.984/953.797 | 46.141/46.301 |
| 20000 旧版 | 最后空闲末值（n=3/3） | 991.855/997.078 | 945.715/951.613 | 46.141/46.301 |
| 20000 旧版 | 全程采样峰值（n=3/3） | 997.480/1000.117 | 952.016/953.816 | 67.395/67.484 |
| 20000 v2 | 初始化峰值（n=3/3） | 935.480/955.301 | 890.641/909.098 | 67.047/67.461 |
| 20000 v2 | 初始化后空闲末值（n=3/3） | 854.895/856.199 | 808.617/811.359 | 46.203/46.277 |
| 20000 v2 | 首次补全期间峰值（n=1/3） | 874.582/874.582 | 829.742/829.742 | 44.840/44.840 |
| 20000 v2 | rename期间峰值（n=3/3） | 939.957/944.820 | 895.117/898.543 | 46.203/46.277 |
| 20000 v2 | 首次引用期间峰值（n=3/3） | 1022.047/1025.441 | 977.207/979.164 | 46.203/46.277 |
| 20000 v2 | 首次引用后末值（n=3/3） | 1031.441/1036.254 | 986.602/989.977 | 46.203/46.277 |
| 20000 v2 | 最后空闲末值（n=3/3） | 1032.160/1037.215 | 987.320/990.938 | 46.203/46.277 |
| 20000 v2 | 全程采样峰值（n=3/3） | 1032.160/1037.215 | 987.320/990.938 | 67.047/67.461 |

20k全程树峰值中位997.480→1032.160MiB，增加34.680MiB（约3.48%）；最终空闲991.855→1032.160MiB。
当前工作流**未证明降低常驻或峰值内存**。不从RSS差额推断具体metadata/GC归因。
v2规模2048→20k全程树峰值672.852→1032.160MiB（约1.53倍），只是本夹具工作流，非一般内存复杂度。
重复引用三轮均无during样本；2048 v2首次补全三轮无样本，20k v2仅一轮有样本，不能冒称三轮峰值。
逐轮during/after、所有13操作、isolate heap/external/arrayBuffers及缺测表见`review/memory-v2-summary.json`。
Worker最终空闲heapUsed中位：2048 v2 527.666MiB，20k v2 828.983MiB；不加进RSS。

v1中间证据：20k全程树峰值988.355/988.793→1009.234/1011.316MiB，2048为
679.641/681.152→678.211/680.121MiB；与v2新配对分开，不跨批混池。

## 最终检查与证据资格

前三次全check失败不删除：1为collector退出2后主动终止（期间曾改docs，原失败归因未证实）；
2为ENOSPC，源码/全部repo输入不变；3完整1942项，1941通过、仅test inventory硬编码失败。
第三次之后修复清单230→231，再新增import用例更新232/bundle112，完整清单4/4通过；
types/build及公开import回归通过。**这些不能替代最终完整check:fast**。
v2冻结所附`final-check-fast.log`正是保留的第三次失败日志，不是PASS收据。
第四次完整运行已结束：Node20.19.5/pnpm8.15.9，exit0，1943/1943、fail/cancelled/skipped/todo均0。
总耗时3056.225s；2026-10-20 20:07:15Z至20:58:13Z（Mac本地10月21日）。
源码692项、所有仓库输入前后不变，生产runtime75项前后均与实测v2匹配；额外7个测试driver不计生产输入。
完整日志SHA256：`78019639e431abf47d6c0ecb8bb1fb914fe985429e7913804ecde6e37a3919a2`。
纯source映射SHA256（排序JSON无空白）：`43445f1a8ed7759ad707ab1fe1d85af414c90c927557b22c0cc2046f96ce1f69`。
原始收据为`check-fast-status.json`；v2新增`qualification.json`、`qualified-check-fast.log`、`qualified-check-fast-status.json`，
与冻结时附带的失败日志分别保存，不修改原manifest或冻结工具。资格只为功能检查PASS，性能500ms仍FAIL。
本报告及TDD的收尾文字在检查结束后更新；检查时的7份原始文档快照和SHA保存在fullcheck-input-docs/。
产品源码、测试、脚本、配置及生产runtime未在收尾时改变。

为ENOSPC恢复空间仅对已关闭SQLite索引做HFS透明压缩：路径、内容SHA/长度/mtime/mode
逐项前后核验保留，ledger记录；没有删除旧原始响应、报告、SDK或封存数据。

## 遗留与下一优先级

1. 全局root Program与N级当前/独立最终核验仍是主要规模成本，500ms失败。
   下一片应建立有独立member范围资格的官方app Program搜索及严格排除证明；直接拼位置并集
   或复用constructor特例不符合ADR0005。现有manifest反向边/索引/anchor不足以证明完整跨组范围。
   即使Program降至19，在当前强新鲜度约束下39998身份核验也可能保留，收益必须分开测量。
   严格literal排除只适合作为独立证明机制的受限实验，不能充当一般大型项目方案或500ms答案；
   一般跨组搜索仍缺实际解析反向边、ambient覆盖及其当前输入代次的完整资格。
2. 对纯规范化路径/不可变成员集合/确切Program结构的重复统计，可先做保行为复用；
   不缓存disk-current结论，不省独立终检，不把watcher当必达。各候选收益尚未实测。
   现有negative directory/枚举栈API不向query/final导出完整祖先namespace和实际basename证明，
   不能直接改成dirname canonical缓存；中间祖先ABA、hardlink、case/Unicode、alias等仍需先有反例。
3. 根READY消费者、rename完整语义、一般跨组引用覆盖、共享依赖/单模块20k、长期压力未闭环。
4. 既有正确性缺口：272项目根/SourceFile、256 raw窗外的ZGlobals.d.ts未通知等长编辑
   发生等长成员重命名后仍可成功返回旧补全；冻结主分支和候选都独立复现、均READY。
   本轮未修复，不能用本次degraded/固定目标结果宣称所有输入资格已解决。

## 原始数据与复现

下列路径仅描述本地封存布局，不是公开可下载数据；完整逐轮原始响应、编辑及实际命令与SHA清单保留本地，不覆盖旧运行。

- v2：`.bench/optimization-20261021/performance-v2/setup.json`、`plan-{2048,20000}.json`、
  `matrix-*-index.json`（逐次实际command/exit）、`runs/*/{report.json,responses.ndjson,document-events.ndjson,rss.ndjson}`。
- v2脚本：`performance-v2/{freeze.py,run-matrix.py,session.mjs,analyze.py}`；冻结清单和
  `REPRODUCE.md`记载准备时pending，最终资格另加收据，不改其已固定字节。
- v1完整36场及统计：`performance/analysis/{statistics,operations,runs,program-counts,comparisons,summary}.json/csv`；
  中间完整表为`review/report-evidence-draft.md`，不得当作v2最终结果。
- idle：`cold-start-diagnostic/`、`review/idle-control-summary.json`。
- 分项：`reference-diagnostic/RESULTS.md`、`analysis/summary.json`、`analysis/aggregate.py`与runs内实际探针；
  输入manifest SHA `cc26c4da87426921a4d8665aea590232b06eae022f412f967b3895794abd9dd9`。
- 检查：`check-fast.log`、`check-fast-status.json`及三份attempt失败日志；v2最终资格见`performance-v2/qualification.json`。
- 细化/审查：`review/{build-inner-evidence,canonical-directory-reuse,scope-next-slice,final-source-review,report-final-review}.md`。
- 公开RED/GREEN：`snapshot-ownership/`、`request-identity/`、`group-version/`、`import-specifiers/`。
- 已知ambient反例：`ambient-proof/`，冻结旧/新日志、精确响应、脚本和输入清单均保留。

完整复现命令仅在本地封存，见证据保留说明。

原执行入口仅在本地完整报告中提供；完成目录/索引拒绝覆盖，重测须先克隆工具至新目录并建立新隔离
夹具/冻结清单，再按原操作序列执行。精确命令另在matrix index，不向旧封存目录重跑。
SDK/native及20261020 transport/observer依赖需同时保留；本地manifest保留
raw-evidence.tar.gz的SHA、成员数/内容清单、原始命令、资格与排除的可重建索引。
这些原件不随公开副本发布，见[封存说明](local-performance-evidence.md)；
本地复核须核验原manifest，禁止覆盖原运行目录。
