/* Verifies the build the team actually runs: served over http from its own
   folder, with every library vendored beside it and no CDN in reach. */
import { chromium } from 'playwright';
import fs from 'fs';
import { fx } from './_paths.mjs';

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const pg = await b.newPage({ viewport:{width:1600,height:1050} });
const errs = [];
pg.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
pg.on('console', m => { if (m.type()==='error' && !/fonts\.g|ERR_TUNNEL|ERR_NAME/.test(m.text())) errs.push(m.text()); });
const failed = [];
pg.on('requestfailed', r => failed.push(r.url().slice(0,90) + ' :: ' + (r.failure()||{}).errorText));

await pg.goto('http://127.0.0.1:4180/', { waitUntil:'networkidle' });
await pg.waitForTimeout(900);

const libs = await pg.evaluate(() => ({
  xlsx: typeof XLSX !== 'undefined',
  pdfBase: typeof PDFJS_BASE !== 'undefined' ? PDFJS_BASE : null,
  ocrLocal: typeof OCR_LOCAL !== 'undefined' ? OCR_LOCAL : null,
  ocrCdn: typeof OCR_CDN !== 'undefined' ? OCR_CDN : null
}));
console.log('SheetJS (cdnjs)       :', libs.xlsx);
console.log('pdf.js base           :', libs.pdfBase);
console.log('OCR local / fallback  :', libs.ocrLocal, '/', libs.ocrCdn);

const s = await pg.$('text=Load sample');
if (s) { await s.click(); await pg.waitForTimeout(500); }

const pdf = fs.readFileSync(fx('bills-12-months.pdf')).toString('base64');
const bills = await pg.evaluate(async b64 => {
  const bin = atob(b64), a = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) a[i] = bin.charCodeAt(i);
  S.bills = [];
  try { await ingestBillPdf(new File([a],'bills.pdf',{type:'application/pdf'}), p => attachPage(p)); }
  catch (e) { return { err: e.message }; }
  return { n:S.bills.length, empty:S.bills.reduce((x,b)=>x+billMissing(b).length,0) };
}, pdf);
console.log('bills, vendored pdf.js:', JSON.stringify(bills));

const wb = fs.readFileSync(fx('JetData_ShreeMahadev.xlsx')).toString('base64');
const jets = await pg.evaluate(b64 => {
  const bin = atob(b64), a = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) a[i] = bin.charCodeAt(i);
  const log = importAny(XLSX.read(a, {type:'array'}));
  Object.keys(S.enabled).forEach(k => S.enabled[k] = true);
  S.active = 'cover'; save(); renderAll();
  return { log, jets:S.jets.length };
}, wb);
console.log('jets, vendored SheetJS:', jets.jets, '|', jets.log.find(l => /all 76/.test(l)));

await pg.waitForTimeout(1700);
const rep = await pg.evaluate(() => {
  const wraps = [...document.querySelectorAll('.pagewrap')];
  const over = wraps.map((p,i) => { const l = p.querySelector('[data-live]');
    return l ? { i:i+1, of:l.scrollHeight - l.clientHeight } : { i:i+1, of:0 }; })
    .filter(x => x.of > 1);
  return { pages:wraps.length, over, build:BUILD_ERRORS };
});
console.log('report                :', rep.pages, 'pages · overflow',
  rep.over.length ? JSON.stringify(rep.over) : 'none',
  '· build errors', rep.build.length ? rep.build : 'none');

const ocr = await pg.evaluate(() => probeOcr().then(st => ({ ok:st.ok, why:st.why })));
console.log('OCR probe (no assets) :', JSON.stringify(ocr));
console.log('failed requests       :', failed.length ? failed : 'none');
console.log('errors                :', errs.length ? errs : 'none');
await b.close();
