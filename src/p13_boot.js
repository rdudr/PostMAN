/* ===================================================================
   BOOT
   =================================================================== */
loadState();

q('zoom').addEventListener('change', drawPreview);
q('guides').addEventListener('change', drawPreview);
q('print').addEventListener('click', function(){ window.print(); });
q('reset').addEventListener('click', function(){
  if (!confirm('Clear this draft and start a new report?')) return;
  S = blankState(); save(); renderAll();
});

document.querySelectorAll('.vtab').forEach(function(t){
  t.addEventListener('click', function(){
    document.querySelectorAll('.vtab').forEach(function(x){
      x.setAttribute('aria-selected', String(x === t));
    });
    document.body.classList.toggle('show-preview', t.dataset.view === 'preview');
    document.body.classList.remove('show-nav');
    if (t.dataset.view === 'preview') drawPreview();
  });
});
q('navtoggle').addEventListener('click', function(){
  document.body.classList.toggle('show-nav');
});
function syncNavToggle(){
  q('navtoggle').style.display = window.matchMedia('(max-width:820px)').matches ? '' : 'none';
}
window.addEventListener('resize', syncNavToggle);
syncNavToggle();

/* On a narrow screen open at a zoom that fits, so the page never scrolls
   sideways. The stage may be hidden behind a tab, so fall back to the window. */
(function fitZoom(){
  var sel = q('zoom');
  var stageW = q('stage').clientWidth;
  var avail = (stageW > 0 ? stageW : window.innerWidth) - 34;
  if (avail <= 0) return;
  var opts = Array.prototype.map.call(sel.options, function(o){ return parseFloat(o.value); })
    .sort(function(a,b){ return a - b; });
  var fits = opts.filter(function(z){ return PAGE.w * PT * z <= avail; });
  sel.value = String(fits.length ? Math.max.apply(null, fits) : opts[0]);
})();

/* ---- sample data: the Shree Mahadev silk mill, so the tool can be judged
   with a real shape of report rather than an empty one. ---- */
q('demo').addEventListener('click', function(){
  if (S.company.name && !confirm('Replace the current draft with the sample report?')) return;
  S = blankState();
  S.company = { name:'Shree Mahadev Silk Mills Pvt. Ltd.',
    addr1:'Survey No. 142, Kadodara–Bardoli Road', addr2:'Palsana Industrial Estate',
    district:'Surat', state:'Gujarat', pincode:'394315',
    website:'', phone:'', mail:'', poc:'Mr. Subhajit Bose',
    pocRole:'Manager – Utilities', dept:'the electrical maintenance team' };
  S.meta.financialYear = '2026-27';
  S.meta.preparedBy = 'Rahul Jayantibhai Patel';
  S.costs = { unitRate:8.4, fuelType:'Coal', fuelCost:9500, fuelUnit:'tonne', gcv:4200,
    evapRatio:4.5, days:350, gridEF:0.716, gridSrc:'CEA CO2 Baseline Database v21.0, Dec 2025',
    fuelEF:2380, fuelSrc:'UK DEFRA GHG conversion factors 2025' };
  S.team.plant = [
    { sr:1, name:'Mr. Subhajit Bose', role:'Manager – Utilities' },
    { sr:2, name:'Mr. Hitesh Patel', role:'Electrical Supervisor' }
  ];
  S.production.intro = 'Shree Mahadev Silk Mills is a textile processing unit engaged in dyeing and finishing of synthetic and blended fabrics.\nThe plant runs jet dyeing machines, a coal-fired boiler and a thermic fluid heater supplying the stenter line, with a connected load of approximately 1.2 MW.';
  S.production.products = [
    { sr:1, product:'Dyed polyester fabric', cas:'—', status:'Commercial' },
    { sr:2, product:'Finished blended fabric', cas:'—', status:'Commercial' }
  ];
  S.baseline.thermalName = 'Coal'; S.baseline.thermalUnit = 'Tonne';
  var labels = fyMonths('2026-27');
  var kwhSeed = [248,262,271,286,301,294,277,265,258,269,281,275];
  var coalSeed = [86,91,94,99,104,102,96,92,89,93,97,95];
  S.baseline.elec = labels.map(function(m,i){ return { month:m, kwh:kwhSeed[i]*1000 }; });
  S.baseline.thermal = labels.map(function(m,i){ return { month:m, qty:coalSeed[i] }; });
  var mdSeed = [597,612,628,641,666,655,624,601,589,608,631,619];
  var pfSeed = [0.962,0.958,0.949,0.941,0.936,0.944,0.951,0.955,0.947,0.938,0.952,0.961];
  S.bills = labels.map(function(m,i){
    var kwh = kwhSeed[i]*1000, kvah = Math.round(kwh / pfSeed[i]);
    var energy = Math.round(kwh * 6.1), demand = Math.round(Math.max(mdSeed[i], 0.85*800) * 380);
    var fppa = Math.round(kwh * 1.15), duty = Math.round((energy + demand) * 0.15);
    return { month:m, contract:800, actualMD:mdSeed[i],
      billingDemand:Math.round(Math.max(mdSeed[i], 0.85*800)), kwh:kwh, kvah:kvah,
      pf:pfSeed[i], energyCharge:energy, demandCharge:demand, fuelSurcharge:fppa,
      duty:duty, other:0, rebate:0, net:energy+demand+fppa+duty,
      todNight:Math.round(kwh*0.33), todPeak:Math.round(kwh*0.11) };
  });
  S.billNotes.pfNote = 'The monthly power factor dropped below the desirable level of 0.95 in five months, with the lowest recorded value 0.936. A low power factor forfeits the utility rebate and increases reactive current, system losses and transformer loading.';
  S.billNotes.cdNote = 'The plant operates at a contract demand of 800 kVA against a highest recorded maximum demand of 666 kVA. Because minimum billing demand is 85 % of contract demand, the plant pays for 680 kVA every month regardless of use.';
  S.dist.demand = { contract:800, avg:508.91, min:98.26, max:607.11,
    window:'9th June 2026 10:06 to 10th June 2026 01:52 (27 hrs recording)' };
  S.dist.pcc = [
    { name:'New Panel Power', v:430.06, i:485.38, kw:351.15, kvar:-11.14, kva:366.04, pf:0.959, vthd:6.01, ithd:22.90 },
    { name:'Old Panel Power', v:428.40, i:229.10, kw:167.60, kvar:17.35, kva:170.39, pf:0.983, vthd:3.15, ithd:8.37 },
    { name:'Stenter MCC', v:429.10, i:141.20, kw:98.40, kvar:22.10, kva:104.85, pf:0.938, vthd:5.80, ithd:18.40 }
  ];
  S.dist.motors = [
    { sr:1, name:'Jet Dyeing Pump 1', rated:37, starter:'VFD', freq:44, v:415, i:52.1, kw:33.8, kvar:9.1, kva:37.4, pf:0.904 },
    { sr:2, name:'Jet Dyeing Pump 2', rated:37, starter:'VFD', freq:46, v:415, i:58.4, kw:39.1, kvar:10.4, kva:41.9, pf:0.933 },
    { sr:3, name:'Stenter Exhaust Fan', rated:22, starter:'DOL', freq:50, v:414, i:29.8, kw:16.4, kvar:8.9, kva:21.4, pf:0.766 },
    { sr:4, name:'Boiler FD Fan', rated:15, starter:'DOL', freq:50, v:416, i:20.1, kw:11.2, kvar:6.1, kva:14.5, pf:0.772 },
    { sr:5, name:'Cooling Tower Pump', rated:18.5, starter:'DOL', freq:50, v:415, i:24.9, kw:8.9, kvar:6.8, kva:17.9, pf:0.497 }
  ];
  S.dist.motorNote = 'Jet Dyeing Pump 2 runs at 105.7 % of rated capacity. Continuous operation above rating raises winding temperature, degrades insulation and shortens motor life. The cooling tower pump at 48 % load is oversized for its duty.';
  S.dist.apfc = [
    { stage:'Stage 1', rated:25, v:415, ir:34.2, iy:34.0, ib:33.8, remark:'Healthy' },
    { stage:'Stage 2', rated:25, v:415, ir:33.9, iy:34.1, ib:34.0, remark:'Healthy' },
    { stage:'Stage 8', rated:50, v:415, ir:41.2, iy:40.8, ib:22.1, remark:'Derated — one phase weak' }
  ];
  S.dist.apfcNote = 'Stage 8 draws markedly lower current on one phase, indicating a failed capacitor element. Effective bank capacity is therefore below nameplate.';
  S.tr = deepMerge(S.tr, { make:'VOLTAMP', capacity:1000, primaryV:11000, secondaryV:433,
    impedance:5.02, noLoadLoss:1.35, loadLoss:9.8, oilQty:'980 litre', year:'2016', srNo:'VT-2016-4471',
    loading:38.2, stdEff:99.28, actualEff:99.02, vthd:5.61, ithd:24.01,
    thermoNote:'No critical temperature was found on the transformer body, bushings or the gantry structure. Maximum recorded surface temperature was 52.4 °C against an ambient of 34 °C.',
    panels:[{ name:'New Panel Main Line Transformer', recId:'REC-0612-A', curves:[], stats:[
      { p:'Apparent power kVA', avg:366.04, min:307.53, max:423.75 },
      { p:'Active power kW', avg:351.15, min:297.52, max:404.06 },
      { p:'Power factor', avg:0.96, min:0.89, max:0.97 },
      { p:'Voltage THD %', avg:6.01, min:5.12, max:7.55 },
      { p:'Current THD %', avg:23.84, min:18.10, max:33.20 }
    ]}] });
  S.enabled.boiler = true; S.enabled.jets = true; S.enabled.pumps = true; S.enabled.lux = true;
  S.boiler.spec = [
    { p:'Boiler ID and make', v:'GT-6942, Thermax' },
    { p:'Type', v:'Solid fuel fired, water tube' },
    { p:'Rated capacity', v:'4 TPH' },
    { p:'Design pressure', v:'10.54 kg/cm²' },
    { p:'Fuel', v:'Indian coal' }
  ];
  S.boiler.direct = { steam:3450, feedTemp:82, steamEnthalpy:664, fuel:790, pressure:9.5 };
  S.boiler.indirect = { o2:10.55, co:0, tf:185.34, ta:34, radiation:1.5 };
  S.boiler.obs = 'Average oxygen in the flue gas was 10.55 %, corresponding to roughly 101 % excess air, well above the recommended range. CO was 0 ppm throughout, so combustion is complete and the loss is entirely in excess air.';
  S.jets = [
    { jetNo:'JET-01', jetType:'U Jet', insulation:'UnInsulated', capacity:300, surfaceArea:14.2, avgBodyTemp:74.5, ambientTemp:34, steamSaving:18.4, pumpEfficiency:36.2, trapStatus:'Trap Passing', heatingTimePerDay:9 },
    { jetNo:'JET-02', jetType:'U Jet', insulation:'Insulated', capacity:300, surfaceArea:14.2, avgBodyTemp:41.2, ambientTemp:34, steamSaving:2.1, pumpEfficiency:58.4, trapStatus:'Working OK', heatingTimePerDay:9 },
    { jetNo:'JET-03', jetType:'Long Jet', insulation:'Half Insulated', capacity:500, surfaceArea:22.6, avgBodyTemp:63.8, ambientTemp:34, steamSaving:21.7, pumpEfficiency:44.1, trapStatus:'Working OK', heatingTimePerDay:9 }
  ];
  S.pumps = [
    { name:'Boiler feed pump', make:'Kirloskar', ratedKw:15, flow:11.2, head:110, motorKw:12.8, motorEff:91 },
    { name:'Cooling tower pump', make:'CRI', ratedKw:18.5, flow:148, head:18, motorKw:8.9, motorEff:89 }
  ];
  S.lux = [
    { sr:1, location:'Dyeing hall', area:420, lux:186, watt:2400, target:25 },
    { sr:2, location:'Stenter line', area:310, lux:142, watt:2100, target:25 },
    { sr:3, location:'Quality lab', area:48, lux:410, watt:520, target:40 },
    { sr:4, location:'Boiler house', area:96, lux:78, watt:900, target:20 },
    { sr:5, location:'Store passage', area:64, lux:52, watt:840, target:15 }
  ];
  S.ledger = [
    { id:uid(), module:'bills', type:'electrical', status:'verified', priority:'high', actionBy:'Plant',
      observation:'Power factor fell below 0.95 in five of twelve months, the lowest being 0.936, forfeiting the utility rebate in those months.',
      recommendation:'Replace the failed capacitor element in APFC Stage 8 and add a relay-and-contactor set so the bank switches to hold the plant above 0.95 throughout.',
      consumption:3287000, unit:'kWh/yr', saving:0, monetary:224530, investment:50000, co2:0 },
    { id:uid(), module:'bills', type:'electrical', status:'verified', priority:'medium', actionBy:'Plant',
      observation:'Highest recorded maximum demand is 666 kVA against a contract demand of 800 kVA, so the plant pays the 680 kVA minimum billing demand every month.',
      recommendation:'Reduce contract demand from 800 kVA to 700 kVA. Minimum billing demand then becomes 595 kVA, closer to the actual load pattern, with adequate headroom retained.',
      consumption:null, unit:'kVA', saving:0, monetary:153400, investment:0, co2:0 },
    { id:uid(), module:'boiler', type:'thermal', status:'verified', priority:'high', actionBy:'Plant',
      observation:'Flue gas oxygen of 10.55 % corresponds to about 101 % excess air, against the recommended 4–6 % O₂ band for this boiler.',
      recommendation:'Tune the burner air-to-fuel ratio and install an online flue gas oxygen analyser for continuous combustion control.',
      consumption:1138, unit:'tonne/yr', saving:30, monetary:285000, investment:100000, co2:71.4 },
    { id:uid(), module:'jets', type:'thermal', status:'draft', priority:'high', actionBy:'Plant',
      observation:'JET-01 is uninsulated with an average body temperature of 74.5 °C against 34 °C ambient; JET-03 is half insulated at 63.8 °C.',
      recommendation:'Insulate the shell of JET-01 and complete the insulation on JET-03, and replace the passing steam trap on JET-01.',
      consumption:1138, unit:'tonne/yr', saving:28, monetary:266000, investment:145000, co2:66.6 }
  ];
  sldBuildFromHierarchy();
  save(); renderAll();
  if (window.matchMedia('(max-width:1180px)').matches){
    var t = document.querySelector('.vtab[data-view="preview"]');
    if (t) t.click();
  }
});

renderAll();
