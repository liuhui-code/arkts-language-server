# 跳转请求工作复用：RED/GREEN

父提交`04282ed34ebab7cd01726bb0291af53bd278ff00`。
固定Node20.19.5，安装编译器ohos-typescript4.9.5-r10；分支`fix/navigation-request-work-reuse-20261030`。
证据根`.bench/navigation-work-reuse-20261030/`。所有用例通过真实child process、Content-Length framed stdio。

## 1. 等价请求共享

RED：`node --test tests/semantic/navigation-coalescing.test.mjs`，
`coalescing-red.log`，exit1；三个相同定义真实dispatch3次，期望1。
先有`definition-alias-barrel.test.mjs`表征GREEN，再把两个导航注册抽到共同模块。
最小接入现有coalescer后原用例GREEN。
随后加入独立位置/方法、单消费者取消、全部取消重新准入、依赖、配置、同版本重开及disk来源表征。
`coalescing-lifecycle.log`当时22/22；不是最终全量收据。

## 2. 容量partial重复扫描

RED：`node --test tests/semantic/navigation-partial-membership.test.mjs`，
`partial-fallback-red.log`，exit1；20003源、三次缺失定义使noise扫描2→5，449.234/437.875/435.830ms。
既有partial初始化用例先GREEN。首次目录证明候选因打开已有文件overlay仍多扫一次，
`partial-fallback-green.log`实际仍RED，保留；只把真正依赖overlay的成员列入证明后GREEN。
`partial-fallback-green-v2.log`扫描2→2，16.371/9.400/9.025ms，并真实删除noise、不发通知后找到新增Ambient定义。

相关回归发现目录证明捕获额外做两次realpath，使既有物理源根快照断言失败（5次）；
未放宽断言，改为接收原枚举器关闭时已验证的身份，捕获不另读文件系统。
枚举职责从1765行document-store抽至project-membership-catalog，原source资格、token、完整性和取消规则保持。
另补source-unavailable的同文件修复：目录mtime保持不变也必须恢复，防止永久negative缓存。

## 3. 观察共享及准备范围

首次观察器默认短调用栈只捕获最终扫描，初次probe并未RED；`input-observations-red.log`实际exit0，
不能作为失败收据。扩大观察范围后`input-observations-red-v2.log`真实RED：同一路径/mode4次而非两阶段各一次。
接入请求内配置观察共享后`input-observations-green.log`8/8。

进一步把观察器扩到整个公开定义请求，`preparation-observations-red.log`再次RED：准备阶段核验仍重复。
新增同步准备范围交接到现有leased查询终检，`preparation-observations-green.log`8/8；
同一namespace路径保留首次与全新最终两次实际观察，非只做一次。
随后将断言收紧为恰好两次，并补真正的编译器返回后SDK磁盘修改；应拒绝旧结果，配置切换后恢复。
最终相关及完整结果另在实施报告记录，旧8/8不冒充新增用例已覆盖。

## 测试发现性

新增两个可执行测试文件必须加入现有层清单；初次manifest审计RED，随后按实际新增数量更新
entryCount275→277、bundle-e2e142→144，并逐项断言归属。
这只是新增文件计数，不放宽skip/todo/cancelled或其他正确性合同。

## 规模验证边界

冻结原server SHA`dd3feefdb5e2011739046c58080858ca0aeb426950b00ec07487435644a1b82d`及Worker
`bf8433e77e53a280afca48eaa8cb62d9a20ab20a2596a4353e50a09deda78afa`作为A/B基线。
从封存UI帧精确恢复7份overlay及原508–571共64个不同位置/方法请求，记录原版本68和SHA；
不缩小30K、不改变SDK/V8/RSS/截止时间，不把该协议重放称作真实UI。
plain与filesystem-audit分开；中间候选和所有RED/限制保留，最终统计只用明确同条件版本。

## 最终收据

- `final-scoped-regressions.log`：103/103，exit0、无跳过/取消/todo。
- `pnpm check:fast`：2147/2147、exit0、无失败/跳过/取消/todo；测试体3425610.896ms。
  实际Node20.19.5、pnpm8.3.1（仓库声明8.15.9，未更新依赖或管理器）。
  `check-fast-final.log`及`final-check-summary.json`记录原始日志SHA和800份冻结输入。
- `mac-matched-{baseline,qualified}-{1,2,3}`：固定驱动与采样器、正确回应进度创建请求；六轮exit0。
  每轮69份完整响应与基线逐字段一致，原`-32803`仍为错误；30K源码和SDK事后SHA无变化。
  `analyze-matched.mjs`生成`comparison-matched.json`，不混入插桩耗时。
- 初版重放器未回应进度创建，后续另一组驱动在采样元数据修改前后不一致：原始记录均保留，
  只作初步证据；没有择取较慢初版基线与最终候选形成收益数字。
- 455文件冷目录3秒独立门槛按既有授权不执行；不宣称该项通过。
- 未执行Windows最终候选或真实UI重验，不以协议回放或全量GREEN关闭原UI问题。
