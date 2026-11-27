# 2026-11-26 查询资格与驻留引用执行：TDD 记录

## 身份和范围

- 父版本：`cc92b50370c0a2471f8315bab2119e59996fd2cb`。
- 工作树：`/private/tmp/arkts-reference-owner-20261126`；分支 `fix/partial-reference-owner-20261126`。
- [ADR0050](../adr/0050-query-qualified-retained-references.md)；[原诊断](../reports/2026-11-26-main-performance-root-causes.md)。
- 原始记录：主工作区 `.bench/reference-owner-fix-20261126/`，所有 RED、中间失败均保留。
- Node20.19.5；ohos-typescript4.9.5-r10；真实 framed child LSP、隔离 Native/cache；不是 Zed UI。
- `ARKTS_BENCHMARK_CONTROL=0`、无显式内存预算、未设置 resident-fast-path 参数而使用产品默认值。
  fixture 的继承辅助策略仍列在 `tests/support/resident-interactive-lsp.mjs`；没有宣称日常 SDK 配置。

## 第一片：正确结果并不足以证明复用

公开测试 `tests/semantic/references-partial-retained-owner.test.mjs`：真实模块配置、SDK alias mismatch，
97个源码成员（Main+96个空模块）。首查→未保存编辑→撤销，断言精确 UTF16 Locations 为3→4→3。
审计仅在私有fixture通过实际安装编译器的构造入口记录LS和Program；不替代真实结果断言。

父版本构建后命令：

```sh
node --test tests/semantic/references-partial-retained-owner.test.mjs
```

`owner-red.log`：位置断言正确，但LS构造数3→7，复用断言失败。中间 `owner-green01.log`
仍3→5失败；`green01-detail`显示模块LS已经复用，但父端候选选择先启动独立锚点verifier。
不能仅修后段而把此前的隔离LS构建当作已经消除。

最小实现：新增内部显式lexicalOnly尝试，在候选/锚点选择前消费既有实际compiler lexical-block证明；
采用现有投影语义组/Host/LS及同步lease；未知/全scope组不构建，特定package投影拒绝回到原完整路线。
不改SDK readiness gate，不把partial改READY，不删全输入/final围栏。

`owner-green02.log`：1/1 PASS；实际2个semantic LS（初始化及模块），后续两个Program更新带oldProgram，
没有reference-verifier-worker构造。重构前旧表征 `characterization-before-refactor.log`：38/38 PASS、0skip。

## 第二片：防止不适用查询被额外全局准备拖慢

公开类名引用反例先移除cheap hint，构建后运行：

```sh
node --test --test-name-pattern='non-local symbol' tests/semantic/references-partial-retained-owner.test.mjs
```

`hint-red.log`：精确结果正确，但文档全局准备2次而非原路线1次。其余2例因定向命令未选择，
不是最终检查跳过。`hint-red-build.log`保留对应构建。将语法成本提示放到完整工作区准备前，
提示不授予覆盖/新鲜度，只避免已知不适用的尝试。随后全文件运行，不跳过用例。

## GREEN 后重构

提取已有锚点回退（identity→memo→pressure→isolated）、引用结果资格消费，以及共享坐标/工作区转换。
没有新增另一套owner、缓存或状态机。type-engine511→500；原超限债TS LS2852→2851，
Legacy engine622→619；后两份文件仍超500，保留债务，未以新增大文件继续扩大。

最终针对性命令：

```sh
node --test --test-concurrency=1 tests/semantic/references-partial-retained-owner.test.mjs tests/semantic-worker-reference-mode-protocol.test.mjs
```

`owner-final-focused.log`：5/5 PASS、0skip；涵盖edit/undo复用、shorthand退回完整路线、
非局部提示不增全局准备、同size/恢复mtime的无通知改写不能复用旧结果、内部模式不可混用/不可变数据。
真实LS与Program数分别统计，允许增量Program换代，不用Program对象相同代替正确性。

## 后续证据

完整 `pnpm check:fast` 输出 `final-check-fast.log`；终态写入实现报告，运行中不预报通过。
基线为父版本源码独立构建；初次基线打包漏config导致构建失败，补齐原版本config后成功，
`baseline-frozen-build.log`与`baseline-frozen-build02.log`均保留，没有改产品来通过。
规模脚本、逐次Locations/版本、实际编译计数及资源在 `scale-*` 和 `scale/`。
第一组规模计时与完整检查共享主机，必须注明竞争，不能把它当空载因果收益或Photos/UI结果。
完整输入围栏、初始化、真实SDK/Windows/UI/耐久及跨文件完整引用未因本片而关闭。

## 第三片：覆盖拒绝后不重复尝试

新增同一公开shorthand场景的实际compiler-query计数：`repeated-attempt-red.log`为2≠1；
父端提前探测后，后段原临时实现又尝试一次。移除后段重复入口，只保留父端一次显式lexicalOnly。
不移除原完整回退。此前并行完整检查已通过SIGINT暂停，
`check-fast-first-controller.json`准确记录中断，不把它计为完整通过；最终候选将独立重跑。

## final02全量发现真实调度回归，final03修正

final02工作树保持冻结继续跑完整检查；当前发现3项失败，不能称全量GREEN：
`resident-first-miss`两个原冷查询用例前置队列1≠0；`semantic-group-retention`原SDK-partial属性用例2≠1。
二者均为新增lexical探测先于既有路线而产生多余RPC，并非结果错误；原断言保持不变。

新独立worktree `/private/tmp/arkts-reference-owner-final03-20261126`，分支
`fix/partial-reference-owner-final03-20261126`，与final02同父cc92；旧日志/源码/产物不覆盖。
先加父端不引入TS的直接声明名提示，冷原用例恢复；后补局部变量已有完整根owner反例：
`final03-combined-owner-red.log`9PASS/1FAIL，精确结果正确但RPC2≠1，证明只筛选还不完整。

最终内部枚举qualifiedOnly(group / retained-first)将既有根准入和合法分组尝试放在同一个同步job中，
null后不再重复retained RPC，实际计算后的失效/取消/异常仍传播，完整fallback保持原路线。
`final03-combined-focused.log`23/23、0skip，通过原冷/暖断言及新增局部暖根场景。
继而增加显式RESIDENT_FIRST=0及SDK SourceFile身份复用断言，最终targeted/full终态另记。

新非局部用例最初误将“已完成prepare的root”当成未查询冷根，额外断言期望0；
冻结cc92父版本校准本来是1次retained探测，见`final03-nonlocal-parent-characterization.log`。
只纠正这份新断言：保持父版本1次，而非final02的2次；原仓库冷查询0次断言没有改。
`final03-hint-regression-red03.log`在SDK fixture加载final02产物时6PASS/1FAIL，2≠1；
prepared-suite fixture自行编译当前源码，不能把该轮其他case当作旧产物的RED。
第一次定向调用cwd误用主目录导致审计相对路径错误，原`final03-parent-hint-red.log`保留；
正确cwd的`red02`及上述构建身份才用于产品诊断。没有将驱动错误计为产品缺陷。

父提示为路由成本筛选，非独立语法解析器/证明器。Unicode直接声明仍命中；关键字后注释、
多声明等复杂文本允许原路线；伪声明注释只能触发尝试，不能把类变成词法绑定。
最终公开结果、新鲜度、Root/default/flag0、AST/LS、一次准入与parent compiler isolation分别断言。

## final03 最终定向与清单修正

`final03-final-focused.log`24/24 PASS、0skip；SDK partial默认与resident-first=0均精确edit/undo，
LS不增、SDK SourceFile复用、每次miss仅一次owner准入；旧cold/warm约束不放宽。
`final03-manifest-red.log`证明新增entry使固定383不符384；修正总数后`green.log`继续指出bundle201不符202。
两项固定计数及新增entry所属层一起更新，`final03-manifest-green02.log`4/4，0skip。
没有调整运行时注解门禁或隐藏失败。最终代码与测试冻结身份另存final03，完整门禁重新运行。

最终独立全量`final03-check-fast.log`：2816 PASS / 1 FAIL / 0skip，总2817。
所有本片定向/旧队列断言及清单在全量中通过，唯一失败为30,003源码索引初始progress/end60s等待，
未执行到references/rename；保持原失败，串行未改原例补证，不将定向通过替代本次全量FAIL。
1365冻结输入与79构建产物无漂移，详见`final03-terminal.json`。

初始化补证：固定基线与候选原30003单例均PASS，原阈值不变，各4例未选择，明确非完整验收。
候选通过同canonical双reporter运行原整个large-dependency-input-proof文件，5/5、0skip，
原完整2816/2817FAIL仍保留。整套条件下约60s延长原因未闭环，不据单例通过关闭。
stock transcriptEntries只是128条元数据，不含完整payload；scale operations另有完整响应。
