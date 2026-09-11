/* ===================================================================
   CUSTOM PAGES AND THE TABLE OF CONTENTS

   Two things a generated report cannot do without.

   Custom pages: no registry, however carefully derived, survives contact
   with a real plant. There is always one thing - a thermal image, a photo
   of a cracked insulation jacket, a paragraph the client asked for - that
   belongs in the report and has no field anywhere. So the user can write
   their own section, drop photos into it, and say where it goes.

   Contents: page numbers only exist AFTER pagination, and inserting a
   contents page changes the page numbers it lists. That circularity is
   why this is done as a fixed-point iteration rather than in one pass.
   =================================================================== */

/* ---- heading register -------------------------------------------- */
/* buildReport resets this, so heading ids are stable across rebuilds:
   the same report always produces the same ids in the same order, which
   is what lets page numbers found in one pass be applied in the next. */
/* First flow page prints as 001. */
var PAGE_BADGE_OFFSET = 1;
var TOC_SEQ = 0;
function tocReset(){ TOC_SEQ = 0; }
function tocTag(node, level, text){
  node.dataset.toc = level;
  node.dataset.tocid = 'h' + (++TOC_SEQ);
  node.dataset.toctext = text;
  return node;
}

/* ---- custom sections --------------------------------------------- */
var CUSTOM_ANCHORS = [
  ['start','Right at the front, before everything'],
  ['control','After the report control page'],
  ['front','After the preface and disclaimer'],
  ['certificate','After the certificate'],
  ['team','After the assessment team'],
  ['summary','After the executive summary'],
  ['production','After the production process'],
  ['baseline','After the energy baseline'],
  ['ghg','After GHG accounting'],
  ['bills','After the bill analysis'],
  ['dist','After electrical distribution'],
  ['tr','After power quality and transformer'],
  ['boiler','After the boiler'],
  ['tfh','After the thermic fluid heater'],
  ['compressor','After the air compressor'],
  ['coolingTower','After the cooling tower'],
  ['chiller','After the chiller'],
  ['pumps','After the pumping system'],
  ['jets','After the jet machines'],
  ['lux','After the lux measurement'],
  ['solar','After the solar plant'],
  ['machines','After machine monitoring'],
  ['utilities','After all the utility sections'],
  ['end','At the very end, after the instruments']
];
function anchorLabel(id){
  for (var i = 0; i < CUSTOM_ANCHORS.length; i++)
    if (CUSTOM_ANCHORS[i][0] === id) return CUSTOM_ANCHORS[i][1];
  return id;
}

var CUSTOM_BLOCK_TYPES = [
  ['h2','Heading'],
  ['h3','Sub-heading'],
  ['p','Paragraph'],
  ['ul','Bullet list'],
  ['note','Highlighted note'],
  ['photo','Photograph'],
  ['photo2','Two photographs side by side'],
  ['table','Table'],
  ['kpi','Figure strip'],
  ['formula','Calculation block'],
  ['break','Start a new page here']
];

function newCustomBlock(type){
  return { id:uid(), type:type || 'p', text:'', head:'', rows:'', tone:'info',
           img:null, img2:null, cap:'', cap2:'', maxH:230 };
}
function newCustomSection(){
  return { id:uid(), title:'New section', anchor:'end', h1:true, on:true, landscapeNote:'',
           blocks:[ newCustomBlock('p') ] };
}

/* Renders one user-written section into report blocks. Everything here
   goes through the same block builders the generated sections use, so a
   hand-written page paginates, splits and prints identically - it is not
   a special case pasted on top. */
function buildCustomSection(B, sec){
  if (sec.h1 !== false && sec.title) B.push(blk(tocTag(bH(1, sec.title), 1, sec.title)));
  (sec.blocks || []).forEach(function(b){
    switch (b.type){
      case 'h2':
        if (b.text) B.push(blk(tocTag(bH(2, b.text), 2, b.text)));
        break;
      case 'h3':
        if (b.text) B.push(blk(bH(3, b.text)));
        break;
      case 'p':
        (b.text || '').split(/\n{2,}/).filter(Boolean).forEach(function(t){
          B.push(blk(bP(t.replace(/\n/g, ' '))));
        });
        break;
      case 'ul':
        var items = (b.text || '').split(/\n+/).map(function(t){ return t.replace(/^[-*•]\s*/, '').trim(); })
                       .filter(Boolean);
        if (items.length) B.push(blk(bUL(items)));
        break;
      case 'note':
        if (b.text) B.push(blk(bNote(b.text, b.tone === 'info' ? null : b.tone)));
        break;
      case 'formula':
        var lines = (b.text || '').split(/\n/);
        if (lines.length) B.push(blk(bFormula(lines)));
        break;
      case 'photo':
        if (b.img) B.push(blk(bImg(b.img, b.cap || '', num(b.maxH) || 230)));
        break;
      case 'photo2':
        if (b.img || b.img2) B.push(blk(bImgPair(b.img, b.img2, b.cap, b.cap2)));
        break;
      case 'table':
        var head = (b.head || '').split('|').map(function(t){ return t.trim(); }).filter(Boolean);
        var rows = (b.rows || '').split(/\n+/).filter(function(l){ return l.trim(); })
          .map(function(l){ return l.split('|').map(function(t){ return t.trim(); }); });
        if (rows.length) B.push(tblBlock(head.length ? head : null, rows, { size:9 }));
        break;
      case 'kpi':
        var pairs = (b.text || '').split('|').map(function(t){
          var p = t.split('='); return [ (p[0]||'').trim(), (p[1]||'').trim() ];
        }).filter(function(p){ return p[0]; });
        if (pairs.length) B.push(blk(bKPI(pairs)));
        break;
      case 'break':
        B.push({ node:el('div'), split:false, hardBreak:true });
        break;
    }
  });
}

/* Two photographs on one line - the commonest thing an auditor wants and
   the fiddliest to do by hand. Widths are halves of the live column, so
   the pair can never push the page sideways. */
function bImgPair(a, b, capA, capB){
  var d = el('div','display:flex;gap:' + px(8) + ';margin:0 0 ' + px(8) + ';align-items:flex-start;');
  var cellW = (LIVE.w * PT - 8 * PT) / 2;
  /* Both cells reserve the height of the taller picture, so the pair keeps a
     fixed box whichever photograph decodes first - see imgBox. */
  var hh = 0;
  [a, b].forEach(function(x){ if (x) hh = Math.max(hh, imgBox(x, cellW, 190 * PT).h); });
  [[a, capA], [b, capB]].forEach(function(p){
    var cell = el('div','flex:1 1 0;min-width:0;');
    if (p[0]){
      var bx = imgBox(p[0], cellW, 190 * PT);
      var i = el('img','display:block;width:' + bx.w + 'px;height:' + bx.h +
        'px;margin:0 auto;object-fit:contain;');
      i.width = bx.w; i.height = bx.h;
      i.src = p[0].dataUrl; i.alt = p[1] || 'Figure';
      cell.appendChild(i);
    } else if (hh){
      cell.appendChild(el('div','height:' + hh + 'px;'));
    }
    if (p[1]) cell.appendChild(el('div','font-size:' + px(8.5) + ';font-style:italic;color:' + C.ink3 +
      ';text-align:center;margin-top:' + px(3), p[1]));
    d.appendChild(cell);
  });
  return d;
}

/* Splices every user section into the block stream at its anchor, then
   drops the anchor markers. Anchors carry no node, so anything left over
   is filtered before the flow engine ever sees it. */
function spliceCustom(B){
  var out = [];
  B.forEach(function(b){
    if (b.anchor){
      (S.custom || []).forEach(function(sec){
        if (sec.anchor === b.anchor && sec.on !== false) buildCustomSection(out, sec);
      });
      return;
    }
    out.push(b);
  });
  return out.filter(function(b){ return b.node; });
}

/* ---- table of contents ------------------------------------------- */
/* One block per line, so the flow engine pages a long contents list the
   same way it pages anything else and no special split logic is needed. */
function buildTocBlocks(entries){
  var out = [];
  out.push(blk(bH(1,'Contents')));
  out.push(blk(bP('Every heading in this report, with the page it starts on.', { size:9.5, italic:true })));
  entries.forEach(function(e){
    var lvl = Number(e.level);
    var row = el('div','display:flex;align-items:baseline;gap:' + px(4) +
      ';margin:0 0 ' + px(lvl === 1 ? 3 : 1.5) + ';padding-left:' + px(lvl === 1 ? 0 : 12) +
      ';font-size:' + px(lvl === 1 ? 10 : 9.3) + ';' +
      (lvl === 1 ? 'font-weight:600;color:' + C.navy + ';' : 'color:' + C.charcoal + ';'));
    row.appendChild(el('span','flex:0 1 auto;', e.text));
    row.appendChild(el('span','flex:1 1 auto;border-bottom:' + px(0.6) + ' dotted ' + C.rule +
      ';transform:translateY(' + px(-2) + ');min-width:' + px(10)));
    row.appendChild(el('span','flex:0 0 auto;font-family:' + F.mono + ';font-size:' + px(8.6) +
      ';color:' + C.ink3 + ';', e.page === null ? '—' : String(e.page)));
    /* Clickable in the on-screen preview; inert, and identical, in print. */
    if (e.page !== null){ row.dataset.gotopage = e.page; row.style.cursor = 'pointer'; }
    out.push(blk(row));
  });
  return out;
}

/* Reads the page each heading landed on, by walking the paginated pages.

   The cover is not part of the flow and carries no page badge, so the first
   flow page IS printed as 001 - the offset is zero, not one. Getting this
   wrong puts every number in the contents one page late, which is the kind
   of error nobody notices until a client turns to page 14 and finds 13. */
function tocMapFromPages(pages, offset){
  var map = {};
  pages.forEach(function(page, i){
    var hs = page.querySelectorAll('[data-tocid]');
    for (var k = 0; k < hs.length; k++){
      var id = hs[k].dataset.tocid;
      if (map[id] === undefined) map[id] = i + offset;
    }
  });
  return map;
}
function tocEntriesFrom(blocks, map){
  var out = [];
  blocks.forEach(function(b){
    if (!b.node || !b.node.dataset) return;
    var id = b.node.dataset.tocid;
    if (!id) return;
    out.push({ id:id, level:b.node.dataset.toc, text:b.node.dataset.toctext,
               page: map[id] === undefined ? null : map[id] });
  });
  return out;
}

/* The fixed point. Inserting the contents list pushes everything after it
   down, which changes the very numbers being listed. Two or three passes
   settle it; if it has not settled by then the numbers are off by one
   somewhere harmless, and looping forever would be worse. */
function paginateWithToc(){
  if (!S.meta.toc){
    var plain = spliceCustom(buildReport());
    return { pages: paginate(plain), entries: [] };
  }
  var entries = [], pages = null, blocks = null, lastCount = -1;
  for (var pass = 0; pass < 4; pass++){
    blocks = spliceCustom(buildReport());
    var at = -1;
    for (var i = 0; i < blocks.length; i++) if (blocks[i].tocAnchor){ at = i; break; }
    if (at < 0) return { pages: paginate(blocks), entries: [] };
    /* The contents belongs on its own page, so it is fenced by hard breaks
       rather than allowed to share a page with whatever precedes it. */
    var toc = [{ node:el('div'), split:false, hardBreak:true }]
      .concat(buildTocBlocks(entries))
      .concat([{ node:el('div'), split:false, hardBreak:true }]);
    blocks.splice.apply(blocks, [at, 1].concat(toc));
    pages = paginate(blocks);
    var map = tocMapFromPages(pages, PAGE_BADGE_OFFSET);
    entries = tocEntriesFrom(blocks, map).filter(function(e){
      /* The contents page does not list itself. */
      return e.text !== 'Contents';
    });
    if (pages.length === lastCount && pass > 0) break;
    lastCount = pages.length;
  }
  return { pages:pages, entries:entries };
}

/* ---- the editor --------------------------------------------------- */
FORMS.custom = function(w){
  var c = card('Your own pages',
    'Anything the generated sections cannot hold. Write it here, drop photographs in, and choose where in the report it belongs — it paginates, splits and prints exactly like a generated section, because it goes through the same builders.');
  c.appendChild(fCheck(S.meta, 'toc', 'Include a Contents page (headings and their page numbers)'));
  c.appendChild(btn('+ Add a section', function(){
    S.custom.push(newCustomSection()); save(); renderAll();
  }));
  w.appendChild(c);

  if (!S.custom.length){
    var e = card('Nothing added yet',
      'A section is a title, a place in the report, and any number of blocks: paragraphs, bullets, photographs (one or two across), tables, figure strips, calculation blocks and page breaks.');
    w.appendChild(e);
    return;
  }

  S.custom.forEach(function(sec, si){
    var cc = card(sec.title || 'Untitled section', anchorLabel(sec.anchor));
    cc.appendChild(gridOf([
      fText(sec, 'title', 'Section title'),
      fSelect(sec, 'anchor', 'Where it goes',
        CUSTOM_ANCHORS.map(function(a){ return { v:a[0], t:a[1] }; }))
    ], true));
    var opts = el('div','display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin:4px 0 12px;');
    opts.appendChild(fCheck(sec, 'h1', 'Print the title as a section heading'));
    opts.appendChild(fCheck(sec, 'on', 'Include in this report'));
    cc.appendChild(opts);

    sec.blocks.forEach(function(b, bi){
      cc.appendChild(customBlockEditor(sec, b, bi));
    });

    var bar = el('div','display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;');
    CUSTOM_BLOCK_TYPES.forEach(function(t){
      bar.appendChild(btn('+ ' + t[1], function(){
        sec.blocks.push(newCustomBlock(t[0])); save(); renderAll();
      }, 'sm'));
    });
    cc.appendChild(bar);

    var foot = el('div','display:flex;gap:6px;margin-top:12px;');
    if (si > 0) foot.appendChild(btn('Move section up', function(){
      S.custom.splice(si-1, 0, S.custom.splice(si,1)[0]); save(); renderAll(); }, 'sm'));
    foot.appendChild(btn('Delete section', function(){
      if (confirm('Delete "' + (sec.title||'this section') + '" and everything in it?')){
        S.custom.splice(si,1); save(); renderAll(); } }, 'sm'));
    cc.appendChild(foot);
    w.appendChild(cc);
  });
};

function customBlockEditor(sec, b, bi){
  var box = el('div','border:1px solid var(--rule);border-radius:6px;padding:10px 12px;margin:0 0 10px;');
  var head = el('div','display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;');
  var name = '';
  CUSTOM_BLOCK_TYPES.forEach(function(t){ if (t[0] === b.type) name = t[1]; });
  head.appendChild(el('span','font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600;', name));
  var tools = el('div','display:flex;gap:5px;');
  if (bi > 0) tools.appendChild(btn('↑', function(){
    sec.blocks.splice(bi-1, 0, sec.blocks.splice(bi,1)[0]); save(); renderAll(); }, 'sm'));
  if (bi < sec.blocks.length - 1) tools.appendChild(btn('↓', function(){
    sec.blocks.splice(bi+1, 0, sec.blocks.splice(bi,1)[0]); save(); renderAll(); }, 'sm'));
  tools.appendChild(btn('Remove', function(){ sec.blocks.splice(bi,1); save(); renderAll(); }, 'sm'));
  head.appendChild(tools);
  box.appendChild(head);

  switch (b.type){
    case 'h2': case 'h3':
      box.appendChild(fText(b, 'text', 'Heading text'));
      break;
    case 'p':
      box.appendChild(fArea(b, 'text', 'Text',
        'A blank line starts a new paragraph.'));
      break;
    case 'ul':
      box.appendChild(fArea(b, 'text', 'Bullets', 'One per line.'));
      break;
    case 'note':
      box.appendChild(fArea(b, 'text', 'Note text'));
      box.appendChild(fSelect(b, 'tone', 'Tone', [
        { v:'info', t:'Neutral (blue)' }, { v:'ok', t:'Good (green)' }, { v:'bad', t:'Problem (red)' }]));
      break;
    case 'formula':
      box.appendChild(fArea(b, 'text', 'Calculation',
        'Monospaced, one line each — line up the = signs and they stay lined up in print.'));
      break;
    case 'photo':
      box.appendChild(fImage(b, 'img', 'Photograph'));
      box.appendChild(gridOf([
        fText(b, 'cap', 'Caption'),
        fNum(b, 'maxH', 'Maximum height on the page, pt', '230')
      ], true));
      break;
    case 'photo2':
      box.appendChild(gridOf([ fImage(b, 'img', 'Left photograph'),
                               fImage(b, 'img2', 'Right photograph') ], true));
      box.appendChild(gridOf([ fText(b, 'cap', 'Left caption'),
                               fText(b, 'cap2', 'Right caption') ], true));
      break;
    case 'table':
      box.appendChild(fText(b, 'head', 'Column headings',
        'Separated by a vertical bar, like:  Parameter | Value | Unit'));
      box.appendChild(fArea(b, 'rows', 'Rows',
        'One row per line, cells separated by a vertical bar. A long table splits across pages and repeats its heading.'));
      break;
    case 'kpi':
      box.appendChild(fArea(b, 'text', 'Figures',
        'Label = value, separated by a vertical bar. For example:  Jets surveyed = 46 | Steam saving = 32.4 kg/hr'));
      break;
    case 'break':
      box.appendChild(el('p','font-size:12px;color:var(--ink-3);margin:0',
        'Everything after this starts on a fresh page.'));
      break;
  }
  return box;
}
