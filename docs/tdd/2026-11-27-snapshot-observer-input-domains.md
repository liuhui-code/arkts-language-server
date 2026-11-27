# 快照观测的编译输入域隔离

日期：2026-11-27。父版本：`8edf6eba1a2a8b034cafddcb756ab3540e10a494`。
关联：ADR0051/0052；PR121。不改变产品输入、取消、GC或增量更新合同。

## RED与根因

[首轮CI](https://github.com/liuhui-code/arkts-language-server/actions/runs/45945005630)
完整Node门禁2842项：2840通过、2失败、0跳过；Rust前置检查已通过，后续artifact/large未执行。
失败为`versioned-overlay-snapshot.test.mjs`的八代祖先探针（2而非1）及GC后增量断言。
Windows安装检查通过，不能替代真实Windows UI或完整Node门禁。

在隔离工作树、同产物、Node20.19.5执行：

```sh
node --test --test-concurrency=1 --test-reporter=spec tests/semantic/versioned-overlay-snapshot.test.mjs
```

Mac同样10通过、2失败、0跳过。公开查询结果断言通过后才失败于观测。
夹具在共享编译器Registry更新调用点记录所有LS，却将所有记录和祖先指针视为一个项目owner。
0051/0052固定源域使用noLib/noResolve和普通ScriptSnapshot，未知change range要求完整解析；
项目域显式启用的VersionedSnapshot仍提供准确增量。两者共享Worker，不共享snapshot谱系。
因此不能将源域的合法null解释成项目域GC后失去增量，也不能把两个实际探针算成重复项目探针。

新增公开双域回归先RED：原始记录没有domain（1失败，12个名称过滤未执行，不算全量）。
回归实际执行局部定义与全局定义、编辑后两条查询、最新诊断和精确目标；不关闭源域入口。

## 最小修正与GREEN

只改测试观测夹具、读取辅助和该公开回归，不改产品代码：

- 从固定编译器实际传给Registry更新的compilationSettings记录source/project域；
  pinned调用点数量断言保留，未知观测域拒绝，不猜测或丢弃原始记录。
- 用WeakMap沿实际previous/current snapshot传播探针祖先，隔离两个实际谱系。
- 原项目增量/GC用例读取项目域；双域用例读取全部原始记录，要求两域各有一份探针、
  项目真实增量可重建当前内容、源域保持完整解析，并校验两个实际公开查询结果。
- 八代历史上限、GC、L3、SDK替换、重启及正确性原断言均保留。

同命令整份13/13 GREEN、0跳过，约48秒；并非完整`pnpm check:fast`。
产品server/两Worker/native哈希与首轮候选相同。最终完整门禁须以新PR CI实际终态为准。
本地首轮完整检查保持冻结并保留其原始终态，不中途改动候选，也不掩盖历史失败。

本地证据：主工作区`.bench/source-input-main-integration-20261127/`中的
`ci-validate-complete.log`、`snapshot-observer-red.log`、`snapshot-domain-red.log`、
`snapshot-observer-green.log`、`check-fast-controller.json`和PR终态记录。
