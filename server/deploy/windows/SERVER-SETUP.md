# Setting up the report server on the AI server

Everything on this page is done **on DESKTOP-UH3VCQ5**, the AI server at
IITGN — not on your own laptop. Work through it in order; each step ends with
something you can check, so you never move on wondering.

Expect 30–40 minutes the first time, most of it waiting for `pip`.

Two facts worth having before you start. The machine already runs things, and
nothing here touches them: the AI-PQA backend is the scheduled task
**FastAPI-main** on port **8000**, and the Cloudflare tunnel and SSH run as
Windows **services**. The report server is a separate task on port **8800**.
If a step ever seems to ask you to stop or reconfigure `FastAPI-main`,
`cloudflared` or `sshd`, you have misread it.

---

## 0. Get onto the machine

From your laptop, in the `AI-Server-Remote-Access` folder:

- **`2-SSH-Terminal.bat`** — a shell on the server, no password. Type
  `powershell` once inside. This is enough for every step here.
- **`1-Remote-Desktop.bat`** — the full desktop, if you would rather see it.
  Log in as `DESKTOP-UH3VCQ5\Admin`.

Leave the small minimised tunnel window alone while you work.

First, confirm you are in the right place. This is the most common mistake
and it wastes an afternoon:

```powershell
$env:COMPUTERNAME                 # DESKTOP-UH3VCQ5
Get-Service cloudflared, sshd     # both Running
Get-ScheduledTask FastAPI-main    # exists; leave it alone
```

If `COMPUTERNAME` says anything else, you are still on your own laptop. Stop.

## 1. Check what Python is there

```powershell
python --version                  # 3.10 or newer
git --version
```

If `python` is missing, install it from python.org with "Add python.exe to
PATH" ticked. If `git` is missing, skip it and use step 2b.

## 2a. Put the code on the server — with git

```powershell
cd C:\Users\Admin\Desktop
git clone https://github.com/rdudr/PostMAN.git PostMan
cd PostMan\server
```

Later updates are then one command: `git pull`.

## 2b. Or without git

On your laptop, zip the `The PostMan` folder and drag the zip onto
**`3-Upload-File-DragDropHere.bat`**. Then on the server:

```powershell
cd C:\Users\Admin\Desktop
Expand-Archive .\PostMan.zip -DestinationPath C:\Users\Admin\Desktop\PostMan
cd PostMan\server
```

## 3. The virtual environment

```powershell
python -m venv .venv
.\.venv\Scripts\pip install --upgrade pip
.\.venv\Scripts\pip install -r requirements.txt
```

Check it took:

```powershell
.\.venv\Scripts\python -c "import fastapi, jwt; print('ok')"
```

## 4. The settings file

```powershell
Copy-Item .env.example .env
notepad .env
```

Three lines matter. Everything else can stay as it is.

| Key | What to put |
|---|---|
| `SESSION_SECRET` | 64 random characters — generate it, do not invent it |
| `BOOTSTRAP_ADMIN_EMAIL` | `iea@iitgn.ac.in` |
| `BOOTSTRAP_ADMIN_PASSWORD` | the password the team signs in with |

To generate the secret:

```powershell
.\.venv\Scripts\python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Leave `DATABASE_URL` and `DATA_DIR` **blank**. The server then keeps
everything in `C:\Users\Admin\Desktop\KISEM Project` — the database, the
field apps' workbooks as files, and room for backups and logs. One folder to
copy, nothing to administer.

`ALLOWED_ORIGINS` already lists the PostMan addresses. The only reason to
touch it is a new PostMan URL, and never to widen it to every
`*.vercel.app` — that is every preview deployment of every project on Vercel.

`.env` holds a real password, so it stays on this machine. It is gitignored
and must never be committed.

## 5. Prove it runs, by hand, once

```powershell
.\deploy\windows\run-eass-api.ps1
```

It should print `Uvicorn running on http://127.0.0.1:8800`. Leave it running,
open a **second** SSH terminal, and ask it:

```powershell
curl http://127.0.0.1:8800/api/health
# {"ok":true,"engine":"sqlite","users":1,"reports":0}
```

`users: 1` is your account, created from `.env` just now. It is created once
and never overwritten, so editing those lines later does nothing — the
password is changed from inside PostMan afterwards.

Check the folder appeared:

```powershell
Get-ChildItem "C:\Users\Admin\Desktop\KISEM Project"
# backups  logs  uploads  eass.db
```

Then press Ctrl+C in the first terminal to stop it.

## 6. Make it start with Windows

```powershell
.\deploy\windows\install-task.ps1
```

That registers the scheduled task **EASS-API**: it starts at boot before
anyone logs in, restarts itself if it stops, and the script checks
`/api/health` at the end. Confirm:

```powershell
Get-ScheduledTask EASS-API | Select-Object TaskName, State
curl http://127.0.0.1:8800/api/health
```

Sleep and power settings are already handled if `harden-server.ps1` has been
run on this machine — it also installs the tunnel watchdog. If you are not
sure it has, run it; it is safe to run twice.

## 7. Publish it through the tunnel

The tunnel already carries `api.eassiitgn.page`. You are adding a second
hostname, `eass.eassiitgn.page`, pointing at port 8800. **Which of the two
ways below applies depends on how the tunnel was installed**, so find out
first:

```powershell
sc.exe qc cloudflared
```

Read the `BINARY_PATH_NAME` line:

- it contains **`--token`** → the tunnel is managed from the Cloudflare
  dashboard. Use **7a**. Editing a local `config.yml` will do nothing at all.
- it contains **`--config`**, or
  `C:\Windows\System32\config\systemprofile\.cloudflared\config.yml` exists →
  it is managed on this machine. Use **7b**.

### 7a. Dashboard-managed tunnel

In the Cloudflare dashboard, as the account that owns `eassiitgn.page`:

1. **Zero Trust → Networks → Tunnels**, and open the tunnel this machine runs
   — the one already serving `api.eassiitgn.page`.
2. **Public Hostnames → Add a public hostname.**
3. Subdomain `eass`, domain `eassiitgn.page`, path empty.
4. Service: type **HTTP**, URL **`localhost:8800`**. Plain HTTP, because the
   tunnel reaches the API over the machine's own loopback. Not https.
5. Save.

The DNS record is written for you, which also clears the 525 that
`eass.eassiitgn.page` answers today.

### 7b. Locally-managed tunnel

Edit the config the service actually reads, and put the new hostname
**above** the catch-all:

```yaml
ingress:
  - hostname: api.eassiitgn.page        # what is there today - do not change
    service: http://127.0.0.1:8000
  - hostname: eass.eassiitgn.page       # the report server
    service: http://127.0.0.1:8800
  - service: http_status:404            # must stay last
```

Then write the DNS record and restart:

```powershell
cloudflared tunnel list
cloudflared tunnel route dns <tunnel-name> eass.eassiitgn.page
Restart-Service cloudflared
```

If `route dns` refuses because a record exists, add `--overwrite-dns`.

## 8. Check it from outside

From your own laptop, not the server:

```powershell
curl https://eass.eassiitgn.page/api/health
```

A JSON answer means it is done. Open PostMan at
`https://postman-ten-beta.vercel.app` and sign in — the **Server address** box
already says `https://eass.eassiitgn.page`, so there is nothing to type.

If this is where it fails, go to the table at the bottom.

## 9. Two things to finish properly

**Rate-limit the sign-in page.** It is now on the public internet, and it is
the only thing a stranger can usefully try. Cloudflare dashboard →
**Security → WAF → Rate limiting rules**: path equals `/api/auth/login`, 10
requests a minute per IP, block for a minute. One rule, one minute of work.

**Back up the folder nightly.** Use the script, not a file copy. The
database runs in WAL mode, so most of the recent work sits in `eass.db-wal`
at any moment: copying `eass.db` on its own gives you a backup missing
transactions, and you find that out on the day you need it. The script uses
SQLite's online backup API instead, which takes a consistent snapshot while
people are still saving, then checks the result opens and says what is in it.

```powershell
.\.venv\Scripts\python scripts\backup.py
# eass-2026-10-26_0200.db  0.2 MB  2 report(s), 1 account(s)
```

In an **administrator** PowerShell, to have that happen at 2 am:

```powershell
$py  = "C:\Users\Admin\Desktop\PostMan\server\.venv\Scripts\python.exe"
$dir = "C:\Users\Admin\Desktop\PostMan\server"
$act = New-ScheduledTaskAction -Execute $py -Argument "scripts\backup.py --keep 30" -WorkingDirectory $dir
$trg = New-ScheduledTaskTrigger -Daily -At 2am
Register-ScheduledTask -TaskName "EASS-Backup" -Action $act -Trigger $trg -User "SYSTEM" -RunLevel Highest -Force
Start-ScheduledTask EASS-Backup       # once now, to prove it
Get-ChildItem "C:\Users\Admin\Desktop\KISEM Project\backups"
```

`--keep 30` deletes the oldest beyond thirty, so the folder cannot fill the
disk.

Copy the whole `KISEM Project` folder to another drive or machine every week
or two as well. A desktop under a table is not a backup.

---

## Running it day to day

| What | How |
|---|---|
| Is it alive? | `curl http://127.0.0.1:8800/api/health` on the server, or `https://eass.eassiitgn.page/api/health` from anywhere |
| Restart it | `Stop-ScheduledTask EASS-API; Start-ScheduledTask EASS-API` |
| Update the code | `cd C:\Users\Admin\Desktop\PostMan; git pull; Stop-ScheduledTask EASS-API; Start-ScheduledTask EASS-API` |
| See an error | Run `.\deploy\windows\run-eass-api.ps1` by hand in a window. The task swallows the message; a window shows it |
| Poke the API by hand | `https://eass.eassiitgn.page/api/docs` in a browser |
| After any API change | `.\.venv\Scripts\python scripts\smoke.py` — 50 checks against a throwaway database, and it says in words what broke |

## When something is wrong

| What you see | What it is |
|---|---|
| `525`, or "Cannot reach the server", from `eass.eassiitgn.page` | step 7 is not done, or the hostname points at `https://localhost:8800` instead of `http://` |
| `530` | the tunnel itself is disconnected. The watchdog restarts it within 10 minutes; `Restart-Service cloudflared` is faster |
| `502` from the tunnel, but health works on the server | the hostname points at the wrong port. 8800, not 8000 |
| Health works on the server, nothing from outside | you edited `config.yml` on a dashboard-managed tunnel. Re-read 7a and 7b |
| "Cannot reach the server" in PostMan while `curl` is fine | `ALLOWED_ORIGINS` in `.env` does not list the exact PostMan address, scheme and all. The browser refuses the call and the API never sees it |
| "Cannot reach the server" with `http://127.0.0.1:8800` in the box | an `https://` page cannot call a plain-`http` local address. Use the tunnel address, or serve PostMan locally too |
| `SESSION_SECRET is not set` on startup | `.env` is not beside `app\`, or the line is empty |
| Everybody signed out at once | `SESSION_SECRET` changed. That is also how you sign everyone out on purpose |
| Nothing works after a reboot | `Get-ScheduledTask EASS-API` — the trigger must be **At startup**, with "run whether user is logged on or not" |
| The machine was simply off | BIOS "Restore on AC Power Loss" is the only fix for a power cut, and `harden-server.ps1` cannot set it for you |

## What this does not do yet

Photographs and bill scans travel inside the report document. Cloudflare's
free plan caps a request at 100 MB, so a report carrying forty site
photographs will eventually be refused. When that day comes, the fix is to
move assets out of the document into the same `uploads\` folder the field
apps already write to — the endpoint exists.
