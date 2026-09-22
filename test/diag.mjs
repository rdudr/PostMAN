import { chromium } from 'playwright';
import fs from 'fs';
import { APP, XLSX_JS, fx } from './_paths.mjs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const pg = await b.newPage({ viewport:{width:1500,height:1000} });
await pg.goto(APP);
await pg.addScriptTag({ path:XLSX_JS });
await pg.waitForTimeout(600);
const s = await pg.$('text=Load sample'); if (s){ await s.click(); await pg.waitForTimeout(400); }
const buf = fs.readFileSync(fx('JetData_ShreeMahadev.xlsx')).toString('base64');
await pg.evaluate(b64=>{const bin=atob(b64),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
  importAny(XLSX.read(a,{type:'array'})); save(); renderAll();}, buf);
await pg.waitForTimeout(800);
console.log(await pg.evaluate(()=>{
  const out=[];
  document.querySelectorAll('.pagewrap').forEach((p,i)=>{
    const live=p.querySelector('[data-live]'); if(!live) return;
    const of = live.scrollHeight - live.clientHeight;
    if (of<=1) return;
    const kids=[...live.firstChild.childNodes].map(n=>({
      tag:n.tagName, cls:n.className||'', h:Math.round(n.getBoundingClientRect().height),
      txt:(n.textContent||'').trim().slice(0,55)}));
    out.push({page:i+1, of, clientH:live.clientHeight, scrollH:live.scrollHeight, kids});
  });
  return JSON.stringify(out,null,1);
}));
await b.close();
