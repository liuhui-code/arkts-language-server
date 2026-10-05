# S02 第二假说：resolved-signature 显式构造事实

日期：2026-10-03。结论：**两个窄切片精确通过，但v2总体假说被继承别名反例否定；S02 FAIL，S03仍阻断**。
这是独立 CLI 实验，不是生产 LSP 路由、SQLite facts 或 500 ms 产品证据。
父修订 `c4df943e5ff9dc1d724bb2aee75d7c4a197efcf4`；保留已有未提交改动，
未提交、推送或合并。原 [v1 反例](2026-09-29-semantic-ready-s02-facts-spike.md)
及其默认运行方式保持不变。

## 假说与边界

固定 `ohos-typescript@4.9.5-r10` 的 checker 对 `new` 和 `super()` 调用返回
resolved signature。对于**无修饰符、单一显式构造声明**，可由
`signature.declaration` 得到 compiler 的 constructor declaration，再按声明文件、
UTF-16 span 和内容摘要序列化为事实 key。构造关键字自身按 AST kind 定位；
不能把 class symbol 或纯文本名称直接当构造引用身份。更关键的是，
`getResolvedSignature()` 的声明归属并不总等于 Language Service 的
`findReferences()` 分组；因此这个假说最终没有通过必需的精确性门禁。

提取阶段不接目标查询池，`findReferences` 调用为 0；提取 Program 退出后，
另一 PID 只读取序列化 facts 回答目标，再由第三个 compiler PID 的
definition→findReferences oracle 做精确差分。`productionApproved=false`。
实验选项为 `--hypothesis resolved-signature-explicit-constructor-v2`；未指定时仍运行
`public-checker-binding-projection-v1`，其 constructor 反例仍预期 exit 42。

## 固定回放

| 输入 | 查询 | 结果 | 提取 Program files | facts bytes | 提取 findReferences |
| --- | ---: | --- | ---: | ---: | ---: |
| 原显式构造/继承 `constructor.json` | 3 | 3/3 exact；missing/extra 0 | 51 | 5,883 | 0 |
| `new this`、`super`、子类自有构造 barrier | 4 | 4/4 exact；missing/extra 0 | 51 | 16,628 | 0 |
| 带修饰符的构造关键字 | 2 | 两项 `UNSUPPORTED`；预期 exit 42 | — | — | 0 |
| 重载构造关键字 | 2 | 两项 `UNSUPPORTED`；预期 exit 42 | — | — | 0 |
| `new` 表达式光标 | 2 | 两项 `UNSUPPORTED`；预期 exit 42 | — | — | 0 |
| 别名变量、括号及属性访问的调用 | 4 | 构造组被保守拒绝；`UNSUPPORTED`/exit 42 | 51 | 9,061 | 0 |
| 子类经别名／括号继承后 `new Child()` | 2 | **v2多出4个位置；FAIL/exit 42** | 51 | 8,661 | 0 |

前两组提取内部 wall 约 354/373 ms，完整提取子进程 wall 约 662/685 ms。
它们是 51 个 SourceFiles 的小型 ETS
fixture，不含真实 SDK，不是 Settings 压力、LSP 响应时间或产品内存门禁。
前三种缺口与简单别名调用都能拒绝返回事实；最后一个反例则证明
v2 即使看见直接 class Identifier，也会产生错误的构造引用位置。
CLI 的 `FAIL` 不会被解释为产品成功，所有 facts 均保持 `productionApproved=false`。

可重复运行（输出路径需不存在，工具拒绝覆盖已有证据）：

```sh
node scripts/semantic/semantic-facts-spike/run.mjs \
  --mode run --hypothesis resolved-signature-explicit-constructor-v2 \
  --input tests/fixtures/semantic-facts/constructor-barriers.json \
  --queries tests/fixtures/semantic-facts/constructor-barriers-queries.json \
  --out .bench/semantic-ready-s02/barrier-v2-replay-new
```

本机最终构建的原始 `report.json` 位于 `.bench/semantic-ready-s02/`，各目录
及 SHA256 如下；该目录不在 Git 跟踪中，不能替代可重放命令和固定 fixture。

| 目录名 | `report.json` SHA256 |
| --- | --- |
| `constructor-v2-final-20261003` | `4dd4b23eaafd5c306a084a1d572087500b08e66a24075970ca0e5fcd7273766b` |
| `barrier-v2-final-20261003` | `33c576d13affbbd54a122b86176ed76a87cc9f360979a2776f059db93dcd4707` |
| `modifier-v2-final-20261003` | `99483bd9a2907232568979bfb71d2d1843ad862d51ac825f01adbd2d2c1ad0a2` |
| `overload-v2-final-20261003` | `24936e965cf8157d1cb0b778027fb9fe66ed1e1afa8348b9046f04651e7ef2ad` |
| `new-cursor-v2-final-20261003` | `9815f822c399c9c9d554c50aa912fa66ea7f4cc0207a84ed949adc78c15a1979` |
| `call-shapes-v2-final-20261003` | `7925e363398d09cbf34411090f7173040d14264d19b08cb022d7d95e6211f7c2` |
| `heritage-v2-final-20261003` | `5f33e177d2ff361d584c036f5a10b0647f602767e221f220a81beef707d1b9b9` |

## 停止线与下一事实门

修饰符构造在固定 fork 下的 declaration filtering 与简单构造不同；多个
constructor overload 会指向不同 signature declaration，却属于同一 compiler
引用组。隐式默认构造的 `signature.declaration` 可为空；继承调用光标还可能
同时解析到子类和基类构造两个 definition。当前 v2 拒绝已识别的不确定查询，
但经别名／括号继承的反例进一步证明 resolved signature 不足以决定最终
Find References 分组：oracle 对基类构造只返回 declaration，v2 则把
`new ViaAlias()`、`new ViaParen()` 加入两种 declaration policy 的结果。
这两个额外位置在测试中精确固定，而不是继续叠加继承语法特判。

按[ADR0008](../adr/0008-compiler-derived-semantic-facts.md)停止这条 v2 假说。
若重启 S02，先提出不同的 compiler 派生 hook/语义分组来源，并用本反例、
重载、多目标 selection、隐式默认构造、其余 required query-kind 和真实
Settings/SDK 压力逐项证伪；不能再靠增加语法特例让旧假说勉强过例子。
S03事实发布/生产读取继续阻断。阶段实施可以暂不达 500 ms，
但精确性和资源安全不能豁免。

对本地锁定的 `ohos-typescript@4.9.5-r10` bundle 做只读入口审计：
`FindAllReferences.Core.getReferencedSymbolsForNode` 是按单个 node、给定
`sourceFiles` 执行的查询入口；构造引用分组在同一内部实现中完成。
未找到一个可直接订阅或批量导出完整引用分组、且避免逐目标重复扫描的稳定 hook。
这不证明上游无法增加 hook，只说明现有公开 API／本地内部入口不能支撑本次
S02 的批量事实投影合同。若改为修改 compiler fork/增加 bulk hook，须先修订
S02 范围与验收，而不是将内部单查询函数包装成“批量提取已通过”。

TDD 首条 RED：父修订上 `node --test tests/semantic-facts-resolved-signature-spike.test.mjs`
因 CLI 不接受新假说而失败；随后别名调用与继承反例均经独立 RED 固定。
本轮 focused spike/manifest **22/22 PASS**、`pnpm check` PASS；旧 v1 FAIL
由其原测试如实保留。新手写脚本和测试均低于 500 物理行。
`check:fast` 曾启动，但在只读复核发现 v2 反例时主动中断、exit130；
不能把该运行或此前修改前的 1208/1208 当作本实验整套检查通过。
后续固定全部本轮修改后另起的 `pnpm check:fast` 已 exit0、1222/1222 PASS；
它验证工具和生产回归，不改变 v2 语义反例的 FAIL 结论。
