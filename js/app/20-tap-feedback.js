/* Tap feedback you can see: buttons dip while pressed and spring back
   (Pop), the tab icons hop (Tab hop), and the Scan button and shutter
   wobble (Jelly). Uses the separate `scale` / `translate` properties and
   the Web Animations API, so it never fights a button's own transform
   or transition. Skipped when the phone asks for reduced motion. */
(function(){
  if (!document.documentElement.animate) return;
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  function reduced(){ return !!(calm && calm.matches); }
  var SPRING = 'cubic-bezier(.3,1.7,.5,1)';
  var pressed = null, pressedAmt = 1;

  function isSpecial(btn){
    return !!btn.closest('#tabbar') || btn.classList.contains('scan-overlay-capture');
  }
  function jelly(el){
    el.animate([
      { scale: '1 1' }, { scale: '1.16 .82', offset: .25 }, { scale: '.92 1.1', offset: .5 },
      { scale: '1.04 .97', offset: .75 }, { scale: '1 1' }
    ], { duration: 550, easing: 'ease-out' });
  }
  function hop(el){
    el.animate([
      { translate: '0 0', scale: '1 1' },
      { translate: '0 -9px', scale: '.94 1.1', offset: .3 },
      { translate: '0 0', scale: '1.14 .86', offset: .55 },
      { translate: '0 -3px', scale: '.98 1.02', offset: .75 },
      { translate: '0 0', scale: '1 1' }
    ], { duration: 600, easing: 'ease-out' });
  }
  function release(bounce){
    var el = pressed; pressed = null;
    if (!el) return;
    el.style.scale = '';
    if (bounce && !reduced() && el.isConnected){
      el.animate([{ scale: String(pressedAmt) }, { scale: '1.06', offset: .55 }, { scale: '1' }], { duration: 380, easing: SPRING });
    }
  }
  document.addEventListener('pointerdown', function(e){
    if (reduced() || !e.target || !e.target.closest) return;
    var tab = e.target.closest('#tabbar button');
    if (tab){
      var glyph = tab.querySelector('.tab-glyph');
      if (tab.dataset.tab === 'scan') jelly(tab);
      else if (glyph) hop(glyph);
      return;
    }
    var btn = e.target.closest('button');
    if (!btn || btn.disabled || isSpecial(btn)){
      if (btn && btn.classList.contains('scan-overlay-capture')) jelly(btn);
      return;
    }
    release(false);
    var r = btn.getBoundingClientRect();
    pressedAmt = r.width > 220 ? 0.97 : (r.width > 110 ? 0.94 : 0.88);
    pressed = btn;
    btn.style.scale = String(pressedAmt);
  }, true);
  document.addEventListener('pointerup', function(){ release(true); }, true);
  document.addEventListener('pointercancel', function(){ release(false); }, true);
  document.addEventListener('scroll', function(){ if (pressed) release(false); }, true);
})();
