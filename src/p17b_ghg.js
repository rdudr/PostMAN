/* ===================================================================
   GHG EMISSION ACCOUNTING
   The boundary text is standing prose - it appears in every report in
   the same words - and only the figures inside it change. They are read
   from the baseline, never typed, so the chapter can never quote a
   number the tables do not carry.
   =================================================================== */
function mobileEmission(){
  var q = num(S.ghg.mobileQty), ef = num(S.ghg.mobileEf);
  return (q === null || ef === null) ? 0 : q * ef / 1000;
}
function periodLabel(C0){
  if (!C0.rows.length) return 'the reporting period';
  var full = function(l){
    var p = parseMonthLabel(l); if (!p) return l;
    return ['January','February','March','April','May','June','July','August','September','October','November','December'][p.m - 1] + ' ' + p.y;
  };
  return full(C0.rows[0].label) + ' to ' + full(C0.rows[C0.rows.length - 1].label);
}
function buildGhgSection(B){
  var C0 = baselineCalc(), g = baselineGhg(), G = S.ghg;
  var mob = mobileEmission();
  var offset = num(G.reOffset) || 0;
  var s2net = g.s2 - offset;
  var site = G.site || S.company.addr2 || S.company.district || 'the plant';
  var period = periodLabel(C0);

  B.push(blk(bH(1,'GHG emission accounting')));
  B.push(blk(bH(2,'Boundaries of the emissions accounting')));
  B.push(blk(bP('Emissions accounting in the context of sustainability studies has been carried out by the plant’s emissions accounting by covering Scope 1 and Scope 2, while Scope 3 data was not available for this assessment.')));
  B.push(blk(bP('The accounting is done based on data provided during initial assessment of the plant. Genuineness of the data provided has been verified by the plant POC. The accounting covers SCOPE-01 and SCOPE-02 emissions in the report. However, the dashboard given as an attachment has covered SCOPE-03 accounting also and can leverage benefits of SCOPE-03 accounting. GHG accounting covers only emissions associated with SCOPE-01 stationary combustion, mobile combustion and SCOPE-02 purchased electricity emissions. Emissions within the ' + site + ' plant premises are also accounted for in the emissions accounting.')));

  var fuelsWith = g.fuels.filter(function(f){ return f.t !== null && f.qty > 0; });
  var fuelText = fuelsWith.length
    ? fuelsWith.map(function(f){ return f.name.toLowerCase() + ' (' + inr(f.t, 2) + ' tCO₂e)'; }).join(' and ')
    : 'no stationary fuel (none recorded in the baseline)';
  B.push(blk(bP('Under Scope 1 – Direct Emissions, stationary combustion sources included ' + fuelText + ' during the reporting period of ' + period + '.')));
  if (mob > 0) B.push(blk(bP('The mobile combustion emission in the form of ' + (G.mobileFuel || 'diesel').toLowerCase() + ' is ' + inr(mob, 2) + ' tCO₂e.')));
  B.push(blk(bP('These calculations followed the ' + (S.costs.fuelSrc || 'UK DEFRA 2025 emission factor guidelines') + ' (link here).')));
  B.push(blk(bP('http://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2025', { size:9 })));

  var s2text = 'In Scope 2 – Indirect Emissions, based on electricity consumption recorded through the ' + (G.meterName || 'ABT meter') + ', the total emissions were ' + inr(g.s2, 2) + ' tCO₂e.';
  if (offset > 0) s2text += ' However, due to renewable energy purchases, ' + inr(offset, 2) + ' tCO₂e was offset' + (G.reOffsetSince ? ' (as offset stated from ' + G.reOffsetSince + ')' : '') + ', resulting in a net Scope 2 emission of ' + inr(s2net, 2) + ' tCO₂e.';
  var srcWith = C0.total.sources.filter(function(sr){ return sr.kwh; });
  if (srcWith.length) s2text += ' In addition, ' + srcWith.map(function(sr){ return inr(Math.round(sr.kwh)) + ' kWh of ' + sr.name.toLowerCase(); }).join(' and ') +
    ' was generated on site, which carries no grid emission and displaces ' + fix(srcWith.reduce(function(a, sr){ return a + sr.kwh; }, 0) / 1000 * (num(S.costs.gridEF) || 0)) + ' tCO₂e.';
  s2text += ' For Scope 2 calculations, the ' + (S.costs.gridSrc || 'Central Electricity Authority (CEA) emission factor for the Indian grid') + ' was applied (link here).';
  B.push(blk(bP(s2text)));
  B.push(blk(bP('https://cea.nic.in/wp-content/uploads/baseline/2025/12/User_Guide_V_21.0.pdf', { size:9 })));
  B.push(blk(bP(G.scope3Note || 'For Scope 3 – Value Chain Emissions, relevant activity data was not available and hence excluded. All calculations were based on energy consumption data provided by the company.')));
  if (G.inventoryLink) B.push(blk(bP('For the detailed inventory report, please follow this link: ' + G.inventoryLink, { bold:true, size:9.5 })));

  /* --- summary --- */
  B.push(blk(bH(2,'Summary of GHG emissions')));
  var rows = [];
  g.fuels.forEach(function(f){ rows.push(['Scope 1', 'Stationary combustion', f.name, f.t === null ? '— (no factor)' : fix(f.t)]); });
  if (mob > 0) rows.push(['Scope 1', 'Mobile combustion', G.mobileFuel || 'Diesel', fix(mob)]);
  rows.push([{v:'Scope 1 total',tone:'head'}, {v:'',tone:'head'}, {v:'',tone:'head'}, {v:fix(g.s1 + mob),tone:'head'}]);
  rows.push(['Scope 2', 'Purchased electricity', 'Grid (' + (G.meterName || 'ABT meter') + ')', fix(g.s2)]);
  /* Electricity the plant generates itself - solar, a turbine - carries no
     grid emission. It is listed so the reader sees it was counted, with the
     grid emission it displaced, rather than wondering where it went. */
  var gridEf = num(S.costs.gridEF) || 0;
  C0.total.sources.forEach(function(sr){
    if (!sr.kwh) return;
    rows.push(['Scope 2', 'On-site generation, no grid emission',
      sr.name + ' — ' + inr(Math.round(sr.kwh)) + ' kWh (displaces ' + fix(sr.kwh / 1000 * gridEf) + ')', '0.00']);
  });
  if (offset > 0){
    rows.push(['Scope 2', 'Renewable purchase offset', G.reOffsetSince ? 'from ' + G.reOffsetSince : '', '− ' + fix(offset)]);
    rows.push([{v:'Scope 2 net',tone:'head'}, {v:'',tone:'head'}, {v:'',tone:'head'}, {v:fix(s2net),tone:'head'}]);
  }
  rows.push([{v:'Total',tone:'head'}, {v:'',tone:'head'}, {v:'',tone:'head'}, {v:fix(g.s1 + mob + s2net),tone:'head'}]);
  B.push(tblBlock(['Scope','Type of emission','Source','Emission tCO₂e'], rows, { colw:['16%','32%','30%','22%'] }));

  /* --- SCOPE-01, one fuel at a time: table, then its chart, then the next --- */
  if (C0.months && g.fuels.length){
    B.push(blk(bH(2,'SCOPE-01 emissions')));
    var labels = C0.rows.map(function(r){ return r.label; });
    g.fuels.forEach(function(f, fi){
      var unit = f.unit, ef = f.ef;
      B.push(blk(bH(3,'Stationary combustion – ' + f.name)));
      B.push(blk(bKPI([
        ['Plant emission due to ' + f.name.toLowerCase(), f.t === null ? '—' : fix(f.t) + ' tCO₂e'],
        ['Emission factor', ef === null ? 'not set' : inr(ef, ef < 10 ? 5 : 2) + ' kgCO₂e / ' + unit],
        ['Period', periodLabel(C0)]
      ])));
      var series = [];
      var rows = C0.rows.map(function(r){
        var q = r.fuels[fi].qty;
        var t = (ef === null || q === null) ? null : q * ef / 1000;
        series.push(t || 0);
        return [r.label, f.name, q === null ? '—' : inr(q, 2), unit, ef === null ? '—' : inr(ef, ef < 10 ? 5 : 2), fix(t)];
      });
      rows.push([{v:'Total',tone:'head'}, {v:'',tone:'head'}, {v:inr(f.qty, 2),tone:'head'}, {v:unit,tone:'head'}, {v:'',tone:'head'}, {v:fix(f.t),tone:'head'}]);
      B.push(tblBlock(['Month / year', 'Fuel', 'Amount', 'Unit', 'Emission factor kgCO₂e', 'GHG emission tCO₂e'], rows,
        { colw:['16%','16%','18%','12%','20%','18%'] }));
      B.push(blk(bP(C0.note, { size:9, italic:true })));
      if (ef === null) B.push(blk(bNote('No emission factor has been set for ' + f.name + ' — enter it on the GHG accounting screen.', 'bad')));
      else B.push(blk(bChart(chartBars(labels, series, 'Monthly Scope 1 emission – ' + f.name, 'tCO₂e', SERIES_NAME.thermal),
        f.name + ' combustion, tCO₂e by month')));
    });
    if (mob > 0){
      B.push(blk(bH(3,'Mobile combustion – ' + (G.mobileFuel || 'Diesel'))));
      B.push(tblBlock(['Fuel', 'Amount', 'Unit', 'Emission factor kgCO₂e', 'GHG emission tCO₂e'],
        [[G.mobileFuel || 'Diesel', inr(num(G.mobileQty), 2), G.mobileUnit || '', inr(num(G.mobileEf), 5), fix(mob)]],
        { colw:['20%','20%','15%','25%','20%'] }));
    }
  }

  /* --- SCOPE-02: purchased electricity, month by month --- */
  if (C0.months){
    B.push(blk(bH(2,'SCOPE-02 emissions')));
    B.push(blk(bH(3,'Purchased electricity emission')));
    var gef = num(S.costs.gridEF);
    B.push(blk(bKPI([
      ['Plant emission due to electricity', fix(g.s2) + ' tCO₂e'],
      ['Emission factor', gef === null ? 'not set' : fix(gef, 3) + ' kgCO₂e / kWh'],
      ['Metered by', G.meterName || 'ABT meter']
    ])));
    var s2rows = [], s2series = [];
    C0.rows.forEach(function(r){
      var t = (gef === null || r.grid === null) ? null : r.grid * gef / 1000;
      s2series.push(t || 0);
      s2rows.push([r.label, 'Electricity', r.grid === null ? '—' : inr(r.grid), 'kWh', gef === null ? '—' : fix(gef, 3), fix(t)]);
    });
    s2rows.push([{v:'Total',tone:'head'}, {v:'',tone:'head'}, {v:inr(g.gridKwh),tone:'head'}, {v:'kWh',tone:'head'}, {v:'',tone:'head'}, {v:fix(g.s2),tone:'head'}]);
    B.push(tblBlock(['Month / year', 'Source', 'Amount', 'Unit', 'Emission factor kgCO₂e', 'GHG emission tCO₂e'], s2rows,
      { colw:['16%','16%','18%','12%','20%','18%'] }));
    B.push(blk(bP(C0.note, { size:9, italic:true })));
    B.push(blk(bChart(chartBars(C0.rows.map(function(r){ return r.label; }), s2series, 'Monthly Scope 2 emission – purchased electricity', 'tCO₂e', SERIES_NAME.electrical),
      'Grid electricity, tCO₂e by month')));
    var srcs = C0.total.sources.filter(function(sr){ return sr.kwh; });
    if (srcs.length && gef !== null){
      B.push(blk(bP('On-site generation is not a Scope 2 emission. ' + srcs.map(function(sr){
        return inr(Math.round(sr.kwh)) + ' kWh of ' + sr.name.toLowerCase() + ' displaced ' + fix(sr.kwh / 1000 * gef) + ' tCO₂e of grid emission';
      }).join('; ') + '.')));
    }
  }

  /* --- emission baseline: Scope 1 + Scope 2 by month, with intensity ---
     Laid out as the sample reports do it: one column per Scope 1 fuel, the
     Scope 2 column, the total, then the emission per unit of production. */
  if (C0.months){
    B.push(blk(bH(2,'Emission baseline')));
    var bl = C0.basisLabel;
    var head = ['Month'].concat(g.fuels.map(function(f){ return 'Scope 1 ' + f.name + ' tCO₂e'; }),
      ['Scope 2 electricity tCO₂e', 'Total tCO₂e']);
    if (C0.hasProd) head.push('tCO₂e / ' + bl);
    var ef = num(S.costs.gridEF) || 0;
    var s1Series = [], s2Series = [], intSeries = [], totS1 = 0, totS2 = 0, n = 0;
    var mrows = C0.rows.map(function(r){
      var s1m = 0, fc = [];
      r.fuels.forEach(function(f, i){ var e = g.fuels[i].ef; var v = (e === null || f.qty === null) ? null : f.qty * e / 1000; fc.push(fix(v)); s1m += v || 0; });
      var s2m = (r.grid || 0) / 1000 * ef;
      var tot = s1m + s2m;
      var per = (r.prod && r.prod > 0) ? r.prod / C0.basis : null;
      var inten = per ? tot / per : null;
      s1Series.push(s1m); s2Series.push(s2m); intSeries.push(inten);
      if (r.hasData){ totS1 += s1m; totS2 += s2m; n++; }
      var row = [r.label].concat(fc, [fix(s1m), fix(s2m), fix(tot)]);
      if (C0.hasProd) row.push(fix(inten, 3));
      return row;
    });
    var totAll = totS1 + totS2;
    var perT = (C0.total.prod && C0.total.prod > 0) ? C0.total.prod / C0.basis : null;
    var trow = [{v:'TOTAL',tone:'head'}].concat(g.fuels.map(function(f){ return {v:fix(f.t),tone:'head'}; }),
      [{v:fix(totS1),tone:'head'}, {v:fix(totS2),tone:'head'}, {v:fix(totAll),tone:'head'}]);
    var arow = [{v:'Average',tone:'head'}].concat(g.fuels.map(function(f){ return {v:fix(f.t === null ? null : f.t / (n || 1)),tone:'head'}; }),
      [{v:fix(totS1 / (n || 1)),tone:'head'}, {v:fix(totS2 / (n || 1)),tone:'head'}, {v:fix(totAll / (n || 1)),tone:'head'}]);
    if (C0.hasProd){ trow.push({v:'***',tone:'head'}); arow.push({v:fix(perT ? totAll / perT : null, 3),tone:'head'}); }
    mrows.push(trow, arow);
    B.push(tblBlock(head, mrows, { size:8.6 }));
    B.push(blk(bP(C0.note, { size:9, italic:true })));
    if (C0.hasProd && perT) B.push(blk(bP('Emission intensity for the period: ' + fix(totAll / perT, 3) + ' tCO₂e per ' + bl + ' (' + fix(totAll) + ' tCO₂e over ' + inr(C0.total.prod) + ' ' + C0.unit + '). Total over total, not the mean of the monthly ratios.', { size:9.5 })));
    var labels = C0.rows.map(function(r){ return r.label; });
    B.push(blk(bChart(chartStacked(labels, [
      { name:'Scope 1', color:SERIES_NAME.thermal, values:s1Series },
      { name:'Scope 2', color:SERIES_NAME.electrical, values:s2Series }
    ], 'Monthly GHG emissions', 'tCO₂e'), 'Scope 1 and Scope 2 emissions by month')));
    if (C0.hasProd) B.push(blk(bChart(chartLine(labels, intSeries, 'Emission intensity', 'tCO₂e/' + bl), 'tCO₂e per ' + bl + ' by month')));
  }
  B.push({ anchor:'ghg' });
}
