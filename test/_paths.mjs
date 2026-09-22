/* Where things are, worked out from this file rather than typed into it.

   The same suites have to run in two layouts: the source tree, where the
   build writes `index.html` next to a `t/` folder, and a clone of the
   repository, where the same file sits next to `test/`. Hard paths meant
   the repository shipped tests nobody could run, which is worse than
   shipping none. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.dirname(HERE);

const built = [path.join(ROOT, 'index.html')].find(f => fs.existsSync(f));
if (!built){
  console.error('No built page beside ' + ROOT + '. Build it first:  python3 src/build.py');
  process.exit(2);
}
export const APP_FILE = built;
export const APP = 'file://' + built;

/* A fixture or an output, next to the test that uses it. */
export const fx = name => path.join(HERE, name);

/* SheetJS. The built page loads it from the CDN; the sandbox the tests run
   in cannot reach one, so they inject the local copy instead. Found the way
   node itself finds a package - walking up - so it does not matter whether
   `npm i` was run in this folder or one above it. */
function upward(rel){
  let d = ROOT;
  for (;;){
    const p = path.join(d, 'node_modules', rel);
    if (fs.existsSync(p)) return p;
    const up = path.dirname(d);
    if (up === d) return path.join(ROOT, 'node_modules', rel);
    d = up;
  }
}
export const XLSX_JS   = upward(path.join('xlsx', 'dist', 'xlsx.full.min.js'));
export const PDFJS     = upward(path.join('pdfjs-dist', 'build', 'pdf.min.js'));
export const PDFJS_W   = upward(path.join('pdfjs-dist', 'build', 'pdf.worker.min.js'));
export const TESSERACT = upward(path.join('tesseract.js', 'dist', 'tesseract.min.js'));

/* Where a suite puts what it produces - a PDF, a workbook, a screenshot.
   Created on demand, and ignored by git. */
export const OUT = path.join(ROOT, 'out');
export const out = name => { fs.mkdirSync(OUT, { recursive:true }); return path.join(OUT, name); };
