"use strict";
/* ===================================================================
   CORE - page geometry, design tokens, formatting, state, storage.

   Geometry is measured from the KISEM artwork (A4, 595.5 x 842.25 pt).
   Page furniture is RESERVED geometry: body content is laid into LIVE
   only and the letterhead is composited around it, so content and
   letterhead cannot overlap however long a table gets.
   =================================================================== */

var SEAL = "__SEAL__", KISEM = "__KISEM__";
/* The two artwork plates: the KISEM cover and letterhead with every
   swappable element cut out. See renderCover in p12. */
var PLATE1 = "__PLATE1__", PLATE2 = "__PLATE2__";

var PAGE = { w: 595.5, h: 842.25 };
/* LIVE is derived from the KISEM letterhead's own furniture, measured off
   the source PDF: the logo block and header rule end at y 105, the spine
   rule runs down x 560, the page-number stadium starts at y 752 and the
   bottom corner graphics reach up to y 749 on the left. Body content is laid
   into LIVE only and the letterhead is composited around it, so content and
   artwork cannot overlap however long a table gets. */
var LIVE = { l: 48, t: 112, r: 540, b: 744 };
LIVE.w = LIVE.r - LIVE.l;           /* 492 pt */
LIVE.h = LIVE.b - LIVE.t;           /* 632 pt */
/* Reserved furniture on the letterhead page, for reference and for guides. */
var FURN = {
  seal:      { l: 24.9,  t: 37.5,  r: 99.2,  b: 111.8 },
  kisem:     { l: 117.7, t: 44.1,  r: 264.8, b: 104.9 },
  headRule:  { l: 352.7, t: 87.6,  r: 543.2, b: 88.4 },
  arrow:     { l: 549.9, t: 77.2,  r: 559.0, b: 87.6 },
  spine:     { l: 548,   t: 341,   r: 572,   b: 560 },
  badge:     { l: 516.4, t: 752.0, r: 595.5, b: 787.8 }
};
var PT = 96 / 72;
function px(v){ return (v * PT) + 'px'; }

/* Report palette. Categorical hues are assigned in fixed order and never
   cycled; they passed the CVD validator against a white surface. Status
   colours are reserved - green and red mean "within" and "beyond" a
   standard limit and are never used decoratively. */
var C = {
  blue:'#004AAD', navy:'#0F2F76', yellow:'#FFDE59',
  charcoal:'#2E3A44', slate:'#374342', ink3:'#6B7A8A',
  tint:'#D9E2EC', rule:'#B9C4D0', white:'#fff',
  /* Sampled from the letterhead: the green of the Company/Address labels and
     the red of the page number and corner graphics. */
  green:'#0BA84A', red:'#C2444E',
  ok:'#0B8A45', watch:'#B47500', bad:'#C00000'
};
var SERIES = ['#004AAD', '#B4700A', '#7A2E8E', '#177245'];
var SERIES_NAME = { electrical:'#004AAD', thermal:'#B4700A', water:'#7A2E8E' };

/* The letterhead is set in six faces, two of them licensed. Where a licensed
   face cannot ship, the nearest Google Font of the same class and weight
   stands in - named here so the substitution is visible rather than a
   mystery when the cover is compared against the Canva original.
       Aptos      -> Calibri, then Archivo   (Microsoft-only; body + title)
       Garet      -> Outfit                  (commercial geometric sans)
       Migra      -> Cormorant Garamond 300  (commercial display serif) */
var F = {
  display:"Archivo,'Helvetica Neue',Arial,sans-serif",
  black:"'Archivo Black',Archivo,Arial,sans-serif",
  body:"Aptos,Calibri,'Segoe UI',Archivo,sans-serif",
  ui:"Poppins,Archivo,'Segoe UI',sans-serif",          /* Poppins, as designed */
  cond:"'League Spartan',Archivo,sans-serif",          /* League Spartan, as designed */
  cond2:"Montserrat,Archivo,sans-serif",               /* Montserrat, as designed */
  legible:"'Atkinson Hyperlegible',Archivo,sans-serif",/* Atkinson, as designed */
  foot:"Arimo,Arial,sans-serif",                       /* Arimo, as designed */
  geo:"Outfit,Poppins,Archivo,sans-serif",             /* stands in for Garet */
  disp:"'Cormorant Garamond','Times New Roman',Georgia,serif", /* stands in for Migra */
  serif:"'Playfair Display','Times New Roman',Georgia,serif",
  mono:"'IBM Plex Mono',Consolas,monospace"
};

var IEA = {
  unit:'Industrial Energy Assessment',
  institute:'Indian Institute of Technology – Gandhinagar',
  office:'Office: 326-A | AB-13, New Academic Block, Above Library, IIT Gandhinagar.',
  addr1:'326-A | AB-13, Above Library, IIT Gandhinagar,',
  addr2:'Palaj, Gandhinagar, Gujarat – 382055',
  phone:'+91-9033798820',
  mail1:'iea@iitgn.ac.in',
  mail2:'rahuljayantibhai.p@iitgn.ac.in',
  spine:'Kotak- IITM- Save Energy Mission'
};
var TYPES = { detailed:'Detailed Energy Assessment', walkthrough:'Walkthrough Energy Assessment' };
var YEARS = ['2024-25','2025-26','2026-27','2027-28','2028-29','2029-30','2030-31'];
var MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];

/* ---- formatting. One formatter for the whole report, so a figure reads
   identically in the Certificate, the Executive Summary and the module
   that produced it. ---- */
function num(v){ var n = parseFloat(v); return isFinite(n) ? n : null; }
function inr(n, d){
  if (n === null || n === undefined || !isFinite(n)) return '—';
  d = d || 0;
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits:d, maximumFractionDigits:d });
}
function rupees(n){
  if (n === null || n === undefined || !isFinite(n)) return '—';
  if (Math.abs(n) >= 100000) return '₹ ' + (n/100000).toFixed(2) + ' Lac';
  return '₹ ' + inr(Math.round(n)) + '/-';
}
function fix(n, d){ return (n === null || n === undefined || !isFinite(n)) ? '—' : Number(n).toFixed(d === undefined ? 2 : d); }
function pct(n, d){ return (n === null || !isFinite(n)) ? '—' : Number(n).toFixed(d === undefined ? 1 : d) + ' %'; }
function months(n){
  if (n === null || !isFinite(n)) return '—';
  if (n <= 0.05) return 'Immediate';
  return n.toFixed(1) + ' Months';
}
function pageNo(n){ return String(n).padStart(3,'0'); }
function reportNumber(fy, s){ return 'EAR/' + String(fy).replace(/^20/,'') + '_' + String(s).padStart(2,'0'); }
function longDate(iso){
  var d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return '—';
  var day = d.getDate();
  var sfx = (day%10===1&&day!==11)?'st':(day%10===2&&day!==12)?'nd':(day%10===3&&day!==13)?'rd':'th';
  return day + sfx + ' ' + d.toLocaleString('en-GB',{month:'long'}) + ' ' + d.getFullYear();
}
function reportFilename(fy, s, co, iso){
  var d = new Date(iso + 'T00:00:00');
  var stamp = isNaN(d) ? '' :
    String(d.getDate()).padStart(2,'0') + String(d.getMonth()+1).padStart(2,'0') + d.getFullYear();
  return 'EAR_' + String(fy).replace(/^20/,'') + '_' + String(s).padStart(2,'0') +
    '_KISEM-IITGN_' + String(co||'Company').replace(/[\\/:*?"<>|]/g,'').trim() + '_' + stamp;
}
/* Financial year "2026-27" -> the twelve month labels it covers. */
function fyMonths(fy){
  var y = parseInt(String(fy).slice(0,4), 10);
  return MONTHS.map(function(m,i){ return m + ' ' + (i < 9 ? String(y).slice(2) : String(y+1).slice(2)); });
}

/* ---- DOM helpers ---- */
function el(tag, style, text){
  var n = document.createElement(tag);
  if (style) n.setAttribute('style', style);
  if (text !== null && text !== undefined) n.textContent = text;
  return n;
}
function box(l,t,w,h){
  return 'position:absolute;left:'+px(l)+';top:'+px(t)+';width:'+px(w)+';height:'+px(h)+';';
}
function q(id){ return document.getElementById(id); }
function clear(n){ while (n.firstChild) n.removeChild(n.firstChild); }

/* ---- state ---- */
function thisFY(){
  var n = new Date();
  var y = n.getMonth() >= 3 ? n.getFullYear() : n.getFullYear() - 1;
  return y + '-' + String((y+1)%100).padStart(2,'0');
}
function blankState(){
  return {
    active:'cover',
    meta:{ reportType:'detailed', financialYear:thisFY(), serial:1, revision:'First Draft', toc:true,
           reportDate:new Date().toISOString().slice(0,10),
           assessFrom:'', assessTo:'', preparedBy:'' },
    company:{ name:'', addr1:'', addr2:'', district:'', state:'', pincode:'',
              website:'', phone:'', mail:'', poc:'', pocRole:'', dept:'' },
    assets:{ logo:null, gate:null, focalX:0.5, focalY:0.5, processFlow:null, sldImage:null },
    costs:{ unitRate:null, fuelType:'', fuelCost:null, fuelUnit:'tonne', gcv:null,
            evapRatio:null, days:350, gridEF:0.716, gridSrc:'CEA CO2 Baseline Database v21.0, Dec 2025',
            fuelEF:null, fuelSrc:'UK DEFRA GHG conversion factors 2025' },
    enabled:{ water:false, boiler:false, tfh:false, compressor:false, coolingTower:false,
              chiller:false, pumps:false, jets:false, lux:false, solar:false,
              earth:false, machines:false, sop:false },
    team:{ plant:[], iea:defaultIeaTeam() },
    production:{ intro:'', products:[], website:'', phone:'', mail:'', factoryAddress:'', flowNote:'' },
    baseline:blankBaseline(),
    appUrls:{},            /* where each field app lives; see p21_sources.js */
    bills:[],
    billCursor:0,
    billNotes:{ pfNote:'', cdNote:'', todNote:'' },
    billCfg:blankBillCfg(),
    ghg:{ scope3Note:'', note:'', site:'', mobileFuel:'Diesel', mobileQty:null, mobileUnit:'Litre', mobileEf:2.66,
         reOffset:null, reOffsetSince:'', inventoryLink:'', meterName:'ABT meter' },
    dist:{ demand:{ contract:null, avg:null, min:null, max:null, window:'' },
           pcc:[], motors:[], apfc:[], motorNote:'', apfcNote:'', mains:[], mcc:[], foxUpload:null },
    pq:blankPq(),
    thermox:blankThermox(),
    tr:{ make:'', capacity:null, primaryV:null, secondaryV:null, impedance:null,
         noLoadLoss:null, loadLoss:null, oilQty:'', year:'', srNo:'',
         meterUnits:null, loading:null, stdEff:null, actualEff:null,
         vthd:null, ithd:null, thermoNote:'', panels:[] },
    sld:{ nodes:[], edges:[], nextId:1, selected:null },
    boiler:{ spec:[], direct:{}, indirect:{}, obs:'' },
    tfh:{ spec:[], direct:{}, indirect:{}, obs:'' },
    compressor:[],
    coolingTower:[],
    chiller:{ spec:[], readings:[], obs:'' },
    pumps:[],
    jets:[],
    /* Jet costing parameters. These are JET-Eff's CompanyProfile cost fields
       under JET-Eff's own names, so an imported workbook drops straight in
       and the report recomputes exactly what the app computed. */
    jetCost:{ insulationCost:1350, pumpInvestmentCost:75000, trapReplacementCost:10000,
              fuelCost:6.5, unitRate:8.62, evaporationRatio:4.01, days:350,
              fuelName:'Coal', thermalNote:'' },
    jetThermal:[],
    lux:[],
    solar:{ capacity:null, obs:'', rows:[] },
    earth:[],
    machines:[],
    sop:[],
    instruments:defaultInstruments(),
    custom:[],
    ledger:[]
  };
}
function defaultIeaTeam(){
  return [
    { sr:1, name:'Dr. Naran Pindoriya', role:'Project Coordinator, IEA – IIT Gandhinagar' },
    { sr:2, name:'Mr. Rahul Jayantibhai Patel', role:'CEA-30215, Lead GHG Verifier | Project Manager II' }
  ];
}
function defaultInstruments(){
  return [
    { sr:1, name:'3 Phase Energy Analyzer CLASS S', make:'Krykard', model:'CA 8336', qty:1, used:true },
    { sr:2, name:'Power Quality Analyzer', make:'Krykard', model:'ALM 35', qty:1, used:true },
    { sr:3, name:'Clamp on Power Meter', make:'Fluke', model:'345', qty:1, used:true },
    { sr:4, name:'Thermal Imaging Camera', make:'FLIR', model:'E8-XT', qty:1, used:true },
    { sr:5, name:'Infrared Thermometer', make:'Fluke', model:'62 MAX+', qty:1, used:true },
    { sr:6, name:'Flue Gas Analyzer', make:'Testo', model:'350', qty:1, used:false },
    { sr:7, name:'Ultrasonic Flow Meter', make:'Fuji', model:'Portaflow', qty:1, used:false },
    { sr:8, name:'Anemometer (Vane / Hot wire)', make:'Testo', model:'440', qty:1, used:false },
    { sr:9, name:'Digital Lux Meter', make:'Lutron', model:'LX-1102', qty:1, used:false },
    { sr:10, name:'Digital Tachometer', make:'Lutron', model:'DT-2234C', qty:1, used:false },
    { sr:11, name:'Earth Resistance Tester', make:'Kyoritsu', model:'4105A', qty:1, used:false },
    { sr:12, name:'Ultrasonic Leak Detector', make:'SDT', model:'270', qty:1, used:false }
  ];
}

var S = blankState();
var KEY = 'postman.report.v2';

function loadState(){
  try {
    var raw = localStorage.getItem(KEY);
    if (!raw) return;
    var parsed = JSON.parse(raw);
    S = deepMerge(blankState(), parsed);
  } catch (e) { /* private window or blocked storage - start clean */ }
}
function deepMerge(base, over){
  if (over === null || over === undefined) return base;
  if (Array.isArray(base) || Array.isArray(over)) return Array.isArray(over) ? over : base;
  if (typeof base !== 'object' || typeof over !== 'object') return over;
  var out = {}, k;
  for (k in base) out[k] = base[k];
  for (k in over) out[k] = (k in base) ? deepMerge(base[k], over[k]) : over[k];
  return out;
}
var saveT = null;
function saveNow(){
  clearTimeout(saveT); saveT = null;
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { /* quota or blocked - the draft still lives in memory */ }
}
function save(){
  clearTimeout(saveT);
  saveT = setTimeout(saveNow, 250);
}
/* A tab closed or reloaded inside the debounce window would lose the last
   quarter-second of typing; flush it on the way out. */
window.addEventListener('beforeunload', function(){ if (saveT) saveNow(); });

/* ---- images. Alpha is preserved end to end; the stored asset is always
   PNG-32, never flattened, so one file works on the white cover and on a
   coloured header later. ---- */
function readFile(file){
  return new Promise(function(res, rej){
    var r = new FileReader();
    r.onload = function(){ res(String(r.result)); };
    r.onerror = function(){ rej(new Error('Could not read that file.')); };
    r.readAsDataURL(file);
  });
}
function loadImg(src){
  return new Promise(function(res, rej){
    var i = new Image();
    i.onload = function(){ res(i); };
    i.onerror = function(){ rej(new Error('Could not read that image.')); };
    i.src = src;
  });
}
function ingestImage(file){
  return readFile(file).then(loadImg).then(function(img){
    var cv = document.createElement('canvas');
    /* Cap the stored edge at 1800px: a 12 MP phone photo would otherwise sit
       in local storage at full size and blow the quota after three uploads. */
    var scale = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
    cv.width = Math.round(img.naturalWidth * scale);
    cv.height = Math.round(img.naturalHeight * scale);
    var cx = cv.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, 0, 0, cv.width, cv.height);
    var alpha = false;
    try {
      var d = cx.getImageData(0,0,cv.width,cv.height).data;
      for (var i = 3; i < d.length; i += 4){ if (d[i] < 250){ alpha = true; break; } }
    } catch (e) {}
    return { dataUrl: cv.toDataURL(alpha ? 'image/png' : 'image/jpeg', 0.86),
             w: img.naturalWidth, h: img.naturalHeight, alpha: alpha,
             lowRes: Math.max(img.naturalWidth, img.naturalHeight) < 600 };
  });
}
function knockoutWhite(asset, tol){
  return loadImg(asset.dataUrl).then(function(img){
    var cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    var cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0);
    var im = cx.getImageData(0,0,cv.width,cv.height), d = im.data, lim = 255 - tol;
    for (var i = 0; i < d.length; i += 4){
      if (d[i] >= lim && d[i+1] >= lim && d[i+2] >= lim) d[i+3] = 0;
    }
    cx.putImageData(im, 0, 0);
    return { dataUrl: cv.toDataURL('image/png'), w: cv.width, h: cv.height,
             alpha:true, lowRes: asset.lowRes };
  });
}

/* ---- the Recommendation Ledger. One row per recommendation, owned by the
   module that produced it. The Certificate paragraph, the Executive Summary,
   the Savings Summary table and the Observations table are all templates over
   this list, so the same figure can never appear twice with two values. ---- */
function roiMonths(r){
  var inv = num(r.investment), sav = num(r.monetary);
  if (inv === null || inv <= 0) return 0;
  if (sav === null || sav <= 0) return null;
  return (inv / sav) * 12;
}
function pctSaving(r){
  var c = num(r.consumption), s = num(r.saving);
  if (!c || c <= 0 || s === null) return null;
  return (s / c) * 100;
}
function rollUp(rows){
  var t = { elecKwh:0, thermalQty:0, money:{electrical:0,thermal:0,water:0},
            moneyTotal:0, investment:0, co2:0, roi:null, draft:0, count:rows.length };
  rows.forEach(function(r){
    if (r.status !== 'verified') t.draft++;
    /* A recommendation built with the benefit editor carries its electrical
       and thermal money separately, so one that saves both is counted in
       both columns rather than lumped under whichever type it was labelled. */
    if (typeof recoBenefits === 'function' && (r.electrical || (r.thermal && r.thermal.length))){
      var b = recoBenefits(r);
      t.elecKwh += b.annualKwh || 0;
      Object.keys(b.thermalTotals).forEach(function(u){ t.thermalQty += b.thermalTotals[u]; });
      t.money.electrical += b.electricalSavingInr || 0;
      t.money.thermal += b.thermalSavingInr || 0;
      t.moneyTotal += b.totalSavingInr || 0;
      t.investment += b.investmentInr || 0;
    } else {
      var s = num(r.saving) || 0;
      if (r.type === 'electrical') t.elecKwh += s;
      if (r.type === 'thermal') t.thermalQty += s;
      var m = num(r.monetary) || 0;
      t.money[r.type] = (t.money[r.type] || 0) + m;
      t.moneyTotal += m;
      t.investment += num(r.investment) || 0;
    }
    t.co2 += num(r.co2) || 0;
  });
  t.roi = t.moneyTotal > 0 ? (t.investment / t.moneyTotal) * 12 : null;
  return t;
}
function uid(){ return 'r' + Math.random().toString(36).slice(2,9); }
