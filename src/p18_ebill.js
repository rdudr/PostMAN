/* ===================================================================
   ELECTRICITY BILL ANALYSIS
   Built from the team's own workbook ("EB Bill & Base", sheet "Report
   Formet"). The rule there is simple and is kept here exactly: a YELLOW
   cell is something read off the bill; everything else is a formula or a
   tariff default. So the reader and the form ask for the yellow cells and
   nothing more, and every other column is computed in billCalc().

   Read off each bill (yellow)      Tariff header (yellow)
     month                            source of power (DISCOM)
     total units consumed  kWh        consumer number
     total bill amount     Rs         contract demand  kVA
     power factor                     tariff category
     actual maximum demand kVA
     energy charge rate    Rs/kWh   Defaults, editable once per report
     FPPA rate             Rs/kWh     minimum billing demand  85 % of CD
     night units           kWh        demand slab  Rs 150 first 500 kVA,
     TOU units             kWh                     Rs 260 above
                                      night rebate rate  0
   Formulas                           EHV rebate      1 % of energy charge
     rate            = bill / units   TOU rate        Rs 0.85 per TOU kWh
     billing demand  = max(actual MD, 85% of CD)      duty  15 %
     demand charge   = 150 x 500 + (billing demand - 500) x 260
     energy charge   = energy rate x units
     fuel surcharge  = FPPA rate x units
     PF adjustment   = energy charge x (-(PF - 0.95) x 0.5)   above 0.95
                     = 0                                     0.90 - 0.95
                     = energy charge x (0.90 - PF) x 1        below 0.90
     night rebate    = -(night rate x night units)
     EHV charges     = -(EHV % x energy charge)
     TOU charges     = TOU rate x TOU units
     total consumption charge = demand + energy + fuel + PF adj + night + TOU + EHV
     electricity duty = duty % x total consumption charge
     total bill      = total consumption charge + duty
     difference      = bill amount read off the bill - total bill computed
   The difference column is the check: when it is not near zero either a
   figure was misread or the tariff default does not apply to this plant.
   =================================================================== */

function blankBillCfg(){
  return {
    discom:'', consumerNo:'', contractDemand:null, tariff:'HTP-1',
    minBillingPct:0.85, slabKva:500, slab1Rate:150, slab2Rate:260,
    nightRebateRate:0, ehvPct:0.01, touRate:0.85, dutyRate:0.15,
    pfTarget:0.999, proposedCD:null
  };
}
function billCfg(){
  if (!S.billCfg) S.billCfg = blankBillCfg();
  var d = blankBillCfg();
  Object.keys(d).forEach(function(k){ if (S.billCfg[k] === undefined) S.billCfg[k] = d[k]; });
  /* Contract demand lives on the tariff header; a bill that carries one and
     a header that does not fills the header from the bill. */
  if (num(S.billCfg.contractDemand) === null){
    for (var i = 0; i < S.bills.length; i++){ if (num(S.bills[i].contract) !== null){ S.billCfg.contractDemand = num(S.bills[i].contract); break; } }
  }
  return S.billCfg;
}

function demandChargeOf(kva, cfg){
  if (kva === null) return null;
  var first = Math.min(kva, cfg.slabKva) * cfg.slab1Rate;
  var rest = Math.max(0, kva - cfg.slabKva) * cfg.slab2Rate;
  return first + rest;
}
function pfPctOf(pf){
  if (pf === null) return null;
  if (pf > 0.95) return -(pf - 0.95) * 0.5;
  if (pf >= 0.90) return 0;
  if (pf >= 0.85) return (0.90 - pf) * 1;
  return 0.05 + (0.85 - pf) * 2;
}

/* A bill that carries its charges but not its rates gives the rates away:
   rate = charge / units. Filled in once, kept, and marked as derived so the
   reader knows it was not printed on the bill. */
function deriveBillRates(r){
  var kwh = num(r.kwh);
  if (!kwh) return;
  if (num(r.energyRate) === null && num(r.energyCharge) !== null){ r.energyRate = +(num(r.energyCharge) / kwh).toFixed(2); r.energyRateDerived = true; }
  if (num(r.fppaRate) === null && num(r.fuelSurcharge) !== null){ r.fppaRate = +(num(r.fuelSurcharge) / kwh).toFixed(2); r.fppaRateDerived = true; }
}

function billCalc(){
  var cfg = billCfg();
  var cd = num(cfg.contractDemand);
  var minBD = cd === null ? null : cd * (num(cfg.minBillingPct) || 0.85);
  var rows = S.bills.map(function(r){
    deriveBillRates(r);
    var kwh = num(r.kwh), bill = num(r.net), pf = num(r.pf), md = num(r.actualMD);
    var eRate = num(r.energyRate), fRate = num(r.fppaRate), night = num(r.todNight), tou = num(r.todPeak);
    var billingDemand = (md === null && minBD === null) ? null : Math.max(md || 0, minBD || 0);
    var demandCharge = demandChargeOf(billingDemand, cfg);
    var energyCharge = (kwh !== null && eRate !== null) ? eRate * kwh : null;
    var fuelSurcharge = (kwh !== null && fRate !== null) ? fRate * kwh : null;
    var pfPct = pfPctOf(pf);
    var pfAdj = (pfPct !== null && energyCharge !== null) ? pfPct * energyCharge : null;
    var nightPct = (kwh && night !== null) ? night / kwh : null;
    var nightRebate = night === null ? null : -(num(cfg.nightRebateRate) || 0) * night;
    var ehvCharges = energyCharge === null ? null : -(num(cfg.ehvPct) || 0) * energyCharge;
    var touPct = (kwh && tou !== null) ? tou / kwh : null;
    var touCharges = tou === null ? null : (num(cfg.touRate) || 0) * tou;
    var parts = [demandCharge, energyCharge, fuelSurcharge, pfAdj, nightRebate, touCharges, ehvCharges];
    var totalCons = parts.some(function(v){ return v !== null; }) ? parts.reduce(function(a, v){ return a + (v || 0); }, 0) : null;
    var duty = totalCons === null ? null : (num(cfg.dutyRate) || 0) * totalCons;
    var totalBill = totalCons === null ? null : totalCons + duty;
    var diff = (bill !== null && totalBill !== null) ? bill - totalBill : null;
    return {
      month:r.month, kwh:kwh, bill:bill, rate:(kwh && bill !== null) ? bill / kwh : null,
      pf:pf, md:md, billingDemand:billingDemand, demandCharge:demandCharge,
      eRate:eRate, energyCharge:energyCharge, fRate:fRate, fuelSurcharge:fuelSurcharge,
      pfPct:pfPct, pfAdj:pfAdj, night:night, nightPct:nightPct, nightRate:num(cfg.nightRebateRate) || 0, nightRebate:nightRebate,
      ehvEnergy:energyCharge, ehvPct:num(cfg.ehvPct) || 0, ehvCharges:ehvCharges,
      tou:tou, touPct:touPct, touRate:num(cfg.touRate) || 0, touCharges:touCharges,
      totalCons:totalCons, dutyRate:num(cfg.dutyRate) || 0, duty:duty, totalBill:totalBill, diff:diff,
      kvah:num(r.kvah), hasData: kwh !== null
    };
  });
  var live = rows.filter(function(r){ return r.hasData; });
  var n = live.length;
  var keys = ['kwh','bill','rate','pf','md','billingDemand','demandCharge','eRate','energyCharge','fRate','fuelSurcharge','pfPct','pfAdj','night','nightPct','nightRate','nightRebate','ehvEnergy','ehvPct','ehvCharges','tou','touPct','touRate','touCharges','totalCons','dutyRate','duty','totalBill','diff'];
  var sum = {}, avg = {};
  keys.forEach(function(k){
    var vals = live.map(function(r){ return r[k]; }).filter(function(v){ return v !== null && v !== undefined; });
    sum[k] = vals.length ? vals.reduce(function(a, b){ return a + b; }, 0) : null;
    avg[k] = vals.length ? sum[k] / vals.length : null;
  });
  var pfs = live.map(function(r){ return r.pf; }).filter(function(v){ return v !== null; });
  var mds = live.map(function(r){ return r.md; }).filter(function(v){ return v !== null; });
  var avgKwh = avg.kwh || 0, avgMD = avg.md, avgPF = avg.pf;
  return {
    cfg:cfg, cd:cd, minBD:minBD, rows:rows, live:live, months:n, sum:sum, avg:avg,
    maxMD: mds.length ? Math.max.apply(null, mds) : null, minPF: pfs.length ? Math.min.apply(null, pfs) : null,
    loadFactor: (avgMD && avgPF) ? avgKwh / (avgMD * avgPF * 24 * 30) : null,
    utilityFactor: (cd && avgPF) ? avgKwh / (cd * avgPF * 24 * 30) : null,
    demandFactor: (cd && avgMD) ? avgMD / cd : null,
    blended: sum.kwh ? (sum.bill || 0) / sum.kwh : null,
    nightShare: sum.kwh && sum.night !== null ? (sum.night / sum.kwh) * 100 : null,
    touShare: sum.kwh && sum.tou !== null ? (sum.tou / sum.kwh) * 100 : null,
    note: n ? '*Based on ' + n + ' month' + (n === 1 ? '' : 's') + ' of bills provided by company' : ''
  };
}

/* Older readers of the bills - the cost register, the charts in the
   section, the jet module - get the same figures through the old name. */
function billDerived(){
  var c = billCalc();
  return { rows:S.bills.filter(function(r){ return num(r.kwh); }), avgKwh:c.avg.kwh || 0, avgMD:c.avg.md, avgPF:c.avg.pf,
           cd:c.cd, maxMD:c.maxMD, loadFactor:c.loadFactor, utilityFactor:c.utilityFactor, demandFactor:c.demandFactor,
           blended:c.blended, nightShare:c.nightShare, calc:c };
}

/* ---- PF and demand proposals, as the "PF & Demand" and "Suggestion
   Demand" sheets do them ---- */
function pfProposal(c){
  var target = num(c.cfg.pfTarget) || 0.999, tPct = pfPctOf(target);
  var rows = c.live.map(function(r){
    var present = r.pfAdj || 0, proposed = r.energyCharge === null ? null : tPct * r.energyCharge;
    return { month:r.month, energyCharge:r.energyCharge, pf:r.pf, pfPct:r.pfPct, present:present,
             target:target, tPct:tPct, proposed:proposed, saving: proposed === null ? null : present - proposed };
  });
  var t = { energyCharge:0, present:0, proposed:0, saving:0 };
  rows.forEach(function(r){ t.energyCharge += r.energyCharge || 0; t.present += r.present; t.proposed += r.proposed || 0; t.saving += r.saving || 0; });
  return { rows:rows, total:t, below:c.live.filter(function(r){ return r.pf !== null && r.pf < 0.95; }).length };
}
function cdProposal(c){
  var cfg = c.cfg, present = c.cd;
  if (present === null || c.maxMD === null) return null;
  var proposed = num(cfg.proposedCD);
  if (proposed === null){
    /* Lowest contract demand, in 50 kVA steps, that still clears the highest
       month recorded - a demand violation costs far more than it would save. */
    proposed = Math.ceil(c.maxMD / 50) * 50;
    if (proposed >= present) return null;
  }
  var pct = num(cfg.minBillingPct) || 0.85;
  var rows = c.live.map(function(r){
    var pb = r.billingDemand, pc = demandChargeOf(pb, cfg);
    var qb = Math.max(r.md || 0, proposed * pct), qc = demandChargeOf(qb, cfg);
    return { month:r.month, md:r.md, presentBD:pb, presentCharge:pc, proposedBD:qb, proposedCharge:qc, saving:(pc || 0) - (qc || 0) };
  });
  var t = { presentCharge:0, proposedCharge:0, saving:0 };
  rows.forEach(function(r){ t.presentCharge += r.presentCharge || 0; t.proposedCharge += r.proposedCharge || 0; t.saving += r.saving; });
  return { present:present, proposed:proposed, minBD:proposed * pct, rows:rows, total:t, headroom:proposed - c.maxMD };
}

/* ------------------------------------------------------------------
   THE FORM - yellow cells asked for, the rest shown as it computes.
   ------------------------------------------------------------------ */
var Y_HINT = 'Read off the bill.';
FORMS.bills = function(w){
  var cfg = billCfg();
  var c0 = billCalc();

  var c1 = card('Tariff header - read off any one bill',
    'The four things printed once at the top of every bill. Contract demand fixes the 85 % minimum billing demand for every month.');
  c1.appendChild(gridOf([
    fText(cfg,'discom','Source of power','MGVCL / DGVCL / UGVCL / Torrent', Y_HINT),
    fText(cfg,'consumerNo','Consumer number','14004', Y_HINT),
    fNum(cfg,'contractDemand','Contract demand kVA','800', Y_HINT + ' Minimum billing demand = ' + inr(c0.minBD === null ? null : Math.round(c0.minBD)) + ' kVA.'),
    fText(cfg,'tariff','Tariff category','HTP-1', Y_HINT)
  ], true));
  w.appendChild(c1);

  var c2 = card('Tariff defaults - change only if this plant’s tariff differs',
    'These are the standard GERC HT figures the workbook applies. The Difference column below is the check: if it drifts from zero, one of these does not apply here.');
  c2.appendChild(gridOf([
    fNum(cfg,'minBillingPct','Minimum billing demand, fraction of CD','0.85'),
    fNum(cfg,'slabKva','Demand slab boundary kVA','500'),
    fNum(cfg,'slab1Rate','Demand rate up to slab, Rs/kVA','150'),
    fNum(cfg,'slab2Rate','Demand rate above slab, Rs/kVA','260'),
    fNum(cfg,'touRate','TOU rate Rs/kWh','0.85'),
    fNum(cfg,'nightRebateRate','Night rebate rate Rs/kWh','0'),
    fNum(cfg,'ehvPct','EHV rebate, fraction of energy charge','0.01', '0 if not an EHV consumer.'),
    fNum(cfg,'dutyRate','Electricity duty, fraction','0.15'),
    fNum(cfg,'pfTarget','Target power factor for the PF proposal','0.999'),
    fNum(cfg,'proposedCD','Proposed contract demand kVA','', 'Blank picks the lowest 50 kVA step above the highest month recorded.')
  ], true));
  w.appendChild(c2);

  var c3 = card('Monthly bills - the yellow cells',
    'Nine figures per month, read from the bill or by the bill reader. Everything to the right is computed live. Use "Bill capture & verify" to read PDFs; rates not printed on a bill are derived from its charges.');
  var bar = el('div','display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;');
  bar.appendChild(btn('Create 12 months from FY ' + S.meta.financialYear, function(){
    S.bills = fyMonthKeys(S.meta.financialYear).map(function(p){
      return { month:monthLabelOf(p.y, p.m), kwh:null, net:null, pf:null, actualMD:null, energyRate:null, fppaRate:null, todNight:null, todPeak:null, contract:num(cfg.contractDemand) };
    });
    save(); renderAll();
  }));
  bar.appendChild(btn('+ Add a month', function(){
    var last = S.bills[S.bills.length - 1], p = last ? parseMonthLabel(last.month) : null;
    var y = p ? (p.m === 12 ? p.y + 1 : p.y) : new Date().getFullYear(), m = p ? (p.m % 12) + 1 : 4;
    S.bills.push({ month:monthLabelOf(y, m), kwh:null, net:null, pf:null, actualMD:null, energyRate:null, fppaRate:null, todNight:null, todPeak:null });
    save(); renderAll();
  }));
  bar.appendChild(btn('Derive missing rates from bill charges', function(){
    var n = 0; S.bills.forEach(function(r){ var before = (r.energyRate == null) + (r.fppaRate == null); deriveBillRates(r); n += before - ((r.energyRate == null) + (r.fppaRate == null)); });
    save(); renderAll(); alert(n + ' rate(s) derived from energy charge or fuel surcharge divided by units.');
  }));
  c3.appendChild(bar);

  var calcCells = {};
  var refresh = function(){
    var c = billCalc();
    c.rows.forEach(function(r, i){
      var k = calcCells[i]; if (!k) return;
      k.rate.textContent = r.rate === null ? '—' : fix(r.rate, 2);
      k.bd.textContent = r.billingDemand === null ? '—' : inr(Math.round(r.billingDemand));
      k.dc.textContent = inr(r.demandCharge);
      k.ec.textContent = inr(r.energyCharge);
      k.fs.textContent = inr(r.fuelSurcharge);
      k.pfa.textContent = inr(r.pfAdj);
      k.tou.textContent = inr(r.touCharges);
      k.tb.textContent = inr(r.totalBill);
      k.diff.textContent = r.diff === null ? '—' : inr(Math.round(r.diff));
      k.diff.style.color = r.diff !== null && Math.abs(r.diff) > Math.max(500, (r.bill || 0) * 0.01) ? 'var(--bad)' : 'var(--ok)';
    });
  };
  var inCell = function(r, key){
    var i = el('input'); i.type = 'number'; i.step = 'any'; i.value = r[key] == null ? '' : r[key];
    i.style.background = 'var(--warn-soft)';
    i.addEventListener('input', function(){
      r[key] = i.value === '' ? null : num(i.value);
      if (key === 'energyRate') r.energyRateDerived = false;
      if (key === 'fppaRate') r.fppaRateDerived = false;
      save(); refresh(); drawPreview();
    });
    return i;
  };
  var head = ['Month','Units kWh','Bill amount Rs','PF','Actual MD kVA','Energy rate Rs/kWh','FPPA rate Rs/kWh','Night units','TOU units',
              'Rate Rs/kWh','Billing demand','Demand charge','Energy charge','Fuel surcharge','PF adj','TOU charges','Total bill (calc)','Difference',''];
  var tw = el('div'); tw.className = 'tblwrap';
  var t = el('table'); t.className = 'ed';
  var thead = el('thead'), htr = el('tr');
  head.forEach(function(h, i){ var th = el('th','', h); if (i > 0 && i < 9) th.style.background = 'var(--warn-soft)'; htr.appendChild(th); });
  thead.appendChild(htr); t.appendChild(thead);
  var tb = el('tbody');
  S.bills.forEach(function(r, i){
    var tr = el('tr'), k = calcCells[i] = {};
    var add = function(node, calc){ var td = el('td'); if (calc){ td.className = 'calc'; } if (typeof node === 'string'){ var s = el('span','', node); td.appendChild(s); tr.appendChild(td); return s; } td.appendChild(node); tr.appendChild(td); return node; };
    add(monthLabelPicker(r, 'month', function(){ refresh(); drawPreview(); }));
    add(inCell(r,'kwh')); add(inCell(r,'net')); add(inCell(r,'pf')); add(inCell(r,'actualMD'));
    var er = add(inCell(r,'energyRate')); if (r.energyRateDerived) er.title = 'Derived: energy charge ÷ units';
    var fr = add(inCell(r,'fppaRate')); if (r.fppaRateDerived) fr.title = 'Derived: fuel surcharge ÷ units';
    add(inCell(r,'todNight')); add(inCell(r,'todPeak'));
    k.rate = add('', true); k.bd = add('', true); k.dc = add('', true); k.ec = add('', true); k.fs = add('', true);
    k.pfa = add('', true); k.tou = add('', true); k.tb = add('', true); k.diff = add('', true);
    var del = el('td'); del.className = 'act';
    var b = el('button','', '×'); b.className = 'rowdel'; b.type = 'button'; b.title = 'Delete month';
    b.onclick = function(){ S.bills.splice(i, 1); save(); renderAll(); };
    del.appendChild(b); tr.appendChild(del);
    tb.appendChild(tr);
  });
  t.appendChild(tb); tw.appendChild(t); c3.appendChild(tw);
  refresh();
  c3.appendChild(el('p','', 'Yellow columns are the inputs. Difference = bill amount read off the bill minus the total bill computed from the tariff; green means the bill reconciles, red means a figure is misread or a default does not apply.')).className = 'callout info';
  w.appendChild(c3);

  var c4 = card('Derived from the bills', 'Load factor, plant utility factor and demand factor as the sample reports state them.');
  var k = el('div'); k.className = 'kpis';
  [['Avg units/month', inr(Math.round(c0.avg.kwh || 0))], ['Avg actual MD', fix(c0.avg.md) + ' kVA'], ['Highest MD', fix(c0.maxMD, 0) + ' kVA'],
   ['Avg PF', fix(c0.avg.pf, 3)], ['Load factor', fix(c0.loadFactor, 3)], ['Plant utility factor', fix(c0.utilityFactor, 3)],
   ['Demand factor', fix(c0.demandFactor, 3)], ['Blended rate', c0.blended === null ? '—' : '₹ ' + fix(c0.blended, 2) + '/kWh'],
   ['Night share', pct(c0.nightShare)], ['TOU share', pct(c0.touShare)]].forEach(function(p){
    var x = el('div'); x.className = 'kpi';
    x.appendChild(el('span','', p[0])).className = 'k';
    x.appendChild(el('span','', p[1])).className = 'v';
    k.appendChild(x);
  });
  c4.appendChild(k);
  c4.appendChild(fArea(S.billNotes,'pfNote','Power factor observation'));
  c4.appendChild(fArea(S.billNotes,'cdNote','Contract demand observation'));
  w.appendChild(c4);
};

/* ------------------------------------------------------------------
   THE PRINT
   ------------------------------------------------------------------ */
/* A table too wide for the column, turned on its side.

   The table is laid out at the full height of the live area as its width,
   then rotated a quarter turn anticlockwise, so the reader turns the page
   clockwise - to the right - to read it, the way a landscape sheet is
   bound into a portrait report. It is measured before rotating, because a
   rotated element's box is still its unrotated box as far as layout is
   concerned, and the flow engine would otherwise place it by the wrong
   dimension. */
function bRotated(node){
  var host = q('measure');
  /* Two pixels under the live height, so rounding can never tip the block
     into 'too tall for a page' on a page it fills exactly. */
  var wPx = Math.floor(LIVE.h * PT) - 2;
  node.style.width = wPx + 'px';
  var hPx = 0;
  if (host){ host.appendChild(node); hPx = node.offsetHeight; host.removeChild(node); }
  hPx = Math.min(hPx || 200, LIVE.w * PT);
  var wrap = el('div','position:relative;width:' + hPx + 'px;height:' + wPx + 'px;margin:0 auto;overflow:hidden;');
  node.style.position = 'absolute'; node.style.left = '0'; node.style.top = '0';
  node.style.transformOrigin = 'top left';
  node.style.transform = 'translate(0px,' + wPx + 'px) rotate(-90deg)';
  wrap.appendChild(node);
  wrap.dataset.keep = '1';
  return wrap;
}
function rotatedTable(title, groupRow, head, rows, size, colw){
  var box = el('div');
  box.appendChild(el('div','font-family:' + F.display + ';font-weight:600;font-size:' + px(10) + ';margin:0 0 ' + px(4) + ';color:' + C.navy, title));
  var body = groupRow ? [groupRow].concat(rows) : rows;
  box.appendChild(bTable(head, body, { size:size || 7.4, colw:colw }));
  return bRotated(box);
}
var H_ = function(v){ return { v:v, tone:'head' }; };

function buildBillSection(B){
  var c = billCalc();
  if (!c.months) return;
  var cfg = c.cfg;
  var n2 = function(v){ return v === null || v === undefined ? '—' : inr(Math.round(v)); };
  var r2 = function(v){ return v === null || v === undefined ? '—' : fix(v, 2); };
  var r3 = function(v){ return v === null || v === undefined ? '—' : fix(v, 3); };
  var p1 = function(v){ return v === null || v === undefined ? '—' : fix(v * 100, 2) + ' %'; };

  B.push(blk(bH(1,'Electricity bill analysis')));
  B.push(blk(bH(2,'Plant electricity bill analysis')));
  B.push(blk(bP('Electricity consumption and bills - ' + (S.company.name || '').toUpperCase(), { bold:true })));
  B.push(tblBlock(null, [
    [H_('Source of power'), cfg.discom || '—', H_('Consumer no.'), cfg.consumerNo || '—'],
    [H_('Contract demand'), inr(c.cd) + ' kVA', H_('85 % of contract demand'), inr(c.minBD === null ? null : Math.round(c.minBD)) + ' kVA'],
    [H_('Tariff'), cfg.tariff || '—', H_('Months of bills'), String(c.months)]
  ], { colw:['22%','28%','24%','26%'] }));
  B.push(blk(bP('Average unit rate Rs ' + fix(c.blended, 2) + ' per kWh.', { bold:true })));
  B.push(blk(bP('The full month-by-month analysis follows on two turned sheets in the workbook’s format: yellow columns are read off the bills, every other column is computed from the tariff.', { size:9.5 })));

  /* --- Part A: consumption, demand, energy, fuel, PF --- */
  var live = c.live;
  var rowsA = live.map(function(r){
    return [r.month, n2(r.kwh), n2(r.bill), r2(r.rate), r3(r.pf), n2(r.md), n2(r.billingDemand), n2(r.demandCharge),
            r2(r.eRate), n2(r.energyCharge), r2(r.fRate), n2(r.fuelSurcharge), p1(r.pfPct), n2(r.pfAdj)];
  });
  rowsA.push(['Total', n2(c.sum.kwh), n2(c.sum.bill), '***', '***', '***', '***', n2(c.sum.demandCharge), '***', n2(c.sum.energyCharge), '***', n2(c.sum.fuelSurcharge), '***', n2(c.sum.pfAdj)].map(H_));
  rowsA.push(['Average', n2(c.avg.kwh), n2(c.avg.bill), r2(c.avg.rate), r3(c.avg.pf), n2(c.avg.md), n2(c.avg.billingDemand), n2(c.avg.demandCharge), r2(c.avg.eRate), n2(c.avg.energyCharge), r2(c.avg.fRate), n2(c.avg.fuelSurcharge), p1(c.avg.pfPct), n2(c.avg.pfAdj)].map(H_));
  B.push({ node:el('div'), split:false, hardBreak:true });
  B.push(blk(rotatedTable('Electricity consumption and bills (1 of 2) - consumption, demand, energy and power factor',
    [{v:'Read off the bill',tone:'head',span:3},{v:'',tone:'head'},{v:'Read',tone:'head',span:2},{v:'Computed',tone:'head',span:2},{v:'Read',tone:'head'},{v:'Computed',tone:'head'},{v:'Read',tone:'head'},{v:'Computed',tone:'head',span:3}],
    ['Month','Total units kWh','Total bill Rs','Rate Rs/unit','Power factor','Actual MD kVA','Billing demand kVA','Demand charge Rs','Energy rate Rs/kWh','Energy charge Rs','FPPA Rs/kWh','Fuel surcharge Rs','PF % of energy','PF adj / rebate Rs'],
    rowsA, 7.4)));

  /* --- Part B: night, EHV, TOU, duty, total, check --- */
  var rowsB = live.map(function(r){
    return [r.month, n2(r.night), p1(r.nightPct), r2(r.nightRate), n2(r.nightRebate), n2(r.ehvEnergy), p1(r.ehvPct), n2(r.ehvCharges),
            n2(r.tou), p1(r.touPct), r2(r.touRate), n2(r.touCharges), n2(r.totalCons), p1(r.dutyRate), n2(r.duty), n2(r.totalBill), n2(r.diff)];
  });
  rowsB.push(['Total', n2(c.sum.night), '***', '***', n2(c.sum.nightRebate), n2(c.sum.ehvEnergy), '***', n2(c.sum.ehvCharges), n2(c.sum.tou), '***', '***', n2(c.sum.touCharges), n2(c.sum.totalCons), '***', n2(c.sum.duty), n2(c.sum.totalBill), '***'].map(H_));
  rowsB.push(['Average', n2(c.avg.night), p1(c.avg.nightPct), r2(c.avg.nightRate), n2(c.avg.nightRebate), n2(c.avg.ehvEnergy), p1(c.avg.ehvPct), n2(c.avg.ehvCharges), n2(c.avg.tou), p1(c.avg.touPct), r2(c.avg.touRate), n2(c.avg.touCharges), n2(c.avg.totalCons), p1(c.avg.dutyRate), n2(c.avg.duty), n2(c.avg.totalBill), n2(c.avg.diff)].map(H_));
  B.push({ node:el('div'), split:false, hardBreak:true });
  B.push(blk(rotatedTable('Electricity consumption and bills (2 of 2) - night hours, EHV, TOU, duty and total',
    [{v:'',tone:'head'},{v:'Night hour',tone:'head',span:4},{v:'EHV rebate',tone:'head',span:3},{v:'TOU hour',tone:'head',span:4},{v:'Total consumption charge',tone:'head'},{v:'Electricity duty',tone:'head',span:2},{v:'Total bill',tone:'head'},{v:'Difference',tone:'head'}],
    ['Month','Night units kWh','% night','Rate','Night rebate Rs','EHV energy charge Rs','% EHV','EHV charges Rs','TOU units kWh','% TOU','Rate','TOU charges Rs','Rs','Rate','ED charge Rs','Rs','Bill - computed Rs'],
    rowsB, 7.0)));

  /* --- standard format summary --- */
  var rowsS = live.map(function(r){
    return [r.month, n2(c.cd), n2(r.md), n2(r.billingDemand), r3(r.pf), n2(r.kwh), n2(r.night), p1(r.nightPct), n2(r.tou), p1(r.touPct),
            n2(r.pfAdj === null ? null : -r.pfAdj), n2(r.nightRebate === null ? null : -r.nightRebate), n2(r.touCharges), n2(r.bill)];
  });
  rowsS.push(['Total / avg', n2(c.cd), n2(c.avg.md), n2(c.avg.billingDemand), r3(c.avg.pf), n2(c.sum.kwh), n2(c.sum.night), p1(c.sum.kwh ? c.sum.night / c.sum.kwh : null), n2(c.sum.tou), p1(c.sum.kwh ? c.sum.tou / c.sum.kwh : null),
              n2(c.sum.pfAdj === null ? null : -c.sum.pfAdj), n2(c.sum.nightRebate === null ? null : -c.sum.nightRebate), n2(c.sum.touCharges), n2(c.sum.bill)].map(H_));
  B.push({ node:el('div'), split:false, hardBreak:true });
  B.push(blk(rotatedTable('Standard format of electricity bill - per unit rate Rs ' + fix(c.blended, 2) + '/kWh',
    null,
    ['Month','Contract demand kVA','Actual demand kVA','Billing demand kVA','Power factor','Billed kWh','Night units kWh','% night use','TOU kWh','% TOU','PF rebate Rs','Night rebate Rs','TOU Rs','Bill Rs'],
    rowsS, 7.6)));
  B.push({ node:el('div'), split:false, hardBreak:true });
  B.push(blk(bP(c.note, { size:9, italic:true })));
  var others = (c.sum.kwh || 0) - (c.sum.night || 0) - (c.sum.tou || 0);
  B.push(tblBlock(['Period','Night hours units','TOU units','Other units','Total units'],
    [[live[0].month + ' to ' + live[live.length - 1].month, n2(c.sum.night), n2(c.sum.tou), n2(others), n2(c.sum.kwh)]],
    { colw:['28%','18%','18%','18%','18%'] }));

  /* --- observations --- */
  B.push(blk(bP('Observations in electricity bills', { bold:true })));
  B.push(blk(bFormula([
    'Average units consumed          = ' + inr(Math.round(c.avg.kwh || 0)) + ' units/month',
    'Average actual maximum demand   = ' + fix(c.avg.md) + ' kVA',
    'Average power factor            = ' + fix(c.avg.pf, 3),
    'Contract demand                 = ' + inr(c.cd) + ' kVA',
    '',
    'Load factor    = avg kWh / (avg MD x avg PF x 24 x 30) = ' + fix(c.loadFactor, 3),
    'Plant utility  = avg kWh / (CD x avg PF x 24 x 30)     = ' + fix(c.utilityFactor, 3),
    'Demand factor  = avg actual MD / CD                    = ' + fix(c.demandFactor, 3)
  ])));
  B.push(blk(bP('The higher the load factor, the better the utilisation of the equipment and installed capacity. Actual maximum demand is ' + fix((c.demandFactor || 0) * 100, 0) + ' % of contract demand. Night-hour units are ' + pct(c.nightShare) + ' and TOU units ' + pct(c.touShare) + ' of consumption.')));
  var labels = live.map(function(r){ return r.month; });

  B.push(blk(bH(2,'Contract demand vs actual and billing demand trend')));
  B.push(blk(bChart(chartGrouped(labels,
    [{ name:'Actual MD', color:SERIES[0], values:live.map(function(r){ return r.md || 0; }) },
     { name:'Billing demand', color:SERIES[1], values:live.map(function(r){ return r.billingDemand || 0; }) }],
    'Demand trend', 'kVA', c.cd ? { value:c.cd, label:'Contract demand ' + inr(c.cd) + ' kVA' } : null),
    'Actual maximum demand against billing demand, with the sanctioned contract demand marked.')));
  B.push(blk(bH(2,'Energy consumption vs actual demand trend')));
  B.push(blk(bChart(chartBars(labels, live.map(function(r){ return r.kwh || 0; }), 'Monthly units consumed', 'kWh', SERIES_NAME.electrical), 'Units billed each month')));
  B.push(blk(bH(2,'Annual power factor trend')));
  B.push(blk(bChart(chartLine(labels, live.map(function(r){ return r.pf; }), 'Monthly power factor', 'PF', { value:0.95, label:'Desirable 0.95' }),
    'Months below 0.95 forfeit the rebate; below 0.90 carry a penalty.')));
  if (c.sum.night){
    B.push(blk(bH(2,'Time of day (TOD) in electricity bill')));
    B.push(blk(bChart(chartStacked(labels,
      [{ name:'Night', color:SERIES[2], values:live.map(function(r){ return r.night || 0; }) },
       { name:'TOU', color:SERIES[1], values:live.map(function(r){ return r.tou || 0; }) },
       { name:'Other', color:SERIES[0], values:live.map(function(r){ return Math.max(0, (r.kwh || 0) - (r.night || 0) - (r.tou || 0)); }) }],
      'Time of day split', 'kWh'), 'Night-hour units earn a rebate; TOU units carry a surcharge.')));
  }

  /* --- recommendations in electricity bills, from the two proposal sheets --- */
  B.push(blk(bH(2,'Recommendation in electricity bills')));
  var pf = pfProposal(c);
  B.push(blk(bH(3,'Improvement of power factor')));
  B.push(blk(bP(S.billNotes.pfNote || ('The monthly power factor ' + (pf.below ? 'dropped below the desirable level of 0.95 in ' + pf.below + ' of ' + c.months + ' months, with the lowest recorded value ' + fix(c.minPF, 3) + '. A low power factor forfeits the rebate, increases reactive current, raises system losses and reduces transformer capacity utilisation.' : 'stayed above 0.95 throughout; raising it to ' + fix(cfg.pfTarget, 3) + ' would earn the full rebate.')))));
  B.push(tblBlock(['Month','Energy charge Rs','Present PF','% of energy charge','PF adj / rebate Rs','Proposed PF','% of energy charge','PF rebate Rs','Net saving Rs'],
    pf.rows.map(function(r){ return [r.month, n2(r.energyCharge), r3(r.pf), p1(r.pfPct), n2(r.present), r3(r.target), p1(r.tPct), n2(r.proposed), n2(r.saving)]; })
      .concat([['Total', n2(pf.total.energyCharge), '***', '***', n2(pf.total.present), '***', '***', n2(pf.total.proposed), n2(pf.total.saving)].map(H_)]),
    { size:7.8 }));
  B.push(blk(bFormula(['Annual monetary saving = ' + rupees(pf.total.saving), 'Investment = capacitor bank / relay and contactor, as recommended', 'Simple payback = investment / ' + rupees(pf.total.saving) + ' x 12'])));

  var cd = cdProposal(c);
  B.push(blk(bH(3,'Contract demand optimisation')));
  if (cd){
    B.push(blk(bP(S.billNotes.cdNote || ('The plant operates with a contract demand of ' + inr(c.cd) + ' kVA, so the minimum billing demand is ' + inr(Math.round(c.minBD)) + ' kVA. Over ' + c.months + ' months the average maximum demand was ' + inr(Math.round(c.avg.md)) + ' kVA and the highest ' + inr(Math.round(c.maxMD)) + ' kVA. Reducing the contract demand to ' + inr(cd.proposed) + ' kVA brings the minimum billing demand to ' + inr(Math.round(cd.minBD)) + ' kVA, closer to the plant’s load, while keeping ' + inr(Math.round(cd.headroom)) + ' kVA of headroom above the highest month recorded.'))));
    B.push(tblBlock(['Month','Actual MD','Billing demand @ ' + inr(c.cd),'Demand charges Rs','Billing demand @ ' + inr(cd.proposed),'Demand charges Rs','Savings Rs'],
      cd.rows.map(function(r){ return [r.month, n2(r.md), n2(r.presentBD), n2(r.presentCharge), n2(r.proposedBD), n2(r.proposedCharge), n2(r.saving)]; })
        .concat([['Total', '***', '***', n2(cd.total.presentCharge), '***', n2(cd.total.proposedCharge), n2(cd.total.saving)].map(H_)]),
      { size:8 }));
    B.push(blk(bFormula(['Annual monetary saving = ' + rupees(cd.total.saving), 'Investment = Nil', 'Simple payback = Immediate'])));
  } else {
    B.push(blk(bP(S.billNotes.cdNote || 'The highest recorded maximum demand sits close to the contract demand, so no reduction is proposed.')));
  }
  ledgerFor(B, 'bills', { heading:false });
}
