# Windows索引存储位置实施计划

父版本 `e170a768d1d76d2fb88b1d383f4cf7143f85cc3f`。
独立分支 `feat/index-storage-location-20261102`，原工作区WUI-009及已有文件保留。
用户已授权实现和针对性验证；不提交/发布/合并，不删除真实旧缓存。

## 已确认的入口与契约

- `src/index/cache-directory.ts`：环境覆盖与平台首选路径；原Win为LOCALAPPDATA。
- `src/composition/production-services.ts`：原来分别为索引与GC解析根，本轮统一会话选择。
- `src/workspace/default-workspace-symbol-service.ts`：独立后台打开、进度、生命周期。
- `src/index/workspace-uri-identity.ts` / `sidecar-workspace-index.ts`：真实目录/工作区canonical identity保留。
- `crates/index-sqlite/src/cache_location.rs`：canonical workspace URI→固定key→workspaces子目录，不改Rust。
- `editors/zed/src/lib.rs`：已有binary.env；LSP初始化/动态配置当前只处理project/sdk，不新增虚假index选项。
- `src/index/cache-cli.ts`：显式--cache-dir优先；纯解析保持preview只读。
- GC有界身份检查副本用OS临时目录，常驻catalog及管理状态跟随缓存根，见ADR0041。

## 垂直切片

- [x] 原路径解析公开驱动表征GREEN，父版本/命令留证。
- [x] Windows默认D盘RED→GREEN，非Windows/显式覆盖回归；从超长adapter测试抽出配置职责。
- [x] 缺盘回退RED→GREEN，扩展权限/只读/空间不足与两处不可用策略；真实探测保护既有文件。
- [x] 真实child LSP错误目录告警RED→GREEN，同会话本地定义正确；Warning为无应答通知。
- [x] 存储owner关闭后停止探测、环境快照RED→GREEN；并发root一次选择、GC同根。
- [x] 真实native多root目录隔离、重启复用与活动GC保护；初次10秒等待失败保留，后续10轮串行未复现，原因不推测。
- [x] 两个新测试入口清单RED→GREEN，保留准确分层和条目计数。
- [x] 最终build/typecheck及12文件83项回归通过，源码/产物身份冻结；交付时核对原工作树保护。
- [ ] Windows实机：ssh windows-pc当前8秒连接超时；未以策略模拟代替实机结果。

配置、异常、旧索引范围及预览边界见[配置文档](../configuration/index-storage.md)。
最终结果更新[报告](../reports/2026-11-02-index-storage-location.md)及[TDD](../tdd/2026-11-02-index-storage-location.md)。
