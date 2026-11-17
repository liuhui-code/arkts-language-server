# PR118：集成期间发现的跨平台回归

状态：测试夹具修订；产品源码、结果新鲜度、完整性、超时和内存策略未改。
父415f84b4ef2c3c3c5e48fde6f34a6c273052ef27，产品语义Worker b19fdc9f、Native800e6628。
[首次CI43987927179](https://github.com/liuhui-code/arkts-language-server/actions/runs/43987927179)：
Linux完整Node门禁2560输入，2557PASS/3FAIL/0skip/cancel；Windows安装检查PASS。
完整压缩日志已封存；初次文本下载仅1MiB而截断，不据截断日志推定作业中断。
原始证据`.bench/index-versioned-maintenance-20261104/integration-20261117/`。

## CI-PORT-001：真实流返回值不保证固定false

两项`tests/native-wire-audit.test.mjs`在Linux实际writeReturn=true、期望false。
原64KiB输入足以在当时Mac触发背压，不等于所有平台/管道调度下都触发背压。
观察器本身返回Reflect.apply的原值；错误在测试把一种观测结果当成API常量。

改为先给实际Native子进程的原write/end加纯返回值记录，再加载被测观察器，
公开调用返回值必须逐项等于这一次真实底层返回值；原回调次数、进程身份、
split UTF8请求/响应原文、单帧与正常close断言均保留。
没有伪造Native响应、强制返回false、改私有highWaterMark或放宽为只检查boolean。
Context7 resolver与Node20官方网页读取均因网络不可达失败；不声称取到在线文档，
修订依据实际Node20调用及透明包装器的严格返回值合同。

## CI-PORT-002：隐式/tmp别名不是跨平台外部依赖夹具

原ambient/native场景实际总ProgramSourceFiles155和精确NativeOnly位置通过，
但programProjectFiles=102而期望101。Mac常规临时目录存在/var→/private/var别名，
真实包URI可能落在词法root前缀外；Linux规范临时路径没有该巧合。
Mac独立最小复现：原415候选设置规范TMPDIR，原公开LSP用例稳定得到102≠101。
`ambient-canonical-temp-red.log`为1FAIL/16名称过滤，非完整门禁。

原用例已明确要求物理URI在项目词法前缀外，因此修订夹具：把Native包真实目录放在
fixture根的workspace兄弟目录，再以node_modules入口链接；Windows用junction。
101/5项目计数、155/58总Program计数、NativeOnly精确位置及同Worker恢复断言全部保留。
没有把101改102、用范围断言或跳过Linux；新夹具显式保证原本要覆盖的外部包边界。

**OBS-PROJECT-COUNT-001 OPEN（观察口径）**：typescript-program-stats按词法root分组，
相同物理输入在不同别名下的project/other分类可能不同。当前不修改这一统计合同，
不把分类差异等同额外Program文件/重复解析；规模比较仍须记录总数、真实输入和根路径。

## 验证与合入边界

- 规范临时路径：两整个公开/真实Native测试文件19/19PASS、零跳过，原RED已复现。
- 常规临时路径：同两整个文件19/19PASS、零跳过；最终CI以[PR118](https://github.com/liuhui-code/arkts-language-server/pull/118)检查为准。
- 在独立worktree修订，原415的Mac完整检查继续运行，输入未被改写。
- 只有测试/文档变化；原512文件候选的产品源码与产物不变。最终Linux完整门禁必须重验，
  不用Mac局部19项代替Linux通过，不将Windows安装测试称真实UI。
- 原30K重复定义3.795s/三轮Native核验、SDK24/20partial、完整引用/重命名及UI/耐久缺口继续OPEN。

这修复测试夹具的可移植性，不新增架构决策或修改ADR0044/0045最终证明要求。


## CI-EXEC-001：完整门禁超过CI总作业预算

第二轮[43995951008](https://github.com/liuhui-code/arkts-language-server/actions/runs/43995951008)
在60m15s被GitHub取消，注解明确为`The job has exceeded the maximum execution time of 1h0m0s`。
原CI-PORT三项在本轮全部通过；停止前仍连续通过Worker恢复与所有AAA–BBB编辑交错等场景，
没有新的断言失败，但套件没有跑完，因此不计作全量PASS。

独立Mac完整check:fast为72m37.6s、2560/2560PASS、零skip/cancel/todo、2548输入及产物未变。
Rust440项与单独455夹具PASS，完整安装7/7与固定大项目1/1在非嵌套同73源码也PASS。
原嵌套工作树额外artifact验收3PASS/4FAIL由Cargo祖先工作区和未生成WASM造成，
改在/private/tmp同一提交完成所有发布前置与验收，没有修改产品配置来绕过。

最小CI修订：仅把Linux validate作业总执行预算60→90分钟，容纳完整串行套件及Rust/Zed/产物检查；
Windows原40分钟不变，仍由唯一canonical `pnpm check:release`执行所有原门禁。
LSP/Worker、原5秒请求、单用例超时、内存/规模/正确性、新鲜度与完整性断言均未修改。
这是CI资源分配，不是性能验收线或把产品慢响应当成功；90分钟也不构成新的产品SLO。
实际失败作业即RED；既有release-pipeline完整6/6PASS，保护门禁覆盖与唯一驱动；最终CI重新执行才是GREEN。
完整证据与最终CI结论见PR118及本地integration-20261117，原60分钟失败记录保留。
