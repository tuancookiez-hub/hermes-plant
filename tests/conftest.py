"""Tests use a throwaway SQLite file and never import Hermes, so they need no Hermes install."""
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

T0 = 1_800_000_000_000


class Clock:
    def __init__(self):
        self.now = T0

    def __call__(self):
        return self.now


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def store(tmp_path, clock):
    from plantcore.store import Store

    path = tmp_path / "data.db"
    return Store(connect=lambda: sqlite3.connect(path), clock=clock)
