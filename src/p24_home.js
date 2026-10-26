/* ===================================================================
   THE DOOR, AND WHAT IS BEHIND IT

   Opening the tool used to drop you straight onto the cover of whatever
   draft the browser happened to hold. With a server there is a better
   first question: who are you, and which report do you want? So the app
   opens on a sign-in page, and once you are in, on a home page that shows
   the report you were last working on, the rest of the team's reports, and
   the two ways to start something new.

   Signing in is NOT compulsory. "Work offline" is one click and everything
   behaves as it always did - a laptop in a plant basement with no signal
   has to keep working, and a tool that refuses to open without a server is
   a tool somebody will stop carrying.
   =================================================================== */

function gateNeeded(){
  var c = cloudState();
  /* Asked once per browser: somebody who chose to work offline is not
     asked again until they sign out or clear the draft. */
  return !signedIn() && !c.offlineChosen;
}
function gateDismiss(){
  var c = cloudState();
  c.offlineChosen = true; save();
  document.body.classList.remove('gated');
  renderAll();
}
function gateShow(){
  document.body.classList.add('gated');
  var host = q('gate');
  clear(host);
  var box = el('div','max-width:440px;margin:0 auto;');
  box.appendChild(el('div','font-size:30px;font-weight:700;letter-spacing:-.02em;margin-bottom:2px;', 'PostMan'));
  box.appendChild(el('div','font-size:13.5px;color:var(--ink-2);margin-bottom:22px;',
    'KISEM Detailed Energy Assessment reports — IEA, IIT Gandhinagar'));

  var card1 = el('div','border:1px solid var(--line);border-radius:12px;padding:18px 20px;background:var(--panel);');
  card1.appendChild(el('div','font-weight:600;margin-bottom:3px;', 'Sign in'));
  card1.appendChild(el('div','font-size:12.5px;color:var(--ink-3);margin-bottom:14px;',
    'Your reports, the team’s reports and every file the field apps have sent.'));

  var em = el('input'); em.type = 'email'; em.placeholder = 'you@iitgn.ac.in'; em.autocomplete = 'username';
  var pw = el('input'); pw.type = 'password'; pw.placeholder = 'Password'; pw.autocomplete = 'current-password';
  card1.appendChild(labelled('Email', em));
  card1.appendChild(labelled('Password', pw));
  var msg = el('p','margin-top:10px;'); msg.className = 'callout'; msg.hidden = true;
  var go = btn('Sign in', function(){
    if (!em.value.trim() || !pw.value){ msg.hidden = false; msg.className = 'callout bad'; msg.textContent = 'Email and password, please.'; return; }
    msg.hidden = false; msg.className = 'callout'; msg.textContent = 'Signing in…';
    go.disabled = true;
    cloudLogin(em.value.trim(), pw.value).then(function(){
      document.body.classList.remove('gated');
      S.active = 'home'; save(); renderAll();
    }).catch(function(e){
      go.disabled = false;
      msg.className = 'callout bad'; msg.textContent = e.message;
    });
  }, 'primary');
  pw.addEventListener('keydown', function(e){ if (e.key === 'Enter') go.click(); });
  em.addEventListener('keydown', function(e){ if (e.key === 'Enter') pw.focus(); });
  var row = el('div','display:flex;gap:8px;align-items:center;margin-top:14px;flex-wrap:wrap;');
  row.appendChild(go);
  row.appendChild(btn('Work offline', gateDismiss));
  card1.appendChild(row);
  card1.appendChild(msg);
  box.appendChild(card1);

  var srv = el('details','margin-top:12px;font-size:12.5px;color:var(--ink-3);');
  srv.appendChild(el('summary','cursor:pointer;', 'Server address'));
  var url = el('input'); url.type = 'text'; url.value = cloudState().server; url.style.marginTop = '6px';
  url.addEventListener('input', function(){ cloudState().server = url.value.trim(); save(); });
  srv.appendChild(url);
  srv.appendChild(el('p','margin-top:6px;',
    'The KISEM server at IIT Gandhinagar. Change it only to work against another one.'));
  box.appendChild(srv);

  box.appendChild(el('p','margin-top:18px;font-size:12px;color:var(--ink-3);',
    'One account for the team, made when the server was set up. Working offline keeps everything in this browser — you can sign in later and push the report up.'));
  host.appendChild(box);
  setTimeout(function(){ em.focus(); }, 60);
}

/* ------------------------------------------------------------------
   HOME - where you land after signing in
   ------------------------------------------------------------------ */
function homeOpenLast(){
  var c = cloudState();
  if (c.reportId) return cloudOpen(c.reportId);
  return cloudReports(false).then(function(rows){
    if (!rows.length) throw new Error('No reports on the server yet.');
    return cloudOpen(rows[0].id);
  });
}

FORMS.home = function(w){
  var c = cloudState();

  /* --- the draft in this browser --- */
  var co = (S.company && S.company.name) || '';
  var head = card(co ? co : 'A new report',
    c.reportId ? 'Open on the server as version ' + c.version + (c.lastSaved ? ', saved ' + c.lastSaved : '') + '.'
               : 'This draft is in this browser only — nothing on the server yet.');
  var k = el('div'); k.className = 'kpis';
  var bills = (S.bills || []).filter(function(b){ return num(b.kwh) !== null; }).length;
  var recos = (S.ledger || []).length;
  [['Report', reportNumber(S.meta.financialYear, S.meta.serial)],
   ['Financial year', S.meta.financialYear || '—'],
   ['Bills entered', String(bills)],
   ['Recommendations', String(recos)]].forEach(function(p){
    var x = el('div'); x.className = 'kpi';
    x.appendChild(el('span','', p[0])).className = 'k';
    x.appendChild(el('span','', p[1])).className = 'v';
    k.appendChild(x);
  });
  head.appendChild(k);
  var bar = el('div','display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;');
  bar.appendChild(btn('Carry on with this report', function(){ S.active = 'cover'; save(); renderAll(); }, 'primary'));
  if (signedIn()) bar.appendChild(btn(c.reportId ? 'Save now' : 'Put it on the server', function(){
    cloudSave('manual save').then(function(){ renderAll(); }).catch(function(e){ alert(e.message); });
  }));
  bar.appendChild(btn('Start a new report', function(){
    if (!confirm('Start a new, empty report?\n\nThis draft is replaced in this browser' +
                 (c.reportId ? ' — the copy on the server stays.' : ' and is not on the server.'))) return;
    var sess = cloudSession();
    S = blankState(); cloudNewReport(sess);
    S.active = 'cover'; saveNow(); renderAll();
  }));
  bar.appendChild(btn('Load the sample report', function(){
    if (!confirm('Load the worked example?\n\nIt replaces this draft with a complete report — bills, baseline, utilities and recommendations — to look at and take apart.')) return;
    var b = document.getElementById('demo'); if (b) b.click();
  }));
  head.appendChild(bar);
  w.appendChild(head);

  if (!signedIn()){
    var off = card('Working offline',
      'Everything is kept in this browser, as it always was. Sign in to put this report on the server, where the team can open it and every save is kept.');
    off.appendChild(btn('Sign in', function(){ cloudState().offlineChosen = false; save(); gateShow(); }, 'primary'));
    w.appendChild(off);
    homeGuides(w);
    return;
  }

  /* --- the team's reports --- */
  var rc = card('Reports on the server', 'Newest first. Opening one replaces the draft in this browser.');
  /* Coming back to a half-finished assessment is the common case, so it is
     one button rather than a hunt down the list. */
  if (!c.reportId) rc.appendChild(btn('Open the last one saved', function(){
    homeOpenLast().catch(function(e){ alert(e.message); });
  }, 'primary'));
  var list = el('div','margin-top:4px;');
  rc.appendChild(list);
  w.appendChild(rc);
  list.appendChild(el('p','', 'Asking the server…'));
  cloudReports(false).then(function(rows){
    clear(list);
    if (!rows.length){ list.appendChild(el('p','', 'Nothing saved yet. Put this report up and it will be here.')); return; }
    rows.slice(0, 12).forEach(function(r){
      var row = el('div','display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:7px 0;border-bottom:1px solid var(--line-2);');
      var m = el('div','flex:1 1 240px;min-width:0;');
      m.appendChild(el('strong','display:block;font-size:13px;', r.company_name || r.title || 'Untitled'));
      m.appendChild(el('span','font-size:11.5px;color:var(--ink-3);',
        [r.report_no, r.financial_year, 'v' + r.version, r.updated_at, r.updated_by].filter(Boolean).join(' · ')));
      row.appendChild(m);
      if (r.id === c.reportId) row.appendChild(el('span','font-size:11px;color:var(--ok);', 'open here'));
      else row.appendChild(btn('Open', function(){
        if (c.dirty && !confirm('Open ' + (r.company_name || 'that report') + '?\n\nThis draft has changes that are not on the server; they are replaced.')) return;
        cloudOpen(r.id).catch(function(e){ alert(e.message); });
      }, 'sm'));
      list.appendChild(row);
    });
    if (rows.length > 12) list.appendChild(el('p','margin-top:6px;font-size:12px;color:var(--ink-3);',
      rows.length - 12 + ' more on the Server & my reports screen.'));
  }).catch(function(e){ clear(list); list.appendChild(el('p','', e.message)).className = 'callout bad'; });

  /* --- who has been in --- */
  var ac = card('Recent activity', 'Who opened or saved what, and the files the field apps sent.');
  var alist = el('div','margin-top:4px;');
  ac.appendChild(alist);
  w.appendChild(ac);
  alist.appendChild(el('p','', 'Asking the server…'));
  cloudFetch('/api/activity?limit=14').then(function(rows){
    clear(alist);
    if (!rows.length){ alist.appendChild(el('p','', 'Nothing yet.')); return; }
    var words = { open:'opened', save:'saved', create:'started', upload:'sent', archive:'archived',
                  'company-add':'added the company', 'company-update':'updated the company' };
    rows.forEach(function(a){
      var line = el('div','display:flex;gap:8px;padding:3px 0;font-size:12.5px;border-bottom:1px solid var(--line-2);');
      line.appendChild(el('span','color:var(--ink-3);font-family:\'IBM Plex Mono\',monospace;flex:0 0 118px;', a.at));
      line.appendChild(el('span','flex:1 1 auto;', (a.who || 'somebody') + ' ' + (words[a.action] || a.action) +
        (a.subject ? ' — ' + a.subject : '') + (a.detail ? ' (' + a.detail + ')' : '')));
      alist.appendChild(line);
    });
  }).catch(function(e){ clear(alist); alist.appendChild(el('p','', e.message)).className = 'callout bad'; });

  homeGuides(w);
};

/* The short version of how the tool is meant to be used, where somebody
   opening it for the first time will actually see it. */
function homeGuides(w){
  var g = card('How a report gets made', 'Each step is a screen on the left; you can do them in any order.');
  var steps = [
    ['Cover & report', 'The company, the financial year, the logo and the gate photograph.'],
    ['Bill capture & verify', 'Drop the electricity bill PDFs in. The figures are read out and shown beside the bill — check them and press Verify.'],
    ['Import field data', 'One drop box for every workbook: FOX KISEM, Thermo-X, JET-Eff, A-CMP and the PQ analyser’s exports. Nothing is retyped.'],
    ['Energy baseline & GHG', 'Months chosen from menus, production in the plant’s own unit, and the emission factors; TOE, SEC and the charts follow.'],
    ['The utilities', 'Switch on only what the plant has. Each chapter prints what its app measured.'],
    ['Recommendations', 'On every chapter screen: the observation, the recommendation, the saving worked in the open, and the payback.'],
    ['Print / PDF', 'True A4, one page per page. The Contents links to the pages and every chapter opens a new one.']
  ];
  steps.forEach(function(s, i){
    var row = el('div','display:flex;gap:10px;padding:5px 0;border-bottom:1px solid var(--line-2);');
    row.appendChild(el('span','flex:0 0 22px;color:var(--ink-3);font-family:\'IBM Plex Mono\',monospace;', String(i + 1)));
    var t = el('div','flex:1 1 auto;');
    t.appendChild(el('strong','display:block;font-size:12.5px;', s[0]));
    t.appendChild(el('span','font-size:12px;color:var(--ink-2);', s[1]));
    row.appendChild(t);
    g.appendChild(row);
  });
  g.appendChild(el('p','margin-top:10px;font-size:12px;color:var(--ink-3);',
    'The sample report above is a finished one to look at: every chapter filled in, with the figures that produced it.'));
  w.appendChild(g);
}
