# Send to PostMan

What a field app has to add so that data reaches the report without anyone
downloading a file. About twenty-five lines, once, in each app.

Nothing else changes. The app keeps its own screens, its own formulas, its
own Excel export. **The handoff sends the identical bytes that export
writes** — PostMan decodes them and runs the same reader a dropped file goes
through. It is a transport, not a second format, so there is no second
parser to keep in step and nothing new to break when a column is added.

| App | Repository | Fills | Address | Sends? |
|---|---|---|---|---|
| FOX | `rdudr/fox-kisem` | Panels, motors, APFC, power quality | `https://fox-kisem.vercel.app/` | yes |
| A-CMP | `rdudr/A-CMP` | Air compressor | `https://a-cmp.vercel.app/` | yes |
| JET-Eff | `rdudr/Jet-EFF` | Jet machines | `https://jet-eff.vercel.app/` | not yet |
| Thermo-X | `rdudr/-thermo-X` | Boiler, thermic fluid heater | `https://thermo-x-i7tl.vercel.app/` | not yet |

An app that does not send yet is not broken: PostMan still opens it with
the plant named, and the engineer exports and drops the file as before.
PostMan's own origin is `https://post-man-iota.vercel.app`.

Addresses live in PostMan's state, not in its code — **Data sources → Web
address**. Redeploying an app to a different URL is a field edit.

---

## 1. PostMan opens the app

`Data sources → Open <app>` opens the app in a named window with four
parameters:

```
?from=postman
&origin=https://post-man-iota.vercel.app   the window to send back to
&company=Shree%20Mahadev%20Silk%20Mills%20Pvt.%20Ltd.
&fy=2025-26
```

`company` and `fy` are there so nobody retypes the plant name, and so the
company guard has the same spelling on both sides. Use them to prefill; do
not make them read-only — the engineer on site is the one who knows.

`from=postman` is the signal to show the **Send to PostMan** button at all.
Opened normally, the app behaves exactly as it does today.

## 2. The app sends the workbook back

```js
/* ---- Send to PostMan ------------------------------------------------
   Posts the same .xlsx this app already exports, base64, to the window
   that opened us. PostMan reads it with its ordinary importer. */

const POSTMAN_ORIGINS = [
  'https://post-man-iota.vercel.app',           // production
  'https://post-man-rdudrs-projects.vercel.app',// the team alias
  'http://localhost:8801'                       // local testing
];

function postmanTarget(){
  const p = new URLSearchParams(location.search);
  if (p.get('from') !== 'postman' || !window.opener) return null;
  const o = p.get('origin');
  return POSTMAN_ORIGINS.includes(o) ? o : null;   // never trust it blind
}

function sendToPostman(){
  const target = postmanTarget();
  if (!target) return;
  const wb = buildWorkbook();                  // the export you already have
  window.opener.postMessage({
    kind:     'kisem-data',                    // required, exactly this
    format:   'A-CMP v1',                      // your own label, for the log
    company:  profile.companyName,             // shown if the guard refuses
    workbook: XLSX.write(wb, { type:'base64', bookType:'xlsx' })
  }, target);
}
```

Show the button only when `postmanTarget()` is non-null. PostMan closes the
window once the data lands, so nothing more is needed on the app's side.

### Why the origin is checked against a list

`origin` arrives in a URL, and a URL can be written by anyone. Without the
list, any site could open the app with `origin=https://collector.example`
and be handed the plant's measurements the moment the engineer pressed the
button. The list is three lines and it is the only thing standing between a
convenience and a data leak — **do not skip it, and do not replace it with a
suffix match on `.vercel.app`**, which every Vercel preview deployment in the
world satisfies.

PostMan checks the same thing from its side: a message is read only if it
came from one of the four configured app addresses. Both ends check; neither
relies on the other having done it.

## 3. What PostMan does with it

1. Decodes the base64 to bytes and reads them with SheetJS.
2. `detectWorkbook()` works out what the file is from its own contents — the
   `format` field is only printed in the log.
3. `sameCompany()` compares the plant name in the workbook with the report's.
   A different plant is **refused**, handed over or dropped; see
   `INTEGRATIONS.md`.
4. `importAny()` merges by key (`machineTag`, `jetNo`, …), so a second
   engineer's file updates rows rather than duplicating them.
5. The ledger, the summary, the certificate and the chapter all follow.

The user sees the same import log either way.

## 4. When the handoff cannot happen

It degrades to the old route, which never goes away:

| Situation | What happens |
|---|---|
| PostMan opened as a local `file://` copy | origin is `null`, the app cannot post back. PostMan says so and asks for the exported file. |
| Pop-up blocked | PostMan says so and gives the address to open by hand. |
| App not updated yet | Nothing is sent; export and drop the file. |
| Anything at all goes wrong | "Export the workbook from the app and drop it here instead." |

**Export → drop is always available and always sufficient.** The handoff
saves a download and a file dialog; it is not load-bearing.

## 5. Before wiring an app: check PostMan can read it

Adding the button is the easy half. The half that bites is whether PostMan
understands the workbook at all, and it will not say so if it does not:
`detectWorkbook()` stops at the first tab it recognises.

So each app carries `scripts/postman-bridge-check.ts`: it writes a workbook
from the app's **real** export code, with a realistic plant in it. Run it,
feed the file to PostMan, and read the import log line by line against what
you put in.

Two things have come out of doing exactly that, and neither would have been
noticed until a signed report was wrong:

- **FOX's THD was averaged across the three phases.** IEEE-519 limits a
  phase. A panel at 9.0 / 4.0 / 4.0 % averages to 5.7 and printed clean while
  one phase sat 12 % over the 8 % limit. It is now the worst phase, and
  `test/fox.mjs` pins it.
- **A-CMP's own figures were being dropped and recomputed.** The recomputation
  left out the pump-up temperature correction `273/(273+T)`, so the report
  printed 196.05 CFM where the engineer's screen said 170.45 - 15 % apart,
  with nothing to say which was right. The app's figures now win and a
  disagreement over 3 % is printed. `test/acmp.mjs` pins that.

## 6. Testing it

`test/handoff.mjs` stands up PostMan on one port and a fake field app on
another, clicks **Open A-CMP**, and checks that the workbook arrives, that it
is saved, that the company guard still fires, and that the identical message
from a third port is ignored. The fake app in that file is the snippet above;
if the contract changes, change it there and the test says whether the change
works.

```
node test/handoff.mjs
```

## 7. Keeping the two sides in step

- **JET-Eff's fuel-cost unit.** Its field said **₹/Ton** while every
  engineer typed the per-kg price into it (6.5 for coal), so its own
  dashboard read every jet saving 1000× too small — ₹32.50 for a ₹32,500
  saving, with ROIs in centuries. The field now says **₹/kg** and both
  sides multiply the same way. PostMan recomputes from the raw columns
  rather than trusting the stored `*MonitoringSaving` values, so a workbook
  exported before that fix still reads correctly.

  Worth remembering how this was found: the unit was wrong in the
  *label*, not in the arithmetic, and two codebases had agreed on the wrong
  reading of each other for months. Check the label before blaming the
  formula.
- **A field added on one side is a field added on the other.** A new column
  travels to PostMan with no code change, but nothing prints it until a
  fixture and a line of the chapter exist. See `INTEGRATIONS.md`.
