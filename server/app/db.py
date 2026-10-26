"""The database, on two engines and one piece of SQL.

Development runs on SQLite with a file beside the code; the Oracle Cloud box
runs PostgreSQL. Both speak the same SQL here - ids are text (uuid4),
documents are JSON, timestamps are CURRENT_TIMESTAMP - so there is one set
of statements to read and reason about and no ORM to learn. The only two
differences are papered over in one place each:

    placeholders   psycopg wants %s, sqlite3 wants ?        -> q()
    JSON column    JSONB on Postgres, TEXT on SQLite        -> JSON_T / loads

DATABASE_URL decides which: postgresql://... for the server, anything else
(or nothing at all) means the local SQLite file.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from typing import Any, Iterable

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
IS_PG = DATABASE_URL.startswith("postgres")
SQLITE_PATH = os.environ.get("SQLITE_PATH", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "eass.db"))

JSON_T = "JSONB" if IS_PG else "TEXT"
_local = threading.local()


def new_id() -> str:
    return uuid.uuid4().hex


def q(sql: str) -> str:
    """One statement, written with %s, run on either engine."""
    return sql if IS_PG else sql.replace("%s", "?")


def dumps(value: Any) -> Any:
    """A document on its way into the database."""
    if value is None:
        return None
    return json.dumps(value) if not IS_PG else json.dumps(value)


def loads(value: Any) -> Any:
    """...and on its way out. Postgres hands back a dict, SQLite a string."""
    if value is None or isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return value


# ── connections ──────────────────────────────────────────────────────────────

_pg_pool = None


def _pg():
    global _pg_pool
    if _pg_pool is None:
        from psycopg_pool import ConnectionPool  # imported here so SQLite dev needs no psycopg

        _pg_pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=8, kwargs={"autocommit": True})
    return _pg_pool


@contextmanager
def conn():
    """A connection, committed on the way out, rolled back if the body raises."""
    if IS_PG:
        with _pg().connection() as c:
            yield c
        return
    c = getattr(_local, "sqlite", None)
    if c is None:
        c = sqlite3.connect(SQLITE_PATH, check_same_thread=False)
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA foreign_keys=ON")
        _local.sqlite = c
    try:
        yield c
        c.commit()
    except Exception:
        c.rollback()
        raise


def run(sql: str, args: Iterable = ()) -> None:
    with conn() as c:
        c.execute(q(sql), tuple(args))


def one(sql: str, args: Iterable = ()) -> tuple | None:
    with conn() as c:
        cur = c.execute(q(sql), tuple(args))
        return cur.fetchone()


def many(sql: str, args: Iterable = ()) -> list[tuple]:
    with conn() as c:
        cur = c.execute(q(sql), tuple(args))
        return list(cur.fetchall())


# ── schema ───────────────────────────────────────────────────────────────────
# Reports are kept as one JSON document - the editor's whole state - because
# that is what the editor loads and saves, and splitting it into forty tables
# would buy nothing but a migration every time a field is added to a form.
# What IS relational is everything you want to search, list or join on:
# who owns a report, which company and year it belongs to, who saved which
# version, and which field-app file fed it.

DDL = [
    f"""
    CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        name          TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'engineer',
        active        INTEGER NOT NULL DEFAULT 1,
        created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    f"""
    CREATE TABLE IF NOT EXISTS companies (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        address    TEXT NOT NULL DEFAULT '',
        district   TEXT NOT NULL DEFAULT '',
        state      TEXT NOT NULL DEFAULT '',
        created_by TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    f"""
    CREATE TABLE IF NOT EXISTS reports (
        id            TEXT PRIMARY KEY,
        title         TEXT NOT NULL DEFAULT '',
        company_name  TEXT NOT NULL DEFAULT '',
        company_id    TEXT,
        financial_year TEXT NOT NULL DEFAULT '',
        serial        INTEGER NOT NULL DEFAULT 1,
        report_no     TEXT NOT NULL DEFAULT '',
        state         {JSON_T},
        version       INTEGER NOT NULL DEFAULT 1,
        owner_id      TEXT,
        updated_by    TEXT,
        updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        archived      INTEGER NOT NULL DEFAULT 0
    )
    """,
    f"""
    CREATE TABLE IF NOT EXISTS report_versions (
        id         TEXT PRIMARY KEY,
        report_id  TEXT NOT NULL,
        version    INTEGER NOT NULL,
        state      {JSON_T},
        note       TEXT NOT NULL DEFAULT '',
        saved_by   TEXT,
        saved_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    f"""
    CREATE TABLE IF NOT EXISTS app_uploads (
        id           TEXT PRIMARY KEY,
        app          TEXT NOT NULL,
        company_name TEXT NOT NULL DEFAULT '',
        report_id    TEXT,
        filename     TEXT NOT NULL DEFAULT '',
        content_type TEXT NOT NULL DEFAULT '',
        payload      {JSON_T},
        blob_b64     TEXT,
        summary      TEXT NOT NULL DEFAULT '',
        uploaded_by  TEXT,
        uploaded_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS audit (
        id       TEXT PRIMARY KEY,
        at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        who      TEXT,
        what     TEXT NOT NULL,
        subject  TEXT NOT NULL DEFAULT '',
        detail   TEXT NOT NULL DEFAULT ''
    )
    """,
    "CREATE INDEX IF NOT EXISTS reports_company ON reports (company_name)",
    "CREATE INDEX IF NOT EXISTS versions_report ON report_versions (report_id, version)",
    "CREATE INDEX IF NOT EXISTS uploads_company ON app_uploads (company_name, app)",
]


def init_db() -> None:
    for stmt in DDL:
        run(stmt)


def log(who: str | None, what: str, subject: str = "", detail: str = "") -> None:
    """Who did what, kept out of the way of the thing being done."""
    try:
        run(
            "INSERT INTO audit (id, who, what, subject, detail) VALUES (%s, %s, %s, %s, %s)",
            (new_id(), who, what, subject, detail[:2000]),
        )
    except Exception:  # noqa: BLE001 - an audit line must never fail a request
        pass
