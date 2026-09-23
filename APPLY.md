# Getting the fix onto GitHub

Two files changed. Pick whichever route matches what you already have.

## A. You have a clone of rdudr/PostMAN (simplest)

Copy these two files over the ones in your clone, then:

```bash
git add -A
git commit -m "Turn the vertical KISEM and spine text the right way up; stop the header hitting the logo"
git push
```

| file | goes to |
|---|---|
| `index.html` | repo root — this is what Vercel serves |
| `p12_pages.js` | `src/p12_pages.js` — the source it was built from |

Vercel redeploys by itself on push. Hard-refresh the page afterwards
(Ctrl-Shift-R) — the old copy will be in your browser cache.

## B. You would rather use the full repo

Unzip `PostMAN-repo.zip`, which already has the commit made and the remote set:

```bash
cd PostMAN
git push -u origin main
```

If that is rejected as "non-fast-forward", the repo on GitHub has history mine
does not. Use route A instead — do not force-push.

## C. Let me do it

Add `rdudr/PostMAN` to this session's sources and I can push directly. The
proxy currently refuses to hand me a credential for a repo that is not on that
list, which is why I cannot.

## Without GitHub at all

Vercel → your project → Deployments → drag `index.html` in. Fastest way to see
the fix live, but the repo then trails the deployment, so do A or B afterwards.
