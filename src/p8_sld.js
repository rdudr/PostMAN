/* ===================================================================
   SINGLE LINE DIAGRAM BUILDER

   Every sample report has a "Plant Single Line Diagram" heading and in
   every one the diagram is an image made somewhere else - the most
   redrawn artefact in the report and the one most likely to disagree
   with the tables beside it. This builds it FROM the hierarchy instead,
   and annotates each node with the same measured figures the tables use,
   so the diagram becomes a finding rather than a decoration.
   =================================================================== */

var SLD_TYPES = {
  grid:        { label:'Grid supply',  w:120, h:38, fill:'#E8EEF9', stroke:'#004AAD' },
  dg:          { label:'DG set',       w:110, h:38, fill:'#F5EFE3', stroke:'#B4700A' },
  solar:       { label:'Solar',        w:110, h:38, fill:'#F1E9F5', stroke:'#7A2E8E' },
  transformer: { label:'Transformer',  w:130, h:44, fill:'#FFFFFF', stroke:'#004AAD' },
  bus:         { label:'LT bus',       w:220, h:22, fill:'#0F2F76', stroke:'#0F2F76' },
  pcc:         { label:'PCC panel',    w:130, h:40, fill:'#FFFFFF', stroke:'#2E3A44' },
  mcc:         { label:'MCC panel',    w:120, h:38, fill:'#FFFFFF', stroke:'#5A6875' },
  capacitor:   { label:'APFC / capacitor', w:120, h:36, fill:'#FFFFFF', stroke:'#0B8A45' },
  load:        { label:'Load / motor', w:110, h:34, fill:'#F7F9FB', stroke:'#8494A3' },
  meter:       { label:'Metering point', w:100, h:30, fill:'#FFF8E1', stroke:'#B47500' }
};

function sldAdd(type, name, parentId){
  var n = { id:'n'+(S.sld.nextId++), type:type, name:name || SLD_TYPES[type].label,
            parent:parentId || null, kw:null, kva:null, pf:null, vthd:null, ithd:null,
            rating:'', recId:'', provisional:false, x:null, y:null, dx:0, dy:0 };
  S.sld.nodes.push(n);
  return n;
}
function sldNode(id){
  for (var i=0;i<S.sld.nodes.length;i++) if (S.sld.nodes[i].id === id) return S.sld.nodes[i];
  return null;
}
/* Parent -> children map, with anything whose parent is missing (or is
   itself, or would close a loop) treated as a source. A loop cannot be
   drawn as a tree, and one wrong "Fed from" must not blank the diagram. */
function sldTree(){
  var byId = {}, children = {};
  S.sld.nodes.forEach(function(n){ byId[n.id] = n; children[n.id] = []; });
  var roots = [];
  S.sld.nodes.forEach(function(n){
    if (n.parent && byId[n.parent] && n.parent !== n.id) children[n.parent].push(n); else roots.push(n);
  });
  var seen = {};
  function mark(n){ if (seen[n.id]) return; seen[n.id] = 1; children[n.id].forEach(mark); }
  roots.forEach(mark);
  /* Nodes only reachable through a loop: cut the loop at the first one met. */
  S.sld.nodes.forEach(function(n){
    if (seen[n.id]) return;
    children[n.parent] = children[n.parent].filter(function(c){ return c.id !== n.id; });
    roots.push(n); mark(n);
  });
  return { roots:roots, children:children };
}
/* Tree layout, redone on every draw: each subtree is centred under its
   parent and siblings sit side by side, so adding a second transformer under
   the grid makes room for itself and every line follows. A dragged node
   keeps its nudge (dx, dy) relative to where the layout would put it, so a
   hand adjustment survives the next panel being added; Re-layout clears the
   nudges. */
function sldLayout(force){
  var GAP = 26, ROW = 36, LEFT = 30, TOP = 30;
  var tree = sldTree(), children = tree.children;
  var box = {}, depthOf = {}, rowH = {}, span = {};
  S.sld.nodes.forEach(function(n){ box[n.id] = sldBox(n); if (force){ n.dx = 0; n.dy = 0; } });
  function measure(n, d){
    depthOf[n.id] = d; rowH[d] = Math.max(rowH[d] || 0, box[n.id].h);
    var w = 0;
    children[n.id].forEach(function(c){ w += (w ? GAP : 0) + measure(c, d + 1); });
    span[n.id] = Math.max(box[n.id].w, w);
    return span[n.id];
  }
  var total = 0;
  tree.roots.forEach(function(r){ total += (total ? GAP * 2 : 0) + measure(r, 0); });
  var rowY = {}, y = TOP;
  Object.keys(rowH).map(Number).sort(function(a, b){ return a - b; }).forEach(function(d){ rowY[d] = y; y += rowH[d] + ROW; });
  var maxX = 0, maxY = 0;
  function place(n, left){
    var b = box[n.id], s = span[n.id];
    n.x = Math.max(4, Math.round(left + (s - b.w) / 2 + (n.dx || 0)));
    n.y = Math.max(4, Math.round(rowY[depthOf[n.id]] + (n.dy || 0)));
    maxX = Math.max(maxX, n.x + b.w); maxY = Math.max(maxY, n.y + b.h);
    var kidsW = 0;
    children[n.id].forEach(function(c){ kidsW += (kidsW ? GAP : 0) + span[c.id]; });
    var cx = left + (s - kidsW) / 2;
    children[n.id].forEach(function(c){ place(c, cx); cx += span[c.id] + GAP; });
  }
  var x = LEFT;
  tree.roots.forEach(function(r){ place(r, x); x += span[r.id] + GAP * 2; });
  return { width: Math.max(760, maxX + LEFT), height: Math.max(120, maxY + TOP) };
}
function sldBuildFromHierarchy(){
  S.sld.nodes = []; S.sld.nextId = 1;
  var grid = sldAdd('grid', 'Grid supply', null);
  var tr = sldAdd('transformer', (S.tr.capacity ? S.tr.capacity + ' kVA ' : '') + 'Transformer', grid.id);
  tr.rating = S.tr.capacity ? S.tr.capacity + ' kVA' : '';
  tr.vthd = num(S.tr.vthd); tr.ithd = num(S.tr.ithd);
  var bus = sldAdd('bus', 'LT bus', tr.id);
  var pccByName = {};
  S.dist.pcc.forEach(function(p){
    var n = sldAdd('pcc', p.name || 'PCC', bus.id);
    n.kw = num(p.kw); n.kva = num(p.kva); n.pf = num(p.pf);
    n.vthd = num(p.vthd); n.ithd = num(p.ithd);
    pccByName[(p.name||'').toLowerCase()] = n.id;
  });
  if (S.dist.apfc.length) sldAdd('capacitor', 'APFC panel', bus.id);
  sldLayout(true);
  save();
}

/* The drawn size of a node: the type's minimum, widened to fit whatever is
   written on it. Measured from the text, so a box never overflows. */
function sldBox(n){
  var t = SLD_TYPES[n.type] || SLD_TYPES.load;
  var l1 = [], l2 = [];
  if (n.type !== 'bus'){
    if (n.rating) l1.push(n.rating);
    if (num(n.kw) !== null) l1.push(fix(n.kw,1) + ' kW');
    if (num(n.kva) !== null) l1.push(fix(n.kva,1) + ' kVA');
    if (num(n.pf) !== null) l2.push('PF ' + fix(n.pf,2));
    if (num(n.vthd) !== null) l2.push('VTHD ' + fix(n.vthd,1) + '%');
    if (num(n.ithd) !== null) l2.push('ITHD ' + fix(n.ithd,1) + '%');
    if (n.recId) l2.push(n.recId);
  }
  var lines = [l1.join(' · '), l2.join(' · ')].filter(Boolean);
  var longest = Math.max(n.name.length * 6.4 + 16, (lines[0] || '').length * 4.7 + 14, (lines[1] || '').length * 4.7 + 14);
  var w = Math.max(t.w, Math.ceil(longest));
  var h = n.type === 'bus' ? t.h : Math.max(t.h, 22 + lines.length * 11 + 4);
  return { w:w, h:h, fill:t.fill, stroke:t.stroke, lines:lines };
}
/* The connector: down from the parent's foot, across, down into the child. */
function sldEdgeD(p, n){
  var pt = sldBox(p), nt = sldBox(n);
  var x1 = p.x + pt.w/2, y1 = p.y + pt.h, x2 = n.x + nt.w/2, y2 = n.y;
  var mid = (y1 + y2) / 2;
  return 'M' + x1 + ' ' + y1 + ' L' + x1 + ' ' + mid + ' L' + x2 + ' ' + mid + ' L' + x2 + ' ' + y2;
}
/* Redraws only the on-screen drawing, so typing in a node card shows the
   box grow and the line move without rebuilding the whole form (which
   would take the cursor out of the field). */
function sldRefreshCanvas(){
  var host = q('sldcanvas'); if (!host) return;
  clear(host);
  var built = sldSvg(false, true);
  host.appendChild(built.svg);
  enableSldDrag(built.svg);
}
function sldSvg(forReport, guides){
  var dim = sldLayout(false);
  var svgNS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + dim.width + ' ' + dim.height);
  if (forReport){
    svg.setAttribute('width', px(LIVE.w));
    svg.setAttribute('height', (LIVE.w / dim.width) * dim.height * PT + 'px');
  } else {
    /* On screen the drawing scales to the panel it sits in - it used to be
       drawn at its natural width and ran out of the box on anything but a
       wide monitor. */
    svg.setAttribute('width', '100%');
    svg.style.maxWidth = dim.width + 'px';
    svg.style.height = 'auto';
  }
  svg.style.display = 'block';

  function mk(tag, attrs){
    var e = document.createElementNS(svgNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  /* edges first so boxes sit on top; each one is tagged with the child it
     feeds so a drag can move it without redrawing the whole picture */
  var tree = sldTree();
  S.sld.nodes.forEach(function(p){
    tree.children[p.id].forEach(function(n){
      var e = mk('path', { d:sldEdgeD(p, n), fill:'none', stroke:'#5A6875', 'stroke-width':1.4,
        'stroke-dasharray': n.provisional ? '5 4' : '' });
      e.dataset.edge = n.id; e.dataset.from = p.id;
      svg.appendChild(e);
    });
  });
  S.sld.nodes.forEach(function(n){
    var t = sldBox(n);
    var picked = S.sld.selected === n.id && !forReport;
    var g = mk('g', { transform:'translate(' + n.x + ',' + n.y + ')' });
    g.setAttribute('class', 'sldnode' + (picked ? ' sel' : ''));
    g.dataset.id = n.id;
    var over = (num(n.vthd) !== null && num(n.vthd) > 5) || (num(n.ithd) !== null && num(n.ithd) > 8);
    g.appendChild(mk('rect', { width:t.w, height:t.h, rx: n.type==='bus'?3:5,
      fill:t.fill, stroke: over ? C.bad : (picked ? '#5b9bff' : t.stroke),
      'stroke-width': (over || picked) ? 2 : 1.3,
      'stroke-dasharray': n.provisional ? '5 3' : '' }));
    var label = mk('text', { x:t.w/2, y:15, 'text-anchor':'middle',
      'font-family':'Archivo, Arial, sans-serif', 'font-size':10.5, 'font-weight':600,
      fill: n.type==='bus' ? '#fff' : C.charcoal });
    label.textContent = n.name.length > 30 ? n.name.slice(0,29) + '…' : n.name;
    g.appendChild(label);
    /* Two short annotation lines rather than one long one, so a node that
       carries rating, kW, kVA, PF and both THDs still fits its box. */
    t.lines.forEach(function(line, li){
      var sub = mk('text', { x:t.w/2, y:27 + li*11, 'text-anchor':'middle',
        'font-family':'IBM Plex Mono, monospace', 'font-size':7.6,
        fill: (over && li === 1) ? C.bad : C.ink3 });
      sub.textContent = line;
      g.appendChild(sub);
    });
    svg.appendChild(g);
  });
  return { svg:svg, dim:dim };
}

/* Removing a node hands its children to its parent, so a PCC deleted by
   mistake does not orphan every MCC and motor under it. */
function sldDelete(id){
  var n = sldNode(id); if (!n) return;
  S.sld.nodes.forEach(function(c){ if (c.parent === id) c.parent = n.parent; });
  S.sld.nodes = S.sld.nodes.filter(function(c){ return c.id !== id; });
  if (S.sld.selected === id) S.sld.selected = null;
  sldLayout(false); save(); renderAll();
}
function sldChildType(t){
  return (t === 'grid' || t === 'dg' || t === 'solar') ? 'transformer' : t === 'transformer' ? 'bus'
       : t === 'bus' ? 'pcc' : t === 'pcc' ? 'mcc' : 'load';
}
function sldNodeCard(n){
  var t = SLD_TYPES[n.type] || SLD_TYPES.load;
  var box = el('div','border:1px solid var(--line);border-left:3px solid ' + t.stroke +
    ';border-radius:0 8px 8px 0;padding:10px 12px;margin-bottom:8px;background:var(--panel);');
  if (S.sld.selected === n.id) box.style.boxShadow = '0 0 0 2px var(--brand)';
  box.id = 'sldn-' + n.id;
  var head = el('div','display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px;');
  head.appendChild(el('strong','font-size:13px;', n.name || '(unnamed)'));
  head.appendChild(el('span','font-size:11px;color:var(--ink-3);font-family:"IBM Plex Mono",monospace;', t.label));
  var acts = el('div','margin-left:auto;display:flex;gap:6px;');
  acts.appendChild(btn('+ Add child', function(){
    var ct = sldChildType(n.type);
    var c = sldAdd(ct, SLD_TYPES[ct].label, n.id); S.sld.selected = c.id; sldLayout(false); save(); renderAll();
  }));
  acts.appendChild(btn('Delete', function(){
    if (confirm('Delete "' + n.name + '"? Anything fed from it moves up to its parent.')) sldDelete(n.id);
  }));
  head.appendChild(acts);
  box.appendChild(head);
  /* A node cannot be fed from anything downstream of itself. */
  var tree = sldTree(), below = {};
  (function mark(id){ tree.children[id].forEach(function(c){ below[c.id] = 1; mark(c.id); }); })(n.id);
  var others = S.sld.nodes.filter(function(o){ return o.id !== n.id && !below[o.id]; });
  /* Text and figures redraw the drawing as they are typed; the feed and the
     type change the tree itself, so those rebuild the node list too. */
  var live = function(f){
    var i = f.querySelector('input,select');
    if (i) i.addEventListener(i.tagName === 'SELECT' || i.type === 'checkbox' ? 'change' : 'input', sldRefreshCanvas);
    return f;
  };
  var structural = function(key, label, options){
    var s = el('select');
    options.forEach(function(o){ var op = el('option','', o.t); op.value = o.v; s.appendChild(op); });
    s.value = n[key] == null ? '' : n[key];
    return labelled(label, bindInput(s, n, key, { event:'change', structural:true }));
  };
  box.appendChild(gridOf([
    live(fText(n,'name','Name')),
    structural('type','Type', Object.keys(SLD_TYPES).map(function(k){ return { v:k, t:SLD_TYPES[k].label }; })),
    structural('parent','Fed from', [{ v:'', t:'— nothing (a source) —' }].concat(others.map(function(o){
      return { v:o.id, t:o.name + ' (' + (SLD_TYPES[o.type]||SLD_TYPES.load).label + ')' }; }))),
    live(fText(n,'rating','Rating','1600 kVA / 250 kW')),
    live(fNum(n,'kw','kW')), live(fNum(n,'kva','kVA')), live(fNum(n,'pf','PF')),
    live(fNum(n,'vthd','% VTHD')), live(fNum(n,'ithd','% ITHD')),
    live(fText(n,'recId','PQ recording ID')),
    fCheck(n,'provisional','Provisional (walkthrough guess, drawn dashed)')
  ]));
  return box;
}

FORMS.sld = function(w){
  var c = card('Single line diagram',
    'Built from the hierarchy rather than drawn. Start from the grid, add a transformer, a bus, then the panels and loads fed from each - every node says what feeds it. The drawing lays itself out: each node sits centred under what feeds it, and adding or removing one makes room and moves the lines. Click a node to select it; drag to nudge it (the nudge is kept when the drawing re-flows; Re-layout clears it); the Delete key removes it. A node breaching IEEE-519 turns red.');
  var bar = el('div','display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;');
  bar.appendChild(btn('Build from panels + transformer', function(){
    if (S.sld.nodes.length && !confirm('Rebuild the diagram from the panel tables? Manual nodes will be lost.')) return;
    sldBuildFromHierarchy(); renderAll();
  }, 'primary'));
  bar.appendChild(btn('Re-layout', function(){ sldLayout(true); save(); renderAll(); }));
  var sel = S.sld.selected ? sldNode(S.sld.selected) : null;
  Object.keys(SLD_TYPES).forEach(function(t){
    bar.appendChild(btn('+ ' + SLD_TYPES[t].label, function(){
      var parent = sel ? sel.id : (S.sld.nodes.length ? S.sld.nodes[S.sld.nodes.length-1].id : null);
      var n = sldAdd(t, SLD_TYPES[t].label, parent); S.sld.selected = n.id; sldLayout(false); save(); renderAll();
    }));
  });
  c.appendChild(bar);
  c.appendChild(el('p','', sel ? 'Selected: ' + sel.name + ' — new nodes are fed from it. Press Delete on the drawing to remove it.'
                               : 'Nothing selected — new nodes are fed from the last node added.')).className = 'callout info';

  var host = el('div','overflow:auto;border:1px solid var(--line);border-radius:8px;padding:6px;background:#fff;');
  host.id = 'sldcanvas';
  var built = sldSvg(false, true);
  host.appendChild(built.svg);
  c.appendChild(host);
  enableSldDrag(built.svg);
  w.appendChild(c);

  var c2 = card('Nodes', 'One card per node, parents before children. "Fed from" is chosen by name. Deleting a node hands whatever it fed to its own parent, so nothing is orphaned.');
  if (!S.sld.nodes.length) c2.appendChild(el('p','', 'No nodes yet. Use "Build from panels + transformer", or add a Grid supply above.')).className = 'callout';
  var order = [], seen = {};
  var visit = function(n){ if (seen[n.id]) return; seen[n.id] = 1; order.push(n);
    S.sld.nodes.filter(function(k){ return k.parent === n.id; }).forEach(visit); };
  S.sld.nodes.filter(function(n){ return !n.parent; }).forEach(visit);
  S.sld.nodes.forEach(visit);
  order.forEach(function(n){ c2.appendChild(sldNodeCard(n)); });
  w.appendChild(c2);

  var c3 = card('Or use a drawn diagram', 'If you already have an SLD from elsewhere, drop it here and it prints instead of the generated one.');
  c3.appendChild(fImage(S.assets,'sldImage','Single line diagram image'));
  w.appendChild(c3);
};

function enableSldDrag(svg){
  var drag = null;
  svg.addEventListener('pointerdown', function(e){
    var g = e.target.closest ? e.target.closest('.sldnode') : null;
    if (!g) return;
    var n = sldNode(g.dataset.id); if (!n) return;
    var box = svg.getBoundingClientRect();
    var vb = svg.viewBox.baseVal;
    var sx = vb.width / box.width, sy = vb.height / box.height;
    drag = { n:n, ox:(e.clientX - box.left) * sx - n.x, oy:(e.clientY - box.top) * sy - n.y, sx:sx, sy:sy, box:box, g:g, moved:false,
             /* where the layout put it, so the drag becomes a nudge from there */
             baseX:n.x - (n.dx || 0), baseY:n.y - (n.dy || 0) };
    g.classList.add('sel');
    svg.focus();
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  svg.addEventListener('pointermove', function(e){
    if (!drag) return;
    var x = (e.clientX - drag.box.left) * drag.sx - drag.ox;
    var y = (e.clientY - drag.box.top) * drag.sy - drag.oy;
    if (Math.abs(x - drag.n.x) > 2 || Math.abs(y - drag.n.y) > 2) drag.moved = true;
    var n = drag.n;
    n.x = Math.max(4, Math.round(x)); n.y = Math.max(4, Math.round(y));
    n.dx = n.x - drag.baseX; n.dy = n.y - drag.baseY;
    drag.g.setAttribute('transform','translate(' + n.x + ',' + n.y + ')');
    /* The lines into and out of the box follow it as it moves. */
    svg.querySelectorAll('path[data-edge]').forEach(function(p){
      if (p.dataset.edge !== n.id && p.dataset.from !== n.id) return;
      var from = sldNode(p.dataset.from), to = sldNode(p.dataset.edge);
      if (from && to) p.setAttribute('d', sldEdgeD(from, to));
    });
  });
  svg.addEventListener('pointerup', function(){
    if (!drag) return;
    var moved = drag.moved, id = drag.n.id;
    drag = null; save();
    /* A click without a drag selects the node and brings its card into view. */
    S.sld.selected = id;
    if (!moved){
      renderAll();
      var card = document.getElementById('sldn-' + id);
      if (card) card.scrollIntoView({ block:'nearest', behavior:'smooth' });
    } else { sldRefreshCanvas(); drawPreview(); }
  });
  svg.tabIndex = 0;
  svg.style.outline = 'none';
  svg.addEventListener('keydown', function(e){
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.sld.selected){
      var n = sldNode(S.sld.selected);
      if (n && confirm('Delete "' + n.name + '"?')){ e.preventDefault(); sldDelete(n.id); }
    }
  });
}

/* ===================================================================
   IMPORTS - JET-Eff and A-CMP workbooks.
   Both apps already export by natural key and merge newest-wins, so
   re-importing is always safe.
   =================================================================== */
function readWorkbook(file){
  return new Promise(function(res, rej){
    var r = new FileReader();
    r.onload = function(){
      try { res(XLSX.read(new Uint8Array(r.result), { type:'array' })); }
      catch (e){ rej(new Error('That file is not a readable workbook.')); }
    };
    r.onerror = function(){ rej(new Error('Could not read that file.')); };
    r.readAsArrayBuffer(file);
  });
}
function sheetRows(wb, name){
  var sh = wb.Sheets[name];
  return sh ? XLSX.utils.sheet_to_json(sh, { defval:'' }) : [];
}
function pick(row, names){
  for (var i=0;i<names.length;i++) if (row[names[i]] !== undefined && row[names[i]] !== '') return row[names[i]];
  return null;
}

function importJetEff(wb, skip){
  var log = [];
  skip = skip || {};
  var pcc = sheetRows(wb, 'PCC Panels'), mcc = sheetRows(wb, 'MCC Panels');
  if (pcc.length || mcc.length){
    S.dist.pcc = pcc.concat(mcc).map(function(r){
      return { name: pick(r,['PCC Name','MCC Name','Name']) || '',
        v: num(pick(r,['V1'])), i: num(pick(r,['I1'])),
        kw: num(pick(r,['Total Power (kW)'])), kvar: num(pick(r,['KVAr (Q)','KVAr (D)'])),
        kva: null, pf: num(pick(r,['Power Factor'])),
        vthd: num(pick(r,['Uthd1'])), ithd: num(pick(r,['Ithd1'])) };
    });
    log.push(S.dist.pcc.length + ' panels');
  }
  var clamp = sheetRows(wb, 'Motor Loads Clamp'), pq = sheetRows(wb, 'Motor Loads PQ');
  if (clamp.length || pq.length){
    S.dist.motors = clamp.concat(pq).map(function(r, i){
      return { sr:i+1, name: pick(r,['Machine Tag']) || '',
        rated: num(pick(r,['Rated kW'])), starter: pick(r,['Starter Type']) || 'DOL',
        freq: num(pick(r,['VFD Frequency'])), v: num(pick(r,['Voltage (V)','Voltage (Avg)'])),
        i: num(pick(r,['Current (A)','Current (Avg)'])),
        kw: num(pick(r,['Measured kW'])), kvar: num(pick(r,['KVAr'])),
        kva: num(pick(r,['KVA'])), pf: num(pick(r,['Power Factor'])) };
    });
    log.push(S.dist.motors.length + ' motors');
  }
  var apfc = skip['APFC'] ? [] : sheetRows(wb, 'APFC');
  if (apfc.length){
    S.dist.apfc = apfc.map(function(r){
      return { stage: pick(r,['Stage']) || '', rated: num(pick(r,['Rated Capacitor Value'])),
        v: num(pick(r,['Voltage'])), ir: num(pick(r,['I-R'])), iy: num(pick(r,['I-Y'])),
        ib: num(pick(r,['I-B'])), remark: pick(r,['Remark']) || '' };
    });
    log.push(S.dist.apfc.length + ' APFC stages');
  }
  var prof = wb.Sheets['Company Profile'];
  var pmap = {};
  if (prof){
    var prows = XLSX.utils.sheet_to_json(prof, { header:1 });
    prows.forEach(function(r){ if (r && r[0] !== undefined && r[0] !== '') pmap[String(r[0]).trim()] = r[1]; });
    var name = pmap['Company Name'] || pmap['companyName'];
    if (name && S.company.name && String(name).trim() !== S.company.name.trim())
      log.push('note: workbook says "' + name + '", report says "' + S.company.name + '" — not overwritten');
    else if (name && !S.company.name){ S.company.name = String(name); log.push('company name'); }
    /* Cost parameters are what turn kg/hr into rupees. Importing the jets
       without them is how the section used to come out empty. */
    var cf = ['insulationCost','pumpInvestmentCost','trapReplacementCost',
              'fuelCost','unitRate','evaporationRatio'], got = 0;
    cf.forEach(function(f){
      var v = num(pmap[f]);
      if (v !== null){ S.jetCost[f] = v; got++; }
    });
    if (got) log.push(got + ' jet cost parameters');
    /* The report's own rate fields follow, so the summary and the jet
       section cannot quote two different unit rates. */
    if (num(pmap.unitRate) !== null && S.costs.unitRate === null) S.costs.unitRate = num(pmap.unitRate);
    if (num(pmap.evaporationRatio) !== null && S.costs.evapRatio === null) S.costs.evapRatio = num(pmap.evaporationRatio);
    if (num(pmap.fuelCost) !== null && S.costs.fuelCost === null) S.costs.fuelCost = num(pmap.fuelCost);
  }

  var jets = sheetRows(wb, 'Jet Data');
  if (jets.length){
    var existingByNo = {};
    (S.jets || []).forEach(function(existingJ){
      if (existingJ && existingJ.jetNo) existingByNo[String(existingJ.jetNo).trim()] = existingJ;
    });

    var incomingJets = jets.map(parseJetRow).filter(function(j){ return j; })
                 .map(function(j){
                   var prev = existingByNo[String(j.jetNo).trim()];
                   if (prev && prev.images && Object.keys(prev.images).length){
                     j.images = Object.assign({}, prev.images, j.images || {});
                   }
                   return recalcJet(j, S.jetCost);
                 });
    /* Merge by Jet No: a jet in the file replaces its earlier copy, jets
       not in the file stay, so two partial exports build one list. */
    var inFile = {};
    incomingJets.forEach(function(j){ inFile[String(j.jetNo).trim()] = 1; });
    S.jets = (S.jets || []).filter(function(j){ return j && !inFile[String(j.jetNo).trim()]; }).concat(incomingJets);
    S.enabled.jets = true;
    log.push(S.jets.length + ' jets (all ' + JET_FIELDS.length + ' columns)');
    var passing = S.jets.filter(function(j){ return j.trapStatus === 'Trap Passing'; }).length;
    var weak = S.jets.filter(function(j){ return j.pumpEfficiency !== null && j.pumpEfficiency < 40; }).length;
    if (passing) log.push(passing + ' passing trap(s)');
    if (weak) log.push(weak + ' pump(s) below 40 %');
    var made = syncJetLedger();
    if (made) log.push(made + ' recommendation(s) written to the ledger');
  }
  return log;
}

/* The ledger is the single source of every figure the report quotes twice.
   Importing jets therefore has to write the jet recommendations INTO it,
   not leave them stranded in the module - otherwise the executive summary
   and the savings table silently omit the largest saving in the report.
   Rows the user has already edited by hand are left alone; the three
   generated rows are rewritten on every import so the money always matches
   the measurements it came from. */
function syncJetLedger(){
  var R = jetsRollUp();
  if (!R.n) return 0;
  var days = num(S.jetCost.days) || 350;
  var evap = num(S.jetCost.evaporationRatio) || 1;
  var insTonnes = 0, trapTonnes = 0, pumpKwh = 0, insInv = 0, pumpInv = 0, trapInv = 0;
  S.jets.forEach(function(j){
    insTonnes  += num(j.insAnnualFuelSaving) || 0;
    if (num(j.trapInvestment)) trapTonnes += num(j.trapAnnualFuelSaving) || 0;
    if (num(j.pumpInvestment)) pumpKwh    += num(j.pumpAnnualPowerSaving) || 0;
    insInv  += num(j.insInvestment) || 0;
    pumpInv += num(j.pumpInvestment) || 0;
    trapInv += num(j.trapInvestment) || 0;
  });
  var unins = S.jets.filter(function(j){ return j.insulation !== 'Insulated'; })
                    .map(function(j){ return j.jetNo; });
  /* Emission factors carry units, and getting them wrong is invisible: it
     produces a number that is merely large, not obviously absurd, in the one
     figure a client is most likely to quote. `fuelEF` is kgCO2e per ONE UNIT
     of the report's thermal fuel (2380 for a tonne of coal) and the rest of
     the app divides by 1000 to reach tCO2e, so jet savings - which are in
     tonnes - must be converted into that same unit first. Skipping this gave
     469,848 tCO2e for a plant saving Rs 33.7 Lac. */
  var gef = num(S.costs.gridEF) || 0.716;
  var unit = String(S.baseline.thermalUnit || 'tonne').toLowerCase();
  var perTonne = /^(kg|kilogram)/.test(unit) ? 1000 : (/^(t|tonne|ton|mt)/.test(unit) ? 1 : null);
  var efT = (num(S.costs.fuelEF) !== null && perTonne !== null)
    ? num(S.costs.fuelEF) * perTonne / 1000 : null;   /* tCO2e per tonne of fuel */

  var specs = [];
  if (R.ins > 0) specs.push({
    key:'jet-insulation', type:'thermal', priority:'high',
    observation: (unins.length ? unins.length + ' of ' + R.n + ' jet machines (' +
        unins.slice(0,8).join(', ') + (unins.length > 8 ? ' and others' : '') +
        ') are uninsulated or only half insulated. ' : '') +
      'Measured surface temperatures give a combined recoverable steam loss of ' + fix(R.steam,1) + ' kg/hr.',
    recommendation:'Provide standard LRB insulation on the bare and half-insulated jet bodies at ₹ ' +
      inr(num(S.jetCost.insulationCost)) + ' per Sq. Mtr.',
    unit:'tonne/yr', saving:Math.round(insTonnes), monetary:Math.round(R.ins), investment:Math.round(insInv),
    co2: efT ? Math.round(insTonnes * efT * 10) / 10 : 0
  });
  if (R.pump > 0) specs.push({
    key:'jet-pump', type:'electrical', priority:'high',
    observation: R.weak.length + ' circulation pump(s) — ' + R.weak.slice(0,8).join(', ') +
      (R.weak.length > 8 ? ' and others' : '') + ' — measured below 40 % efficiency against an average of ' +
      pct(R.avgEff) + ' across the ' + R.n + ' machines surveyed.',
    recommendation:'Replace the below-benchmark jet circulation pumps with correctly sized units achieving at least 40 % efficiency at duty point.',
    unit:'kWh/yr', saving:Math.round(pumpKwh), monetary:Math.round(R.pump), investment:Math.round(pumpInv),
    co2: Math.round(pumpKwh * gef / 1000 * 10) / 10
  });
  if (R.trap > 0) specs.push({
    key:'jet-trap', type:'thermal', priority:'high',
    observation: R.passing.length + ' steam trap(s) — ' + R.passing.slice(0,8).join(', ') +
      (R.passing.length > 8 ? ' and others' : '') + ' — were found passing live steam to drain.',
    recommendation:'Replace the passing steam traps at ₹ ' + inr(num(S.jetCost.trapReplacementCost)) +
      ' each and put a quarterly trap survey in place.',
    unit:'tonne/yr', saving:Math.round(trapTonnes), monetary:Math.round(R.trap), investment:Math.round(trapInv),
    co2: efT ? Math.round(trapTonnes * efT * 10) / 10 : 0
  });

  var n = 0;
  specs.forEach(function(sp){
    var row = null;
    for (var i = 0; i < S.ledger.length; i++)
      if (S.ledger[i].autoKey === sp.key){ row = S.ledger[i]; break; }
    if (row && row.locked) return;
    if (!row){ row = { id:uid(), autoKey:sp.key, module:'jets', status:'draft', actionBy:'Plant' };
               S.ledger.push(row); }
    row.module = 'jets'; row.type = sp.type; row.priority = sp.priority;
    row.observation = sp.observation; row.recommendation = sp.recommendation;
    row.unit = sp.unit; row.saving = sp.saving; row.monetary = sp.monetary;
    row.investment = sp.investment; row.co2 = sp.co2;
    row.consumption = row.consumption || null;
    n++;
  });
  /* Streams that no longer earn anything drop out rather than linger. */
  var live = {}; specs.forEach(function(sp){ live[sp.key] = 1; });
  S.ledger = S.ledger.filter(function(r){
    return !r.autoKey || !/^jet-/.test(r.autoKey) || live[r.autoKey] || r.locked;
  });
  /* Hand-written rows are never touched - but a hand-written jet row sitting
     beside three generated ones is exactly how a report ends up claiming the
     same saving twice, so it is said out loud rather than left to be found. */
  var manual = S.ledger.filter(function(r){ return r.module === 'jets' && !r.autoKey; }).length;
  if (manual && n) alert(manual + ' hand-written jet recommendation(s) were already in the ledger.\n\n' +
    'They have been left exactly as they are, but they now sit alongside ' + n +
    ' recommendation(s) generated from the imported measurements. Check the ledger for double ' +
    'counting before you export.');
  return n;
}


/* The compressor equivalent of syncJetLedger: the two things a compressor
   survey actually finds, priced, so they reach the executive summary and the
   savings table rather than sitting in the module where nobody adds them up.

   Only the EXCESS over design SEC is counted as recoverable, not the whole
   consumption. A compressor 17 % above design does not stop using power when
   it is fixed; it uses what the design says it should.  */
function syncCompressorLedger(){
  var rate = num(S.costs.unitRate);
  var gef = num(S.costs.gridEF) || 0.716;

  var sec = S.compressor.map(function(k){ return { k:k, d:compressorCalc(k) }; })
    .filter(function(x){ return x.d.deviation !== null && x.d.deviation > 10 && x.d.annualKwh; });
  var idle = S.compressor.map(function(k){ return { k:k, d:compressorCalc(k) }; })
    .filter(function(x){ return x.d.loadPct !== null && x.d.loadPct < 60 && x.d.idleKwh; });

  var specs = [];
  if (sec.length){
    var kwh = 0, tags = [];
    sec.forEach(function(x){
      kwh += x.d.annualKwh * (x.d.deviation / (100 + x.d.deviation));
      tags.push(x.k.tag || 'compressor');
    });
    kwh = Math.round(kwh);
    specs.push({ key:'cmp-sec', type:'electrical', priority:'high',
      observation: tags.join(', ') + ' measured ' +
        fix(sec.reduce(function(a,x){ return a + x.d.deviation; }, 0) / sec.length, 1) +
        ' % above design specific energy consumption on the ' +
        (sec[0].d.testType === 'Pump-up' ? 'pump-up' : 'free air delivery') + ' test.',
      recommendation:'Overhaul or service the compressors running above design SEC - air-end clearances, ' +
        'intake filter, inter- and after-cooler fouling and belt slip are the usual causes - and repeat the ' +
        'capacity test to confirm the recovery.',
      unit:'kWh/yr', saving:kwh, monetary:Math.round(kwh * (rate || 0)), investment:0,
      co2: Math.round(kwh * gef / 1000 * 10) / 10 });
  }
  if (idle.length){
    var ikwh = Math.round(idle.reduce(function(a,x){ return a + x.d.idleKwh; }, 0));
    specs.push({ key:'cmp-idle', type:'electrical', priority:'medium',
      observation: idle.map(function(x){ return (x.k.tag || 'compressor') + ' loaded only ' +
        fix(x.d.loadPct,1) + ' % of its running hours'; }).join('; ') +
        ', drawing unload power for the rest.',
      recommendation:'Sequence the compressors so that one machine trims and the rest run loaded or stop, ' +
        'and fix the leaks that keep an unloaded machine cycling. A variable speed drive on the trim machine ' +
        'is the next step where the load swings.',
      unit:'kWh/yr', saving:ikwh, monetary:Math.round(ikwh * (rate || 0)), investment:0,
      co2: Math.round(ikwh * gef / 1000 * 10) / 10 });
  }

  var n = 0;
  specs.forEach(function(sp){
    var row = null;
    for (var i = 0; i < S.ledger.length; i++)
      if (S.ledger[i].autoKey === sp.key){ row = S.ledger[i]; break; }
    if (row && row.locked) return;
    if (!row){ row = { id:uid(), autoKey:sp.key, module:'compressor', status:'draft', actionBy:'Plant' };
               S.ledger.push(row); }
    row.module = 'compressor'; row.type = sp.type; row.priority = sp.priority;
    row.observation = sp.observation; row.recommendation = sp.recommendation;
    row.unit = sp.unit; row.saving = sp.saving; row.monetary = sp.monetary;
    row.investment = sp.investment; row.co2 = sp.co2;
    row.consumption = row.consumption || null;
    n++;
  });
  var live = {}; specs.forEach(function(sp){ live[sp.key] = 1; });
  S.ledger = S.ledger.filter(function(r){
    return !r.autoKey || !/^cmp-/.test(r.autoKey) || live[r.autoKey] || r.locked;
  });
  return n;
}

/* ===================================================================
   JET-Eff record model, mirrored exactly.

   JET_FIELDS is the column order JET-Eff's own exporter writes, so a
   workbook round-trips losslessly: every field the app measured arrives
   here under the same name. The previous importer took eleven of these
   and dropped the rest, which is why the jet section had
   nothing to print.
   =================================================================== */
var JET_FIELDS = [
  'id','jetNo','jetType','insulation','capacity','dia','length','surfaceArea','operation','jetTemp',
  'flow','velocity','pipePeriphery','pressure','rpm','pumpPower','hydraulicPower','shaftPower','pumpEfficiency',
  'ambientTemp','bodyTemps','avgBodyTemp','surfaceHeatLoss','totalSurfaceHeatLoss',
  'steamPressure','steamTemp','lhSteam','eqSteamLoss','insulationBodyTemp',
  'surfaceHeatLossAfter','totalSurfaceHeatLossAfter','eqSteamLossAfter','steamSaving',
  'trapType','trapTempIn','trapTempOut','trapStatus','concentricDrain','trapEqSteamLoss',
  'waterTempBefore','waterTempAfter','heatInlet','eqSteamUsed','steamTempIn','steamTempOut',
  'totalSteamUsed','jetExchangeEfficiency',
  'coolingWaterIn','coolingWaterOut','coolingWaterFlow','coolingEffect','eqSteamCooling','coolingOption',
  'runningHrPerDay','heatingTimePerDay',
  'insEqCoalSaving','insDailyFuelSaving','insAnnualFuelSaving','insInvestment','insMonitoringSaving','insRoiMonths',
  'pumpSuggestion','shaftPowerAt40','pumpSavingKw','pumpDailyPowerSaving','pumpAnnualPowerSaving',
  'pumpMonitoringSaving','pumpRoiMonths',
  'trapEqFuelLoss','trapDailyFuelSaving','trapAnnualFuelSaving','trapMonitoringSaving','trapRoiMonths',
  'observation','recordedBy','createdAt'
];
var JET_TEXT = { id:1, jetNo:1, jetType:1, insulation:1, operation:1, trapType:1, trapStatus:1,
                 concentricDrain:1, pumpSuggestion:1, observation:1, recordedBy:1, createdAt:1 };

var JET_IMAGE_SLOTS = [
  { key: 'body1', title: 'Body Images 1' },
  { key: 'body2', title: 'Body Images 2' },
  { key: 'heatExInlet', title: 'Heat Exchange inlet' },
  { key: 'heatExOutlet', title: 'Heat Exchange outlet' },
  { key: 'steamInlet', title: 'Steam Inlet' },
  { key: 'steamOutlet', title: 'Steam Outlet' },
  { key: 'trap', title: 'Trap' }
];

function parseJetRow(r){
  var no = r.jetNo === undefined || r.jetNo === null ? '' : String(r.jetNo).trim();
  if (!no) return null;
  var j = {};
  JET_FIELDS.forEach(function(f){
    var v = r[f];
    if (f === 'bodyTemps'){
      j.bodyTemps = (v === undefined || v === null || v === '') ? [] :
        String(v).split('/').map(function(t){ return t.trim() === '' ? null : num(t); });
    } else if (JET_TEXT[f]){
      j[f] = (v === undefined || v === null || v === '') ? '' : String(v).trim();
    } else {
      j[f] = num(v);
    }
  });
  j.jetNo = no;
  j.images = (r.images && typeof r.images === 'object') ? r.images : {};
  if (!j.id) j.id = uid();
  if (!j.jetType) j.jetType = 'U Jet';
  if (!j.insulation) j.insulation = 'Insulated';
  if (!j.operation) j.operation = 'Hold';
  return j;
}

/* A port of JET-Eff's recalcJetSavings, to the digit. The report never
   invents a saving: it recomputes the app's arithmetic from the app's raw
   measurements, so if the cost parameters are edited here the numbers move
   the same way they would move in the app. */
function recalcJet(j, cost){
  cost = cost || S.jetCost;
  function rnd(v, d){ return Number(v.toFixed(d)); }
  function pos(v){ return (v !== null && v !== undefined && isFinite(v) && v > 0) ? v : 0; }
  var evap = pos(cost.evaporationRatio), fuelCost = pos(cost.fuelCost),
      unitRate = pos(cost.unitRate), insCost = pos(cost.insulationCost),
      days = pos(cost.days) || 350;

  var pumpInv = (j.pumpEfficiency !== null && j.pumpEfficiency !== undefined && j.pumpEfficiency < 40)
    ? pos(cost.pumpInvestmentCost) : 0;
  var trapInv = (j.trapStatus === 'Trap Passing' || j.concentricDrain === 'Drain before trap')
    ? pos(cost.trapReplacementCost) : 0;
  var heatHr = pos(j.heatingTimePerDay), runHr = pos(j.runningHrPerDay);

  j.insEqCoalSaving = (j.steamSaving != null && evap > 0) ? rnd(j.steamSaving / evap, 3) : null;
  j.insDailyFuelSaving = (j.insEqCoalSaving !== null && heatHr > 0) ? rnd(j.insEqCoalSaving * heatHr, 3) : null;
  j.insAnnualFuelSaving = j.insDailyFuelSaving !== null ? rnd((j.insDailyFuelSaving * days) / 1000, 3) : null;
  j.insInvestment = (insCost > 0 && pos(j.surfaceArea) > 0) ? rnd(insCost * j.surfaceArea, 2) : null;
  /* UNIT NOTE: insAnnualFuelSaving is in TONNE/yr and fuelCost is in RUPEES
     PER KG - 6.5 for coal, which is what engineers type and what every
     sample profile holds. So the tonnes are converted to kg first.

     JET-Eff's field was labelled Rs/Ton and its arithmetic matched that
     label, so with 6.5 in the box a jet saving 5 t/yr came out at Rs 32.50
     instead of Rs 32,500 and the ROI read in centuries. The label was the
     thing that was wrong: nobody was entering a per-tonne price. JET-Eff
     now says Rs/kg, multiplies by 1000 here too, and warns if a per-tonne
     figure is typed in. The two sides agree; do not change one without the
     other. Stored *MonitoringSaving columns are recomputed, not trusted,
     because a workbook exported before that fix carries the old figures. */
  j.insMonitoringSaving = (j.insAnnualFuelSaving !== null && fuelCost > 0)
    ? rnd(j.insAnnualFuelSaving * 1000 * fuelCost, 2) : null;
  j.insRoiMonths = (j.insInvestment !== null && j.insMonitoringSaving > 0)
    ? rnd((j.insInvestment / j.insMonitoringSaving) * 12, 1) : null;

  j.pumpDailyPowerSaving = (j.pumpSavingKw != null && runHr > 0) ? rnd(j.pumpSavingKw * runHr, 2) : null;
  j.pumpAnnualPowerSaving = j.pumpDailyPowerSaving !== null ? rnd(j.pumpDailyPowerSaving * days, 2) : null;
  j.pumpMonitoringSaving = (j.pumpAnnualPowerSaving !== null && unitRate > 0)
    ? rnd(j.pumpAnnualPowerSaving * unitRate, 2) : null;
  j.pumpRoiMonths = (pumpInv > 0 && j.pumpMonitoringSaving > 0)
    ? rnd((pumpInv / j.pumpMonitoringSaving) * 12, 1) : null;

  j.trapEqFuelLoss = (j.trapEqSteamLoss != null && evap > 0) ? rnd(j.trapEqSteamLoss / evap, 3) : null;
  j.trapDailyFuelSaving = (j.trapEqFuelLoss !== null && heatHr > 0) ? rnd(j.trapEqFuelLoss * heatHr, 3) : null;
  j.trapAnnualFuelSaving = j.trapDailyFuelSaving !== null ? rnd((j.trapDailyFuelSaving * days) / 1000, 3) : null;
  j.trapMonitoringSaving = (j.trapAnnualFuelSaving !== null && fuelCost > 0)
    ? rnd(j.trapAnnualFuelSaving * 1000 * fuelCost, 2) : null;
  j.trapRoiMonths = (trapInv > 0 && j.trapMonitoringSaving > 0)
    ? rnd((trapInv / j.trapMonitoringSaving) * 12, 1) : null;

  j.pumpInvestment = pumpInv || null;
  j.trapInvestment = trapInv || null;
  return j;
}

/* The three savings streams and the money that follows from them, in one
   place. Every jet table, the KPI row, the donut and the ledger read this
   function - so they cannot disagree with each other. */
function jetTotals(j){
  /* A saving only counts where there is an action behind it. A trap that is
     working correctly still shows a small measured loss, and a pump above
     the benchmark still shows a theoretical gain - neither is money the
     plant can bank, and claiming it is what makes a report indefensible the
     moment the plant tries to realise it. So stream B counts only where the
     pump is actually being replaced and stream C only where the trap is.
     The per-jet rows still print the measured losses; they just do not add. */
  var a = num(j.insMonitoringSaving) || 0;
  var b = num(j.pumpInvestment) ? (num(j.pumpMonitoringSaving) || 0) : 0;
  var c = num(j.trapInvestment) ? (num(j.trapMonitoringSaving) || 0) : 0;
  var inv = (num(j.insInvestment) || 0) + (num(j.pumpInvestment) || 0) + (num(j.trapInvestment) || 0);
  var tot = a + b + c;
  return { a:a, b:b, c:c, total:tot, invest:inv,
           roi: (tot > 0 && inv > 0) ? (inv / tot) * 12 : (inv === 0 && tot > 0 ? 0 : null) };
}
function jetsRollUp(){
  var r = { n:S.jets.length, steam:0, ins:0, pump:0, trap:0, invest:0,
            effSum:0, effN:0, passing:[], weak:[], op:{ Heating:0, Cooling:0, Hold:0 } };
  S.jets.forEach(function(j){
    var t = jetTotals(j);
    r.steam += num(j.steamSaving) || 0;
    r.ins += t.a; r.pump += t.b; r.trap += t.c; r.invest += t.invest;
    if (num(j.pumpEfficiency) !== null){ r.effSum += num(j.pumpEfficiency); r.effN++; }
    if (j.trapStatus === 'Trap Passing') r.passing.push(j.jetNo);
    if (num(j.pumpEfficiency) !== null && num(j.pumpEfficiency) < 40) r.weak.push(j.jetNo);
    if (r.op[j.operation] === undefined) r.op[j.operation || 'Hold'] = 0;
    r.op[j.operation || 'Hold']++;
  });
  r.total = r.ins + r.pump + r.trap;
  r.avgEff = r.effN ? r.effSum / r.effN : null;
  r.roi = (r.total > 0 && r.invest > 0) ? (r.invest / r.total) * 12 : null;
  return r;
}
/* The A-CMP team-exchange workbook (Report -> Team Data Exchange -> Export /
   Share, and the file attached to every emailed report): a "Company Profile"
   sheet and a "Compressor Entries" sheet whose columns are the app's own
   field names, plus four derived columns the app writes for us
   (pumpTankVolumeM3, luLoadHours, luUnloadHours, luTotalHours). The
   contract is docs/POSTMAN.md in A-CMP; lib/compressor-excel.ts writes it. */
var ACMP_SHEET = 'Compressor Entries';
function isACmpWorkbook(wb){
  var s = findSheet(wb, ACMP_SHEET) || findSheet(wb, 'A-CMP');
  if (!s) return false;
  return headersOf(wb, s).map(normKey).indexOf('machinetag') >= 0;
}
function importACmp(wb){
  var log = [];
  var s = findSheet(wb, ACMP_SHEET) || findSheet(wb, 'A-CMP') || findSheet(wb, 'Compressors');
  var rows = s ? sheetRows(wb, s) : [];
  if (!rows.length) return log;
  var incoming = rows.map(function(r){
    /* Receiver volume: the app records what the engineer typed (litres or
       m³) and also writes the m³ figure; take that, or convert. */
    var tankVol = num(pick(r,['pumpTankVolumeM3']));
    if (tankVol === null){
      tankVol = num(pick(r,['pumpTankVolume']));
      if (tankVol !== null && /^l/i.test(String(pick(r,['pumpTankVolumeUnit']) || ''))) tankVol = tankVol / 1000;
    }
    var pumpCfm = num(pick(r,['pumpActualFadCfm']));
    return { tag: String(pick(r,['machineTag','Machine Tag']) || '').trim(),
      make: pick(r,['makeModel','Make / Model']) || '',
      type: pick(r,['compressorType','Type']) || 'Screw',
      year: pick(r,['yearOfManufacture','Year']) || '',
      ratedCap: num(pick(r,['ratedCapacity','Rated Capacity'])),
      capUnit: pick(r,['ratedCapacityUnit','Capacity Unit']) || 'CFM',
      ratedPressure: num(pick(r,['ratedPressure'])),
      processPressure: num(pick(r,['processPressure'])),
      ratedKw: num(pick(r,['ratedKw','Rated kW'])),
      motorEff: num(pick(r,['motorEfficiency'])),
      testType: (pumpCfm ? 'Pump-up' : 'FAD'),
      suctionArea: num(pick(r,['fadSuctionArea'])),
      avgVelocity: num(pick(r,['fadAvgVelocity'])),
      pumpP1: num(pick(r,['pumpP1'])), pumpP2: num(pick(r,['pumpP2'])),
      pumpTime: num(pick(r,['pumpTimeSec'])), tankVol: tankVol,
      measuredKw: num(pick(r,['genLoadKw','measuredKw','pumpMeasuredPower','fadMeasuredPower'])),
      runningPressure: num(pick(r,[pumpCfm ? 'pumpRunningPressure' : 'fadRunningPressure','fadRunningPressure','pumpRunningPressure'])),
      loadHrs: num(pick(r,['luLoadHours'])), unloadHrs: num(pick(r,['luUnloadHours'])),
      totalHrs: num(pick(r,['luTotalHours'])), hoursPerDay:24,

      /* What A-CMP itself computed. These used to be dropped and the
         figures recomputed here from the raw inputs, which put a different
         number in the report from the one on the engineer's own screen with
         nothing to say which was right. On the AC-02 fixture the difference
         is 15 % on delivered air, because the app's pump-up test applies the
         temperature correction 273/(273+T) and the quick formula does not,
         and its FAD test averages an anemometer traverse rather than taking
         one reading. compressorCalc prefers these and says so when the
         recomputed value disagrees by more than 3 %. */
      designedSec: num(pick(r,['designedSec'])),
      designedAirGen: num(pick(r,['designedAirGen'])),
      fadAirDeliveryCfm: num(pick(r,['fadAirDeliveryCfm'])),
      pumpActualFadCfm: pumpCfm,
      fadActualSec: num(pick(r,['fadActualSec'])),
      fadActualAirGen: num(pick(r,['fadActualAirGen'])),
      /* A-CMP writes the compressed-air temperature AND the factor it
         derived from it. Take the factor when it is there; deriving it again
         from the temperature is only the fallback. */
      pumpAirTemp: num(pick(r,['pumpAirTempC','pumpAirTemp'])),
      pumpTempFactor: num(pick(r,['pumpTempFactor'])),

      /* Unloaded running is the other half of the compressor story: a
         machine idling half its life burns real money making no air. */
      genLoadKw: num(pick(r,['genLoadKw'])),
      genUnloadKw: num(pick(r,['genUnloadKw'])),
      annualOperatingDays: num(pick(r,['annualOperatingDays'])),
      powerCost: num(pick(r,['powerCost'])),

      /* Carried under A-CMP's own names because PostMan has no counterpart.
         A column added there therefore reaches the report with no code
         change here. */
      serialNo: pick(r,['serialNo']) || '',
      ratedHp: num(pick(r,['ratedHp'])),
      starter: pick(r,['starterType']) || '',
      recordedBy: pick(r,['recordedBy']) || '',
      obsThermalImageNo: pick(r,['obsThermalImageNo']) || '',
      obsCompDischarge: num(pick(r,['obsCompDischarge'])),
      obsOilCooler: num(pick(r,['obsOilCooler'])),
      obsAfterCooler: num(pick(r,['obsAfterCooler'])),
      obsMotorBody: num(pick(r,['obsMotorBody'])),

      obs: [pick(r,['description']), pick(r,['fadDescription']), pick(r,['pumpDescription'])]
             .filter(function(t){ return t; }).join(' ') };
  }).filter(function(n){ return n.tag; });   /* Excel loves trailing blank rows */
  if (!incoming.length) return log;
  /* A compressor already in the report (same tag) is replaced, the rest
     kept, so re-importing or a second partial file never duplicates. */
  var keep = (S.compressor || []).filter(function(k){ return !incoming.some(function(n){ return normKey(n.tag) === normKey(k.tag); }); });
  S.compressor = keep.concat(incoming);
  S.enabled.compressor = true;
  log.push(incoming.length + ' compressor' + (incoming.length === 1 ? '' : 's') + ' from A-CMP');

  var drift = S.compressor.map(compressorCalc).filter(function(d){ return d.drift; }).length;
  if (drift) log.push(drift + ' machine(s) where the recomputed figure differs from the app\u2019s by more than 3 %');
  var made = syncCompressorLedger();
  if (made) log.push(made + ' recommendation(s) written to the ledger');
  return log;
}

/* The one import control, used on the Import field data screen AND on every
   chapter that can take a workbook (boiler, heater, electrical distribution,
   jets, compressors). It takes any number of files in one go - a FOX
   export, three PQ recordings and a Thermo-X file together - reads them
   one after another through importAny, and reports what each one brought
   in, inline, so nobody is sent off to another screen to upload. */
function importDrop(opts){
  opts = opts || {};
  var wrap = el('div');
  var zone = el('div','border:1.5px dashed var(--line);border-radius:8px;padding:' + (opts.compact ? '10px 12px' : '16px') +
    ';background:var(--panel-2);cursor:pointer;text-align:center;transition:border-color .15s;');
  var i = el('input'); i.type = 'file'; i.accept = '.xlsx,.xls,.csv,.json'; i.multiple = true; i.style.display = 'none';
  zone.appendChild(el('div','font-weight:600;font-size:13px;', opts.label || 'Drop workbooks here, or click to choose'));
  zone.appendChild(el('div','font-size:11.5px;color:var(--ink-3);margin-top:3px;', opts.hint ||
    'Any number at once: JET-Eff, A-CMP, the FOX KISEM export, the Thermo-X exchange file, PQ analyser \u201cPostMan exports\u201d (Excel or the JSON bundle) or a module workbook. Each file is identified from its own contents and checked against this report\u2019s company.'));
  zone.appendChild(i);
  var out = el('div','margin-top:8px;font-size:12px;'); out.hidden = true;
  wrap.appendChild(zone); wrap.appendChild(out);

  var run = function(files){
    files = Array.prototype.slice.call(files || []).filter(function(f){ return /\.(xlsx|xls|csv|json)$/i.test(f.name); });
    if (!files.length) return;
    var lines = [], k = 0;
    var next = function(){
      if (k >= files.length){
        save(); renderAll();
        /* The form was just rebuilt; find our own result box in the new one. */
        var box = document.getElementById('importlog');
        if (box){
          clear(box); box.hidden = false;
          lines.forEach(function(l){ var p = el('div','padding:3px 0;', l[1]); p.className = l[0] === 'bad' ? 'callout bad' : 'callout good'; p.style.margin = '0 0 4px'; box.appendChild(p); });
        } else alert(lines.map(function(l){ return l[1]; }).join('\n'));
        return;
      }
      var f = files[k++];
      if (/\.json$/i.test(f.name)){
        /* A PostMan bundle from the PQ analyser: the findings, not a workbook. */
        f.text().then(function(txt){
          try { lines.push(['ok', f.name + ': ' + importPqBundle(JSON.parse(txt), f.name)]); }
          catch (err){ lines.push(['bad', f.name + ': ' + err.message]); }
          next();
        }).catch(function(e){ lines.push(['bad', f.name + ': ' + e.message]); next(); });
        return;
      }
      readWorkbook(f).then(function(wb){
        try {
          var log = importAny(wb, f.name);
          lines.push(log.length ? ['ok', f.name + ': ' + log.join('; ')] : ['bad', f.name + ': nothing recognised (sheets: ' + Object.keys(wb.Sheets).join(', ') + ')']);
        } catch (err){ lines.push(['bad', f.name + ': ' + err.message]); }
        next();
      }).catch(function(e){ lines.push(['bad', f.name + ': ' + e.message]); next(); });
    };
    next();
  };
  zone.addEventListener('click', function(){ i.click(); });
  i.addEventListener('change', function(){ run(i.files); i.value = ''; });
  zone.addEventListener('dragover', function(e){ e.preventDefault(); zone.style.borderColor = 'var(--brand)'; });
  zone.addEventListener('dragleave', function(){ zone.style.borderColor = 'var(--line)'; });
  zone.addEventListener('drop', function(e){ e.preventDefault(); zone.style.borderColor = 'var(--line)'; run(e.dataTransfer.files); });
  return wrap;
}
/* Where the last import's results are shown after the form rebuilds. */
function importLogBox(){ var b = el('div'); b.id = 'importlog'; b.hidden = true; return b; }

FORMS.imports = function(w){
  var c = card('Import field data',
    'One door for every workbook. Each file is identified from its own contents, checked against this report\u2019s company, then read into whichever modules it holds. Nothing is uploaded anywhere \u2014 it is read in this browser. The same drop box sits on every chapter that takes a workbook.');
  c.appendChild(importDrop());
  c.appendChild(importLogBox());
  var note = el('p','','A workbook whose company name differs from this report is flagged, never silently overwritten. Every import merges by the record\u2019s own key \u2014 jet number, panel name, machine tag, recording ID, Thermo-X record id \u2014 so the same file twice, or two engineers\u2019 partial files, never duplicate a row.');
  note.className = 'callout info';
  c.appendChild(note);
  w.appendChild(c);

  var c3 = card('Module workbook',
    'The file the team takes to site. Every module in the report has a sheet; the Read me tab lists what each column means. Fill what you measured, leave the rest blank, import it back here.');
  var bar3 = el('div','display:flex;gap:8px;flex-wrap:wrap;');
  bar3.appendChild(btn('Download blank template (XLSX)', function(){
    offerWorkbook('PostMan-module-template.xlsx', buildModuleWorkbook(false));
  }));
  bar3.appendChild(btn('Export this report as a workbook', function(){
    offerWorkbook(reportFilename(S.meta.financialYear, S.meta.serial, S.company.name, S.meta.reportDate) + '.xlsx',
      buildModuleWorkbook(true));
  }));
  c3.appendChild(bar3);
  c3.appendChild(el('p','margin-top:10px;font-size:12px;color:var(--ink3)',
    'The export writes jets back in JET-Eff\u2019s own column order, so the same file can be opened in the app and merged by Jet No.'));
  w.appendChild(c3);

  var c2 = card('Export this report', 'The whole draft as JSON — hand it to a colleague, or keep it as a backup outside this browser.');
  var bar = el('div','display:flex;gap:8px;flex-wrap:wrap;');
  bar.appendChild(btn('Download draft (JSON)', function(){
    offerFile(reportFilename(S.meta.financialYear, S.meta.serial, S.company.name, S.meta.reportDate) + '.json',
      JSON.stringify(S, null, 1));
  }));
  var imp = el('input'); imp.type='file'; imp.accept='.json';
  imp.addEventListener('change', function(){
    var f = imp.files && imp.files[0]; if (!f) return;
    readFile(f).then(function(){
      var r = new FileReader();
      r.onload = function(){
        try { S = deepMerge(blankState(), JSON.parse(r.result)); save(); renderAll(); }
        catch (e){ alert('That file is not a PostMan draft.'); }
      };
      r.readAsText(f);
    });
  });
  c2.appendChild(bar);
  c2.appendChild(labelled('Load a draft', imp));
  w.appendChild(c2);
};


/* ---- handing the viewer a file ----
   A plain <a download> is inert inside the hosted artifact viewer, so ask the
   platform when it is there and fall back to the anchor for the offline copy,
   where the anchor is the only thing that works. */
var DOWNLOADS = null;
if (window.claude && typeof window.claude.use === 'function'){
  window.claude.use('downloads').then(function(d){ DOWNLOADS = d; }, function(){});
}
function anchorDownload(filename, text){
  var blob = new Blob([text], { type:'application/json' });
  var a = el('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function offerFile(filename, text){
  if (DOWNLOADS){
    DOWNLOADS.save({ filename:filename, data:text }).catch(function(e){
      if (e && e.code === 'declined') return;
      if (e && (e.code === 'rate_limited')) { alert('A save prompt is already open.'); return; }
      anchorDownload(filename, text);
    });
    return;
  }
  anchorDownload(filename, text);
}

/* ===================================================================
   THE MODULE WORKBOOK

   One spec drives three things at once: the blank template the team fills
   in the field, the importer that reads it back, and the export that
   round-trips a report. Because they share a spec they cannot drift - a
   column added here appears in the template, is understood by the reader
   and comes back out on export, with no third place to remember.

   Every module in the report is reachable this way, so a plant that has
   no JET-Eff and no A-CMP can still be assessed entirely from workbooks.
   =================================================================== */
var SHEETS = [
  { name:'Bills', path:'bills', label:'Electricity bills',
    cols:[['month','Month','s'],['contract','Contract demand kVA','n'],['actualMD','Actual MD kVA','n'],
          ['billingDemand','Billing demand kVA','n'],['kwh','kWh','n'],['kvah','kVAh','n'],
          ['pf','Power factor','n'],['todNight','TOD night kWh','n'],['todPeak','TOD peak kWh','n'],
          ['net','Net payable Rs','n']] },

  { name:'Baseline Electricity', path:'baseline.elec', label:'Electricity baseline',
    cols:[['month','Month','s'],['qty','Units kWh','n'],['cost','Cost Rs','n'],['prod','Production','n']] },
  { name:'Baseline Thermal', path:'baseline.thermal', label:'Thermal baseline',
    cols:[['month','Month','s'],['qty','Quantity','n'],['cost','Cost Rs','n'],['prod','Production','n']] },
  /* The baseline model keeps water as a month-key map, and
     syncBaselineLegacy mirrors it to a flat array for everything that reads
     rows. The spec pointed at the map: buildModuleWorkbook called forEach on
     an object and threw, which broke BOTH the blank template and "Export
     this report as a workbook" - the crash was in the shared builder, so the
     button that never touches water died too. `after` puts an imported sheet
     back into the map, or the next syncBaselineLegacy would erase it. */
  { name:'Baseline Water', path:'baseline.waterRows', label:'Water baseline',
    cols:[['month','Month','s'],['m3','Quantity m3','n']],
    after:function(rows){
      var b = S.baseline, byLabel = {};
      (b.months || []).forEach(function(p){ byLabel[monthLabelOf(p.y,p.m)] = monthKey(p.y,p.m); });
      rows.forEach(function(r){
        var k = byLabel[String(r.month).trim()];
        if (k && r.m3 !== null && r.m3 !== '') b.water[k] = r.m3;
      });
    } },

  { name:'PCC Loads', path:'dist.pcc', label:'PCC panel loads',
    cols:[['name','Name of machine','s'],['v','Voltage','n'],['i','Current','n'],['kw','kW','n'],
          ['kvar','kVAr','n'],['kva','kVA','n'],['pf','PF','n'],['vthd','%V THD','n'],['ithd','%I THD','n']] },
  { name:'Motor Loads', path:'dist.motors', label:'Motor load study',
    cols:[['name','Name','s'],['rated','Rated kW','n'],['starter','Starter','s'],['freq','Frequency Hz','n'],
          ['v','Voltage','n'],['i','Current','n'],['kw','kW','n'],['kvar','kVAr','n'],['kva','kVA','n'],['pf','PF','n']] },
  { name:'APFC', path:'dist.apfc', label:'APFC stages',
    cols:[['stage','Stage','s'],['rated','Rated kVAr','n'],['v','Voltage','n'],
          ['ir','I-R','n'],['iy','I-Y','n'],['ib','I-B','n'],['remark','Remark','s']] },

  { name:'Compressors', path:'compressor', label:'Air compressors',
    cols:[['tag','Machine tag','s'],['make','Make / model','s'],['type','Type','s'],['year','Year','s'],
          ['ratedCap','Rated capacity','n'],['capUnit','Capacity unit','s'],['ratedPressure','Rated pressure bar','n'],
          ['ratedKw','Rated kW','n'],['motorEff','Motor efficiency %','n'],['testType','Test type','s'],
          ['suctionArea','FAD suction area m2','n'],['avgVelocity','FAD avg velocity m/s','n'],
          ['pumpP1','Pump-up P1 bar','n'],['pumpP2','Pump-up P2 bar','n'],['pumpTime','Pump-up time sec','n'],
          ['tankVol','Receiver volume m3','n'],['measuredKw','Measured kW','n'],
          ['runningPressure','Running pressure bar','n'],['loadHrs','Load hours','n'],
          ['unloadHrs','Unload hours','n'],['hoursPerDay','Hours per day','n'],['obs','Observation','s']] },

  { name:'Cooling Towers', path:'coolingTower', label:'Cooling towers',
    cols:[['name','Cooling tower','s'],['ratedTR','Rated TR','n'],['hotIn','Hot water in C','n'],
          ['coldOut','Cold water out C','n'],['wetBulb','Wet bulb C','n'],['flow','Flow m3/hr','n'],
          ['fanKw','Fan kW','n'],['obs','Observation','s']] },
  { name:'Chiller Readings', path:'chiller.readings', label:'Chiller readings',
    cols:[['time','Time','s'],['flow','Flow m3/hr','n'],['tin','Evap in C','n'],
          ['tout','Evap out C','n'],['kw','Power kW','n']] },
  { name:'Pumps', path:'pumps', label:'Pumping system',
    cols:[['name','Pump','s'],['make','Make','s'],['ratedKw','Rated kW','n'],['flow','Flow m3/hr','n'],
          ['head','Head m','n'],['motorKw','Motor input kW','n'],['motorEff','Motor efficiency %','n'],
          ['obs','Observation','s']] },

  { name:'Boiler Spec', path:'boiler.spec', label:'Boiler specification',
    cols:[['p','Parameter','s'],['v','Value','s']] },
  { name:'TFH Spec', path:'tfh.spec', label:'Thermic fluid heater specification',
    cols:[['p','Parameter','s'],['v','Value','s']] },

  { name:'Lux', path:'lux', label:'Lux measurement',
    cols:[['sr','S.N.','n'],['location','Location','s'],['area','Area m2','n'],['lux','Average lux','n'],
          ['watt','Connected load W','n'],['target','Target lux/W/m2','n']] },
  { name:'Solar', path:'solar.rows', label:'Solar generation',
    cols:[['month','Month','s'],['gen','Generation kWh','n'],['irr','Irradiance kWh/m2','n']] },
  { name:'Earth Pits', path:'earth', label:'Earth loop resistance',
    cols:[['location','Earth pit / location','s'],['ohm','Resistance ohm','n'],['limit','Limit ohm','n']] },

  { name:'Instruments', path:'instruments', label:'Instruments used',
    cols:[['sr','S.N.','n'],['name','Instrument','s'],['make','Make','s'],['model','Model','s'],
          ['qty','Qty','n'],['used','Used','b']] },
  { name:'Plant Team', path:'team.plant', label:'Plant team',
    cols:[['sr','S.N.','n'],['name','Name','s'],['role','Designation','s']] },
  { name:'Products', path:'production.products', label:'Products',
    cols:[['name','Product','s'],['capacity','Capacity','s'],['uom','Unit','s']] },
  { name:'SOP', path:'sop', label:'Guidelines / SOP',
    cols:[['area','Area','s'],['guideline','Guideline','s']] },

  { name:'Ledger', path:'ledger', label:'Recommendation ledger',
    cols:[['module','Module','s'],['type','Type','s'],['priority','Priority','s'],['status','Status','s'],
          ['actionBy','Action by','s'],['observation','Observation','s'],['recommendation','Recommendation','s'],
          ['consumption','Annual consumption','n'],['unit','Unit','s'],['saving','Annual saving','n'],
          ['monetary','Monetary saving Rs','n'],['investment','Investment Rs','n'],['co2','CO2 tCO2e','n'],
          /* A generated row has to survive a trip through Excel still knowing
             it is generated, or re-importing the file duplicates every
             recommendation the modules produce. */
          ['autoKey','Auto key','s'],['locked','Locked','b']] }
];

function atPath(path){
  var p = path.split('.'), o = S;
  for (var i = 0; i < p.length - 1; i++) o = o[p[i]];
  return { parent:o, key:p[p.length - 1] };
}
function coerce(v, t){
  if (t === 'n') return num(v);
  if (t === 'b') return /^(y|yes|true|1|used)$/i.test(String(v).trim());
  return (v === undefined || v === null) ? '' : String(v).trim();
}

/* Reads every sheet it recognises, ignores every sheet it does not. A
   workbook holding only a Lux sheet imports lux and touches nothing else,
   so partial data from a walkthrough is always safe to load. */
function importModules(wb){
  var log = [], claimed = {};
  SHEETS.forEach(function(sp){
    var rows = sheetRows(wb, sp.name);
    if (!rows.length) return;
    var out = rows.map(function(r){
      var o = {};
      sp.cols.forEach(function(c){
        var v = r[c[1]];
        if (v === undefined || v === '') v = r[c[0]];
        o[c[0]] = coerce(v, c[2]);
      });
      return o;
    }).filter(function(o){
      /* A row is real if any cell in it is. Excel loves trailing blanks. */
      return sp.cols.some(function(c){ var v = o[c[0]]; return v !== '' && v !== null && v !== false; });
    });
    if (!out.length) return;
    if (sp.path === 'ledger') out.forEach(function(o){
      o.id = uid();
      if (!o.autoKey) delete o.autoKey;
    });
    var t = atPath(sp.path);
    t.parent[t.key] = out;
    if (sp.after) sp.after(out);
    var flag = { 'boiler.spec':'boiler', 'tfh.spec':'tfh', 'chiller.readings':'chiller',
                 'solar.rows':'solar', 'coolingTower':'coolingTower', 'compressor':'compressor',
                 'pumps':'pumps', 'lux':'lux', 'earth':'earth', 'sop':'sop' }[sp.path];
    if (flag) S.enabled[flag] = true;
    claimed[sp.name] = 1;
    log.push(out.length + ' ' + sp.label.toLowerCase());
  });
  /* Jet Data and the JET-Eff cost profile ride in the same workbook when
     the team exports from the app, so always give the jet reader a look. */
  if (wb.Sheets['Jet Data'] || wb.Sheets['Company Profile'])
    log = log.concat(importJetEff(wb, claimed));
  if (wb.Sheets['Compressors'] === undefined && (wb.Sheets['Compressor Entries'] || wb.Sheets['A-CMP']))
    log = log.concat(importACmp(wb));
  return log;
}

/* The same spec, written out empty (or full) as a workbook. This is the
   file the team takes to site. */
function buildModuleWorkbook(withData){
  var wb = XLSX.utils.book_new();
  var readme = [['PostMan module workbook'], [],
    ['Fill any sheet you have data for and leave the rest empty.'],
    ['Import reads only the sheets that have rows, so partial workbooks are safe.'],
    ['Do not rename a sheet or a header - those are what the importer matches on.'],
    ['Re-importing replaces that module; it does not duplicate rows.'], [],
    ['Sheet','Module','Columns']];
  SHEETS.forEach(function(sp){
    readme.push([sp.name, sp.label, sp.cols.map(function(c){ return c[1]; }).join(' | ')]);
  });
  readme.push([]); readme.push(['Jet Data', 'Jet machines',
    'Exported by JET-Eff. ' + JET_FIELDS.length + ' columns, imported in full.']);
  readme.push(['Company Profile', 'Jet cost parameters',
    'insulationCost | pumpInvestmentCost | trapReplacementCost | fuelCost | unitRate | evaporationRatio']);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readme), 'Read me');

  SHEETS.forEach(function(sp){
    var head = sp.cols.map(function(c){ return c[1]; });
    var aoa = [head];
    if (withData){
      var t = atPath(sp.path), data = t.parent[t.key] || [];
      data.forEach(function(o){
        aoa.push(sp.cols.map(function(c){
          var v = o[c[0]];
          if (v === null || v === undefined) return '';
          if (c[2] === 'b') return v ? 'Yes' : 'No';
          return v;
        }));
      });
    }
    if (aoa.length === 1) aoa.push(head.map(function(){ return ''; }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sp.name);
  });

  /* Jets go out in JET-Eff's own column order, so a workbook exported here
     can be opened by the app and merged back by Jet No. */
  if (withData && S.jets.length){
    var prof = [['Field','Value'],
      ['companyName', S.company.name || ''],
      ['insulationCost', S.jetCost.insulationCost], ['pumpInvestmentCost', S.jetCost.pumpInvestmentCost],
      ['trapReplacementCost', S.jetCost.trapReplacementCost], ['fuelCost', S.jetCost.fuelCost],
      ['unitRate', S.jetCost.unitRate], ['evaporationRatio', S.jetCost.evaporationRatio]];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prof), 'Company Profile');
    var jrows = [JET_FIELDS].concat(S.jets.map(function(j){
      return JET_FIELDS.map(function(f){
        if (f === 'bodyTemps') return (j.bodyTemps || []).join('/');
        var v = j[f];
        return (v === null || v === undefined) ? '' : v;
      });
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(jrows), 'Jet Data');
  }
  return wb;
}

/* XLSX.writeFile drives its own anchor, which the artifact viewer makes
   inert - so the bytes go through the same offerFile path everything else
   uses, base64 in hand. */
function offerWorkbook(filename, wb){
  var b64 = XLSX.write(wb, { type:'base64', bookType:'xlsx' });
  var bin = atob(b64), arr = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  var blob = new Blob([arr], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  if (DOWNLOADS){
    DOWNLOADS.save({ filename:filename, data:blob }).catch(function(e){
      if (e && e.code === 'declined') return;
      anchorBlob(filename, blob);
    });
    return;
  }
  anchorBlob(filename, blob);
}
function anchorBlob(filename, blob){
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
}

/* ===================================================================
   WHAT IS THIS WORKBOOK, AND IS IT EVEN THIS PLANT?

   Two failures cost a report its credibility, and both are silent:
   dropping a file into the wrong reader so half of it is ignored, and
   dropping a file from a DIFFERENT plant so the report quietly mixes two
   companies. Neither should need the user to notice. The first is solved
   by identifying the workbook from its own contents; the second by
   refusing to import until a human says the names mean the same plant.
   =================================================================== */

/* Sheet names are matched loosely - a team member who saved the tab as
   "Lux Level" or "lux_data" still gets routed. */
function normKey(s){ return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

function findSheet(wb, name){
  var want = normKey(name), names = Object.keys(wb.Sheets);
  for (var i = 0; i < names.length; i++) if (normKey(names[i]) === want) return names[i];
  for (i = 0; i < names.length; i++){
    var n = normKey(names[i]);
    if (n.indexOf(want) === 0 || want.indexOf(n) === 0) return names[i];
  }
  return null;
}
function headersOf(wb, name){
  var sh = wb.Sheets[name]; if (!sh) return [];
  var rows = XLSX.utils.sheet_to_json(sh, { header:1 });
  for (var i = 0; i < Math.min(rows.length, 5); i++){
    var r = rows[i] || [];
    var filled = r.filter(function(c){ return c !== '' && c !== null && c !== undefined; });
    if (filled.length >= 2) return filled.map(String);
  }
  return [];
}

/* Identify the workbook by what is inside it, not by what it is called.
   Returns every module it can see, so a mixed workbook routes to all of
   them rather than only to the first match. */
function detectWorkbook(wb){
  var names = Object.keys(wb.Sheets);
  var found = [], score = {};

  if (findSheet(wb, 'Jet Data')) found.push({ kind:'jets', label:'JET-Eff jet data', sheet:findSheet(wb, 'Jet Data') });
  SHEETS.forEach(function(sp){
    var s = findSheet(wb, sp.name);
    if (s) found.push({ kind:'module', label:sp.label, sheet:s, spec:sp });
  });
  if (!found.length){
    /* No recognisable tab name - fall back to the column headers, which
       survive renaming far better than sheet names do. */
    names.forEach(function(nm){
      var h = headersOf(wb, nm).map(normKey);
      if (!h.length) return;
      var best = null, bestHit = 0;
      SHEETS.forEach(function(sp){
        var hit = sp.cols.filter(function(c){
          return h.indexOf(normKey(c[1])) >= 0 || h.indexOf(normKey(c[0])) >= 0;
        }).length;
        if (hit > bestHit){ bestHit = hit; best = sp; }
      });
      var jetHit = JET_FIELDS.filter(function(f){ return h.indexOf(normKey(f)) >= 0; }).length;
      if (jetHit >= 6 && jetHit > bestHit){
        found.push({ kind:'jets', label:'jet data (recognised by its columns)', sheet:nm, renamed:true });
      } else if (best && bestHit >= Math.max(2, Math.ceil(best.cols.length * 0.4))){
        found.push({ kind:'module', label:best.label + ' (recognised by its columns)',
                     sheet:nm, spec:best, renamed:true });
      }
      score[nm] = bestHit;
    });
  }
  return { found:found, sheets:names };
}

/* Company identity. Read from wherever the exporting app happened to put
   it, then compared on meaningful words only: "Shree Mahadev Textiles Pvt.
   Ltd." and "SHREE MAHADEV TEXTILES PRIVATE LIMITED" are the same plant;
   "Shakti Enterprises" is not. */
var CO_NOISE = { pvt:1, private:1, ltd:1, limited:1, llp:1, inc:1, co:1, company:1,
                 the:1, and:1, m:1, s:1, ms:1, india:1, indian:1 };
function coTokens(name){
  return String(name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(function(t){ return t && !CO_NOISE[t]; });
}
function sameCompany(a, b){
  var x = coTokens(a), y = coTokens(b);
  if (!x.length || !y.length) return true;
  var hit = x.filter(function(t){ return y.indexOf(t) >= 0; }).length;
  /* Deliberately strict. A false alarm costs one confirmation dialog; a
     miss puts another plant's measurements into a signed report. At 0.75,
     "Shree Mahadev Silk Mills Pvt. Ltd." still matches "SHREE MAHADEV SILK
     MILLS PRIVATE LIMITED" but no longer matches "Shree Mahadev Textiles". */
  return hit / Math.min(x.length, y.length) >= 0.75;
}
function workbookCompany(wb){
  var keys = ['companyname','company','plantname','clientname','nameofcompany','unitname'];
  var names = Object.keys(wb.Sheets);
  for (var i = 0; i < names.length; i++){
    var sh = wb.Sheets[names[i]];
    var rows = XLSX.utils.sheet_to_json(sh, { header:1 });
    /* Field/Value shape, as JET-Eff writes it. */
    for (var r = 0; r < Math.min(rows.length, 40); r++){
      var row = rows[r] || [];
      if (row.length >= 2 && keys.indexOf(normKey(row[0])) >= 0 && row[1])
        return String(row[1]).trim();
    }
    /* Header/row shape. */
    var head = (rows[0] || []).map(normKey);
    for (var c = 0; c < head.length; c++){
      if (keys.indexOf(head[c]) >= 0 && rows[1] && rows[1][c])
        return String(rows[1][c]).trim();
    }
  }
  return null;
}

/* The single door every workbook comes through. Identifies it, checks the
   plant, then hands it to the readers that apply. Refusing here is the
   whole point: a mismatch is reported and nothing is written, so a report
   can never end up holding another company's measurements by accident. */
function importAny(wb, fileName){
  /* The two measured-data workbooks are recognised before anything else,
     because their sheets are unmistakable and neither carries the module
     template's headers. */
  if (isThermoxWorkbook(wb)){
    var theirsT = workbookCompany(wb), oursT = S.company.name;
    if (theirsT && oursT && !sameCompany(theirsT, oursT) &&
        !confirm('DIFFERENT COMPANY\n\nThis Thermo-X file is for:\n    ' + theirsT + '\n\nThis report is for:\n    ' + oursT + '\n\nPress Cancel to stop.'))
      throw new Error('Import cancelled. That file belongs to ' + theirsT + ', not to this report.');
    return importThermox(wb, fileName);
  }
  if (isFoxWorkbook(wb)){
    var theirsF = workbookCompany(wb), oursF = S.company.name;
    if (theirsF && oursF && !sameCompany(theirsF, oursF) &&
        !confirm('DIFFERENT COMPANY\n\nThis FOX workbook is for:\n    ' + theirsF + '\n\nThis report is for:\n    ' + oursF + '\n\nPress Cancel to stop.'))
      throw new Error('Import cancelled. That workbook belongs to ' + theirsF + ', not to this report.');
    return importFox(wb, fileName);
  }
  if (isACmpWorkbook(wb)){
    var theirsA = workbookCompany(wb), oursA = S.company.name;
    if (theirsA && oursA && !sameCompany(theirsA, oursA) &&
        !confirm('DIFFERENT COMPANY\n\nThis A-CMP file is for:\n    ' + theirsA + '\n\nThis report is for:\n    ' + oursA + '\n\nPress Cancel to stop.'))
      throw new Error('Import cancelled. That file belongs to ' + theirsA + ', not to this report.');
    if (theirsA && !oursA) S.company.name = theirsA;
    var logA = importACmp(wb);
    if (!logA.length) throw new Error('The A-CMP file was recognised but has no compressor rows.');
    if (theirsA) logA.push('company verified as ' + theirsA);
    return logA;
  }
  var pqSheet = null;
  Object.keys(wb.Sheets).forEach(function(n){ if (!pqSheet && isPqDataSheet(wb, n)) pqSheet = n; });
  if (pqSheet) return [importPq(wb, fileName)];

  var det = detectWorkbook(wb);
  if (!det.found.length)
    throw new Error('Nothing in this workbook could be identified.\n\nSheets found: ' +
      det.sheets.join(', ') + '\n\nDownload the module template from this page and use its ' +
      'sheet names and headers, or export the file from JET-Eff.');

  var theirs = workbookCompany(wb), ours = S.company.name;
  if (theirs && ours && !sameCompany(theirs, ours)){
    var ok = confirm('DIFFERENT COMPANY\n\nThis workbook is for:\n    ' + theirs +
      '\n\nThis report is for:\n    ' + ours +
      '\n\nNothing has been imported. Importing would mix two plants’ measurements into one ' +
      'report.\n\nPress Cancel to stop — this is almost always the right choice.\n' +
      'Press OK only if these two names are the same plant.');
    if (!ok) throw new Error('Import cancelled. That workbook belongs to ' + theirs + ', not to this report.');
  }
  if (theirs && !ours){ S.company.name = theirs; }

  var log = [];
  var kinds = {};
  det.found.forEach(function(f){ kinds[f.kind] = 1; });

  /* A tab whose NAME was not recognised is read through a shim that
     presents it under the name the readers expect. */
  var shim = wb, renamed = det.found.filter(function(f){ return f.renamed; });
  if (renamed.length){
    shim = { Sheets:{}, SheetNames:[] };
    Object.keys(wb.Sheets).forEach(function(n){ shim.Sheets[n] = wb.Sheets[n]; shim.SheetNames.push(n); });
    renamed.forEach(function(f){
      var target = f.kind === 'jets' ? 'Jet Data' : f.spec.name;
      shim.Sheets[target] = wb.Sheets[f.sheet];
      if (shim.SheetNames.indexOf(target) < 0) shim.SheetNames.push(target);
      log.push('read "' + f.sheet + '" as ' + target);
    });
  }

  log = log.concat(importModules(shim));
  if (!log.length) throw new Error('The sheets were recognised but every row in them was empty.');
  if (theirs) log.push('company verified as ' + theirs);
  return log;
}
