# OP-02：package.json 存在性与目录内容分离

日期：2026-10-15（实际运行UTC2026-10-14）。父修订
`a111235bc4bfcb55b126752f95b3ba095f2996af`，分支`codex/op00-query-attribution`。
本切片公开RED→GREEN，九文件86/86；OP-02／OP-06／L08仍IN_PROGRESS。

## 原失败和实际原因

发布前native收尾后的真正完整check:fast终态1752/1754、2FAIL、exit1，
零skip/cancel/todo，前后源码／产物／SDK／启动器身份稳定。两个失败均为原
`workspace-file-change-coordinator.test.mjs`：lexical alias返回overlay authority，
以及另一个lexical spelling拥有contiguous delta后的重建；均为输入不可用，非超时。
原403文件用例在该整轮PASS，37210.768536ms为整个case时长，不是单RPC或P95。
完整log SHA `abd4bd91b41fc09270779c7fc12e4e5951de3ed2c4093edbee67dbd960b824bd`，
独立audit SHA `a0eb58852099935a74f0fea5843ff55ff0d28eaec1ecca44a324d2edfc415fd5`。

两原用例单独2PASS不能当修复；完整原文件随后21/22重现第一个失败。
临时stderr观测与有界私有空目录控制揭示真实调用链：
`getPackageJsonsVisibleToFile → Host.fileExists → isRegularBoundedFile`。
原生负向`T/package.json`查询被一般negative-leaf规则提升为整个临时父目录
mtime/ctime见证，无关兄弟目录创建／移除遂使package仍不存在的证明失效。
相同有界控制修复前2FAIL、修复后2PASS；这是机制反例，不能证明每次旧失败的
外部触发动作或唯一原因。所有诊断marker已移除，原LoadedConfigurationWitness保留。
控制仅操作自建空目录、立即移除；原进程均退出，没有删除用户文件或归档。
控制独立audit SHA `e3d4c5150b0d18eb4cb441a0a2a02544936136051bec2f165be46c32488ddbff`。

## 公开RED→GREEN和最小修复

```sh
/Users/liuhui/.nvm/versions/node/v20.19.5/bin/node --test --test-reporter=spec \
  tests/semantic/package-json-presence-guard.test.mjs
```

真实生产LSP子进程Content-Length stdio与workspace alias。私有preload转发
真实fs.statSync返回／异常；实际ENOENT后只创建并移除自有空兄弟目录。
测试验证marker的实际PID／Worker thread、package仍缺失和完整补全标签集合。
原实现RED0/1、-32803，修复后GREEN1/1。随后真实创建package.json，未通知查询
必须-32803且无result；新进程恢复同一完整补全。该加强保护亦1/1、exit0。
RED log SHA `dd6ccae40b181aefa39bc2df63ae12888e1b553d67214b43696de9dd3efede9c`；
真实创建保护log SHA `d692d3559054219302532b18eee84de5bdc018e5d79cf05c7b1de95f571c5ef9`。

仅将package.json的fileExists观察改为既有observePresence，保留实际叶／物理身份；
实际readFile仍为完整内容见证，源码／SDK负向叶仍保留父目录epoch。真实创建、
retarget、内容变化、加载窗口及结束fence保护不删除。GREEN31/31表征后提取
共同filesystemLookup职责；core3260→3256，helper33／fixture28／新测试66行。
core3256仍为迁移债；无跨请求缓存、新owner、预算／期限／scope／SDK删减。
六默认、1024MiB、32次解析／32目录／32K容量、ADR0003生命周期均不变。

九文件86/86、exit0，零注解，131723.021343ms；含完整原协调器22/22、SDK加载
窗口、真实创建／取消／恢复、引用scope、native收尾和库存。库存203／fast196。
`.bench/op02-package-presence-related-v1*`，log SHA
`f2f4a7db536d67c09e4f1b9a4581e1f9e2da590838907a90a2368ff0f1951f4d`，
audit SHA `2ee7339d4acc4ba3c560c3129b3d75fa1bd249051092cdc4b233d45a04bdb6e2`。
source archive SHA `2c9d1d6eccfce3b44a073316eadf7035591071e425a71e0862ad5f9f4ceb2ef6`；
production input `5cf9d618061e81fbac196c0e497d640df99ba327a0b9ef115774b7dd919bba56`。
真实API24完整SDK及全部产物／源前后身份一致；strict/build/diff通过。

## 剩余范围

86/86不是当前whole GREEN或最终性能／物理内存验收。先补齐失败SPEC尾部的
证据消费，保持实际计数和FAIL，再冻结新构建执行真正完整check:fast。
继续原OP-00–06资格／采纳、冷Program、资源／生命周期／≥100循环、客户端／
三平台／DevEco-PSS／历史3GB及50%／全部正例和336格；550ms不前移阻塞切片。
未宣称毕业、合入或push，旧FAIL和慢样本保持原身份。

## 当前真正完整回归检查点

新冻结运行UTC2026-10-14T23:43:46.410Z开始，最终1757/1757、exit0，零注解，
2975631.32265ms。前后1702文件／源归档／产物／完整API24 SDK／pnpm启动器
身份均一致，独立PID退出审计通过。原两个alias用例和原403文件均正向PASS；
403 case33418.398842ms仍为整个case，不是单RPC、P95或唯一旧超时原因修复。
`.bench/op02-package-presence-current-whole-v1/whole*`，log SHA
`b76c5804206a6d29fdda9f9fe90c9b6dedbb2d6d7775cd6111e5885705b7a120`，
terminal audit SHA `d310326ca54ac55f3fdc7049d6b69cfc4c53de53a129fff7c9d99c874e510546`。
source archive SHA `312f0b224baa9bafca6c05f367608e3e5ade35807ea82191d31786089d8130a0`。
当前代码回归GREEN，不等于原PSS／550ms／生命周期／平台或全证据正例完成。
下一步按主计划更新后的下一执行批次收口候选与继续证据接线，不重跑旧失败碰通过。
