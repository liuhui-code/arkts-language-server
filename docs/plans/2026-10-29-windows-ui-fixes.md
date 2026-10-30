# Windows真实UI三项问题修复

父版本`4859f76c46265a885332d7141c99698bf749c61e`。用户明确顺序：补全错误 → 跳转长尾 → Worker换代。
原始[UI报告](../reports/2026-10-29-windows-zed-30k-ui-stress.md)及`.bench/windows-zed-ui-30k-20261029/`只读保留。
本轮证据独立存`.bench/windows-ui-fixes-20261029/`。分支`fix/windows-ui-completion-navigation-recovery`。

| 顺序 | 问题 | 状态与验收 |
| --- | --- | --- |
| 1 | [WUI-001 / #102](https://github.com/liuhui-code/arkts-language-server/issues/102)：编辑后补全-32803 | 候选验证完成，公开LSP RED→GREEN；partial列表/详情共享局部准入，候选由compiler验证，旧SDK/namespace仍拒绝。Windows原v33正常；144份补全0份-32803。最终fast2103/2103 |
| 2 | [WUI-003 / #103](https://github.com/liuhui-code/arkts-language-server/issues/103)：定义同级FIFO长尾 | 候选已实现，公开LSP定义派发第12→第1，14项公平/屏障/交互对照通过；真实移动恢复后3次定义正确，750/1321/430ms，原9.2s证据保留，非严格A/B。秒级背景及SDK缺项尾部仍在 |
| 3 | [WUI-002 / #104](https://github.com/liuhui-code/arkts-language-server/issues/104)：撤销保存触发诊断取消退役 | 候选已实现，5项故障/有限同步对照通过；原Album4轮保存撤销及全部33分38秒UI观察中1Worker/0退役恢复。仅合格通知清算已有同步，绝对截止不变；原自然30K精确窗口未宣称复现 |

每项按最小失败回归→根因→最小完整修复→回归与30K验证推进；前一项未校验前不叠加后一项机制。
首项原三种假设已排查：直接原因是partial成员集合仍走完整workspace补全准入，并非编辑缓存失效或局部SDK缺项。
后续方案核对ADR0021/0023/0025–0027，不删除新鲜度/路径校验，不吞错返回空成功、不清全缓存。
500ms是体验目标；无默认RSS预算，不加2GiB/4GiB测试停测线；455冷目录3秒项仍按既有授权排除。
真实UI与协议/机制验证分别标注；新失败保留，不追认原正式驱动FAILED为通过。
不混入native全量替换、30K全局能力或暂停的无关缓存TODO，不自动合并、发布或部署日常Zed。

## 验证进度

- [TDD收据](../tdd/2026-10-29-windows-ui-fixes.md)保留三个独立RED、GREEN和对照命令。
- Windows Node20.19.5新增7项公开回归7/7。首轮6/7的观测断言路径分隔符错误保留，
  以物理文件身份修正该测试；产品构建未因此改变。
- 完整`pnpm check:fast`首轮受沙箱进程观测权限影响、主动停止，exit130，不计通过。
  相同权限对照3/3；获权限后的最终完整轮**2103/2103、exit0、无skipped/cancelled/todo**，
  `final-check-receipt.json`核对15份最终源/测试SHA未变；262入口包含三个新文件。Mac全量与Windows7/7分开。
- 独立Zed窗口/冷索引目录执行真实输入，原32字符补全v33正常1430ms，20份详情0错误。
  首次混合驱动因启动瞬间焦点保护停止、0宏完成，记录保留；非交互队列生产器重试已完成，见下方。

2026-10-30 UI收尾：重试十宏344.586s，另原Album四轮149.898s、完整移动恢复/三次F12 51.821s均完成；
总输入时间范围33分38.566秒/533输入批次，非连续满载或两小时耐久。1Worker，正常关闭后所属进程全部退出。
1207功能请求1093成功、109真实客户端取消、5非取消错误（缺失SDK定义2、全量范围3），不称全功能通过。
96份详情0错误但仅10份实际签名enriched，86份通用条目回退原因未逐条证明；关闭shutdown答复未观察到。
这些限制及完整原始证据见[最终修复报告](../reports/2026-10-30-windows-ui-fixes.md)，不得以局部通过替代原FAILED。
本轮候选验证收尾完成，保留修复分支工作树供审查；未提交、push、合并、发布或部署日常Zed。
