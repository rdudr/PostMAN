/* PostMan launcher.
 *
 * Serving the tool over http rather than opening it as a file is not a
 * detail: a file:// page has no origin, so the OCR reader cannot load its
 * worker or its language model, and half the bill workflow quietly dies.
 * Over http everything works, and the reader's ~5 MB of files can be cached
 * locally once and used offline forever after.
 *
 * Plain Node, no dependencies, no install step.
 */
'use strict';
const http = require('http');
const https = require('https');
const fs   = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT   = __dirname;
const APP    = path.join(ROOT, 'PostMan.html');
const VENDOR = path.join(ROOT, 'vendor', 'tesseract');

const TYPES = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',   '.json':'application/json',
  '.wasm':'application/wasm',         '.png':'image/png',
  '.jpg':'image/jpeg',                '.svg':'image/svg+xml',
  '.pdf':'application/pdf',           '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.traineddata':'application/octet-stream', '.gz':'application/gzip'
};

/* The reader's four pieces. Fetched once, then served from disk. */
const OCR_FILES = [
  ['tesseract.min.js',              'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist/tesseract.min.js'],
  ['worker.min.js',                 'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist/worker.min.js'],
  ['tesseract-core-simd.wasm.js',   'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.0/tesseract-core-simd.wasm.js'],
  ['eng.traineddata.gz',            'https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz']
];

function get(url, dest, redirects){
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location){
        if ((redirects||0) > 5) return reject(new Error('too many redirects'));
        res.resume();
        return resolve(get(res.headers.location, dest, (redirects||0)+1));
      }
      if (res.statusCode !== 200){ res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const tmp = dest + '.part';
      const f = fs.createWriteStream(tmp);
      res.pipe(f);
      f.on('finish', () => f.close(() => { fs.renameSync(tmp, dest); resolve(); }));
      f.on('error', reject);
    }).on('error', reject);
  });
}

/* The letterhead is set in ten families. On a plant network with no internet
   the page still works, but it falls back to Arial and stops looking like the
   thing the designer made - so the fonts are cached beside the app too, the
   same way the OCR reader is. Google serves a different CSS per user agent;
   asking as a modern browser gets woff2, which every browser we care about
   reads. */
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700'
  + '&family=Archivo+Black&family=Playfair+Display:ital,wght@0,700;0,900;1,600'
  + '&family=Poppins:wght@300;400;600;800&family=League+Spartan:wght@700'
  + '&family=Montserrat:wght@700&family=Atkinson+Hyperlegible:wght@400;700'
  + '&family=Arimo:ital,wght@0,400;0,700;1,400&family=Outfit:wght@400;500'
  + '&family=Cormorant+Garamond:wght@300;400'
  + '&family=IBM+Plex+Mono:wght@400;500;600&display=swap';
const FONTDIR = path.join(ROOT, 'vendor', 'fonts');

function getText(url){
  return new Promise((resolve, reject) => {
    https.get(url, { headers:{ 'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36' } },
      res => {
        if (res.statusCode !== 200){ res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
        let t = ''; res.setEncoding('utf8');
        res.on('data', d => t += d); res.on('end', () => resolve(t));
      }).on('error', reject);
  });
}

async function fetchFonts(){
  fs.mkdirSync(FONTDIR, { recursive:true });
  if (fs.existsSync(path.join(FONTDIR, 'fonts.css'))) return 'ready';
  process.stdout.write('  Fetching the report fonts (once only)...\n');
  let css;
  try { css = await getText(FONT_CSS); }
  catch (e){ process.stdout.write('    stylesheet failed (' + e.message + ')\n'); return 'no'; }
  const urls = [...new Set((css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+/g) || []))];
  let n = 0;
  for (const u of urls){
    const name = u.split('/').pop().split('?')[0];
    try { await get(u, path.join(FONTDIR, name)); css = css.split(u).join(name); n++; }
    catch (e){ /* one missing face is not worth failing the launch over */ }
  }
  fs.writeFileSync(path.join(FONTDIR, 'fonts.css'), css);
  process.stdout.write('    ' + n + ' of ' + urls.length + ' font files cached\n');
  return n ? 'ready' : 'no';
}

async function fetchOcr(){
  fs.mkdirSync(VENDOR, { recursive:true });
  const missing = OCR_FILES.filter(([name]) => !fs.existsSync(path.join(VENDOR, name)));
  if (!missing.length) return 'ready';
  process.stdout.write('  Fetching the OCR reader (about 5 MB, once only)...\n');
  for (const [name, url] of missing){
    process.stdout.write('    ' + name + ' ... ');
    try { await get(url, path.join(VENDOR, name)); process.stdout.write('ok\n'); }
    catch (e){ process.stdout.write('failed (' + e.message + ')\n'); return 'partial'; }
  }
  return 'ready';
}

function serve(port){
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel === '/' || rel === '/index.html') rel = '/PostMan.html';
      /* Never serve outside the app folder, whatever the request says. */
      const file = path.normalize(path.join(ROOT, rel));
      if (!file.startsWith(ROOT)){ res.writeHead(403).end('no'); return; }
      fs.readFile(file, (err, buf) => {
        if (err){ res.writeHead(404).end('Not found'); return; }
        res.writeHead(200, {
          'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-cache'
        });
        res.end(buf);
      });
    });
    srv.on('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

function open(url){
  const cmd = process.platform === 'win32' ? ['cmd', ['/c','start','',url]]
            : process.platform === 'darwin' ? ['open', [url]]
            : ['xdg-open', [url]];
  try { execFile(cmd[0], cmd[1], () => {}); } catch (e) {}
}

/* The folder accumulated three launchers, a half-built Next.js scaffold and a
   stale copy of the app. Rather than delete anything - which is not a thing a
   launcher should do to someone's files - the obsolete items are moved aside
   into _old/ on first run, once, and named in the console. Deleting _old/ is
   then the user's call, and costs them nothing if they change their mind. */
const OBSOLETE = ['Open PostMan.cmd', 'Start PostMan dev server.cmd',
                  'PostMan-offline.html', 'postman'];
function retireOldFiles(){
  const moved = [];
  const dest = path.join(ROOT, '_old');
  for (const name of OBSOLETE){
    const from = path.join(ROOT, name);
    if (!fs.existsSync(from)) continue;
    try {
      fs.mkdirSync(dest, { recursive:true });
      fs.renameSync(from, path.join(dest, name));
      moved.push(name);
    } catch (e){ /* in use, or across volumes - leave it where it is */ }
  }
  return moved;
}

(async () => {
  console.log('\n  PostMan\n  ' + '-'.repeat(52));
  const moved = retireOldFiles();
  if (moved.length){
    console.log('  Tidied away (now in _old\\, delete it when you are happy):');
    moved.forEach(m => console.log('    ' + m));
  }
  if (!fs.existsSync(APP)){
    console.log('  PostMan.html is missing from this folder. Nothing to serve.');
    process.exit(1);
  }
  const fonts = await fetchFonts().catch(() => 'no');
  console.log('  Fonts     : ' + (fonts === 'ready' ? 'cached, works offline'
    : 'not cached - the report will use fallback faces'));
  const ocr = await fetchOcr().catch(() => 'partial');
  console.log('  OCR reader: ' + (ocr === 'ready'
    ? 'ready, works offline'
    : 'not downloaded - PDF bills still read fine, photographs need typing'));

  let srv = null, port = 4173;
  for (; port < 4200; port++){
    try { srv = await serve(port); break; } catch (e){ if (e.code !== 'EADDRINUSE') throw e; }
  }
  if (!srv){ console.log('  No free port between 4173 and 4199.'); process.exit(1); }

  const url = 'http://127.0.0.1:' + port + '/';
  console.log('  Running at ' + url);
  console.log('  Leave this window open. Close it to stop PostMan.\n');
  open(url);
})();
