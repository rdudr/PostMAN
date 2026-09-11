import { chromium } from 'playwright';
import fs from 'fs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const pg = await b.newPage();
pg.on('pageerror',e=>console.log('PAGEERROR',e.message));
await pg.goto('file:///home/claude/pm/app.html');
await pg.addScriptTag({ path:'node_modules/xlsx/dist/xlsx.full.min.js' });
await pg.addScriptTag({ path:'node_modules/tesseract.js/dist/tesseract.min.js' });
await pg.waitForTimeout(600);
const jpg = fs.readFileSync('t/bill-photo.jpg').toString('base64');
const r = await pg.evaluate(async b64 => {
  S.bills = [];
  const row = { month:'', img:{ dataUrl:'data:image/jpeg;base64,'+b64 }, hits:{} };
  // measure the image so the row is well formed
  const im = await loadImg(row.img.dataUrl);
  row.img.w = im.naturalWidth; row.img.h = im.naturalHeight;
  S.bills.push(row);
  const t0 = performance.now();
  let n = 0, err = null;
  try { n = await runOcrOn(row, ()=>{}); } catch(e){ err = e.message; }
  return { err, ms: Math.round(performance.now()-t0), filled:n,
    size:[row.img.w,row.img.h], tokens:(row.tokens||[]).length,
    got:{ month:row.month, contract:row.contract, actualMD:row.actualMD,
      billingDemand:row.billingDemand, kwh:row.kwh, kvah:row.kvah, pf:row.pf,
      net:row.net, todNight:row.todNight, todPeak:row.todPeak },
    textHead:(row.ocr||'').split('\n').slice(0,8).join(' / ') };
}, jpg);
console.log(JSON.stringify(r, null, 1));
await b.close();
