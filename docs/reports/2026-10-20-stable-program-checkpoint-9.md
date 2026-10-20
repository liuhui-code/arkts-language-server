> Public review copy: raw source, full edits, protocol transcripts and archives remain in the original local workspace. Raw-evidence links point to the retention notice.

# Mac Photos 稳定 Program 优化对照：checkpoint-9

日期：2026-10-20（Asia/Shanghai）。结论：**同一 Photos 目标的三轮正常计时中，
首次改名后引用中位数7676→439ms；新版仍有一次524ms，完整500ms验收未通过。**
六个独立进程共78/78操作通过预设断言，旧版15/39、新版1/39超过500ms。尚未覆盖
随机七文件、递增规模、压力恢复及完整fast，不能推广为整个项目已经达标。

## 固定输入与执行

- 旧版：`3add697043380612efe71cef074e5de292422fe2`冻结的83个runtime/native文件。
- 新版：相同父版本上的未提交checkpoint-9，冻结82个runtime、664个源文件/
  测试/配置及source.patch；完整身份见`.bench/stable-program-v1/checkpoints/checkpoint-9/manifest.json`。
  不使用父提交号冒充新源码版本，逐run记录sourceManifestSha256和producerSha256。
- 两侧使用同一冻结native sidecar、Node20.19.5、4GiB默认压力、正常baseline模式，
  清除额外ARKTS_/OP00_/NODE_OPTIONS；没有打开parser/trace探针。
- 同一Mac：macOS26.6.2 /25G83、Intel i7-9750H、12逻辑核、16GiB；SDK固定为
  本机HarmonyOS6.1.1.125/API24副本，1670文件逐项与原manifest一致。
- 仓库外隔离夹具`detached-photos-noise-0`：Photos源提交a2c993829c46d965abefc5d2143187fa54fa4604，
  289源码文件，实际引用Program项目成员284。所有操作只编辑overlay，源文件前后哈希一致。
- 各三次新进程、空应用缓存、请求串行；顺序旧/新、新/旧、旧/新；OS缓存和桌面负载不受控。
  250ms外部ps只读采样整个服务进程树，Node Worker不重复计PID RSS，六轮均无采样错误。
- 初始化terminal均为真实degraded2307：`AlbumDefine.ts`缺少
  `@ohos.filemanagement.userFileManager`。terminal不是READY；两侧未修SDK或隐藏缺失输入。

## 正常模式完整响应

断言范围：补全包含指定成员，定义包含指定文件/声明行，rename编辑数量及实际
应用，引用与四处预期Locations逐项相等；未穷举补全/定义列表的完整性。

表内为中位数，单位ms。重复重开每轮两次，共六个样本；其他项每侧三个样本。

| 操作 | 旧版 | checkpoint-9 | 新版范围 |
| --- | ---: | ---: | ---: |
| 未打开文件首次补全 | 445.3 | 236.7 | 235.6–244.5 |
| 未打开文件重复补全 | 109.5 | 64.8 | 64.1–66.7 |
| 未打开文件定义 | 63.3 | 63.1 | 63.1–64.2 |
| 首次打开补全 | 255.7 | 66.7 | 65.2–67.5 |
| 打开后重复补全 | 184.0 | 61.6 | 60.7–61.7 |
| 打开后定义 | 56.5 | 138.5 | 136.5–138.5 |
| 关闭重开补全 | 1458.6 | 260.4 | 251.7–291.6 |
| 关闭重开定义 | 1209.6 | 165.3 | 130.2–215.4 |
| rename | 207.9 | 299.3 | 288.3–407.3 |
| 改名后首次引用 | 7676.5 | 439.3 | 433.1–524.2 |
| 改名后重复引用 | 1.5 | 1.8 | 1.5–2.2 |

打开后定义和rename有回归，保留原始数据；不能只报告引用收益。初始化中位数
9204.6→9305.5ms，单列且不用于豁免普通查询。差值是整个累计候选与旧版的
对照，不能归为本片retained-first路由一项的独占收益。

进程树采样RSS峰值三轮分别：旧版1193680896 /1178042368 /1172484096字节；
新版775221248 /787161088 /796008448字节。中位数约下降33.2%。这是此工作流
的采样峰值，包含初始化；不是精确分配峰值、SDK独占内存、PSS或大型项目资源资格。
更早pilot的ps被沙箱阻止，RSS仍为UNMEASURED，未回填本次数据。

## 仍慢的一次操作

新版trial1，第12步，`textDocument/references`，524.187ms：

- 文件：`feature/browser/src/main/ets/default/view/photo/PhotoBrowserActionBar.ets`。
- UTF-16零基位置`57:12`，符号`visibilityQQ`，源码行`this.visibilityQQ = this.isShowBar;`。
- 前11步依次为disk补全两次、disk定义、打开补全两次、打开定义、两轮关闭重开
  补全/定义、rename `isVisibility→visibilityQQ`。服务端WorkspaceEdit应用为overlay v4。
- 此次是改名后首次引用、includeDeclaration=true，返回完整4处；此前打开三次、
  关闭两次，初始化degraded，查询缓存是否命中未作内部测量。
- 当次baseline没有阶段探针，其524ms内部组成**未测**；下节是独立trace运行，
  不能把其阶段值冒充这次慢样本的组成。

## 独立trace观测

单独新进程trace-attribution-1，不纳入正常统计。第12步完整响应439.649ms：

| 观测 | 实测 |
| --- | ---: |
| references Worker请求 | 1 |
| 候选选择 / verifier batch | 0 /0 |
| 文档准备 | 130.202ms |
| 其中dependency-closure | 124.412ms（cacheHit=false） |
| 其中membership /preload | 0.029 /5.373ms |
| 编译查询 | 247.198ms |
| 其中createProgram计时记录 | 70.331ms |
| 其中findReferences | 11.864ms |
| Program项目 /SDK /其他源文件 | 284 /305 /52 |
| 本次首次观察的项目 /SDK SourceFile | 1 /0 |
| 本次再次观察到的项目 /SDK SourceFile | 283 /305 |

表中阶段嵌套，不相加为互斥占比。createProgramEvents=1是聚合计时记录数，
不是已验证的实际构建调用次数；实际parse/scan调用数、原生syscall、类型实例化、
终检细分与本次GC均未测。SourceFile复用数也不是parser调用计数。

现有证据支持：新路由在这次操作中避开候选与anchor准备，保留SDK和未变项目
SourceFile；依赖准备与编译查询仍占主要已测墙钟。下一步沿这些实际路径验证
输入和依赖结果复用，不能把剩余时间直接归为重复解析或SDK解析。

## 证据与复现

[逐次78操作](local-performance-evidence.md)、
[机器可读汇总](local-performance-evidence.md)、
[原始记录与复现说明](local-performance-evidence.md)。
公开协议RED/GREEN及剩余范围见[实施记录](../tdd/stable-program-optimization.md)。
未修改真实Photos、未推送或发布，目标继续进行。
