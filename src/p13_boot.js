/* ===================================================================
   BOOT
   =================================================================== */
loadState();

q('zoom').addEventListener('change', drawPreview);
q('print').addEventListener('click', function(){ window.print(); });
q('reset').addEventListener('click', function(){
  if (!confirm('Clear this draft and start a new report?')) return;
  var sess = cloudSession();
  S = blankState(); cloudNewReport(sess);
  save(); renderAll();
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

renderAll();

/* THE DOOR, EVERY TIME.

   Opening the page asks who you are - a reload, a new tab, a machine
   somebody else used yesterday. No sign-in is carried over from a previous
   sitting, so there is nothing to believe and nothing to check: the door
   simply opens, with the draft waiting behind it. Signing in is what then
   catches the server up on anything this browser holds and it does not.

   "Work offline" is still one click, and still only for this sitting. */
if (typeof gateNeeded === 'function' && gateNeeded()) gateShow();
