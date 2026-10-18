# OP01 驻留引用优先查询对照结果

日期：2026-10-12；采纳审计2026-10-15。状态：OP-01路由切片已采纳／DONE；
原计时构建完整回归FAIL保留，正式产品验收未通过。
工作分支 `codex/op00-query-attribution`，父修订 `a111235bc4bfcb55b126752f95b3ba095f2996af`。
对应[后续计划 OP-01](../plans/2026-10-11-query-performance-follow-up-plan.md#op-01-提前尝试完整-resident-引用)
及[公开 TDD 和回归记录](../tdd/op01-resident-first-routing.md)。

当前构建的 12 个计时会话和四个独立 trace 会话均已结束，分别 60/60、20/20
请求与完整 oracle 一致，正常最新诊断及产品进程退出通过，前后输入身份一致。
新引用六对中五对更快、一对更慢；新顺序确实去掉热 resident 路径的候选规划。
编辑后仍为秒级，RSS 没有一致收益。该有限对照支持保留候选继续审计，不能
证明正式 P95、整体产品提速或内存验收完成。随后新完整回归仍有 12 项失败，不能请求合入。

## 输入和执行边界

同一真实 Settings checkout `ecc550dfaed880e04e38a2477eb7235cd50475b9`、API24 SDK、
完整 Host／scope、SDK `full`、依赖 `closure`、预算 1024 MiB。一个 semantic owner、
最多两个 resident contexts、原滞回与完整 transient fallback 不变。
[ADR 0015](../adr/0015-default-resident-optimization-policy.md) 的六项变量均未设置，
使用生产默认开启值。只有 `ARKTS_REFERENCES_RESIDENT_FIRST` 在 1/0 间变化；
关闭它不关闭 R-09 或其它五项优化。

普通诊断开启，timing 的 trace 关闭，四个 trace 会话另起进程。每种声明策略
预声明三对，逐轮反序；不追加有利样本，也不移除方向相反或更慢的结果。
`ARKTS_BENCHMARK_CONTROL=1` 仅开放准备与观测入口；手动／压力 Worker 回收、
GC、旧 sessionReuse、anchor 候选与缩小 scope 均关闭。

每个会话先完成显式全根准备，不提前查询目标池，再测未查 implementation、
未查 HomeInitData 引用、同快照 cache、未保存引用新增和删除。位置分别为
9→10→9（不含声明）和 10→11→10（含声明），不能用 cache 行填新符号桶。
原实验停止线为查询／诊断各 180 秒，idle 5 秒；不是正式 550 ms 放宽。

| 身份 | SHA256 或版本 |
| --- | --- |
| 生产源码输入 | `7816d51da0ef06080f4e3940e550b92b863ebc8064d485d8e7d361faaadde8d9` |
| server | `a2df8bb0c31cf73d0f438fe48eb9127aa674ec5ab8723ca4f7ea20f8e811bc91` |
| semantic Worker | `d4a701bd70e8f7dd05b31153fb5976eacd378c7db6ec459cf8b5377d958ae6e0` |
| reference verifier | `3c32f9762ce46914413b824cf296be7f4a2624a522ea298857a5e1f49e87dcd7` |
| diagnostic verifier | `f53798946b19acfe81c9ebd1d47094d6f8ec6b39e92f62c5ce8bb3556448c5d3` |
| stdlib | `ea78beea2aa84f93fe66645465c37eb916028b79cd9fe898d469bdf54efbf97d` |
| sidecar | `84597a63c396ceaf2a84a3ded455b5cc29d21b6c4ad3c049f7b3ca820c2fd796` |
| SDK 声明 | `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4` |
| Node／compiler | Node 20.19.5／ohos-typescript 4.9.5-r10 |

完整 pins、逐文件 digest 和前后审计在 `.bench/op01-calibration-v3-audit.json`。
它与首版 `2d113f7f…`、未执行的 v2 `e09e66db…` 独立，不改写旧结果。

## 逐对计时和资源

以下每格均为 ON／OFF，时延单位 ms，Node 峰值单位 MiB。全部数值来自独立
trace-off 真实 stdio 会话。用例之间的准备／诊断等待属于完整响应，不移到发送前。

| 声明策略 | 轮次 | 未查引用 ms | 新增引用 ms | 删除引用 ms | Node 峰值 MiB |
| --- | --- | --- | --- | --- | --- |
| 不含声明 | 1 | 832.5／1018.0 | 3923.5／4524.9 | 3532.1／3609.2 | 1059.1／1069.2 |
| 不含声明 | 2 | 899.9／978.5 | 4250.1／4209.1 | 3957.6／3943.6 | 1075.3／1069.8 |
| 不含声明 | 3 | 845.3／1026.5 | 3913.5／4274.7 | 3837.2／4034.8 | 1075.4／1067.1 |
| 含声明 | 1 | 1015.4／978.0 | 4489.0／4318.9 | 4107.1／4038.3 | 1073.3／1082.8 |
| 含声明 | 2 | 1015.2／1254.1 | 4681.8／5209.0 | 4511.2／5155.1 | 1067.4／1074.2 |
| 含声明 | 3 | 1155.3／1343.9 | 5125.2／5408.3 | 4846.7／5096.8 | 1081.8／1073.2 |

不含声明新目标三对均更快；含声明第一对反向约 37 ms，其余两对更快。
编辑新增和删除各有四对更快、两对更慢，不能归纳为稳定的编辑收益。
重复 cache 为 1.15–1.88 ms，单列，不作为未查目标性能。

Node 峰值三对降低、三对升高，差异约 ±1%，没有一致内存改善。
产品进程树峰值同序为 1097.1／1239.2、1244.8／1239.5、1245.5／1236.4、
1242.9／1252.6、1236.9／1243.6、1251.5／1242.4 MiB；第一对进程树峰值差异
单独保留，不认定为路由独占收益。Node PID RSS 包含 Worker threads，不重复相加；
进程树 RSS 与 Node RSS 分开，均不能代替 Linux PSS。1024 MiB 是政策值，不是硬 RSS 上限。
请求的采样间隔为 50 ms，实际间隔更稀疏，各 raw 报告保留 p50/p95/max，不能
按“精确每 50 ms”解释峰值。

运行期间可见 swap 使用约 4578.5 MiB；thermal/CPU power 状态不可读。这些
环境记录不证明波动的唯一原因，也不用于删除慢样本或推断纯 compiler CPU。

## 独立机制归因

两种声明策略的新目标，ON 各有一个完整 resident hit，候选规划和 verifier
启动均为零；OFF 同样 resident hit、无 verifier，但各先做一次候选规划，
分别约 96.94／114.69 ms。ON/OFF 使用同一个语义 owner 和完整结果证明，
没有新增 compiler、语义 owner、SourceFile 缓存或跨 Program Symbol。

每次编辑后的四个 trace 路径都回到一个完整 transient batch。ON 仍比 OFF
多一次 metadata 准备（约 21–29 ms）和一次有界 resident miss；有效观察的
开始／结束 fences 保留。编辑后的失效观察已被撤销，不能据两个相同
`inputs-changed` 事件推断又执行了相同 I/O；实际 SDK leaf 检查 3→0 的证据
来自真实公开反例，见 TDD，不以 trace 分组事件数冒充实际读取次数。

冷根新增“尚无完成查询记录时不提前试探”的提示只影响优化机会，未知或
并发状态仍走原完整 fallback。它不授予有效性、不永久否定结果；Worker 替换
时清除。相关公开联合 79/79 与原 403 文件／20 秒合同单跑通过，不替代下述 whole。

## 新完整回归与失败边界

同一构建的新 `pnpm check:fast`：1601 项、1589 PASS／12 FAIL、exit 1，
2842451.362002 ms，根统计零 skip/cancel/todo。before/after 的 1615 文件、
repo digest `754252ce…` 和全部源码／产物／SDK／compiler／stdlib／sidecar／Settings
pins 一致，审计 `.bench/op01-whole-node20-v2-audit.json`。
日志 `.bench/op01-whole-node20-v2.stdout.log` 的 SHA256 为
`a736559b0c6a2f32d23250dd373fbdf281c93a585b833b35fd1c1b2f28d2ec9d`。

十一项为 hover、rename／prepareRename、补全和 definition 的原 5 秒响应超时，
一个为 403 文件引用的原 20 秒超时。引用这次失败在首次不含声明请求 id 2，
已进入 index 未 open 时的原完整 fallback；不是历史后续声明策略超时的同一个观测。
随后五个原 5 秒失败用例单跑 5/5 PASS、exit 0，20574.15714 ms，另 31 项未选中，
原截止时间与 SDK 输入不变。单跑未复现，不宣布整轮修复或唯一环境原因；
随后五个原失败所在完整文件的有限序列 45/45 PASS、exit 0、零 skip/cancel/todo，
133997.288216 ms，源码／产物／SDK pins 和测试字节一致；仍未复现整轮超时。
详见 TDD 的完整命令与结果记录。OP-01 保持 IN_PROGRESS，缩短序列不替代 whole。

## 未通过的正式门禁和下一步

16 份 raw 报告全部保留 `status=FAIL`／CLI exit 1；功能精确、最新诊断、产品
exit 0 和输入不变不等于正式 PASS。全根准备仍因必要输入
`SettingsDataUtils.ts` 的 TS2307：无法解析 `@ohos.data.DataShareResultSet`，而
返回 DEGRADED，没有完整 READY receipt。没有新增 SDK 版本匹配门禁，API24
兼容性沿用现有决定；必要依赖解析的实际缺口需独立处理。

正式时延／内存、336 格、足量会话、soak、DevEco/PSS 和三平台仍未完成；
不能从本样本计算并宣布正式 P95。原 1601 whole FAIL 和 85 项联合 FAIL
保留；当前新 whole 的 1589／1601 FAIL 同样保留。先建立更短的可复现序列并
定位实际成本，修复后须取得新的完整 GREEN，再审计 OP-01 的采纳／回退。
OP-02 输入核验复用和 OP-04 编辑准备优化继续按各自归因和公开合同推进，
不以 550 ms、客户端或全产品 ready 作为前序阶段共同屏障。

## 原始证据与重放

有限清单 `.bench/op01-calibration-v3-jobs.json` 预声明 12 timing 和四个独立 trace。
终态摘要 `.bench/op01-calibration-v3-terminal-state.json` 保存逐会话实际 CLI
退出、响应、采样及身份；审计文件绑定每份 manifest/report/stdout 的 SHA256。
原始文件未提交到文档目录，旧报告不覆盖。

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --input-type=module <<'NODE'
import fs from "node:fs"
import path from "node:path"
const id = "op01-lsp-no-declaration-on-r1-timing-v3-replay"
const suite = JSON.parse(fs.readFileSync(
  ".bench/op01-lsp-no-declaration-on-r1-timing-v3-manifest.json", "utf8"))
suite.benchmarkId = id
suite.runtime.env.ARKTS_MEMORY_METRICS_FILE = path.resolve(`.bench/${id}.metrics.jsonl`)
if (fs.existsSync(suite.runtime.env.ARKTS_MEMORY_METRICS_FILE)) throw new Error("metrics already exist")
fs.writeFileSync(`.bench/${id}-manifest.json`, JSON.stringify(suite, null, 2), { flag: "wx" })
NODE
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node scripts/bench/replay-references.mjs \
  --prepared-suite .bench/op01-lsp-no-declaration-on-r1-timing-v3-replay-manifest.json \
  --out .bench/op01-lsp-no-declaration-on-r1-timing-v3-replay.json
```

其余组合按清单中的原 manifest 重放至新的 out 路径；不要覆盖已有报告或
复用已有 metrics 文件做新的正式样本。新采样须生成独立输出／metrics 身份。

## 2026-10-15 采纳范围

根据上述固定对照采纳完整驻留前移：5/6新目标更快，热命中少一次候选规划；
编辑／RSS混合，不宣称整体稳定收益或P95。0独立回退和冷根跳过试探保持。
当前路由／保护8文件与最近冻结生产whole1757/1757的源码字节一致，十个直接
冷热／miss／取消／lane／package retarget／压力／不完整scope合同原PASS已复核。
16份原report／manifest／stdout digest不变；audit SHA
`1fa7716d52960a6636368aa785cbd7ea0fe541f92ea4df7f3f72b798eb44aa6e`。
该生产检查点与原7816d51d计时身份分开，不把旧样本升级到当前5cf9d618。
旧全部FAIL／DEGRADED保留；新工具head还需fresh whole，L08仍IN_PROGRESS。
