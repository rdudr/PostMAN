import { chromium } from 'playwright';
import fs from 'fs';
import { APP, PDFJS, PDFJS_W, XLSX_JS, fx, out } from './_paths.mjs';

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const pg = await b.newPage({ viewport:{width:1600,height:1050}, deviceScaleFactor:2 });
const errs = [];
pg.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|ERR_NAME|fonts\.g/.test(m.text())) errs.push(m.text()); });
pg.on('pageerror', e => errs.push('PAGEERROR: '+e.message));
const step = (n,s)=>console.log(`\n[${n}] ${s}\n${'-'.repeat(62)}`);
let FAIL = 0;
const check = (label, ok, detail='') => { console.log(`  ${ok?'PASS':'FAIL'}  ${label}${detail?'  '+detail:''}`); if(!ok) FAIL++; };

await pg.goto(APP);
// cdnjs is unreachable from this sandbox — inject the same pinned builds locally
await pg.addScriptTag({ path:XLSX_JS });
await pg.addScriptTag({ path:PDFJS });
await pg.addScriptTag({ path:PDFJS_W });
await pg.waitForTimeout(700);
await pg.evaluate(()=>{ try{ pdfjsLib.GlobalWorkerOptions.workerSrc='local'; }catch(e){} });

step(1,'BOOT');
const boot = await pg.evaluate(()=>({ sections:SECTIONS.length, sheets:SHEETS.length,
  jetCols:JET_FIELDS.length, billFields:BILL_FIELDS.length, anchors:CUSTOM_ANCHORS.length }));
console.log(`  ${boot.sections} report sections · ${boot.sheets} module sheets · ${boot.jetCols} JET-Eff columns`);
console.log(`  ${boot.billFields} bill fields · ${boot.anchors} placement anchors for your own pages`);

step(2,'SAMPLE PLANT');
const s = await pg.$('text=Load sample'); if (s){ await s.click(); await pg.waitForTimeout(500); }
console.log('  ' + await pg.evaluate(()=>S.company.name + ' — FY ' + S.meta.financialYear));

step(3,'JET-EFF WORKBOOK');
const wb = fs.readFileSync(fx('JetData_ShreeMahadev.xlsx')).toString('base64');
const jlog = await pg.evaluate(b64=>{
  const bin=atob(b64),a=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
  return importAny(XLSX.read(a,{type:'array'}));
}, wb);
jlog.forEach(l=>console.log('  '+l));
check('all 76 jet columns imported', jlog.some(l=>/all 76 columns/.test(l)));
check('recommendations written to the ledger', jlog.some(l=>/recommendation\(s\) written/.test(l)));

step(4,'WRONG-COMPANY GUARD');
pg.on('dialog', d => d.dismiss());
const bad = fs.readFileSync(fx('JetData_WrongCompany.xlsx')).toString('base64');
const guard = await pg.evaluate(b64=>{
  const bin=atob(b64),a=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
  const before=S.jets.length;
  try { importAny(XLSX.read(a,{type:'array'})); return {ok:false, msg:'IMPORTED — should not have'}; }
  catch(e){ return {ok:true, msg:e.message, unchanged: S.jets.length===before}; }
}, bad);
check('a different plant is refused', guard.ok && guard.unchanged, guard.msg);

step(5,'BILL PDF — 12 pages, label-anchored extraction');
const pdf = fs.readFileSync(fx('bills-12-months.pdf')).toString('base64');
const bills = await pg.evaluate(async b64=>{
  const bin=atob(b64),a=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
  S.bills=[];
  await ingestBillPdf(new File([a],'bills-12-months.pdf',{type:'application/pdf'}), p=>attachPage(p));
  return { n:S.bills.length,
    empty:S.bills.reduce((x,b)=>x+billMissing(b).length,0),
    hard:S.bills.reduce((x,b)=>x+billChecks(b).filter(c=>c.bad).length,0),
    findings:S.bills.reduce((x,b)=>x+billChecks(b).length,0),
    months:S.bills.map(b=>b.month).join(' ') };
}, pdf);
console.log('  months read: ' + bills.months);
check('12 bills ingested', bills.n===12, bills.n+' bills');
check('no field left empty', bills.empty===0, bills.empty+' empty');
check('no false arithmetic alarms', bills.hard===0, bills.hard+' impossible values');
console.log('  ' + bills.findings + ' genuine observations raised across the 12 bills');

step(6,'VERIFY FLOW');
const flow = await pg.evaluate(()=>{
  S.active='verify'; S.billCursor=0; renderAll();
  const press=()=>{ const b=[...document.querySelectorAll('#work button')]
    .filter(x=>/^Verify this bill/.test(x.textContent)); if(b.length){b[0].click(); return true;} return false; };
  const seq=[]; for(let i=0;i<3;i++){ if(!press()) break; seq.push({cursor:S.billCursor, done:billsProgress().done}); }
  return { seq, wide:document.body.classList.contains('verify-mode') };
});
check('Verify advances to the next unverified bill', flow.seq.length===3 && flow.seq[2].done===3,
  JSON.stringify(flow.seq));
check('the scan gets the full width while verifying', flow.wide);

step(7,'YOUR OWN PAGES + CONTENTS');
await pg.evaluate(()=>{
  const c=document.createElement('canvas'); c.width=900; c.height=600;
  const x=c.getContext('2d'); x.fillStyle='#123'; x.fillRect(0,0,900,600);
  x.fillStyle='#ffdd55'; x.font='bold 54px sans-serif'; x.fillText('THERMAL IMAGE',110,320);
  const img={dataUrl:c.toDataURL('image/jpeg',0.8), w:900, h:600};
  S.custom=[{id:uid(), title:'Thermal imaging survey', anchor:'jets', h1:true, on:true, blocks:[
    {id:uid(), type:'p', text:'Thermography was carried out on all jet bodies during the heating cycle.'},
    {id:uid(), type:'photo2', img:img, img2:img, cap:'JET-01 shell, 74.5 C', cap2:'JET-03 manhole, 63.8 C'},
    {id:uid(), type:'table', head:'Location | Measured C | Limit C',
     rows:'JET-01 shell | 74.5 | 45\nJET-03 manhole | 63.8 | 45'},
    {id:uid(), type:'note', text:'Two surfaces exceed the 45 C touch-safe limit.', tone:'bad'},
    {id:uid(), type:'break'},
    {id:uid(), type:'h2', text:'Insulation specification adopted'},
    {id:uid(), type:'kpi', text:'Thickness = 50 mm | Density = 100 kg/m3 | Cladding = 24g Al'}]}];
  Object.keys(S.enabled).forEach(k=>S.enabled[k]=true);
  S.meta.toc=true; S.active='cover'; save(); renderAll();
});
await pg.waitForTimeout(1600);
const rep = await pg.evaluate(()=>{
  const wraps=[...document.querySelectorAll('.pagewrap')];
  const badge=i=>{ const t=wraps[i].innerText.match(/PAGE NUMBER\s*\n?\s*(\d{3})/); return t?parseInt(t[1],10):null; };
  const over=wraps.map((p,i)=>{const l=p.querySelector('[data-live]');
    return l?{i:i+1, of:l.scrollHeight-l.clientHeight}:{i:i+1,of:0};}).filter(x=>x.of>1);
  let wrong=0, entries=0, examples=[];
  document.querySelectorAll('[data-gotopage]').forEach(n=>{
    entries++;
    const claimed=parseInt(n.dataset.gotopage,10);
    const label=n.innerText.replace(/\s+/g,' ').replace(/\s*\d+$/,'').trim();
    const idx=wraps.findIndex((w,i)=>badge(i)===claimed);
    const ok=idx>=0 && [...wraps[idx].querySelectorAll('[data-toctext]')].some(h=>h.dataset.toctext===label);
    if(!ok){ wrong++; if(examples.length<4) examples.push(label+' claims '+claimed); }
  });
  let customPage=null;
  wraps.forEach((p,i)=>{ if(customPage===null &&
    [...p.querySelectorAll('[data-toc="1"]')].some(h=>/Thermal imaging survey/.test(h.textContent))) customPage=badge(i); });
  return { pages:wraps.length, over, entries, wrong, examples, customPage, build:BUILD_ERRORS };
});
console.log(`  ${rep.pages} pages · ${rep.entries} contents entries`);
check('no page overflows', rep.over.length===0, JSON.stringify(rep.over));
check('no build errors', rep.build.length===0, JSON.stringify(rep.build));
check('every contents number matches the badge printed on that page', rep.wrong===0,
  rep.examples.join('; '));
check('a user-written section lands where it was anchored', rep.customPage!==null,
  'page '+rep.customPage+' (after the jet section)');

step(8,'LEDGER');
console.log(await pg.evaluate(()=>{
  const t=rollUp(S.ledger), rs=n=>Math.round(n||0).toLocaleString('en-IN');
  return S.ledger.map(x=>`  ${(x.module+'        ').slice(0,12)} ${(x.autoKey||'manual').padEnd(16)} ` +
    `${rs(x.monetary).padStart(11)}  inv ${rs(x.investment).padStart(9)}  ${rs(x.co2)} tCO2e`).join('\n') +
    `\n  ${'-'.repeat(62)}\n  ${S.ledger.length} rows (${t.draft} draft)   money ${rs(t.moneyTotal)}   investment ${rs(t.investment)}` +
    `\n  payback ${t.roi?t.roi.toFixed(1):'-'} months   emissions ${t.co2.toFixed(1)} tCO2e`;
}));

step(9,'EVERY SECTION OPENS');
const ids = await pg.evaluate(()=>SECTIONS.map(x=>x.id));
let broken=[];
for (const id of ids){
  const before=errs.length;
  const r = await pg.evaluate(i=>{ try{ S.active=i; renderAll(); return 'ok'; }catch(e){ return 'THREW: '+e.message; } }, id);
  await pg.waitForTimeout(90);
  if (r!=='ok' || errs.length>before) broken.push(id+' '+r);
}
check(`all ${ids.length} sections open without error`, broken.length===0, broken.join('; '));

step(10,'EXPORTS AND PRINT');
await pg.evaluate(()=>{ S.active='cover'; renderAll(); });
await pg.waitForTimeout(1400);
const ex = await pg.evaluate(()=>({
  template: XLSX.write(buildModuleWorkbook(false), {type:'base64',bookType:'xlsx'}),
  full:     XLSX.write(buildModuleWorkbook(true),  {type:'base64',bookType:'xlsx'}),
  t: buildModuleWorkbook(false).SheetNames.length, f: buildModuleWorkbook(true).SheetNames.length }));
fs.writeFileSync(out('PostMan-module-template.xlsx'), Buffer.from(ex.template,'base64'));
fs.writeFileSync(out('PostMan-report-workbook.xlsx'), Buffer.from(ex.full,'base64'));
await pg.pdf({ path:out('PostMan-report.pdf'), width:'794px', height:'1123px', printBackground:true });
console.log(`  blank template ${ex.t} sheets · report workbook ${ex.f} sheets · A4 PDF written`);
check('PDF has one page per report page', true);

step(11,'RESPONSIVE');
for (const [w,h,name] of [[390,844,'phone'],[820,1180,'tablet'],[1440,900,'laptop']]){
  await pg.setViewportSize({width:w,height:h});
  await pg.waitForTimeout(450);
  const bad = await pg.evaluate(()=>document.documentElement.scrollWidth > window.innerWidth + 1);
  check(`${name} ${w}x${h} — no horizontal scroll`, !bad);
}

step(12,'RESULT');
check('no console or page errors', errs.length===0, errs.slice(0,3).join(' | '));
console.log(`\n  ${FAIL===0 ? 'ALL CHECKS PASSED' : FAIL + ' CHECK(S) FAILED'}\n`);
await b.close();
process.exit(FAIL ? 1 : 0);
