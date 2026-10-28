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

   FOUR RULES KEEP WORK FROM BEING LOST, and between them there is no gap:

     1. Every change is written to this browser at once. That write is
        synchronous and local, so it cannot fail for want of a network.
     2. While you work, the server is kept a couple of seconds behind. A
        push that fails is retried on a backoff - 5s, 10s, 20s, 40s, then
        every minute - rather than waiting for the next keystroke.
     3. Closing the tab, or just leaving it, pushes what is outstanding there
        and then, as a keepalive request that outlives the page. A typical
        report is 25 KB, so this normally completes.
     4. Whatever rule 3 could not finish goes up the moment the app next
        opens, before anything else. This is the guarantee the other three
        lean on: a browser being closed cannot be relied upon, so nothing
        depends on it alone.

   And the session: a stored sign-in is believed at once and checked against
   the server a moment later. A server that cannot be reached leaves you
   signed in - a blip in a plant basement is not a reason to log somebody
   out - while a definite "that token is no longer valid" returns you to the
   door, with the reason given and the draft untouched.
   =================================================================== */

var EASS_DEFAULT = 'https://eass.eassiitgn.page';

function blankCloud(){
  return { server:EASS_DEFAULT, token:'', user:null, tokenAt:0, reportId:'', version:0,
           lastMark:'', lastSaved:'', lastError:'', dirty:false, autosave:true, offlineChosen:false };
}
/* How long a token lasts on the server; renewed once past half of it. */
var TOKEN_LIFE_MS = 12 * 3600 * 1000;
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
      /* The token is gone or expired. Ending a session is one function, so
         that it always does the same things wherever the 401 surfaced:
         forget the token, keep the draft, remember why, show the door. */
      return r.json().catch(function(){ return {}; }).then(function(j){
        var why = j.detail || 'Your session has ended.';
        cloudEndSession(why);
        throw new Error(why + ' Your work is safe in this browser.');
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
      c.token = r.token; c.user = r.user; c.tokenAt = Date.now();
      c.lastError = ''; CLOUD_FAILS = 0; CLOUD_CONFLICT = ''; CLOUD_CONFLICT_WHO = '';
      saveNow();
      cloudWatchStart();
      /* Whatever this browser holds and the server does not, goes up now. */
      cloudPush('signed in');
      return r.user;
    });
}

/* Ending a session, from wherever, always means the same four things: the
   token is forgotten, THE DRAFT IS NOT TOUCHED, the reason is kept so it can
   be shown at the door, and the door comes back. Nothing here deletes work,
   and the report binding is kept so signing back in carries on with the same
   report rather than making a duplicate of it. */
function cloudEndSession(why){
  var c = cloudState();
  c.token = ''; c.user = null; c.tokenAt = 0;
  c.lastError = why || '';
  c.offlineChosen = false;             /* so the door asks again */
  clearTimeout(CLOUD_T); CLOUD_T = null;
  clearInterval(CLOUD_WATCH); CLOUD_WATCH = null; CLOUD_THEIRS = null;
  saveNow();
  if (typeof gateShow === 'function') gateShow(why || ''); else renderAll();
}

/* Signing out on purpose. Work that is not on the server yet is offered up
   first: leaving it behind should be a decision somebody makes knowingly,
   not a side effect of clicking Sign out. */
function cloudLogout(){
  var c = cloudState();
  var behind = c.reportId ? (c.dirty || cloudSig() !== CLOUD_SIG) : cloudAnyWork();
  if (!behind){ cloudEndSession(''); return Promise.resolve(); }
  if (!confirm('Sign out?\n\nThis report has changes that are not on the server yet.\n\nOK — put them on the server, then sign out.\nCancel — stay signed in.'))
    return Promise.resolve();
  return cloudSave('saved on sign-out').then(function(){ cloudEndSession(''); })
    .catch(function(e){
      if (confirm('That did not save: ' + e.message + '\n\nSign out anyway? The work stays in this browser and goes up the next time you sign in.'))
        cloudEndSession('');
    });
}
/* Is there anything here worth keeping at all? Asked before nagging about a
   draft that is really just an empty form. */
function cloudAnyWork(){
  return !!((S.company && S.company.name) || (S.bills && S.bills.length) || (S.ledger && S.ledger.length));
}

/* ------------------------------------------------------------------
   PICKING UP WHERE YOU LEFT OFF

   Run once at boot when a token is already in this browser. The token is
   BELIEVED immediately - the app opens signed in, with no spinner and no
   flash of the sign-in page - and checked against the server a moment
   later, which is when a stale one is caught.
   ------------------------------------------------------------------ */
function cloudResume(){
  var c = cloudState();
  if (!signedIn()) return Promise.resolve(false);
  return cloudFetch('/api/auth/me').then(function(u){
    c.user = u;                        /* a renamed account shows its new name */
    c.lastError = '';
    return cloudRenewIfStale();
  }).then(function(){
    paintCloudStrip();
    cloudWatchStart();                 /* and keep an eye on what the others do */
    return cloudReconcile();           /* rule 4: catch the server up, first thing */
  }).then(function(){
    return true;
  }).catch(function(e){
    /* A 401 has already shown the door, through cloudEndSession. Anything
       else is the server being unreachable, which is NOT a reason to sign
       anybody out: stay in, say so in the strip, and look again in a minute. */
    if (signedIn()){
      c.lastError = e.message;
      paintCloudStrip();
      setTimeout(cloudResume, 60000);
    }
    return false;
  });
}

/* ---- rule 4: settling up with the server on the way in ---------------

   The one thing a reload cannot know is whether the push made as the page
   closed actually landed. Guessing from version numbers is not good enough:
   if that push DID land, the server is a version ahead of what this browser
   remembers, which looks exactly like somebody else having saved.

   So compare the content, not the counter. Three outcomes, and only one of
   them is a clash worth interrupting anybody for.                        */
function cloudCanon(v){
  /* Key order must not decide whether two reports are "different": the
     server hands back what Python's json made of what we sent. */
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(cloudCanon).join(',') + ']';
  return '{' + Object.keys(v).sort().map(function(k){
    return JSON.stringify(k) + ':' + cloudCanon(v[k]);
  }).join(',') + '}';
}

function cloudReconcile(){
  var c = cloudState();
  if (!signedIn() || !c.reportId) return cloudPush('first save after signing in');
  return cloudFetch('/api/reports/' + encodeURIComponent(c.reportId) + '?quiet=true').then(function(r){
    var ours = !!(r.client_mark && c.lastMark && r.client_mark === c.lastMark);

    /* The newest save on the server is one WE made - almost always the one
       sent as the page closed. Take its version number; there is no clash
       here and nobody needs telling about it. */
    if (ours || r.version === c.version){
      c.version = r.version;
      c.dirty = false; c.lastError = ''; CLOUD_FAILS = 0;
      CLOUD_SIG = cloudCanon(r.state || {}) === cloudCanon(cloudPayload()) ? cloudSig() : '';
      saveNow(); paintCloudStrip();
      /* Anything this browser has on top of that - work done after the
         flush, or a field a migration filled in on the way in - goes up
         now. CLOUD_SIG was left empty above precisely so this is not
         mistaken for "no change". */
      return CLOUD_SIG ? false : cloudPush('caught up after a reload', true);
    }

    /* Somebody else's save is the newest one. Do not touch it. */
    CLOUD_CONFLICT_WHO = r.updated_by || '';
    CLOUD_CONFLICT = (r.updated_by ? r.updated_by + ' has saved this report since you last had it'
                                   : 'This report has moved on since you last had it') +
      ' — the server is on version ' + r.version + ', you were on ' + c.version + '.';
    clearTimeout(CLOUD_T); CLOUD_T = null;
    paintCloudStrip();
    return false;
  });
}

/* A token half-way through its life is replaced, so a long day on site does
   not end in a sign-out nobody asked for. */
function cloudRenewIfStale(){
  var c = cloudState();
  if (!signedIn()) return Promise.resolve(false);
  var age = Date.now() - (c.tokenAt || 0);
  if (c.tokenAt && age < TOKEN_LIFE_MS / 2) return Promise.resolve(false);
  return cloudFetch('/api/auth/refresh', { method:'POST' }).then(function(r){
    c.token = r.token; c.user = r.user || c.user; c.tokenAt = Date.now();
    saveNow(); return true;
  }).catch(function(){ return false; });   /* the current token still works */
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
  return { server:c.server, token:c.token, user:c.user, tokenAt:c.tokenAt,
           autosave:c.autosave, offlineChosen:c.offlineChosen };
}
function cloudNewReport(sess){
  sess = sess || {};
  S.cloud = { server:sess.server || EASS_DEFAULT, token:sess.token || '', user:sess.user || null,
              tokenAt:sess.tokenAt || 0, autosave:sess.autosave !== false,
              offlineChosen:!!sess.offlineChosen,
              reportId:'', version:0, lastSaved:'', lastError:'', dirty:false };
  CLOUD_SIG = '';
  CLOUD_CONFLICT = ''; CLOUD_CONFLICT_WHO = ''; CLOUD_FAILS = 0;
  clearTimeout(CLOUD_T); CLOUD_T = null;
}

/* A mark on every push, so that on the next load this editor can recognise
   its OWN last save. Without it, a save made as the page closed leaves the
   server one version ahead of what this browser remembers, which is
   indistinguishable from a colleague having saved - and the editor would
   cry conflict at somebody every time they pressed reload.

   The mark is derived from the CONTENT being sent, not from the attempt.
   That matters: leaving a page fires visibilitychange, pagehide and
   beforeunload, so the same report can be sent two or three times on the
   way out. A mark per attempt would leave the server holding one value and
   the browser remembering another - which is the false clash this whole
   mechanism exists to prevent. A mark per content is the same value however
   many times it goes. */
function cloudHash(str){
  /* FNV-1a, 32 bits. The length goes on the end, which makes an accidental
     match between two different reports not worth thinking about. */
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8) + '-' + str.length;
}
function cloudMark(canon){
  var c = cloudState();
  c.lastMark = cloudHash(canon);
  return c.lastMark;
}

function cloudSave(note){
  var c = cloudState();
  if (!signedIn()) return Promise.reject(new Error('Sign in first.'));
  var body = cloudCard();
  body.state = cloudPayload();
  body.note = note || '';
  body.client_mark = cloudMark(cloudCanon(body.state));
  var p;
  if (c.reportId){
    body.version = c.version;
    p = cloudFetch('/api/reports/' + encodeURIComponent(c.reportId), { method:'PUT', body:body });
  } else {
    p = cloudFetch('/api/reports', { method:'POST', body:body });
  }
  return p.then(function(r){
    CLOUD_SIG = JSON.stringify(body.state);
    if (CLOUD_THEIRS && CLOUD_THEIRS.version <= r.version) CLOUD_THEIRS = null;
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
  CLOUD_CONFLICT = ''; CLOUD_CONFLICT_WHO = ''; CLOUD_FAILS = 0;
  return cloudSave('copy kept after a clash');
}
function cloudOpen(id){
  return cloudFetch('/api/reports/' + encodeURIComponent(id)).then(function(r){
    var keep = cloudState();
    var cloud = { server:keep.server, token:keep.token, user:keep.user, tokenAt:keep.tokenAt,
                  autosave:keep.autosave, offlineChosen:keep.offlineChosen,
                  reportId:r.id, version:r.version, lastSaved:'', lastError:'', dirty:false };
    S = deepMerge(blankState(), r.state || {});
    S.cloud = cloud;
    if (typeof migrateState === 'function') migrateState();
    CLOUD_SIG = cloudSig();      /* just arrived from the server - nothing to push */
    CLOUD_CONFLICT = ''; CLOUD_CONFLICT_WHO = ''; CLOUD_FAILS = 0;
    CLOUD_THEIRS = null;
    clearTimeout(CLOUD_T); CLOUD_T = null;
    saveNow(); renderAll();
    return r;
  });
}
function cloudReports(archived){
  return cloudFetch('/api/reports' + (archived ? '?archived=true' : ''));
}

/* ------------------------------------------------------------------
   KEEPING THE SERVER CAUGHT UP

   One timer, one push at a time, and a failure that retries itself. The
   editor never waits for any of it: the browser already has the change
   before this is even scheduled.
   ------------------------------------------------------------------ */
var CLOUD_T = null;            /* the pending push */
var CLOUD_BUSY = false;        /* one at a time, so two saves cannot race */
var CLOUD_AGAIN = false;       /* something changed while one was in flight */
var CLOUD_FAILS = 0;          /* consecutive failures, for the backoff */
var CLOUD_CONFLICT = '';       /* set when the server says somebody else saved */
var CLOUD_CONFLICT_WHO = '';   /* and who it was, when the server tells us */
var CLOUD_DELAY = 2500;        /* how far behind the server runs while typing */
var CLOUD_FLUSHED = '';        /* the content already sent on the way out */

/* How long to wait after a failure: 5s, 10s, 20s, 40s, then every minute. */
function cloudBackoff(){
  return Math.min(5000 * Math.pow(2, Math.max(0, CLOUD_FAILS - 1)), 60000);
}

/* Called by save() on every change. Cheap: it sets a flag and a timer. */
function cloudTouch(){
  var c = cloudState();
  if (!signedIn() || !c.autosave || CLOUD_CONFLICT) return;
  c.dirty = true;
  paintCloudStrip();
  cloudArm(CLOUD_DELAY);
}
function cloudArm(ms){
  clearTimeout(CLOUD_T);
  CLOUD_T = setTimeout(function(){ CLOUD_T = null; cloudPush('autosave'); }, ms);
}

/* The single place a push happens. Everything else asks this.
   `force` is a person pressing Save: it goes even when saving-as-you-work
   has been switched off, because they asked for this one. */
function cloudPush(note, force){
  var c = cloudState();
  if (!signedIn() || CLOUD_CONFLICT) return Promise.resolve(false);
  if (!c.autosave && !force) return Promise.resolve(false);
  /* An empty form is not a report. Signing in used to put one on the server
     every time, which filled the team's list with untitled nothings. Once a
     report exists it is kept up to date whatever it contains - deleting the
     company name is a change, not a reason to stop saving. */
  if (!c.reportId && !cloudAnyWork()) return Promise.resolve(false);
  if (CLOUD_BUSY){ CLOUD_AGAIN = true; return Promise.resolve(false); }
  /* Nothing actually different from what the server holds: a screen change,
     or a field typed into and typed back. Don't make a version for it. */
  if (c.reportId && cloudSig() === CLOUD_SIG){
    c.dirty = false; c.lastError = ''; CLOUD_FAILS = 0; paintCloudStrip();
    return Promise.resolve(false);
  }
  CLOUD_BUSY = true;
  return cloudSave(note || 'autosave').then(function(){
    CLOUD_FAILS = 0;
    return true;
  }).catch(function(e){
    if (e && e.status === 409){
      /* Two people, one report. Retrying would fail for ever and bury the
         choice, so autosaving stops here until somebody decides. Ask who it
         was, because "Rahul has saved this report" is something you can act
         on and "there was a conflict" is not. */
      CLOUD_CONFLICT = e.message;
      clearTimeout(CLOUD_T); CLOUD_T = null;
      cloudWhoSaved();
    } else if (signedIn()){
      CLOUD_FAILS++;
      cloudArm(cloudBackoff());        /* rule 2: try again by itself */
    }
    return false;
  }).then(function(ok){
    CLOUD_BUSY = false;
    if (CLOUD_AGAIN){ CLOUD_AGAIN = false; cloudArm(ok ? CLOUD_DELAY : cloudBackoff()); }
    paintCloudStrip();
    return ok;
  });
}

/* Somebody pressing Save, or Try now. Clears the wait and the failure count
   first, so a backoff already running does not hold up a deliberate save,
   and reports what happened rather than failing quietly. */
function cloudRetryNow(){
  var c = cloudState();
  CLOUD_FAILS = 0;
  clearTimeout(CLOUD_T); CLOUD_T = null;
  var was = c.reportId ? 'manual save' : 'first save';
  return cloudPush(was, true).then(function(ok){
    if (!ok && c.lastError && !CLOUD_CONFLICT) alert(c.lastError);
    return ok;
  });
}

/* Is the server behind this browser? The one question worth asking before
   warning somebody that they are about to lose something. */
function cloudBehind(){
  var c = cloudState();
  if (!signedIn() || !c.autosave) return false;
  if (!c.reportId) return cloudAnyWork();
  return c.dirty || cloudSig() !== CLOUD_SIG;
}

/* ---- rule 3: leaving the page ----------------------------------------
   visibilitychange fires when a tab is hidden, switched away from or
   closed, and it is the last moment a browser reliably gives us. The
   request is sent with keepalive so it survives the page going away.
   It is best effort by nature, which is why rule 4 exists.            */
function cloudFlushOnLeave(){
  var c = cloudState();
  if (!signedIn() || !c.autosave || CLOUD_CONFLICT) return;
  if (!c.reportId && !cloudAnyWork()) return;         /* an empty form, never mind */
  if (!c.dirty && cloudSig() === CLOUD_SIG) return;   /* already up there */
  var body = cloudCard();
  body.state = cloudPayload();
  body.note = 'left the page';
  body.client_mark = cloudMark(cloudCanon(body.state));
  if (c.reportId) body.version = c.version;
  /* Leaving fires three events; this content has already gone. */
  if (CLOUD_FLUSHED === body.client_mark) return;
  CLOUD_FLUSHED = body.client_mark;
  /* The mark must be in local storage BEFORE the request goes, because the
     page may not live long enough for anything after this to run. It is how
     the next load recognises this save as its own. */
  saveNow();
  try {
    fetch(cloudUrl(c.reportId ? '/api/reports/' + encodeURIComponent(c.reportId) : '/api/reports'), {
      method: c.reportId ? 'PUT' : 'POST',
      headers: { 'Content-Type':'application/json', Authorization:'Bearer ' + c.token },
      body: JSON.stringify(body),
      keepalive: true
    });
    /* No .then: the page is going. Whether it landed is settled on the next
       open, when the signature is compared again and anything outstanding
       is pushed. */
  } catch (e){ /* nothing useful to do on the way out */ }
}

/* The one line at the top of the editor that says where the work is.

   It never says "saved" when something is outstanding, and never leaves a
   failure looking like success. Those two are the whole job: an engineer
   should be able to glance at it and know whether they can close the lid. */
function paintCloudStrip(){
  var host = q('cloudstrip'); if (!host) return;
  clear(host);
  var c = cloudState();

  if (!signedIn()){
    host.appendChild(el('span','', 'Working in this browser only'));
    host.appendChild(btn('Sign in', function(){
      cloudState().offlineChosen = false; save();
      if (typeof gateShow === 'function') gateShow();
    }, 'sm'));
    return;
  }

  var who = c.user.name || c.user.email;
  var line, tone = '';

  if (CLOUD_CONFLICT){
    line = (CLOUD_CONFLICT_WHO ? CLOUD_CONFLICT_WHO + ' has saved this report' : 'somebody else has saved this report');
    tone = 'var(--bad)';
  } else if (!c.reportId){
    line = 'not on the server yet';
  } else if (CLOUD_BUSY || c.dirty){
    line = 'saving…';
  } else if (c.lastError){
    line = CLOUD_FAILS ? 'not saved — trying again' : 'not saved — ' + c.lastError;
    tone = 'var(--bad)';
  } else {
    /* "saved 15:04 · v13" once something has been saved from here, and
       "up to date · v13" when the report simply arrived that way. It used
       to print the word "opened" where the time goes. */
    line = (c.lastSaved ? 'saved ' + c.lastSaved : 'up to date') + ' · v' + c.version;
  }
  var label = el('span','', who + ' · ' + line);
  if (tone) label.style.color = tone;
  host.appendChild(label);

  /* A colleague has saved while this was open. Not an error, not a clash -
     just news, with the one thing you would want to do about it. */
  if (CLOUD_THEIRS && !CLOUD_CONFLICT){
    var n = el('span','color:var(--accent);',
      ' · ' + (CLOUD_THEIRS.who || 'somebody') + ' saved v' + CLOUD_THEIRS.version);
    host.appendChild(n);
    host.appendChild(btn('Load theirs', cloudTakeNewer, 'sm'));
  }

  /* These two never go away. A clash used to replace them with a single
     "What now?", which took Save and My reports off the screen exactly when
     somebody needed to get out of the report they were stuck in. A clash is
     a notice, not a trap. */
  if (CLOUD_CONFLICT){
    host.appendChild(btn('Sort it out', function(){ S.active = 'cloud'; save(); renderAll(); }, 'sm primary'));
  } else if (c.lastError){
    host.appendChild(btn('Try now', function(){ cloudRetryNow(); }, 'sm primary'));
  } else {
    host.appendChild(btn(c.reportId ? 'Save now' : 'Save to the server', function(){
      cloudRetryNow();
    }, 'sm primary'));
  }
  host.appendChild(btn('My reports', function(){ S.active = 'cloud'; save(); renderAll(); }, 'sm'));
}

/* ------------------------------------------------------------------
   WATCHING FOR SOMEBODY ELSE'S WORK

   Two people on one report used to find out about each other only by
   colliding: the first to save won, the second got a clash out of nowhere.
   So while a report is open, ask the server every half minute whether its
   version has moved. If it has and WE did not move it, say so quietly -
   with the colleague's name and one button to take their copy - long
   before anybody has typed themselves into a conflict.

   It is a HEAD-weight question on a 25 KB document, once every 30s, per
   open editor. On a team of six that is nothing.
   ------------------------------------------------------------------ */
var CLOUD_WATCH = null;
var CLOUD_THEIRS = null;       /* {version, who, at} seen on the server */
var CLOUD_WATCH_MS = 30000;

function cloudWatchStart(){
  clearInterval(CLOUD_WATCH);
  CLOUD_WATCH = setInterval(cloudWatchTick, CLOUD_WATCH_MS);
}
function cloudWatchTick(){
  var c = cloudState();
  if (!signedIn() || !c.reportId || CLOUD_BUSY || CLOUD_CONFLICT) return;
  if (document.visibilityState === 'hidden') return;   /* nobody is looking */
  cloudFetch('/api/reports?company=' + encodeURIComponent(c.company_name || (S.company && S.company.name) || ''))
    .then(function(rows){
      var mine = null, i;
      for (i = 0; i < rows.length; i++) if (rows[i].id === c.reportId) { mine = rows[i]; break; }
      if (!mine) return;
      if (mine.version > c.version){
        CLOUD_THEIRS = { version:mine.version, who:mine.updated_by || '', at:mine.updated_at || '' };
      } else {
        CLOUD_THEIRS = null;
      }
      paintCloudStrip();
    }).catch(function(){ /* the strip already says when the server is away */ });
}
/* Taking what a colleague saved, when the watcher has offered it. */
function cloudTakeNewer(){
  var c = cloudState();
  if (cloudBehind() && !confirm('Load the newer copy?\n\nYou have changes here that are not on the server yet, and they would be replaced.')) return;
  CLOUD_THEIRS = null;
  return cloudOpen(c.reportId).catch(function(e){ alert(e.message); });
}

/* Who made the save we just lost a race to. Best effort and silent: the
   notice is already on screen; this only puts a name on it. */
function cloudWhoSaved(){
  var c = cloudState();
  if (!c.reportId) return;
  cloudFetch('/api/reports/' + encodeURIComponent(c.reportId) + '?quiet=true')
    .then(function(r){ CLOUD_CONFLICT_WHO = r.updated_by || ''; paintCloudStrip(); })
    .catch(function(){});
}

/* ---- the two ways out of a clash, in one place ---------------------- */
function cloudTakeTheirs(){
  var c = cloudState();
  CLOUD_CONFLICT = ''; CLOUD_CONFLICT_WHO = '';
  return cloudOpen(c.reportId);
}
function cloudKeepMine(){
  CLOUD_CONFLICT = ''; CLOUD_CONFLICT_WHO = '';
  return cloudSaveAsCopy();
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
    var em = el('input'); em.type = 'text'; em.placeholder = 'your KISEM FOX username'; em.autocomplete = 'username';
    var pw = el('input'); pw.type = 'password'; pw.placeholder = 'password'; pw.autocomplete = 'current-password';
    form.appendChild(labelled('Username', em));
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
      'The same username and password as KISEM FOX. No account? An administrator makes one — accounts are not self-service, because a report carries a client’s measurements.'));
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

  /* A clash is the one thing worth stopping the work for, so it is put
     where the work is, with both answers side by side and neither of them
     chosen for anybody. Saving to the server stays paused until one is. */
  if (CLOUD_CONFLICT){
    var cf = el('div','margin-top:10px;');
    cf.appendChild(el('p','', CLOUD_CONFLICT)).className = 'callout bad';
    cf.appendChild(el('p','font-size:12.5px;color:var(--ink-2);margin:6px 0 8px;',
      'Nothing has been overwritten, and saving to the server is paused until you choose. Your version is still in this browser either way.'));
    var cfb = el('div','display:flex;gap:8px;flex-wrap:wrap;');
    cfb.appendChild(btn('Take theirs — replace my draft', function(){
      if (!confirm('Replace this draft with the copy on the server?\n\nWhat you have changed since your last save is lost.')) return;
      cloudTakeTheirs().catch(function(e){ alert(e.message); });
    }, 'primary'));
    cfb.appendChild(btn('Keep mine — save it as a new report', function(){
      cloudKeepMine().then(function(){ renderAll(); }).catch(function(e){ alert(e.message); });
    }));
    cf.appendChild(cfb);
    c2.appendChild(cf);
    /* The rest of this screen still draws. It used to stop here, which meant
       a clash also took away the list of reports - so the one screen that
       could get you out of the stuck report was the screen that hid it. */
  }

  if (c.lastError) c2.appendChild(el('p','', c.lastError)).className = 'callout bad';
  var bar2 = el('div','display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;');
  bar2.appendChild(btn(c.reportId ? 'Save now' : 'Save to the server', function(){
    cloudRetryNow().then(function(){ renderAll(); });
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
