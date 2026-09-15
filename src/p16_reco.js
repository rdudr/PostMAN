/* ===================================================================
   RECOMMENDATIONS - the model, the arithmetic, the editor, the print.

   Every chapter of the report ends with its recommendations. Each one is
   a small document of its own: a title, what was observed, what to do,
   optionally photographs (a normal one and a thermal one side by side),
   a graph, a table of the assessor's own figures - and then the benefit,
   worked out in the open so a reader can check it.

   The names below are the names used everywhere: on the form, in the
   printed formula block, and in this file. If a label on screen and a
   field here ever disagree, this file is the one that is right.

   ------------------------------------------------------------------
   THE ARITHMETIC
   ------------------------------------------------------------------
   Technical benefit, electrical
     savingKw            kW saved while the measure is in effect
     hoursPerDay         hours per day the measure is in effect
     daysPerYear         working days per year
     dailySavingKwh    = savingKw x hoursPerDay                  (kWh/day)
     annualSavingKwh   = dailySavingKwh x daysPerYear            (kWh/year)
     annualConsumptionKwh  is context only - it gives the % saving

   Technical benefit, thermal - one block per fuel source, in its own unit
     unit                kg, litre or scm
     savingPerHour       units of fuel saved per hour
     hoursPerDay, daysPerYear as above
     dailySaving       = savingPerHour x hoursPerDay              (unit/day)
     annualSaving      = dailySaving x daysPerYear                (unit/year)

   Monetary benefit
     electricalRate      rupees per kWh
     ratePerUnit         rupees per unit of that fuel, on each thermal source
     electricalSavingInr = annualSavingKwh x electricalRate
     thermalSavingInr    = sum over sources of annualSaving x ratePerUnit
     totalSavingInr      = electricalSavingInr + thermalSavingInr

   Payback
     investmentInr       rupees
     paybackMonths     = investmentInr / totalSavingInr x 12
   =================================================================== */

var THERMAL_UNITS = [
  { v:'kg',    t:'kg  (coal, briquette, LPG)' },
  { v:'litre', t:'litre  (LDO, diesel, FO)' },
  { v:'scm',   t:'scm  (natural gas)' }
];

/* A fresh recommendation, with every field present so the editor never
   has to guard against a missing key. */
function newReco(moduleId){
  return {
    id: uid(), module: moduleId || 'other',
    title: '', observation: '', recommendation: '',
    status: 'draft', priority: 'medium', actionBy: 'Plant',

    /* attachments - each switched on by its own checkbox */
    withPhotos: false, photoNormal: null, photoThermal: null,
    photoNormalCap: 'Site photograph', photoThermalCap: 'Thermal image',
    withGraph: false, graph: null, graphCap: '',
    withTable: false, table: { head: ['Parameter', 'Value'], rows: [['', '']] },

    /* technical benefit */
    electrical: { on:false, annualConsumptionKwh:null, savingKw:null, hoursPerDay:null, daysPerYear:null },
    thermal: [],                       /* newThermalSource() entries */

    /* monetary benefit and payback */
    electricalRate: null,              /* rupees per kWh; blank means "use the cost register" */
    investmentInr: null,
    co2: null,

    /* legacy fields kept in step by syncRecoTotals, so every older reader
       of the ledger (the certificate, the summary table, the jet module)
       keeps working without knowing about the structure above */
    type: 'electrical', consumption: null, unit: 'kWh/yr',
    saving: null, monetary: null, investment: null
  };
}

function newThermalSource(){
  return { id: uid(), source: '', unit: 'kg', savingPerHour: null,
           hoursPerDay: null, daysPerYear: null, ratePerUnit: null };
}

/* Rows written before this model existed carry only the flat fields.
   Fill in the structure so the editor can show them, without inventing a
   kW x hours breakdown that was never recorded - the flat annual figure is
   kept and used directly (see recoBenefits). */
function normalizeReco(r){
  var d = newReco(r.module);
  Object.keys(d).forEach(function(k){
    if (r[k] === undefined) r[k] = d[k];
  });
  if (!r.electrical) r.electrical = d.electrical;
  if (!Array.isArray(r.thermal)) r.thermal = [];
  if (!r.table || !Array.isArray(r.table.rows)) r.table = d.table;
  /* A legacy electrical row with a saving switches its block on so the
     figure prints; a legacy thermal row becomes one thermal source. */
  if (!r._migrated){
    if (r.type === 'electrical' && num(r.saving) !== null) r.electrical.on = true;
    if (r.type === 'thermal' && num(r.saving) !== null && !r.thermal.length){
      var ts = newThermalSource();
      ts.source = r.unit ? r.unit.replace(/\/yr$/, '') : 'Fuel';
      ts.unit = /l|ltr|litre/i.test(r.unit||'') ? 'litre' : /scm/i.test(r.unit||'') ? 'scm' : 'kg';
      ts._legacyAnnual = num(r.saving);
      r.thermal.push(ts);
    }
    r._migrated = true;
  }
  return r;
}

function unitRateDefault(){ return num(S.costs && S.costs.unitRate); }

/* ------------------------------------------------------------------
   All the derived figures for one recommendation, computed from the
   inputs and never stored. Every consumer - the form, the printed page,
   the ledger roll-up - reads from here, so there is one arithmetic.
   ------------------------------------------------------------------ */
function recoBenefits(r){
  normalizeReco(r);
  var e = r.electrical;
  var out = {
    electrical: null, thermal: [],
    electricalSavingInr: 0, thermalSavingInr: 0, totalSavingInr: 0,
    annualKwh: 0, thermalTotals: {},          /* unit -> annual quantity */
    paybackMonths: null, pctSaving: null,
    rate: num(r.electricalRate) !== null ? num(r.electricalRate) : unitRateDefault()
  };

  /* --- electrical --- */
  if (e && e.on){
    var kw = num(e.savingKw), h = num(e.hoursPerDay), d = num(e.daysPerYear);
    var daily = (kw !== null && h !== null) ? kw * h : null;
    var annual = (daily !== null && d !== null) ? daily * d : null;
    /* A legacy row supplied its annual figure directly. */
    if (annual === null && kw === null && h === null && num(r.saving) !== null) annual = num(r.saving);
    var cons = num(e.annualConsumptionKwh);
    if (cons === null) cons = num(r.consumption);
    out.electrical = {
      savingKw: kw, hoursPerDay: h, daysPerYear: d,
      dailySavingKwh: daily, annualSavingKwh: annual,
      annualConsumptionKwh: cons,
      pctSaving: (annual !== null && cons) ? (annual / cons) * 100 : null,
      rate: out.rate,
      savingInr: (annual !== null && out.rate !== null) ? annual * out.rate : null
    };
    out.annualKwh = annual || 0;
    out.electricalSavingInr = out.electrical.savingInr || 0;
    out.pctSaving = out.electrical.pctSaving;
  }

  /* --- thermal, one entry per source --- */
  (r.thermal || []).forEach(function(t){
    var sph = num(t.savingPerHour), h = num(t.hoursPerDay), d = num(t.daysPerYear), rate = num(t.ratePerUnit);
    var daily = (sph !== null && h !== null) ? sph * h : null;
    var annual = (daily !== null && d !== null) ? daily * d : null;
    if (annual === null && sph === null && t._legacyAnnual != null) annual = t._legacyAnnual;
    var inr = (annual !== null && rate !== null) ? annual * rate : null;
    out.thermal.push({
      id: t.id, source: t.source || 'Fuel', unit: t.unit || 'kg',
      savingPerHour: sph, hoursPerDay: h, daysPerYear: d,
      dailySaving: daily, annualSaving: annual, ratePerUnit: rate, savingInr: inr
    });
    if (annual !== null) out.thermalTotals[t.unit || 'kg'] = (out.thermalTotals[t.unit || 'kg'] || 0) + annual;
    out.thermalSavingInr += inr || 0;
  });

  out.totalSavingInr = out.electricalSavingInr + out.thermalSavingInr;

  /* --- payback --- */
  var inv = num(r.investmentInr);
  if (inv === null) inv = num(r.investment);
  out.investmentInr = inv;
  if (inv !== null && inv > 0 && out.totalSavingInr > 0) out.paybackMonths = (inv / out.totalSavingInr) * 12;
  else if (inv !== null && inv <= 0 && out.totalSavingInr > 0) out.paybackMonths = 0;

  return out;
}

/* Write the totals back into the flat fields every older reader uses.
   Called after any edit, so the certificate, the summary table and the
   module pages all see the same number the form shows. */
function syncRecoTotals(r){
  var b = recoBenefits(r);
  var hasE = !!(r.electrical && r.electrical.on), hasT = (r.thermal || []).length > 0;
  r.type = hasE && hasT ? 'both' : hasT ? 'thermal' : 'electrical';
  if (hasE){
    r.saving = b.annualKwh || null; r.unit = 'kWh/yr';
    r.consumption = b.electrical ? b.electrical.annualConsumptionKwh : r.consumption;
  } else if (hasT){
    var units = Object.keys(b.thermalTotals);
    r.saving = units.length ? b.thermalTotals[units[0]] : null;
    r.unit = units.length ? units[0] + '/yr' : r.unit;
  }
  r.monetary = b.totalSavingInr > 0 ? Math.round(b.totalSavingInr) : (num(r.monetary) !== null && !hasE && !hasT ? r.monetary : null);
  r.investment = b.investmentInr;
  r.elecMoney = Math.round(b.electricalSavingInr);
  r.thermalMoney = Math.round(b.thermalSavingInr);
  r.elecKwh = Math.round(b.annualKwh);
  r.thermalQty = Object.keys(b.thermalTotals).reduce(function(a, k){ return a + b.thermalTotals[k]; }, 0);
  return b;
}

/* ------------------------------------------------------------------
   THE EDITOR
   Computed cells update as you type; the form itself is only rebuilt on
   a structural change (a source added, a photo replaced), because a form
   rebuilt mid-keystroke loses the cursor.
   ------------------------------------------------------------------ */
function fmtKwh(v){ return v === null || v === undefined ? '—' : inr(Math.round(v)) + ' kWh'; }
function fmtQty(v, unit){ return v === null || v === undefined ? '—' : inr(Math.round(v)) + ' ' + unit; }

/* A read-only computed cell that a refresher can update in place. */
function calcCell(label, hint){
  var l = el('label');
  l.appendChild(el('span','', label)).className = 'lab';
  var v = el('div','padding:7px 10px;border:1px dashed var(--line);border-radius:6px;background:var(--panel-2);' +
    'font-family:"IBM Plex Mono",monospace;font-size:13px;color:var(--ink);min-height:32px;', '—');
  l.appendChild(v);
  if (hint) l.appendChild(el('span','', hint)).className = 'sub';
  l._val = v;
  return l;
}
function subhead(text, tone){
  var d = el('div','margin:14px 0 8px;padding:6px 10px;border-radius:6px;font-size:12px;font-weight:600;' +
    'letter-spacing:.02em;background:' + (tone === 'money' ? 'var(--ok-soft)' : tone === 'pay' ? 'var(--warn-soft)' : 'var(--brand-soft)') +
    ';color:var(--ink);', text);
  return d;
}

/* One numeric field whose edit triggers the refresher rather than a rebuild. */
function fNumLive(obj, key, label, ph, hint, refresh){
  var i = el('input'); i.type='number'; i.step='any';
  i.value = obj[key] == null ? '' : obj[key];
  if (ph) i.placeholder = ph;
  i.addEventListener('input', function(){
    obj[key] = i.value === '' ? null : num(i.value);
    refresh(); save(); drawPreview();
  });
  return labelled(label, i, hint);
}

function recoEditor(r, idx, opts){
  opts = opts || {};
  normalizeReco(r);
  var box = el('div'); box.className = 'rec ' + (r.type === 'both' ? 'electrical' : r.type);
  box.style.padding = '14px 16px 16px';

  /* ---- header ---- */
  var h = el('h4');
  h.appendChild(document.createTextNode((idx + 1) + '. ' + (r.title || 'Untitled recommendation')));
  var pill = el('span','', r.status === 'verified' ? 'verified' : 'draft');
  pill.className = 'pill ' + (r.status === 'verified' ? 'ok' : 'draft');
  h.appendChild(pill);
  var headline = el('span','margin-left:auto;font-family:"IBM Plex Mono",monospace;font-size:11px;color:var(--ink-3)');
  h.appendChild(headline);
  box.appendChild(h);

  /* ---- identity ---- */
  var idGrid = [
    fText(r,'title','Title','Reduce excess air in the boiler', 'Printed as the recommendation heading.'),
    fSelect(r,'status','Status', [{v:'draft',t:'Draft'},{v:'verified',t:'Verified'}]),
    fSelect(r,'priority','Priority', ['critical','high','medium','low']),
    fText(r,'actionBy','Action by','Plant / Vendor')
  ];
  if (!opts.fixedModule)
    idGrid.unshift(fSelect(r,'module','Chapter',
      RECO_CHAPTERS.concat(RECO_CHAPTERS.indexOf(r.module) < 0 ? [r.module] : [])
        .map(function(k){ return {v:k,t:MODULE_NAMES[k] || k}; })));
  box.appendChild(gridOf(idGrid, true));
  box.appendChild(fArea(r,'observation','Observation','What was measured, and what it means.'));
  box.appendChild(fArea(r,'recommendation','Recommendation','What to do, and what it will change.'));

  /* ---- attachments ---- */
  box.appendChild(subhead('Attachments — tick what this recommendation carries'));
  var ticks = el('div','display:flex;gap:18px;flex-wrap:wrap;margin-bottom:6px;');
  ticks.appendChild(fCheck(r,'withPhotos','Photographs — normal and thermal, side by side'));
  ticks.appendChild(fCheck(r,'withGraph','Graph / single photograph'));
  ticks.appendChild(fCheck(r,'withTable','Table of figures'));
  box.appendChild(ticks);

  if (r.withPhotos){
    var pg = gridOf([
      fImage(r,'photoNormal','Normal photograph'),
      fImage(r,'photoThermal','Thermal image'),
      fText(r,'photoNormalCap','Caption — normal'),
      fText(r,'photoThermalCap','Caption — thermal')
    ], true);
    box.appendChild(pg);
  }
  if (r.withGraph){
    box.appendChild(gridOf([ fImage(r,'graph','Graph or photograph'), fText(r,'graphCap','Caption') ], true));
  }
  if (r.withTable) box.appendChild(recoTableEditor(r.table));

  /* ---- technical benefit ---- */
  box.appendChild(subhead('Technical benefit — energy saved'));
  var tb = el('div','display:flex;gap:18px;flex-wrap:wrap;margin-bottom:6px;');
  tb.appendChild(fCheck(r.electrical,'on','Electrical'));
  var addT = btn('+ Add thermal source', function(){ r.thermal.push(newThermalSource()); save(); renderAll(); });
  tb.appendChild(addT);
  box.appendChild(tb);

  var cells = {};    /* computed cells, refreshed on every keystroke */
  function refresh(){
    var b = syncRecoTotals(r);
    if (cells.eDaily)  cells.eDaily._val.textContent  = fmtKwh(b.electrical && b.electrical.dailySavingKwh) .replace('kWh','kWh/day');
    if (cells.eAnnual) cells.eAnnual._val.textContent = fmtKwh(b.electrical && b.electrical.annualSavingKwh).replace('kWh','kWh/year');
    if (cells.ePct)    cells.ePct._val.textContent    = b.pctSaving === null ? '—' : fix(b.pctSaving, 2) + ' % of consumption';
    b.thermal.forEach(function(t){
      var c = cells['t' + t.id]; if (!c) return;
      c.daily._val.textContent  = fmtQty(t.dailySaving, t.unit + '/day');
      c.annual._val.textContent = fmtQty(t.annualSaving, t.unit + '/year');
      c.money._val.textContent  = t.savingInr === null ? '—' : rupees(t.savingInr) + ' /year';
    });
    if (cells.mElec)  cells.mElec._val.textContent  = b.electrical && b.electrical.savingInr !== null ? rupees(b.electrical.savingInr) + ' /year' : '—';
    if (cells.mTherm) cells.mTherm._val.textContent = b.thermal.length ? rupees(b.thermalSavingInr) + ' /year' : '—';
    if (cells.mTotal) cells.mTotal._val.textContent = b.totalSavingInr > 0 ? rupees(b.totalSavingInr) + ' /year' : '—';
    if (cells.pay)    cells.pay._val.textContent    = b.paybackMonths === null ? '—' : months(b.paybackMonths);
    headline.textContent = (b.totalSavingInr > 0 ? rupees(b.totalSavingInr) + '/yr' : 'no saving yet') +
      ' · ' + (b.paybackMonths === null ? '—' : months(b.paybackMonths));
  }

  if (r.electrical.on){
    var e = r.electrical;
    cells.eDaily = calcCell('Daily saving', 'saving in kW × operating hours per day');
    cells.eAnnual = calcCell('Annual saving', 'daily saving × working days per year');
    cells.ePct = calcCell('Share of consumption', 'annual saving ÷ annual consumption');
    box.appendChild(el('div','font-size:12px;font-weight:600;margin:6px 0 4px;color:var(--ink-2)', 'Electrical'));
    box.appendChild(gridOf([
      fNumLive(e,'annualConsumptionKwh','Annual consumption', '5104212', 'kWh per year, for the % saving', refresh),
      fNumLive(e,'savingKw','Saving in unit', '12.6', 'kW saved while the measure is in effect', refresh),
      fNumLive(e,'hoursPerDay','Operation per day', '24', 'hours per day', refresh),
      cells.eDaily,
      fNumLive(e,'daysPerYear','Working days per annum', String(num(S.costs && S.costs.days) || 350), 'days', refresh),
      cells.eAnnual,
      cells.ePct
    ]));
  }

  r.thermal.forEach(function(t, ti){
    var c = cells['t' + t.id] = {
      daily: calcCell('Daily saving', 'saving per hour × operating hours per day'),
      annual: calcCell('Annual saving', 'daily saving × working days per year'),
      money: calcCell('Monetary saving', 'annual saving × rate per unit')
    };
    var hd = el('div','display:flex;align-items:center;gap:10px;margin:8px 0 4px;');
    hd.appendChild(el('div','font-size:12px;font-weight:600;color:var(--ink-2)', 'Thermal source ' + (ti + 1)));
    hd.appendChild(btn('Remove source', function(){ r.thermal.splice(ti, 1); save(); renderAll(); }));
    box.appendChild(hd);
    box.appendChild(gridOf([
      fText(t,'source','Fuel / source','Coal, LDO, PNG…'),
      fSelect(t,'unit','Unit of thermal', THERMAL_UNITS),
      fNumLive(t,'savingPerHour','Saving in unit', '38', 'units of fuel saved per hour', refresh),
      fNumLive(t,'hoursPerDay','Operation per day', '24', 'hours per day', refresh),
      c.daily,
      fNumLive(t,'daysPerYear','Working days per annum', String(num(S.costs && S.costs.days) || 350), 'days', refresh),
      c.annual,
      fNumLive(t,'ratePerUnit','Thermal rate', '', 'rupees per ' + (t.unit || 'unit'), refresh),
      c.money
    ]));
  });
  /* The unit select rebuilds so its hint and the printed unit follow it. */
  box.querySelectorAll('select').forEach(function(s){
    s.addEventListener('change', function(){ refresh(); });
  });

  /* ---- monetary benefit ---- */
  box.appendChild(subhead('Monetary benefit — rupees saved', 'money'));
  cells.mElec = calcCell('Electrical saving', 'annual kWh × unit rate');
  cells.mTherm = calcCell('Thermal saving', 'sum over sources of annual quantity × rate');
  cells.mTotal = calcCell('Total annual saving', 'electrical + thermal');
  var rateDefault = unitRateDefault();
  box.appendChild(gridOf([
    fNumLive(r,'electricalRate','Unit rate — electrical', rateDefault === null ? '8.40' : String(rateDefault),
      rateDefault === null ? 'rupees per kWh' : 'rupees per kWh; blank uses the cost register (' + rateDefault + ')', refresh),
    cells.mElec, cells.mTherm, cells.mTotal
  ]));

  /* ---- payback ---- */
  box.appendChild(subhead('Payback', 'pay'));
  cells.pay = calcCell('Simple payback', 'investment ÷ total annual saving × 12');
  box.appendChild(gridOf([
    fNumLive(r,'investmentInr','Investment', '225000', 'rupees, one-off', refresh),
    cells.pay,
    fNumLive(r,'co2','CO₂ reduction', '', 'tCO₂e per year, if known', refresh)
  ]));

  /* ---- footer ---- */
  var bar = el('div','display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;');
  bar.appendChild(btn('Estimate CO₂ from electrical saving', function(){
    var ef = num(S.costs && S.costs.gridEF), b = recoBenefits(r);
    if (ef && b.annualKwh){ r.co2 = +((b.annualKwh / 1000) * ef).toFixed(2); save(); renderAll(); }
    else alert('Needs an electrical annual saving and a grid emission factor in the cost register.');
  }));
  bar.appendChild(btn('Delete recommendation', function(){
    if (!confirm('Delete this recommendation?')) return;
    var i = S.ledger.indexOf(r); if (i >= 0) S.ledger.splice(i, 1);
    save(); renderAll();
  }));
  box.appendChild(bar);

  refresh();
  return box;
}

/* A small editable grid with add/remove for both rows and columns. */
function recoTableEditor(tbl){
  var wrap = el('div','margin:6px 0 4px;');
  var tw = el('div'); tw.className = 'tblwrap';
  var t = el('table'); t.className = 'ed';
  var thead = el('thead'), htr = el('tr');
  tbl.head.forEach(function(hv, ci){
    var th = el('th');
    var i = el('input'); i.type = 'text'; i.value = hv; i.placeholder = 'Column ' + (ci + 1);
    i.style.fontWeight = '600';
    i.addEventListener('input', function(){ tbl.head[ci] = i.value; save(); drawPreview(); });
    th.appendChild(i);
    htr.appendChild(th);
  });
  htr.appendChild(el('th','width:1%',''));
  thead.appendChild(htr); t.appendChild(thead);
  var tb = el('tbody');
  tbl.rows.forEach(function(row, ri){
    var tr = el('tr');
    tbl.head.forEach(function(_, ci){
      var td = el('td');
      var i = el('input'); i.type = 'text'; i.value = row[ci] == null ? '' : row[ci];
      i.addEventListener('input', function(){ row[ci] = i.value; save(); drawPreview(); });
      td.appendChild(i); tr.appendChild(td);
    });
    var ad = el('td'); ad.className = 'act';
    var b = el('button','', '×'); b.className = 'rowdel'; b.type = 'button'; b.title = 'Delete row';
    b.onclick = function(){ tbl.rows.splice(ri, 1); save(); renderAll(); };
    ad.appendChild(b); tr.appendChild(ad);
    tb.appendChild(tr);
  });
  t.appendChild(tb); tw.appendChild(t); wrap.appendChild(tw);

  var bar = el('div'); bar.className = 'tblbar';
  bar.appendChild(btn('+ Add row', function(){
    tbl.rows.push(tbl.head.map(function(){ return ''; })); save(); renderAll();
  }));
  bar.appendChild(btn('+ Add column', function(){
    tbl.head.push(''); tbl.rows.forEach(function(r){ r.push(''); }); save(); renderAll();
  }));
  bar.appendChild(btn('– Remove last column', function(){
    if (tbl.head.length <= 1) return;
    tbl.head.pop(); tbl.rows.forEach(function(r){ r.pop(); }); save(); renderAll();
  }));
  bar.appendChild(el('span','font-size:12px;color:var(--ink-3)', tbl.rows.length + ' rows × ' + tbl.head.length + ' columns'));
  wrap.appendChild(bar);
  return wrap;
}

/* The recommendations belonging to one chapter, with an add button.
   Rendered at the foot of every chapter's own screen, and once per
   chapter on the ledger screen. */
function chapterRecoCard(w, moduleId, opts){
  opts = opts || {};
  var rows = S.ledger.filter(function(r){ return r.module === moduleId; });
  var c = card('Recommendations — ' + (MODULE_NAMES[moduleId] || moduleId),
    rows.length ? rows.length + ' in this chapter. Each prints at the end of the chapter with its own heading, figures and payback.'
                : 'None yet for this chapter.');
  c.appendChild(btn('+ Add recommendation to this chapter', function(){
    var r = newReco(moduleId); S.ledger.push(r); save(); renderAll();
    setTimeout(function(){ var n = document.getElementById('reco-' + r.id); if (n) n.scrollIntoView({ behavior:'smooth', block:'start' }); }, 50);
  }, 'primary'));
  w.appendChild(c);
  rows.forEach(function(r){
    var idx = S.ledger.indexOf(r);
    var ed = recoEditor(r, idx, { fixedModule: !opts.showModule });
    ed.id = 'reco-' + r.id;
    w.appendChild(ed);
  });
}

/* ------------------------------------------------------------------
   THE PRINT - every chapter ends with this, drawn from the ledger.
   ------------------------------------------------------------------ */
function recoBlocks(B, r, n){
  var b = syncRecoTotals(r);
  B.push(blk(bH(3, n + '. ' + (r.title || r.recommendation || 'Recommendation'))));
  if (r.observation){
    B.push(blk(bP('Observation', { bold:true, size:10 })));
    B.push(blk(bP(r.observation)));
  }
  if (r.recommendation){
    B.push(blk(bP('Recommendation', { bold:true, size:10 })));
    B.push(blk(bP(r.recommendation)));
  }
  if (r.withPhotos && (r.photoNormal || r.photoThermal))
    B.push(blk(bImgPair(r.photoNormal, r.photoThermal, r.photoNormalCap, r.photoThermalCap)));
  if (r.withGraph && r.graph) B.push(blk(bImg(r.graph, r.graphCap || '', 230)));
  if (r.withTable && r.table && r.table.rows.length){
    var head = r.table.head.some(function(x){ return x; }) ? r.table.head : null;
    B.push(tblBlock(head, r.table.rows.map(function(row){ return row.map(function(v){ return v == null ? '' : v; }); }), { size:9 }));
  }

  /* --- technical benefit --- */
  var lines = [];
  if (b.electrical){
    var e = b.electrical;
    lines.push('TECHNICAL BENEFIT — ELECTRICAL');
    if (e.annualConsumptionKwh !== null) lines.push('  Annual consumption          = ' + inr(Math.round(e.annualConsumptionKwh)) + ' kWh/year');
    if (e.savingKw !== null){
      lines.push('  Saving                      = ' + fix(e.savingKw, 2) + ' kW');
      lines.push('  Operation per day           = ' + fix(e.hoursPerDay, 1) + ' hr');
      lines.push('  Daily saving                = ' + fix(e.savingKw, 2) + ' × ' + fix(e.hoursPerDay, 1) + ' = ' + inr(Math.round(e.dailySavingKwh || 0)) + ' kWh/day');
      lines.push('  Working days per annum      = ' + fix(e.daysPerYear, 0));
      lines.push('  Annual saving               = ' + inr(Math.round(e.dailySavingKwh || 0)) + ' × ' + fix(e.daysPerYear, 0) + ' = ' + inr(Math.round(e.annualSavingKwh || 0)) + ' kWh/year');
    } else if (e.annualSavingKwh !== null){
      lines.push('  Annual saving               = ' + inr(Math.round(e.annualSavingKwh)) + ' kWh/year');
    }
    if (e.pctSaving !== null) lines.push('  Share of consumption        = ' + fix(e.pctSaving, 2) + ' %');
  }
  b.thermal.forEach(function(t, i){
    if (lines.length) lines.push('');
    lines.push('TECHNICAL BENEFIT — THERMAL' + (b.thermal.length > 1 ? ' ' + (i + 1) : '') + ' (' + t.source + ')');
    if (t.savingPerHour !== null){
      lines.push('  Saving                      = ' + fix(t.savingPerHour, 2) + ' ' + t.unit + '/hr');
      lines.push('  Operation per day           = ' + fix(t.hoursPerDay, 1) + ' hr');
      lines.push('  Daily saving                = ' + fix(t.savingPerHour, 2) + ' × ' + fix(t.hoursPerDay, 1) + ' = ' + inr(Math.round(t.dailySaving || 0)) + ' ' + t.unit + '/day');
      lines.push('  Working days per annum      = ' + fix(t.daysPerYear, 0));
      lines.push('  Annual saving               = ' + inr(Math.round(t.dailySaving || 0)) + ' × ' + fix(t.daysPerYear, 0) + ' = ' + inr(Math.round(t.annualSaving || 0)) + ' ' + t.unit + '/year');
    } else if (t.annualSaving !== null){
      lines.push('  Annual saving               = ' + inr(Math.round(t.annualSaving)) + ' ' + t.unit + '/year');
    }
  });
  if (lines.length) B.push(blk(bFormula(lines)));

  /* --- monetary benefit --- */
  var m = [];
  if (b.totalSavingInr > 0 || b.electrical || b.thermal.length){
    m.push('MONETARY BENEFIT');
    if (b.electrical && b.electrical.annualSavingKwh !== null)
      m.push('  Electrical: ' + inr(Math.round(b.electrical.annualSavingKwh)) + ' kWh × ₹ ' + fix(b.electrical.rate, 2) + '/kWh = ' + rupees(b.electrical.savingInr));
    b.thermal.forEach(function(t){
      if (t.annualSaving !== null)
        m.push('  ' + t.source + ': ' + inr(Math.round(t.annualSaving)) + ' ' + t.unit + ' × ₹ ' + fix(t.ratePerUnit, 2) + '/' + t.unit + ' = ' + rupees(t.savingInr));
    });
    m.push('  Total annual saving         = ' + rupees(b.totalSavingInr));
    m.push('');
    m.push('PAYBACK');
    m.push('  Investment                  = ' + rupees(b.investmentInr));
    m.push('  Simple payback              = ' + (b.paybackMonths === null ? '—' :
      rupees(b.investmentInr) + ' ÷ ' + rupees(b.totalSavingInr) + ' × 12 = ' + months(b.paybackMonths)));
    B.push(blk(bFormula(m)));
  }
}
