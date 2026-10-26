# EASS server — eassiitgn.arenergyservices.in

The KISEM energy-assessment server: the accounts, the reports the PostMan
editor saves, and the files the field apps send. One FastAPI service behind
nginx, with PostgreSQL beside it on the same Oracle Cloud machine.

Until this existed a report lived in one browser on one laptop. That is fine
for an evening and wrong for an assessment: nobody else can open it, a
cleared cache takes it with no warning, and the copy an engineer e-mails is
the only one anybody has. Now the browser is still where the work happens —
every keystroke is kept locally and the tool runs with no network at all —
and the server is the copy that outlives the laptop, carries the version
history, and lets the next person pick the report up.

## What it is made of

| | |
|---|---|
| `app/db.py` | the tables and the two engines: SQLite for development, PostgreSQL on the server. One set of SQL; the only differences (placeholders, the JSON column type) are handled in one place each. |
| `app/security.py` | scrypt password hashing (standard library — no wheel to build on ARM), JWT sessions, the admin bootstrap. |
| `app/routes.py` | the API: accounts, reports with versions, and what the field apps send. |
| `app/main.py` | the service: CORS allowlist, startup checks. |
| `scripts/smoke.py` | every endpoint, once, against a throwaway database. Run it before deploying. |
| `deploy/` | the systemd unit and the nginx site. |

## Running it here

```bash
cd server
python -m venv .venv && .venv/Scripts/activate      # Windows; use bin/activate elsewhere
pip install -r requirements.txt
set SESSION_SECRET=anything-long-for-development
set BOOTSTRAP_ADMIN_EMAIL=iea@iitgn.ac.in
set BOOTSTRAP_ADMIN_PASSWORD=dev-password-123
uvicorn app.main:app --port 8800
```

With `DATABASE_URL` unset it keeps everything in one folder - `KISEM
Project` on the desktop, or wherever `DATA_DIR` points:

```
KISEM Project  eass.db        reports, versions, accounts, company profiles, the trail
  uploads\       every workbook a field app or an import sent, as files
  backups  logs```

The API is then at `http://127.0.0.1:8800/api`, and PostMan's sign-in screen
will talk to it if you put that address in the **Server address** box.
For development, point `DATA_DIR` at a scratch folder so the real one is left
alone.

```bash
python scripts/smoke.py      # 50 checks, no server needed
```

## The API

| | |
|---|---|
| `POST /api/auth/login` | `{email, password}` → `{token, user}`. The token goes in `Authorization: Bearer …` on everything else. |
| `GET /api/auth/me` | who the token belongs to |
| `POST /api/auth/password` | change your own |
| `GET/POST /api/users`, `DELETE /api/users/{id}` | administrators only |
| `GET /api/reports` | the list — company, year, report number, version, who saved it last. `?archived=true`, `?company=…` |
| `POST /api/reports` | a new report: the editor's whole state as one JSON document |
| `GET /api/reports/{id}` | the state back, with its version |
| `PUT /api/reports/{id}` | save. Send the `version` you opened; if somebody else has saved since, this is refused with 409 and the editor offers to reload or keep yours as a copy. |
| `GET /api/reports/{id}/versions`, `…/versions/{n}` | the history, and any version's document |
| `DELETE /api/reports/{id}`, `POST …/restore` | archive and bring back — a report is a client deliverable, so nothing is deleted outright |
| `POST /api/ingest` | a file from a field app: `{app, company_name, filename, payload \| blob_b64, summary}` |
| `GET /api/ingest?company=…&app=…`, `GET /api/ingest/{id}` | what has been sent, and one of them back byte for byte |
| `GET /api/health` | engine, user count, report count |

Why the report is one JSON document and not forty tables: the editor loads
and saves exactly one thing — its state — and splitting that into a schema
would buy nothing but a database migration every time a field is added to a
form. What *is* relational is everything you search or join on: who owns a
report, which company and year it belongs to, who saved which version, which
app file fed it. Those are columns, indexed.

## Where it runs: the team's own machine, through the tunnel

The server is the AI machine at IITGN (`DESKTOP-UH3VCQ5`), published at
`https://eass.eassiitgn.page` by the **Cloudflare tunnel that already runs on
it**. That tunnel is how `https://api.eassiitgn.page/docs` answers today from
a machine with no public address, and it is the whole answer to the campus
firewall: cloudflared dials **out** to Cloudflare and traffic comes back down
that connection. Nothing has to be allowed in, no port forwarding, no static
IP, no conversation with the network office.

The report tool itself stays on Vercel. The page and the API are then on
different addresses, so the API has to name the page in `ALLOWED_ORIGINS` -
that is the one setting people forget.

### Putting it there

1. **Copy the code** to the server (SSH is already set up:
   `ssh ssh.eassiitgn.page`). Clone or pull `rdudr/PostMAN` to, say,
   `C:\eass
epo`, make a virtual environment beside it and install
   `server/requirements.txt`. On SQLite - the default - `psycopg` is not
   needed and can be skipped.
2. **Settings:** copy `server/.env.example` to `server/.env`. Leave
   `DATABASE_URL` blank (one SQLite file, one thing to back up), put a long
   random `SESSION_SECRET` in, set `ALLOWED_ORIGINS` to the PostMan
   addresses, and set the bootstrap admin email and password.
3. **Run it at startup:** in an administrator PowerShell,
   `deploy\windows\install-task.ps1`. It registers the `EASS-API`
   scheduled task **at startup** (not at logon - a power cut must not need
   somebody to sign in), restarts it if it dies, and checks
   `http://127.0.0.1:8800/api/health` before it finishes.
4. **Publish it:** `deploy\windows\cloudflared-ingress.md` - two lines in
   the tunnel config and one `cloudflared tunnel route dns` command.
5. **Sign in** from PostMan on Vercel, then remove the two `BOOTSTRAP_ADMIN_*`
   lines and restart the task.

### What to watch

| | |
|---|---|
| **The machine must be awake** | A desktop that sleeps takes the server with it. Set the power plan to never sleep, and check `EASS-API` and `cloudflared` are both "At startup" - `server-side\harden-server.ps1` in the remote-access folder already does most of this. |
| **Backups** | The whole of the work is the `KISEM Project` folder. Copy the database nightly - Task Scheduler, one line: `Copy-Item "$env:USERPROFILE\Desktop\KISEM Project\eass.db" "$env:USERPROFILE\Desktop\KISEM Project\backups\eass-$(Get-Date -f yyyy-MM-dd).db"` - and copy the whole folder to a separate drive weekly, because `uploads\` cannot be reconstructed. A desktop under a table is not a backup strategy. |
| **The front door is public** | Anyone who knows the hostname can reach `/api/auth/login`. Accounts are real (scrypt, expiring tokens), but add a Cloudflare rate-limiting rule on that path. |
| **Request size** | Cloudflare's free plan caps a request at 100 MB. A report carries its photographs and bill scans inside the document, so a heavy one will approach that eventually; that is when assets move out of the document. |

## If it ever moves to Oracle Cloud instead

Four of these steps are yours — an account, a card for identity
verification, a DNS record and a password — because they need your
credentials. The rest is copy and paste.

**1. The machine.** Oracle Cloud → *Compute → Instances → Create*. The Always
Free shape `VM.Standard.A1.Flex` with 2 OCPU / 12 GB and Ubuntu 22.04 is more
than this needs. Save the SSH key it offers; you cannot download it twice.
Then *Networking → Virtual Cloud Network → Security List* → add ingress rules
for TCP 80 and 443 from `0.0.0.0/0` — Oracle blocks them by default, and this
is the step that catches everyone.

**2. The subdomain.** Wherever `arenergyservices.in` is hosted, add:

```
Type  A
Name  eassiitgn
Value <the instance's public IP>
TTL   300
```

**3. The machine's software.**

```bash
sudo apt update && sudo apt install -y python3-venv python3-pip nginx postgresql git rsync
sudo -u postgres psql -c "CREATE USER eass WITH PASSWORD 'pick-a-long-one';"
sudo -u postgres psql -c "CREATE DATABASE eass OWNER eass;"
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT     # Ubuntu images on Oracle
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT    # also carry a local firewall
sudo netfilter-persistent save

sudo useradd -r -m -d /opt/eass eass
sudo -u eass git clone https://github.com/rdudr/PostMAN.git /opt/eass/repo
sudo -u eass python3 -m venv /opt/eass/venv
sudo -u eass /opt/eass/venv/bin/pip install -r /opt/eass/repo/server/requirements.txt
sudo -u eass mkdir -p /opt/eass/server /opt/eass/web
sudo -u eass cp -r /opt/eass/repo/server/app /opt/eass/server/
sudo -u eass cp -r /opt/eass/repo/server/scripts /opt/eass/server/
sudo -u eass python3 /opt/eass/repo/src/build.py
sudo -u eass cp /opt/eass/repo/index.html /opt/eass/web/index.html
```

**4. The settings.** Copy `.env.example` to `/opt/eass/server/.env` and fill
in: the `DATABASE_URL` with the password from step 3, a `SESSION_SECRET` from
`python3 -c "import secrets; print(secrets.token_urlsafe(48))"`, and the
bootstrap admin email and password. `chmod 600 .env` — it is the one file on
the box worth protecting.

**5. The service and the site.**

```bash
sudo cp /opt/eass/repo/server/deploy/eass-api.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now eass-api
sudo cp /opt/eass/repo/server/deploy/nginx.conf /etc/nginx/conf.d/eassiitgn.conf
sudo mkdir -p /var/www/certbot
sudo nginx -t && sudo systemctl reload nginx
sudo snap install --classic certbot && sudo certbot --nginx -d eassiitgn.arenergyservices.in
```

**6. Sign in.** Open `https://eassiitgn.arenergyservices.in`, go to **Server &
my reports**, and sign in with the bootstrap account. Then remove the two
`BOOTSTRAP_ADMIN_*` lines from `.env` and `sudo systemctl restart eass-api`:
the first account exists, and leaving a password in a file is how it leaks.
Add the rest of the team from the API (`POST /api/users`) or with
`scripts/create_admin.py`.

**Deploying a change afterwards:** `sudo -u eass /opt/eass/server/scripts/deploy.sh`.

## Backups

The whole of the work is one database. A nightly dump, kept off the machine:

```bash
# /etc/cron.daily/eass-backup  (chmod +x)
pg_dump -U eass eass | gzip > /opt/eass/backups/eass-$(date +%F).sql.gz
find /opt/eass/backups -name 'eass-*.sql.gz' -mtime +30 -delete
```

Oracle's own boot-volume backups are not a substitute: they restore a
machine, not a report somebody deleted on Tuesday.

## What is deliberately not here yet

- **Photographs and bill scans still travel inside the report document** as
  data URLs, which is how the editor already holds them. It works and it is
  simple; when a report gets heavy they should move to object storage with
  the document keeping only their ids.
- **The field apps do not post to `/api/ingest` yet** — the endpoint is live
  and PostMan can already import from it, but Thermo-X, FOX, JET-Eff, A-CMP
  and AI-PQA still hand their files over directly. That is the next piece.
- **No rate limiting.** A small team behind a login does not need it; a
  public endpoint would.
