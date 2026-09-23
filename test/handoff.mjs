/* The handoff by POP-UP WINDOW - the route that works everywhere, and the
   fallback whenever a site refuses to be framed or an app can only post to
   an opener. The embedded panel is test/panel.mjs.

   Two things have to be true, and the second matters more than the first:
     1. a workbook from a configured app lands;
     2. the identical message from any other origin does not.
   A page that can post into this window can otherwise put anything it
   likes into a report somebody signs. */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { APP, APP_FILE, ROOT, XLSX_JS, fx } from './_paths.mjs';

const XLSX_SRC = fs.readFileSync(XLSX_JS, 'utf8');
const WB_B64  = fs.readFileSync(fx('ACMP_ShreeMahadev.xlsx')).toString('base64');

/* The whole of an app's side of the contract, as a page. This is the
   snippet docs/HANDOFF.md asks each app to add - if it changes there it
   changes here, and this test is what says whether it still works. */
const APP_PAGE = `<!doctype html><meta charset="utf-8"><title>fake field app</title>
<body><p id="s">loading</p><script>
var q = new URLSearchParams(location.search);
var home = q.get('origin');
document.getElementById('s').textContent =
  'from=' + q.get('from') + ' company=' + q.get('company') + ' fy=' + q.get('fy');
window.sendToPostman = function(){
  if (!home || !window.opener) return 'no opener';
  window.opener.postMessage({ kind:'kisem-data', format:'A-CMP v1',
    company: q.get('company'), workbook: WORKBOOK }, home);
  return 'sent to ' + home;
};
var WORKBOOK = ${JSON.stringify(WB_B64)};
</script>`;

function serve(port, files){
  return new Promise(res => {
    const s = http.createServer((rq, rs) => {
      const p = rq.url.split('?')[0];
      const f = files[p] || files['/'];
      if (!f) { rs.writeHead(404); rs.end('no'); return; }
      rs.writeHead(200, { 'content-type': f.type, 'access-control-allow-origin':'*' });
      rs.end(f.body);
    });
    s.listen(port, () => res(s));
  });
}

const appHtml = fs.readFileSync(APP_FILE, 'utf8');
/* The page is self-contained and has no XLSX; the deployed copy loads it
   from the CDN, which this sandbox cannot reach, so serve it locally. */
const postman = await serve(8801, {
  '/index.html': { type:'text/html; charset=utf-8', body: appHtml },
  '/xlsx.js':  { type:'text/javascript', body: XLSX_SRC },
  '/favicon.ico': { type:'image/x-icon', body: '' }
});
const page = { '/': { type:'text/html; charset=utf-8', body: APP_PAGE },
               '/favicon.ico': { type:'image/x-icon', body: '' } };
const fieldApp = await serve(8802, page);
const rogue    = await serve(8803, page);

let FAIL = 0;
const check = (label, ok, detail='') => {
  console.log(`  ${ok?'PASS':'FAIL'}  ${label}${detail?'  '+detail:''}`); if (!ok) FAIL++;
};

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport:{ width:1400, height:950 } });
const pg = await ctx.newPage();
const errs = [];
pg.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
pg.on('console', m => { if (m.type()==='error' && !/fonts\.g|ERR_TUNNEL|ERR_NAME|favicon/.test(m.text())) errs.push(m.text()); });
const alerts = [];
ctx.on('page', p => p.on('dialog', d => { alerts.push(d.message()); d.dismiss(); }));
pg.on('dialog', d => { alerts.push(d.message()); d.dismiss(); });

await pg.goto('http://localhost:8801/index.html');
await pg.addScriptTag({ url:'/xlsx.js' });
await pg.waitForTimeout(700);

console.log('\n[1] THE APP IS OPENED IN A WINDOW, WITH THE PLANT NAMED\n' + '-'.repeat(62));
await pg.evaluate(() => {
  S.compressor = [];
  S.company.name = 'Shree Mahadev Silk Mills Pvt. Ltd.';
  S.meta.financialYear = '2025-26';
  S.appUrls.acmp = 'http://localhost:8802/';
  S.active = 'sources'; save(); renderAll();
});
const [popup] = await Promise.all([
  ctx.waitForEvent('page'),
  /* Each app has its own card and its own pair of buttons - scope to
     A-CMP's, or .first() quietly opens FOX. */
  pg.locator('fieldset').filter({ hasText:'A-CMP' })
    .getByRole('button', { name:'Open in a new window' }).click()
]);
await popup.waitForLoadState();
const seen = await popup.textContent('#s');
console.log('  the app saw: ' + seen);
check('company and year travel in the URL',
  /company=Shree Mahadev Silk Mills Pvt\. Ltd\./.test(seen) && /fy=2025-26/.test(seen) && /from=postman/.test(seen));

const waiting = await pg.evaluate(() => {
  const t = document.getElementById('work').textContent;
  return /Waiting for A-CMP/.test(t);
});
check('PostMan says it is waiting', waiting);

console.log('\n[2] THE WORKBOOK COMES BACK, AND WAITS\n' + '-'.repeat(62));
console.log('  ' + await popup.evaluate(() => window.sendToPostman()));
await pg.waitForTimeout(1200);

/* Same rule as the panel: arriving is not the same as being taken in. */
const held = await pg.evaluate(() => ({ inbox: !!INBOX, imported: S.compressor.length }));
check('it is held, not imported', held.inbox && held.imported === 0, held.imported + ' compressors');

await pg.getByRole('button', { name:'Take it in' }).click();
await pg.waitForTimeout(900);
const after = await pg.evaluate(() => ({
  n: S.compressor.length, tags: S.compressor.map(c => c.tag),
  cfm: S.compressor.length ? +compressorCalc(S.compressor[0]).actualCFM.toFixed(2) : null,
  stored: JSON.parse(localStorage.getItem(KEY) || '{}').compressor?.length ?? null
}));
check('2 compressors arrived with no file ever downloaded', after.n === 2, after.tags.join(', '));
check('they went through the same reader', Math.abs(after.cfm - 198.23) < 0.1, after.cfm + ' CFM');
check('and were saved', after.stored === 2, String(after.stored));
check('the import log was shown', alerts.some(a => /taken in/.test(a)), JSON.stringify(alerts.slice(-1)));

console.log('\n[3] ANOTHER ORIGIN CANNOT\n' + '-'.repeat(62));
await pg.evaluate(() => { S.compressor = []; INBOX = null; save(); renderAll(); });
const rg = await ctx.newPage();
rg.on('dialog', d => d.dismiss());
await rg.goto('http://localhost:8803/?from=postman&origin=' + encodeURIComponent('http://localhost:8801') +
              '&company=Shree%20Mahadev%20Silk%20Mills%20Pvt.%20Ltd.&fy=2025-26');
/* it has no opener, so hand it the window the honest way a hostile page would */
await rg.evaluate(() => { window.name = 'rogue'; });
const posted = await pg.evaluate(wb => {
  /* simulate the message arriving from an origin nobody configured */
  const ev = new MessageEvent('message', {
    origin: 'http://localhost:8803',
    data: { kind:'kisem-data', format:'A-CMP v1', workbook: wb }
  });
  window.dispatchEvent(ev);
  return INBOX ? 1 : 0;      /* it would land in the inbox first */
}, WB_B64);
check('a workbook from an unconfigured origin is ignored', posted === 0, posted ? 'it arrived' : 'nothing arrived');

const allowed = await pg.evaluate(wb => {
  const ev = new MessageEvent('message', {
    origin: 'http://localhost:8802',
    data: { kind:'kisem-data', workbook: wb }
  });
  window.dispatchEvent(ev);
  return INBOX ? INBOX.rows.length : 0;
}, WB_B64);
check('the configured origin still can', allowed > 0, allowed + ' recognised sheet(s)');

console.log('\n[4] WRONG PLANT\n' + '-'.repeat(62));
await pg.evaluate(() => { S.compressor = []; INBOX = null; S.company.name = 'Shakti Enterprises Ltd.'; save(); renderAll(); });
alerts.length = 0;
await pg.evaluate(wb => {
  window.dispatchEvent(new MessageEvent('message', {
    origin: 'http://localhost:8802', data:{ kind:'kisem-data', workbook: wb } }));
}, WB_B64);
await pg.waitForTimeout(600);
/* The mismatch is now visible BEFORE the button is pressed, which is the
   point - the old flow announced it in an alert after the import. */
const seenCard = await pg.evaluate(() => ({
  mismatch: INBOX ? INBOX.mismatch : null,
  card: document.getElementById('inbox') ? document.getElementById('inbox').innerText : ''
}));
check('the card warns that it is a different plant before anything is taken in',
  seenCard.mismatch === true && /different plant/i.test(seenCard.card));

await pg.getByRole('button', { name:'Take it in' }).click();   /* confirm is dismissed */
await pg.waitForTimeout(600);
const guarded = await pg.evaluate(() => S.compressor.length);
check('and the guard still refuses on the way in', guarded === 0 &&
  alerts.some(a => /Shree Mahadev/.test(a)), alerts.join(' | ').slice(0,100));

check('no console or page errors', errs.length === 0, errs.slice(0,2).join(' | '));

console.log('\n  ' + (FAIL === 0 ? 'ALL CHECKS PASSED' : FAIL + ' CHECK(S) FAILED') + '\n');
await b.close(); postman.close(); fieldApp.close(); rogue.close();
process.exit(FAIL ? 1 : 0);
