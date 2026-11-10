"""Agent tools: check the houseplant, and tend it when the user asks.

Each tool changes the stored plant first, then tells Desktop so the plant on screen follows. The
push is best effort. Desktop also checks in when its window gets focus and once a minute.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from . import engine
from .store import PLUGIN_ID, Store

logger = logging.getLogger(__name__)

TOOLSET = "hermes_plant"

store = Store()


def _notify(action: str, rev: int) -> None:
    try:
        from hermes_cli.plugin_events import broadcast_plugin_event

        broadcast_plugin_event(PLUGIN_ID, "changed", {"action": action, "rev": rev})
    except Exception as exc:
        logger.debug("hermes-plant: push failed (%s); Desktop will check in", type(exc).__name__)


def _status(plant: engine.Plant, now: int) -> dict[str, Any]:
    view = engine.describe(plant, now)
    return {
        "summary": engine.summarize(view),
        "stage": view["stage"],
        "mood": view["mood"],
        "needs": view["needs"],
        "growing": view["growing"],
        "growth_days": round(view["days"], 1),
        "age_days": round((now - plant["plantedAt"]) / engine.DAY, 1),
        "water_hours_left": view["waterHours"],
        "fed": view["fed"],
        "lean": round(view["lean"], 2),
        "pot": view["potName"],
        "can_repot": view["canRepot"],
        "times_pruned": len(plant["cuts"]),
    }


def _fail(exc: Exception) -> str:
    logger.warning("hermes-plant: tool failed (%s)", type(exc).__name__)
    return json.dumps({"error": "The houseplant's storage could not be reached."})


def plant_status(args: dict, **_: Any) -> str:
    try:
        plant, now = store.ensure()
        return json.dumps(_status(plant, now))
    except Exception as exc:
        return _fail(exc)


def plant_tend(args: dict, **_: Any) -> str:
    action = (args or {}).get("action")
    if action not in engine.ACTIONS:
        return json.dumps({"error": f"action must be one of: {', '.join(sorted(engine.ACTIONS))}."})
    try:
        plant, done, message, now = store.act(action)
    except Exception as exc:
        return _fail(exc)
    if done:
        _notify(action, plant["rev"])
    return json.dumps({"done": done, "message": message, **_status(plant, now)})


HANDLERS = {"plant_status": plant_status, "plant_tend": plant_tend}

SCHEMAS = {
    "plant_status": {
        "name": "plant_status",
        "description": (
            "Check the user's houseplant in Hermes Desktop: its stage, mood, what it needs, how much water is "
            "left and whether it is growing. The plant grows in real time over days and never dies. Use this when "
            "the user asks about their plant."
        ),
        "parameters": {"type": "object", "properties": {}},
    },
    "plant_tend": {
        "name": "plant_tend",
        "description": (
            "Care for the user's houseplant, only when they ask you to. water: three more days of growth. "
            "prune: cut the tallest tip so it branches. rotate: turn the pot so a leaning plant straightens. "
            "feed: faster growth for two days. repot: a bigger pot once the roots fill this one. The result says "
            "whether the action happened and how the plant is now."
        ),
        "parameters": {
            "type": "object",
            "properties": {"action": {"type": "string", "enum": sorted(engine.ACTIONS)}},
            "required": ["action"],
        },
    },
}
