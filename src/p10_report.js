/* ===================================================================
   REPORT RENDERER - blocks, then a real flow engine that packs them
   into pages. Nothing floats; every block declares whether it may be
   split. A block that cannot be split and is taller than the live area
   is reported as a build error rather than silently overflowing.
   =================================================================== */

/* ---- block DOM ---- */
function bH(level, text){
  return tocTag(bHraw(level, text), level, text);
}
function bHraw(level, text){
  var sizes = { 1:18, 2:14, 3:11.5 };
  var n = el('div', 'font-family:' + F.display + ';font-weight:' + (level===1?700:600) +
    ';font-size:' + px(sizes[level]) + ';color:' + (level===1?C.blue:C.navy) +
    ';margin:' + px(level===1?14:11) + ' 0 ' + px(level===1?3:4) +
    ';letter-spacing:-.01em;' + (level===1?'text-transform:uppercase;':''), text);
  if (level === 1){
    var wrap = el('div');
    wrap.appendChild(n);
    wrap.appendChild(el('div','height:' + px(2) + ';background:' + C.blue + ';margin-bottom:' + px(8)));
    wrap.dataset.keep = '1';
    return wrap;
  }
  n.dataset.keep = '1';
  return n;
}
function bP(text, opts){
  opts = opts || {};
  return el('div', 'font-size:' + px(opts.size || 10.5) + ';line-height:1.36;margin:0 0 ' +
    px(6) + ';text-align:justify;color:' + (opts.color || C.charcoal) + ';' +
    (opts.italic ? 'font-style:italic;' : '') + (opts.bold ? 'font-weight:600;' : ''), text);
}
function bUL(items){
  var ul = el('ul','margin:0 0 ' + px(6) + ';padding-left:' + px(14) + ';font-size:' + px(10.5) + ';line-height:1.36;');
  items.forEach(function(t){ ul.appendChild(el('li','margin-bottom:' + px(3), t)); });
  return ul;
}
function bNote(text, tone){
  var color = tone === 'bad' ? C.bad : tone === 'ok' ? C.ok : C.blue;
  var d = el('div','border-left:' + px(2) + ' solid ' + color + ';padding:' + px(4) + ' ' + px(7) +
    ';margin:0 0 ' + px(7) + ';font-size:' + px(9.5) + ';line-height:1.35;color:' + C.charcoal + ';', text);
  return d;
}
function bFormula(lines){
  var d = el('div','font-family:' + F.mono + ';font-size:' + px(9) + ';line-height:1.5;margin:0 0 ' +
    px(7) + ';padding:' + px(5) + ' ' + px(8) + ';background:#F4F7FA;border-radius:' + px(2) + ';');
  lines.forEach(function(l){ d.appendChild(el('div','', l)); });
  return d;
}
/* The size a picture will occupy, worked out from the asset's own pixel
   dimensions rather than from the laid-out element.

   This matters more than it looks. An <img> has no height until the browser
   has decoded it, and the flow engine measures the moment the block is
   appended - so a page full of photographs measured as nearly empty, fitted
   far too much, and clipped the overflow with no warning at all. Reserving
   the box up front makes pagination deterministic and independent of decode
   timing. Images are never scaled up past their own pixels; enlarging a
   small scan only makes it soft. */
function imgBox(asset, maxWpx, maxHpx){
  var w = (asset && asset.w) || 1000, h = (asset && asset.h) || 700;
  var s = Math.min(maxWpx / w, maxHpx / h, 1);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}
function bImg(asset, cap, maxH){
  var d = el('div','margin:0 0 ' + px(8));
  var bx = imgBox(asset, LIVE.w * PT, (maxH || 230) * PT);
  var i = el('img','display:block;width:' + bx.w + 'px;height:' + bx.h +
    'px;margin:0 auto;object-fit:contain;');
  i.width = bx.w; i.height = bx.h;
  i.src = asset.dataUrl; i.alt = cap || 'Figure';
  d.appendChild(i);
  if (cap) d.appendChild(el('div','font-size:' + px(8.5) + ';font-style:italic;color:' + C.ink3 +
    ';text-align:center;margin-top:' + px(3), cap));
  return d;
}
function bKPI(pairs){
  var d = el('div','display:flex;gap:' + px(5) + ';margin:0 0 ' + px(9) + ';flex-wrap:wrap;');
  pairs.forEach(function(p){
    var c = el('div','flex:1 1 ' + px(80) + ';border:' + px(0.75) + ' solid ' + C.rule +
      ';border-radius:' + px(2) + ';padding:' + px(4) + ' ' + px(6) + ';');
    c.appendChild(el('div','font-family:' + F.mono + ';font-size:' + px(6.2) +
      ';text-transform:uppercase;letter-spacing:.06em;color:' + C.ink3 + ';margin-bottom:' + px(1), p[0]));
    c.appendChild(el('div','font-size:' + px(11) + ';font-weight:600;color:' + C.navy +
      ';font-variant-numeric:tabular-nums;', p[1]));
    d.appendChild(c);
  });
  return d;
}
/* rows may carry {v, tone} cells; tone paints the semantic colour */
function bTable(head, rows, opts){
  opts = opts || {};
  var wrap = el('div','margin:0 0 ' + px(8));
  if (opts.title) wrap.appendChild(el('div','font-family:' + F.display + ';font-weight:600;font-size:' +
    px(10) + ';margin:0 0 ' + px(3) + ';color:' + C.navy, opts.title));
  var t = el('table','border-collapse:collapse;width:100%;font-size:' + px(opts.size || 9) +
    ';font-variant-numeric:tabular-nums;table-layout:fixed;');
  if (head && head.length){
    var thead = el('thead'), tr = el('tr');
    head.forEach(function(h, i){
      var th = el('th','border:' + px(0.6) + ' solid ' + C.rule + ';background:' + C.tint +
        ';padding:' + px(3) + ' ' + px(4) + ';text-align:left;font-size:' + px(8.2) +
        ';text-transform:uppercase;letter-spacing:.04em;font-weight:600;word-wrap:break-word;' +
        (opts.colw && opts.colw[i] ? 'width:' + opts.colw[i] + ';' : ''), h);
      tr.appendChild(th);
    });
    thead.appendChild(tr); t.appendChild(thead);
  }
  var tb = el('tbody');
  rows.forEach(function(r){
    var tr = el('tr');
    r.forEach(function(cell){
      var v = (cell && typeof cell === 'object' && 'v' in cell) ? cell.v : cell;
      var tone = (cell && typeof cell === 'object') ? cell.tone : null;
      var span = (cell && typeof cell === 'object') ? cell.span : null;
      var td = el('td','border:' + px(0.6) + ' solid ' + C.rule + ';padding:' + px(3) + ' ' + px(4) +
        ';word-wrap:break-word;vertical-align:top;' +
        (tone === 'bad' ? 'color:' + C.bad + ';font-weight:600;' :
         tone === 'ok'  ? 'color:' + C.ok + ';' :
         tone === 'watch' ? 'color:' + C.watch + ';' :
         tone === 'head' ? 'background:' + C.tint + ';font-weight:600;' : ''), String(v));
      if (span) td.colSpan = span;
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  t.appendChild(tb); wrap.appendChild(t);
  if (opts.caption) wrap.appendChild(el('div','font-size:' + px(8.5) + ';font-style:italic;color:' +
    C.ink3 + ';margin-top:' + px(2), opts.caption));
  wrap.dataset.table = '1';
  return wrap;
}
function bChart(svg, cap){
  var d = el('div','margin:0 0 ' + px(9) + ';width:100%;');
  var holder = el('div','width:100%;');
  holder.appendChild(svg);
  d.appendChild(holder);
  if (cap) d.appendChild(el('div','font-size:' + px(8.5) + ';font-style:italic;color:' + C.ink3 +
    ';text-align:center;margin-top:' + px(2), cap));
  return d;
}

/* A block is {node, split:false} or a splittable table descriptor. */
function blk(node, splittable){ return { node:node, split:!!splittable }; }
function tblBlock(head, rows, opts){
  opts = opts || {};
  /* A chapter can now print on the strength of its recommendations alone,
     before any readings have been keyed. Its data tables then have headers
     and no rows, and a header with nothing under it is not a table - it is
     a stray line of column names. So an empty table prints as nothing. */
  if (!rows || !rows.length) return { node:el('div'), split:false };
  return { node:bTable(head, rows, opts), split:true, head:head, rows:rows, opts:opts };
}

/* ===================================================================
   THE REPORT - one builder per section, in registry order.
   =================================================================== */
function buildReport(){
  var B = [];
  /* Heading ids restart with every build so they are identical across the
     contents-page passes - that stability is what makes the page numbers
     found in one pass valid in the next. */
  tocReset();
  B.push({ anchor:'start' });
  var t = rollUp(S.ledger);
  var co = S.company.name || '__________';

  /* --- Report control --- */
  B.push(blk(bH(1,'Report control')));
  B.push(tblBlock(null, [
    [{v:'Report No', tone:'head'}, reportNumber(S.meta.financialYear, S.meta.serial) + ' ' + (S.meta.revision||'')],
    [{v:'Report Date', tone:'head'}, longDate(S.meta.reportDate)],
    [{v:'Client', tone:'head'}, co],
    [{v:'Financial Year', tone:'head'}, S.meta.financialYear],
    [{v:'Assessment dates', tone:'head'},
      (S.meta.assessFrom ? longDate(S.meta.assessFrom) : '—') + ' to ' + (S.meta.assessTo ? longDate(S.meta.assessTo) : '—')],
    [{v:'Prepared by', tone:'head'}, S.meta.preparedBy || '—'],
    [{v:'File name', tone:'head'}, reportFilename(S.meta.financialYear, S.meta.serial, co, S.meta.reportDate)]
  ], { colw:['32%','68%'] }));
  B.push(tblBlock(['IITGN energy assessment team','Contact'],
    S.team.iea.map(function(r){ return [r.name, r.role]; }), { colw:['42%','58%'] }));
  B.push({ anchor:'control' });
  /* The contents list is built here, but only once the page numbers exist. */
  B.push({ node:el('div'), split:false, tocAnchor:true });

  /* --- Acknowledgement / preface / disclaimer --- */
  B.push(blk(bH(1,'Acknowledgement')));
  DEFAULTS.acknowledgement.forEach(function(p){ B.push(blk(bP(fillTemplate(p)))); });
  B.push(blk(bP('Energy Assessor', { bold:true })));
  B.push(blk(bP('IEA – IIT Gandhinagar')));

  B.push(blk(bH(1,'Preface')));
  DEFAULTS.preface.forEach(function(p, i){ B.push(blk(bP(p, i===0 ? { bold:true } : null))); });

  B.push(blk(bH(1,'Disclaimer')));
  B.push(blk(bP(DEFAULTS.disclaimerIntro)));
  B.push(blk(bUL(DEFAULTS.disclaimerBullets)));
  B.push(blk(bP('Recommendations:', { bold:true })));
  B.push(blk(bP(DEFAULTS.disclaimerReco)));
  B.push({ anchor:'front' });

  /* --- Certificate: every figure from the ledger --- */
  B.push(blk(bH(1,'Certificate of energy assessment')));
  B.push(blk(bP(fillTemplate(DEFAULTS.certificate))));
  B.push(blk(bP(certificateSentence(t))));
  B.push(blk(bP(S.meta.preparedBy || 'Rahul Jayantibhai Patel', { bold:true })));
  B.push(blk(bP('CEA-30215, Lead GHG Verifier · Project Manager II', { size:9.5 })));
  B.push(blk(bP('Industrial Energy Assessment Team – IIT Gandhinagar', { size:9.5 })));
  B.push({ anchor:'certificate' });

  /* --- Team --- */
  B.push(blk(bH(1,'Details of energy assessment team')));
  B.push(blk(bP('The following team was involved in the audit process for carrying out measurements, collection of data, and field study.')));
  B.push(blk(bP('Plant team:', { bold:true })));
  B.push(tblBlock(['Sr No','Name','Designation'],
    (S.team.plant.length ? S.team.plant : [{sr:'',name:'—',role:''}]).map(function(r){
      return [r.sr, r.name, r.role]; }), { colw:['12%','40%','48%'] }));
  B.push(blk(bP('IEAC team – IIT Gandhinagar', { bold:true })));
  B.push(tblBlock(['Sr No','Name','Designation'],
    S.team.iea.map(function(r){ return [r.sr, r.name, r.role]; }), { colw:['12%','40%','48%'] }));
  B.push({ anchor:'team' });

  /* --- Executive summary --- */
  B.push(blk(bH(1,'Executive summary')));
  B.push(blk(bKPI([
    ['Electrical savings', inr(Math.round(t.elecKwh)) + ' kWh'],
    ['Thermal savings', inr(Math.round(t.thermalQty)) + ' ' + (S.baseline.thermalUnit||'')],
    ['Emissions', fix(t.co2) + ' tCO₂e'],
    ['Monetary', rupees(t.moneyTotal)],
    ['Investment', rupees(t.investment)],
    ['Payback', months(t.roi)]
  ])));
  B.push(blk(bP(certificateSentence(t))));
  B.push(blk(bP('All the recommendations are described in detail in the respective sections of this report. The annual cost savings and implementation costs represent our best estimates. The IITGN team welcomes inquiries and further discussion on any information or data contained in this report.')));

  B.push(blk(bH(2,'Observations and recommendations')));
  if (S.ledger.length){
    var recRows = [];
    var byModule = {};
    S.ledger.forEach(function(r){ (byModule[r.module] = byModule[r.module] || []).push(r); });
    var idx = 0;
    Object.keys(byModule).forEach(function(m){
      recRows.push([{ v:(MODULE_NAMES[m]||m).toUpperCase(), tone:'head', span:10 }]);
      byModule[m].forEach(function(r){
        idx++;
        var b = (r.electrical || (r.thermal && r.thermal.length)) ? syncRecoTotals(r) : null;
        var ps = pctSaving(r), roi = roiMonths(r);
        /* A recommendation that saves both electricity and fuel lists each
           quantity in its own unit rather than adding kWh to kg. */
        var savingCell = inr(num(r.saving)), unitCell = r.unit || '';
        if (b && b.electrical && b.thermal.length){
          var parts = [inr(Math.round(b.annualKwh)) + ' kWh'];
          Object.keys(b.thermalTotals).forEach(function(u){ parts.push(inr(Math.round(b.thermalTotals[u])) + ' ' + u); });
          savingCell = parts.join(' + '); unitCell = 'per year';
        }
        recRows.push([ idx, (r.title ? r.title + ' — ' : '') + (r.observation || '—'), r.recommendation || '—',
          inr(num(r.consumption)), unitCell, savingCell,
          ps === null ? '—' : fix(ps,1), rupees(num(r.monetary)),
          rupees(num(r.investment)), months(roi) ]);
      });
    });
    B.push(tblBlock(['Sr','Observation','Recommendation','Annual consumption','Unit',
      'Annual saving','% saving','Monetary saving','Investment','ROI months'],
      recRows, { size:7.6, colw:['4%','20%','22%','9%','6%','8%','6%','9%','8%','8%'] }));
  } else {
    B.push(blk(bNote('No recommendations recorded yet. Add them in the ledger and this table, the executive summary and the certificate all fill themselves.')));
  }

  B.push({ anchor:'summary' });

  /* --- Production --- */
  B.push(blk(bH(1,'Production process and description')));
  B.push(blk(bH(2,'Plant introduction')));
  (S.production.intro || '').split(/\n+/).filter(Boolean).forEach(function(p){ B.push(blk(bP(p))); });
  if (S.production.products.length){
    B.push(blk(bP('Products:', { bold:true })));
    B.push(tblBlock(['Sr. No.','Product','CAS / grade','Status'],
      S.production.products.map(function(r){ return [r.sr, r.product, r.cas, r.status]; }),
      { colw:['10%','40%','25%','25%'] }));
  }
  var loc = [];
  if (S.production.website) loc.push(['Website', S.production.website]);
  if (S.production.phone) loc.push(['Contact number', S.production.phone]);
  if (S.production.mail) loc.push(['Mail ID', S.production.mail]);
  if (S.production.factoryAddress) loc.push(['Factory address', S.production.factoryAddress]);
  if (loc.length){
    B.push(blk(bP('Plant location:', { bold:true })));
    B.push(tblBlock(null, loc.map(function(p){ return [{v:p[0],tone:'head'}, p[1]]; }), { colw:['28%','72%'] }));
  }
  if (S.assets.processFlow){
    B.push(blk(bH(2,'Process flow diagram and technology intervention')));
    B.push(blk(bImg(S.assets.processFlow, S.production.flowNote || 'Process flow diagram', 260)));
  }

  B.push({ anchor:'production' });

  /* --- Baseline, water and GHG - all from the one set of monthly figures --- */
  buildBaselineSection(B);
  buildWaterSection(B);
  buildGhgSection(B);

  /* --- Bills --- */
  buildBillSection(B);

  B.push({ anchor:'bills' });

  /* --- Distribution --- */
  buildDistSection(B);

  B.push({ anchor:'dist' });

  /* --- PQ & transformer --- */
  buildTransformerSection(B);

  B.push({ anchor:'tr' });

  /* --- Utility modules --- */
  buildUtilities(B);

  B.push({ anchor:'utilities' });

  /* --- Instruments --- */
  var used = S.instruments.filter(function(r){ return r.used; });
  if (used.length){
    B.push(blk(bH(1,'Instruments')));
    B.push(blk(bP('The following instruments were used to carry out this assessment.')));
    B.push(tblBlock(['S.N.','Instrument','Make','Model','Qty'],
      used.map(function(r,i){ return [i+1, r.name, r.make, r.model, r.qty]; }),
      { colw:['8%','44%','18%','20%','10%'] }));
  }
  B.push({ anchor:'end' });
  /* Measurement charts for every PQ recording, after everything else. */
  buildPqAnnexure(B);
  return B;
}

function certificateSentence(t){
  var elecMoney = t.money.electrical, thermMoney = t.money.thermal;
  var billElec = S.bills.reduce(function(a,r){ return a + (num(r.net)||0); },0);
  var pe = billElec > 0 ? (elecMoney / billElec) * 100 : null;
  return 'An overall summary of the energy assessment observations and recommendations described in this report is listed in the table on the following pages. ' +
    'The estimated total value of energy savings on an annualised basis in electrical energy is ' + rupees(elecMoney) +
    (pe === null ? '' : ', which amounts to ' + fix(pe,1) + ' % of the current electricity bill') +
    ', and in thermal energy ' + rupees(thermMoney) + '. ' +
    'Towards achieving these savings the estimated investment is ' + rupees(t.investment) +
    ', giving an overall return on investment in ' + months(t.roi) + '. ' +
    'This also results in ' + fix(t.co2) + ' tonnes of CO₂ emission reduction.';
}
