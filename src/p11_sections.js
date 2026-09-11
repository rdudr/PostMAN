/* ===================================================================
   The three heaviest report sections, plus the utility modules.
   =================================================================== */

function buildBillSection(B){
  var d = billDerived();
  if (!d.rows.length) return;
  B.push(blk(bH(1,'Electricity bill analysis')));
  B.push(blk(bH(2,'Plant electricity bill analysis')));
  B.push(tblBlock(['Month','CD kVA','Actual MD','Billing dmd','kWh','kVAh','PF','Net ₹'],
    d.rows.map(function(r){
      var pf = num(r.pf) || (num(r.kwh) && num(r.kvah) ? num(r.kwh)/num(r.kvah) : null);
      return [r.month, inr(num(r.contract)), inr(num(r.actualMD)), inr(num(r.billingDemand)),
        inr(num(r.kwh)), inr(num(r.kvah)),
        { v: pf === null ? '—' : fix(pf,3), tone: (pf !== null && pf < 0.95) ? 'bad' : null },
        inr(num(r.net))];
    }), { colw:['13%','10%','12%','12%','14%','14%','9%','16%'] }));

  B.push(blk(bP('Observations in electricity bills', { bold:true })));
  B.push(blk(bFormula([
    'Average units consumed          = ' + inr(Math.round(d.avgKwh)) + ' units/month',
    'Average actual maximum demand   = ' + fix(d.avgMD) + ' kVA',
    'Average power factor            = ' + fix(d.avgPF,3),
    'Contract demand                 = ' + inr(d.cd) + ' kVA',
    '',
    'Load factor    = avg kWh / (avg MD x avg PF x 24 x 30) = ' + fix(d.loadFactor,3),
    'Plant utility  = avg kWh / (CD x avg PF x 24 x 30)     = ' + fix(d.utilityFactor,3),
    'Demand factor  = avg actual MD / CD                    = ' + fix(d.demandFactor,3)
  ])));
  B.push(blk(bP('The higher the load factor, the better the utilisation of the equipment and installed capacity.')));

  B.push(blk(bH(2,'Contract demand vs actual and billing demand')));
  B.push(blk(bChart(chartGrouped(
    d.rows.map(function(r){ return r.month; }),
    [{ name:'Actual MD', color:SERIES[0], values:d.rows.map(function(r){ return num(r.actualMD)||0; }) },
     { name:'Billing demand', color:SERIES[1], values:d.rows.map(function(r){ return num(r.billingDemand)||0; }) }],
    'Demand trend', 'kVA',
    d.cd ? { value:d.cd, label:'Contract demand ' + inr(d.cd) + ' kVA' } : null),
    'Actual maximum demand against billing demand, with the sanctioned contract demand marked.')));

  B.push(blk(bH(2,'Annual power factor trend')));
  B.push(blk(bChart(chartLine(
    d.rows.map(function(r){ return r.month; }),
    d.rows.map(function(r){
      var p = num(r.pf); if (p) return p;
      var kwh = num(r.kwh), kvah = num(r.kvah);
      return (kwh && kvah) ? kwh/kvah : null;
    }),
    'Monthly power factor', 'PF', { value:0.95, label:'Desirable 0.95' }),
    'Months below 0.95 are marked and labelled — those are the months carrying a penalty.')));

  var night = d.rows.some(function(r){ return num(r.todNight); });
  if (night){
    B.push(blk(bH(2,'Time of day (TOD) in electricity bill')));
    B.push(blk(bChart(chartStacked(
      d.rows.map(function(r){ return r.month; }),
      [{ name:'Night', color:SERIES[2], values:d.rows.map(function(r){ return num(r.todNight)||0; }) },
       { name:'Peak', color:SERIES[1], values:d.rows.map(function(r){ return num(r.todPeak)||0; }) },
       { name:'Normal', color:SERIES[0], values:d.rows.map(function(r){
           return Math.max(0,(num(r.kwh)||0) - (num(r.todNight)||0) - (num(r.todPeak)||0)); }) }],
      'Time of day split', 'kWh'),
      'Night-hour units attract a rebate; peak-hour units a surcharge.')));
  }

  B.push(blk(bH(2,'Recommendation in electricity bills')));
  if (S.billNotes.pfNote) B.push(blk(bP(S.billNotes.pfNote)));
  if (S.billNotes.cdNote) B.push(blk(bP(S.billNotes.cdNote)));
  if (d.cd && d.maxMD){
    var headroom = ((d.cd - d.maxMD) / d.cd) * 100;
    if (headroom > 12) B.push(blk(bNote(
      'Highest recorded maximum demand is ' + inr(Math.round(d.maxMD)) + ' kVA against a contract demand of ' +
      inr(d.cd) + ' kVA — ' + fix(headroom,0) + ' % headroom. Contract demand optimisation is worth evaluating, ' +
      'remembering that billing demand will not fall below 85 % of whatever contract demand is set.')));
  }
  ledgerFor(B, 'bills', { heading:false });
}

function buildDistSection(B){
  if (!S.dist.pcc.length && !S.dist.motors.length && !S.dist.demand.avg) return;
  B.push(blk(bH(1,'Assessment of electrical distribution system')));
  if (S.dist.demand.avg !== null && S.dist.demand.avg !== undefined){
    B.push(blk(bH(2,'Plant load demand study')));
    B.push(tblBlock(['Mainline demand monitoring','Contract demand','Average','Minimum','Maximum'],
      [['Demand kVA', inr(num(S.dist.demand.contract)), fix(num(S.dist.demand.avg)),
        fix(num(S.dist.demand.min)), fix(num(S.dist.demand.max))]],
      { colw:['32%','17%','17%','17%','17%'] }));
    if (S.dist.demand.window) B.push(blk(bP('Recording window: ' + S.dist.demand.window, { size:9.5, italic:true })));
  }
  if (S.dist.pcc.length){
    B.push(blk(bH(2,'Plant section-wise energy consumption — electrical PCC load')));
    B.push(tblBlock(['Name of machine','Voltage','Current','kW','Q kVAr','kVA','PF','%V THD','%I THD'],
      S.dist.pcc.map(function(r){
        return [r.name, fix(num(r.v)), fix(num(r.i)), fix(num(r.kw)), fix(num(r.kvar)),
          fix(num(r.kva)), fix(num(r.pf),3),
          { v:fix(num(r.vthd)), tone:(num(r.vthd) > 5 ? 'bad' : null) },
          { v:fix(num(r.ithd)), tone:(num(r.ithd) > 8 ? 'bad' : null) }];
      }), { size:8, colw:['22%','10%','10%','9%','10%','9%','8%','11%','11%'] }));
    B.push(blk(bNote('Red cells exceed the IEEE-519:2022 limits of 5 % voltage THD and 8 % current THD.')));
  }
  if (S.dist.motors.length){
    B.push(blk(bH(2,'Motor load study')));
    B.push(tblBlock(['S.No','Name','Rated kW','Starter','Freq/rpm','Voltage','Current','kW','kVAr','kVA','PF','% Load'],
      S.dist.motors.map(function(r,i){
        var load = (num(r.kw) && num(r.rated)) ? (num(r.kw)/num(r.rated))*100 : null;
        return [i+1, r.name, fix(num(r.rated),1), r.starter, fix(num(r.freq),0),
          fix(num(r.v),0), fix(num(r.i),1), fix(num(r.kw),2), fix(num(r.kvar),2),
          fix(num(r.kva),2), fix(num(r.pf),3),
          { v: load === null ? '—' : fix(load,1),
            tone: load === null ? null : (load > 100 ? 'bad' : (load < 50 ? 'watch' : 'ok')) }];
      }), { size:7.4, colw:['5%','19%','8%','7%','7%','7%','7%','7%','7%','7%','7%','12%'] }));
    B.push(blk(bNote('Above 100 % is an overloaded motor; below 50 % is an oversized one. The recommended band is 70–90 %.')));
    if (S.dist.motorNote) B.push(blk(bP(S.dist.motorNote)));
  }
  if (S.dist.apfc.length){
    B.push(blk(bH(2,'Automatic power factor correction study')));
    B.push(tblBlock(['Stage','Rated kVAr','Voltage','I-R','I-Y','I-B','Remark'],
      S.dist.apfc.map(function(r){
        return [r.stage, fix(num(r.rated),1), fix(num(r.v),0), fix(num(r.ir),1),
          fix(num(r.iy),1), fix(num(r.ib),1),
          { v:r.remark || '', tone:(/derat|fail|weak/i.test(r.remark||'') ? 'bad' : null) }];
      }), { colw:['14%','14%','12%','12%','12%','12%','24%'] }));
    if (S.dist.apfcNote) B.push(blk(bP(S.dist.apfcNote)));
  }
  ledgerFor(B, 'dist');
}

function buildTransformerSection(B){
  B.push(blk(bH(1,'Power quality and transformer assessment')));

  /* SLD - generated from the hierarchy, or a drawn one if supplied. */
  B.push(blk(bH(2,'Plant single line diagram')));
  if (S.assets.sldImage){
    B.push(blk(bImg(S.assets.sldImage, 'Plant single line diagram', 300)));
  } else if (S.sld.nodes.length){
    var built = sldSvg(true, false);
    B.push(blk(bChart(built.svg,
      'Generated from the panel hierarchy. Nodes breaching IEEE-519 are outlined in red; dashed nodes are provisional, recorded at the walkthrough and not yet confirmed.')));
  } else {
    B.push(blk(bNote('No single line diagram yet — build one from the panel tables in the Single line diagram section, or drop in a drawn one.')));
  }

  if (S.tr.capacity){
    B.push(blk(bH(3,'Rated details of transformer')));
    B.push(tblBlock(null, [
      [{v:'Make',tone:'head'}, S.tr.make || '—', {v:'Capacity',tone:'head'}, inr(num(S.tr.capacity)) + ' kVA'],
      [{v:'Primary voltage',tone:'head'}, fix(num(S.tr.primaryV),0) + ' V', {v:'Secondary voltage',tone:'head'}, fix(num(S.tr.secondaryV),0) + ' V'],
      [{v:'Impedance',tone:'head'}, fix(num(S.tr.impedance),2) + ' %', {v:'Year',tone:'head'}, S.tr.year || '—'],
      [{v:'No-load loss',tone:'head'}, fix(num(S.tr.noLoadLoss),2) + ' kW', {v:'Load loss',tone:'head'}, fix(num(S.tr.loadLoss),2) + ' kW'],
      [{v:'Oil quantity',tone:'head'}, S.tr.oilQty || '—', {v:'Serial no.',tone:'head'}, S.tr.srNo || '—']
    ], { colw:['22%','28%','22%','28%'] }));

    B.push(blk(bH(3,'Transformer efficiency monitoring')));
    B.push(tblBlock(null, [
      [{v:'Average loading',tone:'head'}, pct(num(S.tr.loading))],
      [{v:'Standard efficiency at this loading',tone:'head'}, pct(num(S.tr.stdEff),2)],
      [{v:'Actual load-based efficiency',tone:'head'},
       { v:pct(num(S.tr.actualEff),2),
         tone:(num(S.tr.actualEff) !== null && num(S.tr.stdEff) !== null && num(S.tr.actualEff) < num(S.tr.stdEff)) ? 'bad' : 'ok' }]
    ], { colw:['55%','45%'] }));

    B.push(blk(bH(3,'Power quality as per IEEE-519:2022 — harmonics')));
    B.push(tblBlock(['Parameter','Recommended limit','Measured','Verdict'], [
      ['Voltage THD (%VTHD)','< 5.00 %', fix(num(S.tr.vthd),2) + ' %',
        { v:(num(S.tr.vthd) > 5 ? 'Exceeds limit' : 'Within limit'), tone:(num(S.tr.vthd) > 5 ? 'bad' : 'ok') }],
      ['Current THD (%ITHD)','< 8.00 %', fix(num(S.tr.ithd),2) + ' %',
        { v:(num(S.tr.ithd) > 8 ? 'Exceeds limit' : 'Within limit'), tone:(num(S.tr.ithd) > 8 ? 'bad' : 'ok') }]
    ], { colw:['30%','24%','22%','24%'] }));
    if (num(S.tr.vthd) > 5 || num(S.tr.ithd) > 8){
      B.push(blk(bH(3,'Harmonics mitigation action plan')));
      B.push(blk(bP('Measured harmonic levels are above the IEEE-519 recommended limits, which contributes to transformer overheating, additional system losses and reduced equipment life. The usual measures, in order of priority:')));
      B.push(tblBlock(['Measure','Applies to','Benefit','Priority'], [
        ['Install 7 % detuned reactors with the APFC bank','Main PCC APFC panel','Prevents resonance and protects the capacitor bank','Critical'],
        ['Active harmonic filter at the PCC','Main incomer','Cuts current THD at source','High'],
        ['Segregate non-linear loads onto their own feeders','VFD-driven drives','Reduces harmonic propagation across the PCC','Medium']
      ], { colw:['34%','22%','30%','14%'] }));
    }
    if (S.tr.thermoNote){
      B.push(blk(bH(2,'Transformer thermography')));
      B.push(blk(bP(S.tr.thermoNote)));
    }
  }

  S.tr.panels.forEach(function(p){
    B.push(blk(bH(2, p.name || 'Panel monitoring')));
    if (p.recId) B.push(blk(bP('Recording ID: ' + p.recId, { size:9.5, italic:true })));
    var stats = p.stats.filter(function(s){ return num(s.avg) !== null; });
    if (stats.length){
      B.push(tblBlock(['Parameter','Average','Min','Max'],
        stats.map(function(s){
          var bad = /THD/i.test(s.p) &&
            ((/voltage/i.test(s.p) && num(s.avg) > 5) || (/current/i.test(s.p) && num(s.avg) > 8));
          return [s.p, { v:fix(num(s.avg)), tone: bad ? 'bad' : null }, fix(num(s.min)), fix(num(s.max))];
        }), { colw:['40%','20%','20%','20%'] }));
    }
    p.curves.forEach(function(cv){
      B.push(blk(bImg(cv.img, (cv.caption || 'Curve') + (p.recId ? ' — ' + p.recId : ''), 190)));
      if (cv.note) B.push(blk(bNote(cv.note)));
    });
  });
  ledgerFor(B, 'tr');
}

/* Every module ends with its own recommendations, drawn from the ledger. */
function ledgerFor(B, moduleId, opts){
  /* Every module ends with an anchor, whether or not it has recommendations,
     so a user-written section can be placed after any module in the report
     without touching the builder for that module. */
  var rows = S.ledger.filter(function(r){ return r.module === moduleId; });
  if (!rows.length){ B.push({ anchor:moduleId }); return; }
  /* A section that has already written its own recommendation heading says
     so, rather than getting a near-identical second one underneath it. */
  if (!(opts && opts.heading === false))
    B.push(blk(bH(2,'Recommendation in ' + (MODULE_NAMES[moduleId] || moduleId).toLowerCase())));
  rows.forEach(function(r, i){
    B.push(blk(bP((i+1) + '. ' + (r.recommendation || '—'), { bold:false })));
    if (r.observation) B.push(blk(bP(r.observation, { size:9.8 })));
    B.push(blk(bFormula([
      'Annual energy saving    = ' + inr(num(r.saving)) + ' ' + (r.unit || ''),
      'Annual monetary saving  = ' + rupees(num(r.monetary)),
      'Investment              = ' + rupees(num(r.investment)),
      'Simple payback period   = ' + months(roiMonths(r))
    ])));
  });
  B.push({ anchor:moduleId });
}

function buildUtilities(B){
  var any = ['boiler','tfh','compressor','coolingTower','chiller','pumps','jets','lux','solar','earth','machines','sop']
    .some(function(k){ return S.enabled[k]; });
  if (!any) return;
  B.push(blk(bH(1,'Performance assessment of major plant utilities')));

  if (S.enabled.boiler) buildFired(B, S.boiler, 'Performance assessment of boiler', 'boiler');
  if (S.enabled.tfh) buildFired(B, S.tfh, 'Performance assessment of thermic oil heater', 'tfh');

  if (S.enabled.compressor && S.compressor.length){
    B.push(blk(bH(2,'Performance assessment of air compressor')));
    B.push(tblBlock(['Sr','Parameter'].concat(S.compressor.map(function(k,i){ return k.tag || ('Compressor ' + (i+1)); })),
      [['1','Make / model'].concat(S.compressor.map(function(k){ return k.make || '—'; })),
       ['2','Type'].concat(S.compressor.map(function(k){ return k.type || '—'; })),
       ['3','Rated capacity'].concat(S.compressor.map(function(k){ return fix(toCFM(k.ratedCap,k.capUnit),1) + ' CFM'; })),
       ['4','Rated power'].concat(S.compressor.map(function(k){ return fix(num(k.ratedKw),1) + ' kW'; })),
       ['5','Rated pressure'].concat(S.compressor.map(function(k){ return fix(num(k.ratedPressure),1) + ' bar'; }))],
      { size:8 }));
    S.compressor.forEach(function(k, i){
      var d = compressorCalc(k);
      B.push(blk(bH(3, (k.tag || ('Air compressor ' + (i+1))) +
        (num(k.ratedKw) ? ' (' + fix(num(k.ratedKw),0) + ' kW)' : ''))));
      B.push(tblBlock(['Design parameters','Value','Measured parameters','Value'], [
        ['Design pressure, bar', fix(num(k.ratedPressure),1), 'Running pressure, bar', fix(num(k.runningPressure),1)],
        ['Design capacity, CFM', fix(d.ratedCFM,1), 'Actual capacity, CFM', fix(d.actualCFM,1)],
        ['Design SEC, kW/CFM', fix(d.designSEC,3), 'Actual SEC, kW/CFM',
          { v:fix(d.actualSEC,3), tone:(d.deviation !== null && d.deviation > 10 ? 'bad' : 'ok') }],
        ['Design air gen, CFM/kW', fix(d.designAirGen,2), 'Actual air gen, CFM/kW', fix(d.actualAirGen,2)]
      ], { colw:['28%','20%','30%','22%'] }));
      if (d.deviation !== null) B.push(blk(bNote(
        'Actual specific energy consumption is ' + fix(Math.abs(d.deviation),1) + ' % ' +
        (d.deviation > 0 ? 'above' : 'below') + ' design, at ' + fix(d.actualSEC,3) +
        ' against ' + fix(d.designSEC,3) + ' kW/CFM.', d.deviation > 10 ? 'bad' : 'ok')));
      if (k.obs) B.push(blk(bP(k.obs)));
    });
    ledgerFor(B, 'compressor');
  }

  if (S.enabled.coolingTower && S.coolingTower.length){
    B.push(blk(bH(2,'Performance assessment of cooling tower')));
    B.push(tblBlock(['Cooling tower','Rated TR','Hot in °C','Cold out °C','Wet bulb °C','Range','Approach','Effectiveness'],
      S.coolingTower.map(function(r){
        var a=num(r.hotIn), b=num(r.coldOut), wb=num(r.wetBulb);
        var eff = (a!==null&&b!==null&&wb!==null&&(a-wb)!==0) ? ((a-b)/(a-wb))*100 : null;
        return [r.name, fix(num(r.ratedTR),0), fix(a,1), fix(b,1), fix(wb,1),
          (a!==null&&b!==null)?fix(a-b,1):'—', (b!==null&&wb!==null)?fix(b-wb,1):'—',
          { v: eff===null?'—':pct(eff), tone: eff===null?null:(eff<60?'bad':'ok') }];
      }), { size:8 }));
    B.push(blk(bNote('Effectiveness below 60 % indicates fill fouling, poor water distribution or air short-circuiting.')));
    ledgerFor(B, 'coolingTower');
  }

  if (S.enabled.chiller && S.chiller.readings.length){
    B.push(blk(bH(2,'Performance assessment of chiller')));
    if (S.chiller.spec.length) B.push(tblBlock(['Particular','Specification'],
      S.chiller.spec.map(function(r){ return [r.p, r.v]; }), { colw:['45%','55%'] }));
    B.push(tblBlock(['Time','Flow m³/hr','Evap in °C','Evap out °C','kW','TR','kW/TR','COP'],
      S.chiller.readings.map(function(r){
        var f=num(r.flow), a=num(r.tin), b=num(r.tout), k=num(r.kw);
        var tr = (f&&a!==null&&b!==null) ? (f*1000*(a-b))/3024 : null;
        var kwtr = (tr && k) ? k/tr : null;
        return [r.time, fix(f,1), fix(a,1), fix(b,1), fix(k,1), fix(tr,1),
          { v:fix(kwtr,3), tone:(kwtr !== null && kwtr > 0.75 ? 'bad' : 'ok') },
          (tr && k) ? fix((tr*3.517)/k,2) : '—'];
      }), { size:8 }));
    if (S.chiller.obs) B.push(blk(bP(S.chiller.obs)));
    ledgerFor(B, 'chiller');
  }

  if (S.enabled.pumps && S.pumps.length){
    B.push(blk(bH(2,'Pumping system analysis')));
    DEFAULTS.pumpMethod.forEach(function(p){ B.push(blk(bP(p))); });
    B.push(tblBlock(['Pump','Make','Rated kW','Flow m³/hr','Head m','Motor kW','Hydraulic kW','Shaft kW','Pump eff %'],
      S.pumps.map(function(r){
        var qq=num(r.flow), h=num(r.head), m=num(r.motorKw), e=num(r.motorEff);
        var ph = (qq&&h!==null) ? (qq/3600)*1000*9.81*h/1000 : null;
        var ps = (m&&e) ? m*e/100 : null;
        var pe = (ph!==null&&ps) ? (ph/ps)*100 : null;
        return [r.name, r.make, fix(num(r.ratedKw),1), fix(qq,1), fix(h,1), fix(m,2),
          fix(ph,2), fix(ps,2),
          { v:fix(pe,1), tone:(pe===null?null:(pe<50?'bad':(pe<65?'watch':'ok'))) }];
      }), { size:7.6 }));
    B.push(blk(bNote('Pump efficiency below 50 % usually justifies replacement; 50–65 % justifies impeller trimming or a VFD.')));
    ledgerFor(B, 'pumps');
  }

  if (S.enabled.jets && S.jets.length) buildJets(B);

  if (S.enabled.lux && S.lux.length){
    B.push(blk(bH(2,'Lux level measurement')));
    DEFAULTS.luxMethod.forEach(function(p){ B.push(blk(bP(p))); });
    B.push(tblBlock(['ILER','Assessment'], DEFAULTS.ilerBands, { colw:['30%','70%'] }));
    B.push(blk(bH(3,'Area-wise lux measurement summary')));
    B.push(tblBlock(['S.N.','Location','Area m²','Avg lux','Measured lux/W/m²','Target','ILER','Assessment'],
      S.lux.map(function(r,i){
        var v = ilerOf(r), band = ilerBand(v);
        var tone = v === null ? null : (v >= 0.75 ? 'ok' : (v >= 0.51 ? 'watch' : 'bad'));
        var m = (num(r.lux)&&num(r.watt)&&num(r.area)) ? (num(r.lux)*num(r.area))/num(r.watt) : null;
        return [i+1, r.location, fix(num(r.area),1), fix(num(r.lux),1), fix(m,1),
          fix(num(r.target),1), { v:fix(v,2), tone:tone }, { v:band, tone:tone }];
      }), { size:7.6 }));
    var counts = { Satisfactory:0, Review:0, Urgent:0, Immediate:0 };
    S.lux.forEach(function(r){ var b = ilerBand(ilerOf(r)); if (counts[b] !== undefined) counts[b]++; });
    B.push(tblBlock(['Assessment','No. of locations'],
      Object.keys(counts).map(function(k){ return [k, counts[k]]; }), { colw:['60%','40%'] }));
    ledgerFor(B, 'lux');
  }

  if (S.enabled.solar && S.solar.rows.length){
    B.push(blk(bH(2,'Solar plant monitoring')));
    B.push(tblBlock(['Month','Generation kWh','Irradiance kWh/m²','CUF %'],
      S.solar.rows.map(function(r){
        var g = num(r.gen), cap = num(S.solar.capacity);
        return [r.month, inr(g), fix(num(r.irr),2), (g&&cap)?fix((g/(cap*24*30))*100,1):'—'];
      }), { colw:['28%','26%','26%','20%'] }));
    if (S.solar.rows.length > 1) B.push(blk(bChart(chartBars(
      S.solar.rows.map(function(r){ return r.month; }),
      S.solar.rows.map(function(r){ return num(r.gen)||0; }),
      'Solar generation', 'kWh', SERIES[3]), 'Monthly generation against installed ' +
      (S.solar.capacity ? fix(num(S.solar.capacity),0) + ' kWp' : 'capacity'))));
    if (S.solar.obs) B.push(blk(bP(S.solar.obs)));
    ledgerFor(B, 'solar');
  }

  if (S.enabled.earth && S.earth.length){
    B.push(blk(bH(2,'Earth loop resistance measurement')));
    B.push(tblBlock(['S.N.','Earth pit / location','Resistance Ω','Limit Ω','Status'],
      S.earth.map(function(r,i){
        var v = num(r.ohm), l = num(r.limit) || 1;
        return [i+1, r.location, fix(v,2), fix(l,2),
          { v: v===null?'—':(v<=l?'Within limit':'Exceeds limit'), tone: v===null?null:(v<=l?'ok':'bad') }];
      }), { colw:['8%','42%','18%','14%','18%'] }));
  }

  if (S.enabled.machines && S.machines.length){
    B.push(blk(bH(2,'Machine monitoring')));
    S.machines.forEach(function(m){
      B.push(blk(bH(3, m.title || 'Machine')));
      if (m.spec.length) B.push(tblBlock(['Parameter','Value'],
        m.spec.map(function(r){ return [r.p, r.v]; }), { colw:['45%','55%'] }));
      if (m.narrative) B.push(blk(bP(m.narrative)));
      if (m.obs) B.push(blk(bNote(m.obs)));
    });
    ledgerFor(B, 'machines');
  }

  if (S.enabled.sop && S.sop.length){
    B.push(blk(bH(1,'Guidelines / SOP to reduce resource consumption')));
    B.push(tblBlock(['Area','Guideline'],
      S.sop.map(function(r){ return [r.area, r.guideline]; }), { colw:['26%','74%'] }));
  }
}

function buildFired(B, data, title, moduleId){
  B.push(blk(bH(2, title)));
  DEFAULTS.boilerMethod.forEach(function(p){ B.push(blk(bP(p))); });
  if (data.spec.length){
    B.push(blk(bH(3,'Technical specification')));
    B.push(tblBlock(['Parameter','Value'], data.spec.map(function(r){ return [r.p, r.v]; }),
      { colw:['45%','55%'] }));
  }
  var d = data.direct, g = num(S.costs.gcv);
  var st = num(d.steam), fw = num(d.feedTemp), h = num(d.steamEnthalpy), fu = num(d.fuel);
  var effD = (st && h !== null && fw !== null && fu && g) ? ((st*(h-fw))/(fu*g))*100 : null;
  if (effD !== null){
    B.push(blk(bH(3,'Efficiency — direct method')));
    B.push(tblBlock(['Parameter','Value','Unit'], [
      ['Steam generated', fix(st,1), 'kg/hr'],
      ['Feed water temperature', fix(fw,1), '°C'],
      ['Steam enthalpy', fix(h,1), 'kcal/kg'],
      ['Fuel consumed', fix(fu,2), 'kg/hr'],
      ['GCV of fuel', fix(g,0), 'kcal/kg'],
      ['Evaporation ratio', fix(st/fu,2), '—'],
      [{v:'Efficiency (direct)',tone:'head'}, {v:pct(effD),tone:'head'}, {v:'%',tone:'head'}]
    ], { colw:['48%','30%','22%'] }));
  }
  var ind = data.indirect;
  var ea = excessAir(ind.o2), dfl = dryFlueLoss(ind.o2, ind.tf, ind.ta, S.costs.gcv);
  if (dfl !== null){
    var rad = num(ind.radiation) || 0;
    B.push(blk(bH(3,'Efficiency — indirect method')));
    B.push(tblBlock(['Flue gas analysis','Value','Unit'], [
      ['Oxygen in flue gas', fix(num(ind.o2),2), '%'],
      ['Carbon monoxide', fix(num(ind.co),0), 'ppm'],
      ['Flue gas temperature', fix(num(ind.tf),1), '°C'],
      ['Ambient temperature', fix(num(ind.ta),1), '°C'],
      ['Excess air', { v:fix(ea,1), tone:(ea > 60 ? 'bad' : 'ok') }, '%'],
      ['Dry flue gas loss', fix(dfl,2), '%'],
      ['Radiation & unaccounted loss', fix(rad,2), '%'],
      [{v:'Efficiency (indirect)',tone:'head'}, {v:pct(100 - dfl - rad),tone:'head'}, {v:'%',tone:'head'}]
    ], { colw:['48%','30%','22%'] }));
    if (num(ind.o2) > 6) B.push(blk(bNote(
      'Oxygen of ' + fix(num(ind.o2),2) + ' % corresponds to roughly ' + fix(ea,0) +
      ' % excess air, well above the 4–6 % O₂ band for efficient combustion. Excess air raises dry flue gas losses directly.', 'bad')));
    if (num(ind.co) === 0) B.push(blk(bNote('CO of 0 ppm indicates complete combustion, so there is no incomplete-combustion loss to recover.', 'ok')));
  }
  if (data.obs) B.push(blk(bP(data.obs)));
  ledgerFor(B, moduleId);
}

/* ===================================================================
   JET MACHINE MODULE

   Three sources had to agree here:
     - the JET-Eff dashboard, which decides WHICH four charts and which
       KPIs an engineer already trusts;
     - the KISEM sample report, which decides the SHAPE of the printed
       tables - transposed, five jets to a page-width, grouped by the
       physical test that produced the row;
     - the recommendation ledger, which decides the money.
   Every number below is read back from jetTotals()/jetsRollUp(), so the
   KPI row, the donut, the per-jet tables and the recommendations are all
   the same arithmetic rendered four ways.
   =================================================================== */

var JET_OP_COLOR   = { Heating:SERIES[1], Cooling:SERIES[0], Hold:C.ink3 };
var JET_STREAM_COL = { Insulation:SERIES[1], Pump:SERIES[0], Trap:SERIES[2] };

/* Row spine of the printed per-jet table. 'g' opens a group banner, 'r' is
   a measured or derived row. The order is the sample report's order, which
   walks the jet the way the engineer walked it: what it is, what it loses
   through its skin, what its pump costs, what its trap leaks, how well it
   exchanges heat, and what all that is worth. */
var JET_ROWS = [
  ['g','Jet operation data'],
  ['r','Capacity, kg',                    function(j){ return fix(num(j.capacity),0); }],
  ['r','Process',                         function(j){ return j.operation || '—'; }],
  ['r','Surface area, Sq. Mtr',           function(j){ return fix(num(j.surfaceArea),2); }],
  ['r','Jet set temperature, °C',         function(j){ return fix(num(j.jetTemp),1); }],
  ['r','Insulation condition',            function(j){ return { v:j.insulation || '—',
      tone:(j.insulation === 'UnInsulated' ? 'bad' : (j.insulation === 'Half Insulated' ? 'watch' : null)) }; }],

  ['g','Jet surface heat loss'],
  ['r','Average body temperature, °C',    function(j){ return fix(num(j.avgBodyTemp),1); }],
  ['r','Ambient temperature, °C',         function(j){ return fix(num(j.ambientTemp),1); }],
  ['r','Surface heat loss, kCal/hr',      function(j){ return inr(num(j.totalSurfaceHeatLoss)); }],
  ['r','Steam pressure, kg/cm²',          function(j){ return fix(num(j.steamPressure),1); }],
  ['r','Eq. steam loss, kg/hr',           function(j){ return fix(num(j.eqSteamLoss),2); }],
  ['r','Eq. fuel loss, kg/hr',            function(j){ return fix(jetFuel(j.eqSteamLoss),3); }],
  ['r','After insulation body temp, °C',  function(j){ return fix(num(j.insulationBodyTemp),1); }],
  ['r','Eq. fuel loss after, kg/hr',      function(j){ return fix(jetFuel(j.eqSteamLossAfter),3); }],
  ['r','Savings in coal, kg/hr',          function(j){ return fix(num(j.insEqCoalSaving),3); }],
  ['r','Annual fuel saving, Tonne',       function(j){ return fix(num(j.insAnnualFuelSaving),2); }],
  ['r','A. Annual savings, ₹*',           function(j){ return { v:inr(num(j.insMonitoringSaving)), tone:'head' }; }],

  ['g','Jet pump performance'],
  ['r','Jet flow, CMH',                   function(j){ return fix(num(j.flow),1); }],
  ['r','Pump pressure, kg/cm²',           function(j){ return fix(num(j.pressure),2); }],
  ['r','Power input to jet, kW',          function(j){ return fix(num(j.pumpPower),2); }],
  ['r','Hydraulic power, kW',             function(j){ return fix(num(j.hydraulicPower),2); }],
  ['r','Pump efficiency, %',              function(j){ var e = num(j.pumpEfficiency);
      return { v:fix(e,1), tone:(e === null ? null : (e < 40 ? 'bad' : (e < 55 ? 'watch' : 'ok'))) }; }],
  ['r','After replacement, kW',           function(j){ return fix(num(j.shaftPowerAt40),2); }],
  ['r','Savings at min. 40 % eff., kW',   function(j){ return fix(num(j.pumpSavingKw),2); }],
  ['r','Annual savings in units, kWh*',   function(j){ return inr(num(j.pumpAnnualPowerSaving)); }],
  ['r','B. Savings in ₹',                 function(j){ return { v:inr(num(j.pumpMonitoringSaving)), tone:'head' }; }],

  ['g','Steam trap performance'],
  ['r','Trap type',                       function(j){ return j.trapType || '—'; }],
  ['r','Trap temperature in, °C',         function(j){ return fix(num(j.trapTempIn),1); }],
  ['r','Trap temperature out, °C',        function(j){ return fix(num(j.trapTempOut),1); }],
  ['r','Trap working',                    function(j){ return { v:j.trapStatus || '—',
      tone:(j.trapStatus === 'Trap Passing' ? 'bad' : (j.trapStatus ? 'ok' : null)) }; }],
  ['r','Loss of steam trap, kg/hr',       function(j){ return fix(num(j.trapEqSteamLoss),2); }],
  ['r','C. Annual savings in ₹*',         function(j){ return { v:inr(num(j.trapMonitoringSaving)), tone:'head' }; }],

  ['g','Heat exchanger performance'],
  ['r','Estd. / meas. steam flow, kg/hr', function(j){
      var v = num(j.totalSteamUsed); if (v === null) v = num(j.eqSteamUsed); return fix(v,2); }],
  ['r','Steam / cooling water inlet, °C', function(j){
      return fix(num(j.operation === 'Cooling' ? j.coolingWaterIn : j.steamTempIn),1); }],
  ['r','Steam / cooling water outlet, °C',function(j){
      return fix(num(j.operation === 'Cooling' ? j.coolingWaterOut : j.steamTempOut),1); }],
  ['r','Water inlet, °C',                 function(j){ return fix(num(j.waterTempBefore),1); }],
  ['r','Water outlet, °C',                function(j){ return fix(num(j.waterTempAfter),1); }],
  ['r','Jet heat exchange performance, %',function(j){
      var v = num(j.operation === 'Cooling' ? j.coolingOption : j.jetExchangeEfficiency);
      return { v:fix(v,1), tone:(v === null ? null : (v < 60 ? 'bad' : 'ok')) }; }],

  ['g','Financial calculation'],
  ['r','Total savings (A+B+C), ₹',        function(j){ return { v:inr(jetTotals(j).total), tone:'head' }; }],
  ['r','Total investment, ₹',             function(j){ return inr(jetTotals(j).invest); }],
  ['r','ROI in months',                   function(j){ var t = jetTotals(j);
      return { v:months(t.roi), tone:(t.roi === null ? null : (t.roi <= 24 ? 'ok' : (t.roi <= 60 ? 'watch' : 'bad'))) }; }]
];

function jetFuel(steamKgHr){
  var s = num(steamKgHr), e = num(S.jetCost.evaporationRatio);
  return (s !== null && e) ? s / e : null;
}

function buildJets(B){
  var R = jetsRollUp();
  var jets = S.jets;

  B.push(blk(bH(2,'Performance assessment of jet machine')));

  /* --- methodology ------------------------------------------------- */
  B.push(blk(bH(3,'Methodology followed for jet analysis')));
  B.push(blk(bP('Plant has installed ' + jets.length + ' Nos. of steam jet dyeing machines in the plant premises. ' +
    'A detailed thermal study of the jet was performed on each individual jet in its heating state and the losses ' +
    'were derived. The following measurements were taken on every machine:')));
  B.push(blk(bUL(DEFAULTS.jetMethod)));

  B.push(blk(bH(3,'Basis of calculation')));
  B.push(tblBlock(['Parameter','Symbol / basis','Value'], [
    ['Evaporation ratio of fuel','Steam generated per kg of fuel', fix(num(S.jetCost.evaporationRatio),2) + ' kg/kg'],
    ['Fuel cost', (S.jetCost.fuelName || 'Coal') + ', delivered', '₹ ' + fix(num(S.jetCost.fuelCost),2) + ' /kg'],
    ['Electricity unit rate','Landed cost per kWh', '₹ ' + fix(num(S.jetCost.unitRate),2) + ' /kWh'],
    ['Insulation cost','Standard LRB insulation', '₹ ' + inr(num(S.jetCost.insulationCost)) + ' per Sq. Mtr'],
    ['Jet pump investment','Replacement, per pump', '₹ ' + inr(num(S.jetCost.pumpInvestmentCost)) + ' /-'],
    ['Steam trap replacement','Per faulty trap', '₹ ' + inr(num(S.jetCost.trapReplacementCost)) + ' /-'],
    ['Annual operating days','Working days considered', inr(num(S.jetCost.days) || 350) + ' days']
  ], { colw:['34%','40%','26%'] }));
  B.push(blk(bNote('Insulation and trap savings are computed on each machine’s own recorded heating hours per day; ' +
    'pump savings on its recorded running hours per day. Pump investment is counted only where measured efficiency is ' +
    'below 40 %, and trap investment only where the trap is passing or the drain sits before the trap — so no machine ' +
    'carries an investment for a fault it does not have.')));

  /* --- dashboard --------------------------------------------------- */
  B.push(blk(bH(3,'Jet analysis summary')));
  B.push(blk(bKPI([
    ['Jets surveyed', inr(R.n)],
    ['Steam saving', fix(R.steam,1) + ' kg/hr'],
    ['Total saving / year', rupees(R.total)],
    ['Avg pump efficiency', pct(R.avgEff)]
  ])));

  if (R.passing.length) B.push(blk(bNote(R.passing.length + ' steam trap' + (R.passing.length > 1 ? 's are' : ' is') +
    ' passing live steam to drain — attend on ' + R.passing.join(', ') + '.', 'bad')));
  if (R.weak.length) B.push(blk(bNote(R.weak.length + ' circulation pump' + (R.weak.length > 1 ? 's are' : ' is') +
    ' operating below 40 % efficiency — replace on ' + R.weak.join(', ') + '.', 'bad')));
  if (!R.passing.length && !R.weak.length) B.push(blk(bNote(
    'No passing traps and no pump below 40 % efficiency were found. The saving below is the insulation stream alone.', 'ok')));

  var labels = jets.map(function(j){ return j.jetNo; });

  B.push(blk(bChart(chartBarsRef(labels,
    jets.map(function(j){ return num(j.steamSaving) || 0; }),
    'Steam saving per jet (kg/hr)', 'kg/hr', { color:SERIES[3] }),
    'Steam recoverable on each machine by bringing the uninsulated body up to standard LRB insulation.')));

  B.push(blk(bChart(chartBarsRef(labels,
    jets.map(function(j){ return num(j.pumpEfficiency) || 0; }),
    'Pump efficiency per jet (%) — 40 % benchmark', '%', {
      ref:{ value:40, label:'40 %' },
      colorAt:function(v){ return (v !== null && v < 40) ? C.bad : SERIES[0]; } }),
    'Bars below the dashed line are the pumps carrying a replacement recommendation.')));

  var opKeys = Object.keys(R.op).filter(function(k){ return R.op[k] > 0; });
  B.push(blk(bChart(chartDonut(
    opKeys.map(function(k){ return { name:k, value:R.op[k], color:JET_OP_COLOR[k] || C.ink3 }; }),
    'Operation mix at the time of survey',
    { centre:String(R.n), centreSub:'jets', fmt:function(v){ return inr(v) + ' jets'; } }),
    'The state each machine was found in — heat-exchange performance is judged against the branch that applies.')));

  B.push(blk(bChart(chartDonut([
    { name:'Insulation', value:R.ins,  color:JET_STREAM_COL.Insulation },
    { name:'Pump replacement', value:R.pump, color:JET_STREAM_COL.Pump },
    { name:'Steam trap', value:R.trap, color:JET_STREAM_COL.Trap }
  ], 'Annual saving breakdown (₹/yr)',
    { centre:(R.total/100000).toFixed(1), centreSub:'₹ Lac/yr',
      fmt:function(v){ return '₹ ' + inr(Math.round(v)); } }),
    'Where the money is. Investment across all three streams is ' + rupees(R.invest) +
    (R.roi !== null ? ', giving a blended payback of ' + months(R.roi) + '.' : '.'))));

  /* --- overview ---------------------------------------------------- */
  B.push(blk(bH(3,'Jets overview')));
  B.push(tblBlock(['Jet no.','Operation','Pump eff. %','Heat exchange %','Trap status','Steam saving kg/hr','Saving ₹/yr','Best ROI'],
    jets.map(function(j){
      var t = jetTotals(j), e = num(j.pumpEfficiency);
      var hx = num(j.operation === 'Cooling' ? j.coolingOption : j.jetExchangeEfficiency);
      var roiList = [num(j.insRoiMonths), num(j.pumpRoiMonths), num(j.trapRoiMonths)]
        .filter(function(v){ return v !== null && v > 0; });
      var best = roiList.length ? Math.min.apply(null, roiList) : null;
      return [j.jetNo, j.operation || '—',
        { v:fix(e,1), tone:(e === null ? null : (e < 40 ? 'bad' : (e < 55 ? 'watch' : 'ok'))) },
        { v:fix(hx,1), tone:(hx === null ? null : (hx < 60 ? 'bad' : 'ok')) },
        { v:j.trapStatus || '—', tone:(j.trapStatus === 'Trap Passing' ? 'bad' : null) },
        fix(num(j.steamSaving),2), inr(t.total),
        { v:months(best), tone:(best === null ? null : (best <= 24 ? 'ok' : null)) }];
    }).concat([[
      { v:'Total', tone:'head' }, { v:'', tone:'head' }, { v:pct(R.avgEff), tone:'head' },
      { v:'', tone:'head' }, { v:R.passing.length + ' passing', tone:'head' },
      { v:fix(R.steam,1), tone:'head' }, { v:inr(R.total), tone:'head' },
      { v:months(R.roi), tone:'head' }]]),
    { size:7.8, colw:['12%','12%','12%','13%','15%','14%','12%','10%'] }));

  /* --- per-jet detail, five to a table ------------------------------ */
  B.push(blk(bH(3,'Performance assessment of jet')));
  B.push(blk(bP('Each machine is reported against the same spine of measurements, five machines to a table. ' +
    'A. insulation, B. pump and C. steam trap are the three independent saving streams; the financial block at ' +
    'the foot of each column adds only the streams that machine actually earns.')));

  for (var start = 0; start < jets.length; start += 5){
    var grp = jets.slice(start, start + 5);
    /* The tag the plant uses is already "JET-01"; prefixing it again gives
       "Jet JET-01" in every column header. */
    var head = ['Parameter'].concat(grp.map(function(j){
      return /^jet/i.test(j.jetNo) ? j.jetNo : 'Jet ' + j.jetNo; }));
    var ncol = head.length;
    var rows = [];
    JET_ROWS.forEach(function(spec){
      if (spec[0] === 'g'){
        rows.push([{ v:spec[1].toUpperCase(), tone:'head', span:ncol }]);
      } else {
        rows.push([spec[1]].concat(grp.map(function(j){ return spec[2](j); })));
      }
    });
    var colw = ['34%'].concat(grp.map(function(){ return (66 / grp.length).toFixed(1) + '%'; }));
    B.push(tblBlock(head, rows, {
      size:7.4, colw:colw,
      title:'Jets ' + (start + 1) + '–' + Math.min(start + 5, jets.length) + ' of ' + jets.length,
      caption:'* Annual savings computed on the machine’s own recorded operating hours and ' +
              inr(num(S.jetCost.days) || 350) + ' working days.'
    }));
  }

  /* --- observations ------------------------------------------------- */
  var obs = jets.filter(function(j){ return j.observation; });
  if (obs.length){
    B.push(blk(bH(3,'Observations recorded at the machine')));
    B.push(tblBlock(['Jet no.','Observation'],
      obs.map(function(j){ return [/^jet/i.test(j.jetNo) ? j.jetNo : 'Jet ' + j.jetNo, j.observation]; }),
      { colw:['16%','84%'] }));
  }

  if (S.jetThermal && S.jetThermal.length){
    B.push(blk(bH(3,'Thermal imaging of jet')));
    S.jetThermal.forEach(function(t){
      B.push(blk(bImg(t.img, (t.jetNo ? 'Jet ' + t.jetNo + ' — ' : '') + (t.caption || 'Thermal image'), 190)));
      if (t.note) B.push(blk(bNote(t.note)));
    });
  }

  ledgerFor(B, 'jets');
}
