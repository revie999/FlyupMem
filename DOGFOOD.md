# FlyupMem Dogfood Log

## 2026-05-01 — Hermes MemoryProvider 接入验证

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
