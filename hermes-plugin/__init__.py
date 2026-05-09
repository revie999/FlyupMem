"""FlyupMem memory plugin — Hermes MemoryProvider interface.

Local-first, zero-cost memory with YAML storage, multi-signal retrieval,
ACT-R decay, and automatic maintenance.

Uses the FlyupMem CLI (`flyupmem`) via subprocess for all operations.
Shares the same `~/.flyupmem/` storage as the MCP server and OpenClaw plugin.

Config priority:
  1. Environment variables: FLYUPMEM_STORE_PATH / FLYUPMEM_TOKEN_BUDGET
  2. Hermes provider config: $HERMES_HOME/flyupmem.json
  3. Defaults: ~/.flyupmem / 2048
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

from agent.memory_provider import MemoryProvider

logger = logging.getLogger(__name__)


META_INSTRUCTION_MARKERS = (
    "review the conversation above",
    "update the skill library",
    "first-class skill signals",
    "not just memory signals",
    "update the relevant skill",
)

AUTO_LEARN_MARKERS = (
    "记住",
    "不是",
    "不对",
    "应该",
    "以后",
    "不要",
    "别",
    "我喜欢",
    "我希望",
    "默认",
    "尽量",
    "就这样",
    "定了",
    "统一",
    "remember",
    "note ",
    "don't",
    "do not",
    "always",
    "default to",
    "instead of",
)


def strip_injected_memory_context(text: Any) -> str:
    """Remove recalled/system-injected memory blocks before learning."""
    if not isinstance(text, str):
        return ""
    cleaned = re.sub(r"^\s*\[Replying to:\s*[\"“][\s\S]*?[\"”]\]\s*", "", text)
    cleaned = re.sub(r"<memory-context>[\s\S]*?</memory-context>", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"<flyupmem-context>[\s\S]*?</flyupmem-context>", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\[System note:[\s\S]*?\]\s*", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def is_meta_instruction_pollution(text: str) -> bool:
    normalized = text.lower()
    return any(marker in normalized for marker in META_INSTRUCTION_MARKERS)


def learnable_user_content(text: Any) -> str:
    """Return user-authored content safe to learn from, or empty string."""
    cleaned = strip_injected_memory_context(text)
    if not cleaned:
        return ""
    if is_meta_instruction_pollution(cleaned):
        return ""
    return cleaned


def has_auto_learn_signal(text: str) -> bool:
    normalized = text.lower()
    return any(marker in normalized for marker in AUTO_LEARN_MARKERS)


def _expand_path(value: Any) -> Optional[str]:
    if not isinstance(value, str) or not value.strip():
        return None
    return str(Path(value).expanduser())


class FlyupMemProvider(MemoryProvider):
    """Hermes MemoryProvider backed by FlyupMem CLI."""

    @property
    def name(self) -> str:
        return "flyupmem"

    def is_available(self) -> bool:
        """Check if flyupmem CLI is installed."""
        return shutil.which("flyupmem") is not None

    def initialize(self, session_id: str, **kwargs) -> None:
        """Initialize for a session."""
        self._session_id = session_id
        self._hermes_home = kwargs.get("hermes_home", str(Path.home() / ".hermes"))
        cfg = self._load_config(self._hermes_home)

        cfg_store_path = _expand_path(cfg.get("store_path"))
        env_store_path = _expand_path(os.environ.get("FLYUPMEM_STORE_PATH"))
        self._store_path = env_store_path or cfg_store_path or str(Path.home() / ".flyupmem")

        raw_budget = os.environ.get("FLYUPMEM_TOKEN_BUDGET", cfg.get("token_budget", 2048))
        try:
            self._token_budget = int(raw_budget)
        except (TypeError, ValueError):
            logger.warning("Invalid FlyupMem token_budget %r; using 2048", raw_budget)
            self._token_budget = 2048

        self._prefetch_cache: Optional[str] = None
        self._prefetch_lock = threading.Lock()
        self._turn_count = 0

        # Verify CLI works
        try:
            result = self._run_cli("status")
            if result:
                stats = json.loads(result)
                logger.info(
                    "FlyupMem initialized: %d engrams, %d observations, %d mental models",
                    stats.get("stats", {}).get("engrams", {}).get("total", 0),
                    stats.get("stats", {}).get("observations", 0),
                    stats.get("stats", {}).get("mentalModels", 0),
                )
        except Exception as e:
            logger.warning("FlyupMem CLI check failed: %s", e)

    def system_prompt_block(self) -> str:
        """Return static system prompt info."""
        return (
            "You have access to FlyupMem — a persistent memory system that stores "
            "learned facts, observations, and mental models. Use the flyup_recall tool "
            "to search memories, and the flyup_learn tool to store new knowledge. "
            "Memories decay over time (ACT-R model) and are automatically consolidated."
        )

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        """Return cached recall results from background prefetch."""
        with self._prefetch_lock:
            return self._prefetch_cache or ""

    def queue_prefetch(self, query: str, *, session_id: str = "") -> None:
        """Queue background recall for the next turn."""
        def _prefetch():
            try:
                result = self._run_cli("recall", query)
                with self._prefetch_lock:
                    self._prefetch_cache = result or ""
            except Exception as e:
                logger.debug("FlyupMem prefetch failed: %s", e)

        thread = threading.Thread(target=_prefetch, daemon=True)
        thread.start()

    def sync_turn(self, user_content: str, assistant_content: str, *, session_id: str = "") -> None:
        """Learn from the completed turn (non-blocking)."""
        safe_user_content = learnable_user_content(user_content)
        if not safe_user_content or not has_auto_learn_signal(safe_user_content):
            return

        def _learn():
            try:
                self._run_cli("learn", safe_user_content, assistant_content)
                self._turn_count += 1

                # Run maintenance every 20 learned turns
                if self._turn_count % 20 == 0:
                    self._run_cli("maintain", "--mode", "light")
            except Exception as e:
                logger.debug("FlyupMem sync_turn failed: %s", e)

        thread = threading.Thread(target=_learn, daemon=True)
        thread.start()

    def get_tool_schemas(self) -> List[Dict[str, Any]]:
        """Return tool schemas for flyup_* tools."""
        return [
            {
                "name": "flyup_recall",
                "description": "Search persistent memories for relevant facts, observations, and mental models.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search query to find relevant memories"},
                        "explain": {
                            "type": "boolean",
                            "description": "Return structured recall diagnostics and per-signal scores instead of injection text only",
                            "default": False,
                        },
                    },
                    "required": ["query"],
                },
            },
            {
                "name": "flyup_learn",
                "description": "Store a new fact or piece of knowledge in persistent memory.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "statement": {"type": "string", "description": "The fact or knowledge to remember"},
                    },
                    "required": ["statement"],
                },
            },
            {
                "name": "flyup_feedback",
                "description": "Give feedback on a memory (positive/negative/neutral).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "memory_id": {"type": "string", "description": "Memory ID (e.g. ENG-20260501-001)"},
                        "signal": {
                            "type": "string",
                            "enum": ["positive", "negative", "neutral"],
                            "description": "Feedback signal",
                        },
                    },
                    "required": ["memory_id", "signal"],
                },
            },
            {
                "name": "flyup_status",
                "description": "Get memory store statistics.",
                "parameters": {"type": "object", "properties": {}},
            },
            {
                "name": "flyup_inspect",
                "description": "Inspect a single memory by ID: full detail, current activation, related memories, graph edges, and feedback.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "memory_id": {"type": "string", "description": "Memory ID (e.g. ENG-20260501-001)"},
                    },
                    "required": ["memory_id"],
                },
            },
            {
                "name": "flyup_maintain",
                "description": "Run FlyupMem maintenance: decay, consolidation, graph updates, and optional REM processing.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "mode": {
                            "type": "string",
                            "enum": ["light", "deep", "rem"],
                            "description": "Maintenance mode. Defaults to light for interactive safety.",
                            "default": "light",
                        },
                    },
                },
            },
            {
                "name": "flyup_reflect",
                "description": "Synthesize higher-level mental models from observations. Requires FlyupMem LLM config.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Reflection topic or question"},
                    },
                    "required": ["query"],
                },
            },
            {
                "name": "flyup_experiences",
                "description": "Browse Experience layer memories (L4). Returns Experiences with pattern metadata like occurrence_count and trend.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "status": {"type": "string", "enum": ["all", "active", "candidate", "fading", "dormant", "retired"], "description": "Filter by status. Defaults to 'all'.", "default": "all"},
                        "limit": {"type": "integer", "description": "Max number of experiences to return.", "default": 50},
                    },
                },
            },
            {
                "name": "flyup_experience_detail",
                "description": "Get detailed Experience by ID with resolved evidence chain (source memories).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string", "description": "Experience ID (e.g. EXP-20260509-001)"},
                    },
                    "required": ["id"],
                },
            },
        ]

    def handle_tool_call(self, tool_name: str, args: Dict[str, Any], **kwargs) -> str:
        """Handle flyup_* tool calls."""
        try:
            if tool_name == "flyup_recall":
                query = args.get("query", "")
                cli_args = ["recall", query]
                if args.get("explain"):
                    cli_args.append("--explain")
                result = self._run_cli(*cli_args)
                return result or "<flyupmem-context>\n(no relevant memories)\n</flyupmem-context>"

            elif tool_name == "flyup_learn":
                statement = learnable_user_content(args.get("statement", ""))
                if not statement:
                    return '{"stored": 0, "skipped": 1}'
                result = self._run_cli("learn", statement)
                return result or '{"stored": 0}'

            elif tool_name == "flyup_feedback":
                memory_id = args.get("memory_id", "")
                signal = args.get("signal", "neutral")
                result = self._run_cli("feedback", memory_id, signal)
                return result or '{"applied": false}'

            elif tool_name == "flyup_status":
                result = self._run_cli("status")
                return result or "{}"

            elif tool_name == "flyup_inspect":
                memory_id = args.get("memory_id", "")
                result = self._run_cli("inspect", memory_id, "--json")
                return result or '{"error": "Memory not found"}'

            elif tool_name == "flyup_maintain":
                mode = args.get("mode") or "light"
                if mode not in ("light", "deep", "rem"):
                    return json.dumps({"error": "mode must be one of: light, deep, rem"})
                result = self._run_cli("maintain", "--mode", mode)
                return result or '{"maintained": false}'

            elif tool_name == "flyup_reflect":
                query = args.get("query", "")
                if not query:
                    return json.dumps({"error": "query is required"})
                result = self._run_cli("reflect", query)
                return result or '{"reflected": false}'

            elif tool_name == "flyup_experiences":
                status = args.get("status", "all")
                limit = args.get("limit", 50)
                cli_args = ["status", "--json"]
                result = self._run_cli(*cli_args)
                # Use direct JSON parsing for experiences since CLI status doesn't return experiences well
                try:
                    import subprocess as sp
                    store_path = self._store_path or os.path.expanduser("~/.flyupmem")
                    experiences_file = os.path.join(store_path, "experiences.yaml")
                    if not os.path.exists(experiences_file):
                        return json.dumps({"experiences": [], "total": 0})
                    data = yaml.safe_load(open(experiences_file)) or []
                    if status != "all":
                        data = [e for e in data if e.get("status") == status]
                    data.sort(key=lambda e: e.get("last_seen", e.get("temporal", {}).get("learned_at", "")), reverse=True)
                    return json.dumps({"experiences": data[:limit], "total": len(data)})
                except Exception as e:
                    return json.dumps({"error": str(e)})

            elif tool_name == "flyup_experience_detail":
                exp_id = args.get("id", "")
                if not exp_id:
                    return json.dumps({"error": "id is required"})
                try:
                    store_path = self._store_path or os.path.expanduser("~/.flyupmem")
                    experiences_file = os.path.join(store_path, "experiences.yaml")
                    if not os.path.exists(experiences_file):
                        return json.dumps({"error": "Experience not found"})
                    data = yaml.safe_load(open(experiences_file)) or []
                    exp = next((e for e in data if e.get("id") == exp_id), None)
                    if not exp:
                        return json.dumps({"error": "Experience not found"})
                    # Resolve evidence chain
                    evidence = []
                    for source_id in exp.get("source_memory_ids", []):
                        r = self._run_cli("inspect", source_id, "--json")
                        if r:
                            try:
                                evidence.append(json.loads(r))
                            except:
                                pass
                    return json.dumps({"experience": exp, "evidence": evidence})
                except Exception as e:
                    return json.dumps({"error": str(e)})

            else:
                return json.dumps({"error": f"Unknown tool: {tool_name}"})

        except Exception as e:
            return json.dumps({"error": str(e)})

    def on_session_end(self, messages: List[Dict[str, Any]]) -> None:
        """Extract learnings from the session."""
        def _extract():
            try:
                # Learn from the last few message pairs
                for i in range(max(0, len(messages) - 10), len(messages) - 1):
                    msg = messages[i]
                    next_msg = messages[i + 1] if i + 1 < len(messages) else None
                    if (msg.get("role") == "user" and next_msg and next_msg.get("role") == "assistant"):
                        safe_user_content = learnable_user_content(msg.get("content", ""))
                        if safe_user_content and has_auto_learn_signal(safe_user_content):
                            self._run_cli("learn", safe_user_content, next_msg.get("content", ""))

                # Run light maintenance at session end
                self._run_cli("maintain", "--mode", "light")
            except Exception as e:
                logger.debug("FlyupMem on_session_end failed: %s", e)

        thread = threading.Thread(target=_extract, daemon=True)
        thread.start()

    def on_pre_compress(self, messages: List[Dict[str, Any]]) -> str:
        """Extract insights before context compression."""
        learnings = []
        for msg in messages[-6:]:
            if msg.get("role") == "user":
                content = learnable_user_content(msg.get("content", ""))
                if content and any(kw in content for kw in ["记住", "不是", "以后", "我喜欢", "不要"]):
                    learnings.append(content[:200])

        if learnings:
            return "FlyupMem insights from compressed context:\n" + "\n".join(f"- {l}" for l in learnings)
        return ""

    def get_config_schema(self) -> List[Dict[str, Any]]:
        """Return config fields for 'hermes memory setup'."""
        return [
            {
                "key": "store_path",
                "description": "Path to FlyupMem store directory",
                "required": False,
                "default": "~/.flyupmem",
            },
            {
                "key": "token_budget",
                "description": "Token budget for memory injection",
                "required": False,
                "default": "2048",
            },
        ]

    def save_config(self, values: Dict[str, Any], hermes_home: str) -> None:
        """Persist FlyupMem provider config to $HERMES_HOME/flyupmem.json."""
        config_path = Path(hermes_home).expanduser() / "flyupmem.json"
        existing: Dict[str, Any] = {}
        if config_path.exists():
            try:
                existing = json.loads(config_path.read_text())
            except Exception:
                existing = {}
        for key in ("store_path", "token_budget"):
            if key in values and values[key] not in (None, ""):
                existing[key] = values[key]
        config_path.write_text(json.dumps(existing, indent=2))

    def shutdown(self) -> None:
        """Clean shutdown."""
        self._prefetch_cache = None

    # ─── Internal helpers ──────────────────────────────────────

    def _load_config(self, hermes_home: str) -> Dict[str, Any]:
        """Load provider config saved by hermes memory setup."""
        config_path = Path(hermes_home).expanduser() / "flyupmem.json"
        if not config_path.exists():
            return {}
        try:
            data = json.loads(config_path.read_text())
            return data if isinstance(data, dict) else {}
        except Exception as e:
            logger.debug("Failed to load FlyupMem config %s: %s", config_path, e)
            return {}

    def _run_cli(self, *args: str) -> Optional[str]:
        """Run flyupmem CLI command and return stdout."""
        cmd = ["flyupmem"] + list(args)
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
                env={**os.environ, "FLYUPMEM_STORE_PATH": self._store_path},
            )
            if result.returncode == 0:
                return result.stdout.strip()
            logger.debug("FlyupMem CLI error (exit %d): %s", result.returncode, result.stderr)
            return None
        except subprocess.TimeoutExpired:
            logger.debug("FlyupMem CLI timeout for: %s", " ".join(args))
            return None
        except FileNotFoundError:
            logger.debug("FlyupMem CLI not found")
            return None


def register(ctx) -> None:
    """Register FlyupMem as a Hermes MemoryProvider plugin."""
    ctx.register_memory_provider(FlyupMemProvider())
