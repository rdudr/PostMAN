r"""A backup of the live database, taken safely, and the old ones pruned.

Why this exists rather than a Copy-Item in a scheduled task: the database
runs in WAL mode, so at any moment most of the recent work is in eass.db-wal
and not in eass.db. Copying the one file while the server is running gives
you a backup that is missing transactions, or that will not open at all - and
you find out on the day you need it.

SQLite's own online backup API is the answer. It takes a consistent snapshot
of a database that is being written to, WAL and all, and it needs no lock
that would interrupt somebody saving a report.

    python scripts/backup.py              # into DATA_DIR\backups, keep 30
    python scripts/backup.py --keep 90
    python scripts/backup.py --to D:\eass-offsite

It prints one line per run, which is what the scheduled task's log shows.
"""
from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from app import db  # noqa: E402  (after sys.path)


def take_backup(dest_dir: str, keep: int) -> str:
    if db.IS_PG:
        raise SystemExit("This database is PostgreSQL - use pg_dump, not this script.")
    if not os.path.exists(db.SQLITE_PATH):
        raise SystemExit("No database at %s - has the server ever run?" % db.SQLITE_PATH)

    os.makedirs(dest_dir, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M")
    out = os.path.join(dest_dir, "eass-%s.db" % stamp)

    # A read-only connection to the live file, and a fresh one for the copy.
    # .backup() is the online backup API: consistent, WAL included, and it
    # does not stop anybody saving while it runs.
    src = sqlite3.connect("file:%s?mode=ro" % db.SQLITE_PATH.replace("?", "%3f"), uri=True)
    try:
        with sqlite3.connect(out) as dst:
            src.backup(dst)
    finally:
        src.close()

    # Prove it opens and has the tables, because an unchecked backup is a
    # hope rather than a backup.
    check = sqlite3.connect(out)
    try:
        n = check.execute("SELECT COUNT(*) FROM reports").fetchone()[0]
        users = check.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    finally:
        check.close()

    size_mb = os.path.getsize(out) / 1048576.0
    print("%s  %.1f MB  %d report(s), %d account(s)" % (os.path.basename(out), size_mb, n, users))

    # Prune oldest first, counting only our own files.
    ours = sorted(f for f in os.listdir(dest_dir) if f.startswith("eass-") and f.endswith(".db"))
    for old in ours[:-keep] if keep > 0 else []:
        os.remove(os.path.join(dest_dir, old))
        print("  removed %s" % old)
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--to", default=db.BACKUP_DIR, help="where to write it (default: the data folder's backups\\)")
    ap.add_argument("--keep", type=int, default=30, help="how many to keep, oldest deleted first (0 = keep all)")
    args = ap.parse_args()
    take_backup(args.to, args.keep)
