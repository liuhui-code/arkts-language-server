> Public review copy: raw source, full edits, protocol transcripts and archives remain in the original local workspace. Raw-evidence links point to the retention notice.

# 稳定 Program 优化实施记录

- 授权：[ADR 0019](../adr/0019-stable-programs-and-request-inputs.md)。
- 父版本：`3add697043380612efe71cef074e5de292422fe2`。
- 分支：`codex/stable-program-optimization-20261019`。
- Node：固定 `<local-path>`。
- 新证据目录：`.bench/stable-program-v1/`；原 Mac/Windows 报告和封存数据保留。
- `parent-inputs.json` 固定父版 1786 个跟踪文件；`baseline-runtime/manifest.json`
  固定 83 个旧 dist/native 输入，后续构建不覆盖这套基线。

## 验收进度

| 要求 | 状态 | 当前证据 |
| --- | --- | --- |
| 首次初始化边界（含 degraded） | GREEN | 独立 RED exit1；完整初始化文件 8/8 exit0 |
| 压力决定驻留，保留串行编译 | PARTIAL GREEN | 28/28；无压力容量已移除，压力动作与进程树口径待补 |
| 默认交互组、编辑与 close/reopen | PARTIAL GREEN | 默认 member 分组与重开 13/13；准备策略/更多输入待补 |
| 引用增量恢复与组覆盖合并 | PARTIAL GREEN | degraded 完整 owner 改名恢复 12/12；跨组聚合待补 |
| 同请求输入共享、联合最终核验 | PARTIAL GREEN | 编译查询 witness5→2；整个LSP请求/文本共享待补 |
| 1024 软目标回退及实际闭包观测 | PARTIAL GREEN | 1042 文件17→2批，精确结果；2048配置及更广规模待补 |
| 全部快速回归 | FAIL / 修复中 | checkpoint-10实际1909项，1894通过、15失败；原始日志保留 |
| Photos 与递增规模前后对照 | PARTIAL | checkpoint-9旧/新各三进程78/78精确；完整规模矩阵待补 |
| 每次完整响应 500ms、资源趋势 | NOT_PROVEN | 原基线失败保留 |

## Slice 1：degraded 初始化结束豁免

公开案例在 1MiB 压力设置下让真实缺失 SDK import 导致首次 degraded；
首次仍应完成编译并报告缺失输入，第二次显式准备应报告资源不足。
RED 命令：`node --test --test-concurrency=1 --test-name-pattern='a degraded first preparation' tests/semantic/project-initialization.test.mjs`。
原始输出：`.bench/stable-program-v1/initial-degraded-red.log`。

父版 RED exit1：第二次 prepare 仍报告 dependency-inputs-incomplete，证明再次
豁免了压力。修改为所有正常完成的首次尝试均消费豁免；取消/抛错不伪装完成。
GREEN 命令：`node --test --test-concurrency=1 tests/semantic/project-initialization.test.mjs`，
8/8、exit0、无 skip，`initial-degraded-green.log`；构建 `initial-build.log` exit0。

## Slice 2：预算充足时 A/B/C 与全局扫描保留 Program

更新已有真实 LSP 场景，在保持全部精确 Locations、模块根集合、SDK parse、
overlay/disk/unsaved 反例的同时，要求 B 在 C 准入后仍复用原 Program。
RED 命令：`node --test --test-concurrency=1 tests/semantic/semantic-group-retention.test.mjs`。

`retention-red.log` exit1，B 的 Program 2→4；改生产配置为 pressure-managed
(`maxResidentContexts=null`)，有限数量只保留为隔离/组件控制能力。原压力
lease 和滞回保护保留。`retention-green.log` 初始化/组/组件完整组合 28/28、
exit0；`retention-typecheck.log` 类型检查 exit0。

## Slice 3：默认 member 组与 close/reopen

保持 aMarker、ambient 和真实 module augmentation 的 augmented 三个成员。
第一版夹具把 ambient 放在构建范围之外，不能作为优化 RED；修正为合法
module source roots 后，`member-group-red-2.log` 精确得到 6 roots 而非4。
默认 member profile 新增 group，未知构建图继续 workspace 范围；原显式
workspace/current 对照保留。全量组合 `member-group-green.log` 18/19：
范围已修复，但新 close/reopen 的上下文数量3→5，不能冒充全绿。

`member-reopen-red.log` 捕获 content-revision-change 销毁 root 与 group。
同 owner、同 physical path、无 package/alias/跨 root 的 close 产生可证明
输入权威 delta；重开 overlay 可以承接它。其他物理/嵌套别名仍保守 reset。
组内查询不顺带重新认证全 workspace；workspace READY 仍须完整证明。
提取闭合职责 `closed-document-invalidation.ts`，旧 document-store1773 行，
低于父版1791；没有以新辅助文件掩盖剩余迁移债。

完整三个公开文件 `member-reopen-green.log` 13/13、exit0，含成员、重开、
真实物理 SDK retarget、嵌套 root、删除与未通知 missing-input 反例；
`member-reopen-typecheck.log` exit0。随后在 GREEN 提取补全 batch planning，
保持原候选/身份/resolve 规则，legacy870→790行，仍有超限债。
提取后 `completion-extract-green.log` 两个完整公开文件11/11、exit0。

## Slice 4：degraded 完整范围 owner 的改名后恢复

公开 fixture 保留真实缺失 SDK import、未打开 caller、同名无关字段；使用
服务端 rename WorkspaceEdit 的版本化受控应用，独立计算改名后的精确4个
位置和排除声明的3个位置。最初 fixture 缺失 unopened/null 版本映射，
`degraded-rename-red.log` 为夹具失败；修正后 `degraded-rename-red-2.log`
exit1，精确结果已通过但仍发生 disposable batch，才是产品 RED。

允许预算正常的兼容完整 owner 经过普通 prepare 同步输入后直接搜索。
新路线要求实际 searchedProjectPaths 覆盖全部成员；使用 Set 线性核对，
没有引入每成员 includes 的平方扫描。当前 Program 捕获失败明确 incomplete，
不以一次编译器查询成功代替磁盘/配置证明；原隔离完整回退保留。
`degraded-rename-green.log` 三个完整公开文件12/12、exit0，包含 SDK relative
path 反例、两种声明策略、初始化恢复、组与重开。anchor 仍可能隔离，
不宣称已消除所有 SDK 复读或已完成跨组聚合。

GREEN 后把合法 host root 构造提取到已有 typescript-host-file-names.ts，
后续再验；typescript-language-service 仍有超限债，最终记录真实行数。

## 冻结 runtime 的 Photos 预实验（不是最终验收）

SDK1670项逐个哈希与原诊断一致，`sdk-preflight.json` 无差异。旧 runtime
83项和 checkpoint-4 独立复制，重放时检查 runtime 与 fixture 前后哈希。
使用原仓库外 Photos 夹具及原13次操作/精确 oracle，新的 session.mjs 和
recorder、RSS sampler 在新证据目录运行，未覆盖原封存数据。
旧版 pilot-1 完整13/13，改名首次引用9059.112ms，重开补全1936.516/
2042.990ms。checkpoint-4同13/13，重开补全371.267/393.947ms、首次引用
4544.180ms，但rename275.348→2028.995ms回归。两者runtime/fixture前后
哈希一致；exit2表示功能通过但500ms失败。保留该失败，不以移动成本达标。
这是单对pilot，不作为最终多轮性能资格。

## Slice 5：锚点复用初始化 owner

仅在改名后立即请求的首个小夹具未进入真实anchor，`anchor-sdk-red.log`
实际PASS，不能称RED。显式完成真实catalog进度，并在任何didOpen诊断前
先执行disk-source字段引用；`anchor-sdk-red-2.log`才复现common.d.ts解析2次。
普通anchor准备允许同步原owner，并要求admit整个实际Program后才返回定义；
所有物理/配置/发布围栏保留。`anchor-sdk-green.log`四个完整文件20/20，
exit0，初始化SDK仅解析1次；`anchor-sdk-typecheck.log` exit0。

## Slice 6：多个驻留消费者独立应用 delta

新增close/reopen→组补全→完整rename序列。初版受fixture继承的FAST_PATH=0
影响，`multiconsumer-delta-green.log`为28/29，不能作为正常生产资格。
改用显式FAST_PATH=1并在冻结checkpoint-4全runtime上重放同一公开案例，
`multiconsumer-delta-qualified-red.log`仍4→3个context断言失败。透明spawn
选择器只切换待测runtime路径，真实LSP协议/oracle不改；server SHA记录于
`frozen-test-bindings.ndjson`，没有修改/覆盖旧runtime。

Store保留最多32个连续compatible span、合计最多现有maxChanged路径数的
不可变metadata。各上下文按appliedRevision选择连续区间；未知变更、reset、
alias/package/跨root或历史缺口保守失效。组只接收其合法scope相关delta；
原通知仍one-shot，历史不携带源文本或AST。完整正常owner也允许消费已证明
delta，不能让一个组查询消耗其他owner的合法复用证据。

`multiconsumer-delta-green-2.log`三个完整公开文件29/29、exit0，包含新序列、
原100次disk更新、类型/诊断变化、物理别名、未知删除/创建、Worker恢复。
`multiconsumer-delta-typecheck.log` exit0。checkpoint-6独立冻结runtime、
源文件/测试hash与source.patch，下一次pilot只使用该固定runtime。

checkpoint-6 Photos pilot13/13，重开补全325.404/335.078ms、重开定义
249.224/174.288ms、rename316.014ms，首次改名引用980.314ms仍FAIL500。
fixture/runtime哈希一致，仅1次操作超过500ms；不代表随机文件与规模矩阵达标。

## Slice 7：同一编译查询的 witness 联合终检

新增真实LSP+只读lookupIdentity观察器：96个真实SDK声明在一次热definition
内每个核验5次，`request-validation-red.log` exit1。query scope只复用相同
owner/epoch/revision下的成功核验；新增事实重新核验，epoch改变拒绝；退出时
清除复用并对联合事实独立扫描，完成后才允许发布。原实际load前后guard不缓存。
它暂限同步compiler query，尚未覆盖跨RPC的完整公开请求，也未缓存原始文本。

首组 `request-validation-green.log` 21/23，两个失败均保留：最终SDK变更从
报告降级变成错误，修复readiness外层捕获并清空旧资格，保持原degraded协议；
诊断后的READY恢复在冻结checkpoint-6也FAIL (`diagnostic-intent-checkpoint-6.log`)，
为前片长期LS暴露的旧membership版本问题。READY是否需要刷新改按已认证
generation与当前engine generation判断，不能只看LS最近已应用revision。
保留后台诊断不能自己认证、真实trim/eviction清除意图和取消反例。

修复后 `request-validation-green-2.log` 四个完整公开文件23/23、exit0；
`request-validation-typecheck-2.log` exit0。随后将只读观测断言收紧为每输入
恰好2次（首次与独立终检）：`request-validation-exact-green.log`1/1、exit0，
实际96输入、192核验、每输入[2]、owner1。正常计时不加载该观察器。

## Slice 8：1024 回退软目标

新增1042文件的真实保守fallback，保留完整3个Locations和1041候选+pinned
关系。`fallback-1024-red.log` exit1，实际17批而非2；默认64→1024，配置
上限512→2048。语义单元整体打包、闭包和压力准入未绕过，1024不是实际
Program文件数上限。`fallback-1024-green.log` 新合同与input-validation组合
2/2、exit0，实际根数[1025,18]；2048配置与更广规模资格尚未完成。

checkpoint-8 Photos单进程pilot仍13/13精确，改名首次引用887.774ms，
其余12次在500ms内。该pilot及之前pilot的RSS sampler记录ps权限错误，
没有有效RSS样本，统一标为UNMEASURED；不得据此声称内存改善或无回归。
新增超过预载窗口的320文件静默等宽/同mtime编辑特征测试已通过，
`unpreloaded-source-red.log`实际PASS，不能称为发现并修复了新缺陷。

## Slice 9：先同步已准备 owner，消除引用前置往返

父版本仍3add6970。新增真实缺失SDK输入、完整初始化degraded、catalog进度
ACK、字段rename WorkspaceEdit和overlay v2后的首次references，精确3处。
RED命令：`node --test --test-concurrency=1 --test-name-pattern='an edited degraded prepared Program' tests/semantic/semantic-group-retention.test.mjs`。
`retained-owner-route-red.log` exit1：一次公开请求进入references Worker两次，
先proof-only miss，再候选/anchor准备，最后才命中原Program。

新增内部retainedOnly模式，旧residentOnly仍是proof-only。已有owner必须
实际完成过Program/Checker准备，且压力许可、成员完整、连续delta兼容；
缺少该准备事实就直接miss，不能为试探新建冷owner。准备机会不是READY
资格：成功返回仍需官方完整搜索路径覆盖全部成员和overlay、现有输入终检。
Index dirty也不能阻止已有完整官方Program自行回答；显式legacy和复用关闭
控制仍保留。真实SDK变化导致输入不可用时撤销原owner复用资格，让完整
隔离控制读取新声明，不能反复准备原已失效的加载状态。

第一组合 `retained-owner-route-qualification.log`50/55；冻结checkpoint-8
原样重放 `retained-owner-route-checkpoint-8-control.log`4/9，复现同5个失败。
SDK变化恢复为真实旧缺陷；另外三个overlay安全反例在已准备状态准入收紧后
恢复，无需修改其精确结果/诊断/版本断言。剩余旧测试强制至少2次resident
miss；观察实际为1次miss+完整batch，新冷探测没有做第二次admission。
仅改为至少1次，保留真实rejection、完整fallback、SDK不重复读取、精确位置
和最新诊断；证据 `retained-owner-miss-control.log`，没有发明第二次miss日志。

`retained-owner-sdk-green.log`9/9；最终 `retained-owner-route-final-green.log`
五个完整公开/协议文件16/16、exit0，无skip；默认member/重开、多consumer、
静默磁盘编辑、版本跳变、SDK中途变更与冷owner控制保留。原协议文件23/23
`retained-owner-protocol-extract-green.log`；新增模式不可混用、输入不可变、
getter不执行的wire特征1/1 `retained-owner-mode-protocol-green.log`。
`retained-owner-extract-types.log`类型检查exit0。GREEN后将引用args类型提取
到其已有decoder模块，worker-protocol1901→1888；type-engine500、核心LS3178，
LS仍为迁移债但没有超过父版行数，前片已提取host roots责任。

checkpoint-9冻结82个runtime、664个源码/测试/配置、source.patch及哈希。
旧版/checkpoint-9各三次独立进程Photos串行A/B已完成，交替前后顺序；
78/78精确，首次引用中位数7676.485→439.317ms，新版一次524.187ms仍失败。
进程树采样RSS峰值中位数1178042368→787161088字节，六轮无采样错误，
仅适用该工作流；先前无RSS的pilot不回填或混入。独立trace首次引用439.649ms，
文档准备130.202ms、编译查询247.198ms，其中findReferences11.864ms；
阶段嵌套、慢baseline内部阶段未测。报告及100个原始文件逐项校验归档见
[checkpoint-9对照](../reports/2026-10-20-stable-program-checkpoint-9.md)。
完整fast、跨组覆盖、全请求文本共享、初始化组策略、运行期压力及最终
随机文件/递增规模/每次500ms资格仍未完成。

## Slice 10：初始化全部已知组

移除生产默认仅准备排序前两组的限制；有限容量仍可作为隔离组件控制。
五模块公开初始化案例由3个上下文（完整owner加两组）变为6个，最后一组
首次definition不新建LS。已冻结checkpoint-10，初始化与分组相关16/16通过。
已打开文件优先和运行期压力策略尚未完成，不能称初始化合同全部完成。

checkpoint-10完整`pnpm check:fast`实际结束：1909 tests、1894 pass、15 fail、
无skip/cancel，exit1，日志`check-fast-checkpoint-10.log`。失败涉及准备trace、
旧固定容量/重复路径探测假设、resident-first、磁盘终检观测及配置恢复；
诊断与修复须分别验证，不把重复打印的31条失败标题当31个失败测试。

## Slice 11：复用已读SourceFile事实，保留当前输入围栏

完整fast运行期间在`experiments/source-evidence-v1/`隔离副本完成RED/GREEN，
未修改正在测试的checkpoint-10源输入。实验父提交825f749a，来源checkpoint-10，
上游父版仍3add6970。第一次夹具无预先实际读证据，不构成RED；增加真实warm
references后，`source-evidence-qualified-red.log`证明编辑后96个SDK文本被重读。

同compiler owner下以WeakMap记录具体SourceFile/text及已实际验证的完整物理
身份；只有当前路径/realpath/dev/ino/size/mtime/ctime相同才复用该读事实。
输入签名、配置、overlay、覆盖及发布前独立身份核验继续执行；身份改变必须
重新读取，不把stat本身当内容证据。WeakMap不延长退役owner/SourceFile生命。
两个公开READY/degraded案例均精确3处引用，编辑后重复SDK文本读取96→0。

`source-evidence-focused-green.log`12/12；扩展首次20/21时保留取消失败。
冻结checkpoint-10同案例失败、仅开启QUEUE_TRACE则通过，定位到既有准备
trace漏传；补传显式trace回调后原取消断言通过。隔离扩展
`source-evidence-ready-green-2.log`23/23、types exit0；无性能结论。
完整fast结束后，核对主工作区三文件与checkpoint-10逐字一致再移入候选，
并登记新公开测试。主工作区全量资格、SDK物理变化/终检反例和性能仍须复验。

## Slice 12：回归修复、2048资格与L2及时停止

checkpoint-10完整fast的15个失败逐项复验。新增已实际observe的Program可进入
retained探测，仍不getProgram创建冷上下文；编辑SDK失效会清空该资格。
普通完整references不额外要求resident proof，快速驻留返回仍显式要求它；
恢复后的合法symlink不会被仅支持regular-file驻留证明的保守拒绝阻断。

磁盘中途变更夹具显式将第三个反例武装在真实final verification调用栈，
保留前两个原读窗口；不是删掉终检断言。READY项目编辑保留SDK解析，实际
default与关闭request-local reuse均0次SDK目录探测；旧首次冷miss对照仍1/120。
四个真实LSP保留最新overlay/精确引用/诊断用例改验无压力保留三owner，有限
两owner组件控制仍保留。索引CLI控制显式关闭resident-first，保持原索引断言。
测试层清单准确更新为227入口（unit104、bundle107）；没有删除测试登记。

`fullfast-failures-green-4.log`实际85/87、两个失败。额外编辑用例经
`debug-overlay.log`确认：旧proof一次miss→同LS新Program查询一次→第二策略
命中新proof一次，无batch；精确结果含新增调用，与独立legacy一致。
据此校正原强制零/两次hit的观测，清单层计数同步更新；
`oracle-inventory-green.log`定向2/2、25项名称过滤skip，不称87/87。
先前green-2/3仅因测试文件名拼错未启动，日志原样封存，不计测试通过。

2048配置在冻结旧版真实失败（只支持1–512），`fallback-2048-red.log`；
当前公开2082源码精确三Locations，两个批次根数[2049,34]，默认1042源码
[1025,18]也通过。根数仍是软目标，未冒充Program总文件上限。

隔离pressure-v1以checkpoint-13为基，新增L2回收scan后压力恢复必须停止的
coordinator公开合同：`pressure-l2-live-red.log`实际仍返回level2、清空其他组。
逐次trim后重读压力，变级即停；保留leased保护、scan优先、LRU及L3恢复语义。
`pressure-l2-live-green.log`22/22后移入；`pressure-l2-public-green.log`相关五个
完整文件42/42，types通过。统一进程树压力准入仍未实现，不把外部RSS当准入。

checkpoint-14冻结82runtime/666源码。三对正常Photos共78/78预设断言通过，
候选首次引用537.217/528.374/555.637ms，三次均FAIL500。独立trace实际
resident-proof SDK文本读取305次全部发生在operation12，此前0；该读点
独占时间未测。文档准备191.361ms、其中closure184.041ms miss，编译查询
291.203ms，阶段嵌套。报告/108份原始归档见
[checkpoint-14](../reports/2026-10-20-stable-program-checkpoint-14.md)。
下一片验证degraded初始化的输入事实，不能把已预热references夹具的96→0
推广到真实首次查询。当前完整fast仍以checkpoint-10 FAIL为最新全量结果。

## Slice 13：degraded初始化先验证已加载输入

隔离initial-proof-v1从checkpoint-14建立，父版仍3add6970。新增不预热任何
references的真实degraded初始化案例。首版只在请求后查owner为0，随后将断言
前移到任何目标查询之前；`initial-proof-qualified-red.log`明确96个SDK初始
文本验证预期、实际0，exit1，不借后续热refs掩盖初始化缺口。

首次初始化getProgram/getTypeChecker后，对实际加载Program执行一次输入事实
观察，即使后续missing-input使其degraded。这个临时观察不转移READY资格，
不打开普通query recertification；正常READY仍在完整检查后重新建立当前证明，
并执行原身份构造及最终围栏。只有initialPreparationActive时提前做这次工作，
普通查询/恢复不新增一次全Program预检查，也不续期初始化压力豁免。

`initial-proof-green.log`七个完整公开文件37/37、无skip，包含初始化1MiB与
degraded、取消、静默SDK变更、同stamp物理父目录retarget、SDK case rename、
多root及Worker替换、final disk mutation。三个SDK事实案例均编辑后0次复读；
新增无预热案例在任何目标查询之前已验证96个SDK文本。types通过。
核对主工作区两文件与checkpoint-14逐字一致后移入；checkpoint-15冻结82runtime/
666源码，只改readiness实现及对应公开测试两个输入。正常Photos pilot/对照与
独立305→0机制观测继续进行，不以37个功能测试代替500ms和完整fast资格。

## Slice 14：关闭引用发布的真实漏检窗口（隔离验证中）

实验`experiments/delta-delivery-v1/`基于checkpoint-15，上游父提交仍3add6970。
最初为关闭文件delta交付新增公开ambient声明关闭恢复案例：结果正确但
context3→4，`group-closed-input-red.log`。
最小实现通过现有ProjectFileAccessPort交付缺失changed disk snapshot，完整
成员/物理权威/overlay/删除/reset守卫以及256文件、8MiB旧预算不放宽。
该片尚未移入主工作区。

扩大回归`group-closed-input-broad-green.log`实际36/41；冻结15相同用例4/9，
同5个失败。其中320 filler后ZZCaller处于预载窗口外，等长编辑恢复mtime后
引用TargetTwo只返回import、漏掉新增调用，是真实正确性回归，另外4个是
旧batch/index路由断言待独立核验。暂停扩大性能验收，15明确不可采用。

恢复普通captureSearchScope证明要求，并对合法文件symlink使用lexical
lstat+realpath+物理目标完整身份；同字节且目标为hardlink的retarget必须
撤销旧证明。`reference-symlink-qualified-red.log`冻结15期望2次驻留命中、
实际0；`reference-fence-broad-green.log`隔离修复53/53，无名称过滤skip。

进一步参数化READY/degraded后，`degraded-reference-final-fence-red.log`
暴露同Program/signature观察shortcut未执行当前磁盘admit。capture在真正
引用返回前要求独立admit，复用元数据而不缓存有效性；
`reference-final-admission-green.log`3/3，types/build通过。

`post-query-ready-final-fence-red.log`再通过真实worker的crypto身份构造
窗口修改未预载ZZCaller，最终proof已失败但外层忽略报告，仍返回旧1处，
期望新2处或明确-32803。测试探针只改私有夹具磁盘，不伪造答案。
`certifyPreparedQuery`对current-program-inputs-unproven及
inputs-changed-during-preparation传播SemanticInputUnavailableError，
保留缺失SDK等已知degraded查询政策。`reference-publication-focused-green.log`
4/4；追加trace开关两种完整窗口反例，扩展回归继续。

固定Photos14/15三对和七文件pilot的成功/失败原样保留于
[checkpoint-15报告](../reports/2026-10-20-stable-program-checkpoint-15.md)。
固定39次≤500ms不能撤销正确性失败或替代6/35跨文件慢操作。
最新完整fast仍是checkpoint-10的1894/1909 FAIL，未推送/发布。

上述失败传播修复的十个完整公开文件`reference-publication-broad-green.log`
实际67/67，含trace开关反例，无skip/cancel；types通过。但这还不是最终输入
联合围栏的资格。追加终检窗口：在真实assertCurrentWorkspaceSources读取
Filler0000时修改未预载ZZCaller。初次resident路径未到此窗口，探针未触发的
`reference-request-union-red.log`不算合格RED；显式普通legacy查询后，
`reference-request-union-final-qualified-red.log`两个READY/degraded反例均真实
触发并返回旧import单位置，缺少新增调用，期望-32803。

将不可变ResidentObservation的完整磁盘身份纳入既有同步编译查询的
validateRequestInput；同一观察可共享成功核验，最外层退出再不缓存地扫描
联合输入。不改变文本权威、跨请求有效性、预算或并发，不新建缓存/调度器。
这个联合范围限于单个同步编译查询，尚不是跨worker阶段的整条逻辑LSP请求。
`reference-request-union-focused-green.log`两文件14/14，types/build通过。
终检注入现在明确-32803；追加watcher通知后精确新2处的恢复断言，再扩大回归。

四个旧observer失败以`resident-new-owner-route-diagnosis.log`逐次核验：旧proof
真实reject/miss后，当前完整owner实际查询（SDK1、项目3/4）建立新证明；无
冷batch/index，第二声明策略走cache。保留所有精确新位置、诊断、version jump
及重开拒绝旧lineage断言，改验先完整查询后才可hit，并约束同worker、实际
loaded SDK叶数及每叶最多8次身份观测。focused14/14中实际每叶8，不把新证明
合法核验当失败旧证明重复扫描；原3/7通过、4项失败日志仍保留。

加入watcher精确恢复后，十四个完整公开/组件文件
`reference-request-union-broad-green.log`实际86/86，无skip/cancel，189216.975ms。
包含全部SDK相对输入反例、终检/READY窗口、路径身份/链接retarget、取消、
初始准备、组保留、关闭ambient、输入证明和清单。候选types/build exit0。
核对17个待移入文件与冻结15输入逐字相同后移入主工作区，记录所有前后SHA于
`safety16-promotion.json`。新增helper35行、两个注入夹具36/29行、新公开测试55行；
LS3178、type-engine500、document-store1774均未增长，超限旧债保留。
工作区独立构建/定向公开回归、冻结16、正常三对性能和完整fast另验。

工作区`checkpoint-16-build.log`与types exit0，`safety16-main-public-green.log`
15/15无skip。冻结16为670源码/82runtime；SDK1670、真实Photos574、fixture577
及完整fixture文件集合，源码/两版runtime前后均0变化。
[checkpoint-16报告](../reports/2026-10-20-stable-program-checkpoint-16.md)保留两类
场景各三对、288次操作、144组完整结果比较一致（仅除opaque completion data）。
七文件105次全部≤500ms，对照18次慢；固定39次中首次改名引用3次
525.361/516.891/545.235ms，全部FAIL500。首对汇总Python zip(strict=True)
不兼容中断后保留已有两场，只续跑未执行场次，失败/续跑日志均入归档。

独立4场、96次完整结果与正常同版一致，探针无溢出。关闭文件reset4→0、
context创建13→9。固定op12观察640个磁盘输入1280次身份读取，准入及最终
联合围栏各640次；resident文本读取0。测量函数内累计68.032/33.896/32.945ms，
不与父阶段或正常响应相加。32个记录PID全部退出。有界归档1163成员全部
逐SHA核验，排除可再生index及未完成全fast日志。完整`check:fast`现于固定
16主工作区运行，不能在它结束前移入后续候选或混跑正式计时。

## Slice 15：复用读事实时不重复执行“读后”检查（隔离候选）

`experiments/observation-stamps-v1/`从冻结16建立，记录基线manifest SHA，
上游父提交3add6970。加强现有公开SDK事实用例，实际源码调用点观察
before/after身份次数，不修改答案或磁盘。
`observation-stamps-qualified-red.log`三个完整案例0/3：SDK文本确实未复读，
却仍执行96（READY路径可更多）次读后身份检查，期望0，实际96。

只将observe的读后diskIdentity移到真实readSourceFile分支内；已验证同
SourceFile/text及当前完整before stamp的事实复用无新read，不需要括住一次
未发生的读取。当前before、完整准入和最外层联合终检保留。真正读取后的
身份检查继续执行，不把旧stamp当当前有效性。

`observation-stamps-related-green.log`八个完整公开文件59/59，无skip/cancel，
含SDK物理retarget、字节变更、链接/alias、READY/终检注入、超预载文件和取消；
types/build通过。冻结为私有checkpoint-17，670源码/75runtime（未带16旧dist的
七个测试driver/旧server.mjs）；源码仅3文件不同，完整source.patch以16为基。
尚未移入主工作区、尚无正式性能资格，16完整fast继续使用原固定输入。

## Slice 16：成员补全resolve复用列表的稳定语义范围（隔离候选）

从私有17建立`experiments/completion-scope-v2/`，未触及全fast的16工作区。
扩展既有真实公开member案例，在首次/重复/关闭重开每次列表后resolve
`aMarker`，精确详情`(property) LocalA.aMarker: number`、原server-owned data不变，
要求保留模块和ambient四根。`completion-scope-v2-qualified-red.log`详情正确但
resolve实际扩大至六根，期望4实际6，1项真实失败、3项名称过滤skip。

先最小实现相同member/group/current决策用于resolve，discovery根及preResolved
优先级保持；未知组或非member保留完整回退。`completion-scope-v2-minimal-green.log`
1/1通过（3项名称过滤skip）。GREEN后将列表原有同一决策提取复用到
completion-batch-planning，防止列表/resolve策略漂移；Legacy791→787行，
planning83→100、公开测试287→294。types/build通过。

九个完整文件首次`completion-scope-v2-related-green.log`实际57/64，7项均在
启动server前因缺失`fixtures/conformance/v1`而ENOENT（source冻结包不含fixtures），
不算产品RED或64项通过。复制原126个fixture并记录SHA，不使用可写原目录
链接后，只重跑7项失败：`completion-scope-v2-fixtures-green.log`7/7，无skip。
原57项含完整补全payload、SDK变更/路径反例、取消、全局/当前范围回退和新
member resolve四根；未删改原答案。记录为57通过加另7通过，不冒称单轮64/64。
冻结私有18为670源码、与17相同75生产runtime，3文件diff；仍未移入或正式计时。

## Slice 17：同步查询与独立终检分别共享正身份（私有19）

父提交仍3add6970，私有18为输入；实际源码读点计数而非推测SDK调用次数。
`query-identity-phases-qualified-red.log`三个完整公开案例0/3：每个SDK输入实际
3/6/3次完整身份读取。request-input-validation只在当前同步查询内复用成功
physicalPath/stamp元数据，最多8192条，超出直接执行原read；不缓存失败/文本。
外层联合终检清空该表后独立重新扫描，finally丢弃整表，不跨请求或移交READY。
`query-identity-phases-focused-green.log`10/10：每个实际96个SDK输入均为准入+
独立终检2次，文本复读及无实际read的读后检查为0，原答案保持精确。

扩展`query-identity-phases-related-green.log`实际71/72，保留失败。8250个真实
Program filler超过8192上限，未预载输入注入正确-32803；watcher后恢复被原
5000ms watchdog中止。实际content-revision-change创建context2，因256份raw
窗口没有ZZCaller，不能仅凭SourceFile对象复用断言无重建。私有19明确不可采用，
未增大watchdog，也未将该功能恢复失败记成500ms性能结论。

## Slice 18：满raw窗口的关闭文件增量见证（私有20）

在19的私有副本`experiments/lazy-changed-inputs-v1`扩展现有公开用例：raw窗口
满256、编辑关闭ambient成员后，再补全/resolve必须保持原LS并返回精确新成员。
`lazy-changed-inputs-qualified-red.log`2项中1失败，实际context4期望3；0填充的
原案例仍通过。已有TypeScriptContentVersions确实按delta删除script和lazy
snapshot，Host支持惰性读取，因此补齐已证实的delta交付，而非另造LS。

`withChangedDiskDocuments`对缺失changed path仍检查完整成员、删除/reset、
overlay/alias及256个delta上限；经过既有ProjectFileAccessPort的实际token/read
且全部字节合计≤8MiB。raw槽已满时携带path/physicalPath/token/sourceSha256，
不增加raw文档。读后复核物理路径，整组delta原子接受；失败保守重建。
查询后通过同权威端口核验当前字节及物理路径，并注册到独立最终联合围栏。

最小2/2后增加真实final-read窗口注入：读Filler0000时改写B/Globals.d.ts，或
将其ets父目录改名再以symlink指回。后者文件dev/ino/size/mtime/ctime均不变、
physicalPath变化；两者都必须-32803，恢复FS+watcher后精确diskMember并保持LS。
`lazy-changed-inputs-fences-green.log`12/12；再加入8250案例恢复不新增LS断言。
`lazy-changed-inputs-related-green.log`十四个完整文件86/86，无skip/cancel，
235572.204ms，types/build exit0。

8250恢复的独立诊断仍4406.892ms：实际Program8308文件（项目8255/SDK1/其他52），
8254个项目SourceFile对象复用、1新对象；一次createProgram事件2622.265ms，
compiler记录3448.189ms，另reference记录825.924ms。层级不能重复相加，真实
parser次数未测。该生成夹具SDK仅28code units、项目253913code units，degraded2307；
不推广成Photos正常计时、完整SDK或大项目500ms通过。

## Slice 19：全fast终态、路由契约与queue-only trace

固定16原工作区完整`pnpm check:fast`终态1921项、1918通过、3失败、无skip/cancel，
exit1，2819053.502ms；原`check-fast-checkpoint-16.log`及报告独立终态副本保留。
仅一个辅助SDK driver被全fast重建；670源码及75生产runtime不变，严格82文件
核验的1差异保留于原audit及单独解释，不覆盖为全绿。

隔离16副本三文件命令：
`node --test --test-concurrency=1 tests/semantic/references-native-preopen-index-recovery.test.mjs tests/semantic/references-preopen-index-recovery.test.mjs tests/semantic/semantic-queue-trace.test.mjs`。
Node20实际执行，`fast16-repairs-qualified-red.log`1/4通过、3真实失败，与全fast相同。
两索引用例显式`ARKTS_REFERENCES_RESIDENT_FAST_PATH=0`以实际测试索引恢复，
精确Locations、generation、fallback及candidate断言全部保留。队列trace确有
独立问题：type-engine的readiness回调错误依赖references.trace；改为二者任一
开启即可传递，二者关闭仍关闭。`fast16-repairs-green.log`4/4；组合20后
`lazy-changed-inputs-fast-repairs-green.log`再4/4及types/build exit0。

检查18个main输入与冻结16逐字一致后移入，前后SHA/行数保留于
`incremental21-promotion.json`，不改.git、不推送。main types/build exit0，
七个完整公开文件`incremental21-main-public-green.log`23/23，无skip/cancel。
冻结checkpoint21为671源码/82runtime。LS3178、type-engine500、document-store1774
旧债未增；Legacy791→787，其余新修改手写文件≤500。新全fast另验。

正式Photos对照使用16/21，固定13、七文件35及新增resolve56三类，每类三对，
16/21、21/16、16/21顺序，串行新进程/空应用缓存，带探针和正常计时隔离。
仅忽略经过原handle一致性断言的进程内opaque completion data，其余请求和完整
结果逐字段比较；保留失败/超500场次，不重抽目标。初始化degraded2307限制保持。

后续snapshot复用、21恢复回归与冻结22见[接续记录](stable-program-compiler-owned-inputs.md)。
