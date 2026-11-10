"""The Python rules must give exactly what the Desktop rules give, step for step."""
import json
from pathlib import Path

import pytest

from plantcore import engine

PARITY = json.loads((Path(__file__).resolve().parents[1] / "desktop-src" / "test" / "parity.json").read_text("utf-8"))


@pytest.mark.parametrize("scenario", PARITY["scenarios"], ids=lambda s: f"seed-{s['seed']}")
def test_python_rules_match_desktop_rules(scenario):
    plant = engine.create_plant(scenario["start"], scenario["seed"])
    for index, step in enumerate(scenario["steps"]):
        where = f"step {index} ({step['action']})"
        if step["action"]:
            plant, done, message = engine.ACTIONS[step["action"]](plant, step["now"])
            assert (done, message) == (step["done"], step["message"]), where
        assert plant == step["plant"], where
        view = engine.describe(plant, step["now"])
        assert view == pytest.approx(step["view"], rel=1e-12, abs=1e-12), where
        assert engine.summarize(view) == step["summary"], where
        assert engine.restore_plant(json.loads(json.dumps(plant)), step["now"]) is not None, where
