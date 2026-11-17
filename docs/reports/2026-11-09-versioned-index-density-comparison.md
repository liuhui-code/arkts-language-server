# 版本化索引：固定文件数的体量与引用密度对照

本矩阵完成：**72个测量会话＋1独立校准＋24个独立诊断，97/97 PASS**。
北京时间2026-11-09 05:03:36至05:50:10，属于97个不同进程会话，不能算作单会话耐久时长。
逐次核对正常关闭、进程退出、结构/外键检查、进度终态和产物身份无异常；六份夹具hash及文件集保持一致。
所有普通分组均为3个独立串行会话；不合并校准、冷暖、版本或诊断数据。

## 身份与控制变量

- baseline：固定298d65f5d7f796c347fe8be5c739e428066489d8的原77资产安装包。
- candidate：父298d加当前冻结候选，源快照93d200fb012381d1255602b6f0967124d9811aac802cf62213b9a618b1379a1f，
  完整79资产；运行位置final-acceptance-13/runtime，非原父版本或日常部署。
- Node20.19.5、相同SDK/目标/参数/请求顺序；SDK部分声明不完整，原样保留。
- 每夹具2048个源码，Main.ets静态只依赖lib/Counter.ets；无关文件2046。
  静态闭包2文件、1条import边、深度1/扇出1，不代表实际Compiler Program只有2文件。
- 体量：目标Main.ets精确16384/65536/524288字节，引用3处。用一个ASCII字面量填充，
  并不代表任意大函数/复杂控制流。引用密度：Main.ets固定262144字节，引用3/128/2048处；
  增加构造调用同时增加AST节点，不能把两者完全分离。
- cold为新进程＋空应用索引，warm为新进程＋保留索引；OS页缓存未控制，warm并非旧Program驻留。
  表中的首次请求均在初始化/准备及完整Native索引ready后发出，不含此前阶段。
- query位置固定为Main.ets中new Counter的Counter。顺序：首次/重复定义、补全、引用、rename；
  overlay追加注释后首次/重复引用与定义，撤销后定义，关闭重开后补全/定义，再测试源声明rename。
  rename只核验返回完整编辑集，未应用；注释编辑不是语义改名，Native持久写入规模另有实验。
- ordinary保留外部资源采样、队列日志、Worker内存指标；不启用references语义统计或Native原始tee。
  profile另加这两项，时延不混入普通表；均是协议驱动，不是UI。

## 普通计时（每格3轮，中位/最大，毫秒）

“编辑首次引用”是overlay变更后独立请求；不含先前rename请求耗时。初始化准备和Native ready是重叠墙钟区间，
仅在原始摘要中分别记录，不相加。result-cache命中未实测；重复/热请求不能自动称命中。

| factor | version | session | completion first | definition first | references first | rename | edit-first references | reopen completion |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 16KiB / 3 refs | baseline | cold | 133.27/146.09 | 312.91/342.03 | 351.88/364.07 | 144.42/162.15 | 779.08/862.93 | 290.02/446.71 |
| 64KiB / 3 refs | baseline | cold | 149.70/153.44 | 229.93/293.05 | 364.77/369.69 | 158.10/164.96 | 754.47/766.27 | 284.21/296.06 |
| 512KiB / 3 refs | baseline | cold | 135.07/160.49 | 329.37/365.04 | 543.20/548.34 | 132.88/171.95 | 768.87/791.30 | 289.99/297.02 |
| 16KiB / 3 refs | baseline | warm | 155.88/158.22 | 219.16/222.58 | 366.29/371.69 | 172.43/172.96 | 752.18/960.59 | 278.07/490.90 |
| 64KiB / 3 refs | baseline | warm | 153.38/156.63 | 220.84/319.83 | 362.64/366.02 | 197.96/202.88 | 757.87/768.59 | 284.39/322.93 |
| 512KiB / 3 refs | baseline | warm | 134.43/137.24 | 376.65/388.97 | 537.58/547.49 | 141.01/161.09 | 771.53/787.24 | 302.06/302.14 |
| 16KiB / 3 refs | candidate | cold | 132.29/150.70 | 286.97/300.72 | 353.68/365.33 | 193.53/198.24 | 747.79/749.89 | 266.21/278.64 |
| 64KiB / 3 refs | candidate | cold | 152.00/153.23 | 221.19/222.40 | 362.16/371.81 | 196.80/256.55 | 754.97/788.79 | 263.43/284.64 |
| 512KiB / 3 refs | candidate | cold | 136.36/158.38 | 342.22/362.05 | 538.67/571.57 | 90.88/199.08 | 774.60/782.34 | 290.86/298.33 |
| 16KiB / 3 refs | candidate | warm | 134.26/136.36 | 276.84/302.83 | 353.85/356.05 | 196.06/202.25 | 742.86/749.79 | 262.32/268.06 |
| 64KiB / 3 refs | candidate | warm | 134.68/135.01 | 289.68/326.84 | 357.48/359.37 | 186.36/199.21 | 745.13/749.35 | 271.60/326.80 |
| 512KiB / 3 refs | candidate | warm | 134.42/160.82 | 364.90/366.82 | 559.91/565.60 | 97.98/166.25 | 772.99/786.53 | 297.14/302.45 |
| 256KiB / 3 refs | baseline | cold | 130.73/134.82 | 349.44/351.31 | 363.41/367.13 | 158.33/220.88 | 769.62/773.75 | 301.13/316.61 |
| 256KiB / 128 refs | baseline | cold | 153.30/154.15 | 240.17/311.48 | 424.88/516.57 | 230.70/250.21 | 786.32/807.34 | 276.83/283.62 |
| 256KiB / 2048 refs | baseline | cold | 139.70/141.24 | 349.22/361.56 | 745.31/798.07 | 224.58/244.00 | 1304.40/1308.08 | 779.00/782.99 |
| 256KiB / 3 refs | baseline | warm | 132.22/140.28 | 321.57/333.31 | 496.74/542.44 | 97.34/178.85 | 760.37/773.84 | 283.37/292.62 |
| 256KiB / 128 refs | baseline | warm | 137.02/148.15 | 305.20/346.14 | 396.05/596.74 | 244.81/258.26 | 772.22/788.10 | 284.04/290.29 |
| 256KiB / 2048 refs | baseline | warm | 139.21/141.70 | 355.19/371.00 | 727.21/791.92 | 222.24/238.54 | 1280.91/1297.13 | 789.94/893.51 |
| 256KiB / 3 refs | candidate | cold | 138.45/157.83 | 307.49/356.58 | 382.15/501.63 | 165.74/215.69 | 766.35/784.57 | 284.52/290.66 |
| 256KiB / 128 refs | candidate | cold | 135.08/155.67 | 339.01/344.28 | 380.07/394.13 | 267.56/270.96 | 790.78/793.63 | 278.23/282.95 |
| 256KiB / 2048 refs | candidate | cold | 140.29/145.47 | 359.80/384.35 | 738.76/791.43 | 214.14/238.65 | 1276.09/1306.30 | 787.46/809.18 |
| 256KiB / 3 refs | candidate | warm | 139.46/156.04 | 328.30/339.92 | 360.73/373.57 | 177.00/197.88 | 769.03/777.28 | 293.43/300.97 |
| 256KiB / 128 refs | candidate | warm | 147.40/151.57 | 238.79/360.04 | 394.59/409.10 | 206.47/268.62 | 788.79/790.59 | 291.01/293.06 |
| 256KiB / 2048 refs | candidate | warm | 140.39/143.21 | 356.03/364.43 | 733.16/779.39 | 217.48/220.00 | 1272.35/1285.73 | 784.02/800.01 |


## 已观测趋势与不能推断的部分

- **初始化口径纠正**：原始`indexReadyMs`记录的是等待语义准备后才读取ready状态的观察时刻，
  并非Native实际完成事件。例如候选16KiB cold，三轮Native终态事件中位/最大1566/1671ms，
  语义准备等待10450.78/10452.82ms，后续ready观察10607/10609ms。
  原始结果不改写；`ordinary72-native-ready-event-timings.json`按`catalog.endedAt-startedAt`另算各档，
  不能把10秒全归给Native或SDK，也不能相加重叠区间。`ordinary73-summary.json`的原字段遵守此解释。
- 全72个普通测量会话的采样独立峰：语言服务Node954.86MiB、Native36.05MiB、进程树977.83MiB。
  Worker线程的RSS不另加一次；这些峰未必同时发生，不是PSS或物理内存分解。
- 候选冷启动首引用：16KiB的353.68ms至512KiB的538.67ms；编辑后首引用747.79至774.60ms。
  该字面量体量范围没有使所有操作同步或单调放大；不能由三档拟合通用复杂度。
- 候选冷启动引用3→2048：首次引用382.15→738.76ms，编辑后首次766.35→1276.09ms，
  关闭重开补全284.52→787.46ms；旧版相应也有增长。字节数固定，不是无关文件数量增加。
- 首次定义及rename没有随每档引用数量单调增长；小样本和操作前序状态不支持统一复杂度结论。
- 本次主要改变Native持久facts维护，不能把相近的语义查询耗时称为该索引优化已消除语义成本；
  也不从某个中位下降或最大值波动宣称稳定加速。内部排队/Program/解析/IO具体组成本表未测。
- 初始化degraded状态、SDK不完整、固定2048文件下的Program实际成员数需结合独立诊断解释。
  此夹具引用/rename有完整oracle成功，不可外推30K Photos全量引用/rename已支持。
- 24个独立诊断的168个语义观察事件（144个definition、24个references）均为：Program项目文件2048、总SourceFile2417、
  项目root2048、总root2050、SDK文件256、其他文件113。两文件静态闭包没有成为两文件Program。
  冻结候选`src/core/types/typescript-language-service.ts:1787/1838`更新membership并交给Host roots；
  `typescript-host-file-names.ts:113`在无独立semanticRoots且membership完整时直接使用membership，
  `typescript-language-service.ts:1658`提供给编译器。此处明确保留旧行为，非本索引写入特性的修复范围。
  `createProgramEvents=0`只指该受测回调未观察到构建，不代表初始化/前置阶段没有构建；
  `programSequence`及AST对象重用计数也不是全局构建/解析调用次数。
- 文件总数增长实验在2026-11-08-versioned-index-scale-comparison.md，属于先前包身份；
  当前语义Worker哈希相同不能把其中Native初始化计时冒充本候选重测。当前Native复核排在本矩阵之后。

## 原始数据与可复现入口

`.bench/index-versioned-maintenance-20261104/density-acceptance-14/`：
`execution.json`、`configs/`、`fixtures/*.manifest.json`、`runs/*/result.json`、逐请求/进度/日志/资源/DB检查。
`ordinary73-summary.json` 保留所有类别及每次请求证据，`ordinary72-compact-timings.json` 为上表来源。
`ordinary73-analysis-receipt.json` 绑定73个原始result哈希及当前分析器/测试哈希，当前6项分析控制通过。
`timing-mode-scope.json` 定义观察开销边界。原density13的ps权限失败保留，未混入14的三轮计时。
`all97-summary.json`分别保留全部普通/诊断分组；`all97-postflight-and-program-observations.json`
绑定97个结果hash及24个诊断的Program/AST对象观察；`matrix-and-fixture-postflight.json`核对完整97个预期tag无遗漏/重复。
后续Photos保留缓存重开另有外部完整性检查60秒超时，单独诊断，不把这里的97次成功冒充该重开验收通过。

复现入口为该目录`execute-after-main.py`，固定Node20及SDK，串行普通3轮/独立诊断1轮，
原控制收据/原始Photos电源与恢复证明必须匹配；复跑应准备新目录，不能覆盖现有fixtures/runs/index。
本轮未改产品、超时/内存阈值、断言或用户真实缓存，未部署/发布/合并。


## 2026-11-10 current IX18 / density29 controller checkpoint

New candidate only; earlier runs remain historical evidence. All72 formal ordinary cells are controller-recordedPASS,
exit0, across6conditions x2versions x3trials x2cache states. The one calibration is separate:
`bytes-16384-3-candidate--1-ordinary-cold` has trial-1 despite the word ordinary in its tag; it is NOT a73rd formal sample.
Fixed2048 project sources/static2-file closure. Byte conditions16384/65536/524288 with referenceCount3;
reference conditions3/128/2048 with targetFileBytes262144. Actual Program coverage is separate, not inferred.
`namespace-final-20261109/density29-ordinary-controller-checkpoint.json` and immutable controller snapshot
preserve each result path/status/exit and complete3x2x2 grids. This is not an independent payload/closure/resource audit.
Raw result files total100104732bytes; their bulk parsing is deferred while trace/topology timings run.
No medians are manufactured from controller rows. Independent density traces are running; topology waits.
Current Windows read-only SSH check again timed out; no Windows/UI validation or deployment occurred.


### Density29 terminal controller update

Session47273 actually exited0. All96formal cells (72ordinary/24trace) and1separate calibration are controller-recordedPASS.
Immutable terminal snapshot/receipt: `namespace-final-20261109/density29-terminal-controller-snapshot.json`,
`density29-full-execution-receipt.json`. Earlier live checkpoint retains its timestamp and limited scope.
This confirms execution termination, not independent bulk result/resource/closure audit or complete platform acceptance.
Topology30 has actually started. Raw payload statistics, final SDK/power and resource/native review wait until
serial timed controls finish; ordinary and diagnostic trace distributions remain separate.


## Closed three-trial density matrix, frozen f33288b9

Pre-SCALE004 read-path optimization candidate; not current IX19 acceptance. Parent298d65f and
f33288b9 candidate use pinned Node20.19.5/partialAPI24 SDK and identical condition/query inputs,
paired/reversed version order across3serial ordinary trials. Cold=empty application cache/new
process; warm=retained index/new process, NOT a hot Program or proven result-cache hit. Physical
OS cache uncontrolled.17operations validate exact locations/versioned edit sets; completion checks
expected member presence. Rename edits were not applied; overlay comment edit precedes first
references. Target remains Main.ets Counter. All ordinary cells have normal closure/observed-process
closure/integrity and unchanged artifact claims; separate endpoint audit rehashed actual runtime/SDK.

72ordinary cellsPASS,24separate trace cellsPASS,1calibrationPASS. Project count2048;
static target closure2files/1edge. Byte axis uses Main16384/65536/524288bytes at3locations;
reference axis3/128/2048locations at262144target bytes. Byte growth is a single literal, not
control-flow complexity; reference growth necessarily changes AST node count.24closed profiles
observe2417Program sources=2048project+256SDK+113other,2050roots=2048project+2SDK.
This is post-query diagnostic coverage, not ordinary-cell measured parsing/build counts.

Within this range target-byte growth has modest first-definition change and no monotonic
completion or rename increase. Reference density raises edit-first-reference median from1830.4
to2277.3ms and local rename1117.9->1240.4ms (candidate cold); payload/search/node count can
contribute, but their exclusive shares were not measured. No O(N) or quadratic conclusion follows.

Condition format: axis /targetFileBytes /referenceLocations.

All latency cells are median/max milliseconds across3ordinary trials, with errors kept separate.
Full17-operation distributions remain in the raw summary; the table selects the requested first operations.

| condition | version | cache/process | completion | definition | local rename | origin rename | edit-first references |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| bytes / 16384 / 3 | candidate | cold | 256.59/258.25 | 212.25/216.20 | 1102.62/1160.39 | 1342.64/1366.02 | 1808.74/1823.87 |
| bytes / 16384 / 3 | candidate | warm | 321.84/330.17 | 209.05/220.90 | 1122.95/1160.25 | 1335.48/1374.65 | 1817.01/1823.70 |
| bytes / 16384 / 3 | baseline | cold | 151.67/246.08 | 216.91/219.71 | 166.36/192.60 | 90.82/91.23 | 763.78/973.73 |
| bytes / 16384 / 3 | baseline | warm | 155.41/258.85 | 211.89/220.04 | 186.58/192.50 | 131.29/131.51 | 765.53/963.67 |
| bytes / 65536 / 3 | candidate | cold | 201.46/201.86 | 222.86/225.88 | 1094.20/1106.83 | 1342.65/1344.58 | 1800.09/1813.78 |
| bytes / 65536 / 3 | candidate | warm | 200.60/260.78 | 217.78/220.22 | 1101.50/1120.82 | 1351.46/1367.97 | 1808.91/1869.86 |
| bytes / 65536 / 3 | baseline | cold | 242.06/261.67 | 212.52/213.80 | 80.31/164.43 | 95.11/96.61 | 960.73/972.17 |
| bytes / 65536 / 3 | baseline | warm | 158.42/245.95 | 215.81/219.06 | 163.35/190.08 | 153.33/159.93 | 773.22/961.33 |
| bytes / 524288 / 3 | candidate | cold | 205.07/267.81 | 239.48/242.55 | 1111.28/1111.88 | 1351.67/1353.91 | 1837.53/1861.13 |
| bytes / 524288 / 3 | candidate | warm | 202.43/207.09 | 239.46/241.71 | 1108.37/1120.67 | 1357.65/1376.04 | 1847.55/1865.22 |
| bytes / 524288 / 3 | baseline | cold | 155.58/163.81 | 243.40/251.54 | 186.34/259.90 | 92.64/93.91 | 767.28/771.36 |
| bytes / 524288 / 3 | baseline | warm | 160.20/263.56 | 241.49/243.29 | 176.20/202.23 | 92.21/93.85 | 788.36/963.27 |
| references / 262144 / 3 | candidate | cold | 202.59/205.90 | 227.67/228.07 | 1117.87/1135.90 | 1353.30/1356.00 | 1830.36/1835.43 |
| references / 262144 / 3 | candidate | warm | 201.88/263.82 | 232.39/242.32 | 1109.45/1120.81 | 1364.14/1366.64 | 1838.23/1893.71 |
| references / 262144 / 3 | baseline | cold | 155.01/268.71 | 230.13/311.96 | 139.45/171.00 | 100.97/101.79 | 844.45/968.67 |
| references / 262144 / 3 | baseline | warm | 156.73/270.73 | 233.09/233.44 | 198.37/198.74 | 92.61/99.50 | 787.26/903.53 |
| references / 262144 / 128 | candidate | cold | 265.41/267.41 | 228.76/234.10 | 1127.15/1171.65 | 1368.07/1422.22 | 1875.99/1883.24 |
| references / 262144 / 128 | candidate | warm | 189.45/191.63 | 237.45/245.27 | 1118.53/1128.62 | 1364.61/1365.26 | 1847.93/1850.61 |
| references / 262144 / 128 | baseline | cold | 148.23/148.46 | 229.14/231.97 | 215.59/218.04 | 98.43/99.89 | 776.34/791.89 |
| references / 262144 / 128 | baseline | warm | 257.56/261.57 | 227.96/230.76 | 98.02/98.52 | 130.84/140.45 | 819.22/830.54 |
| references / 262144 / 2048 | candidate | cold | 183.04/184.39 | 244.90/246.12 | 1240.45/1262.26 | 1489.22/1499.49 | 2277.29/2285.07 |
| references / 262144 / 2048 | candidate | warm | 184.24/185.50 | 243.87/244.69 | 1246.53/1252.87 | 1479.41/1502.41 | 2269.83/2284.08 |
| references / 262144 / 2048 | baseline | cold | 139.61/330.09 | 246.10/246.82 | 234.89/244.21 | 231.64/236.38 | 1246.79/1253.07 |
| references / 262144 / 2048 | baseline | warm | 138.23/138.83 | 240.46/246.84 | 239.67/245.68 | 232.29/251.60 | 1238.92/1243.20 |

Initialization/index times are overlapping clocks, not additive stages. Resource values below
are median/max of each run's sampled peaks, MiB; Node includes Worker threads, Native separately,
tree includes auxiliary descendants. Peaks are not simultaneous and RSS is not PSS.

| condition | version | cache | init+prepare ms | index ready elapsed ms | Node peak MiB | Native peak MiB | tree peak MiB |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| bytes / 16384 / 3 | candidate | cold | 10243.63/10244.60 | 10401.00/10401.00 | 954.13/962.66 | 14.12/14.25 | 968.38/976.79 |
| bytes / 16384 / 3 | candidate | warm | 10140.16/10160.01 | 10296.00/10317.00 | 958.69/963.80 | 17.28/18.65 | 975.74/982.37 |
| bytes / 16384 / 3 | baseline | cold | 10349.97/10354.44 | 10504.00/10507.00 | 886.96/887.20 | 20.89/20.94 | 907.79/908.13 |
| bytes / 16384 / 3 | baseline | warm | 10239.58/10243.41 | 10397.00/10400.00 | 879.85/880.77 | 6.30/6.31 | 886.16/887.07 |
| bytes / 65536 / 3 | candidate | cold | 10255.29/10350.81 | 10411.00/10505.00 | 958.20/958.46 | 14.03/14.46 | 971.91/972.49 |
| bytes / 65536 / 3 | candidate | warm | 10260.81/10350.88 | 10417.00/10505.00 | 958.15/963.46 | 17.80/18.95 | 975.74/981.27 |
| bytes / 65536 / 3 | baseline | cold | 10245.80/10351.63 | 10400.00/10505.00 | 885.01/891.13 | 20.84/20.92 | 905.86/912.05 |
| bytes / 65536 / 3 | baseline | warm | 10252.71/10261.08 | 10406.00/10416.00 | 877.36/890.04 | 6.32/6.32 | 883.66/896.36 |
| bytes / 524288 / 3 | candidate | cold | 10242.10/10242.29 | 10394.00/10401.00 | 970.93/976.60 | 14.41/14.59 | 985.08/991.01 |
| bytes / 524288 / 3 | candidate | warm | 10247.01/10337.58 | 10405.00/10504.00 | 964.41/966.04 | 18.63/19.05 | 982.91/985.09 |
| bytes / 524288 / 3 | baseline | cold | 10432.65/10446.91 | 10603.00/10608.00 | 885.17/890.77 | 21.68/21.68 | 906.85/912.39 |
| bytes / 524288 / 3 | baseline | warm | 10241.33/10249.05 | 10397.00/10407.00 | 889.68/891.17 | 6.79/6.86 | 896.45/898.03 |
| references / 262144 / 3 | candidate | cold | 10349.37/10353.40 | 10501.00/10509.00 | 951.36/960.57 | 14.17/14.54 | 965.32/975.11 |
| references / 262144 / 3 | candidate | warm | 10246.14/10345.92 | 10404.00/10502.00 | 960.50/962.39 | 18.06/18.76 | 977.97/980.45 |
| references / 262144 / 3 | baseline | cold | 10353.19/10354.24 | 10506.00/10508.00 | 890.32/890.41 | 21.41/21.43 | 911.75/911.81 |
| references / 262144 / 3 | baseline | warm | 10234.99/10344.54 | 10291.00/10504.00 | 886.46/886.79 | 6.22/6.24 | 892.61/893.00 |
| references / 262144 / 128 | candidate | cold | 10245.46/10248.28 | 10400.00/10401.00 | 968.04/979.63 | 14.84/15.18 | 983.22/994.47 |
| references / 262144 / 128 | candidate | warm | 10246.12/10348.05 | 10404.00/10508.00 | 970.00/987.96 | 18.76/18.88 | 988.75/1006.84 |
| references / 262144 / 128 | baseline | cold | 10350.92/10352.37 | 10504.00/10506.00 | 891.46/895.10 | 22.60/22.61 | 914.08/917.68 |
| references / 262144 / 128 | baseline | warm | 10135.07/10135.07 | 10293.00/10293.00 | 886.09/889.62 | 6.19/6.25 | 892.27/895.86 |
| references / 262144 / 2048 | candidate | cold | 10438.13/10443.00 | 10602.00/10605.00 | 1061.40/1075.37 | 20.26/20.41 | 1081.66/1095.61 |
| references / 262144 / 2048 | candidate | warm | 10437.38/10538.87 | 10605.00/10704.00 | 1074.11/1078.56 | 19.05/19.41 | 1093.00/1097.98 |
| references / 262144 / 2048 | baseline | cold | 10532.02/10637.84 | 10698.00/10798.00 | 943.78/949.45 | 35.79/35.82 | 979.60/985.14 |
| references / 262144 / 2048 | baseline | warm | 10438.25/10540.55 | 10605.00/10703.00 | 943.70/945.96 | 6.30/6.32 | 950.02/952.27 |

Actual source bytes for all15density/topology fixtures (30720sources total) match preserved
manifests at endpoint, whose hashes match all180ordinary configs. This is not continuous byte
identity proof. Stats extraction passed6CLI tests and a byte-identical replay; it does not replace
the original LSP payload oracle. The profile helper's prior scale-only static-closure mapping
was extended through RED/GREEN before density extraction; density2 is not Program2048.
The old scale output replays byte-identically with the original relative input spelling.

Evidence under namespace-final-20261109:
- density29-ordinary-three-trial-factor-summary-01.json and its byte-identical replay.
- density29-profile-program-observations-qualified-01.json.
- factor-metrics-cli-proof.json and profile-program-static-closure-v2-proof.json.
- density29-topology30-fixture-endpoint-byte-audit.json.
- serial-matrices-endpoint-audit-20261110.json (actual runtime/SDK/power endpoints).

SCALE004's pre/post full namespace capture remains the primary measured rename overhead in the
separate20K probe, not inferred from these correlations. The first redundant-path optimization
is implemented but its full gate/replay remains incomplete. Parent speed does not erase its
known unnotified-input completeness failures. No incomplete edit set, removed freshness check,
UI/Windows success, OOM fix or constant-time large-project claim is made here.


## Current IX20 density34: terminal ordinary controls

Source68aa4629; separate from predecessor29 above. Controller terminated97runs:72ordinary,24trace,1calibration. The72ordinary cells allPASS. Each table cell is three independent serial fresh-server trials, milliseconds median/max. Cold/warm means empty/reused persisted index, not same-session result-cache hit or OS cache control. Total2048sources; static target closure2, actual Program count remains separately unaggregated. Full profile and endpoint audit are pending; protocol results do not certify UI.

| Factor/value | Index state | Completion first | Definition first | Rename first | Edited first references |
| --- | --- | --- | --- | --- | --- |
| bytes / 16384 / 3 | cold | 320.23/323.17 | 214.48/214.58 | 1014.62/1029.30 | 1730.17/1732.05 |
| bytes / 16384 / 3 | warm | 316.25/319.67 | 215.02/220.21 | 1025.93/1030.04 | 1714.81/1725.77 |
| bytes / 65536 / 3 | cold | 256.46/326.62 | 219.83/222.41 | 1022.43/1025.55 | 1777.25/1815.73 |
| bytes / 65536 / 3 | warm | 199.37/256.16 | 218.43/218.71 | 1027.94/1029.79 | 1759.86/1805.93 |
| bytes / 524288 / 3 | cold | 206.53/345.52 | 244.76/248.22 | 1029.34/1032.47 | 1773.39/1783.68 |
| bytes / 524288 / 3 | warm | 263.14/264.41 | 240.66/248.24 | 1042.48/1050.03 | 1770.53/1791.31 |
| references / 262144 / 3 | cold | 203.41/335.41 | 231.34/232.13 | 1049.50/1052.94 | 1781.90/1804.74 |
| references / 262144 / 3 | warm | 204.45/260.02 | 231.73/235.46 | 1036.21/1051.16 | 1769.55/1831.29 |
| references / 262144 / 128 | cold | 193.67/261.53 | 232.07/234.92 | 1057.77/1075.12 | 1791.97/1793.46 |
| references / 262144 / 128 | warm | 195.30/198.47 | 231.62/240.08 | 1050.41/1059.92 | 1782.61/1793.53 |
| references / 262144 / 2048 | cold | 183.25/343.58 | 239.48/240.96 | 1191.94/1197.49 | 2103.52/2193.39 |
| references / 262144 / 2048 | warm | 185.89/364.20 | 240.89/268.21 | 1168.50/1179.86 | 2104.03/2145.45 |

At fixed2048total sources, larger target bytes show a modest definition increase but no monotonic completion improvement or general complexity proof. Increasing actual reference locations from3to2048 at fixed262144target bytes increases warm rename median1036.21→1168.50ms and edited references1769.55→2104.03ms. Real result cardinality and validation work differ; file count is controlled. These observations neither identify exclusive CPU stages nor erase the separately measured global-N namespace proof cost. The first admitted-read optimization has not demonstrated end-to-end scale speedup.500ms remains an experience target, not a functional failure threshold.

Evidence: `namespace-final-20261109/density34-ordinary-qualified-summary-01.json`, with each raw result path/SHA and runtime identity; generated by the existing tested `session-analysis/factor_metrics.py` from `density-acceptance-34/execution.json`. No product or frozen timing runtime changed.


### 2026-11-11: terminal endpoint qualification supplement

All current scale33/density34/topology35 controllers are terminal (129/97/145
recorded runs respectively). The closed-matrix audit verified2441 source inputs,
158 candidate/baseline runtime assets,135072 fixture source files and3536 SDK
inputs against their pinned manifests, and checked the logged power windows.
Audit status is PASS_ENDPOINTS_LOGGED_POWER_NOT_FUNCTIONAL_ACCEPTANCE, receipt
namespace-final-20261109/closed-matrices-33-35-endpoint-02/result.json.
It supersedes earlier RUNNING/endpoint-pending notices only. It does not erase
baseline failed cells, partial/full-scope errors or turn protocol runs into UI
acceptance; profile-stage aggregation and successor-format validation are distinct.


### 2026-11-11 current profile Program-size observations

The tested closed-log extractor has now processed the current32 scale profiles,
24 density profiles and36 topology profiles. It found112/96/144 single matched
post-query observations respectively. Scale additionally has4 missing/ambiguous
and12 not-executed observations; they remain UNMEASURED. This is separate from
ordinary timing and counts Program files **after** the query, not Program builds,
parses, file reads or a source-only dependency closure.

With a static target dependency closure of2 files, unrelated-file profiles at
128/2048/20000 project files still observed Program sizes497/2417/20369. The30000
partial-mode profiles instead observed371. Thus the target closure alone does
not explain actual Program size; complete-root and partial routes must not be
plotted as one continuous scale curve. Density/topology fixed2048 profiles all
observed2417 Program files. These include non-project inputs; no unmeasured SDK
breakdown or construction count is inferred by subtraction.

Evidence: namespace-final-20261109/{scale33,density34,topology35}-current-program-
observations-01.json; each matched event retains request ID, Worker context,
raw event and source-result/log SHA256. No instrumentation was inserted into
ordinary sessions, and no true UI claim is made.
