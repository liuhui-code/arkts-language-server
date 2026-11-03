# Compiler closure 阶段1：环境回滚后的重建记录

本文件是2026-11-03环境回滚后的新记录，不是原始文档或制品恢复。
基线main `298d65f5d7f796c347fe8be5c739e428066489d8`，独立分支`feat/closure-phase-rebuild-20261103`。
原始阶段1工作树、patch和执行目录均已确认不存在。此前2328测试等结果仅有对话记录，**不是本轮已运行认证**。
合同见[ADR0044](../adr/0044-compiler-closure-baseline.md)。

## 新RED与源码来源

1. Node20运行 `node --test tests/closure-baseline-cli.test.mjs`：0PASS/1FAIL、exit1，runner不存在。
   新收据：`/workspace/shared/closure-stage1-rebuild/closure-cli-first-red.log`。
2. 六个脚本按上下文重新编写，初次SHA均匹配此前保存的六个摘要；这证明这些重写字节匹配，不能恢复旧测量文件。
3. 新unit+manifest回归8PASS/1FAIL：畸形shutdown同时包含result:null与error被误判PASS。
   收据closure-unit-first.log；最小修正显式拒绝shutdown.error，不能继续声称六文件全与历史相同。
4. 历史transform误匹配Object.prototype.valueOf、异常name二次读取、缺收据误判等修正已由上下文重建。
   原RED日志不存在，不能伪造新的历史RED；本轮关键测试重新核验这些合同。
5. 新独立审查发现任意status marker能把缺失trace认证complete；unit先4PASS/1FAIL（closure-marker-regression-red.log）。
   现仅接受<=1KiB普通文件的精确unavailable+已知reason收据；未知/畸形/超量marker为incomplete，不能升级结果。
   helper最终SHA为`17aff5c7757a47071b0f3805098eea83667518d8b96f53ed8e4d0f899fe546d4`。
6. 新CLI首次12PASS/1FAIL来自测试错误选择第一个main Program（它是SDK-only，project0）。
   保留closure-regression-13-first.log与选例RED；修正为初始化SDK-only与首个define的project10分别断言，不改产品。
   最终三文件13/13PASS，0fail/skip/cancel/todo，19,396.806ms，closure-regression-13-final.log。

## 本轮执行

- 固定Node v20.19.5；当前runtime重新构建，build-runtime.log。
- 本轮 `pnpm check` exit0，typecheck.log；三文件13/13通过。
- 七个完整文件共31/31PASS，0fail/skip/cancel/todo，59,698.541ms，focused-31.log：两新文件、manifest及
  project-initialization、partial-project-initialization、progressing-synchronization、startup-synchronization-liveness。
- 10项诊断脚本/测试/manifest在新测量之后重新核对冻结SHA全部一致，frozen-source-verification.log。
- sidecar复用本机仍存在的受控构建，SHA为f37ad1020f6bee66c0c1b3bdc2ef971414e46837b4b67bdf313ec9f0baeb624a，与历史摘要相同；没有宣称新做Rust构建。
  baseline与其来源c0a6da0之间crates/Cargo源码无差异。新构建server/worker也分别匹配历史0e50e4…/ee72bd…摘要。
- 尚未运行本轮完整check:fast；缺原始grammar WASM的已知环境限制不能靠历史通过或替代字节掩盖。

## 新物理宽图与新执行收据

新目录：`/workspace/shared/closure-stage1-rebuild/wide-23787`，未复用丢失目录。
本轮实际生成23,787文件、6,000额外import、20字段、5公共边，digest重新计算为
`8e252feee53eaff2bece62bccacbc3d2a9d9e270e866c83e225acc32a274006b`。
这个内容摘要恰好匹配历史记录，但不把它称为旧物理输入或旧测量恢复。

新report为OBSERVED_FAILURE、exit2；off/on完整payloadParity=true，inputUnchanged/artifactsUnchanged=true。
两variant均保留membership-degraded，定义两次均为-32803 "Semantic query requires current workspace inputs"；
各1个semantic Worker、0watchdog、正常shutdown/exit0。新on trace实测SDK-only准备后，首查main从256项目roots展开6,002项目sources，
另1SDK+52标准库sources，createProgram观测3,307.61ms。第二次定义没有新Program仍失败。
这是新的机制基线，不是Windows超时复现或性能收益；共享机器、最小SDK及off→on顺序限制仍在。

查询Main.ets位置(6002,27)；正确oracle是Target.ets范围(0,13)-(0,19)。归一化完整result无空白JSON的SHA为
`7adfcd415195fe2b0944021564be282f2b5f9d06ffdf1163e4e3df795eb2ac54`，这是期望结果摘要，不代表baseline曾成功。
阶段2获准只读复用该新物理输入，必须另建cache/log、前后重验输入并明确记录自己的runtime摘要；本片不预认证它的结果。

## 可复现入口

先按项目规范构建runtime与release sidecar，然后使用全新输出目录：

```sh
node scripts/bench/measure-compiler-closure.mjs --out <new-directory> --files 96 --imports 64 --io on
node scripts/bench/measure-compiler-closure.mjs --out <new-directory> --files 23787 --imports 6000 --fields 20 --edges 5
```

标准transcript：initialize→preparation终态→readonly readiness→definition两次→shutdown。
默认pair使用同物理输入off→on；`--mode on/off`不声称配对等价。`--io on`是重诊断，不是性能收益证明。
`--groups 5 --files 10 --imports 0`覆盖五组及root；`--trace-sink directory`验证观察失败不改变语义。
exit0是本次场景检查通过；exit2保留OBSERVED_FAILURE/INVALID/INCOMPLETE_OBSERVATION，exit1为工具失败。
所有report均releaseEligible=false。新结果必须引用新目录及实际SHA，不引用已丢失旧路径作为可读取证据。

## 尚未认证

真实Windows、真实SDK/现场23K项目、900秒不返回的唯一原因、整体RSS收益和新的closure/期限策略均未认证。
PR115/116未叠加。局部测试不替代正常checkout的完整CI；本片不发布。
