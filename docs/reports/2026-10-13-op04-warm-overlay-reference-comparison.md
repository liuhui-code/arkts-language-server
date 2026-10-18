# OP-04 暖 owner 相邻编辑引用对照

日期：2026-10-13。状态：有限净收益对照完成，实验未默认采纳，OP-04仍IN_PROGRESS。

结论：完整 Settings/API24、同构建、正常诊断和 trace-off 的短对照精确且提速，
但后续400次编辑没有持续净收益，不能据短样本采纳。独立有界trace观察到
L2 trim→resident压力miss→L3驱逐→冷回退链。它不是所有慢请求的唯一原因，
也不是内存/时延平衡完成或550ms/PSS/最终能力矩阵PASS。

## 冻结输入与工作流

父HEAD a111235bc4bfcb55b126752f95b3ba095f2996af，分支codex/op00-query-attribution。
生产source d6d525cf6d8ed9acf9a30a4d87940497175d06519f0f9514137162ded140d8d3。
完整Settings ecc550dfaed880e04e38a2477eb7235cd50475b9，workspace SHA
4becf56cb2ff65cc58bd1ae53b6937b194f9020770ad397e526f3a51b85b0d40；
完整API24/6.1.1.125声明digest
8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4。
Node20.19.5、锁定compiler4.9.5-r10、stdlib/sidecar/lock/门禁和所有产物前后相同。
仓库1645文件 SHA c99454bbbabd843129bbc5520b1b46e1cd2202ae58db0ada3ca4ee16e9ead645。

预声明顺序：不含声明OFF→ON，含声明ON→OFF，四个独立实际child。
仅ARKTS_REFERENCES_OVERLAY_SYNC切换0/1。既有六优化、versioned Snapshot、
resident-first、输入hash/module-resolution复用保持开启；1024MiB、full SDK、
closure、indexed-batched、原owner/context/lease/压力策略保持。trace/benchmark
控制/主动Worker回收/旧S05/anchor/scope缩小/强制GC关闭，正常诊断保留。

每会话六个真实请求：全工程implementation暖机，等待两份v1诊断，再重复
implementation、首次HomeInitData引用、当前repeat、v2新增引用、v3删除引用。
每次编辑后等当前版本诊断；全部请求和诊断原期限20s，不放宽产品测试门槛。
末次诊断后正常idle5s。24/24请求exact、16份完整诊断、实际child全部exit0；
两对整份位置与诊断payload相等，不仅比较数量。工具原始CLI均exit1，
readiness仍DEGRADED，2307缺少DataShareResultSet依赖保留，未伪造READY。

## 实际计时与资源

下表是各一次真实RPC，不是P95或独占compiler CPU。

| 声明策略/顺序 | 同步 | 新增引用ms | 删除引用ms | 观测Node峰值MiB | idle Node MiB |
| --- | --- | ---: | ---: | ---: | ---: |
| 不含声明/正序 | OFF | 5863.46 | 5562.41 | 1070.39 | 477.34 |
| 不含声明/正序 | ON | 2175.88 | 2124.51 | 829.47 | 810.71 |
| 含声明/反序 | ON | 2158.48 | 2251.70 | 835.73 | 799.23 |
| 含声明/反序 | OFF | 5971.91 | 5732.83 | 1100.73 | 489.23 |

两方向编辑提速约61–64%；首次未查引用OFF734.27/775.04ms、ON767.11/755.77ms，
未证明新符号整体稳定提速。缓存repeat约1.26–1.48ms不充作新查询样本。
ON的idle RSS比各自OFF高约310–333MiB；没有GC后live heap、retaining path或
≥100编辑平台期，不能叫泄漏或宣称内存无风险。观测峰值降低不覆盖全部短峰。

RSS来自外部按PID采样，Worker线程不重复相加、sampler独立记账。目标间隔50ms，
实际中位133–135ms、P95 141–146ms、最大151–167ms，共1374个原始样本；
可能漏短峰。idle是实际5s窗口内Node样本中位数。原始峰值/进程和/间隔核对
PASS仅表示内部一致，RSS不是PSS/物理释放证明，1024MiB不是硬RSS上限。

## 证据与后续

原始目录`.bench/op04-overlay-sync-settings-net-v1/`：plan/state、四份manifest、
report、stdout及metrics均独立归档，无覆盖重试。每组命令为Node20执行
`scripts/bench/replay-references.mjs --prepared-suite <manifest> --out <report>`。
独立terminal audit重新核对当前生产/SDK/仓库、全部raw摘要和真实PID/exit、
完整位置/诊断及RSS原始数据，PASS、releaseEligible=false；audit SHA
586b6cdc8261a9c6ba3ca78e59abdf2c398cfaa34bf7792f8506b517ce43c250。
state SHA540f7d82bf3d87bb506e05c6e956766f15a3423101b9068c052a076552611b41。

实现及磁盘漏引用RED→GREEN/索引兼容反例见
[OP-04 TDD](../tdd/op04-versioned-overlay-snapshot.md)。当前20/20相关回归不代替
新全量check:fast；旧C2工具1663/1663不覆盖这个新source。
继续≥100交替编辑、资源趋势、其它未知/在途输入、净成本与采纳/回退审计。
实验仍default-off；OP-05生命周期校准和OP-06/L08全部原始门禁不缩减。

## 后续400编辑：短样本收益没有持续

预声明四组各100次新增/删除交替编辑，保持同一生产d6d525cf、SDK及原20s期限，
每次编辑等待当前版本诊断。四组416/416请求exact、408份完整诊断，两方向整份
位置及诊断payload相等，真实child全部exit0。原第三组完成查询后因RSS校验FAIL
停止，第四组原NOT_RUN保留；恢复后仅补执行第四组，另存remaining-control目录，
不重跑前三组或覆盖失败。末组隔了约12小时，不能声称四组连续/相同即时设备状态。

每行100次编辑，以下P95是candidate-control描述性统计，不是正式L08分布。

| 策略/顺序 | 同步 | 编辑中位ms | 编辑P95 ms | 观测Node峰值MiB | idle Node MiB |
| --- | --- | ---: | ---: | ---: | ---: |
| 不含声明/正序 | OFF | 5582.33 | 5772.24 | 1103.30 | 415.35 |
| 不含声明/正序 | ON | 6002.29 | 6847.75 | 1221.85 | 376.44 |
| 含声明/反序 | ON | 6478.61 | 7402.73 | 未认证（RSS FAIL） | 未认证（RSS FAIL） |
| 含声明/反序，补执行 | OFF | 5639.72 | 6352.96 | 1108.65 | 353.63 |

两组ON仅前11/10次编辑小于3s，之后不再维持短对照的约2.2s。资源指标出现
context0和transient1，支持已丢失暖复用资格；trace-off不记录coordinator原因，
不能从计时/占用推断LS dispose、GC、物理释放或唯一回收触发链。该缺口已由
下述独立有界trace补充。正常100序列不强制GC、不改预算/滞回/owner或正常诊断。

第三组4912个RSS样本中，第3130行timestamp比前一行倒退50ms。
独立Worker资源时钟epochMs-minus-monotonicNs约回拨194.93ms，LSP harness
epoch-minus-monotonicMs约回拨194.38ms，支持系统墙钟调整，而非样本重排。
RPC elapsed来自单调时钟，原查询/诊断完整性仍独立成立；原RSS FAIL保留，
不排序/删除/改写原样本，也不补造单调时间。未来采集应另录实际单调时钟。

原始`.bench/op04-overlay-sync-settings-100-edit-v1/`与
`.bench/op04-overlay-sync-settings-100-edit-v1-remaining-control/`均保留完整命令、
manifest/report/日志/metrics及前后身份。独立completed-plan-audit.json重新核对
所有完整oracle/诊断、当前production/SDK、真实PID/exit及raw摘要：
INTEGRITY_PASS/functional PASS/resource FAIL/releaseEligible=false，audit SHA
6aa47c56d2084d89d343599e04af75f466420158303f83c48d712d3d9c3fe87b。

本批不支持持续时延/内存净收益，不能以短对照推广。实验继续default-off，
采纳审计未通过；先核对压力/失效触发链，再选择后续成本校准切片。
其它OP-04边界、OP-05/06、fresh whole及原L08最终范围继续，不按已完成数据缩小。

## 独立15次编辑诊断：压力与暖资格失效链

同一d6d525cf生产构建、完整工程/SDK、六默认及1024MiB，固定15次编辑，
仅本会话显式trace=1和overlay-sync=1；不追加到正常400编辑分布。
19/19请求exact、17份当前完整诊断，真实child exit0；原CLI1/DEGRADED保留。

| 实际UTC / 请求 | 原始事件与观测 |
| --- | --- |
| 14:49:37.372 | context1创建，原因missing |
| 14:50:07.199 | context1 L2 trim，原因memory-level2、lease0 |
| 编辑1–11 | resident hit；完整RPC1879–1918ms |
| 14:50:27.342/.466 | 编辑12的resident miss，实际memoryLevel=level2；RPC5164ms |
| 14:50:28.936 | context1 L3驱逐，原因memory-level3、lease0、contexts0 |
| 编辑13–15 | context2/3/4创建，inputs-incomplete，随后各L3驱逐；完整RPC5011–5111ms |

这是本固定窗口的实际触发链，不证明所有正常长序列的唯一原因，不等同native
LS dispose/Registry零残余、GC或PSS回落。L2事件之后尚有暖命中，不能把它
简化成“每次trim立即完全失效”。trace计时有观测开销，不算正常产品收益。
该会话802个RSS样本内部核对PASS；仍不是最终PSS或连续峰值资格。

目录`.bench/op04-overlay-sync-settings-boundary-trace-v1/`，固定manifest、命令、
state/report/stdout/metrics和前后生产/仓库身份均保存。独立terminal-cause-audit
再次核对完整oracle、raw SHA、真实PID/exit及当前production/SDK：INTEGRITY_PASS，
audit SHA2b188cfcdbbf077836f59f8b07c237d37f532039ede34515de90427d173f9b36。
state SHA c070b78395765a830813f99e471f71e7199c3c36e7a11ebf68a8e727d575bb29。

OP-05据此优先校准暖复用资格、trim/驱逐与冷恢复的净成本；不提高预算、
不删工程成员、不退回cleanup-only或保留永久verifier。未来RSS单调采集已完成
公开RED→GREEN及97/97相关回归，见[OP-06证据](../tdd/op06-release-sample-evidence.md)。
不补造原4912样本的单调时钟，原400编辑resource FAIL继续保留。
