> Public review copy: raw source, full edits, protocol transcripts and archives remain in the original local workspace. Raw-evidence links point to the retention notice.

# checkpoint-15：初始化事实的性能收益与未通过的正确性边界

2026-10-20。**此候选不可采用：后续扩展回归发现普通引用回退可能发布陈旧结果，
修复和完整资格尚未完成。**保留性能数据：固定Photos目标三轮39次操作全部
≤500ms；七文件试测仍6/35慢操作。不能将局部时延通过等同于优化目标完成。

## 固定输入与单因素对照

本次对照checkpoint-14与checkpoint-15各三轮独立真实LSP进程，顺序14/15、
15/14、14/15；正常计时无并行构建/测试。两者只差readiness实现及其公开测试，
666个源输入中仅这两项变化，runtime82项中三种Worker bundle变化，server不变。
上游父提交仍3add697043380612efe71cef074e5de292422fe2，未提交候选用manifest SHA标识。

Node20.19.5、冻结native、HarmonyOS6.1.1.125/API24 SDK和仓库外Photos夹具均沿用
[checkpoint-14](2026-10-20-stable-program-checkpoint-14.md)的固定输入。
SDK1670、真实Photos574、夹具577、旧native/runtime83、新runtime82及源码666
前后哈希均一致。所有会话仍为degraded2307，不授予READY或完整能力资格。
OS缓存/桌面负载不受控，Mac背景环境沿用先前记录，未重新测量CPU/内存硬件。

变更仅在首次初始化的Program/Checker实际存在后，提前验证已加载输入事实；
即使随后缺失SDK import而degraded，也可留下可再次核验的事实。未转移临时
观察的READY资格或query-refresh意图。普通恢复不新增一次全Program预检查，
输入变化及发布前终检仍须执行。后续发现的回退漏洞来自前片对普通引用证明的
放宽，此处不能据37项局部回归把它视为已满足完整新鲜度合同。

## 正常模式完整响应

六进程78/78预设功能断言通过；checkpoint-14为3/39>500ms，checkpoint-15为
0/39。补全断言指定成员存在，定义断言目标文件/行，rename实际应用四项编辑，
引用与四处Locations逐项相等；不将补全/定义列表声明为穷举完整。

| 操作 | checkpoint-14中位数ms | checkpoint-15中位数ms | 新版范围ms |
| --- | ---: | ---: | ---: |
| 未打开首次补全 | 338.665 | 321.831 | 321.460–325.951 |
| 关闭重开补全 | 282.264 | 281.290 | 269.144–300.394 |
| 关闭重开定义 | 168.626 | 170.304 | 132.677–226.612 |
| rename | 294.390 | 288.354 | 286.590–290.976 |
| 改名后首次引用 | 533.787 | 457.326 | 444.835–459.759 |

新版三次首次引用为444.835 /459.759 /457.326ms。完整逐次顺序、文件、符号、
UTF-16位置及前置状态在operations.csv；仍为PhotoBrowserActionBar.ets的
isVisibility→visibilityQQ、两次关闭重开后的首次四处引用，具体输入与上一报告相同。

初始化中位数14357.313→14664.483ms，单列。进程树250ms采样峰值中位数
820514816→824872960字节，没有证据表明本片降低内存；样本不是精确峰值/PSS。
六轮无采样错误。单轮pilot也通过13次，但不混入这组三轮统计。

独立trace的相同引用步骤中，实际resident-proof读点从operation12的305次SDK
文本读取，移到initialization的305次；引用步骤该读点为0。SDK SourceFile仍为
305个再次观察、0个首次观察；这不是所有IO或parser调用计数。文档准备
188.693ms、编译查询181.762ms，阶段嵌套；305次读取的独占时间未测，不能
把跨进程trace差值全部归为读取本身或代替正常慢样本的组成。

## 七文件工作流：仍有六个慢补全

另建一对pilot，用前次随机清单每模块第一个目标，共七文件，固定顺序执行
未打开补全→打开补全/定义→关闭，第二遍同顺序重开补全/定义。每侧35次。
旧版27/35>500ms，新版6/35；70/70预设断言通过，并逐次比较35对完整归一化
补全/定义签名，无差异。补全签名排除opaque data句柄，保留条目语义和编辑；
定义比较完整Locations并核验返回文本为目标符号。这只是各一次pilot，非三轮资格。

| 步骤 | 文件（均相对Photos根） | 符号、UTF-16零基位置 | 耗时ms |
| --- | --- | --- | ---: |
| 13 未打开首次补全 | feature/thirdselect/src/main/ets/default/common/SmartPickerRecommendTabInfo.ts | recommendType，34:19 | 1443.724 |
| 16 未打开首次补全 | feature/timeline/src/main/ets/view/TimelinePageToolBar.ets | updateToolbar，32:12 | 633.143 |
| 19 未打开首次补全 | product/phone/src/main/ets/ServiceExt/ServiceExtAbility.ts | bindDialogTarget，86:16 | 1428.344 |
| 30 重开补全 | 同第13步 | recommendType，34:19 | 1319.149 |
| 32 重开补全 | 同第16步 | updateToolbar，32:12 | 579.105 |
| 34 重开补全 | 同第19步 | bindDialogTarget，86:16 | 1390.630 |

首次均未打开、无先前查询；重开均open2/close1、version2、先前查询3次，源文本
未改。初始化degraded、语义缓存状态正常计时未测。每次源码行、完整参数及
实际执行顺序保存在workflow-operations.csv和原始响应中。

独立只读探针定位第三选择/手机四次content-revision-change：delta连续、版本
范围正确，但当前查询未交付部分已关闭文件的磁盘快照，type-context-reset的
deliveredPaths检查拒绝复用并退役原LS。第三选择缺两个路径，手机缺五个路径；
原始workspace-observations含具体路径和全部交付集合。根本不是正常压力容量
驱逐；没有据此声称重新解析SDK。公开最小复现也得到正确成员结果但上下文
3→4，证据group-closed-input-red.log。

时间线两次无该上下文退役。独立观测重开时dependency-closure为117.794ms、
cacheHit=false；其余耗时尚未完成互斥计量，不能将约579ms全归于闭包。
未打开入口prepareDiskSnapshot未被该prepare探针覆盖，对应文档准备阶段未测。

## 正确性回归：撤销可采用资格

扩展41项中36通过、5失败；冻结checkpoint-15原样控制9项中4通过、5失败，
确认并非新“交付关闭输入”原型引入。其中一个是真实陈旧引用：320个填充文件
使ZZCaller.ets落在预载窗口之外，无通知等宽修改并恢复mtime后，TargetTwo
查询只返回import位置，遗漏新增构造调用。旧proof已失效，但普通回退未要求
全Program证明，绕过了这个拒绝。不能将它归为测试观测假设或删除位置断言。

另外四个失败是旧路径/批次事件要求，待在恢复新鲜度后独立处理，不直接放宽
功能断言。隔离修复方向为恢复普通完整查询的全Program围栏，并以链接本身、
realpath和目标完整物理身份支持合法symlink；关闭文件增量交付原型另验。
checkpoint-15已记录的局部37/37和39次时延通过都不覆盖此回归。

最新完整fast仍是checkpoint-10的1894/1909 FAIL，未声称当前全量GREEN。
跨组聚合、完整请求共享、统一进程树压力准入、递增规模及所有随机操作500ms
仍待完成；本轮未推送、合并或发布。

[78次主目标操作](local-performance-evidence.md)、
[70次工作流操作](local-performance-evidence.md)、
[汇总](local-performance-evidence.md)、
[190项原始归档及复现](local-performance-evidence.md)、
[冻结版本正确性控制](local-performance-evidence.md)。
