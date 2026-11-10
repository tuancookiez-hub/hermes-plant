"""Where the plant is kept for the agent tools.

Tools can run in a different process from the Desktop routes, so SQLite in Hermes plugin storage is
the meeting point. Desktop keeps its own copy too, so the plant still works with the backend off.
Each care action raises `rev`, and the copy with the higher `rev` wins.
"""

from __future__ import annotations

import json
import time
from typing import Any, Callable

from . import engine

PLUGIN_ID = "hermes-plant"

_SCHEMA = "CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)"


def default_connect():
    from plugins.plugin_storage import plugin_db

    return plugin_db(PLUGIN_ID)


def now_ms() -> int:
    return int(time.time() * 1000)


class Store:
    def __init__(self, connect: Callable[[], Any] = default_connect, clock: Callable[[], int] = now_ms):
        self._connect = connect
        self._clock = clock

    def _change(self, work: Callable[[engine.Plant | None, int], tuple[engine.Plant | None, Any]]) -> Any:
        """Run `work(stored plant, now)` in one write transaction. It returns (plant to save or None, result)."""
        conn = self._connect()
        try:
            conn.execute(_SCHEMA)
            conn.execute("BEGIN IMMEDIATE")
            try:
                now = self._clock()
                row = conn.execute("SELECT value FROM state WHERE key = 'plant'").fetchone()
                try:
                    stored = engine.restore_plant(json.loads(row[0]), now) if row else None
                except ValueError:
                    stored = None
                save, result = work(stored, now)
                if save is not None:
                    conn.execute(
                        "INSERT INTO state (key, value) VALUES ('plant', ?) "
                        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                        (json.dumps(save, separators=(",", ":")),),
                    )
                conn.execute("COMMIT")
                return result
            except BaseException:
                conn.execute("ROLLBACK")
                raise
        finally:
            conn.close()

    def read(self) -> tuple[engine.Plant | None, int]:
        """The stored plant, or None when nothing has been stored, and the time it was read."""
        return self._change(lambda stored, now: (None, (stored, now)))

    def act(self, action: str) -> tuple[engine.Plant, bool, str, int]:
        """Apply one care action, planting a new plant first if there is none."""

        def work(stored, now):
            plant = stored or engine.create_plant(now)
            after, done, message = engine.ACTIONS[action](plant, now)
            return (after if done or stored is None else None), (after, done, message, now)

        return self._change(work)

    def ensure(self) -> tuple[engine.Plant, int]:
        """The stored plant, planting one if there is none."""

        def work(stored, now):
            if stored:
                return None, (stored, now)
            plant = engine.create_plant(now)
            return plant, (plant, now)

        return self._change(work)

    def offer(self, raw: Any) -> tuple[engine.Plant | None, int]:
        """Take Desktop's copy if it is newer than the stored one. Returns the plant now stored."""

        def work(stored, now):
            offered = engine.restore_plant(raw, now)
            if offered and (stored is None or engine.is_newer(offered, stored)):
                return offered, (offered, now)
            return None, (stored, now)

        return self._change(work)
