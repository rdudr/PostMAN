import { chromium } from 'playwright';
import fs from 'fs';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const pg = await b.newPage({ viewport:{width:1500,height:1000} });
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('file:///home/claude/pm/app.html');
await pg.addScriptTag({ path:'node_modules/xlsx/dist/xlsx.full.min.js' });
await pg.waitForTimeout(600);
const s = await pg.$('text=Load sample'); if (s){ await s.click(); await pg.waitForTimeout(400); }
const buf = fs.readFileSync('t/JetData_ShreeMahadev.xlsx').toString('base64');
await pg.evaluate(b64=>{const bin=atob(b64),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
  importAny(XLSX.read(a,{type:'array'})); save();}, buf);

const out = await pg.evaluate(()=>{
  const before = { bills:S.bills.length, pcc:S.dist.pcc.length, motors:S.dist.motors.length,
    pumps:S.pumps.length, lux:S.lux.length, jets:S.jets.length, ledger:S.ledger.length,
    inst:S.instruments.length, firstJet:JSON.parse(JSON.stringify(S.jets[0])) };
  // export -> bytes -> reimport
  const wb = buildModuleWorkbook(true);
  const b64 = XLSX.write(wb, {type:'base64', bookType:'xlsx'});
  const sheets = wb.SheetNames;
  const bin=atob(b64), arr=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  const back = XLSX.read(arr,{type:'array'});
  const det = detectWorkbook(back).found.map(f=>f.label);
  const log = importAny(back);
  const after = { bills:S.bills.length, pcc:S.dist.pcc.length, motors:S.dist.motors.length,
    pumps:S.pumps.length, lux:S.lux.length, jets:S.jets.length, ledger:S.ledger.length,
    inst:S.instruments.length, firstJet:JSON.parse(JSON.stringify(S.jets[0])) };
  // blank template must be recognised but empty
  const blank = XLSX.write(buildModuleWorkbook(false), {type:'base64', bookType:'xlsx'});
  const bbin=atob(blank), barr=new Uint8Array(bbin.length);
  for(let i=0;i<bbin.length;i++) barr[i]=bbin.charCodeAt(i);
  let blankMsg=''; try { importAny(XLSX.read(barr,{type:'array'})); blankMsg='NO ERROR (bad)'; }
  catch(e){ blankMsg = e.message; }
  // field-level jet fidelity
  const diffs=[];
  JET_FIELDS.forEach(f=>{
    const a=before.firstJet[f], b2=after.firstJet[f];
    if (JSON.stringify(a)!==JSON.stringify(b2)) diffs.push(f+': '+JSON.stringify(a)+' -> '+JSON.stringify(b2));
  });
  return { sheets, det, log, before:{...before,firstJet:undefined}, after:{...after,firstJet:undefined}, blankMsg, diffs };
});
console.log('sheets written:', out.sheets.length, out.sheets.join(', '));
console.log('\ndetected on reimport:', out.det.join(' | '));
console.log('\nimport log:', out.log.join(' | '));
console.log('\nbefore:', JSON.stringify(out.before));
console.log('after :', JSON.stringify(out.after));
console.log('\njet field diffs after round-trip:', out.diffs.length ? out.diffs : 'NONE');
console.log('\nblank template import:', out.blankMsg);
console.log('page errors:', errs.length?errs:'none');
await b.close();
