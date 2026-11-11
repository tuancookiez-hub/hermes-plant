"""Where the garden is kept for the agent tools.

Tools can run in a different process from the Desktop routes, so SQLite in Hermes plugin storage is
the meeting point. Desktop keeps its own copy too, so the garden still works with the backend off.
Each action raises `rev`, and the copy with the higher `rev` wins. Before the garden, the store held
one plant under the key 'plant'. That row is upgraded into a garden the first time it is read.
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


def _load(conn: Any, key: str, now: int) -> engine.Garden | None:
    row = conn.execute("SELECT value FROM state WHERE key = ?", (key,)).fetchone()
    if not row:
        return None
    try:
        return engine.restore_garden(json.loads(row[0]), now)
    except ValueError:
        return None


class Store:
    def __init__(self, connect: Callable[[], Any] = default_connect, clock: Callable[[], int] = now_ms):
        self._connect = connect
        self._clock = clock

    def _change(self, work: Callable[[engine.Garden | None, int], tuple[engine.Garden | None, Any]]) -> Any:
        """Run `work(stored garden, now)` in one write transaction. It returns (garden to save or None, result)."""
        conn = self._connect()
        try:
            conn.execute(_SCHEMA)
            conn.execute("BEGIN IMMEDIATE")
            try:
                now = self._clock()
                has_garden = conn.execute("SELECT 1 FROM state WHERE key = 'garden'").fetchone() is not None
                stored = _load(conn, "garden" if has_garden else "plant", now)
                save, result = work(stored, now)
                if save is None and stored is not None and not has_garden:
                    save = stored  # keep the upgraded plant as a garden
                if save is not None:
                    conn.execute(
                        "INSERT INTO state (key, value) VALUES ('garden', ?) "
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

    def read(self) -> tuple[engine.Garden | None, int]:
        """The stored garden, or None when nothing has been stored, and the time it was read."""
        return self._change(lambda stored, now: (None, (stored, now)))

    def act(self, action: str, plant: int | None = None, item: str | None = None) -> tuple[dict[str, Any], int]:
        """Apply one action (`plant` is a plant id), starting a garden first if there is none.

        Returns engine.tend's answer (garden, done, message, coins, plant) and the time.
        """

        def work(stored, now):
            outcome = engine.tend(stored or engine.create_garden(now), action, now, plant=plant, item=item)
            return (outcome["garden"] if outcome["done"] or stored is None else None), (outcome, now)

        return self._change(work)

    def ensure(self) -> tuple[engine.Garden, int]:
        """The stored garden, starting one if there is none."""

        def work(stored, now):
            if stored:
                return None, (stored, now)
            garden = engine.create_garden(now)
            return garden, (garden, now)

        return self._change(work)

    def offer(self, raw: Any) -> tuple[engine.Garden | None, int]:
        """Take Desktop's copy if it is newer than the stored one. Returns the garden now stored."""

        def work(stored, now):
            offered = engine.restore_garden(raw, now)
            if offered and (stored is None or engine.is_newer(offered, stored)):
                return offered, (offered, now)
            return None, (stored, now)

        return self._change(work)
