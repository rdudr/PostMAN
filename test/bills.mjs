import { chromium } from 'playwright';
import fs from 'fs';
import { APP, PDFJS, PDFJS_W, XLSX_JS, fx } from './_paths.mjs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const pg = await b.newPage({ viewport:{width:1600,height:1050} });
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
pg.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|ERR_NAME|fonts\.g/.test(m.text())) errs.push('console: '+m.text()); });
await pg.goto(APP);
await pg.addScriptTag({ path:XLSX_JS });
// pdf.js from CDN is unreachable offline — inject the same pinned build locally
// cdnjs is unreachable offline — inject the same pinned pair locally, the
// main library and the worker-as-a-script that makes the fake-worker path work
await pg.addScriptTag({ path:PDFJS });
await pg.addScriptTag({ path:PDFJS_W });
await pg.waitForTimeout(700);
const s = await pg.$('text=Load sample'); if (s){ await s.click(); await pg.waitForTimeout(400); }

await pg.evaluate(()=>{
  if (window.pdfjsLib) try { pdfjsLib.GlobalWorkerOptions.workerSrc = 'local'; } catch(e){}
  S.bills = [];  // start clean so matching is exercised honestly
});

const pdf = fs.readFileSync(fx('bills-12-months.pdf')).toString('base64');
const out = await pg.evaluate(async (b64) => {
  const bin=atob(b64), arr=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  const file = new File([arr], 'bills-12-months.pdf', {type:'application/pdf'});
  let added = 0;
  try { await ingestBillPdf(file, p => { attachPage(p); added++; }); }
  catch(e){ return { err: e.message }; }
  return { added, bills: S.bills.length,
    rows: S.bills.map(b => ({ month:b.month, cd:b.contract, md:b.actualMD, bd:b.billingDemand,
      kwh:b.kwh, kvah:b.kvah, pf:b.pf, ec:b.energyCharge, dc:b.demandCharge,
      fp:b.fuelSurcharge, duty:b.duty, reb:b.rebate, net:b.net,
      night:b.todNight, peak:b.todPeak, src:b.ocrSource,
      missing: billMissing(b), checks: billChecks(b).map(c=>(c.bad?'!! ':'   ')+c.t) })) };
}, pdf);

if (out.err){ console.log('INGEST FAILED:', out.err); }
else {
  console.log('pages ingested :', out.added, ' -> bills:', out.bills);
  const F=['month','cd','md','bd','kwh','kvah','pf','ec','dc','fp','duty','reb','net','night','peak'];
  console.log('\n' + F.map(f=>f.padStart(9)).join(''));
  out.rows.forEach(r=>console.log(F.map(f=>String(r[f]===null||r[f]===undefined?'—':r[f]).slice(0,9).padStart(9)).join('')));
  const totalMissing = out.rows.reduce((a,r)=>a+r.missing.length,0);
  console.log('\nfields still empty across all 12 bills:', totalMissing,
    totalMissing ? JSON.stringify(out.rows.map(r=>r.missing).filter(m=>m.length)) : '');
  const withChecks = out.rows.filter(r=>r.checks.length);
  console.log('bills raising a check:', withChecks.length);
  withChecks.slice(0,4).forEach(r=>console.log('  '+r.month+':\n    '+r.checks.join('\n    ')));
}
console.log('\npage errors:', errs.length?errs:'none');
await b.close();
