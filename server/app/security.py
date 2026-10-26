"""Who is asking, and may they.

Passwords are hashed with scrypt from the standard library - no bcrypt wheel
to build on an ARM box - and sessions are JWTs signed with SESSION_SECRET.
There is no open registration: the first admin comes from the environment at
startup and every other account is made by an admin.
"""
from __future__ import annotations

import base64
import datetime as dt
import hashlib
import hmac
import os
import secrets

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import db

SECRET = os.environ.get("SESSION_SECRET", "")
TOKEN_HOURS = int(os.environ.get("TOKEN_HOURS", "12"))
_bearer = HTTPBearer(auto_error=False)

# scrypt parameters: ~100 ms on a small VM, which is the point.
_N, _R, _P, _LEN = 2 ** 14, 8, 1, 32


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=_LEN)
    return "scrypt$%d$%d$%d$%s$%s" % (_N, _R, _P, base64.b64encode(salt).decode(), base64.b64encode(dk).decode())


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt_b64, hash_b64 = stored.split("$")
        if algo != "scrypt":
            return False
        dk = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt_b64),
                            n=int(n), r=int(r), p=int(p), dklen=len(base64.b64decode(hash_b64)))
        return hmac.compare_digest(dk, base64.b64decode(hash_b64))
    except Exception:  # noqa: BLE001 - a malformed hash is a failed login, not a crash
        return False


def make_token(user_id: str, email: str, role: str) -> str:
    if not SECRET:
        raise RuntimeError("SESSION_SECRET is not set - refusing to sign tokens with a blank key.")
    now = dt.datetime.now(dt.timezone.utc)
    return jwt.encode(
        {"sub": user_id, "email": email, "role": role, "iat": now, "exp": now + dt.timedelta(hours=TOKEN_HOURS)},
        SECRET, algorithm="HS256",
    )


class User:
    def __init__(self, row):
        self.id, self.email, self.name, self.role, self.active = row[0], row[1], row[2], row[3], bool(row[4])


def current_user(cred: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> User:
    if cred is None or not cred.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in first.")
    try:
        claims = jwt.decode(cred.credentials, SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Your session has expired - sign in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "That session is not valid.")
    row = db.one("SELECT id, email, name, role, active FROM users WHERE id = %s", (claims.get("sub"),))
    if not row or not row[4]:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "That account is no longer active.")
    return User(row)


def admin_only(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an administrator can do that.")
    return user


def bootstrap_admin() -> None:
    """The first account, from the environment, once. Never overwrites a
    password that is already set - changing it is a deliberate act, not a
    side effect of a restart."""
    email = os.environ.get("BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
    password = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD", "")
    if not email or not password:
        return
    if db.one("SELECT id FROM users WHERE email = %s", (email,)):
        return
    db.run(
        "INSERT INTO users (id, email, name, password_hash, role) VALUES (%s, %s, %s, %s, 'admin')",
        (db.new_id(), email, os.environ.get("BOOTSTRAP_ADMIN_NAME", "Administrator"), hash_password(password)),
    )
    db.log(None, "bootstrap-admin", email)
