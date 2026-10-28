r"""The team's accounts, the same ones they use in KISEM FOX.

Everybody already has a username and password for FOX. Making them learn a
second pair for PostMan would get one of the two written on a whiteboard, so
PostMan uses the same ones - and because each person then signs in as
themselves, the activity trail can say "Rahulpatel saved the Mahadev report"
instead of "the shared account did something".

    python scripts/seed_team.py                # from server/team.json
    python scripts/seed_team.py --list         # who exists, no changes
    python scripts/seed_team.py --file other.json

The list lives in `server/team.json`, which is NOT in the repository and must
never be - this repository is public. Copy `team.example.json` to
`team.json` on the server and fill in the passwords from FOX. The file is
read, used and never written back to.

    [
      { "username": "Abhay",      "name": "Abhay",      "password": "..." },
      { "username": "Rahulpatel", "name": "Rahul Patel", "password": "..." }
    ]

`role` is optional and defaults to engineer; one person should be admin so
somebody can add an account later. Running this again updates the password
and display name of an account that already exists and leaves everything
else - their reports, their history - exactly where it was.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from app import db                      # noqa: E402
from app.security import hash_password  # noqa: E402

DEFAULT_FILE = os.path.join(ROOT, "team.json")


def load(path: str) -> list[dict]:
    if not os.path.exists(path):
        raise SystemExit(
            "No team list at %s.\n"
            "Copy team.example.json to team.json and fill in the passwords "
            "the team uses in KISEM FOX." % path)
    with open(path, encoding="utf8") as fh:
        rows = json.load(fh)
    if not isinstance(rows, list) or not rows:
        raise SystemExit("%s should be a list of accounts; see team.example.json." % path)
    for r in rows:
        if not r.get("username") or not r.get("password"):
            raise SystemExit("Every entry needs a username and a password: %r" % r)
    return rows


def seed(rows: list[dict]) -> None:
    db.init_db()
    for r in rows:
        username = str(r["username"]).strip().lower()
        name = str(r.get("name") or r["username"]).strip()
        role = str(r.get("role") or "engineer").strip()
        if role not in ("admin", "engineer", "viewer"):
            raise SystemExit("Role must be admin, engineer or viewer, not %r" % role)
        existing = db.one("SELECT id FROM users WHERE email = %s", (username,))
        if existing:
            db.run("UPDATE users SET name = %s, password_hash = %s, role = %s, active = 1 WHERE id = %s",
                   (name, hash_password(r["password"]), role, existing[0]))
            print("  updated  %-14s %s" % (username, role))
        else:
            db.run("INSERT INTO users (id, email, name, password_hash, role) VALUES (%s, %s, %s, %s, %s)",
                   (db.new_id(), username, name, hash_password(r["password"]), role))
            print("  added    %-14s %s" % (username, role))


def show() -> None:
    db.init_db()
    rows = db.many("SELECT email, name, role, active FROM users ORDER BY email")
    if not rows:
        print("  (no accounts yet)")
        return
    for email, name, role, active in rows:
        print("  %-14s %-20s %-9s %s" % (email, name, role, "" if active else "switched off"))


def from_pairs(pairs: list[str]) -> list[dict]:
    """--set Rishabh=IITGN9 --set Abhay=IITGN1 ...

    For setting the whole team up in one command, without a file to place
    first. The passwords are then in your shell history and nowhere else -
    which is the point: they must not end up in this repository, because it
    is public.
    """
    rows = []
    for p in pairs:
        if "=" not in p:
            raise SystemExit("--set wants username=password, not %r" % p)
        user, _, password = p.partition("=")
        user, password = user.strip(), password.strip()
        if not user or not password:
            raise SystemExit("--set wants username=password, not %r" % p)
        rows.append({"username": user, "name": user, "password": password,
                     "role": "admin" if user.lower() == "rishabh" else "engineer"})
    return rows


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Create or update the team's PostMan accounts.")
    ap.add_argument("--file", default=DEFAULT_FILE, help="the account list (default: server/team.json)")
    ap.add_argument("--set", action="append", default=[], metavar="USER=PASSWORD",
                    help="one account, repeatable; used instead of the file")
    ap.add_argument("--list", action="store_true", help="show the accounts that exist and change nothing")
    args = ap.parse_args()
    if args.list:
        print("accounts on this server:")
        show()
    else:
        if args.set:
            print("seeding %d account(s) from the command line" % len(args.set))
            rows = from_pairs(args.set)
        else:
            print("seeding from %s" % args.file)
            rows = load(args.file)
        seed(rows)
        print("\naccounts on this server now:")
        show()
        print("\nEverybody signs in with their FOX username and password, and can\n"
              "change their own password from Server & my reports inside PostMan.")
