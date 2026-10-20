> Public review copy: raw source, full edits, protocol transcripts and archives remain in the original local workspace. Raw-evidence links point to the retention notice.

# Mac Photos 稳定 Program 对照：checkpoint-14

2026-10-20（Asia/Shanghai）。本次三对独立进程的78次操作均通过预设功能断言，
但新版三次改名后首次引用均超过500ms：537.217 /528.374 /555.637ms。
旧版15/39、新版3/39超时延目标，**500ms验收仍失败**。SDK热态事实复用已通过
公开测试，尚未消除这个真实工作流首次查询的重复读取，不能据此宣称优化完成。

## 输入和测量边界

- 旧版为父提交`3add697043380612efe71cef074e5de292422fe2`冻结的83个runtime/native输入。
- 新版为同父提交上的未提交checkpoint-14：冻结82个runtime、666个源码/测试/
  配置输入及source.patch；每轮记录manifest SHA，未用父提交冒充新代码版本。
- 同一Mac、Node20.19.5、同一冻结native、同一HarmonyOS6.1.1.125/API24 SDK副本。
  软件/硬件背景沿用原Mac环境记录；本轮未重新获取CPU/内存硬件信息。
- 相同仓库外夹具`detached-photos-noise-0`：289个源码文件、实际Program项目成员284。
  Photos来源a2c993829c46d965abefc5d2143187fa54fa4604，真实项目源文件未编辑。
- 各三轮新进程、空应用缓存，顺序旧/新、新/旧、旧/新，操作串行；正常计时期间
  无并行构建/测试。清除额外ARKTS_/OP00_/NODE_OPTIONS，默认4GiB压力设置。
- 六轮初始化均为真实degraded2307：缺少`@ohos.filemanagement.userFileManager`。
  没有修SDK或把terminal当READY；OS缓存和桌面负载不受控。
- 外部250ms只读进程树RSS采样，PID只计一次，六轮无采样错误。采样峰值不是
  精确分配峰值、PSS、SDK独占内存或所有规模的内存资格。
- 前后核验SDK1670文件、真实Photos574文件、夹具577输入、旧版83输入及新版
  runtime82/源码666输入，均零差异。完整身份在证据目录的`identities/`。

功能断言的范围分别为：补全包含指定成员；定义包含目标文件及声明行；rename
产生预期编辑数量并实际应用；引用与四个预期Locations逐项相等。未将每个补全
列表或定义列表证明为穷举完整。78/78指这些既定断言通过，不能扩大为所有能力
已经完整资格通过。

## 正常模式完整响应

单位ms，中位数；重开每轮两次共六个样本，其余每侧三个样本。

| 操作 | 旧版 | checkpoint-14 | 新版范围 |
| --- | ---: | ---: | ---: |
| 未打开文件首次补全 | 420.249 | 325.169 | 323.344–333.896 |
| 未打开文件重复补全 | 100.698 | 69.824 | 68.145–77.050 |
| 未打开文件定义 | 59.606 | 65.170 | 59.382–66.092 |
| 首次打开补全 | 244.080 | 68.830 | 59.687–72.638 |
| 打开后重复补全 | 191.356 | 61.811 | 60.356–77.511 |
| 打开后定义 | 51.148 | 131.329 | 130.803–160.714 |
| 关闭重开补全 | 1382.601 | 290.068 | 261.279–319.579 |
| 关闭重开定义 | 1178.149 | 166.699 | 130.291–236.077 |
| rename | 201.732 | 289.698 | 288.700–300.234 |
| 改名后首次引用 | 7407.456 | 537.217 | 528.374–555.637 |
| 改名后重复引用 | 1.791 | 1.583 | 1.251–1.852 |

打开后定义与rename仍有回归。初始化中位数9132.334→14142.874ms；新版会准备
全部已知组，此成本单列，不用于豁免查询等待。该对照是累计候选与旧版的比较，
不能归为某一个小改动的独占收益，也不能直接与另一个时间段的checkpoint-9
相减来断定原因。

进程树RSS峰值中位数1183944704→816218112字节；六轮及每次采样见raw。
这只证明当前工作流的采样结果，不代表长期压力/万文件资源门槛已通过。

## 三个仍慢的操作

新版trial1/2/3均为第12步`textDocument/references`，分别537.217 /528.374 /
555.637ms。三次均为同一固定输入和顺序：

- 文件`feature/browser/src/main/ets/default/view/photo/PhotoBrowserActionBar.ets`。
- 符号`visibilityQQ`，UTF-16零基位置57:12，行内容`this.visibilityQQ = this.isShowBar;`。
- 前11步为disk补全两次、disk定义、打开补全两次、打开定义、两轮关闭重开
  补全/定义、rename `isVisibility→visibilityQQ`；服务端WorkspaceEdit应用为overlay v4。
- 初始化degraded，首次改名后引用、includeDeclaration=true；累计打开3次、关闭2次，
  每次返回精确四处引用。正常模式未测内部缓存状态和各阶段组成。

## 独立阶段与真实读点观测

另开新进程运行`trace-source-session.mjs`，不并入正常统计。相同第12步完整响应
553.884ms，13次功能断言均通过。只读探针插入实际resident-proof的
`this.readSourceFile(filePath)`调用点；不替换读取结果、编译器或LSP答案。

| 观测 | 实测 |
| --- | ---: |
| 文档准备 | 191.361ms |
| 其中dependency-closure | 184.041ms，cacheHit=false |
| 其中membership /preload | 0.049 /6.687ms |
| 编译查询 | 291.203ms |
| 其中createProgram计时记录 /findReferences | 72.623 /16.144ms |
| Program项目 /SDK /其他源文件 | 284 /305 /52 |
| SDK SourceFile再次观察 /首次观察 | 305 /0 |
| 本次resident-proof SDK文本读取 | 305个文件、305次 |
| 初始化及此前操作的同一读点SDK读取 | 0次 |
| 候选选择 /verifier batch | 0 /0 |

阶段嵌套，不能相加为互斥占比。createProgramEvents=1仍是计时记录数，不是
实际构建调用次数。这个探针只计resident-proof文本调用，不是所有原生IO、
SDK loader读取或parser调用数；305次的独占耗时未测，GC及其余阶段未做互斥计量。
正常三次528–556ms的内部组成未测，不能借用这次trace数值冒充慢样本的组成。

证据区分了两件事：已有事实的热编辑用例可避免SDK复读；真实Photos初始状态
degraded，首次引用前还没有这个读点的已验证事实。下一片据此验证在初始化
期间保存已加载输入事实，保留真实degraded及最终输入围栏；实施和性能结果
另行记录，不在本报告预判收益。

## 回归与证据

checkpoint-10原完整fast为1894/1909、15失败，原始日志保留。后续87项扩展
85通过，另两处旧观测假设（编辑后两次都必须命中、测试层硬编码计数）经实际
事件/清单核实后定向2/2通过；该重跑有25个名称过滤skip，不冒充87/87。
L2回收后复测压力的新增组件RED/GREEN为22/22，相关公开/组件组合42/42、
types通过。checkpoint-14完整fast尚未执行，当前不能宣称全量GREEN。

新增代码均遵守500行限制；被触及的既有超限债仍有核心LS3178、document-store
1774、legacy engine791、worker-protocol1888行，均未超过父版本行数，并已提取
host roots、close invalidation、completion planning、reference args职责。

[逐次78操作](local-performance-evidence.md)、
[汇总](local-performance-evidence.md)、
[108个原始文件及复现](local-performance-evidence.md)。
随机七文件、递增规模、完整请求复用、跨组聚合和进程树压力准入仍待完成。
本轮未推送、合并或发布。
