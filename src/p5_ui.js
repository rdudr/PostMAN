/* ===================================================================
   UI FRAMEWORK - navigation, field widgets, table editor.

   Editing a value repaints the REPORT only, never the form. Rebuilding
   the form on every keystroke is what breaks a drag: the slider you are
   holding gets replaced mid-gesture. Forms rebuild on section change or
   on a structural edit (a row added, an image replaced) and at no other
   time.
   =================================================================== */

function labelled(labelText, node, hintText){
  var l = el('label');
  l.appendChild(el('span','', labelText)).className = 'lab';
  l.appendChild(node);
  if (hintText) l.appendChild(el('span','', hintText)).className = 'sub';
  return l;
}

/* obj/key binding. `structural` forces a full form rebuild after the edit. */
function bindInput(node, obj, key, opts){
  opts = opts || {};
  var ev = opts.event || 'input';
  node.addEventListener(ev, function(){
    var v = node.type === 'checkbox' ? node.checked : node.value;
    if (opts.number) v = (v === '' ? null : num(v));
    obj[key] = v;
    if (opts.onChange) opts.onChange();
    save();
    if (opts.structural) renderAll(); else drawPreview();
  });
  return node;
}
function fText(obj, key, label, ph, hint){
  var i = el('input'); i.type='text'; i.value = obj[key] == null ? '' : obj[key];
  if (ph) i.placeholder = ph;
  return labelled(label, bindInput(i, obj, key), hint);
}
function fArea(obj, key, label, ph, hint){
  var t = el('textarea'); t.value = obj[key] == null ? '' : obj[key];
  if (ph) t.placeholder = ph;
  return labelled(label, bindInput(t, obj, key), hint);
}
function fNum(obj, key, label, ph, hint){
  var i = el('input'); i.type='number'; i.step='any';
  i.value = obj[key] == null ? '' : obj[key];
  if (ph) i.placeholder = ph;
  return labelled(label, bindInput(i, obj, key, {number:true}), hint);
}
function fSelect(obj, key, label, options, hint){
  var s = el('select');
  options.forEach(function(o){
    var v = (typeof o === 'string') ? o : o.v, t = (typeof o === 'string') ? o : o.t;
    var op = el('option','', t); op.value = v; s.appendChild(op);
  });
  s.value = obj[key] == null ? '' : obj[key];
  return labelled(label, bindInput(s, obj, key, {event:'change'}), hint);
}
function fDate(obj, key, label){
  var i = el('input'); i.type='date'; i.value = obj[key] || '';
  return labelled(label, bindInput(i, obj, key, {event:'change'}));
}
function fCheck(obj, key, label){
  var w = el('label','display:flex;align-items:center;gap:7px;font-size:13px;');
  var i = el('input'); i.type='checkbox'; i.checked = !!obj[key];
  w.appendChild(bindInput(i, obj, key, {event:'change', structural:true}));
  w.appendChild(document.createTextNode(label));
  return w;
}

/* ---- image field ---- */
function fImage(obj, key, label, hint, extras){
  var wrap = el('div');
  wrap.className = 'span2';
  var i = el('input'); i.type='file'; i.accept='image/*';
  i.addEventListener('change', function(){
    var f = i.files && i.files[0];
    if (!f) return;
    ingestImage(f).then(function(a){ obj[key] = a; save(); renderAll(); })
                  .catch(function(e){ alert(e.message); });
  });
  wrap.appendChild(labelled(label, i, hint));
  if (obj[key]){
    var row = el('div','display:flex;gap:12px;align-items:flex-start;margin-top:9px;');
    var th = el('div'); th.className='thumb';
    var im = el('img'); im.src = obj[key].dataUrl; im.alt = label + ' preview';
    th.appendChild(im); row.appendChild(th);
    var info = el('div','font-size:12px;color:var(--ink-2);line-height:1.55;flex:1;');
    info.appendChild(el('div','', obj[key].w + '×' + obj[key].h + ' px'));
    info.appendChild(el('div', obj[key].lowRes ? 'color:var(--warn);font-weight:600' : '',
      (obj[key].alpha ? 'Transparent' : 'Opaque') + (obj[key].lowRes ? ' · will print soft' : '')));
    var bar = el('div','display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;');
    if (extras && extras.knockout){
      var kb = el('button','', 'Remove white background'); kb.className='btn sm'; kb.type='button';
      kb.onclick = function(){
        kb.disabled = true; kb.textContent = 'Working…';
        knockoutWhite(obj[key], 30).then(function(a){ obj[key]=a; save(); renderAll(); })
          .catch(function(){ kb.textContent='Could not process'; kb.disabled=false; });
      };
      bar.appendChild(kb);
    }
    var rb = el('button','', 'Remove'); rb.className='btn sm'; rb.type='button';
    rb.onclick = function(){ obj[key] = null; save(); renderAll(); };
    bar.appendChild(rb);
    info.appendChild(bar);
    row.appendChild(info);
    wrap.appendChild(row);

    if (extras && extras.focal){
      var fl = el('div','margin-top:10px;');
      fl.appendChild(el('div','font-size:12px;color:var(--ink-2);margin-bottom:4px;',
        'Focal point — what stays in frame when the photo is cropped to the cover.'));
      var sliders = el('div','display:flex;gap:14px;');
      [['focalX','Horizontal'],['focalY','Vertical']].forEach(function(p){
        var lb = el('label','flex:1;font-size:11px;color:var(--ink-3);');
        lb.appendChild(document.createTextNode(p[1]));
        var r = el('input'); r.type='range'; r.min=0; r.max=1; r.step=0.01;
        r.value = S.assets[p[0]];
        /* Preview-only repaint: the form must survive the whole drag. */
        r.addEventListener('input', function(){
          S.assets[p[0]] = parseFloat(r.value); save(); drawPreview();
        });
        lb.appendChild(r);
        sliders.appendChild(lb);
      });
      fl.appendChild(sliders);
      wrap.appendChild(fl);
    }
  }
  return wrap;
}

/* ---- generic table editor ----
   cols: [{k:'key', t:'Header', type:'text'|'num'|'select'|'check', opts:[], w:'90px',
           calc:function(row,i){return string}}]  */
function tableEditor(rows, cols, opts){
  opts = opts || {};
  var wrap = el('div');
  var tw = el('div'); tw.className = 'tblwrap';
  var t = el('table'); t.className = 'ed';
  var thead = el('thead'), htr = el('tr');
  cols.forEach(function(c){ htr.appendChild(el('th', c.w ? 'width:'+c.w : '', c.t)); });
  if (!opts.fixed) htr.appendChild(el('th','width:1%',''));
  thead.appendChild(htr); t.appendChild(thead);

  var tb = el('tbody');
  rows.forEach(function(row, idx){
    var tr = el('tr');
    cols.forEach(function(c){
      var td = el('td');
      if (c.calc){
        td.className = 'calc';
        td.textContent = c.calc(row, idx);
      } else if (c.type === 'select'){
        var s = el('select');
        c.opts.forEach(function(o){ var op = el('option','', o); op.value = o; s.appendChild(op); });
        s.value = row[c.k] == null ? '' : row[c.k];
        s.addEventListener('change', function(){
          row[c.k] = s.value; save();
          if (opts.recalc) renderAll(); else drawPreview();
        });
        td.appendChild(s);
      } else if (c.type === 'check'){
        var cb = el('input'); cb.type='checkbox'; cb.checked = !!row[c.k];
        cb.style.margin = '6px 8px';
        cb.addEventListener('change', function(){ row[c.k] = cb.checked; save(); drawPreview(); });
        td.appendChild(cb);
      } else {
        var i = el('input');
        i.type = c.type === 'num' ? 'number' : 'text';
        if (c.type === 'num') i.step = 'any';
        i.value = row[c.k] == null ? '' : row[c.k];
        if (c.ph) i.placeholder = c.ph;
        i.addEventListener('input', function(){
          row[c.k] = c.type === 'num' ? (i.value === '' ? null : num(i.value)) : i.value;
          save();
          if (opts.recalc) recalcCells(t, rows, cols);
          drawPreview();
        });
        td.appendChild(i);
      }
      tr.appendChild(td);
    });
    if (!opts.fixed){
      var ad = el('td'); ad.className='act';
      var b = el('button','', '×'); b.className='rowdel'; b.type='button';
      b.title = 'Delete row';
      b.onclick = function(){ rows.splice(idx,1); save(); renderAll(); };
      ad.appendChild(b); tr.appendChild(ad);
    }
    tb.appendChild(tr);
  });
  t.appendChild(tb); tw.appendChild(t); wrap.appendChild(tw);

  if (!opts.fixed){
    var bar = el('div'); bar.className = 'tblbar';
    var add = el('button','', opts.addLabel || '+ Add row'); add.className='btn sm'; add.type='button';
    add.onclick = function(){
      var blank = {};
      cols.forEach(function(c){ if (!c.calc) blank[c.k] = (c.type==='num'? null : (c.type==='check'? false : '')); });
      if (opts.onAdd) opts.onAdd(blank, rows.length);
      rows.push(blank); save(); renderAll();
    };
    bar.appendChild(add);
    if (opts.extraButtons) opts.extraButtons.forEach(function(b){ bar.appendChild(b); });
    if (rows.length) bar.appendChild(el('span','font-size:12px;color:var(--ink-3)', rows.length + ' rows'));
    wrap.appendChild(bar);
  }
  return wrap;
}
/* Recompute only the calculated cells, so typing never rebuilds the row. */
function recalcCells(table, rows, cols){
  var body = table.tBodies[0];
  for (var r = 0; r < body.rows.length; r++){
    var ci = 0;
    for (var c = 0; c < cols.length; c++){
      if (cols[c].calc) body.rows[r].cells[c].textContent = cols[c].calc(rows[r], r);
    }
  }
}

function btn(text, fn, cls){
  var b = el('button','', text); b.className = 'btn sm' + (cls ? ' ' + cls : ''); b.type='button';
  b.onclick = fn; return b;
}
function card(title, hint){
  var f = el('fieldset');
  f.appendChild(el('legend','', title));
  if (hint) f.appendChild(el('p','', hint)).className = 'hint';
  return f;
}
function gridOf(nodes, two){
  var g = el('div'); g.className = 'grid' + (two ? ' g2' : '');
  nodes.forEach(function(n){ if (n) g.appendChild(n); });
  return g;
}
function fillMonths(list, fy, key){
  var labels = fyMonths(fy);
  if (list.length === 12) { labels.forEach(function(l,i){ list[i].month = l; }); return; }
  list.length = 0;
  labels.forEach(function(l){ var o = { month:l }; o[key] = null; list.push(o); });
}

/* ---- navigation ---- */
function completion(sec){
  var d;
  switch (sec.id){
    case 'cover': return (S.company.name && S.company.addr1) ? 'on' : (S.company.name ? 'part' : '');
    case 'team': return S.team.plant.length ? 'on' : 'part';
    case 'ledger': return S.ledger.length ? (rollUp(S.ledger).draft ? 'part' : 'on') : '';
    case 'production': return S.production.intro ? 'on' : '';
    case 'baseline': return S.baseline.elec.some(function(r){ return num(r.kwh); }) ? 'on' : '';
    case 'water': return S.baseline.water.length ? 'on' : '';
    case 'bills': return S.bills.length ? 'on' : '';
    /* Amber until every bill has been looked at by a person. */
    case 'verify': return S.bills.length ? (billsProgress().left ? 'part' : 'on') : '';
    case 'custom': return S.custom && S.custom.length ? 'on' : '';
    case 'dist': return (S.dist.motors.length || S.dist.pcc.length) ? 'on' : '';
    case 'tr': return S.tr.capacity ? 'on' : '';
    case 'sld': return (S.sld.nodes.length || S.assets.sldImage) ? 'on' : '';
    case 'instruments': return 'on';
    /* Sections that need no input of their own - defaults or pure roll-ups. */
    case 'frontText': case 'certificate': case 'summary': case 'ghg': case 'imports': return 'on';
    case 'costs': return S.costs.unitRate ? 'on' : 'part';
    default:
      d = S[sec.id];
      if (Array.isArray(d)) return d.length ? 'on' : '';
      if (d && typeof d === 'object') return Object.keys(d).some(function(k){
        var v = d[k]; return Array.isArray(v) ? v.length : (v !== null && v !== '' && v !== undefined);
      }) ? 'on' : '';
      return '';
  }
}
function renderNav(){
  var nav = q('nav'); clear(nav);
  var group = null;
  SECTIONS.forEach(function(sec){
    if (sec.group !== group){ group = sec.group; nav.appendChild(el('div','', group)).className='navgroup'; }
    var on = sectionOn(sec);
    var b = el('button'); b.className = 'navitem' + (on ? '' : ' off'); b.type='button';
    if (S.active === sec.id) b.setAttribute('aria-current','true');
    var dot = el('span'); dot.className = 'dot ' + (on ? completion(sec) : '');
    b.appendChild(dot);
    b.appendChild(document.createTextNode(sec.title));
    if (sec.opt){
      var t = el('span','', on ? 'on' : 'off'); t.className='tog';
      b.appendChild(t);
    }
    b.onclick = function(){ S.active = sec.id; save(); renderAll(); };
    nav.appendChild(b);
  });
}
