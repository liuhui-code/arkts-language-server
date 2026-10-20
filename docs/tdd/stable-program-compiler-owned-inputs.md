> Public review copy: raw source, full edits, protocol transcripts and archives remain in the original local workspace. Raw-evidence links point to the retention notice.

# 稳定Program后续：编译器持有的快照与源文件读事实

父提交`3add697043380612efe71cef074e5de292422fe2`，Node v20.19.5。
本记录接续[主实施记录](stable-program-optimization.md)的slice19。
所有探针只观察真实worker读点或修改私有夹具，未伪造编译器答案。
日志前缀`.bench/stable-program-v1/`；真实Photos仍只读，未推送/发布。

## Slice20：实际ProjectFileAccess读点揭示LRU重复读取

从冻结21建立`experiments/lazy-source-evidence-v1`，记录原manifest SHA；
node_modules只读复用，native链接冻结baseline，禁止在实验目录cargo/fullfast。
新增公开子进程stdio案例只改Main overlay，128/400/1024个填充根确实参与Program。
每次精确比较改名后的3个Locations、同一LS，观察实际lazy源读取返回和字节数。

`lazy-source-evidence-qualified-red.log`1/3通过、2失败：

| 填充根数 | 未变文件实际复读 | 读取字节 |
| ---: | ---: | ---: |
| 128 | 0 | 0 |
| 400 | 145 | 4205 |
| 1024 | 769 | 22349 |

SourceFile对象大部分复用仍会执行Host读取；代码依据是编译器先请求snapshot，
再更新DocumentRegistry，而独立128条强LRU容不下已加载Program。这里记录的是
实际成功read，不将对象计数写成解析次数。测试耗时带探针，仅作诊断。

抽出`TypeScriptLazySnapshots`，保留原强LRU文件/字节限制及禁用语义。
只有实际权威读取被完整物理身份夹住的snapshot才登记弱记录：路径WeakRef、
snapshot WeakMap；编译器释放snapshot后记录可回收，不额外持有Program/AST。
弱复用仍检查当前admission token和新物理身份，并加入同步请求的独立最终围栏。
变更、移除、成员退役、trim/dispose清理对应弱事实；源码身份函数原样提取共享。
SDK宿主的fallback读取不属于此ProjectFileAccess修复，后续单独计数。

`lazy-source-evidence-minimal-green.log`3/3：上述复读均0，精确位置和原LS保持。
初次types/build通过。GREEN后清理误删了初始化仍使用的readSourceFile字段，
`lazy-source-evidence-refactored-types.log`明确TS2339；随后的无效回归被终止，
`lazy-source-evidence-interrupted.json`及失败日志保留，不授予资格。
恢复字段后types/build通过，完整7文件`lazy-source-evidence-restored-related-green.log`
33/34，唯一失败继续作下一slice的真实回归，不能写成完整通过。

## Slice21：已知源增量必须建立新的真实读事实

失败为既有公开`project-membership-language-service.test.mjs`第一例：300个填充
文件，未打开目标在256预载外。磁盘类名`ZzzRemoteTarget→ZzzRenamedTarget`，
watcher type2、Main didChange v3后，补全报-32803。冻结16/19各1通过、8名称
过滤skip；冻结21各次1失败、8skip。源于slice18保持LS后沿用旧source lookup
事实，非本次弱snapshot新增。原控制和拒绝栈保留于
[独立证据](../reports/local-performance-evidence.md)。

实际worker栈定位LoadedConfigurationWitness.scan：该文件旧53字节身份仍与新54
字节比较。保留LS后，旧存在性lookup还持有旧源字节身份；不能整体reset配置证明，
也不能只凭通知重盖旧stamp。仅对完整成员内、已知delta且非SDK路径，经原token/read
端口实际重读源文件，以完整before/after guard重建该文件自己的已加载事实。
原其他配置、目录、缺失路径及SDK证明保持；失败使当前资格撤销。

`changed-source-witness-minimal-green.log`原公开失败1通过、8过滤skip，答案未改。
补充3个真正stdio案例：正常增量保留原LS；同时未通知改SDK metadata仍-32803；
在新源读取final-fstat返回期间等宽改写并恢复mtime，拒绝当前结果，watcher后精确
恢复markerEnd。三项均通过。日志名`changed-source-witness-fences-red.log`虽预期
寻找恢复反例，实际3/3通过；这是已验证的反例覆盖，不当作RED。

15个完整公开/组件文件`lazy-source-and-changed-read-broad-green.log`93/93，无
skip/cancel，247066.985ms。包括真实SDK字节/配置、文件alias、取消、预算、关闭
重开、READY发布窗口和8250输入终检。清单新增2入口的RED保留；完整清单最终
`lazy-source-inventory-qualified-green.log`4/4，入口228→230、bundle108→110。

8250恢复诊断1888.389ms，仍FAIL500：实际Program8308（项目8255/SDK1/其他52），
项目对象8254复用、1新观察；compiler记录1011.648ms，其中createProgram786.828ms。
与此前4.4s诊断不属于正常串行配对，不据此计算正式收益或独占占比。

## 移入与冻结22

确认11个main输入逐字匹配冻结21后移入，前后SHA/行数见`incremental22-promotion.json`。
main types/build通过；9个完整公开/清单文件`incremental22-main-public-green.log`
39/39，无skip/cancel，73735.594ms。冻结22为677源码、82runtime。
LS3178→3097、resident-state328→310；新helper131/20行，其他新测试/脚本≤500。

21的Photos正常312次达标仍保留，但扩展恢复回归使其整体不可采用。21全fast在
独立复现后主动中断，856个通过标题不代表完整结果，exit-15，原日志及终态
[另存](../reports/local-performance-evidence.md)。
75个生产runtime、671源码未变；辅助sdk-discovery driver重建的严格核验失败保留。

22使用固定16作安全速度对照，三套Photos及噪声0/128/512、合成总数64/256/1024/2048
各3对串行新进程，正常计时不混跑其他检查。SDK、代码、目标、模式及原始逐次
输入均固定；实际语义根、SDK Host读、解析器、import扫描和Program另作独立计数。
正式性能、新全fast、规模/长时及剩余架构门槛继续验收，不能用局部GREEN宣告完成。

正式16/22比较54正常场、18独立trace完成：546组完整答案一致，原Photos312次
全≤500ms，扩大规模仍13/546次超标。SDK Host仍读取305份文本，实际SDK解析0；
部分多owner实际项目文本仍复读，不能将单owner弱记录测试推广成全面消除。
[报告22](../reports/2026-10-20-stable-program-checkpoint-22.md)保留全部慢样本和边界。
72场2004成员归档43812751 bytes，SHA
`ec3171475c8775bf3ef76987a1db8461bd761099d109e70c7fa6773d8a77a6d9`，逐成员校验通过。

## Slice22：Host复用编译器真正持有的SDK snapshot

从冻结22建立`experiments/shared-compiler-snapshots-v1`，原manifest SHA
`784a84e8b777367a5fef07fd96860117603817aa9173a7bf37713ba90f327530`。
加强既有真实stdio用例，计数实际Host fallback成功返回的文本读取及字节数，
保留完整3处Locations、初始化READY/degraded和每SDK两次原生身份检查。
`shared-compiler-snapshot-qualified-red.log`0/3：每例仍读96份SDK、4790 bytes，
旧SourceFile读事实计数已为0，证明旧测试覆盖的不是Host复读。

新`CompilerSourceReadFacts`按实际reader函数身份隔离，仅在SourceState原有精确
文本验证和完整前后身份通过后记录实际SourceFile.scriptSnapshot。纯读事实共享，
owner的配置/范围/READY/adoptProof约束保持；弱路径索引和snapshot弱键不持有
SourceFile/Program。Host借用前检查新完整身份并登记独立最终联合验证；未知或
已失效snapshot仍走实际读取，未修改SDK版本/内容判据，也未改ProjectFileAccess。

最小3/3 GREEN，每例实际SDK Host读取96→0，96个输入仍各2次身份检查。
相关16完整公开/组件文件101/101，无skip/cancel，250719.810443ms，含SDK文本/
metadata/父目录retarget、alias、取消、READY发布窗口、关闭重开及8250输入围栏。
types/build通过；日志`shared-compiler-snapshot-minimal-{green,types,build}.log`和
`shared-compiler-snapshot-related-green.log`。尚未正式配对计时，不宣称已达500ms。

核对main原22输入SHA后移入5个文件，记录`incremental23-promotion.json`。main
types/build及4个完整公开文件23/23通过，无skip/cancel，39797.871666ms，含
原关闭源补全恢复和SDK物理父目录retarget。冻结23为678源码/82runtime，LS3097
未增行，resident-state310→303。公开反例复现入口（Node20、私有副本cwd）为：

[Detailed commands and examples remain in the local original report.]

54场正常22/23对照已完成，546组完整结果一致；新版超标14→9次，原Photos312次
全≤500ms，1024首次编辑引用491–494ms，Photos+512仍554–597ms，2048首次引用
610–621ms、rename529–535ms，逐次500ms仍FAIL。2048第一对还有负收益，保留全部。
输入/runtime/源码前后核验零漂移；独立trace18场364次精确匹配正常结果，无溢出。
SDK Host真实文本读305/255→0、其他库52→0，当前/独立终检仍305/305或255/255。
2048仍实际Port读1664份；1024两trace的项目复读差异不等于本轮已经实现跨owner
Port复用，GC/cache原因未测。诊断compiler1389.910ms不能分摊正常约612ms。
[报告23](../reports/2026-10-20-stable-program-checkpoint-23.md)及逐次CSV保持当前状态。
72场7797成员归档74675212 bytes、逐SHA核验，另保留7套完整夹具字节；SHA
`f334fa6669aab2eb0fe83c30f6f4347f9b9b699ee0992e837bc0aec8fd9de483`。
144个记录PID均退出；新全fast、规模/长期/完整READY及剩余架构门槛继续开放。

封存后`git diff --check`发现resident-state末尾多一个空行，仅清理此空行，303→302。
重建82runtime逐字节SHA与冻结23全部一致，源码仅此空行差异；types/公开3用例
再GREEN，4234.906713ms，相关diff检查GREEN。原归档不改；日志、前后SHA和patch
另存报告23的`formatting-addendum/`，不将此格式修正伪装成新的性能实验。
