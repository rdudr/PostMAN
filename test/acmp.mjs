/* The A-CMP path end to end: detection, the company guard, every column,
   the app's own arithmetic winning over the recomputed one, merge by
   machineTag across two engineers' files, and the ledger row that follows. */
import { chromium } from 'playwright';
import fs from 'fs';
import { APP, XLSX_JS, fx } from './_paths.mjs';

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const pg = await b.newPage({ viewport:{ width:1500, height:1000 } });
const errs = [];
pg.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
pg.on('console', m => { if (m.type()==='error' && !/fonts\.g|ERR_TUNNEL|ERR_NAME/.test(m.text())) errs.push(m.text()); });
pg.on('dialog', d => d.dismiss());

let FAIL = 0;
const check = (label, ok, detail='') => { console.log(`  ${ok?'PASS':'FAIL'}  ${label}${detail?'  '+detail:''}`); if (!ok) FAIL++; };
const b64 = f => fs.readFileSync(f).toString('base64');

await pg.goto(APP);
await pg.addScriptTag({ path:XLSX_JS });
await pg.waitForTimeout(700);
await pg.evaluate(() => { S.compressor = []; S.company.name = 'Shree Mahadev Silk Mills Pvt. Ltd.'; });

console.log('\n[1] DETECTION AND IMPORT\n' + '-'.repeat(62));
const one = await pg.evaluate(x => {
  const bin = atob(x), a = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) a[i] = bin.charCodeAt(i);
  const wb = XLSX.read(a, { type:'array' });
  const det = detectWorkbook(wb).found.map(f => f.kind + ':' + f.label);
  const isAcmp = isACmpWorkbook(wb);
  const log = importAny(wb);
  const k = S.compressor;
  return { det, isAcmp, log, n:k.length, tags:k.map(c => c.tag),
    calc: k.map(c => { const d = compressorCalc(c); return {
      tag:c.tag, test:d.testType,
      ratedCFM:+d.ratedCFM.toFixed(2), actualCFM:+d.actualCFM.toFixed(2),
      appCFM:d.appCFM === null ? null : +d.appCFM.toFixed(2),
      ownCFM:d.ownCFM === null ? null : +d.ownCFM.toFixed(2),
      drift:d.drift,
      designSEC:+d.designSEC.toFixed(4), actualSEC:+d.actualSEC.toFixed(4),
      dev:+d.deviation.toFixed(1), loadPct:d.loadPct === null ? null : +d.loadPct.toFixed(1),
      unloadKw:d.unloadKw, days:d.days }; }),
    carried: { serial:k[0].serialNo, hp:k[0].ratedHp, thermal:k[0].obsThermalImageNo,
               discharge:k[0].obsCompDischarge, recordedBy:k[0].recordedBy,
               /* fadDescription is folded into the chapter's observation
                  text rather than kept as its own field. */
               obs:/Aftercooler/.test(k[0].obs || ''), tankM3:k[1].tankVol } };
}, b64(fx('ACMP_ShreeMahadev.xlsx')));

one.log.forEach(l => console.log('  ' + l));
/* importAny routes on isACmpWorkbook, which is what actually decides;
   detectWorkbook's label is only what the drop zone prints. */
check('recognised as A-CMP data', one.isAcmp, one.det.join(' | '));
check('2 compressors imported', one.n === 2, one.tags.join(', '));

const a1 = one.calc[0], a2 = one.calc[1];
console.log('\n[2] THE ARITHMETIC\n' + '-'.repeat(62));
console.log('  tag    test      rated    actual   design SEC  actual SEC     dev   loaded');
one.calc.forEach(c => console.log(`  ${c.tag}  ${c.test.padEnd(8)} ${String(c.ratedCFM).padStart(7)} ${String(c.actualCFM).padStart(9)}  ${String(c.designSEC).padStart(9)}  ${String(c.actualSEC).padStart(10)}  ${String(c.dev).padStart(6)}%  ${c.loadPct===null?'—':c.loadPct+'%'}`));

check('FAD machine reads the app\'s delivered air', Math.abs(a1.actualCFM - 198.23) < 0.1, a1.actualCFM + ' CFM');
check('FAD machine flagged above design SEC', a1.dev > 16 && a1.dev < 18, a1.dev + ' %');
check('pump-up keeps the app\'s temperature correction',
  Math.abs(a2.actualCFM - 170.45) < 0.2 && Math.abs(a2.ownCFM - a2.appCFM) < 1,
  'app ' + a2.appCFM + ' vs recomputed ' + a2.ownCFM + ' CFM');
check('litres of receiver converted to m3', Math.abs(one.carried.tankM3 - 2) < 0.001, one.carried.tankM3 + ' m3');
check('load share from the hour meters', Math.abs(a2.loadPct - 38.2) < 0.2, a2.loadPct + ' %');
check('annual days taken from the machine, not the default', a1.days === 330, a1.days + ' days');
check('no false drift when the two agree', !a1.drift && !a2.drift);

console.log('\n[3] COLUMNS CARRIED THROUGH\n' + '-'.repeat(62));
console.log('  ' + JSON.stringify(one.carried));
check('fields with no PostMan equivalent survive',
  one.carried.serial === 'EG55-2291' && one.carried.hp === 75 &&
  one.carried.thermal === 'IR-114' && one.carried.discharge === 88.6 &&
  one.carried.recordedBy === 'R. Patel' && one.carried.obs);

console.log('\n[4] MERGE BY MACHINE TAG\n' + '-'.repeat(62));
const two = await pg.evaluate(x => {
  const bin = atob(x), a = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) a[i] = bin.charCodeAt(i);
  const log = importAny(XLSX.read(a, { type:'array' }));
  return { log, n:S.compressor.length, tags:S.compressor.map(c => c.tag),
    ac02kw: compressorCalc(S.compressor.find(c => c.tag === 'AC-02')).measuredKw };
}, b64(fx('ACMP_SecondEngineer.xlsx')));
two.log.forEach(l => console.log('  ' + l));
check('second engineer\'s file merges, does not duplicate', two.n === 3, two.tags.join(', '));
check('the corrected reading replaced the old one', two.ac02kw === 25.9, two.ac02kw + ' kW');

console.log('\n[5] COMPANY GUARD\n' + '-'.repeat(62));
const guard = await pg.evaluate(x => {
  const bin = atob(x), a = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) a[i] = bin.charCodeAt(i);
  const wb = XLSX.read(a, { type:'array' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Company Profile'], { header:1 });
  rows[1][1] = 'Shakti Enterprises Ltd.';
  wb.Sheets['Company Profile'] = XLSX.utils.aoa_to_sheet(rows);
  const before = S.compressor.length;
  try { importAny(wb); return { ok:false, msg:'imported — should not have' }; }
  catch (e) { return { ok:true, msg:e.message, unchanged: S.compressor.length === before }; }
}, b64(fx('ACMP_ShreeMahadev.xlsx')));
check('another plant\'s compressor file is refused', guard.ok && guard.unchanged, guard.msg);

console.log('\n[6] LEDGER AND REPORT\n' + '-'.repeat(62));
const out = await pg.evaluate(() => {
  S.costs.unitRate = 8.62;
  syncCompressorLedger();
  Object.keys(S.enabled).forEach(k => S.enabled[k] = true);
  S.active = 'cover'; save(); renderAll();
  const row = S.ledger.find(r => r.autoKey === 'cmp-sec');
  return { row: row ? { saving:row.saving, unit:row.unit, money:row.monetary, co2:row.co2 } : null };
});
console.log('  ledger row:', JSON.stringify(out.row));
check('a compressor recommendation reaches the ledger', out.row && out.row.saving > 0,
  out.row ? out.row.saving + ' kWh/yr worth Rs ' + out.row.money : 'none');

await pg.waitForTimeout(1800);
const rep = await pg.evaluate(() => {
  const wraps = [...document.querySelectorAll('.pagewrap')];
  const over = wraps.map((p,i) => { const l = p.querySelector('[data-live]');
    return l ? { i:i+1, of:l.scrollHeight - l.clientHeight } : { i:i+1, of:0 }; }).filter(x => x.of > 1);
  let page = null;
  wraps.forEach((p,i) => { if (page === null &&
    [...p.querySelectorAll('[data-toc]')].some(h => /Performance assessment of air compressor/.test(h.textContent))) page = i; });
  const txt = page === null ? '' : wraps.slice(page, page+3).map(p => p.innerText).join('\n');
  return { pages:wraps.length, over, build:BUILD_ERRORS, hasSection: page !== null,
    mentions: {
      elgi:/Elgi EG55/.test(txt), aftercooler:/Aftercooler fins/.test(txt),
      thermal:/IR-114/.test(txt), idle:/loaded only/.test(txt),
      sec:/specific energy consumption is/.test(txt) } };
});
check('the compressor chapter is in the report', rep.hasSection);
check('nameplate, observations and thermography all print',
  rep.mentions.elgi && rep.mentions.aftercooler && rep.mentions.thermal && rep.mentions.sec,
  JSON.stringify(rep.mentions));
check('the idling machine gets its own finding', rep.mentions.idle);
check('no page overflows', rep.over.length === 0, JSON.stringify(rep.over));
check('no build errors', rep.build.length === 0, JSON.stringify(rep.build));
check('no console or page errors', errs.length === 0, errs.slice(0,2).join(' | '));

console.log('\n  ' + (FAIL === 0 ? 'ALL CHECKS PASSED' : FAIL + ' CHECK(S) FAILED') + '\n');
await b.close();
process.exit(FAIL ? 1 : 0);
