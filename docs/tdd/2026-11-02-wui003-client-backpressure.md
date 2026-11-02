# WUI-003：客户端生产端背压的 TDD 记录

日期：2026-11-02。服务端父版本 `b57ad075a80fdc2169189ba7da17fc6bb98a0866`；
客户端固定为 Zed `8dd255c3eafb5231056fe4e6f601cedd011f1c93`。
原有 WUI-009 工作单独保留。本轮不提交、部署、合并或发布。

证据根目录：`.bench/wui003-burst-20261102/`，以下路径均相对此目录。
补丁见 [交付说明](../../editors/zed/client-patches/WUI-003-BACKPRESSURE.md)。
这是实际 Project/RelatedExcerptStore 组件与 framed 内存测试 LSP 的客户端测试，
不是物理桌面 UI，也不是本仓库服务端的 child stdio 测试。

## 表征与失败回归

先在原组件运行既有 `test_related_files_for_unstructured_language`，通过1项；
`client-characterization-online.log/.json` 保存命令及身份。
更早 offline 运行因缺少 `env_filter` 失败，只是依赖准备失败，不计行为 RED。

原版加入 [RED 夹具](../../editors/zed/client-patches/fixtures/context-backpressure-red.rs)：

```sh
python3 client-cargo.py candidate client-bounded-producer-red \
  test --locked --offline -p edit_prediction_context --lib context_backpressure_tests \
  -- --nocapture --test-threads=1
```

当时的 candidate 仅在原版产品源码上加入 RED 模块，包装器临时安装它，
收据列出实际输入哈希；不是在最终候选上声称仍可重跑出原版 RED。
两项均失败：首对响应被测试端扣住时，**已收到64条请求，预期2条**。
对照不是缩小标识符数：选32个标识符，每个 definition + typeDefinition。
还验证 Project 人工定义请求能在自动请求未完成时独立提交。

第一个最小实现将 Project Task 的创建移入惰性 async 流，`buffered(1)`，
两项 GREEN；随后原25项表征加新2项，**27/27通过**。
单纯对已创建 Task 的列表使用 buffered 不成立，Task 在构造列表时已启动。

## 生命周期补强的 RED → GREEN

延长生产时间后必须处理编辑及新 refresh；不能把旧上下文分32轮送到新文档。
`client-supersession-red-2.log` 在只有惰性背压、没有版本/refresh 保护的候选上：

- 新光标输入、未保存编辑两个用例 RED：旧首对响应释放后又收到下一对，实际4、预期2。
- 其他三个对照通过。更早一次把相同输入误判为必须取消的设计探针也保留；
  最终要求相同输入不能饿死正在运行的 refresh。

最小实现增加源版本和 refresh 身份，在准入、返回、最终发布处核验；
新输入停止未发出的旧请求，旧部分缓存不提交，Started 对应明确 Finished(superseded)。
调用方调试记录相应终态，原 debounce 和完成缓存语义保留。

最终6个回归：

1. 首对挂起时只收到2条；人工 Project 定义仍可提交；释放后全部64条及热命中正确。
2. owner 销毁后不继续创建其余请求。
3. 新光标使旧 refresh superseded，新 refresh 完成全部64条。
4. 未保存前缀编辑使旧 refresh superseded；新64条的位置全部在新文本行1，旧首对在行0。
5. identifier 行窗策略改变使旧 refresh superseded，新一轮正常完成。
6. 同输入 refresh 不使正在执行的工作失效，完成后仍能命中。

完整上下文测试 `client-context-final-fresh-positions.log`：**31/31通过，0忽略**。
`client-context-scheduler-seeds.log`：6项各20个调度种子，**120次执行通过**；
此时产品代码与最终版本相同，最后一轮另外加强新文本位置断言。
下游 `client-consumer-final-all.log`：**105/105通过，0忽略**。
测试命令、二进制哈希、候选源码哈希及恢复旧构建目录的收据均同名保存。

## 完整性与检查边界

`client-cargo.py` 每次检查固定上游输入，只临时替换本轮拥有的文件；
完成后逐字节恢复并写 `.restore.json`，原 WUI-009 candidate 不改动。
客户端正式 release 库构建、30K 两种生产节奏及最终身份校验另见
[根因与验证报告](../reports/2026-11-02-wui003-burst-root-cause-and-fix.md)。

服务端目录观察辅助实验已撤回，见 [Rejected ADR0039](../adr/0039-validation-directory-observations.md)
及 [独立实验记录](2026-11-02-wui003-burst-navigation.md)，不冒充最终修复。
该实验曾执行完整 `pnpm check:fast`：2215项中2191通过、24失败、0忽略。
23项由隔离工作树的 node_modules 符号链接被源码清单误收录导致 EISDIR，
1项为实验新增测试未计入清单。保留原失败日志，未放宽检查。
撤回实验并修正工作树安装布局后，三份检查文件 **28/28通过**；
最终 server/Worker 源码、测试清单及构建哈希与 main 完全一致，build/typecheck 通过。
**未将这次局部复测写成最终全量 check:fast 通过。**

新增 Rust 文件均≤500行。原771行上下文文件缩至437行；
原3684行 `edit_prediction.rs` 缩至3625行，仍为历史迁移债务，
其调试事件处理职责已抽出73行模块，不把机械切文件作为优化。
补丁应用及回读字节校验见 `client-patch-roundtrip.json`；上游人工审阅标记保留。
