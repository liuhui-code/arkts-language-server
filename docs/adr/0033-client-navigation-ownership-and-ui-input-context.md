# ADR0033：客户端导航所有权与 UI 输入上下文

- 日期：2026-10-30。
- 状态：**Proposed；记录本轮真实现场和边界，未宣称已修改/验证 Zed 核心或获得独立评审。**
- 问题：WUI-009；关联 [ADR0032](0032-completion-item-identity-and-inferred-roots.md)、[本轮报告](../reports/2026-10-30-ui-remediation.md)。

## 已观测事实

C4（父78a3158、server dd3feefd、Worker bf8433e7）在真实 Windows Zed1.25.3/8dd255c、30K 隔离项目中：

1. 04:43:23.362Z，AlbumGridItemNewStyle__copy_003.ets 零基160:9的 F12 请求582。
2. 23.465Z 已执行返回；24.222Z 打开文件选择器，24.579Z 开始逐字输入 Picker 的绝对路径。
3. 28.427Z，582在5064.901ms后返回正确 Log.ts 零基31:9，期间没有它的 `$/cancelRequest`。
4. 28.432Z Zed打开Log；28.462Z起后续路径输入写进Log的未保存缓冲区，最后Enter也写进源码。
5. 32.563Z截图仍为Log，正式UI验收FAILED。原文件磁盘未保存该输入；封存后按精确差异经真实撤销恢复。

证据：`.bench/windows-ui-remediation-20261030/formal-failure-sealed-3.zip`，SHA
`0888f33669061ab5f407cc11e2bed36b8b04ef7b3523c71c5c9268bab1b1f1b4`；
`windows-burst-owned-restoration-proof.*`及`zed-navigation-source-identity.json`。
这是一次真实时序，尚不能只凭一次现场断言所有 Zed 导航场景均有相同缺陷；最小客户端对照另记。

## 官方实现参考及适用边界

- [安装版 Zed navigation.rs](https://github.com/zed-industries/zed/blob/8dd255c3eafb5231056fe4e6f601cedd011f1c93/crates/editor/src/navigation.rs#L2394)：
  发起时取buffer/head，等待definitions后调用navigate_to_hover_links；此路径未检查导航代次。
  [目标激活](https://github.com/zed-industries/zed/blob/8dd255c3eafb5231056fe4e6f601cedd011f1c93/crates/editor/src/navigation.rs#L1949)
  使用当时active pane并defer打开目标。源代码与现场一致，但没有抓取这次UI调用栈，不能把静态阅读当独立动态证明。
- [VSCode SymbolNavigationAction](https://github.com/microsoft/vscode/blob/main/src/vs/editor/contrib/gotoSymbol/browser/goToCommands.ts#L112)：
  导航请求绑定EditorStateCancellationTokenSource，并在处理结果前检查取消。
  [状态token](https://github.com/microsoft/vscode/blob/main/src/vs/editor/contrib/editorState/browser/editorState.ts#L85)
  监听所选文档/位置等变化。这里参考状态绑定与最终围栏，不声称这些flags单独覆盖所有模态窗口情况。
- [LSP取消](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/specification.md)：
  按请求ID取消；服务器没有标准消息可据以还原客户端全部焦点、选择器和导航意图。
- [Zed Extension API 0.7](https://docs.rs/zed_extension_api/0.7.0/zed_extension_api/trait.Extension.html)：
  本扩展使用语言服务启动、配置和标签等接口；该trait不提供改写既有客户端导航任务所有权的钩子。
  因此不能把修复Zed核心的提案写成本语言服务器或WASM扩展已经实现的功能。

Context7本轮不可用的收据保留，以上采用官方源码/接口资料，没有伪称Context7查询成功。

## 建议的客户端契约（待实现与验证）

1. 每个窗口/Pane拥有单调导航代次；请求绑定源buffer、版本、选择位置及导航代次。
   新导航、返回、切换目标或进入文件选择器撤销旧导航意图；支持时发送逐ID取消。
2. 即使取消未送达、编译不可中断或正确响应晚到，应用结果前也必须检查导航所有权。
   已失效任务不得激活另一个Pane或抢走输入焦点；需要预取目标时可准备后台buffer而不激活。
3. 多Pane不采用全局latest-wins；各自合法请求独立，防止修客户端时重引入ADR0032的服务器请求身份错误。
4. UI驱动区分编辑器输入与选择器/命令输入。选择器输入期间若发现源码didChange或上下文改变，
   立即停止并封存，不继续把整条路径打进编辑器。仅对可证明属于测试的私有输入允许精确撤销。
   只有窗口PID/前台检查不足以证明具体输入控件仍正确。

本轮已实施的是server独立请求/有界准入及测试现场保护；上述客户端代次修复尚未实施。
封存失败后的独立定向测试等待前一导航结清，是保护测试输入，**不是原快速交错用例通过**。

## 拒绝的替代方案

- 每次didOpen就取消该项目全部定义、重新启用同method+URI替换：服务端无法判断UI意图，会破坏合法并发。
- 延长超时、缩减30K、换符号或取消身份校验来消除晚到：不能建立正确的客户端应用围栏。
- 只降低延迟或把路径一次性输入就宣称修复：最多缩小竞态窗口，不能证明过期导航不抢焦点。
- 用协议GREEN或保护性顺序测试覆盖原FAILED，或擅自改/升级用户日常Zed。

## 回归标准

使用同版本真实Zed，并以独立客户端夹具控制合法响应先后；真实30K现场和模拟服务端分别标注。
覆盖快速/晚响应、显式取消、返回、文件选择器、多Pane、新导航覆盖旧导航、源编辑和关闭。
验证取消与每ID单终态、旧响应不激活错误目标、输入不会进入其他buffer；保留原FAILED和全部版本/截图/帧。
若只能在客户端修复，明确外部组件边界；未通过客户端及原30K交错复验前，此问题不关闭。
