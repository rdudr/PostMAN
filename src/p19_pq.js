/* ===================================================================
   ELECTRICAL DISTRIBUTION - measured, not typed.

   Two files feed this chapter and nothing in it is keyed by hand:

   1. The FOX KISEM app's workbook (Plant Main Inputs, PCC Panels, MCC
      Panels, Motor Loads Clamp, Motor Loads PQ, APFC). Every row carries
      who recorded it and when; the chapter prints who uploaded the file
      and when, so a figure can always be traced back to a person.

   2. The AI Power Quality Analyzer's "PostMan export" - one workbook per
      recording: a PostMan sheet naming the panel, instrument and window,
      a Data sheet in the analyser's standard columns. PostMan reads the
      Data sheet itself - min, average, maximum, THD against IEEE-519,
      and the trend charts - so the report never quotes a figure the raw
      recording does not carry. The panel name and the recording ID are
      the join between the two files.

   Chapter order, as the team writes it:
     single line diagram -> plant load demand -> each main input, with its
     recording -> each PCC, with its recording -> MCC panels -> motor load
     (clamp and PQ) -> APFC -> recommendations. The full measurement charts
     for every recording go to an annexure at the back, listed in the
     contents.
   =================================================================== */

/* ---- state shape ---- */
function blankPq(){ return { recordings: [] }; }
function pqState(){
  if (!S.pq) S.pq = blankPq();
  if (!Array.isArray(S.pq.recordings)) S.pq.recordings = [];
  var d = S.dist;
  if (!Array.isArray(d.mains)) d.mains = [];
  if (!Array.isArray(d.mcc)) d.mcc = [];
  if (d.foxUpload === undefined) d.foxUpload = null;
  return S.pq;
}

var IEEE = { vthd:5, ithd:8 };

/* ------------------------------------------------------------------
   PQ RECORDING IMPORT
   ------------------------------------------------------------------ */
var PQ_COLS = {
  va:['voltage_phase_a','v1','u12','urms12'], vb:['voltage_phase_b','v2','u23','urms23'], vc:['voltage_phase_c','v3','u31','urms31'],
  ia:['current_phase_a','i1','a1','arms1'], ib:['current_phase_b','i2','a2','arms2'], ic:['current_phase_c','i3','a3','arms3'],
  kw:['kw','p'], kva:['kva','s'], kvar:['kvar','q'], pf:['pf','powerfactor'], dpf:['dpf'], freq:['frequency','hz','f'],
  vthda:['vthd_a','uthd1','thdu1'], vthdb:['vthd_b','uthd2'], vthdc:['vthd_c','uthd3'],
  ithda:['ithd_a','ithd1','thdi1'], ithdb:['ithd_b','ithd2'], ithdc:['ithd_c','ithd3'],
  ts:['timestamp','datetime','date_time','time']
};
function pqColIndex(headers){
  var norm = headers.map(function(h){ return normKey(h); });
  var idx = {};
  Object.keys(PQ_COLS).forEach(function(k){
    for (var a = 0; a < PQ_COLS[k].length; a++){
      var i = norm.indexOf(normKey(PQ_COLS[k][a]));
      if (i >= 0){ idx[k] = i; break; }
    }
  });
  return idx;
}
function isPqDataSheet(wb, name){
  var h = headersOf(wb, name);
  var idx = pqColIndex(h);
  return idx.va !== undefined && idx.ia !== undefined && (idx.kw !== undefined || idx.pf !== undefined);
}
/* The PostMan sheet is Field | Value. */
function pqMeta(wb){
  var s = findSheet(wb, 'PostMan'); if (!s) return {};
  var rows = XLSX.utils.sheet_to_json(wb.Sheets[s], { header:1 });
  var m = {};
  rows.forEach(function(r){ if (r && r.length >= 2 && r[0] !== null && r[0] !== undefined) m[normKey(r[0])] = r[1]; });
  return m;
}
function stat(arr){
  var v = arr.filter(function(x){ return x !== null && isFinite(x); });
  if (!v.length) return null;
  var mn = Infinity, mx = -Infinity, s = 0;
  v.forEach(function(x){ if (x < mn) mn = x; if (x > mx) mx = x; s += x; });
  return { min:mn, max:mx, avg:s / v.length, n:v.length };
}
/* Keeps every point of a short recording and thins a long one to a fixed
   count, so a week at one-second resolution does not become a 600,000-node
   SVG. Averaging within each bucket rather than sampling one row keeps a
   spike visible in the mean and the min/max stats. */
function thin(vals, n){
  if (vals.length <= n) return vals.slice();
  var out = [], step = vals.length / n;
  for (var i = 0; i < n; i++){
    var a = Math.floor(i * step), b = Math.floor((i + 1) * step), s = 0, c = 0;
    for (var k = a; k < b; k++){ var v = vals[k]; if (v !== null && isFinite(v)){ s += v; c++; } }
    out.push(c ? s / c : null);
  }
  return out;
}
function thinLabels(labels, n){
  if (labels.length <= n) return labels.slice();
  var out = [], step = labels.length / n;
  for (var i = 0; i < n; i++) out.push(labels[Math.floor(i * step)]);
  return out;
}
function tsLabel(v){
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number'){ /* Excel serial */
    var d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d) ? String(v) : d.toISOString().slice(5, 16).replace('T', ' ');
  }
  var s = String(v);
  return s.length > 16 ? s.slice(5, 16) : s;
}
function importPq(wb, fileName){
  pqState();
  var dataSheet = null;
  Object.keys(wb.Sheets).forEach(function(n){ if (!dataSheet && isPqDataSheet(wb, n)) dataSheet = n; });
  if (!dataSheet) throw new Error('No PQ data sheet found (needs voltage, current and kW or PF columns).');
  var meta = pqMeta(wb);
  var rows = XLSX.utils.sheet_to_json(wb.Sheets[dataSheet], { header:1 });
  var head = rows[0] || [], idx = pqColIndex(head);
  var body = rows.slice(1).filter(function(r){ return r && r.length; });
  var col = function(k){ return idx[k] === undefined ? null : body.map(function(r){ return num(r[idx[k]]); }); };
  var avg3 = function(a, b, c){
    if (!a) return null;
    return a.map(function(v, i){ var xs = [v, b ? b[i] : null, c ? c[i] : null].filter(function(x){ return x !== null && isFinite(x); }); return xs.length ? xs.reduce(function(p, q){ return p + q; }, 0) / xs.length : null; });
  };
  var va = col('va'), vb = col('vb'), vc = col('vc'), ia = col('ia'), ib = col('ib'), ic = col('ic');
  var kw = col('kw'), kva = col('kva'), kvar = col('kvar'), pf = col('pf'), freq = col('freq');
  var vthd = avg3(col('vthda'), col('vthdb'), col('vthdc')), ithd = avg3(col('ithda'), col('ithdb'), col('ithdc'));
  var v = avg3(va, vb, vc), i = avg3(ia, ib, ic);
  if (!kva && kw && pf) kva = kw.map(function(p, n){ return (p !== null && pf[n]) ? p / pf[n] : null; });
  var ts = idx.ts === undefined ? body.map(function(_, n){ return String(n + 1); }) : body.map(function(r){ return tsLabel(r[idx.ts]); });
  var N = 240;
  var rec = {
    id: uid(), file: fileName || '',
    name: String(meta.panel || meta.machinename || meta.machine || meta.recordingname || meta.name || (fileName || 'Recording').replace(/\.[^.]+$/, '')),
    recId: String(meta.recordingid || meta.recording || ''),
    role: String(meta.role || 'pcc').toLowerCase(),
    nodeId: null,
    instrument: String(meta.instrument || meta.pqanalyzertype || meta.analyzer || ''),
    company: String(meta.company || meta.companyname || ''), plant: String(meta.plant || meta.plantname || ''),
    engineer: String(meta.engineer || meta.engineername || meta.exportedby || ''),
    exportedAt: String(meta.exportedat || meta.exportdate || ''),
    start: ts[0] || '', end: ts[ts.length - 1] || '', samples: body.length,
    stats: { v:stat(v || []), va:stat(va || []), vb:stat(vb || []), vc:stat(vc || []),
             i:stat(i || []), ia:stat(ia || []), ib:stat(ib || []), ic:stat(ic || []),
             kw:stat(kw || []), kva:stat(kva || []), kvar:stat(kvar || []), pf:stat(pf || []), freq:stat(freq || []),
             vthd:stat(vthd || []), ithd:stat(ithd || []) },
    series: { t:thinLabels(ts, N), va:va && thin(va, N), vb:vb && thin(vb, N), vc:vc && thin(vc, N),
              ia:ia && thin(ia, N), ib:ib && thin(ib, N), ic:ic && thin(ic, N),
              kw:kw && thin(kw, N), kva:kva && thin(kva, N), kvar:kvar && thin(kvar, N), pf:pf && thin(pf, N),
              vthd:vthd && thin(vthd, N), ithd:ithd && thin(ithd, N) },
    harmV: [], harmI: []
  };
  /* Harmonic spectrum: mean of each order across phases and time. */
  var hv = {}, hi = {};
  head.forEach(function(h, c){
    var m = /^(u\d\d|a\d)_%?fh(\d+)$/i.exec(String(h).trim());
    if (!m) return;
    var order = +m[2]; if (order === 1) return;
    var vals = body.map(function(r){ return num(r[c]); }).filter(function(x){ return x !== null; });
    if (!vals.length) return;
    var mean = vals.reduce(function(a, b){ return a + b; }, 0) / vals.length;
    var bag = /^u/i.test(m[1]) ? hv : hi;
    (bag[order] = bag[order] || []).push(mean);
  });
  var pack = function(bag){ return Object.keys(bag).map(function(o){ return { order:+o, pct: bag[o].reduce(function(a, b){ return a + b; }, 0) / bag[o].length }; }).sort(function(a, b){ return a.order - b.order; }); };
  rec.harmV = pack(hv); rec.harmI = pack(hi);
  /* A re-import of the same recording replaces the earlier copy. */
  var key = (rec.recId || rec.name).toLowerCase();
  S.pq.recordings = S.pq.recordings.filter(function(r){ return (r.recId || r.name).toLowerCase() !== key; });
  S.pq.recordings.push(rec);
  pqLinkToPanels(rec);
  return 'PQ recording "' + rec.name + '"' + (rec.recId ? ' (' + rec.recId + ')' : '') + ': ' + rec.samples + ' samples' +
    (rec.start ? ', ' + rec.start + ' to ' + rec.end : '');
}
/* Joins a recording to the FOX panel that names it, by recording ID first
   and panel name second, and takes its role from the panel it lands on. */
function pqLinkToPanels(rec){
  var byId = function(list){ return list.filter(function(p){ return rec.recId && p.recId && String(p.recId).toLowerCase() === rec.recId.toLowerCase(); })[0]
                                 || list.filter(function(p){ return (p.pqName || p.name) && rec.name && normKey(p.pqName || p.name) === normKey(rec.name); })[0]; };
  var m = byId(S.dist.mains || []); if (m){ rec.role = 'main'; rec.panel = m.name; return; }
  var p = byId(S.dist.pcc || []);   if (p){ rec.role = 'pcc'; rec.panel = p.name; return; }
  var c = byId(S.dist.mcc || []);   if (c){ rec.role = 'mcc'; rec.panel = c.name; return; }
}
function recordingsFor(panel){
  pqState();
  return S.pq.recordings.filter(function(r){
    return (panel.recId && r.recId && String(panel.recId).toLowerCase() === String(r.recId).toLowerCase()) ||
           ((panel.pqName || panel.name) && normKey(panel.pqName || panel.name) === normKey(r.name)) ||
           (r.panel && normKey(r.panel) === normKey(panel.name));
  });
}

/* ------------------------------------------------------------------
   FOX KISEM WORKBOOK IMPORT
   ------------------------------------------------------------------ */
var FOX_SHEETS = ['Plant Main Inputs','PCC Panels','MCC Panels','Motor Loads Clamp','Motor Loads PQ','APFC'];
function isFoxWorkbook(wb){ return FOX_SHEETS.filter(function(n){ return findSheet(wb, n); }).length >= 2; }
function foxRows(wb, name){
  var s = findSheet(wb, name); if (!s) return [];
  var rows = XLSX.utils.sheet_to_json(wb.Sheets[s], { header:1 });
  /* The server export puts three metadata lines above the header; find the
     header row by its first cell. */
  var hi = 0;
  for (var i = 0; i < Math.min(rows.length, 8); i++){ var r = rows[i] || []; if (r.length > 5 && /name|plant|zone|location|stage/i.test(String(r[0] || '') + String(r[1] || ''))){ hi = i; break; } }
  var head = (rows[hi] || []).map(normKey);
  return rows.slice(hi + 1).filter(function(r){ return r && r.some(function(v){ return v !== null && v !== undefined && v !== ''; }); })
    .map(function(r){ var o = {}; head.forEach(function(h, c){ o[h] = r[c]; }); return o; });
}
function foxReporter(wb){
  var names = Object.keys(wb.Sheets);
  for (var i = 0; i < names.length; i++){
    var rows = XLSX.utils.sheet_to_json(wb.Sheets[names[i]], { header:1 });
    for (var r = 0; r < Math.min(rows.length, 6); r++){
      var t = String((rows[r] || [])[0] || '');
      var m = /reported by:\s*(.+)/i.exec(t); if (m) return m[1].trim();
    }
  }
  return '';
}
var g2 = function(o){ return function(){ for (var i = 0; i < arguments.length; i++){ var v = o[normKey(arguments[i])]; if (v !== undefined && v !== '') return v; } return null; }; };
function phaseAvg(a, b, c){ var xs = [num(a), num(b), num(c)].filter(function(x){ return x !== null; }); return xs.length ? xs.reduce(function(p, q){ return p + q; }, 0) / xs.length : null; }
function foxPanel(o, kind){
  var g = g2(o);
  var v = phaseAvg(g('v1'), g('v2'), g('v3')), i = phaseAvg(g('i1'), g('i2'), g('i3'));
  var kw = num(g('totalpowerkw','totalpower')), pf = num(g('powerfactor','pf'));
  return {
    kind:kind, name:String(g('name','pccname','mccname') || ''), main:String(g('plantmaininput','zoneplantinput') || ''),
    pcc:String(g('parentpccpanel') || ''), pqName:String(g('pqname') || ''), recId:String(g('recordingid') || ''),
    v1:num(g('v1')), v2:num(g('v2')), v3:num(g('v3')), v:v,
    uthd1:num(g('uthd1')), uthd2:num(g('uthd2')), uthd3:num(g('uthd3')), vthd:phaseAvg(g('uthd1'), g('uthd2'), g('uthd3')),
    i1:num(g('i1')), i2:num(g('i2')), i3:num(g('i3')), i:i,
    ithd1:num(g('ithd1')), ithd2:num(g('ithd2')), ithd3:num(g('ithd3')), ithd:phaseAvg(g('ithd1'), g('ithd2'), g('ithd3')),
    pf:pf, kvarD:num(g('kvard')), kvarQ:num(g('kvarq')), kvar:num(g('kvarq')) !== null ? num(g('kvarq')) : num(g('kvard')),
    leadLag:String(g('kvarleadlag','leadlag') || ''), kw:kw, kva:(kw !== null && pf) ? kw / pf : null,
    desc:String(g('description') || ''), by:String(g('recordedby') || ''), date:String(g('date','time') || '')
  };
}
function importFox(wb, fileName){
  pqState();
  var log = [];
  var mains = foxRows(wb, 'Plant Main Inputs').map(function(o){ return foxPanel(o, 'main'); }).filter(function(p){ return p.name; });
  var pcc = foxRows(wb, 'PCC Panels').map(function(o){ return foxPanel(o, 'pcc'); }).filter(function(p){ return p.name; });
  var mcc = foxRows(wb, 'MCC Panels').map(function(o){ return foxPanel(o, 'mcc'); }).filter(function(p){ return p.name; });
  var motorRow = function(o, method){
    var g = g2(o);
    var rated = num(g('ratedkw')), kw = num(g('measuredkw','calculatedpowerkw'));
    var v = num(g('voltagev','voltageavg','voltage')), i = num(g('currenta','currentavg','current'));
    if (v === null) v = phaseAvg(g('v1'), g('v2'), g('v3'));
    if (i === null) i = phaseAvg(g('i1'), g('i2'), g('i3'));
    return { method:method, name:String(g('machinetag') || ''), main:String(g('zoneplantinput') || ''), pcc:String(g('parentpccpanel') || ''),
      mcc:String(g('mccpanelname') || ''), rated:rated, hp:num(g('ratedhp')), starter:String(g('startertype') || ''), freq:num(g('vfdfrequency')),
      v:v, i:i, kw:kw, kva:num(g('kva')), kvar:num(g('kvar','kvarq')), pf:num(g('powerfactor','pf')),
      vthd:phaseAvg(g('uthd1'), g('uthd2'), g('uthd3')), ithd:phaseAvg(g('ithd1'), g('ithd2'), g('ithd3')),
      loadFactor:num(g('loadfactor')), pqName:String(g('pqname') || ''), recId:String(g('recordingid') || ''),
      desc:String(g('description') || ''), by:String(g('recordedby') || ''), date:String(g('date') || '') };
  };
  var motors = foxRows(wb, 'Motor Loads Clamp').map(function(o){ return motorRow(o, 'clamp'); })
    .concat(foxRows(wb, 'Motor Loads PQ').map(function(o){ return motorRow(o, 'pq'); })).filter(function(m){ return m.name; });
  var apfc = foxRows(wb, 'APFC').map(function(o){
    var g = g2(o);
    return { main:String(g('locationplantinput') || ''), panel:String(g('locationpanel') || ''), stage:String(g('stage') || ''),
      rated:num(g('ratedcapacitorvalue')), v:num(g('voltage')), ir:num(g('ir')), iy:num(g('iy')), ib:num(g('ib')),
      remark:String(g('remark') || ''), desc:String(g('description') || ''), by:String(g('recordedby') || ''), date:String(g('date') || '') };
  }).filter(function(a){ return a.stage || a.panel; });

  if (mains.length){ S.dist.mains = mains; log.push(mains.length + ' plant main input' + (mains.length === 1 ? '' : 's')); }
  if (pcc.length){ S.dist.pcc = pcc; log.push(pcc.length + ' PCC panel' + (pcc.length === 1 ? '' : 's')); }
  if (mcc.length){ S.dist.mcc = mcc; log.push(mcc.length + ' MCC panel' + (mcc.length === 1 ? '' : 's')); }
  if (motors.length){ S.dist.motors = motors; log.push(motors.length + ' motor load reading' + (motors.length === 1 ? '' : 's')); }
  if (apfc.length){ S.dist.apfc = apfc; log.push(apfc.length + ' APFC stage' + (apfc.length === 1 ? '' : 's')); }

  var by = foxReporter(wb) || S.meta.preparedBy || '';
  if (!by){ by = prompt('Who is uploading this FOX workbook? (printed in the report)', '') || ''; }
  var stamp = new Date();
  S.dist.foxUpload = { file:fileName || '', at:stamp.toLocaleString('en-IN'), by:by,
    exportDate:(function(){ var g = null; foxRows(wb, 'Company Profile'); var s = findSheet(wb, 'Company Profile'); if (!s) return '';
      var rows = XLSX.utils.sheet_to_json(wb.Sheets[s], { header:1 }); rows.forEach(function(r){ if (r && /export date/i.test(String(r[0] || ''))) g = r[1]; }); return g ? String(g) : ''; })() };
  /* Recordings imported before the panels arrived get their role now. */
  S.pq.recordings.forEach(pqLinkToPanels);
  if (!log.length) throw new Error('The FOX sheets were recognised but every row in them was empty.');
  return log;
}

/* ------------------------------------------------------------------
   CHARTS - multi-series over time, for recordings.
   ------------------------------------------------------------------ */
function chartLines(labels, series, title, unitY, opts){
  opts = opts || {};
  var w = LIVE.w, h = opts.h || 150, pad = { l:44, r:8, t:series.length > 1 ? 32 : 26, b:22 };
  var svg = chartFrame(title, unitY, w, h, pad);
  var all = [];
  series.forEach(function(s){ (s.values || []).forEach(function(v){ if (v !== null && isFinite(v)) all.push(v); }); });
  if (opts.limit) all.push(opts.limit.value);
  if (!all.length) return svg;
  var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
  if (opts.zero) lo = Math.min(lo, 0);
  var span = (hi - lo) || 1; lo = lo - span * 0.08; hi = hi + span * 0.08;
  if (opts.zero && lo < 0 && Math.min.apply(null, all) >= 0) lo = 0;
  function ypos(v){ return h - pad.b - ((v - lo) / (hi - lo)) * (h - pad.t - pad.b); }
  for (var g = 0; g <= 4; g++){
    var yy = h - pad.b - (g/4) * (h - pad.t - pad.b), vv = lo + (g/4) * (hi - lo);
    svg.appendChild(sv('line', { x1:pad.l, x2:w - pad.r, y1:yy, y2:yy, stroke: g === 0 ? C.rule : '#EDF1F5', 'stroke-width': g === 0 ? 1 : 0.8 }));
    svg.appendChild(svText(pad.l - 4, yy + 2.4, Math.abs(vv) >= 100 ? inr(Math.round(vv)) : vv.toFixed(2), { anchor:'end', size:6.6, mono:true }));
  }
  var n = labels.length || 1, slot = (w - pad.l - pad.r) / n;
  var every = Math.max(1, Math.ceil(n / 8));
  labels.forEach(function(lb, i){
    if (i % every === 0) svg.appendChild(svText(pad.l + slot*i + slot/2, h - pad.b + 8, String(lb).slice(0, 11), { size:6 }));
  });
  if (opts.limit){
    var ty = ypos(opts.limit.value);
    svg.appendChild(sv('line', { x1:pad.l, x2:w - pad.r, y1:ty, y2:ty, stroke:C.bad, 'stroke-width':1.1, 'stroke-dasharray':'4 3' }));
    svg.appendChild(svText(w - pad.r, ty - 3, opts.limit.label, { anchor:'end', size:6.6, fill:C.bad }));
  }
  series.forEach(function(s){
    var d = '', started = false;
    (s.values || []).forEach(function(v, i){
      if (v === null || !isFinite(v)){ started = false; return; }
      var x = pad.l + slot*i + slot/2;
      d += (started ? ' L' : ' M') + x.toFixed(1) + ' ' + ypos(v).toFixed(1); started = true;
    });
    if (d) svg.appendChild(sv('path', { d:d.trim(), fill:'none', stroke:s.color, 'stroke-width':1.3, 'stroke-linejoin':'round' }));
  });
  if (series.length > 1){
    var lx = pad.l;
    series.forEach(function(s){
      svg.appendChild(sv('rect', { x:lx, y:23, width:8, height:3, fill:s.color }));
      svg.appendChild(svText(lx + 11, 26.5, s.name, { anchor:'start', size:7, fill:C.charcoal }));
      lx += 11 + s.name.length * 3.9 + 14;
    });
  }
  return svg;
}
var PH = ['#004AAD', '#B4700A', '#177245'];
function recCharts(rec, which){
  var t = rec.series.t, out = [];
  var has = function(k){ return rec.series[k] && rec.series[k].some(function(v){ return v !== null; }); };
  var ph = function(prefix, names){ return names.map(function(nm, i){ return { name:nm, color:PH[i], values:rec.series[prefix + 'abc'[i]] || [] }; }).filter(function(s){ return s.values.some(function(v){ return v !== null; }); }); };
  if (which.indexOf('v') >= 0 && has('va')) out.push(['Voltage', chartLines(t, ph('v', ['V1','V2','V3']), 'Voltage variation (Urms)', 'V')]);
  if (which.indexOf('i') >= 0 && has('ia')) out.push(['Current', chartLines(t, ph('i', ['I1','I2','I3']), 'Current variation (Arms)', 'A')]);
  if (which.indexOf('p') >= 0 && (has('kw') || has('kva'))) out.push(['Power', chartLines(t, [
      has('kw') && { name:'kW', color:PH[0], values:rec.series.kw }, has('kva') && { name:'kVA', color:PH[1], values:rec.series.kva },
      has('kvar') && { name:'kVAr', color:PH[2], values:rec.series.kvar }].filter(Boolean), 'Demand and power curve', 'kW / kVA / kVAr', { zero:true })]);
  if (which.indexOf('f') >= 0 && has('pf')) out.push(['Power factor', chartLines(t, [{ name:'PF', color:PH[0], values:rec.series.pf }], 'Power factor curve', 'PF', { limit:{ value:0.95, label:'0.95' } })]);
  if (which.indexOf('u') >= 0 && has('vthd')) out.push(['Voltage THD', chartLines(t, [{ name:'UTHD', color:PH[0], values:rec.series.vthd }], 'Voltage total harmonic distortion (UTHD)', '%', { zero:true, limit:{ value:IEEE.vthd, label:'IEEE-519 5 %' } })]);
  if (which.indexOf('c') >= 0 && has('ithd')) out.push(['Current THD', chartLines(t, [{ name:'ITHD', color:PH[1], values:rec.series.ithd }], 'Current total harmonic distortion (ITHD)', '%', { zero:true, limit:{ value:IEEE.ithd, label:'IEEE-519 8 %' } })]);
  if (which.indexOf('h') >= 0 && rec.harmV.length) out.push(['Voltage harmonics', chartBars(rec.harmV.map(function(x){ return 'H' + x.order; }), rec.harmV.map(function(x){ return x.pct; }), 'Voltage harmonic order (% of fundamental)', '%', PH[0])]);
  if (which.indexOf('h') >= 0 && rec.harmI.length) out.push(['Current harmonics', chartBars(rec.harmI.map(function(x){ return 'H' + x.order; }), rec.harmI.map(function(x){ return x.pct; }), 'Current harmonic order (% of fundamental)', '%', PH[1])]);
  return out;
}

/* ------------------------------------------------------------------
   THE CHAPTER
   ------------------------------------------------------------------ */
function verdictThd(v, lim){ return v === null ? null : (v > lim ? { v:'Exceeds ' + lim + ' %', tone:'bad' } : { v:'Within limit', tone:'ok' }); }
function recSummaryBlocks(B, rec){
  var s = rec.stats;
  var row = function(label, st, d, unit, lim){
    if (!st) return null;
    var cells = [label, fix(st.avg, d) + (unit || ''), fix(st.min, d), fix(st.max, d)];
    cells.push(lim ? verdictThd(st.avg, lim) : '');
    return cells;
  };
  var rows = [row('Voltage (avg of phases)', s.v, 1, ' V'), row('Current (avg of phases)', s.i, 1, ' A'),
              row('Active power', s.kw, 2, ' kW'), row('Apparent power', s.kva, 2, ' kVA'), row('Reactive power', s.kvar, 2, ' kVAr'),
              row('Power factor', s.pf, 3, ''), row('Frequency', s.freq, 2, ' Hz'),
              row('Voltage THD', s.vthd, 2, ' %', IEEE.vthd), row('Current THD', s.ithd, 2, ' %', IEEE.ithd)].filter(Boolean);
  B.push(blk(bP('Power quality recording' + (rec.recId ? ' ' + rec.recId : '') + (rec.instrument ? ' — ' + rec.instrument : '') +
    (rec.start ? ', ' + rec.start + ' to ' + rec.end : '') + ' (' + inr(rec.samples) + ' samples).', { size:9.5, italic:true })));
  B.push(tblBlock(['Parameter', 'Average', 'Minimum', 'Maximum', 'IEEE-519'], rows, { colw:['30%','18%','16%','16%','20%'] }));
  var flags = [];
  if (s.vthd && s.vthd.avg > IEEE.vthd) flags.push('average voltage THD of ' + fix(s.vthd.avg) + ' % is above the 5 % limit');
  if (s.ithd && s.ithd.avg > IEEE.ithd) flags.push('average current THD of ' + fix(s.ithd.avg) + ' % is above the 8 % limit');
  if (s.pf && s.pf.avg < 0.95) flags.push('average power factor of ' + fix(s.pf.avg, 3) + ' is below 0.95');
  B.push(blk(flags.length ? bNote('Observation: ' + flags.join('; ') + '.', 'bad') : bNote('Observation: voltage THD, current THD and power factor all within limits over the recording.', 'ok')));
  recCharts(rec, 'pfuc').forEach(function(c){ B.push(blk(bChart(c[1]))); });
  B.push(blk(bP('Voltage, current and harmonic-order charts for this recording are in the annexure.', { size:9, italic:true })));
}
function panelTable(B, p){
  var thd = function(v, lim){ return v === null ? '—' : { v:fix(v), tone:(v > lim ? 'bad' : null) }; };
  B.push(tblBlock(['Parameter', 'Phase 1 / R', 'Phase 2 / Y', 'Phase 3 / B', 'Average'], [
    ['Voltage V', fix(p.v1, 1), fix(p.v2, 1), fix(p.v3, 1), fix(p.v, 1)],
    ['Voltage THD %', thd(p.uthd1, IEEE.vthd), thd(p.uthd2, IEEE.vthd), thd(p.uthd3, IEEE.vthd), thd(p.vthd, IEEE.vthd)],
    ['Current A', fix(p.i1, 1), fix(p.i2, 1), fix(p.i3, 1), fix(p.i, 1)],
    ['Current THD %', thd(p.ithd1, IEEE.ithd), thd(p.ithd2, IEEE.ithd), thd(p.ithd3, IEEE.ithd), thd(p.ithd, IEEE.ithd)]
  ], { colw:['28%','18%','18%','18%','18%'] }));
  B.push(tblBlock(null, [
    [{v:'Total power',tone:'head'}, fix(p.kw, 2) + ' kW', {v:'Apparent power',tone:'head'}, fix(p.kva, 2) + ' kVA'],
    [{v:'Power factor',tone:'head'}, { v:fix(p.pf, 3), tone:(p.pf !== null && p.pf < 0.95 ? 'bad' : null) }, {v:'Reactive power',tone:'head'}, (p.kvarQ !== null ? fix(p.kvarQ, 2) + ' kVAr (Q)' : '') + (p.kvarD !== null ? ' · ' + fix(p.kvarD, 2) + ' kVAr (D)' : '') + (p.leadLag ? ' ' + p.leadLag : '')],
    [{v:'Recorded by',tone:'head'}, (p.by || '—') + (p.date ? ', ' + p.date : ''), {v:'PQ recording',tone:'head'}, (p.pqName || '') + (p.recId ? ' · ' + p.recId : '') || '—']
  ], { colw:['20%','30%','20%','30%'] }));
  if (p.desc) B.push(blk(bP(p.desc, { size:9.5 })));
}
function uploadStamp(){
  var u = S.dist.foxUpload;
  return u ? 'Panel, motor and APFC measurements: last uploaded data on ' + u.at + ' from ' + (u.by || 'the assessment team') +
    (u.file ? ' (' + u.file + ')' : '') + (u.exportDate ? '; exported from FOX KISEM on ' + u.exportDate : '') + '.' : '';
}

/* The single line diagram is the first chapter of the electrical part, the
   way it is the first thing an engineer draws on site: it names every panel
   the two chapters after it report on. */
function buildSldSection(B){
  if (!S.sld.nodes.length && !S.assets.sldImage) return;
  B.push(blk(bH(1,'Plant single line diagram')));
  if (S.assets.sldImage) B.push(blk(bImg(S.assets.sldImage, 'Plant single line diagram', 300)));
  else B.push(blk(bChart(sldSvg(true, false).svg, 'Generated from the panel hierarchy. Nodes breaching IEEE-519 are outlined in red; dashed nodes are provisional, recorded at the walkthrough and not yet confirmed.')));
  if (uploadStamp()) B.push(blk(bP(uploadStamp(), { size:9, italic:true })));
}
function buildDistSection(B){
  pqState();
  var d = S.dist;
  var any = d.pcc.length || d.motors.length || d.mains.length || d.mcc.length || d.apfc.length || (d.demand && d.demand.avg) || S.pq.recordings.length;
  if (!any) return;
  B.push(blk(bH(1,'Assessment of electrical distribution system')));
  B.push(blk(bP('Panels are named as on the plant single line diagram. Measurements come from the FOX KISEM field record and the power quality analyser recordings joined to each panel by recording ID.', { size:9.5 })));

  /* --- 1. plant load demand --- */
  if (d.demand && d.demand.avg !== null && d.demand.avg !== undefined){
    B.push(blk(bH(2,'Plant load demand study')));
    B.push(tblBlock(['Mainline demand monitoring','Contract demand','Average','Minimum','Maximum'],
      [['Demand kVA', inr(num(d.demand.contract)), fix(num(d.demand.avg)), fix(num(d.demand.min)), fix(num(d.demand.max))]],
      { colw:['32%','17%','17%','17%','17%'] }));
    if (d.demand.window) B.push(blk(bP('Recording window: ' + d.demand.window, { size:9.5, italic:true })));
  }

  /* --- 2. main inputs, each with its recording --- */
  var mains = d.mains.length ? d.mains : S.pq.recordings.filter(function(r){ return r.role === 'main'; }).map(function(r){ return { name:r.name, recId:r.recId, pqName:r.name, _recOnly:true }; });
  mains.forEach(function(m){
    B.push(blk(bH(2,'Plant main input — ' + m.name)));
    if (!m._recOnly){ B.push(blk(bH(3,'Measured at the panel'))); panelTable(B, m); }
    recordingsFor(m).forEach(function(rec){ B.push(blk(bH(3,'Power quality analysis — ' + (rec.recId || rec.name)))); recSummaryBlocks(B, rec); });
  });

  /* --- 3. PCC panels, each with its recording --- */
  d.pcc.forEach(function(p){
    B.push(blk(bH(2,'PCC panel — ' + p.name)));
    B.push(blk(bH(3,'Measured at the panel')));
    if (p.v1 !== undefined) panelTable(B, p);
    else B.push(tblBlock(['Voltage','Current','kW','Q kVAr','kVA','PF','%V THD','%I THD'],
      [[fix(num(p.v)), fix(num(p.i)), fix(num(p.kw)), fix(num(p.kvar)), fix(num(p.kva)), fix(num(p.pf),3),
        { v:fix(num(p.vthd)), tone:(num(p.vthd) > 5 ? 'bad' : null) }, { v:fix(num(p.ithd)), tone:(num(p.ithd) > 8 ? 'bad' : null) }]]));
    recordingsFor(p).forEach(function(rec){ B.push(blk(bH(3,'Power quality analysis — ' + (rec.recId || rec.name)))); recSummaryBlocks(B, rec); });
  });
  if (d.pcc.length){
    B.push(blk(bH(3,'Plant section-wise energy consumption — PCC load summary')));
    B.push(tblBlock(['Panel','Fed from','Voltage','Current','kW','kVA','PF','%V THD','%I THD'],
      d.pcc.map(function(r){ return [r.name, r.main || '', fix(num(r.v)), fix(num(r.i)), fix(num(r.kw)), fix(num(r.kva)), fix(num(r.pf),3),
        { v:fix(num(r.vthd)), tone:(num(r.vthd) > 5 ? 'bad' : null) }, { v:fix(num(r.ithd)), tone:(num(r.ithd) > 8 ? 'bad' : null) }]; }),
      { size:8, colw:['20%','14%','9%','9%','9%','9%','8%','11%','11%'] }));
    B.push(blk(bNote('Red cells exceed the IEEE-519:2022 limits of 5 % voltage THD and 8 % current THD.')));
    B.push(blk(bChart(chartGrouped(d.pcc.map(function(r){ return r.name; }),
      [{ name:'kW', color:PH[0], values:d.pcc.map(function(r){ return num(r.kw) || 0; }) }, { name:'kVA', color:PH[1], values:d.pcc.map(function(r){ return num(r.kva) || 0; }) }],
      'PCC panel loading', 'kW / kVA'), 'Active and apparent power at each PCC panel')));
    B.push(blk(bChart(chartGrouped(d.pcc.map(function(r){ return r.name; }),
      [{ name:'%V THD', color:PH[0], values:d.pcc.map(function(r){ return num(r.vthd) || 0; }) }, { name:'%I THD', color:PH[1], values:d.pcc.map(function(r){ return num(r.ithd) || 0; }) }],
      'Harmonic distortion at each PCC', '%', { value:IEEE.ithd, label:'ITHD limit 8 %' }), 'Voltage and current THD against the IEEE-519 current limit')));
  }

  /* --- 4. MCC panels --- */
  if (d.mcc.length){
    B.push(blk(bH(2,'MCC panels')));
    B.push(tblBlock(['MCC','Fed from PCC','Voltage','Current','kW','PF','%V THD','%I THD','Recorded by'],
      d.mcc.map(function(r){ return [r.name, r.pcc || r.main || '', fix(r.v, 1), fix(r.i, 1), fix(r.kw, 2), fix(r.pf, 3),
        { v:fix(r.vthd), tone:(r.vthd > 5 ? 'bad' : null) }, { v:fix(r.ithd), tone:(r.ithd > 8 ? 'bad' : null) }, r.by || '']; }),
      { size:8, colw:['18%','16%','9%','9%','9%','8%','9%','9%','13%'] }));
    d.mcc.forEach(function(p){ recordingsFor(p).forEach(function(rec){ B.push(blk(bH(3,'Power quality analysis — ' + p.name + ' (' + (rec.recId || rec.name) + ')'))); recSummaryBlocks(B, rec); }); });
  }

  /* --- 5. motor load study --- */
  if (d.motors.length){
    B.push(blk(bH(2,'Motor load study')));
    var pct2 = function(r){ var lf = num(r.loadFactor); if (lf !== null) return lf <= 1.5 ? lf * 100 : lf; return (num(r.kw) && num(r.rated)) ? (num(r.kw) / num(r.rated)) * 100 : null; };
    var tone = function(l){ return l === null ? null : (l > 100 ? 'bad' : (l < 50 ? 'watch' : 'ok')); };
    var groups = [['clamp','Clamp-meter readings'], ['pq','Power quality analyser readings']];
    groups.forEach(function(gp){
      var rows = d.motors.filter(function(r){ return (r.method || 'clamp') === gp[0]; });
      if (!rows.length) return;
      B.push(blk(bH(3, gp[1])));
      B.push(tblBlock(['S.No','Machine','Panel','Rated kW','Starter','Hz','V','A','kW','kVA','PF','% Load','Verdict'],
        rows.map(function(r, i){ var l = pct2(r);
          return [i + 1, r.name, r.mcc && !/direct/i.test(r.mcc) ? r.mcc : (r.pcc || ''), fix(num(r.rated), 1), r.starter || '', fix(num(r.freq), 0), fix(num(r.v), 0), fix(num(r.i), 1),
            fix(num(r.kw), 2), fix(num(r.kva), 2), fix(num(r.pf), 3), { v:(l === null ? '—' : fix(l, 1)), tone:tone(l) },
            { v:(l === null ? '' : l > 100 ? 'Overloaded' : l < 50 ? 'Under-loaded' : l >= 70 && l <= 90 ? 'Working OK' : 'Acceptable'), tone:tone(l) }]; }),
        { size:7.2, colw:['4%','17%','12%','6%','6%','5%','5%','5%','6%','6%','6%','8%','14%'] }));
    });
    B.push(blk(bNote('Above 100 % is an overloaded motor; below 50 % is an oversized one. The recommended band is 70–90 %.')));
    var lab = d.motors.map(function(r){ return r.name; }), vals = d.motors.map(pct2);
    B.push(blk(bChart(chartBarsRef(lab, vals.map(function(v){ return v || 0; }), 'Motor loading', '% of rated kW',
      { ref:{ value:100, label:'100 %' }, colorAt:function(v){ return v > 100 ? C.bad : v < 50 ? C.watch : C.ok; } }), 'Green within band, amber under-loaded, red overloaded')));
    if (d.motorNote) B.push(blk(bP(d.motorNote)));
  }

  /* --- 6. APFC --- */
  if (d.apfc.length){
    B.push(blk(bH(2,'Automatic power factor correction study')));
    var byPanel = {};
    d.apfc.forEach(function(r){ var k = r.panel || r.main || 'APFC panel'; (byPanel[k] = byPanel[k] || []).push(r); });
    Object.keys(byPanel).forEach(function(k){
      var rows = byPanel[k];
      if (Object.keys(byPanel).length > 1) B.push(blk(bH(3, k)));
      var status = function(r){
        var rem = r.remark || '';
        if (/off|open|trip/i.test(rem) || (num(r.ir) === 0 && num(r.iy) === 0 && num(r.ib) === 0)) return { v:'MCB off / no current', tone:'watch' };
        var cs = [num(r.ir), num(r.iy), num(r.ib)].filter(function(x){ return x !== null; });
        if (cs.length === 3 && (Math.min.apply(null, cs) < 0.7 * Math.max.apply(null, cs) || /derat|weak|fail/i.test(rem))) return { v:'Derated — phase imbalance', tone:'bad' };
        if (cs.length) return { v:'Working OK', tone:'ok' };
        return { v:rem || '—', tone:null };
      };
      B.push(tblBlock(['Stage','Rated kVAr','Voltage','I-R','I-Y','I-B','Status','Remark'],
        rows.map(function(r){ return [r.stage, fix(num(r.rated), 1), fix(num(r.v), 0), fix(num(r.ir), 1), fix(num(r.iy), 1), fix(num(r.ib), 1), status(r), r.remark || '']; }),
        { size:8, colw:['9%','11%','10%','9%','9%','9%','21%','22%'] }));
      var lbl = rows.map(function(r){ return 'S' + r.stage; });
      B.push(blk(bChart(chartGrouped(lbl, [
        { name:'I-R', color:PH[0], values:rows.map(function(r){ return num(r.ir) || 0; }) },
        { name:'I-Y', color:PH[1], values:rows.map(function(r){ return num(r.iy) || 0; }) },
        { name:'I-B', color:PH[2], values:rows.map(function(r){ return num(r.ib) || 0; }) }], 'Capacitor stage currents — ' + k, 'A'),
        'A healthy stage draws near-equal current on all three phases; a missing phase or a low one is a derated stage')));
      var bad = rows.filter(function(r){ return status(r).tone === 'bad'; }).length, off = rows.filter(function(r){ return status(r).tone === 'watch'; }).length;
      B.push(blk(bNote('Remark: ' + rows.length + ' stages — ' + (rows.length - bad - off) + ' working OK, ' + bad + ' derated, ' + off + ' switched off or drawing no current.' +
        (bad || off ? ' Derated and idle stages reduce the compensation available; the plant is paying for capacity it does not get.' : ''), bad ? 'bad' : off ? null : 'ok')));
    });
    if (d.apfcNote) B.push(blk(bP(d.apfcNote)));
  }
  ledgerFor(B, 'dist');
}

/* --- Annexure: the full measurement charts of every recording --- */
function buildPqAnnexure(B){
  pqState();
  if (!S.pq.recordings.length) return;
  B.push({ node:el('div'), split:false, hardBreak:true });
  B.push(blk(bH(1,'Annexure A — Power quality measurement charts')));
  B.push(blk(bP('The complete recorded trends for every power quality recording referred to in the electrical distribution chapter, in the order the panels appear there: plant main inputs first, then PCC panels, then MCC panels.')));
  var order = { main:0, pcc:1, mcc:2, motor:3, other:4 };
  var rank = function(r){ return order.hasOwnProperty(r.role) ? order[r.role] : 9; };
  S.pq.recordings.slice().sort(function(a, b){ return rank(a) - rank(b); }).forEach(function(rec, i){
    var roleName = { main:'Plant main input', pcc:'PCC panel', mcc:'MCC panel', motor:'Motor', other:'Recording' }[rec.role] || 'Recording';
    B.push(blk(bH(2, 'A.' + (i + 1) + ' ' + roleName + ' — ' + (rec.panel || rec.name) + (rec.recId ? ' (' + rec.recId + ')' : ''))));
    B.push(blk(bP((rec.instrument ? rec.instrument + '. ' : '') + (rec.start ? 'Recorded ' + rec.start + ' to ' + rec.end + ', ' : '') + inr(rec.samples) + ' samples.' + (rec.engineer ? ' Exported by ' + rec.engineer + (rec.exportedAt ? ' on ' + rec.exportedAt : '') + '.' : ''), { size:9.5, italic:true })));
    recCharts(rec, 'vipfuch').forEach(function(c){ B.push(blk(bChart(c[1]))); });
  });
  B.push({ anchor:'annexure' });
}

/* ------------------------------------------------------------------
   THE SCREEN - what was imported, and which recording belongs where.
   ------------------------------------------------------------------ */
FORMS.dist = function(w){
  pqState();
  var d = S.dist;
  var c = card('Measured data from FOX KISEM and the PQ analyser',
    'Nothing on this screen is typed. Import the FOX KISEM workbook and each PQ analyser "PostMan export" on the Import field data screen; this page shows what arrived and lets you say which panel a recording belongs to.');
  var k = el('div'); k.className = 'kpis';
  [['Main inputs', String(d.mains.length)], ['PCC panels', String(d.pcc.length)], ['MCC panels', String(d.mcc.length)],
   ['Motor readings', String(d.motors.length)], ['APFC stages', String(d.apfc.length)], ['PQ recordings', String(S.pq.recordings.length)]].forEach(function(p){
    var x = el('div'); x.className = 'kpi'; x.appendChild(el('span','', p[0])).className = 'k'; x.appendChild(el('span','', p[1])).className = 'v'; k.appendChild(x);
  });
  c.appendChild(k);
  if (d.foxUpload) c.appendChild(el('p','', uploadStamp())).className = 'callout good';
  else c.appendChild(el('p','', 'No FOX KISEM workbook imported yet.')).className = 'callout';
  c.appendChild(btn('Go to Import field data', function(){ S.active = 'imports'; save(); renderAll(); }));
  w.appendChild(c);

  if (S.pq.recordings.length){
    var c2 = card('Power quality recordings', 'Each recording prints under the panel it belongs to, with its charts in the annexure. Match them here if the recording ID did not line up automatically.');
    var panels = [{ v:'', t:'— not matched —' }].concat(
      d.mains.map(function(p){ return { v:'main:' + p.name, t:'Main input — ' + p.name }; }),
      d.pcc.map(function(p){ return { v:'pcc:' + p.name, t:'PCC — ' + p.name }; }),
      d.mcc.map(function(p){ return { v:'mcc:' + p.name, t:'MCC — ' + p.name }; }));
    S.pq.recordings.forEach(function(rec, i){
      var box = el('div','border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:8px;');
      var h = el('div','display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap;');
      h.appendChild(el('strong','', rec.name + (rec.recId ? ' (' + rec.recId + ')' : '')));
      h.appendChild(el('span','font-size:11px;color:var(--ink-3);', inr(rec.samples) + ' samples' + (rec.start ? ' · ' + rec.start + ' → ' + rec.end : '')));
      var del = btn('Remove', function(){ S.pq.recordings.splice(i, 1); save(); renderAll(); }); del.style.marginLeft = 'auto'; h.appendChild(del);
      box.appendChild(h);
      var sel = el('select');
      panels.forEach(function(o){ var op = el('option','', o.t); op.value = o.v; sel.appendChild(op); });
      sel.value = rec.panel ? (rec.role + ':' + rec.panel) : '';
      sel.addEventListener('change', function(){
        if (!sel.value){ rec.panel = null; } else { var p = sel.value.split(':'); rec.role = p[0]; rec.panel = p.slice(1).join(':'); }
        save(); renderAll();
      });
      box.appendChild(labelled('Belongs to', sel));
      var s = rec.stats;
      box.appendChild(el('div','font-size:12px;color:var(--ink-2);margin-top:6px;font-family:"IBM Plex Mono",monospace;',
        'avg ' + (s.v ? fix(s.v.avg, 1) + ' V' : '') + (s.i ? ' · ' + fix(s.i.avg, 1) + ' A' : '') + (s.kw ? ' · ' + fix(s.kw.avg, 1) + ' kW' : '') +
        (s.pf ? ' · PF ' + fix(s.pf.avg, 3) : '') + (s.vthd ? ' · VTHD ' + fix(s.vthd.avg) + ' %' : '') + (s.ithd ? ' · ITHD ' + fix(s.ithd.avg) + ' %' : '')));
      w.appendChild(box);
      c2.appendChild(box);
    });
    w.appendChild(c2);
  }

  var c3 = card('Notes for the chapter', 'Optional observations printed under the motor load and APFC tables.');
  c3.appendChild(fArea(d,'motorNote','Motor load observation'));
  c3.appendChild(fArea(d,'apfcNote','APFC observation'));
  w.appendChild(c3);

  var c4 = card('Plant load demand study', 'From the main-line demand recording, if one was taken.');
  c4.appendChild(gridOf([ fNum(d.demand,'contract','Contract demand kVA'), fNum(d.demand,'avg','Average kVA'), fNum(d.demand,'min','Minimum kVA'), fNum(d.demand,'max','Maximum kVA'), fText(d.demand,'window','Recording window') ]));
  w.appendChild(c4);
};
