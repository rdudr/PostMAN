# PostMan and the field apps — one contract, kept in step

PostMan prints the KISEM energy-assessment report. It does not measure
anything itself: the figures come from the field apps, each through an
Excel export, and PostMan reads those exports without anyone retyping.
That only works while both sides agree on what the file holds and how the
numbers are worked. This page is that agreement, and the rules for
changing it.

## The two rules

1. **A change on one side is a change on both.** If a field, a sheet, a
   unit, a label or a formula changes in an app's export — or PostMan
   starts needing something new (say, the Indian-standard rating class of a
   machine from FOX KISEM) — the app's export *and* PostMan's importer *and*
   the table below are changed together, in the same sitting. The same goes
   for cosmetic things: if a name, unit or verdict wording is improved in
   the report, carry it back to the app so its screen and its own PDF say
   the same thing.
2. **Every project touched is pushed to GitHub before the work is called
   done.** The repositories are the shared copies; the network share and
   any laptop are working copies. `git add -A && git commit && git push`
   in every repository you changed, and say in the commit message which
   other repository the change pairs with.

Every app carries the same two rules in its own `docs/POSTMAN*.md`, with a
pointer at the end of its `README.md`, `CLAUDE.md` and `AGENTS.md`, so
whoever (or whatever) works in that repository sees them before touching
an export or a formula.

## The apps and what PostMan takes from each

| App | Repository | Export (code) | What PostMan reads it into | PostMan code | Contract doc |
|---|---|---|---|---|---|
| **FOX KISEM** — plant electrical survey (Android / web) | `rdudr/fox-kisem` (working copy `C:\Users\risha\Desktop\fox-kisen`; older copy on the share `\\10.0.117.251\iea\FOX IITGN All\Raw\fox-kisen`) | `lib/export-offline.ts` and the server export; sheets *Company Profile, Plant Main Inputs, PCC Panels, MCC Panels, Motor Loads Clamp, Motor Loads PQ, APFC*; `Reported By:` line above each header | *Assessment of electrical distribution system*: main inputs, PCC panels and load summary, MCC panels, motor load study (clamp / PQ, load-factor verdict), APFC stage currents and remarks; the "Last uploaded data on … from …" stamp; panel names for the single line diagram | `src/p19_pq.js` — `FOX_SHEETS`, `foxRows`, `foxReporter`, `foxPanel`, `importFox`, `uploadStamp`, `buildDistSection` | `docs/POSTMAN_IMPORT.md` in FOX |
| **AI-PQA** — AI power quality analyser (FastAPI + React) | `rdudr/AI-PQA` (working copy `C:\Users\risha\Desktop\ai-power-quality-analyzer`) | **Send to PostMan** on the dashboard → `POST /api/upload/session/{id}/postman-send` (`utils/postmanSend.ts`): the server bundle (`backend/reports/postman_bundle.py`: stats, series thinned to 240 points, harmonics, events) plus the dashboard's own compliance, health, cost-of-poor-quality figures and its charts as images, parked in the PostMan queue (`services/postman_queue.py`) for **24 h**; `GET /api/upload/postman/sessions` lists the queue, `GET …/postman.json` returns a bundle as sent. Fallback: *Save bundle file instead* (JSON) or the Excel workbook `PostMan-PQ v1` | *Power quality analysis* under each main input / PCC / MCC panel (measured table, imbalance), **Measurement charts** (every chart captured from the analyser's dashboard, under the panel), then — laid out as the analyser's own audit PDF — **Standards compliance** (headline band, one table per standard with what it checks and x / n pass, clause / measured / limit / verdict / remark, verdicts-by-standard chart), **Equipment health** (score and status, component / measured / weight / score / status / finding table, score chart, recommended actions), **Cost of poor power quality** (the analyser's Cost-page arithmetic run on the tariff figures sent with the recording *or* on this report's own rates — bill analysis blended ₹/kWh, DISCOM demand slab, cost-register days — switchable per recording on the Electrical distribution page; KPIs, basis table, cost chart), **Events detected**, data quality and observations; a **Compliance** column in the PCC load summary; Annexure A only for recordings that arrived as a workbook; joined to the FOX panel by **Recording ID** | `src/p19_pq.js` — `PQ_COLS`, `pqMeta`, `importPq`, `pqLinkToPanels`, `recSummaryBlocks`, `recCharts`, `buildPqAnnexure`; `src/p19b_pqlink.js` — `importPqBundle`, `pqPullCard`, `pqComplianceBlocks`, `pqHealthBlocks`, `pqCostBlocks`, `pqEventBlocks`, `pqChartBlocks`, `pqAnnexCharts`, `pqScoreOf` | `docs/POSTMAN_EXPORT.md` in AI-PQA |
| **Thermo-X** — boiler / thermic fluid heater performance (Next.js, Android) | `rdudr/-thermo-X` (working copy `C:\Users\risha\Desktop\thermo-X`) | **Send to PostMan** on the Report page (`lib/postman-bridge.ts`, hand-off as in `HANDOFF.md`) *or* Report → *Export Excel* → `lib/data-exchange.ts` — the same bytes either way; workbook `thermo-x-v1`: sheets *Meta, Company, Fuels, Boilers, DirectTests, DirectLog, IndirectTests, IndirectSamples, InstrumentLogs* | *Performance assessment of boiler* and *… of thermic oil heater*: efficiency summary and chart, fuel laboratory analyses, per boiler name-plate, direct method (daily log, steam table, efficiency, evaporation ratio), indirect method (per-sample losses L1–L8, overall, loss chart, KANE analyser recording with the samples marked), the auto observations; a boiler whose type is *Thermic fluid heater* prints in the TFH chapter | `src/p20_thermox.js` — `importThermox`, `txAnalyseFuel`, `txSteam`, `txDirect`, `txSample`, `txIndirect`, `buildThermoxFired`, `txCard` | this page (Thermo-X section below) |
| **JET-Eff** — jet dyeing machine efficiency (Next.js, Android) | `rdudr/Jet-EFF` (working copy `C:\Users\risha\Desktop\Jet EFF`) | sheets *Company Profile* (company name, six cost parameters) and *Jet Data* (one row per jet, the app's field names) | *Jet machines* chapter: one page per jet, photographs, insulation / pump / trap / heat-exchange findings, savings recomputed with the app's `recalcJetSavings` | `src/p8_sld.js` — `importJetEff`, `parseJetRow`, `JET_FIELDS`, `recalcJet` | `docs/POSTMAN.md` in JET-Eff |
| **A-CMP** — air compressor assessment (Next.js, Android) | `rdudr/A-CMP` (working copy `C:\Users\risha\Desktop\A-CMP`) | Report → *Team Data Exchange (Excel)* → Export / Share (`lib/compressor-excel.ts`), or *Send to PostMan* through the hand-off; the same workbook is attached to every emailed report. Sheets *Company Profile* (Field / Value: `Company Name`, `Exported By`, `Export Date`, `Format` = `A-CMP v1`) and *Compressor Entries* (one row per compressor, columns = the app's field names — `COMPRESSOR_FIELDS` — plus the derived `pumpTankVolumeM3`, `pumpInletPipeVolumeM3`, `pumpOutletPipeVolumeM3`, `pumpMainVolumeM3Calc`, `luLoadHours`, `luUnloadHours`, `luTotalHours`) | *Air compressor* chapter, laid out as the app's own report: fleet summary (installed kW, rated CFM, tested, flagged), design ratings, performance test results with verdict, plant compressor profile (share of plant kW and air, plant SEC against design) with two charts; then per machine the name-plate, electrical readings loaded and unloaded, the three-reading load/unload hour meter with its load bands, the anemometer traverse, the receiver pump-up worked from the **main volume** (tank + inlet pipe + outlet pipe) with the lap table, the pressure-against-time chart, the energy drawn and the worked formula, design vs actual, the nine-point thermal survey and the observations; the "Last uploaded data on … from …" stamp | `src/p8_sld.js` — `isACmpWorkbook`, `importACmp`; `src/p22_acmp.js` — `acMainVolume`, `pipeVolumeM3`, `acLapEnergy`, `acLuRows`, `acPerf`, `buildCompressorSection`; `src/p7_modules.js` — `compressorCalc` | `docs/POSTMAN.md` in A-CMP |

Every export is recognised by its own content (a `Meta`/`PostMan` sheet or
its sheet names), never by file name, and is checked against the report's
company before anything is written. The same drop box (`importDrop` in
`src/p8_sld.js`) sits on **Import field data** and at the top of every
chapter that takes a workbook — Boiler, Thermic fluid heater, Electrical
distribution, Jet machines, Air compressor — and takes any number of files
in one go. Every importer merges by the record's own key (jet number, panel
name, machine tag + method, APFC panel + stage, recording ID, Thermo-X
record id with newest `updatedAt` winning), so the same file twice, or two
engineers' partial exports, never duplicate a row. A new importer must keep
that rule.

## Formulas that must stay identical

| Figure | Owner | Mirror |
|---|---|---|
| Boiler direct efficiency, steam table (IAPWS-IF97 rows, +0.5 kcal/kg·°C superheat, feed water 1 kcal/kg·°C), evaporation ratio | Thermo-X `lib/boiler.ts`, `lib/steam-table.ts` (from `reference/Boiler-Performance-Analysis.xlsx`) | PostMan `txDirect`, `txSteam`, `TX_STEAM` |
| Proximate → C, H, N relations; theoretical air; losses L1–L8; overall = average of samples | Thermo-X `analyseFuel`, `computeSample`, `computeIndirect` | PostMan `txAnalyseFuel`, `txSample`, `txIndirect` |
| Motor load factor and the Working OK / Acceptable / Under-loaded / Overloaded bands; APFC stage status | FOX KISEM app screens | PostMan `buildDistSection` (motor load study, APFC) |
| IEEE-519 THD limits (voltage 5 %, current 8 %), harmonic spectrum, min / avg / max | AI-PQA analytics | PostMan `IEEE`, `importPq`, `recSummaryBlocks` |
| Compliance rules (IEEE 519 THD bands, EN 50160 ±10 % voltage and 50 Hz ±1 %, PF 0.95, IEC 61000-3-14 imbalance 2 %), health scoring, event detectors | AI-PQA `frontend/src/utils/compliance.ts`, `equipmentHealth.ts` (the dashboard's figures travel with *Send to PostMan*); `backend/reports/postman_bundle.py` mirrors them for the file route | PostMan prints the bundle's verdicts as received (`p19b_pqlink.js`); it does not recompute them |
| Cost of poor quality (annual kWh × tariff, kVA × demand charge × 12, PF penalty % per 0.01 below threshold, harmonic loss 0.5 % per 1 % V-THD, kVA saving at PF 0.95) | AI-PQA `frontend/src/utils/costOfPoorQuality.ts` | PostMan `pqCostCalc` in `p19b_pqlink.js` — recomputed there so the report's own rates can be applied; must stay identical |
| Compressor FAD: anemometer `area × velocity × 2118.88` CFM; pump-up `V(m³) × (P2 − P1) / ((t/60) × 1.013)` m³/min × `273/(273+T)`, where **V is the main volume** = receiver + inlet pipe + outlet pipe and a pipe's bore is `perimeter² / 4π` (Sept 2026 — the receiver alone reads about a tenth low); design / actual SEC = kW / CFM; load kW is preferred over the test's own power meter; verdict: actual SEC more than 10 % above design is flagged | A-CMP `lib/compressor-calc.ts` (`mainVolume`, `pipeVolumeM3`, `pumpUpFad`, `lapEnergy`) and `lib/pdf-generator.ts` (`performance`, `SEC_TOLERANCE_PCT`) | PostMan `acMainVolume`, `pipeVolumeM3`, `acLapEnergy`, `acPerf` in `p22_acmp.js`, and `compressorCalc` in `p7_modules.js` |
| GERC tariff rules for the bill analysis (PF bands, demand slabs, 85 % billing demand, TOU, duty) | PostMan `src/p18_ebill.js` (from *EB Bill & Base Bills Biotech.xlsx*, sheet *Report Formet*) | — |

If a formula is corrected in one place, correct it in the other in the
same commit and re-run the figure check (a test export from the app, imported
into PostMan, must give the same numbers to the last decimal — the
`docs/POSTMAN_*` pages say how each app's check was done).

## The checklist for a change

Example: FOX KISEM gains a new column *IS rating class* for each motor, and
the report should print it.

1. **App**: add the column to the app's data model and to its export
   (`lib/export-offline.ts` and the server export in FOX), keeping the
   header text exactly as documented.
2. **PostMan**: read it in the importer (`motorRow` in `src/p19_pq.js`),
   print it where it belongs (the motor load table), rebuild with
   `python src/build.py`, and confirm on a test export that the value
   arrives and the page still lays out (no layout warning in the header
   line).
3. **Docs**: add the column to the sheet table in the app's contract doc
   and, if the meaning of the file changed, bump its format tag
   (`PostMan-PQ v2`, `thermo-x-v2`) so an old file is refused rather than
   misread.
4. **Push both repositories**, each commit naming the other.

The same four steps apply the other way round — a wording, unit or verdict
PostMan improves is carried into the app's screen and PDF.

## Thermo-X exchange file — what PostMan reads

Sheets and the columns used (all values are text in Thermo-X; blank = 0):

| Sheet | Columns |
|---|---|
| `Meta` | `format` (= `thermo-x-v1`), `exportedAt`, `exportedBy` (printed in the "Last uploaded data on … from …" line) |
| `Company` | `id, companyName, area, district, state, pincode` (company check) |
| `Fuels` | `id, name, category (solid/liquid/gas), type, dateOfTesting, analysedBy, moisture, volatileMatter, ash, gcv, carbon, hydrogen, nitrogen, sulphur, oxygen, ashFixedCarbon, ashMoisture, ashVolatileMatter, ashGcv, ashQuantity, notes, updatedAt` |
| `Boilers` | `id, name, make, model, serialNo, yearOfMake, boilerType, firingType, capacityTph, designPressure, designTemp, heatingSurface, ratedEfficiency, fuelIds (";"-separated), notes, updatedAt` |
| `DirectTests` | `id, boilerId, fuelId, name, startDate, days, fuelUnitKg, fuelUnitLabel, steamPressure, steamTemp, feedWaterTemp, steamQtyOverride, fuelQtyOverride, hoursPerDay, updatedAt` |
| `DirectLog` | `testId, date, fuelQty, waterKg` |
| `IndirectTests` | `id, boilerId, fuelId, name, testDate, dataSource (manual/instrument), humidityFactor, cpFlueGas, cpSteam, radiationLoss, instAnalyser, instSerial, instUser, instFileName, instSavedAt, updatedAt` |
| `IndirectSamples` | `testId, id, description, o2, co2, coPpm, flueTemp, ambientTemp, logNo, logTime` |
| `InstrumentLogs` | `testId, logNo, time, co, co2, o2, t1, ta` |

Records are merged by `id`, newest `updatedAt` wins — the same rule Thermo-X
uses when a teammate's file is imported — so importing two exports never
duplicates a test.
