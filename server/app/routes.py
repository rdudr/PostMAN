"""The API: accounts, reports, and what the field apps send.

Everything the report editor needs is here and nothing else. The shapes are
deliberately close to what the editor already holds in the browser, so the
cloud is a place to keep the work rather than a second model of it.
"""
from __future__ import annotations

import datetime as dt
from typing import Any

import base64
import os

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator

from . import db
from .security import User, admin_only, current_user, hash_password, make_token, verify_password

router = APIRouter()

_EMAIL_RE = __import__("re").compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _iso(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, dt.datetime):
        return v.replace(microsecond=0).isoformat(sep=" ")
    return str(v)[:19]


# ── health ───────────────────────────────────────────────────────────────────

@router.get("/health")
def health() -> dict:
    users = db.one("SELECT COUNT(*) FROM users")
    reports = db.one("SELECT COUNT(*) FROM reports WHERE archived = 0")
    return {"ok": True, "engine": "postgres" if db.IS_PG else "sqlite",
            "users": users[0] if users else 0, "reports": reports[0] if reports else 0}


# ── accounts ─────────────────────────────────────────────────────────────────

class _WithEmail(BaseModel):
    """An address is checked here rather than by a library: the shape that
    matters is 'something@something.something', and a dependency that only
    does that is a dependency to install on the server for nothing."""
    email: str

    @field_validator("email")
    @classmethod
    def _email_looks_like_one(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("That does not look like an email address.")
        return v


class LoginIn(_WithEmail):
    password: str


class NewUserIn(_WithEmail):
    name: str = ""
    password: str = Field(min_length=8)
    role: str = "engineer"


class PasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


@router.post("/auth/login")
def login(body: LoginIn) -> dict:
    row = db.one("SELECT id, email, name, role, active, password_hash FROM users WHERE email = %s",
                 (body.email.lower(),))
    # The same answer whether the address is unknown or the password is wrong:
    # a login form should not tell a stranger which addresses exist.
    if not row or not row[4] or not verify_password(body.password, row[5]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "That email and password do not match.")
    db.log(row[0], "login", row[1])
    return {"token": make_token(row[0], row[1], row[3]),
            "user": {"id": row[0], "email": row[1], "name": row[2], "role": row[3]}}


@router.get("/auth/me")
def me(user: User = Depends(current_user)) -> dict:
    return {"id": user.id, "email": user.email, "name": user.name, "role": user.role}


@router.post("/auth/password")
def change_password(body: PasswordIn, user: User = Depends(current_user)) -> dict:
    row = db.one("SELECT password_hash FROM users WHERE id = %s", (user.id,))
    if not row or not verify_password(body.current_password, row[0]):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The current password is wrong.")
    db.run("UPDATE users SET password_hash = %s WHERE id = %s", (hash_password(body.new_password), user.id))
    db.log(user.id, "password-change", user.email)
    return {"ok": True}


@router.get("/users")
def list_users(_: User = Depends(admin_only)) -> list[dict]:
    return [{"id": r[0], "email": r[1], "name": r[2], "role": r[3], "active": bool(r[4]), "created_at": _iso(r[5])}
            for r in db.many("SELECT id, email, name, role, active, created_at FROM users ORDER BY created_at")]


@router.post("/users")
def add_user(body: NewUserIn, admin: User = Depends(admin_only)) -> dict:
    if db.one("SELECT id FROM users WHERE email = %s", (body.email.lower(),)):
        raise HTTPException(status.HTTP_409_CONFLICT, "There is already an account with that email.")
    if body.role not in ("admin", "engineer", "viewer"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Role must be admin, engineer or viewer.")
    uid = db.new_id()
    db.run("INSERT INTO users (id, email, name, password_hash, role) VALUES (%s, %s, %s, %s, %s)",
           (uid, body.email.lower(), body.name, hash_password(body.password), body.role))
    db.log(admin.id, "user-add", body.email)
    return {"id": uid, "email": body.email.lower(), "name": body.name, "role": body.role}


@router.delete("/users/{user_id}")
def deactivate_user(user_id: str, admin: User = Depends(admin_only)) -> dict:
    if user_id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot deactivate your own account.")
    db.run("UPDATE users SET active = 0 WHERE id = %s", (user_id,))
    db.log(admin.id, "user-deactivate", user_id)
    return {"ok": True}


# ── reports ──────────────────────────────────────────────────────────────────

class ReportIn(BaseModel):
    """The editor's whole state, with the few fields the list is built from
    lifted out so a report can be found without opening it."""
    title: str = ""
    company_name: str = ""
    financial_year: str = ""
    serial: int = 1
    report_no: str = ""
    state: dict
    note: str = ""
    version: int | None = None   # the version the editor started from


def _row_to_card(r) -> dict:
    return {"id": r[0], "title": r[1], "company_name": r[2], "financial_year": r[3], "serial": r[4],
            "report_no": r[5], "version": r[6], "updated_at": _iso(r[7]), "updated_by": r[8] or "",
            "owner_id": r[9] or "", "archived": bool(r[10])}


_CARD_COLS = ("SELECT r.id, r.title, r.company_name, r.financial_year, r.serial, r.report_no, r.version, "
              "r.updated_at, (SELECT name FROM users u WHERE u.id = r.updated_by), r.owner_id, r.archived FROM reports r")


@router.get("/reports")
def list_reports(_: User = Depends(current_user), archived: bool = False,
                 company: str = Query("", description="filter by company name")) -> list[dict]:
    sql = _CARD_COLS + " WHERE r.archived = %s"
    args: list = [1 if archived else 0]
    if company.strip():
        sql += " AND LOWER(r.company_name) LIKE %s"
        args.append("%" + company.strip().lower() + "%")
    sql += " ORDER BY r.updated_at DESC"
    return [_row_to_card(r) for r in db.many(sql, args)]


@router.post("/reports")
def create_report(body: ReportIn, user: User = Depends(current_user)) -> dict:
    rid = db.new_id()
    db.run(
        "INSERT INTO reports (id, title, company_name, financial_year, serial, report_no, state, version, owner_id, updated_by)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s, 1, %s, %s)",
        (rid, body.title, body.company_name, body.financial_year, body.serial, body.report_no,
         db.dumps(body.state), user.id, user.id),
    )
    db.run("INSERT INTO report_versions (id, report_id, version, state, note, saved_by) VALUES (%s, %s, 1, %s, %s, %s)",
           (db.new_id(), rid, db.dumps(body.state), body.note or "created", user.id))
    db.log(user.id, "report-create", rid, body.title)
    db.trail(user, "create", rid, body.company_name or body.title)
    _remember_company(body, user)
    return {"id": rid, "version": 1}


@router.get("/reports/{report_id}")
def get_report(report_id: str, _: User = Depends(current_user)) -> dict:
    r = db.one("SELECT id, title, company_name, financial_year, serial, report_no, state, version, updated_at, updated_by, owner_id"
               " FROM reports WHERE id = %s", (report_id,))
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such report.")
    db.trail(_, "open", report_id, r[2] or r[1], "version %s" % r[7])
    return {"id": r[0], "title": r[1], "company_name": r[2], "financial_year": r[3], "serial": r[4],
            "report_no": r[5], "state": db.loads(r[6]), "version": r[7], "updated_at": _iso(r[8]),
            "updated_by": r[9] or "", "owner_id": r[10] or ""}


@router.put("/reports/{report_id}")
def save_report(report_id: str, body: ReportIn, user: User = Depends(current_user)) -> dict:
    cur = db.one("SELECT version FROM reports WHERE id = %s", (report_id,))
    if not cur:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such report.")
    # Two people on one report: the second save is refused rather than
    # quietly burying the first. The editor shows both and lets a person
    # decide, which is the only honest way to settle it.
    if body.version is not None and body.version != cur[0]:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"This report has moved on since you opened it (now version {cur[0]}, you have {body.version}). "
                            "Reload it, or save a copy.")
    nxt = cur[0] + 1
    db.run(
        "UPDATE reports SET title = %s, company_name = %s, financial_year = %s, serial = %s, report_no = %s,"
        " state = %s, version = %s, updated_by = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
        (body.title, body.company_name, body.financial_year, body.serial, body.report_no,
         db.dumps(body.state), nxt, user.id, report_id),
    )
    db.run("INSERT INTO report_versions (id, report_id, version, state, note, saved_by) VALUES (%s, %s, %s, %s, %s, %s)",
           (db.new_id(), report_id, nxt, db.dumps(body.state), body.note, user.id))
    # Keep every tenth version and the last twenty, so a month of autosaves
    # does not become a gigabyte of near-identical documents.
    keep = {r[0] for r in db.many("SELECT version FROM report_versions WHERE report_id = %s ORDER BY version DESC LIMIT 20", (report_id,))}
    for (v,) in db.many("SELECT version FROM report_versions WHERE report_id = %s", (report_id,)):
        if v not in keep and v % 10 != 0:
            db.run("DELETE FROM report_versions WHERE report_id = %s AND version = %s", (report_id, v))
    # An autosave every few seconds would make an unreadable trail; the saves
    # worth reading are the ones somebody pressed.
    if (body.note or "") != "autosave":
        db.trail(user, "save", report_id, body.company_name,
                 "version %d%s" % (nxt, (" - " + body.note) if body.note else ""))
    _remember_company(body, user)
    return {"id": report_id, "version": nxt}


@router.get("/reports/{report_id}/versions")
def list_versions(report_id: str, _: User = Depends(current_user)) -> list[dict]:
    return [{"version": r[0], "note": r[1], "saved_at": _iso(r[2]), "saved_by": r[3] or ""}
            for r in db.many(
                "SELECT v.version, v.note, v.saved_at, (SELECT name FROM users u WHERE u.id = v.saved_by)"
                " FROM report_versions v WHERE v.report_id = %s ORDER BY v.version DESC", (report_id,))]


@router.get("/reports/{report_id}/versions/{version}")
def get_version(report_id: str, version: int, _: User = Depends(current_user)) -> dict:
    r = db.one("SELECT state, note, saved_at FROM report_versions WHERE report_id = %s AND version = %s",
               (report_id, version))
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such version - it may have been pruned.")
    return {"version": version, "state": db.loads(r[0]), "note": r[1], "saved_at": _iso(r[2])}


@router.delete("/reports/{report_id}")
def archive_report(report_id: str, user: User = Depends(current_user)) -> dict:
    """Archived, not deleted: a report is a client deliverable and somebody
    always wants it back. An admin can purge from the database if they must."""
    db.run("UPDATE reports SET archived = 1 WHERE id = %s", (report_id,))
    db.log(user.id, "report-archive", report_id)
    return {"ok": True}


@router.post("/reports/{report_id}/restore")
def restore_report(report_id: str, user: User = Depends(current_user)) -> dict:
    db.run("UPDATE reports SET archived = 0 WHERE id = %s", (report_id,))
    db.log(user.id, "report-restore", report_id)
    return {"ok": True}


def _remember_company(body: "ReportIn", user: User) -> None:
    """The plant a report is for, kept once in its own right. A report is
    about a company; the company outlives the report, and the next
    assessment should not begin by retyping its address."""
    name = (body.company_name or "").strip()
    if not name:
        return
    co = (body.state or {}).get("company") or {}
    fields = {
        "address": " ".join(str(co.get(k, "")) for k in ("address1", "address2") if co.get(k)).strip(),
        "area": str(co.get("area", "") or ""),
        "district": str(co.get("district", "") or ""),
        "state": str(co.get("state", "") or ""),
        "pincode": str(co.get("pincode", "") or ""),
        "contact": str(co.get("poc", "") or co.get("contact", "") or ""),
        "designation": str(co.get("pocRole", "") or co.get("designation", "") or ""),
        "phone": str(co.get("phone", "") or ""),
        "email": str(co.get("mail", "") or co.get("email", "") or ""),
    }
    row = db.one("SELECT id FROM company_profiles WHERE LOWER(name) = %s", (name.lower(),))
    if row:
        # Only fill gaps: whatever somebody typed on the company screen stands.
        for key, value in fields.items():
            if value:
                db.run("UPDATE company_profiles SET " + key + " = %s, updated_at = CURRENT_TIMESTAMP"
                       " WHERE id = %s AND COALESCE(" + key + ", '') = ''", (value, row[0]))
        return
    db.run(
        "INSERT INTO company_profiles (id, name, address, area, district, state, pincode, contact,"
        " designation, phone, email, profile, created_by)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (db.new_id(), name, fields["address"], fields["area"], fields["district"], fields["state"],
         fields["pincode"], fields["contact"], fields["designation"], fields["phone"], fields["email"],
         db.dumps(co), user.id),
    )


class CompanyIn(BaseModel):
    name: str
    address: str = ""
    area: str = ""
    district: str = ""
    state: str = ""
    pincode: str = ""
    contact: str = ""
    designation: str = ""
    phone: str = ""
    email: str = ""
    notes: str = ""


_CO_KEYS = ["id", "name", "address", "area", "district", "state", "pincode",
            "contact", "designation", "phone", "email", "notes"]
_CO_COLS = ", ".join(_CO_KEYS) + ", updated_at"


def _co(r) -> dict:
    out = {k: (r[i] or "") for i, k in enumerate(_CO_KEYS)}
    out["updated_at"] = _iso(r[len(_CO_KEYS)])
    return out


@router.get("/companies")
def list_companies(_: User = Depends(current_user)) -> list[dict]:
    out = []
    for r in db.many("SELECT " + _CO_COLS + " FROM company_profiles ORDER BY name"):
        c = _co(r)
        n = db.one("SELECT COUNT(*) FROM reports WHERE LOWER(company_name) = %s AND archived = 0",
                   (c["name"].lower(),))
        c["reports"] = n[0] if n else 0
        out.append(c)
    return out


@router.post("/companies")
def upsert_company(body: CompanyIn, user: User = Depends(current_user)) -> dict:
    name = body.name.strip()
    if not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A company needs a name.")
    vals = (body.address, body.area, body.district, body.state, body.pincode,
            body.contact, body.designation, body.phone, body.email, body.notes)
    row = db.one("SELECT id FROM company_profiles WHERE LOWER(name) = %s", (name.lower(),))
    if row:
        db.run("UPDATE company_profiles SET name=%s, address=%s, area=%s, district=%s, state=%s,"
               " pincode=%s, contact=%s, designation=%s, phone=%s, email=%s, notes=%s,"
               " updated_at=CURRENT_TIMESTAMP WHERE id=%s", (name,) + vals + (row[0],))
        db.trail(user, "company-update", None, name)
        return {"id": row[0]}
    cid = db.new_id()
    db.run("INSERT INTO company_profiles (id, name, address, area, district, state, pincode, contact,"
           " designation, phone, email, notes, created_by)"
           " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
           (cid, name) + vals + (user.id,))
    db.trail(user, "company-add", None, name)
    return {"id": cid}


# -- who did what, and when --------------------------------------------------

@router.get("/activity")
def activity(_: User = Depends(current_user), report_id: str = "",
             limit: int = Query(100, ge=1, le=500)) -> list[dict]:
    """The access trail: every report opened, created, saved or archived and
    every file a field app sent, with the person's name against it."""
    sql = "SELECT at, who_name, action, report_id, subject, detail FROM access_log WHERE 1=1"
    args: list = []
    if report_id:
        sql += " AND report_id = %s"
        args.append(report_id)
    sql += " ORDER BY at DESC LIMIT %s"
    args.append(limit)
    return [{"at": _iso(r[0]), "who": r[1] or "", "action": r[2], "report_id": r[3] or "",
             "subject": r[4] or "", "detail": r[5] or ""} for r in db.many(sql, args)]


@router.get("/reports/{report_id}/activity")
def report_activity(report_id: str, user: User = Depends(current_user),
                    limit: int = Query(100, ge=1, le=500)) -> list[dict]:
    return activity(user, report_id, limit)


# -- what the field apps send ------------------------------------------------

class UploadIn(BaseModel):
    """One file from one app. Either the parsed payload (the PQ analyser's
    bundle) or the workbook itself as base64 (FOX, Thermo-X, JET-Eff, A-CMP),
    so the report editor runs the same importer it runs on a dropped file."""
    app: str
    company_name: str = ""
    filename: str = ""
    content_type: str = ""
    summary: str = ""
    report_id: str | None = None
    payload: dict | None = None
    blob_b64: str | None = None


APPS = {"fox", "thermox", "acmp", "jeteff", "aipqa", "other"}


@router.post("/ingest")
def ingest(body: UploadIn, user: User = Depends(current_user)) -> dict:
    app = body.app.strip().lower()
    if app not in APPS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown app '{body.app}'. One of: {', '.join(sorted(APPS))}.")
    if not body.payload and not body.blob_b64:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to store - send payload or blob_b64.")
    uid = db.new_id()
    stored = None
    if body.blob_b64:
        # A workbook belongs in the uploads folder, not in a database column:
        # the folder can be opened and read by a person, it backs up with
        # everything else, and the database stays small enough to copy in a
        # second.
        ext = os.path.splitext(body.filename or "")[1][:12] or ".bin"
        path = os.path.join(db.UPLOAD_DIR, uid + ext)
        try:
            with open(path, "wb") as fh:
                fh.write(base64.b64decode(body.blob_b64))
            stored = os.path.basename(path)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That file could not be stored: %s" % exc) from exc
    db.run(
        "INSERT INTO app_uploads (id, app, company_name, report_id, filename, content_type, payload, blob_b64, summary, uploaded_by)"
        " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (uid, app, body.company_name, body.report_id, body.filename, body.content_type,
         db.dumps(body.payload), stored, body.summary, user.id),
    )
    db.log(user.id, "ingest", app, body.filename)
    db.trail(user, "upload", body.report_id, "%s - %s" % (app.upper(), body.filename or "file"), body.summary)
    return {"id": uid}


@router.get("/ingest")
def list_uploads(_: User = Depends(current_user), company: str = "", app: str = "",
                 limit: int = Query(50, ge=1, le=500)) -> list[dict]:
    sql = ("SELECT u.id, u.app, u.company_name, u.filename, u.summary, u.uploaded_at,"
           " (SELECT name FROM users x WHERE x.id = u.uploaded_by), u.report_id,"
           " CASE WHEN u.blob_b64 IS NULL THEN 0 ELSE 1 END FROM app_uploads u WHERE 1=1")
    args: list = []
    if company.strip():
        sql += " AND LOWER(u.company_name) LIKE %s"
        args.append("%" + company.strip().lower() + "%")
    if app.strip():
        sql += " AND u.app = %s"
        args.append(app.strip().lower())
    sql += " ORDER BY u.uploaded_at DESC LIMIT %s"
    args.append(limit)
    return [{"id": r[0], "app": r[1], "company_name": r[2], "filename": r[3], "summary": r[4],
             "uploaded_at": _iso(r[5]), "uploaded_by": r[6] or "", "report_id": r[7] or "",
             "has_file": bool(r[8])} for r in db.many(sql, args)]


@router.get("/ingest/{upload_id}")
def get_upload(upload_id: str, _: User = Depends(current_user)) -> dict:
    r = db.one("SELECT id, app, company_name, filename, content_type, payload, blob_b64, summary, uploaded_at"
               " FROM app_uploads WHERE id = %s", (upload_id,))
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such upload.")
    blob = r[6]
    # A row written since the uploads folder existed holds the file name;
    # the first few held the base64 itself, and still work.
    if blob and len(blob) < 300 and os.path.exists(os.path.join(db.UPLOAD_DIR, blob)):
        with open(os.path.join(db.UPLOAD_DIR, blob), "rb") as fh:
            blob = base64.b64encode(fh.read()).decode()
    return {"id": r[0], "app": r[1], "company_name": r[2], "filename": r[3], "content_type": r[4],
            "payload": db.loads(r[5]), "blob_b64": blob, "summary": r[7], "uploaded_at": _iso(r[8])}
