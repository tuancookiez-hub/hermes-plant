"""The Python rules must give exactly what the Desktop rules give, step for step."""
import json
import math
from pathlib import Path

import pytest

from plantcore import engine

PARITY = json.loads((Path(__file__).resolve().parents[1] / "desktop-src" / "test" / "parity.json").read_text("utf-8"))


def same(a, b, where):
    """Equal, with floats compared to a tight tolerance and everything else exactly."""
    if isinstance(a, dict) and isinstance(b, dict):
        assert a.keys() == b.keys(), where
        for key in a:
            same(a[key], b[key], f"{where}.{key}")
    elif isinstance(a, list) and isinstance(b, list):
        assert len(a) == len(b), where
        for i, (x, y) in enumerate(zip(a, b)):
            same(x, y, f"{where}[{i}]")
    elif isinstance(a, float) or isinstance(b, float):
        assert not isinstance(a, bool) and not isinstance(b, bool), where
        assert math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9), f"{where}: {a!r} != {b!r}"
    else:
        assert a == b and type(a) is type(b), f"{where}: {a!r} != {b!r}"


@pytest.mark.parametrize("scenario", PARITY["scenarios"], ids=lambda s: f"seed-{s['seed']}")
def test_python_rules_match_desktop_rules(scenario):
    garden = engine.create_garden(scenario["start"], scenario["seed"])
    for index, step in enumerate(scenario["steps"]):
        where = f"step {index} ({step['action']})"
        if step["action"]:
            outcome = engine.tend(garden, step["action"], step["now"], plant=step["plant"], item=step["item"])
            garden = outcome["garden"]
            result = {key: outcome[key] for key in ("coins", "done", "message", "plant")}
            same(result, step["result"], where + " result")
        else:
            assert step["result"] is None, where
        same(garden, step["garden"], where + " garden")
        view = engine.describe(garden, step["now"])
        same(view, step["view"], where + " view")
        assert engine.summarize(view) == step["summary"], where
        assert engine.restore_garden(json.loads(json.dumps(garden)), step["now"]) is not None, where


@pytest.mark.parametrize("upgrade", PARITY["upgrades"], ids=lambda u: f"v{u['save']['v']}-seed-{u['save']['seed']}")
def test_old_saves_upgrade_the_same_way(upgrade):
    same(engine.restore_garden(upgrade["save"], upgrade["now"]), upgrade["garden"], "upgrade")
