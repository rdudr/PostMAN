"""Add or re-password an administrator, from the server's own shell.

    cd /opt/eass/server && ../venv/bin/python scripts/create_admin.py someone@iitgn.ac.in "Their Name"

It asks for the password rather than taking it on the command line, so it
does not end up in the shell history or in `ps`.
"""
from __future__ import annotations

import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import db  # noqa: E402
from app.security import hash_password  # noqa: E402

if len(sys.argv) < 2:
    print(__doc__)
    raise SystemExit(1)

email = sys.argv[1].strip().lower()
name = sys.argv[2] if len(sys.argv) > 2 else email
pw = getpass.getpass("Password for %s: " % email)
if len(pw) < 8:
    raise SystemExit("At least eight characters, please.")
if pw != getpass.getpass("Again: "):
    raise SystemExit("Those did not match.")

db.init_db()
row = db.one("SELECT id FROM users WHERE email = %s", (email,))
if row:
    db.run("UPDATE users SET password_hash = %s, role = 'admin', active = 1 WHERE id = %s", (hash_password(pw), row[0]))
    print("Password reset, and the account is an active administrator.")
else:
    db.run("INSERT INTO users (id, email, name, password_hash, role) VALUES (%s, %s, %s, %s, 'admin')",
           (db.new_id(), email, name, hash_password(pw)))
    print("Administrator created.")
