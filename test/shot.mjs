import { chromium } from 'playwright';
import fs from 'fs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const pg = await b.newPage({ viewport:{width:1500,height:1000}, deviceScaleFactor:2 });
await pg.goto('file:///home/claude/pm/app.html');
await pg.addScriptTag({ path:'node_modules/xlsx/dist/xlsx.full.min.js' });
await pg.waitForTimeout(600);
const s = await pg.$('text=Load sample'); if (s){ await s.click(); await pg.waitForTimeout(400); }
const buf = fs.readFileSync('t/JetData_ShreeMahadev.xlsx').toString('base64');
await pg.evaluate(b64=>{const bin=atob(b64),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
  importAny(XLSX.read(a,{type:'array'})); save(); renderAll();}, buf);
await pg.waitForTimeout(900);
// find the pages containing the jet section
const idx = await pg.evaluate(()=>{
  const out=[];
  document.querySelectorAll('.pagewrap').forEach((p,i)=>{ if(/jet/i.test(p.textContent)) out.push(i); });
  return out;
});
console.log('jet pages (0-based):', idx.join(','));
const want = idx.slice(0, 8);
for (const i of want){
  const p = (await pg.$$('.pagewrap'))[i];
  await p.screenshot({ path:`t/page-${String(i+1).padStart(2,'0')}.png` });
}
await b.close();
