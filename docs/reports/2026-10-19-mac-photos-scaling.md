> Public review copy: raw source, full edits, protocol transcripts and archives remain in the original local workspace. Raw-evidence links point to the retention notice.

# Mac Photos 规模敏感性诊断与控制实验（2026-10-19）

结论：**存在随有效 Program 规模和引用验证批次数明显增长的步骤；不能把所有慢操作概括为与磁盘文件数、引用数量或依赖深度成正比。** 默认 member 补全把未 import 的其他模块 TS 也纳入工作区 Program。关闭重开会触发 Program 更新及输入核验。重命名后的首次引用在 degraded 路径上落入完整候选串行验证，每批重新创建项目 LS，重复加载 pinned 目标的依赖闭包。SDK AST 在同一 verifier 内已经复用；项目 AST、Program 和输入证明仍有重复工作。

本轮只增加诊断夹具、观察脚本和证据，没有改产品代码、SDK 或真实 Photos 源文件，没有推送或发布。**500ms 是判定阈值**，120s 请求采集 watchdog / 180s 初始化等待只保证慢请求能被完整记录。

- 仓库外 `detached-total`：64→2048参数的改名首次引用中位数 2.969→9.287s（3.13倍，各2轮）。
- 仓库外 `detached-photos-noise`：0→512参数的改名首次引用中位数 8.002→13.943s（1.74倍，各2轮）。
- joint：文件数8倍时，实际项目完整解析126→4592次（36.4倍）；这是工作量放大证据，不是整次请求耗时的复杂度定论。
- 主仓库内矩阵会加载父目录ambient类型；内容相同的仓库外曲线独立列出，不能将仓库内较高秒数直接当作真实Photos结果。

## 固定输入、会话和证据

| 模式 | cohort | 有效新进程数 | 操作数 | >500ms |
| --- | --- | --- | --- | --- |
| baseline | cold-open | 28 | 84 | 53 |
| baseline | full | 111 | 1443 | 659 |
| baseline | photos-workflow | 12 | 168 | 162 |
| baseline | type-check | 8 | 32 | 0 |
| profile | cold-open | 4 | 12 | 8 |
| profile | full | 50 | 650 | 311 |
| profile | photos-workflow | 4 | 56 | 56 |
| profile-ack | full | 4 | 52 | 23 |
| profile-ack | photos-workflow | 4 | 56 | 55 |
| profile-fd | full | 4 | 52 | 28 |
| profile-fd-ack | full | 4 | 52 | 31 |
| trace | full | 5 | 65 | 30 |

合计 238 个有效会话、2722 次操作；baseline 1727 次，874 次 >500ms。失败/排除会话 0 个，原始记录保留，见 `analysis.json.excludedRuns`。pilot / validation 不纳入统计。

产品提交 `3add697043380612efe71cef074e5de292422fe2`；Photos 提交 `a2c993829c46d965abefc5d2143187fa54fa4604`。Node `v20.19.5`，macOS `26.6.2 / 25G83`，Intel i7-9750H，12 逻辑核，16GiB。运行时内编译器版本声明为 `4.9.5`，fork实际身份以bundle SHA固定。SDK 是本机 DevEco 安装的 HarmonyOS `6.1.1.125 / API24`，1670 个声明/配置文件逐项哈希固定，与前次 Mac 测试相同。默认压力值 4096MiB，首次初始化不受压力值限制。

每个会话均为独立真实 LSP 子进程，使用 Content-Length framed stdio、新应用缓存和相同公开操作；请求在进程间、进程内均串行。操作系统文件缓存未清空，其他桌面进程负载不受独占控制。首次初始化计时到 `arkts/semanticPreparation` 的 terminal 通知，**terminal 不等于 READY**。

基线 `baseline` 清除额外 ARKTS_/OP00_ 和 NODE_OPTIONS 设置，不开启额外 trace / parser 观察；所有模式均使用相同 250ms 外部 ps 采样。`profile` 仅在私有加载文本中插入函数入口计数，不修改源码或 dist，并按 SHA 校验原始 bundle；`trace` 只有既有日志；`profile-fd` 另外记录 open/read/fstat 描述符读取。**这些模式的耗时不混入 baseline 中位数**。

封存校验发现原periodic探针每秒落盘，在短批次结束后worker立即退出时可能漏存尾部。四个仓库外full计数快照（total64/1024/2048、joint64）的项目parse小于实际job文件合计，明确标为 `tail-incomplete`，不能解释为缓存复用。保留旧数据，补采12个仅计数会话：四个full、四个跨文件工作流、四个FD端点；新增 `profile-ack` / `profile-fd-ack` 在非log worker响应发出前落盘，采用ACK计数替换受影响结论，**不修改或混入基线时延**。原periodic尾部FS计数只作下界。完整性状态在analysis/profile表与controls-audit中可查。

每个规模先计算单会话同类操作的中位数，再跨独立会话汇总；主 total / semantic / Photos 各 3 轮，其余主因素 2 轮，第一轮递增、第二轮递减。主矩阵每档先profile后baseline1，之后才统一baseline2反序和优先因素baseline3；因此不把baseline1称为文件系统冷读。首次打开、跨文件 Photos 工作流、联合压力、仓库外对照和强制类型诊断均单列 cohort。表中 `[min–max]` 为独立会话统计值的范围，不是置信区间。

完整逐次数据：[operations.csv](local-performance-evidence.md)；规模汇总：[summary.csv](local-performance-evidence.md)；[全部数据表](local-performance-evidence.md)；[调用链](local-performance-evidence.md)；[复现说明](local-performance-evidence.md)。原始帧、完整响应、源码快照、输入事件、计数器和 RSS 在本机 `.bench/mac-photos-scaling-v1/runs/`；压缩包身份见后文。

## 控制变量设计

| 因素 | 多个递增规模 | 固定项与解释 |
| --- | --- | --- |
| 不参与语义的磁盘文件 | 64 / 256 / 1024 / 2048 个 txt | TS 固定128，活跃组19、目标依赖闭包18。只增加目录项，不能与增加 TS 混称文件规模。 |
| 总 TS 数 total | 64 / 256 / 1024 / 2048 | 活跃组19、目标依赖闭包18、目标字节和引用不变；其余文件位于不被 import 的 noise 模块。**实际测得补全 Program 仍包含全部 TS，定义为19。** |
| 有效语义根 semantic | 16 / 64 / 256 / 512 参数 | 总 TS 固定2048，目标依赖链固定16节点。把独立根从 noise 移入 app，定义 Program 实际19 / 67 / 259 / 515；补全始终2048。没有把增加根误当增加 import 依赖。 |
| 依赖扇出 | 1 / 8 / 32 / 128 | 128 个可达 Node、最长链128、总TS256不变；Graph 添加指向已有链节点的边，边数128 / 135 / 159 / 255。考察 E，避免同时增大 V。 |
| 依赖深度 | 32 / 64 / 96 / 125 | 128节点、128边、4个根入口和出度分布固定；四条链长度重新分配，参数是 Node 子图最长链，Target→Graph 的固定前缀另计。 |
| 单文件体量 | 4 / 16 / 64 / 256KiB | 目标由真实 exported const AST 扩大，TS128、依赖和引用固定。字节和 AST 一起增长；没有宣称只测字节或只测类型复杂度。 |
| 引用数量 | 1 / 16 / 64 / 256 个可变使用点 | 目标16KiB、256个 AST 使用槽固定，`this.other` 等宽替换为 `this.value`。返回总数3 / 18 / 66 / 258。存在局部同名 probe，精确 oracle 排除它。 |
| 代码/类型复杂度代理 | 4 / 8 / 16 / 32 个不同 union key | TypeWork32KiB、64个等宽字面量 AST arm固定；template literal 两位置组合理论16 / 64 / 256 / 1024个 key。实际类型实例化数量**未测**。补充等宽合法→非法→修复编辑，确认发生2322类型诊断。 |
| READY 反事实 | total64 / total2048 | 只在隔离的 Blocker 中移除缺失 SDK import，等长填充。SDK不变，确实达到 READY。不能冒充真实 Photos 已修复。 |
| Photos 原始源码 + 噪声 TS | 0 / 128 / 512 | 完整复制574个 tracked 文件，加固定第8模块和1个基础TS，总源码289 / 417 / 801，实际纳入成员284 / 412 / 796。原 Photos 源码和7个真实工作流目标完全固定。 |
| 组合压力 joint | TS64 / 128 / 256 / 512 | 有意同时增大 F 和目标依赖闭包 D=F−2，只保留1个 noise 文件，检查 B×D 放大。**不是单变量实验**。 |
| 文件系统祖先目录 | 仓库内 / private tmp | 内容逐字相同，仅搬移测试副本，分别保留独立 factor。核查自动加载父目录 `@types/node` 对项目 Program 的影响。 |

所有编辑都以 overlay 发送，磁盘输入逐项前后哈希一致。合成类型正确性、引用完整性、精确定义 Location、带版本 WorkspaceEdit 均有公开协议断言；完整帧审计重新关联参数/响应并重放 didOpen/didChange/didClose。静态 LOC/AST/局部依赖指标见 `fixture-metrics.json`，它们是离线夹具核验，**不是运行时扫描/解析次数**；没有用标准 TS parser 给 ArkTS/ETS 虚构 AST 复杂度。

`controls-audit.json` 另外断言各组固定项、仓库内外字节一致及引用解析公式与实测吻合。semantic组总AST固定16557，源字节73842→74834（独立根命名多992B），不是完全等字节实验。扇出表的边数针对Graph+Node子图；完整Target闭包固定再加1条Target→Graph边，离线图指标均明确计数范围。

## 用户可见耗时与增长

**detached-total，baseline / full，ms**

| 参数 | 补全/定义实际项目文件 | 重开补全 | 打开定义 | 重开定义 | 改名首次引用 | 引用重复 |
| --- | --- | --- | --- | --- | --- | --- |
| 64 | 64/19 | 864.5 [843.8–885.3] | 23.6 | 492.0 | 2968.6 [2958.6–2978.6] | 1.4 |
| 256 | 256/19 | 910.4 [909.3–911.4] | 24.5 | 487.1 | 3548.1 [3523.3–3572.9] | 1.5 |
| 1024 | 1024/19 | 1259.8 [1196.7–1323.0] | 28.0 | 534.3 | 5925.6 [5777.5–6073.8] | 1.6 |
| 2048 | 2048/19 | 1706.9 [1574.3–1839.5] | 51.5 | 610.7 | 9286.6 [8739.3–9834.0] | 1.5 |

**detached-photos-noise，baseline / full，ms**

| 参数 | 补全/定义实际项目文件 | 重开补全 | 打开定义 | 重开定义 | 改名首次引用 | 引用重复 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 284/171 | 1622.5 [1585.6–1659.5] | 59.7 | 1219.8 | 8002.1 [7963.1–8041.2] | 2.0 |
| 128 | 412/171 | 1737.3 [1707.7–1767.0] | 73.9 | 1191.2 | 9469.2 [9247.7–9690.7] | 1.6 |
| 512 | 796/171 | 1903.2 [1895.9–1910.5] | 83.7 | 1226.3 | 13942.5 [13927.5–13957.6] | 1.7 |

**total，baseline / full，ms**

| 参数 | 补全/定义实际项目文件 | 重开补全 | 打开定义 | 重开定义 | 改名首次引用 | 引用重复 |
| --- | --- | --- | --- | --- | --- | --- |
| 64 | 64/19 | 953.1 [896.5–1007.0] | 25.7 | 568.9 | 4533.1 [4441.0–4713.5] | 1.5 |
| 256 | 256/19 | 1051.2 [992.8–1051.8] | 29.1 | 657.5 | 7380.0 [7254.7–7480.5] | 1.4 |
| 1024 | 1024/19 | 1472.1 [1266.7–1493.1] | 33.6 | 618.4 | 18790.7 [17706.2–18874.4] | 1.6 |
| 2048 | 2048/19 | 1870.1 [1705.2–1878.3] | 43.2 | 635.1 | 33582.9 [31903.5–34227.2] | 1.7 |

**semantic，baseline / full，ms**

| 参数 | 补全/定义实际项目文件 | 重开补全 | 打开定义 | 重开定义 | 改名首次引用 | 引用重复 |
| --- | --- | --- | --- | --- | --- | --- |
| 16 | 2048/19 | 1880.2 [1687.6–1942.7] | 42.8 | 656.7 | 33583.0 [32032.9–34345.7] | 1.9 |
| 64 | 2048/67 | 1934.7 [1695.2–1936.7] | 74.3 | 674.7 | 33837.9 [31961.1–34459.2] | 1.6 |
| 256 | 2048/259 | 1879.9 [1700.5–1885.2] | 46.6 | 712.2 | 33382.0 [32034.3–33701.9] | 1.6 |
| 512 | 2048/515 | 1880.1 [1733.9–1978.7] | 49.8 | 813.9 | 34101.5 [32473.7–34153.8] | 1.8 |

**ready-total，baseline / full，ms**

| 参数 | 补全/定义实际项目文件 | 重开补全 | 打开定义 | 重开定义 | 改名首次引用 | 引用重复 |
| --- | --- | --- | --- | --- | --- | --- |
| 64 | 64/19 | 1546.8 [1521.4–1572.1] | 26.4 | 637.8 | 3833.4 [3764.8–3902.1] | 1.8 |
| 2048 | 2048/19 | 4562.0 [4505.4–4618.5] | 40.2 | 626.9 | 5471.4 [5383.6–5559.3] | 1.5 |

**photos-noise，baseline / full，ms**

| 参数 | 补全/定义实际项目文件 | 重开补全 | 打开定义 | 重开定义 | 改名首次引用 | 引用重复 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 284/171 | 1823.7 [1647.3–1845.1] | 79.7 | 1364.4 | 14113.2 [13952.0–14169.7] | 1.6 |
| 128 | 412/171 | 1873.0 [1866.7–1925.1] | 80.0 | 1352.2 | 17877.9 [17847.9–17886.5] | 2.1 |
| 512 | 796/171 | 2139.6 [2065.1–2154.2] | 78.2 | 1377.7 | 28565.7 [28323.2–28587.7] | 1.6 |

下图仅为仓库内主矩阵（固定父目录ambient），仓库外曲线在后面的独立图表中，不并线统计。

![主因素与500ms阈值](local-performance-evidence.md)

其他单因素对照（各规模2个 baseline 会话，数值为ms）：

| 因素 | 参数 | 重开补全 p50（同序） | 改名首次引用 p50（同序） |
| --- | --- | --- | --- |
| assets | 64 / 256 / 1024 / 2048 | 977.1 / 933.3 / 918.3 / 958.1 | 5466.6 / 5363.1 / 5334.1 / 5424.4 |
| fanout | 1 / 8 / 32 / 128 | 1116.6 / 1118.6 / 1071.9 / 1027.7 | 7861.2 / 7751.3 / 7727.3 / 7885.4 |
| depth | 32 / 64 / 96 / 125 | 1108.2 / 1110.6 / 1045.2 / 1116.1 | 7740.0 / 7793.7 / 7452.3 / 7872.5 |
| size | 4 / 16 / 64 / 256 | 983.7 / 986.5 / 995.4 / 1087.2 | 5530.8 / 5494.8 / 5518.7 / 5737.5 |
| references | 1 / 16 / 64 / 256 | 1105.1 / 1098.9 / 1097.8 / 1118.4 | 5666.6 / 5634.9 / 5614.3 / 5656.2 |
| complexity | 4 / 8 / 16 / 32 | 981.0 / 1005.6 / 1043.0 / 997.3 | 5474.7 / 5599.8 / 5732.1 / 5456.9 |

这些对照的首次引用没有呈现与参数规模一致的巨大单调放大，不能解释为所有因素无影响。引用数3→258且目标体量/AST槽固定时，固定建图/输入准备成本占主导；单文件字节与AST同时增加的成本不能拆成纯字节影响。类型key补充诊断包含诊断调度/等待，非纯类型实例化耗时。完整min–max及类型诊断逐次值在数据表中。

“disk后打开”已在同一会话做过磁盘查询，不是未查询冷态。首次打开补充流程在初始化后立即 didOpen，再做首次、重复、关闭重开补全；Program 可能已由初始化准备，不能称操作系统或 AST 完全冷态。

| 因素 | 参数 | 未先查询首次打开ms | 立即重复ms | 关闭重开ms |
| --- | --- | --- | --- | --- |
| detached-total | 64 | 477.3 [464.3–490.3] | 65.4 [63.7–67.1] | 895.7 [869.9–921.6] |
| detached-total | 256 | 530.8 [514.9–546.8] | 90.6 [88.3–92.9] | 956.6 [932.8–980.5] |
| detached-total | 1024 | 637.3 [625.0–649.7] | 100.0 [99.4–100.6] | 1224.7 [1207.6–1241.9] |
| detached-total | 2048 | 788.0 [773.2–802.8] | 112.2 [110.6–113.7] | 1629.1 [1581.8–1676.3] |
| total | 64 | 502.9 [491.6–514.2] | 76.0 [74.7–77.2] | 964.4 [950.4–978.4] |
| total | 256 | 640.7 [575.1–706.3] | 109.4 [105.2–113.6] | 1091.3 [1056.8–1125.8] |
| total | 1024 | 799.6 [725.8–873.3] | 136.2 [123.4–149.1] | 1558.9 [1432.1–1685.8] |
| total | 2048 | 996.9 [893.9–1099.8] | 231.1 [173.8–288.4] | 2049.9 [1902.7–2197.0] |
| semantic | 16 | 944.2 [861.3–1027.1] | 149.8 [139.4–160.2] | 2012.7 [2002.0–2023.4] |
| semantic | 64 | 895.1 [861.3–928.9] | 206.8 [140.1–273.5] | 1985.2 [1967.0–2003.4] |
| semantic | 256 | 854.1 [847.1–861.2] | 206.7 [144.0–269.4] | 1891.3 [1785.2–1997.4] |
| semantic | 512 | 863.4 [863.0–863.8] | 146.5 [145.8–147.3] | 1894.6 [1800.3–1989.0] |
| ready-total | 64 | 714.9 [712.3–717.5] | 130.9 [129.5–132.2] | 1521.1 [1519.7–1522.5] |
| ready-total | 2048 | 1845.7 [1837.2–1854.2] | 459.3 [449.7–468.8] | 4370.5 [4363.5–4377.5] |

真实 Photos 跨文件工作流从前次固定随机计划中每模块取第一个目标，7个路径、符号及执行顺序固定。第一遍逐个打开补全再关闭，第二遍按同顺序重开；每个噪声规模2个新进程。逐文件结果、前置打开/关闭历史和具体光标见数据表与原始响应，没有用全部文件混合 p50 隐去个别慢目标。

**detached-photos-noise**

| 真实文件 | 符号 | noise0 首次/重开ms | noise128 首次/重开ms | noise512 首次/重开ms |
| --- | --- | --- | --- | --- |
| common/src/main/ets/default/view/browserOperation/ThirdDeleteOperation.ts | callback | 375.5 / 1853.0 | 405.0 / 1920.9 | 459.3 / 2076.9 |
| feature/browser/src/main/ets/default/view/photo/RenameMenuOperation.ts | menuContext | 1476.3 / 1784.8 | 1581.1 / 1841.5 | 1738.0 / 1992.2 |
| feature/editor/src/main/ets/default/view/PcMainMenuBar.ets | selectedMode | 1577.1 / 1798.1 | 1702.3 / 1854.7 | 1845.0 / 2007.7 |
| feature/formAbility/src/main/ets/default/controller/FormControllerManager.ts | formControllerMap | 1475.9 / 1862.7 | 1574.6 / 1862.8 | 1726.4 / 2046.4 |
| feature/thirdselect/src/main/ets/default/common/SmartPickerRecommendTabInfo.ts | recommendType | 1541.6 / 1697.0 | 1639.3 / 1778.6 | 1757.0 / 1913.0 |
| feature/timeline/src/main/ets/view/TimelinePageToolBar.ets | updateToolbar | 1494.3 / 1809.2 | 1609.0 / 1860.4 | 1724.6 / 2014.0 |
| product/phone/src/main/ets/ServiceExt/ServiceExtAbility.ts | bindDialogTarget | 1555.4 / 1773.9 | 1665.7 / 1832.8 | 1820.7 / 2061.3 |

**photos-noise**

| 真实文件 | 符号 | noise0 首次/重开ms | noise128 首次/重开ms | noise512 首次/重开ms |
| --- | --- | --- | --- | --- |
| common/src/main/ets/default/view/browserOperation/ThirdDeleteOperation.ts | callback | 533.0 / 2952.0 | 553.3 / 2995.2 | 645.5 / 3140.4 |
| feature/browser/src/main/ets/default/view/photo/RenameMenuOperation.ts | menuContext | 1771.3 / 2896.7 | 1830.9 / 2953.9 | 2016.1 / 3177.6 |
| feature/editor/src/main/ets/default/view/PcMainMenuBar.ets | selectedMode | 1883.2 / 2837.4 | 1926.7 / 2940.9 | 2127.5 / 3135.2 |
| feature/formAbility/src/main/ets/default/controller/FormControllerManager.ts | formControllerMap | 1740.0 / 2821.0 | 1778.9 / 2938.6 | 2002.1 / 3162.7 |
| feature/thirdselect/src/main/ets/default/common/SmartPickerRecommendTabInfo.ts | recommendType | 1767.4 / 2744.1 | 1784.0 / 2806.8 | 2046.2 / 3005.2 |
| feature/timeline/src/main/ets/view/TimelinePageToolBar.ets | updateToolbar | 1749.4 / 2838.3 | 1811.8 / 2948.7 | 2021.1 / 3116.5 |
| product/phone/src/main/ets/ServiceExt/ServiceExtAbility.ts | bindDialogTarget | 1708.5 / 2807.6 | 1776.2 / 2916.3 | 2007.5 / 3073.4 |

## 真实调用链与测得的工作量

1. `run-language-server.onCompletion` → `SemanticWorkerProxy.complete` → `LegacySemanticEngine.complete`。默认 member root profile=`workspace`，进入 `prepare(includeWorkspaceFiles=true)`，绕开模块组交互 prepare。因此未 import 的 TS 也进入补全 Program。定义通过交互作用域投影，保留模块组和必要全局声明。
2. `DocumentStore.projectMembership` 在缓存未命中/失效才调用 `scanProjectMembership` → `listWorkspaceSourcePaths`。依赖通过 `collectDependencyClosure` / `reuseDependencyClosure`；visited 避免同一闭包重复扩展，实际触达文件/边与总磁盘文件不同。
3. `TypeEngine.prepare` 检查 owner/epoch/contentRevision，`TypeScriptLanguageServiceEngine` 调官方补全/定义。关闭重开造成上下文/文档权威变化，Program 更新不等于所有 AST 重解析。
4. `runPreparedSemanticQuery` 在返回前认证，`assertCurrentWorkspaceSources` 对准备集合内非 overlay 重新读盘比较；`assertCurrentQueryInputs` 检查已加载 SDK/配置等输入。`readDiskSource` 使用 lstat/open/fstat/readSync/读后身份检查。缓存命中仍可能有与有效输入数/字节相关的工作。
5. `routeReferenceQuery` → resident proof → `selectReferenceCandidates` → `prepareReferenceSearchWorkspace` / `referenceAnchor`。本轮改名后可见 `inputs-changed` 和 `candidate-ineligible`；后者为“不支持完整声明身份的候选收窄”，不是索引找到了0个真实引用。
6. `planConservativeReferenceBatches` 对成员生成/排序候选；`execute` 串行 await 每个 verifier。每批最多64个 candidate roots，pinned 目标/overlay及其传递依赖不受64根限制。`runJob` 创建 LS，准备 Program，查引用，围栏后 dispose。SDK registry pin 保留，项目 lease 不保留。
7. `uniqueSortedReferences` 去重再排序。多批可以重复返回同一个 pinned 位置，最终返回数量与合并前工作量不同。立即重复请求命中结果缓存时可绕过全套步骤；baseline 的命中状态未直接观测，配对 profile 记录了实际 cache.hit。

另外两条独立扫描不能遗漏：Rust `catalog.scan_workspace` 初始化遍历目录、有界读源码并分块解析入索引，终态日志报告实际discovered/indexed数；SQLite `search_reference_candidates` 在判定字段身份是否支持前调用 `read_document_uris`，读取全部documents URI构建BTreeSet。后者也随索引大小增长，但本轮trace-only的64→2048对照中，direct-query RPC仅1.47→2.18ms，declaration-query为0.61→1.28ms（各1个阶段会话），不能将数秒候选/锚点时间全部归给SQLite。SQL逐行成本、查询计划和Rust初始扫描独占耗时未测。

逐函数文件、行号及缓存边界详见[调用链表](local-performance-evidence.md)。

首次改名引用实际入口计数（profile；次数不是耗时）：

| case | 候选数 | B | Program入口 | 项目完整解析 | SDK完整解析 | 其他完整解析 |
| --- | --- | --- | --- | --- | --- | --- |
| total-64 | 64 | 1 | 2 | 82 | 255 | 122 |
| total-2048 | 2048 | 32 | 33 | 2624 | 255 | 2013 |
| semantic-16 | 2048 | 32 | 33 | 2624 | 255 | 2013 |
| semantic-512 | 2048 | 32 | 33 | 2624 | 255 | 2013 |
| photos-noise-0 | 284 | 5 | 6 | 1136 | 305 | 366 |
| photos-noise-512 | 796 | 13 | 14 | 2744 | 305 | 854 |
| joint-64 | 64 | 1 | 2 | 126 | 255 | 122 |
| joint-128 | 128 | 2 | 3 | 380 | 255 | 183 |
| joint-256 | 256 | 4 | 5 | 1272 | 255 | 305 |
| joint-512 | 512 | 8 | 9 | 4592 | 255 | 549 |
| detached-total-64 | 64 | 1 | 2 | 82 | 255 | 0 |
| detached-total-2048 | 2048 | 32 | 33 | 2624 | 255 | 0 |
| detached-photos-noise-0 | 284 | 5 | 6 | 1136 | 305 | 0 |
| detached-photos-noise-512 | 796 | 13 | 14 | 2744 | 305 | 0 |
| detached-joint-64 | 64 | 1 | 2 | 126 | 255 | 0 |
| detached-joint-512 | 512 | 8 | 9 | 4592 | 255 | 0 |

主 total 族完整项目解析为82 / 328 / 1312 / 2624，等于 `F+18B`；B=1 / 4 / 16 / 32。SDK首次在新verifier内解析255个，后续批次不再次完整解析同一SDK文件。初始化在语义worker内预解析SDK1580个，不能跨isolate把它当verifier已预热。

不参与语义的txt从64→2048时，初始化Node实际目录项206→2190，但枚举源码均128；主degraded会话 `listWorkspaceSourcePaths` 入口均为1次。Rust终态目录记录也报告实际 discovered/indexed files，原始事件保留；Rust底层读取/syscall次数未测。READY重开可因重新认证再次枚举，不能推广为所有会话永远只扫一次。

计数约定：`createProgram` 是实际函数入口调用次数，可能含可增量处理的调用，不等于“每次全量构建”；`createLanguageServiceSourceFile` 是完整 LS 解析，`updateLanguageServiceSourceFile` 是增量更新入口，泛用 `createSourceFile` 与完整 LS 解析嵌套，**不能两者相加**。SDK 指固定 SDK 路径前缀；标准库、项目、其他声明分别记录。数字 phase 属客户端请求区间，后台任务可能重叠；相邻 between-phase 和整会话计数另存，不伪装成编译器内部的独占请求归属。

**祖先目录ambient控制。** 仓库内夹具实际解析的“其他”61个唯一声明路径来自父目录的 `node_modules/@types/node` 及其类型依赖；每次新LS均可能重新解析。目录搬移后的字节完全相同，其他环境不变，不改tsconfig或关闭类型：

| 族 | 参数 | 仓库内首次引用ms | 仓库外首次引用ms | 仓库内其他parse | 仓库外其他parse |
| --- | --- | --- | --- | --- | --- |
| total | 64 | 4533.1 | 2968.6 | 122 | 0 |
| total | 256 | 7380.0 | 3548.1 | 305 | 0 |
| total | 1024 | 18790.7 | 5925.6 | 1037 | 0 |
| total | 2048 | 33582.9 | 9286.6 | 2013 | 0 |
| photos-noise | 0 | 14113.2 | 8002.1 | 366 | 0 |
| photos-noise | 128 | 17877.9 | 9469.2 | 488 | 0 |
| photos-noise | 512 | 28565.7 | 13942.5 | 854 | 0 |
| joint | 64 | 4963.0 | 3001.1 | 122 | 0 |
| joint | 512 | 14794.9 | 7352.8 | 549 | 0 |

该对照只归因“搬移目录导致实际自动类型输入和相关路径查找改变”的整体差异，不把全部差值拆成纯parser时间。主矩阵包含固定ambient成本，隔离后另列结果；用户真实Photos位于仓库外。原始8.8s与本轮副本仍有其他前史/配置差异。

同一2048规模的ACK观察：`lstatSync:other` 1019229→3029，其他声明完整解析2013→0。仓库内为profile-fd-ack，仓库外为profile-ack，仅比较逻辑调用，不比较两种观察模式的耗时，不换算成物理I/O。

![祖先目录对照](local-performance-evidence.md)

**联合压力，代码和实测计数核对：**

| F | 共同闭包D | B | 实际项目全量parse | (B+1)D+2 | baseline首次引用ms |
| --- | --- | --- | --- | --- | --- |
| 64 | 62 | 1 | 126 | 126 | 4963.0 [4630.6–5295.4] |
| 128 | 126 | 2 | 380 | 380 | 5712.7 [5613.7–5811.7] |
| 256 | 254 | 4 | 1272 | 1272 | 8220.6 [8154.8–8286.5] |
| 512 | 510 | 8 | 4592 | 4592 | 14794.9 [14425.7–15164.2] |

64→512是8倍文件数、项目完整解析126→4592约36.4倍；锚点和每个批次都重新加载相同闭包，公式在四个规模逐项吻合。wall-clock含大量固定成本和其他工作，不能据此写“耗时扩大36倍”。

![联合压力工作量核对](local-performance-evidence.md)

## 阶段与内存

原 Photos 上一轮接受编辑链路是 baseline **8709.956ms**；独立 trace **8813.399ms**：文档准备250.650ms，候选/锚点3258.140ms，后续准备21.605ms，5批5242.550ms，合并0.190ms，余项40.264ms。锚点和批次里的 createProgram 合计6750.450ms，占该条 trace 约76.6%；它们是内部嵌套值，不能再与上层 Program-ready 叠加。

本轮 Photos 副本工作流含固定新增模块、复制路径、不同请求前史及等长新名，**不是原8.8s逐项原地回放**。仓库内副本还自动发现父目录声明；仓库外对照专门检验该因素。所有新旧差值都不作为单一产品改动收益，其他未控制差异不作归因。

独立trace-only的首次改名引用（ms，未使用parser计数observer）：

| case | 端到端 | 文档准备 | 候选含锚点 | B | batch时长合计 | 嵌套createProgram合计 | 嵌套batchQuery | 未分配余项 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| detached-photos-noise-0 | 8249.2 | 162.9 | 3255.2 | 5 | 4781.3 | 6334.6 | 277.8 | 49.6 |
| detached-photos-noise-512 | 14093.0 | 159.8 | 3206.6 | 13 | 10662.6 | 11201.2 | 442.0 | 63.8 |
| photos-noise-512 | 29356.3 | 208.1 | 4355.9 | 13 | 24711.8 | 25057.8 | 694.5 | 80.1 |
| total-2048 | 33673.7 | 298.3 | 3065.7 | 32 | 30234.9 | 28283.2 | 928.8 | 74.4 |
| total-64 | 4558.3 | 311.8 | 3139.9 | 1 | 1077.7 | 3281.8 | 113.8 | 28.8 |

已有 trace 只覆盖部分函数/阶段：module解析、绑定、类型实例化、GC、原生 Rust 索引 syscall、物理磁盘 I/O、编辑器 UI 渲染及事件队列均未完整分解。FD-aware 数字为 Node逻辑读取，不代表物理磁盘读；readFileSync-only 主探针不覆盖 FD readSync，不能用它宣称“没有读SDK”。各计时存在嵌套，不强行分摊剩余时长。

**SDK语法复用不等于SDK输入不再读取。** 独立ACK-FD端点中，total64→2048的首次引用SDK完整parse均255次，但SDK readSync逻辑字节约21.5→354.5MB，Program入口2→33。代码中的新LS建图、相对import/path探测及freshness核验仍发生；本轮未测它们各自独占耗时，不能把354.5MB直接称为物理磁盘读取或纯parser耗时。这也是只保留AST仍不能消除批次增长的证据。

独立FD-aware会话（逻辑读取，次数/字节；精确文件路径保留在raw counter）：

| case | 顺序 | 操作 | 项目readSync | SDK readSync | 项目字节 | SDK字节 |
| --- | --- | --- | --- | --- | --- | --- |
| joint-512 | 4 | open-first-completion | 1532 | 510 | 423192 | 10742238 |
| joint-512 | 7 | reopen-completion | 2044 | 1022 | 553520 | 21484639 |
| joint-512 | 9 | reopen-completion | 2044 | 1022 | 553520 | 21484639 |
| joint-512 | 12 | renamed-references-first | 8672 | 4608 | 2342809 | 96681609 |
| photos-noise-512 | 4 | open-first-completion | 2100 | 610 | 2933037 | 13772891 |
| photos-noise-512 | 7 | reopen-completion | 3180 | 1222 | 3199814 | 27545945 |
| photos-noise-512 | 9 | reopen-completion | 3180 | 1222 | 3199814 | 27545945 |
| photos-noise-512 | 12 | renamed-references-first | 5080 | 7862 | 10859922 | 177876943 |
| total-2048 | 4 | open-first-completion | 4604 | 510 | 104048 | 10742238 |
| total-2048 | 7 | reopen-completion | 8188 | 1022 | 147056 | 21484639 |
| total-2048 | 9 | reopen-completion | 8188 | 1022 | 147056 | 21484639 |
| total-2048 | 12 | renamed-references-first | 4688 | 16896 | 830081 | 354499233 |
| total-64 | 4 | open-first-completion | 286 | 510 | 76400 | 10742238 |
| total-64 | 7 | reopen-completion | 252 | 1022 | 51824 | 21484639 |
| total-64 | 9 | reopen-completion | 252 | 1022 | 51824 | 21484639 |
| total-64 | 12 | renamed-references-first | 50 | 1024 | 25217 | 21484802 |

| case | n | 初始化p50 ms | RSS峰值中位MiB | 峰值min–max MiB |
| --- | --- | --- | --- | --- |
| detached-joint-512 | 2 | 7632.9 | 892.4 | 889.9–894.9 |
| detached-joint-64 | 2 | 6917.1 | 830.9 | 830.8–830.9 |
| detached-photos-noise-0 | 2 | 10226.4 | 1175.8 | 1173.5–1178.2 |
| detached-photos-noise-512 | 2 | 10510.6 | 1313.6 | 1307.1–1320.0 |
| detached-total-2048 | 2 | 8565.6 | 1024.2 | 1014.7–1033.7 |
| detached-total-64 | 2 | 6870.9 | 828.5 | 823.6–833.4 |
| joint-128 | 2 | 8746.1 | 968.5 | 964.6–972.5 |
| joint-256 | 2 | 8132.9 | 1060.7 | 1057.7–1063.6 |
| joint-512 | 2 | 9139.5 | 1185.5 | 1183.7–1187.4 |
| joint-64 | 2 | 9135.7 | 939.3 | 927.1–951.4 |
| photos-noise-0 | 3 | 11780.7 | 1323.6 | 1227.8–1338.9 |
| photos-noise-512 | 3 | 11981.0 | 1360.0 | 1356.6–1366.7 |
| semantic-16 | 3 | 9713.3 | 1347.4 | 1346.2–1362.3 |
| semantic-512 | 3 | 9830.2 | 1355.0 | 1351.1–1411.0 |
| total-2048 | 3 | 9564.0 | 1354.0 | 1335.8–1378.1 |
| total-64 | 3 | 8225.0 | 925.8 | 915.7–934.2 |

RSS 是250ms采样的 server+子孙进程 RSS 之和，Rust sidecar计入，Node Worker作为同一Node进程只计一次，不含客户端/采样器；不是PSS，可能重复计算共享页，只能作为瞬时峰值的采样下界。不能凭一次峰值上升判定泄漏、压力驱逐或 OOM。实际内存等级和上下文事件保留原日志。

仓库外Photos的两个trace-only首次引用会话均记录 `memoryLevel=level0`。每批LS释放有 `runJob` 显式dispose的代码依据，不能把这次重建归因于触发4GiB压力。

## 增长判断、优化顺序与可预期收益

| 优先级 | 已有证据与诊断结论 | 后续可验证的优化与收益边界 |
| --- | --- | --- |
| P0 | degraded 下完整引用候选 B随F增大，各批重新创建项目LS；共同依赖实际反复解析。 | 优先使已有语义 owner 在编辑后增量恢复有效证明，或让 verifier 保留兼容项目LS/Program及其输入证据；在初始化提前准备必要 worker 的固定SDK成本。目标是减少每批重复建图/解析/证明，必须保留版本和磁盘身份围栏。收益须用实现后的同夹具复测，不能把所有Program-ready当可消除时间。 |
| P1 | 默认 member 补全纳入全部工作区TS；定义的较小组作用域更稳定。 | 评估按模块/依赖闭包保留热 Program 的补全作用域及正确性，覆盖ambient、跨模块继承和全局声明。大项目减少有效输入及每次围栏；本轮没切换默认行为，不能给出已实现收益。 |
| P1 | 关闭重开触发Program调用和文档/输入证明工作，READY恢复成本与degraded不同。 | 保留兼容根/文档身份，精确应用连续delta并增量认证；复用同一请求内相同文本/身份结果，跨请求必须重新证明新鲜度。先测 READY/DEGRADED 两条路径，不能为性能跳过检查。 |
| P2 | 当前字段的索引候选身份不完整，candidate-ineligible 导致保守全候选。 | 扩展有可靠声明身份的候选支持，使真正需要验证的roots减少；完整性与新overlay必须验证。不能把词法匹配0项当空引用正确答案。 |
| P2 | SDK full parse没有随每批增加；新isolate首次加载及非SDK ambient声明仍有固定/重复成本。 | 检验初始化预热与兼容registry复用是否覆盖实际worker；ambient来源先修正测试环境并单列，再决定产品包解析边界。没有证据支持再加一层无界SDK缓存能单独达到500ms。 |

即使把原8.813s trace中6750ms createProgram全部理想化移除，其他部分仍约2063ms，超过500ms。该计算只是**理想化收益的上界估算**，不是优化承诺；输入核验、查询准备、队列和固定首用成本仍需分别测量。优先级来自本轮代码/计数和分阶段证据，没有据猜测实现任何一项。

复杂度只对受测工作量作有条件判断：

- 目录枚举随实际目录项增加，路径/候选排序有 `sort`；成员缓存命中后不是每请求全扫描。不能据某处排序将整个服务命名 O(N log N)。
- 闭包遍历取决于实际 V/E，固定 V/E 的扇出/深度对照没有显示统一大幅增加；`shift()` 的使用也不足以证明整体查询 O(N²)。
- 固定 D 的 total 族在本范围内，项目全量解析工作满足 `F+18B`；这是可由 batch/pinned复用边界解释的线性计数关系，wall-clock还含固定SDK、路径证明及GC。
- 联合压力中 B 和各批共同 D 同时增加，工作量为各批闭包之和 `ΣDᵢ`，在每批都包含随F增大的共同闭包时有 B×D 二次放大条件。具体计数和实验范围见上文；**不把4个规模的耗时相关性当整个LSP的渐近复杂度证明**。
- 返回引用数、文件字节、类型key数量并不替代有效Program规模；本轮引用和复杂度代理没有证明通用“代码复杂度无影响”。实际类型实例化/绑定成本未测，复杂条件类型、循环依赖和数万文件不在实验范围。

## 限制与保全

除明确 READY 反事实外，真实 Photos及主合成项目初始化均因真实SDK缺失 `@ohos.filemanagement.userFileManager`（2307）而 degraded。degraded 可能提前结束认证并走更保守引用范围。因此这些曲线适用于当前SDK/状态，**不能当作健康 READY 大项目的完整性能模型**。READY端点已证明路径会改变，但只有2个规模，尚不覆盖大规模正常真实工程。

READY重开补全的独立profile端点记录：64→2048规模时，readiness逐文件input-check完成事件864→4832（唯一输入432→2416，覆盖SDK/标准库/ambient），这些回调计时合计17.3→127.3ms；请求末认证整体321.1→1186.2ms。profile端到端1992.6→5429.7ms，另有prepare/Program等步骤。计时嵌套且含观察开销；不能拿127ms文件核验解释整个5.4秒，也不能用degraded的快速提前返回预测READY成本。

本轮主合成模块数2、Photos模块数8固定；7模块工作流验证了跨文件切换，没有独立扩大模块数、热集合大小和长期驱逐压力。受测最高2048个TS / joint512，不能推断万文件具体秒数。每个因素的初始AST形状、查询目标和真实依赖均有边界；统计无随机独占主机/置信区间，不声称相关系数代表因果。父目录ambient对照按独立factor保留，不将不同环境结果合并。

最终协议/快照/输入审计：2722 条操作记录匹配原始协议，所有已审计会话通过。产品源码722项、运行时/主生产器93项、SDK1670项及真实Photos tracked文件574项哈希保持不变。详见 `audit.json`。真实项目原有两个.DS_Store未触碰。

完整原始证据压缩包：[evidence.tar.gz](<local-path>)，41385907 bytes，SHA-256 `b578eef3c72a6144bf9c8743b6277b0dcee9f4c747ce46e97dc095e91634c483`。包含3728个文件，逐项摘要见archive-manifest.json；不含SDK/真实项目副本、可重建索引数据库或观察bundle。复现所需版本、SDK/源码哈希、生成器、原始请求/结果均保留。

Mac证据与既有Windows目录/数据完全分开；没有等待或混入新Windows测量。
