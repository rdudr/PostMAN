# PostMan

Detailed Energy Assessment report generator for **KISEM / IEA, IIT Gandhinagar**.

One self-contained HTML file. No build step to run it, no server, no install.
Open `index.html`, or use the deployed URL.

---

## What it does

Turns a plant visit into a signed KISEM Detailed Energy Assessment Report.

- **Bills** — drop in a 12-page PDF, twelve separate PDFs, or photographs.
  Figures are extracted and shown beside the bill itself; you check each one
  and press Verify. Nothing counts until a person has looked at it.
- **Field data** — one import door for every workbook. JET-Eff, A-CMP, or the
  module workbook you download from the app and take to site. The file is
  identified from its own contents and refused if it belongs to another plant.
  The contract with the field apps — which columns, which arithmetic has to
  stay identical on both sides, what to do when one of them changes — is
  [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md).
- **Modules** — boiler, thermic fluid heater, compressor, cooling tower,
  chiller, pumps, jet machines, lux, solar, earth pits, machine monitoring,
  SOP. Switch on only what the plant has.
- **Recommendation ledger** — every saving lives here exactly once. The
  certificate, the executive summary, the savings table and each module's
  recommendations are all views of the same rows, so no two pages can
  disagree. (The reference report we started from states two different
  headline savings four pages apart. That is the bug this design removes.)
- **Your own pages** — photos, tables, notes, placed anywhere in the report.
- **Contents page** with real page numbers, and true-A4 print.

## Layout

| | |
|---|---|
| `index.html` | the whole tool, generated — **do not edit by hand** |
| `src/p*.js`, `src/p*.html` | the source parts |
| `src/build.py` | concatenates them into `index.html` |
| `src/art/` | the KISEM cover and letterhead plates |
| `test/` | Playwright suites, bill and field-app fixtures |
| `docs/INTEGRATIONS.md` | the contract with JET-Eff and A-CMP |
| `vercel.json` | static hosting config |

### Building

```bash
python3 src/build.py      # → index.html
```

`build.py` also escapes every non-ASCII character, so the page renders
identically whether or not a charset header is sent, and asserts the output is
pure ASCII before writing.

### Testing

```bash
npm i playwright pdfjs-dist xlsx
node test/full.mjs        # 12 stages, the whole project
node test/hard.mjs        # a tabular bill layout that defeats naive parsing
node test/acmp.mjs        # the A-CMP compressor path, end to end
```

`full.mjs` covers boot, workbook import, the wrong-company guard, bill
ingestion, the verify flow, custom pages and the contents page, the ledger,
opening all 31 sections, exports, print, and three screen sizes.

## Why it is hosted

The file works opened directly, but a `file://` page has no origin, and that
one fact disables the OCR reader — it cannot load its worker or its language
model. Served over https, everything works, including reading a photographed
bill and the drag-a-box tool.

Nothing is uploaded. Every draft lives in the browser's own storage on the
machine that made it; export a draft as JSON to move it.

## Access

Vercel projects are public by default. This page carries the KISEM letterhead
artwork and IEA contact details, so if that matters, enable Deployment
Protection (Project → Settings) before sharing the link.
