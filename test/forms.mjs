import { chromium } from 'playwright';
import fs from 'fs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const pg = await b.newPage({ viewport:{width:1500,height:1000} });
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
pg.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|ERR_NAME|fonts\.g/.test(m.text())) errs.push('console: '+m.text()); });
await pg.goto('file:///home/claude/pm/app.html');
await pg.addScriptTag({ path:'node_modules/xlsx/dist/xlsx.full.min.js' });
await pg.waitForTimeout(600);
const s = await pg.$('text=Load sample'); if (s){ await s.click(); await pg.waitForTimeout(400); }
const buf = fs.readFileSync('t/JetData_ShreeMahadev.xlsx').toString('base64');
await pg.evaluate(b64=>{const bin=atob(b64),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
  importAny(XLSX.read(a,{type:'array'})); Object.keys(S.enabled).forEach(k=>S.enabled[k]=true); save(); renderAll();}, buf);
await pg.waitForTimeout(700);
// OPEN EVERY SECTION — the step the harness was missing
const ids = await pg.evaluate(()=>SECTIONS.map(x=>x.id));
let bad = [];
for (const id of ids){
  const before = errs.length;
  const r = await pg.evaluate(i=>{ try { S.active=i; renderAll(); return 'ok'; } catch(e){ return 'THREW: '+e.message; } }, id);
  await pg.waitForTimeout(120);
  const fields = await pg.evaluate(()=>document.querySelectorAll('#work input,#work select,#work textarea').length);
  const line = `${id.padEnd(14)} ${r.padEnd(10)} ${String(fields).padStart(4)} fields`;
  if (r!=='ok' || errs.length>before){ bad.push(line + '  <-- ' + errs.slice(before).join('; ')); }
  console.log(line);
}
console.log('\nFAILURES:', bad.length ? '\n  '+bad.join('\n  ') : 'none');
await b.close();
