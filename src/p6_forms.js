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
    ' recommendations are still marked draft. Verify them on their chapters before the report goes out.')).className='callout';
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
  c.appendChild(el('p','','Recommendations are added and edited on the chapter they belong to — the electricity bill and each utility.')).className='callout info';
  w.appendChild(c);
};

/* ---------------- Recommendation ledger ---------------- */
/* The chapters that carry recommendations: the electricity bill and every
   utility, in report order. Distribution and transformer keep their names
   so rows written for them in older drafts still print, but they are not
   offered as a place to add new ones. */
var MODULE_NAMES = { bills:'Electricity bill',
  boiler:'Boiler', tfh:'Thermic fluid heater', compressor:'Air compressor',
  coolingTower:'Cooling tower', chiller:'Chiller', pumps:'Pumping system',
  jets:'Jet machines', lux:'Lighting', solar:'Solar', earth:'Earth loop resistance',
  machines:'Machine monitoring', sop:'Guidelines / SOP',
  dist:'Electrical distribution', tr:'Transformer / PQ', other:'Other' };
var RECO_CHAPTERS = ['bills','boiler','tfh','compressor','coolingTower','chiller','pumps',
  'jets','lux','solar','earth','machines','sop'];

FORMS.ledger = function(w){
  var c = card('Recommendation ledger',
    'Every recommendation in the report, grouped by the chapter it belongs to. Each one prints at the end of its chapter with its title, observation, recommendation, any photographs or tables, and its benefit worked out in the open. The Certificate, the Executive Summary and the savings table are all read from here.');
  var t = rollUp(S.ledger);
  c.appendChild(el('p','', S.ledger.length
    ? S.ledger.length + ' recommendation' + (S.ledger.length === 1 ? '' : 's') + ' · ' + rupees(t.moneyTotal) + ' a year · payback ' + months(t.roi)
    : 'No recommendations yet. Add one under the chapter it belongs to.')).className = 'callout info';
  w.appendChild(c);

  /* Chapters in report order; a chapter with recommendations always shows,
     an empty utility chapter only if it is switched on for this report. */
  /* The offered chapters first; any legacy chapter only if it has rows. */
  var order = RECO_CHAPTERS.concat(Object.keys(MODULE_NAMES).filter(function(k){ return RECO_CHAPTERS.indexOf(k) < 0; }));
  order.forEach(function(mid){
    var sec = sectionById(mid);
    var has = S.ledger.some(function(r){ return r.module === mid; });
    if (!has && RECO_CHAPTERS.indexOf(mid) < 0) return;
    if (!has && sec && sec.opt && !S.enabled[sec.opt]) return;
    chapterRecoCard(w, mid, { showModule:true });
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

/* Energy and water baseline forms live in p17_baseline.js. */

/* ---------------- GHG ---------------- */
FORMS.ghg = function(w){
  var g = baselineGhg();
  var c = card('GHG emission accounting',
    'Scope 1 and Scope 2 are computed from the baseline - one emission factor per fuel, set on the Energy baseline screen - and the grid factor below. The narrative that opens the chapter is standing text; only the figures in it change.');
  var k = el('div'); k.className='kpis';
  var mob = mobileEmission();
  [['Scope 1 stationary', fix(g.s1) + ' tCO₂e'], ['Scope 1 mobile', fix(mob) + ' tCO₂e'],
   ['Scope 2 gross', fix(g.s2) + ' tCO₂e'], ['Scope 2 net', fix(g.s2 - (num(S.ghg.reOffset)||0)) + ' tCO₂e'],
   ['Total', fix(g.s1 + mob + g.s2 - (num(S.ghg.reOffset)||0)) + ' tCO₂e']].forEach(function(p){
    var d = el('div'); d.className='kpi';
    d.appendChild(el('span','', p[0])).className='k';
    d.appendChild(el('span','', p[1])).className='v';
    k.appendChild(d);
  });
  c.appendChild(k);
  var fuelFields = (S.baseline.fuels || []).map(function(f){
    return fNum(f,'ef','Emission factor — ' + f.name + ' (kgCO₂e per ' + f.unit + ')', '',
      'Applied to every month of ' + f.name.toLowerCase() + ' in the Scope 1 table. DEFRA 2025: coal ~2,402/ton, diesel 2.66/L, PNG 2.02/SCM.');
  });
  if (!fuelFields.length) c.appendChild(el('p','', 'No fuels yet — add them on the Energy baseline screen and their emission factors will be asked here.')).className = 'callout';
  c.appendChild(gridOf(fuelFields.concat([
    fNum(S.costs,'gridEF','Emission factor — grid electricity (kgCO₂e per kWh)', '0.716', 'Applied to every month of Grid Input Energy in the Scope 2 table. CEA v21.0: 0.716.'),
    fText(S.costs,'gridSrc','Grid factor source'),
    fText(S.costs,'fuelSrc','Fuel factor source'),
    fText(S.ghg,'meterName','Electricity metered by','ABT meter'),
    fText(S.ghg,'site','Plant premises named in the boundary','Palsana GIDC', 'Blank uses the address line 2 from the cover.')
  ]), true));
  w.appendChild(c);

  var c2 = card('Mobile combustion (Scope 1)', 'Fuel burnt in vehicles and mobile equipment on site. Leave the quantity blank if there is none.');
  c2.appendChild(gridOf([
    fText(S.ghg,'mobileFuel','Fuel','Diesel'),
    fNum(S.ghg,'mobileQty','Quantity in the period'),
    fSelect(S.ghg,'mobileUnit','Unit', ['Litre','kg','SCM']),
    fNum(S.ghg,'mobileEf','Emission factor kgCO₂e per unit', '2.66')
  ], true));
  w.appendChild(c2);

  var c3 = card('Renewable purchase offset (Scope 2)', 'Electricity bought from renewable sources reduces the net Scope 2 figure. Leave blank if none.');
  c3.appendChild(gridOf([
    fNum(S.ghg,'reOffset','Offset tCO₂e in the period'),
    fText(S.ghg,'reOffsetSince','Offset applies from','April 2025'),
    fText(S.ghg,'inventoryLink','Detailed inventory workbook','Mahadev Silk Mills Surat_ GHG Emission Account.xlsx', 'Named at the end of the boundary text.')
  ], true));
  c3.appendChild(fArea(S.ghg,'scope3Note','Scope 3 note', 'Why Scope 3 was excluded, if it was.'));
  w.appendChild(c3);
};

/* The electricity bill form and billDerived() live in p18_ebill.js. */

/* ---------------- Electrical distribution ---------------- */
/* FORMS.dist lives in p19_pq.js. */

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
