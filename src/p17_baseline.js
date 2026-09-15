/* ===================================================================
   BASELINE OF PLANT ENERGY, WATER AND PRODUCTION.

   One list of months, chosen from menus rather than typed, shared by
   every baseline table so a month cannot be spelt two ways in two tables.
   Production has whatever unit the plant counts in. Electricity is the
   grid input plus any number of other sources the plant names (solar,
   turbine). Thermal is any number of fuels, each in its own unit with its
   own calorific value. Water is drawn from a named source.

   Every derived figure - TOE, specific consumption, totals, averages -
   comes from baselineCalc() and nowhere else, so the electrical table, the
   thermal table, the overall table, the water table, the charts and the
   GHG accounting all agree with each other. The sample reports, built in
   four spreadsheets, do not: their overall table gives April 57.3 TOE where
   their electrical table gives 54.

   ------------------------------------------------------------------
   THE ARITHMETIC
   ------------------------------------------------------------------
     1 TOE = 10,000,000 kcal
     1 kWh = 860 kcal            so  electrical TOE = kWh x 860 / 1e7
     fuel TOE = quantity x GCV(kcal per unit) / 1e7
       (GCV is asked per kg, litre or SCM; a fuel counted in tonnes is
        multiplied by 1,000 before the GCV is applied)

     specific consumption = quantity / production, on the chosen basis:
       per unit, per 1,000 units, or per lakh (100,000) units
     period figures in the Average row are totals over totals, never the
     mean of the monthly ratios - a month of low output would otherwise
     pull the year's figure about out of all proportion to its energy.
   =================================================================== */

var KCAL_PER_KWH = 860;
var KCAL_PER_TOE = 1e7;

var MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var FUEL_UNITS = [
  { v:'kg',    t:'kg',      per:'kg',    mult:1 },
  { v:'Ton',   t:'Ton',     per:'kg',    mult:1000 },
  { v:'Litre', t:'Litre',   per:'litre', mult:1 },
  { v:'SCM',   t:'SCM',     per:'SCM',   mult:1 }
];
var SEC_BASIS = [
  { v:1,      t:'per unit of production' },
  { v:1000,   t:'per 1,000 units' },
  { v:100000, t:'per lakh units' }
];
/* Typical gross calorific values, offered as placeholders only. */
var GCV_HINT = { coal:4000, briquette:3800, husk:3200, ldo:10500, diesel:10750, fo:9800, png:8600, lpg:11000 };

function fuelUnit(v){ for (var i = 0; i < FUEL_UNITS.length; i++) if (FUEL_UNITS[i].v === v) return FUEL_UNITS[i]; return FUEL_UNITS[0]; }

/* ---- months ---- */
function monthKey(y, m){ return y + '-' + (m < 10 ? '0' : '') + m; }
function monthLabelOf(y, m){ return MONTH_NAMES[m - 1] + '-' + String(y).slice(2); }
/* Reads "Apr-25", "Apr 25", "April 2025", "2025-04" - every spelling the
   older tables and the bill reader have produced. */
function parseMonthLabel(s){
  s = String(s || '').trim();
  var m = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (m) return { y:+m[1], m:+m[2] };
  m = /^([A-Za-z]{3,9})[\s\-,']*(\d{2,4})$/.exec(s);
  if (m){
    var mi = MONTH_NAMES.map(function(x){ return x.toLowerCase(); }).indexOf(m[1].slice(0,3).toLowerCase());
    if (mi >= 0){ var y = +m[2]; return { y: y < 100 ? 2000 + y : y, m: mi + 1 }; }
  }
  return null;
}
/* The twelve months of a financial year "2026-27": April to March. */
function fyMonthKeys(fy){
  var y = parseInt(String(fy).slice(0,4), 10);
  var out = [];
  for (var i = 0; i < 12; i++){ var m = ((3 + i) % 12) + 1; out.push({ y: m >= 4 ? y : y + 1, m: m }); }
  return out;
}

/* ---- state shape ---- */
function blankBaseline(){
  return {
    months: [],                 /* [{y, m}] in table order */
    prodUnit: 'Metre',          /* what the plant counts production in */
    secBasis: 1,                /* divisor for specific consumption */
    production: {},             /* key -> quantity */
    grid: {},                   /* key -> kWh, Grid Input Energy */
    elecSources: [],            /* [{id, name, values:{key->kWh}}] */
    fuels: [],                  /* [{id, name, unit, gcv, ef, values:{key->qty}}] */
    water: {},                  /* key -> kL */
    waterSource: 'GIDC Water',
    note: '',
    /* legacy mirrors, written by syncBaselineLegacy, read by older code */
    elec: [], thermal: [], thermalName: '', thermalUnit: ''
  };
}
function newElecSource(name){ return { id: uid(), name: name || 'Solar generation', values: {} }; }
function newFuel(name, unit, gcv){
  return { id: uid(), name: name || 'Coal', unit: unit || 'Ton', gcv: gcv || null, ef: null, values: {} };
}

/* Brings any older draft up to this shape without losing a figure. */
function normalizeBaseline(){
  var b = S.baseline, d = blankBaseline();
  Object.keys(d).forEach(function(k){ if (b[k] === undefined) b[k] = d[k]; });
  if (b._v2) return b;

  /* Older drafts held elec:[{month,kwh}] and thermal:[{month,qty}] with one
     fuel named at the top. Rebuild the month list from whichever has rows. */
  /* In the old shape water was a row list; now it is keyed by month. */
  var legacyWater = Array.isArray(b.water) ? b.water : [];
  if (Array.isArray(b.water)) b.water = {};
  var seen = {};
  (b.elec || []).concat(b.thermal || [], legacyWater).forEach(function(r){
    var p = parseMonthLabel(r.month); if (!p) return;
    var k = monthKey(p.y, p.m);
    if (!seen[k]){ seen[k] = true; b.months.push(p); }
  });
  (b.elec || []).forEach(function(r){ var p = parseMonthLabel(r.month); if (p && num(r.kwh) !== null) b.grid[monthKey(p.y,p.m)] = num(r.kwh); });
  if ((b.thermal || []).some(function(r){ return num(r.qty) !== null; })){
    var unit = /ton/i.test(b.thermalUnit||'') ? 'Ton' : /l/i.test(b.thermalUnit||'') ? 'Litre' : /scm/i.test(b.thermalUnit||'') ? 'SCM' : 'kg';
    var f = newFuel(b.thermalName || 'Fuel', unit, num(S.costs && S.costs.gcv));
    f.ef = num(S.costs && S.costs.fuelEF);
    (b.thermal || []).forEach(function(r){ var p = parseMonthLabel(r.month); if (p && num(r.qty) !== null) f.values[monthKey(p.y,p.m)] = num(r.qty); });
    b.fuels.push(f);
  }
  legacyWater.forEach(function(r){ var p = parseMonthLabel(r.month); if (p && num(r.m3) !== null) b.water[monthKey(p.y,p.m)] = num(r.m3); });
  b._v2 = true;
  return b;
}

/* Keeps the flat arrays older readers expect (GHG, demo seed, jets) in
   step with the structured data. Called after every baseline edit. */
function syncBaselineLegacy(){
  var b = S.baseline;
  b.elec = b.months.map(function(p){ var k = monthKey(p.y,p.m); return { month: monthLabelOf(p.y,p.m), kwh: num(b.grid[k]) }; });
  var f0 = b.fuels[0];
  b.thermal = f0 ? b.months.map(function(p){ var k = monthKey(p.y,p.m); return { month: monthLabelOf(p.y,p.m), qty: num(f0.values[k]) }; }) : [];
  b.thermalName = f0 ? f0.name : '';
  b.thermalUnit = f0 ? f0.unit : '';
  b.waterRows = b.months.map(function(p){ var k = monthKey(p.y,p.m); return { month: monthLabelOf(p.y,p.m), m3: num(b.water[k]) }; });
}

/* ------------------------------------------------------------------
   Every derived figure, from the inputs, computed fresh each call.
   ------------------------------------------------------------------ */
function fuelToe(fuel, qty){
  var g = num(fuel.gcv); if (qty === null || g === null) return null;
  return qty * fuelUnit(fuel.unit).mult * g / KCAL_PER_TOE;
}
function baselineCalc(){
  var b = normalizeBaseline();
  var basis = num(b.secBasis) || 1;
  var rows = b.months.map(function(p){
    var k = monthKey(p.y, p.m);
    var prod = num(b.production[k]);
    var grid = num(b.grid[k]);
    var sources = b.elecSources.map(function(s){ return { id:s.id, name:s.name, kwh: num(s.values[k]) }; });
    var elecKwh = grid;
    sources.forEach(function(s){ if (s.kwh !== null) elecKwh = (elecKwh || 0) + s.kwh; });
    var elecToe = elecKwh === null ? null : elecKwh * KCAL_PER_KWH / KCAL_PER_TOE;
    var fuels = b.fuels.map(function(f){ var q = num(f.values[k]); return { id:f.id, name:f.name, unit:f.unit, qty:q, toe: fuelToe(f, q) }; });
    var thermalToe = null;
    fuels.forEach(function(f){ if (f.toe !== null) thermalToe = (thermalToe || 0) + f.toe; });
    var water = num(b.water[k]);
    var per = (prod && prod > 0) ? prod / basis : null;
    return {
      key:k, label: monthLabelOf(p.y, p.m), prod:prod, grid:grid, sources:sources,
      elecKwh:elecKwh, elecToe:elecToe, fuels:fuels, thermalToe:thermalToe,
      totalToe: (elecToe === null && thermalToe === null) ? null : (elecToe || 0) + (thermalToe || 0),
      water:water,
      secKwh:  (per && elecKwh !== null) ? elecKwh / per : null,
      secElecToe: (per && elecToe !== null) ? elecToe / per : null,
      secThermalToe: (per && thermalToe !== null) ? thermalToe / per : null,
      secTotalToe: (per && (elecToe !== null || thermalToe !== null)) ? ((elecToe||0)+(thermalToe||0)) / per : null,
      secWater: (per && water !== null) ? water / per : null,
      hasData: grid !== null || fuels.some(function(f){ return f.qty !== null; }) || water !== null
    };
  });

  var sum = function(pick){ var s = 0, any = false; rows.forEach(function(r){ var v = pick(r); if (v !== null && v !== undefined){ s += v; any = true; } }); return any ? s : null; };
  var n = rows.filter(function(r){ return r.hasData; }).length;
  var T = {
    months:n, prod: sum(function(r){ return r.prod; }), grid: sum(function(r){ return r.grid; }),
    sources: b.elecSources.map(function(s, i){ return { id:s.id, name:s.name, kwh: sum(function(r){ return r.sources[i].kwh; }) }; }),
    elecKwh: sum(function(r){ return r.elecKwh; }), elecToe: sum(function(r){ return r.elecToe; }),
    fuels: b.fuels.map(function(f, i){ return { id:f.id, name:f.name, unit:f.unit, qty: sum(function(r){ return r.fuels[i].qty; }), toe: sum(function(r){ return r.fuels[i].toe; }) }; }),
    thermalToe: sum(function(r){ return r.thermalToe; }), totalToe: sum(function(r){ return r.totalToe; }),
    water: sum(function(r){ return r.water; })
  };
  var perT = (T.prod && T.prod > 0) ? T.prod / basis : null;
  T.secKwh = (perT && T.elecKwh !== null) ? T.elecKwh / perT : null;
  T.secElecToe = (perT && T.elecToe !== null) ? T.elecToe / perT : null;
  T.secThermalToe = (perT && T.thermalToe !== null) ? T.thermalToe / perT : null;
  T.secTotalToe = (perT && T.totalToe !== null) ? T.totalToe / perT : null;
  T.secWater = (perT && T.water !== null) ? T.water / perT : null;
  var avg = function(v){ return (v === null || !n) ? null : v / n; };
  var A = { prod:avg(T.prod), grid:avg(T.grid), elecKwh:avg(T.elecKwh), elecToe:avg(T.elecToe),
            thermalToe:avg(T.thermalToe), totalToe:avg(T.totalToe), water:avg(T.water),
            sources: T.sources.map(function(s){ return { name:s.name, kwh:avg(s.kwh) }; }),
            fuels: T.fuels.map(function(f){ return { name:f.name, unit:f.unit, qty:avg(f.qty), toe:avg(f.toe) }; }) };
  var basisLabel = basis === 1 ? b.prodUnit : basis === 1000 ? '1,000 ' + b.prodUnit : 'lakh ' + b.prodUnit;
  return { rows:rows, total:T, avg:A, months:n, basis:basis, basisLabel:basisLabel, unit:b.prodUnit,
           hasProd: T.prod !== null && T.prod > 0,
           hasElec: T.elecKwh !== null, hasThermal: T.thermalToe !== null, hasWater: T.water !== null,
           note: n ? '*Based on ' + n + ' month' + (n === 1 ? '' : 's') + ' data provided by company' : '' };
}

/* ------------------------------------------------------------------
   MONTH + YEAR chooser - two menus, never a typed label.
   ------------------------------------------------------------------ */
function yearOptions(){
  var y = new Date().getFullYear(), out = [];
  for (var i = y - 6; i <= y + 3; i++) out.push(i);
  return out;
}
function monthYearPicker(get, set){
  var wrap = el('div','display:flex;gap:4px;');
  var ms = el('select'), ys = el('select');
  MONTH_NAMES.forEach(function(n, i){ var o = el('option','', n); o.value = i + 1; ms.appendChild(o); });
  yearOptions().forEach(function(y){ var o = el('option','', String(y)); o.value = y; ys.appendChild(o); });
  var cur = get() || {};
  if (cur.m) ms.value = cur.m;
  if (cur.y) ys.value = cur.y;
  var fire = function(){ set(+ys.value, +ms.value); };
  ms.addEventListener('change', fire); ys.addEventListener('change', fire);
  wrap.appendChild(ms); wrap.appendChild(ys);
  return wrap;
}
/* Same chooser bound to a row's label field ("Apr-25"), for the bill tables. */
function monthLabelPicker(row, key, after){
  return monthYearPicker(
    function(){ return parseMonthLabel(row[key]); },
    function(y, m){ row[key] = monthLabelOf(y, m); save(); if (after) after(); else drawPreview(); });
}

/* ------------------------------------------------------------------
   THE EDITOR
   ------------------------------------------------------------------ */
function baseGrid(cols, rowsFn, footRows){
  /* cols: [{t, w, cell(row)->node|string, calc:true}] */
  var tw = el('div'); tw.className = 'tblwrap';
  var t = el('table'); t.className = 'ed';
  var thead = el('thead'), htr = el('tr');
  cols.forEach(function(c){ htr.appendChild(el('th', c.w ? 'width:' + c.w : '', c.t)); });
  thead.appendChild(htr); t.appendChild(thead);
  var tb = el('tbody');
  rowsFn().forEach(function(cells){
    var tr = el('tr');
    cells.forEach(function(cell, i){
      var td = el('td');
      if (typeof cell === 'string' || typeof cell === 'number'){ td.className = 'calc'; td.textContent = cell; }
      else td.appendChild(cell);
      if (cols[i] && cols[i].calc) td.className = 'calc';
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  (footRows || []).forEach(function(cells){
    var tr = el('tr'); tr.style.fontWeight = '600';
    cells.forEach(function(v){ var td = el('td'); td.className = 'calc'; td.textContent = v; tr.appendChild(td); });
    tb.appendChild(tr);
  });
  t.appendChild(tb); tw.appendChild(t);
  return tw;
}
function numCell(obj, key, refresh){
  var i = el('input'); i.type = 'number'; i.step = 'any';
  i.value = obj[key] == null ? '' : obj[key];
  i.addEventListener('input', function(){
    obj[key] = i.value === '' ? null : num(i.value);
    syncBaselineLegacy(); save(); refresh(); drawPreview();
  });
  return i;
}
var f3 = function(v){ return v === null || v === undefined ? '—' : fix(v, 3); };
var f0i = function(v){ return v === null || v === undefined ? '—' : inr(Math.round(v)); };
var f2 = function(v){ return v === null || v === undefined ? '—' : fix(v, 2); };

FORMS.baseline = function(w){
  var b = normalizeBaseline();
  var C0 = baselineCalc();

  /* ---- months and production ---- */
  var c1 = card('Months and production',
    'Choose each month from the menus - no typing, so a month cannot be spelt two ways in two tables. Every baseline table below shares this list.');
  var bar = el('div','display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;');
  bar.appendChild(btn('Create 12 months from FY ' + S.meta.financialYear, function(){
    b.months = fyMonthKeys(S.meta.financialYear); syncBaselineLegacy(); save(); renderAll();
  }));
  bar.appendChild(btn('+ Add a month', function(){
    var last = b.months[b.months.length - 1];
    var y = last ? (last.m === 12 ? last.y + 1 : last.y) : new Date().getFullYear();
    var m = last ? (last.m % 12) + 1 : 4;
    b.months.push({ y:y, m:m }); syncBaselineLegacy(); save(); renderAll();
  }));
  bar.appendChild(btn('Pull grid kWh from bills', function(){
    var n = 0;
    (S.bills || []).forEach(function(bill){
      var p = parseMonthLabel(bill.month); if (!p || num(bill.kwh) === null) return;
      var k = monthKey(p.y, p.m);
      if (!b.months.some(function(q){ return q.y === p.y && q.m === p.m; })) b.months.push(p);
      b.grid[k] = num(bill.kwh); n++;
    });
    b.months.sort(function(a, c){ return a.y - c.y || a.m - c.m; });
    syncBaselineLegacy(); save(); renderAll();
    alert(n + ' month' + (n === 1 ? '' : 's') + ' of grid kWh brought in from the bills.');
  }));
  c1.appendChild(bar);
  c1.appendChild(gridOf([
    fText(b,'prodUnit','Production counted in','Metre / kg / piece', 'The unit printed in every production column.'),
    fSelect(b,'secBasis','Specific consumption basis', SEC_BASIS, 'kWh, TOE and water are quoted per this much production.')
  ], true));
  var refreshAll = function(){ renderAll(); };
  c1.appendChild(baseGrid(
    [{ t:'Month', w:'170px' }, { t:'Production (' + b.prodUnit + ')' }, { t:'', w:'1%' }],
    function(){
      return b.months.map(function(p, i){
        var k = monthKey(p.y, p.m);
        var pick = monthYearPicker(function(){ return p; }, function(y, m){
          var old = monthKey(p.y, p.m), nk = monthKey(y, m);
          /* Re-keying a month carries its figures with it. */
          [b.production, b.grid, b.water].concat(b.elecSources.map(function(s){ return s.values; }), b.fuels.map(function(f){ return f.values; }))
            .forEach(function(store){ if (old in store){ store[nk] = store[old]; delete store[old]; } });
          p.y = y; p.m = m; syncBaselineLegacy(); save(); renderAll();
        });
        var pv = el('input'); pv.type = 'number'; pv.step = 'any'; pv.value = b.production[k] == null ? '' : b.production[k];
        pv.addEventListener('input', function(){ b.production[k] = pv.value === '' ? null : num(pv.value); save(); drawPreview(); });
        var del = el('button','', '×'); del.className = 'rowdel'; del.type = 'button'; del.title = 'Remove month';
        del.onclick = function(){ b.months.splice(i, 1); syncBaselineLegacy(); save(); renderAll(); };
        return [pick, pv, del];
      });
    }));
  c1.appendChild(el('p','', C0.months ? C0.note.replace('*', '') + ' - this line prints under each table.' : 'Add months to begin.')).className = 'callout info';
  w.appendChild(c1);

  /* ---- electrical ---- */
  var c2 = card('Electrical - Grid Input Energy and other sources',
    'Grid Input Energy is the kWh purchased each month. If the plant also generates - solar, a turbine, a DG set - add each as a source; it prints in its own column after the grid and counts towards the electrical total.');
  var sbar = el('div','display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;');
  sbar.appendChild(btn('+ Add another electrical source', function(){ b.elecSources.push(newElecSource()); save(); renderAll(); }));
  c2.appendChild(sbar);
  if (b.elecSources.length){
    c2.appendChild(gridOf(b.elecSources.map(function(s, i){
      var wrapS = el('div');
      wrapS.appendChild(fText(s,'name','Source ' + (i + 1) + ' name','Solar generation'));
      wrapS.appendChild(btn('Remove this source', function(){ b.elecSources.splice(i, 1); save(); renderAll(); }));
      return wrapS;
    }), true));
  }
  var eCols = [{ t:'Month', w:'90px' }, { t:'Grid Input Energy kWh' }]
    .concat(b.elecSources.map(function(s){ return { t:(s.name || 'Source') + ' kWh' }; }))
    .concat([{ t:'Total kWh', calc:true }, { t:'TOE', calc:true }, { t:'kWh / ' + C0.basisLabel, calc:true }]);
  var eCalcCells = {};
  var eRefresh = function(){
    var Cn = baselineCalc();
    Cn.rows.forEach(function(r){ var c = eCalcCells[r.key]; if (!c) return; c[0].textContent = f0i(r.elecKwh); c[1].textContent = f2(r.elecToe); c[2].textContent = f3(r.secKwh); });
  };
  c2.appendChild(baseGrid(eCols, function(){
    return C0.rows.map(function(r){
      var cells = [r.label, numCell(b.grid, r.key, eRefresh)];
      b.elecSources.forEach(function(s){ cells.push(numCell(s.values, r.key, eRefresh)); });
      var tk = el('span','', f0i(r.elecKwh)), tt = el('span','', f2(r.elecToe)), ts = el('span','', f3(r.secKwh));
      eCalcCells[r.key] = [tk, tt, ts];
      cells.push(tk, tt, ts);
      return cells;
    });
  }, [['TOTAL', f0i(C0.total.grid)].concat(C0.total.sources.map(function(s){ return f0i(s.kwh); }), [f0i(C0.total.elecKwh), f2(C0.total.elecToe), '***']),
      ['Average', f0i(C0.avg.grid)].concat(C0.avg.sources.map(function(s){ return f0i(s.kwh); }), [f0i(C0.avg.elecKwh), f2(C0.avg.elecToe), f3(C0.total.secKwh)])]));
  c2.appendChild(el('p','', toeFactorLines('electrical') + '. The Average row’s specific consumption is total kWh over total production, not the mean of the months.')).className = 'callout info';
  w.appendChild(c2);

  /* ---- thermal ---- */
  var c3 = card('Thermal - fuels',
    'Add each fuel the plant burns. Each has its own unit and calorific value, so coal in tonnes and diesel in litres sit side by side and both convert to TOE correctly.');
  var fbar = el('div','display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;');
  fbar.appendChild(btn('+ Add a fuel', function(){ b.fuels.push(newFuel(b.fuels.length ? 'Diesel' : 'Coal', b.fuels.length ? 'Litre' : 'Ton', b.fuels.length ? GCV_HINT.diesel : GCV_HINT.coal)); syncBaselineLegacy(); save(); renderAll(); }));
  c3.appendChild(fbar);
  if (b.fuels.length){
    c3.appendChild(gridOf(b.fuels.map(function(f, i){
      var wrapF = el('div','border:1px solid var(--line);border-radius:8px;padding:10px;');
      wrapF.appendChild(el('div','font-size:12px;font-weight:600;margin-bottom:6px;', 'Fuel ' + (i + 1)));
      wrapF.appendChild(fText(f,'name','Name','Coal / Diesel / PNG'));
      var us = fSelect(f,'unit','Counted in', FUEL_UNITS.map(function(u){ return { v:u.v, t:u.t }; }));
      us.querySelector('select').addEventListener('change', function(){ syncBaselineLegacy(); renderAll(); });
      wrapF.appendChild(us);
      wrapF.appendChild(fNum(f,'gcv','GCV kcal per ' + fuelUnit(f.unit).per, String(GCV_HINT.coal),
        'Gross calorific value. Typical: coal 4,000/kg · LDO 10,500/L · diesel 10,750/L · PNG 8,600/SCM.'));
      wrapF.appendChild(fNum(f,'ef','Emission factor kgCO₂e per ' + f.unit, '', 'For Scope 1. Coal ~2,402/ton, diesel 2.66/L, PNG 2.02/SCM (DEFRA 2025).'));
      wrapF.appendChild(btn('Remove this fuel', function(){ b.fuels.splice(i, 1); syncBaselineLegacy(); save(); renderAll(); }));
      return wrapF;
    }), true));
  }
  if (b.fuels.length){
    var tCols = [{ t:'Month', w:'90px' }];
    b.fuels.forEach(function(f){ tCols.push({ t:f.name + ' (' + f.unit + ')' }); tCols.push({ t:'TOE', calc:true }); });
    tCols.push({ t:'Thermal TOE', calc:true }, { t:'TOE / ' + C0.basisLabel, calc:true });
    var tCalc = {};
    var tRefresh = function(){
      var Cn = baselineCalc();
      Cn.rows.forEach(function(r){ var c = tCalc[r.key]; if (!c) return;
        r.fuels.forEach(function(f, i){ c.fuel[i].textContent = f2(f.toe); });
        c.tot.textContent = f2(r.thermalToe); c.sec.textContent = f3(r.secThermalToe); });
    };
    c3.appendChild(baseGrid(tCols, function(){
      return C0.rows.map(function(r){
        var cells = [r.label], fc = [];
        b.fuels.forEach(function(f, i){ cells.push(numCell(f.values, r.key, tRefresh)); var s = el('span','', f2(r.fuels[i].toe)); fc.push(s); cells.push(s); });
        var tot = el('span','', f2(r.thermalToe)), sec = el('span','', f3(r.secThermalToe));
        tCalc[r.key] = { fuel:fc, tot:tot, sec:sec };
        cells.push(tot, sec);
        return cells;
      });
    }, [['TOTAL'].concat([].concat.apply([], C0.total.fuels.map(function(f){ return [f0i(f.qty), f2(f.toe)]; })), [f2(C0.total.thermalToe), '***']),
        ['Average'].concat([].concat.apply([], C0.avg.fuels.map(function(f){ return [f0i(f.qty), f2(f.toe)]; })), [f2(C0.avg.thermalToe), f3(C0.total.secThermalToe)])]));
  }
  c3.appendChild(el('p','', toeFactorLines('thermal') + '. The electrical, thermal and overall tables all read the same figures, so they cannot disagree.')).className = 'callout info';
  w.appendChild(c3);

  /* ---- overall, read-only ---- */
  var c4 = card('Overall - what the report will print', 'Electrical and thermal together, per month. Nothing to type here; it is all derived.');
  c4.appendChild(baseGrid(
    [{ t:'Month' }, { t:'Production' }, { t:'Electrical TOE' }, { t:'TOE / ' + C0.basisLabel }, { t:'Thermal TOE' }, { t:'TOE / ' + C0.basisLabel }, { t:'Overall TOE / ' + C0.basisLabel }],
    function(){ return C0.rows.map(function(r){ return [r.label, f0i(r.prod), f2(r.elecToe), f3(r.secElecToe), f2(r.thermalToe), f3(r.secThermalToe), f3(r.secTotalToe)]; }); },
    [['TOTAL', f0i(C0.total.prod), f2(C0.total.elecToe), '***', f2(C0.total.thermalToe), '***', '***'],
     ['Average', f0i(C0.avg.prod), f2(C0.avg.elecToe), f3(C0.total.secElecToe), f2(C0.avg.thermalToe), f3(C0.total.secThermalToe), f3(C0.total.secTotalToe)]]));
  w.appendChild(c4);
};

FORMS.water = function(w){
  var b = normalizeBaseline();
  var C0 = baselineCalc();
  var c = card('Water baseline',
    'Water drawn each month, against the same months and production as the energy baseline. Specific water consumption is kL per ' + C0.basisLabel + '.');
  c.appendChild(gridOf([ fText(b,'waterSource','Water source','GIDC Water / Borewell', 'Printed in the specific-consumption column heading.') ], true));
  if (!b.months.length) c.appendChild(el('p','', 'Add months on the Energy baseline screen first - the water table uses the same list.')).className = 'callout';
  var wc = {};
  var wRefresh = function(){ var Cn = baselineCalc(); Cn.rows.forEach(function(r){ if (wc[r.key]) wc[r.key].textContent = f2(r.secWater); }); };
  c.appendChild(baseGrid(
    [{ t:'Month', w:'90px' }, { t:'Production (' + b.prodUnit + ')', calc:true }, { t:'Water kL' }, { t:'kL / ' + C0.basisLabel, calc:true }],
    function(){ return C0.rows.map(function(r){ var s = el('span','', f2(r.secWater)); wc[r.key] = s; return [r.label, f0i(r.prod), numCell(b.water, r.key, wRefresh), s]; }); },
    [['TOTAL', f0i(C0.total.prod), f0i(C0.total.water), '***'],
     ['Average', f0i(C0.avg.prod), f0i(C0.avg.water), f2(C0.total.secWater)]]));
  w.appendChild(c);
};

/* The conversion factors, stated under every table that carries a TOE
   column, so a reader can rework any cell from the quantity beside it. */
function toeFactorLines(which){
  var b = S.baseline, lines = [];
  if (which !== 'thermal') lines.push('1 kWh = 860 kcal; 1 TOE = 10,000,000 kcal; so 1 kWh = 0.000086 TOE');
  if (which !== 'electrical') b.fuels.forEach(function(f){
    var u = fuelUnit(f.unit), g = num(f.gcv);
    if (g === null){ lines.push(f.name + ': no GCV set'); return; }
    var perUnit = u.mult * g / KCAL_PER_TOE;
    lines.push(f.name + ': GCV ' + inr(g) + ' kcal/' + u.per + (u.mult !== 1 ? ' × ' + inr(u.mult) + ' ' + u.per + '/' + f.unit : '') +
      '; so 1 ' + f.unit + ' = ' + fix(perUnit, perUnit < 0.01 ? 5 : 3) + ' TOE');
  });
  return 'TOE factors: ' + lines.join(' · ');
}

/* ------------------------------------------------------------------
   THE PRINT
   ------------------------------------------------------------------ */
function baselineTable(head, groups, rows, opts){
  /* groups: a first header row of merged group titles; head: the second row */
  var g = groups.map(function(x){ return { v:x.t, tone:'head', span:x.span }; });
  return tblBlock(head, [g].concat(rows), opts);
}
function buildBaselineSection(B){
  var C0 = baselineCalc();
  B.push(blk(bH(1,'Baseline of plant energy consumption')));
  if (!C0.months){
    B.push(blk(bNote('No baseline months entered yet.')));
    B.push({ anchor:'baseline' });
    return;
  }
  var bl = C0.basisLabel, U = C0.unit;
  var labels = C0.rows.map(function(r){ return r.label; });

  /* --- electrical --- */
  if (C0.hasElec){
    B.push(blk(bH(2,'Baseline of plant energy consumption – electrical')));
    var head = ['Month', U, 'Grid Input kWh'];
    C0.rows[0].sources.forEach(function(s){ head.push(s.name + ' kWh'); });
    var multi = C0.rows[0].sources.length > 0;
    if (multi) head.push('Total kWh');
    head.push('TOE', 'kWh/' + bl, 'TOE/' + bl);
    var rows = C0.rows.map(function(r){
      var c = [r.label, f0i(r.prod), f0i(r.grid)];
      r.sources.forEach(function(s){ c.push(f0i(s.kwh)); });
      if (multi) c.push(f0i(r.elecKwh));
      c.push(f2(r.elecToe), f3(r.secKwh), f3(r.secElecToe));
      return c;
    });
    var tot = [{v:'TOTAL',tone:'head'}, f0i(C0.total.prod), f0i(C0.total.grid)];
    C0.total.sources.forEach(function(s){ tot.push(f0i(s.kwh)); });
    if (multi) tot.push(f0i(C0.total.elecKwh));
    tot.push(f2(C0.total.elecToe), '***', '***');
    var av = [{v:'Average',tone:'head'}, f0i(C0.avg.prod), f0i(C0.avg.grid)];
    C0.avg.sources.forEach(function(s){ av.push(f0i(s.kwh)); });
    if (multi) av.push(f0i(C0.avg.elecKwh));
    av.push(f2(C0.avg.elecToe), f3(C0.total.secKwh), f3(C0.total.secElecToe));
    rows.push(tot.map(function(v){ return typeof v === 'object' ? v : { v:v, tone:'head' }; }));
    rows.push(av.map(function(v){ return typeof v === 'object' ? v : { v:v, tone:'head' }; }));
    B.push(tblBlock(head, rows, { size:8.4 }));
    B.push(blk(bP(C0.note, { size:9, italic:true })));
    B.push(blk(bP(toeFactorLines('electrical'), { size:8.5, italic:true, color:C.ink3 })));
    var series = [{ name:'Grid Input Energy', color:SERIES_NAME.electrical, values:C0.rows.map(function(r){ return r.grid || 0; }) }];
    var palette = ['#0BA84A','#E8B400','#7A2E8E','#C00000'];
    C0.rows[0].sources.forEach(function(s, i){ series.push({ name:s.name, color:palette[i % palette.length], values:C0.rows.map(function(r){ return r.sources[i].kwh || 0; }) }); });
    B.push(blk(bChart(series.length > 1 ? chartGrouped(labels, series, 'Monthly electrical energy', 'kWh')
                                        : chartBars(labels, series[0].values, 'Monthly Grid Input Energy', 'kWh', SERIES_NAME.electrical),
      'Electrical energy by month')));
    if (C0.hasProd) B.push(blk(bChart(chartLine(labels, C0.rows.map(function(r){ return r.secKwh; }), 'Specific electrical energy consumption', 'kWh/' + bl),
      'kWh per ' + bl + ' by month')));
  }

  /* --- thermal --- */
  if (C0.hasThermal){
    B.push(blk(bH(2,'Baseline of plant energy consumption – thermal')));
    var th = ['Month', U];
    C0.rows[0].fuels.forEach(function(f){ th.push(f.name + ' (' + f.unit + ')', 'TOE'); });
    th.push('Thermal TOE', 'TOE/' + bl);
    var tr = C0.rows.map(function(r){
      var c = [r.label, f0i(r.prod)];
      r.fuels.forEach(function(f){ c.push(f0i(f.qty), f2(f.toe)); });
      c.push(f2(r.thermalToe), f3(r.secThermalToe));
      return c;
    });
    var tt = ['TOTAL', f0i(C0.total.prod)]; C0.total.fuels.forEach(function(f){ tt.push(f0i(f.qty), f2(f.toe)); }); tt.push(f2(C0.total.thermalToe), '***');
    var ta = ['Average', f0i(C0.avg.prod)]; C0.avg.fuels.forEach(function(f){ ta.push(f0i(f.qty), f2(f.toe)); }); ta.push(f2(C0.avg.thermalToe), f3(C0.total.secThermalToe));
    tr.push(tt.map(function(v){ return { v:v, tone:'head' }; }), ta.map(function(v){ return { v:v, tone:'head' }; }));
    B.push(tblBlock(th, tr, { size:8.4 }));
    B.push(blk(bP(C0.note, { size:9, italic:true })));
    B.push(blk(bP(toeFactorLines('thermal'), { size:8.5, italic:true, color:C.ink3 })));
    var fpal = [SERIES_NAME.thermal,'#7A2E8E','#0BA84A','#C00000'];
    var fs = C0.rows[0].fuels.map(function(f, i){ return { name:f.name, color:fpal[i % fpal.length], values:C0.rows.map(function(r){ return r.fuels[i].toe || 0; }) }; });
    B.push(blk(bChart(fs.length > 1 ? chartGrouped(labels, fs, 'Monthly thermal energy', 'TOE')
                                    : chartBars(labels, fs[0].values, 'Monthly thermal energy - ' + fs[0].name, 'TOE', SERIES_NAME.thermal),
      'Thermal energy by month, in TOE')));
    if (C0.hasProd) B.push(blk(bChart(chartLine(labels, C0.rows.map(function(r){ return r.secThermalToe; }), 'Specific thermal energy consumption', 'TOE/' + bl),
      'TOE per ' + bl + ' by month')));
  }

  /* --- overall --- */
  if (C0.hasElec && C0.hasThermal){
    B.push(blk(bH(2,'Baseline of plant energy consumption – overall')));
    var oh = ['Month', U, 'Electrical TOE', 'TOE/' + bl, 'Thermal TOE', 'TOE/' + bl, 'Overall TOE/' + bl];
    var orows = C0.rows.map(function(r){ return [r.label, f0i(r.prod), f2(r.elecToe), f3(r.secElecToe), f2(r.thermalToe), f3(r.secThermalToe), f3(r.secTotalToe)]; });
    orows.push(['TOTAL', f0i(C0.total.prod), f2(C0.total.elecToe), '***', f2(C0.total.thermalToe), '***', '***'].map(function(v){ return { v:v, tone:'head' }; }));
    orows.push(['Average', f0i(C0.avg.prod), f2(C0.avg.elecToe), f3(C0.total.secElecToe), f2(C0.avg.thermalToe), f3(C0.total.secThermalToe), f3(C0.total.secTotalToe)].map(function(v){ return { v:v, tone:'head' }; }));
    B.push(tblBlock(oh, orows, { size:8.6 }));
    B.push(blk(bP(C0.note, { size:9, italic:true })));
    B.push(blk(bP(toeFactorLines('both'), { size:8.5, italic:true, color:C.ink3 })));
    B.push(blk(bChart(chartStacked(labels, [
      { name:'Electrical', color:SERIES_NAME.electrical, values:C0.rows.map(function(r){ return r.elecToe || 0; }) },
      { name:'Thermal', color:SERIES_NAME.thermal, values:C0.rows.map(function(r){ return r.thermalToe || 0; }) }
    ], 'Monthly energy consumption', 'TOE'), 'Electrical and thermal energy by month, in TOE')));
    if (C0.hasProd) B.push(blk(bChart(chartLine(labels, C0.rows.map(function(r){ return r.secTotalToe; }), 'Overall specific energy consumption', 'TOE/' + bl),
      'Overall TOE per ' + bl + ' by month')));
    var sh = C0.total.totalToe ? (C0.total.elecToe / C0.total.totalToe) * 100 : null;
    if (sh !== null) B.push(blk(bP('Over the ' + C0.months + '-month period the plant consumed ' + f2(C0.total.totalToe) + ' TOE, of which ' +
      fix(sh, 1) + ' % was electrical and ' + fix(100 - sh, 1) + ' % thermal.')));
  }
  B.push({ anchor:'baseline' });
}

function buildWaterSection(B){
  var C0 = baselineCalc();
  if (!S.enabled.water || !C0.hasWater) return;
  var b = S.baseline, bl = C0.basisLabel;
  B.push(blk(bH(1,'Baseline of plant water consumption')));
  B.push(blk(bH(2,'Baseline for plant water consumption')));
  var rows = C0.rows.map(function(r){ return [r.label, f0i(r.prod), f0i(r.water), f2(r.secWater)]; });
  rows.push(['TOTAL', f0i(C0.total.prod), f0i(C0.total.water), '***'].map(function(v){ return { v:v, tone:'head' }; }));
  rows.push(['Average', f0i(C0.avg.prod), f0i(C0.avg.water), f2(C0.total.secWater)].map(function(v){ return { v:v, tone:'head' }; }));
  B.push(tblBlock(['Month', 'Production (' + C0.unit + ')', 'Water kL', (b.waterSource || 'Water') + ' kL/' + bl], rows, { colw:['18%','30%','22%','30%'] }));
  B.push(blk(bP(C0.note, { size:9, italic:true })));
  var labels = C0.rows.map(function(r){ return r.label; });
  B.push(blk(bChart(chartBars(labels, C0.rows.map(function(r){ return r.water || 0; }), 'Monthly water consumption', 'kL', SERIES_NAME.water), 'Water drawn by month')));
  if (C0.hasProd) B.push(blk(bChart(chartLine(labels, C0.rows.map(function(r){ return r.secWater; }), 'Specific water consumption', 'kL/' + bl), 'kL per ' + bl + ' by month')));
  B.push({ anchor:'water' });
}

/* ---- GHG from the same figures, one factor per fuel ---- */
function baselineGhg(){
  var b = normalizeBaseline(), C0 = baselineCalc();
  var s2 = ((C0.total.grid || 0) / 1000) * (num(S.costs.gridEF) || 0);
  var fuels = b.fuels.map(function(f, i){
    var ef = num(f.ef); if (ef === null && i === 0) ef = num(S.costs.fuelEF);
    var qty = C0.total.fuels[i].qty || 0;
    return { name:f.name, unit:f.unit, qty:qty, ef:ef, t: ef === null ? null : qty * ef / 1000 };
  });
  var s1 = fuels.reduce(function(a, f){ return a + (f.t || 0); }, 0);
  return { s1:s1, s2:s2, fuels:fuels, gridKwh:C0.total.grid || 0 };
}
