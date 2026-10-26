# Publishing the EASS API through the tunnel that is already running

The AI server already reaches the world through a Cloudflare tunnel — that is
how `https://api.eassiitgn.page/docs` answers from a machine with no public
address and no hole in IITGN's firewall. The tunnel dials **out** to
Cloudflare; nothing dials in. Adding the report server is two lines and one
command, on the server itself.

## 1. The ingress rule

`cloudflared`'s config lives at `%USERPROFILE%\.cloudflared\config.yml` or
`C:\Windows\System32\config\systemprofile\.cloudflared\config.yml` when it
runs as a service (`Get-Service cloudflared | Format-List *` shows which).
Add the new hostname **above** the catch-all:

```yaml
ingress:
  - hostname: api.eassiitgn.page        # what is there today
    service: http://127.0.0.1:8000
  - hostname: eass.eassiitgn.page       # the report server
    service: http://127.0.0.1:8800
  - service: http_status:404            # must stay last
```

## 2. The DNS record

```powershell
cloudflared tunnel list                              # note the tunnel's name
cloudflared tunnel route dns <tunnel-name> eass.eassiitgn.page
Restart-Service cloudflared
```

`route dns` writes the CNAME that points the hostname at the tunnel. If the
name already exists as something else — today `eass.eassiitgn.page` answers
525, which means a record exists but no origin serves it — the command
replaces it; add `--overwrite-dns` if it refuses.

## 3. Check it from anywhere

```powershell
curl https://eass.eassiitgn.page/api/health
# {"ok":true,"engine":"sqlite","users":1,"reports":0}
```

Then open PostMan on Vercel → **Server & my reports**, and the address is
already `https://eass.eassiitgn.page`.

## Two things to get right

**CORS.** The page is served by Vercel and the API by the tunnel, so the
browser checks who is allowed to call it. `ALLOWED_ORIGINS` in `.env` must
list the PostMan addresses exactly, scheme and all:

```
ALLOWED_ORIGINS=https://post-man-iota.vercel.app,https://post-man-rdudrs-projects.vercel.app,http://127.0.0.1:4173
```

A missing entry shows up as "Cannot reach the server" in the strip and a CORS
line in the browser console — the API itself is fine.

**The front door is public.** Anyone who knows the hostname can reach
`/api/auth/login`. The accounts are real accounts — scrypt hashes, tokens
that expire — but add a Cloudflare rate-limiting rule on
`/api/auth/login` (5 requests a minute an IP) so nobody can sit there
guessing. In the Cloudflare dashboard: *Security → WAF → Rate limiting rules*.
