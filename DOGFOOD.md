# FlyupMem Dogfood Log

### 2026-05-02 — Incremental Sync + Conflict Resolution ✅ PASS

**新增能力 — Incremental Sync：**
- `addChangedFiles`：只 stage 实际有变化的文件，不再全量 `git add`。
- `SyncPushResult` 新增 `stagedFiles` 和 `debounced` 字段。
- Debounce：上次 commit < 5 秒内自动跳过（可通过 `debounceMs` 配置）。
- CLI `--force` 跳过 debounce。

**新增能力 — Conflict Resolution：**
- `flyupSyncPull` 新增 `strategy` 参数：`'ff-only'`（默认）或 `'local-wins'`。
- `local-wins`：divergent histories 时 reset 到 remote，cherry-pick 本地 commit，冲突用 `--ours` 解决。
- CLI：`flyupmem sync pull --strategy local-wins`。

**验证：**
- `npm run test:sync`：5 个集成测试全绿。
- `npm test`：23 files / 171 TS tests + 8 Python boundary tests 全绿。
- dist CLI dogfood：debounce 行为正确（连续 push 被拦截），`--force` 绕过。

---

### 2026-05-02 — Batch Operations ✅ PASS

**新增能力：**
- `review --batch`：移除默认 50 条限制，返回所有审查候选。
- `prune --all`：一键批量退休所有审查候选（隐含 `--apply`）。
- `prune --confirm`：执行退休并输出每项详情（id, statement, action, reason）。

**验证：**
- TDD：curate.test.ts 新增 3 项测试（batch limit removal, --all batch retire, --confirm details）。
- `npm test`：23 files / 171 TS tests + 8 Python boundary tests 全绿。
- dist CLI dogfood：临时 store 创建 5 条 dogfood 记忆，`review --batch` 返回全部 5 条，`prune --all` 一次退休 5/5，`prune --confirm` 输出每项 confirm_details。

---

### 2026-05-02 — Adoption-Based Scoring ✅ PASS

**新增能力：**
- Engram 新增 `adoption_count` 字段，跟踪正反馈次数（= 用户实际采纳了记忆建议）。
- `applyFeedback` 收到 `positive` 信号时自动递增 `adoption_count`，`negative`/`neutral` 不变。
- `computeQualityScore` 纳入 adoption 增益：`min(0.20, log1p(adoption_count) * 0.06)`。
- Reranker 的 quality 维度传入 `adoption_count`。
- Zod schema 设 `.default(0)` 保证向后兼容。

**验证：**
- TDD：decay.test.ts 新增 2 项 adoption 测试，rerank.test.ts 新增 1 项 adoption 测试。
- `npm test`：23 files / 168 TS tests + 8 Python boundary tests 全绿。
- dist CLI dogfood：临时 store `learn → feedback(positive) → feedback(positive) → feedback(negative)`，确认 `adoption_count: 0 → 1 → 2 → 2`（negative 不递增）。

---

### 2026-05-02 — Memory Quality Scoring ✅ PASS

**新增能力：**
- Activation 新增 `turn_count` 字段，跟踪记忆被召回的对话轮次。
- `computeActivation` 加入 turn_count 对数增益（上限 +0.15）。
- 新增 `computeQualityScore`：综合 turn_count、衰减比率、consolidation 状态、feedback 正负比。
- Rerank 从 8 维升级到 9 维，新增 `quality` 维度（权重 0.18）。
- `recallWithExplanation` 召回时自动递增 `turn_count` 并通过 `store.save()` 持久化。
- Zod schema `turn_count` 设 `.default(0)` 保证旧数据向后兼容。

**验证：**
- TDD 新增 `tests/decay.test.ts` 扩展：turn_count boost、quality score 6 项测试。
- TDD 新增 `tests/rerank.test.ts` 扩展：quality 维度 3 项测试（turn_count、consolidated、feedback）。
- `npm test`：23 files / 165 TS tests + 8 Python boundary tests 全绿。
- `npm run build`：TypeScript 编译通过。
- dist CLI dogfood：临时 store `learn → recall → recall`，确认 `turn_count: 0 → 1 → 2` 持久化正确。

---

### 2026-05-02 — Memory Curation CLI Dogfood ✅ PASS

**新增能力：**
- `flyupmem review`：列出疑似低价值 / dogfood / marker / test 记忆候选，默认不包含 retired。
- `flyupmem prune`：默认 dry-run，显示会退休哪些候选。
- `flyupmem prune --apply`：将候选安全标记为 `retired`，追加 `pruned` tag，并设置 `valid_until`；不物理删除，`locked` 记忆受保护。

**验证：**
- TDD 新增 `tests/curate.test.ts`：4 个测试覆盖 review、dry-run、apply、locked 保护。
- `npm test`：23 files / 153 TS tests + 8 Python boundary tests 全绿。
- `npm run build`：TypeScript 编译通过。
- dist CLI dogfood：临时 store 完整 `learn(marker) → review → prune(dry-run) → prune --apply → review` 通过，确认 dry-run 不变更，apply 后默认 review 不再返回 retired marker。

**说明：**
- 该功能优先服务本地记忆质量维护；主人已明确云端 GitHub 远端同步不是当前刚需。

---

### 2026-05-02 — Real Store Git Sync Bootstrap ⚠️ PARTIAL

**真实 store：** `~/.flyupmem`

**已完成：**
- 清理上次 dogfood 残留的 `FLYUPMEM_STORE_PATH` 干扰后，确认真实默认 store 为 `~/.flyupmem`。
- 对真实 store 执行 `sync init`，初始化本地 Git 仓库。
- 执行 `sync push`，完成本地首个 sync commit。
- 验证 working tree clean。
- 验证 tracked files 仅包含 `.gitignore` 与 YAML 源数据：`engrams.yaml`、`episodes.yaml`、`feedback.yaml`、`graph.yaml`、`mental-models.yaml`、`observations.yaml`。
- 验证 `index.sqlite` 被 `.gitignore` 忽略，未被跟踪。

**阻塞：**
- 远端私有仓库 `revie999/flyupmem-store-private` 不存在。
- 当前 GitHub fine-grained PAT 无 `createRepository` 权限，`gh repo create` 返回 `Resource not accessible by personal access token (createRepository)`。
- 因此没有把真实记忆数据推送到任何远端；当前仅完成本地 Git bootstrap。

**下一步：**
- 主人在 GitHub 上手动创建私有 repo，或给 PAT 增加创建仓库权限。
- 然后执行 `flyupmem sync init <remote>` + `flyupmem sync push` 完成远端同步。

---

### 2026-05-02 — Git Sync MVP Dogfood ✅ PASS

**新增能力：**
- `flyupmem sync init [remote]`：初始化 store Git 仓库，可配置 origin
- `flyupmem sync status`：查看 branch / remote / dirty files / ahead-behind
- `flyupmem sync push`：提交并推送 YAML/config 源数据，忽略 SQLite 派生缓存
- `flyupmem sync pull`：拉取远端并重建 SQLite cache
- `flyupmem sync`：先 pull 后 push 的一键同步

**验证：**
- `npm test`：22 files / 149 TS tests + 8 Python boundary tests 全绿
- `npm run test:sync`：5 个真实 Git 集成测试全绿
- `npm run test:benchmark`：17 个性能 smoke benchmark 全绿
- `npm run build`：TypeScript 编译通过
- dist CLI dogfood：临时 store + bare remote 完整 `init → learn → status → push → pull → sync` 通过

**测试组织调整：**
- `sync.integration.test.ts` 从默认单测拆出到 `npm run test:sync`，避免真实 Git I/O 影响默认测试稳定性。
- `benchmark.test.ts` 从默认单测拆出到 `npm run test:benchmark`，并降低 smoke 规模，避免同步 SQLite 写入导致 Vitest worker RPC timeout。

---

### 2026-05-02 — v0.5.1 Hermes Dogfood ✅ PASS

**验证环境：** Gateway，Hermes provider: flyupmem (active)

**✅ 通过的验证项：**
1. `hermes memory status` 显示 flyupmem 为 active provider
2. CLI `learn` → 写入成功（提取 1 条，存入 1 条）
3. CLI `recall` → 返回相关记忆（6 条匹配）
4. SQLite FTS5 缓存自动同步（7→8 fts, 15→18 vec）
5. `removeEngram` → 从 YAML + SQLite 双删
6. Health check 全绿
7. index.sqlite 已生成（204KB → 232KB）

**🐛 发现的问题：**
- 2 条污染记忆（`ENG-20260502-001` CLI 输出 + `ENG-20260502-002` 回复碎片）
- 根因：v0.5.1 之前的 extract 规则会匹配 CLI 输出和短回复
- 已清理：手动 `removeEngram` 删除 2 条污染条目

**📊 清理后状态：**
- 5 engrams (2 active, 3 candidate)
- 1 observation
- SQLite: 6 fts, 6 meta, 16 vec, 232KB

**⚠️ 待观察：**
- Hermes `sync_turn` 自动学习是否还会产生污染（需要在 Telegram 真实对话中观察几轮）
- SQLite 缓存重建是否在 Gateway 重启后正常工作
- 嵌入向量缓存命中率

**2026-05-02 追加观察：Telegram reply preview 污染**
- 现象：真实 Telegram dogfood 中发现 `ENG-20260502-004`，内容来自 `[Replying to: "..."]` 引用预览，而不是用户新输入
- 根因：Hermes Telegram 网关会把回复引用预览拼进 `user_content`；既有 `stripInjectedMemoryContext()` 只剥离 memory-context / flyupmem-context / System note，没有剥离 Telegram reply preview
- 修复：TypeScript extractor 与 Python Hermes provider 均剥离开头的 `[Replying to: "..."]` block
- 回归测试：新增 2 个 TS extractor 测试 + 2 个 Python provider boundary 测试
- 清理：已删除污染记忆 `ENG-20260502-004`，SQLite 同步删除
- 验证：`npm test` 23 files / 166 tests 全绿；Hermes plugin 8 tests 全绿；`npm run build` 通过；live status 为 4 engrams / 1 observation / health ok

**2026-05-02 Telegram dogfood 综合验证**
| 场景 | 期望 | 结果 |
|---|---|---|
| 短句"继续" | 不学习 | ✅ |
| 短句"都可以" | 不学习 | ✅ |
| 短句"可以继续" + memory-context 块 | 不学习 | ✅ |
| Telegram reply preview `[Replying to]` | 不学习 | ✅（修复后） |
| memory-context 内的旧 marker | 不误提取 | ✅ |
| "记住我爱你"（无冒号,4字） | 保守拦截 | ✅ |
| 含"记住"的 memory-context 块 | 不学习旧 marker | ✅ |

**结论：v0.5.1 dogfood PASS。** 所有自动学习边界验证通过，无新增污染。

---

### 2026-05-02 — v0.5.0 SQLite FTS5 缓存 + 嵌入向量缓存 + 性能基准

**SQLite FTS5 缓存层（src/core/sqlite-cache.ts）**
- better-sqlite3 原生驱动，WAL 模式
- 五张表：memory_fts(FTS5 trigram)、memory_meta、memory_vectors、feedback、memory_links
- Store.load() 自动开缓存 + 从 YAML 重建索引
- Store 增删改自动同步 FTS
- 21 个专项测试

**嵌入向量缓存**
- embed() 支持 SQLiteCache 参数，先查缓存再计算
- embedBatch() 批量嵌入，只算缺失的
- semanticSearch 接入缓存，避免重复计算
- Float32Array ↔ Buffer 转换存 SQLite BLOB

**性能基准（M4 Studio, 64GB）**

| 操作 | 100 | 1K | 5K | 10K |
|------|-----|-----|-----|------|
| BM25 内存 | 3.5ms | 18ms | 66ms | 96ms |
| FTS5 搜索 | 1.4ms | 3.2ms | 4.1ms | 3.9ms |
| 完整 recall | 1.4ms | 2.8ms | — | — |
| SQLite 重建 | 4.9ms | 69ms | 260ms | — |

FTS5 搜索恒定 ~4ms，不随数据量增长。

**已知限制：** FTS5 trigram 对中文 MATCH 无效，自动降级内存 BM25（jieba 分词）。

**其他**
- 新增 `sqlite_enabled` 配置项（默认 true）
- status 工具显示 SQLite 缓存统计
- 164 个测试全绿（147 功能 + 17 基准）

---

### 2026-05-01 — 配置面板 CLI

增加交互式配置管理：以前只能通过代码或手动编辑 config.yaml 修改配置。

处理结果：

- 新增 `flyupmem config [show]`：查看当前有效配置（defaults + stored 合并）
- 新增 `flyupmem config set <key> <value>`：设置配置值，带类型校验
  - number 类型：校验 NaN
  - boolean 类型：支持 true/false/yes/no/1/0/on/off
  - string enum 类型：校验合法值（如 log_level: debug|info|warn|error）
  - 未知 key 拒绝并列出可用 keys
- 新增 `flyupmem config reset`：删除 config.yaml，恢复默认值
- 新增 `flyupmem config keys`：列出所有可配置项（类型、描述、默认值）
- 支持的配置项：
  - store_path, max_engrams_per_file, max_file_size_mb
  - decay_enabled, consolidation_enabled, embedding_enabled
  - log_level

验证：

```bash
npx vitest run tests/config.test.ts
npm test
npm run build
node dist/index.js config show
node dist/index.js config keys
node dist/index.js config set log_level debug
node dist/index.js config reset
```

结果：

- `tests/config.test.ts`: 10 passed
- 全量 Vitest + Hermes plugin: 21 files / 126 tests + 6 plugin tests — all passed
- `tsc` build passed
- CLI dogfood：show/set/reset/keys 全部正常

### 2026-05-01 — Memory Inspect 工具

增加单条记忆深度检查能力：以前只能看全局 status，无法查看单条记忆的激活度衰减、关联关系和 graph 边。

处理结果：

- 新增 `flyupmem inspect <memory-id> [--json]`：查看单条记忆详情
  - 普通模式：emoji 格式化输出，一目了然
  - JSON 模式：结构化数据，适合脚本消费
  - 显示内容：statement, type, class, polarity, scope, domain, tags
  - 激活度：原始 retrieval_strength → 当前计算值（含 ACT-R 衰减）
  - 时间：learned age, last accessed, decay λ
  - 关联：associations + graph edges（双向）
  - 反馈：positive/negative/neutral 计数
- 新增 MCP 工具：`flyup_inspect`
- 新增 Hermes 工具 schema：`flyup_inspect`
- 导出类型：InspectResult, MemoryDetail, RelatedMemory, GraphEdgeInfo, FeedbackSummary

验证：

```bash
npx vitest run tests/inspect.test.ts
npm test
npm run build
node dist/index.js inspect ENG-20260501-001
node dist/index.js inspect ENG-20260501-001 --json
```

结果：

- `tests/inspect.test.ts`: 7 passed
- 全量 Vitest + Hermes plugin: 20 files / 116 tests + 6 plugin tests — all passed
- `tsc` build passed
- CLI dogfood：inspect 输出包含 activation、temporal、graph edges、feedback

### 2026-05-01 — Doctor / Setup / Status CLI 子命令

增加 P5 可观测性工具：以前只有 `flyup_status` 工具 API 返回 JSON，没有独立 CLI 诊断命令，排查问题不方便。

处理结果：

- 新增 `flyupmem doctor`：深度自检（10 项检查）
  - store-path：目录存在且可写
  - yaml-parsing：所有 YAML 文件可正常解析
  - schema-validation：Zod 校验通过数 / 总数
  - unique-ids：跨层 ID 唯一性
  - graph-integrity：边和实体引用的有效性
  - temporal：learned_at ≤ valid_from 一致性
  - activation-range：激活值在 [0,1] 范围内
  - embedding：BGE-small-zh 模型可用性
  - file-size：YAML 文件大小阈值检查
  - hermes-plugin：Hermes 插件符号链接检查
- 新增 `flyupmem setup [--force]`：环境检查 + store 初始化
  - Node.js 版本 ≥ 20
  - 创建 store 目录和初始 YAML 文件（--force 可覆盖）
  - @xenova/transformers 可用性
  - Hermes 插件链接状态
  - FLYUPMEM_STORE_PATH 环境变量
- 增强 `flyupmem status`：新增 `summary` 字段（人类可读的一行摘要）
- 所有新模块均有独立类型导出（DoctorResult, DoctorCheck, SetupResult, SetupStep, StatusResult）

验证：

```bash
npx vitest run tests/doctor.test.ts tests/setup.test.ts
npm test
npm run build
node dist/index.js doctor
node dist/index.js setup
node dist/index.js status
```

结果：

- `tests/doctor.test.ts`: 6 passed
- `tests/setup.test.ts`: 4 passed
- 全量 Vitest + Hermes plugin: 19 files / 109 tests + 6 plugin tests — all passed
- `tsc` build passed
- CLI dogfood：
  - `doctor`：8 pass / 1 warn（embedding 未加载，预期行为）
  - `setup`：5 ok / 1 skip（onnx-runtime 未安装，预期行为）
  - `status`：返回 stats + health + summary

## 2026-05-01 — Hermes MemoryProvider 接入验证

### 2026-05-01 — Recall explain/debug mode

在完成召回质量门禁后，继续增加可调试性：以前只能看到“召回/不召回”和最终 injection，无法判断是哪一路信号导致命中，也无法快速定位误召回/漏召回。

处理结果：

- 新增内部 API：`recallWithExplanation(query, store)`。
- 新增工具 API：`flyupRecallExplain(...)`。
- CLI 支持：`flyupmem recall "<query>" --explain`，输出结构化 JSON。
- Hermes MemoryProvider 工具 schema 支持 `flyup_recall({ query, explain: true })`。
- MCP `flyup_recall` 支持 `explain: true`。
- explain JSON 包含：
  - `injection` / `count`
  - `explanations[]`
  - 每条记忆的 `signals.bm25|semantic|temporal|graph`
  - 每路信号的 `matched` / `available` / `score` / `rank`
  - `scores.rrf` / `activation` / `activation_weighted` / `rerank`
  - `reason`
  - `diagnostics.signal_counts`
  - 空结果 `diagnostics.no_results_reason`

验证：

```bash
npm run test:ts -- tests/recall.test.ts
python3 -m unittest tests/hermes_plugin_boundary_test.py -v
npm test
npm run build
```

结果：

- `tests/recall.test.ts`: 7 passed
- Hermes plugin boundary unittest：6 passed
- 全量 Vitest：17 files / 99 tests passed
- `npm test`: passed
- `tsc` build passed

真实 CLI dogfood 使用临时 store 验证：

- related query `explain-dogfood-20260501`：返回 1 条记忆，explain 显示 `bm25` + `semantic` 命中，并给出 RRF/activation/rerank 分数。
- unrelated query `蓝色长颈鹿火星煮咖啡 7f3a9z`：返回 0 条记忆，`no_results_reason` 为 `No retrieval signals matched this query.`。

### 2026-05-01 — Recall 质量门禁：避免无关查询注入唯一记忆

继续 dogfood 时发现一个召回质量问题：当 store 里只有 1 条记忆时，无关查询也可能被注入。根因有两层：

1. `temporalSearch` 在 query 没有时间引用时给所有记忆 0.5 neutral score，RRF 会把唯一记忆合并进结果。
2. `semanticSearch` 阈值过低（0.1），本地 embedding 对无关 dogfood marker 与中文偏好记忆仍给出约 0.36 的余弦相似度，导致误召回。

处理结果：

- `src/search/temporal.ts`：没有时间引用时 temporal signal 不参与召回，直接返回空结果。
- `src/search/semantic.ts`：语义召回最低阈值提高到 `0.5`。
- `src/search/recall.ts`：空召回注入格式改为明确的 `(no relevant memories)`，避免上层误读空 context。
- `tests/temporal.test.ts`：新增无时间引用不返回 temporal candidates 的回归测试。
- `tests/recall.test.ts`：新增 lexical/temporal/semantic 均无关时不注入记忆的回归测试。

验证：

```bash
npm run test:ts -- tests/recall.test.ts tests/temporal.test.ts
npm test
npm run build
```

结果：

- `tests/recall.test.ts` + `tests/temporal.test.ts`: 13 passed
- 全量 Vitest：17 files / 96 tests passed
- Hermes plugin Python unittest：4 passed
- `tsc` build passed

真实 CLI dogfood 使用临时 store 验证：

- learn `记住：主人偏好直接给结论。`: stored 1
- unrelated recall `dogfood marker hermes-adapter-smoke-20260501`: 返回 `(no relevant memories)`
- relevant recall `直接给结论`: 正常返回该偏好记忆
- temporal recall `今天记住了什么`: 正常返回该偏好记忆
- 临时 store status：1 条候选记忆，health ok

### 2026-05-01 — Hermes Adapter 学习边界与 store 路径隔离

继续 dogfood 时发现两个后续问题：

1. Telegram/Hermes user content 可能带有系统注入的 `<memory-context>` / `<flyupmem-context>` 块，里面包含历史记忆文本。如果不剥离，会被自动学习入口误判。
2. `FLYUPMEM_STORE_PATH` 没被 TypeScript `FlyupMemStore` 读取，导致 CLI/adapter 传入的隔离 store 路径被忽略。临时 dogfood 因此短暂写入真实 `~/.flyupmem`，已清理。

处理结果：

- `src/lifecycle/extract.ts`：抽取前剥离 injected memory context，并用剥离后的文本作为 source quote。
- `hermes-plugin/__init__.py`：新增 `learnable_user_content()`，在 `sync_turn` / `on_session_end` / `on_pre_compress` / `flyup_learn` 工具入口统一清洗。
- `hermes-plugin/__init__.py`：自动学习增加 signal 判定，像“继续”这种无记忆信号的普通短消息不会触发 CLI learn。
- `src/core/store.ts`：`new FlyupMemStore()` 默认读取 `FLYUPMEM_STORE_PATH`，显式 config 仍优先。
- `package.json`：`npm test` 现在同时跑 Vitest 和 Hermes Python plugin 边界测试。
- `tests/extract.test.ts`：新增 recalled memory context 回归测试。
- `tests/hermes_plugin_boundary_test.py`：新增 Hermes adapter 边界测试。
- `tests/store.test.ts`：新增 `FLYUPMEM_STORE_PATH` 回归测试。

验证：

```bash
npm run test:ts -- tests/store.test.ts
npm test
npm run build
```

结果：

- store 单测：7 passed
- 全量 Vitest：17 files / 93 tests passed
- Hermes plugin Python unittest：4 passed
- `tsc` build passed

真实 CLI dogfood 使用临时 store 验证：

- context-only learn：`extracted: 0`, `stored: 0`
- explicit-with-context learn：只存入显式用户记忆 `记住：主人偏好直接给结论。`
- recall 不再出现 injected dogfood marker
- 临时 store status：1 条候选记忆
- 真实 `~/.flyupmem` 已清理回 1 条正常 dogfood marker

### 2026-05-01 — Recall 污染清理与过滤回归

Dogfood 召回时发现 `~/.flyupmem/engrams.yaml` 混入 3 条 Hermes 技能维护系统提示残片：

- `ENG-20260501-002`
- `ENG-20260501-003`
- `ENG-20260501-004`

处理结果：

- 已从本地 FlyupMem store 删除上述 3 条污染 engram
- `flyup_status` 现在显示只剩 1 条 dogfood marker 记忆
- `flyup_recall` 不再返回英文系统/技能提示残片
- 在 `extractEngramsFromTurn` 增加 meta skill-maintenance instruction 过滤
- 新增回归测试：`does not extract meta skill-maintenance instructions as user memory`

验证：

```bash
npm test -- tests/extract.test.ts
npm test
npm run build
```

结果：

- `tests/extract.test.ts`: 6 passed
- 全量测试：17 files / 90 tests passed
- `tsc` build passed

### 环境

- FlyupMem repo: `/Users/gm99/projects/flyupmem`
- Hermes home: `/Users/gm99/.hermes`
- Hermes memory provider: `flyupmem`
- FlyupMem store: `~/.flyupmem/`

### 接入方式

使用 Hermes 用户插件目录，不修改 Hermes 源码：

```bash
mkdir -p ~/.hermes/plugins
ln -s /Users/gm99/projects/flyupmem/hermes-plugin ~/.hermes/plugins/flyupmem
hermes config set memory.provider flyupmem
```

配置变更前已备份：

```text
/Users/gm99/.hermes/config.yaml.bak.flyupmem-20260501-221432
```

### 验证结果

#### 1. Hermes 插件发现

```bash
hermes memory status
```

结果：

- Built-in memory always active
- Provider: `flyupmem`
- Plugin installed: yes
- Status: available
- `flyupmem (local)` 显示为 active

#### 2. Python MemoryProvider 级加载

使用 Hermes venv Python 加载：

```bash
/Users/gm99/.hermes/hermes-agent/venv/bin/python
```

验证项：

- `load_memory_provider('flyupmem')` 返回 `FlyupMemProvider`
- `is_available()` 返回 `True`
- `system_prompt_block()` 包含 `FlyupMem`
- `get_tool_schemas()` 返回：
  - `flyup_recall`
  - `flyup_learn`
  - `flyup_feedback`
  - `flyup_status`
- `flyup_status` 可通过 `handle_tool_call()` 正常返回 JSON

#### 3. 工具闭环验证

写入测试记忆：

```text
记住：FlyupMem dogfood marker 是 hermes-adapter-smoke-20260501。
```

结果：

- stored: 1
- memory id: `ENG-20260501-001`

召回查询：

```text
hermes-adapter-smoke-20260501
```

结果成功返回：

```xml
<flyupmem-context>
### Consider
[ENG-20260501-001] 记住：FlyupMem dogfood marker 是 hermes-adapter-smoke-20260501。
</flyupmem-context>
```

#### 4. 真实 Hermes 单轮验证

命令：

```bash
hermes chat -q '请调用 FlyupMem 的状态工具检查记忆后端是否启用，然后用一句中文回答结果。' -Q
```

结果：

```text
FlyupMem 记忆后端已启用且运行正常 ✨ — 共存储 1 条记忆（1 条候选态），无异常。
```

说明：Hermes Agent 能真实启动并调用 FlyupMem memory provider 工具。

### 发现的问题

1. 系统 Python 缺少 `yaml`，直接用 `python3` 加载 Hermes 插件会失败：

```text
ModuleNotFoundError: No module named 'yaml'
```

这不是 FlyupMem 插件问题；应使用 Hermes venv Python：

```bash
/Users/gm99/.hermes/hermes-agent/venv/bin/python
```

2. 当前 Telegram gateway 是长驻进程，配置变更后需要重启 gateway 才能让 Telegram 会话使用新的 memory provider。CLI 新会话已验证通过。

### 回滚方式

```bash
hermes config set memory.provider default
rm ~/.hermes/plugins/flyupmem
cp /Users/gm99/.hermes/config.yaml.bak.flyupmem-20260501-221432 ~/.hermes/config.yaml
```

如果要让 Telegram 立即生效，需要重启 Hermes gateway；建议在确认不会打断正在进行的任务时执行。
---

### 2026-05-04 — Benchmark CLI ✅ PASS

**新增能力：**
- `flyupmem benchmark`：正式性能基准 CLI。
- 支持 `--counts 1000,5000,10000`、`--iterations N`、`--format json|markdown`、`--out file`、`--store path`、`--keep-store`。
- 指标覆盖 populate、YAML save/load、SQLite rebuild、FTS search、BM25 fallback、full recall pipeline、hit count、SQLite/YAML 体积。

**验证：**
- `npm run build`：通过。
- `npm run test:benchmark`：3 tests passed。
- Full TS suite（single-fork Vitest）：23 files / 181 tests passed。
- Hermes plugin boundary：8 tests passed。
- dist CLI dogfood：
  - Markdown: `node dist/index.js benchmark --counts 1000,5000,10000 --iterations 3 --store <tmp> --format markdown --out /tmp/flyupmem-benchmark.md`。
  - JSON sanity: `node dist/index.js benchmark --counts 100 --iterations 1 --format json`。

**本机 1K/5K/10K 结果：**

| count | populate | save | load | rebuild | FTS p50/p95 | BM25 p50/p95 | recall p50/p95 | hits | sqlite | yaml |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1000 | 871.93ms | 193.67ms | 337.7ms | 64.98ms | 2.4/2.85ms | 12.57/16.59ms | 229.69/347.17ms | 25 | 3.18 MB | 5.13 MB |
| 5000 | 6638.54ms | 563.74ms | 1059.76ms | 592.04ms | 20.52/28.57ms | 49.56/56.56ms | 1359.76/1413.94ms | 25 | 12.89 MB | 15.64 MB |
| 10000 | 25394.56ms | 1258.4ms | 2594.28ms | 1301.9ms | 46.89/53.1ms | 113.99/131.73ms | 2660.31/2697.31ms | 25 | 19.31 MB | 31.04 MB |

**结论：** SQLite FTS 自身扩展性很好；5K/10K full recall 主要被 YAML save/load 与 recall 后 activation 持久化拖慢。下一步更适合做归档/分片或 write-light recall。
