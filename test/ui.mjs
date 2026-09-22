import { chromium } from 'playwright';
import fs from 'fs';
import { APP, PDFJS, PDFJS_W, XLSX_JS, fx, out } from './_paths.mjs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const pg = await b.newPage({ viewport:{width:1600,height:1050}, deviceScaleFactor:2 });
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
pg.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|ERR_NAME|fonts\.g/.test(m.text())) errs.push('console: '+m.text()); });
await pg.goto(APP);
await pg.addScriptTag({ path:XLSX_JS });
await pg.addScriptTag({ path:PDFJS });
await pg.addScriptTag({ path:PDFJS_W });
await pg.waitForTimeout(700);
const s = await pg.$('text=Load sample'); if (s){ await s.click(); await pg.waitForTimeout(400); }
await pg.evaluate(()=>{ try{pdfjsLib.GlobalWorkerOptions.workerSrc='local';}catch(e){} S.bills=[]; });

// --- bills
const pdf = fs.readFileSync(fx('bills-12-months.pdf')).toString('base64');
await pg.evaluate(async (b64)=>{
  const bin=atob(b64),a=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
  await ingestBillPdf(new File([a],'bills.pdf',{type:'application/pdf'}), p=>attachPage(p));
  S.active='verify'; S.billCursor=3; save(); renderAll();
}, pdf);
await pg.waitForTimeout(900);
await pg.screenshot({ path:out('ui-verify.png') });
console.log('verify screen captured');

// verify flow: press Verify twice and check it advances and counts
const flow = await pg.evaluate(()=>{
  const before = billsProgress();
  const btns=[...document.querySelectorAll('#work button')].filter(b=>/^Verify this bill/.test(b.textContent));
  if(!btns.length) return {err:'no verify button'};
  btns[0].click();
  const mid = { cursor:S.billCursor, done:billsProgress().done };
  const b2=[...document.querySelectorAll('#work button')].filter(b=>/^Verify this bill/.test(b.textContent));
  if(b2.length) b2[0].click();
  return { before:before.done, afterFirst:mid, after:billsProgress(), cursor:S.billCursor };
});
console.log('verify flow:', JSON.stringify(flow));

// --- custom section with a photo + a table + a page break
await pg.evaluate(()=>{
  const img = (()=>{ const c=document.createElement('canvas'); c.width=900;c.height=600;
    const x=c.getContext('2d'); x.fillStyle='#123'; x.fillRect(0,0,900,600);
    x.fillStyle='#ffdd55'; x.font='bold 54px sans-serif'; x.fillText('THERMAL IMAGE',110,320);
    return { dataUrl:c.toDataURL('image/jpeg',0.8), w:900, h:600 }; })();
  S.custom = [{ id:uid(), title:'Thermal imaging survey', anchor:'jets', h1:true, on:true, blocks:[
    { id:uid(), type:'p', text:'Thermography was carried out on all jet bodies during the heating cycle.\n\nEmissivity was set to 0.95 and reflected temperature to ambient.' },
    { id:uid(), type:'photo2', img:img, img2:img, cap:'JET-01 shell, 74.5 C', cap2:'JET-03 manhole, 63.8 C' },
    { id:uid(), type:'table', head:'Location | Measured C | Limit C',
      rows:'JET-01 shell | 74.5 | 45\nJET-03 manhole | 63.8 | 45\nSteam header | 41.2 | 45' },
    { id:uid(), type:'note', text:'Two surfaces exceed the 45 C touch-safe limit.', tone:'bad' },
    { id:uid(), type:'break' },
    { id:uid(), type:'h2', text:'Insulation specification adopted' },
    { id:uid(), type:'kpi', text:'Thickness = 50 mm | Density = 100 kg/m3 | Cladding = 24g Al' }
  ]}];
  Object.keys(S.enabled).forEach(k=>S.enabled[k]=true);
  S.meta.toc = true; S.active='custom'; save(); renderAll();
});
await pg.waitForTimeout(1400);

const rep = await pg.evaluate(()=>{
  const pages=[...document.querySelectorAll('.pagewrap')];
  const over=pages.map((p,i)=>{const l=p.querySelector('[data-live]');
    return l?{i:i+1,of:l.scrollHeight-l.clientHeight}:{i:i+1,of:0};}).filter(x=>x.of>1);
  let tocPage=null, customPage=null, tocLines=0, sample=[];
  pages.forEach((p,i)=>{
    if (tocPage===null && /^\s*CONTENTS/i.test(p.innerText.replace(/^[\s\S]*?\n(?=CONTENTS)/i,''))) {}
    if (tocPage===null && /CONTENTS/.test(p.innerText)) tocPage=i+1;
    if (customPage===null){
      const hs=[...p.querySelectorAll('[data-toc="1"]')];
      if (hs.some(h=>/Thermal imaging survey/.test(h.textContent))) customPage=i+1;
    }
  });
  document.querySelectorAll('[data-gotopage]').forEach(n=>{ tocLines++;
    if (sample.length<8) sample.push(n.innerText.replace(/\s+/g,' ').trim()); });
  const detail = over.map(o=>{
    const live=pages[o.i-1].querySelector('[data-live]');
    return { page:o.i, of:o.of, kids:[...live.firstChild.childNodes].map(n=>({
      h:Math.round(n.getBoundingClientRect().height), t:(n.textContent||'').trim().slice(0,50)})) };
  });
  return { pages:pages.length, over, detail, tocPage, customPage, tocLines, sample, errors:BUILD_ERRORS };
});
console.log('pages:', rep.pages, '| overflow:', rep.over.length?JSON.stringify(rep.over):'none',
            '| build errors:', rep.errors.length?rep.errors:'none');
if (rep.detail && rep.detail.length) console.log('OVERFLOW DETAIL:', JSON.stringify(rep.detail,null,1));
console.log('contents page:', rep.tocPage, '| custom section starts on page:', rep.customPage,
            '| contents lines:', rep.tocLines);
console.log('first contents lines:\n  ' + rep.sample.join('\n  '));

// screenshot the contents page and the custom page
const wraps = await pg.$$('.pagewrap');
if (rep.tocPage) await wraps[rep.tocPage-1].screenshot({ path:out('ui-contents.png') });
if (rep.customPage) await wraps[rep.customPage-1].screenshot({ path:out('ui-custom.png') });
console.log('\npage errors:', errs.length?errs:'none');
await b.close();
