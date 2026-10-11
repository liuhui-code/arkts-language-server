# L02：晋升失效边界、target 空定位修复与真实编辑成本

日期：2026-10-08。结论：**公开失效合同已扩展，修复 target 切换后的
首次空定位；真实未保存编辑保持精确，但未证明晋升机制加速真实编辑。**
L02 继续推进；最终内存、P95、长期 soak 与发布门禁仍在 L08。

## 公开协议与修复

接续 [同内容晋升实验](2026-10-08-resident-l02-same-content-promotion.md)，
新 fixture 每个场景都先实际发生 matching lazy→resident 晋升，再分别
验证 API、import、create/delete、open/delete/close、SDK、package 和 target。
正常诊断、原 deadline、合法工程范围和精确 UTF-16 oracle 保留。

| 场景 | 已验证的公开行为 |
| --- | --- |
| Public API | number→string 后 imported member definition/hover 与 2322 诊断精确 |
| Import | alias 换绑定位新声明，旧符号两种 declaration policy 不含旧 consumer |
| Create/delete | 未打开成员两处引用完整加入/移除，两种 policy 精确 |
| Open/delete/close | 打开 overlay 抵抗磁盘删除；关闭后只回本地 import alias，2307 诊断正确 |
| SDK | 新 SDK URI/range 与类型诊断同时更新，打开工程文本保留 |
| Package | unchanged promoted buffer 与磁盘分歧时，main 换绑定位新文件并保留 buffer authority |
| Target | tablet→desktop 的首个请求定位新全局类，旧 target 不混入；OFF/ON 均通过 |

Target 用例先稳定 RED：首次返回 `[]`。关闭晋升也同样失败；直接重复
仍为空，而一次完整 references 后立即正确。既有局部 definition 在
`document-store-reset` 后只准备 2 个依赖 roots，合法范围实际是 274 个。
修复保留已有有效局部定位，仅空结果时检查取消并在完整合法范围复核，
不向客户端发布中间空值。这个正确性修复作用于既有 definition，不是
把实验晋升或 resident references 改为生产默认；冷 miss 的额外成本仍开放。
完整 RED/诊断/最小 GREEN 见 [TDD](../tdd/l02-promotion-invalidation.md)。

## 当前构建与真实回放输入

Server parent HEAD `1b9101520b0d7d3358e4ce8f27f0bfcc06db902f`；源码输入
SHA-256 `7207d766f037f1c972b5f2d45b149e88aca5d13df7b7fc92d1afae4c8075e152`，
semantic Worker `e035888832b6280841fb9b58f04a169fa2d569b94b786785a86b6af2254c5020`。
旧晋升报告的 source/build pin 不修改、数据不合并。新 manifests 为
[OFF 追踪](../../bench/references/manifests/settings-resident-l02-edit-off-trace-api24.json)、
[ON 追踪](../../bench/references/manifests/settings-resident-l02-edit-on-trace-api24.json)、
[OFF 计时](../../bench/references/manifests/settings-resident-l02-edit-off-timing-api24.json)、
[ON 计时](../../bench/references/manifests/settings-resident-l02-edit-on-timing-api24.json)。

同一个 clean Settings `ecc550dfaed880e04e38a2477eb7235cd50475b9`，工程 digest
`4becf56cb2ff65cc58bd1ae53b6937b194f9020770ad397e526f3a51b85b0d40`；API24 SDK
declaration digest `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`，
Node v26.3.0、backend 4.9.5-r10。其余 build/sidecar/stdlib/lock/SDK pins 在
清单完整冻结。API24 不冒称 API23 matched DevEco/PSS。

先完成 `MenuController` class declaration references 248/248，再查询
预打开的 `HomeInitData` class references 9/9；在 v2 overlay 追加真实
`homeInitData = new HomeInitData();` 后应返回 10/10，再重复作 cache-control。
原 L01 的编辑字节、hash、位置与完整 9/10 oracle 均沿用；首个准备目标
改为已验证的 Menu **class**，不是将旧 constructor 267 与 class 248 混用。
正常诊断、1024 MiB 策略预算及原 deadline 保持，不加入诊断屏障或强制 GC。

## 归因控制：真实编辑仍换代并复用 AST

两次 trace-on 新进程各 4/4 exact，完整位置集与诊断 payload 相同，
输入 postflight 不变，无 request timeout/OOM/partial。实际编辑 Program
均 `1→2`；新 Program 复用 **1495/1496 project SourceFiles、652/652 SDK
SourceFiles**，只有被编辑的 project SourceFile 首次观察。
分组 createProgram 为 OFF 496.8 ms、ON 620.8 ms，完整编辑响应
679.7/785.5 ms；分组事件不等于任意路径的严格调用次数。

关键限制：两轮所有 admission 的 `promotedWithMatchingFingerprint=0`，
resident script 数仍 256，真实内容编辑的 host generation 均 `257→258`。
本路径没有调用晋升快路径，因此不能将 ON/OFF 差异归因晋升机制，
也不能把旧“新文件同内容晋升”收益外推到真实编辑。
原始 `.bench/l02-edit-{off,on}-trace-1.json`。

## 三对 trace-off 编辑与资源控制

顺序 OFF1→ON1→ON2→OFF2→OFF3→ON3；每轮新进程且不并发。

| 对 | 路径 | 首次真实编辑 refs | 初始完整 refs | Node RSS 采样峰值 | 产品进程树采样峰值 |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | OFF | 588.3 ms | 9,083.4 ms | 821,813,248 B | 999,325,696 B |
| 1 | ON | 565.6 ms | 9,296.2 ms | 826,609,664 B | 1,004,646,400 B |
| 2 | ON | 594.2 ms | 9,269.8 ms | 824,848,384 B | 1,002,471,424 B |
| 2 | OFF | 595.1 ms | 9,276.2 ms | 830,922,752 B | 1,008,680,960 B |
| 3 | OFF | 585.8 ms | 9,454.4 ms | 817,795,072 B | 995,966,976 B |
| 3 | ON | 556.4 ms | 9,158.3 ms | 822,243,328 B | 999,796,736 B |

编辑中位数 OFF **588.3 ms**、ON **565.6 ms**，六次仍均 >500 ms。
Node 峰值中位数 OFF **821,813,248 B**、ON **824,848,384 B**；差值方向
不稳定，且归因控制未发生晋升，**不宣布性能或资源收益**。cold refs 仍
约 9.1–9.5 s；重复编辑后的 1.08–1.23 ms 响应单列为 cache-control。

每对四个完整 Location 集和两份诊断 payload 逐项相同，六轮各为
248/248、9/9、10/10、10/10；保留 Menu v1 的原 2307 和 Home v2 空诊断。
全部 `inputUnchanged=true`、4/4 COMPLETE，无 request timeout/OOM/partial。
外采请求 50 ms，实际 P50 114–116 ms、P95 123–127 ms、最大间隔 129–206 ms；
峰值是下界，macOS RSS 不替代 PSS，Worker thread RSS 不重复相加。
原始 `.bench/l02-edit-{off,on}-timing-{1,2,3}.json`。

## 门禁账本与后续

八个有效 suite 顶层仍 `FAIL / READINESS_UNSUPPORTED`，与已执行的精确性
分列，不伪造 semantic-ready。晋升双开关仍 default-off。公开 focused
66/66 PASS、另一个投影/双模式 target 合同 2/2 PASS；新源码独立完整
`pnpm check:fast` **1338/1338 PASS、退出 0**，0 fail/cancel/skip/todo，
总计 1,430,885.378136 ms。原始输出
`.bench/l02-invalidation-check-fast-2026-10-08.log`，执行期间源码冻结。
这关闭当前构建的回归检查，不是性能/内存毕业；前轮 403-file whole
timeout 保留为历史失败，其因果归属仍开放，不改 deadline 或倒改旧账。

这一切片提供独立失效合同和实际编辑成本，供 L03 预算/回收推进；
L02 的更长编辑序列、未知 delta/根别名与所有恢复组合仍不由这些小样本
宣布全阶段毕业。L08 最后统一 P95、内存、soak、跨平台与发布评审。
手写新增模块 20 行、公开测试 479 行；两个既有超限文件迁移债务为
`typescript-language-service.ts` 3576 行、`legacy-semantic-engine.ts` 1068 行
（后者从 1075 行缩短），不能据此继续新增超限文件。
