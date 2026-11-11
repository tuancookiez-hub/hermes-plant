"""Agent tools: check the garden, and tend it when the user asks.

Each tool changes the stored garden first, then tells Desktop so the garden on screen follows. The
push is best effort. Desktop also checks in when its window gets focus and once a minute.
Plants are named to the model by their position in the garden, counting from 1.
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


def _status(garden: engine.Garden, now: int) -> dict[str, Any]:
    view = engine.describe(garden, now)
    ids = [plant["id"] for plant in view["plants"]]
    return {
        "summary": engine.summarize(view),
        "coins": view["coins"],
        "fertilizer": view["fertilizer"],
        "room_for_more": view["room"],
        "bug_on_plant": None if view["bug"] is None else ids.index(view["bug"]) + 1,
        "shop": {**{kind: engine.KINDS[kind]["price"] for kind in engine.KIND_IDS}, "fertilizer": engine.FERTILIZER_PRICE},
        "plants": [
            {
                "number": i + 1,
                "kind": plant["kind"],
                "name": plant["name"],
                "mood": plant["mood"],
                "needs": plant["needs"],
                "growing": plant["growing"],
                "growth_days": round(plant["days"], 1),
                "water_hours_left": plant["waterHours"],
                "fed": plant["fed"],
                "pot": plant["potName"],
                "can_repot": plant["canRepot"],
                "can_prune": plant["canPrune"],
                "can_pick": plant["canPick"],
                "sell_value": plant["value"],
            }
            for i, plant in enumerate(view["plants"])
        ],
    }


def _fail(exc: Exception) -> str:
    logger.warning("hermes-plant: tool failed (%s)", type(exc).__name__)
    return json.dumps({"error": "The garden's storage could not be reached."})


def plant_status(args: dict, **_: Any) -> str:
    try:
        garden, now = store.ensure()
        return json.dumps(_status(garden, now))
    except Exception as exc:
        return _fail(exc)


def plant_tend(args: dict, **_: Any) -> str:
    args = args or {}
    action = args.get("action")
    if action not in engine.ACTIONS:
        return json.dumps({"error": f"action must be one of: {', '.join(engine.ACTIONS)}."})
    number, item = args.get("plant"), args.get("item")
    try:
        plant_id = None
        if number is not None:
            garden, _now = store.ensure()
            plants = garden["plants"]
            # A number that names no plant becomes an id nothing has, so the engine says so.
            valid = isinstance(number, int) and not isinstance(number, bool) and 1 <= number <= len(plants)
            plant_id = plants[number - 1]["id"] if valid else 0
        outcome, now = store.act(action, plant=plant_id, item=item if isinstance(item, str) else None)
    except Exception as exc:
        return _fail(exc)
    garden = outcome["garden"]
    if outcome["done"]:
        _notify(action, garden["rev"])
    return json.dumps({"done": outcome["done"], "message": outcome["message"], "coins_change": outcome["coins"], **_status(garden, now)})


HANDLERS = {"plant_status": plant_status, "plant_tend": plant_tend}

SCHEMAS = {
    "plant_status": {
        "name": "plant_status",
        "description": (
            "Check the user's garden in Hermes Desktop. The garden holds up to six plants. This lists every "
            "plant by number with its kind, mood, what it needs, how much water is left, whether it is "
            "growing, its pot and what it would sell for, along with the coins, the fertilizer, the free pots, "
            "the shop prices and any bug sitting on a plant. Plants grow in real time over days and never die. "
            "Use this when the user asks about their plants, and to find a plant's number before tending it."
        ),
        "parameters": {"type": "object", "properties": {}},
    },
    "plant_tend": {
        "name": "plant_tend",
        "description": (
            "Look after the user's garden of up to six plants, only when they ask you to. Do not tend, buy or sell "
            "on your own. water: keeps a plant growing for as long as its species holds water, and earns 2 coins "
            "if it was thirsty. prune: cuts the tallest tip so the plant branches, and earns coins. rotate: turns "
            "the pot so a leaning plant straightens. feed: uses one fertilizer for a burst of growth and two "
            "faster days. repot: moves a plant to a bigger pot once its roots fill this one. pick: collects from "
            "a fully grown, watered plant every two days for coins. sell: sells a plant for coins, but never the "
            "last one. buy: buys a plant (leafy, fern, cactus, bonsai) or fertilizer with coins, set by item. "
            "shoo: shoos a bug off a plant for coins. Give plant as the number shown by plant_status, counting "
            "from 1. Without plant, the action goes to the plant that wants it most (sell always needs one). "
            "The result says whether the action happened, the coins gained or spent, and how the garden is now."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": list(engine.ACTIONS)},
                "plant": {"type": "integer", "description": "The plant's number from plant_status, counting from 1."},
                "item": {"type": "string", "enum": list(engine.SHOP_ITEMS), "description": "What to buy, for the buy action."},
            },
            "required": ["action"],
        },
    },
}
