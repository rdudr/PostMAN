/* The embedded field-app panel: it opens, it frames the app, the workbook
   posted from inside the frame lands, and closing puts the engineer back
   where they were. Same two-port setup as handoff.mjs - PostMan on one,
   a fake field app on another - because an iframe to the SAME origin would
   prove nothing: the whole question is cross-origin. */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import { APP_FILE, XLSX_JS, fx } from './_paths.mjs';

const XLSX_SRC = fs.readFileSync(XLSX_JS, 'utf8');
const WB_B64 = fs.readFileSync(fx('ACMP_ShreeMahadev.xlsx')).toString('base64');

/* The app's side, framed: it posts to window.parent, not window.opener. */
const APP_PAGE = `<!doctype html><meta charset="utf-8"><title>fake field app</title>
<body><p id="s">loading</p><script>
var q = new URLSearchParams(location.search);
var home = q.get('origin');
document.getElementById('s').textContent =
  'from=' + q.get('from') + ' company=' + q.get('company') + ' fy=' + q.get('fy');
function target(){
  if (window.opener) return window.opener;
  if (window.parent !== window) return window.parent;
  return null;
}
window.sendToPostman = function(){
  var t = target();
  if (!home || !t) return 'nowhere to send';
  t.postMessage({ kind:'kisem-data', format:'A-CMP v1',
    company: q.get('company'), workbook: WORKBOOK }, home);
  return 'sent to ' + home + ' via ' + (window.opener ? 'opener' : 'parent');
};
var WORKBOOK = ${JSON.stringify(WB_B64)};
</script>`;

function serve(port, files, headers){
  return new Promise(res => {
    const s = http.createServer((rq, rs) => {
      const f = files[rq.url.split('?')[0]] || files['/'];
      if (!f){ rs.writeHead(404); rs.end('no'); return; }
      rs.writeHead(200, Object.assign({ 'content-type': f.type }, headers || {}));
      rs.end(f.body);
    });
    s.listen(port, () => res(s));
  });
}

const page = { '/': { type:'text/html; charset=utf-8', body: APP_PAGE },
               '/favicon.ico': { type:'image/x-icon', body: '' } };
const postman = await serve(8811, {
  '/index.html': { type:'text/html; charset=utf-8', body: fs.readFileSync(APP_FILE, 'utf8') },
  '/xlsx.js': { type:'text/javascript', body: XLSX_SRC },
  '/favicon.ico': { type:'image/x-icon', body: '' }
});
const friendly = await serve(8812, page);
/* This one refuses to be framed, like a site with X-Frame-Options DENY. */
const hostile = await serve(8813, page, { 'x-frame-options': 'DENY' });

let FAIL = 0;
const check = (l, ok, d='') => { console.log(`  ${ok?'PASS':'FAIL'}  ${l}${d?'  '+d:''}`); if (!ok) FAIL++; };

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport:{ width:1400, height:950 } });
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
pg.on('console', m => { if (m.type()==='error' && !/fonts\.g|ERR_TUNNEL|ERR_NAME|favicon|X-Frame|frame/i.test(m.text())) errs.push(m.text()); });
const alerts = [];
ctx.on('page', p => p.on('dialog', d => { alerts.push(d.message()); d.dismiss(); }));
pg.on('dialog', d => { alerts.push(d.message()); d.dismiss(); });

await pg.goto('http://localhost:8811/index.html');
await pg.addScriptTag({ url:'/xlsx.js' });
await pg.waitForTimeout(700);
await pg.evaluate(() => {
  S.compressor = [];
  S.company.name = 'Shree Mahadev Silk Mills Pvt. Ltd.';
  S.meta.financialYear = '2025-26';
  S.appUrls.acmp = 'http://localhost:8812/';
  S.active = 'sources'; save(); renderAll();
});

console.log('\n[1] THE APP OPENS INSIDE POSTMAN\n' + '-'.repeat(62));
await pg.getByRole('button', { name:'Open A-CMP', exact:true }).click();
await pg.waitForTimeout(1200);
const panel = await pg.evaluate(() => {
  const host = document.getElementById('apppanel');
  const f = host.querySelector('iframe');
  return { shown: getComputedStyle(host).display !== 'none',
    src: f ? f.src : null, note: document.getElementById('apppanelnote').textContent,
    cls: document.getElementById('apppanelnote').className,
    popups: 0 };
});
check('no pop-up was opened', ctx.pages().length === 1, ctx.pages().length + ' page(s)');
check('the panel is showing', panel.shown);
check('it framed the app, with the plant named',
  /localhost:8812/.test(panel.src) && /company=Shree/.test(panel.src) && /from=postman/.test(panel.src),
  panel.src);
/* Not "it loaded" - a refused frame fires load too, so the note must not
   claim success it cannot verify. */
check('and says what it actually knows, with the way out',
  /should be showing/.test(panel.note) && /new window/.test(panel.note), panel.note.slice(0,70));

const seen = await (await pg.frames().find(f => f.url().includes('8812'))).textContent('#s');
console.log('  the app saw: ' + seen);
check('the app got the plant and the year', /company=Shree Mahadev/.test(seen) && /fy=2025-26/.test(seen));

console.log('\n[2] IT ARRIVES, AND WAITS TO BE LOOKED AT\n' + '-'.repeat(62));
const frame = pg.frames().find(f => f.url().includes('8812'));
console.log('  ' + await frame.evaluate(() => window.sendToPostman()));
await pg.waitForTimeout(1200);

/* Nothing enters the report on arrival. An import announced by an alert is
   announced too late to refuse. */
const held = await pg.evaluate(() => ({
  imported: S.compressor.length,
  inbox: !!INBOX,
  panelGone: getComputedStyle(document.getElementById('apppanel')).display === 'none',
  frames: document.querySelectorAll('#apppanelbody iframe').length,
  card: document.getElementById('inbox') ? document.getElementById('inbox').innerText : ''
}));
held.alerts = alerts.length;   /* the test's own tally, not the page's */
console.log('  ' + held.card.split('\n').filter(Boolean).slice(0,4).join(' | '));
check('nothing was imported yet', held.imported === 0, held.imported + ' compressors');
check('the panel closed itself', held.panelGone && held.frames === 0);
check('no alert fired behind the user\'s back', held.alerts === 0, held.alerts + ' alert(s)');
check('the card says who sent it and for which plant',
  /A-CMP sent a workbook/i.test(held.card) && /shree mahadev/i.test(held.card));
check('and what is in it, counted', /2 \u00d7 .*[Cc]ompressor/.test(held.card), held.card.replace(/\n/g,' | ').slice(0,120));

console.log('\n[2b] AND LANDS ONLY WHEN ACCEPTED\n' + '-'.repeat(62));
await pg.getByRole('button', { name:'Take it in' }).click();
await pg.waitForTimeout(900);
const after = await pg.evaluate(() => ({
  n: S.compressor.length, tags: S.compressor.map(c => c.tag),
  cfm: S.compressor.length ? +compressorCalc(S.compressor[0]).actualCFM.toFixed(2) : null,
  inbox: !!INBOX, card: !!document.getElementById('inbox')
}));
check('2 compressors arrived, with no file and no window', after.n === 2, after.tags.join(', '));
check('they went through the same reader', Math.abs(after.cfm - 198.23) < 0.1, after.cfm + ' CFM');
check('the card is gone once accepted', !after.inbox && !after.card);
check('the import log was shown', alerts.some(a => /taken in/.test(a)));

console.log('\n[3] A SITE THAT REFUSES TO BE FRAMED\n' + '-'.repeat(62));
await pg.evaluate(() => { S.appUrls.acmp = 'http://localhost:8813/'; save(); renderAll(); });
await pg.getByRole('button', { name:'Open A-CMP', exact:true }).click();
await pg.waitForTimeout(2500);
const refused = await pg.evaluate(() => ({
  note: document.getElementById('apppanelnote').textContent,
  cls: document.getElementById('apppanelnote').className
}));
console.log('  ' + refused.note);
/* Chromium fires load on the blocked frame's own error page, so there is
   no signal to detect this with. The requirement is therefore that the
   panel never claims success and always names the escape hatch. */
check('the panel never claims it worked, and names the way out',
  !/ is open/.test(refused.note) && /new window/.test(refused.note) && !/good/.test(refused.cls));

console.log('\n[4] THE WINDOW IS STILL THERE\n' + '-'.repeat(62));
const [popup] = await Promise.all([
  ctx.waitForEvent('page'),
  pg.locator('#apppanelpop').click()     /* the panel's own, not the card's */
]);
await popup.waitForLoadState();
check('Open in a new window still opens one', /8813/.test(popup.url()), popup.url());
const closedAfterPop = await pg.evaluate(() =>
  getComputedStyle(document.getElementById('apppanel')).display === 'none');
check('and the panel gets out of the way', closedAfterPop);
await popup.close();

console.log('\n[5] CLOSE PUTS YOU BACK\n' + '-'.repeat(62));
await pg.evaluate(() => { S.appUrls.acmp = 'http://localhost:8812/'; save(); renderAll(); });
await pg.getByRole('button', { name:'Open A-CMP', exact:true }).click();
await pg.waitForTimeout(900);
await pg.getByRole('button', { name:'Close' }).click();
await pg.waitForTimeout(300);
const closed = await pg.evaluate(() => ({
  gone: getComputedStyle(document.getElementById('apppanel')).display === 'none',
  frames: document.querySelectorAll('#apppanelbody iframe').length,
  stillOnSources: S.active === 'sources',
  work: !!document.querySelector('#work fieldset')
}));
check('the panel closes and the frame is torn down', closed.gone && closed.frames === 0);
check('the Data sources screen is where it was', closed.stillOnSources && closed.work);
check('no console or page errors', errs.length === 0, errs.slice(0,2).join(' | '));

console.log('\n  ' + (FAIL === 0 ? 'ALL CHECKS PASSED' : FAIL + ' CHECK(S) FAILED') + '\n');
await b.close(); postman.close(); friendly.close(); hostile.close();
process.exit(FAIL ? 1 : 0);
