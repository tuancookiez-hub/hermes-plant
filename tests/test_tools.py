import json

import pytest

from plantcore import engine, tools
from tests.conftest import T0


@pytest.fixture
def plant_tools(store, monkeypatch):
    sent = []
    monkeypatch.setattr(tools, "store", store)
    monkeypatch.setattr(tools, "_notify", lambda action, rev: sent.append((action, rev)))
    return sent


def test_status_plants_a_new_plant_once(plant_tools, store):
    first = json.loads(tools.plant_status({}))
    assert first["stage"] == "sapling" and first["mood"] == "happy" and first["needs"] == []
    plant, _ = store.read()
    assert plant["rev"] == 1
    tools.plant_status({})
    assert store.read()[0] == plant
    assert plant_tools == []


def test_tend_waters_and_tells_desktop(plant_tools, store, clock):
    tools.plant_status({})
    clock.now = T0 + 4 * engine.DAY
    assert json.loads(tools.plant_status({}))["needs"] == ["water"]
    result = json.loads(tools.plant_tend({"action": "water"}))
    assert result["done"] is True and result["mood"] == "happy" and result["water_hours_left"] == 72
    assert plant_tools == [("water", 2)]
    assert store.read()[0]["rev"] == 2


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


def test_tools_accept_the_extras_hermes_passes(plant_tools):
    assert "stage" in json.loads(tools.plant_status({}, task_id="t", session_id="s"))
    assert "done" in json.loads(tools.plant_tend({"action": "water"}, task_id="t"))


def test_storage_failure_is_reported_not_raised(monkeypatch):
    def broken():
        raise OSError("disk")

    monkeypatch.setattr(tools, "store", tools.Store(connect=broken))
    assert "error" in json.loads(tools.plant_status({}))
    assert "error" in json.loads(tools.plant_tend({"action": "water"}))


def test_schemas_name_every_handler():
    assert set(tools.SCHEMAS) == set(tools.HANDLERS)
    for name, schema in tools.SCHEMAS.items():
        assert schema["name"] == name and schema["parameters"]["type"] == "object"
    assert tools.SCHEMAS["plant_tend"]["parameters"]["properties"]["action"]["enum"] == sorted(engine.ACTIONS)


def test_desktop_copy_wins_only_when_newer(store, clock):
    mine, _ = store.ensure()
    desktop = engine.water(mine, T0 + engine.HOUR)[0]
    clock.now = T0 + engine.HOUR
    assert store.offer(desktop)[0] == desktop
    assert store.offer(mine)[0] == desktop
    assert store.offer({"v": 2, "rev": 99})[0] == desktop
    assert store.offer("junk")[0] == desktop


def test_offer_into_an_empty_store_is_kept(store):
    plant = engine.create_plant(T0, 5)
    assert store.read()[0] is None
    assert store.offer(plant)[0] == plant
    assert store.read()[0] == plant


def test_corrupt_stored_data_is_replaced(store, tmp_path):
    import sqlite3

    store.ensure()
    conn = sqlite3.connect(tmp_path / "data.db")
    conn.execute("UPDATE state SET value = '{bad'")
    conn.commit()
    conn.close()
    assert store.read()[0] is None
    assert store.ensure()[0]["rev"] == 1
