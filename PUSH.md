# Pushing this to GitHub

The repo is already committed here, with the remote set to
`https://github.com/rdudr/PostMAN.git`. One command sends it:

```bash
git push -u origin main
```

If GitHub asks for a password, use a personal access token, not your account
password — github.com → Settings → Developer settings → Personal access
tokens → Fine-grained → give it **Contents: read and write** on `rdudr/PostMAN`.

If `PostMAN` already has commits in it, pull first:

```bash
git pull --rebase origin main
git push -u origin main
```

## Then Vercel

vercel.com → Add New → Project → import `rdudr/PostMAN`.

Framework preset **Other**, build command **empty**, output directory **`.`**
— it is a static file, there is nothing to build. Deploy.

Every push to `main` redeploys automatically after that. To rebuild
`index.html` from the source parts first:

```bash
python3 src/build.py
git commit -am "rebuild" && git push
```
