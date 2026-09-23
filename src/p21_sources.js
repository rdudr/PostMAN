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
   PostMan opens the app WITH THE PLANT ALREADY NAMED, inside its own
   window, and the app posts the workbook straight back.

   Embedded rather than a pop-up, because a pop-up is three things the
   engineer has to manage - a blocker to allow, a window to find again, a
   window to close - for no gain. In a panel the app is simply the next
   screen.

   A pop-up is still the fallback and always will be. Some sites refuse to
   be framed, and an app that has not been updated can only post to an
   opener. Every card offers both.

   Either way, a message is read ONLY from an origin that is one of the app
   URLs configured here. Anything that can post into this window could
   otherwise put anything it likes into a report somebody signs. */
var HANDOFF = { win:null, frame:null, app:null, status:null, alive:false };

function handoffQuery(){
  return [
    'from=postman',
    'origin=' + encodeURIComponent(location.origin),
    'company=' + encodeURIComponent(S.company.name || ''),
    'fy=' + encodeURIComponent(S.meta.financialYear || '')
  ].join('&');
}
function appLaunchUrl(a){
  var base = appUrl(a);
  if (!base) return null;
  return base + (base.indexOf('?') >= 0 ? '&' : '?') + handoffQuery();
}

/* A file:// page has origin "null": the app cannot post back to it, and a
   framed cross-origin page cannot reach it either. There the only route is
   export-and-drop, and saying so early is kinder than a panel that never
   finishes. */
function canReceiveHandoff(){
  return location.protocol === 'http:' || location.protocol === 'https:';
}

function closeHandoff(){
  HANDOFF.alive = false;
  if (HANDOFF.frame && HANDOFF.frame.parentNode) HANDOFF.frame.parentNode.removeChild(HANDOFF.frame);
  if (HANDOFF.win && !HANDOFF.win.closed){ try { HANDOFF.win.close(); } catch (e) {} }
  HANDOFF.frame = null; HANDOFF.win = null; HANDOFF.app = null;
  var host = document.getElementById('apppanel');
  if (host) host.style.display = 'none';
}

/* The pop-up, kept as the escape hatch from the panel and used directly
   when the browser will not frame the app. */
function popApp(a, statusFn){
  var url = appLaunchUrl(a);
  if (!url){ alert('No web address set for ' + a.name + ' yet.'); return false; }
  var win = window.open(url, 'kisem-' + a.id);
  if (!win){
    alert('The browser blocked the pop-up.\n\nAllow pop-ups for this page, or open\n' +
          appUrl(a) + '\nyourself and drop the exported file here.');
    return false;
  }
  HANDOFF.win = win; HANDOFF.app = a; HANDOFF.status = statusFn || null;
  if (statusFn) statusFn('Waiting for ' + a.name + ' to send its data back.');
  return true;
}

function openApp(a, statusFn){
  var url = appLaunchUrl(a);
  if (!url){ alert('No web address set for ' + a.name + ' yet.'); return; }
  if (!canReceiveHandoff()){
    window.open(url, 'kisem-' + a.id);
    if (statusFn) statusFn('Opened ' + a.name + '. This copy of PostMan is a local file, so the app ' +
      'cannot hand data back - export from the app and drop the workbook here.');
    return;
  }

  closeHandoff();
  HANDOFF.app = a; HANDOFF.status = statusFn || null;

  var host = document.getElementById('apppanel');
  var body = document.getElementById('apppanelbody');
  document.getElementById('apppaneltitle').textContent = a.name + ' - ' + a.what;
  var note = document.getElementById('apppanelnote');
  note.textContent = 'Loading ' + a.name + '...';
  note.className = 'panelnote';
  host.style.display = 'flex';

  var f = el('iframe');
  f.src = url;
  f.title = a.name;
  f.setAttribute('allow', 'camera; geolocation');

  /* `load` is NOT proof the app is running. A frame the browser refused
     over X-Frame-Options fires `load` too, on its own error page, and
     nothing cross-origin can be read to tell the two apart. Claiming
     success here would put a green tick over a blank rectangle, so the
     note says what is actually known and points at the way out. */
  f.addEventListener('load', function(){
    if (HANDOFF.alive) return;
    note.textContent = a.name + ' should be showing below. Fill it in, then press Send to '
      + 'PostMan there. If the panel is blank, the site refuses to be embedded - use '
      + '"Open in a new window".';
    note.className = 'panelnote';
  });
  body.appendChild(f);
  HANDOFF.frame = f;
  HANDOFF.alive = false;

  if (statusFn) statusFn('');
}

function handoffOrigins(){
  var out = {};
  APPS.forEach(function(a){ var o = appOrigin(a); if (o) out[o] = a; });
  return out;
}

/* ---- what arrived, before it is taken in ---------------------------
   An import used to happen the instant a message landed, announced by an
   alert that was already too late to refuse. The workbook is now held,
   read for what it contains, and shown: which plant, which app, how many
   rows of what. Nothing enters the report until somebody presses the
   button - which is the same standard the bill reader already holds, and
   the reason a signed report can be defended. */
var INBOX = null;

function summarise(wb){
  var det = detectWorkbook(wb), rows = [];
  det.found.forEach(function(f){
    var n = null;
    try {
      var sh = wb.Sheets[f.sheet];
      if (sh){
        var aoa = XLSX.utils.sheet_to_json(sh, { header:1, blankrows:false });
        n = Math.max(0, aoa.length - 1);        /* minus the header row */
      }
    } catch (e) {}
    rows.push({ label:f.label, sheet:f.sheet, n:n });
  });
  return rows;
}

function showInbox(app, wb){
  var theirs = '';
  try { theirs = workbookCompany(wb) || ''; } catch (e) {}
  var ours = S.company.name || '';
  INBOX = {
    app: app, wb: wb, at: new Date(),
    company: theirs,
    mismatch: !!(theirs && ours && !sameCompany(theirs, ours)),
    rows: summarise(wb)
  };
  S.active = 'sources';
  save(); renderAll();
}

function acceptInbox(){
  if (!INBOX) return;
  var app = INBOX.app, wb = INBOX.wb;
  try {
    var log = importAny(wb);
    INBOX = null;
    save(); renderAll();
    alert(app.name + ' data taken in:\n\n- ' + log.join('\n- '));
  } catch (err){
    INBOX = null;
    renderAll();
    alert(err.message);
  }
}
function discardInbox(){ INBOX = null; renderAll(); }

function onHandoffMessage(ev){
  var allowed = handoffOrigins();
  var app = allowed[ev.origin];
  if (!app) return;                       /* not one of ours - ignore silently */
  var d = ev.data;
  if (!d) return;

  /* A greeting from a framed app: proof it rendered, which nothing on this
     side can otherwise establish. Optional - an app that never sends one
     still works, it just keeps the hedged wording. */
  if (d.kind === 'kisem-hello'){
    if (HANDOFF.frame && HANDOFF.app === app){
      HANDOFF.alive = true;
      var n = document.getElementById('apppanelnote');
      if (n){
        n.textContent = app.name + ' is open. Fill it in, then press Send to PostMan there.';
        n.className = 'panelnote good';
      }
    }
    return;
  }
  if (d.kind !== 'kisem-data' || !d.workbook) return;

  try {
    var bin = atob(String(d.workbook)), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    var wb = XLSX.read(arr, { type:'array' });
    closeHandoff();
    showInbox(app, wb);                   /* held, not imported */
  } catch (err){
    closeHandoff();
    alert('Could not read what ' + app.name + ' sent.\n\n' + err.message +
          '\n\nExport the workbook from the app and drop it here instead.');
  }
}
window.addEventListener('message', onHandoffMessage);

/* The panel's own controls. Bound once, not per render, so a repaint of the
   Data sources screen never leaves a second listener behind. */
function bindAppPanel(){
  var close = document.getElementById('apppanelclose');
  var pop = document.getElementById('apppanelpop');
  if (!close || close.dataset.bound) return;
  close.dataset.bound = '1';
  close.addEventListener('click', closeHandoff);
  pop.addEventListener('click', function(){
    var a = HANDOFF.app;
    closeHandoff();
    if (a) popApp(a, null);
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindAppPanel);
else bindAppPanel();

/* ---- the screen ----------------------------------------------------- */
FORMS.sources = function(w){
  if (INBOX) w.appendChild(inboxCard());
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
    /* The window is not a lesser option, it is the one that works
       everywhere - a site may refuse to be framed, and an app that has not
       been updated for the panel can only post back to an opener. */
    bar.appendChild(btn('Open in a new window', function(){
      popApp(a, function(t){ status.textContent = t; });
    }));

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

/* What an app just sent, laid out so it can be refused. */
function inboxCard(){
  var box = el('div'); box.id = 'inbox';
  box.appendChild(el('h4','', INBOX.app.name + ' sent a workbook'));

  var when = INBOX.at.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
  box.appendChild(el('p','', 'Received ' + when +
    (INBOX.company ? ' \u00b7 ' + INBOX.company : ' \u00b7 no plant name in the file'))).className = 'meta';

  if (INBOX.rows.length){
    var ul = el('ul');
    INBOX.rows.forEach(function(r){
      ul.appendChild(el('li','', (r.n === null ? '' : r.n + ' \u00d7 ') + r.label +
        (r.sheet ? ' (sheet "' + r.sheet + '")' : '')));
    });
    box.appendChild(ul);
  } else {
    box.appendChild(el('p','', 'Nothing in it was recognised. Taking it in will do nothing.'))
      .className = 'meta';
  }

  /* The company guard fires on import too. Showing it here as well means
     the answer is known before the button is pressed, not after. */
  if (INBOX.mismatch){
    var warn = el('p','', 'This workbook names a different plant from the report (' +
      (S.company.name || 'unnamed') + '). Taking it in would mix two plants\u2019 measurements.');
    warn.className = 'callout bad';
    box.appendChild(warn);
  }

  var row = el('div'); row.className = 'row';
  row.appendChild(btn('Take it in', acceptInbox, INBOX.mismatch ? '' : 'primary'));
  row.appendChild(btn('Discard', discardInbox));
  box.appendChild(row);
  return box;
}
