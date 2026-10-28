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

/* THE DOOR, OR STRAIGHT THROUGH IT.

   A sign-in already in this browser is believed at once: the app opens on
   the work, not on a password box, and not on a spinner either. The token
   is then checked against the server in the background, which is where a
   stale one is caught and where anything this browser holds and the server
   does not gets pushed up.

   No session, and no earlier "Work offline": the door. */
if (typeof signedIn === 'function' && signedIn()){
  cloudResume();
} else if (typeof gateNeeded === 'function' && gateNeeded()){
  gateShow();
}
