# 2026-11-17：集成候选与遗留事项

用户授权：记录遗留问题，将当前优化提交、通过PR合入main并推送；不部署、重启Zed或清真实缓存。
实施分支`feat/index-versioned-maintenance-20261104`，parent298d65f5d7f796c347fe8be5c739e428066489d8。
当前主工作区其他改动保留，不包含其他开放PR115/116/117的自动合并授权。

## 遗留事项（不阻塞本次已授权集成，不宣称解决）

- **NAV-REPEAT-001 OPEN**：真实30K隔离副本、Node20.19.5、SDK24/目标20、默认closure的协议重复定义仍慢；同条件旧adad中位8895.819/max9368.883ms，当前b19f3795.499/max4122.422ms；各单会话3次重复，不是3轮冷启动。64诊断同Native owner准备1+最终2轮，89985=29995×3叶子检查，热配置身份56964调用（不是不同路径数/总体IO）。未删除原新鲜度检查。见[根因及证据](2026-11-17-repeated-definition-checkpoint-cost.md)。
- **20K截止稳定性 OPEN**：原5s完整引用旧adad/6d曾2PASS1FAIL；当前单次3/3PASS，但大项目4794ms贴近截止，不能据一次通过宣称稳定。
- **Photos完整能力 OPEN**：实际API24 SDK与项目20不匹配，语义partial。局部定义正确不代表完整引用/重命名可用；不能改目标/打桩冒称READY。用户确认当前Mac无API20SDK。
- **最早冷启动查询/尾延迟 OPEN**：47等早期请求保护失败保留；后续冷/热正确不替代原失败。初始化、实际依赖与完整终检仍有规模增长成本，不宣称规模无关。
- **SQLite收尾波动 OPEN**：55/57/58/59原60秒完整性检查失败保留，同SQL独立/60/61/62/63/64通过不构成波动根因已证实；目前没有腐败证据，不改原门槛掩盖失败。
- **真实UI/Windows/正式耐久 OPEN**：本轮63是132.189秒协议会话、64是独立诊断，不计作真实Zed点击或新2小时验收。此前正式失败、Photos36引用/重命名缺口记录保留。
- **资源/范围**：原生索引及磁盘峰值继续观察；500ms为体验目标，测试Node RSS2GiB停线临时豁免不改变产品策略；455冷目录3s门槛沿用户既有授权跳过，其余正确性/完整性要求不变。

## 检查与范围

最新隔离候选：类型检查/构建PASS，扩大67/67PASS零跳过/取消；20K原文件单次3/3PASS。
前2550/2550是旧adad历史收据，不作为当前最终检查；本次合入前补跑新`pnpm check:fast`。
Rust与此前800e6628 release一致；集成另核对Rust检查和release构建身份。
最后原/副本各30000源码哈希未变，305源码与冻结候选相符；未部署用户安装。
原始证据根`.bench/index-versioned-maintenance-20261104/functional-closure-20261111/initialization-breakdown-20261112/`。

仍超过500行的既有迁移债（本次均缩小）：index-core/lib.rs1131、index-sqlite/lib.rs761、
TypeScript LS2974、Store1520、legacy engine631、Worker协议1783、call hierarchy测试3587、
semantic characterization1440、installed smoke2142、feature matrix902、file coordinator测试843。
新增手写源码/测试/脚本均不超过500行。ADR状态保持Proposed，不伪造审阅批准。

最终检查、PR与提交身份在实际执行后补记；此文件不是全量通过声明。
