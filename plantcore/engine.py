"""The plant's rules, for the agent tools.

This mirrors desktop-src/src/engine.js, which the Desktop plant uses. Both read and write the same
JSON record, and tests/test_parity.py replays desktop-src/test/parity.json to keep them in step.
All times are whole milliseconds since the epoch, as in JavaScript.
"""

from __future__ import annotations

import math
import secrets
from typing import Any, Callable

HOUR = 3_600_000
DAY = 24 * HOUR

HYDRATED_MS = 3 * DAY
THIRSTY_MS = DAY
DROOP_FULL_MS = 3 * DAY
FED_MS = 2 * DAY
LEAN_MS = 10 * DAY
LEAN_NOTICE = 0.6
REPOT_READY = 0.8
BASE_NODES = 4
NODE_RATE = 6
MAX_CUTS = 240

# Each pot holds growth up to `days`. The last pot has no limit.
POTS = (("seedling pot", 7), ("small pot", 21), ("medium pot", 45), ("large pot", None))
STAGES = (("sapling", 0), ("young plant", 7), ("mature plant", 21), ("flowering", 45))

Plant = dict[str, Any]
Result = tuple[Plant, bool, str]


def _clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def _number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _whole(value: Any) -> bool:
    return _number(value) and float(value).is_integer()


def create_plant(now: int, seed: int | None = None) -> Plant:
    return {
        "v": 2,
        "rev": 1,
        "seed": (secrets.randbits(32) if seed is None else seed) & 0xFFFFFFFF,
        "plantedAt": now,
        "updatedAt": now,
        "hydratedUntil": now + HYDRATED_MS,
        "growthMs": 0,
        "cuts": [],
        "fedUntil": 0,
        "leanAt": 0,
        "turnedAt": now,
        "pot": 0,
    }


def restore_plant(raw: Any, now: int) -> Plant | None:
    """Turn stored or posted data back into a valid plant, or return None when it can't be trusted."""
    if not isinstance(raw, dict) or raw.get("v") != 2:
        return None
    cuts = raw.get("cuts")
    if not isinstance(cuts, list) or len(cuts) > MAX_CUTS:
        return None
    names = ("rev", "seed", "plantedAt", "updatedAt", "hydratedUntil", "growthMs", "fedUntil", "leanAt", "turnedAt")
    if not all(_number(raw.get(name)) for name in names):
        return None
    pot = raw.get("pot")
    if not _whole(pot) or not 0 <= pot < len(POTS):
        return None
    if raw["growthMs"] < 0 or raw["rev"] < 1 or not all(_whole(cut) and cut >= 0 for cut in cuts):
        return None
    return {
        "v": 2,
        "rev": math.floor(raw["rev"]),
        "seed": math.floor(raw["seed"]) & 0xFFFFFFFF,
        "plantedAt": min(raw["plantedAt"], now),
        "updatedAt": min(raw["updatedAt"], now),
        "hydratedUntil": min(raw["hydratedUntil"], now + HYDRATED_MS),
        "growthMs": math.floor(raw["growthMs"]),
        "cuts": sorted(int(cut) for cut in cuts),
        "fedUntil": min(raw["fedUntil"], now + FED_MS),
        "leanAt": _clamp(raw["leanAt"], -1, 1),
        "turnedAt": min(raw["turnedAt"], now),
        "pot": int(pot),
    }


def is_newer(a: Plant, b: Plant) -> bool:
    """True when `a` is a later version of the plant than `b`."""
    return a["rev"] > b["rev"] or (a["rev"] == b["rev"] and a["updatedAt"] > b["updatedAt"])


def _pot_limit(plant: Plant) -> float:
    days = POTS[plant["pot"]][1]
    return math.inf if days is None else days * DAY


def settle(plant: Plant, now: int) -> Plant:
    """Bank growth up to `now`. Only watered time counts, fed time counts half again, the pot caps it."""
    end = min(now, plant["hydratedUntil"])
    span = max(0, end - plant["updatedAt"])
    fed = max(0, min(end, plant["fedUntil"]) - plant["updatedAt"])
    growth = min(_pot_limit(plant), plant["growthMs"] + span + math.floor(fed / 2))
    return {**plant, "growthMs": max(plant["growthMs"], growth), "updatedAt": max(plant["updatedAt"], now)}


def lean_of(plant: Plant, now: int) -> float:
    """How far the plant leans toward the light: 0 is upright, 1 is as far as it goes."""
    return _clamp(plant["leanAt"] + max(0, now - plant["turnedAt"]) / LEAN_MS, -1, 1)


def node_count(plant: Plant) -> int:
    return BASE_NODES + math.floor(NODE_RATE * math.sqrt(plant["growthMs"] / DAY))


def _act(plant: Plant, now: int, **change: Any) -> Plant:
    return {**settle(plant, now), **change, "rev": plant["rev"] + 1}


def water(plant: Plant, now: int) -> Result:
    return _act(plant, now, hydratedUntil=now + HYDRATED_MS), True, "Watered. Good for three days."


def prune(plant: Plant, now: int) -> Result:
    """Cut the tallest tip. New growth must appear between cuts, so it can't be pruned to nothing."""
    settled = settle(plant, now)
    nodes = node_count(settled)
    cuts = settled["cuts"]
    if len(cuts) >= MAX_CUTS or (cuts and cuts[-1] >= nodes):
        return plant, False, "Nothing new to prune yet."
    return _act(plant, now, cuts=[*cuts, nodes]), True, "Pruned. Two new shoots will branch from the cut."


def rotate(plant: Plant, now: int) -> Result:
    """Turn the pot. The lean it had now points away from the light, and it grows back the other way."""
    return _act(plant, now, leanAt=-lean_of(plant, now), turnedAt=now), True, "Turned the pot. It will straighten up."


def feed(plant: Plant, now: int) -> Result:
    if now < plant["fedUntil"]:
        return plant, False, "Still using the last feed."
    return _act(plant, now, fedUntil=now + FED_MS), True, "Fed. It grows faster for two days."


def repot(plant: Plant, now: int) -> Result:
    settled = settle(plant, now)
    if settled["pot"] >= len(POTS) - 1:
        return plant, False, "Already in the largest pot."
    if settled["growthMs"] < REPOT_READY * _pot_limit(settled):
        return plant, False, "The roots still have room."
    pot = settled["pot"] + 1
    return _act(plant, now, pot=pot), True, f"Moved to the {POTS[pot][0]}."


ACTIONS: dict[str, Callable[[Plant, int], Result]] = {
    "feed": feed,
    "prune": prune,
    "repot": repot,
    "rotate": rotate,
    "water": water,
}


def _js_round(value: float) -> int:
    """Math.round: halves go up."""
    return math.floor(value + 0.5)


def describe(plant: Plant, now: int) -> dict[str, Any]:
    settled = settle(plant, now)
    days = settled["growthMs"] / DAY
    left = plant["hydratedUntil"] - now
    limit = _pot_limit(settled)
    root_bound = settled["growthMs"] >= limit
    lean = lean_of(plant, now)
    dry = left <= 0
    thirsty = left <= THIRSTY_MS
    if dry:
        mood = "droopy"
    elif thirsty:
        mood = "thirsty"
    elif root_bound:
        mood = "root-bound"
    elif lean >= LEAN_NOTICE:
        mood = "leaning"
    else:
        mood = "happy"
    wanted = (("water", thirsty), ("repot", root_bound), ("rotate", lean >= LEAN_NOTICE))
    return {
        "canRepot": settled["pot"] < len(POTS) - 1 and settled["growthMs"] >= REPOT_READY * limit,
        "days": days,
        "droop": 0.2 + 0.8 * min(1, -left / DROOP_FULL_MS) if dry else 0.1 if thirsty else 0,
        "fed": now < plant["fedUntil"],
        "growing": not dry and not root_bound,
        "lean": lean,
        "mood": mood,
        "needs": [name for name, needed in wanted if needed],
        "nodes": node_count(settled),
        "pot": settled["pot"],
        "potName": POTS[settled["pot"]][0],
        "stage": [name for name, floor in STAGES if days >= floor][-1],
        "waterHours": max(0, _js_round(left / HOUR)),
    }


def summarize(view: dict[str, Any]) -> str:
    state = {
        "droopy": "dry and drooping, growth paused",
        "happy": "happy",
        "leaning": "leaning toward the light",
        "root-bound": "root-bound, growth paused",
        "thirsty": "getting thirsty",
    }[view["mood"]]
    return f"{view['stage']} in a {view['potName']}, {state}"
