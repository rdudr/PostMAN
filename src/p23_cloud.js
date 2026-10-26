/* ===================================================================
   THE SERVER - where the work is kept.

   Until now a report lived in one browser on one machine. That is fine for
   an evening's work and wrong for an assessment: nobody else can open it,
   a cleared cache takes it, and the version an engineer e-mails is the only
   one anybody has. This connects the editor to the EASS server so a report
   is saved, listed, versioned and reopened anywhere, by anyone on the team.

   The server is the team's own machine at IITGN, published through the
   Cloudflare tunnel that already runs on it. The tunnel dials OUT, so the
   campus firewall needs no hole and the machine needs no public address -
   which is why this works where a plain server would not.

   The rule that makes it safe to use on site: THE BROWSER IS STILL THE
   SOURCE OF TRUTH WHILE YOU ARE WORKING. Every keystroke saves to local
   storage exactly as before; the server is a copy that is pushed when there
   is a connection and a signed-in person. Pull the network cable in a plant
   basement and nothing stops - the cloud strip says "not saved since 14:02"
   and keeps trying.

   Conflicts are not resolved silently. The editor saves the version it
   opened; if somebody else has saved since, the server refuses and says so,
   and the engineer chooses: reload theirs, or keep mine as a copy.
   =================================================================== */

var EASS_DEFAULT = 'https://eass.eassiitgn.page';

function blankCloud(){
  return { server:EASS_DEFAULT, token:'', user:null, reportId:'', version:0,
           lastSaved:'', lastError:'', dirty:false, autosave:true, offlineChosen:false };
}
function cloudState(){
  if (!S.cloud) S.cloud = blankCloud();
  if (!S.cloud.server) S.cloud.server = EASS_DEFAULT;
  return S.cloud;
}
function cloudUrl(path){ return String(cloudState().server || EASS_DEFAULT).replace(/\/+$/, '') + path; }
function signedIn(){ var c = cloudState(); return !!(c.token && c.user); }

/* One door to the API: the token goes on every call, an expired session is
   reported in words rather than as a 401 in the console, and a server that
   is simply not there says so without blaming the engineer. */
function cloudFetch(path, opts){
  opts = opts || {};
  var c = cloudState();
  var headers = { 'Content-Type':'application/json' };
  if (c.token) headers.Authorization = 'Bearer ' + c.token;
  return fetch(cloudUrl(path), {
    method: opts.method || 'GET',
    headers: headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  }).then(function(r){
    if (r.status === 401){
      c.token = ''; c.user = null; save();
      return r.json().catch(function(){ return {}; }).then(function(j){
        throw new Error(j.detail || 'Your session has ended — sign in again.');
      });
    }
    if (!r.ok) return r.json().catch(function(){ return {}; }).then(function(j){
      var e = new Error(j.detail || (r.status + ' ' + r.statusText)); e.status = r.status; throw e;
    });
    return r.status === 204 ? null : r.json();
  }, function(){
    throw new Error('Cannot reach the server at ' + cloudState().server + '. Your work is safe in this browser; it will go up when the connection is back.');
  });
}

function cloudLogin(email, password){
  return cloudFetch('/api/auth/login', { method:'POST', body:{ email:email, password:password } })
    .then(function(r){
      var c = cloudState();
      c.token = r.token; c.user = r.user; c.lastError = '';
      save(); return r.user;
    });
}
function cloudLogout(){
  var c = cloudState();
  c.token = ''; c.user = null; c.reportId = ''; c.version = 0; c.lastSaved = '';
  c.offlineChosen = false;     /* the door asks again next time */
  save();
  if (typeof gateShow === 'function') gateShow(); else renderAll();
}

/* What the list shows about a report without opening it. */
function cloudCard(){
  var co = (S.company && S.company.name) || '';
  return {
    title: (TYPES[S.meta.reportType] || 'Energy Assessment') + (co ? ' — ' + co : ''),
    company_name: co,
    financial_year: S.meta.financialYear || '',
    serial: num(S.meta.serial) || 1,
    report_no: reportNumber(S.meta.financialYear, S.meta.serial) + ' ' + (S.meta.revision || '')
  };
}
/* The draft as it stands, minus the cloud block itself - a report should
   not carry somebody's session token into the database - and minus which
   screen is open, which belongs to the person reading, not to the report. */
var CLOUD_SKIP = { cloud:1, active:1 };
function cloudPayload(){
  var out = {};
  Object.keys(S).forEach(function(k){ if (!CLOUD_SKIP[k]) out[k] = S[k]; });
  return out;
}

/* What the server already holds, as one string. Moving between screens is
   a change to the draft but not to the report, and a version per click
   would make the history unreadable. */
var CLOUD_SIG = '';
function cloudSig(){ try { return JSON.stringify(cloudPayload()); } catch (e){ return ''; } }

/* Starting a fresh report should not sign anybody out: the session belongs
   to the person, the report id belongs to the report. Take the session
   before S is replaced, hand it back afterwards. */
function cloudSession(){
  var c = cloudState();
  return { server:c.server, token:c.token, user:c.user, autosave:c.autosave, offlineChosen:c.offlineChosen };
}
function cloudNewReport(sess){
  sess = sess || {};
  S.cloud = { server:sess.server || EASS_DEFAULT, token:sess.token || '', user:sess.user || null,
              autosave:sess.autosave !== false, offlineChosen:!!sess.offlineChosen,
              reportId:'', version:0, lastSaved:'', lastError:'', dirty:false };
  CLOUD_SIG = '';
}

function cloudSave(note){
  var c = cloudState();
  if (!signedIn()) return Promise.reject(new Error('Sign in first.'));
  var body = cloudCard();
  body.state = cloudPayload();
  body.note = note || '';
  var p;
  if (c.reportId){
    body.version = c.version;
    p = cloudFetch('/api/reports/' + encodeURIComponent(c.reportId), { method:'PUT', body:body });
  } else {
    p = cloudFetch('/api/reports', { method:'POST', body:body });
  }
  return p.then(function(r){
    CLOUD_SIG = JSON.stringify(body.state);
    c.reportId = r.id; c.version = r.version; c.dirty = false; c.lastError = '';
    c.lastSaved = new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
    save(); paintCloudStrip();
    return r;
  }).catch(function(e){
    c.lastError = e.message; save(); paintCloudStrip();
    throw e;
  });
}
/* Keeping mine when somebody else has saved: a new report, not an argument. */
function cloudSaveAsCopy(){
  var c = cloudState();
  c.reportId = ''; c.version = 0;
  return cloudSave('copy kept after a clash');
}
function cloudOpen(id){
  return cloudFetch('/api/reports/' + encodeURIComponent(id)).then(function(r){
    var keep = cloudState();
    var cloud = { server:keep.server, token:keep.token, user:keep.user, autosave:keep.autosave,
                  offlineChosen:keep.offlineChosen, reportId:r.id, version:r.version,
                  lastSaved:'opened', lastError:'', dirty:false };
    S = deepMerge(blankState(), r.state || {});
    S.cloud = cloud;
    CLOUD_SIG = cloudSig();      /* just arrived from the server - nothing to push */
    if (typeof migrateState === 'function') migrateState();
    saveNow(); renderAll();
    return r;
  });
}
function cloudReports(archived){
  return cloudFetch('/api/reports' + (archived ? '?archived=true' : ''));
}

/* ------------------------------------------------------------------
   AUTOSAVE - debounced, and only ever from a screen the engineer is
   already working in. Nothing is pushed while a sign-in is missing or a
   save is already in flight.
   ------------------------------------------------------------------ */
var CLOUD_T = null, CLOUD_BUSY = false;
function cloudTouch(){
  var c = cloudState();
  if (!signedIn() || !c.autosave) return;
  c.dirty = true;
  paintCloudStrip();
  clearTimeout(CLOUD_T);
  CLOUD_T = setTimeout(function(){
    if (CLOUD_BUSY) { cloudTouch(); return; }
    if (c.reportId && cloudSig() === CLOUD_SIG){
      c.dirty = false; paintCloudStrip(); return;   /* nothing actually changed */
    }
    CLOUD_BUSY = true;
    cloudSave('autosave').catch(function(){ /* the strip already says so */ })
      .then(function(){ CLOUD_BUSY = false; });
  }, 4000);
}

/* The one line at the top of the editor that says where the work is. */
function paintCloudStrip(){
  var host = q('cloudstrip'); if (!host) return;
  clear(host);
  var c = cloudState();
  if (!signedIn()){
    host.appendChild(el('span','', 'Working in this browser only'));
    var inb = btn('Connect to the server', function(){ S.active = 'cloud'; save(); renderAll(); }, 'sm');
    host.appendChild(inb);
    return;
  }
  var where = c.reportId ? (c.lastError ? 'not saved — ' + c.lastError
                            : c.dirty ? 'saving…'
                            : 'saved ' + (c.lastSaved || '') + ' · v' + c.version)
                         : 'not on the server yet';
  host.appendChild(el('span','', (c.user.name || c.user.email) + ' · ' + where));
  if (c.lastError) host.firstChild.style.color = 'var(--bad)';
  host.appendChild(btn(c.reportId ? 'Save now' : 'Save to the server', function(){
    cloudSave('manual save').then(function(){ paintCloudStrip(); })
      .catch(function(e){ alert(e.message); });
  }, 'sm primary'));
  host.appendChild(btn('My reports', function(){ S.active = 'cloud'; save(); renderAll(); }, 'sm'));
}

/* ------------------------------------------------------------------
   THE SCREEN
   ------------------------------------------------------------------ */
FORMS.cloud = function(w){
  var c = cloudState();

  var c1 = card('The KISEM server',
    'Reports live here instead of in one browser: anyone on the team can open one, every save keeps the one before it, and the field apps send their files to the same place. Your work is still kept in this browser as you type — the server is the copy that outlives the laptop.');
  var urlRow = el('div','display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;');
  var url = el('input'); url.type = 'text'; url.value = c.server; url.placeholder = EASS_DEFAULT;
  url.addEventListener('input', function(){ c.server = url.value.trim(); save(); });
  var f = labelled('Server address', url, 'The KISEM server at IIT Gandhinagar, reached through its Cloudflare tunnel. Change it only to test against another one.');
  f.style.flex = '1 1 280px'; urlRow.appendChild(f);
  c1.appendChild(urlRow);

  if (!signedIn()){
    var form = el('div','display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:10px;');
    var em = el('input'); em.type = 'email'; em.placeholder = 'you@iitgn.ac.in'; em.autocomplete = 'username';
    var pw = el('input'); pw.type = 'password'; pw.placeholder = 'password'; pw.autocomplete = 'current-password';
    form.appendChild(labelled('Email', em));
    form.appendChild(labelled('Password', pw));
    c1.appendChild(form);
    var msg = el('p',''); msg.className = 'callout'; msg.hidden = true;
    var go = function(){
      msg.hidden = false; msg.className = 'callout'; msg.textContent = 'Signing in…';
      cloudLogin(em.value.trim(), pw.value).then(function(){ renderAll(); })
        .catch(function(e){ msg.className = 'callout bad'; msg.textContent = e.message; });
    };
    pw.addEventListener('keydown', function(e){ if (e.key === 'Enter') go(); });
    c1.appendChild(btn('Sign in', go, 'primary'));
    c1.appendChild(msg);
    c1.appendChild(el('p','margin-top:8px;font-size:12px;color:var(--ink-3);',
      'No account? An administrator makes one for you — accounts are not self-service, because a report carries a client’s measurements.'));
    w.appendChild(c1);
    return;
  }

  c1.appendChild(el('p','margin-top:8px;', 'Signed in as ' + (c.user.name || c.user.email) + ' (' + c.user.role + ').')).className = 'callout good';
  var bar = el('div','display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;');
  bar.appendChild(fCheck(c, 'autosave', 'Save to the server as I work'));
  bar.appendChild(btn('Sign out', cloudLogout, 'sm'));
  c1.appendChild(bar);
  w.appendChild(c1);

  /* --- this report --- */
  var c2 = card('This report', c.reportId
    ? 'It is on the server. Every save keeps the one before it, so a figure changed by mistake is recoverable.'
    : 'This draft is only in this browser. Put it on the server and the team can open it.');
  var k = el('div'); k.className = 'kpis';
  [['Report', cloudCard().report_no || '—'], ['Company', cloudCard().company_name || '—'],
   ['Version', c.reportId ? String(c.version) : 'not saved'], ['Last save', c.lastSaved || '—']].forEach(function(p){
    var x = el('div'); x.className = 'kpi';
    x.appendChild(el('span','', p[0])).className = 'k';
    x.appendChild(el('span','', p[1])).className = 'v';
    k.appendChild(x);
  });
  c2.appendChild(k);
  if (c.lastError) c2.appendChild(el('p','', c.lastError)).className = 'callout bad';
  var bar2 = el('div','display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;');
  bar2.appendChild(btn(c.reportId ? 'Save now' : 'Save to the server', function(){
    cloudSave('manual save').then(function(){ renderAll(); }).catch(function(e){
      /* A clash is the one error worth stopping for: two people, one report. */
      if (/moved on/.test(e.message) && confirm(e.message + '\n\nKeep yours as a separate report?')){
        cloudSaveAsCopy().then(function(){ renderAll(); }).catch(function(e2){ alert(e2.message); });
      } else alert(e.message);
    });
  }, 'primary'));
  if (c.reportId){
    bar2.appendChild(btn('Reload the server’s copy', function(){
      if (!confirm('Replace this draft with the copy on the server?\n\nAnything you have changed since the last save is lost.')) return;
      cloudOpen(c.reportId).catch(function(e){ alert(e.message); });
    }));
    bar2.appendChild(btn('Save as a new report', function(){
      cloudSaveAsCopy().then(function(){ renderAll(); }).catch(function(e){ alert(e.message); });
    }));
    bar2.appendChild(btn('Detach from the server', function(){
      c.reportId = ''; c.version = 0; c.lastSaved = ''; save(); renderAll();
    }));
  }
  c2.appendChild(bar2);
  w.appendChild(c2);

  /* --- the versions behind this report --- */
  if (c.reportId){
    var cv = card('Earlier saves', 'Every save of this report, newest first. Open one to look at it — it becomes your draft, and the one on the server is untouched until you save again.');
    var vlist = el('div','margin-top:6px;');
    cv.appendChild(vlist);
    cv.appendChild(btn('Show the saves', function(){
      clear(vlist); vlist.appendChild(el('p','', 'Asking the server…'));
      cloudFetch('/api/reports/' + encodeURIComponent(c.reportId) + '/versions').then(function(vs){
        clear(vlist);
        if (!vs.length){ vlist.appendChild(el('p','', 'No saves yet.')); return; }
        vs.forEach(function(v){
          var row = el('div','display:flex;gap:10px;align-items:center;padding:4px 0;border-bottom:1px solid var(--line-2);');
          row.appendChild(el('span','font-family:\'IBM Plex Mono\',monospace;min-width:48px;', 'v' + v.version));
          row.appendChild(el('span','flex:1 1 auto;font-size:12.5px;', (v.note || '—') + ' · ' + v.saved_at + (v.saved_by ? ' · ' + v.saved_by : '')));
          row.appendChild(btn('Open', function(){
            if (!confirm('Open version ' + v.version + ' as your draft?\n\nYour current draft is replaced; the server keeps every version either way.')) return;
            cloudFetch('/api/reports/' + encodeURIComponent(c.reportId) + '/versions/' + v.version).then(function(r){
              var keep = cloudState();
              var cloud = { server:keep.server, token:keep.token, user:keep.user, autosave:false,
                            reportId:keep.reportId, version:keep.version, lastSaved:'', lastError:'', dirty:true };
              S = deepMerge(blankState(), r.state || {});
              S.cloud = cloud;
              saveNow(); renderAll();
              alert('Version ' + v.version + ' is now your draft, and saving to the server is paused so it cannot overwrite the newer one by accident. Turn it back on when you mean to.');
            }).catch(function(e){ alert(e.message); });
          }, 'sm'));
          vlist.appendChild(row);
        });
      }).catch(function(e){ clear(vlist); vlist.appendChild(el('p','', e.message)).className = 'callout bad'; });
    }));
    w.appendChild(cv);
  }

  /* --- everything on the server --- */
  var c3 = card('Reports on the server', 'Every report the team has saved. Opening one replaces the draft in this browser.');
  var list = el('div','margin-top:6px;');
  var load = function(archived){
    clear(list); list.appendChild(el('p','', 'Asking the server…'));
    cloudReports(archived).then(function(rows){
      clear(list);
      if (!rows.length){ list.appendChild(el('p','', archived ? 'Nothing archived.' : 'No reports on the server yet. Save this one to start.')); return; }
      rows.forEach(function(r){
        var row = el('div','display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid var(--line-2);');
        var main = el('div','flex:1 1 260px;min-width:0;');
        main.appendChild(el('strong','display:block;font-size:13px;', r.company_name || r.title || 'Untitled'));
        main.appendChild(el('span','font-size:11.5px;color:var(--ink-3);',
          [r.report_no, r.financial_year, 'v' + r.version, r.updated_at, r.updated_by].filter(Boolean).join(' · ')));
        row.appendChild(main);
        if (r.id === c.reportId) row.appendChild(el('span','font-size:11px;color:var(--ok);', 'open here'));
        row.appendChild(btn('Open', function(){
          if (c.dirty && !confirm('Open ' + (r.company_name || 'that report') + '?\n\nThis draft has changes that are not on the server yet; they are replaced.')) return;
          cloudOpen(r.id).catch(function(e){ alert(e.message); });
        }, 'sm'));
        row.appendChild(btn(archived ? 'Restore' : 'Archive', function(){
          var p = archived ? cloudFetch('/api/reports/' + r.id + '/restore', { method:'POST' })
                           : cloudFetch('/api/reports/' + r.id, { method:'DELETE' });
          p.then(function(){ load(archived); }).catch(function(e){ alert(e.message); });
        }, 'sm'));
        list.appendChild(row);
      });
    }).catch(function(e){ clear(list); list.appendChild(el('p','', e.message)).className = 'callout bad'; });
  };
  var bar3 = el('div','display:flex;gap:8px;flex-wrap:wrap;');
  bar3.appendChild(btn('Show the reports', function(){ load(false); }, 'primary'));
  bar3.appendChild(btn('Show archived', function(){ load(true); }));
  c3.appendChild(bar3);
  c3.appendChild(list);
  w.appendChild(c3);

  /* --- what the apps have sent --- */
  var c4 = card('Files the field apps have sent',
    'FOX KISEM, Thermo-X, JET-Eff, A-CMP and the PQ analyser can post their exports straight to the server. Anything sent for this company can be imported from here without a file ever touching a laptop.');
  var ul = el('div','margin-top:6px;');
  c4.appendChild(btn('Show files for ' + ((S.company && S.company.name) || 'this company'), function(){
    clear(ul); ul.appendChild(el('p','', 'Asking the server…'));
    cloudFetch('/api/ingest?company=' + encodeURIComponent((S.company && S.company.name) || '')).then(function(rows){
      clear(ul);
      if (!rows.length){ ul.appendChild(el('p','', 'Nothing sent for this company yet.')); return; }
      rows.forEach(function(r){
        var row = el('div','display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:5px 0;border-bottom:1px solid var(--line-2);');
        var m = el('div','flex:1 1 240px;min-width:0;');
        m.appendChild(el('strong','display:block;font-size:12.5px;', (r.app || '').toUpperCase() + ' · ' + (r.filename || r.summary || r.id.slice(0, 8))));
        m.appendChild(el('span','font-size:11px;color:var(--ink-3);', [r.summary, r.uploaded_at, r.uploaded_by].filter(Boolean).join(' · ')));
        row.appendChild(m);
        row.appendChild(btn('Import', function(){
          cloudFetch('/api/ingest/' + r.id).then(function(u){ cloudImport(u); }).catch(function(e){ alert(e.message); });
        }, 'sm'));
        ul.appendChild(row);
      });
    }).catch(function(e){ clear(ul); ul.appendChild(el('p','', e.message)).className = 'callout bad'; });
  }, 'primary'));
  c4.appendChild(ul);
  c4.appendChild(importLogBox());
  w.appendChild(c4);
};

/* A file from the server goes through the very importer a dropped file goes
   through - the server is a delivery van, not a second format. */
function cloudImport(u){
  var lines = [];
  try {
    if (u.payload && typeof importPqBundle === 'function' && isPqBundle(u.payload)){
      lines.push(importPqBundle(u.payload, u.filename || u.app));
    } else if (u.blob_b64){
      var bin = atob(u.blob_b64), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var wb = XLSX.read(bytes, { type:'array' });
      lines = lines.concat(importAny(wb, u.filename || (u.app + '.xlsx')));
    } else {
      throw new Error('That upload carries nothing this report can read.');
    }
    save(); renderAll();
    var box = document.getElementById('importlog');
    if (box){
      clear(box); box.hidden = false;
      lines.forEach(function(l){ var p = el('div','', l); p.className = 'callout good'; p.style.margin = '0 0 4px'; box.appendChild(p); });
    }
  } catch (e){
    alert(e.message);
  }
}

/* A file dropped into this report, kept on the server too, so the next
   person has what was measured and not only what this report made of it.
   Which app it came from is decided the way the importer decides it. */
function cloudAppOf(name, log){
  var t = (name + ' ' + (log || '')).toLowerCase();
  if (/thermo/.test(t)) return 'thermox';
  if (/a-?cmp|compressor/.test(t)) return 'acmp';
  if (/fox|pcc|mcc|apfc/.test(t)) return 'fox';
  if (/jet/.test(t)) return 'jeteff';
  if (/pq|postman-pq|recording/.test(t)) return 'aipqa';
  return 'other';
}
function cloudArchiveFile(file, summary){
  if (!signedIn()) return Promise.resolve(null);
  return new Promise(function(res){
    var r = new FileReader();
    r.onload = function(){
      var s = String(r.result);
      res(s.slice(s.indexOf(',') + 1));      /* data:...;base64,XXXX */
    };
    r.onerror = function(){ res(null); };
    r.readAsDataURL(file);
  }).then(function(b64){
    if (!b64) return null;
    return cloudFetch('/api/ingest', { method:'POST', body:{
      app: cloudAppOf(file.name, summary), company_name:(S.company && S.company.name) || '',
      filename:file.name, content_type:file.type || '', report_id:cloudState().reportId || null,
      blob_b64:b64, summary:summary || ''
    } });
  }).catch(function(){ return null; });   /* never let the copy-up break an import */
}
