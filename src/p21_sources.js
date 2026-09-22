/* ===================================================================
   DATA SOURCES

   Each field app owns its own domain: FOX the panels and motors,
   Thermo-X the boiler and thermopack, JET-Eff the jets, A-CMP the
   compressors. They measure, they do the physics, they keep their own
   records. PostMan collects what they produced, prices it against one
   cost register, and writes the report.

   Two ways in, and deliberately only ONE reader behind them:

     - the workbook, downloaded from the app and dropped here;
     - the same workbook bytes handed straight over by the app, with no
       download, when PostMan opened it.

   The second is the interesting one, and the reason it is safe is that
   it is not a second format. The app sends the identical file it would
   have written to disk, base64'd through postMessage; PostMan decodes it
   and runs importAny on it exactly as if the user had dropped it. No
   second parser, no second set of field names, nothing new to keep in
   step. A transport, not a protocol.
   =================================================================== */

var APPS = [
  { id:'fox',    name:'FOX',
    url:'https://fox-kisem.vercel.app/',
    covers:['dist','tr'],
    what:'Panels, motor loads, APFC and nameplates',
    note:'Machine-wise acquisition with nameplate OCR.' },
  { id:'thermo', name:'Thermo-X',
    url:'https://thermo-x-i7tl.vercel.app/',
    covers:['boiler','tfh'],
    what:'Boiler and thermic fluid heater',
    note:'Direct and indirect efficiency, flue gas analysis.' },
  { id:'jet',    name:'JET-Eff',
    url:'https://jet-eff.vercel.app/',
    covers:['jets'],
    what:'Jet machines',
    note:'Surface loss, pump efficiency, trap performance.' },
  { id:'acmp',   name:'A-CMP',
    url:'https://a-cmp.vercel.app/',
    covers:['compressor'],
    what:'Air compressors',
    note:'FAD or pump-up test, specific energy consumption.' }
];

function appById(id){
  for (var i = 0; i < APPS.length; i++) if (APPS[i].id === id) return APPS[i];
  return null;
}
/* Thermo-X fills the boiler and TFH chapters through p20_thermox.js.
   URLs live in state so a redeploy that moves an app is a field edit,
   not a code change and a rebuild. */
function appUrl(a){
  var u = (S.appUrls && S.appUrls[a.id]) || a.url;
  return String(u || '').trim();
}
function appOrigin(a){
  try { return new URL(appUrl(a)).origin; } catch (e){ return null; }
}

/* Which modules an app fills, and whether anything has arrived yet. */
function moduleFilled(id){
  switch (id){
    case 'jets':       return S.jets.length;
    case 'compressor': return S.compressor.length;
    case 'boiler':     return (S.boiler.spec || []).length || num(S.boiler.direct.steam) !== null;
    case 'tfh':        return (S.tfh.spec || []).length;
    case 'dist':       return S.dist.pcc.length + S.dist.motors.length + S.dist.apfc.length;
    case 'tr':         return S.tr.panels.length || num(S.tr.capacity) !== null;
    default:           return 0;
  }
}

/* ---- the handoff ---------------------------------------------------
   PostMan opens the app with the plant already named, so nobody retypes
   it and the company guard has something consistent to check against.
   The app sends the workbook back through postMessage.

   Messages are accepted ONLY from an origin that is one of the app URLs
   configured here. A page that can post into this window can otherwise
   put anything it likes into a report somebody signs. */
var HANDOFF = { open:null, app:null, status:null };

function openApp(a, statusFn){
  var base = appUrl(a);
  if (!base){ alert('No web address set for ' + a.name + ' yet.'); return; }
  var q = [
    'from=postman',
    'origin=' + encodeURIComponent(location.origin),
    'company=' + encodeURIComponent(S.company.name || ''),
    'fy=' + encodeURIComponent(S.meta.financialYear || '')
  ].join('&');
  var url = base + (base.indexOf('?') >= 0 ? '&' : '?') + q;

  /* A file:// page has origin "null", so the app cannot post back to it
     and this degrades to "open the app, download, drop the file". */
  var canReceive = location.protocol === 'http:' || location.protocol === 'https:';
  var win = window.open(url, 'kisem-' + a.id);
  if (!win){
    alert('The browser blocked the pop-up. Allow pop-ups for this page, or open ' + base +
          ' yourself and drop the exported file here.');
    return;
  }
  HANDOFF.open = win; HANDOFF.app = a; HANDOFF.status = statusFn || null;
  if (statusFn) statusFn(canReceive
    ? 'Waiting for ' + a.name + ' to send its data back… you can also just export and drop the file here.'
    : 'Opened ' + a.name + '. This copy of PostMan is a local file, so the app cannot hand data back — ' +
      'export from the app and drop the file here.');
}

function handoffOrigins(){
  var out = {};
  APPS.forEach(function(a){ var o = appOrigin(a); if (o) out[o] = a; });
  return out;
}

function onHandoffMessage(ev){
  var allowed = handoffOrigins();
  var app = allowed[ev.origin];
  if (!app) return;                       /* not one of ours - ignore silently */
  var d = ev.data;
  if (!d || d.kind !== 'kisem-data' || !d.workbook) return;

  var say = HANDOFF.status || function(){};
  try {
    var bin = atob(String(d.workbook)), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    var wb = XLSX.read(arr, { type:'array' });
    var log = importAny(wb);              /* the one reader, same as a dropped file */
    save(); renderAll();
    say('');
    alert(app.name + ' sent its data:\n\n• ' + log.join('\n• '));
    if (HANDOFF.open && !HANDOFF.open.closed) { try { HANDOFF.open.close(); } catch (e) {} }
  } catch (err){
    say('');
    alert('Could not read what ' + app.name + ' sent.\n\n' + err.message +
          '\n\nExport the workbook from the app and drop it here instead.');
  }
}
window.addEventListener('message', onHandoffMessage);

/* ---- the screen ----------------------------------------------------- */
FORMS.sources = function(w){
  var c = card('Where the data comes from',
    'Each app owns its own measurements and its own formulas. PostMan collects what they produced, ' +
    'prices it against one cost register and writes the report — it does not re-derive the physics. ' +
    'Open an app with the plant already named, or drop its exported workbook here; both go through the ' +
    'same reader and the same company check.');
  w.appendChild(c);

  var status = el('div','font-size:12px;color:var(--ink-3);min-height:18px;margin:10px 0 0;');

  APPS.forEach(function(a){
    var mods = a.covers.map(function(m){ var s = sectionById(m); return s ? s.title : m; });
    var filled = a.covers.filter(function(m){ return moduleFilled(m); });
    var cc = card(a.name + ' — ' + a.what, a.note);

    var state = el('p','', filled.length
      ? 'Loaded: ' + filled.map(function(m){ var s = sectionById(m); return s ? s.title : m; }).join(', ')
      : 'Nothing imported yet. Fills: ' + mods.join(', ') + '.');
    state.className = 'callout ' + (filled.length ? 'good' : 'info');
    cc.appendChild(state);

    var bar = el('div','display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:center;');
    bar.appendChild(btn('Open ' + a.name, function(){
      openApp(a, function(t){ status.textContent = t; });
    }, 'primary'));

    var f = el('input'); f.type='file'; f.accept='.xlsx,.xls,.csv';
    f.addEventListener('change', function(){
      var file = f.files && f.files[0]; if (!file) return;
      readWorkbook(file).then(function(wb){
        var log; 
        try { log = importAny(wb); }
        catch (e){ f.value=''; alert(e.message); return; }
        f.value=''; save(); renderAll();
        alert('Imported:\n\n• ' + log.join('\n• '));
      }).catch(function(e){ alert(e.message); });
    });
    cc.appendChild(bar);
    cc.appendChild(labelled('Or drop its exported workbook', f));
    cc.appendChild(fText(S.appUrls, a.id, 'Web address', appUrl(a),
      'Change this if the app moves to a different address.'));
    w.appendChild(cc);
  });

  var noApp = SECTIONS.filter(function(s){
    if (!s.opt && s.id !== 'bills') return false;
    var owned = false;
    APPS.forEach(function(a){ if (a.covers.indexOf(s.id) >= 0) owned = true; });
    return !owned;
  }).map(function(s){ return s.title; });

  var c2 = card('Everything else — the module workbook',
    'These modules have no app of their own yet, so they are filled in the workbook you take to site, ' +
    'or typed straight into their section here. One sheet per module, a Read me tab explaining every ' +
    'column, and only the sheets you filled are read back.');
  c2.appendChild(el('p','font-size:12px;color:var(--ink-3);margin:0 0 10px',
    noApp.join(' · ')));
  var bar2 = el('div','display:flex;gap:8px;flex-wrap:wrap;');
  bar2.appendChild(btn('Download blank template (XLSX)', function(){
    offerWorkbook('PostMan-module-template.xlsx', buildModuleWorkbook(false));
  }));
  bar2.appendChild(btn('Export this report as a workbook', function(){
    offerWorkbook(reportFilename(S.meta.financialYear, S.meta.serial, S.company.name, S.meta.reportDate) + '.xlsx',
      buildModuleWorkbook(true));
  }));
  c2.appendChild(bar2);
  w.appendChild(c2);

  w.appendChild(status);
};
