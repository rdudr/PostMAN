/* ===================================================================
   CHARTS - plain SVG, no library, sized for the 456 pt live column.

   Rules held here: never two y-scales on one chart (two measures of
   different scale become two charts); one series needs no legend because
   the title names it; a standard's limit is drawn AND labelled; every
   axis carries its unit; series colour follows the entity, never its rank.
   =================================================================== */

var SVGNS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs){
  var e = document.createElementNS(SVGNS, tag);
  for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
  return e;
}
function svText(x, y, text, opts){
  opts = opts || {};
  var t = sv('text', { x:x, y:y, 'text-anchor':opts.anchor || 'middle',
    'font-family': opts.mono ? "'IBM Plex Mono',monospace" : 'Archivo, Arial, sans-serif',
    'font-size': opts.size || 7.5, 'font-weight': opts.weight || 400,
    fill: opts.fill || C.ink3, transform: opts.rotate || null });
  t.textContent = text;
  return t;
}
function niceMax(v){
  if (!v || !isFinite(v)) return 1;
  var mag = Math.pow(10, Math.floor(Math.log10(v)));
  var n = v / mag;
  var step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * mag;
}

/* Shared frame: recessive grid, axis labels, plot area. */
function chartFrame(title, unitY, w, h, pad){
  var svg = sv('svg', { viewBox:'0 0 ' + w + ' ' + h, width:'100%',
    style:'display:block;font-variant-numeric:tabular-nums' });
  if (title) svg.appendChild(svText(pad.l, 10, title,
    { anchor:'start', size:9, weight:600, fill:C.charcoal }));
  if (unitY) svg.appendChild(svText(pad.l, 21, unitY, { anchor:'start', size:7, fill:C.ink3 }));
  return svg;
}
function gridLines(svg, pad, w, h, max, ticks){
  ticks = ticks || 4;
  for (var i = 0; i <= ticks; i++){
    var y = h - pad.b - (i/ticks) * (h - pad.t - pad.b);
    svg.appendChild(sv('line', { x1:pad.l, x2:w - pad.r, y1:y, y2:y,
      stroke: i === 0 ? C.rule : '#EDF1F5', 'stroke-width': i === 0 ? 1 : 0.8 }));
    svg.appendChild(svText(pad.l - 4, y + 2.4, inr(Math.round(max * i/ticks)),
      { anchor:'end', size:6.8, mono:true }));
  }
}

/* Single-series column chart. No legend - the title names the series. */
function chartBars(labels, values, title, unitY, color){
  var w = LIVE.w, h = 150, pad = { l:44, r:8, t:26, b:26 };
  var svg = chartFrame(title, unitY, w, h, pad);
  var max = niceMax(Math.max.apply(null, values.map(function(v){ return v || 0; }).concat([1])));
  gridLines(svg, pad, w, h, max);
  var n = labels.length || 1;
  var slot = (w - pad.l - pad.r) / n, bw = Math.min(26, slot * 0.62);
  labels.forEach(function(lb, i){
    var v = values[i] || 0;
    var bh = ((h - pad.t - pad.b) * v) / max;
    var x = pad.l + slot * i + (slot - bw)/2;
    svg.appendChild(sv('rect', { x:x, y:h - pad.b - bh, width:bw, height:Math.max(bh,0.8),
      rx:2, fill: color || SERIES[0] }));
    svg.appendChild(svText(x + bw/2, h - pad.b + 9, String(lb).slice(0,6), { size:6.4 }));
  });
  return svg;
}

/* Grouped columns + a labelled reference line for the standard/limit. */
function chartGrouped(labels, series, title, unitY, refLine){
  var w = LIVE.w, h = 168, pad = { l:44, r:8, t:34, b:26 };
  var svg = chartFrame(title, unitY, w, h, pad);
  var all = [];
  series.forEach(function(s){ s.values.forEach(function(v){ all.push(v || 0); }); });
  if (refLine) all.push(refLine.value || 0);
  var max = niceMax(Math.max.apply(null, all.concat([1])));
  gridLines(svg, pad, w, h, max);
  var n = labels.length || 1;
  var slot = (w - pad.l - pad.r) / n;
  var bw = Math.min(11, (slot - 4) / series.length);
  labels.forEach(function(lb, i){
    series.forEach(function(s, si){
      var v = s.values[i] || 0;
      var bh = ((h - pad.t - pad.b) * v) / max;
      /* 2px surface gap between adjacent bars */
      var x = pad.l + slot*i + (slot - (bw*series.length + 2*(series.length-1)))/2 + si*(bw+2);
      svg.appendChild(sv('rect', { x:x, y:h - pad.b - bh, width:bw, height:Math.max(bh,0.8),
        rx:2, fill:s.color }));
    });
    svg.appendChild(svText(pad.l + slot*i + slot/2, h - pad.b + 9, String(lb).slice(0,6), { size:6.4 }));
  });
  if (refLine){
    var y = h - pad.b - ((h - pad.t - pad.b) * refLine.value) / max;
    svg.appendChild(sv('line', { x1:pad.l, x2:w - pad.r, y1:y, y2:y,
      stroke:C.bad, 'stroke-width':1.2, 'stroke-dasharray':'4 3' }));
    svg.appendChild(svText(w - pad.r, y - 3, refLine.label, { anchor:'end', size:6.8, fill:C.bad }));
  }
  /* legend - always present for two or more series */
  var lx = pad.l;
  series.forEach(function(s){
    svg.appendChild(sv('rect', { x:lx, y:16, width:8, height:8, rx:2, fill:s.color }));
    var t = svText(lx + 11, 23, s.name, { anchor:'start', size:7.4, fill:C.charcoal });
    svg.appendChild(t);
    lx += 11 + s.name.length * 3.9 + 14;
  });
  return svg;
}

/* Line chart with a labelled threshold band - power factor against 0.95. */
function chartLine(labels, values, title, unitY, threshold){
  var w = LIVE.w, h = 150, pad = { l:44, r:8, t:26, b:26 };
  var svg = chartFrame(title, unitY, w, h, pad);
  var vals = values.filter(function(v){ return v !== null && isFinite(v); });
  var lo = Math.min.apply(null, vals.concat(threshold ? [threshold.value] : []));
  var hi = Math.max.apply(null, vals.concat(threshold ? [threshold.value] : []));
  var span = (hi - lo) || 1;
  lo = lo - span * 0.15; hi = hi + span * 0.15;
  function ypos(v){ return h - pad.b - ((v - lo) / (hi - lo)) * (h - pad.t - pad.b); }
  for (var i = 0; i <= 4; i++){
    var yy = h - pad.b - (i/4) * (h - pad.t - pad.b);
    var vv = lo + (i/4) * (hi - lo);
    svg.appendChild(sv('line', { x1:pad.l, x2:w - pad.r, y1:yy, y2:yy,
      stroke: i === 0 ? C.rule : '#EDF1F5', 'stroke-width': i === 0 ? 1 : 0.8 }));
    svg.appendChild(svText(pad.l - 4, yy + 2.4, vv.toFixed(2), { anchor:'end', size:6.8, mono:true }));
  }
  if (threshold){
    var ty = ypos(threshold.value);
    svg.appendChild(sv('line', { x1:pad.l, x2:w - pad.r, y1:ty, y2:ty,
      stroke:C.bad, 'stroke-width':1.2, 'stroke-dasharray':'4 3' }));
    svg.appendChild(svText(w - pad.r, ty - 3, threshold.label, { anchor:'end', size:6.8, fill:C.bad }));
  }
  var n = labels.length || 1;
  var slot = (w - pad.l - pad.r) / n;
  var d = '', started = false;
  labels.forEach(function(lb, i){
    var v = values[i];
    var x = pad.l + slot*i + slot/2;
    if (v !== null && isFinite(v)){
      d += (started ? ' L' : 'M') + x + ' ' + ypos(v); started = true;
    }
    svg.appendChild(svText(x, h - pad.b + 9, String(lb).slice(0,6), { size:6.4 }));
  });
  if (d) svg.appendChild(sv('path', { d:d, fill:'none', stroke:SERIES[0], 'stroke-width':2,
    'stroke-linejoin':'round', 'stroke-linecap':'round' }));
  labels.forEach(function(lb, i){
    var v = values[i];
    if (v === null || !isFinite(v)) return;
    var x = pad.l + slot*i + slot/2;
    var below = threshold && v < threshold.value;
    /* 2px surface ring keeps overlapping markers legible */
    svg.appendChild(sv('circle', { cx:x, cy:ypos(v), r:3, fill: below ? C.bad : SERIES[0],
      stroke:'#fff', 'stroke-width':1.5 }));
    if (below) svg.appendChild(svText(x, ypos(v) - 7, v.toFixed(3), { size:6.4, fill:C.bad, mono:true }));
  });
  return svg;
}

/* Stacked columns for the time-of-day split. */
function chartStacked(labels, series, title, unitY){
  var w = LIVE.w, h = 160, pad = { l:44, r:8, t:34, b:26 };
  var svg = chartFrame(title, unitY, w, h, pad);
  var totals = labels.map(function(_, i){
    return series.reduce(function(a, s){ return a + (s.values[i] || 0); }, 0);
  });
  var max = niceMax(Math.max.apply(null, totals.concat([1])));
  gridLines(svg, pad, w, h, max);
  var n = labels.length || 1;
  var slot = (w - pad.l - pad.r) / n, bw = Math.min(24, slot * 0.6);
  labels.forEach(function(lb, i){
    var acc = 0;
    var x = pad.l + slot*i + (slot - bw)/2;
    series.forEach(function(s){
      var v = s.values[i] || 0;
      if (v <= 0) return;
      var bh = ((h - pad.t - pad.b) * v) / max;
      var y = h - pad.b - ((h - pad.t - pad.b) * (acc + v)) / max;
      /* 2px surface gap between stacked segments */
      svg.appendChild(sv('rect', { x:x, y:y, width:bw, height:Math.max(bh - 2, 0.8), rx:2, fill:s.color }));
      acc += v;
    });
    svg.appendChild(svText(x + bw/2, h - pad.b + 9, String(lb).slice(0,6), { size:6.4 }));
  });
  var lx = pad.l;
  series.forEach(function(s){
    svg.appendChild(sv('rect', { x:lx, y:16, width:8, height:8, rx:2, fill:s.color }));
    svg.appendChild(svText(lx + 11, 23, s.name, { anchor:'start', size:7.4, fill:C.charcoal }));
    lx += 11 + s.name.length * 3.9 + 14;
  });
  return svg;
}

/* ===================================================================
   Charts added for the jet dashboard.

   The JET-Eff dashboard is a screen: it can afford 46 tick labels and
   neon fills. A report page is 456 pt wide and printed, so the same
   information is redrawn with the report palette and with axis labels
   thinned to whatever actually fits. The DATA is the dashboard's; only
   the rendering is the report's.
   =================================================================== */

/* Single-series columns where each bar can carry its own colour, plus an
   optional labelled benchmark line. Used for "pump efficiency vs 40 %",
   where the colour IS the verdict. */
function chartBarsRef(labels, values, title, unitY, opts){
  opts = opts || {};
  /* A benchmark line needs its label OUTSIDE the plot area - printed over
     the bars it lands on whichever bar happens to be tallest at that end. */
  var w = LIVE.w, h = 156, pad = { l:44, r:(opts.ref ? 34 : 8), t:26, b:28 };
  var svg = chartFrame(title, unitY, w, h, pad);
  var all = values.map(function(v){ return v || 0; });
  if (opts.ref) all = all.concat([opts.ref.value || 0]);
  var max = niceMax(Math.max.apply(null, all.concat([1])));
  gridLines(svg, pad, w, h, max);
  var n = labels.length || 1;
  var slot = (w - pad.l - pad.r) / n;
  var bw = Math.max(1.4, Math.min(26, slot * 0.66));
  /* Thin the tick labels rather than let them overlap - 46 jets will not
     fit 46 legible labels across 404 pt. */
  var every = Math.ceil(n / 26);
  labels.forEach(function(lb, i){
    var v = values[i] || 0;
    var bh = ((h - pad.t - pad.b) * v) / max;
    var x = pad.l + slot * i + (slot - bw) / 2;
    svg.appendChild(sv('rect', { x:x, y:h - pad.b - bh, width:bw, height:Math.max(bh, 0.8),
      rx: bw > 4 ? 2 : 0.5,
      fill: opts.colorAt ? opts.colorAt(values[i], i) : (opts.color || SERIES[0]) }));
    if (i % every === 0)
      svg.appendChild(svText(x + bw/2, h - pad.b + 9, String(lb).slice(0,7),
        { size:6.2, rotate: slot < 14 ? 'rotate(-60 ' + (x + bw/2) + ' ' + (h - pad.b + 9) + ')' : null,
          anchor: slot < 14 ? 'end' : 'middle' }));
  });
  if (opts.ref){
    var y = h - pad.b - ((h - pad.t - pad.b) * opts.ref.value) / max;
    svg.appendChild(sv('line', { x1:pad.l, x2:w - pad.r, y1:y, y2:y,
      stroke:C.bad, 'stroke-width':1.2, 'stroke-dasharray':'4 3' }));
    svg.appendChild(svText(w - pad.r + 3, y + 2.4, opts.ref.label,
      { anchor:'start', size:7, fill:C.bad, weight:600 }));
  }
  return svg;
}

/* Donut with the legend carrying value and share, because a reader cannot
   measure an angle. Slices are [{name, value, color}]. */
function chartDonut(slices, title, opts){
  opts = opts || {};
  var w = LIVE.w, h = 132, pad = { l:0, r:0, t:26, b:6 };
  var svg = chartFrame(title, null, w, h, { l:2, r:8, t:pad.t, b:pad.b });
  var live = slices.filter(function(s){ return (s.value || 0) > 0; });
  var total = live.reduce(function(a, s){ return a + s.value; }, 0);
  var cx = 60, cy = 76, r1 = 42, r0 = 24;
  if (!total){
    svg.appendChild(svText(cx, cy, 'No data', { size:8 }));
    return svg;
  }
  function pt(r, a){ return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
  var a = -Math.PI / 2;
  live.forEach(function(s){
    var sweep = (s.value / total) * Math.PI * 2;
    var a1 = a + sweep;
    if (live.length === 1){
      svg.appendChild(sv('circle', { cx:cx, cy:cy, r:(r0 + r1)/2, fill:'none',
        stroke:s.color, 'stroke-width':(r1 - r0) }));
    } else {
      var big = sweep > Math.PI ? 1 : 0;
      var A = pt(r1, a), Bp = pt(r1, a1), Cp = pt(r0, a1), D = pt(r0, a);
      svg.appendChild(sv('path', { fill:s.color, stroke:'#fff', 'stroke-width':1,
        d:'M' + A[0].toFixed(2) + ' ' + A[1].toFixed(2) +
          'A' + r1 + ' ' + r1 + ' 0 ' + big + ' 1 ' + Bp[0].toFixed(2) + ' ' + Bp[1].toFixed(2) +
          'L' + Cp[0].toFixed(2) + ' ' + Cp[1].toFixed(2) +
          'A' + r0 + ' ' + r0 + ' 0 ' + big + ' 0 ' + D[0].toFixed(2) + ' ' + D[1].toFixed(2) + 'Z' }));
    }
    a = a1;
  });
  if (opts.centre){
    svg.appendChild(svText(cx, cy - 1, opts.centre, { size:9, weight:600, fill:C.navy }));
    if (opts.centreSub) svg.appendChild(svText(cx, cy + 9, opts.centreSub, { size:6.2 }));
  }
  var ly = 44;
  live.forEach(function(s){
    svg.appendChild(sv('rect', { x:124, y:ly - 7, width:9, height:9, rx:2, fill:s.color }));
    svg.appendChild(svText(138, ly, s.name, { anchor:'start', size:8, fill:C.charcoal }));
    svg.appendChild(svText(300, ly, (opts.fmt ? opts.fmt(s.value) : inr(Math.round(s.value))),
      { anchor:'end', size:8, mono:true, fill:C.charcoal }));
    svg.appendChild(svText(348, ly, ((s.value / total) * 100).toFixed(1) + ' %',
      { anchor:'end', size:8, mono:true }));
    ly += 15;
  });
  return svg;
}
