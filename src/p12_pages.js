/* ===================================================================
   COVER, LETTERHEAD AND THE FLOW ENGINE.
   =================================================================== */

/* ---- Cover, rebuilt from the Canva original as live text ---- */
/* ===================================================================
   COVER AND LETTERHEAD

   Both pages are the KISEM artwork with the swappable parts cut out -
   a "plate" - composited under live HTML at the coordinates measured
   from the original PDF. Nothing about the artwork is redrawn in code,
   so the texture, the corner graphics, the watermark and the logos are
   pixel-identical to what the designer made; and nothing that changes
   per report is baked into pixels, so the company name, the address,
   the page number and the running header stay real type at real sizes.

   Every number below is a point coordinate lifted straight from the
   source PDF's text and drawing geometry. Where the design sets a text
   in a licensed font the app substitutes the nearest Google Font of the
   same class and weight, named beside it.
   =================================================================== */

/* Anything that measures itself - a name that steps down until it fits, a
   badge line that shrinks to stay on one line - needs real layout, and a
   detached node has none: every scrollHeight reads 0 and the fit silently
   does nothing. So the page is parked in the offscreen measure host while
   its fit passes run, then taken back out. This is the same class of bug as
   measuring an image before it decodes; both fail by doing nothing. */
function withLayout(node, fits){
  var host = q('measure');
  if (!host || !fits.length) return;
  host.appendChild(node);
  for (var i = 0; i < fits.length; i++) fits[i]();
  host.removeChild(node);
}

/* Shrinks a one-line label until it stops wrapping or overflowing. */
function fitLine(node, maxWpt, sizes){
  for (var i = 0; i < sizes.length; i++){
    node.style.fontSize = px(sizes[i]);
    if (node.scrollWidth <= maxWpt * PT + 1) return;
  }
}

/* Text positioned by the TOP of its bounding box, as the PDF reports it.
   Using top rather than baseline means a substituted font with different
   metrics shifts by a fraction of a line instead of sitting visibly off. */
function at(l, t, w, style, text){
  return el('div', 'position:absolute;left:' + px(l) + ';top:' + px(t) +
    (w ? ';width:' + px(w) : '') + ';' + style, text);
}

function renderCover(){
  var p = el('div','position:relative;width:' + px(PAGE.w) + ';height:' + px(PAGE.h) +
    ';background:#fff;color:' + C.charcoal + ';font-family:' + F.body + ';overflow:hidden;');
  var add = function(n){ p.appendChild(n); return n; };
  var type = TYPES[S.meta.reportType];

  /* --- the artwork, full bleed --- */
  var plate = el('img', box(0, 0, PAGE.w, PAGE.h) + 'object-fit:fill;');
  plate.src = PLATE1; plate.alt = '';
  add(plate);

  /* --- the two swappable pictures, under the type --- */
  /* Gate photograph: the yellow block behind it is part of the plate, so the
     photo sits in the plate's own frame at its own coordinates. */
  var frame = add(el('div', box(59.5, 364.3, 476.4, 317.6) + 'overflow:hidden;background:#EDF1F5;'));
  if (S.assets.gate){
    var gi = el('img','width:100%;height:100%;object-fit:cover;object-position:' +
      (S.assets.focalX*100) + '% ' + (S.assets.focalY*100) + '%;');
    gi.src = S.assets.gate.dataUrl; gi.alt = (S.company.name || 'Plant') + ' main gate';
    frame.appendChild(gi);
  } else {
    frame.appendChild(el('div','width:100%;height:100%;display:flex;align-items:center;' +
      'justify-content:center;font-size:' + px(9) + ';color:#9AA7B4;letter-spacing:.08em;',
      'MAIN GATE / PLANT PHOTOGRAPH'));
  }

  /* Client logo: the original has a placeholder card here. No frame - the
     logo is the mark, not a boxed image. */
  /* The PDF's logo IMAGE bbox includes the mock-up card's shadow; the card
     itself is the 114 pt square the artwork masks out. */
  var tile = add(el('div', box(424.8, 248.9, 114.1, 114.1) +
    'display:flex;align-items:center;justify-content:center;'));
  if (S.assets.logo){
    var li = el('img','max-width:100%;max-height:100%;object-fit:contain;');
    li.src = S.assets.logo.dataUrl; li.alt = (S.company.name || 'Client') + ' logo';
    tile.appendChild(li);
  } else {
    tile.appendChild(el('div','border:' + px(0.75) + ' dashed ' + C.rule + ';width:100%;height:100%;' +
      'display:flex;align-items:center;justify-content:center;font-size:' + px(7.5) +
      ';color:' + C.rule + ';letter-spacing:.08em;', 'CLIENT LOGO'));
  }

  /* --- the navy strip's vertical KISEM --- */
  /* Both vertical runs in the artwork have PDF text direction (0,-1): they
     read BOTTOM TO TOP, with the glyph tops facing left. CSS vertical-rl
     gives the opposite - top to bottom, tops facing right - so it needs the
     180 degree turn to match. Without it the word is upside down relative to
     the design, which reads as a mistake rather than a style. */
  var VERT = 'writing-mode:vertical-rl;transform:rotate(180deg);';
  var strip = add(el('div', box(15.2, 0, 28.7, 149) +
    'display:flex;align-items:center;justify-content:center;'));
  strip.appendChild(el('span', VERT + 'font-family:Arial,Helvetica,sans-serif;' +
    'font-weight:700;font-size:' + px(16) + ';letter-spacing:.42em;color:#fff;white-space:nowrap;',
    'KISEM'));

  /* --- the yellow badge, top left --- */
  var badgeTitle = add(at(52.2, 33.5, null, 'font-family:' + F.ui + ';font-weight:400;font-size:' +
    px(14.2) + ';line-height:1.15;color:' + C.slate + ';white-space:nowrap;', type));
  add(at(52.2, 57.5, 200, 'font-family:' + F.cond + ';font-weight:700;font-size:' + px(26) +
    ';line-height:1.05;color:' + C.slate + ';', S.meta.financialYear));

  /* --- programme pill (the outline is in the plate) --- */
  add(at(65.5, 111.0, 360, 'font-family:' + F.geo + ';font-size:' + px(20) +
    ';line-height:1.3;color:' + C.charcoal + ';white-space:nowrap;', IEA.spine));

  /* --- the title --- */
  var title = add(el('div', box(34.7, 143.5, 520, 70) + 'font-family:' + F.body +
    ';font-weight:700;font-size:' + px(31) + ';line-height:1.04;color:' + C.navy +
    ';letter-spacing:-.015em;text-transform:uppercase;'));
  title.appendChild(document.createTextNode(type));
  title.appendChild(el('br'));
  title.appendChild(document.createTextNode('Sustainability Study'));

  add(at(35.9, 215.5, 300, 'font-family:' + F.ui + ';font-weight:300;font-size:' + px(19) +
    ';color:' + C.slate + ';', 'BY IIT GANDHINAGAR'));

  /* --- company and address, flowing in one column ---
     One column, not four absolute boxes: a two-line company name then pushes
     the address down instead of printing on top of it. The white band behind
     the name is part of the plate and is sized for one line, so the name is
     stepped down until the whole column fits between the pill and the photo. */
  var COL = { l:34.7, t:241.5, w:350, h:118 };
  var colu = add(el('div','position:absolute;left:' + px(COL.l) + ';top:' + px(COL.t) +
    ';width:' + px(COL.w) + ';height:' + px(COL.h) + ';overflow:hidden;'));
  var greenLabel = function(t){
    return el('div','font-family:' + F.body + ';font-style:italic;font-size:' + px(14) +
      ';color:' + C.green + ';line-height:1.2;', t);
  };
  colu.appendChild(greenLabel('Company'));
  var nameEl = el('div','font-family:' + F.ui + ';font-weight:800;color:' + C.navy +
    ';line-height:1.02;margin:' + px(1) + ' 0 ' + px(6) + ';word-break:break-word;',
    S.company.name || 'Company Name');
  colu.appendChild(nameEl);
  colu.appendChild(greenLabel('Address'));
  var addr = el('div','font-family:' + F.disp + ';font-weight:400;font-size:' + px(16.3) +
    ';line-height:1.24;color:' + C.charcoal + ';margin-top:' + px(1) + ';');
  addr.appendChild(document.createTextNode(S.company.addr1 || 'Plot / street, industrial estate'));
  addr.appendChild(el('br'));
  addr.appendChild(document.createTextNode(
    [S.company.addr2, S.company.district, S.company.state, S.company.pincode]
      .filter(Boolean).join(', ') || 'City, District, State - PIN'));
  colu.appendChild(addr);
  var fits = [
    /* The badge is 207 pt of clear width; the designed 14.2 pt fits Poppins
       but not every fallback, so it steps down rather than wrapping onto
       the financial year underneath it. */
    function(){ fitLine(badgeTitle, 205, [14.2, 13.2, 12.4, 11.6, 10.8]); },
    /* A two-line company name pushes the address into the photograph, so the
       name steps down until the whole column fits between pill and photo. */
    function(){
      var sizes = [38.6, 34, 30, 26, 23, 20, 17, 15];
      for (var i = 0; i < sizes.length; i++){
        nameEl.style.fontSize = px(sizes[i]);
        if (colu.scrollHeight <= COL.h * PT + 1) break;
      }
    }
  ];

  /* --- the footer block (the seal is in the plate) --- */
  add(at(157.8, 713.5, 380, 'font-family:' + F.legible + ';font-weight:700;font-size:' + px(16.7) +
    ';color:' + C.navy + ';', IEA.unit));
  var foot = add(el('div', box(157.8, 734, 400, 80) + 'font-family:' + F.foot +
    ';font-size:' + px(11.7) + ';line-height:1.135;color:#000;'));
  foot.appendChild(el('div','font-weight:700;', IEA.institute));
  foot.appendChild(el('div','', IEA.addr2));
  foot.appendChild(el('div','', IEA.office));
  var last = el('div','');
  last.appendChild(document.createTextNode('Contact-' + IEA.phone.replace(/^\+91-/,'') + ' | '));
  var m2 = el('span','font-style:italic;color:' + C.navy + ';border-bottom:' + px(0.9) +
    ' solid ' + C.navy + ';', IEA.mail2);
  last.appendChild(m2);
  last.appendChild(document.createTextNode(' | ' + IEA.mail1));
  foot.appendChild(last);

  withLayout(p, fits);
  return p;
}

function renderPage(n, content, guides){
  var p = el('div','position:relative;width:' + px(PAGE.w) + ';height:' + px(PAGE.h) +
    ';background:#fff;color:' + C.charcoal + ';font-family:' + F.body + ';overflow:hidden;');
  var add = function(n2){ p.appendChild(n2); return n2; };

  var plate = el('img', box(0, 0, PAGE.w, PAGE.h) + 'object-fit:fill;');
  plate.src = PLATE2; plate.alt = '';
  add(plate);

  /* Running header, right-aligned to the rule beneath it. It starts clear of
     the KISEM logo, which ends at x 264.8 - anchoring it further left let a
     long client name run straight under the logo. A name too long even for
     that shrinks rather than truncating: an ellipsis in the middle of the
     client's own name on every page is not an acceptable way to save space. */
  /* The red arrow in the artwork spans y 77.2-87.6, so its point is centred on
     82.4 - and in the design the header text is centred on that same line,
     sitting just above the rule with the arrow as its full stop. Centring the
     text in a fixed box anchored there keeps that alignment true whatever
     size the text ends up at, which matters because it shrinks to fit. */
  var headBox = add(el('div', box(272, 76.4, 273.6, 12) +
    'display:flex;align-items:center;justify-content:flex-end;'));
  var head = headBox.appendChild(el('span','font-family:' + F.legible +
    ';font-size:' + px(10) + ';color:' + C.blue + ';line-height:1.15;white-space:nowrap;',
    TYPES[S.meta.reportType] + ' Report (' + (S.company.name || 'Company name') +
    ') for FY ' + S.meta.financialYear));

  /* Spine, between the two rules the plate already draws. */
  var spine = add(el('div', box(548, 341, 24, 219) +
    'display:flex;align-items:center;justify-content:center;'));
  /* Same bottom-to-top direction as the cover strip - see VERT there. */
  spine.appendChild(el('span','writing-mode:vertical-rl;transform:rotate(180deg);font-family:' +
    F.geo + ';font-size:' + px(11) + ';color:' + C.charcoal + ';white-space:nowrap;', IEA.spine));

  /* Page number, inside the stadium the plate draws. */
  add(at(536, 753.5, 60, 'font-family:' + F.cond2 + ';font-weight:700;font-size:' + px(5) +
    ';letter-spacing:.05em;color:#000;', 'PAGE NUMBER'));
  add(at(532.9, 757.5, 60, 'font-family:' + F.cond2 + ';font-weight:700;font-size:' + px(24.7) +
    ';line-height:1;color:' + C.red + ';', pageNo(n)));

  var live = add(el('div', box(LIVE.l, LIVE.t, LIVE.w, LIVE.h) + 'overflow:hidden;' +
    (guides ? 'outline:' + px(0.5) + ' dashed ' + C.blue + ';' : '')));
  /* Tagged so the pre-export check - and any test - can ask each page
     directly whether anything overflowed, instead of eyeballing PDFs. */
  live.dataset.live = '1';
  if (content) live.appendChild(content);

  /* The artwork sets this at 8 pt, which is legible on paper and too small on
     a screen at any sensible zoom. It starts at 10 and steps down only as far
     as the client's name actually demands. */
  withLayout(p, [function(){ fitLine(head, 271, [10, 9.5, 9, 8.5, 8, 7.5, 7]); }]);
  return p;
}

/* ===================================================================
   FLOW ENGINE. Blocks are measured at the live-column width and packed
   into pages. Long data tables split, repeating their header with a
   "(contd.)" marker. A block that cannot split and is taller than the
   live area is a build error, named in the pre-export check - never
   silently overflowed.
   =================================================================== */
var BUILD_ERRORS = [];

/* Blocks are stacked into a live probe of the exact live-column width and the
   probe's own height is read after each append. Measuring blocks in isolation
   and adding the numbers up does NOT work: getBoundingClientRect excludes
   margins, and adjacent margins collapse, so isolated measurement overfills
   every page and silently clips the bottom of it.

   The probe must also have the SAME box structure as the page it is standing
   in for: an overflow:hidden outer establishing a block formatting context,
   with a plain inner div holding the blocks. That inner div is literally the
   node that later becomes the page's content. Without the BFC the first
   child's top margin and the last child's bottom margin collapse straight
   out through the probe and are not counted, while on the real page - where
   the live column IS overflow:hidden - they are. That gap is small, one
   heading's margin, so it does not look like a bug; it just quietly clips a
   line or two off the foot of roughly a third of the pages. */
function paginate(blocks){
  var mHost = q('measure');
  clear(mHost);
  var probe = el('div','width:' + px(LIVE.w) + ';font-family:' + F.body + ';overflow:hidden;');
  var flow = el('div');
  probe.appendChild(flow);
  mHost.appendChild(probe);
  var LIVEH = LIVE.h * PT;
  BUILD_ERRORS = [];

  var pages = [];
  function closePage(){
    var page = el('div');
    while (flow.firstChild) page.appendChild(flow.firstChild);
    if (page.childNodes.length) pages.push(page);
  }
  function isHeading(n){ return n && n.dataset && n.dataset.keep === '1'; }

  /* Emits the head of a splittable block onto this page and pushes the
     remainder back into the queue with a "(contd.)" header. */
  function emitSplit(b, i, best){
    var o1 = copyOpts(b.opts); o1.caption = null;
    flow.appendChild(bTable(b.head, b.rows.slice(0, best), o1));
    closePage();
    var restRows = b.rows.slice(best);
    var o2 = copyOpts(b.opts);
    o2.title = b.opts.title ? b.opts.title + ' (contd.)' : null;
    var restNode = bTable(b.head, restRows, o2);
    if (!o2.title){
      restNode.insertBefore(el('div','font-size:' + px(8) + ';font-style:italic;color:' +
        C.ink3 + ';margin:0 0 ' + px(2), 'Table continued'), restNode.firstChild);
    }
    blocks.splice(i + 1, 0, { node:restNode, split:true, head:b.head, rows:restRows, opts:o2 });
  }

  for (var i = 0; i < blocks.length; i++){
    var b = blocks[i];
    /* An explicit "start a new page here" from a user-written section. */
    if (b.hardBreak){ closePage(); continue; }
    flow.appendChild(b.node);
    if (probe.scrollHeight <= LIVEH) continue;

    flow.removeChild(b.node);
    var availBefore = LIVEH - probe.scrollHeight;

    /* A long data table fills the rest of this page and continues overleaf.
       Only worth doing if a useful amount of page is left. */
    if (b.split && b.rows && b.rows.length > 1 && availBefore > 70 * PT){
      var best = fitRows(probe, flow, b, LIVEH);
      if (best > 0){ emitSplit(b, i, best); continue; }
    }

    /* Keep-with-next: a heading is worthless at the foot of a page, so if the
       block under it does not fit, the heading travels with it. */
    var carried = null;
    if (isHeading(flow.lastChild) && flow.childNodes.length > 1){
      carried = flow.lastChild;
      flow.removeChild(carried);
    }
    closePage();
    if (carried) flow.appendChild(carried);
    flow.appendChild(b.node);
    if (probe.scrollHeight <= LIVEH) continue;

    /* Still too tall with a whole page to itself. A splittable block gets a
       SECOND attempt here, on the full page - the first attempt was skipped
       or failed because of whatever was already sitting above it. Missing
       this retry is what let a 42-row jet table run 254 px off the bottom of
       the page and be clipped, silently, with no page break anywhere. */
    flow.removeChild(b.node);
    if (b.split && b.rows && b.rows.length > 1){
      var best2 = fitRows(probe, flow, b, LIVEH);
      if (best2 > 0){ emitSplit(b, i, best2); continue; }
    }
    flow.appendChild(b.node);

    if (probe.scrollHeight > LIVEH){
      if (flow.childNodes.length === 1){
        BUILD_ERRORS.push('One block is ' + Math.round(probe.scrollHeight / PT) +
          ' pt tall and cannot be split; the live area is ' + Math.round(LIVE.h) + ' pt.' +
          (b.opts && b.opts.title ? ' (' + b.opts.title + ')' : ''));
        closePage();
      } else {
        /* the carried heading did not help - put it back on the previous page */
        flow.removeChild(b.node);
        closePage();
        flow.appendChild(b.node);
      }
    }
  }
  closePage();
  clear(mHost);
  return pages;
}
function copyOpts(o){ var out = {}; for (var k in o) out[k] = o[k]; return out; }

/* Largest row count whose table still fits the space left in the probe. */
function fitRows(probe, flow, b, LIVEH){
  var lo = 1, hi = b.rows.length, best = 0, node = null;
  while (lo <= hi){
    var mid = Math.floor((lo + hi) / 2);
    var o = copyOpts(b.opts); o.caption = null;
    node = bTable(b.head, b.rows.slice(0, mid), o);
    flow.appendChild(node);
    var fits = probe.scrollHeight <= LIVEH;
    flow.removeChild(node);
    if (fits){ best = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return best;
}

/* ---- draw ---- */
function drawPreview(){
  var stack = q('stack');
  if (!stack) return;
  /* The stage is hidden while verifying bills; laying out 27 pages behind it
     on every keystroke is pure waste. */
  if (document.body.classList.contains('verify-mode')) return;
  var zoom = parseFloat(q('zoom').value);
  var guides = q('guides').checked;
  var W = PAGE.w * PT * zoom, H = PAGE.h * PT * zoom;

  var built = paginateWithToc();
  var pages = built.pages;

  clear(stack);
  function shell(node){
    var wrap = el('div','width:' + W + 'px;height:' + H + 'px;background:#fff;overflow:hidden;');
    wrap.className = 'pagewrap';
    var sc = el('div','transform:scale(' + zoom + ');');
    sc.className = 'scaler';
    sc.appendChild(node);
    wrap.appendChild(sc);
    stack.appendChild(wrap);
  }
  shell(renderCover());
  pages.forEach(function(content, i){ shell(renderPage(i+1, content, guides)); });

  /* A contents line is a real link on screen and plain text on paper. */
  stack.addEventListener('click', function(ev){
    var t = ev.target;
    while (t && t !== stack && !(t.dataset && t.dataset.gotopage)) t = t.parentNode;
    if (!t || t === stack) return;
    var wraps = stack.querySelectorAll('.pagewrap');
    var idx = parseInt(t.dataset.gotopage, 10) - 1;
    if (wraps[idx]) wraps[idx].scrollIntoView({ behavior:'smooth', block:'start' });
  });

  /* Belt and braces. The flow engine should make this impossible, but a
     clipped page is invisible and a wrong report is not, so every rendered
     page is measured and any overflow is reported rather than swallowed. */
  var spill = [];
  stack.querySelectorAll('[data-live]').forEach(function(lv, i){
    var over = lv.scrollHeight - lv.clientHeight;
    if (over > 1) spill.push('page ' + (i + 2) + ' by ' + Math.round(over / PT) + ' pt');
  });
  if (spill.length) BUILD_ERRORS.push('Content ran past the live area on ' + spill.join(', ') + '.');

  q('reportline').textContent = reportNumber(S.meta.financialYear, S.meta.serial) + ' · ' +
    (S.meta.revision||'') + ' · ' + (pages.length + 1) + ' pages' +
    (BUILD_ERRORS.length ? ' · ' + BUILD_ERRORS.length + ' layout warning' + (BUILD_ERRORS.length>1?'s':'') : '');
}

function renderAll(){
  renderNav();
  document.body.classList.toggle('verify-mode', S.active === 'verify');
  var w = q('work');
  clear(w);
  var sec = sectionById(S.active);
  /* A draft saved when the ledger was still a menu entry reopens on the
     cover rather than on a screen that no longer exists. */
  if (!sec){ sec = SECTIONS[0]; S.active = sec.id; }
  w.appendChild(el('h1','', sec.title)).className = 'wt';

  if (sec.opt && !S.enabled[sec.opt]){
    var c = card(sec.title + ' is off for this report',
      'Utility modules are opt-in — a report only carries the sections its plant actually has.');
    c.appendChild(fCheck(S.enabled, sec.opt, 'Include ' + sec.title.toLowerCase() + ' in this report'));
    w.appendChild(c);
    drawPreview();
    return;
  }
  if (sec.opt){
    var t = el('div','margin:0 0 14px;');
    t.appendChild(fCheck(S.enabled, sec.opt, 'Included in this report'));
    w.appendChild(t);
  }
  if (FORMS[sec.id]) FORMS[sec.id](w);
  else w.appendChild(el('p','', 'Nothing to edit here — this section is generated.')).className = 'wd';

  /* Every chapter that prints recommendations offers to add one right
     here, under the figures that prompted it, rather than on a separate
     ledger screen the assessor has to go and find. */
  if (RECO_CHAPTERS.indexOf(sec.id) >= 0) chapterRecoCard(w, sec.id);

  drawPreview();
}
