# Going live, in order

Everything in this list is a step somebody has to take once. They are in the
order that gets a working, shared system soonest: each step is useful on its
own, and nothing later is needed before the team can start using the one
before it.

Steps 1 and 2 are yours — they need the machine and the DNS account. Steps 3
onward are code, and the code is already written for 1–5.

---

## 1. Start the server on the IITGN machine  *(you — 20 minutes)*

The machine is `C:\Users\risha\Desktop\AI-Server-Remote-Access`, the one the
Cloudflare tunnel already runs on. The campus firewall is not in the way:
the tunnel dials **out**, so nothing has to be opened. We proved it — the
tunnel's own `api.eassiitgn.page` answers from outside already.

```powershell
cd "C:\Users\risha\Desktop\process\The PostMan\server"
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
copy .env.example .env      # then edit it: see below
.\deploy\windows\install-task.ps1
```

`.env` needs three things and no more:

| Key | What to put |
|---|---|
| `SESSION_SECRET` | 40+ random characters. Changing it signs everybody out. |
| `BOOTSTRAP_ADMIN_EMAIL` | `iea@iitgn.ac.in` |
| `BOOTSTRAP_ADMIN_PASSWORD` | the password the team will sign in with |

That is the one and only account — see step 3. It is created on first start
and never overwritten afterwards, so changing these lines later does nothing;
the password is changed from inside PostMan.

`.env` is gitignored and must stay that way. A short password is worth
avoiding here, because once step 2 is done anyone who knows the hostname can
reach the sign-in page: the tunnel is open to the internet even though the
machine is not.

`install-task.ps1` registers **EASS-API** as a scheduled task that starts
with Windows and restarts itself if it stops, then checks
`http://127.0.0.1:8800/api/health`. Set the machine's power plan to never
sleep, or it will go quiet at night.

## 2. Point the name at it  *(you — 5 minutes)*

`eass.eassiitgn.page` resolves to Cloudflare today but has no origin behind
it, which is the 525 you see. Two commands on the machine:

```powershell
cloudflared tunnel route dns <tunnel-name> eass.eassiitgn.page
notepad "$env:USERPROFILE\.cloudflared\config.yml"   # add the ingress lines
```

The exact ingress block is in [`server/deploy/windows/cloudflared-ingress.md`](../server/deploy/windows/cloudflared-ingress.md).
Restart the tunnel, then check from any machine:

```
https://eass.eassiitgn.page/api/health   ->  {"ok":true,...}
```

While you are in the Cloudflare dashboard, add one rate-limit rule on
`/api/auth/login` — 10 requests a minute per IP. It is the only endpoint a
stranger can reach that is worth guessing at.

**After this step PostMan is usable by the whole team**, from
`https://post-man-iota.vercel.app`, with the server address already built in.

## 3. There is nothing to do here

One login is all this needs, and step 1 made it:

```
iea@iitgn.ac.in
```

That account is an admin, and the whole team signs in with it. Nothing in
PostMan asks for a second account.

Two consequences, so neither is a surprise later. The activity trail will
show the same name against every line, so it tells you *when* something was
opened or saved but not by whom. And a shared password is only as private as
the people who know it — change it from **Server & my reports** whenever
somebody leaves, which signs nobody else out.

If the team ever does want a line per person, the server already does it: an
admin adds accounts on that same screen, and the trail starts naming them.
That is an option, not a step.

## 4. Back up the folder  *(10 minutes, once)*

Everything the server keeps is in one folder — `KISEM Project` on the
machine's desktop:

```
KISEM Project\
  eass.db        the reports, versions, accounts, companies and the trail
  uploads\       every workbook a field app or an import has sent, as files
  backups\       where the nightly copy goes
  logs\
```

A backup is a copy of that folder. Schedule a nightly task that copies
`eass.db` into `backups\` with the date in the name and keeps thirty; the
command is in [`server/README.md`](../server/README.md#backups). Copy the
whole folder to a drive weekly as well, because `uploads\` is the part that
cannot be reconstructed.

## 5. Use it on a real assessment  *(the next site visit)*

Nothing more is needed. The loop works end to end today:

sign in → the sample or a new report → bills in → field workbooks in
(each one is archived on the server as it is read) → the report builds →
every change is pushed within four seconds → anybody on the team opens it
from **Home**.

If two people save the same report, the second save is refused with a
readable message and the choice to keep theirs as a copy. Nothing is
silently overwritten.

---

## 6. Make the field apps post, instead of exporting a file  *(code, per app)*

Twenty-five lines in each app, written out in
[`HANDOFF.md`](HANDOFF.md). The app keeps its own screens, its own formulas
and its own Excel export — the handoff sends **the identical bytes that
export writes**, so there is no second format to keep in step.

Order, easiest first: **Thermo-X**, **A-CMP** (both already send through the
window handoff and only need the server call), then **FOX**, **JET-Eff**,
**AI-PQA**.

## 7. Move photographs out of the report document  *(code, half a day)*

A report with forty site photographs is a large JSON document, and
Cloudflare will not carry a request over 100 MB. The endpoint to put them
behind is the one `uploads\` already uses; the report then holds ids rather
than base64. Until that is done, keep photographs reasonable — the editor
already re-encodes them.

## 8. The small ones, when they are wanted

- The finished PDF stored against its report, so a client copy can be
  re-sent without rebuilding it.
- A company screen in PostMan — the profiles are already being collected on
  the server from every report saved.

---

## If something is wrong

| What you see | What it is |
|---|---|
| `525` from `eass.eassiitgn.page` | step 2 is not done — the name exists, nothing is behind it |
| "Working in this browser only" | not signed in; the report is safe in this browser |
| "not saved — Failed to fetch" | the machine or the tunnel is down. Keep working; it retries |
| "somebody else has saved since" | exactly that. Reload theirs, or keep yours as a copy |
| The task is running but health fails | `server\deploy\windows\run-eass-api.ps1` by hand shows the error |

Run `python server/scripts/smoke.py` after any change to the API. It
exercises every endpoint against a throwaway database and says in words
what broke.
