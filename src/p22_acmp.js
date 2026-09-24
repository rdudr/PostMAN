/* ===================================================================
   AIR COMPRESSORS - the A-CMP app's measurements, printed as the app
   itself prints them.

   A-CMP measures a compressor two ways: an anemometer traverse across the
   suction duct (FAD), or a receiver pump-up. Its September 2026 release
   changed the pump-up in a way the report has to follow: the air does not
   only fill the receiver, it fills the pipe into it and the pipe out of
   it, so the test is now worked from the MAIN VOLUME

       main volume = tank + inlet pipe + outlet pipe

   with each pipe measured by a tape around it (perimeter, not diameter:
   for perimeter P the bore is P^2/4pi). Leaving the pipes out makes the
   measured delivery read low, so a report that ignored them would quote a
   worse machine than the plant has. The same release added the lap table
   with an energy-meter column, the three-reading load/unload hour meter
   with its load bands, and the fleet view the report opens with.

   Everything here mirrors lib/compressor-calc.ts and lib/pdf-generator.ts
   in A-CMP; docs/POSTMAN.md there is the contract. The figures the app
   computed are always preferred - this file recomputes only to say so
   when the two disagree.
   =================================================================== */

var M3MIN_TO_CFM = 35.3147;
var ATM_BAR = 1.013;
var SEC_TOLERANCE_PCT = 10;

function acJson(raw, fallback){
  if (typeof raw !== 'string' || !raw) return fallback;
  try { var v = JSON.parse(raw); return v === null || v === undefined ? fallback : v; }
  catch (e){ return fallback; }
}
/* Bore area of a pipe from the tape measurement around it, m^2. */
function pipeAreaM2(perimeter, unit){
  var p = num(perimeter);
  if (p === null || p <= 0) return null;
  var u = unit || (p > 50 ? 'mm' : 'm');
  var pm = u === 'm' ? p : u === 'cm' ? p / 100 : p / 1000;
  return (pm * pm) / (4 * Math.PI);
}
function pipeVolumeM3(perimeter, length, periUnit, lenUnit){
  var area = pipeAreaM2(perimeter, periUnit), l = num(length);
  if (area === null || l === null || l <= 0) return null;
  var u = lenUnit || (l > 100 ? 'mm' : 'm');
  var lm = u === 'm' ? l : u === 'cm' ? l / 100 : l / 1000;
  return area * lm;
}
function tankVolumeM3(k){
  var v = num(k.pumpTankVolume);
  if (v === null || v <= 0) return null;
  return /^l/i.test(String(k.pumpTankVolumeUnit || '')) ? v / 1000 : v;
}
/* tank + whichever pipes were measured, and how it was made up. */
function acMainVolume(k){
  var tank = num(k.pumpTankVolumeM3);
  if (tank === null) tank = tankVolumeM3(k);
  var inlet = k.pumpInletPipeActive ? (num(k.pumpInletPipeVolumeM3) !== null ? num(k.pumpInletPipeVolumeM3)
                : pipeVolumeM3(k.pumpInletPipePeri, k.pumpInletPipeLength, k.pumpInletPipePeriUnit, k.pumpInletPipeLenUnit)) : null;
  var outlet = k.pumpOutletPipeActive ? (num(k.pumpOutletPipeVolumeM3) !== null ? num(k.pumpOutletPipeVolumeM3)
                : pipeVolumeM3(k.pumpOutletPipePeri, k.pumpOutletPipeLength, k.pumpOutletPipePeriUnit, k.pumpOutletPipeLenUnit)) : null;
  var parts = [tank, inlet, outlet].filter(function(v){ return v !== null && v > 0; });
  var total = num(k.pumpMainVolumeM3Calc);
  if (total === null) total = num(k.pumpMainVolumeM3);
  if (total === null) total = parts.length ? parts.reduce(function(s, v){ return s + v; }, 0) : null;
  var bits = [];
  if (tank !== null) bits.push('tank ' + tank.toFixed(3));
  if (inlet !== null) bits.push('inlet pipe ' + inlet.toFixed(3));
  if (outlet !== null) bits.push('outlet pipe ' + outlet.toFixed(3));
  return { tank:tank, inlet:inlet, outlet:outlet, total:total, basis: bits.length ? bits.join(' + ') + ' m³' : 'not measured' };
}
/* The pump-up laps, and what the energy meter did across them. */
function acLaps(k){ var a = acJson(k.pumpLapData, []); return Array.isArray(a) ? a : []; }
function acLapEnergy(laps){
  var stamped = laps.filter(function(l){ return num(l.timeSec) !== null; });
  var kwhs = laps.map(function(l){ return num(l.kwh); }).filter(function(v){ return v !== null; });
  var first = kwhs.length ? kwhs[0] : null, last = kwhs.length ? kwhs[kwhs.length - 1] : null;
  var used = (first !== null && last !== null && last >= first) ? last - first : null;
  var seconds = stamped.length ? num(stamped[stamped.length - 1].timeSec) : null;
  return { readings:kwhs.length, laps:laps.length, first:first, last:last, used:used, seconds:seconds,
           avgKw: (used !== null && seconds) ? (used * 3600) / seconds : null };
}
/* The three hour-meter readings, as taken and as differences. */
function acLuRows(k){
  var lu = acJson(k.luData, {});
  var col = function(key){ return Array.isArray(lu[key]) ? lu[key] : []; };
  var any = ['loadHours','unloadHours','totalRunHours'].some(function(key){
    return col(key).some(function(v){ return v !== '' && v !== null && v !== undefined; }); });
  if (!any) return null;
  var delta = function(key){
    var arr = col(key).map(num).filter(function(v){ return v !== null; });
    if (arr.length < 2) return null;
    var d = arr[arr.length - 1] - arr[0];
    return d > 0 ? d : null;
  };
  return { rows:[0,1,2].map(function(i){
      return { date:col('date')[i] || '', time:col('time')[i] || '',
               load:col('loadHours')[i], unload:col('unloadHours')[i], total:col('totalRunHours')[i],
               b020:col('band020')[i], b2040:col('band2040')[i], b4060:col('band4060')[i], b6080:col('band6080')[i], b80100:col('band80100')[i] }; }),
    load:delta('loadHours'), unload:delta('unloadHours'), total:delta('totalRunHours'), type:k.luType || 'SD' };
}
/* Design and actual for whichever test was done - pump-up wins when both
   are present, exactly as the app decides it. */
function acPerf(k){
  var d = compressorCalc(k);
  var verdict;
  if (!d.tested) verdict = { label:'No test recorded', tone:null };
  else if (d.deviation === null) verdict = { label:(d.actualCFM !== null ? 'Flow measured, no load kW' : 'Incomplete'), tone:null };
  else if (d.deviation > SEC_TOLERANCE_PCT) verdict = { label:'SEC ' + fix(d.deviation, 1) + ' % above design', tone:'bad' };
  else if (d.deviation > 0) verdict = { label:'Within tolerance', tone:'watch' };
  else verdict = { label:'Meets design', tone:'ok' };
  d.verdict = verdict;
  d.flowDev = (d.ratedCFM && d.actualCFM !== null) ? ((d.actualCFM - d.ratedCFM) / d.ratedCFM) * 100 : null;
  d.genDev = (d.designAirGen && d.actualAirGen !== null) ? ((d.actualAirGen - d.designAirGen) / d.designAirGen) * 100 : null;
  return d;
}
function acUploadStamp(){
  var u = S.acmpUpload;
  return u ? 'Compressor measurements: last uploaded data on ' + u.at + ' from ' + (u.by || 'the assessment team') +
    (u.file ? ' (' + u.file + ')' : '') + (u.exportDate ? '; exported from A-CMP on ' + u.exportDate : '') + '.' : '';
}
function acPct(v){ return v === null || v === undefined || !isFinite(v) ? '—' : (v >= 0 ? '+' : '') + fix(v, 1) + ' %'; }
function acUnit(v, d, unit){ return num(v) === null ? '—' : fix(num(v), d) + (unit ? ' ' + unit : ''); }

/* ------------------------------------------------------------------
   THE CHAPTER
   ------------------------------------------------------------------ */
function buildCompressorSection(B){
  var list = S.compressor || [];
  if (!list.length && !hasRecos('compressor')) return;
  B.push(blk(bH(2,'Performance assessment of air compressor')));
  if (acUploadStamp()) B.push(blk(bP(acUploadStamp(), { size:9, italic:true })));
  if (!list.length){ ledgerFor(B, 'compressor'); return; }

  var perf = list.map(function(k, i){ var d = acPerf(k); d.k = k; d.sr = i + 1; d.tag = k.tag || ('Compressor ' + (i + 1)); return d; });
  var totalKw = perf.reduce(function(s, p){ return s + (num(p.k.ratedKw) || 0); }, 0);
  var totalCfm = perf.reduce(function(s, p){ return s + (p.ratedCFM || 0); }, 0);
  var tested = perf.filter(function(p){ return p.tested; }).length;
  var flagged = perf.filter(function(p){ return p.deviation !== null && p.deviation > SEC_TOLERANCE_PCT; }).length;

  /* --- fleet --- */
  B.push(blk(bH(3,'Fleet summary')));
  B.push(blk(bP('Design ratings from the name-plates and the outcome of each machine’s performance test. Specific energy consumption (SEC) is the kW drawn per CFM of free air delivered — lower is better. A machine is flagged when its actual SEC is more than ' + SEC_TOLERANCE_PCT + ' % above the design value; overhaul or spares replacement is the usual recommendation.', { size:9.5 })));
  B.push(blk(bKPI([
    [list.length === 1 ? 'Compressor' : 'Compressors', String(list.length)],
    ['Installed rated power', fix(totalKw, 1) + ' kW'],
    ['Rated free air delivery', fix(totalCfm, 0) + ' CFM'],
    ['Performance tested', tested + ' of ' + list.length],
    ['Need attention', String(flagged)]
  ])));
  B.push(tblBlock(['Sr','Machine tag','Make / model','Type','Rated kW','Rated capacity','Rated CFM','Rated bar','Design SEC kW/CFM','Design air gen. CFM/kW'],
    perf.map(function(p){
      return [String(p.sr), p.tag, p.k.make || '—', p.k.type || '—', acUnit(p.k.ratedKw, 1),
        num(p.k.ratedCap) !== null ? fix(num(p.k.ratedCap), 1) + ' ' + (p.k.capUnit || '') : '—',
        fix(p.ratedCFM, 1), acUnit(p.k.ratedPressure, 1), fix(p.designSEC, 3), fix(p.designAirGen, 2)];
    }), { size:7.8, colw:['5%','13%','17%','11%','8%','12%','8%','7%','10%','9%'] }));

  B.push(blk(bH(3,'Performance test results')));
  B.push(tblBlock(['Sr','Machine tag','Test','Design CFM','Actual CFM','Flow dev.','Design SEC','Actual SEC','SEC dev.','Verdict'],
    perf.map(function(p){
      return [String(p.sr), p.tag, p.tested ? p.testType : '—', fix(p.ratedCFM, 1), fix(p.actualCFM, 1), acPct(p.flowDev),
        fix(p.designSEC, 3), fix(p.actualSEC, 3), acPct(p.deviation), { v:p.verdict.label, tone:p.verdict.tone }];
    }), { size:7.8, colw:['5%','13%','8%','9%','9%','8%','9%','9%','8%','22%'] }));

  /* --- the plant as a whole --- */
  var measuredKwTotal = perf.reduce(function(s, p){ return s + (p.measuredKw || 0); }, 0);
  var actualCfmTotal = perf.reduce(function(s, p){ return s + (p.actualCFM || 0); }, 0);
  var plantSec = (actualCfmTotal > 0 && measuredKwTotal > 0) ? measuredKwTotal / actualCfmTotal : null;
  var plantDesignSec = (totalCfm > 0 && totalKw > 0) ? totalKw / totalCfm : null;
  B.push(blk(bH(3,'Plant compressor profile')));
  B.push(tblBlock(['Sr','Machine tag','Type','Rated kW','Share of plant kW','Rated CFM','Share of plant air','Actual CFM','Actual kW/CFM','Status'],
    perf.map(function(p){
      var rKw = num(p.k.ratedKw) || 0, rCfm = p.ratedCFM || 0;
      return [String(p.sr), p.tag, p.k.type || '—', fix(rKw, 1), totalKw > 0 ? fix((rKw / totalKw) * 100, 1) + ' %' : '—',
        fix(rCfm, 0), totalCfm > 0 ? fix((rCfm / totalCfm) * 100, 1) + ' %' : '—', fix(p.actualCFM, 1), fix(p.actualSEC, 3),
        { v:p.verdict.label, tone:p.verdict.tone }];
    }).concat([[{v:'Plant total',tone:'head'}, {v:'',tone:'head'}, {v:'',tone:'head'}, {v:fix(totalKw, 1),tone:'head'}, {v:'100 %',tone:'head'},
      {v:fix(totalCfm, 0),tone:'head'}, {v:'100 %',tone:'head'}, {v:actualCfmTotal > 0 ? fix(actualCfmTotal, 1) : '—',tone:'head'},
      {v:plantSec !== null ? fix(plantSec, 3) : '—',tone:'head'},
      {v:(plantSec !== null && plantDesignSec !== null) ? (plantSec > plantDesignSec ? 'Above design' : 'At or below design') : '—',
       tone:(plantSec !== null && plantDesignSec !== null && plantSec > plantDesignSec) ? 'bad' : 'head'}]]),
    { size:7.6, colw:['5%','14%','11%','8%','11%','8%','11%','9%','9%','14%'] }));
  var tags = perf.map(function(p){ return p.tag; });
  B.push(blk(bChart(chartBars(tags, perf.map(function(p){ return num(p.k.ratedKw) || 0; }), 'Rated power by machine', 'kW', SERIES[0]))));
  B.push(blk(bChart(chartGrouped(tags, [
    { name:'Rated CFM', color:SERIES[0], values:perf.map(function(p){ return p.ratedCFM || 0; }) },
    { name:'Measured CFM', color:SERIES[1], values:perf.map(function(p){ return p.actualCFM || 0; }) }
  ], 'Air delivery — rated against measured', 'CFM'), 'Where the measured bar falls short of the rated one, the machine is making less air than its name-plate promises.')));
  if (plantSec !== null && plantDesignSec !== null){
    var gap = ((plantSec - plantDesignSec) / plantDesignSec) * 100;
    B.push(blk(bNote('Taken together the tested machines draw ' + fix(measuredKwTotal, 1) + ' kW to make ' + fix(actualCfmTotal, 0) +
      ' CFM, a plant specific energy consumption of ' + fix(plantSec, 3) + ' kW/CFM against ' + fix(plantDesignSec, 3) +
      ' kW/CFM by name-plate — ' + fix(Math.abs(gap), 1) + ' % ' + (gap > 0 ? 'above' : 'below') + ' design. ' +
      (gap > SEC_TOLERANCE_PCT ? 'Worth taking the flagged machines in hand first: they carry most of that gap.' : 'The fleet is running close to its design figures.'),
      gap > SEC_TOLERANCE_PCT ? 'bad' : 'ok')));
  }

  /* --- each machine --- */
  perf.forEach(function(p){
    var k = p.k;
    B.push(blk(bH(3, p.sr + '. ' + p.tag + [k.make, k.type, k.year ? 'YOM ' + k.year : ''].filter(Boolean).map(function(t){ return ' · ' + t; }).join(''))));
    B.push(tblBlock(null, [
      [{v:'Serial no.',tone:'head'}, k.serialNo || '—', {v:'Starter',tone:'head'}, k.starter || '—'],
      [{v:'Rated power',tone:'head'}, acUnit(k.ratedKw, 2, 'kW') + (num(k.ratedHp) !== null ? '  (' + fix(num(k.ratedHp), 1) + ' HP)' : ''), {v:'Rated speed',tone:'head'}, num(k.ratedRpm) !== null ? fix(num(k.ratedRpm), 0) + ' RPM' : '—'],
      [{v:'Rated capacity',tone:'head'}, num(k.ratedCap) !== null ? fix(num(k.ratedCap), 1) + ' ' + (k.capUnit || '') + '  (' + fix(p.ratedCFM, 1) + ' CFM)' : '—', {v:'Rated / process pressure',tone:'head'}, acUnit(k.ratedPressure, 1, 'bar') + '  /  ' + acUnit(k.processPressure, 1, 'bar')],
      [{v:'Rated current',tone:'head'}, acUnit(k.ratedCurrent, 1, 'A'), {v:'Motor efficiency',tone:'head'}, num(k.motorEff) !== null ? fix(num(k.motorEff), 1) + ' %' : '—'],
      [{v:'Design SEC',tone:'head'}, fix(p.designSEC, 3) + ' kW/CFM', {v:'Design air generation',tone:'head'}, fix(p.designAirGen, 2) + ' CFM/kW'],
      [{v:'Operating days',tone:'head'}, num(k.annualOperatingDays) !== null ? fix(num(k.annualOperatingDays), 0) + ' days / year' : '—', {v:'Power cost',tone:'head'}, num(k.powerCost) !== null ? rupees(num(k.powerCost)) + ' / kWh' : '—']
    ], { colw:['22%','28%','22%','28%'] }));

    /* electrical readings, loaded and unloaded */
    if ([k.genLoadVoltage, k.genLoadAmp, k.genLoadPf, k.genLoadKw, k.genUnloadVoltage, k.genUnloadAmp, k.genUnloadPf, k.genUnloadKw].some(function(v){ return num(v) !== null; })){
      B.push(tblBlock(['Condition','Voltage V','Current A','Power factor','Power kW','kVA','kVAr','Load factor'], [
        ['Load', acUnit(k.genLoadVoltage, 1), acUnit(k.genLoadAmp, 1), acUnit(k.genLoadPf, 2), acUnit(k.genLoadKw, 2), acUnit(k.kva, 2), acUnit(k.kvar, 2), num(k.loadFactor) !== null ? fix(num(k.loadFactor), 1) + ' %' : '—'],
        ['Unload', acUnit(k.genUnloadVoltage, 1), acUnit(k.genUnloadAmp, 1), acUnit(k.genUnloadPf, 2), acUnit(k.genUnloadKw, 2), '—', '—', '—']
      ], { size:8, colw:['14%','12%','12%','13%','12%','12%','12%','13%'] }));
    }

    /* load / unload hour meter */
    var lu = acLuRows(k);
    if (lu){
      B.push(tblBlock(['Reading','Date','Time','Load hrs','Unload hrs','Total run hrs','0–20 %','20–40 %','40–60 %','60–80 %','80–100 %'],
        lu.rows.map(function(r, i){ return ['Reading ' + (i + 1), r.date, r.time, r.load || '', r.unload || '', r.total || '', r.b020 || '', r.b2040 || '', r.b4060 || '', r.b6080 || '', r.b80100 || '']; })
        .concat([[{v:'Difference (last − first)',tone:'head'}, '', '', {v:fix(lu.load, 1),tone:'head'}, {v:fix(lu.unload, 1),tone:'head'}, {v:fix(lu.total, 1),tone:'head'},
          { v:(lu.load !== null && lu.total) ? fix((lu.load / lu.total) * 100, 1) + ' % loaded' : '', span:5, tone:'head' }]]),
        { size:7.4, title:'Load / unload hour meter (' + lu.type + ')', colw:['14%','10%','8%','9%','9%','10%','8%','8%','8%','8%','8%'] }));
    }

    /* the test as measured */
    if (k.fadActive || (!k.pumpActive && p.testType === 'FAD' && num(k.fadAirDeliveryCfm) !== null)){
      var areaDesc = k.fadAreaType === 'Rectangle' ? 'Rectangle ' + (k.fadAreaL || '?') + ' × ' + (k.fadAreaB || '?') + ' mm'
        : k.fadAreaType === 'Circle' ? (num(k.fadAreaDia) !== null ? 'Circle, dia ' + k.fadAreaDia + ' m' : num(k.fadAreaRadius) !== null ? 'Circle, radius ' + k.fadAreaRadius + ' m' : 'Circle, perimeter ' + (k.fadAreaPeri || '?') + ' m')
        : 'Direct area entry';
      B.push(tblBlock(null, [
        [{v:'Suction duct',tone:'head'}, areaDesc, {v:'Suction area',tone:'head'}, acUnit(k.suctionArea, 4, 'm²')],
        [{v:'Average velocity',tone:'head'}, acUnit(k.avgVelocity, 2, 'm/s'), {v:'Running pressure',tone:'head'}, acUnit(k.fadRunningPressure, 1, 'bar')],
        [{v:'Air delivery',tone:'head'}, acUnit(k.fadAirDeliveryM3Sec, 4, 'm³/s') + '  ·  ' + acUnit(k.fadAirDeliveryM3Hr, 1, 'm³/hr') + '  ·  ' + acUnit(k.fadAirDeliveryCfm, 1, 'CFM'), {v:'Measured power',tone:'head'}, acUnit(k.fadMeasuredPower, 2, 'kW')]
      ], { title:'Free air delivery — anemometer test', colw:['20%','32%','20%','28%'] }));
      var vels = acJson(k.fadVelocities, []);
      if (Array.isArray(vels) && vels.length){
        var per = 6, rows = [];
        for (var vi = 0; vi < vels.length; vi += per)
          rows.push(['Points ' + (vi + 1) + '–' + Math.min(vi + per, vels.length)].concat(vels.slice(vi, vi + per).map(function(v){ return fix(num(v), 2); }))
            .concat(new Array(Math.max(0, per - Math.min(per, vels.length - vi))).fill('')));
        B.push(tblBlock(['Traverse'].concat(new Array(per).fill('m/s')), rows, { size:8, caption:'The velocity traverse as taken: ' + vels.length + ' points across the suction duct, averaged to ' + acUnit(k.avgVelocity, 2, 'm/s') + '.' }));
      }
    }
    if (k.pumpActive || p.testType === 'Pump-up'){
      var mv = acMainVolume(k);
      var pipeRow = function(label, active, peri, len, vol, pu, lu2){
        return (active && vol !== null) ? [{v:label + ' pipe',tone:'head'}, { v:'perimeter ' + (peri || '?') + ' ' + (pu || 'mm') + ' × length ' + (len || '?') + ' ' + (lu2 || 'm') + '  →  bore ' + fix(pipeAreaM2(peri, pu), 5) + ' m²  ·  ' + fix(vol, 4) + ' m³', span:3 }] : null;
      };
      var pumpKw = num(k.pumpMeasuredPower); if (pumpKw === null) pumpKw = num(k.genLoadKw);
      var energy = acLapEnergy(acLaps(k));
      if (pumpKw === null) pumpKw = energy.avgKw;
      B.push(tblBlock(null, [
        [{v:'Receiver volume',tone:'head'}, acUnit(k.pumpTankVolume, 2, k.pumpTankVolumeUnit || '') + (mv.tank !== null ? '  (' + fix(mv.tank, 3) + ' m³)' : ''),
         {v:'Volume basis',tone:'head'}, k.pumpTankCalcMethod === 'DiaLength' ? 'from dia ' + (k.pumpTankDia || '?') + ' mm × length ' + (k.pumpTankLength || '?') + ' mm'
           : k.pumpTankCalcMethod === 'PeriLength' ? 'from perimeter ' + (k.pumpTankPeri || '?') + ' mm × length ' + (k.pumpTankLength || '?') + ' mm' : 'entered directly'],
        pipeRow('Inlet', k.pumpInletPipeActive, k.pumpInletPipePeri, k.pumpInletPipeLength, mv.inlet, k.pumpInletPipePeriUnit, k.pumpInletPipeLenUnit),
        pipeRow('Outlet', k.pumpOutletPipeActive, k.pumpOutletPipePeri, k.pumpOutletPipeLength, mv.outlet, k.pumpOutletPipePeriUnit, k.pumpOutletPipeLenUnit),
        [{v:'Main volume used',tone:'head'}, { v:(mv.total !== null ? fix(mv.total, 3) + ' m³' : '—') + '  =  ' + mv.basis, span:3 }],
        [{v:'Start pressure P1',tone:'head'}, acUnit(k.pumpP1, 1, 'bar'), {v:'End pressure P2',tone:'head'}, acUnit(k.pumpP2, 1, 'bar')],
        [{v:'Pump-up time',tone:'head'}, acUnit(k.pumpTime, 1, 's'), {v:'Air temperature',tone:'head'}, num(k.pumpAirTemp) !== null ? fix(num(k.pumpAirTemp), 1) + ' °C  (factor ' + fix(num(k.pumpTempFactor), 4) + ')' : '—'],
        [{v:'Load / unload pressure',tone:'head'}, acUnit(k.loadPressure, 1, 'bar') + '  /  ' + acUnit(k.unloadPressure, 1, 'bar'), {v:'Running pressure',tone:'head'}, acUnit(k.pumpRunningPressure, 1, 'bar')],
        [{v:'Actual FAD',tone:'head'}, acUnit(k.pumpActualFadM3Min, 3, 'm³/min') + '  ·  ' + acUnit(k.pumpActualFadCfm, 1, 'CFM'), {v:'Measured power',tone:'head'}, acUnit(pumpKw, 2, 'kW')]
      ].filter(Boolean), { title:'Free air delivery — receiver pump-up test', colw:['20%','32%','20%','28%'] }));

      var laps = acLaps(k).filter(function(l){ return num(l.timeSec) !== null; });
      if (laps.length){
        B.push(tblBlock(['#','Pressure bar','Lap time s','FAD m³/min','FAD × temp. factor','FAD CFM','Energy meter kWh'],
          acLaps(k).map(function(l, i){
            var f = num(l.fadM3Min), fc = num(l.fadCorrM3Min);
            return [String(i + 1), fix(num(l.pressure), 1), num(l.timeSec) !== null ? fix(num(l.timeSec), 1) : '—',
              (f && f > 0) ? fix(f, 3) : '—', (f && f > 0) ? fix(fc, 3) : '—', (f && f > 0) ? fix(fc * M3MIN_TO_CFM, 1) : '—', l.kwh || ''];
          }), { size:7.6, colw:['6%','15%','14%','16%','19%','14%','16%'] }));
        var stampedP = acLaps(k).filter(function(l){ return num(l.timeSec) !== null && num(l.pressure) !== null; });
        if (stampedP.length >= 2) B.push(blk(bChart(chartLines(stampedP.map(function(l){ return fix(num(l.timeSec), 0) + ' s'; }),
          [{ name:'Pressure', color:SERIES[0], values:stampedP.map(function(l){ return num(l.pressure); }) }],
          'Receiver pressure during the pump-up', 'bar', { zero:true }), 'Each lap is one reading of the gauge; the slope is the air the machine is actually delivering.')));
      }
      if (energy.readings > 0){
        B.push(tblBlock(null, [
          [{v:'Meter at start',tone:'head'}, acUnit(energy.first, 2, 'kWh'), {v:'Meter at end',tone:'head'}, acUnit(energy.last, 2, 'kWh')],
          [{v:'Energy used',tone:'head'}, acUnit(energy.used, 3, 'kWh'), {v:'Run time',tone:'head'}, acUnit(energy.seconds, 1, 's')],
          [{v:'Average power over the run',tone:'head'}, acUnit(energy.avgKw, 2, 'kW'), {v:'Readings taken',tone:'head'}, energy.readings + ' of ' + energy.laps + ' laps']
        ], { title:'Energy drawn during the pump-up', colw:['26%','24%','26%','24%'] }));
      }
      if (mv.total !== null && num(k.pumpP2) !== null && num(k.pumpTime)){
        B.push(blk(bFormula([
          'Main volume        = tank + inlet pipe + outlet pipe = ' + mv.basis + ' = ' + fix(mv.total, 3) + ' m³',
          'Pipe bore          = perimeter² ÷ 4π',
          'Free air delivery  = V × (P2 − P1) ÷ ((t÷60) × ' + ATM_BAR + ')',
          '                   = ' + fix(mv.total, 3) + ' × ' + fix((num(k.pumpP2) || 0) - (num(k.pumpP1) || 0), 1) + ' ÷ ((' + fix(num(k.pumpTime), 1) + '÷60) × ' + ATM_BAR + ') = ' + acUnit(k.pumpActualFadM3Min, 3, 'm³/min'),
          'Temperature factor = 273 ÷ (273 + T) = ' + (num(k.pumpTempFactor) !== null ? fix(num(k.pumpTempFactor), 4) : '—'),
          'Free air delivery  = m³/min × 35.3147 = ' + acUnit(k.pumpActualFadCfm, 1, 'CFM'),
          'Actual SEC         = ' + fix(pumpKw, 2) + ' ÷ ' + fix(num(k.pumpActualFadCfm), 1) + ' = ' + fix(p.actualSEC, 3) + ' kW/CFM'
        ])));
      }
    }

    /* design against actual */
    if (p.tested){
      var row = function(metric, design, actual, dev, worseWhenHigher){
        var label = '—', tone = null;
        if (dev !== null){
          var worse = worseWhenHigher ? dev > 0 : dev < 0, beyond = Math.abs(dev) > SEC_TOLERANCE_PCT;
          tone = !worse ? 'ok' : beyond ? 'bad' : 'watch';
          label = !worse ? 'Better than design' : beyond ? 'Attention' : 'Within tolerance';
        }
        return [metric, design, actual, acPct(dev), { v:label, tone:tone }];
      };
      B.push(tblBlock(['Metric','Design (rated)','Actual (' + p.testType + ')','Deviation','Status'], [
        row('Free air delivery, CFM', fix(p.ratedCFM, 1), fix(p.actualCFM, 1), p.flowDev, false),
        row('Specific energy, kW/CFM', fix(p.designSEC, 3), fix(p.actualSEC, 3), p.deviation, true),
        row('Air generation, CFM/kW', fix(p.designAirGen, 2), fix(p.actualAirGen, 2), p.genDev, false)
      ], { colw:['30%','17%','17%','14%','22%'] }));
    }

    /* the thermal survey, under A-CMP's own names */
    var obs = [['Compressor situation', k.obsCompSituation], ['Compressor discharge', k.obsCompDischarge], ['Oil sap', k.obsOilSap],
               ['Oil radiator in', k.obsOilRadiatorIn], ['Oil radiator out', k.obsOilRadiatorOut],
               ['Air radiator in', k.obsAirRadiatorIn], ['Air radiator out', k.obsAirRadiatorOut],
               ['Final discharge', k.obsCompFinalDischarge], ['Motor', k.obsCompMotor]]
              .filter(function(r){ return num(r[1]) !== null; });
    if (obs.length) B.push(tblBlock(['Temperature survey' + (k.obsThermalImageNo ? ' — image ' + k.obsThermalImageNo : '')].concat(obs.map(function(r){ return r[0]; })),
      [['°C'].concat(obs.map(function(r){ return fix(num(r[1]), 1); }))], { size:7.6 }));

    /* what it means */
    if (p.deviation !== null) B.push(blk(bNote('Actual specific energy consumption is ' + fix(Math.abs(p.deviation), 1) + ' % ' +
      (p.deviation > 0 ? 'above' : 'below') + ' design, at ' + fix(p.actualSEC, 3) + ' against ' + fix(p.designSEC, 3) + ' kW/CFM.',
      p.deviation > SEC_TOLERANCE_PCT ? 'bad' : 'ok')));
    if (p.loadPct !== null && p.loadPct < 60) B.push(blk(bNote('The machine is loaded only ' + fix(p.loadPct, 1) + ' % of its running hours' +
      (p.unloadKw !== null ? ', drawing ' + fix(p.unloadKw, 1) + ' kW unloaded for the rest' : '') +
      '. Sequencing or a variable speed drive is worth more here than an overhaul.', 'bad')));
    if (p.drift) B.push(blk(bNote('A-CMP measured ' + fix(p.appCFM, 1) + ' CFM on the ' + (p.testType === 'Pump-up' ? 'pump-up' : 'free air delivery') +
      ' test; recomputing from the raw readings gives ' + fix(p.ownCFM, 1) + ' CFM. The app’s figure is printed above — check the test record before quoting either.', 'watch')));
    if (k.obs) B.push(blk(bP(k.obs)));
  });

  ledgerFor(B, 'compressor');
}
