"""The garden's rules, for the agent tools.

This mirrors desktop-src/src/engine.js, which the Desktop garden uses. Both read and write the same
JSON record, and tests/test_parity.py replays desktop-src/test/parity.json to keep them in step.
All times are whole milliseconds since the epoch, as in JavaScript.
"""

from __future__ import annotations

import math
import secrets
from typing import Any, Callable

HOUR = 3_600_000
DAY = 24 * HOUR

DROOP_FULL_MS = 3 * DAY
FED_MS = 2 * DAY
FEED_BOOST_MS = 8 * HOUR
LEAN_MS = 10 * DAY
LEAN_NOTICE = 0.6
REPOT_READY = 0.8
PICK_MS = 2 * DAY
BASE_NODES = 4
NODE_RATE = 12
MAX_NODES = 72
MAX_CUTS = 240
MAX_PLANTS = 6
MAX_FERTILIZER = 9
START_COINS = 20
START_FERTILIZER = 2
FERTILIZER_PRICE = 8
WATER_COINS = 2
BUG_COINS = 2
PICK_COINS = 12
BUG_MIN_MS = 3 * HOUR
BUG_SPAN_MS = 6 * HOUR

_MASK = 0xFFFFFFFF
_GOLDEN = 0x9E3779B1

# The species. `rate` is growth speed in percent, `worth` is a percent applied to what a plant sells
# for, and `clip` is the coins a pruning earns. `last` names the final stage.
KINDS: dict[str, dict[str, Any]] = {
    "leafy": {"name": "leafy plant", "price": 15, "hydrated": 3 * DAY, "thirsty": DAY, "rate": 100, "worth": 100, "clip": 2, "last": "flowering"},
    "fern": {"name": "fern", "price": 25, "hydrated": 2 * DAY, "thirsty": 12 * HOUR, "rate": 130, "worth": 120, "clip": 2, "last": "lush"},
    "cactus": {"name": "cactus", "price": 40, "hydrated": 9 * DAY, "thirsty": 2 * DAY, "rate": 60, "worth": 220, "clip": 4, "last": "flowering"},
    "bonsai": {"name": "little tree", "price": 60, "hydrated": 4 * DAY, "thirsty": DAY, "rate": 80, "worth": 300, "clip": 5, "last": "blossoming"},
}
KIND_IDS = ("leafy", "fern", "cactus", "bonsai")

# Each pot holds growth up to `days`. The last pot has no limit.
POTS = (("seedling pot", 1), ("small pot", 4), ("medium pot", 10), ("large pot", None))
# Stage 3 is named by the species.
STAGES = (("seedling", 0),("young", 1), ("grown", 4), (None, 10))

Garden = dict[str, Any]
Plant = dict[str, Any]


def _clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def _number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _whole(value: Any) -> bool:
    return _number(value) and float(value).is_integer()


def _u32(value: float) -> int:
    """`value >>> 0`."""
    return int(value) & _MASK


def _js_round(value: float) -> int:
    """Math.round: halves go up."""
    return math.floor(value + 0.5)


def _plural(count: int, word: str) -> str:
    return f"{count} {word}{'' if count == 1 else 's'}"


def _kind(name: Any) -> dict[str, Any] | None:
    return KINDS.get(name) if isinstance(name, str) else None


def _nodes_at(growth_ms: float) -> int:
    return min(MAX_NODES, BASE_NODES + math.floor(NODE_RATE * math.sqrt(growth_ms / DAY)))


def _pot_for(growth_ms: float) -> int:
    return next(i for i, (_, days) in enumerate(POTS) if days is None or growth_ms < days * DAY)


def _stage_of(growth_ms: float) -> int:
    return max(i for i, (_, days) in enumerate(STAGES) if growth_ms >= days * DAY)


def _pot_limit(plant: Plant) -> float:
    days = POTS[plant["pot"]][1]
    return math.inf if days is None else days * DAY


def _new_plant(plant_id: int, kind: str, seed: int, now: int) -> Plant:
    return {
        "id": plant_id,
        "kind": kind,
        "seed": seed & _MASK,
        "plantedAt": now,
        "updatedAt": now,
        "hydratedUntil": now + KINDS[kind]["hydrated"],
        "growthMs": 0,
        "cuts": [],
        "fedUntil": 0,
        "leanAt": 0,
        "turnedAt": now,
        "pot": 0,
        "pickedAt": 0,
    }


def _next_bug(seed: int, rev: int, now: int) -> int:
    """When the next bug lands. It depends only on the garden's seed and revision, so both engines agree."""
    return now + BUG_MIN_MS + ((rev * _GOLDEN + seed) & _MASK) % BUG_SPAN_MS


def create_garden(now: int, seed: int | None = None) -> Garden:
    base = (secrets.randbits(32) if seed is None else seed) & _MASK
    return {
        "v": 3,
        "rev": 1,
        "seed": base,
        "updatedAt": now,
        "coins": START_COINS,
        "fertilizer": START_FERTILIZER,
        "bugAt": _next_bug(base, 1, now),
        "nextId": 2,
        "plants": [_new_plant(1, "leafy", base, now)],
    }


def _version(raw: Any, number: int) -> bool:
    return isinstance(raw, dict) and _number(raw.get("v")) and raw["v"] == number


def _from_v1(raw: Any) -> Any:
    """Version 1 grew a node every 12 hours. Its cut marks become version 2 node counts."""
    if not _version(raw, 1) or not isinstance(raw.get("cuts"), list) or not _number(raw.get("growthMs")):
        return raw

    def old(growth_ms: float) -> int:
        return BASE_NODES + math.floor(6 * math.sqrt(growth_ms / DAY))

    return {
        **raw,
        "v": 2,
        "rev": 1,
        "cuts": [old(max(0, node - BASE_NODES) * 12 * HOUR) if _whole(node) else node for node in raw["cuts"]],
        "fedUntil": 0,
        "leanAt": 0,
        "turnedAt": raw.get("updatedAt"),
        "pot": 0,
    }


def _from_single_plant(data: Any) -> Any:
    """Versions 1 and 2 held one plant. It becomes the first pot of a garden, and now grows twice as many nodes."""
    raw = _from_v1(data)
    if not _version(raw, 2) or not isinstance(raw.get("cuts"), list) or not _number(raw.get("growthMs")) or raw["growthMs"] < 0:
        return raw
    seed = _u32(raw["seed"]) if _number(raw.get("seed")) else 0
    rev = raw["rev"] if _number(raw.get("rev")) else 1
    updated = raw.get("updatedAt")
    return {
        "v": 3,
        "rev": rev,
        "seed": seed,
        "updatedAt": updated,
        "coins": START_COINS,
        "fertilizer": START_FERTILIZER,
        "bugAt": _next_bug(seed, math.floor(rev), updated if _number(updated) else 0),
        "nextId": 2,
        "plants": [
            {
                **raw,
                "id": 1,
                "kind": "leafy",
                "cuts": [BASE_NODES + 2 * (node - BASE_NODES) if _whole(node) and node > BASE_NODES else node for node in raw["cuts"]],
                "pot": _pot_for(raw["growthMs"]),
                "pickedAt": 0,
            }
        ],
    }


def _restore_plant(raw: Any, now: int) -> Plant | None:
    kind = _kind(raw.get("kind")) if isinstance(raw, dict) else None
    if not kind or not _whole(raw.get("id")) or raw["id"] < 1:
        return None
    cuts = raw.get("cuts")
    if not isinstance(cuts, list) or len(cuts) > MAX_CUTS:
        return None
    names = ("seed", "plantedAt", "updatedAt", "hydratedUntil", "growthMs", "fedUntil", "leanAt", "turnedAt", "pickedAt")
    if not all(_number(raw.get(name)) for name in names):
        return None
    pot = raw.get("pot")
    if not _whole(pot) or not 0 <= pot < len(POTS):
        return None
    if raw["growthMs"] < 0 or not all(_whole(cut) and cut >= 0 for cut in cuts):
        return None
    return {
        "id": int(raw["id"]),
        "kind": raw["kind"],
        "seed": _u32(raw["seed"]),
        "plantedAt": min(raw["plantedAt"], now),
        "updatedAt": min(raw["updatedAt"], now),
        "hydratedUntil": min(raw["hydratedUntil"], now + kind["hydrated"]),
        "growthMs": math.floor(raw["growthMs"]),
        "cuts": sorted(int(cut) for cut in cuts),
        "fedUntil": min(raw["fedUntil"], now + FED_MS),
        "leanAt": _clamp(raw["leanAt"], -1, 1),
        "turnedAt": min(raw["turnedAt"], now),
        "pot": int(pot),
        "pickedAt": min(raw["pickedAt"], now),
    }


def restore_garden(data: Any, now: int) -> Garden | None:
    """Turn stored or posted data back into a valid garden, or return None when it can't be trusted.

    Saves from versions 1 and 2, which held a single plant, are upgraded.
    """
    raw = _from_single_plant(data)
    if not _version(raw, 3):
        return None
    plants_raw = raw.get("plants")
    if not isinstance(plants_raw, list) or not 1 <= len(plants_raw) <= MAX_PLANTS:
        return None
    names = ("rev", "seed", "updatedAt", "coins", "fertilizer", "bugAt", "nextId")
    if not all(_number(raw.get(name)) for name in names):
        return None
    if raw["rev"] < 1 or raw["coins"] < 0 or raw["fertilizer"] < 0 or raw["bugAt"] < 0:
        return None
    plants = [_restore_plant(plant, now) for plant in plants_raw]
    if None in plants or len({plant["id"] for plant in plants}) != len(plants):
        return None
    return {
        "v": 3,
        "rev": math.floor(raw["rev"]),
        "seed": _u32(raw["seed"]),
        "updatedAt": min(raw["updatedAt"], now),
        "coins": math.floor(raw["coins"]),
        "fertilizer": min(MAX_FERTILIZER, math.floor(raw["fertilizer"])),
        "bugAt": min(raw["bugAt"], now + BUG_MIN_MS + BUG_SPAN_MS),
        "nextId": max(math.floor(raw["nextId"]), *(plant["id"] + 1 for plant in plants)),
        "plants": plants,
    }


def is_newer(a: Garden, b: Garden) -> bool:
    """True when `a` is a later version of the garden than `b`."""
    return a["rev"] > b["rev"] or (a["rev"] == b["rev"] and a["updatedAt"] > b["updatedAt"])


def settle(plant: Plant, now: int) -> Plant:
    """Bank growth up to `now`. Only watered time counts, fed time counts half again, the species sets
    the pace, the pot caps it, and a clock moved backwards adds none."""
    end = min(now, plant["hydratedUntil"])
    span = max(0, end - plant["updatedAt"])
    fed = max(0, min(end, plant["fedUntil"]) - plant["updatedAt"])
    gain = math.floor((span + math.floor(fed / 2)) * KINDS[plant["kind"]]["rate"] / 100)
    growth = min(_pot_limit(plant), plant["growthMs"] + gain)
    return {**plant, "growthMs": max(plant["growthMs"], growth), "updatedAt": max(plant["updatedAt"], now)}


def lean_of(plant: Plant, now: int) -> float:
    """How far a plant leans toward the light: 0 is upright, 1 is as far as it goes."""
    return _clamp(plant["leanAt"] + max(0, now - plant["turnedAt"]) / LEAN_MS, -1, 1)


def node_count(plant: Plant) -> int:
    return _nodes_at(plant["growthMs"])


def value_of(plant: Plant) -> int:
    """What a plant sells for: more as it grows, and more for the slower species."""
    base = 5 + 20 * _stage_of(plant["growthMs"]) + math.floor(4 * plant["growthMs"] / DAY)
    return math.floor(base * KINDS[plant["kind"]]["worth"] / 100)


def _can_pick(plant: Plant, now: int) -> bool:
    return _stage_of(plant["growthMs"]) == 3 and now < plant["hydratedUntil"] and now - plant["pickedAt"] >= PICK_MS


def _can_prune(plant: Plant) -> bool:
    cuts = plant["cuts"]
    return len(cuts) < MAX_CUTS and not (cuts and cuts[-1] >= node_count(plant))


# Care rules. Each takes a settled plant and returns what changed, or done False and why not.


def _no(message: str) -> dict[str, Any]:
    return {"done": False, "message": message}


def _water(plant: Plant, now: int, garden: Garden) -> dict[str, Any]:
    kind = KINDS[plant["kind"]]
    thirsty = plant["hydratedUntil"] - now <= kind["thirsty"]
    return {
        "change": {"hydratedUntil": now + kind["hydrated"]},
        "coins": WATER_COINS if thirsty else 0,
        "done": True,
        "message": f"Watered. Good for {_plural(kind['hydrated'] // DAY, 'day')}.",
    }


def _prune(plant: Plant, now: int, garden: Garden) -> dict[str, Any]:
    """Cut the tallest tip. New growth must appear between cuts, so a plant can't be pruned to nothing."""
    if not _can_prune(plant):
        return _no("Nothing new to prune yet.")
    return {
        "change": {"cuts": [*plant["cuts"], node_count(plant)]},
        "coins": KINDS[plant["kind"]]["clip"],
        "done": True,
        "message": "Pruned. New shoots will branch from the cut.",
    }


def _rotate(plant: Plant, now: int, garden: Garden) -> dict[str, Any]:
    """Turn the pot. The lean it had now points away from the light, and it grows back the other way."""
    return {"change": {"leanAt": -lean_of(plant, now), "turnedAt": now}, "done": True, "message": "Turned the pot. It will straighten up."}


def _feed(plant: Plant, now: int, garden: Garden) -> dict[str, Any]:
    """Use one fertilizer: a jump of growth now, and faster growth for two days."""
    if now < plant["fedUntil"]:
        return _no("Still using the last fertilizer.")
    if garden["fertilizer"] < 1:
        return _no("No fertilizer left. The shop sells it.")
    boost = math.floor(FEED_BOOST_MS * KINDS[plant["kind"]]["rate"] / 100)
    return {
        "change": {"fedUntil": now + FED_MS, "growthMs": min(_pot_limit(plant), plant["growthMs"] + boost)},
        "done": True,
        "fertilizer": -1,
        "message": "Fertilized. A burst of growth now, and faster growth for two days.",
    }


def _repot(plant: Plant, now: int, garden: Garden) -> dict[str, Any]:
    if plant["pot"] >= len(POTS) - 1:
        return _no("Already in the largest pot.")
    if plant["growthMs"] < REPOT_READY * _pot_limit(plant):
        return _no("The roots still have room.")
    return {"change": {"pot": plant["pot"] + 1}, "done": True, "message": f"Moved to the {POTS[plant['pot'] + 1][0]}."}


def _pick(plant: Plant, now: int, garden: Garden) -> dict[str, Any]:
    """Pick what a fully grown plant has made. It needs two days to make more."""
    if _stage_of(plant["growthMs"]) < 3:
        return _no("Nothing to pick until it is fully grown.")
    if now >= plant["hydratedUntil"]:
        return _no("Too dry to pick from. Water it first.")
    if now - plant["pickedAt"] < PICK_MS:
        return _no("Picked not long ago. Give it two days.")
    return {
        "change": {"pickedAt": now},
        "coins": math.floor(PICK_COINS * KINDS[plant["kind"]]["worth"] / 100),
        "done": True,
        "message": "Picked and sold.",
    }


_CARE: dict[str, Callable[[Plant, int, Garden], dict[str, Any]]] = {
    "feed": _feed,
    "pick": _pick,
    "prune": _prune,
    "repot": _repot,
    "rotate": _rotate,
    "water": _water,
}
CARE_ACTIONS = ("water", "prune", "rotate", "feed", "repot", "pick")
ACTIONS = (*CARE_ACTIONS, "sell", "buy", "shoo")
SHOP_ITEMS = (*KIND_IDS, "fertilizer")


def choose(garden: Garden, action: str, now: int) -> int:
    """The index of the plant an action should go to when none is named: the one that wants it most."""
    plants = [settle(plant, now) for plant in garden["plants"]]

    def best(score: Callable[[Plant], float]) -> int:
        found = 0
        for i, plant in enumerate(plants):
            if score(plant) > score(plants[found]):
                found = i
        return found

    def first(test: Callable[[Plant], bool]) -> int:
        return next((i for i, plant in enumerate(plants) if test(plant)), 0)

    if action == "water":
        return best(lambda plant: -(plant["hydratedUntil"] - now))
    if action == "prune":
        return best(lambda plant: node_count(plant) - (plant["cuts"][-1] if plant["cuts"] else 0))
    if action == "rotate":
        return best(lambda plant: lean_of(plant, now))
    if action == "feed":
        return first(lambda plant: plant["fedUntil"] <= now < plant["hydratedUntil"])
    if action == "repot":
        return first(lambda plant: plant["pot"] < len(POTS) - 1 and plant["growthMs"] >= REPOT_READY * _pot_limit(plant))
    if action == "pick":
        return first(lambda plant: _can_pick(plant, now))
    return -1


def bug_on(garden: Garden, now: int) -> int | None:
    """The id of the plant a bug is sitting on, or None."""
    if now < garden["bugAt"]:
        return None
    return garden["plants"][math.floor(garden["bugAt"] / 60_000) % len(garden["plants"])]["id"]


def _fail(garden: Garden, message: str, plant: int | None = None) -> dict[str, Any]:
    return {"garden": garden, "done": False, "message": message, "coins": 0, "plant": plant}


def _commit(garden: Garden, now: int, **change: Any) -> Garden:
    return {**garden, **change, "rev": garden["rev"] + 1, "updatedAt": max(garden["updatedAt"], now)}


def _buy(garden: Garden, item: Any, now: int) -> dict[str, Any]:
    if item == "fertilizer":
        if garden["fertilizer"] >= MAX_FERTILIZER:
            return _fail(garden, "The shelf is full of fertilizer already.")
        if garden["coins"] < FERTILIZER_PRICE:
            return _fail(garden, f"Fertilizer costs {FERTILIZER_PRICE} coins. You have {garden['coins']}.")
        after = _commit(garden, now, coins=garden["coins"] - FERTILIZER_PRICE, fertilizer=garden["fertilizer"] + 1)
        return {"garden": after, "done": True, "message": "Bought one fertilizer.", "coins": -FERTILIZER_PRICE, "plant": None}
    kind = _kind(item)
    if not kind:
        return _fail(garden, f"The shop sells: {', '.join(SHOP_ITEMS)}.")
    if len(garden["plants"]) >= MAX_PLANTS:
        return _fail(garden, "The garden is full. Sell a plant to make room.")
    if garden["coins"] < kind["price"]:
        return _fail(garden, f"A {kind['name']} costs {kind['price']} coins. You have {garden['coins']}.")
    plant_id = garden["nextId"]
    seed = (plant_id * _GOLDEN + garden["seed"]) & _MASK
    plants = [*garden["plants"], _new_plant(plant_id, item, seed, now)]
    after = _commit(garden, now, coins=garden["coins"] - kind["price"], nextId=plant_id + 1, plants=plants)
    return {"garden": after, "done": True, "message": f"Planted a {kind['name']}.", "coins": -kind["price"], "plant": plant_id}


def _sell(garden: Garden, index: int, now: int) -> dict[str, Any]:
    if len(garden["plants"]) < 2:
        return _fail(garden, "This is your only plant. Keep it.", garden["plants"][index]["id"])
    plant = settle(garden["plants"][index], now)
    coins = value_of(plant)
    plants = [p for i, p in enumerate(garden["plants"]) if i != index]
    after = _commit(garden, now, coins=garden["coins"] + coins, plants=plants)
    message = f"Sold the {KINDS[plant['kind']]['name']} for {_plural(coins, 'coin')}."
    return {"garden": after, "done": True, "message": message, "coins": coins, "plant": plant["id"]}


def _shoo(garden: Garden, now: int) -> dict[str, Any]:
    plant = bug_on(garden, now)
    if plant is None:
        return _fail(garden, "No bugs about.")
    after = _commit(garden, now, coins=garden["coins"] + BUG_COINS)
    after["bugAt"] = _next_bug(garden["seed"], after["rev"], now)
    return {"garden": after, "done": True, "message": f"Shooed the bug away. +{_plural(BUG_COINS, 'coin')}.", "coins": BUG_COINS, "plant": plant}


def tend(garden: Garden, action: str, now: int, plant: int | None = None, item: str | None = None) -> dict[str, Any]:
    """Run one action on the garden. `plant` is a plant id, and when it is left out the action goes to
    the plant that wants it most. `item` is what to buy. Returns a dict with the garden after, `done`,
    a line to show (`message`), the coins gained or spent (`coins`) and the id of the plant it touched
    (`plant`, or None). The garden passed in is never changed."""
    if action == "buy":
        return _buy(garden, item, now)
    if action == "shoo":
        return _shoo(garden, now)
    if action != "sell" and not (isinstance(action, str) and action in _CARE):
        return _fail(garden, f"Actions are: {', '.join(ACTIONS)}.")
    if action == "sell" and plant is None:
        return _fail(garden, "Say which plant to sell.")
    if plant is None:
        index = choose(garden, action, now)
    else:
        index = next((i for i, p in enumerate(garden["plants"]) if p["id"] == plant), -1)
    if index < 0:
        return _fail(garden, "There is no such plant.")
    if action == "sell":
        return _sell(garden, index, now)

    settled = settle(garden["plants"][index], now)
    result = _CARE[action](settled, now, garden)
    if not result["done"]:
        return _fail(garden, result["message"], settled["id"])
    coins = result.get("coins", 0)
    plants = [{**settled, **result["change"]} if i == index else p for i, p in enumerate(garden["plants"])]
    after = _commit(garden, now, coins=garden["coins"] + coins, fertilizer=garden["fertilizer"] + result.get("fertilizer", 0), plants=plants)
    message = f"{result['message']} +{_plural(coins, 'coin')}." if coins else result["message"]
    return {"garden": after, "done": True, "message": message, "coins": coins, "plant": settled["id"]}


def describe_plant(plant: Plant, now: int) -> dict[str, Any]:
    kind = KINDS[plant["kind"]]
    settled = settle(plant, now)
    days = settled["growthMs"] / DAY
    left = plant["hydratedUntil"] - now
    limit = _pot_limit(settled)
    root_bound = settled["growthMs"] >= limit
    lean = lean_of(plant, now)
    dry = left <= 0
    thirsty = left <= kind["thirsty"]
    stage = _stage_of(settled["growthMs"])
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
    needs = [name for name, wanted in (("water", thirsty), ("repot", root_bound), ("rotate", lean >= LEAN_NOTICE)) if wanted]
    stage_name = STAGES[stage][0] or kind["last"]
    if stage < 3 or dry:
        show = "none"
    else:
        show = "full" if now - plant["pickedAt"] >= PICK_MS and not thirsty else "bud"
    return {
        "id": plant["id"],
        "kind": plant["kind"],
        "kindName": kind["name"],
        "canPick": _can_pick(settled, now),
        "canPrune": _can_prune(settled),
        "canRepot": settled["pot"] < len(POTS) - 1 and settled["growthMs"] >= REPOT_READY * limit,
        "days": days,
        "droop": 0.2 + 0.8 * min(1, -left / DROOP_FULL_MS) if dry else 0.1 if thirsty else 0,
        "fed": now < plant["fedUntil"],
        "growing": not dry and not root_bound,
        "lean": lean,
        "mood": mood,
        "name": f"{stage_name} {kind['name']}",
        "needs": needs,
        "nodes": node_count(settled),
        "pot": settled["pot"],
        "potName": POTS[settled["pot"]][0],
        "show": show,
        "stage": stage,
        "stageName": stage_name,
        "value": value_of(settled),
        "waterHours": max(0, _js_round(left / HOUR)),
    }


def describe(garden: Garden, now: int) -> dict[str, Any]:
    plants = [describe_plant(plant, now) for plant in garden["plants"]]
    return {
        "bug": bug_on(garden, now),
        "coins": garden["coins"],
        "fertilizer": garden["fertilizer"],
        "needy": sum(1 for plant in plants if plant["needs"]),
        "plants": plants,
        "room": MAX_PLANTS - len(plants),
    }


_MOODS = {
    "droopy": "dry and drooping, growth paused",
    "happy": "happy",
    "leaning": "leaning toward the light",
    "root-bound": "root-bound, growth paused",
    "thirsty": "getting thirsty",
}


def summarize_plant(view: dict[str, Any]) -> str:
    """One plain sentence about a plant, for labels and the chat."""
    return f"{view['name']} in a {view['potName']}, {_MOODS[view['mood']]}"


def summarize(view: dict[str, Any]) -> str:
    """One plain sentence about the whole garden, for the status bar, the pet and the chat."""
    plants = "; ".join(f"{i + 1}. {summarize_plant(plant)}" for i, plant in enumerate(view["plants"]))
    bug = "" if view["bug"] is None else " A bug is sitting on one of them."
    return f"{_plural(len(view['plants']), 'plant')}, {_plural(view['coins'], 'coin')}, {view['fertilizer']} fertilizer. {plants}.{bug}"
