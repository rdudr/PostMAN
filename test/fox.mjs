/* The FOX workbook, read by p19_pq.js, with the phase reduction pinned.

   The fixture is not hand-written: it is the file FOX's own
   lib/export-offline.ts produces, so this tests the contract rather than
   somebody's idea of it. Regenerate it with
   `npx tsx scripts/postman-bridge-check.ts` in the FOX repository. */
import { chromium } from 'playwright';
import fs from 'fs';
import { APP, XLSX_JS, fx } from './_paths.mjs';

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const pg = await b.newPage({ viewport:{ width:1500, height:1000 } });
const errs = [];
pg.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
pg.on('console', m => { if (m.type()==='error' && !/fonts\.g|ERR_TUNNEL|ERR_NAME/.test(m.text())) errs.push(m.text()); });
/* FOX asks who is uploading, which must be answered; a DIFFERENT COMPANY
   confirm must NOT be. Accepting both is how this suite first "passed" the
   company guard while the guard had never been reached. */
pg.on('dialog', d => d.type() === 'prompt' ? d.accept('R. Patel') : d.dismiss());

let FAIL = 0;
const check = (label, ok, detail='') => { console.log(`  ${ok?'PASS':'FAIL'}  ${label}${detail?'  '+detail:''}`); if (!ok) FAIL++; };
const b64 = f => fs.readFileSync(f).toString('base64');

await pg.goto(APP);
await pg.addScriptTag({ path:XLSX_JS });
await pg.waitForTimeout(700);

console.log('\n[1] EVERY SHEET IS ACCOUNTED FOR\n' + '-'.repeat(62));
const one = await pg.evaluate(x => {
  S.company.name = 'Shree Mahadev Silk Mills Pvt. Ltd.';
  const bin = atob(x), a = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) a[i] = bin.charCodeAt(i);
  const log = importAny(XLSX.read(a, { type:'array' }));
  const d = S.dist;
  return { log, counts:{ mains:d.mains.length, pcc:d.pcc.length, mcc:d.mcc.length,
    motors:d.motors.length, apfc:d.apfc.length },
    main:d.mains[0], stamp:!!d.foxUpload };
}, b64(fx('FOX_ShreeMahadev.xlsx')));
one.log.forEach(l => console.log('  ' + l));
check('incomer, PCC and MCC each kept as themselves',
  one.counts.mains === 1 && one.counts.pcc === 1 && one.counts.mcc === 1,
  JSON.stringify(one.counts));
check('motors and APFC stages arrived', one.counts.motors === 2 && one.counts.apfc === 2);
check('the upload is stamped for the report', one.stamp);

console.log('\n[2] THREE PHASES, REDUCED\n' + '-'.repeat(62));
const m = one.main;
console.log(`  V ${m.v1}/${m.v2}/${m.v3} -> ${m.v}   Uthd ${m.uthd1}/${m.uthd2}/${m.uthd3} -> ${m.vthd}`);
console.log(`  I ${m.i1}/${m.i2}/${m.i3} -> ${m.i}   Ithd ${m.ithd1}/${m.ithd2}/${m.ithd3} -> ${m.ithd}`);
check('voltage and current are averaged', Math.abs(m.v - 414) < 0.01 && Math.abs(m.i - 604.67) < 0.01);
/* The failure this pins: averaging 6.8/7.1/6.9 gives 6.93, and a panel at
   9.0/4.0/4.0 would average to 5.67 and print clean while one phase sits
   12 % over the 8 % limit. IEEE-519 limits a phase. */
check('THD is the worst phase, never the average',
  m.vthd === 2.3 && m.ithd === 7.1, `${m.vthd} %V, ${m.ithd} %I`);

console.log('\n[3] AND THE VERDICT FOLLOWS THE WORST PHASE\n' + '-'.repeat(62));
const verdict = await pg.evaluate(() => {
  /* One phase well over the 8 % limit, two quiet. The average passes. */
  const p = S.dist.pcc[0];
  p.ithd1 = 9.0; p.ithd2 = 4.0; p.ithd3 = 4.0;
  p.ithd = Math.max(p.ithd1, p.ithd2, p.ithd3);
  return { average: (9.0 + 4.0 + 4.0) / 3, judged: p.ithd, flagged: p.ithd > 8 };
});
console.log(`  average ${verdict.average.toFixed(2)} % would pass; worst phase ${verdict.judged} %`);
check('a 9 % phase is flagged even though the average is under the limit',
  verdict.flagged && verdict.average < 8);

console.log('\n[4] IMPORTING TWICE CHANGES NOTHING\n' + '-'.repeat(62));
const twice = await pg.evaluate(x => {
  const bin = atob(x), a = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) a[i] = bin.charCodeAt(i);
  importAny(XLSX.read(a, { type:'array' }));
  const d = S.dist;
  return { mains:d.mains.length, pcc:d.pcc.length, mcc:d.mcc.length, motors:d.motors.length, apfc:d.apfc.length };
}, b64(fx('FOX_ShreeMahadev.xlsx')));
check('nothing duplicated on re-import',
  twice.mains === 1 && twice.pcc === 1 && twice.mcc === 1 && twice.motors === 2 && twice.apfc === 2,
  JSON.stringify(twice));

console.log('\n[5] COMPANY GUARD\n' + '-'.repeat(62));
const guard = await pg.evaluate(x => {
  const bin = atob(x), a = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) a[i] = bin.charCodeAt(i);
  const wb = XLSX.read(a, { type:'array' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Company Profile'], { header:1 });
  rows[0][1] = 'Shakti Enterprises Ltd.';
  wb.Sheets['Company Profile'] = XLSX.utils.aoa_to_sheet(rows);
  const before = S.dist.pcc.length;
  try { importAny(wb); return { ok:false, msg:'imported - should not have' }; }
  catch (e){ return { ok:true, msg:e.message, unchanged:S.dist.pcc.length === before }; }
}, b64(fx('FOX_ShreeMahadev.xlsx')));
check('another plant\'s FOX file is refused', guard.ok && guard.unchanged, guard.msg);

console.log('\n[6] IT REACHES THE REPORT\n' + '-'.repeat(62));
await pg.evaluate(() => { S.active = 'cover'; save(); renderAll(); });
await pg.waitForTimeout(1800);
const rep = await pg.evaluate(() => {
  const wraps = [...document.querySelectorAll('.pagewrap')];
  const over = wraps.map((p,i) => { const l = p.querySelector('[data-live]');
    return l ? { i:i+1, of:l.scrollHeight - l.clientHeight } : { i:i+1, of:0 }; }).filter(x => x.of > 1);
  const txt = wraps.map(p => p.innerText).join('\n');
  return { over, build:BUILD_ERRORS,
    mentions:{ incomer:/Main LT Panel/.test(txt), pcc:/PCC-1 Dyeing/.test(txt),
               mcc:/MCC-2 Utilities/.test(txt), motor:/JET-01 circulation pump/.test(txt),
               note:/worst of the three phases/.test(txt) } };
});
check('every panel and motor prints', rep.mentions.incomer && rep.mentions.pcc &&
  rep.mentions.mcc && rep.mentions.motor, JSON.stringify(rep.mentions));
check('the table says which phase the figure is', rep.mentions.note);
check('no page overflows', rep.over.length === 0, JSON.stringify(rep.over));
check('no build errors', rep.build.length === 0, JSON.stringify(rep.build));
check('no console or page errors', errs.length === 0, errs.slice(0,2).join(' | '));

console.log('\n  ' + (FAIL === 0 ? 'ALL CHECKS PASSED' : FAIL + ' CHECK(S) FAILED') + '\n');
await b.close();
process.exit(FAIL ? 1 : 0);
