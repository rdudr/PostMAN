import { chromium } from 'playwright';
import fs from 'fs';
import { APP, XLSX_JS, fx } from './_paths.mjs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const pg = await b.newPage();
await pg.goto(APP);
await pg.addScriptTag({ path:XLSX_JS });
await pg.waitForTimeout(600);
const s = await pg.$('text=Load sample'); if (s){ await s.click(); await pg.waitForTimeout(400); }
for (const f of [fx('JetData_RenamedTabs.xlsx')]){
  const buf = fs.readFileSync(f).toString('base64');
  console.log(f, JSON.stringify(await pg.evaluate(b64=>{
    const bin=atob(b64),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
    const wb=XLSX.read(a,{type:'array'});
    try { return { sheets:wb.SheetNames, log: importAny(wb), jets:S.jets.length }; }
    catch(e){ return { err:e.message }; }
  }, buf), null, 1));
}
await b.close();
