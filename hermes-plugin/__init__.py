"""FlyupMem memory plugin — Hermes MemoryProvider interface.

Local-first, zero-cost memory with YAML storage, multi-signal retrieval,
ACT-R decay, and automatic maintenance.

Uses the FlyupMem CLI (`flyupmem`) via subprocess for all operations.
Shares the same `~/.flyupmem/` storage as the MCP server and OpenClaw plugin.

Config via environment variables:
  FLYUPMEM_STORE_PATH    — custom store path (default: ~/.flyupmem)
  FLYUPMEM_TOKEN_BUDGET  — injection token budget (default: 2048)
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

from agent.memory_provider import MemoryProvider

logger = logging.getLogger(__name__)


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
        self._store_path = os.environ.get("FLYUPMEM_STORE_PATH", str(Path.home() / ".flyupmem"))
        self._token_budget = int(os.environ.get("FLYUPMEM_TOKEN_BUDGET", "2048"))
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
        def _learn():
            try:
                self._run_cli("learn", user_content, assistant_content)
                self._turn_count += 1

                # Run maintenance every 20 turns
                if self._turn_count % 20 == 0:
                    self._run_cli("maintain")
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
                        "query": {
                            "type": "string",
                            "description": "Search query to find relevant memories",
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
                        "statement": {
                            "type": "string",
                            "description": "The fact or knowledge to remember",
                        },
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
                        "memory_id": {
                            "type": "string",
                            "description": "Memory ID (e.g. ENG-20260501-001)",
                        },
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
        ]

    def handle_tool_call(self, tool_name: str, args: Dict[str, Any], **kwargs) -> str:
        """Handle flyup_* tool calls."""
        try:
            if tool_name == "flyup_recall":
                query = args.get("query", "")
                result = self._run_cli("recall", query)
                return result or "<flyupmem-context>\n(no relevant memories)\n</flyupmem-context>"

            elif tool_name == "flyup_learn":
                statement = args.get("statement", "")
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
                        self._run_cli("learn", msg["content"], next_msg["content"])

                # Run maintenance at session end
                self._run_cli("maintain")
            except Exception as e:
                logger.debug("FlyupMem on_session_end failed: %s", e)

        thread = threading.Thread(target=_extract, daemon=True)
        thread.start()

    def on_pre_compress(self, messages: List[Dict[str, Any]]) -> str:
        """Extract insights before context compression."""
        learnings = []
        for msg in messages[-6:]:
            if msg.get("role") == "user":
                content = msg.get("content", "")
                if any(kw in content for kw in ["记住", "不是", "以后", "我喜欢", "不要"]):
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

    def shutdown(self) -> None:
        """Clean shutdown."""
        self._prefetch_cache = None

    # ─── Internal helpers ──────────────────────────────────────

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
