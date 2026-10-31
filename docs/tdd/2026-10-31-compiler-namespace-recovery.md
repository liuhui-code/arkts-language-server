# 2026-10-31：NAV-INPUT-001 与突发导航验证

父提交 `04282ed34ebab7cd01726bb0291af53bd278ff00`；未提交 ADR0037/0035 工作保留。
证据根 `.bench/nav-input-recovery-20261031/`；`baseline-identity.json`、`existing-worktree.patch`
记录起始源码/产物身份。无提交、合并、部署或真实缓存清理。

## RED → 定位

```sh
NAV_INPUT_EVIDENCE_DIR=.bench/nav-input-recovery-20261031/red-1 \
node --test --test-concurrency=1 tests/semantic/unnotified-import-type-recovery.test.mjs
```

`public-red.log` exit1：any 成功、无通知创建后请求3及4都 -32803，第二显式请求断言失败。
Worker `6ffc6fac3eed366e2821a1bc13914ec646806f9f259617f610abdcab0245093a`。
只读 observer 的 `witness-observation.ndjson`/`diagnostic-red.log` 独立复现同样结果：
compiler witness1 保留 nested 的旧 full directory identity，hover 内 assertCurrentInputs 拒绝；
原始无插桩计时与插桩运行分开，不将 observer 的耗时作为性能结论。

## 第一最小 GREEN 及扩大回归的反证

`public-green-1.log`：首次 -32803、下一请求 Lazy.value:number，同 Worker。
`matrix-green-1.log` 四组完整/partial、已存在/新建目录、开关文档对照通过。
该中间实现让所有 compiler witness 的过期事实推进域，**不可交付**：
`focused-green.log` 49 项中45通过、4失败；三份为 SDK 配置/metadata 旧合同破坏，
一份为新增测试分类计数未更新。原断言与失败日志保留。

## 收窄后的候选

新增实际来源分类，只有源码 namespace 过期且所有其他事实当前、物理边界成立时申请域退休。
已知失败读、SDK/配置未知变化维持原合同。消费者来源 API 的提取同时令超限 LS 文件进一步减少。
`narrow-green-1.log`：15/16，仅分类清单数量遗漏；修正清单统计，不改产品断言。
`narrow-green-2.log`：23/23，包括原 SDK/authority 回归、四格恢复及并发 SDK 变化拒绝。
`cycle-green.log`：1个选中用例通过、5个未选；包含两轮无通知删除目录/恢复，不能写成6项全量通过。

后续扩大来源覆盖到实际 compiler source read/目录枚举；最终候选命令、冻结产物、完整检查、
Mac30K/突发及 UI 能力以实施报告最终收据为准，不沿用旧 fast2152 作为新代码通过证明。

## 完整检查发现正向源码读回归，候选退回

13e90ee7源码805项固定，完整检查发现5项已有回归，原日志及SIGINT中止原因保留。
本次运行1796.325秒、exit1，主动中止后未执行尾段，不称完整跑完；自有测试进程组已无残留。
原26k/30K短测不能盖过这些失败，后继30K脚本亦因该检查失败未执行。

```sh
node --test --test-concurrency=1 tests/semantic/changed-source-read-witness.test.mjs
```

独立`known-source-red.log`6项中1通过/5失败，复现健康body delta context2≠1，
另四项在原`observeChangedSourceRead`注入窗口之前就更换owner，窗口证据文件不存在。
该命令父为13e90ee7冻结产物、HEAD仍04282ed；不是其他测试污染才失败。

修正`regularSourceFacts`：保留实际加载类型，仍为常规源码的变化走既有权威读；
只有可证明namespace变化有资格申请退休，undefined identity不能取得资格。
原6项全部GREEN，合并现有namespace/新7项为26/26，`known-source-and-namespace-green.log`。
源码及产物重新冻结在`.bench/nav-input-recovery-v2-20261031/`：805输入且保存source副本，
相对13e90ee7只改LoadedConfigurationWitness源码；server2841a826、Workere2a30dd0。
新完整check从头2160/2160通过，exit0、3469.048秒，0失败/取消/跳过/todo；805输入零差异。
随后串行三轮30K前后比每轮69完整响应一致；根目录98.619秒、phone/picker91.184秒各78记录/64公开请求，
各51当前成功、11保护性拒绝、2完整范围限制；模块交替类型/递增行号/补全详情与textEdit精确通过。
每份1Worker/0换代、12次未借出lease的namespace消费者退休，无自有native残留。
最终源码805及副本/SDK3956/原30000源码零差异，75构建声明产物一致。
三个测试driver差异经实际builder来源核实，原误分类audit失败及修正依据保留，不改产品断言。
完整量化、复现脚本、原始响应及UI阻塞见[最终报告](../reports/2026-10-31-compiler-namespace-recovery-final.md)。
不将短测算正式耐久，不关闭剩余约3.1秒namespace重载、3.78秒突发尾部、native99%或全量能力缺口。
