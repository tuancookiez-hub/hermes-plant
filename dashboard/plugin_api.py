"""Routes for the Desktop plant, under /api/plugins/hermes-plant/.

Every answer is HTTP 200 JSON, ``{"ok": true, ...}`` or ``{"ok": false, "error": ...}``, so the page
handles failures in one place. Handlers are plain ``def``: FastAPI runs them in its threadpool.
"""

import importlib
import importlib.util
import logging
import sys
from pathlib import Path

from fastapi import APIRouter

# Load the package under a private name: the agent loader's module name is its own business.
_ROOT = Path(__file__).resolve().parents[1]
_NAME = "_hermes_plant_http"
if _NAME not in sys.modules:
    _spec = importlib.util.spec_from_file_location(_NAME, _ROOT / "__init__.py", submodule_search_locations=[str(_ROOT)])
    _module = importlib.util.module_from_spec(_spec)
    sys.modules[_NAME] = _module
    _spec.loader.exec_module(_module)
store_module = importlib.import_module(_NAME + ".plantcore.store")

logger = logging.getLogger(__name__)
router = APIRouter()
store = store_module.Store()


def _answer(work):
    try:
        garden, now = work()
        return {"ok": True, "garden": garden, "now": now}
    except Exception as exc:  # never let a route raise: the page expects JSON either way
        logger.warning("hermes-plant: route failed (%s)", type(exc).__name__)
        return {"ok": False, "error": "The garden's storage could not be reached."}


@router.get("/state")
def state():
    return _answer(store.read)


@router.post("/state")
def offer(body: dict):
    return _answer(lambda: store.offer(body.get("garden")))
