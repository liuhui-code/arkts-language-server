> Public review copy: raw source, full edits, protocol transcripts and archives remain in the original local workspace. Raw-evidence links point to the retention notice.

# Mac Photos checkpoint-22：真实snapshot复用与规模复验

状态：功能对照全部精确，**逐次500ms仍FAIL，13/546次超出**。原始Photos三套
工作负载312次均≤500ms；增加无关源文件后，完整引用及大规模rename继续变慢。
当前工作区为冻结22，私有后续修复另验；本版完整fast尚未执行，未推送或发布。

## 环境和固定输入

- macOS26.6.2/build25G83，Darwin25.6.0，x86_64，Intel i7-9750H2.60GHz、12逻辑CPU、
  16GiB内存；Node v20.19.5，锁定`ohos-typescript@4.9.5-r10`。
- 父提交`3add697043380612efe71cef074e5de292422fe2`；16/22都是未提交冻结工作树，
  不冒充相同git版本。22为677源码/82runtime，16为670/82，均有逐文件SHA。
  native继续使用冻结baseline，SHA `8e9babc3bdaaa32747e5f55df9016dc196431e2baa1250180de1f20301674016`。
- 同SDK1670输入，真实Photos574输入只读。隔离副本及6个增量规模夹具分别核验
  577/705/1089/69/261/1029/2053个文件，完整文件集合、源码和两runtime前后均无变化。
- 每场新进程、独立空应用/index缓存；54场正常计时严格串行，没有混跑build/测试。
  之后18场带探针独立运行。OS文件缓存和其他桌面负载不受控。
- 所有初始化均degraded2307；真实Photos缺`@ohos.filemanagement.userFileManager`，
  合成夹具保留其固定缺失import。不是READY项目验收。查询均在初始准备完成后执行，
  “首次补全”不等于未初始化SDK；初始化单列，不计入交互500ms通过。
- 250ms采样进程树RSS，Worker共享PID只计一次，native子进程去重；不是PSS或精确峰值。
  产品运行期压力仍以Node RSS为主，该外部测量不等于已经实现进程树预算政策。

## 正常串行结果

9个场景各3对，顺序16/22、22/16、16/22：**54场、1092次操作，546组完整结果一致**。
比较只忽略已验证不变的进程内opaque completion句柄，其余字段、列表顺序、
完整Locations和rename编辑保留。每次具体路径、符号、UTF-16位置、编辑文本、
顺序、打开/关闭重开、首次/重复和版本见逐次数据；未假定内部缓存命中。

| 场景（每版操作数） | 16超500ms | 22超500ms |
| --- | ---: | ---: |
| 原Photos fixed（39） | 3 | 0 |
| 原Photos七文件workflow（105） | 0 | 0 |
| 原Photos列表后resolve（168） | 3 | 0 |
| Photos+128无关源（39） | 3 | 1 |
| Photos+512无关源（39） | 3 | 3 |
| 合成total64（39） | 0 | 0 |
| 合成total256（39） | 0 | 0 |
| 合成total1024（39） | 3 | 3 |
| 合成total2048（39） | 6 | 6 |
| 合计（546） | 21 | 13 |

不使用P95或中位数掩盖单次超标。原Photos首次编辑引用为
465.211/462.959/461.634ms；原七文件所有操作及168次带resolve工作流均达标。

规模实验固定SDK、目标字节/符号/位置、依赖图和4处引用。Photos原源码完全相同，
只增加未被目标import的noise模块；合成total64/256/1024/2048只增独立noise根，
目标依赖子图一直16节点。两cohort分开比较，不能混成同一基线。

| cohort/规模 | 补全及定义实际项目文件 | 首次引用实际项目文件 | rename中位数ms，16→22 | 首次编辑引用中位数ms，16→22 |
| --- | ---: | ---: | --- | --- |
| Photos noise0 | 171 | 284 | 288.328→285.009 | 518.815→462.959 |
| Photos noise128 | 171 | 412 | 326.486→307.427 | 587.105→495.016 |
| Photos noise512 | 171 | 796 | 400.559→422.533 | 723.352→623.738 |
| synthetic total64 | 19 | 64 | 320.553→319.442 | 412.424→387.544 |
| synthetic total256 | 19 | 256 | 346.358→347.669 | 469.933→431.350 |
| synthetic total1024 | 19 | 1024 | 494.034→421.564 | 730.349→518.850 |
| synthetic total2048 | 19 | 2048 | 708.752→534.755 | 1058.521→643.745 |

项目文件数来自独立trace中的实际Program；Photos另有305 SDK+52其他文件，
synthetic另有255 SDK+52其他文件。依赖发现实际访问137/18个项目文件，与Program
范围不同。未把目录中文件数直接当语义工作量；完整引用路径确实使noise成为必需输入。

synthetic总数64→2048时，首次打开补全中位数320.742→325.164ms，第一次重开
补全333.689→352.772ms，重开定义50.482→66.158ms；其Program始终19个项目
文件。完整引用387.544→643.745ms、rename319.442→534.755ms的增长更明显。
本轮没有改变扇出、深度、单文件体量或引用数量，这些因素不能由本轮重新下结论；
对应控制实验留在[此前50夹具诊断](2026-10-19-mac-photos-scaling.md)。

慢项均保留：Photos首次引用目标为
`feature/browser/src/main/ets/default/view/photo/PhotoBrowserActionBar.ets`，
`isVisibility→visibilityQQ`后、57:12、op12。noise128三次
487.165/505.538/495.016ms；noise512为623.391/633.786/623.738ms。
synthetic的`app/src/main/ets/Target.ts`中`value→probe`的rename/op11及首次引用/op12，
2048时分别534.755/541.589/530.310ms、643.745/656.239/639.552ms。
完整输入与每次精确位置保留于[operations.csv](local-performance-evidence.md)、
[13个慢样本](local-performance-evidence.md)、
[全部汇总](local-performance-evidence.md)。

## 实际调用链和独立阶段证据

引用进入`reference-query-router`的驻留/完整owner路径，DocumentStore的
`prepareFromCurrent→collectDependencyClosure→resolveRelativeImports/resolveImportPath`
准备输入；TypeEngine保留LS并应用delta，再调用官方LS同步Program及findReferences。
最后仍执行当前输入准入和独立最终联合检查。本轮这条主路径未执行逐批verifier；
不能把剩余慢项归因为64或1024个根的批次大小。

18场独立trace共364次完整结果与同版正常第一轮一致，无观察器溢出。探针计数
覆盖实际`Parser.parseSourceFile`入口、Host的safeRead和ProjectFileAccess读点、
import正则及完整依赖发现、物理身份和Program事件，见
[phase-summary.json](local-performance-evidence.md)。

- Photos op12：项目新解析1，SDK解析0；Host仍读取305份SDK文本、13772891字节，
  新版该函数内39.038ms。另读取52份compiler library文本430435字节。
- 同次发现137个项目输入。import正则扫描747611 code units、1.937ms；完整依赖
  发现220.099ms，内含697次相对路径解析101.225ms。子项属于父项，不能相加。
  其他解析/身份/包边界开销未全部单独分解，不将220减去子项的差值指定归因。
- Photos noise512 op12：仍只解析1个项目文件、SDK0，完整Program1153文件，
  795个项目SourceFile对象复用、1新观察；独立发现137次207.452ms。
- synthetic2048 op12：Program2355文件，项目2047对象复用/1新观察、SDK255复用；
  带探针仍读取1664份未变项目文本。`Registry`在版本相同时返回旧SourceFile，
  可不采用Host新建的snapshot；22的本地弱记录不一定绑定实际被编译器持有的对象。
  私有单owner案例0复读不能推广成所有owner之间均复用。

这些都是**带探针观测**。尤其2048的trace compiler记录1374.800ms、createProgram
1229.924ms，与正常首次引用约644ms不同。观察器分配、GC及嵌套探针会影响路径和
时间；不能把429.948ms的trace读取当正常643.745ms的组成占比，也不能仅凭完整
答案相同就断言GC/cache行为相同。正常内部独占占比、未覆盖的I/O、增量parser
内部调用和精确峰值均未测。

## 增长依据及下一优先级

完整搜索随实际Program输入增长：`observe`/`diskInputsCurrent`遍历Sources，
`inputsFor/normalizedPaths`对成员和根做集合、归一化与排序；Host同步也要处理
根和snapshot。代码支持“遍历规模随S增长、排序项随M增长”的判断；FS路径长度、
库输入及缓存均影响常数，3轮和这些规模不足以给整体RPC定为O(N)或O(NlogN)。
本路径没有B个批次，不据此声称O(N²)。

优先级如下，收益必须再次配对计时：

1. 复用编译器实际持有、经过真实读证明的snapshot及纯数据读事实，覆盖SDK Host及
   多owner输入，保留各owner配置/范围/READY和最终检查。已复现的SDK复读是候选收益，
   AST在本场已经复用，不能再宣传“消除305次SDK重解析”。
2. 核验闭包memo为何因根正文编辑失效，进口集合、物理路径、overlay权威和配置范围
   均相同时复用已验证图；新建候选、alias、包配置变化及取消仍须拒绝或重算。
   137/18次重复发现的诊断时间不是承诺的正常收益。
3. 继续检查跨组完整聚合与必要输入验证的增长；完整身份扫描不能为500ms直接省略。
   整条逻辑请求共享、active组优先和进程树压力等原计划范围继续开放。

## 正确性和资源边界

22修复21的已知关闭源lookup恢复回归，并提取compiler-owned弱snapshot数据。
私有15完整文件93/93、清单4/4，移入后9完整文件39/39，types/build通过。
11个移入输入逐字核对；LS3178→3097、resident-state328→310，其他旧超限债保留。
[TDD](../tdd/stable-program-compiler-owned-inputs.md)记录真正RED、失败清理和每个GREEN。

首次准备中位数Photos约14.2–14.5秒，synthetic约6.7–8.2秒。采样树峰值中位数
Photos原场景约820–823MB，noise512为843313152→848064512 bytes；synthetic2048
727441408→719728640 bytes。变化方向不一致，无整体内存下降结论；SDK独占AST
内存未测，13772891字节是读出的UTF-8内容量，不是SDK全部内存。
72场记录的144个root/native PID均已退出，见
[退出核验](local-performance-evidence.md)。

## 复现

冻结runtime/源码/manifest位于`.bench/stable-program-v1/checkpoints/checkpoint-22/`。
使用同SDK和夹具SHA、新run标签，禁止覆盖旧目录：

[Detailed commands and examples remain in the local original report.]

54场脚本`run-incremental22-pairs.py`，独立诊断`run-incremental22-traces.py`和v2
观察器；输入前后核验、环境、原始协议/事件/快照及逐次参数结果保留。
watchdog只防挂死，exit2表示答案正确但超过500ms，仍是性能失败。

[原始归档](local-performance-evidence.md)
含72场、2004个成员、43812751 bytes；逐成员SHA校验见
[manifest](local-performance-evidence.md)，
archive SHA `ec3171475c8775bf3ef76987a1db8461bd761099d109e70c7fa6773d8a77a6d9`。
仅排除可重建index缓存及后续实验，复现脚本另存`scripts/`，身份文件另存`identities/`。
