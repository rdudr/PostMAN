# How to push these

I can't push from here — the sandbox refuses every repository
(`not in this session's authorized repository set`). You push; it takes about
a minute. Vercel redeploys each project on its own push.

**JET-Eff is different from the other three**: its changes are already sitting
in `C:\Users\risha\Desktop\Jet EFF` as edited files, because that folder is
connected to this session. Nothing to apply — just commit and push.

---

## 1. PostMan → `post-man-iota.vercel.app`

```bash
git clone https://github.com/rdudr/PostMAN.git
cd PostMAN
git am "C:/Users/risha/Downloads/1-PostMAN.patch"
git push origin main
cd ..
```

## 2. A-CMP → `a-cmp.vercel.app`

```bash
git clone https://github.com/rdudr/A-CMP.git
cd A-CMP
git am "C:/Users/risha/Downloads/2-A-CMP.patch"
git push origin main
cd ..
```

## 3. FOX → `fox-kisem.vercel.app`

```bash
git clone https://github.com/rdudr/fox-kisem.git
cd fox-kisem
git am "C:/Users/risha/Downloads/3-fox-kisem.patch"
git push origin main
cd ..
```

## 4. JET-Eff → `jet-eff.vercel.app` (already edited on your Desktop)

```bash
cd "C:\Users\risha\Desktop\Jet EFF"
git add lib/postman-handoff.ts lib/jet-excel.ts lib/store.ts "app/(console)/report/page.tsx" "app/(console)/jet-data/page.tsx" "app/(console)/company/page.tsx"
git commit -m "Send to PostMan; fuel cost is per kg, as everyone was already entering it"
git push origin main
```

Those six paths are named one by one on purpose. That folder has **other
uncommitted changes of yours** — `lib/auth-store.ts`, `lib/auth/jwt.ts`,
`lib/export-offline.ts`, `lib/export-pdf.ts`, `.env.example` and more — which
I have not touched and this command deliberately leaves alone. Don't
`git add -A` unless you mean to ship those too.

---

## Notes

`git am` makes the commit with its message. Nothing is overwritten, nothing is
force-pushed. Each patch was cut against the **current GitHub main** of its
repository and test-applied to a fresh clone, so it applies without conflict.
If `git am` ever stops half way, `git am --abort` puts you back exactly where
you were.

If you already have a clone, `git pull` it before applying.

---

# What is in each

## PostMAN (2 commits)

- **Data sources** — a screen that opens each field app with the plant name
  and financial year already filled, and takes its workbook back with no
  download. `src/p21_sources.js`.
- **A-CMP's own figures now win.** The importer read a subset of its columns
  and recomputed the rest, and the recomputation left out the pump-up
  temperature correction `273/(273+T)`. On the AC-02 fixture the report
  printed **196.05 CFM where the engineer's screen said 170.45** — 15 % apart,
  in a signed report, with nothing to say which was right. Thermography,
  unload power, operating days and the design figures come through now, and a
  disagreement over 3 % is printed rather than resolved silently.
- **FOX's THD was averaged across the three phases.** IEEE-519 limits a
  *phase*. A panel at 9.0 / 4.0 / 4.0 % averaged to 5.7 and **printed clean
  while one phase sat 12 % over the 8 % limit**. Worst phase now.
- **"Export this report as a workbook" was throwing** for every report.
  `baseline.water` became a month-key map when the new baseline landed, but
  the sheet spec still pointed at it, so the shared builder died — taking the
  blank template with it.
- **The tests could not be run from a clone** — every suite hard-coded
  `/home/claude/pm`. Fixed; new `acmp`, `fox` and `handoff` suites; all pass.

## A-CMP, FOX, JET-Eff

One new file each (`lib/postman-handoff.ts`) and a **Send to PostMan** button
that appears only when PostMan opened the app. It posts the same workbook the
Export button already writes — so there is one parser, not two.

JET-Eff also gets the fuel-cost fix below.

---

# The one that is worth reading twice

**JET-Eff's fuel-cost field said ₹/Ton. Everyone types the per-kg price into
it** — every sample profile holds 6.5, the per-kg price of coal. Its
arithmetic matched its label exactly, so a jet saving 5 t/yr of coal showed as
**₹32.50 instead of ₹32,500**, and every ROI built on it read in centuries.

PostMan multiplied by 1000, so its reports were right — but by luck, not by
agreement. A plant that obeyed the label and entered 6500 would have had its
savings **overstated a thousandfold** in a signed report.

The field now says **₹/kg**, both multiplications convert, and a value above
200 is flagged as a per-tonne price in a per-kg box. The two sides now agree
on purpose.

I had this backwards in the docs until I read JET-Eff's actual source. The
unit was wrong in the *label*, not in the formula, and two codebases had
agreed on a wrong reading of each other for months.

**Check your existing reports.** Any jet figure that came from JET-Eff's own
dashboard or PDF — rather than from PostMan — is 1000× too small.

---

# Two things I could not fix

**Thermo-X did not get the button.** `rdudr/-thermo-X` is not readable from
this sandbox and that folder is not connected to this session. PostMan still
opens it with the plant named and export-and-drop works as before.
`docs/HANDOFF.md` has the twenty-five lines it needs.

**Two deployments are failing, and nothing here changes that.** JET-Eff's last
production build errored — `npm run build` exited 1 — so `jet-eff.vercel.app`
is serving an older deployment. Thermo-X's is BLOCKED on an
account-configuration problem. Both predate this work. Your JET-Eff push will
only go live once that build failure is sorted.
