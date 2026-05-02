# FlyupMem — 终极融合版

> 融合 v3（来源标注、9 维 rerank、candidate 晋升、scope 免疫、Hermes 集成、生产化路线）
> 与最终版（完整 TS 实现、性能指标、OpenClaw 钩子、依赖清单）的全部精华。
> 定位：本地优先、零成本、跨 Agent 共享的 AI 记忆系统。

---

## 一、设计目标

1. **零成本可用** — 基础模式不需 LLM API，不需 Docker/PostgreSQL
2. **深度检索** — 5 信号融合（语义 + BM25 + 图谱 + 时序 + 激活度）
3. **自动维护** — 记忆自动合并、衰减、淘汰，不需人工清理
4. **渐进增强** — 基础 → 开启 LLM 增强 → 开启 Reflect 深度推理
5. **记忆可操控** — YAML 为 source of truth，人可读、可编辑、可 Git
6. **跨 Agent 共享** — OpenClaw + Hermes + 任意 MCP 客户端共享同一份记忆
7. **异步非阻塞** — 写入和整合在后台线程，不阻塞对话 *(v3/Design)*

---

## 二、技术选型

| 决策 | 选择 | 理由 |
|------|------|------|
| 语言 | **TypeScript** | OpenClaw 生态原生，MCP 兼容 *(最终版)* |
| 主存储 | **YAML** | 可读、可编辑、可 Git、可手改 *(共通)* |
| 索引缓存 | **SQLite（可选）** | FTS5 + embedding cache，可从 YAML 重建 *(v3)* |
| 嵌入模型 | **BGE-small-zh-v1.5 ONNX** | 384 维，~130MB，中文优化，纯本地 *(替代原 en 版)* |
| 部署 | **npm install** | 无 Docker，Intel Mac 兼容 *(最终版)* |
| 基础模式成本 | **零** | 规则提取 + BM25 + 本地嵌入 *(共通)* |
| 跨平台协议 | **MCP + 共享文件系统** | OpenClaw 插件 + Hermes MemoryProvider + MCP server *(Plur 模式)* |

---

## 三、记忆层级（4 层）

```
L1 Mental Model  ←── 用户策展 / LLM Reflect 生成
 ↑ (auto-consolidate)
L2 Observation   ←── 嵌入聚类 + 证据累积合并
 ↑ (extract from conversation)
L3 Engram        ←── 对话中提取的基本事实
 ↓ (fast decay)
L4 Experience    ←── 交互日志，快速衰减
```

**层级特征：**

| 层级 | 衰减 λ | 最低 proof | 来源 | 注入优先级 |
|------|--------|-----------|------|-----------|
| Mental Model | 0.01 | ≥3 observations | 手动/Reflect | 最高（Directives） |
| Observation | 0.025 | ≥2 engrams | 自动合并 | 高（Constraints） |
| Engram | 0.05 | 1 | 规则提取 | 中（Consider） |
| Experience | 0.08 | — | 自动捕获 | 低/不注入 |

---

## 四、数据模型

### 4.1 YAML 文件布局

```
~/.flyupmem/
├── config.yaml              # 配置
├── engrams.yaml             # L3 原始事实（source of truth）
├── observations.yaml        # L2 证据支撑模式
├── mental-models.yaml       # L1 高层画像
├── episodes.yaml            # 情景记忆
├── graph.yaml               # 实体 + 关联边
├── feedback.yaml            # 反馈信号
├── history.jsonl            # 变更日志
├── index.sqlite             # 可选缓存，可重建
└── embeddings/
    └── bge-small-zh.cache   # 嵌入缓存
```

YAML 是 source of truth。SQLite / embedding cache 都是派生物，可随时从 YAML 重建。*(共通)*

**增长策略：** 当单个 YAML 文件超过 5000 条或 5MB 时，按状态分片：
- `engrams.yaml` — 仅保留 active + candidate
- `engrams-archive.yaml` — retired + dormant（不参与日常检索，可手动清理）
- 归档操作在 REM 调度中自动执行

### 4.2 Engram（L3）

```yaml
id: ENG-20260430-001
version: 3
layer: raw                    # raw | observation | mental_model
status: candidate             # candidate | active | fading | dormant | retired | locked *(v3: 保留 candidate)*
consolidated: false

# 分类 *(v3)*
type: procedural              # behavioral | terminological | procedural | architectural
memory_class: semantic        # semantic | episodic | procedural | metacognitive
fact_type: world              # world | experience | observation *(v3)*
polarity: do                  # do | dont | null
commitment: leaning           # exploring | leaning | decided | locked
scope: project:openclaw
visibility: private
domain: dev/testing
tags: [vitest, tests]

# 内容
statement: "Vitest 部分匹配要用 toMatchObject()，不是 toEqual()。"
rationale: "toEqual() 做严格深比较，多余字段会导致失败。"
contraindications: []
summary: "Vitest 部分匹配用 toMatchObject" *(v3)*

# 实体 & 时序
entities:
  - name: Vitest
    type: tool
temporal:
  learned_at: 2026-04-30T11:10:00+08:00
  valid_from: 2026-04-30T11:10:00+08:00
  valid_until: null
source:
  episode_id: EP-20260430-001
  quote: "不是，Vitest 部分匹配要用 toMatchObject"
  origin: openclaw:webchat

# ACT-R 激活模型
activation:
  retrieval_strength: 0.7
  storage_strength: 1.0
  frequency: 0
  last_accessed: 2026-04-30
emotional_weight: 5           # 1-10，影响衰减速率
confidence: 5                 # 1-10

# 去重 & 关联
content_hash: "sha256:..."
associations:
  - target: ENG-20260420-007
    type: semantic
    weight: 0.6
relations:                    # *(v3)*
  broader: []
  narrower: []
  related: []
  conflicts: []

# 嵌入
embedding_ref: "embeddings/bge-small-zh.cache#ENG-20260430-001"

# 反馈计数
feedback:
  positive: 0
  negative: 0
  neutral: 0

# 版本演化
previous_version_ref: null
derivation_count: 1
```

### 4.3 Observation（L2）

```yaml
id: OBS-20260430-001
layer: observation
status: active
scope: global
domain: user/preferences
title: "主人偏好简洁直接的工作沟通"
statement: "主人在工作场景中多次偏好简洁、直接、少废话的回复。"

# 证据链
source_memory_ids:
  - ENG-20260401-003
  - ENG-20260412-009
proof_count: 2
evidence:
  - engram_id: ENG-20260401-003
    quote: "喜欢简洁、直接、不绕弯子的表达"
    timestamp: 2026-04-01T10:00:00+08:00

# 趋势 & 置信度
trend: stable                 # new | strengthening | stable | weakening | stale
confidence: 8                   # 1-10，统一量纲

# ACT-R
activation:
  retrieval_strength: 0.85
  storage_strength: 1.0
  frequency: 4
  last_accessed: 2026-04-30
emotional_weight: 6

# 历史
history:
  - event: created
    at: 2026-04-30T11:12:00+08:00
    from: [ENG-20260401-003, ENG-20260412-009]
```

### 4.4 Mental Model（L1）

```yaml
id: MM-USER-STYLE-001
layer: mental_model
scope: global
domain: user/style
title: "主人偏好高密度、低废话的执行型助手"
statement: >
  主人更重视直接推进、工具验证和小步执行；
  不喜欢空泛计划、长篇重复和未经验证的推断。

source_observation_ids:
  - OBS-STYLE-001
  - OBS-WORKFLOW-003
proof_count: 7
confidence: 9                   # 1-10，统一量纲
trend: strengthening

refresh_policy:
  cadence: weekly
  stale_after_days: 60
last_refreshed: 2026-04-30T11:12:00+08:00

activation:
  retrieval_strength: 0.9
  storage_strength: 1.0
  frequency: 10
  last_accessed: 2026-04-30
emotional_weight: 8
```

**数量上限** *(v3)*：
- global user profile: ≤ 20
- per project: ≤ 30
- per domain: ≤ 15

### 4.5 Episode

```yaml
id: EP-20260430-001
timestamp: 2026-04-30T11:05:00+08:00
agent: main
channel: webchat
scope: global
summary: "讨论 Hindsight 和 Plur，要求设计 FlyupMem。"
tags: [memory-system, design]
created_engram_ids: [ENG-20260430-001, ENG-20260430-002]
```

### 4.6 Graph

```yaml
entities:
  Vitest:
    type: tool
    memory_ids: [ENG-20260430-001, ENG-20260430-003]
  OpenClaw:
    type: project
    memory_ids: [ENG-20260430-005]
edges:
  - from: ENG-20260430-001
    to: ENG-20260430-002
    type: semantic
    weight: 0.6
  - from: ENG-20260430-004
    to: ENG-20260430-005
    type: causal
    relation: inspired_by
    weight: 0.7
  - from: ENG-20260430-003
    to: ENG-20260430-001
    type: co_accessed
    strength: 0.4
```

### 4.7 Feedback

```yaml
- id: FB-001
  memory_id: ENG-20260430-001
  signal: positive
  context: "用户确认这个记忆有用"
  created_at: 2026-04-30T12:00:00+08:00
```

### 4.8 SQLite 缓存 *(v3)*

```sql
CREATE VIRTUAL TABLE memory_fts USING fts5(
  id, statement, summary, tags, scope, domain,
  tokenize='trigram'
);
CREATE TABLE memory_vectors (
  id TEXT PRIMARY KEY,
  embedding BLOB,
  layer TEXT
);

CREATE TABLE memory_meta (
  id TEXT PRIMARY KEY,
  layer TEXT, status TEXT, type TEXT,
  scope TEXT, domain TEXT,
  confidence INTEGER, activation REAL,
  last_accessed TEXT, content_hash TEXT,
  created_at TEXT, updated_at TEXT
);

CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id TEXT NOT NULL,
  signal TEXT NOT NULL,
  context TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE memory_links (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  link_type TEXT NOT NULL,
  weight REAL DEFAULT 0.5,
  entity_name TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (from_id, to_id, link_type, COALESCE(entity_name, ''))
);
```

> FTS5 使用 `trigram` tokenizer，对中英文混合文本都有效；内存 BM25 则使用 §5.2.1 的 jieba + 英文分词。

**重建策略：** YAML → SQLite 单向同步。启动时检测 YAML mtime，增量更新缓存。SQLite 崩溃可从 YAML 完整重建。

---

## 五、核心算法

### 5.1 ACT-R 激活衰减（分层 λ + emotional_weight 调制）

```ts
const DECAY_RATES: Record<number, number> = {
  1: 0.01,   // Mental Model — 极慢
  2: 0.025,  // Observation — 慢
  3: 0.05,   // Engram — 标准
  4: 0.08,   // Experience — 快
}

const FLOOR = 0.05

function decayedStrength(
  retrievalStrength: number,
  daysSinceAccess: number,
  level: number,
  emotionalWeight: number = 5
): number {
  const baseLambda = DECAY_RATES[level] ?? 0.05
  const effectiveLambda = baseLambda * (1 - emotionalWeight / 20)
  return FLOOR + (retrievalStrength - FLOOR) * Math.exp(-effectiveLambda * daysSinceAccess)
}

function reactivate(current: number): number {
  return Math.min(1.0, current + 0.1)
}

function statusFromStrength(strength: number, mem: Memory): string {
  if (mem.commitment === 'locked') return 'locked'
  if (strength > 0.5) return 'active'
  if (strength > 0.3) return 'fading'
  if (strength > 0.1) return 'dormant'
  return 'retired'
}
```

### 5.2 BM25 检索

```ts
const K1 = 1.2
const B = 0.75

function bm25Score(
  queryTokens: string[],
  docTokens: string[],
  avgDocLen: number,
  docCount: number,
  dfMap: Map<string, number>
): number {
  let score = 0
  for (const qt of queryTokens) {
    const idf = Math.max(0, Math.log(docCount / (1 + (dfMap.get(qt) ?? 0))))
    const tf = docTokens.filter(t => t === qt).length
    const dl = docTokens.length
    score += idf * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * dl / avgDocLen))
  }
  return score
}

function bm25Search(query: string, memories: Memory[], limit = 30): ScoredResult[] {
  const queryTokens = tokenize(query)
  const avgDocLen = memories.reduce((s, m) => s + tokenize(m.statement).length, 0) / memories.length
  const dfMap = buildDFMap(memories)

  return memories
    .map(m => ({
      id: m.id,
      score: bm25Score(queryTokens, tokenize(m.statement), avgDocLen, memories.length, dfMap)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
```

### 5.2.1 分词策略（CJK 支持）

```ts
// 中英文混合分词
function tokenize(text: string): string[] {
  // 1. 英文：空格分词 + 小写 + 去停用词
  // 2. 中文：jieba 分词（@node-rs/jieba，Rust 实现，快）
  // 3. 混合：先用正则分离 CJK 和非 CJK 片段，分别处理
  const segments = text.split(/([\u4e00-\u9fff]+)/)
  const tokens: string[] = []
  for (const seg of segments) {
    if (/[\u4e00-\u9fff]/.test(seg)) {
      tokens.push(...jiebaCut(seg))  // 中文 jieba 分词
    } else {
      tokens.push(...seg.toLowerCase().split(/\s+/).filter(t => t && !STOP_WORDS.has(t)))
    }
  }
  return tokens
}

// FTS5 用 trigram tokenizer，对中英文都有效，无需 jieba
// BM25 内存检索用上述 tokenize() 函数
```

### 5.3 语义检索

```ts
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return Math.max(0, dot)
}

function semanticSearch(
  queryEmbedding: Float32Array,
  memories: Memory[],
  limit = 30
): ScoredResult[] {
  return memories
    .filter(m => m.embedding)
    .map(m => ({
      id: m.id,
      score: cosineSimilarity(queryEmbedding, m.embedding!)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
```

### 5.4 图谱扩展检索

```ts
function graphExpansion(
  seedIds: string[],
  graph: Graph,
  limit = 30
): ScoredResult[] {
  const scores = new Map<string, number>()

  // Entity 扩展
  for (const seedId of seedIds) {
    const entityNeighbors = getEntityNeighbors(seedId, graph)
    for (const [neighborId, sharedCount] of entityNeighbors) {
      scores.set(neighborId, (scores.get(neighborId) ?? 0) + Math.tanh(sharedCount * 0.5))
    }
  }

  // Semantic 扩展
  for (const seedId of seedIds) {
    for (const link of getLinks(seedId, 'semantic', graph)) {
      scores.set(link.toId, (scores.get(link.toId) ?? 0) + link.weight)
    }
  }

  // Causal 扩展（boosted）
  for (const seedId of seedIds) {
    for (const link of getLinks(seedId, 'causal', graph)) {
      scores.set(link.toId, (scores.get(link.toId) ?? 0) + (link.weight + 1.0))
    }
  }

  // Co-accessed（时间衰减）*(v3)*
  for (const seedId of seedIds) {
    for (const link of getLinks(seedId, 'co_accessed', graph)) {
      const decayed = link.weight * timeDecay(link.toId)
      scores.set(link.toId, (scores.get(link.toId) ?? 0) + decayed)
    }
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
```

### 5.5 时序检索（BFS 扩散）

```ts
function temporalSearch(
  queryTimeRef: string | null,
  memories: Memory[],
  graph: Graph,
  limit = 30
): ScoredResult[] {
  // Phase 1: 时间窗口匹配
  const candidates = memories
    .filter(m => m.temporal?.learned_at)
    .map(m => ({
      id: m.id,
      score: timeRelevance(queryTimeRef, m.temporal!.learned_at)
    }))
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)

  // Phase 2: BFS 扩散（3 轮剪枝）
  const scores = new Map(candidates.map(c => [c.id, c.score]))
  const visited = new Set(scores.keys())

  for (let round = 0; round < 3; round++) {
    const newEntries: [string, number][] = []
    for (const [entryId, entryScore] of scores) {
      const links = [
        ...getLinks(entryId, 'temporal', graph),
        ...getLinks(entryId, 'causal', graph)
      ]
      for (const link of links) {
        if (!visited.has(link.toId)) {
          const propagated = entryScore * link.weight * 0.7
          if (propagated >= 0.2) {
            newEntries.push([link.toId, propagated])
            visited.add(link.toId)
          }
        }
      }
    }
    for (const [id, score] of newEntries) {
      scores.set(id, score)
    }
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
```

### 5.6 RRF 融合

```ts
function rrfMerge(resultLists: ScoredResult[][], k = 60): ScoredResult[] {
  const rrfScores = new Map<string, number>()

  for (const results of resultLists) {
    for (let rank = 0; rank < results.length; rank++) {
      const docId = results[rank].id
      rrfScores.set(docId, (rrfScores.get(docId) ?? 0) + 1.0 / (k + rank + 1))
    }
  }

  return [...rrfScores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
}
```

### 5.7 ACT-R 激活度计算

```ts
function computeActivation(mem: Memory): number {
  const now = Date.now()
  const lastAccess = new Date(mem.activation.last_accessed).getTime()
  const daysSince = (now - lastAccess) / (1000 * 60 * 60 * 24)
  const rs = decayedStrength(
    mem.activation.retrieval_strength,
    daysSince,
    mem.layer === 'raw' ? 3 : mem.layer === 'observation' ? 2 : 1,
    mem.emotional_weight ?? 5
  )
  // 频率加成
  const freqBoost = Math.min(0.2, Math.log1p(mem.activation.frequency) * 0.05)
  return Math.min(1.0, rs + freqBoost)
}
```

### 5.8 8 维 Local Rerank *(v3，去掉 ACT-R 因子避免重复)*

```ts
function localRerank(score: number, mem: Memory, queryCtx: QueryContext): number {
  let s = score

  // 1. Scope 精确匹配
  if (mem.scope === queryCtx.scope) s *= 1.4

  // 2. 层级加成
  if (mem.layer === 'mental_model') s *= 1.25
  else if (mem.layer === 'observation') s *= 1.15

  // 3. 最近性（Observation / MentalModel 可能没有 temporal，回退到 last_refreshed / last_accessed）
  const timeAnchor = mem.temporal?.learned_at ?? mem.last_refreshed ?? mem.activation.last_accessed
  const recencyDays = daysSince(timeAnchor)
  const recency = Math.exp(-0.1 * recencyDays)
  s *= (0.7 + 0.3 * recency)

  // 4. 证据数量
  if (mem.proof_count && mem.proof_count > 3) s *= 1.2

  // 5. 负面反馈惩罚
  if ((mem.feedback?.negative ?? 0) > 2) s *= 0.5

  // 6. 锁定加成
  if (mem.commitment === 'locked') s *= 1.2

  // 7. 置信度
  s *= (0.5 + mem.confidence / 20)

  // 8. 矛盾惩罚
  if ((mem.relations?.conflicts?.length ?? 0) > 0) s *= 0.7

  return s
}
```

### 5.9 多信号检索融合（核心）

```ts
async function unifiedRecall(
  query: string,
  store: FlyupMemStore,
  tokenBudget = 4096,
  queryTimeRef?: string | null    // 可选时间引用，用于时序检索
): Promise<Memory[]> {
  const queryEmbedding = await embed(query)
  const queryCtx = buildQueryContext(query)
  const timeRef = queryTimeRef ?? extractTimeReference(query)  // 从查询文本推断
  // 四路召回：BM25 / semantic / temporal 并行，graph 依赖 BM25 seed 后执行
  const [bm25Results, semanticResults, temporalResults] = await Promise.all([
    bm25Search(query, store.allMemories(), 30),
    semanticSearch(queryEmbedding, store.allMemories(), 30),
    temporalSearch(timeRef, store.allMemories(), store.graph, 30),
  ])

  // BM25 初筛 → 图谱扩展
  const seedIds = bm25Results.slice(0, 10).map(r => r.id)
  const graphResults = graphExpansion(seedIds, store.graph, 30)

  // RRF 融合
  const fused = rrfMerge([bm25Results, semanticResults, temporalResults, graphResults])

  // ACT-R 激活度加权
  const activated = fused.map(({ id, score: rrfScore }) => {
    const mem = store.get(id)!
    const activation = computeActivation(mem)
    return {
      id,
      score: rrfScore * 0.7 + activation * 0.3
    }
  }).sort((a, b) => b.score - a.score)

  // 8 维 Local Rerank
  const reranked = activated.map(({ id, score }) => {
    const mem = store.get(id)!
    return { id, score: localRerank(score, mem, queryCtx) }
  }).sort((a, b) => b.score - a.score)

  // Token 预算裁剪
  return trimToTokenBudget(reranked, tokenBudget, store)
}
```

### 5.10 Observation 自动合并（嵌入聚类 + 证据累积）

```ts
async function consolidateUnmerged(store: FlyupMemStore, batchSize = 50): Promise<void> {
  const unmerged = store.allMemories()
    .filter(m => m.layer === 'raw' && m.status === 'active' && !m.consolidated)
    .sort((a, b) => a.temporal.learned_at.localeCompare(b.temporal.learned_at))
    .slice(0, batchSize)

  if (unmerged.length < 2) return

  const clusters = clusterByEmbedding(unmerged, 0.85)

  for (const cluster of clusters) {
    // 矛盾检测
    const polarities = new Set(cluster.filter(m => m.polarity).map(m => m.polarity))
    if (polarities.size > 1) {
      markAsEvolution(cluster)
      continue
    }

    if (cluster.length < 2) continue

    // 匹配已有 Observation → 更新 proof_count + 添加 evidence
    const existing = findMatchingObservation(cluster, store)
    let observation: Observation
    if (existing) {
      updateObservation(existing, cluster)
      observation = existing
    } else {
      observation = mergeToObservation(cluster)
      store.addObservation(observation)
    }

    for (const engram of cluster) {
      store.updateMemory(engram.id, { consolidated: true, consolidated_at: now() })
    }

    store.addEdges(observation.id, cluster.map(e => e.id), 'evidence')
  }
}
```

### 5.11 反馈信号处理

```ts
function applyFeedback(memoryId: string, signal: 'positive' | 'negative' | 'neutral', store: FlyupMemStore): void {
  const mem = store.get(memoryId)
  if (!mem) return

  store.addFeedback({
    id: generateId(),
    memory_id: memoryId,
    signal,
    context: null,
    created_at: now()
  })

  if (signal === 'positive') {
    mem.activation.storage_strength = Math.min(1.0, mem.activation.storage_strength + 0.1)
    mem.activation.retrieval_strength = Math.min(1.0, mem.activation.retrieval_strength + 0.05)
    mem.confidence = Math.min(10, mem.confidence + 1)
  } else if (signal === 'negative') {
    mem.activation.storage_strength = Math.max(0.0, mem.activation.storage_strength - 0.15)
    mem.activation.retrieval_strength = Math.max(0.0, mem.activation.retrieval_strength - 0.1)
    mem.confidence = Math.max(1, mem.confidence - 1)
  }

  const recentNegatives = store.countRecentFeedback(memoryId, 'negative', 30)
  if (recentNegatives >= 3) {
    mem.status = 'retired'
  }

  store.updateMemory(memoryId, mem)
}
```

### 5.12 Token 预算裁剪

> **注意：** token 预算使用 `tiktokenEncode`（cl100k_base）精确计算，非简单字符计数。
> 中文 1 字 ≈ 1-2 token，英文 1 词 ≈ 1 token，字符计数会严重偏差。

```ts
function trimToTokenBudget(
  scored: ScoredResult[],
  budget: number,
  store: FlyupMemStore
): Memory[] {
  const layerBudgets = {
    1: Math.floor(budget * 0.40),  // Mental Models — 40%
    2: Math.floor(budget * 0.35),  // Observations — 35%
    3: Math.floor(budget * 0.20),  // Engrams — 20%
    4: Math.floor(budget * 0.05),  // Episodes — 5%
  }

  const selected: Memory[] = []
  const usedTokens = { 1: 0, 2: 0, 3: 0, 4: 0 }

  for (const { id } of scored) {
    const mem = store.get(id)
    if (!mem) continue

    const layer = mem.layer === 'mental_model' ? 1
      : mem.layer === 'observation' ? 2
      : mem.layer === 'raw' ? 3 : 4

    const tokens = tiktokenEncode(mem.statement).length  // 精确 token 计数
    if (usedTokens[layer] + tokens <= layerBudgets[layer]) {
      selected.push(mem)
      usedTokens[layer] += tokens
    }
  }

  return selected
}
```

### 5.13 待实现函数清单

以下函数在算法中被调用，需在 Phase 1-2 中实现：

| 函数 | 用途 | 实现阶段 |
|------|------|----------|
| `tokenize(text)` | 中英文混合分词 | Phase 1 |
| `jiebaCut(text)` | 中文 jieba 分词 | Phase 1 |
| `buildDFMap(memories)` | 构建 BM25 文档频率表 | Phase 1 |
| `embed(text)` | BGE-small-zh 嵌入计算 | Phase 2 |
| `tiktokenEncode(text)` | 精确 token 计数 | Phase 1 |
| `extractTimeReference(query)` | 从查询文本推断时间引用 | Phase 2 |
| `timeRelevance(ref, timestamp)` | 时间窗口相关度计算 | Phase 2 |
| `getEntityNeighbors(id, graph)` | 图谱实体邻居查询 | Phase 2 |
| `getLinks(id, type, graph)` | 图谱边查询 | Phase 2 |
| `timeDecay(id)` | co_accessed 边时间衰减 | Phase 2 |
| `buildQueryContext(query)` | 构建查询上下文（scope/domain） | Phase 1 |
| `clusterByEmbedding(memories, threshold)` | 嵌入聚类 | Phase 3 |
| `findMatchingObservation(cluster, store)` | 匹配已有 Observation | Phase 3 |
| `markAsEvolution(cluster)` | 标记演化/冲突 | Phase 3 |
| `mergeToObservation(engrams)` | 合并 engrams 为 Observation | Phase 3 |
| `getLayerLevel(mem)` | 获取层级编号（1-4） | Phase 1 |
| `formatInjection(memories)` | 格式化注入文本 | Phase 1 |
| `isScopeExactMatch(scope, context)` | scope 精确匹配判断 | Phase 1 |
| `generateId()` | 生成唯一 ID | Phase 1 |
| `now()` | ISO 时间戳 | Phase 1 |
| `daysSince(date)` | 计算天数差 | Phase 1 |
| `daysSinceFeedback(id, signal)` | 最近一次反馈距今天数 | Phase 3 |

---

## 六、写入流程

### 6.1 会话级去重 *(Plur)*

同一次对话里学过的 statement 不重复学，防止措辞稍变就存多条：

```ts
private sessionLearned = new Map<string, string>()  // hash → statement

function extractEngrams(user: string, assistant: string): Engram[] {
  const candidates = ruleExtract(user, assistant)
  return candidates.filter(c => {
    const hash = contentHash(c.statement)
    if (this.sessionLearned.has(hash)) return false
    this.sessionLearned.set(hash, c.statement)
    return true
  })
}

// 新会话开始时清空
function onSessionStart(): void {
  this.sessionLearned.clear()
}
```

### 6.2 afterTurn 捕获

```text
turn completed
  ├─ capture episode summary
  ├─ 规则提取 candidate engrams（零成本）
  │    ├─ 用户纠正：不是/不对/应该/以后/记住/不要/用X不用Y
  │    ├─ 偏好：我喜欢/我希望/默认/尽量/别
  │    ├─ 决策：就这样/定了/以后都/统一
  │    ├─ 工具经验：这个命令失败/这个参数才对
  │    └─ 架构约定：放在/命名/入口/注册
  ├─ content_hash 去重
  │    ├─ 精确重复 → 跳过，更新 frequency
  │    └─ 高相似 + 同 scope → UPDATE/MERGE
  ├─ 嵌入计算（BGE-small，本地）
  ├─ 写入 YAML（原子写入）
  └─ 更新 graph.yaml（实体 + 关联边）
```

### 6.3 候选 → Active 条件

满足以下任一条件，candidate 转 active：

- 用户显式说"记住"
- 同一模式出现 ≥2 次
- Assistant 执行中验证过
- 用户正反馈

### 6.4 去重动作

| 动作 | 条件 | 行为 |
|------|------|------|
| **ADD** | 全新内容 | 创建新 engram |
| **UPDATE** | 同 facet 已有，新证据更强 | 替换旧状态，保留历史 |
| **MERGE** | 多个相近记忆 | 合并为更清晰的单条 |
| **CONFLICT** | polarity 冲突 | 保留两者，标记冲突，等反馈 |
| **NOOP** | content_hash 精确重复 | 跳过，更新 frequency |

**三层判断：**
1. `content_hash` 精确匹配 → NOOP
2. embedding 相似度 > 0.85 + scope/domain/type 一致 → UPDATE/MERGE
3. polarity 冲突 + locked/decided → 不自动覆盖，标记 CONFLICT
4. polarity 冲突 + exploring/leaning → 允许 UPDATE，保留 history

---

## 七、衰减机制

### 7.1 分层 ACT-R + scope 免疫 *(v3)*

```ts
function decayStrength(mem: Memory, currentContext: Context): number {
  const days = daysSince(mem.activation.last_accessed)
  const lam = DECAY_RATES[getLayerLevel(mem)]
  const ew = mem.emotional_weight ?? 5
  const effectiveLam = lam * (1 - ew / 20)

  // 锁定项免疫
  if (mem.commitment === 'locked') return mem.activation.retrieval_strength

  // scope 精确匹配免疫 *(v3)*
  if (isScopeExactMatch(mem.scope, currentContext)) {
    return mem.activation.retrieval_strength
  }

  return FLOOR + (mem.activation.retrieval_strength - FLOOR) * Math.exp(-effectiveLam * days)
}
```

### 7.2 Confidence Decay *(v3)*

```ts
// 90 天无正反馈 + 非 locked → confidence 衰减
// confidence 统一为 1-10 整数
function decayConfidence(mem: Memory): void {
  if (mem.commitment === 'locked') return

  const daysSincePositive = daysSinceFeedback(mem.id, 'positive')
  if (daysSincePositive <= 90) return

  const monthsAfterGrace = (daysSincePositive - 90) / 30
  // 每月衰减 0.5 点，下限 1
  mem.confidence = Math.max(1, Math.round(mem.confidence - 0.5 * monthsAfterGrace))
}
```

---

## 八、整合引擎

### 8.1 整合调度 *(v3)*

```
Light:   每轮 — Engram 去重 + facet 归类（在 afterTurn 中执行，<50ms）
Deep:    每 6 小时 — Observation → Mental Model（后台定时任务）
REM:     每天 3am — 全量衰减扫描 + 图重建 + 缓存刷新 + 归档旧记忆
```

**注意：** afterTurn 只执行 Light 级（去重 + 晋升），不跑 consolidateUnmerged。
整合聚类是 CPU 密集操作，放到 REM 调度，避免拖慢对话响应。

### 8.2 Raw → Observation

```
group raw engrams by scope/domain/entities/facet
  ├─ same facet + consistent → create/update observation
  ├─ same facet + newer state → update observation, preserve history
  ├─ contradiction → mark conflict, lower confidence
  └─ low-value ephemeral → keep as episode only, 不升格
```

**设计规则：**
- 一个 observation 只追踪一个 facet
- 同 facet 更新，不创建重复 observation
- 状态变化保留历史
- 不做未证实推理
- 必须有 source_ids / evidence quotes

### 8.3 Observation → Mental Model

```
cluster observations by domain + entity + semantic similarity
  ├─ enough proof_count
  ├─ low conflict rate
  ├─ stable/strengthening trend
  └─ create/update mental model (受数量上限约束)
```

### 8.4 可选 LLM 增强 *(v3)*

```yaml
llm_enhancement:
  enabled: false
  provider: "local"
  tasks:
    entity_extraction:
    causal_relation:
    mental_model_rewrite:
    conflict_resolution:
    reflect:
```

### 8.5 错误处理与降级

```ts
// YAML 写入损坏 → 从备份恢复
async function safeWriteYAML(data: any, filePath: string): Promise<void> {
  const backupPath = filePath + '.bak'
  try {
    await fs.copyFile(filePath, backupPath)  // 写前备份
    await atomicWrite(data, filePath)
  } catch (err) {
    await fs.rename(backupPath, filePath)    // 回滚到备份
    logger.error('YAML write failed, rolled back', err)
  }
}

// 嵌入模型加载失败 → 降级到纯 BM25
async function getEmbedder(): Promise<Embedder | null> {
  try {
    return await loadBGEsmallZh()
  } catch (err) {
    logger.warn('Embedding model unavailable, falling back to BM25-only')
    return null  // semanticSearch 会跳过，只剩 BM25 + graph + temporal
  }
}

// SQLite 缓存损坏 → 删除重建
async function rebuildSQLite(store: FlyupMemStore): Promise<void> {
  try {
    await store.rebuildIndexesIfNeeded()
  } catch (err) {
    logger.warn('SQLite corrupt, deleting and rebuilding')
    await fs.unlink(store.sqlitePath)
    await store.rebuildIndexes()
  }
}

// 全局 try/catch 包裹 afterTurn，防止记忆系统崩溃影响对话
async function safeAfterTurn(user: string, assistant: string, ctx: TurnContext): Promise<void> {
  try {
    await onAfterTurn(user, assistant, ctx)
  } catch (err) {
    logger.error('FlyupMem afterTurn failed (non-fatal)', err)
    // 不抛出，对话正常继续
  }
}
```

---

## 九、检索注入流程

```text
用户消息
  ↓
queuePrefetch(query) ← 后台 daemon thread 异步
  ↓
五信号检索融合（semantic + BM25 + graph + temporal + activation）
  ↓
RRF 融合 + ACT-R 激活度加权（0.7 × RRF + 0.3 × activation）
  ↓
8 维 Local Rerank（scope/layer/recency/proof/feedback/lock/confidence/conflict）
  ↓
Token 预算裁剪（按层级分配，不是 top-K）
  ↓
3 层渐进式注入
  ↓
<flyupmem-context>
  ### Directives (must follow)
  [MM-USER-STYLE-001] 主人偏好高密度、低废话的执行型助手...

  ### Constraints
  [OB-20260430-003] 用户用 Clash Verge 代理，端口 7897...

  ### Consider
  [ENG-20260429-012] Hindsight 需要 Docker，Intel Mac 不兼容...
</flyupmem-context>
  ↓
LLM 推理
```

---

## 十、跨 Agent 共享架构

### 10.1 架构概览

```
~/.flyupmem/              ← 共享存储，单一事实源
  ├── engrams.yaml
  ├── observations.yaml
  ├── ...
  └── index.sqlite

OpenClaw 插件 ──────────→ 读写 ~/.flyupmem/
Hermes MemoryProvider ───→ 读写 ~/.flyupmem/
MCP Server ─────────────→ 读写 ~/.flyupmem/
Claude Code / Cursor ───→ 通过 MCP 访问
```

**关键设计：**
- 存储层独立，不绑定任何 Agent 框架
- 文件锁机制防并发写入冲突（YAML 原子写 + lockfile）
- 每个 Agent 写入时记录 `source.agent` 标识来源

### 10.2 OpenClaw 插件集成

```ts
async function onAssemble(query: string, ctx: AssembleContext): Promise<string> {
  const cached = prefetchCache.get()
  if (cached) return formatInjection(cached)
  return ''
}

async function onAfterTurn(user: string, assistant: string, ctx: TurnContext): Promise<void> {
  runInBackground(async () => {
    const engrams = extractEngramsFromTurn(user, assistant)
    for (const e of engrams) await store.learn(e)
    await store.captureEpisode(user, assistant)
    // 只做 Light 级：去重 + 晋升（<50ms）
    // batchDecay 和 consolidateUnmerged 移到 REM 调度
  })
}

async function onCompact(messages: Message[]): Promise<void> {
  const engrams = extractEngramsFromSession(messages)
  for (const e of engrams) await store.learn(e)
  await store.captureEpisodeSummary(messages)
}

async function onStartup(): Promise<void> {
  // 首次启动：创建目录 + 空 YAML 文件 + 默认配置
  if (!existsSync('~/.flyupmem/')) {
    await initFreshStore()  // 创建目录结构 + 空文件 + config.yaml defaults
  }

  // Schema 迁移：检测版本号，按版本逐步升级
  const version = await detectSchemaVersion()
  if (version < CURRENT_SCHEMA_VERSION) {
    await migrateSchema(version, CURRENT_SCHEMA_VERSION)
  }

  await store.loadYAML()
  await store.rebuildIndexesIfNeeded()
  await store.healthCheck()
}

async function onScheduled(): Promise<void> {
  // REM 级：重操作全在这里
  await store.batchDecay()
  await store.consolidateUnmerged()
  await store.rebuildIndexesIfNeeded()
  await store.archiveOldMemories()  // 归档 retired/dormant 到 engrams-archive.yaml
}
```

### 10.3 Hermes MemoryProvider 集成 *(v3，Python Adapter)*

Hermes 的 MemoryProvider 插件运行在 Python 侧；FlyupMem 核心仍保持 TypeScript。Hermes Provider 作为薄适配层，通过本地 CLI/MCP 调用 TS core，共享同一个 `~/.flyupmem/`。

```python
class FlyupMemProvider(MemoryProvider):
    @property
    def name(self):
        return "flyupmem"

    def is_available(self) -> bool:
        return shutil.which("flyupmem") is not None or self._mcp_available()

    def initialize(self, session_id: str, **kwargs):
        self.home = Path(kwargs.get("hermes_home", "~/.hermes")).expanduser()
        self.store_path = Path("~/.flyupmem").expanduser()
        self.prefetch_cache = None

    def get_tool_schemas(self):
        return [
            schema_for("flyup_learn"),
            schema_for("flyup_recall"),
            schema_for("flyup_feedback"),
            schema_for("flyup_forget"),
            schema_for("flyup_timeline"),
            schema_for("flyup_status"),
        ]

    def prefetch(self, query: str) -> str:
        return format_injection(self.prefetch_cache) if self.prefetch_cache else ""

    def queue_prefetch(self, query: str) -> None:
        run_in_background(lambda: setattr(
            self,
            "prefetch_cache",
            flyup_cli("recall", {"query": query, "token_budget": 2048})
        ))

    def sync_turn(self, user: str, assistant: str) -> None:
        # 只做 Light 级，重操作移到 REM 调度
        run_in_background(lambda: flyup_cli("sync-turn", {
            "user": user,
            "assistant": assistant,
            "origin": "hermes"
        }))
```

### 10.4 MCP Server

```ts
// 薄封装层，让 Claude Code / Cursor / 任意 MCP 客户端访问 FlyupMem
const server = new McpServer({ name: 'flyupmem', version: '1.0.0' })

server.tool('flyup_learn', 'Store a new memory', learnSchema, async (args) => {
  return store.learn(args)
})

server.tool('flyup_recall', 'Search memories', recallSchema, async (args) => {
  return store.unifiedRecall(args.query, args.token_budget ?? 4096)
})

server.tool('flyup_feedback', 'Rate a memory', feedbackSchema, async (args) => {
  return store.applyFeedback(args.memory_id, args.signal)
})

server.tool('flyup_forget', 'Delete/retire a memory', forgetSchema, async (args) => {
  return store.forget(args.memory_id, args.reason)
})

server.tool('flyup_timeline', 'List memories by time range', timelineSchema, async (args) => {
  return store.timeline(args.from, args.to, args.scope)
})

server.tool('flyup_status', 'Memory system status', {}, async () => {
  return store.healthCheck()
})
```

### 10.5 Scope 映射

```ts
const SCOPE_MAP = {
  'agent:main:direct': 'global + agent:main',
  'project:workspace': 'project:<repo-name>',
  'channel:feishu': 'channel:feishu',
  'channel:slack': 'channel:slack',
  'subagent:*': 'inherit:parent + subagent:<id>',
}
```

### 10.6 可见性与隐私

- `private` 默认给当前用户的所有本地 Agent（Hermes/OpenClaw/MCP），但不跨用户/不导出
- `agent_private` 仅给指定 agent（如 `agent:hermes`），不跨 Agent 注入
- channel scoped memory 不跨频道注入
- group chat 不注入私人 MEMORY
- evidence quote 保留来源，不外泄到不匹配 scope
- subagent 记忆不回流父 agent（除非显式 export）
- locked 记忆永不自动删除
- 多 Agent 并发写入时，文件锁保证原子性，不会出现半写数据

### 10.7 Store 自动发现 *(Plur)*

从当前工作目录往上走到 git root，找到 `.flyupmem/engrams.yaml` 就自动注册为 project store。在 `~/projects/myapp/` 下工作时，项目级记忆自动可见，不用手动配置。

```ts
function autoDiscoverStores(cwd: string): StoreConfig | null {
  let dir = cwd
  const root = path.parse(dir).root
  while (dir !== root) {
    const storePath = path.join(dir, '.flyupmem', 'engrams.yaml')
    if (existsSync(storePath)) {
      const projectName = path.basename(dir)
      return { path: storePath, scope: `project:${projectName}`, shared: false, readonly: false }
    }
    dir = path.dirname(dir)
  }
  return null
}
```

在 `config.yaml` 中也可手动注册额外 store：

```yaml
stores:
  - path: /shared/team-knowledge/
    scope: team:backend
    shared: true
    readonly: false
  - path: /project/myapp/.flyupmem/
    scope: project:myapp
    shared: false
    readonly: true
```

---

## 十一、增强模式（可选 LLM）

### 11.1 LLM 增强提取

```ts
async function extractEngramsLLM(userMsg: string, assistantMsg: string, llm: LLMClient): Promise<Engram[]> {
  const prompt = `Extract structured knowledge from this conversation:
User: ${userMsg}
Assistant: ${assistantMsg}

Return JSON: {
  "facts": [{"statement": "...", "entities": [...], "type": "...", "temporal": "..."}],
  "causal_relations": [{"from": "...", "to": "...", "type": "causes|enables|prevents"}]
}`
  return llm.chat(prompt)
}
```

### 11.2 Reflect 精简版

```ts
async function reflect(store: FlyupMemStore, query: string, llm: LLMClient): Promise<MentalModel> {
  const results = await unifiedRecall(query, store, 8192)

  const prompt = `Given these memories, synthesize a Mental Model:
${formatMemories(results)}

Query: ${query}

Return a concise, actionable mental model statement.`

  const mentalModel = await llm.chat(prompt)
  await store.learn(mentalModel, level: 1)
  return mentalModel
}
```

---

## 十二、依赖清单

### 必需依赖（npm 安装）
- `better-sqlite3` — SQLite FTS5（需 node-gyp 编译环境，备选 `sql.js` 纯 WASM）
- `js-yaml` — YAML 解析
- `crypto` — 内置，content_hash
- `@node-rs/jieba` — 中文分词（Rust 实现，零配置）

- `tiktoken` — 精确 token 计数（cl100k_base）

### 推荐（本地嵌入）
- `@xenova/transformers` — BGE-small-zh-v1.5 ONNX 推理（中文优化）
- 或 `onnxruntime-node` — 直接加载 ONNX 模型

### 可选（增强模式）
- OpenAI / 任意 LLM API — 提取增强 + Reflect

### 回退策略
- 嵌入模型不可用 → 纯 BM25 检索（降级但可用）
- SQLite 不可用 → 纯内存计算（慢但可用）

---

## 十三、性能预估

| 操作 | 延迟 | 成本 |
|------|------|------|
| learn（写入） | <50ms | 零 |
| recall（5 信号融合 + rerank） | <300ms（1K 记忆） | 零 |
| batchDecay（100 条） | <100ms | 零 |
| consolidate（50 条聚类） | <500ms | 零 |
| 嵌入计算（单条） | <50ms（BGE-small） | 零 |
| Reflect（需 LLM） | 2-5s | ~$0.01 |

1K 记忆时，整个 prefetch→inject 链路 < 300ms。

**测量条件：** Apple M4 Studio, 64GB RAM, Node.js 20 LTS, BGE-small-zh ONNX (CPU)。
recall 含 BM25 + 语义 + 图谱 + 时序 + activation 加权 + 8 维 rerank 全链路。
不含网络延迟（纯本地）。10K 记忆时 recall 预计 ~800ms，需启用 SQLite 索引优化。

---

## 十四、实现路线图

### Phase 1 — MVP（1-2 周）
- [ ] YAML schema 定义 + 原子读写 + 文件锁
- [ ] Schema 版本号 + 迁移框架
- [ ] 首次启动初始化（`initFreshStore`）
- [ ] Engram 学习/候选晋升/检索/退休
- [ ] 中文分词（jieba）+ BM25 检索
- [ ] tiktoken 精确 token 计数
- [ ] BM25 检索 + RRF 融合
- [ ] ACT-R 分层衰减 + scope 免疫
- [ ] OpenClaw 插件基础（assemble/afterTurn）
- [ ] `flyup_learn` / `flyup_recall` / `flyup_status` 工具
- [ ] 渐进式注入（先做 constraints 单层）
- [ ] 基础错误处理（YAML 备份回滚、afterTurn try/catch）
- [ ] 单元测试框架（Vitest）+ 衰减/检索核心测试

### Phase 2 — 深度检索（1-2 周）
- [ ] BGE-small-zh 嵌入 + 语义检索
- [ ] 图谱扩展检索（entity + semantic + causal + co_accessed）
- [ ] 时序检索 + BFS 扩散
- [ ] RRF 多路融合 + ACT-R 激活度加权
- [ ] 8 维 Local Rerank
- [ ] Token 预算裁剪 + 3 层注入
- [ ] SQLite FTS5 缓存

### Phase 3 — 跨平台 + 自动维护（1 周）
- [ ] Hermes MemoryProvider 接口
- [ ] MCP Server
- [ ] Observation 自动合并（嵌入聚类 + 证据累积）
- [ ] 矛盾检测 + 演化标记
- [ ] 反馈信号处理 + 自动退休
- [ ] Confidence 90 天衰减
- [ ] 整合调度（Light / Deep / REM）
- [ ] graph.yaml 自动维护

### Phase 4 — 增强模式（可选）
- [ ] LLM 增强提取
- [ ] Reflect 精简版
- [ ] Knowledge Pack 导出/导入
- [x] Git sync（跨机记忆同步）— MVP: init/status/push/pull/sync，YAML 为源，SQLite 为可重建派生缓存

### Phase 5 — 生产化 *(v3)*
- [ ] doctor / setup / status 命令
- [ ] memory inspect UI
- [ ] 配置面板
- [x] memory review/prune CLI — 本地记忆质量维护，dry-run 默认，安全退休 dogfood/test marker
- [ ] 性能监控 + 指标

---

## 十五、与现有方案对比

| 特性 | Hermes 默认 | PLUR | Hindsight | **FlyupMem** |
|------|------------|------|-----------|-------------|
| 存储 | MEMORY.md | YAML | PostgreSQL | **YAML + SQLite 缓存** |
| 容量 | 2.2KB | 无限* | 无限 | **无限*（5K+ 归档，10K+ 需 SQLite 索引）** |
| 检索 | 全文注入 | BM25+BGE | 4路+LLM | **5路+ACT-R+8维rerank** |
| 衰减 | 无 | ACT-R | 动态权重 | **分层 ACT-R + scope 免疫** |
| 合并 | 无 | 基础 | LLM 驱动 | **嵌入聚类 + 证据累积** |
| 图谱 | 无 | 轻量 | 完整 | **中等 (entity+causal+co_accessed)** |
| 跨 Agent | ❌ | ✅ MCP | ❌ bank 隔离 | **✅ OpenClaw + Hermes + MCP** |
| 成本 | 零 | 零 | 高 | **零（基础）** |
| 部署 | 内置 | npm | Docker | **npm** |
| 证据约束 | 无 | 基础 | 强 | **强** |
| 可编辑性 | 强 | 强 | 弱 | **强（YAML）** |

---

## 十六、关键设计决策

1. **YAML-first** — 个人 Agent 记忆的可操控性是核心竞争力，SQLite 是派生缓存
2. **多路召回 + ACT-R 加权 + 8 维 rerank** — 融合阶段参与 + 排序后精修，双保险
3. **分层衰减 + emotional_weight + scope 免疫** — 三重衰减控制
4. **候选晋升生命周期** — candidate → active 需满足条件，防止噪声记忆污染
5. **嵌入聚类 + 证据累积合并** — 零 LLM 成本，已有 observation 则更新而非重建
6. **显式反馈表 + 自动退休** — 完整的反馈闭环
7. **整合调度 3 级** — Light/Deep/REM 分工明确
8. **MM 数量上限** — 防止心智模型无限膨胀
9. **daemon thread 异步** — 不阻塞对话
10. **Token 预算按层级分配** — 可控的上下文占用
11. **跨 Agent 共享** — 共享文件系统 + MCP + 双插件，OpenClaw / Hermes / 任意 MCP 客户端统一访问
12. **保守整合** — 宁愿少合成，也不要编造
13. **会话级去重** — 同一对话内学过的不重复学，防噪声 *(Plur)*
14. **Store 自动发现** — 从 CWD 往上找 `.flyupmem/`，项目级记忆自动可见 *(Plur)*
