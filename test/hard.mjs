import { chromium } from 'playwright';
import fs from 'fs';
import { APP, PDFJS, PDFJS_W, XLSX_JS, fx } from './_paths.mjs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const pg = await b.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto(APP);
await pg.addScriptTag({ path:XLSX_JS });
await pg.addScriptTag({ path:PDFJS });
await pg.addScriptTag({ path:PDFJS_W });
await pg.waitForTimeout(600);
await pg.evaluate(()=>{ try{pdfjsLib.GlobalWorkerOptions.workerSrc='local';}catch(e){} S.bills=[]; S.company.name=''; });
const pdf = fs.readFileSync(fx('bill-tabular.pdf')).toString('base64');
const out = await pg.evaluate(async b64=>{
  const bin=atob(b64),a=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
  await ingestBillPdf(new File([a],'tabular.pdf',{type:'application/pdf'}), p=>attachPage(p));
  const r=S.bills[0];
  return { got:{ month:r.month, contract:r.contract, actualMD:r.actualMD, billingDemand:r.billingDemand,
    kwh:r.kwh, kvah:r.kvah, pf:r.pf, energyCharge:r.energyCharge, demandCharge:r.demandCharge,
    fuelSurcharge:r.fuelSurcharge, duty:r.duty, other:r.other, rebate:r.rebate, net:r.net,
    todNight:r.todNight, todPeak:r.todPeak },
    via: Object.fromEntries(Object.entries(r.hits||{}).map(([k,v])=>[k,v.via])),
    missing: billMissing(r), checks: billChecks(r).map(c=>(c.bad?'!! ':'   ')+c.t) };
}, pdf);
const want = { month:'Sep 25', contract:750, actualMD:612.4, billingDemand:637.5, kwh:367218,
  kvah:383288, pf:0.958, energyCharge:1891172.7, demandCharge:245437.5, fuelSurcharge:400267.62,
  duty:283675.9, other:2145, rebate:7420, net:2815278.72, todNight:80788, todPeak:44066 };
let bad=0;
console.log('field            expected        got        via');
for (const k of Object.keys(want)){
  const ok = String(out.got[k])===String(want[k]);
  if(!ok) bad++;
  console.log(`${ok?'  ':'XX'} ${k.padEnd(14)} ${String(want[k]).padStart(12)} ${String(out.got[k]).padStart(12)}   ${out.via[k]||'-'}`);
}
console.log('\nwrong:', bad, '| still empty:', out.missing.length ? out.missing : 'none');
console.log('checks:', out.checks.length? out.checks : 'none');
console.log('page errors:', errs.length?errs:'none');
await b.close();
