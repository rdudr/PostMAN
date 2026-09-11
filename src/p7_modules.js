/* ===================================================================
   UTILITY MODULES - the swappable middle of the report.
   Each one owns its own calculations and writes its findings into the
   shared Recommendation Ledger.
   =================================================================== */

/* Excess air from flue O2, and the dry-flue-gas loss - the two numbers the
   boiler and thermopack sections both turn on. */
function excessAir(o2){ var v = num(o2); return (v === null || v >= 21) ? null : (v / (21 - v)) * 100; }
function dryFlueLoss(o2, tf, ta, gcv){
  var ea = excessAir(o2), g = num(gcv), Tf = num(tf), Ta = num(ta);
  if (ea === null || !g || Tf === null || Ta === null) return null;
  /* m ~ theoretical air (11.6 kg/kg for typical liquid/solid fuel) scaled by excess air */
  var m = 11.6 * (1 + ea/100);
  return ((m * 0.23 * (Tf - Ta)) / g) * 100;
}

function fuelBurnerCard(obj, title){
  var c = card(title, 'Indirect (heat-loss) method. Excess air and dry-flue-gas loss are computed from the flue readings and the GCV in the Cost register.');
  c.appendChild(gridOf([
    fNum(obj,'o2','Flue O₂ %'),
    fNum(obj,'co','CO ppm'),
    fNum(obj,'tf','Flue gas temp °C'),
    fNum(obj,'ta','Ambient temp °C'),
    fNum(obj,'radiation','Radiation & unaccounted %')
  ]));
  var ea = excessAir(obj.o2), dfl = dryFlueLoss(obj.o2, obj.tf, obj.ta, S.costs.gcv);
  var eff = (dfl === null) ? null : 100 - dfl - (num(obj.radiation) || 0);
  var k = el('div'); k.className='kpis';
  [['Excess air', ea === null ? '—' : pct(ea)],
   ['Dry flue gas loss', dfl === null ? '—' : pct(dfl)],
   ['Efficiency (indirect)', eff === null ? '—' : pct(eff)]].forEach(function(p){
    var d = el('div'); d.className='kpi';
    d.appendChild(el('span','', p[0])).className='k';
    d.appendChild(el('span','', p[1])).className='v';
    k.appendChild(d);
  });
  c.appendChild(k);
  if (num(obj.o2) !== null && num(obj.o2) > 6)
    c.appendChild(el('p','', 'O₂ of ' + fix(obj.o2,2) + ' % is above the 4–6 % band for efficient combustion. Burner tuning is the usual recommendation here.')).className='callout';
  return c;
}
function directMethodCard(obj){
  var c = card('Direct method', 'Steam output against fuel input.');
  c.appendChild(gridOf([
    fNum(obj,'steam','Steam generated kg/hr'),
    fNum(obj,'feedTemp','Feed water temp °C'),
    fNum(obj,'steamEnthalpy','Steam enthalpy kcal/kg'),
    fNum(obj,'fuel','Fuel consumed kg/hr'),
    fNum(obj,'pressure','Steam pressure bar')
  ]));
  var st = num(obj.steam), fw = num(obj.feedTemp), h = num(obj.steamEnthalpy),
      fu = num(obj.fuel), g = num(S.costs.gcv);
  var eff = (st && h !== null && fw !== null && fu && g) ? ((st * (h - fw)) / (fu * g)) * 100 : null;
  var er = (st && fu) ? st/fu : null;
  var k = el('div'); k.className='kpis';
  [['Evaporation ratio', fix(er)], ['Efficiency (direct)', eff === null ? '—' : pct(eff)]].forEach(function(p){
    var d = el('div'); d.className='kpi';
    d.appendChild(el('span','', p[0])).className='k';
    d.appendChild(el('span','', p[1])).className='v';
    k.appendChild(d);
  });
  c.appendChild(k);
  return c;
}
function specCard(rows, title, addLabel){
  var c = card(title);
  c.appendChild(tableEditor(rows, [
    { k:'p', t:'Parameter', type:'text' },
    { k:'v', t:'Value', type:'text' }
  ], { addLabel: addLabel || '+ Add specification' }));
  return c;
}

FORMS.boiler = function(w){
  w.appendChild(specCard(S.boiler.spec, 'Technical specification of boiler'));
  w.appendChild(directMethodCard(S.boiler.direct));
  w.appendChild(fuelBurnerCard(S.boiler.indirect, 'Indirect method — flue gas analysis'));
  var c = card('Observation'); c.appendChild(fArea(S.boiler,'obs','Observation in boiler flue gas assessment'));
  w.appendChild(c);
};
FORMS.tfh = function(w){
  w.appendChild(specCard(S.tfh.spec, 'Technical details — thermic oil heater'));
  w.appendChild(directMethodCard(S.tfh.direct));
  w.appendChild(fuelBurnerCard(S.tfh.indirect, 'Thermopack indirect method'));
  var c = card('Observation'); c.appendChild(fArea(S.tfh,'obs','Observation'));
  w.appendChild(c);
};

/* ---- Air compressor. The model mirrors A-CMP so its export drops straight in. ---- */
function toCFM(v, unit){
  var n = num(v); if (n === null) return null;
  switch (unit){
    case 'CFM': return n;
    case 'm3/min': return n * 35.3147;
    case 'l/s': return n * 0.06 * 35.3147;
    case 'CMH': return (n/60) * 35.3147;
    default: return n;
  }
}
FORMS.compressor = function(w){
  var c = card('Air compressors',
    'Design SEC and air generation come from the nameplate; actual comes from the FAD or pump-up test. The gap between them is the recommendation.');
  c.appendChild(btn('+ Add compressor', function(){
    S.compressor.push({ tag:'', make:'', type:'Screw', year:'', ratedCap:null, capUnit:'CFM',
      ratedPressure:null, processPressure:null, ratedKw:null, motorEff:null,
      testType:'FAD', suctionArea:null, avgVelocity:null, pumpP1:null, pumpP2:null,
      pumpTime:null, tankVol:null, measuredKw:null, runningPressure:null,
      loadHrs:null, unloadHrs:null, totalHrs:null, hoursPerDay:24, obs:'' });
    save(); renderAll();
  }));
  w.appendChild(c);

  S.compressor.forEach(function(k, i){
    var b = card('Compressor ' + (i+1) + (k.tag ? ' — ' + k.tag : ''));
    b.appendChild(gridOf([
      fText(k,'tag','Machine tag'), fText(k,'make','Make / model'),
      fSelect(k,'type','Type', ['Screw','Reciprocating','Centrifugal','Scroll']),
      fText(k,'year','Year'),
      fNum(k,'ratedCap','Rated capacity'),
      fSelect(k,'capUnit','Capacity unit', ['CFM','m3/min','l/s','CMH']),
      fNum(k,'ratedPressure','Rated pressure bar'),
      fNum(k,'processPressure','Process pressure bar'),
      fNum(k,'ratedKw','Rated kW'),
      fNum(k,'motorEff','Motor efficiency %')
    ]));
    b.appendChild(fSelect(k,'testType','Capacity test', ['FAD','Pump-up']));
    if (k.testType === 'FAD'){
      b.appendChild(gridOf([
        fNum(k,'suctionArea','Suction area m²'),
        fNum(k,'avgVelocity','Mean velocity m/s'),
        fNum(k,'measuredKw','Measured power kW'),
        fNum(k,'runningPressure','Running pressure bar')
      ]));
    } else {
      b.appendChild(gridOf([
        fNum(k,'pumpP1','P1 bar'), fNum(k,'pumpP2','P2 bar'),
        fNum(k,'pumpTime','Time s'), fNum(k,'tankVol','Receiver volume m³'),
        fNum(k,'measuredKw','Measured power kW'),
        fNum(k,'runningPressure','Running pressure bar')
      ]));
    }
    b.appendChild(gridOf([
      fNum(k,'loadHrs','Loaded hours'), fNum(k,'unloadHrs','Unloaded hours'),
      fNum(k,'totalHrs','Total run hours'), fNum(k,'hoursPerDay','Hours per day')
    ]));
    var d = compressorCalc(k);
    var kp = el('div'); kp.className='kpis';
    [['Rated CFM', fix(d.ratedCFM,1)], ['Design SEC', fix(d.designSEC,3) + ' kW/CFM'],
     ['Actual CFM', fix(d.actualCFM,1)], ['Actual SEC', fix(d.actualSEC,3) + ' kW/CFM'],
     ['Air gen', fix(d.actualAirGen,2) + ' CFM/kW'],
     ['SEC deviation', d.deviation === null ? '—' : pct(d.deviation)],
     ['% loaded', d.loadPct === null ? '—' : pct(d.loadPct)]].forEach(function(p){
      var x = el('div'); x.className='kpi';
      x.appendChild(el('span','', p[0])).className='k';
      x.appendChild(el('span','', p[1])).className='v';
      kp.appendChild(x);
    });
    b.appendChild(kp);
    if (d.deviation !== null && d.deviation > 10)
      b.appendChild(el('p','', 'Actual SEC is ' + fix(d.deviation,1) +
        ' % above design. Overhaul or spares replacement is the usual recommendation.')).className='callout';
    b.appendChild(fArea(k,'obs','Observation'));
    b.appendChild(btn('Delete compressor', function(){ S.compressor.splice(i,1); save(); renderAll(); }));
    w.appendChild(b);
  });
};
function compressorCalc(k){
  var ratedCFM = toCFM(k.ratedCap, k.capUnit);
  var ratedKw = num(k.ratedKw);
  var designSEC = (ratedKw && ratedCFM) ? ratedKw / ratedCFM : null;
  var designAirGen = (ratedKw && ratedCFM) ? ratedCFM / ratedKw : null;
  var actualCFM = null;
  if (k.testType === 'FAD'){
    var a = num(k.suctionArea), v = num(k.avgVelocity);
    if (a !== null && v !== null) actualCFM = a * v * 2118.88;   /* m³/s -> CFM */
  } else {
    var p1 = num(k.pumpP1), p2 = num(k.pumpP2), t = num(k.pumpTime), vol = num(k.tankVol);
    if (p1 !== null && p2 !== null && t && vol)
      actualCFM = ((p2 - p1) * vol * 60 / (1.01325 * t)) * 35.3147;
  }
  var mkw = num(k.measuredKw);
  var actualSEC = (mkw && actualCFM) ? mkw / actualCFM : null;
  var actualAirGen = (mkw && actualCFM) ? actualCFM / mkw : null;
  var deviation = (designSEC && actualSEC) ? ((actualSEC - designSEC) / designSEC) * 100 : null;
  var lh = num(k.loadHrs), th = num(k.totalHrs);
  var loadPct = (lh !== null && th) ? (lh/th)*100 : null;
  var annualKwh = (mkw && num(k.hoursPerDay)) ? mkw * num(k.hoursPerDay) * (num(S.costs.days) || 350) : null;
  return { ratedCFM:ratedCFM, designSEC:designSEC, designAirGen:designAirGen,
           actualCFM:actualCFM, actualSEC:actualSEC, actualAirGen:actualAirGen,
           deviation:deviation, loadPct:loadPct, annualKwh:annualKwh };
}

FORMS.coolingTower = function(w){
  var c = card('Cooling towers', 'Range, approach and effectiveness from the measured temperatures.');
  c.appendChild(tableEditor(S.coolingTower, [
    { k:'name', t:'Cooling tower', type:'text' },
    { k:'ratedTR', t:'Rated TR', type:'num' },
    { k:'hotIn', t:'Hot water in °C', type:'num' },
    { k:'coldOut', t:'Cold water out °C', type:'num' },
    { k:'wetBulb', t:'Wet bulb °C', type:'num' },
    { k:'flow', t:'Flow m³/hr', type:'num' },
    { k:'fanKw', t:'Fan kW', type:'num' },
    { t:'Range', calc:function(r){ var a=num(r.hotIn), b=num(r.coldOut); return (a!==null&&b!==null)?fix(a-b):'—'; } },
    { t:'Approach', calc:function(r){ var b=num(r.coldOut), wb=num(r.wetBulb); return (b!==null&&wb!==null)?fix(b-wb):'—'; } },
    { t:'Effectiveness', calc:function(r){
        var a=num(r.hotIn), b=num(r.coldOut), wb=num(r.wetBulb);
        if (a===null||b===null||wb===null||(a-wb)===0) return '—';
        return pct(((a-b)/(a-wb))*100);
      } },
    { t:'Heat rejected kcal/hr', calc:function(r){
        var a=num(r.hotIn), b=num(r.coldOut), f=num(r.flow);
        return (a!==null&&b!==null&&f)?inr(Math.round(f*1000*(a-b))):'—';
      } }
  ], { addLabel:'+ Add cooling tower', recalc:true }));
  w.appendChild(c);
};

FORMS.chiller = function(w){
  w.appendChild(specCard(S.chiller.spec, 'Name plate details of chiller'));
  var c = card('Performance readings', 'kW/TR and COP are computed per reading.');
  c.appendChild(tableEditor(S.chiller.readings, [
    { k:'time', t:'Time', type:'text', w:'96px' },
    { k:'flow', t:'Chilled water flow m³/hr', type:'num' },
    { k:'tin', t:'Evap in °C', type:'num' },
    { k:'tout', t:'Evap out °C', type:'num' },
    { k:'kw', t:'Compressor kW', type:'num' },
    { t:'TR', calc:function(r){
        var f=num(r.flow), a=num(r.tin), b=num(r.tout);
        return (f&&a!==null&&b!==null)?fix((f*1000*(a-b))/3024,1):'—'; } },
    { t:'kW/TR', calc:function(r){
        var f=num(r.flow), a=num(r.tin), b=num(r.tout), k=num(r.kw);
        if (!f||a===null||b===null||!k) return '—';
        var tr=(f*1000*(a-b))/3024; return tr>0?fix(k/tr,3):'—'; } },
    { t:'COP', calc:function(r){
        var f=num(r.flow), a=num(r.tin), b=num(r.tout), k=num(r.kw);
        if (!f||a===null||b===null||!k) return '—';
        var tr=(f*1000*(a-b))/3024; return tr>0?fix((tr*3.517)/k,2):'—'; } }
  ], { addLabel:'+ Add reading', recalc:true }));
  c.appendChild(fArea(S.chiller,'obs','Observation'));
  w.appendChild(c);
};

FORMS.pumps = function(w){
  var c = card('Pump performance', 'Hydraulic power, shaft power and efficiency, following the BEE method.');
  c.appendChild(tableEditor(S.pumps, [
    { k:'name', t:'Pump', type:'text' },
    { k:'make', t:'Make', type:'text' },
    { k:'ratedKw', t:'Rated kW', type:'num' },
    { k:'flow', t:'Flow m³/hr', type:'num' },
    { k:'head', t:'Head m', type:'num' },
    { k:'motorKw', t:'Motor input kW', type:'num' },
    { k:'motorEff', t:'Motor eff %', type:'num' },
    { t:'Hydraulic kW', calc:function(r){
        var qq=num(r.flow), h=num(r.head);
        return (qq&&h!==null)?fix((qq/3600)*1000*9.81*h/1000,2):'—'; } },
    { t:'Shaft kW', calc:function(r){
        var m=num(r.motorKw), e=num(r.motorEff);
        return (m&&e)?fix(m*e/100,2):'—'; } },
    { t:'Pump eff %', calc:function(r){
        var qq=num(r.flow), h=num(r.head), m=num(r.motorKw), e=num(r.motorEff);
        if (!qq||h===null||!m||!e) return '—';
        var ph=(qq/3600)*1000*9.81*h/1000, ps=m*e/100;
        return ps>0?fix((ph/ps)*100,1):'—'; } }
  ], { addLabel:'+ Add pump', recalc:true }));
  w.appendChild(c);
};

FORMS.jets = function(w){
  var cc = card('Jet costing parameters',
    'These are JET-Eff\u2019s own six cost fields. They arrive with an imported workbook and can be overridden here; every jet is recomputed and the ledger rewritten the moment one changes, so the report can never quote a rate it did not use.');
  cc.appendChild(gridOf([
    fNum(S.jetCost, 'evaporationRatio', 'Evaporation ratio, kg/kg'),
    fNum(S.jetCost, 'fuelCost', 'Fuel cost, \u20b9/kg'),
    fNum(S.jetCost, 'unitRate', 'Unit rate, \u20b9/kWh'),
    fNum(S.jetCost, 'insulationCost', 'Insulation cost, \u20b9/Sq.Mtr'),
    fNum(S.jetCost, 'pumpInvestmentCost', 'Pump investment, \u20b9'),
    fNum(S.jetCost, 'trapReplacementCost', 'Trap replacement, \u20b9'),
    fNum(S.jetCost, 'days', 'Operating days / year'),
    fText(S.jetCost, 'fuelName', 'Fuel name')
  ], true));
  cc.appendChild(btn('Recompute all jets and rewrite recommendations', function(){
    S.jets = S.jets.map(function(j){ return recalcJet(j, S.jetCost); });
    var n = syncJetLedger(); save(); renderAll();
    alert('Recomputed ' + S.jets.length + ' jets. ' + n + ' recommendation(s) updated in the ledger.');
  }));
  w.appendChild(cc);

  var c = card('Jet machines',
    'Imported from JET-Eff with all ' + JET_FIELDS.length + ' columns, or typed here. The report prints the full transposed assessment per machine; this grid is the quick-edit view over the same records.');
  c.appendChild(tableEditor(S.jets, [
    { k:'jetNo', t:'Jet no.', type:'text', w:'86px' },
    { k:'jetType', t:'Type', type:'select', opts:['U Jet','Long Jet'] },
    { k:'insulation', t:'Insulation', type:'select', opts:['Insulated','UnInsulated','Half Insulated'] },
    { k:'capacity', t:'Capacity kg', type:'num' },
    { k:'surfaceArea', t:'Surface area m²', type:'num' },
    { k:'avgBodyTemp', t:'Avg body °C', type:'num' },
    { k:'ambientTemp', t:'Ambient °C', type:'num' },
    { k:'steamSaving', t:'Steam saving kg/hr', type:'num' },
    { k:'pumpEfficiency', t:'Pump eff %', type:'num' },
    { k:'operation', t:'Process', type:'select', opts:['Heating','Cooling','Hold'] },
    { k:'flow', t:'Flow CMH', type:'num' },
    { k:'pumpPower', t:'Pump kW', type:'num' },
    { k:'pumpSavingKw', t:'Pump saving kW', type:'num' },
    { k:'runningHrPerDay', t:'Running hr/day', type:'num' },
    { k:'heatingTimePerDay', t:'Heating hr/day', type:'num' },
    { k:'trapStatus', t:'Trap', type:'select', opts:['','Working OK','Trap Passing'] },
    { k:'trapEqSteamLoss', t:'Trap loss kg/hr', type:'num' },
    { t:'Fuel saving t/yr', calc:function(r){
        return fix(num(recalcJet(r, S.jetCost).insAnnualFuelSaving), 2); } },
    { t:'Total saving ₹/yr', calc:function(r){
        return inr(jetTotals(recalcJet(r, S.jetCost)).total); } },
    { t:'ROI', calc:function(r){ return months(jetTotals(recalcJet(r, S.jetCost)).roi); } }
  ], { addLabel:'+ Add jet', recalc:true }));
  w.appendChild(c);
};

FORMS.lux = function(w){
  var c = card('Area-wise lux measurement',
    'ILER bands follow the BEE method: ≥ 0.75 satisfactory, 0.51–0.74 review, ≤ 0.50 immediate attention. The report colours each row by its band.');
  c.appendChild(tableEditor(S.lux, [
    { k:'sr', t:'S.N.', type:'num', w:'52px' },
    { k:'location', t:'Location', type:'text' },
    { k:'area', t:'Area m²', type:'num' },
    { k:'lux', t:'Avg lux', type:'num' },
    { k:'watt', t:'Load W', type:'num' },
    { k:'target', t:'Target lux/W/m²', type:'num' },
    { t:'Measured lux/W/m²', calc:function(r){
        var l=num(r.lux), wt=num(r.watt), a=num(r.area);
        return (l&&wt&&a)?fix((l*a)/wt,1):'—'; } },
    { t:'ILER', calc:function(r){ var v = ilerOf(r); return v===null?'—':fix(v,2); } },
    { t:'Assessment', calc:function(r){ return ilerBand(ilerOf(r)); } }
  ], { addLabel:'+ Add location', recalc:true, onAdd:function(r,i){ r.sr = i+1; } }));
  w.appendChild(c);
};
function ilerOf(r){
  var l=num(r.lux), wt=num(r.watt), a=num(r.area), t=num(r.target);
  if (!l||!wt||!a||!t) return null;
  return ((l*a)/wt)/t;
}
function ilerBand(v){
  if (v === null) return '—';
  if (v >= 0.75) return 'Satisfactory';
  if (v >= 0.51) return 'Review';
  if (v >= 0.375) return 'Urgent';
  return 'Immediate';
}

FORMS.solar = function(w){
  var c = card('Solar plant monitoring');
  c.appendChild(gridOf([ fNum(S.solar,'capacity','Installed capacity kWp') ]));
  c.appendChild(tableEditor(S.solar.rows, [
    { k:'month', t:'Month', type:'text', w:'110px' },
    { k:'gen', t:'Generation kWh', type:'num' },
    { k:'irr', t:'Irradiance kWh/m²', type:'num' },
    { t:'CUF %', calc:function(r){
        var g=num(r.gen), cap=num(S.solar.capacity);
        return (g&&cap)?fix((g/(cap*24*30))*100,1):'—'; } }
  ], { addLabel:'+ Add month', recalc:true }));
  c.appendChild(fArea(S.solar,'obs','Observation'));
  w.appendChild(c);
};

FORMS.earth = function(w){
  var c = card('Earth loop resistance', 'Anything above 1 Ω for an equipment earth prints red.');
  c.appendChild(tableEditor(S.earth, [
    { k:'sr', t:'S.N.', type:'num', w:'52px' },
    { k:'location', t:'Earth pit / location', type:'text' },
    { k:'ohm', t:'Resistance Ω', type:'num' },
    { k:'limit', t:'Limit Ω', type:'num' },
    { t:'Status', calc:function(r){
        var v=num(r.ohm), l=num(r.limit)||1;
        return v===null?'—':(v<=l?'Within limit':'Exceeds limit'); } }
  ], { addLabel:'+ Add earth pit', recalc:true, onAdd:function(r,i){ r.sr=i+1; r.limit=1; } }));
  w.appendChild(c);
};

FORMS.machines = function(w){
  var c = card('Machine monitoring',
    'The free-form module. A module is only worth writing at the third plant that needs it — this one absorbs the first two.');
  c.appendChild(btn('+ Add machine section', function(){
    S.machines.push({ title:'', spec:[], narrative:'', obs:'' }); save(); renderAll();
  }));
  w.appendChild(c);
  S.machines.forEach(function(m, i){
    var b = card('Machine ' + (i+1) + (m.title ? ' — ' + m.title : ''));
    b.appendChild(fText(m,'title','Heading','Bombi Calender Machine'));
    b.appendChild(tableEditor(m.spec, [
      { k:'p', t:'Parameter', type:'text' }, { k:'v', t:'Value', type:'text' }
    ], { addLabel:'+ Add parameter' }));
    b.appendChild(fArea(m,'narrative','Narrative'));
    b.appendChild(fArea(m,'obs','Observation'));
    b.appendChild(btn('Delete', function(){ S.machines.splice(i,1); save(); renderAll(); }));
    w.appendChild(b);
  });
};

FORMS.sop = function(w){
  var c = card('Guidelines / SOP to reduce resource consumption');
  c.appendChild(tableEditor(S.sop, [
    { k:'area', t:'Area', type:'text' },
    { k:'guideline', t:'Guideline', type:'text' }
  ], { addLabel:'+ Add guideline' }));
  w.appendChild(c);
};
