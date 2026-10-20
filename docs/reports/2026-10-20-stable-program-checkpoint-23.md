> Public review copy: raw source, full edits, protocol transcripts and archives remain in the original local workspace. Raw-evidence links point to the retention notice.

# Mac Photos checkpoint-23：复用实际SDK snapshot

状态：**逐次500ms仍FAIL，9/546次超标**。54场正常串行对照已完成，546组完整
结果一致。SDK Host复读修复已移入，types/build、私有相关101/101和工作区23/23
通过；完整fast尚未执行。18场独立阶段trace及原始归档已完成，不推送或发布。

后续[递增文件规模专项复核](2026-10-20-checkpoint-23-scaling-review.md)复用42场规模
子集，补全全部状态的中位数/最大值、实际Program范围和22→23增长对照；23虽
多档提速，尚无随文件数增长成本下降的证据，无需为已有同条件覆盖重复补测。

## 版本与行为

- 父提交`3add697043380612efe71cef074e5de292422fe2`，冻结22对23；都是未提交
  工作树，以逐文件SHA区分。23为678源码、82runtime，5个移入输入逐字核对。
- 仅在源读取事实完整验证后，记录编译器真正持有的SourceFile.scriptSnapshot，
  按实际reader函数隔离；Host fallback可借用该snapshot。弱索引/弱键不额外
  持有Program/SourceFile。各owner的配置、搜索范围、READY和语义证明仍独立。
- 借用仍做当前完整物理身份核验，并登记独立最终联合检查；失败或未知仍读取。
  ProjectFileAccess端口路径未改，本轮没有宣称所有项目文本均可跨owner复用。
- SDK Host真实读点的公开RED为0/3：每例重复读96份、4790 bytes；GREEN3/3
  均为0，仍各96个当前检查和96个独立终检。见
  [TDD接续](../tdd/stable-program-compiler-owned-inputs.md)。
- LS旧超限债保持3097行，resident-state310→303；新增helper69行。
  document-store1774、type-engine500、Legacy787等既有债本轮未增加。

## 固定环境和边界

macOS26.6.2/build25G83、Darwin25.6.0、x86_64，Intel i7-9750H/12逻辑CPU/16GiB。
Node20.19.5，`ohos-typescript@4.9.5-r10`，同SDK1670输入；真实Photos574输入只读。
native固定baseline SHA `8e9babc3bdaaa32747e5f55df9016dc196431e2baa1250180de1f20301674016`。
隔离Photos、递增夹具及源码/runtime在正常前后完整核验零变化；无正常计时混跑
build/测试。每场新进程、空应用/index缓存，顺序22/23、23/22、22/23。
OS文件缓存和桌面负载不受控，三次配对不能视作正式P95或长期使用保证。

全部初始化仍degraded2307。Photos缺失`@ohos.filemanagement.userFileManager`，
合成夹具固定缺失import；没有取得READY真实Photos验收。查询均在初始化准备
完成后执行，首次SDK准备不计入500ms通过。冷进程、首次/重复、磁盘/打开/
关闭重开和编辑状态均在逐次数据中保留，未将首次操作直接标为语义缓存miss。

## 正常配对结果

54场共1092次，546组完整规范化结果一致。仅忽略已验证的进程内opaque
completion.data句柄；列表顺序、其余字段、全部Locations及rename编辑均比较。

| 场景（每版操作数） | 22超500ms | 23超500ms |
| --- | ---: | ---: |
| 原Photos fixed（39） | 0 | 0 |
| 原Photos七文件workflow（105） | 0 | 0 |
| 原Photos列表后resolve（168） | 0 | 0 |
| Photos+128独立源（39） | 2 | 0 |
| Photos+512独立源（39） | 3 | 3 |
| synthetic total64（39） | 0 | 0 |
| synthetic total256（39） | 0 | 0 |
| synthetic total1024（39） | 3 | 0 |
| synthetic total2048（39） | 6 | 6 |
| 合计（546） | 14 | 9 |

原Photos三套工作负载312次全达标。1024场首次编辑引用491.252/491.803/493.541ms，
通过但余量小；没有用中位数或P95掩盖单次超标。

| 同cohort内规模 | rename中位数ms，22→23 | 首次编辑引用中位数ms，22→23 |
| --- | --- | --- |
| Photos noise0 | 284.049→275.837 | 460.702→423.819 |
| Photos noise128 | 307.140→294.263 | 503.768→447.876 |
| Photos noise512 | 426.043→415.465 | 640.622→597.069 |
| synthetic total64 | 322.547→315.699 | 388.181→344.594 |
| synthetic total256 | 348.672→341.267 | 428.358→395.535 |
| synthetic total1024 | 424.672→419.055 | 521.830→491.803 |
| synthetic total2048 | 536.638→534.253 | 642.492→612.250 |

并非每一对均更快：2048的第一对引用596.152→620.959ms、rename513.958→535.080ms，
负收益样本全部保留。不能把中位数改善当作所有操作均获益或已解决规模增长。

剩余9次如下；精确输入、顺序和前置状态见
[slow-operations.csv](local-performance-evidence.md)。

| 目标与前置操作 | 操作/序号 | 新版三次ms |
| --- | --- | --- |
| Photos+512，`feature/browser/src/main/ets/default/view/photo/PhotoBrowserActionBar.ets`，`isVisibility→visibilityQQ`，57:12 | 首次编辑references/op12 | 597.303 / 554.445 / 597.069 |
| total2048，`app/src/main/ets/Target.ts`，`value→probe` | rename/op11 | 535.080 / 529.389 / 534.253 |
| 同上，应用rename编辑didChange后 | 首次references/op12 | 620.959 / 610.385 / 612.250 |

位置为零起始UTF-16，synthetic精确位置及完整参数保留于
[operations.csv](local-performance-evidence.md)，
[summary.json](local-performance-evidence.md)含全部逐次时间。
同一输入版本的重复引用不是首次引用的替代样本。

## 编辑到首个响应

额外从真实didChange发送单调时钟推导各编辑文件的首个记录查询响应，共42条，
不是把该版本后续所有查询的累计等待算作响应。见
[edit-first-response.json](local-performance-evidence.md)。
该指标包括客户端记录/发送及可能主动插入的操作；服务端独占时间和编辑器绘制
未测。原Photos新版本为412.348/428.706/425.044ms，RPC为410.934/427.479/423.819ms；
total2048为621.648/611.163/613.283ms，RPC为620.959/610.385/612.250ms。
这组first-after-didChange数据中，新版RPC超标6次，编辑到响应也超标6次。

## 阶段及下一步

18场独立trace的364次完整结果与同版正常第一轮一致，没有观察器溢出。实际函数
计数见[phase-summary.json](local-performance-evidence.md)，
完整逐文件记录在原始归档中。首次编辑references/op12实测如下：

| cohort | SDK Host文本读22→23 | 其他库Host文本读22→23 | SDK当前/独立终检（23） | 项目/SDK解析入口（23） |
| --- | --- | --- | --- | --- |
| Photos noise0/128/512 | 各305→0 | 各52→0 | 各305/305 | 各1/0 |
| synthetic64/256/1024/2048 | 各255→0 | 各52→0 | 各255/255 | 各1/0 |

Photos SDK读取量13772891→0 bytes，synthetic10742238→0；其他库430435→0。
这些字节是读取量，不是AST内存。SDK当前检查从observation移到Host借用阶段，
同一同步查询共享后仍只做一轮；最终联合重新扫描，不借用第一轮旧身份。
两版实际SDK解析原本都是0，项目解析入口仍各1，不能将读取收益称为消除SDK解析。

实际Program范围保持：Photos完整引用284/412/796项目文件，加305SDK和52其他库；
synthetic64/256/1024/2048项目文件，加255SDK和52其他库。补全/定义的项目范围仍
Photos171、synthetic19。引用各一次createProgram事件；2048项目对象2047复用/1新观察。
“对象新观察”和解析计数分开；未覆盖的增量parser内部入口仍未测。

23的Photos noise512依赖发现137次205.841ms，内含正则137次1.856ms；compiler
273.600ms，含createProgram145.096ms和其他引用128.504ms。2048仍实际Port读取
1664份未变项目文本39936 bytes，诊断函数内457.963ms；compiler1389.910ms，含
createProgram1279.739ms。此时正常RPC为610–621ms，不能拿诊断458ms计算正常占比。
嵌套时间不能相加，探针会影响分配和执行路径，正常独占阶段时间未测。

另保留两项限制：1024的22 trace有640次Port读、23为0，但本轮没有修改Port复用，
不能据此宣称跨owner项目复用已经实现；GC/cache具体原因未测。2048的import扫描
18次记录261.475ms，异常停顿的具体原因未测，不归因于正则算法复杂度。

前版已确认的剩余路径见[报告22](2026-10-20-stable-program-checkpoint-22.md)：
DocumentStore闭包发现、完整Program同步、项目文本Host读取及当前/终检随实际输入
增长。不是64或1024根的分批verifier路径，不把它归因于批次数量。

优先验证已加载项目snapshot的复用权威，以及根正文改动而import不变时的闭包
复用。后者当前在`reuseDependencyClosure`内容代次检查失效；新方案仍须覆盖每个
依赖的内容代次、物理路径、overlay权威、包配置、优先级候选新建、预算与取消回滚，
不能仅凭根import字符串相等就沿用旧图。尚未据此改产品代码。

正常树RSS采样峰值中位数：原Photos fixed828121088→823164928 bytes，workflow
825892864→828764160，noise512844427264→849436672，total2048724738048→720678912。
方向不一致，无整体内存下降结论。250ms采样不是精确峰值/PSS，SDK独占AST内存未测。
Photos初始化中位数约14.1–14.6s，synthetic约6.4–8.2s，仍单列报告。

## 复现入口

冻结版本`.bench/stable-program-v1/checkpoints/checkpoint-23/`，同SDK与夹具SHA，
使用新标签、禁止覆盖原run：

[Detailed commands and examples remain in the local original report.]

`run-incremental23-pairs.py`固定54场，`run-incremental23-traces.py`单独运行阶段探针；
`summarize-incremental23.py`生成逐次CSV，`derive-incremental23-edit-latencies.py`
推导编辑首响应。所有退出2仍是500ms性能失败；watchdog只防挂死。

[原始归档](local-performance-evidence.md)
含72场、7797个成员、74675212 bytes，逐成员SHA核验通过，见
[manifest](local-performance-evidence.md)。
archive SHA `f334fa6669aab2eb0fe83c30f6f4347f9b9b699ee0992e837bc0aec8fd9de483`。
除了原始协议/事件/输入快照、两runtime/23源码、环境、RED/GREEN和复现脚本，
额外保留7套完整夹具字节于`replay-fixtures/<caseId>/`，各自完整SHA在对应plan中。
重新准备时复制到plan.workspace或新的仓外临时目录，更新新plan后再执行，先核验
每个SHA；不要覆盖现存夹具或真实项目。SDK与原始Photos保留逐文件身份清单。
排除的仅有可重建index缓存和后续实验/未执行fast记录。

72场记录的144个root/native PID均已退出，见
[退出核验](local-performance-evidence.md)。
正常及trace后源码、runtime、SDK、真实Photos和全部夹具核验零漂移。

封存后仅清理resident-state末尾一个空行（303→302），冻结23及原归档未改。
重建后82个runtime逐字节SHA均与计时版相同，源码差异严格只有该空行；再次
types、公开SDK用例3/3和相关`git diff --check`通过。差异、原日志和独立SHA清单
见[格式补记](local-performance-evidence.md)。
