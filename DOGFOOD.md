# FlyupMem Dogfood Log

## 2026-05-01 — Hermes MemoryProvider 接入验证

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
