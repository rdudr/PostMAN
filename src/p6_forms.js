/* ===================================================================
   SECTION FORMS - one builder per registry entry.
   =================================================================== */
var FORMS = {};

/* ---------------- Cover & report ---------------- */
FORMS.cover = function(w){
  var c1 = card('Company', 'The name and address printed on the cover, and the point of contact named in the Acknowledgement.');
  c1.appendChild(gridOf([
    fText(S.company,'name','Company name','Bills Biotech Pvt. Ltd.'),
    fText(S.company,'addr1','Address line 1','Plot No. P/01, Biotech Park Phase 1'),
    fText(S.company,'addr2','Address line 2','Manjusar GIDC, Savli'),
    fText(S.company,'district','District','Vadodara'),
    fText(S.company,'state','State','Gujarat'),
    fText(S.company,'pincode','PIN code','391775'),
    fText(S.company,'website','Website'),
    fText(S.company,'phone','Contact number'),
    fText(S.company,'mail','Mail ID'),
    fText(S.company,'poc','Plant point of contact','Mr. Subhajit Bose'),
    fText(S.company,'pocRole','POC designation'),
    fText(S.company,'dept','Department thanked','Whole electrical department team')
  ]));
  w.appendChild(c1);

  var c2 = card('Report', 'The financial year appears on the cover badge and in the letterhead line on every page — one value, two places.');
  c2.appendChild(gridOf([
    fSelect(S.meta,'reportType','Assessment type',
      [{v:'detailed',t:TYPES.detailed},{v:'walkthrough',t:TYPES.walkthrough}]),
    fSelect(S.meta,'financialYear','Financial year', YEARS),
    fNum(S.meta,'serial','Serial in year', '1', reportNumber(S.meta.financialYear, S.meta.serial)),
    fText(S.meta,'revision','Revision','First Draft'),
    fDate(S.meta,'reportDate','Report date'),
    fDate(S.meta,'assessFrom','Assessment from'),
    fDate(S.meta,'assessTo','Assessment to'),
    fText(S.meta,'preparedBy','Prepared by')
  ]));
  w.appendChild(c2);

  var c3 = card('Cover artwork', 'A PNG logo keeps its transparency all the way to the printed page and sits on the cover with no frame around it.');
  c3.appendChild(fImage(S.assets,'logo','Client logo (PNG preferred)',
    'Below 600 px on the long edge it will print soft.', {knockout:true}));
  c3.appendChild(fImage(S.assets,'gate','Main gate / plant photograph', null, {focal:true}));
  w.appendChild(c3);
};

/* ---------------- Team ---------------- */
FORMS.team = function(w){
  var c1 = card('Plant team', 'The people from the plant who took part. Printed as the first table under “Details of Energy Assessment Team”.');
  c1.appendChild(tableEditor(S.team.plant, [
    { k:'sr', t:'Sr', type:'num', w:'56px' },
    { k:'name', t:'Name', type:'text' },
    { k:'role', t:'Designation', type:'text' }
  ], { addLabel:'+ Add plant member', onAdd:function(r,i){ r.sr = i+1; } }));
  w.appendChild(c1);

  var c2 = card('IEAC team — IIT Gandhinagar', 'Comes from the standing roster; edit only when the team for this assessment differs.');
  c2.appendChild(tableEditor(S.team.iea, [
    { k:'sr', t:'Sr', type:'num', w:'56px' },
    { k:'name', t:'Name', type:'text' },
    { k:'role', t:'Designation', type:'text' }
  ], { addLabel:'+ Add team member', onAdd:function(r,i){ r.sr = i+1; } }));
  w.appendChild(c2);
};

/* ---------------- Preface & disclaimer ---------------- */
FORMS.frontText = function(w){
  var c = card('Defaults library', 'Acknowledgement, Preface and Disclaimer were word-for-word identical across all three sample reports, so they are defaults rather than fields. Only the names inside the Acknowledgement change.');
  c.appendChild(gridOf([
    fText(S.company,'poc','Plant point of contact','Mr. Subhajit Bose'),
    fText(S.company,'dept','Department thanked','Whole electrical department team')
  ]));
  var p = el('div','margin-top:14px;font-size:12.5px;color:var(--ink-2);line-height:1.6;');
  p.appendChild(el('div','font-weight:600;color:var(--ink);margin-bottom:4px;',
    'Acknowledgement, as it will read:'));
  p.appendChild(el('div','', fillTemplate(DEFAULTS.acknowledgement[1])));
  c.appendChild(p);
  c.appendChild(el('p','', 'Defaults version ' + DEFAULTS.version +
    '. Wording, the instrument catalogue and the emission factors all age — check them against the current CEA and DEFRA publications before a report goes out.')).className = 'callout';
  w.appendChild(c);
};

/* ---------------- Certificate (derived) ---------------- */
FORMS.certificate = function(w){
  var t = rollUp(S.ledger);
  var c = card('Certificate of Energy Assessment',
    'Every figure in this paragraph is read from the Recommendation Ledger. Nothing here is typed, which is exactly why the Certificate and the Executive Summary can no longer disagree.');
  var k = el('div'); k.className='kpis';
  [['Electrical savings', inr(Math.round(t.elecKwh)) + ' kWh'],
   ['Thermal savings', inr(Math.round(t.thermalQty)) + ' ' + (S.baseline.thermalUnit || 'unit')],
   ['Monetary savings', rupees(t.moneyTotal)],
   ['Investment', rupees(t.investment)],
   ['Payback', months(t.roi)],
   ['CO₂ reduction', fix(t.co2) + ' tCO₂e']].forEach(function(p){
    var d = el('div'); d.className='kpi';
    d.appendChild(el('span','', p[0])).className='k';
    d.appendChild(el('span','', p[1])).className='v';
    c.appendChild(d);
    k.appendChild(d);
  });
  clear(c); c.appendChild(el('legend','','Certificate of Energy Assessment'));
  c.appendChild(el('p','','Every figure in this paragraph is read from the Recommendation Ledger. Nothing here is typed, which is exactly why the Certificate and the Executive Summary can no longer disagree.')).className='hint';
  c.appendChild(k);
  if (t.draft) c.appendChild(el('p','', t.draft + ' of ' + t.count +
    ' recommendations are still marked draft. Verify them in the ledger before the report goes out.')).className='callout';
  else if (t.count) c.appendChild(el('p','', 'All ' + t.count + ' recommendations verified.')).className='callout good';
  w.appendChild(c);

  var c2 = card('Signatory');
  c2.appendChild(gridOf([
    fText(S.meta,'preparedBy','Signed by','Rahul Jayantibhai Patel'),
    fText(S.meta,'revision','Revision')
  ]));
  w.appendChild(c2);
};

/* ---------------- Executive summary (derived) ---------------- */
FORMS.summary = function(w){
  var t = rollUp(S.ledger);
  var c = card('Savings summary', 'Rolled up from the ledger, split electrical and thermal exactly as the sample reports do.');
  var k = el('div'); k.className='kpis';
  [['Recommendations', String(t.count)],
   ['Electrical ₹/yr', rupees(t.money.electrical)],
   ['Thermal ₹/yr', rupees(t.money.thermal)],
   ['Total ₹/yr', rupees(t.moneyTotal)],
   ['Investment', rupees(t.investment)],
   ['Payback', months(t.roi)]].forEach(function(p){
    var d = el('div'); d.className='kpi';
    d.appendChild(el('span','', p[0])).className='k';
    d.appendChild(el('span','', p[1])).className='v';
    k.appendChild(d);
  });
  c.appendChild(k);
  c.appendChild(el('p','','Add or edit the underlying rows in the Recommendation Ledger.')).className='callout info';
  w.appendChild(c);
};

/* ---------------- Recommendation ledger ---------------- */
var MODULE_NAMES = { bills:'Electricity bill', dist:'Electrical distribution', tr:'Transformer / PQ',
  boiler:'Boiler', tfh:'Thermic fluid heater', compressor:'Air compressor',
  coolingTower:'Cooling tower', chiller:'Chiller', pumps:'Pumping system',
  jets:'Jet machines', lux:'Lighting', solar:'Solar', machines:'Machine monitoring', other:'Other' };

FORMS.ledger = function(w){
  var c = card('Recommendation ledger',
    'One row per recommendation. The Certificate, the Executive Summary, the savings table and each module’s “Recommendation in …” heading are all templates over this list — so a figure entered once appears everywhere and can never disagree with itself.');
  var add = btn('+ Add recommendation', function(){
    S.ledger.push({ id:uid(), module:'other', observation:'', recommendation:'',
      type:'electrical', consumption:null, unit:'kWh/yr', saving:null,
      monetary:null, investment:null, co2:null, priority:'medium', actionBy:'Plant', status:'draft' });
    save(); renderAll();
  });
  c.appendChild(add);
  w.appendChild(c);

  S.ledger.forEach(function(r, idx){
    var box = el('div'); box.className = 'rec ' + r.type;
    var h = el('h4');
    h.appendChild(document.createTextNode((idx+1) + '. ' + (MODULE_NAMES[r.module] || 'Other')));
    var pill = el('span','', r.status === 'verified' ? 'verified' : 'draft');
    pill.className = 'pill ' + (r.status === 'verified' ? 'ok' : 'draft');
    h.appendChild(pill);
    var roi = roiMonths(r), ps = pctSaving(r);
    h.appendChild(el('span','margin-left:auto;font-family:'+F.mono+';font-size:11px;color:var(--ink-3)',
      rupees(num(r.monetary)) + ' · ' + months(roi)));
    h.style.display = 'flex';
    box.appendChild(h);

    box.appendChild(gridOf([
      fSelect(r,'module','Module', Object.keys(MODULE_NAMES).map(function(k){ return {v:k,t:MODULE_NAMES[k]}; })),
      fSelect(r,'type','Energy type', [{v:'electrical',t:'Electrical'},{v:'thermal',t:'Thermal'},{v:'water',t:'Water'}]),
      fSelect(r,'status','Status', [{v:'draft',t:'Draft'},{v:'verified',t:'Verified'}]),
      fSelect(r,'priority','Priority', ['critical','high','medium','low']),
      fText(r,'actionBy','Action by','Plant / Vendor')
    ], true));
    box.appendChild(fArea(r,'observation','Observation','What was measured and what it means.'));
    box.appendChild(fArea(r,'recommendation','Recommendation','What to do, and what it will change.'));
    box.appendChild(gridOf([
      fNum(r,'consumption','Annual consumption'),
      fText(r,'unit','Unit','kWh/yr'),
      fNum(r,'saving','Annual saving', null, ps === null ? '' : pct(ps) + ' of consumption'),
      fNum(r,'monetary','Monetary saving ₹/yr'),
      fNum(r,'investment','Investment ₹'),
      fNum(r,'co2','CO₂ reduction tCO₂e')
    ]));
    var bar = el('div','display:flex;gap:8px;margin-top:10px;');
    bar.appendChild(btn('Estimate ₹ from saving', function(){
      var rate = num(S.costs.unitRate), fc = num(S.costs.fuelCost);
      if (r.type === 'electrical' && rate && num(r.saving)) r.monetary = Math.round(num(r.saving) * rate);
      else if (r.type === 'thermal' && fc && num(r.saving)) r.monetary = Math.round(num(r.saving) * fc / (S.costs.fuelUnit === 'tonne' ? 1000 : 1));
      else { alert('Set the unit rate or fuel cost in the Cost register first.'); return; }
      save(); renderAll();
    }));
    bar.appendChild(btn('Estimate CO₂', function(){
      var ef = num(S.costs.gridEF);
      if (r.type === 'electrical' && ef && num(r.saving)) r.co2 = +( (num(r.saving)/1000) * ef ).toFixed(2);
      else { alert('CO₂ estimate needs an electrical saving and a grid emission factor.'); return; }
      save(); renderAll();
    }));
    bar.appendChild(btn('Delete', function(){
      S.ledger.splice(idx,1); save(); renderAll();
    }));
    box.appendChild(bar);
    w.appendChild(box);
  });
};

/* ---------------- Production process ---------------- */
FORMS.production = function(w){
  var c = card('Plant introduction', 'The narrative that opens “Production Process and Description”.');
  c.appendChild(fArea(S.production,'intro','Introduction',
    'What the plant makes, when it was established, certifications, the main process sections.'));
  w.appendChild(c);

  var c2 = card('Products');
  c2.appendChild(tableEditor(S.production.products, [
    { k:'sr', t:'Sr', type:'num', w:'52px' },
    { k:'product', t:'Product', type:'text' },
    { k:'cas', t:'CAS / grade', type:'text' },
    { k:'status', t:'Status', type:'text', ph:'Commercial / R&D' }
  ], { addLabel:'+ Add product', onAdd:function(r,i){ r.sr = i+1; } }));
  w.appendChild(c2);

  var c3 = card('Plant location & contact');
  c3.appendChild(gridOf([
    fText(S.production,'website','Website'),
    fText(S.production,'phone','Contact number'),
    fText(S.production,'mail','Mail ID')
  ]));
  c3.appendChild(fArea(S.production,'factoryAddress','Factory address'));
  w.appendChild(c3);

  var c4 = card('Process flow diagram');
  c4.appendChild(fImage(S.assets,'processFlow','Process flow image'));
  c4.appendChild(fArea(S.production,'flowNote','Caption / legend',
    'What the colours and arrows mean.'));
  w.appendChild(c4);
};

/* ---------------- Energy baseline ---------------- */
FORMS.baseline = function(w){
  var c = card('Electrical baseline',
    'Twelve months of purchased units. This table feeds the baseline section, the GHG Scope-2 calculation and the bill analysis denominators.');
  var fillBtn = btn('Fill months from FY ' + S.meta.financialYear, function(){
    fillMonths(S.baseline.elec, S.meta.financialYear, 'kwh'); save(); renderAll();
  });
  var pullBtn = btn('Pull kWh from bills', function(){
    if (!S.bills.length){ alert('No bills entered yet.'); return; }
    S.baseline.elec = S.bills.map(function(b){ return { month:b.month, kwh:num(b.kwh) }; });
    save(); renderAll();
  });
  c.appendChild(tableEditor(S.baseline.elec, [
    { k:'month', t:'Month', type:'text', w:'110px' },
    { k:'kwh', t:'kWh', type:'num' },
    { t:'TOE', calc:function(r){ var v = num(r.kwh); return v === null ? '—' : (v * 0.00008598).toFixed(3); } }
  ], { addLabel:'+ Add month', recalc:true, extraButtons:[fillBtn, pullBtn] }));
  var te = S.baseline.elec.reduce(function(a,r){ return a + (num(r.kwh)||0); }, 0);
  c.appendChild(el('p','', 'Annual: ' + inr(Math.round(te)) + ' kWh = ' + (te*0.00008598).toFixed(2) + ' TOE.'))
    .className = 'callout info';
  w.appendChild(c);

  var c2 = card('Thermal baseline', 'Fuel consumed over the same twelve months.');
  c2.appendChild(gridOf([
    fText(S.baseline,'thermalName','Fuel','LDO / Coal / Natural gas'),
    fSelect(S.baseline,'thermalUnit','Unit', ['Litre','kg','Tonne','SCM'])
  ]));
  var fillT = btn('Fill months from FY', function(){
    fillMonths(S.baseline.thermal, S.meta.financialYear, 'qty'); save(); renderAll();
  });
  c2.appendChild(tableEditor(S.baseline.thermal, [
    { k:'month', t:'Month', type:'text', w:'110px' },
    { k:'qty', t:'Quantity', type:'num' },
    { t:'TOE', calc:function(r){
        var v = num(r.qty), g = num(S.costs.gcv);
        if (v === null || !g) return '—';
        return ((v * g) / 1e7).toFixed(3);
      } }
  ], { addLabel:'+ Add month', recalc:true, extraButtons:[fillT] }));
  c2.appendChild(el('p','','TOE uses the GCV in the Cost register (1 TOE = 10⁷ kcal). Set it there and every thermal figure follows.')).className='callout info';
  w.appendChild(c2);
};

FORMS.water = function(w){
  var c = card('Water baseline', 'Monthly water drawn, as in the Shree Mahadev report.');
  var fillW = btn('Fill months from FY', function(){
    fillMonths(S.baseline.water, S.meta.financialYear, 'm3'); save(); renderAll();
  });
  c.appendChild(tableEditor(S.baseline.water, [
    { k:'month', t:'Month', type:'text', w:'110px' },
    { k:'m3', t:'Water (m³)', type:'num' },
    { k:'source', t:'Source', type:'text', ph:'Borewell / municipal' }
  ], { addLabel:'+ Add month', extraButtons:[fillW] }));
  w.appendChild(c);
};

/* ---------------- GHG ---------------- */
FORMS.ghg = function(w){
  var c = card('GHG emission accounting',
    'Scope 1 and Scope 2 are computed from the baseline tables and the emission factors in the Cost register. The factor version is pinned into the report so an old report stays reproducible.');
  var elec = S.baseline.elec.reduce(function(a,r){ return a + (num(r.kwh)||0); }, 0);
  var fuel = S.baseline.thermal.reduce(function(a,r){ return a + (num(r.qty)||0); }, 0);
  var s2 = (elec/1000) * (num(S.costs.gridEF)||0);
  var s1 = fuel * (num(S.costs.fuelEF)||0) / 1000;
  var k = el('div'); k.className='kpis';
  [['Scope 1', fix(s1) + ' tCO₂e'], ['Scope 2', fix(s2) + ' tCO₂e'],
   ['Total', fix(s1+s2) + ' tCO₂e']].forEach(function(p){
    var d = el('div'); d.className='kpi';
    d.appendChild(el('span','', p[0])).className='k';
    d.appendChild(el('span','', p[1])).className='v';
    k.appendChild(d);
  });
  c.appendChild(k);
  c.appendChild(gridOf([
    fNum(S.costs,'gridEF','Grid factor tCO₂/MWh'),
    fText(S.costs,'gridSrc','Grid factor source'),
    fNum(S.costs,'fuelEF','Fuel factor kgCO₂e per ' + (S.baseline.thermalUnit||'unit')),
    fText(S.costs,'fuelSrc','Fuel factor source')
  ], true));
  c.appendChild(fArea(S.ghg,'scope3Note','Scope 3 note',
    'Why Scope 3 was excluded, if it was.'));
  w.appendChild(c);
};

/* ---------------- Electricity bills ---------------- */
FORMS.bills = function(w){
  var c = card('Twelve months of bills',
    'These rows produce the baseline, the whole bill-analysis section and two of the report’s recommendations. Arithmetic checks run on every row: a red cell means the bill does not add up, which is sometimes worth a line in the report.');
  var fillB = btn('Create 12 months from FY', function(){
    var labels = fyMonths(S.meta.financialYear);
    S.bills = labels.map(function(l){
      return { month:l, contract:null, actualMD:null, billingDemand:null, kwh:null, kvah:null,
               pf:null, energyCharge:null, demandCharge:null, fuelSurcharge:null, duty:null,
               other:null, rebate:null, net:null, todNight:null, todPeak:null };
    });
    save(); renderAll();
  });
  var chk = function(b){
    var parts = ['energyCharge','demandCharge','fuelSurcharge','duty','other'].reduce(function(a,k){ return a + (num(b[k])||0); }, 0)
      - (num(b.rebate)||0);
    var net = num(b.net);
    if (net === null || parts === 0) return '—';
    var diff = Math.abs(parts - net);
    return diff <= 5 ? 'ok' : ('off by ' + inr(Math.round(diff)));
  };
  var pfCalc = function(b){
    var kwh = num(b.kwh), kvah = num(b.kvah);
    if (!kwh || !kvah) return '—';
    return (kwh/kvah).toFixed(3);
  };
  c.appendChild(tableEditor(S.bills, [
    { k:'month', t:'Month', type:'text', w:'96px' },
    { k:'contract', t:'CD kVA', type:'num' },
    { k:'actualMD', t:'Actual MD', type:'num' },
    { k:'billingDemand', t:'Billing dmd', type:'num' },
    { k:'kwh', t:'kWh', type:'num' },
    { k:'kvah', t:'kVAh', type:'num' },
    { k:'pf', t:'PF (bill)', type:'num' },
    { t:'PF calc', calc:pfCalc },
    { k:'energyCharge', t:'Energy ₹', type:'num' },
    { k:'demandCharge', t:'Demand ₹', type:'num' },
    { k:'fuelSurcharge', t:'FPPPA ₹', type:'num' },
    { k:'duty', t:'Duty ₹', type:'num' },
    { k:'other', t:'Other ₹', type:'num' },
    { k:'rebate', t:'Rebate ₹', type:'num' },
    { k:'net', t:'Net ₹', type:'num' },
    { t:'Check', calc:chk },
    { k:'todNight', t:'Night kWh', type:'num' },
    { k:'todPeak', t:'Peak kWh', type:'num' }
  ], { addLabel:'+ Add bill month', recalc:true, extraButtons:[fillB] }));
  w.appendChild(c);

  var d = billDerived();
  var c2 = card('Derived from the bills', 'Load factor, plant utility factor and demand factor are computed exactly as the sample reports state them.');
  var k = el('div'); k.className='kpis';
  [['Avg units/month', inr(Math.round(d.avgKwh))],
   ['Avg actual MD', fix(d.avgMD) + ' kVA'],
   ['Avg PF', fix(d.avgPF,3)],
   ['Load factor', fix(d.loadFactor,3)],
   ['Plant utility factor', fix(d.utilityFactor,3)],
   ['Demand factor', fix(d.demandFactor,3)],
   ['Blended rate', d.blended === null ? '—' : '₹ ' + fix(d.blended,2) + '/kWh'],
   ['Night share', pct(d.nightShare)]].forEach(function(p){
    var x = el('div'); x.className='kpi';
    x.appendChild(el('span','', p[0])).className='k';
    x.appendChild(el('span','', p[1])).className='v';
    k.appendChild(x);
  });
  c2.appendChild(k);
  c2.appendChild(fArea(S.billNotes,'pfNote','Power factor observation'));
  c2.appendChild(fArea(S.billNotes,'cdNote','Contract demand observation'));
  w.appendChild(c2);
};

function billDerived(){
  var b = S.bills.filter(function(r){ return num(r.kwh); });
  var n = b.length || 1;
  var avgKwh = b.reduce(function(a,r){ return a + (num(r.kwh)||0); },0) / n;
  var avgMD = b.reduce(function(a,r){ return a + (num(r.actualMD)||0); },0) / n;
  var pfs = b.map(function(r){
    var p = num(r.pf); if (p) return p;
    var kwh = num(r.kwh), kvah = num(r.kvah);
    return (kwh && kvah) ? kwh/kvah : null;
  }).filter(function(x){ return x !== null; });
  var avgPF = pfs.length ? pfs.reduce(function(a,c){ return a+c; },0)/pfs.length : null;
  var cd = b.length ? (num(b[b.length-1].contract) || num(b[0].contract)) : null;
  var loadFactor = (avgMD && avgPF) ? avgKwh / (avgMD * avgPF * 24 * 30) : null;
  var utilityFactor = (cd && avgPF) ? avgKwh / (cd * avgPF * 24 * 30) : null;
  var demandFactor = cd ? avgMD / cd : null;
  var totalNet = b.reduce(function(a,r){ return a + (num(r.net)||0); },0);
  var totalKwh = b.reduce(function(a,r){ return a + (num(r.kwh)||0); },0);
  var blended = totalKwh ? totalNet/totalKwh : null;
  var night = b.reduce(function(a,r){ return a + (num(r.todNight)||0); },0);
  var nightShare = totalKwh ? (night/totalKwh)*100 : null;
  var maxMD = b.reduce(function(a,r){ return Math.max(a, num(r.actualMD)||0); },0);
  return { rows:b, avgKwh:avgKwh, avgMD:avgMD, avgPF:avgPF, cd:cd, maxMD:maxMD,
           loadFactor:loadFactor, utilityFactor:utilityFactor, demandFactor:demandFactor,
           blended:blended, nightShare:nightShare, totalKwh:totalKwh, totalNet:totalNet };
}

/* ---------------- Electrical distribution ---------------- */
FORMS.dist = function(w){
  var c = card('Plant load demand study', 'From the analyser recording on the incomer.');
  c.appendChild(gridOf([
    fNum(S.dist.demand,'contract','Contract demand kVA'),
    fNum(S.dist.demand,'avg','Average kVA'),
    fNum(S.dist.demand,'min','Minimum kVA'),
    fNum(S.dist.demand,'max','Maximum kVA'),
    fText(S.dist.demand,'window','Recording window','9 Jun 2026 10:06 to 10 Jun 2026 01:52 (27 hrs)')
  ]));
  w.appendChild(c);

  var c2 = card('Section-wise PCC load', 'Imported from JET-Eff, or typed here.');
  c2.appendChild(tableEditor(S.dist.pcc, [
    { k:'name', t:'Name of machine / panel', type:'text' },
    { k:'v', t:'Voltage', type:'num' }, { k:'i', t:'Current', type:'num' },
    { k:'kw', t:'kW', type:'num' }, { k:'kvar', t:'Q kVAr', type:'num' },
    { k:'kva', t:'kVA', type:'num' }, { k:'pf', t:'PF', type:'num' },
    { k:'vthd', t:'%V THD', type:'num' }, { k:'ithd', t:'%I THD', type:'num' }
  ], { addLabel:'+ Add panel' }));
  w.appendChild(c2);

  var c3 = card('Motor load study',
    '% load is computed, and anything above 100 % is flagged red in the report — an overloaded motor is a finding, not a formatting choice.');
  c3.appendChild(tableEditor(S.dist.motors, [
    { k:'sr', t:'S.No', type:'num', w:'56px' },
    { k:'name', t:'Name', type:'text' },
    { k:'rated', t:'Rated kW', type:'num' },
    { k:'starter', t:'Starter', type:'select', opts:['DOL','SD','VFD'] },
    { k:'freq', t:'Freq/rpm', type:'num' },
    { k:'v', t:'Voltage', type:'num' }, { k:'i', t:'Current', type:'num' },
    { k:'kw', t:'kW', type:'num' }, { k:'kvar', t:'kVAr', type:'num' },
    { k:'kva', t:'kVA', type:'num' }, { k:'pf', t:'PF', type:'num' },
    { t:'% Load', calc:function(r){
        var kw = num(r.kw), rated = num(r.rated);
        return (kw && rated) ? ((kw/rated)*100).toFixed(1) : '—';
      } }
  ], { addLabel:'+ Add motor', recalc:true }));
  c3.appendChild(fArea(S.dist,'motorNote','Observation in motor load'));
  w.appendChild(c3);

  var c4 = card('Automatic power factor correction study');
  c4.appendChild(tableEditor(S.dist.apfc, [
    { k:'stage', t:'Stage', type:'text', w:'80px' },
    { k:'rated', t:'Rated kVAr', type:'num' },
    { k:'v', t:'Voltage', type:'num' },
    { k:'ir', t:'I-R', type:'num' }, { k:'iy', t:'I-Y', type:'num' }, { k:'ib', t:'I-B', type:'num' },
    { k:'remark', t:'Remark', type:'text', ph:'Healthy / derated' }
  ], { addLabel:'+ Add stage' }));
  c4.appendChild(fArea(S.dist,'apfcNote','Observation in APFC'));
  w.appendChild(c4);
};

/* ---------------- Transformer & PQ ---------------- */
FORMS.tr = function(w){
  var c = card('Rated details of transformer');
  c.appendChild(gridOf([
    fText(S.tr,'make','Make','VOLTAMP'),
    fNum(S.tr,'capacity','Capacity kVA'),
    fNum(S.tr,'primaryV','Primary V'),
    fNum(S.tr,'secondaryV','Secondary V'),
    fNum(S.tr,'impedance','Impedance %'),
    fNum(S.tr,'noLoadLoss','No-load loss kW'),
    fNum(S.tr,'loadLoss','Load loss kW'),
    fText(S.tr,'oilQty','Oil quantity'),
    fText(S.tr,'year','Year of make'),
    fText(S.tr,'srNo','Serial no.')
  ]));
  w.appendChild(c);

  var c2 = card('Efficiency and harmonics',
    'Voltage THD above 5 % or current THD above 8 % breaches IEEE-519:2022 and prints red.');
  c2.appendChild(gridOf([
    fNum(S.tr,'meterUnits','Energy meter units'),
    fNum(S.tr,'loading','Average loading %'),
    fNum(S.tr,'stdEff','Standard efficiency %'),
    fNum(S.tr,'actualEff','Actual efficiency %'),
    fNum(S.tr,'vthd','Average voltage THD %'),
    fNum(S.tr,'ithd','Average current THD %')
  ]));
  c2.appendChild(fArea(S.tr,'thermoNote','Thermography observation'));
  w.appendChild(c2);

  var c3 = card('Power quality curves',
    'Drop the analyser’s exported images into the panel they belong to. Each carries its own Average / Min / Max block, which is the table that appears eight times in the Bills Biotech report.');
  c3.appendChild(btn('+ Add panel', function(){
    S.tr.panels.push({ name:'', recId:'', curves:[], stats:[
      { p:'Apparent power kVA', avg:null, min:null, max:null },
      { p:'Active power kW', avg:null, min:null, max:null },
      { p:'Power factor', avg:null, min:null, max:null },
      { p:'Voltage THD %', avg:null, min:null, max:null },
      { p:'Current THD %', avg:null, min:null, max:null }
    ] });
    save(); renderAll();
  }));
  S.tr.panels.forEach(function(p, i){
    var b = el('div','border:1px solid var(--line);border-radius:8px;padding:12px;margin-top:10px;');
    b.appendChild(gridOf([
      fText(p,'name','Panel name','New Panel Main Line Transformer'),
      fText(p,'recId','Recording ID')
    ], true));
    b.appendChild(tableEditor(p.stats, [
      { k:'p', t:'Parameter', type:'text' },
      { k:'avg', t:'Average', type:'num' },
      { k:'min', t:'Min', type:'num' },
      { k:'max', t:'Max', type:'num' }
    ], { addLabel:'+ Add parameter' }));
    var cf = el('input'); cf.type='file'; cf.accept='image/*'; cf.multiple = true;
    cf.addEventListener('change', function(){
      var files = Array.prototype.slice.call(cf.files || []);
      Promise.all(files.map(ingestImage)).then(function(list){
        list.forEach(function(a,ix){ p.curves.push({ img:a, caption:'', note:'' }); });
        save(); renderAll();
      });
    });
    b.appendChild(labelled('Add curve images', cf, 'They inherit this panel’s name and recording ID, so the caption is never wrong.'));
    p.curves.forEach(function(cv, ci){
      var r = el('div','display:flex;gap:10px;margin-top:9px;align-items:flex-start;');
      var th = el('div'); th.className='thumb';
      var im = el('img'); im.src = cv.img.dataUrl; im.alt='Curve'; th.appendChild(im);
      r.appendChild(th);
      var f = el('div','flex:1');
      f.appendChild(fText(cv,'caption','Caption','Voltage variation (URMS)'));
      f.appendChild(fText(cv,'note','Highlight note','Dip observed at 14:20, 8 % below nominal'));
      f.appendChild(btn('Remove', function(){ p.curves.splice(ci,1); save(); renderAll(); }));
      r.appendChild(f);
      b.appendChild(r);
    });
    b.appendChild(btn('Delete panel', function(){ S.tr.panels.splice(i,1); save(); renderAll(); }));
    c3.appendChild(b);
  });
  w.appendChild(c3);
};

/* ---------------- Instruments ---------------- */
FORMS.instruments = function(w){
  var c = card('Instruments used', 'Tick what was actually carried; only ticked rows print.');
  c.appendChild(tableEditor(S.instruments, [
    { k:'used', t:'Used', type:'check', w:'52px' },
    { k:'sr', t:'S.N.', type:'num', w:'56px' },
    { k:'name', t:'Instrument', type:'text' },
    { k:'make', t:'Make', type:'text' },
    { k:'model', t:'Model', type:'text' },
    { k:'qty', t:'Qty', type:'num', w:'70px' }
  ], { addLabel:'+ Add instrument', onAdd:function(r,i){ r.sr = i+1; r.used = true; } }));
  w.appendChild(c);
};

/* ---------------- Cost register ---------------- */
FORMS.costs = function(w){
  var c = card('Cost register',
    'One place per report. Every module reads these, so changing the unit rate updates every saving and every ledger row derived from one. Today these constants are re-entered in each tool and quietly diverge.');
  c.appendChild(gridOf([
    fNum(S.costs,'unitRate','Unit rate ₹/kWh'),
    fText(S.costs,'fuelType','Fuel type'),
    fNum(S.costs,'fuelCost','Fuel cost ₹ per ' + (S.costs.fuelUnit || 'tonne')),
    fSelect(S.costs,'fuelUnit','Fuel cost unit', ['tonne','litre','kg','SCM']),
    fNum(S.costs,'gcv','GCV kcal/kg'),
    fNum(S.costs,'evapRatio','Boiler evaporation ratio'),
    fNum(S.costs,'days','Operating days per year')
  ], true));
  var d = billDerived();
  if (d.blended !== null) c.appendChild(el('p','',
    'The bills imply a blended rate of ₹ ' + fix(d.blended,2) + '/kWh. Use that unless the plant prefers its own figure.')).className='callout info';
  w.appendChild(c);
};
