# 当前候选：冷索引前台、重开及Native四档复核

当前冻结候选的本组协议验证已执行完成。冷索引期间定义正确，暖启动及独立Program诊断按原脚本完成，
Native四档保存/重复通知验证通过。两次大库离线校验的原60秒超时失败保留，分别有独立同SQL完整补证。
这不是Zed UI或Windows验收，也不表示语义长尾及30K完整引用/rename限制已解决。

## 身份及复现入口

沿用[两小时报告](2026-11-09-photos30k-versioned-index-endurance.md)的完整79资产、Node20.19.5、SDK及源快照
`93d200fb012381d1255602b6f0967124d9811aac802cf62213b9a618b1379a1f`。
Native SHA256 `9034ad301aaca22c3cb516778c8e044fa4593be50eba674b61efc6f800732dce`。
产品代码仍在隔离工作树；验证期间未再改产品。SDK部分声明缺失、默认无RSS预算及测试Node停线豁免保持。

证据根`.bench/index-versioned-maintenance-20261104/photos-followup-13/`。
`execute-remaining.py`执行冷索引后因原离线检查超时停止；`execute-tail.py tail2`在核对独立补证后只执行未完成项。
均使用实际Content-Length stdio子进程、独立测试缓存；未重跑或覆盖原失败会话。

## Photos 30K：实测操作与时间

实际源码根仍为`final-acceptance-13/harness/project`；新缓存为`photos-followup-13/index`，
冷启动前确认该缓存不存在；OS页缓存不受控，不称为物理磁盘冷读。
查询仍为`PickerUIExtensionAbility__copy_003.ets`中`ScreenManager.getInstance`，原始请求有确切位置/版本。

| 会话 | Native完整ready距会话起点ms | 定义请求ms，按执行顺序 | 原脚本结果 |
| --- | ---: | --- | --- |
| 冷索引期间前台定义及ready后查询 | 447373 | 1294.77；59.44；53.16；44.84 | 功能/关闭正确；离线60秒超时FAILED |
| 保留上述冷库的新进程暖启动 | 12700 | 1344.64；58.44；52.72 | COMPLETED，原完整性检查PASS |
| 独立暖态语义统计诊断 | 5237 | 1294.01；59.88；59.23 | COMPLETED，原完整性检查PASS |

第一行的首个定义在会话开始后约11.85秒发出，已等待SDK/语义准备返回，Native当时仍未ready。
其余定义在Native ready后发出。只证明这个目标在Native冷构建时可用，不证明SDK尚未准备时、其他方法或真实UI都可用。
三行是不同进程会话，不是三轮同条件样本；不将诊断与普通查询耗时混合，也不从ready时间差归因于某个优化。
ready为事件接收墙钟，不是纯CPU或单一SQLite阶段耗时。

冷库主Native一次写30000文档，后两次暖会话都复用30000、写0文档，store保持为本冷库的同一物理store。
冷会话7动作、9请求，暖会话各6动作、8请求；关闭均exit0、无干预、无残余进度。
冷会话采样峰Node776.13MiB、Native86.20MiB、树870.14MiB，Worker共享PID不另加RSS。
短期CLI进程由原始生命周期补充核对，不把采样峰当全部瞬时分配或把新会话Worker当原会话重建。

## Program规模与Native规模必须分开

本独立诊断的3个定义观察事件：项目SourceFile87、SDK282、其他113，总482；项目root87、总root89。
观察到同一个Program/Checker对象序号1，重复请求复用这些已观察对象；这不是全局构建或解析调用次数。
`createProgramEvents=0`仅是受测回调没有捕获构建，前置/初始化工作不能据此归零。

| 数字 | 本轮含义 |
| --- | --- |
| 30000 | Native完整索引的项目源码文件 |
| 20000 / 87 | 本会话内存指标先后出现的workspace视图计数；membership路径数或documents长度回退值，不是Program计数器 |
| 87 | 当前单目标独立诊断实际Program项目文件数，不可回填两小时混合会话 |
| 2048 | [固定规模夹具](2026-11-09-versioned-index-density-comparison.md)的实际Program项目文件数，虽静态import闭包只有2文件 |

因此不能用真实Photos单目标比生成的30K全依赖闭包更快，证明总文件数无关或所有大型项目都快。
本轮没有测到实际磁盘读次数、完整编译构建/解析次数，也不把对象重用计数当这些次数。

## 冷库与长测后重开库：全部文件的计数对照

两库均为最终恢复后的相同30000源码，逐URI比较源码SHA及八类事实实际行数：
**30000/30000一致，每个文件实际行数均等于sealed记录的预期值，差异0**；预期有效事实总行14220087。
这排除了本对照中的行数缺失，不是所有字段、排序或FTS结果的全量等价证明。
旧/隐藏版本仍会贡献物理表行数，不能只比较整表count就判定有效数据错误或物理写放大。
原始逐文件及汇总在`cold-vs-reopened-per-file-cardinality-audit.json`和两份`*-current-file-cardinalities.json`。

冷库原60秒外部`integrity_check; foreign_key_check`超时，独立同SQL73.55秒exit0/ok，文件状态不变，源30060一致。
先前长测缓存重开则为独立82.01秒通过，见[原失败与补证](2026-11-09-photos-cache-reopen-postflight.md)。
产品超时/SQL/断言未改；原脚本FAILED不重命名为PASS。后两暖会话的原检查本身通过，不能据此抹去前两失败。

## 当前Native：128/2048/20000/30000源码

每档一个独立进程，内含3次保存和3次重复通知；下表为**会话内3次操作中位/最大ms**，不是3次独立冷启动。
SDK刻意不可用，使用公开LSP保存/watch/索引符号验证，隔离Native成本；不宣称验证了语义查询或Program。

| 源码数 | 保存至完整资格 | 重复通知至完整资格 | 每次保存新写文档 | 每次重复新写文档 |
| ---: | ---: | ---: | --- | --- |
| 128 | 414.48 / 434.25 | 410.36 / 412.24 | 1、1、1 | 0、0、0 |
| 2048 | 521.23 / 542.62 | 615.59 / 625.93 | 1、1、1 | 0、0、0 |
| 20000 | 2643.94 / 2655.25 | 2579.31 / 2584.23 | 1、1、1 | 0、0、0 |
| 30000 | 3750.17 / 3757.22 | 3748.34 / 3838.30 | 1、1、1 | 0、0、0 |

每档初始完整写N文档；保存后完整资格终态写0facts，不能将它当作此前文件发布也写0。
表中保存1写来自同输入下全部相关Native终态的逻辑合计。重复通知为0写，原始行/事务/缓存采样均保留。
Source恢复、正常关闭、全部DB结构/FK及资产核对通过，校准128另计；共5个会话通过。

结论：**文件事实写量已限制到变化文件，但完整对账/资格等待仍随规模增长**，重复通知零facts写也约3.75秒。
不能宣称端到端O(1)、所有路径摆脱总文件数，或把这些时间全部归给写SQLite；内部读取/等待细分未测。
与旧Native实现的保存时间不直接套比；此前同架构早期候选的四档证据有不同Native哈希，当前表才是最终候选复核。

证据：`current-native-four-size-summary.json`、`persisted-source-scale/execution.json`及各会话原始Native/请求/资源/输入恢复结果。

## 旧版缺失的30K诊断格及边界

固定旧298d的cold/warm两个缺失格已执行，均FAIL；首次定义分别22823.50ms和16208.64ms后返回-32803。
两者都有`configuration-witness-capacity / retainedPaths4096`实际日志，正常关闭及DB检查通过。
后续补全/引用/rename未执行、未测；不能当成功时延或作为新候选性能收益分母。
旧版核验包含77个runtime资产及另外2个历史扩展/grammar身份，不是79个runtime或真实UI流量。
证据`baseline-profile-followup-13/{cold,warm}-failure-adjudication.json`。

剩余：最终文档/作用域复核、真实UI/Windows未测；原SCALE002/003语义长尾/截止、SDK和完整30K引用/rename限制保留。
不自动部署、提交、合并、发布或删除真实缓存。
