// openclaw-plugin/index.js — OpenClaw plugin entry for FlyupMem
// Linked into OpenClaw with: openclaw plugins install --link ./openclaw-plugin

import { Type } from 'typebox';
import { FlyupMemStore } from '../dist/core/store.js';
import { flyupLearn } from '../dist/tools/flyup_learn.js';
import { flyupRecall } from '../dist/tools/flyup_recall.js';
import { flyupFeedback } from '../dist/tools/flyup_feedback.js';
import { flyupMaintain } from '../dist/tools/flyup_maintain.js';
import { flyupInspect } from '../dist/tools/flyup_inspect.js';
import { flyupStatus } from '../dist/tools/flyup_status.js';
import { initEmbedder } from '../dist/search/embed.js';
import { maintainGraph } from '../dist/lifecycle/graph-maintain.js';

let store = null;
let lastPromptByRunId = new Map();

const pluginConfig = {
  autoLearn: true,
  autoRecall: true,
  autoDecay: true,
  tokenBudget: 2048,
  embeddingEnabled: true,
  storePath: null,
  origin: 'openclaw:main',
};

function getStore() {
  if (!store) {
    store = new FlyupMemStore(pluginConfig.storePath ? { store_path: pluginConfig.storePath } : {});
    store.load();
  }
  return store;
}

function jsonResult(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], details: payload };
}

function textFromMessage(message) {
  if (!message) return '';
  if (typeof message === 'string') return message;
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) return message.content.map(part => {
    if (typeof part === 'string') return part;
    if (part && typeof part.text === 'string') return part.text;
    return '';
  }).join('\n');
  return '';
}

function mergeConfig(api) {
  const cfg = api.pluginConfig ?? api.resolveConfig?.() ?? {};
  if (typeof cfg.autoLearn === 'boolean') pluginConfig.autoLearn = cfg.autoLearn;
  if (typeof cfg.autoRecall === 'boolean') pluginConfig.autoRecall = cfg.autoRecall;
  if (typeof cfg.autoDecay === 'boolean') pluginConfig.autoDecay = cfg.autoDecay;
  if (typeof cfg.tokenBudget === 'number') pluginConfig.tokenBudget = cfg.tokenBudget;
  if (typeof cfg.embeddingEnabled === 'boolean') pluginConfig.embeddingEnabled = cfg.embeddingEnabled;
  if (typeof cfg.storePath === 'string' && cfg.storePath.trim()) pluginConfig.storePath = cfg.storePath.trim();
}

const plugin = {
  id: 'flyupmem',
  name: 'FlyupMem',
  description: 'Local-first, zero-cost memory system with four-layer hierarchy and multi-path recall.',
  configSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      autoLearn: { type: 'boolean' },
      autoRecall: { type: 'boolean' },
      autoDecay: { type: 'boolean' },
      tokenBudget: { type: 'integer', minimum: 256, maximum: 8192 },
      embeddingEnabled: { type: 'boolean' },
      storePath: { type: 'string' },
    },
  },

  register(api) {
    const logger = api.logger ?? console;
    mergeConfig(api);

    // --- Lifecycle hooks ---

    api.on('gateway_start', async () => {
      try {
        const s = getStore();
        logger.info?.('[FlyupMem] Store loaded', { engrams: s.engrams.length, observations: s.observations.length });
        if (pluginConfig.embeddingEnabled) {
          void initEmbedder({ timeoutMs: 3000 }).catch(() => logger.warn?.('[FlyupMem] Embedding warmup failed'));
        }
        if (pluginConfig.autoDecay) {
          try { await flyupMaintain(s, { mode: 'light' }); }
          catch (err) { logger.warn?.('[FlyupMem] Startup maintenance failed', { error: err?.message }); }
        }
      } catch (err) {
        logger.error?.('[FlyupMem] Startup failed', { error: err?.message });
      }
    }, { priority: 10 });

    api.on('gateway_stop', () => {
      try {
        if (store) {
          store.save();
          logger.info?.('[FlyupMem] Store saved on shutdown');
        }
      } catch (err) {
        logger.warn?.('[FlyupMem] Shutdown save failed', { error: err?.message });
      }
      store = null;
      lastPromptByRunId.clear();
    }, { priority: 10 });

    // --- Agent turn hooks ---

    api.on('before_prompt_build', async (event) => {
      if (!pluginConfig.autoRecall) return;
      try {
        const prompt = typeof event?.prompt === 'string' ? event.prompt : '';
        if (!prompt.trim()) return;
        const s = getStore();
        const result = await flyupRecall(prompt, s, pluginConfig.tokenBudget);
        const injection = result?.injection?.trim();
        if (!injection) return;
        return { appendContext: `\n\n## FlyupMem Recall\n${injection}` };
      } catch (err) {
        logger.warn?.('[FlyupMem] Recall hook failed', { error: err?.message });
      }
    }, { priority: 5 });

    // --- Conversation observation hooks (require allowConversationAccess) ---

    api.on('llm_input', async (event) => {
      if (!pluginConfig.autoLearn) return;
      if (event?.runId && typeof event.prompt === 'string') lastPromptByRunId.set(event.runId, event.prompt);
    }, { priority: 5 });

    api.on('llm_output', async (event) => {
      if (!pluginConfig.autoLearn) return;
      try {
        const userMsg = event?.runId ? (lastPromptByRunId.get(event.runId) ?? '') : '';
        const assistantMsg = Array.isArray(event?.assistantTexts) ? event.assistantTexts.join('\n') : '';
        if (!userMsg.trim() || !assistantMsg.trim()) return;
        const s = getStore();
        const learnResult = flyupLearn(userMsg, assistantMsg, s, pluginConfig.origin);
        s.captureEpisodeSummary(userMsg, assistantMsg, learnResult.engramIds, {
          agent: pluginConfig.origin,
          channel: 'openclaw',
          scope: 'global',
          kind: 'turn',
          tags: learnResult.stored > 0 ? ['learned'] : [],
        });
        for (const eng of s.engrams.slice(-5)) {
          try { maintainGraph(eng, s); } catch {}
        }
        s.save();
      } catch (err) {
        logger.warn?.('[FlyupMem] Learn hook failed', { error: err?.message });
      } finally {
        if (event?.runId) lastPromptByRunId.delete(event.runId);
      }
    }, { priority: 5 });

    // --- Compaction hook ---

    api.on('before_compaction', async (event) => {
      try {
        const messages = Array.isArray(event?.messages) ? event.messages : [];
        if (!messages.length) return;
        const s = getStore();
        for (let i = 0; i < messages.length - 1; i++) {
          const user = messages[i];
          const assistant = messages[i + 1];
          if (user?.role === 'user' && assistant?.role === 'assistant') {
            const userText = textFromMessage(user);
            const assistantText = textFromMessage(assistant);
            if (userText && assistantText) flyupLearn(userText, assistantText, s, pluginConfig.origin);
          }
        }
        const summaryText = messages.slice(-8).map(m => `${m?.role ?? 'unknown'}: ${textFromMessage(m).replace(/\s+/g, ' ').slice(0, 120)}`).join('\n');
        s.captureEpisodeSummary(summaryText, '', [], {
          agent: pluginConfig.origin,
          channel: 'compact',
          scope: 'global',
          kind: 'summary',
          tags: ['compact', 'summary'],
        });
        s.save();
      } catch (err) {
        logger.warn?.('[FlyupMem] Compaction hook failed', { error: err?.message });
      }
    }, { priority: 5 });

    // --- Tools ---

    api.registerTool({
      name: 'flyup_learn',
      label: 'FlyupMem Learn',
      description: 'Store a fact, observation, or lesson in FlyupMem persistent memory.',
      parameters: Type.Object({
        message: Type.String({ description: 'The user message or memory text.' }),
        response: Type.Optional(Type.String({ description: 'Assistant response or context.' })),
        origin: Type.Optional(Type.String({ description: 'Source identifier.' })),
      }),
      async execute(_toolCallId, params) {
        const s = getStore();
        const result = flyupLearn(params.message, params.response ?? '', s, params.origin ?? pluginConfig.origin);
        s.save();
        return jsonResult(result);
      },
    }, { name: 'flyup_learn' });

    api.registerTool({
      name: 'flyup_recall',
      label: 'FlyupMem Recall',
      description: 'Search FlyupMem persistent memories.',
      parameters: Type.Object({
        query: Type.String({ description: 'Search query.' }),
        tokenBudget: Type.Optional(Type.Number({ description: 'Injection token budget.' })),
        explain: Type.Optional(Type.Boolean({ description: 'Return diagnostics if available.' })),
      }),
      async execute(_toolCallId, params) {
        const s = getStore();
        const result = await flyupRecall(params.query, s, params.tokenBudget ?? pluginConfig.tokenBudget);
        return jsonResult({ injection: result.injection, memories: result.memories?.length ?? 0, explain: params.explain ? result.explain : undefined });
      },
    }, { name: 'flyup_recall' });

    api.registerTool({
      name: 'flyup_feedback',
      label: 'FlyupMem Feedback',
      description: 'Give feedback on a FlyupMem memory.',
      parameters: Type.Object({
        memoryId: Type.String({ description: 'Memory ID.' }),
        signal: Type.Union([Type.Literal('positive'), Type.Literal('negative'), Type.Literal('neutral')]),
        context: Type.Optional(Type.String({ description: 'Feedback context.' })),
      }),
      execute(_toolCallId, params) {
        return jsonResult(flyupFeedback(params.memoryId, params.signal, getStore(), params.context));
      },
    }, { name: 'flyup_feedback' });

    api.registerTool({
      name: 'flyup_status',
      label: 'FlyupMem Status',
      description: 'Get FlyupMem store statistics and health status.',
      parameters: Type.Object({}),
      execute() { return jsonResult(flyupStatus(getStore())); },
    }, { name: 'flyup_status' });

    api.registerTool({
      name: 'flyup_inspect',
      label: 'FlyupMem Inspect',
      description: 'Inspect a memory by ID.',
      parameters: Type.Object({ id: Type.String({ description: 'Memory ID.' }) }),
      execute(_toolCallId, params) { return jsonResult(flyupInspect(params.id, getStore())); },
    }, { name: 'flyup_inspect' });

    api.registerTool({
      name: 'flyup_maintain',
      label: 'FlyupMem Maintain',
      description: 'Run FlyupMem maintenance.',
      parameters: Type.Object({ mode: Type.Optional(Type.Union([Type.Literal('light'), Type.Literal('deep'), Type.Literal('rem')])) }),
      async execute(_toolCallId, params) { return jsonResult(await flyupMaintain(getStore(), { mode: params.mode ?? 'light' })); },
    }, { name: 'flyup_maintain' });

    api.registerTool({
      name: 'flyup_reflect',
      label: 'FlyupMem Reflect',
      description: 'Synthesize Mental Models from observations. Requires LLM config.',
      parameters: Type.Object({ query: Type.String({ description: 'Reflection topic.' }) }),
      async execute(_toolCallId, params) {
        const { flyupReflect } = await import('../dist/tools/flyup_reflect.js');
        return jsonResult(await flyupReflect(params.query, getStore()));
      },
    }, { name: 'flyup_reflect' });

    logger.info?.('[FlyupMem] Plugin registered', { autoLearn: pluginConfig.autoLearn, autoRecall: pluginConfig.autoRecall, tools: 7, hooks: 6 });
  },
};

export default plugin;
