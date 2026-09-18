/* ===================================================================
   THERMO-X - boiler and thermic fluid heater performance, from the
   Thermo-X app's Excel exchange file (format "thermo-x-v1").

   Thermo-X already holds the fuels' laboratory analyses, every boiler's
   name-plate, the direct-method daily logs and the indirect-method flue
   gas samples (typed, or picked off a KANE analyser recording). Its
   Excel export is the team's exchange file, so it is the one door: drop
   it on Import field data and the boiler chapter writes itself, with the
   same formulas Thermo-X uses (mirrored from the KISEM reference workbook
   Boiler-Performance-Analysis.xlsx). Nothing is retyped and the report
   can never disagree with the app.
   =================================================================== */

var THERMOX_FORMAT = 'thermo-x-v1';

function blankThermox(){ return { profile:null, fuels:[], boilers:[], directTests:[], indirectTests:[], upload:null }; }
function txState(){ if (!S.thermox) S.thermox = blankThermox(); return S.thermox; }

/* Thermo-X keeps every input as text and treats a blank as 0, like an
   empty Excel cell. Its arithmetic is reproduced with the same rule. */
function tn(v){ if (v === null || v === undefined || v === '') return 0; var x = typeof v === 'number' ? v : parseFloat(v); return isFinite(x) ? x : 0; }
function tavg(a){ return a.length ? a.reduce(function(s, v){ return s + v; }, 0) / a.length : NaN; }
function tfix(v, d){ return (v === null || v === undefined || !isFinite(v)) ? '—' : fix(v, d === undefined ? 2 : d); }

/* ------------------------------------------------------------------
   IMPORT
   ------------------------------------------------------------------ */
function isThermoxWorkbook(wb){
  var s = findSheet(wb, 'Meta'); if (!s) return false;
  var rows = XLSX.utils.sheet_to_json(wb.Sheets[s], { defval:'' });
  return !!(rows[0] && String(rows[0].format || '') === THERMOX_FORMAT);
}
function txRows(wb, name){
  var s = findSheet(wb, name);
  return s ? XLSX.utils.sheet_to_json(wb.Sheets[s], { defval:'' }) : [];
}
function importThermox(wb, fileName){
  var T = txState();
  var str = function(v){ return v === null || v === undefined ? '' : String(v); };
  var meta = txRows(wb, 'Meta')[0] || {};
  var pick = function(row, keys){ var o = {}; keys.forEach(function(k){ o[k] = str(row[k]); }); return o; };

  var fuelKeys = ['id','name','category','type','dateOfTesting','analysedBy','moisture','volatileMatter','ash','gcv','carbon','hydrogen','nitrogen','sulphur','oxygen','ashFixedCarbon','ashMoisture','ashVolatileMatter','ashGcv','ashQuantity','notes','createdAt','updatedAt'];
  var fuels = txRows(wb, 'Fuels').filter(function(r){ return str(r.id); }).map(function(r){
    var f = pick(r, fuelKeys);
    if (['solid','liquid','gas'].indexOf(f.category) < 0) f.category = 'solid';
    return f;
  });
  var boilerKeys = ['id','name','make','model','serialNo','yearOfMake','boilerType','firingType','capacityTph','designPressure','designTemp','heatingSurface','ratedEfficiency','notes','createdAt','updatedAt'];
  var boilers = txRows(wb, 'Boilers').filter(function(r){ return str(r.id); }).map(function(r){
    var b = pick(r, boilerKeys);
    b.fuelIds = str(r.fuelIds).split(';').map(function(x){ return x.trim(); }).filter(Boolean);
    return b;
  });
  var logRows = txRows(wb, 'DirectLog');
  var directKeys = ['id','boilerId','fuelId','name','startDate','fuelUnitKg','fuelUnitLabel','steamPressure','steamTemp','feedWaterTemp','steamQtyOverride','fuelQtyOverride','hoursPerDay','createdAt','updatedAt'];
  var directTests = txRows(wb, 'DirectTests').filter(function(r){ return str(r.id); }).map(function(r){
    var t = pick(r, directKeys);
    t.rows = logRows.filter(function(l){ return str(l.testId) === t.id; }).map(function(l){ return { date:str(l.date), fuelQty:str(l.fuelQty), waterKg:str(l.waterKg) }; });
    t.days = tn(r.days) || t.rows.length;
    return t;
  });
  var sampleRows = txRows(wb, 'IndirectSamples'), instRows = txRows(wb, 'InstrumentLogs');
  var indirectKeys = ['id','boilerId','fuelId','name','testDate','humidityFactor','cpFlueGas','cpSteam','radiationLoss','createdAt','updatedAt'];
  var nOrNull = function(v){ return v === '' || v === null || v === undefined ? null : (isFinite(parseFloat(v)) ? parseFloat(v) : null); };
  var indirectTests = txRows(wb, 'IndirectTests').filter(function(r){ return str(r.id); }).map(function(r){
    var t = pick(r, indirectKeys);
    t.samples = sampleRows.filter(function(x){ return str(x.testId) === t.id; }).map(function(x){
      return { id:str(x.id), description:str(x.description), o2:str(x.o2), co2:str(x.co2), coPpm:str(x.coPpm), flueTemp:str(x.flueTemp), ambientTemp:str(x.ambientTemp),
               logNo:nOrNull(x.logNo), logTime:str(x.logTime) };
    });
    var logs = instRows.filter(function(x){ return str(x.testId) === t.id; }).map(function(x){
      return { logNo:tn(x.logNo), time:str(x.time), co:nOrNull(x.co), co2:nOrNull(x.co2), o2:nOrNull(x.o2), t1:nOrNull(x.t1), ta:nOrNull(x.ta) };
    });
    t.dataSource = str(r.dataSource) === 'instrument' ? 'instrument' : 'manual';
    t.instrument = (str(r.instAnalyser) || logs.length) ? { analyser:str(r.instAnalyser), serial:str(r.instSerial), user:str(r.instUser), fileName:str(r.instFileName), savedAt:str(r.instSavedAt), importedAt:str(r.instImportedAt), logs:logs } : null;
    return t;
  });
  var c = txRows(wb, 'Company')[0];
  T.profile = c && str(c.id) ? { companyName:str(c.companyName), area:str(c.area), district:str(c.district), state:str(c.state), pincode:str(c.pincode) } : null;

  /* Newest copy of each record wins, as in Thermo-X's own merge, so a
     second export from a teammate adds their tests without duplicating. */
  var merge = function(local, incoming){
    var by = {}; local.forEach(function(x){ by[x.id] = x; });
    incoming.forEach(function(x){ if (!by[x.id] || (x.updatedAt || '') > (by[x.id].updatedAt || '')) by[x.id] = x; });
    return Object.keys(by).map(function(k){ return by[k]; });
  };
  T.fuels = merge(T.fuels, fuels); T.boilers = merge(T.boilers, boilers);
  T.directTests = merge(T.directTests, directTests); T.indirectTests = merge(T.indirectTests, indirectTests);

  var by = str(meta.exportedBy) || S.meta.preparedBy || '';
  if (!by) by = prompt('Who is uploading this Thermo-X file? (printed in the report)', '') || '';
  T.upload = { file:fileName || '', at:new Date().toLocaleString('en-IN'), by:by, exportedAt:str(meta.exportedAt) };

  /* The chapters switch themselves on for what the file holds. */
  if (txBoilersOf('boiler').length) S.enabled.boiler = true;
  if (txBoilersOf('tfh').length) S.enabled.tfh = true;
  return ['Thermo-X: ' + fuels.length + ' fuel' + (fuels.length === 1 ? '' : 's') + ', ' + boilers.length + ' boiler' + (boilers.length === 1 ? '' : 's') +
          ', ' + directTests.length + ' direct and ' + indirectTests.length + ' indirect test' + (indirectTests.length === 1 ? '' : 's') +
          (meta.exportedBy ? ' (exported by ' + meta.exportedBy + ')' : '')];
}
function txUploadStamp(){
  var u = txState().upload;
  return u ? 'Boiler, fuel and test data: last uploaded data on ' + u.at + ' from ' + (u.by || 'the assessment team') +
    (u.file ? ' (' + u.file + ')' : '') + (u.exportedAt ? '; exported from Thermo-X on ' + String(u.exportedAt).replace('T', ' ').slice(0, 16) : '') + '.' : '';
}
/* A Thermo-X "boiler" whose type is the thermic fluid heater prints in
   the TFH chapter; everything else in the boiler chapter. */
function txBoilersOf(kind){
  return txState().boilers.filter(function(b){ var t = /thermic fluid/i.test(b.boilerType || ''); return kind === 'tfh' ? t : !t; });
}
function txFuel(id){ return txState().fuels.filter(function(f){ return f.id === id; })[0] || null; }

/* ------------------------------------------------------------------
   CALCULATION ENGINE - Thermo-X's lib/boiler.ts, line for line.
   ------------------------------------------------------------------ */
var TX_FUEL_TYPES = { 'imported-coal':'Imported Coal', 'indian-coal':'Indian Coal', 'lignite':'Lignite', 'petcoke':'Petcoke', 'charcoal':'Charcoal', 'biomass':'Biomass (agri residue)', 'bagasse':'Bagasse', 'rice-husk':'Rice Husk', 'wood':'Wood / Wood chips', 'sawdust':'Sawdust', 'briquette':'Briquette', 'pellet':'Pellet (biomass)', 'groundnut-shell':'Groundnut Shell', 'coconut-shell':'Coconut Shell', 'cotton-stalk':'Cotton Stalk', 'mustard-husk':'Mustard Husk', 'hsd':'Diesel (HSD)', 'ldo':'LDO (Light Diesel Oil)', 'fo':'Furnace Oil (FO)', 'lshs':'LSHS', 'biodiesel':'Bio-diesel', 'kerosene':'Kerosene (SKO)', 'naphtha':'Naphtha', 'waste-oil':'Used / Waste Oil', 'png':'Natural Gas (PNG)', 'lng':'LNG', 'lpg':'LPG', 'cng':'CNG', 'biogas':'Biogas', 'producer-gas':'Producer Gas', 'cbm':'Coal Bed Methane', 'hydrogen':'Hydrogen', 'other':'Other' };
function txFuelType(f){ return TX_FUEL_TYPES[f.type] || f.type || ''; }

/* Proximate analysis for solid fuels; C, H, N by the empirical relations
   in the reference workbook (fixed carbon by difference). Liquid and gas
   fuels are entered by ultimate analysis and used as given. */
function txAnalyseFuel(f){
  var m = tn(f.moisture), vm = tn(f.volatileMatter), a = tn(f.ash), gcv = tn(f.gcv), s = tn(f.sulphur), o = tn(f.oxygen);
  var proximate = f.category === 'solid';
  var fc, c, h, n;
  if (proximate){
    fc = 100 - m - vm - a;
    c = 0.97 * fc + 0.7 * (vm - 0.1 * a) - m * (0.6 - 0.01 * m);
    h = 0.036 * fc + 0.086 * (vm - 0.1 * a) - 0.0035 * m * m * (1 - 0.02 * vm);
    n = 2.1 - 0.02 * vm;
  } else { fc = 0; c = tn(f.carbon); h = tn(f.hydrogen); n = tn(f.nitrogen); }
  var afc = tn(f.ashFixedCarbon), am = tn(f.ashMoisture), avm = tn(f.ashVolatileMatter);
  return { proximate:proximate, fixedCarbon:fc, moisture:m, volatileMatter:vm, ash:a, gcv:gcv, carbon:c, hydrogen:h, nitrogen:n, sulphur:s, oxygen:o,
           combustionCarbon: proximate ? fc : c, ashInAsh: proximate ? 100 - (afc + am + avm) : 0,
           ashGcv: proximate ? tn(f.ashGcv) : 0, ashQuantity: proximate ? tn(f.ashQuantity) : 0 };
}

/* Saturated steam table (IAPWS-IF97, rounded): absolute bar, tsat, hf, hg in kJ/kg. */
var TX_STEAM = [[0.5,81.32,340.5,2645.2],[0.7,89.93,376.7,2659.4],[1,99.61,417.4,2674.9],[1.5,111.35,467.1,2693.1],[2,120.21,504.7,2706.2],[2.5,127.41,535.3,2716.5],[3,133.52,561.4,2724.9],[3.5,138.86,584.3,2732],[4,143.61,604.7,2738.1],[4.5,147.9,623.2,2743.4],[5,151.83,640.1,2748.1],[6,158.83,670.4,2756.1],[7,164.95,697,2762.8],[8,170.41,720.9,2768.3],[9,175.35,742.6,2772.7],[10,179.88,762.6,2777.1],[11,184.06,781.1,2780.4],[12,187.96,798.4,2783.4],[13,191.6,814.7,2785.9],[14,195.04,830.1,2788.1],[15,198.29,844.7,2790],[16,201.37,858.6,2791.7],[18,207.11,884.6,2794.5],[20,212.38,908.6,2798.4],[22,217.24,930.9,2799.1],[25,223.95,962,2802],[30,233.85,1008.3,2803.3],[35,242.56,1049.8,2802.6],[40,250.35,1087.4,2800.3],[45,257.44,1122.1,2797],[50,263.94,1154.5,2794.2],[60,275.59,1213.7,2784.6],[70,285.83,1267.4,2772.6],[80,295.01,1317.1,2758.7],[90,303.35,1363.7,2742.9],[100,311,1407.8,2725.5]];
var TX_KCAL_PER_KJ = 1 / 4.1868, TX_KGCM2_TO_BAR = 0.980665, TX_ATM_BAR = 1.01325, TX_CP_SUPERHEAT = 0.5, TX_CP_WATER = 1.0;
function txSteam(pGauge, tSteam){
  var pAbs = pGauge * TX_KGCM2_TO_BAR + TX_ATM_BAR, t = TX_STEAM, row;
  if (pAbs <= t[0][0]) row = t[0];
  else if (pAbs >= t[t.length - 1][0]) row = t[t.length - 1];
  else {
    var i = 0; while (t[i + 1][0] < pAbs) i++;
    var a = t[i], b = t[i + 1], f = (pAbs - a[0]) / (b[0] - a[0]);
    row = [pAbs, a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2]), a[3] + f * (b[3] - a[3])];
  }
  var hf = row[2] * TX_KCAL_PER_KJ, hg = row[3] * TX_KCAL_PER_KJ;
  var superheat = Math.max(0, tSteam - row[1]), superheated = superheat > 0.5;
  return { pAbsBar:row[0], tSat:row[1], hf:hf, hg:hg, superheated:superheated, superheat:superheated ? superheat : 0, hSteam:superheated ? hg + TX_CP_SUPERHEAT * superheat : hg };
}

/* Direct (input-output) method: sheet "Boiler Effi. Direct Method". */
function txDirect(t, fa, boiler){
  var unit = tn(t.fuelUnitKg) || 1, hours = tn(t.hoursPerDay) || 24;
  var rowsKg = t.rows.filter(function(r){ return r.fuelQty !== '' || r.waterKg !== ''; })
    .map(function(r){ return { date:r.date, fuelIn:r.fuelQty, fuelKg:tn(r.fuelQty) * unit, waterKg:tn(r.waterKg) }; });
  var totalFuelKg = rowsKg.reduce(function(s, r){ return s + r.fuelKg; }, 0), totalWaterKg = rowsKg.reduce(function(s, r){ return s + r.waterKg; }, 0);
  var avgFuelKg = tavg(rowsKg.map(function(r){ return r.fuelKg; })), avgWaterKg = tavg(rowsKg.map(function(r){ return r.waterKg; }));
  var fuelPerHour = avgFuelKg / hours, waterPerHour = avgWaterKg / hours;
  var steamQty = t.steamQtyOverride !== '' ? tn(t.steamQtyOverride) : waterPerHour;
  var fuelQty = t.fuelQtyOverride !== '' ? tn(t.fuelQtyOverride) : fuelPerHour;
  var gcv = fa ? fa.gcv : 0;
  var steam = txSteam(tn(t.steamPressure), tn(t.steamTemp));
  var hFeed = TX_CP_WATER * tn(t.feedWaterTemp);
  var rated = boiler ? tn(boiler.capacityTph) * 1000 : 0;
  return { rowsKg:rowsKg, totalFuelKg:totalFuelKg, totalWaterKg:totalWaterKg, avgFuelKg:avgFuelKg, avgWaterKg:avgWaterKg,
           fuelPerHour:fuelPerHour, waterPerHour:waterPerHour, steamQty:steamQty, fuelQty:fuelQty, gcv:gcv, steam:steam, hSteam:steam.hSteam, hFeed:hFeed,
           efficiency:(steamQty * (steam.hSteam - hFeed) * 100) / (fuelQty * gcv), evaporationRatio:steamQty / fuelQty,
           loadPct: rated > 0 ? (steamQty / rated) * 100 : null };
}

/* Indirect (heat-loss) method: sheet "Boiler Indirect Sample". */
var TX_LOSSES = [
  { key:'lossDryFlueGas', label:'L1. Dry flue gas loss', formula:'m × Cp × (Tf − Ta) × 100 ÷ GCV' },
  { key:'lossHydrogen', label:'L2. Loss due to H₂ in fuel', formula:'9·H₂ × [584 + 0.45·(Tf − Ta)] ÷ GCV' },
  { key:'lossMoistureFuel', label:'L3. Loss due to moisture in fuel', formula:'M × [584 + 0.45·(Tf − Ta)] ÷ GCV' },
  { key:'lossMoistureAir', label:'L4. Loss due to moisture in air', formula:'AAS × humidity × Cp(steam) × (Tf − Ta) × 100 ÷ GCV' },
  { key:'lossIncompleteCombustion', label:'L5. Incomplete combustion (CO)', formula:'[%CO × C ÷ (%CO + %CO₂)] × 5654 ÷ GCV' },
  { key:'lossFlyAsh', label:'L6. Unburnt in fly ash', formula:'0.8 × GCV(ash) × ash qty ÷ 100 ÷ GCV' },
  { key:'lossBottomAsh', label:'L7. Unburnt in bottom ash', formula:'0.2 × GCV(ash) × ash qty ÷ 100 ÷ GCV' },
  { key:'lossRadiation', label:'L8. Radiation & convection', formula:'assumed (2 % in the reference workbook)' }
];
function txSample(t, s, f){
  var o2 = tn(s.o2), co2 = tn(s.co2), coPpm = tn(s.coPpm), tf = tn(s.flueTemp), ta = tn(s.ambientTemp);
  var hum = tn(t.humidityFactor), cpFg = tn(t.cpFlueGas), cpSt = tn(t.cpSteam);
  var C_ = f.combustionCarbon, H = f.hydrogen, M = f.moisture, gcv = f.gcv;
  var coPercent = coPpm / 10000, excessAirPct = (o2 * 100) / (21 - o2);
  var theoreticalAir = (11.6 * C_ + 34.8 * (H - f.oxygen / 8) + 4.35 * f.sulphur) / 100;
  var actualAir = (1 + excessAirPct / 100) * theoreticalAir;
  var dryFlueGasMass = actualAir + 1 - (M + 9 * H) / 100;
  var dT = tf - ta;
  var r = {
    coPercent:coPercent, excessAirPct:excessAirPct, theoreticalAir:theoreticalAir, actualAir:actualAir, dryFlueGasMass:dryFlueGasMass,
    lossDryFlueGas:(dryFlueGasMass * cpFg * dT * 100) / gcv,
    lossHydrogen:(9 * H * (584 + 0.45 * dT)) / gcv,
    lossMoistureFuel:(M * (584 + 0.45 * dT)) / gcv,
    lossMoistureAir:(actualAir * hum * cpSt * dT * 100) / gcv,
    lossIncompleteCombustion:((coPercent * C_) / (coPercent + co2)) * 5654 / gcv,
    lossFlyAsh:(0.8 * f.ashGcv * f.ashQuantity) / 100 / gcv,
    lossBottomAsh:(0.2 * f.ashGcv * f.ashQuantity) / 100 / gcv,
    lossRadiation:tn(t.radiationLoss)
  };
  r.totalLoss = TX_LOSSES.reduce(function(s2, k){ return s2 + r[k.key]; }, 0);
  r.efficiency = 100 - r.totalLoss;
  return r;
}
function txIndirect(t, fuel){
  if (!fuel) return null;
  var f = txAnalyseFuel(fuel);
  var samples = t.samples.map(function(s){ return txSample(t, s, f); });
  var keys = Object.keys(samples[0] || txSample(t, { o2:'', co2:'', coPpm:'', flueTemp:'', ambientTemp:'' }, f));
  var overall = {};
  keys.forEach(function(k){ overall[k] = tavg(samples.map(function(r){ return r[k]; })); });
  overall.efficiency = 100 - overall.totalLoss;
  var avgIn = function(k){ return tavg(t.samples.map(function(s){ return tn(s[k]); })); };
  return { fuel:f, samples:samples, overall:overall, inputs:{ o2:avgIn('o2'), co2:avgIn('co2'), coPpm:avgIn('coPpm'), flueTemp:avgIn('flueTemp'), ambientTemp:avgIn('ambientTemp') } };
}
function txPeriod(inst){
  if (!inst || !inst.logs.length) return '';
  return inst.logs[0].time + ' – ' + inst.logs[inst.logs.length - 1].time + ' (' + inst.logs.length + ' readings)';
}
/* The latest test of each method for a boiler, and how the two compare. */
function txSummary(b){
  var T = txState();
  var dts = T.directTests.filter(function(t){ return t.boilerId === b.id; }), its = T.indirectTests.filter(function(t){ return t.boilerId === b.id; });
  var ld = dts[dts.length - 1], li = its[its.length - 1];
  var fd = ld ? txFuel(ld.fuelId) : null;
  var direct = ld ? txDirect(ld, fd ? txAnalyseFuel(fd) : null, b).efficiency : NaN;
  var ri = li ? txIndirect(li, txFuel(li.fuelId)) : null;
  var indirect = ri ? ri.overall.efficiency : NaN;
  var gap = direct - indirect;
  var remark = (!isFinite(direct) && !isFinite(indirect)) ? 'no test' : isFinite(gap) ? (Math.abs(gap) <= 3 ? 'Methods agree (±3 %)' : 'Large gap — check inputs') : isFinite(direct) ? 'Direct only' : 'Indirect only';
  return { boiler:b, direct:direct, indirect:indirect, rated:b.ratedEfficiency ? tn(b.ratedEfficiency) : null, nDirect:dts.length, nIndirect:its.length, gap:gap, remark:remark, directTests:dts, indirectTests:its };
}
function txVerdict(e){ return !isFinite(e) ? null : e >= 80 ? 'ok' : e >= 70 ? null : 'bad'; }

/* ------------------------------------------------------------------
   THE CHAPTER - the Thermo-X report's content in PostMan's dress.
   ------------------------------------------------------------------ */
function buildThermoxFired(B, kind, title, moduleId, manual){
  var T = txState();
  var boilers = txBoilersOf(kind);
  var noun = kind === 'tfh' ? 'heater' : 'boiler';
  B.push(blk(bH(2, title)));
  DEFAULTS.boilerMethod.forEach(function(p){ B.push(blk(bP(p))); });
  if (txUploadStamp()) B.push(blk(bP(txUploadStamp(), { size:9, italic:true })));

  var sums = boilers.map(txSummary);
  var labelOf = function(b){ return b.name + ([b.make, b.model].filter(Boolean).length ? ' (' + [b.make, b.model].filter(Boolean).join(' ') + ')' : ''); };

  /* --- summary across the boilers --- */
  B.push(blk(bH(3, 'Summary of ' + noun + ' efficiency')));
  var effs = sums.map(function(s){ return [s.direct, s.indirect]; }).reduce(function(a, b){ return a.concat(b); }, []).filter(isFinite);
  B.push(blk(bKPI([
    [boilers.length === 1 ? 'Boiler evaluated' : 'Boilers evaluated', String(boilers.length)],
    ['Tests performed', String(sums.reduce(function(a, s){ return a + s.nDirect + s.nIndirect; }, 0))],
    ['Average efficiency', effs.length ? pct(tavg(effs), 1) : '—'],
    ['Below 70 %', String(sums.filter(function(s){ return [s.direct, s.indirect].some(function(e){ return isFinite(e) && e < 70; }); }).length)]
  ])));
  B.push(tblBlock([noun === 'heater' ? 'Heater' : 'Boiler','Make / model','Capacity','Direct eff. %','Indirect eff. %','Rated %','Direct − indirect','Remark'],
    sums.map(function(s){
      return [s.boiler.name, [s.boiler.make, s.boiler.model].filter(Boolean).join(' ') || '—', s.boiler.capacityTph ? s.boiler.capacityTph + ' TPH' : '—',
        { v:tfix(s.direct), tone:txVerdict(s.direct) }, { v:tfix(s.indirect), tone:txVerdict(s.indirect) }, s.rated !== null ? tfix(s.rated, 1) : '—',
        tfix(s.gap), { v:s.remark, tone:(/agree/.test(s.remark) ? 'ok' : /gap/.test(s.remark) ? 'watch' : null) }];
    }), { size:8, colw:['14%','16%','10%','11%','11%','9%','11%','18%'] }));
  if (sums.length) B.push(blk(bChart(chartGrouped(sums.map(function(s){ return s.boiler.name; }), [
    { name:'Direct method', values:sums.map(function(s){ return isFinite(s.direct) ? s.direct : 0; }), color:SERIES[0] },
    { name:'Indirect method', values:sums.map(function(s){ return isFinite(s.indirect) ? s.indirect : 0; }), color:SERIES[1] },
    { name:'Rated (name-plate)', values:sums.map(function(s){ return s.rated || 0; }), color:C.ink3 }
  ], 'Efficiency by ' + noun, '%'), 'Latest test of each method for each ' + noun + '; the rated figure is from the name-plate or OEM.')));

  /* --- fuels used by these boilers --- */
  var fuelIds = {};
  boilers.forEach(function(b){ b.fuelIds.forEach(function(id){ fuelIds[id] = 1; }); });
  sums.forEach(function(s){ s.directTests.concat(s.indirectTests).forEach(function(t){ fuelIds[t.fuelId] = 1; }); });
  var fuels = T.fuels.filter(function(f){ return fuelIds[f.id]; });
  if (fuels.length){
    B.push(blk(bH(3, 'Fuels — laboratory analysis (as-fired basis)')));
    B.push(tblBlock(['Fuel','Type','Tested','Moist %','VM %','Ash %','FC %','C %','H %','N %','S %','O %','GCV kcal/kg'],
      fuels.map(function(f){
        var a = txAnalyseFuel(f);
        return [f.name, txFuelType(f), f.dateOfTesting || '—', tfix(a.moisture, 1), a.proximate ? tfix(a.volatileMatter, 1) : '—', tfix(a.ash, 1), a.proximate ? tfix(a.fixedCarbon, 1) : '—',
          tfix(a.carbon, 1), tfix(a.hydrogen, 2), tfix(a.nitrogen, 2), tfix(a.sulphur, 2), tfix(a.oxygen, 2), tfix(a.gcv, 0)];
      }), { size:7.6, colw:['14%','12%','9%','6.5%','6.5%','6.5%','6.5%','6.5%','6.5%','6.5%','6.5%','6.5%','7%'] }));
    B.push(blk(bP('Solid fuels are entered by proximate analysis; fixed carbon is by difference and C, H and N follow the empirical relations of the KISEM reference workbook. Liquid and gaseous fuels are entered by ultimate analysis.' +
      fuels.some(function(f){ return f.analysedBy; }) ? ' Analysed by ' + fuels.map(function(f){ return f.analysedBy; }).filter(Boolean).filter(function(v, i, a){ return a.indexOf(v) === i; }).join(', ') + '.' : '', { size:9, italic:true })));
    var solid = fuels.filter(function(f){ return f.category === 'solid'; });
    if (solid.length) B.push(blk(bChart(chartStacked(solid.map(function(f){ return f.name; }), [
      { name:'Fixed carbon', values:solid.map(function(f){ return txAnalyseFuel(f).fixedCarbon; }), color:C.navy },
      { name:'Volatile matter', values:solid.map(function(f){ return txAnalyseFuel(f).volatileMatter; }), color:SERIES[1] },
      { name:'Moisture', values:solid.map(function(f){ return txAnalyseFuel(f).moisture; }), color:SERIES[0] },
      { name:'Ash', values:solid.map(function(f){ return txAnalyseFuel(f).ash; }), color:C.ink3 }
    ], 'Proximate analysis of solid fuels', '%'))));
  }

  /* --- each boiler --- */
  sums.forEach(function(s){
    var b = s.boiler;
    B.push(blk(bH(3, (noun === 'heater' ? 'Heater — ' : 'Boiler — ') + labelOf(b))));
    B.push(tblBlock(null, [
      [{v:'Type',tone:'head'}, b.boilerType || '—', {v:'Firing',tone:'head'}, b.firingType || '—'],
      [{v:'Rated capacity',tone:'head'}, b.capacityTph ? b.capacityTph + ' TPH' : '—', {v:'Design pressure',tone:'head'}, b.designPressure ? b.designPressure + ' kg/cm² g' : '—'],
      [{v:'Design steam temperature',tone:'head'}, b.designTemp ? b.designTemp + ' °C' : 'saturated', {v:'Heating surface',tone:'head'}, b.heatingSurface ? b.heatingSurface + ' m²' : '—'],
      [{v:'Rated efficiency',tone:'head'}, b.ratedEfficiency ? b.ratedEfficiency + ' %' : '—', {v:'Serial no. / year',tone:'head'}, [b.serialNo, b.yearOfMake].filter(Boolean).join(' / ') || '—'],
      [{v:'Fuels fired',tone:'head'}, { v:b.fuelIds.map(function(id){ var f = txFuel(id); return f ? f.name : '?'; }).join(', ') || '—', span:3 }]
    ], { colw:['22%','28%','22%','28%'] }));
    if (b.notes) B.push(blk(bP(b.notes, { size:9.5 })));
    B.push(blk(bKPI([
      ['Direct method efficiency', isFinite(s.direct) ? pct(s.direct) : '—'],
      ['Indirect method efficiency', isFinite(s.indirect) ? pct(s.indirect) : '—'],
      ['Rated efficiency', s.rated !== null ? pct(s.rated, 1) : '—'],
      ['Direct − indirect', isFinite(s.gap) ? tfix(s.gap) + ' %' : 'needs both']
    ])));

    /* direct tests */
    s.directTests.forEach(function(t){
      var f = txFuel(t.fuelId), fa = f ? txAnalyseFuel(f) : null, r = txDirect(t, fa, b);
      B.push(blk(bH(3, 'Direct method — ' + t.name + ' (' + t.startDate + ', ' + t.days + ' days' + (f ? ', ' + f.name : '') + ')')));
      B.push(blk(bP('Steam output measured against fuel input over the logged days. Steam enthalpy is read from the saturated steam table at the measured gauge pressure' +
        (r.steam.superheated ? ', plus 0.5 kcal/kg·°C per degree of superheat' : '') + '; feed-water enthalpy is 1 kcal/kg·°C × temperature.', { size:9.5 })));
      if (r.rowsKg.length){
        var unitLbl = t.fuelUnitLabel || 'kg', unitKg = tn(t.fuelUnitKg) || 1;
        B.push(tblBlock(['Date', 'Fuel (' + unitLbl + ')', 'Fuel (kg)', 'Water flow (kg)'],
          r.rowsKg.map(function(x){ return [x.date, x.fuelIn || '0', tfix(x.fuelKg, 1), tfix(x.waterKg, 0)]; }).concat([
            [{v:'Total',tone:'head'}, '', {v:tfix(r.totalFuelKg, 0),tone:'head'}, {v:tfix(r.totalWaterKg, 0),tone:'head'}],
            ['Average per day', '', tfix(r.avgFuelKg, 1), tfix(r.avgWaterKg, 1)],
            ['Average, tonnes/day', '', tfix(r.avgFuelKg / 1000, 3), tfix(r.avgWaterKg / 1000, 3)],
            ['Per hour (÷ ' + (t.hoursPerDay || 24) + ' h)', '', tfix(r.fuelPerHour, 2), tfix(r.waterPerHour, 2)]
          ]), { colw:['28%','24%','24%','24%'], caption: unitKg !== 1 ? 'Fuel logged in ' + unitLbl + ' of ' + unitKg + ' kg each.' : null }));
        var days = r.rowsKg.map(function(x){ return String(x.date).slice(5); });
        B.push(blk(bChart(chartBars(days, r.rowsKg.map(function(x){ return x.fuelKg; }), 'Daily fuel consumption', 'kg/day', SERIES[1]))));
        B.push(blk(bChart(chartBars(days, r.rowsKg.map(function(x){ return x.waterKg; }), 'Daily feed water / steam', 'kg/day', SERIES[0]))));
      }
      B.push(tblBlock(['Parameter','Value','Unit'], [
        ['Steam generated' + (t.steamQtyOverride !== '' ? ' (measured)' : ' (from the log)'), tfix(r.steamQty, 1), 'kg/hr'],
        ['Steam pressure', t.steamPressure || '—', 'kg/cm² g'],
        ['Steam temperature', (t.steamTemp || '—') + ' (saturation ' + tfix(r.steam.tSat, 1) + (r.steam.superheated ? ', superheat ' + tfix(r.steam.superheat, 1) : '') + ')', '°C'],
        ['Enthalpy of steam (steam table at ' + tfix(r.steam.pAbsBar, 2) + ' bar abs)', tfix(r.hSteam, 2), 'kcal/kg'],
        ['Feed water temperature', t.feedWaterTemp || '—', '°C'],
        ['Enthalpy of feed water', tfix(r.hFeed, 2), 'kcal/kg'],
        ['Fuel consumed' + (t.fuelQtyOverride !== '' ? ' (measured)' : ' (from the log)'), tfix(r.fuelQty, 2), 'kg/hr'],
        ['GCV of fuel', tfix(r.gcv, 0), 'kcal/kg'],
        ['Evaporation ratio (steam ÷ fuel)', tfix(r.evaporationRatio, 2), 'kg/kg'],
        r.loadPct !== null ? ['Loading against rated capacity', tfix(r.loadPct, 0), '%'] : null,
        [{v:'Efficiency (direct)',tone:'head'}, {v:isFinite(r.efficiency) ? pct(r.efficiency) : '—', tone:txVerdict(r.efficiency) || 'head'}, {v:'%',tone:'head'}]
      ].filter(Boolean), { colw:['56%','26%','18%'] }));
      B.push(blk(bFormula([
        'Efficiency = steam × (h steam − h feed) × 100 ÷ (fuel × GCV)',
        '           = ' + tfix(r.steamQty, 1) + ' × (' + tfix(r.hSteam, 1) + ' − ' + tfix(r.hFeed, 1) + ') × 100 ÷ (' + tfix(r.fuelQty, 2) + ' × ' + tfix(r.gcv, 0) + ')',
        '           = ' + tfix(r.efficiency) + ' %'
      ])));
    });

    /* indirect tests */
    s.indirectTests.forEach(function(t){
      var f = txFuel(t.fuelId), r = txIndirect(t, f);
      var inst = t.dataSource === 'instrument' ? t.instrument : null;
      B.push(blk(bH(3, 'Indirect method — ' + t.name + ' (' + t.testDate + ', ' + t.samples.length + ' sample' + (t.samples.length === 1 ? '' : 's') + (f ? ', ' + f.name : '') + ')')));
      B.push(blk(bP('BEE heat-loss procedure: efficiency = 100 − (L1 dry flue gas + L2 hydrogen in fuel + L3 moisture in fuel + L4 moisture in air + L5 incomplete combustion + L6 unburnt in fly ash + L7 unburnt in bottom ash + L8 radiation and convection). Each sample is worked separately and the overall figure is the average of the samples.', { size:9.5 })));
      B.push(blk(bNote(inst
        ? 'Data source — analyser. Flue gas recorded by ' + inst.analyser + (inst.serial ? ' (S/N ' + inst.serial + ')' : '') + (inst.user ? ', operator ' + inst.user : '') + (inst.fileName ? ', file "' + inst.fileName + '"' : '') + (inst.savedAt ? ', saved ' + inst.savedAt : '') +
          '. Recording period ' + txPeriod(inst) + '. Reference points used: ' + t.samples.map(function(sm){ return sm.logNo ? 'log ' + sm.logNo + ' @ ' + sm.logTime : sm.description + ' (manual)'; }).join('; ') + '.'
        : 'Data source — manual. Flue gas readings entered from site measurements (no analyser file).', inst ? null : 'watch')));
      if (r){
        var a = r.fuel;
        B.push(tblBlock(null, [
          [{v:'Fuel',tone:'head'}, f.name + ' (' + txFuelType(f) + ')', {v:'GCV',tone:'head'}, tfix(a.gcv, 0) + ' kcal/kg'],
          [{v:a.proximate ? 'FC / moisture / VM / ash' : 'C / moisture / ash',tone:'head'}, a.proximate ? tfix(a.fixedCarbon, 1) + ' / ' + tfix(a.moisture, 1) + ' / ' + tfix(a.volatileMatter, 1) + ' / ' + tfix(a.ash, 1) + ' %' : tfix(a.carbon, 1) + ' / ' + tfix(a.moisture, 1) + ' / ' + tfix(a.ash, 1) + ' %',
           {v:'H / S / O',tone:'head'}, tfix(a.hydrogen, 2) + ' / ' + tfix(a.sulphur, 2) + ' / ' + tfix(a.oxygen, 2) + ' %'],
          [{v:'Ash sample GCV / quantity',tone:'head'}, a.proximate ? tfix(a.ashGcv, 0) + ' kcal/kg / ' + tfix(a.ashQuantity, 2) : 'n/a',
           {v:'Humidity / Cp flue / Cp steam / radiation',tone:'head'}, t.humidityFactor + ' / ' + t.cpFlueGas + ' / ' + t.cpSteam + ' / ' + t.radiationLoss + ' %']
        ], { colw:['22%','28%','22%','28%'] }));
        B.push(blk(bKPI([
          ['Efficiency (indirect)', pct(r.overall.efficiency)],
          ['Total losses', tfix(r.overall.totalLoss) + ' %'],
          ['Excess air', tfix(r.overall.excessAirPct, 1) + ' %'],
          ['Flue gas temperature', tfix(r.inputs.flueTemp, 1) + ' °C']
        ])));
        var head = ['Parameter'].concat(t.samples.map(function(_, i){ return 'Sample ' + (i + 1); })).concat(['Overall']);
        var row = function(label, get, ov, tone){ return [label].concat(t.samples.map(function(_, i){ return get(i); })).concat([tone ? { v:ov, tone:tone } : ov]); };
        var n = t.samples.length, cw = [String(Math.round(100 - (n + 1) * (n > 3 ? 12 : 15))) + '%'];
        for (var k = 0; k <= n; k++) cw.push(String(n > 3 ? 12 : 15) + '%');
        B.push(tblBlock(head, [
          row('Description', function(i){ return t.samples[i].description; }, 'average'),
          row('Source', function(i){ return t.samples[i].logNo ? (inst ? inst.analyser : 'analyser') + ' log ' + t.samples[i].logNo + ' @ ' + t.samples[i].logTime : 'manual'; }, ''),
          row('O₂ %', function(i){ return t.samples[i].o2 || '0'; }, tfix(r.inputs.o2)),
          row('CO₂ %', function(i){ return t.samples[i].co2 || '0'; }, tfix(r.inputs.co2)),
          row('CO ppm', function(i){ return t.samples[i].coPpm || '0'; }, tfix(r.inputs.coPpm, 0)),
          row('Flue gas temperature °C', function(i){ return t.samples[i].flueTemp || '0'; }, tfix(r.inputs.flueTemp, 1)),
          row('Ambient temperature °C', function(i){ return t.samples[i].ambientTemp || '0'; }, tfix(r.inputs.ambientTemp, 1)),
          row('Excess air %', function(i){ return tfix(r.samples[i].excessAirPct); }, tfix(r.overall.excessAirPct), r.overall.excessAirPct > 60 ? 'bad' : 'ok'),
          row('Theoretical air kg/kg', function(i){ return tfix(r.samples[i].theoreticalAir, 3); }, tfix(r.overall.theoreticalAir, 3)),
          row('Actual air supplied kg/kg', function(i){ return tfix(r.samples[i].actualAir, 3); }, tfix(r.overall.actualAir, 3)),
          row('Dry flue gas kg/kg', function(i){ return tfix(r.samples[i].dryFlueGasMass, 3); }, tfix(r.overall.dryFlueGasMass, 3))
        ].concat(TX_LOSSES.map(function(kk){ return row(kk.label + ' %', function(i){ return tfix(r.samples[i][kk.key]); }, tfix(r.overall[kk.key])); })).concat([
          row('Total losses %', function(i){ return tfix(r.samples[i].totalLoss); }, tfix(r.overall.totalLoss), 'head'),
          row('Efficiency %', function(i){ return tfix(r.samples[i].efficiency); }, pct(r.overall.efficiency), txVerdict(r.overall.efficiency) || 'head')
        ]), { size:8, colw:cw }));
        B.push(blk(bChart(chartBars(TX_LOSSES.map(function(kk){ return kk.label.slice(0, 2); }), TX_LOSSES.map(function(kk){ return Math.max(0, r.overall[kk.key]); }), 'Heat loss breakdown (overall)', '% of heat input', SERIES[1]),
          TX_LOSSES.map(function(kk){ return kk.label.replace('. ', ' '); }).join('; ') + '.')));
        B.push(tblBlock(['Loss','Formula'], TX_LOSSES.map(function(kk){ return [kk.label, kk.formula]; }), { size:8, colw:['36%','64%'] }));

        /* what the figures say */
        var biggest = TX_LOSSES.reduce(function(best, kk){ return r.overall[kk.key] > r.overall[best.key] ? kk : best; }, TX_LOSSES[0]);
        var notes = [];
        if (r.inputs.o2 > 6) notes.push(['bad', 'Oxygen of ' + tfix(r.inputs.o2, 1) + ' % in the flue gas corresponds to about ' + tfix(r.overall.excessAirPct, 0) + ' % excess air, above the 4–6 % O₂ band for efficient combustion; every unit of excess air leaves the stack hot and raises the dry flue gas loss directly.']);
        else notes.push(['ok', 'Oxygen of ' + tfix(r.inputs.o2, 1) + ' % (about ' + tfix(r.overall.excessAirPct, 0) + ' % excess air) is within the band for efficient combustion.']);
        if (r.inputs.coPpm >= 400) notes.push(['bad', 'CO of ' + tfix(r.inputs.coPpm, 0) + ' ppm shows incomplete combustion; check burner or grate air distribution and fuel sizing.']);
        else if (r.inputs.coPpm === 0) notes.push(['ok', 'CO of 0 ppm indicates complete combustion, so there is no incomplete-combustion loss to recover.']);
        if (r.inputs.flueTemp > 220) notes.push(['bad', 'A flue gas temperature of ' + tfix(r.inputs.flueTemp, 0) + ' °C is high for this class of ' + noun + '; an economiser or air pre-heater, and cleaning of heat transfer surfaces, would recover part of the dry flue gas loss.']);
        notes.push([null, 'The largest single loss is ' + biggest.label.replace(/^L\d\. /, '').toLowerCase() + ' at ' + tfix(r.overall[biggest.key]) + ' % of the heat input.']);
        notes.forEach(function(nn){ B.push(blk(bNote(nn[1], nn[0]))); });

        /* analyser recording, with the samples marked */
        if (inst && inst.logs.length > 1){
          var logs = inst.logs, xl = logs.map(function(l){ return l.time; });
          var marks = t.samples.filter(function(sm){ return sm.logNo; }).map(function(sm){ return { index:logs.map(function(l){ return l.logNo; }).indexOf(sm.logNo), label:'S' + (t.samples.indexOf(sm) + 1) }; }).filter(function(m){ return m.index >= 0; });
          B.push(blk(bP(inst.analyser + ' recording ' + txPeriod(inst) + '. Dots mark the readings used as samples (S1, S2 …); non-numeric analyser readings (----, O2++, No Probe Fitted) show as gaps.', { size:9.5, italic:true })));
          [['o2','O₂','%',SERIES[0]], ['co2','CO₂','%',SERIES[2]], ['co','CO','ppm',SERIES[1]], ['t1','Flue gas temperature T1','°C',C.bad], ['ta','Ambient temperature Ta','°C',SERIES[3]]].forEach(function(sr){
            var vals = logs.map(function(l){ return l[sr[0]]; });
            if (!vals.some(function(v){ return v !== null && isFinite(v); })) return;
            B.push(blk(bChart(chartLines(xl, [{ name:sr[1], color:sr[3], values:vals }], sr[1], sr[2], { h:120, marks:marks }))));
          });
        }
      } else B.push(blk(bNote('The fuel for this test is missing from the Thermo-X file, so the losses cannot be worked.', 'bad')));
    });
    if (!s.directTests.length && !s.indirectTests.length) B.push(blk(bNote('No test recorded for this ' + noun + ' in Thermo-X.')));
  });

  if (manual && manual.obs) B.push(blk(bP(manual.obs)));
  ledgerFor(B, moduleId);
}

/* ------------------------------------------------------------------
   THE SCREEN CARD - at the top of the Boiler and Thermic fluid heater
   pages: what came from Thermo-X and which tests will print.
   ------------------------------------------------------------------ */
function txCard(w, kind){
  var T = txState(), boilers = txBoilersOf(kind);
  var noun = kind === 'tfh' ? 'heater' : 'boiler';
  var c = card('From Thermo-X', boilers.length
    ? 'This chapter prints from the Thermo-X data below, with Thermo-X\'s own formulas. The manual cards further down are only used when there is no Thermo-X data.'
    : 'Export the Excel exchange file from the Thermo-X app (Report → Export Excel) and drop it here; the fuels, ' + noun + 's and tests then print without retyping. Until then the manual cards below are used.');
  var k = el('div'); k.className = 'kpis';
  [['Fuels', String(T.fuels.length)], [noun === 'heater' ? 'Heaters' : 'Boilers', String(boilers.length)],
   ['Direct tests', String(T.directTests.filter(function(t){ return boilers.some(function(b){ return b.id === t.boilerId; }); }).length)],
   ['Indirect tests', String(T.indirectTests.filter(function(t){ return boilers.some(function(b){ return b.id === t.boilerId; }); }).length)]].forEach(function(p){
    var x = el('div'); x.className = 'kpi'; x.appendChild(el('span','', p[0])).className = 'k'; x.appendChild(el('span','', p[1])).className = 'v'; k.appendChild(x);
  });
  c.appendChild(k);
  if (T.upload) c.appendChild(el('p','', txUploadStamp())).className = 'callout good';
  boilers.map(txSummary).forEach(function(s){
    var box = el('div','border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin-top:8px;');
    box.appendChild(el('strong','', s.boiler.name + ' — ' + ([s.boiler.make, s.boiler.model].filter(Boolean).join(' ') || s.boiler.boilerType)));
    box.appendChild(el('div','font-size:12px;color:var(--ink-2);margin-top:4px;font-family:"IBM Plex Mono",monospace;',
      'direct ' + (isFinite(s.direct) ? fix(s.direct, 1) + ' %' : '—') + ' · indirect ' + (isFinite(s.indirect) ? fix(s.indirect, 1) + ' %' : '—') +
      (s.rated !== null ? ' · rated ' + fix(s.rated, 1) + ' %' : '') + ' · ' + s.nDirect + ' direct, ' + s.nIndirect + ' indirect test' + (s.nIndirect === 1 ? '' : 's') + ' · ' + s.remark));
    c.appendChild(box);
  });
  var drop = el('div','margin-top:10px;');
  drop.appendChild(importDrop({ compact:true, label:'Drop the Thermo-X exchange file here, or click to choose', hint:'One or several files; fuels, ' + noun + 's and tests merge by their Thermo-X id, newest copy wins.' }));
  drop.appendChild(importLogBox());
  c.appendChild(drop);
  var bar = el('div','display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;');
  if (T.boilers.length) bar.appendChild(btn('Remove Thermo-X data', function(){
    if (confirm('Remove everything imported from Thermo-X? The manual cards will be used again.')){ S.thermox = blankThermox(); save(); renderAll(); }
  }));
  c.appendChild(bar);
  w.appendChild(c);
}
