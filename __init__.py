"""Hermes Plant: a houseplant in Hermes Desktop that grows slowly in real time.

The plant on screen is desktop/plugin.js. This package adds two agent tools, so Hermes can check the
plant and tend it when asked. The rules are in plantcore/engine.py, the stored plant in
plantcore/store.py, and the routes Desktop syncs through in dashboard/plugin_api.py.
"""

from __future__ import annotations

from typing import Any

__version__ = "1.0.0"


def register(ctx: Any) -> None:
    # Imported here so that loading this package from a test runner never needs relative imports.
    from .plantcore.tools import HANDLERS, SCHEMAS, TOOLSET

    for name, handler in HANDLERS.items():
        ctx.register_tool(name=name, toolset=TOOLSET, schema=SCHEMAS[name], handler=handler, emoji="🪴")
