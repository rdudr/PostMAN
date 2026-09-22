import { chromium } from 'playwright';
import fs from 'fs';
import { APP, XLSX_JS, fx, out } from './_paths.mjs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const pg = await b.newPage({ viewport:{width:1500,height:1000} });
const errs = [];
pg.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
pg.on('pageerror', e => errs.push('PAGEERROR: '+e.message));
await pg.goto(APP);
// cdnjs is unreachable offline; inject the same pinned build locally
await pg.addScriptTag({ path:XLSX_JS });
await pg.waitForTimeout(700);

// load sample data (gives us a company name + the rest of the report)
const sample = await pg.$('text=Load sample');
if (sample) { await sample.click(); await pg.waitForTimeout(500); }
console.log('company =', await pg.evaluate(()=>S.company.name));

async function importFile(path){
  const buf = fs.readFileSync(path).toString('base64');
  return await pg.evaluate(async (b64) => {
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
    const wb = XLSX.read(arr, {type:'array'});
    try { return { ok:true, log: importAny(wb) }; }
    catch(e){ return { ok:false, err: e.message }; }
  }, buf);
}

// guard: wrong company must be refused (confirm auto-dismissed = Cancel)
pg.on('dialog', d => d.dismiss());
console.log('WRONG COMPANY ->', JSON.stringify(await importFile(fx('JetData_WrongCompany.xlsx'))));
console.log('jets after refusal =', await pg.evaluate(()=>S.jets.length));

// right company must import
const r = await importFile(fx('JetData_ShreeMahadev.xlsx'));
console.log('RIGHT COMPANY ->', JSON.stringify(r, null, 1));
await pg.evaluate(()=>{ save(); renderAll(); });
await pg.waitForTimeout(900);

const info = await pg.evaluate(()=>{
  const pages=[...document.querySelectorAll('.pagewrap')];
  const over = pages.map((p,i)=>{
    const live=p.querySelector('[data-live]');
    if(!live) return {i:i+1, of:0};
    return { i:i+1, of: live.scrollHeight - live.clientHeight };
  }).filter(x=>x.of>1);
  return { pages: pages.length, overflow: over,
           jets: S.jets.length,
           ledger: S.ledger.filter(r=>r.module==='jets').map(r=>({k:r.autoKey, money:r.monetary, inv:r.investment, save:r.saving, unit:r.unit})),
           roll: (typeof jetsRollUp==='function') ? jetsRollUp() : null };
});
console.log('pages =', info.pages, '| overflow =', JSON.stringify(info.overflow));
console.log('jets =', info.jets);
console.log('ledger =', JSON.stringify(info.ledger, null, 1));
console.log('rollup =', JSON.stringify({n:info.roll.n, steam:info.roll.steam.toFixed(1), total:Math.round(info.roll.total), invest:Math.round(info.roll.invest), avgEff:info.roll.avgEff?.toFixed(1), passing:info.roll.passing.length, weak:info.roll.weak.length, roi:info.roll.roi?.toFixed(1)}));
console.log('console errors =', errs.length ? errs : 'none');

await pg.pdf({ path:out('out.pdf'), width:'794px', height:'1123px', printBackground:true });
await b.close();
