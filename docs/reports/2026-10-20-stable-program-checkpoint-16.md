> Public review copy: raw source, full edits, protocol transcripts and archives remain in the original local workspace. Raw-evidence links point to the retention notice.

# Mac Photos checkpoint-16：发布围栏修复与关闭文件增量交付

状态：正确性修复已移入工作区，正常三对对照完成；**500ms 仍 FAIL**。
完整 fast 已结束：**1918/1921，通过以外3项失败，exit1**，无skip/cancel。
不以相关回归代替全量通过。未推送或发布。

checkpoint-15 因陈旧引用缺陷已撤回，本轮只将其作为速度对照。
其历史计时、失败及原始记录保留于[前报告](2026-10-20-stable-program-checkpoint-15.md)。

## 版本、环境与测试范围

- Mac、本地 Node `v20.19.5`、锁定 `ohos-typescript@4.9.5-r10`。
  SDK `.bench/mac-photos-v1/sdk/openharmony`，1670 个既有输入哈希。
- 上游父提交 `3add697043380612efe71cef074e5de292422fe2`；候选是未提交工作树，
  不能写成同提交测试。冻结16的670个源码输入、82个runtime文件及完整SHA清单
  位于 `.bench/stable-program-v1/checkpoints/checkpoint-16/`。
- native 使用冻结旧baseline二进制，本轮无Rust代码变化。SDK和运行模式不变。
- 真实 `<local-path>` 只读，核验574个原输入。
  实际运行于隔离副本 `<isolated-fixture>`，
  577个输入、实际文件集合一致；原项目、SDK、fixture、runtime及源码前后无变化。
- 每场新进程、空应用缓存，全部串行；OS文件缓存及其他桌面负载不受控。
  初始化均为 degraded2307，缺少 `@ohos.filemanagement.userFileManager`。
  该状态限制完整SDK/语义资格结论，不能写成READY测试。
- 固定场景13次：未打开补全/定义、打开后补全/定义、两次关闭重开、
  `isVisibility → visibilityQQ` 重命名、首次/重复查引用及恢复overlay。
- 七文件工作流35次：沿用既定随机计划每模块的首个目标，不重新抽样；
  首次未打开补全、打开补全/定义、关闭，再第二轮重开补全/定义。
  文件、符号、零基UTF-16位置、完整请求、输入或编辑、顺序和前置状态逐次保留。

两类场景各三对独立进程，顺序15/16、16/15、15/16；共288次操作。
首对完成后汇总脚本因系统Python不支持`zip(strict=True)`停止，修复后只运行
尚未执行的场次，首对完整保留，没有重采样；原中断和续跑日志同时保留。

## 正确性变化与回归

1. 普通完整引用恢复完整Program证明，查询后capture执行当前输入准入。
   同Program/signature观察不能跳过当前磁盘身份核验，degraded也适用。
2. 合法文件symlink的链接自身、realpath及目标完整身份均入证明。
   指向同字节、同inode硬链接的retarget仍撤销旧证明，保留合法链接优化。
3. READY身份构造后输入证明失败向LSP传播，外层不得忽略失败报告。
4. 不可变Program观察加入既有同步查询的输入联合围栏，退出前独立核验。
   这只覆盖同步编译查询，尚非跨worker阶段的整条逻辑LSP请求共享。
5. 缺失的已变更关闭文件快照经现有token/read端口交付原组，保留完整成员、
   overlay/物理alias/删除/reset守卫及256文件、8MiB原预算；不满足则保守重建。

320个filler使目标输入落在预载窗口外。未通知、等长并恢复mtime的编辑、
READY身份构造期间编辑，以及终检读取另一个文件时编辑，均有真实worker
RED→GREEN。终检变更返回-32803，随后watcher通知后精确恢复新2处引用。
四个原batch/index观测按实际新路由改验：旧证明reject后，完整owner真实查询
建立新证明，才允许后续命中；保留精确位置、最新诊断和每SDK叶最多8次观察。

隔离十四个完整文件 **86/86**；移入后的工作区独立公开回归 **15/15**；
types和build通过，均无skip/cancel。日志、17文件前后SHA及测试夹具保留。
旧超限文件LS3178、type-engine500、document-store1774行未增长；迁移债仍在。

完整fast耗时2819053.502ms。两项persisted-index用例默认被驻留优先路径绕过，
一项queue-only trace缺少readiness回调；隔离复验3项原失败复现。修复索引用例
显式关闭驻留快路并补齐queue-only回调后，相关四项公开测试通过。该修复属于
后续候选，不将本版全量结果改成GREEN。完整终态日志和独立SHA核验分别保留于
[终态记录](local-performance-evidence.md)、
[原始日志](local-performance-evidence.md)、
[构建后输入核验](local-performance-evidence.md)。
完整fast重建了一个辅助sdk-discovery driver；75个实际生产runtime输入及670个
源码输入均未变，原严格82文件核验的1项差异也保留，不掩盖为全部相同。

## 正常响应结果

全部288次预设检查通过，**144组完整结果比较一致**。
比较保留补全所有返回字段、列表顺序、定义/引用完整Locations及重命名编辑，
仅排除每次服务端生成的completion `data` opaque句柄。

| 场景 | 对照15超过500ms | 候选16超过500ms | 结论 |
| --- | ---: | ---: | --- |
| 固定13次×3 | 0/39 | 3/39 | 首次改名查引用退步，FAIL |
| 七文件35次×3 | 18/105 | 0/105 | 本工作流三轮全部≤500ms |

固定慢项为 `feature/browser/src/main/ets/default/view/photo/PhotoBrowserActionBar.ets`，
`visibilityQQ`、零基位置57:12、operation12、rename后首次引用。
三次候选 **525.361 / 516.891 / 545.235ms**，对照
447.441 / 446.437 / 449.698ms。没有因接近阈值而判通过。

七文件原六类慢操作的三次中位数如下；表中位置均为零基UTF-16：

| op | 文件 / 符号 / 位置 / 前置状态 | 15中位ms | 16中位ms |
| ---: | --- | ---: | ---: |
| 13 | `feature/thirdselect/src/main/ets/default/common/SmartPickerRecommendTabInfo.ts` / `recommendType` / 34:19 / 从未打开首次补全 | 1428.058 | 148.963 |
| 16 | `feature/timeline/src/main/ets/view/TimelinePageToolBar.ets` / `updateToolbar` / 32:12 / 从未打开首次补全 | 625.840 | 325.148 |
| 19 | `product/phone/src/main/ets/ServiceExt/ServiceExtAbility.ts` / `bindDialogTarget` / 86:16 / 从未打开首次补全 | 1409.735 | 248.800 |
| 30 | 同op13 / 已打开关闭后重开补全 | 1330.436 | 128.877 |
| 32 | 同op16 / 已打开关闭后重开补全 | 581.508 | 246.613 |
| 34 | 同op19 / 已打开关闭后重开补全 | 1397.037 | 222.516 |

七文件工作流覆盖7个预定文件，不等于任意文件或递增规模验收。
正常运行内部阶段仍标为未测，不能用表中改善幅度直接推定独占阶段成本。

## 初始化及内存

| 场景 / 指标（三场中位数） | 15 | 16 |
| --- | ---: | ---: |
| 固定场景初始化ms | 14756.031 | 14793.140 |
| 七文件初始化ms | 14726.764 | 14686.305 |
| 固定场景采样进程树峰值B | 819732480 | 819687424 |
| 七文件采样进程树峰值B | 958328832 | 827469824 |

固定场景未显示实质内存变化；七文件峰值中位数降低约13.7%，结论限于这组
工作流。采样间隔250ms，Node Worker同PID只算一次，native子进程另计。
这些是RSS采样最大值，非精确峰值、PSS或唯一物理内存；运行期准入策略
仍未使用完整进程树预算，不将外部测量误记为策略已完成。

## 阶段诊断与证据

独立4场探针运行已完成，96次完整规范化结果均与同版正常运行一致、无观察
溢出，输入/runtime再次核验不变。计时不与上述正常样本混合。
[阶段原始汇总](local-performance-evidence.md)
保留所有函数计数、路径、阶段事件和窗口；归档内保留带路径的原始观察文件。

固定16 operation12有641个Program SourceFile：项目284、SDK305、其他52；
其中1个overlay，实际磁盘证明覆盖640个输入。SDK及项目resident文本读点
本次均为0，不能把慢项再归因为重复SDK文本读取。实际调用链为
`references → captureCurrentProgram → observe/admitInputs → diskIdentity`，
最终`withRequestInputValidation`再执行`diskInputsCurrent`。

| 实际函数阶段（16 op12） | 调用数 / 不同文件数 | 函数内累计ms |
| --- | ---: | ---: |
| observe磁盘身份 | 1280 / 640 | 68.032 |
| 引用准入磁盘身份 | 640 / 640 | 33.896 |
| 最终联合围栏磁盘身份 | 640 / 640 | 32.945 |
| workspace最终raw disk read | 255 / 255 | 18.953 |

其中SDK305个文件的observe身份610次、33.081ms，准入305次17.067ms，
最终305次16.373ms。15对照只有observe的1280次、70.633ms及workspace终检，
缺失后两轮完整准入正是此前的正确性缺口。恢复两轮检查贡献了可观测成本，
但不能把探针内66.841ms直接当成正常运行77.919ms差值的完整归因。

该16探针整次RPC778.119ms；文档准备186.977ms，内含closure177.298ms miss；
编译查询记录407.919ms，内含createProgram事件77.162ms及findReferences18.071ms。
函数计时与这些父阶段嵌套，未独占测量的区间、路径解析及观察开销保持未测，
不得将各行相加成响应分解百分比。实际parser调用数未测，Program序号也不是
创建次数。下一片只验证已复用读事实时“无新文本读取却重复执行读后身份检查”
的冗余，保留当前准入及最终联合围栏。

七文件15的content-revision reset实际4次（op13/19/30/34），16为0；
coordinator context创建事件13→9，证实关闭文件增量交付避免了四次重建。
Timeline的closure仍是117.990→118.259ms（首次）和125.475→120.530ms（重开），
没有证据将其响应改善归因于closure加速。其149个项目SourceFile中统计观察到
的对象复用首次0→143、重开0→147；这是对象观察数据，非实际解析调用数或
独占节省时间。补全事件按单worker串行顺序关联，21/21事件及每次返回项数
均核对，关联方法写入阶段汇总。

逐次数据：[operations.csv](local-performance-evidence.md)，
[慢项](local-performance-evidence.md)，
[summary.json](local-performance-evidence.md)。
原始帧、完整结果、文档事件/快照、RSS和server日志仍位于
`.bench/stable-program-v1/runs/*safety16*`。
已封存[1163文件、有界归档](local-performance-evidence.md)
及[逐成员SHA清单](local-performance-evidence.md)，
归档SHA256 `f452460b4420203e239b2db2dc2354787bd67a8ca0ace8eb4adb2d54e4e90369`。
包括16场原始帧/日志/快照/RSS、两版runtime、新版670源码、原始RED/GREEN、
输入与版本清单及脚本；排除可再生index缓存及尚未完成的whole-fast日志。
32个已记录服务端/native PID均已退出，见[独立退出核验](local-performance-evidence.md)。

复现从仓库根目录使用Node20，恢复归档中的`.bench`布局并保持所列SDK/Photos
隔离夹具哈希一致。每次使用新的trial名称，防止覆盖既有结果：

[Detailed commands and examples remain in the local original report.]

正常三对和独立四场的完整执行脚本见[脚本目录](local-performance-evidence.md)。
`run-safety16-pairs.py`包含这次已完成首对的恢复逻辑；逐次producer用新trial可
独立重放。公开回归命令、父版本及失败记录见[TDD](../tdd/stable-program-optimization.md)。

下一步先定位剩余引用成本，保留完整最终围栏，按真实RED/GREEN优化；
新全fast、递增规模、跨组完整合并、逻辑请求全程输入共享、运行期进程树
预算及长时压力验收仍未完成，不宣称总体目标完成。
