# PostMan

KISEM Detailed Energy Assessment report generator — IEA, IIT Gandhinagar.

## The whole tool is one file

**`PostMan.html`** — double-click it. That is everything: the editor, the
report engine, the bill reader, the charts, the exports. Nothing to install,
no server, no `npm install`, no folder of parts.

To share it with a colleague, send them that one file. To keep a version,
copy it. It opens in any modern browser and keeps your draft in that browser,
so two people opening the same file each have their own work.

The same file is served online as `index.html` (repository
https://github.com/rdudr/PostMAN, deployed by Vercel on every push). Both are
built from the parts in `src/` by `python src/build.py`.

## What it needs from the internet

Nothing, to run. It will reach out for three optional things:

| | |
|---|---|
| Report fonts | falls back to close matches if unavailable |
| Spreadsheet reader | needed to import JET-Eff / A-CMP / module workbooks |
| OCR reader | only for **photographs** of bills; downloads ~5 MB the first time |

Bills supplied as PDFs are read without any of that. If the OCR reader cannot
be downloaded — no internet, or a network that blocks it — the screen says so
plainly and you read the figures off the bill, which is displayed full-size
beside the fields.

## The workflow

1. **Cover & report** — company, financial year, logo, gate photograph.
2. **Electricity bills** — built to the team's own workbook ("EB Bill &
   Base", sheet *Report Formet*): the nine yellow cells per month — month,
   units, bill amount, power factor, actual MD, energy rate, FPPA rate, night
   units, TOU units — plus the tariff header (DISCOM, consumer number,
   contract demand, tariff) are read off the bills; every other column is a
   formula or a GERC default (85 % minimum billing demand, Rs 150/260 demand
   slabs, TOU Rs 0.85, EHV 1 %, duty 15 %, the PF rebate/penalty bands). A
   Difference column reconciles the computed bill against the amount read
   off the bill, so a misread figure or a default that does not apply shows
   as red. The full analysis prints on three turned sheets in the workbook's
   layout — the reader turns the page clockwise — followed by the standard
   summary, load factors, charts, and the PF and contract-demand proposals.
   Rates not printed on a bill are derived from its charges and marked so.
2a. **Bill capture & verify** — drop in bill PDFs or photographs. Figures are
   read out automatically and shown beside the bill itself; check each one and
   press Verify. Nothing counts until a person has looked at it.
3. **Import field data** — one door for every workbook. JET-Eff, A-CMP, the
   FOX KISEM export, a PQ-analyser "PostMan export", or the module workbook
   you can download from that screen and take to site. The file is
   identified from its own contents and checked against this report's
   company before anything is written.
3a. **Single line diagram** — built from cards, not drawn: add a main input,
   then PCC panels under it, MCC panels and loads under those. Each card
   holds the rating, kW, kVA, PF, %VTHD, %ITHD and the PQ recording ID; boxes
   size themselves to their text, a provisional node is dashed, and a node
   over the IEEE-519 THD limits is outlined red. Click a box to select it and
   press Delete (or the card's Delete) — its children move up to its parent.
3b. **Electrical distribution chapter** — assembled in this order: the single
   line diagram; the demand study; one section per **plant main input** and
   then per **PCC panel**, each with *Measured at the panel* (the FOX
   figures) and *Power quality analysis* (the analyser recording: voltage,
   current, PF, THD against IEEE-519, harmonic spectrum); the PCC load
   summary with its charts; MCC panels; the motor load study split into
   clamp-meter and PQ-analyser readings, each motor marked Working OK,
   Acceptable, Under-loaded or Overloaded by its load factor; and the APFC
   panels with a stage-current chart and remarks. Every table fed by FOX
   carries "Last uploaded data on *date, time* from *person*". The full
   measurement charts for every recording go to **Annexure A** at the very
   end of the report, listed in the Contents.

   The two feeds: the **FOX KISEM** app's Excel export (sheets *Plant Main
   Inputs, PCC Panels, MCC Panels, Motor Loads Clamp, Motor Loads PQ, APFC*)
   and the **AI-PQA** analyser's *Export for PostMan* workbook (format
   `PostMan-PQ v1`, one recording per file). They are joined by the
   *Recording ID* written on the FOX panel sheet. The contracts are written
   up in `docs/POSTMAN_EXPORT.md` of the AI-PQA repository
   (https://github.com/rdudr/AI-PQA) and `docs/POSTMAN_IMPORT.md` of the FOX
   KISEM project.
4. **Modules** — switch on only the utilities the plant actually has.
5. **Recommendations** — every chapter screen ends with "Add recommendation
   to this chapter". Each one carries a title, observation and recommendation;
   optionally a normal and thermal photograph side by side, a graph, and a
   table of your own figures; then the benefit worked out in the open:

   | | |
   |---|---|
   | Technical, electrical | kW saved × hours/day = kWh/day; × working days = kWh/year |
   | Technical, thermal | units/hour × hours/day × working days, in kg, litre or scm — one block per fuel, as many as needed |
   | Monetary | kWh × ₹/kWh, plus each fuel × its ₹/unit; total is the sum |
   | Payback | investment ÷ total annual saving × 12, in months |

   The printed page shows every multiplication, so a reader can check it.
   The certificate, executive summary and savings table all read from the
   same list, so no two pages can disagree.
6. **Energy, water and GHG baseline** — one list of months chosen from
   menus (never typed) shared by every baseline table. Production in whatever
   unit the plant counts; Grid Input Energy plus any other electrical sources
   (solar, turbine); any number of fuels, each with its own unit and calorific
   value; water from a named source. TOE, specific consumption, totals and
   averages are all derived from that one set of figures, the conversion
   factors are printed under every table, and the electrical, thermal,
   overall and water tables each carry their charts. The GHG chapter's
   boundary text is standing prose with the figures filled in — Scope 1 per
   fuel plus mobile combustion, Scope 2 from the grid with on-site generation
   and renewable offsets shown. Then, as in the sample reports, SCOPE-01 is
   worked one fuel at a time — a table of month, amount, unit, factor and
   tCO₂e, then that fuel's chart, then the next fuel — SCOPE-02 the same way
   for purchased electricity, and an emission baseline with a column per
   fuel, Scope 2, the total, tCO₂e per unit of production, and its charts.
   Emission factors are asked for on the GHG screen, one per fuel and one
   for the grid.

   The Average row's specific consumption is total over total for the period,
   not the mean of the monthly ratios; a low-output month would otherwise pull
   the year's figure about out of proportion to its energy.
7. **Your own pages** — anything the generated sections cannot hold: photos,
   tables, notes, placed wherever you want in the report.
8. **Print / PDF** — true A4, one page per page.

## Also in this folder

`report design\` the KISEM cover and letterhead artwork as supplied ·
`sample bills\` test bills including a 12-month PDF ·
`sample reports\` the three reference reports the engine was derived from ·
`logos\` IITGN and KISEM marks.

These are source material, not part of the tool. PostMan.html does not read
them; you can move them anywhere.
