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
      } else if (c.type === 'month'){
        /* Month and year from menus, so a month can never be spelt two
           ways across the bills, the baseline and the modules. */
        td.appendChild(monthLabelPicker(row, c.k, opts.recalc ? function(){ recalcCells(t, rows, cols); drawPreview(); } : null));
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

function openJetCropper(imageSrc, slotTitle, onSave){
  var backdrop = el('div');
  backdrop.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:rgba(15,23,42,0.85);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;';

  var box = el('div');
  box.style.cssText = 'background:#0f172a;border:1px solid #334155;border-radius:12px;width:100%;max-width:540px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);overflow:hidden;color:#f8fafc;display:flex;flex-direction:column;font-family:sans-serif;';

  // Header
  var head = el('div');
  head.style.cssText = 'padding:12px 16px;border-bottom:1px solid #1e293b;display:flex;align-items:center;justify-content:space-between;background:rgba(2,6,23,0.6);';
  var titleDiv = el('div');
  titleDiv.appendChild(el('div','font-weight:bold;font-size:14px;color:#67e8f9;','Edit & Crop Image'));
  titleDiv.appendChild(el('div','font-size:12px;color:#94a3b8;', slotTitle || 'Jet Photograph'));
  head.appendChild(titleDiv);

  var closeBtn = el('button');
  closeBtn.type = 'button';
  closeBtn.innerHTML = '&#215;';
  closeBtn.style.cssText = 'background:none;border:none;color:#94a3b8;font-size:24px;cursor:pointer;line-height:1;padding:0 4px;margin-left:auto;';
  closeBtn.onclick = function(){ if (backdrop.parentNode) document.body.removeChild(backdrop); };
  head.appendChild(closeBtn);
  box.appendChild(head);

  // Body / Viewport
  var body = el('div');
  body.style.cssText = 'padding:16px;display:flex;flex-direction:column;align-items:center;';

  var hint = el('div','font-size:11px;color:#94a3b8;margin-bottom:8px;','Drag image to position • Scroll or use controls to zoom');
  body.appendChild(hint);

  var viewport = el('div');
  viewport.style.cssText = 'position:relative;width:100%;height:260px;background:#020617;border-radius:8px;overflow:hidden;border:2px solid rgba(6,182,212,0.5);cursor:grab;display:flex;align-items:center;justify-content:center;user-select:none;';

  // Grid overlay
  var grid = el('div');
  grid.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:10;border:1px solid rgba(6,182,212,0.3);display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr 1fr;';
  for (var i=0; i<9; i++){
    var cell = el('div');
    cell.style.cssText = 'border-right:1px solid rgba(6,182,212,0.15);border-bottom:1px solid rgba(6,182,212,0.15);';
    grid.appendChild(cell);
  }
  viewport.appendChild(grid);

  var img = document.createElement('img');
  img.src = imageSrc;
  img.style.cssText = 'max-height:100%;max-width:100%;object-fit:contain;pointer-events:none;transform-origin:center center;';
  viewport.appendChild(img);

  var zoom = 1;
  var offsetX = 0, offsetY = 0;
  var isDragging = false;
  var dragStartX = 0, dragStartY = 0;

  function updateTransform(){
    img.style.transform = 'translate(' + offsetX + 'px, ' + offsetY + 'px) scale(' + zoom + ')';
    zoomVal.textContent = Math.round(zoom * 100) + '%';
    zoomSlider.value = zoom;
  }

  viewport.onmousedown = function(e){
    isDragging = true;
    viewport.style.cursor = 'grabbing';
    dragStartX = e.clientX - offsetX;
    dragStartY = e.clientY - offsetY;
  };
  window.onmousemove = function(e){
    if (!isDragging) return;
    offsetX = e.clientX - dragStartX;
    offsetY = e.clientY - dragStartY;
    updateTransform();
  };
  window.onmouseup = function(){
    isDragging = false;
    viewport.style.cursor = 'grab';
  };

  viewport.onwheel = function(e){
    e.preventDefault();
    var delta = e.deltaY < 0 ? 0.1 : -0.1;
    zoom = Math.min(Math.max(zoom + delta, 0.5), 4);
    updateTransform();
  };

  body.appendChild(viewport);

  // Zoom controls bar
  var ctrl = el('div');
  ctrl.style.cssText = 'width:100%;margin-top:14px;display:flex;align-items:center;justify-content:space-between;gap:8px;';

  var zoomLeft = el('div');
  zoomLeft.style.cssText = 'display:flex;align-items:center;gap:6px;';

  var btnMinus = el('button'); btnMinus.type='button'; btnMinus.textContent = '−';
  btnMinus.style.cssText = 'height:28px;width:28px;background:#1e293b;border:1px solid #334155;color:#e2e8f0;border-radius:4px;cursor:pointer;font-weight:bold;';
  btnMinus.onclick = function(){ zoom = Math.max(zoom - 0.2, 0.5); updateTransform(); };

  var zoomSlider = document.createElement('input');
  zoomSlider.type = 'range'; zoomSlider.min = '0.5'; zoomSlider.max = '3.5'; zoomSlider.step = '0.05'; zoomSlider.value = '1';
  zoomSlider.style.cssText = 'width:100px;accent-color:#06b6d4;cursor:pointer;';
  zoomSlider.oninput = function(){ zoom = parseFloat(zoomSlider.value); updateTransform(); };

  var btnPlus = el('button'); btnPlus.type='button'; btnPlus.textContent = '+';
  btnPlus.style.cssText = 'height:28px;width:28px;background:#1e293b;border:1px solid #334155;color:#e2e8f0;border-radius:4px;cursor:pointer;font-weight:bold;';
  btnPlus.onclick = function(){ zoom = Math.min(zoom + 0.2, 4); updateTransform(); };

  var zoomVal = el('span','font-family:monospace;font-size:12px;color:#22d3ee;width:40px;text-align:center;','100%');

  zoomLeft.appendChild(btnMinus);
  zoomLeft.appendChild(zoomSlider);
  zoomLeft.appendChild(btnPlus);
  zoomLeft.appendChild(zoomVal);
  ctrl.appendChild(zoomLeft);

  var btnReset = el('button'); btnReset.type='button'; btnReset.textContent = 'Reset';
  btnReset.style.cssText = 'height:28px;padding:0 10px;background:#1e293b;border:1px solid #334155;color:#cbd5e1;border-radius:4px;cursor:pointer;font-size:11px;';
  btnReset.onclick = function(){ zoom = 1; offsetX = 0; offsetY = 0; updateTransform(); };
  ctrl.appendChild(btnReset);

  body.appendChild(ctrl);
  box.appendChild(body);

  // Footer
  var foot = el('div');
  foot.style.cssText = 'padding:12px 16px;border-top:1px solid #1e293b;display:flex;align-items:center;justify-content:flex-end;gap:8px;background:rgba(2,6,23,0.6);';

  var btnCancel = el('button'); btnCancel.type='button'; btnCancel.textContent = 'Cancel';
  btnCancel.style.cssText = 'padding:6px 14px;background:none;border:none;color:#94a3b8;font-size:12px;cursor:pointer;';
  btnCancel.onclick = function(){ if (backdrop.parentNode) document.body.removeChild(backdrop); };

  var btnSave = el('button'); btnSave.type='button'; btnSave.textContent = '✓ Apply & Save';
  btnSave.style.cssText = 'padding:6px 14px;background:#0891b2;border:none;color:#ffffff;font-size:12px;font-weight:bold;border-radius:6px;cursor:pointer;';
  btnSave.onclick = function(){
    var canvas = document.createElement('canvas');
    var targetW = 800, targetH = 600;
    canvas.width = targetW; canvas.height = targetH;
    var ctx = canvas.getContext('2d');
    if (ctx){
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);

      var cropBoxW = viewport.clientWidth || 320;
      var cropBoxH = viewport.clientHeight || 240;
      var scaleFactor = targetW / cropBoxW;

      ctx.save();
      ctx.translate(targetW / 2, targetH / 2);
      ctx.translate(offsetX * scaleFactor, offsetY * scaleFactor);
      ctx.scale(zoom, zoom);

      var imgAspect = (img.naturalWidth || 800) / (img.naturalHeight || 600);
      var boxAspect = cropBoxW / cropBoxH;
      var drawW = cropBoxW * scaleFactor;
      var drawH = cropBoxH * scaleFactor;
      if (imgAspect > boxAspect){
        drawH = drawW / imgAspect;
      } else {
        drawW = drawH * imgAspect;
      }

      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      if (onSave) onSave(dataUrl);
    }
    if (backdrop.parentNode) document.body.removeChild(backdrop);
  };

  foot.appendChild(btnCancel);
  foot.appendChild(btnSave);
  box.appendChild(foot);

  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
}
