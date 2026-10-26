"""EASS API - the KISEM energy-assessment server.

One service behind https://eassiitgn.arenergyservices.in/api: the accounts,
the reports the editor saves, and the files the field apps send. It holds
the work; the tools stay the tools.

Run it:
    uvicorn app.main:app --host 127.0.0.1 --port 8800
"""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .routes import router
from .security import SECRET, bootstrap_admin

# The browsers allowed to call this API. A report tool served from a file://
# page sends Origin: null, which is NOT in the list - that copy keeps working
# offline against its own storage, which is what it is for.
ALLOWED = [o.strip() for o in os.environ.get(
    "ALLOWED_ORIGINS",
    "https://eassiitgn.arenergyservices.in,https://post-man-iota.vercel.app,http://127.0.0.1:4173,http://localhost:4173",
).split(",") if o.strip()]

app = FastAPI(title="EASS API", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED,
    allow_credentials=False,     # the token travels in the Authorization header, not a cookie
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(router, prefix="/api")


@app.on_event("startup")
def startup() -> None:
    if not SECRET:
        raise RuntimeError(
            "SESSION_SECRET is not set. Put a long random string in the environment "
            "(see .env.example) - without it every session token would be forgeable."
        )
    db.init_db()
    bootstrap_admin()
    print("[EASS] %s, origins: %s" % ("postgres" if db.IS_PG else "sqlite " + db.SQLITE_PATH, ", ".join(ALLOWED)))
