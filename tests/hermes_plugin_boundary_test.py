import importlib.util
import sys
import time
import types
import unittest
from pathlib import Path


class MemoryProvider:
    pass


agent_module = types.ModuleType("agent")
memory_provider_module = types.ModuleType("agent.memory_provider")
memory_provider_module.MemoryProvider = MemoryProvider
sys.modules.setdefault("agent", agent_module)
sys.modules.setdefault("agent.memory_provider", memory_provider_module)

plugin_path = Path(__file__).resolve().parents[1] / "hermes-plugin" / "__init__.py"
spec = importlib.util.spec_from_file_location("flyupmem_hermes_plugin", plugin_path)
plugin = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(plugin)


MEMORY_CONTEXT_ONLY = """继续

<memory-context>
[System note: The following is recalled memory context, NOT new user input.]

<flyupmem-context>
### Consider
[ENG-20260501-001] 记住：FlyupMem dogfood marker 是 hermes-adapter-smoke-20260501。
</flyupmem-context>
</memory-context>"""

EXPLICIT_WITH_CONTEXT = """记住：主人偏好直接给结论。

<memory-context>
<flyupmem-context>
[ENG-20260501-001] 记住：FlyupMem dogfood marker 是 hermes-adapter-smoke-20260501。
</flyupmem-context>
</memory-context>"""

REPLY_CONTEXT_ONLY = """[Replying to: \"主人，我建议下一步不要急着堆 Phase 5 功能，先做 A：真实 Hermes dogfood + 修集成问题。

原因很直接：

FlyupMem 现在已经有：
- 核心存储 ✅
- 多路检索 ✅
- SQLite/向量缓存 ✅
- CLI 工具 ✅
- Hermes 插件 ✅
- MCP/OpenClaw 雏形 ✅
- 测试和基准 ✅

但它还缺一个最关键验证：\"]
继续"""

EXPLICIT_WITH_REPLY_CONTEXT = """[Replying to: \"主人，我建议下一步不要急着堆 Phase 5 功能，先做 A：真实 Hermes dogfood + 修集成问题。\"]
记住：主人偏好先 dogfood 再做新功能。"""


class RecordingProvider(plugin.FlyupMemProvider):
    def __init__(self):
        self.calls = []
        self._turn_count = 0
        self._store_path = "/tmp/flyupmem-test"

    def _run_cli(self, *args):
        self.calls.append(args)
        return "{}"


class HermesPluginBoundaryTest(unittest.TestCase):
    def test_on_pre_compress_ignores_recalled_memory_context(self):
        provider = RecordingProvider()

        result = provider.on_pre_compress([
            {"role": "user", "content": MEMORY_CONTEXT_ONLY},
        ])

        self.assertEqual(result, "")

    def test_on_pre_compress_keeps_explicit_user_memory_without_context_tail(self):
        provider = RecordingProvider()

        result = provider.on_pre_compress([
            {"role": "user", "content": EXPLICIT_WITH_CONTEXT},
        ])

        self.assertIn("记住：主人偏好直接给结论。", result)
        self.assertNotIn("dogfood marker", result)
        self.assertNotIn("memory-context", result)

    def test_sync_turn_does_not_learn_context_only_user_content(self):
        provider = RecordingProvider()

        provider.sync_turn(MEMORY_CONTEXT_ONLY, "好的")
        time.sleep(0.2)

        self.assertEqual(provider.calls, [])

    def test_sync_turn_sanitizes_user_content_before_learning(self):
        provider = RecordingProvider()

        provider.sync_turn(EXPLICIT_WITH_CONTEXT, "好的")
        time.sleep(0.2)

        self.assertEqual(len(provider.calls), 1)
        self.assertEqual(provider.calls[0][0], "learn")
        self.assertIn("记住：主人偏好直接给结论。", provider.calls[0][1])
        self.assertNotIn("dogfood marker", provider.calls[0][1])

    def test_sync_turn_does_not_learn_telegram_reply_preview_only(self):
        provider = RecordingProvider()

        provider.sync_turn(REPLY_CONTEXT_ONLY, "继续")
        time.sleep(0.2)

        self.assertEqual(provider.calls, [])

    def test_sync_turn_strips_telegram_reply_preview_before_learning(self):
        provider = RecordingProvider()

        provider.sync_turn(EXPLICIT_WITH_REPLY_CONTEXT, "好的")
        time.sleep(0.2)

        self.assertEqual(len(provider.calls), 1)
        self.assertEqual(provider.calls[0][0], "learn")
        self.assertIn("记住：主人偏好先 dogfood 再做新功能。", provider.calls[0][1])
        self.assertNotIn("Phase 5", provider.calls[0][1])
        self.assertNotIn("Replying to", provider.calls[0][1])

    def test_flyup_recall_schema_exposes_explain_flag(self):
        provider = RecordingProvider()

        recall_schema = next(schema for schema in provider.get_tool_schemas() if schema["name"] == "flyup_recall")

        self.assertIn("explain", recall_schema["parameters"]["properties"])
        self.assertEqual(recall_schema["parameters"]["properties"]["explain"]["type"], "boolean")

    def test_flyup_recall_explain_invokes_cli_flag(self):
        provider = RecordingProvider()

        provider.handle_tool_call("flyup_recall", {"query": "marker", "explain": True})

        self.assertEqual(provider.calls[0], ("recall", "marker", "--explain"))


if __name__ == "__main__":
    unittest.main()
