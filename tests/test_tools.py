import json
import sqlite3

import pytest

from plantcore import engine, tools
from tests.conftest import T0


@pytest.fixture
def plant_tools(store, monkeypatch):
    sent = []
    monkeypatch.setattr(tools, "store", store)
    monkeypatch.setattr(tools, "_notify", lambda action, rev: sent.append((action, rev)))
    return sent


def rich(store, clock, coins=100):
    """Give the stored garden some coins, through a newer copy from Desktop."""
    garden, _ = store.ensure()
    store.offer({**garden, "coins": coins, "rev": garden["rev"] + 1})
    return store.read()[0]


def test_status_of_a_fresh_garden_starts_it_once(plant_tools, store):
    first = json.loads(tools.plant_status({}))
    assert first["coins"] == 20 and first["fertilizer"] == 2 and first["room_for_more"] == 5
    assert first["bug_on_plant"] is None
    assert first["shop"] == {"leafy": 15, "fern": 25, "cactus": 40, "bonsai": 60, "fertilizer": 8}
    assert first["summary"].startswith("1 plant, 20 coins, 2 fertilizer. 1. seedling leafy plant")
    [plant] = first["plants"]
    assert plant["number"] == 1 and plant["kind"] == "leafy" and plant["mood"] == "happy" and plant["needs"] == []
    assert plant["growing"] is True and plant["growth_days"] == 0 and plant["water_hours_left"] == 72
    assert plant["pot"] == "seedling pot" and plant["sell_value"] == 5
    assert plant["can_repot"] is False and plant["can_prune"] is True and plant["can_pick"] is False
    garden, _ = store.read()
    assert garden["rev"] == 1
    tools.plant_status({})
    assert store.read()[0] == garden
    assert plant_tools == []


def test_water_a_thirsty_plant_earns_coins_and_tells_desktop(plant_tools, store, clock):
    tools.plant_status({})
    clock.now = T0 + 2 * engine.DAY + 12 * engine.HOUR
    assert json.loads(tools.plant_status({}))["plants"][0]["needs"] == ["water", "repot"]
    result = json.loads(tools.plant_tend({"action": "water"}))
    assert result["done"] is True and result["coins_change"] == 2 and result["coins"] == 22
    assert result["message"] == "Watered. Good for 3 days. +2 coins."
    assert result["plants"][0]["needs"] == ["repot"] and result["plants"][0]["water_hours_left"] == 72
    assert plant_tools == [("water", 2)]
    assert store.read()[0]["rev"] == 2


def test_buy_a_fern_then_tend_plant_two(plant_tools, store, clock):
    rich(store, clock)
    result = json.loads(tools.plant_tend({"action": "buy", "item": "fern"}))
    assert result["done"] is True and result["coins_change"] == -25 and result["coins"] == 75
    assert [p["kind"] for p in result["plants"]] == ["leafy", "fern"]
    assert result["room_for_more"] == 4
    clock.now = T0 + engine.DAY + 6 * engine.HOUR
    result = json.loads(tools.plant_tend({"action": "water", "plant": 2}))
    assert result["done"] is True and result["plants"][1]["water_hours_left"] == 48
    assert result["plants"][0]["water_hours_left"] == 42
    assert [n for n, _ in plant_tools] == ["buy", "water"]


def test_buy_without_enough_coins_changes_nothing(plant_tools, store):
    tools.plant_status({})
    before = store.read()[0]
    result = json.loads(tools.plant_tend({"action": "buy", "item": "bonsai"}))
    assert result["done"] is False and result["message"] == "A little tree costs 60 coins. You have 20."
    assert result["coins_change"] == 0
    assert store.read()[0] == before
    assert plant_tools == []


def test_sell_refuses_the_last_plant_and_sells_another(plant_tools, store, clock):
    rich(store, clock)
    result = json.loads(tools.plant_tend({"action": "sell", "plant": 1}))
    assert result["done"] is False and "only plant" in result["message"] and len(result["plants"]) == 1
    json.loads(tools.plant_tend({"action": "buy", "item": "leafy"}))
    result = json.loads(tools.plant_tend({"action": "sell", "plant": 2}))
    assert result["done"] is True and result["coins_change"] == 5 and len(result["plants"]) == 1
    assert json.loads(tools.plant_tend({"action": "sell"}))["message"] == "Say which plant to sell."


def test_a_refused_action_changes_nothing(plant_tools, store):
    tools.plant_status({})
    before = store.read()[0]
    result = json.loads(tools.plant_tend({"action": "repot"}))
    assert result["done"] is False and "room" in result["message"]
    assert store.read()[0] == before
    assert plant_tools == []


def test_tend_rejects_unknown_actions(plant_tools):
    assert "error" in json.loads(tools.plant_tend({"action": "burn"}))
    assert "error" in json.loads(tools.plant_tend({}))
    assert "error" in json.loads(tools.plant_tend(None))


@pytest.mark.parametrize("number", [0, 2, -1, 99, "1", 1.5, True])
def test_a_bad_plant_number_is_refused(plant_tools, store, number):
    tools.plant_status({})
    before = store.read()[0]
    result = json.loads(tools.plant_tend({"action": "water", "plant": number}))
    assert result["done"] is False and result["message"] == "There is no such plant."
    assert store.read()[0] == before and plant_tools == []


def test_tools_accept_the_extras_hermes_passes(plant_tools):
    assert "plants" in json.loads(tools.plant_status({}, task_id="t", session_id="s"))
    assert "done" in json.loads(tools.plant_tend({"action": "water"}, task_id="t"))


def test_storage_failure_is_reported_not_raised(monkeypatch):
    def broken():
        raise OSError("disk")

    monkeypatch.setattr(tools, "store", tools.Store(connect=broken))
    assert "error" in json.loads(tools.plant_status({}))
    assert "error" in json.loads(tools.plant_tend({"action": "water"}))


def test_schemas_name_every_handler():
    assert set(tools.SCHEMAS) == set(tools.HANDLERS) == {"plant_status", "plant_tend"}
    for name, schema in tools.SCHEMAS.items():
        assert schema["name"] == name and schema["parameters"]["type"] == "object"
    props = tools.SCHEMAS["plant_tend"]["parameters"]["properties"]
    assert props["action"]["enum"] == list(engine.ACTIONS)
    assert props["item"]["enum"] == ["leafy", "fern", "cactus", "bonsai", "fertilizer"]


def test_an_old_plant_row_becomes_the_first_plant(plant_tools, store, db_path):
    old = {"v": 2, "rev": 14, "seed": 4242, "plantedAt": T0 - 30 * engine.DAY, "updatedAt": T0 - 2 * engine.HOUR,
           "hydratedUntil": T0 + engine.DAY, "growthMs": 12 * engine.DAY, "cuts": [8, 15], "fedUntil": 0,
           "leanAt": 0, "turnedAt": T0 - engine.DAY, "pot": 1}
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE state (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    conn.execute("INSERT INTO state VALUES ('plant', ?)", (json.dumps(old),))
    conn.commit()
    conn.close()
    status = json.loads(tools.plant_status({}))
    [plant] = status["plants"]
    assert plant["kind"] == "leafy" and plant["growth_days"] >= 12 and status["coins"] == 20
    garden, _ = store.read()
    assert garden["v"] == 3 and garden["rev"] == 14 and garden["plants"][0]["cuts"] == [12, 26]
    conn = sqlite3.connect(db_path)
    assert conn.execute("SELECT count(*) FROM state WHERE key = 'garden'").fetchone()[0] == 1
    conn.close()


def test_desktop_copy_wins_only_when_newer(store, clock):
    mine, _ = store.ensure()
    clock.now = T0 + engine.HOUR
    desktop = engine.tend(mine, "water", clock.now)["garden"]
    assert store.offer(desktop)[0] == desktop
    assert store.offer(mine)[0] == desktop
    assert store.offer({"v": 3, "rev": 99})[0] == desktop
    assert store.offer("junk")[0] == desktop


def test_offer_into_an_empty_store_is_kept(store):
    garden = engine.create_garden(T0, 5)
    assert store.read()[0] is None
    assert store.offer(garden)[0] == garden
    assert store.read()[0] == garden


def test_corrupt_stored_data_is_replaced(store, db_path):
    store.ensure()
    conn = sqlite3.connect(db_path)
    conn.execute("UPDATE state SET value = '{bad'")
    conn.commit()
    conn.close()
    assert store.read()[0] is None
    assert store.ensure()[0]["rev"] == 1
