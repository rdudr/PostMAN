/* ===================================================================
   BILL CAPTURE AND VERIFICATION

   OCR on an electricity bill does not fail the way people expect. It
   rarely fails to read the characters; it fails to know which number is
   which. A DGVCL bill has forty numbers on it and the one labelled
   "Billing Demand" sits in a different place on every DISCOM's layout.
   So the text layer is only half the job - the other half is anchoring on
   the LABEL and taking the number that belongs to it.

   And it will still be wrong sometimes, on a creased photo or a scan at
   an angle. So the design assumption here is that OCR is an assistant,
   never an authority: every figure passes under a human eye with the bill
   itself on screen beside it, and a bill is not counted until someone
   presses Verify. A report is signed by a person; the numbers in it
   should have been looked at by one.
   =================================================================== */

var BILL_FIELDS = [
  { k:'month',        t:'Billing month',     type:'text' },
  { k:'contract',     t:'Contract demand',   unit:'kVA' },
  { k:'actualMD',     t:'Actual maximum demand', unit:'kVA' },
  { k:'billingDemand',t:'Billing demand',    unit:'kVA' },
  { k:'kwh',          t:'Units consumed',    unit:'kWh' },
  { k:'kvah',         t:'Apparent energy',   unit:'kVAh' },
  { k:'pf',           t:'Power factor',      unit:'' },
  { k:'energyCharge', t:'Energy charge',     unit:'₹' },
  { k:'demandCharge', t:'Demand charge',     unit:'₹' },
  { k:'fuelSurcharge',t:'Fuel surcharge (FPPPA)', unit:'₹' },
  { k:'duty',         t:'Electricity duty',  unit:'₹' },
  { k:'other',        t:'Other charges',     unit:'₹' },
  { k:'rebate',       t:'Rebate / discount', unit:'₹' },
  { k:'net',          t:'Net payable',       unit:'₹' },
  { k:'todNight',     t:'TOD night units',   unit:'kWh' },
  { k:'todPeak',      t:'TOD peak units',    unit:'kWh' }
];

/* Label aliases, longest and most specific first: "billing demand" must be
   tried before "demand", or every bill reports its contract demand as its
   billing demand. Drawn from DGVCL, UGVCL, MGVCL, PGVCL, Torrent and Adani
   layouts, which is most of what a Gujarat plant will hand over. */
var BILL_PATTERNS = [
  ['billingDemand', ['billing demand','billable demand','demand billed','chargeable demand','b\\.?d\\.?']],
  ['contract',      ['contract demand','contracted demand','sanctioned demand','sanctioned load','contract load','c\\.?d\\.?']],
  ['actualMD',      ['maximum demand recorded','recorded maximum demand','actual maximum demand',
                     'maximum demand','max\\.? demand','recorded demand','actual demand','m\\.?d\\.?']],
  ['kvah',          ['total kvah','kvah consumed','kvah consumption','apparent energy','kvah']],
  ['kwh',           ['total units consumed','units consumed','net units','total consumption',
                     'energy consumed','kwh consumed','consumption in kwh','total kwh','units','kwh']],
  ['pf',            ['average power factor','avg\\.? power factor','power factor','p\\.?f\\.?']],
  ['energyCharge',  ['energy charge','energy charges']],
  ['demandCharge',  ['demand charge','demand charges']],
  ['fuelSurcharge', ['fpppa','fppa','fuel price and power purchase','fuel surcharge',
                     'fuel cost adjustment','fuel price adjustment','f\\.?c\\.?a\\.?']],
  ['duty',          ['electricity duty','govt\\.? duty','government duty','duty']],
  /* Without this the charge lines never add up to the net, and the check
     cries wolf on every bill - which is worse than not checking at all,
     because a warning that is always on gets ignored when it is real. */
  ['other',         ['other charges','other charge','miscellaneous charges','misc\\.? charges','other amount']],
  ['rebate',        ['prompt payment rebate','rebate','discount']],
  ['net',           ['net amount payable','amount payable','net payable','total amount payable',
                     'bill amount','net bill amount','grand total','total payable','net amount']],
  ['todNight',      ['tod night','night hours','off peak units','zone c','night units','tod-3','tod 3']],
  ['todPeak',       ['tod peak','peak hours','peak units','zone b','tod-2','tod 2']]
];

var MONTH_WORDS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

/* Indian digit grouping, currency marks and stray spaces inside numbers all
   have to go before parseFloat sees anything. "1,23,456.78" is one number. */
function billNum(raw){
  if (raw === null || raw === undefined) return null;
  var s = String(raw).replace(/[₹$]/g,'').replace(/,/g,'').replace(/\s+/g,'');
  var m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  var v = parseFloat(m[0]);
  return isFinite(v) ? v : null;
}

/* OCR confuses a small, predictable set of shapes. Inside something that is
   otherwise a number, O is a zero and l is a one - never the other way round,
   which is why this only runs on tokens that are already mostly digits. */
function deOcr(t){
  var s = String(t);
  var digits = (s.match(/\d/g) || []).length;
  if (!digits || digits < s.replace(/[^0-9A-Za-z]/g,'').length * 0.5) return s;
  return s.replace(/[Oo]/g,'0').replace(/[lI|]/g,'1').replace(/[S]/g,'5')
          .replace(/[B]/g,'8').replace(/[Zz]/g,'2').replace(/[·•]/g,'.');
}
function isNumberish(t){
  return /^[₹Rs.\s]*[-+]?[\d,]*\d(?:\.\d+)?\s*(?:kva|kvah|kwh|kw|rs|inr)?\.?$/i.test(String(t).trim());
}

/* ===================================================================
   GEOMETRIC EXTRACTION

   The first version of this joined everything on a line into a string and
   searched the string. That works on a one-column bill and falls apart on
   the real ones, where "Billing Demand" sits in column two and its value in
   column five with three unrelated numbers in between, or where the label is
   a heading above its own column of figures.

   So extraction works on TOKENS WITH POSITIONS instead: find the words that
   spell the label, then take the nearest number to its RIGHT on the same
   line, and only if there is none, the nearest number directly BELOW it.
   Same rule a person uses when they read a bill.
   =================================================================== */

/* Tokens -> lines, by vertical overlap rather than exact y, because OCR
   baselines wobble and PDF text runs are positioned per-glyph-run. */
function groupLines(tokens){
  var ts = tokens.slice().sort(function(p,q){ return (p.y - q.y) || (p.x - q.x); });
  var lines = [], cur = null;
  ts.forEach(function(t){
    if (cur && Math.abs(t.y - cur.y) <= Math.max(4, t.h * 0.6)){
      cur.tokens.push(t);
      cur.y = (cur.y * (cur.tokens.length - 1) + t.y) / cur.tokens.length;
    } else {
      cur = { y:t.y, tokens:[t] };
      lines.push(cur);
    }
  });
  lines.forEach(function(l){ l.tokens.sort(function(p,q){ return p.x - q.x; }); });
  return lines;
}

/* Does this run of tokens, joined, match the alias? Returns the run's extent
   so the value hunt knows where the label ends. */
function matchLabel(line, alias){
  var re = new RegExp('^' + alias + '$', 'i');
  var loose = new RegExp(alias, 'i');
  for (var i = 0; i < line.tokens.length; i++){
    var words = '';
    for (var j = i; j < Math.min(i + 7, line.tokens.length); j++){
      words += (j > i ? ' ' : '') + line.tokens[j].t;
      var clean = words.replace(/[:.–—-]+$/,'').trim();
      if (re.test(clean) || (words.length > 5 && loose.test(clean) && re.test(clean.replace(/\s+/g,' '))))
        return { from:i, to:j, x1:line.tokens[j].x + line.tokens[j].w };
    }
  }
  return null;
}

/* Every label, of every field, that appears on this line - so the hunt for a
   value can be bounded by where the NEXT label starts. Two labels on one row
   is common ("Billing Demand 680 kVA    Demand Charge Rs 2,61,800") and
   without this bound the first label swallows the second one's figure. */
function labelsOnLine(line){
  var found = [];
  BILL_PATTERNS.forEach(function(pat){
    for (var a = 0; a < pat[1].length; a++){
      var m = matchLabel(line, pat[1][a]);
      if (m){ found.push({ field:pat[0], alias:pat[1][a], from:m.from, to:m.to }); break; }
    }
  });
  found.sort(function(p, q){ return p.from - q.from; });
  return found;
}

function extractFromTokens(tokens){
  var hits = {};
  if (!tokens || !tokens.length) return hits;
  var lines = groupLines(tokens);
  var lineLabels = lines.map(labelsOnLine);

  BILL_PATTERNS.forEach(function(pat){
    var field = pat[0];
    for (var a = 0; a < pat[1].length && hits[field] === undefined; a++){
      var alias = pat[1][a];
      for (var li = 0; li < lines.length && hits[field] === undefined; li++){
        var hit = matchLabel(lines[li], alias);
        if (!hit) continue;

        /* The value sits between the end of this label and the start of the
           next one on the same row. */
        var stop = lines[li].tokens.length;
        lineLabels[li].forEach(function(L){ if (L.from > hit.to && L.from < stop) stop = L.from; });

        /* Take the LAST number in that span, not the first.

           A bill is a table. "Energy Charge | 5.15 | 18,91,172.70" puts the
           RATE first and the AMOUNT last, and "Maximum Demand | 1.0 | 612.40"
           puts the meter multiplier before the reading. Taking the first
           number after the label reads the rate as the charge and the
           multiplier as the demand - which is exactly what it did, silently,
           on six of sixteen fields. On a simple two-column bill the first and
           last number are the same token, so this rule is right for both. */
        var val = null, via = 'row';
        for (var k = stop - 1; k > hit.to; k--){
          var tk = lines[li].tokens[k];
          var cleaned = deOcr(tk.t);
          if (!isNumberish(cleaned)) continue;
          val = billNum(cleaned); break;
        }

        /* Nothing on the row: try the column directly beneath the label. */
        if (val === null){
          via = 'below';
          var lx = lines[li].tokens[hit.from].x;
          for (var m = li + 1; m < Math.min(li + 3, lines.length) && val === null; m++){
            for (var n = lines[m].tokens.length - 1; n >= 0; n--){
              var t2 = lines[m].tokens[n];
              if (Math.abs(t2.x - lx) > 90) continue;
              if (!isNumberish(deOcr(t2.t))) continue;
              val = billNum(deOcr(t2.t)); break;
            }
          }
        }
        if (val === null) continue;
        hits[field] = { value:val, via:via,
          line: lines[li].tokens.map(function(t){ return t.t; }).join(' ').slice(0,120) };
      }
    }
  });

  var all = tokens.map(function(t){ return t.t; }).join(' ');
  var mm = all.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-\/']*((?:19|20)?\d{2})\b/i);
  if (mm){
    var nm = mm[1][0].toUpperCase() + mm[1].slice(1,3).toLowerCase();
    hits.month = { value: nm + ' ' + (mm[2].length === 4 ? mm[2].slice(2) : mm[2]),
                   line: mm[0], via:'month name' };
  }
  if (hits.pf && hits.pf.value > 1.2){
    hits.pf.value = hits.pf.value > 10 ? hits.pf.value / 1000 : hits.pf.value / 100;
    hits.pf.note = 'read as a percentage and converted';
  }
  return hits;
}

/* Plain text, when that is all there is: each line becomes one token row so
   the same geometric rules still apply, just with a single coarse column. */
function tokensFromText(text){
  var out = [];
  String(text || '').split(/\r?\n/).forEach(function(line, i){
    var x = 0;
    line.trim().split(/\s+/).forEach(function(w){
      if (!w) return;
      out.push({ t:w, x:x, y:i * 12, w:w.length * 5.2, h:10 });
      x += w.length * 5.2 + 5;
    });
  });
  return out;
}
function extractBill(textOrTokens){
  if (!textOrTokens) return {};
  if (typeof textOrTokens === 'string') return extractFromTokens(tokensFromText(textOrTokens));
  return extractFromTokens(textOrTokens);
}

/* ---- checks ------------------------------------------------------- */
/* Things that are arithmetically impossible, and things that are merely
   suspicious, kept apart. An impossible value is almost always a
   misreading; a suspicious one is sometimes the finding. */
function billChecks(b){
  var out = [];
  var kwh = num(b.kwh), kvah = num(b.kvah), pf = num(b.pf);
  var cd = num(b.contract), md = num(b.actualMD), bd = num(b.billingDemand);
  if (kwh !== null && kvah !== null && kwh > kvah + 0.5)
    out.push({ bad:true, t:'kWh is greater than kVAh, which cannot happen — one of the two is misread.' });
  if (pf !== null && (pf <= 0 || pf > 1.02))
    out.push({ bad:true, t:'Power factor of ' + fix(pf,3) + ' is outside 0–1.' });
  if (pf !== null && kwh && kvah){
    var calc = kwh / kvah;
    if (Math.abs(calc - pf) > 0.02)
      out.push({ bad:true, t:'Power factor on the bill is ' + fix(pf,3) + ' but kWh/kVAh gives ' + fix(calc,3) + '.' });
  }
  if (cd !== null && md !== null && md > cd * 1.6)
    out.push({ bad:true, t:'Maximum demand is more than 60 % above contract demand — check the reading.' });
  if (bd !== null && cd !== null && bd < cd * 0.85 - 1)
    out.push({ t:'Billing demand is below 85 % of contract demand, which most tariffs do not allow.' });
  if (cd !== null && md !== null && md < cd * 0.7)
    out.push({ t:'Maximum demand is only ' + pct((md/cd)*100,0) + ' of contract demand — worth a contract demand recommendation.' });
  if (pf !== null && pf < 0.95)
    out.push({ t:'Power factor below 0.95 — this month carries a penalty.' });
  var parts = ['energyCharge','demandCharge','fuelSurcharge','duty','other']
    .reduce(function(a,k){ return a + (num(b[k])||0); }, 0) - (num(b.rebate)||0);
  var net = num(b.net);
  if (net !== null && parts > 0 && Math.abs(parts - net) > 5)
    out.push({ t:'Charges add to ₹ ' + inr(Math.round(parts)) + ' but net payable reads ₹ ' +
      inr(Math.round(net)) + ' — off by ' + inr(Math.round(Math.abs(parts-net))) + '.' });
  return out;
}
function billMissing(b){
  return ['month','contract','actualMD','billingDemand','kwh','kvah','net'].filter(function(k){
    return k === 'month' ? !b.month : num(b[k]) === null;
  });
}
function billsProgress(){
  var total = S.bills.length;
  var done = S.bills.filter(function(b){ return b.verified; }).length;
  return { total:total, done:done, left:total - done };
}
function nextUnverified(from){
  for (var i = 1; i <= S.bills.length; i++){
    var j = (from + i) % S.bills.length;
    if (!S.bills[j].verified) return j;
  }
  return -1;
}

/* ---- loading the library that does the reading -------------------- */
/* Both of these come from a CDN and both can be unavailable: offline, or
   blocked by the page's content policy. Neither is load-bearing - the
   workspace works with no library at all, you just type more - so failure
   is reported plainly and the tool carries on. */
var LIBS = {};
function loadScript(url){
  if (LIBS[url]) return LIBS[url];
  LIBS[url] = new Promise(function(res, rej){
    var s = document.createElement('script');
    s.src = url;
    s.onload = function(){ res(true); };
    s.onerror = function(){ rej(new Error('Could not load ' + url)); };
    document.head.appendChild(s);
  });
  return LIBS[url];
}
var PDFJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
/* pdf.js wants a Worker, and it cannot have one here: `new Worker(url)` on a
   cross-origin URL is a SecurityError in every browser, and the usual dodge -
   fetch the worker and hand it over as a blob - is a network request that a
   published page's content policy refuses. The way through is pdf.js's own
   fallback: if `globalThis.pdfjsWorker` already holds the worker's message
   handler, it runs the worker code on the main thread instead of trying to
   spawn one. Loading pdf.worker.min.js as an ordinary script tag is what puts
   it there. Slower on a big PDF, but a bill is one page of text. */
function ensurePdfJs(){
  if (window.pdfjsLib && window.pdfjsWorker) return Promise.resolve(window.pdfjsLib);
  return loadScript(PDFJS_BASE + 'pdf.min.js')
    .then(function(){ return loadScript(PDFJS_BASE + 'pdf.worker.min.js').catch(function(){ /* fall through */ }); })
    .then(function(){
      if (!window.pdfjsLib) throw new Error('pdf.js did not register itself.');
      try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.js'; } catch (e) {}
      if (!window.pdfjsWorker)
        throw new Error('The PDF worker could not be loaded, so PDFs cannot be opened here.');
      return window.pdfjsLib;
    });
}
/* ---- the OCR reader, and where it comes from ----

   tesseract.js is not one file. It is a script, a web worker, a WebAssembly
   core and a ~4 MB trained language model, and it FETCHES the last three at
   run time. A <script> tag is allowed almost everywhere; those fetches are
   not - a published artifact's content policy refuses them outright, and so
   does any network that allowlists script CDNs only.

   That distinction is the whole reason "the OCR is not working": the button
   loaded a library that then quietly failed to fetch its own brain, and the
   old code reported "matched no labels" as though it had looked. It had not.

   So: the assets are looked for locally first (vendor/tesseract next to the
   app, which PostMan.cmd serves), then on the CDN. Whichever path is taken is
   probed once and reported in the UI, and a failure says what failed. */
var OCR_CDN   = 'https://cdn.jsdelivr.net/npm/';
var OCR_STATE = { checked:false, ok:false, where:'', why:'' };

function ocrPaths(){
  return { workerPath: OCR_CDN + 'tesseract.js@5.0.4/dist/worker.min.js',
           corePath:   OCR_CDN + 'tesseract.js-core@5.0.0',
           langPath:   'https://tessdata.projectnaptha.com/4.0.0' };
}

function ensureTesseract(){
  if (window.Tesseract && OCR_STATE.ok) return Promise.resolve(window.Tesseract);
  var lib = window.Tesseract ? Promise.resolve()
    : loadScript(OCR_CDN + 'tesseract.js@5.0.4/dist/tesseract.min.js');
  return lib.then(function(){
    if (!window.Tesseract){
      OCR_STATE = { checked:true, ok:false, where:'',
                    why:'the reader could not be downloaded (no internet, or the network blocks it)' };
      throw new Error(OCR_STATE.why);
    }
    OCR_STATE.where = 'cdn'; OCR_STATE.checked = true; OCR_STATE.ok = true;
    return window.Tesseract;
  });
}

/* One honest answer to "can this machine read a photograph?", cached. */
function probeOcr(){
  if (OCR_STATE.checked) return Promise.resolve(OCR_STATE);
  return ensureTesseract()
    .then(function(){ return OCR_STATE; })
    .catch(function(e){
      OCR_STATE = { checked:true, ok:false, where:'', why:e.message };
      return OCR_STATE;
    });
}

/* ---- ingestion ---------------------------------------------------- */
/* A bill is one page. Twelve months may arrive as one twelve-page PDF, as
   twelve separate PDFs, or as twelve photographs - all three end up as the
   same list of pages, each with a picture and whatever text could be had. */
function ingestBillPdf(file, onPage){
  return ensurePdfJs().then(function(pdfjs){
    return readFileBuffer(file).then(function(buf){
      return pdfjs.getDocument({ data:new Uint8Array(buf) }).promise;
    });
  }).then(function(doc){
    var chain = Promise.resolve();
    for (var p = 1; p <= doc.numPages; p++){
      (function(p){
        chain = chain.then(function(){
          return doc.getPage(p).then(function(page){
            return page.getTextContent().then(function(tc){
              var vp = page.getViewport({ scale:1 });
              /* Keep every run's POSITION, not just its characters. pdf.js
                 hands back reading order with no line breaks; the extractor
                 needs x and y to tell which number belongs to which label on
                 a multi-column bill. PDF y grows upward, so it is flipped. */
              var tokens = [];
              tc.items.forEach(function(it){
                if (!it.str || !it.str.trim()) return;
                var x = it.transform[4], y = vp.height - it.transform[5];
                var h = Math.abs(it.height || it.transform[3]) || 10;
                var parts = it.str.trim().split(/\s+/);
                parts.forEach(function(w, i){
                  var wd = (it.width || w.length * h * 0.5) / parts.length;
                  tokens.push({ t:w, x:x + i * wd, y:y, w:wd, h:h });
                });
              });
              var text = groupLines(tokens).map(function(l){
                return l.tokens.map(function(t){ return t.t; }).join(' '); }).join('\n');
              /* 150 dpi equivalent is enough to read a bill on screen and
                 keeps a twelve-page set inside the storage quota. */
              var scale = Math.min(2.1, 1400 / Math.max(vp.width, vp.height));
              var v2 = page.getViewport({ scale:scale });
              var cv = document.createElement('canvas');
              cv.width = Math.round(v2.width); cv.height = Math.round(v2.height);
              return page.render({ canvasContext:cv.getContext('2d'), viewport:v2 }).promise
                .then(function(){
                  onPage({ src:file.name + ' p' + p,
                           img:{ dataUrl:cv.toDataURL('image/jpeg', 0.72), w:cv.width, h:cv.height },
                           text:text, tokens:tokens,
                           textLayer: text.replace(/\s/g,'').length > 60 });
                });
            });
          });
        });
      })(p);
    }
    return chain;
  });
}
function readFileBuffer(file){
  return new Promise(function(res, rej){
    var r = new FileReader();
    r.onload = function(){ res(r.result); };
    r.onerror = function(){ rej(new Error('Could not read ' + file.name)); };
    r.readAsArrayBuffer(file);
  });
}

function ingestBillImage(file, onPage){
  return ingestImage(file).then(function(a){
    onPage({ src:file.name, img:a, text:'', textLayer:false });
  });
}

/* A page becomes a bill row: existing rows are matched by month where the
   text gave one, so re-uploading a clearer scan of March updates March
   rather than adding a fourteenth month. */
function attachPage(page){
  var hits = extractBill(page.tokens && page.tokens.length ? page.tokens : page.text);
  var row = null;
  if (hits.month){
    for (var i = 0; i < S.bills.length; i++){
      if (String(S.bills[i].month||'').toLowerCase() === String(hits.month.value).toLowerCase()){ row = S.bills[i]; break; }
    }
  }
  if (!row){
    /* Otherwise fill the first row that has no bill attached yet. */
    for (var j = 0; j < S.bills.length; j++) if (!S.bills[j].img){ row = S.bills[j]; break; }
  }
  if (!row){ row = { month:'' }; S.bills.push(row); }
  row.img = page.img;
  row.src = page.src;
  row.ocr = page.text || '';
  row.tokens = page.tokens || null;
  row.ocrSource = page.textLayer ? 'pdf' : (page.text ? 'ocr' : 'none');
  row.hits = {};
  Object.keys(hits).forEach(function(k){ row.hits[k] = hits[k]; });
  applyHits(row, false);
  row.verified = false;
  return row;
}
/* Only fills blanks unless told otherwise - a figure a human typed is not
   overwritten by a later machine reading of the same bill. */
function applyHits(row, overwrite){
  if (!row.hits) return 0;
  var n = 0;
  Object.keys(row.hits).forEach(function(k){
    var cur = row[k];
    var blank = (k === 'month') ? !cur : (num(cur) === null);
    if (blank || overwrite){ row[k] = row.hits[k].value; n++; }
  });
  return n;
}

/* A phone photograph of a bill is the worst input OCR can get: low contrast,
   uneven lighting, and often too few pixels per character. Tesseract is far
   more accurate on a clean, high-contrast, large-enough image, and this costs
   a few hundred milliseconds. Most of the "OCR does not work" experience is
   actually this step missing. */
function preprocess(dataUrl, minEdge){
  return loadImg(dataUrl).then(function(img){
    var w = img.naturalWidth, h = img.naturalHeight;
    var scale = Math.max(1, Math.min(3, (minEdge || 1800) / Math.max(w, h)));
    var cv = document.createElement('canvas');
    cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
    var cx = cv.getContext('2d');
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, 0, 0, cv.width, cv.height);
    var im = cx.getImageData(0, 0, cv.width, cv.height), d = im.data;
    /* Grey, then stretch what is actually there onto the full range. A scan
       that lives between 90 and 200 becomes one that lives between 0 and 255
       - the difference between a readable 8 and a readable B. */
    var lo = 255, hi = 0, g, i;
    for (i = 0; i < d.length; i += 4){
      g = (d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114) | 0;
      d[i] = d[i+1] = d[i+2] = g;
      if (g < lo) lo = g;
      if (g > hi) hi = g;
    }
    var span = Math.max(1, hi - lo);
    for (i = 0; i < d.length; i += 4){
      g = ((d[i] - lo) * 255 / span) | 0;
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      /* gentle S-curve: darken ink, lift paper, leave midtones alone */
      g = g < 110 ? Math.max(0, g - 28) : g > 165 ? Math.min(255, g + 28) : g;
      d[i] = d[i+1] = d[i+2] = g;
    }
    cx.putImageData(im, 0, 0);
    return { dataUrl: cv.toDataURL('image/png'), w:cv.width, h:cv.height, scale:scale };
  });
}

function runOcrOn(row, statusFn){
  var pre;
  return ensureTesseract().then(function(T){
    statusFn('Cleaning the image…');
    return preprocess(row.img.dataUrl, 2000).then(function(p){
      pre = p;
      statusFn('Reading the bill…');
      return T.recognize(p.dataUrl, 'eng', ocrPaths(), {
        logger: function(m){
          if (m.status === 'recognizing text') statusFn('Reading — ' + Math.round(m.progress*100) + ' %');
        }
      });
    });
  }).then(function(r){
    var d = (r && r.data) || {};
    /* An empty result here means the reader never actually ran - its worker
       or its language model failed to load. Reporting that as "found nothing"
       sends the user hunting for a problem in their scan. */
    if (!d.text && !(d.words && d.words.length)){
      OCR_STATE.ok = false;
      OCR_STATE.why = 'the reader loaded but could not fetch its language model';
      throw new Error('The reader started but could not load its language model, so nothing was read.');
    }
    row.ocr = d.text || '';
    /* Word boxes, scaled back to the stored image, so the geometric extractor
       works in the same coordinate space the viewer shows. */
    var k = 1 / (pre.scale || 1);
    row.tokens = (d.words || []).filter(function(w){ return w.text && w.text.trim(); })
      .map(function(w){
        var b = w.bbox || { x0:0, y0:0, x1:0, y1:0 };
        return { t:w.text.trim(), x:b.x0*k, y:b.y0*k,
                 w:(b.x1-b.x0)*k, h:(b.y1-b.y0)*k, conf:w.confidence };
      });
    row.ocrSource = 'ocr';
    row.hits = extractBill(row.tokens.length ? row.tokens : row.ocr);
    var n = applyHits(row, false);
    statusFn('');
    return n;
  });
}

/* Read ONE number out of a box the user drew.

   This is the escape hatch that makes the screen dependable. Full-page OCR is
   a guess at forty numbers at once; a cropped box around a single figure,
   enlarged and cleaned, is a far easier problem and gets it right almost
   every time. When the page-wide pass misses a field - and on a bad scan it
   will - dragging a box round the number beats typing it, and beats trusting
   a guess nobody checked. */
function readRegion(row, rect, statusFn){
  return ensureTesseract().then(function(){
    statusFn('Cropping…');
    return loadImg(row.img.dataUrl);
  }).then(function(img){
    var sc = Math.max(2, Math.min(6, 420 / Math.max(8, rect.h)));
    var cv = document.createElement('canvas');
    cv.width = Math.round(rect.w * sc); cv.height = Math.round(rect.h * sc);
    var cx = cv.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, cv.width, cv.height);
    return preprocess(cv.toDataURL('image/png'), 0);
  }).then(function(p){
    statusFn('Reading the box…');
    return window.Tesseract.recognize(p.dataUrl, 'eng', ocrPaths(), {
      logger:function(m){ if (m.status === 'recognizing text')
        statusFn('Reading — ' + Math.round(m.progress*100) + ' %'); }
    });
  }).then(function(r){
    statusFn('');
    var raw = ((r && r.data && r.data.text) || '').replace(/\s+/g,' ').trim();
    if (!raw) throw new Error('The reader returned nothing - it could not load its language model.');
    return { raw:raw, value:billNum(deOcr(raw)),
             conf:(r && r.data && r.data.confidence) || null };
  });
}

/* ---- the workspace ------------------------------------------------ */
/* Which field a box-read should fill. Module-level rather than per-render so
   it survives the repaint that follows every accepted value. */
var BILL_FOCUS = null;
function billFieldName(k){
  for (var i = 0; i < BILL_FIELDS.length; i++) if (BILL_FIELDS[i].k === k) return BILL_FIELDS[i].t;
  return k;
}
function paintFocus(){
  var inputs = document.querySelectorAll('#work input[data-billfield]');
  for (var i = 0; i < inputs.length; i++)
    inputs[i].style.outline = inputs[i].dataset.billfield === BILL_FOCUS ? '2px solid var(--brand)' : '';
}

FORMS.verify = function(w){
  if (!S.bills.length){
    var e = card('No bills yet',
      'Upload them below, or create twelve empty months in the bill section and type the figures straight in.');
    e.appendChild(billUploader());
    w.appendChild(e);
    return;
  }
  if (S.billCursor === undefined || S.billCursor === null || S.billCursor >= S.bills.length) S.billCursor = 0;
  var idx = S.billCursor;
  var b = S.bills[idx];
  var prog = billsProgress();

  /* --- progress and navigation --- */
  var top = card('Bill ' + (idx+1) + ' of ' + prog.total +
    '  ·  ' + prog.done + ' verified, ' + prog.left + ' to go',
    b.src ? ('From ' + b.src + (b.ocrSource === 'pdf' ? ' — read from the PDF text layer' :
             b.ocrSource === 'ocr' ? ' — read by OCR' : ' — no text found, type the figures')) :
            'No bill image attached to this month.');

  var barOuter = el('div','height:6px;border-radius:3px;background:var(--rule);overflow:hidden;margin:0 0 12px;');
  barOuter.appendChild(el('div','height:100%;width:' + (prog.total ? (prog.done/prog.total)*100 : 0) +
    '%;background:var(--ok);transition:width .2s;'));
  top.appendChild(barOuter);

  /* Every bill as a chip, so you can see at a glance what is left and jump
     straight to the awkward one rather than clicking Next eleven times. */
  var strip = el('div','display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px;');
  S.bills.forEach(function(bb, i){
    var miss = billMissing(bb).length;
    var chip = el('button','', (bb.month || ('#' + (i+1))));
    chip.type = 'button';
    chip.className = 'btn sm';
    chip.style.cssText = 'border-color:' + (bb.verified ? 'var(--ok)' : (miss ? 'var(--bad)' : 'var(--rule)')) +
      ';' + (i === idx ? 'outline:2px solid var(--brand);outline-offset:1px;' : '') +
      (bb.verified ? 'color:var(--ok);' : '');
    chip.title = bb.verified ? 'Verified' : (miss ? miss + ' field(s) still empty' : 'Filled, not yet verified');
    chip.onclick = function(){ S.billCursor = i; save(); renderAll(); };
    strip.appendChild(chip);
  });
  top.appendChild(strip);

  var nav = el('div','display:flex;gap:6px;flex-wrap:wrap;align-items:center;');
  nav.appendChild(btn('← Previous', function(){
    S.billCursor = (idx - 1 + S.bills.length) % S.bills.length; save(); renderAll(); }));
  nav.appendChild(btn('Next →', function(){
    S.billCursor = (idx + 1) % S.bills.length; save(); renderAll(); }));
  if (prog.left) nav.appendChild(btn('Jump to next unverified', function(){
    var n = nextUnverified(idx); if (n >= 0){ S.billCursor = n; save(); renderAll(); } }));
  top.appendChild(nav);
  w.appendChild(top);

  /* --- the two panes --- */
  var split = el('div');
  split.className = 'verifysplit';

  /* LEFT: the figures */
  var left = el('div','min-width:0;');
  var lc = card('Figures on this bill',
    'What the reader found is offered beside each field — click it to accept, or type over it. Nothing is counted until you press Verify.');

  BILL_FIELDS.forEach(function(f){
    var row = el('div','display:flex;gap:8px;align-items:flex-end;margin-bottom:8px;');
    var fieldNode = f.type === 'text' ? fText(b, f.k, f.t) : fNum(b, f.k, f.t + (f.unit ? ', ' + f.unit : ''));
    fieldNode.style.flex = '1 1 auto';
    row.appendChild(fieldNode);

    /* Whichever field was last focused is where a box-read lands. */
    var inp = fieldNode.querySelector('input');
    if (inp){
      inp.addEventListener('focus', function(){ BILL_FOCUS = f.k; paintFocus(); });
      inp.dataset.billfield = f.k;
      if (BILL_FOCUS === f.k) inp.style.outline = '2px solid var(--brand)';
    }
    var hit = b.hits && b.hits[f.k];
    var chipWrap = el('div','flex:0 0 auto;display:flex;flex-direction:column;gap:2px;align-items:flex-end;min-width:104px;');
    if (hit){
      var same = (f.type === 'text') ? String(b[f.k]||'') === String(hit.value)
                                     : num(b[f.k]) === num(hit.value);
      var chip = el('button','', (same ? '✓ ' : '') + hit.value);
      chip.type='button'; chip.className='btn sm';
      chip.style.cssText = 'font-family:var(--mono);' + (same ? 'color:var(--ok);border-color:var(--ok);' : 'color:var(--brand);');
      chip.title = 'Found on: "' + (hit.line||'').slice(0,90) + '"' + (hit.note ? '\n' + hit.note : '');
      chip.onclick = function(){ b[f.k] = hit.value; save(); renderAll(); };
      chipWrap.appendChild(chip);
      chipWrap.appendChild(el('div','font-size:10px;color:var(--ink-3);text-align:right;',
        same ? 'matches' : 'reader found'));
    } else if (b.ocrSource && b.ocrSource !== 'none'){
      chipWrap.appendChild(el('div','font-size:10px;color:var(--warn);text-align:right;line-height:1.3;',
        'not found — read it off the bill'));
    }
    row.appendChild(chipWrap);
    lc.appendChild(row);
  });

  /* live arithmetic, recomputed as you type because that is when a
     misreading is cheapest to notice */
  var checks = billChecks(b), missing = billMissing(b);
  var live = el('div','margin-top:10px;');
  var kwh = num(b.kwh), kvah = num(b.kvah);
  if (kwh && kvah) live.appendChild(el('div','font-family:var(--mono);font-size:12px;color:var(--ink-2);margin-bottom:6px;',
    'kWh / kVAh = ' + (kwh/kvah).toFixed(3) + '   ·   blended rate = ' +
    (num(b.net) ? '₹ ' + (num(b.net)/kwh).toFixed(2) + ' /kWh' : '—')));
  if (missing.length){
    var mm = el('p','', missing.length + ' field(s) still empty: ' +
      missing.map(function(k){ var f = null; BILL_FIELDS.forEach(function(x){ if (x.k===k) f=x; }); return f?f.t:k; }).join(', '));
    mm.className = 'callout warn';
    live.appendChild(mm);
  }
  checks.forEach(function(c){
    var p = el('p','', c.t); p.className = 'callout ' + (c.bad ? 'bad' : 'info');
    live.appendChild(p);
  });
  lc.appendChild(live);

  /* the single button the whole screen is built around */
  var vbar = el('div','display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:14px;');
  var vb = el('button','', b.verified ? '✓ Verified — press to unverify' :
    (prog.left > 1 ? 'Verify this bill → next' : 'Verify this bill'));
  vb.type = 'button';
  vb.className = 'btn' + (b.verified ? ' sm' : ' primary');
  vb.onclick = function(){
    if (b.verified){ b.verified = false; save(); renderAll(); return; }
    var hard = billChecks(b).filter(function(c){ return c.bad; });
    if (hard.length && !confirm('This bill still fails ' + hard.length + ' arithmetic check:\n\n• ' +
        hard.map(function(c){ return c.t; }).join('\n• ') +
        '\n\nVerify it anyway?')) return;
    b.verified = true;
    b.verifiedAt = new Date().toISOString().slice(0,10);
    var n = nextUnverified(idx);
    if (n >= 0) S.billCursor = n;
    save(); renderAll();
  };
  vbar.appendChild(vb);
  if (b.hits && Object.keys(b.hits).length) vbar.appendChild(btn('Re-apply everything the reader found', function(){
    var n = applyHits(b, true); save(); renderAll();
    if (!n) alert('The reader found nothing on this bill.');
  }));
  lc.appendChild(vbar);
  left.appendChild(lc);

  /* searching the text is how you find the one number the extractor missed */
  if (b.ocr){
    var sc = card('Find it in the text',
      'Everything the reader pulled off this bill. Type a word — "demand", "kvah", "payable" — to see the lines it appears on.');
    var si = el('input'); si.type='search'; si.placeholder='demand';
    var res = el('div','font-family:var(--mono);font-size:11.5px;line-height:1.6;max-height:210px;overflow:auto;margin-top:8px;');
    var draw = function(){
      clear(res);
      var qtext = si.value.trim().toLowerCase();
      var lines = b.ocr.split(/\r?\n/).map(function(l){ return l.replace(/\s+/g,' ').trim(); }).filter(Boolean);
      var show = qtext ? lines.filter(function(l){ return l.toLowerCase().indexOf(qtext) >= 0; }) : lines;
      if (!show.length){ res.appendChild(el('div','color:var(--ink-3)','Nothing on this bill matches that.')); return; }
      show.slice(0, 200).forEach(function(l){
        res.appendChild(el('div','padding:1px 0;border-bottom:1px solid var(--rule);', l));
      });
      if (show.length > 200) res.appendChild(el('div','color:var(--ink-3)', '…and ' + (show.length-200) + ' more lines.'));
    };
    si.addEventListener('input', draw);
    sc.appendChild(labelled('Search this bill', si));
    sc.appendChild(res);
    draw();
    left.appendChild(sc);
  }
  split.appendChild(left);

  /* RIGHT: the bill itself */
  var right = el('div','min-width:0;');
  var rc = card('The bill', b.img ? 'Drag to move it, scroll or use the slider to zoom. ' +
    'Click a field on the left, press Read a box, then drag a box round that number on the bill.' :
    'No image for this month — upload one below and it attaches here.');
  if (b.img){
    var zoomWrap = el('div','display:flex;gap:10px;align-items:center;margin-bottom:8px;');
    var zr = el('input'); zr.type='range'; zr.min='0.4'; zr.max='4'; zr.step='0.05';
    zr.value = String(b.zoom || 1); zr.style.flex = '1';
    var view = el('div','position:relative;overflow:hidden;background:#f1f4f7;border:1px solid var(--rule);' +
      'border-radius:6px;height:min(74vh,860px);cursor:grab;');
    var im = el('img','position:absolute;transform-origin:0 0;user-select:none;-webkit-user-drag:none;max-width:none;');
    im.src = b.img.dataUrl; im.alt = 'Electricity bill ' + (b.month || '');
    view.appendChild(im);

    var st = { z: b.zoom || null, x: b.panX || 0, y: b.panY || 0 };
    function fit(){
      var vw = view.clientWidth || 600;
      st.z = Math.min(vw / b.img.w, (view.clientHeight||700) / b.img.h);
      st.x = (vw - b.img.w * st.z) / 2; st.y = 0;
    }
    function paint(){
      im.style.width = b.img.w + 'px';
      im.style.transform = 'translate(' + st.x + 'px,' + st.y + 'px) scale(' + st.z + ')';
      zr.value = String(st.z);
    }
    if (!st.z) fit();
    /* The image is inside a card that has not been laid out yet on first
       paint, so fit again once the browser knows how wide the pane is. */
    requestAnimationFrame(function(){ if (!b.zoom){ fit(); paint(); } else paint(); });
    if (window.ResizeObserver){
      new ResizeObserver(function(){ if (!b.zoom){ fit(); paint(); } }).observe(view);
    }

    zr.addEventListener('input', function(){
      var old = st.z, z = parseFloat(zr.value);
      /* zoom about the centre of the viewport, not the origin */
      var cx = view.clientWidth/2, cy = view.clientHeight/2;
      st.x = cx - (cx - st.x) * (z/old);
      st.y = cy - (cy - st.y) * (z/old);
      st.z = z; paint();
      b.zoom = st.z; b.panX = st.x; b.panY = st.y; save();
    });
    view.addEventListener('wheel', function(ev){
      ev.preventDefault();
      var old = st.z, z = Math.max(0.4, Math.min(4, st.z * (ev.deltaY < 0 ? 1.12 : 1/1.12)));
      var r = view.getBoundingClientRect();
      var cx = ev.clientX - r.left, cy = ev.clientY - r.top;
      st.x = cx - (cx - st.x) * (z/old);
      st.y = cy - (cy - st.y) * (z/old);
      st.z = z; paint();
      b.zoom = st.z; b.panX = st.x; b.panY = st.y; save();
    }, { passive:false });
    /* ---- read-a-box ----
       In read mode a drag draws a marquee instead of panning, and the box is
       handed to Tesseract on its own. Everything about it is deliberately
       small: one field at a time, always visible, always reversible. */
    var marquee = el('div','position:absolute;border:2px dashed var(--brand);' +
      'background:rgba(0,74,173,.10);pointer-events:none;display:none;');
    view.appendChild(marquee);
    var readMode = false, box0 = null;
    function toImage(cx2, cy2){
      return { x:(cx2 - st.x) / st.z, y:(cy2 - st.y) / st.z };
    }

    var drag = null;
    view.addEventListener('pointerdown', function(ev){
      var r0 = view.getBoundingClientRect();
      if (readMode){
        box0 = { x:ev.clientX - r0.left, y:ev.clientY - r0.top };
        marquee.style.display = 'block';
        marquee.style.left = box0.x + 'px'; marquee.style.top = box0.y + 'px';
        marquee.style.width = '0px'; marquee.style.height = '0px';
        view.setPointerCapture(ev.pointerId);
        return;
      }
      drag = { sx:ev.clientX, sy:ev.clientY, ox:st.x, oy:st.y };
      view.setPointerCapture(ev.pointerId); view.style.cursor='grabbing';
    });
    view.addEventListener('pointermove', function(ev){
      if (box0){
        var r1 = view.getBoundingClientRect();
        var cx2 = ev.clientX - r1.left, cy2 = ev.clientY - r1.top;
        marquee.style.left = Math.min(box0.x, cx2) + 'px';
        marquee.style.top = Math.min(box0.y, cy2) + 'px';
        marquee.style.width = Math.abs(cx2 - box0.x) + 'px';
        marquee.style.height = Math.abs(cy2 - box0.y) + 'px';
        return;
      }
      if (!drag) return;
      st.x = drag.ox + (ev.clientX - drag.sx);
      st.y = drag.oy + (ev.clientY - drag.sy);
      paint();
    });
    var endDrag = function(ev){
      if (box0){
        var r2 = view.getBoundingClientRect();
        var cx2 = (ev && ev.clientX ? ev.clientX : 0) - r2.left;
        var cy2 = (ev && ev.clientY ? ev.clientY : 0) - r2.top;
        var p1 = toImage(Math.min(box0.x, cx2), Math.min(box0.y, cy2));
        var p2 = toImage(Math.max(box0.x, cx2), Math.max(box0.y, cy2));
        box0 = null;
        marquee.style.display = 'none';
        var rect = { x:Math.max(0,p1.x), y:Math.max(0,p1.y),
                     w:Math.min(b.img.w,p2.x) - Math.max(0,p1.x),
                     h:Math.min(b.img.h,p2.y) - Math.max(0,p1.y) };
        if (rect.w < 6 || rect.h < 5){ readStatus.textContent = 'Box too small \u2014 drag across the whole number.'; return; }
        if (!BILL_FOCUS){ readStatus.textContent = 'Click the field you want first, then drag the box.'; return; }
        readStatus.textContent = 'Reading' + '…';
        readRegion(b, rect, function(t){ readStatus.textContent = t; })
          .then(function(res){
            if (res.value === null && !res.raw){
              readStatus.textContent = 'Nothing readable in that box.'; return;
            }
            var target = BILL_FOCUS;
            var isText = target === 'month';
            b[target] = isText ? res.raw : (res.value === null ? b[target] : res.value);
            b.readLog = b.readLog || {};
            b.readLog[target] = { raw:res.raw, conf:res.conf };
            save(); renderAll();
          })
          .catch(function(e){
            readStatus.textContent = '';
            alert('The reader is not available here.\n\n' + e.message +
              '\n\nType the figure from the image instead \u2014 it is right there beside the field.');
          });
        return;
      }
      if (!drag) return;
      drag = null; view.style.cursor='grab';
      b.zoom = st.z; b.panX = st.x; b.panY = st.y; save();
    };
    view.addEventListener('pointerup', endDrag);
    view.addEventListener('pointercancel', endDrag);

    var readStatus = el('span','font-size:12px;color:var(--ink-3);align-self:center;');
    var readBtn = el('button','', 'Read a box');
    readBtn.type = 'button'; readBtn.className = 'btn sm';
    readBtn.onclick = function(){
      readMode = !readMode;
      readBtn.className = 'btn sm' + (readMode ? ' primary' : '');
      readBtn.textContent = readMode ? 'Drag a box on the bill' : 'Read a box';
      view.style.cursor = readMode ? 'crosshair' : 'grab';
      readStatus.textContent = readMode
        ? (BILL_FOCUS ? 'Reading into: ' + billFieldName(BILL_FOCUS) : 'Click a field on the left first.')
        : '';
    };
    zoomWrap.appendChild(el('span','font-size:12px;color:var(--ink-3);flex:0 0 auto;','Zoom'));
    zoomWrap.appendChild(zr);
    zoomWrap.appendChild(btn('Fit', function(){ fit(); paint(); b.zoom=st.z; b.panX=st.x; b.panY=st.y; save(); }));
    zoomWrap.appendChild(btn('100 %', function(){ st.z=1; paint(); b.zoom=1; save(); }));
    zoomWrap.appendChild(readBtn);
    rc.appendChild(zoomWrap);
    rc.appendChild(view);
    rc.appendChild(readStatus);

    var ob = el('div','display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;');
    var status = el('span','font-size:12px;color:var(--ink-3);align-self:center;');
    ob.appendChild(btn(b.ocr ? 'Run OCR again' : 'Try OCR on this bill', function(){
      status.textContent = 'Loading the reader…';
      runOcrOn(b, function(t){ status.textContent = t; })
        .then(function(n){ save(); renderAll();
          alert(n ? ('Read the bill and filled ' + n + ' empty field(s). Check each one against the image.')
                  : 'The reader ran but matched no labels. Type the figures from the image.'); })
        .catch(function(e){ status.textContent=''; alert(
          'OCR is not available here.\n\n' + e.message +
          '\n\nThis needs to download a reader, which the offline file can do when online but a ' +
          'published page may block. The figures can always be typed from the image on the right.'); });
    }));
    ob.appendChild(btn('Remove this image', function(){
      if (!confirm('Remove the bill image for ' + (b.month||'this month') + '? The figures stay.')) return;
      b.img = null; b.ocr=''; b.hits={}; b.ocrSource='none'; save(); renderAll();
    }));
    ob.appendChild(status);
    rc.appendChild(ob);
  }
  right.appendChild(rc);
  split.appendChild(right);
  w.appendChild(split);

  var up = card('Add more bills', 'PDFs, photographs, or both at once.');
  up.appendChild(billUploader());
  up.appendChild(ocrStatusPanel());
  w.appendChild(up);

  if (prog.total && prog.done === prog.total){
    var okc = card('All ' + prog.total + ' bills verified',
      'The bill analysis section, the baseline and the contract demand recommendation are all built from these figures.');
    okc.appendChild(btn('Drop every bill image (keeps all the figures)', function(){
      if (!confirm('Remove all ' + prog.total + ' bill images?\n\nThe figures and the report are untouched. ' +
        'This is worth doing once verification is finished — the images are the bulk of the saved draft.')) return;
      S.bills.forEach(function(x){ x.img=null; x.ocr=''; x.hits={}; x.ocrSource='none'; });
      save(); renderAll();
    }));
    w.appendChild(okc);
  }
};

/* Says plainly whether this machine can read a photograph, and if not, why.
   A capability the user cannot see the state of is a capability they will
   blame themselves for. */
function ocrStatusPanel(){
  var wrap = el('div','margin-top:12px;');
  var line = el('p','', '');
  line.className = 'callout info';

  var pdfOnly = S.bills.filter(function(b){ return b.ocrSource === 'pdf'; }).length;
  var photos  = S.bills.filter(function(b){ return b.img && b.ocrSource !== 'pdf'; }).length;

  /* Nothing is loaded until asked. Probing on every render would fire a
     doomed request - and a console error - on machines that will never have
     the reader, which is most of them when the app is opened as a file. */
  function show(st){
    if (st.ok){
      line.className = 'callout good';
      line.textContent = 'OCR reader available. Photographs can be read automatically, and you can ' +
        'drag a box round any single figure to read just that. It downloads once and is then cached ' +
        'by the browser.';
    } else {
      line.className = 'callout warn';
      line.textContent = 'OCR is not available here \u2014 ' + (st.why || 'its files could not be loaded') +
        '. PDFs that carry a text layer are still read automatically; ' +
        (photos ? 'the ' + photos + ' photograph(s) here need their figures typed in, with the bill on the right. '
                : '') +
        'PDFs are unaffected. For photographs, read the figures off the bill on the right \u2014 every ' +
        'field is beside it, and it is faster than fighting a bad scan.';
    }
  }

  if (OCR_STATE.checked){
    show(OCR_STATE);
    wrap.appendChild(line);
  } else {
    wrap.appendChild(btn('Check whether OCR can run here', function(){
      line.textContent = 'Checking' + '…';
      if (!line.parentNode) wrap.insertBefore(line, wrap.firstChild);
      probeOcr().then(show);
    }));
    wrap.appendChild(el('p','font-size:12px;color:var(--ink-3);margin:8px 0 0',
      'PDF bills are read without any of this. OCR is only needed for photographs, ' +
      'and it downloads a reader the first time it runs.'));
  }

  if (pdfOnly || photos){
    wrap.appendChild(el('p','font-size:12px;color:var(--ink-3);margin:8px 0 0',
      pdfOnly + ' bill(s) read from a PDF text layer' +
      (photos ? ', ' + photos + ' from images' : '') + '.'));
  }
  return wrap;
}

function billUploader(){
  var wrap = el('div');
  var i = el('input'); i.type='file'; i.multiple = true;
  i.accept = '.pdf,image/*';
  var status = el('div','font-size:12px;color:var(--ink-3);margin-top:8px;min-height:18px;');
  i.addEventListener('change', function(){
    var files = [].slice.call(i.files || []);
    if (!files.length) return;
    i.value = '';
    var added = 0, problems = [];
    status.textContent = 'Reading ' + files.length + ' file(s)…';
    var chain = Promise.resolve();
    files.forEach(function(f){
      chain = chain.then(function(){
        status.textContent = 'Reading ' + f.name + '…';
        var isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
        var take = function(page){ attachPage(page); added++; };
        return (isPdf ? ingestBillPdf(f, take) : ingestBillImage(f, take))
          .catch(function(e){ problems.push(f.name + ': ' + e.message); });
      });
    });
    chain.then(function(){
      status.textContent = '';
      S.billCursor = 0;
      S.active = 'verify';
      save(); renderAll();
      var msg = added + ' bill page(s) added.';
      var noText = S.bills.filter(function(b){ return b.img && b.ocrSource === 'none'; }).length;
      if (noText) msg += '\n\n' + noText + ' of them are pictures with no text layer — use "Try OCR on this bill", ' +
        'or just read the figures off the image, which is faster than fighting a bad scan.';
      if (problems.length) msg += '\n\nCould not read:\n• ' + problems.join('\n• ') +
        '\n\nIf these are PDFs, the PDF reader could not be loaded here. Export the pages as images and upload those.';
      alert(msg);
    });
  });
  wrap.appendChild(labelled('Bill PDFs or photographs', i,
    'A twelve-page PDF becomes twelve bills. Each page is matched to a month when the text gives one, ' +
    'so a clearer re-scan updates that month instead of adding another.'));
  wrap.appendChild(status);
  return wrap;
}
