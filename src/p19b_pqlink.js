/* ===================================================================
   AI-PQA LINK - the analyser's own findings, straight into the report.

   The Excel "PostMan export" carries raw samples and leaves this file to
   redo the arithmetic in the browser. That is fine for an hour of data and
   hopeless for a week at one second, and it can only print what the
   browser can recompute - never the analyser's IEEE 519 / EN 50160
   verdicts, its equipment-health scores or the events it detected. The
   bundle (PostMan-PQ-JSON v1, built by AI-PQA's backend/reports/
   postman_bundle.py) moves all of that to the server: PostMan receives
   ~100 kB per recording with the stats, the series already thinned for
   the charts, the harmonics, the compliance table, the health strip, the
   events and the data-quality report, and prints them section by section.

   Two ways in: pull it from the analyser server on the Electrical
   distribution page (nothing to download), or drop the .json file the
   analyser's dashboard saves. Both land in importPqBundle.
   =================================================================== */

var PQ_BUNDLE_FORMAT = 'PostMan-PQ-JSON v1';

function isPqBundle(o){ return !!(o && typeof o === 'object' && /^PostMan-PQ-JSON/.test(String(o.format || '')) && o.stats && o.series); }

/* Same record shape importPq makes from the workbook, plus the analyser's
   findings, so every printer that already handles a recording keeps
   working and the new blocks print when the fields are there. */
function importPqBundle(b, fileName){
  pqState();
  if (!isPqBundle(b)) throw new Error('Not a PostMan bundle (expected format ' + PQ_BUNDLE_FORMAT + ').');
  var st = function(x){ return x ? { min:x.min, max:x.max, avg:x.avg, n:x.n } : null; };
  var S_ = b.stats || {}, se = b.series || {};
  var rec = {
    id: uid(), file: fileName || ('AI-PQA session ' + String(b.session_id || '').slice(0, 8)),
    name: String(b.panel || 'Recording'), recId: String(b.recording_id || ''), role: String(b.role || 'pcc').toLowerCase(), nodeId: null,
    instrument: String(b.instrument || ''), company: String(b.company || ''), plant: String(b.plant || ''),
    engineer: String(b.engineer || ''), exportedAt: String(b.exported_at || ''),
    start: b.start ? String(b.start).slice(5, 16) : '', end: b.end ? String(b.end).slice(5, 16) : '', samples: b.samples || 0,
    intervalS: b.interval_s || null, nominalV: b.nominal_v || null, sessionId: b.session_id || '',
    stats: { v:st(S_.v), va:st(S_.va), vb:st(S_.vb), vc:st(S_.vc), i:st(S_.i), ia:st(S_.ia), ib:st(S_.ib), ic:st(S_.ic),
             kw:st(S_.kw), kva:st(S_.kva), kvar:st(S_.kvar), pf:st(S_.pf), freq:st(S_.freq), vthd:st(S_.vthd), ithd:st(S_.ithd),
             vImb:S_.v_imbalance_pct, iImb:S_.i_imbalance_pct },
    series: { t:se.t || [], va:se.va || null, vb:se.vb || null, vc:se.vc || null, ia:se.ia || null, ib:se.ib || null, ic:se.ic || null,
              kw:se.kw || null, kva:se.kva || null, kvar:se.kvar || null, pf:se.pf || null, vthd:se.vthd || null, ithd:se.ithd || null },
    harmV: (b.harmonics && b.harmonics.voltage) || [], harmI: (b.harmonics && b.harmonics.current) || [],
    /* the analyser's own findings */
    compliance: b.compliance || null, health: b.health || null, events: b.events || null,
    quality: b.data_quality || null, observations: b.observations || [], cost: b.cost || null,
    /* the dashboard's own charts, captured on the analyser when it was sent */
    charts: (b.charts || []).filter(function(c){ return c && c.image; }).map(function(c){ return { title:String(c.title || 'Chart'), dataUrl:c.image, w:c.w || 1400, h:c.h || 560 }; }),
    sentAt: b.sent_at || '', bundle: true
  };
  var key = (rec.recId || rec.name).toLowerCase();
  S.pq.recordings = S.pq.recordings.filter(function(r){ return (r.recId || r.name).toLowerCase() !== key; });
  S.pq.recordings.push(rec);
  pqLinkToPanels(rec);
  return 'PQ analyser findings for "' + rec.name + '"' + (rec.recId ? ' (' + rec.recId + ')' : '') + ': ' + inr(rec.samples) + ' samples' +
    (rec.start ? ', ' + rec.start + ' to ' + rec.end : '') + (rec.compliance ? ', compliance ' + rec.compliance.summary.score + ' %' : '') +
    (rec.health ? ', health ' + rec.health.overall : '');
}

/* ------------------------------------------------------------------
   PULLING FROM THE ANALYSER SERVER
   ------------------------------------------------------------------ */
/* An empty field means the team's default server, which is what the field shows. */
function pqServerUrl(){ pqState(); return String(S.pq.server || PQ_DEFAULT_SERVER).replace(/\/+$/, ''); }
function pqFetchJson(path){
  var base = pqServerUrl();
  if (!base) return Promise.reject(new Error('Enter the analyser server address first.'));
  return fetch(base + path).then(function(r){
    if (!r.ok) return r.json().catch(function(){ return {}; }).then(function(j){ throw new Error(j.detail || (r.status + ' ' + r.statusText)); });
    return r.json();
  });
}
function pqListSessions(){ return pqFetchJson('/api/upload/postman/sessions'); }
function pqPullSession(sid, role, panel, recId){
  var qs = '?role=' + encodeURIComponent(role || 'pcc') + '&panel_name=' + encodeURIComponent(panel || '') + '&recording_id=' + encodeURIComponent(recId || '');
  return pqFetchJson('/api/upload/session/' + encodeURIComponent(sid) + '/postman.json' + qs);
}

/* The card on the Electrical distribution page. */
function pqPullCard(w){
  pqState();
  var c = card('Pull from the PQ analyser',
    'On the analyser dashboard, Send to PostMan parks a recording here under its panel and recording ID; list them and import. What arrives is what the engineer saw: the processed statistics, the IEEE 519 / EN 50160 compliance table, equipment health, the cost of poor quality, detected events, the data-quality report and the dashboard\u2019s own charts. The server keeps a sent recording for 24 hours.');
  var row = el('div','display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;');
  var url = el('input'); url.type = 'text'; url.placeholder = PQ_DEFAULT_SERVER; url.value = S.pq.server || PQ_DEFAULT_SERVER;
  url.addEventListener('input', function(){ S.pq.server = url.value.trim(); save(); });
  var f = labelled('Analyser server address', url, 'The address you open the AI-PQA dashboard at — the team’s Hugging Face Space by default; http://127.0.0.1:8000 when the backend runs on this machine.'); f.style.flex = '1 1 260px'; row.appendChild(f);
  var list = el('div','margin-top:10px;');
  var status = el('p',''); status.className = 'callout'; status.hidden = true;
  var show = function(msg, cls){ status.textContent = msg; status.className = 'callout ' + (cls || ''); status.hidden = false; };
  row.appendChild(btn('List recordings', function(){
    show('Asking the server…');
    pqListSessions().then(function(sessions){
      clear(list);
      if (!sessions.length){ show('Nothing has been sent from the analyser yet (or it has expired \u2014 the server keeps a sent recording for 24 hours). On the analyser dashboard, use Send to PostMan.', ''); return; }
      status.hidden = true;
      var panels = [{ v:'', t:'— type a panel name —' }].concat(
        S.dist.mains.map(function(p){ return { v:'main|' + p.name + '|' + (p.recId || ''), t:'Main input — ' + p.name + (p.recId ? ' (' + p.recId + ')' : '') }; }),
        S.dist.pcc.map(function(p){ return { v:'pcc|' + p.name + '|' + (p.recId || ''), t:'PCC — ' + p.name + (p.recId ? ' (' + p.recId + ')' : '') }; }),
        S.dist.mcc.map(function(p){ return { v:'mcc|' + p.name + '|' + (p.recId || ''), t:'MCC — ' + p.name + (p.recId ? ' (' + p.recId + ')' : '') }; }));
      var picks = [];
      sessions.forEach(function(s){
        var box = el('div','border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin-bottom:8px;');
        var head = el('div','display:flex;gap:8px;align-items:center;flex-wrap:wrap;');
        var chk = el('input'); chk.type = 'checkbox'; chk.checked = true;
        head.appendChild(chk);
        var roleName = { main:'Plant main input', pcc:'PCC panel', mcc:'MCC panel' }[s.role] || s.role || '';
        head.appendChild(el('strong','', (s.panel || 'session ' + s.session_id.slice(0, 8)) + (s.recording_id ? ' (' + s.recording_id + ')' : '') + (roleName ? ' — ' + roleName : '')));
        head.appendChild(el('span','font-size:11px;color:var(--ink-3);', [s.plant_name || s.company_name, s.analyzer, s.engineer ? 'by ' + s.engineer : '', s.samples ? inr(s.samples) + ' samples' : '',
          s.compliance_score !== null && s.compliance_score !== undefined ? 'compliance ' + s.compliance_score + ' %' : '', s.charts ? s.charts + ' charts' : '',
          s.sent_at ? 'sent ' + s.sent_at : '', s.expires_at ? 'expires ' + s.expires_at : ''].filter(Boolean).join(' · ')));
        box.appendChild(head);
        /* The panel was chosen on the analyser; a FOX panel can still be
           picked here if the names do not line up. */
        var g = el('div','display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-top:6px;');
        var sel = el('select'); panels.forEach(function(o){ var op = el('option','', o.t); op.value = o.v; sel.appendChild(op); });
        sel.options[0].text = s.panel ? '\u2014 as sent: ' + s.panel + ' \u2014' : '\u2014 type a panel name \u2014';
        var role = el('select'); [['main','Plant main input'],['pcc','PCC panel'],['mcc','MCC panel']].forEach(function(o){ var op = el('option','', o[1]); op.value = o[0]; role.appendChild(op); }); role.value = s.role || 'pcc';
        var panel = el('input'); panel.type = 'text'; panel.placeholder = 'Panel name'; panel.value = s.panel || '';
        var rid = el('input'); rid.type = 'text'; rid.placeholder = 'Recording ID'; rid.value = s.recording_id || '';
        sel.addEventListener('change', function(){ if (!sel.value) return; var p = sel.value.split('|'); role.value = p[0]; panel.value = p[1]; rid.value = p[2] || rid.value; chk.checked = true; });
        g.appendChild(labelled('Match to a FOX panel', sel)); g.appendChild(labelled('Measured at', role)); g.appendChild(labelled('Panel name', panel)); g.appendChild(labelled('Recording ID', rid));
        box.appendChild(g);
        list.appendChild(box);
        picks.push({ s:s, chk:chk, role:role, panel:panel, rid:rid });
      });
      var go = btn('Import selected recordings', function(){
        var chosen = picks.filter(function(p){ return p.chk.checked; });
        if (!chosen.length){ show('Tick at least one recording.', 'bad'); return; }
        show('Pulling ' + chosen.length + ' recording' + (chosen.length === 1 ? '' : 's') + '…');
        var lines = [], k = 0;
        var next = function(){
          if (k >= chosen.length){ save(); renderAll(); var box2 = document.getElementById('importlog'); if (box2){ clear(box2); box2.hidden = false; lines.forEach(function(l){ var p = el('div','', l[1]); p.className = 'callout ' + (l[0] === 'bad' ? 'bad' : 'good'); p.style.margin = '0 0 4px'; box2.appendChild(p); }); } return; }
          var p = chosen[k++];
          pqPullSession(p.s.session_id, p.role.value, p.panel.value.trim(), p.rid.value.trim())
            .then(function(b){
              /* What was typed here wins over what was sent, so a mismatch can be corrected without going back to the analyser. */
              if (p.panel.value.trim()) b.panel = p.panel.value.trim();
              if (p.rid.value.trim()) b.recording_id = p.rid.value.trim();
              if (p.role.value) b.role = p.role.value;
              try { lines.push(['ok', importPqBundle(b)]); } catch (e){ lines.push(['bad', e.message]); } next(); })
            .catch(function(e){ lines.push(['bad', (p.panel.value || p.s.session_id.slice(0, 8)) + ': ' + e.message]); next(); });
        };
        next();
      }, 'primary');
      list.appendChild(go);
    }).catch(function(e){ show('Could not reach the analyser: ' + e.message + '. Check the address, and that the server is running with CORS open.', 'bad'); });
  }, 'primary'));
  c.appendChild(row); c.appendChild(status); c.appendChild(list);
  c.appendChild(el('p','margin-top:8px;font-size:12px;color:var(--ink-3);', 'Offline instead: on the analyser dashboard, Send to PostMan \u2192 Save bundle file instead, then drop the .json file in the box above.'));
  w.appendChild(c);
}

/* ------------------------------------------------------------------
   PRINTING THE FINDINGS - what each report section gets from AI-PQA
   ------------------------------------------------------------------ */
var PQ_TONE = { pass:'ok', warn:'watch', fail:'bad', good:'ok', fair:'watch', poor:'bad' };
var PQ_VERDICT = { pass:'Pass', warn:'Marginal', fail:'Fail' };

/* Standards compliance, grouped by standard, with the analyser's remark. */
function pqComplianceBlocks(B, rec){
  var cmp = rec.compliance; if (!cmp || !cmp.rules || !cmp.rules.length) return;
  var sm = cmp.summary || {};
  B.push(blk(bH(3, 'Standards compliance — ' + (rec.recId || rec.name))));
  B.push(blk(bKPI([
    ['Compliance score', (sm.score !== undefined ? sm.score : '—') + ' %'],
    ['Pass', String(sm.pass || 0)], ['Marginal', String(sm.warn || 0)], ['Fail', String(sm.fail || 0)]
  ])));
  var rows = cmp.rules.map(function(r){
    var d = r.unit === 'V' || r.unit === 'Hz' ? 2 : r.unit === '' ? 3 : 2;
    return [r.standard, r.clause, fix(r.measured, d) + (r.unit ? ' ' + r.unit : ''), fix(r.limit, r.unit === '' ? 2 : 0) + (r.unit ? ' ' + r.unit : ''),
      { v:PQ_VERDICT[r.verdict] || r.verdict, tone:PQ_TONE[r.verdict] || null }, r.remark];
  });
  B.push(tblBlock(['Standard', 'Clause', 'Measured', 'Limit', 'Verdict', 'Remark'], rows, { size:8, colw:['13%','19%','12%','10%','10%','36%'] }));
  B.push(blk(bP('Verdicts as evaluated by the AI power quality analyser over the whole recording (' + inr(rec.samples) + ' samples): IEEE 519 harmonic limits, EN 50160 supply voltage and frequency envelopes, IEC 61000-3-14 voltage imbalance and the utility power-factor threshold. A marginal result counts as half a pass in the score.', { size:9, italic:true })));
}

/* Equipment health: five components and the weighted score. */
function pqHealthBlocks(B, rec){
  var h = rec.health; if (!h || !h.components) return;
  B.push(blk(bH(3, 'Equipment health — ' + (rec.recId || rec.name))));
  B.push(blk(bKPI([['Overall health', h.overall + ' / 100']].concat(h.components.map(function(c){ return [c.label, c.score + ' (' + (c.status || '') + ')']; })))));
  B.push(tblBlock(['Component', 'Score', 'Status', 'Finding', 'Recommendation'],
    h.components.map(function(c){ return [c.label, String(c.score), { v:String(c.status || '').replace(/^./, function(x){ return x.toUpperCase(); }), tone:PQ_TONE[c.status] || null }, c.detail, c.recommendation]; }),
    { size:8, colw:['18%','8%','9%','32%','33%'] }));
  B.push(blk(bChart(chartBarsRef(h.components.map(function(c){ return c.label.replace(/ (Health|Stability|Balance)$/, ''); }), h.components.map(function(c){ return c.score; }),
    'Equipment health scores', 'score / 100', { ref:{ value:80, label:'Good ≥ 80' }, color:PH[0] }))));
}

/* Detected events: counts and the worst few. */
function pqEventBlocks(B, rec){
  var ev = rec.events; if (!ev) return;
  var ds = ev.dip_swell || {};
  B.push(blk(bH(3, 'Events detected — ' + (rec.recId || rec.name))));
  var types = Object.keys(ev.by_type || {});
  B.push(blk(bKPI([['Events', inr(ev.total || 0)], ['Voltage dips', String(ds.dips || 0)], ['Voltage swells', String(ds.swells || 0)], ['Severe', String(ds.severe || 0)]])));
  if (types.length) B.push(tblBlock(['Event type', 'Count'], types.map(function(t){ return [t.replace(/_/g, ' '), inr(ev.by_type[t])]; }), { colw:['60%','40%'] }));
  if (ev.list && ev.list.length){
    B.push(tblBlock(['Time', 'Event', 'Severity', 'Phase', 'Value', 'Limit', 'Message'],
      ev.list.slice(0, 12).map(function(e){ return [String(e.timestamp || '').slice(5, 16), String(e.type || '').replace(/_/g, ' '), { v:e.severity || '', tone:(/critical|high|severe/i.test(e.severity || '') ? 'bad' : /medium|warn/i.test(e.severity || '') ? 'watch' : null) }, e.phase || '—', fix(e.value, 2), fix(e.threshold, 2), e.message || '']; }),
      { size:7.6, colw:['11%','13%','9%','7%','9%','9%','42%'], caption: ev.list.length > 12 ? 'The ' + Math.min(ev.list.length, 40) + ' most severe events were received; the first 12 are listed.' : null }));
  }
  if (ds.nominal_v) B.push(blk(bP('Dips below 90 % and swells above 110 % of the ' + fix(ds.nominal_v, 0) + ' V nominal' +
    (ds.worst_dip_pct ? '; the deepest dip was ' + fix(ds.worst_dip_pct, 1) + ' % below nominal' : '') + '.', { size:9, italic:true })));
}

/* Data quality and the analyser's observations. */
function pqQualityBlocks(B, rec){
  var q = rec.quality;
  if (q && q.quality_score !== undefined){
    var fixes = Object.keys(q.scale_fixes || {}).map(function(k){ return k + ' ' + q.scale_fixes[k]; });
    var outl = Object.keys(q.outliers_removed || {}).reduce(function(a, k){ return a + (q.outliers_removed[k] || 0); }, 0);
    B.push(blk(bP('Data quality ' + fix(q.quality_score, 0) + ' / 100' + (fixes.length ? '; scale corrections: ' + fixes.join(', ') : '') + (outl ? '; ' + inr(outl) + ' outliers removed' : '') +
      ((q.three_phase_warn || []).length ? '; ' + q.three_phase_warn.join('; ') : '') + '.', { size:9, italic:true })));
  }
  if (rec.observations && rec.observations.length) B.push(blk(bNote('Analyser observations: ' + rec.observations.join(' '))));
}

/* Cost of poor power quality, worked on the analyser's Cost page with the
   tariff figures the engineer typed there. */
function pqCostBlocks(B, rec){
  var c = rec.cost; if (!c || !c.result) return;
  var r = c.result, i = c.inputs || {}, cur = i.currency || '\u20b9';
  var money = function(v){ return (v === null || v === undefined || !isFinite(v)) ? '\u2014' : cur + ' ' + inr(Math.round(v)); };
  B.push(blk(bH(3, 'Cost of poor power quality \u2014 ' + (rec.recId || rec.name))));
  B.push(blk(bKPI([
    ['Annual leakage', money(r.totalLeak)], ['PF penalty', money(r.pfPenalty)], ['Harmonic losses', money(r.harmonicLoss)], ['Saving if PF corrected', money(r.totalPotential)]
  ])));
  B.push(tblBlock(['Item', 'Basis', 'Per year'], [
    ['Energy cost', tfix(r.avgKw, 1) + ' kW avg \u00d7 ' + inr(r.annualHours) + ' h = ' + inr(Math.round(r.annualKwh)) + ' kWh \u00d7 ' + cur + ' ' + i.tariff + '/kWh', money(r.energyCost)],
    ['Demand cost', tfix(r.avgKva, 1) + ' kVA \u00d7 ' + cur + ' ' + i.demandCharge + '/kVA/month \u00d7 12', money(r.demandCost)],
    ['Low power factor penalty', 'PF ' + tfix(r.avgPf, 3) + (r.pfDeficit > 0 ? ' is ' + tfix(r.pfDeficit, 2) + ' below ' + i.pfThreshold + ': ' + tfix(r.pfPenaltyPctTotal, 1) + ' % of the bill' : ' meets the ' + i.pfThreshold + ' threshold'), { v:money(r.pfPenalty), tone:(r.pfPenalty > 0 ? 'bad' : 'ok') }],
    ['Harmonic losses', 'V-THD ' + tfix(r.vthd, 2) + ' % \u2248 ' + tfix(r.harmonicLossPct, 2) + ' % of energy cost (0.5 % per 1 % THD)', { v:money(r.harmonicLoss), tone:(r.harmonicLoss > 0 ? 'watch' : null) }],
    ['kVA reduction if PF raised to ' + tfix(r.targetPf, 2), tfix(r.avgKva, 0) + ' \u2192 ' + tfix(r.newKva, 0) + ' kVA billed', { v:money(r.kvaSavings), tone:'ok' }],
    [{v:'Total recoverable per year',tone:'head'}, {v:'penalty + harmonic losses + demand saving',tone:'head'}, {v:money(r.totalPotential),tone:'head'}]
  ], { colw:['26%','50%','24%'] }));
  B.push(blk(bP('Tariff figures as entered on the analyser: ' + cur + ' ' + i.tariff + '/kWh, ' + cur + ' ' + i.demandCharge + '/kVA/month, ' + i.hoursPerDay + ' h/day, ' + i.daysPerYear + ' days/year, penalty ' + i.pfPenaltyPct + ' % per 0.01 below PF ' + i.pfThreshold + '. Rule-of-thumb figures for scale; the bill analysis chapter carries the tariff-exact working.', { size:9, italic:true })));
}

/* The analyser's charts, as captured on its dashboard, in place of a
   redrawing. `which` is a regex over the chart titles. */
function pqChartBlocks(B, rec, which){
  (rec.charts || []).filter(function(c){ return which.test(c.title); }).forEach(function(c){ B.push(blk(bImg(c, c.title + ' \u2014 ' + (rec.recId || rec.name) + ' (AI-PQA)', 210))); });
}

/* The full recording section a bundle earns under its panel: the measured
   summary the workbook route also prints, then the analyser's findings. */
var _recSummaryBlocksPlain = recSummaryBlocks;
recSummaryBlocks = function(B, rec){
  if (rec.charts && rec.charts.length){
    /* Measured table and observation as before, but the analyser's own
       PF and THD charts rather than PostMan's redrawing of the series. */
    var keep = recCharts; recCharts = function(){ return []; };
    try { _recSummaryBlocksPlain(B, rec); } finally { recCharts = keep; }
    pqChartBlocks(B, rec, /Power Factor|THD/i);
  } else _recSummaryBlocksPlain(B, rec);
  if (!rec.bundle) return;
  if (rec.stats && (rec.stats.vImb !== undefined || rec.stats.iImb !== undefined))
    B.push(blk(bP('Three-phase imbalance over the recording: voltage ' + fix(rec.stats.vImb, 2) + ' %, current ' + fix(rec.stats.iImb, 2) + ' %.', { size:9.5 })));
  pqComplianceBlocks(B, rec);
  pqHealthBlocks(B, rec);
  pqCostBlocks(B, rec);
  pqEventBlocks(B, rec);
  pqQualityBlocks(B, rec);
};

/* Annexure: every dashboard chart the analyser captured, in its order;
   PostMan's own drawings only for a recording that arrived as a workbook. */
var _recChartsPlain = recCharts;
function pqAnnexCharts(B, rec){
  if (rec.charts && rec.charts.length){
    rec.charts.forEach(function(c){ B.push(blk(bImg(c, c.title + ' (AI-PQA)', 210))); });
    if (rec.sentAt) B.push(blk(bP('Charts as captured on the AI-PQA dashboard when the recording was sent to PostMan on ' + rec.sentAt + '.', { size:9, italic:true })));
  } else _recChartsPlain(rec, 'vipfuch').forEach(function(c){ B.push(blk(bChart(c[1]))); });
}

/* The PCC summary and the executive overview get a compliance column. */
function pqScoreOf(panel){
  var recs = recordingsFor(panel).filter(function(r){ return r.compliance && r.compliance.summary; });
  return recs.length ? recs[0].compliance.summary.score : null;
}
