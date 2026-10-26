"""Every endpoint, once, against a throwaway SQLite file.

Run it before deploying and after any change to the API:

    python scripts/smoke.py

It proves the things that are easy to get wrong and expensive to discover in
front of a client: that a password actually has to match, that a stale save
is refused instead of overwriting somebody's work, that an archived report
leaves the list, and that a field-app file comes back out exactly as it went
in.
"""
from __future__ import annotations

import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

TMP = tempfile.mkdtemp(prefix="eass-smoke-")
os.environ["DATABASE_URL"] = ""
os.environ["DATA_DIR"] = TMP
os.environ["SQLITE_PATH"] = os.path.join(TMP, "smoke.db")
os.environ["SESSION_SECRET"] = "smoke-test-secret-smoke-test-secret"
os.environ["BOOTSTRAP_ADMIN_EMAIL"] = "admin@iitgn.ac.in"
os.environ["BOOTSTRAP_ADMIN_PASSWORD"] = "first-password-123"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

FAILED = []


def check(label: str, ok: bool, detail: str = "") -> None:
    print(("  ok   " if ok else "  FAIL ") + label + (("  -> " + str(detail)) if (detail and not ok) else ""))
    if not ok:
        FAILED.append(label)


with TestClient(app) as c:
    print("health")
    r = c.get("/api/health")
    check("health answers", r.status_code == 200 and r.json()["ok"], r.text)
    check("engine is sqlite for the smoke test", r.json()["engine"] == "sqlite")

    print("accounts")
    check("no token, no reports", c.get("/api/reports").status_code == 401)
    check("wrong password refused",
          c.post("/api/auth/login", json={"email": "admin@iitgn.ac.in", "password": "nope"}).status_code == 401)
    check("unknown address refused the same way",
          c.post("/api/auth/login", json={"email": "ghost@iitgn.ac.in", "password": "nope"}).status_code == 401)
    r = c.post("/api/auth/login", json={"email": "admin@iitgn.ac.in", "password": "first-password-123"})
    check("the bootstrap admin can sign in", r.status_code == 200, r.text)
    admin = {"Authorization": "Bearer " + r.json()["token"]}
    check("who am I", c.get("/api/auth/me", headers=admin).json()["role"] == "admin")

    r = c.post("/api/users", headers=admin,
               json={"email": "rahul@iitgn.ac.in", "name": "Rahul", "password": "engineer-pass-1", "role": "engineer"})
    check("admin adds an engineer", r.status_code == 200, r.text)
    check("the same address twice is refused",
          c.post("/api/users", headers=admin,
                 json={"email": "rahul@iitgn.ac.in", "name": "x", "password": "engineer-pass-1"}).status_code == 409)
    tok = c.post("/api/auth/login", json={"email": "rahul@iitgn.ac.in", "password": "engineer-pass-1"})
    check("the engineer can sign in", tok.status_code == 200, tok.text)
    eng = {"Authorization": "Bearer " + tok.json()["token"]}
    check("an engineer cannot add accounts",
          c.post("/api/users", headers=eng, json={"email": "x@y.z", "name": "x", "password": "12345678"}).status_code == 403)

    print("reports")
    state = {"meta": {"financialYear": "2026-27", "serial": 1}, "company": {"name": "Shree Mahadev Silk Mills"},
             "bills": [{"month": "Jun 26", "kwh": 486500}]}
    r = c.post("/api/reports", headers=eng,
               json={"title": "Detailed Energy Assessment", "company_name": "Shree Mahadev Silk Mills",
                     "financial_year": "2026-27", "serial": 1, "report_no": "EAR/26-27_01", "state": state})
    check("a report is created", r.status_code == 200, r.text)
    rid, v = r.json()["id"], r.json()["version"]

    got = c.get("/api/reports/" + rid, headers=eng).json()
    check("the state comes back as it went in", got["state"] == state, got.get("state"))
    check("it is version 1", got["version"] == 1)

    state2 = dict(state)
    state2["bills"] = state["bills"] + [{"month": "Jul 26", "kwh": 501200}]
    r = c.put("/api/reports/" + rid, headers=eng,
              json={"title": "Detailed Energy Assessment", "company_name": "Shree Mahadev Silk Mills",
                    "financial_year": "2026-27", "serial": 1, "report_no": "EAR/26-27_01",
                    "state": state2, "version": v, "note": "July bill"})
    check("a save moves the version on", r.status_code == 200 and r.json()["version"] == 2, r.text)

    r = c.put("/api/reports/" + rid, headers=admin,
              json={"title": "t", "company_name": "c", "financial_year": "2026-27", "serial": 1,
                    "report_no": "x", "state": {"stale": True}, "version": v})
    check("a stale save is refused, not silently applied", r.status_code == 409, r.status_code)
    check("and the good version survived it",
          c.get("/api/reports/" + rid, headers=eng).json()["state"]["bills"][1]["month"] == "Jul 26")

    versions = c.get("/api/reports/%s/versions" % rid, headers=eng).json()
    check("both versions are listed", len(versions) == 2, versions)
    old = c.get("/api/reports/%s/versions/1" % rid, headers=eng).json()
    check("an old version can be read back", len(old["state"]["bills"]) == 1)

    cards = c.get("/api/reports", headers=eng).json()
    check("the report is in the list", any(x["id"] == rid for x in cards))
    check("the list says who saved it last", cards[0]["updated_by"] == "Rahul", cards[0])
    check("filtering by company finds it", len(c.get("/api/reports?company=mahadev", headers=eng).json()) == 1)
    check("filtering by another company does not", len(c.get("/api/reports?company=acme", headers=eng).json()) == 0)

    c.delete("/api/reports/" + rid, headers=eng)
    check("an archived report leaves the list", not any(x["id"] == rid for x in c.get("/api/reports", headers=eng).json()))
    check("and is found under archived", any(x["id"] == rid for x in c.get("/api/reports?archived=true", headers=eng).json()))
    c.post("/api/reports/%s/restore" % rid, headers=eng)
    check("restore brings it back", any(x["id"] == rid for x in c.get("/api/reports", headers=eng).json()))

    print("what the field apps send")
    r = c.post("/api/ingest", headers=eng,
               json={"app": "thermox", "company_name": "Shree Mahadev Silk Mills", "filename": "thermo-x.xlsx",
                     "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                     "blob_b64": "UEsDBBQABgAIAAAAIQ==", "summary": "2 boilers, 3 tests"})
    check("a workbook is accepted", r.status_code == 200, r.text)
    up = r.json()["id"]
    check("an unknown app is refused",
          c.post("/api/ingest", headers=eng, json={"app": "nope", "payload": {}}).status_code == 400)
    check("an empty upload is refused",
          c.post("/api/ingest", headers=eng, json={"app": "fox"}).status_code == 400)
    r = c.post("/api/ingest", headers=eng,
               json={"app": "aipqa", "company_name": "Shree Mahadev Silk Mills", "filename": "REC-1.json",
                     "payload": {"format": "PostMan-PQ-JSON v1", "panel": "Main Incomer"}, "summary": "main input"})
    check("a PQ bundle is accepted", r.status_code == 200, r.text)
    lst = c.get("/api/ingest?company=mahadev", headers=eng).json()
    check("both uploads are listed", len(lst) == 2, lst)
    check("the list says which app each came from", {x["app"] for x in lst} == {"thermox", "aipqa"})
    back = c.get("/api/ingest/" + up, headers=eng).json()
    check("the workbook comes back byte for byte", back["blob_b64"] == "UEsDBBQABgAIAAAAIQ==")

    print("passwords")
    check("the wrong current password is refused",
          c.post("/api/auth/password", headers=eng,
                 json={"current_password": "wrong", "new_password": "new-engineer-pass"}).status_code == 400)
    check("a password can be changed",
          c.post("/api/auth/password", headers=eng,
                 json={"current_password": "engineer-pass-1", "new_password": "new-engineer-pass"}).status_code == 200)
    check("the new password works",
          c.post("/api/auth/login", json={"email": "rahul@iitgn.ac.in", "password": "new-engineer-pass"}).status_code == 200)
    check("the old one does not",
          c.post("/api/auth/login", json={"email": "rahul@iitgn.ac.in", "password": "engineer-pass-1"}).status_code == 401)

    print("company profiles and the trail")
    cos = c.get("/api/companies", headers=eng).json()
    check("the report's company was kept on its own", any(x["name"] == "Shree Mahadev Silk Mills" for x in cos), cos)
    check("with the reports counted against it", [x for x in cos if x["name"] == "Shree Mahadev Silk Mills"][0]["reports"] == 1)
    r = c.post("/api/companies", headers=eng,
               json={"name": "Shree Mahadev Silk Mills", "district": "Surat", "contact": "Mr Patel", "phone": "9876543210"})
    check("a profile can be filled in", r.status_code == 200, r.text)
    co = [x for x in c.get("/api/companies", headers=eng).json() if x["name"] == "Shree Mahadev Silk Mills"][0]
    check("and it keeps what was typed", co["district"] == "Surat" and co["contact"] == "Mr Patel", co)

    acts = c.get("/api/activity", headers=eng).json()
    kinds = {a["action"] for a in acts}
    check("the trail has the create, the open and the save", {"create", "open", "save"} <= kinds, kinds)
    check("every line says who", all(a["who"] for a in acts), acts[:3])
    check("the upload is in the trail too", "upload" in kinds, kinds)
    one_report = c.get("/api/reports/%s/activity" % rid, headers=eng).json()
    check("a report's own trail is just its own", all(a["report_id"] == rid for a in one_report), one_report[:2])

    print("where the data lives")
    from app import db as _db
    check("there is an uploads folder", os.path.isdir(_db.UPLOAD_DIR), _db.UPLOAD_DIR)
    files = os.listdir(_db.UPLOAD_DIR)
    check("the workbook was written to it as a file", len(files) == 1, files)
    check("the database is in the data folder", os.path.dirname(_db.SQLITE_PATH) == os.path.abspath(TMP))

print()
if FAILED:
    print("%d check(s) failed: %s" % (len(FAILED), "; ".join(FAILED)))
    sys.exit(1)
print("all checks passed")
