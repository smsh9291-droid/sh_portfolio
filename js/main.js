(function(){
  var root = document.documentElement;
  var bigFolder = document.getElementById('big-folder'); // choreography wrapper (opening/closing/pressing)
  var folderHit = document.getElementById('folder-hit');  // the actual clickable folder button
  var folderStack = document.querySelector('.folder-stack');
  var miniFolder = document.getElementById('mini-folder');
  var mainGroup = document.querySelector('.eh-main-group');
  var exitMask = document.getElementById('folder-exit-mask');
  var eyebrow = document.querySelector('.eh-eyebrow');
  var sig = document.querySelector('.eh-sig');
  var workspaceMetadata = document.querySelector('.workspace-metadata');
  var heroFolderNav = document.querySelector('.hero-folder-nav');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var EYEBROW_TEXT = 'DESIGN × CODE × AI';
  var SIG_TEXT = 'HAM SEUNG HEE';
  var MS_PER_CHAR = 70;          // 65-80ms range — a typed rhythm, not a fade
  var CENTER_HOLD_MS = 1400;     // Main Copy stays fully still, in full view, at Center
  var SETTLE_MS = 650;           // Center -> Final MOTION duration — unchanged, untouched
  var GLITCH_MS = 1400;          // Glitch VISUAL duration — deliberately longer than SETTLE_MS;
                                  // must match the animation-duration on .mc-glitch-* in
                                  // style.css, which is not JS-driven
  var CLEAN_PAUSE_MS = 300;      // Glitch fully resolved -> AI Gauge start. Never overlaps
                                  // the glitch — this is dead, deliberately empty air.
  var AI_GAUGE_MS = 1400;        // Bottom-up Green Gauge reveal duration on Main Copy's "AI"
                                  // only — must match .ai-gauge-overlay's transition-duration
                                  // in style.css, which is not JS-driven
  var FINAL_HOLD_MS = 700;       // pause after Main Copy settles, before typing starts
  var TYPING_GAP_MS = 300;       // pause after LEFT's caret blinks, before RIGHT starts
  var IDLE_MOTION_DELAY_MS = 1000; // full stop after Opening Sequence finishes, before the
                                  // first Kinetic Idle Motion loop starts — lets the user read
                                  // the finished Hero once before anything moves again
  var NAV_REVEAL_DELAY_MS = 600; // Opening fully finished -> Sub Folder Navigation starts
                                  // appearing (500-700ms range) — runs on its own independent
                                  // timer, NOT chained before IDLE_MOTION_DELAY_MS above, so
                                  // it can never push Main Kinetic Idle Motion's start later
  var pendingTimers = [];        // every timeout/interval id from the run currently in flight
  var currentMainAnim = null;    // whichever WAAPI Animation (emerge or settle) is live right now
  var sequenceToken = 0;         // bumped by resetOpening() to abort any in-flight async run

  function delay(ms){
    return new Promise(function(resolve){
      var id = setTimeout(resolve, ms);
      pendingTimers.push(id);
    });
  }
  function clearPendingTimers(){
    pendingTimers.forEach(function(id){ clearTimeout(id); clearInterval(id); });
    pendingTimers = [];
  }

  // -- Main Copy: three-role split.
  //   FINAL Main Copy (mainGroup/.eh-main-group) never moves and is never .animate()'d — it
  //   sits at its real final position/size the whole time, opacity 0 until the very end.
  //   FLYING Main Copy is a runtime clone of .eh-main, built fresh on every open, that
  //   actually performs the motion: hidden inside #folder-exit-mask -> rises to clear the
  //   folder's real exit line (genuine clip, not z-index) -> continues to Center -> HOLD ->
  //   SETTLE to Final -> swapped for the (now-opaque) Final Main Copy with zero visual jump.
  //   PHASE A — EMERGE : one continuous keyframe timeline, no restarts. transform-origin is
  //                       bottom-center, so translateY alone controls how much has cleared
  //                       the exit line, independent of the current scale — the exact instant
  //                       translateY reaches the "cleared" keyframe, the whole element is
  //                       already provably inside the mask's bounds, so toggling the mask's
  //                       overflow off right then produces zero visible change. Scale is
  //                       uniform only (never scaleX/scaleY independently).
  //   PHASE B — HOLD    : zero motion for CENTER_HOLD_MS, fully opaque, fully readable
  //   PHASE C — SETTLE : calm, non-overshooting move from Center to the untouched Final
  //                       position, landing pixel-exact (same cloned markup/classes as Final)
  // All coordinates are measured live via getBoundingClientRect(), never hardcoded
  // per-breakpoint pixels, so this holds up at any viewport size.
  async function runMainCopyEmergence(myToken){
    if (!mainGroup) return;
    var mainH1 = mainGroup.querySelector('.eh-main');
    if (reduced || !mainH1 || !exitMask || !('animate' in mainGroup)) {
      mainGroup.style.opacity = '1';
      mainGroup.style.transform = 'none';
      var reducedGauge = mainH1 && mainH1.querySelector('.ai-gauge-overlay');
      if (reducedGauge) reducedGauge.classList.add('is-active'); // no glitch/gauge motion under reduced-motion — transition disabled via CSS media query, so this is effectively instant
      root.classList.add('mini-ready');
      bigFolder.classList.add('fly-away');
      return;
    }

    var mobile = window.innerWidth <= 700;
    // .eh-main itself, NOT .eh-main-group — the group is a flex item that stretches to fill
    // .eh-open's full width (align-items:stretch), while .eh-main is the actual text box,
    // narrower and capped by its own max-width:22ch. Measuring the group here would size the
    // mask/Flying Copy to the wrong (too-wide) box and land Settle's fcx off-center.
    var finalRect = mainH1.getBoundingClientRect(); // Final Main Copy's real, never-moved rect
    var folderRect = folderStack ? folderStack.getBoundingClientRect() : finalRect;
    var exitLineY = folderRect.top;                    // the folder's real top edge = the exit line
    var folderCenterX = folderRect.left + folderRect.width / 2;

    var flyW = finalRect.width, flyH = finalRect.height;

    // Build the Flying Copy fresh: cloning the REAL final <h1> (same class) guarantees
    // identical font-size/line-height/max-width/line-break, so it lands pixel-exact on the
    // Final Main Copy by construction instead of by careful independent measurement.
    exitMask.innerHTML = '';
    var flying = mainH1.cloneNode(true);
    flying.className = mainH1.className + ' flying-main-copy';
    exitMask.appendChild(flying);

    var maskW = flyW;
    var maskH = flyH + 6;
    var maskLeft = Math.max(4, Math.min(window.innerWidth - maskW - 4, folderCenterX - maskW / 2));
    exitMask.style.left = maskLeft + 'px';
    exitMask.style.top = (exitLineY - maskH) + 'px';
    exitMask.style.width = maskW + 'px';
    exitMask.style.height = maskH + 'px';
    exitMask.classList.remove('is-cleared');
    exitMask.classList.add('is-active');

    // Flying Copy's rest position (transform:none) fills the mask exactly — bottom edge at
    // the exit line, horizontally centered on the folder. Every transform below is a
    // translate3d OFFSET from this rest point (restX,restY), not from the Final position.
    var restX = maskLeft + maskW / 2;
    var restY = exitLineY;

    var fcx = finalRect.left + finalRect.width / 2;
    var centerTargetX = window.innerWidth / 2;
    var centerTargetY = (window.innerHeight / 2) + flyH / 2; // bottom-anchor Y when block is viewport-centered
    var tx1 = centerTargetX - restX;
    var ty1 = centerTargetY - restY;
    var txFinal = fcx - restX;
    var tyFinal = finalRect.bottom - restY;

    function frame(ty, tx, scale, offset, easing){
      var o = { transform: 'translate3d(' + tx + 'px,' + ty + 'px,0) scale(' + scale + ')', offset: offset };
      if (easing) o.easing = easing;
      return o;
    }

    var startScale = mobile ? .68 : .6;   // uniform only — never scaleX/scaleY independently
    var midScale = startScale + (1 - startScale) * .55;
    var hiddenY = flyH * 1.05;            // pushes the whole (smaller, scaled) box below the mask's bottom edge

    var riseEase = 'cubic-bezier(.16,.9,.28,1)';
    var arriveEase = 'cubic-bezier(.22,1,.36,1)'; // same easing already approved for Center -> Final
    var RISE_FRACTION = 4 / 9;
    var EMERGE_MS = 900;

    var emergeKeyframes = [
      frame(hiddenY, 0,   startScale, 0,             riseEase),   // fully hidden below the exit line
      frame(0,       0,   midScale,   RISE_FRACTION, arriveEase), // bottom exactly at the exit line — safe to unmask here
      frame(ty1,      tx1, 1,          1)                          // Center, locked
    ];

    var unmaskTimer = setTimeout(function(){
      if (myToken !== sequenceToken) return;
      // Nothing is being clipped at this geometry (see comment above) — this is a pure no-op
      // toggle, not a visual event. The Big Folder's job is done at the same instant: the
      // Flying Copy has genuinely cleared it, so its exit no longer waits on Typing.
      exitMask.classList.add('is-cleared');
      root.classList.add('mini-ready');
      bigFolder.classList.add('fly-away');
    }, EMERGE_MS * RISE_FRACTION);
    pendingTimers.push(unmaskTimer);

    try {
      currentMainAnim = flying.animate(emergeKeyframes, { duration: EMERGE_MS, fill: 'forwards' });
      await currentMainAnim.finished;
    } catch (e) { return; } // cancelled by resetOpening()
    if (myToken !== sequenceToken) return;

    // PHASE B — the whole point: Flying Copy just sits there, fully formed, for a beat.
    // The folder is already gone by now.
    await delay(CENTER_HOLD_MS);
    if (myToken !== sequenceToken) return;

    // PHASE C — settle from Center to the real Final position. Calm, no overshoot. Same
    // rest-relative coordinate frame as PHASE A, so this is one logically continuous path,
    // not a transform reset. A CSS-driven Horizontal Slice Fragment glitch (.is-glitching,
    // see style.css) starts in this same tick: 5 clip-path'd band clones of the two real
    // .line elements, each with its own independent, staggered translateX burst timeline.
    // It never touches `transform` on `flying` itself (owned entirely by the WAAPI settle
    // animation below) or moves the two real .line elements (they only ever dip opacity),
    // so nothing fights the settle motion. Its VISUAL duration (GLITCH_MS) deliberately
    // outlasts the settle MOTION (SETTLE_MS): position arrives at Final at SETTLE_MS, but
    // the last, smallest burst is still finishing on top of it for a bit longer — the Flying
    // Copy just sits still at Final while that plays out, then the swap below waits for
    // GLITCH_MS before happening, so the handoff to the clean Final Main Copy only occurs
    // once every fragment has genuinely resolved.
    var glitchSlices = document.createElement('div');
    glitchSlices.className = 'glitch-slices';
    glitchSlices.setAttribute('aria-hidden', 'true');
    var sourceLines = flying.querySelectorAll(':scope > .line');
    var sliceBands = [[0, 18], [18, 37], [37, 52], [52, 76], [76, 100]];
    sliceBands.forEach(function(band, i){
      var slice = document.createElement('div');
      slice.className = 'glitch-slice glitch-slice-' + (i + 1);
      slice.style.clipPath = 'inset(' + band[0] + '% 0 ' + (100 - band[1]) + '% 0)';
      sourceLines.forEach(function(lineEl){ slice.appendChild(lineEl.cloneNode(true)); });
      glitchSlices.appendChild(slice);
    });
    flying.appendChild(glitchSlices);

    var settleKeyframes = [
      { transform: 'translate3d(' + tx1 + 'px,' + ty1 + 'px,0) scale(1)' },
      { transform: 'translate3d(' + txFinal + 'px,' + tyFinal + 'px,0) scale(1)' }
    ];
    flying.classList.add('is-glitching');
    try {
      currentMainAnim = flying.animate(settleKeyframes, {
        duration: SETTLE_MS, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards'
      });
      await currentMainAnim.finished;
    } catch (e) { return; }
    if (myToken !== sequenceToken) return;

    // Position has arrived, but the glitch's last (smallest) burst may still be resolving —
    // wait out whatever's left of GLITCH_MS before swapping, so Clean Typography only shows
    // up once every fragment genuinely has settled, not just once the move finished.
    if (GLITCH_MS > SETTLE_MS) {
      await delay(GLITCH_MS - SETTLE_MS);
      if (myToken !== sequenceToken) return;
    }

    // Flying -> Final swap: Flying Copy is now sitting pixel-exact on top of the (still
    // invisible) Final Main Copy — flipping opacity on both in the same tick is a zero-jump
    // handoff. Flying Copy is discarded, not kept around. Flying Copy's own "AI" (both the
    // white base and the green gauge overlay, which stays clipped/hidden — see style.css)
    // never activates, so it only ever showed white the whole flight.
    mainGroup.style.opacity = '1';
    exitMask.classList.remove('is-active');
    exitMask.innerHTML = '';
    currentMainAnim = null;

    // Glitch is now fully, provably resolved (we've waited out its whole GLITCH_MS). Hold a
    // beat of genuine stillness — no glitch, no gauge — before the AI Gauge starts, so the
    // two effects never visually overlap or read as one continuous thing.
    await delay(CLEAN_PAUSE_MS);
    if (myToken !== sequenceToken) return;

    // AI Green Gauge: a bottom-up reveal, not a color fade. .ai-gauge-overlay is a pixel-
    // exact green clone of "AI" stacked on the white base (see index.html/style.css),
    // clipped to inset(100% 0 0 0) (0% visible) at rest — adding .is-active transitions its
    // clip-path to inset(0% 0 0 0) (fully visible), so the visible green region grows from
    // the bottom edge upward with a flat horizontal edge, never a wave/liquid shape.
    var gaugeOverlay = mainH1.querySelector('.ai-gauge-overlay');
    if (gaugeOverlay) gaugeOverlay.classList.add('is-active');
    await delay(AI_GAUGE_MS);
    if (myToken !== sequenceToken) return;
  }

  // -- Eyebrow / Signature typing: real character-by-character textContent growth (not an
  // opacity fade over pre-existing text), driven by await delay() rather than setInterval so
  // each character lands on its own real timer tick — none of them can get coalesced into a
  // single frame the way a very short setInterval can under load. A thin caret span sits
  // immediately after the text node in the DOM, so it always visually trails the last typed
  // character with no separate positioning logic needed.
  // accentFrom (optional): character index where the trailing "AI" accent span begins —
  // same speed/order/delay as every other character, just appended as a colored span
  // instead of plain text. -1/omitted = no accent (used for HAM SEUNG HEE).
  async function typeInto(container, fullText, myToken, accentFrom){
    var textEl = container.querySelector('[data-type-text]');
    var caret = container.querySelector('.type-caret');
    if (!textEl) return;
    container.classList.add('is-visible');
    if (caret) { caret.style.visibility = 'visible'; caret.classList.remove('is-blinking'); }
    textEl.textContent = '';
    for (var i = 0; i < fullText.length; i++) {
      if (myToken !== sequenceToken) return;
      if (accentFrom >= 0 && i >= accentFrom) {
        var accentSpan = document.createElement('span');
        accentSpan.className = 'accent-ai';
        accentSpan.textContent = fullText[i];
        textEl.appendChild(accentSpan);
      } else {
        textEl.appendChild(document.createTextNode(fullText[i]));
      }
      await delay(MS_PER_CHAR);
    }
    if (myToken !== sequenceToken) return;
    if (caret) {
      for (var b = 0; b < 2; b++) {
        caret.style.visibility = 'hidden';
        await delay(150);
        if (myToken !== sequenceToken) return;
        caret.style.visibility = 'visible';
        await delay(150);
        if (myToken !== sequenceToken) return;
      }
      caret.style.visibility = 'hidden';
    }
  }

  // .eh-sig is right-aligned (space-between) — if its box were left to grow with the text,
  // each new character would push the box's LEFT edge further left while its right edge
  // (and the caret) stayed pinned, making already-typed letters visibly slide sideways.
  // Reserving the full final width up front keeps that box static; the caret then moves
  // rightward through it exactly like normal typing.
  function reserveWidth(container, fullText){
    var textEl = container.querySelector('[data-type-text]');
    var prev = textEl.textContent;
    textEl.textContent = fullText;
    var w = container.getBoundingClientRect().width;
    textEl.textContent = prev;
    container.style.minWidth = w + 'px';
  }

  // -- Kinetic Idle Motion: a single class on <html> drives every element's animation via
  //   CSS (see .kinetic-idle rules in style.css) — no per-element WAAPI here, so start/stop
  //   is just adding/removing one class. Toggling it always restarts the CSS animation from
  //   its 0% keyframe (removing then re-adding a class never resumes a mid-cycle phase), so
  //   CLOSE -> REOPEN naturally replays Opening Sequence -> hold -> first Idle loop with no
  //   leftover phase from a previous run.
  function stopIdleMotion(){ root.classList.remove('kinetic-idle'); }
  function startIdleMotion(){ root.classList.add('kinetic-idle'); }

  // -- Workspace Metadata Layer: one class fades the whole Background Metadata layer in
  //   (CSS transition, see .workspace-metadata.is-visible in style.css) and — once that
  //   fade finishes — its own per-unit animation-delay values start the ambient Kinetic
  //   Background loop. Same instant-hide-on-CLOSE discipline as Idle Motion above.
  function hideWorkspaceMetadata(){ if (workspaceMetadata) workspaceMetadata.classList.remove('is-visible'); }
  function showWorkspaceMetadata(){ if (workspaceMetadata) workspaceMetadata.classList.add('is-visible'); }

  // -- Sub Folder Navigation: one class reveals the whole <nav> — each .hero-folder-item's
  //   own transition-delay (see style.css) staggers Folder 01 -> 04 120ms apart, so no
  //   per-item JS timing is needed here either. Instant-hide-on-CLOSE, same as above.
  function hideFolderNav(){ if (heroFolderNav) heroFolderNav.classList.remove('is-visible'); }
  function showFolderNav(){ if (heroFolderNav) heroFolderNav.classList.add('is-visible'); }
  // Runs as its own independent timer (NOT awaited inline in runOpeningSequence) so its
  // NAV_REVEAL_DELAY_MS pause can never delay the Main Kinetic Idle Motion hold below,
  // which must keep starting exactly IDLE_MOTION_DELAY_MS after typing, untouched.
  async function revealFolderNavAfterOpening(myToken){
    await delay(NAV_REVEAL_DELAY_MS);
    if (myToken !== sequenceToken) return;
    showFolderNav();
  }

  var EYEBROW_ACCENT_FROM = EYEBROW_TEXT.length - 2; // trailing "AI"

  async function startTyping(myToken){
    if (!eyebrow || !sig) return;
    if (reduced) {
      var eyebrowText = eyebrow.querySelector('[data-type-text]');
      var sigText = sig.querySelector('[data-type-text]');
      if (eyebrowText) {
        eyebrowText.textContent = '';
        eyebrowText.appendChild(document.createTextNode(EYEBROW_TEXT.slice(0, EYEBROW_ACCENT_FROM)));
        var accentSpan = document.createElement('span');
        accentSpan.className = 'accent-ai';
        accentSpan.textContent = EYEBROW_TEXT.slice(EYEBROW_ACCENT_FROM);
        eyebrowText.appendChild(accentSpan);
      }
      if (sigText) sigText.textContent = SIG_TEXT;
      eyebrow.classList.add('is-visible');
      sig.classList.add('is-visible');
      return;
    }
    await typeInto(eyebrow, EYEBROW_TEXT, myToken, EYEBROW_ACCENT_FROM);
    if (myToken !== sequenceToken) return;
    await delay(TYPING_GAP_MS);
    if (myToken !== sequenceToken) return;
    reserveWidth(sig, SIG_TEXT);
    await typeInto(sig, SIG_TEXT, myToken);
  }

  async function runOpeningSequence(myToken){
    if (reduced) {
      if (mainGroup) { mainGroup.style.opacity = '1'; mainGroup.style.transform = 'none'; }
      await startTyping(myToken);
      if (myToken !== sequenceToken) return;
      showWorkspaceMetadata(); // Opening is complete under reduced motion too — reveal the
        // (motion-free; CSS gates the Kinetic loop on prefers-reduced-motion) Metadata layer
      revealFolderNavAfterOpening(myToken); // still appears under reduced motion — CSS just
        // minimizes its entrance transform (see style.css), never skips it entirely
      root.classList.add('mini-ready');
      // no animation to wait on under reduced motion — drop .opening directly so the
      // :not(.opening) resting rule hides the big folder instantly instead of leaving it
      // stuck on-screen alongside the now-visible mini folder
      bigFolder.classList.remove('opening');
      return;
    }
    // Mini Folder handoff (root.mini-ready + bigFolder.fly-away) now fires from inside
    // runMainCopyEmergence(), the instant the Flying Copy has actually cleared the folder —
    // it no longer waits on Typing to finish. See that function for exactly where.
    await runMainCopyEmergence(myToken);
    if (myToken !== sequenceToken) return;
    await delay(FINAL_HOLD_MS);
    if (myToken !== sequenceToken) return;
    await startTyping(myToken);
    if (myToken !== sequenceToken) return;
    // Opening Sequence is now fully finished. Background Metadata fades in right away (its
    // own .8s opacity transition, then its own per-unit delays start the ambient Kinetic
    // loop — see style.css) — independent of, and not delaying, the Main Typography's own
    // hold-then-Idle-Motion timing directly below, which is untouched.
    showWorkspaceMetadata();
    // Sub Folder Navigation: same independence — its own NAV_REVEAL_DELAY_MS timer starts
    // right now, in parallel, and must never shift the IDLE_MOTION_DELAY_MS hold below.
    revealFolderNavAfterOpening(myToken);
    // Hold completely still before the first Main Kinetic Idle Motion loop starts (never
    // during Opening; see IDLE_MOTION_DELAY_MS).
    await delay(IDLE_MOTION_DELAY_MS);
    if (myToken !== sequenceToken) return;
    startIdleMotion();
  }

  function resetOpening(){
    sequenceToken++; // invalidates every "if (myToken !== sequenceToken) return" check above
    clearPendingTimers();
    stopIdleMotion(); // immediate: no transition on the idle transforms, so this snaps every
                       // Typography element back to translateX(0) with no lingering motion
    hideWorkspaceMetadata(); // CLOSE hides Background Metadata instantly too; REOPEN always
                       // fades it back in from scratch, after the next Opening completes
    hideFolderNav();   // CLOSE hides Sub Folder Navigation instantly too (its .32s
                       // transition never plays here since clearPendingTimers() already
                       // stopped revealFolderNavAfterOpening()'s in-flight delay via the
                       // bumped sequenceToken); REOPEN always replays the same reveal
    if (currentMainAnim) { try { currentMainAnim.cancel(); } catch (e) {} currentMainAnim = null; }
    // a successfully-finished emerge/settle animation clears currentMainAnim on its own way
    // out (see runMainCopyEmergence), but its fill:'forwards' effect stays attached to the
    // element and keeps overriding CSS until explicitly cancelled — find and cancel it too,
    // regardless of whether the tracked reference above still pointed at it. Same discipline
    // for the Flying Copy: it's a fresh clone every run, but a mid-flight CLOSE must not
    // leave a stale, still-animating one (or the mask's geometry) lingering into the next OPEN.
    if (mainGroup && 'getAnimations' in mainGroup) {
      mainGroup.getAnimations().forEach(function(a){ try { a.cancel(); } catch (e) {} });
    }
    if (exitMask) {
      var flying = exitMask.querySelector('.flying-main-copy');
      if (flying && 'getAnimations' in flying) {
        flying.getAnimations().forEach(function(a){ try { a.cancel(); } catch (e) {} });
      }
      exitMask.innerHTML = '';
      exitMask.classList.remove('is-active', 'is-cleared');
      exitMask.removeAttribute('style');
    }
    root.classList.remove('mini-ready');
    if (mainGroup) {
      mainGroup.style.opacity = '';
      mainGroup.style.transform = '';
      var gaugeOverlay = mainGroup.querySelector('.ai-gauge-overlay');
      if (gaugeOverlay) gaugeOverlay.classList.remove('is-active'); // next OPEN must start White again, not still Green
    }
    [eyebrow, sig].forEach(function(el){
      if (!el) return;
      el.classList.remove('is-visible');
      el.style.minWidth = '';
      var textEl = el.querySelector('[data-type-text]');
      if (textEl) textEl.textContent = '';
      var caret = el.querySelector('.type-caret');
      if (caret) { caret.classList.remove('is-blinking'); caret.style.visibility = ''; }
    });
  }

  if (folderHit && bigFolder) {
    folderHit.addEventListener('click', function(){
      bigFolder.classList.remove('closing', 'fly-away');
      bigFolder.classList.add('opening', 'pressing');
      root.classList.add('ws-open');
      // brief press feedback only — never gates the opening sequence itself
      setTimeout(function(){ bigFolder.classList.remove('pressing'); }, 150);
      var myToken = ++sequenceToken;
      var t = setTimeout(function(){ runOpeningSequence(myToken); }, reduced ? 0 : 360);
      pendingTimers.push(t);
    });
  }
  if (bigFolder) {
    bigFolder.addEventListener('animationend', function(e){
      if (e.animationName === 'folder-collapse-away') bigFolder.classList.remove('opening', 'fly-away');
      if (e.animationName === 'folder-collapse-return') bigFolder.classList.remove('closing');
    });
  }
  if (miniFolder && bigFolder) {
    miniFolder.addEventListener('click', function(){
      bigFolder.classList.remove('opening', 'fly-away');
      bigFolder.classList.add('closing');
      root.classList.remove('ws-open');
      resetOpening();
    });
  }
})();

/* -- desktop custom cursor: default arrow / hand-on-folder-hover — mouse+trackpad only.
   Hover swap is scoped to #folder-hit (the real click target, sized to the folder graphic)
   so the hand only ever appears over the folder itself, never over empty entry space. */
(function(){
  var mq = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (!mq.matches) return; // touch/coarse pointer: no custom cursor, no listeners at all

  var root = document.documentElement;
  var cursor = document.getElementById('custom-cursor');
  var folderHit = document.getElementById('folder-hit');
  if (!cursor) return;

  root.classList.add('custom-cursor-active');

  var x = 0, y = 0, raf = null;
  function render(){
    // no manual hotspot offset here — each .cursor-img carries its own precise offset in
    // CSS, so this anchor just needs to sit exactly on the real pointer position
    cursor.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    raf = null;
  }
  window.addEventListener('mousemove', function(e){
    x = e.clientX; y = e.clientY;
    if (!raf) raf = requestAnimationFrame(render);
  }, { passive:true });

  document.addEventListener('mouseleave', function(){ cursor.style.opacity = '0'; });
  document.addEventListener('mouseenter', function(){ cursor.style.opacity = ''; });

  if (folderHit) {
    folderHit.addEventListener('mouseenter', function(){ cursor.classList.add('is-hover'); });
    folderHit.addEventListener('mouseleave', function(){ cursor.classList.remove('is-hover'); });
  }

  // Sub Folder Navigation reuses this exact same cursor + is-hover class — no new cursor
  // system. Items are static in the HTML (only revealed/hidden via CSS opacity later), so
  // querying them once here at load time is enough.
  document.querySelectorAll('.hero-folder-item').forEach(function(item){
    item.addEventListener('mouseenter', function(){ cursor.classList.add('is-hover'); });
    item.addEventListener('mouseleave', function(){ cursor.classList.remove('is-hover'); });
  });

  // SELECTED WORKS Project Row reuses this exact same cursor + is-hover class too — this
  // whole IIFE already returned early above under touch/coarse pointer, so this listener
  // only ever exists on Desktop; the Mobile Auto Active Sequence is untouched and never
  // wired to the cursor.
  document.querySelectorAll('#works .folder-item').forEach(function(item){
    item.addEventListener('mouseenter', function(){ cursor.classList.add('is-hover'); });
    item.addEventListener('mouseleave', function(){ cursor.classList.remove('is-hover'); });
  });
})();

/* -- MOMENTRIP Title: Hero-style character-by-character typing + blinking caret (see
   .eh-eyebrow/.eh-sig typeInto() above) for #project-momentrip's large "MOMENTRIP" heading.
   Self-contained/independent of that Hero sequence's own sequenceToken lifecycle — this
   title has its own single trigger, not a multi-step opening choreography. Gated on a real
   IntersectionObserver entry (never pre-finished off-screen on load) so it only starts once
   the user has actually scrolled the heading into view. font-size/weight/line-height/
   letter-spacing/position/width/alignment are all untouched (see .project-name/
   #project-momentrip .project-name in style.css) — only the reveal mechanics changed.
   Caret is never hidden/removed once typing finishes — its continuous blink (CSS
   @keyframes blink, same one already driving .cursor in the AI Prompt block) is the whole
   ongoing "idle" state of the title, not just a typing-in-progress indicator.
   Replay is wired to the EXISTING SELECTED WORKS "MOMENTRIP" menu link (plain anchor,
   href="#project-momentrip" — native hash-jump + the site's global html{scroll-behavior:
   smooth}, no custom scroll/offset JS to preserve here) rather than the title itself: every
   click resets and reruns runTyping() on top of the same single in-flight timer the
   Observer's own first-visit Auto Play uses, so re-clicking mid-type can never stack more
   than one interval. No preventDefault — navigation behaves exactly as before. */
(function(){
  var titleEl = document.querySelector('#project-momentrip .project-name');
  if (!titleEl) return;
  var textEl = titleEl.querySelector('[data-type-text]');
  var caret = titleEl.querySelector('.type-caret');
  var menuLink = document.querySelector('#works a.folder-item[href="#project-momentrip"]');
  if (!textEl || !caret) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fullText = titleEl.getAttribute('aria-label') || 'MOMENTRIP';
  var MS_PER_CHAR = 120;
  var played = false;
  var timer = null; // the one in-flight typing interval, if any — always cleared before a
    // new run starts (both the first Auto Play and every menu-click Replay share this same
    // guard), so duplicate/overlapping intervals are structurally impossible.

  function clearTyping(){
    if (timer) { clearInterval(timer); timer = null; }
  }

  function runTyping(){
    clearTyping();
    titleEl.classList.add('is-visible');
    if (reduced) { textEl.textContent = fullText; return; }
    textEl.textContent = '';
    var i = 0;
    timer = setInterval(function(){
      i++;
      textEl.textContent = fullText.slice(0, i);
      if (i >= fullText.length) clearTyping();
    }, MS_PER_CHAR);
  }

  function playOnce(){
    if (played) return;
    played = true;
    runTyping();
  }

  // SELECTED WORKS "MOMENTRIP" menu click -> Replay: always reruns, regardless of whether
  // Auto Play has already run — marks `played` true too, so a click landing just before the
  // Observer's own first-visit trigger can't cause a second, overlapping run right after
  // the scroll-into-view completes.
  function retype(){
    played = true;
    runTyping();
  }
  if (menuLink) menuLink.addEventListener('click', retype);

  if (!('IntersectionObserver' in window)) { playOnce(); return; }
  // Same shrunk-viewport technique already used for the AI Workspace's own Auto Play
  // trigger below (rootMargin '0px 0px -30% 0px', threshold .1): the title only counts as
  // "actually visible" once its top edge has scrolled up into the viewport's own top ~70%,
  // not the instant it grazes the bottom edge.
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if (entry.isIntersecting) {
        playOnce();
        io.disconnect(); // one-shot on purpose — Auto Play only ever runs once per visit;
          // repeat plays after that are menu-click Replay only, not re-triggered by scroll.
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -30% 0px' });
  io.observe(titleEl);
})();

/* -- AI Collaboration Workspace: typed prompt -> send -> generating -> response -- */
(function(){
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Scroll Gate: page-level, shared by every [data-ai-workspace] instance — Auto Play
  // must never start before the user has actually scrolled down at all, no matter what
  // an IntersectionObserver reports (a workspace sitting close to the initial fold could
  // otherwise already "intersect" on load). window.scrollY compared against its value at
  // script-init time (not a wheel/touchmove listener, which only proves an input event
  // happened, not that the page actually moved) — a small tolerance (20px) absorbs
  // scroll-restoration/rubber-banding jitter without counting as real user scroll.
  // Desktop V2 scrolls its own Stage (#v2-host) instead of the page — window.scrollY
  // stays 0 there forever, so the host's scrollTop counts as user scroll too (the
  // 'scroll' event itself already reaches window: js/workspace-v2.js forwards it).
  var initialScrollY = window.scrollY;
  var hasUserScrolled = false;
  var scrollGateCallbacks = [];
  var v2Host = document.getElementById('v2-host');
  window.addEventListener('scroll', function(){
    if (hasUserScrolled) return;
    var hostScrolled = v2Host ? v2Host.scrollTop : 0;
    if (window.scrollY > initialScrollY + 20 || hostScrolled > 20) {
      hasUserScrolled = true;
      scrollGateCallbacks.forEach(function(cb){ cb(); });
    }
  }, { passive:true });

  // Scroll Replay: page-level too, shared by every [data-ai-workspace] instance — runs on
  // every scroll (not gated behind hasUserScrolled above, which only ever fires once) so
  // each already-played workspace can keep checking its own distance from the viewport.
  // Kept as a single shared listener rather than one per instance for the same reason as
  // the Scroll Gate above: cheap, and there is only ever one scroll to listen to.
  var resetCallbacks = [];
  window.addEventListener('scroll', function(){
    resetCallbacks.forEach(function(cb){ cb(); });
  }, { passive:true });

  function initWorkspace(root){
    var typeEl = root.querySelector('[data-typewriter]');
    var sendEl = root.querySelector('[data-send]');
    var promptBlock = root.querySelector('.ai-prompt-block');
    var responseBlock = root.querySelector('[data-response]');
    var replayBtn = root.querySelector('[data-replay]');
    if (!typeEl || !sendEl || !promptBlock || !responseBlock) return;

    var fullText = typeEl.textContent;
    var fast = root.getAttribute('data-speed') === 'fast';
    var CHAR_MS = fast ? 27 : 50; // Normal ~50ms/char (was an effective ~11ms/char via
      // step:2/22ms — too fast to actually read as typing), Fast ~25-30ms/char — kept
      // distinctly quicker than Normal, same relative relationship as before.
    var played = false;
    var pending = []; // timer/interval ids from the run currently in flight

    function clearPending(){
      pending.forEach(function(id){ clearTimeout(id); clearInterval(id); });
      pending = [];
    }
    function after(ms, fn){ pending.push(setTimeout(fn, ms)); }

    function setSend(state, label){
      sendEl.setAttribute('data-state', state);
      sendEl.textContent = label;
    }

    // Response Code Writing: once the Response is 'done', its existing markup is written
    // out line by line (one line = one direct child of [data-response-body]), each line's
    // text typed in quickly — markedly faster than the Prompt's CHAR_MS. Every non-blank
    // text node is wrapped ONCE, at init, in <i class="ai-tw"> = [typed text][caret][<i
    // class="ai-tw-rest"> hidden remainder]; each tick only moves characters between those
    // two text nodes' .data, so no markup is ever rebuilt and the hidden remainder keeps
    // the final layout reserved the whole time (no height change, no reflow of the
    // surrounding page). Existing span/class structure and the CSS-generated syntax marks
    // (/* */, <>, ·) are untouched; data-tw only gates visibility per owning element (see
    // style.css). [data-replay] is a control, not code — it simply appears once done.
    var bodyEl = root.querySelector('[data-response-body]');
    var RESP_CHAR_MS = fast ? 18 : 25;
    var RESP_LINE_GAP_MS = 150;
    var segs = [];
    var caretEl = document.createElement('i');
    caretEl.className = 'ai-tw-caret';
    caretEl.setAttribute('aria-hidden', 'true');

    if (bodyEl) {
      Array.prototype.forEach.call(bodyEl.children, function(lineEl, lineIdx){
        if (lineEl === replayBtn) return;
        var walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT, {
          acceptNode: function(n){ return n.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
        });
        var nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(function(node){
          var wrap = document.createElement('i');
          wrap.className = 'ai-tw';
          var restEl = document.createElement('i');
          restEl.className = 'ai-tw-rest';
          var restText = document.createTextNode('');
          restEl.appendChild(restText);
          var owner = node.parentNode;
          owner.replaceChild(wrap, node);
          wrap.appendChild(node);
          wrap.appendChild(restEl);
          segs.push({ line:lineIdx, el:owner, wrap:wrap, typed:node, restEl:restEl, restText:restText, text:node.data });
        });
      });
      segs.forEach(function(s, i){ s.lastOfEl = !segs[i + 1] || segs[i + 1].el !== s.el; });
    }

    function setResponseText(full){
      segs.forEach(function(s){
        s.typed.data = full ? s.text : '';
        s.restText.data = full ? '' : s.text;
        if (full) s.el.removeAttribute('data-tw');
        else s.el.setAttribute('data-tw', 'wait');
      });
      if (replayBtn) {
        if (full) replayBtn.removeAttribute('data-tw');
        else replayBtn.setAttribute('data-tw', 'wait');
      }
      if (caretEl.parentNode) caretEl.parentNode.removeChild(caretEl);
      if (bodyEl) bodyEl.removeAttribute('aria-busy');
    }

    function startSeg(s){
      s.el.setAttribute('data-tw', 'typing');
      s.wrap.insertBefore(caretEl, s.restEl);
    }

    function writeResponse(){
      if (!segs.length) return;
      setResponseText(false);
      bodyEl.setAttribute('aria-busy', 'true');
      var gapTicks = Math.round(RESP_LINE_GAP_MS / RESP_CHAR_MS);
      var si = 0, ci = 0, wait = 0;
      startSeg(segs[0]);
      var timer = setInterval(function(){
        if (wait > 0) { wait -= 1; return; }
        var s = segs[si];
        ci += 1;
        s.typed.data = s.text.slice(0, ci);
        s.restText.data = s.text.slice(ci);
        if (ci < s.text.length) return;
        if (s.lastOfEl) s.el.removeAttribute('data-tw');
        si += 1; ci = 0;
        if (si >= segs.length) {
          clearInterval(timer);
          setResponseText(true);
          return;
        }
        if (segs[si].line !== s.line) wait = gapTicks;
        startSeg(segs[si]);
      }, RESP_CHAR_MS);
      pending.push(timer);
    }

    function showFinalState(){
      typeEl.textContent = fullText;
      promptBlock.setAttribute('data-submitted', 'true');
      setSend('sent', 'SENT');
      responseBlock.setAttribute('data-state', 'done');
      setResponseText(true);
    }

    function afterTyping(){
      setSend('typing', 'SEND');
      var t1 = fast ? 150 : 380;
      after(t1, function(){
        setSend('sending', 'SENDING');
        promptBlock.setAttribute('data-submitted', 'true');
        var t2 = fast ? 220 : 420;
        after(t2, function(){
          setSend('sent', 'SENT');
          responseBlock.setAttribute('data-state', 'generating');
          var t3 = fast ? 320 : 650;
          after(t3, function(){
            responseBlock.setAttribute('data-state', 'done');
            writeResponse();
          });
        });
      });
    }

    function runSequence(){
      clearPending();

      if (reduced) { showFinalState(); return; }

      // Both speeds now type character-by-character (previously "fast" skipped typing
      // entirely and jumped straight to the full sentence) — only the per-character
      // interval (CHAR_MS above) differs between them. SEND/SENDING/GENERATING/Response
      // Fade timing in afterTyping() above is untouched.
      setResponseText(false); // clears any previous (or half-written) Response first
      typeEl.textContent = '';
      var i = 0;
      var timer = setInterval(function(){
        i += 1;
        typeEl.textContent = fullText.slice(0, i);
        if (i >= fullText.length) {
          clearInterval(timer);
          typeEl.textContent = fullText;
          afterTyping();
        }
      }, CHAR_MS);
      pending.push(timer);
    }

    function playOnce(){
      if (played) return;
      played = true;
      runSequence();
    }

    // Scroll Replay reset: fires on every scroll, but only actually resets once the Prompt
    // Block's top edge has cleared back down past a real distance below the viewport top —
    // RESET_DISTANCE * innerHeight, comfortably more than one screen. That is deliberately
    // far past the Auto Play trigger zone above (which only requires the top ~70% of the
    // viewport), so a small wobble around the trigger point can never re-arm this by
    // accident — only a genuine scroll back up toward the previous section does. Silently
    // returns the DOM to the same pre-play state replay() uses (minus its fade-out wait,
    // since this always fires while the block is off-screen), so the next real entry plays
    // the full sequence from scratch instead of resuming mid-way.
    var RESET_DISTANCE = 1.15;
    function checkReset(){
      if (!played) return;
      var rect = promptBlock.getBoundingClientRect();
      if (rect.top > window.innerHeight * RESET_DISTANCE) {
        played = false;
        clearPending();
        responseBlock.removeAttribute('data-state');
        setResponseText(false);
        typeEl.textContent = '';
        promptBlock.removeAttribute('data-submitted');
        setSend('idle', 'SEND');
      }
    }
    resetCallbacks.push(checkReset);

    function replay(){
      clearPending();
      responseBlock.removeAttribute('data-state'); // fades the current response out
      typeEl.textContent = '';
      promptBlock.removeAttribute('data-submitted');
      setSend('idle', 'SEND');
      if (reduced) { showFinalState(); return; }
      after(320, runSequence); // let the fade-out read before retyping
    }

    if (replayBtn) replayBtn.addEventListener('click', replay);

    // Trigger target changed: observing the whole .ai-workspace (root) measured
    // intersection ratio against its OWN full area — Prompt block + the much taller
    // Response block stacked below it — so a small top sliver (just the Prompt label)
    // peeking in from the bottom edge could already satisfy a raw area threshold well
    // before the Prompt was actually readable. Observing .ai-prompt-block itself instead
    // means the ratio/rootMargin below are now measured against ONLY the Prompt area's
    // own (much shorter) box — intersecting it for real means the Prompt is genuinely on
    // screen, not just the tip of the whole workspace.
    // rootMargin '0px 0px -30% 0px' shrinks the effective viewport to its own top 70%:
    // the Prompt block only starts intersecting once ITS top edge has scrolled up into
    // that zone (~70% down the viewport), matching "Prompt 상단이 viewport 약 65-70%
    // 안쪽까지 올라왔을 때" — not the moment it grazes the bottom edge. threshold:.1 still
    // requires a small real sliver inside that zone. Percentage-based, so it scales with
    // whatever the real viewport height is, Desktop or Mobile alike.
    // Auto Play now requires BOTH the Observer condition AND the page-level Scroll Gate
    // (hasUserScrolled) — maybeTrigger() is called from both the Observer callback and
    // the shared scroll listener above, since either one can become true first (e.g. the
    // Prompt block already sits inside the shrunk zone on load for a short page, before
    // any scroll — isIntersecting alone must never be enough).
    // The Observer is deliberately never disconnected after its first trigger (unlike a
    // plain play-once setup) — Scroll Replay needs it to keep reporting isIntersecting so
    // a later re-entry, after checkReset() above has cleared `played`, can call playOnce()
    // again. playOnce()'s own `if (played) return;` still makes every intersection while
    // already played (or mid-sequence) a no-op, so this costs nothing extra.
    var isIntersecting = false;
    var io = null;
    function maybeTrigger(){
      if (isIntersecting && hasUserScrolled) {
        playOnce();
      }
    }
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          isIntersecting = entry.isIntersecting;
        });
        maybeTrigger();
      }, { threshold: 0.1, rootMargin: '0px 0px -30% 0px' });
      io.observe(promptBlock);
      scrollGateCallbacks.push(maybeTrigger);
    } else {
      playOnce();
    }
  }

  document.querySelectorAll('[data-ai-workspace]').forEach(initWorkspace);
})();

/* -- SELECTED WORKS: Mobile Auto Active Sequence -- Desktop's Number Light-On / Name
   nudge / Arrow feedback is :hover-driven (see style.css); touch devices have no
   reliable hover, so here the exact same .works-row-active class is toggled by JS, one
   row at a time, 01 -> 02 -> 03 -> 04 -> pause -> repeat. Gated to non-hover-capable
   devices only, mirroring the CSS media query in reverse, so a real Desktop mouse
   session never gets this and a touch session never depends on :hover — the two
   triggers are mutually exclusive by construction. */
(function(){
  // ROOT CAUSE (previous version): `hoverCapable` was read once, synchronously, at script
  // parse time via `.matches` — no listener for viewport/input-mode changes, and no width
  // check at all (hover/pointer capability only). A page that loaded (or a DevTools
  // responsive view that started) in a Mobile-ish state kept the sequence running forever
  // afterward, with nothing to ever re-evaluate or stop it on resize/breakpoint change.
  // Fix: a single live MediaQueryList combining ALL THREE Desktop conditions
  // (width>700 AND hover:hover AND pointer:fine, exactly the brief's Desktop definition —
  // Mobile is simply its negation), re-checked via a real 'change' listener, so entering
  // Desktop mode always stops and fully clears any in-flight Mobile sequence, and
  // entering Mobile mode (re)starts it if #works is currently in view.
  var reducedMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var desktopMQ = window.matchMedia('(min-width:701px) and (hover:hover) and (pointer:fine)');
  var section = document.getElementById('works');
  var rows = section ? Array.prototype.slice.call(section.querySelectorAll('.folder-item')) : [];
  if (!section || !rows.length) return;

  var ROW_ACTIVE_MS = 1550;     // was 1050 — exactly +500ms per this pass, nothing else recomputed
  var ROW_TRANSITION_MS = 200;  // unchanged
  var END_PAUSE_MS = 1500;      // unchanged
  // New total cycle: 4*1550 + 3*200 + 1500 = 8300ms (was 6300ms) — a direct consequence
  // of the +500ms change, not a redesigned total.

  var timer = null;
  var running = false;
  var inView = false;

  function clearActive(){
    rows.forEach(function(r){ r.classList.remove('works-row-active'); });
  }

  function activateRow(i){
    clearActive();
    rows[i].classList.add('works-row-active');
    timer = setTimeout(function(){
      clearActive();
      var next = i + 1;
      if (next >= rows.length) {
        timer = setTimeout(function(){ activateRow(0); }, END_PAUSE_MS);
      } else {
        timer = setTimeout(function(){ activateRow(next); }, ROW_TRANSITION_MS);
      }
    }, ROW_ACTIVE_MS);
  }

  function start(){
    if (running) return;
    if (desktopMQ.matches || reducedMQ.matches) return; // never on Desktop, never under reduced-motion
    running = true;
    activateRow(0);
  }
  function stop(){
    running = false;
    clearTimeout(timer);
    timer = null;
    clearActive();
  }

  // #works off-screen: stop and reset entirely (timer cleared, active class removed)
  // rather than let it run in the background — re-entering the viewport always replays
  // cleanly from row 01. This observer is harmless to attach even on Desktop: start()
  // still refuses to run there.
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        inView = entry.isIntersecting;
        if (inView) start(); else stop();
      });
    }, { threshold: 0.2 });
    io.observe(section);
  } else if (!desktopMQ.matches && !reducedMQ.matches) {
    inView = true;
    start();
  }

  // Reactive re-check: fires on breakpoint crossing, external mouse/keyboard attach or
  // detach, DevTools responsive-mode toggling, etc. Desktop must always win the stop();
  // Mobile only (re)starts if #works happens to be in view right now.
  function handleDesktopChange(){
    if (desktopMQ.matches) {
      stop();
    } else if (inView) {
      stop(); // clear any half-finished timer chain first — always restart clean from row 01
      start();
    }
  }
  if (desktopMQ.addEventListener) desktopMQ.addEventListener('change', handleDesktopChange);
  else if (desktopMQ.addListener) desktopMQ.addListener(handleDesktopChange); // older Safari

  function handleReducedChange(){
    if (reducedMQ.matches) stop();
  }
  if (reducedMQ.addEventListener) reducedMQ.addEventListener('change', handleReducedChange);
  else if (reducedMQ.addListener) reducedMQ.addListener(handleReducedChange);

  // A real tap always wins: show that row active immediately, but never delay or
  // intercept the row's own href navigation — no extra state machine beyond this. Skipped
  // entirely on Desktop, where the identical feedback is already :hover-driven.
  rows.forEach(function(row){
    row.addEventListener('pointerdown', function(){
      if (desktopMQ.matches) return;
      clearActive();
      row.classList.add('works-row-active');
    }, { passive: true });
  });
})();

/* -- MOMENTRIP Chapter 01 (.ed-a) OVERVIEW Motion Prototype: ENTER -> REVEAL -> COMPLETE
   -> STATIC per entry. Own, fully independent IntersectionObserver — never touches or
   reuses the AI Workspace's Observer/Scroll Gate/Scroll Replay above. Order: 01/OVERVIEW
   -> Overview copy -> YEAR/ROLE stagger (CSS nth-child transition-delay on
   [data-ov-ready], finishes ~760ms in) -> ~200ms pause -> Main Visual clip-path reveal +
   micro scale, started via a .96s CSS transition-delay on [data-ov-visual] (direction/
   duration/scale/easing all untouched) so Text is fully settled before Visual starts,
   rather than the two racing each other -> the two Workspace Metadata labels fade in
   550ms after that Visual start (960ms + 550ms = 1510ms after trigger).
   Play is Observer-only: the SELECTED WORKS "MOMENTRIP" menu link (same link the Chapter
   title's own retype() above listens on) only ever RESETS this back to its start state
   and re-arms the *same* Observer instance (no new Observer/timer ever created per
   click) — the actual replay is left to that Observer firing again once the user has
   actually scrolled the Chapter back into view, exactly like the original first-visit
   entry. This mirrors the title's own retype() pattern but is otherwise fully
   independent of it. */
(function(){
  var block = document.querySelector('#project-momentrip .ed-a');
  if (!block) return;
  var copy = block.querySelector('.ed-a-copy');
  var visual = block.querySelector('.ph[data-ov-visual]');
  var metas = block.querySelectorAll('.ov-meta');
  if (!copy || !visual) return;

  var menuLink = document.querySelector('#works a.folder-item[href="#project-momentrip"]');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var played = false;
  var metaTimer = null; // the one in-flight "show metadata" timeout, if any — always
    // cleared before Reset can rearm anything, so a click mid-sequence can never leave a
    // stale timer that fires after the next replay has already started its own.
  var io = null; // set below when IntersectionObserver is available; Reset re-observes
    // this same instance rather than ever constructing a new one.

  function showMetas(){
    for (var i = 0; i < metas.length; i++) metas[i].classList.add('is-visible');
  }

  function playOnce(){
    if (played) return;
    played = true;
    copy.setAttribute('data-ov-ready', 'true');
    visual.setAttribute('data-ov-visual', 'in');
    if (reduced) { showMetas(); return; }
    metaTimer = setTimeout(showMetas, 1510); // 960ms Main Visual start delay (CSS
      // transition-delay) + 550ms "Reveal started -> Metadata" offset, kept identical to
      // before — only now measured from Main Visual's own (later) start, not from trigger.
  }

  // MOMENTRIP menu click -> Reset only: never plays the sequence itself, just restores
  // every Overview element to its pre-entry state and clears any pending metadata timer,
  // so the existing Observer (still watching `block`, or re-armed here if it had already
  // fired and disconnected) is free to play the whole ENTER -> REVEAL -> COMPLETE
  // sequence again once the user actually scrolls back into the Trigger area — matching
  // the Chapter title's own "click resets, scroll-into-view plays" split above.
  function resetOverview(){
    if (metaTimer) { clearTimeout(metaTimer); metaTimer = null; }
    played = false;
    // .ov-resetting forces transition:none for the one reflow below, so the revert to
    // the start state never plays as a visible reverse-animation (on the off chance the
    // Chapter is already partly in view when this fires) — removed immediately after,
    // so the next playOnce() transitions normally.
    block.classList.add('ov-resetting');
    copy.setAttribute('data-ov-ready', 'false');
    visual.setAttribute('data-ov-visual', '');
    for (var i = 0; i < metas.length; i++) metas[i].classList.remove('is-visible');
    void block.offsetWidth; // force layout so the reverted state commits before the
      // transition:none override below is lifted
    block.classList.remove('ov-resetting');

    if (reduced || !io) { playOnce(); return; } // no Observer to rearm (reduced-motion
      // skipped creating one, or the browser lacks IntersectionObserver) — reapply the
      // instant final state directly, same as first-visit in that case.
    io.disconnect();
    io.observe(block); // re-arm the SAME instance; never construct a new one per click
  }
  if (menuLink) menuLink.addEventListener('click', resetOverview);

  if (reduced || !('IntersectionObserver' in window)) { playOnce(); return; }

  // Independent from the Chapter title's own Observer above: same rootMargin/threshold
  // shape (shrunk viewport so it can't fire before the section is actually well into
  // view), but its own instance, disconnected after each trigger fires (re-observed only
  // by resetOverview() above, never duplicated).
  io = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if (entry.isIntersecting) {
        playOnce();
        io.disconnect();
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -20% 0px' });
  io.observe(block);
})();

/* -- MOMENTRIP Chapter 02 (.ed-b) PROBLEM Motion PROTOTYPE #6: "Elliptical Search Loop"
   (Desktop only) — NOT final design, a KEEP/MODIFY/REJECT prototype. Desktop-only rework
   of Prototype #5's Trace/Point system; Mobile's own flow (runMobileSequence() below) is
   the SAME code Prototype #5 used, untouched in behavior — ABSOLUTE LOCK this round.

   DESKTOP: 5 Fragments sit around a wide ellipse (see ellipseGeometry()/DESKTOP_ANGLES_DEG)
   and the Trace now runs as 5 elliptical-arc <path> segments (PLACE→CLASS→EVENT→
   COMMUNITY→COURSE→back-to-PLACE, clockwise, closing the full orbit) instead of straight
   <line> segments. The traveling Point still syncs 1:1 to whichever segment is drawing,
   now via CSS Motion Path (offset-path set to the SAME arc `d` the segment itself draws +
   offset-distance transitioned on the SAME duration/easing as that segment's
   stroke-dashoffset) instead of straight-line cx/cy — same "one value, two properties,
   same tick" guarantee against drift as before, just riding a curve instead of a chord.
   Once the orbit closes, the Point fades out and SEARCH AGAIN_ types itself in beside the
   Open Gap's own edge (RE-ENTRY SIGNAL Prototype — position/Typography live in style.css's
   .scatter-hint min-width:701px block; revealCenterText() below is unchanged, it still
   just writes into this element's existing first text node instead of showing it as a
   static caption, only WHERE that element sits on screen moved).

   MOBILE: unchanged 6-node Journey (5 Fragments + the Hint as a real 6th node, 5 straight
   <line> segments) — runMobileSequence() is Prototype #5's runSequence() renamed, not
   rewritten.

   Both flows share: the same Reset/Reload contract (CSS-default hidden state, no cached
   geometry — resetLines() now clears both the Mobile <line> set and the Desktop <path>
   set every time regardless of which one is active, so neither breakpoint can ever leave
   the other's stale geometry behind after a resize — the original "ghost line" bug fix),
   the same IntersectionObserver/scroll-position Reset, and the same resize/
   orientationchange handling (which now also re-decides Mobile-vs-Desktop on every fire,
   never reusing one breakpoint's Trace/Point/Hint state under the other's layout).
   Touches nothing outside #project-momentrip .ed-b. */
(function(){
  var block = document.querySelector('#project-momentrip .ed-b');
  if (!block) return;
  var canvas = block.querySelector('.scatter-canvas');
  if (!canvas) return;
  var words = Array.prototype.slice.call(canvas.querySelectorAll('.scatter-word[data-word]'));
  var hint = canvas.querySelector('.scatter-hint[data-hint]');
  var mobileLines = Array.prototype.slice.call(canvas.querySelectorAll('.trace-line[data-trace]'));
  var desktopArcs = Array.prototype.slice.call(canvas.querySelectorAll('.trace-arc[data-trace-arc]'));
  var point = canvas.querySelector('.trace-point[data-trace-point]');
  if (!words.length || !mobileLines.length || !desktopArcs.length || !hint || !point) return;
  // Mobile Journey order only: the 5 Fragments, then the Hint itself as the 6th/final
  // node (Desktop no longer treats the Hint as an orbit node — see runDesktopSequence()).
  var mobileNodes = words.concat([hint]);
  var CENTER_TEXT = 'SEARCH AGAIN';
  // PLACE/CLASS/EVENT/COMMUNITY/COURSE, clockwise around the ellipse, 5 clear compass
  // positions (top / right-up / right-bottom / left-bottom / left) 65-80° apart instead
  // of the previous irregular quadrant scatter — see completion report for the full
  // angular-span table.
  var DESKTOP_ANGLES_DEG = [270, 335, 45, 125, 200];
  // 5./6. — PLACE only: a small optical lift straight up from its true ellipse point, so
  // it clears more Negative Space toward the center Hint. Ellipse cx/cy/rx/ry themselves
  // are never touched (9.) — this shifts a single Anchor point after computing it from
  // the ellipse formula, and because everything below (the Path endpoint, the Point's
  // resting/arrival center, and the word's own position) all read that SAME shifted
  // value, "Path endpoint = Point center = Node Anchor" still holds exactly (2.).
  var PLACE_Y_LIFT = 18;

  // "OPEN ORBIT" Prototype (Desktop only — Mobile's own 6-node straight-line Journey below
  // never reads any of this) — segments 0 (PLACE→CLASS) and 4 (COURSE→PLACE) are the only
  // two that touch PLACE, meeting exactly at the SAME pts[0] anchor. Holding open a small
  // Gap there means pulling each of those two segments' PLACE-adjacent end back by half the
  // Gap's own arc length, so they stop just short of each other instead of meeting flush —
  // symmetric around PLACE because both trims are equal ARC LENGTH measured from that same
  // shared point, one going each direction along the ellipse. This only ever changes what
  // the VISIBLE stroke (see visibleSegmentD()) draws — the traveling Point keeps riding the
  // FULL, untrimmed arc (drawDesktopSegment() below still builds point.offsetPath from the
  // original `d`, never from visibleSegmentD()'s trimmed one), so Point Travel/Speed/Timing
  // are byte-for-byte what they were before this Prototype.
  var OPEN_GAP_FRACTION = 0.10; // ~10% of the Ellipse's own circumference held open (8-12%
    // requested range) — 5% pulled back from each side of PLACE.
  function ellipseCircumference(rx, ry){
    // Ramanujan's second approximation — closed-form, no DOM measurement needed, accurate
    // to a small fraction of a percent for any rx/ry ratio this Ellipse could plausibly hit.
    var h = Math.pow((rx - ry) / (rx + ry), 2);
    return Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
  }
  var gapMeasurePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  function arcLen(d){ gapMeasurePath.setAttribute('d', d); return gapMeasurePath.getTotalLength(); }
  function arcPointAt(d, atLen){
    gapMeasurePath.setAttribute('d', d);
    var p = gapMeasurePath.getPointAtLength(Math.max(0, atLen));
    return { x: p.x, y: p.y };
  }
  // Returns the VISIBLE stroke `d` for segment i — identical to the full arc `d` for every
  // segment except 0 and 4, where the PLACE-adjacent end is pulled back by half the Open
  // Gap's arc length (clamped to at most 45% of that segment's own length, so a segment can
  // never be trimmed away to nothing). `d` must already be the FULL, untrimmed arc string
  // for segment i — this never mutates it, only reads a trimmed sub-arc from it via
  // getPointAtLength(), which is guaranteed to land exactly back on the same ellipse.
  function visibleSegmentD(i, d, a, b, geo){
    if (i !== 0 && i !== 4) return d;
    var full = arcLen(d);
    var half = Math.min(ellipseCircumference(geo.rx, geo.ry) * OPEN_GAP_FRACTION / 2, full * 0.45);
    if (i === 0) {
      var newStart = arcPointAt(d, half);
      return 'M ' + newStart.x + ' ' + newStart.y + ' A ' + geo.rx + ' ' + geo.ry + ' 0 0 1 ' + b.x + ' ' + b.y;
    }
    var newEnd = arcPointAt(d, full - half);
    return 'M ' + a.x + ' ' + a.y + ' A ' + geo.rx + ' ' + geo.ry + ' 0 0 1 ' + newEnd.x + ' ' + newEnd.y;
  }

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var played = false;
  var sequenceToken = 0; // bumped by stopSequence(); every in-flight awaited step checks
    // this and bails silently the instant it no longer matches, so a Reset or resize can
    // never leave a stray timer still writing into the DOM afterward
  var settleTimer = null; // entrance -> Sequence start gap
  var stepTimer = null;   // pop+pause/draw/typing gap (shared — only one is ever pending)

  // 11.: ~800-1000ms per segment draw, ~210ms arrival pop (matches the CSS @keyframes
  // duration exactly), ~190ms pause before the next segment — same speed on both
  // breakpoints, unchanged from Prototype #5. Desktop's arc lengths are longer than
  // Mobile's chords at this canvas size, so most segments land on the 800ms floor —
  // which is exactly what keeps the Orbit's apparent speed consistent segment-to-segment
  // (12./"Orbit을 눈으로 따라갈 수 있는지가 더 중요") without hand-tuning each one.
  var MS_PER_PX = 1.15, MIN_DRAW_MS = 800, MAX_DRAW_MS = 1000;
  var POP_MS = 210, PAUSE_MS = 190;
  var ENTRANCE_SETTLE_MS = 520;
  var POINT_FADE_MS = 300; // also serves as the 250-400ms pause before the center Reveal

  function nodeCenter(el){
    var canvasRect = canvas.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    return { x: r.left - canvasRect.left + r.width / 2, y: r.top - canvasRect.top + r.height / 2 };
  }
  function isDesktopNow(){ return window.matchMedia('(min-width:701px)').matches; }
  function ellipseGeometry(){
    var r = canvas.getBoundingClientRect();
    return { cx: r.width * 0.5, cy: r.height * 0.5, rx: r.width * 0.40, ry: r.height * 0.30 };
  }
  function pointOnEllipse(geo, deg){
    var rad = deg * Math.PI / 180;
    return { x: geo.cx + geo.rx * Math.cos(rad), y: geo.cy + geo.ry * Math.sin(rad) };
  }
  // 5./8./9. — the single Anchor System: measures the ellipse fresh, computes each
  // Fragment's Anchor point (same formula drawDesktopSegment()/showFinalState() use for
  // the Path endpoints and the Point's resting/arrival center), and writes it onto that
  // word as --node-x/--node-y so its own CSS position derives from the EXACT same point,
  // not a separately-guessed one. Called once per play (from playOnce(), before
  // data-problem-ready flips true) and on every resize-triggered replay, so Path/Point/
  // Text can never drift apart and never reuse stale geometry across a breakpoint change.
  function applyDesktopAnchors(){
    var geo = ellipseGeometry();
    var pts = DESKTOP_ANGLES_DEG.map(function(deg){ return pointOnEllipse(geo, deg); });
    pts[0] = { x: pts[0].x, y: pts[0].y - PLACE_Y_LIFT }; // PLACE's optical lift (5./6.),
      // applied once here so every downstream consumer of pts[0] — the word's own
      // --node-x/--node-y below, the Point's resting/arrival center, and both arc
      // endpoints that touch PLACE (segment 0's start, the closing segment's end) — all
      // read this exact same shifted point, never the raw un-lifted ellipse formula.
    words.forEach(function(w, i){
      w.style.setProperty('--node-x', pts[i].x + 'px');
      w.style.setProperty('--node-y', pts[i].y + 'px');
    });
    return { geo: geo, pts: pts };
  }
  function wait(ms){ return new Promise(function(resolve){ stepTimer = setTimeout(resolve, ms); }); }
  function popPoint(){
    point.classList.remove('is-popping');
    void point.getBoundingClientRect(); // force reflow so the animation restarts cleanly
      // on every arrival, including Replay
    point.classList.add('is-popping');
  }

  // MOBILE — draws Line i (node i -> node i+1) while moving the Point along it in
  // lock-step, exactly as Prototype #5 did (renamed only). Both the Line's
  // stroke-dashoffset and the Point's cx/cy are driven as CSS transitions on the SAME
  // duration + SAME timing-function, started in the same synchronous tick — the browser's
  // own compositor guarantees they report the same progress at any instant. Geometry is
  // measured fresh every single call — never cached across plays or across a resize.
  function drawMobileSegment(i, token){
    return new Promise(function(resolve){
      var line = mobileLines[i];
      var a = nodeCenter(mobileNodes[i]), b = nodeCenter(mobileNodes[i + 1]);
      var len = Math.hypot(b.x - a.x, b.y - a.y);
      var duration = Math.max(MIN_DRAW_MS, Math.min(MAX_DRAW_MS, len * MS_PER_PX));
      var durS = (duration / 1000) + 's';

      line.style.transition = 'none';
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
      line.style.strokeDasharray = String(len);
      line.style.strokeDashoffset = String(len);
      line.style.opacity = '1';
      point.style.offsetPath = 'none';
      point.style.transition = 'none';
      point.style.cx = a.x + 'px';
      point.style.cy = a.y + 'px';
      void line.getBoundingClientRect(); // force both "from" states to commit before...
      void point.getBoundingClientRect();

      line.style.transition = 'stroke-dashoffset ' + durS + ' cubic-bezier(.22,.7,.4,1)';
      point.style.transition = 'cx ' + durS + ' cubic-bezier(.22,.7,.4,1), cy ' + durS + ' cubic-bezier(.22,.7,.4,1), opacity .3s ease';
      line.style.strokeDashoffset = '0'; // ...these become the transitions' ("to") values
      point.style.cx = b.x + 'px';
      point.style.cy = b.y + 'px';

      stepTimer = setTimeout(function(){
        if (token !== sequenceToken) return; // Reset/resize fired mid-draw — abandon, no resolve
        resolve();
      }, duration);
    });
  }

  // DESKTOP — draws elliptical-arc segment i (a -> b, both real points on the SAME
  // ellipse) while moving the Point along that exact arc via CSS Motion Path. large-arc-
  // flag is always 0 (every one of the 5 segments' angular span here is well under 180°)
  // and sweep-flag is always 1 (clockwise, matching DESKTOP_ANGLES_DEG's increasing-angle
  // = clockwise convention in nodeCenter's screen coordinate space) — see completion
  // report for the per-segment angular spans. offset-distance and stroke-dashoffset are
  // transitioned on the SAME duration/easing, started in the same tick, exactly the same
  // "single source of progress" guarantee drawMobileSegment() uses for cx/cy.
  function drawDesktopSegment(i, a, b, geo, token){
    return new Promise(function(resolve){
      var path = desktopArcs[i];
      var d = 'M ' + a.x + ' ' + a.y + ' A ' + geo.rx + ' ' + geo.ry + ' 0 0 1 ' + b.x + ' ' + b.y;
      // duration is always derived from the FULL, untrimmed arc length (`d`/`len`), never
      // from the visible/trimmed one below — this is what keeps Draw Motion's speed/
      // duration/timing identical to before the Open Orbit Prototype, on every segment.
      var len = arcLen(d);
      var duration = Math.max(MIN_DRAW_MS, Math.min(MAX_DRAW_MS, len * MS_PER_PX));
      var durS = (duration / 1000) + 's';
      // Only segments 0/4 (the two touching PLACE) ever differ from `d` here — see
      // visibleSegmentD(). The STROKE reveals this trimmed shape; the POINT below still
      // rides the full `d` untouched, so it never jumps/pauses through the Open Gap.
      var dVisible = visibleSegmentD(i, d, a, b, geo);
      path.setAttribute('d', dVisible);
      var visLen = (dVisible === d) ? len : arcLen(dVisible);

      path.style.transition = 'none';
      path.style.strokeDasharray = String(visLen);
      path.style.strokeDashoffset = String(visLen);
      path.style.opacity = '1';
      point.style.transition = 'none';
      point.style.offsetPath = 'path("' + d + '")';
      point.style.offsetRotate = '0deg';
      point.style.offsetDistance = '0%';
      void path.getBoundingClientRect(); // force both "from" states to commit before...
      void point.getBoundingClientRect();

      path.style.transition = 'stroke-dashoffset ' + durS + ' cubic-bezier(.22,.7,.4,1)';
      point.style.transition = 'offset-distance ' + durS + ' cubic-bezier(.22,.7,.4,1), opacity .3s ease';
      path.style.strokeDashoffset = '0';
      point.style.offsetDistance = '100%';

      stepTimer = setTimeout(function(){
        if (token !== sequenceToken) return;
        resolve();
      }, duration);
    });
  }

  // Resets the Hint's DOM back to its one true baseline — a single (possibly empty) text
  // node followed by the untouched .cursor span — regardless of whether
  // revealCenterText() below has since rebuilt it into per-character <span>s. Called by
  // resetNodes() on every Reset/resize/Reload-equivalent, and by showFinalState() (which
  // wants the plain full-text baseline, no reveal spans, for its instant reduced-motion
  // display) before writing CENTER_TEXT straight onto the resulting text node.
  function resetHintContent(){
    var cursorEl = hint.querySelector('.cursor');
    while (hint.firstChild && hint.firstChild !== cursorEl) {
      hint.removeChild(hint.firstChild);
    }
    if (cursorEl) cursorEl.classList.remove('is-in');
    hint.insertBefore(document.createTextNode(isDesktopNow() ? '' : CENTER_TEXT), cursorEl);
  }

  // 7./8. — Display Reveal: rebuilds the Hint's text as one <span class="hint-char"> per
  // character (a space becomes   so it still occupies width), each fading/settling
  // in on its own transition-delay stagger, then the Caret becomes visible only once the
  // last character has actually settled. Total ~55ms/char stagger + ~220ms settle — for
  // "SEARCH AGAIN" (12 characters) that is (11*55)+220 = 825ms, inside the requested
  // 700-1000ms window. Mobile's own flow never calls this — its Hint is still the plain
  // static text Prototype #5 always used, opacity-revealed at entrance, untouched.
  var CHAR_STAGGER_MS = 55, CHAR_SETTLE_MS = 220;
  function revealCenterText(token){
    return new Promise(function(resolve){
      var cursorEl = hint.querySelector('.cursor');
      resetHintContent(); // clears any stale spans first, guarantees a clean rebuild
      var frag = document.createDocumentFragment();
      var spans = CENTER_TEXT.split('').map(function(ch){
        var s = document.createElement('span');
        s.className = 'hint-char';
        s.textContent = ch === ' ' ? ' ' : ch;
        s.style.transitionDelay = '0s';
        frag.appendChild(s);
        return s;
      });
      hint.replaceChild(frag, hint.firstChild); // swaps the empty text node for all the
        // character spans at once, still ahead of the .cursor span
      void hint.offsetWidth; // force the all-hidden state to commit before...
      spans.forEach(function(s, i){
        s.style.transitionDelay = (i * CHAR_STAGGER_MS / 1000) + 's';
        s.classList.add('is-in'); // ...this staggers each one in
      });
      var totalMs = (spans.length - 1) * CHAR_STAGGER_MS + CHAR_SETTLE_MS;
      stepTimer = setTimeout(function(){
        if (token !== sequenceToken) return;
        if (cursorEl) cursorEl.classList.add('is-in'); // Caret only after the last letter
        resolve();
      }, totalMs);
    });
  }

  async function runMobileSequence(token){
    if (token !== sequenceToken) return;
    var origin = nodeCenter(mobileNodes[0]);
    point.style.offsetPath = 'none';
    point.setAttribute('cx', String(origin.x));
    point.setAttribute('cy', String(origin.y));
    point.style.opacity = '1';
    mobileNodes[0].classList.add('is-visited'); // origin lights up the moment the Journey
      // selects it, same as every later arrival — otherwise PLACE stays dim the whole
      // Sequence while everything it "led to" brightens, reading inconsistently
    popPoint();
    await wait(POP_MS + 120);
    if (token !== sequenceToken) return;

    for (var i = 0; i < mobileLines.length; i++) {
      await drawMobileSegment(i, token);
      if (token !== sequenceToken) return;
      mobileNodes[i + 1].classList.add('is-visited');
      popPoint();
      await wait(POP_MS + PAUSE_MS);
      if (token !== sequenceToken) return;
    }

    point.style.opacity = '0'; // Journey's over — the traveling Point does not sit on
      // screen once Final State is reached
    await wait(POINT_FADE_MS);
    if (token !== sequenceToken) return;
    block.classList.add('problem-done');
  }

  async function runDesktopSequence(token, anchors){
    if (token !== sequenceToken) return;
    var geo = anchors.geo, pts = anchors.pts; // same Anchor applyDesktopAnchors() already
      // wrote onto the words themselves (5./8.) — never re-measured/re-guessed here

    point.style.offsetPath = 'none';
    point.setAttribute('cx', String(pts[0].x));
    point.setAttribute('cy', String(pts[0].y));
    point.style.opacity = '1';
    words[0].classList.add('is-visited'); // PLACE — Journey's own starting selection
    popPoint();
    await wait(POP_MS + 120);
    if (token !== sequenceToken) return;

    for (var i = 0; i < desktopArcs.length; i++) {
      var a = pts[i];
      var b = (i < 4) ? pts[i + 1] : pts[0]; // segment 5 (COURSE) closes the loop back to PLACE
      await drawDesktopSegment(i, a, b, geo, token);
      if (token !== sequenceToken) return;
      if (i < 4) words[i + 1].classList.add('is-visited');
      popPoint(); // segment 5's pop is the Orbit-closed "returned to PLACE" beat
      await wait(POP_MS + PAUSE_MS);
      if (token !== sequenceToken) return;
    }

    point.style.opacity = '0'; // Orbit complete — Point fades before the center text
    await wait(POINT_FADE_MS); // 12.: doubles as the 250-400ms pause before the Reveal
    if (token !== sequenceToken) return;
    hint.style.opacity = '1';
    await revealCenterText(token);
    if (token !== sequenceToken) return;
    hint.classList.add('is-visited');
    block.classList.add('problem-done');
  }

  function runSequence(token, anchors){
    return isDesktopNow() ? runDesktopSequence(token, anchors) : runMobileSequence(token);
  }

  function showFinalState(anchors){
    block.setAttribute('data-problem-ready', 'true');
    block.classList.add('problem-done');
    words.forEach(function(w){ w.classList.add('is-visited'); });
    hint.classList.add('is-visited');
    point.style.offsetPath = 'none';
    point.style.opacity = '0'; // reduced motion: no travel, so no Point ever shown
    if (isDesktopNow()) {
      var geo = anchors.geo, pts = anchors.pts;
      desktopArcs.forEach(function(path, i){
        var a = pts[i], b = (i < 4) ? pts[i + 1] : pts[0];
        var d = 'M ' + a.x + ' ' + a.y + ' A ' + geo.rx + ' ' + geo.ry + ' 0 0 1 ' + b.x + ' ' + b.y;
        path.setAttribute('d', visibleSegmentD(i, d, a, b, geo)); // reduced motion: same
          // Open Gap trim as the animated path (segments 0/4 only) — no travel to show a
          // Point along either way, so only the stroke shape matters here.
        path.style.strokeDasharray = '0';
        path.style.strokeDashoffset = '0';
        path.style.opacity = '1';
      });
      resetHintContent(); // guarantees a plain text node, undoing any leftover
        // per-character <span> rebuild from a previous non-reduced-motion play
      hint.childNodes[0].nodeValue = CENTER_TEXT;
      var cursorEl = hint.querySelector('.cursor');
      if (cursorEl) cursorEl.classList.add('is-in'); // reduced motion: Caret shown
        // instantly alongside everything else, no staggered Reveal to wait on
      hint.style.opacity = '1';
    } else {
      var mpts = mobileNodes.map(nodeCenter);
      mobileLines.forEach(function(line, i){
        var a = mpts[i], b = mpts[i + 1];
        line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
        line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
        line.style.strokeDasharray = '0';
        line.style.strokeDashoffset = '0';
        line.style.opacity = '1';
      });
    }
  }

  function playOnce(){
    if (played) return;
    played = true;
    // Desktop's Anchors are computed HERE, synchronously, before data-problem-ready ever
    // flips true — the entrance transition (CSS, starts the instant that attribute
    // changes) reads --node-x/--node-y immediately, so they must already be correct by
    // then, not filled in later once the Sequence itself gets around to it.
    var anchors = isDesktopNow() ? applyDesktopAnchors() : null;
    if (reduced) { showFinalState(anchors); return; }
    block.setAttribute('data-problem-ready', 'true');
    var token = ++sequenceToken;
    settleTimer = setTimeout(function(){ runSequence(token, anchors); }, ENTRANCE_SETTLE_MS);
  }

  // Reset = remove every inline style/attribute JS ever set, full stop, on BOTH the
  // Mobile <line> set AND the Desktop <path> set every time regardless of which
  // breakpoint is currently active — this is what guarantees a breakpoint change can
  // never leave the OTHER breakpoint's stale geometry rendering ("ghost line"/"ghost
  // arc"), since neither set is ever left holding onto values from a previous play. No
  // cached length, no computed "hidden" value — falls straight back to the CSS-default
  // hidden state, exactly what a fresh page load also starts from.
  function resetLines(){
    mobileLines.concat(desktopArcs).forEach(function(el){
      el.removeAttribute('style');
      el.removeAttribute('x1'); el.removeAttribute('y1');
      el.removeAttribute('x2'); el.removeAttribute('y2');
      el.removeAttribute('d');
    });
  }
  function resetPoint(){
    point.removeAttribute('style');
    point.classList.remove('is-popping');
    point.setAttribute('cx', '-100'); point.setAttribute('cy', '-100');
  }
  function resetNodes(){
    words.forEach(function(w){
      w.classList.remove('is-visited');
      // Desktop's Anchor vars — applyDesktopAnchors() always rewrites these fresh before
      // the next play, but clearing them here keeps Reset byte-identical to a fresh
      // pageload.
      w.style.removeProperty('--node-x'); w.style.removeProperty('--node-y');
    });
    hint.classList.remove('is-visited');
    hint.style.opacity = '';
    // Desktop always resets the center text back to empty (revealed fresh every play);
    // Mobile's own first text node is always the full static string. resetHintContent()
    // also undoes revealCenterText()'s per-character <span> rebuild and hides the Caret
    // again, so a mid-Reveal resize can never strand a half-revealed word or a stray
    // visible Caret on either side.
    resetHintContent();
  }
  function stopSequence(){
    sequenceToken++; // invalidates any in-flight awaited step immediately
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
    if (stepTimer) { clearTimeout(stepTimer); stepTimer = null; }
  }

  // Scroll-up Reset: same RESET_DISTANCE ratio the AI Workspace's own checkReset uses
  // (innerHeight * 1.15). .problem-resetting forces transition/animation:none for the one
  // reflow below, so the revert (Fragments, Trace Lines, Point, Hint alike) never plays as
  // a visible reverse-animation, and always leaves the block ready to play the full
  // Journey from PLACE again on the next Replay.
  var RESET_DISTANCE = 1.15;
  function resetBlock(){
    played = false;
    stopSequence();
    block.classList.add('problem-resetting');
    block.classList.remove('problem-done');
    block.setAttribute('data-problem-ready', 'false');
    resetLines();
    resetPoint();
    resetNodes();
    void block.offsetWidth; // force layout so the reverted state commits before the
      // transition/animation:none override below is lifted
    block.classList.remove('problem-resetting');
  }

  // 18.: on Desktop, the raw HTML still has the static "SEARCH AGAIN" text in the Hint's
  // first text node (needed so Mobile can show it immediately/statically) — clear it once
  // up front so a fresh Desktop pageload's DOM state is byte-for-byte the same "no center
  // text yet" state resetBlock() itself produces, not just visually hidden via opacity.
  resetNodes();

  var io = null;
  function armObserver(){
    if (reduced || !('IntersectionObserver' in window)) return;
    io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (entry.isIntersecting) {
          playOnce();
          io.disconnect();
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -20% 0px' });
    io.observe(block);
  }

  if (reduced || !('IntersectionObserver' in window)) { playOnce(); }
  else { armObserver(); }

  window.addEventListener('scroll', function(){
    if (!played) return;
    var rect = block.getBoundingClientRect();
    if (rect.top > window.innerHeight * RESET_DISTANCE) {
      resetBlock();
      if (io) { io.disconnect(); io.observe(block); } // re-arm the SAME instance
    }
  }, { passive: true });

  // ---- Resize / breakpoint-change handling — the actual fix for the Mobile<->Desktop
  // "ghost line" bug (see file-header note above). Only a WIDTH change resets/replays —
  // height-only changes (e.g. a mobile browser's URL bar hiding/showing on scroll) are
  // ignored so this never fires on pure vertical noise unrelated to layout. On a real
  // width change: cancel every in-flight timer/rAF, fully reset Lines/Point/Fragments/Hint
  // to the CSS-default hidden state (old geometry is never reused across the change), then
  // waits for the new breakpoint's layout to actually commit before deciding whether to
  // replay — Desktop and Mobile geometry are therefore always measured fresh and never
  // shared. A short setTimeout (not requestAnimationFrame) does the "wait for layout"
  // step here, for the same reason the draw functions above use CSS transitions instead
  // of rAF: rAF never fires at all while document.hidden is true, which this environment
  // can report even for a focused tab, and setTimeout is what every other Motion IIFE on
  // this page already relies on for sequencing.
  var lastWidth = window.innerWidth;
  var resizeTimer = null;
  var resizeSettleTimer = null;
  function handleResize(){
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    var wasPlayed = played;
    resetBlock();
    if (!wasPlayed) return; // never played yet (still above the Trigger Zone) — IO already
      // handles that normally, nothing to replay right now
    if (resizeSettleTimer) clearTimeout(resizeSettleTimer);
    resizeSettleTimer = setTimeout(function(){
      var rect = block.getBoundingClientRect();
      var inView = rect.top < window.innerHeight && rect.bottom > 0;
      if (inView) {
        playOnce(); // new breakpoint's geometry, Journey from PLACE again
      } else if (io) {
        io.disconnect();
        io.observe(block); // off-screen after resize — wait for it to scroll back in
      }
    }, 60);
  }
  window.addEventListener('resize', function(){
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(handleResize, 180);
  }, { passive: true });
  window.addEventListener('orientationchange', function(){
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(handleResize, 180);
  }, { passive: true });
})();

/* -- MIVY Minimum Case Study: scoped scroll reveal. Deliberately the smallest possible
   motion — one class toggled per block by one IntersectionObserver, reusing the same
   fade/rise language already on the page. No scroll scene, no parallax, no timeline, no
   canvas, no library. Fully self-contained: it only ever reads #project-mivy and writes
   .is-visible on that section's own [data-mivy-reveal] children, so no other section,
   selector, observer or timer on the page is shared or touched.
   Fail-safe by construction — .mivy-motion-ready (the class that arms the CSS hidden
   state, see style.css) is added ONLY after IntersectionObserver support is confirmed, so
   if this IIFE never runs or the browser lacks the API the case study still renders fully
   visible. One-shot per block: reveal is an entrance, not a repeating effect. */
(function(){
  var section = document.getElementById('project-mivy');
  if (!section) return;
  var blocks = section.querySelectorAll('[data-mivy-reveal]');
  if (!blocks.length) return;
  if (!('IntersectionObserver' in window)) return; // leave everything visible

  section.classList.add('mivy-motion-ready');
  // Same shrunk-viewport gate the MOMENTRIP title and the AI Workspace already use
  // (threshold .1 + rootMargin '0px 0px -12% 0px') so a block only counts as visible once
  // it has genuinely entered the viewport, not the instant it grazes the bottom edge.
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      io.unobserve(entry.target);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -12% 0px' });
  Array.prototype.forEach.call(blocks, function(b){ io.observe(b); });
})();

/* -- MOMENTRIP image lightbox (DESIGN PROCESS 01/03, BEFORE/AFTER). Any
   #project-momentrip [data-lightbox] box opens its 2x capture over a 50% black backdrop;
   a click anywhere on it (image or backdrop) or ESC closes it and focus returns to the
   box that opened it. The Stage is never restyled: wheel/touch/scroll keys are simply
   swallowed while open, so neither #v2-host nor the Mobile page moves and no scrollbar
   disappears/reappears underneath. The thumbnail is shown at the final size first and
   swapped for the 2x file once that has loaded (same aspect ratio by construction).
   data-lightbox="html" (DESIGN PROCESS 02, the HTML/CSS token card) shows a live copy of
   the box itself instead of an image: laid out at a fixed 600x375 (the card's 8:5) and
   enlarged with CSS zoom, so the text is re-rendered at size, not scaled pixels. On narrow
   screens the zoom never drops below HTML_MIN_ZOOM; the copy reflows narrower instead and
   the sheet scrolls inside if it ever gets taller than the screen. */
(function(){
  var triggers = document.querySelectorAll('#project-momentrip [data-lightbox]');
  if (!triggers.length) return;
  var cursor = document.getElementById('custom-cursor');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SCROLL_KEYS = { ' ':1, 'Spacebar':1, 'ArrowUp':1, 'ArrowDown':1, 'ArrowLeft':1, 'ArrowRight':1, 'PageUp':1, 'PageDown':1, 'Home':1, 'End':1 };
  var HTML_W = 600, HTML_H = 375, HTML_MIN_ZOOM = 1.35;
  var box = null, img = null, sheet = null, copy = null, current = null, thumb = null, hi = null, hideTimer = null;

  function build(){
    box = document.createElement('div');
    box.className = 'lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.tabIndex = -1;
    box.hidden = true;
    img = document.createElement('img');
    img.className = 'lightbox-img';
    img.decoding = 'async';
    box.appendChild(img);
    sheet = document.createElement('div');
    sheet.className = 'lightbox-sheet';
    sheet.hidden = true;
    box.appendChild(sheet);
    box.addEventListener('click', close); // image, HTML copy or backdrop — all close
    box.addEventListener('wheel', function(e){
      if (!sheetScrolls()) e.preventDefault(); // only an overflowing sheet scrolls itself
    }, { passive:false });
    box.addEventListener('touchmove', function(e){
      // one-finger drag would scroll the page underneath — block it; pinch-zoom (and
      // panning while zoomed in) stays available so phones can still read fine print
      if (e.touches.length > 1) return;
      if (window.visualViewport && window.visualViewport.scale > 1.01) return;
      if (sheetScrolls()) return; // overscroll-behavior keeps it from chaining outward
      e.preventDefault();
    }, { passive:false });
    box.addEventListener('mouseover', function(){ if (cursor) cursor.classList.add('is-hover'); });
    document.body.appendChild(box);
  }
  function sheetScrolls(){ return !!copy && sheet.scrollHeight > sheet.clientHeight + 1; }

  // fit the source ratio inside the viewport (never larger than the screen)
  function fit(){
    if (copy) return fitHtml();
    if (!current || !thumb) return;
    var nw = thumb.naturalWidth || +thumb.getAttribute('width');
    var nh = thumb.naturalHeight || +thumb.getAttribute('height');
    var s = Math.min(window.innerWidth * 0.92 / nw, window.innerHeight * 0.9 / nh);
    img.style.width = Math.round(nw * s) + 'px';
    img.style.height = Math.round(nh * s) + 'px';
  }
  function fitHtml(){
    var vw = window.innerWidth * 0.92, vh = window.innerHeight * 0.9;
    var z = Math.min(vw / HTML_W, vh / HTML_H), w = HTML_W;
    if (z < HTML_MIN_ZOOM) { z = HTML_MIN_ZOOM; w = Math.floor(vw / z); }
    copy.classList.toggle('is-narrow', w < HTML_W);
    copy.style.width = w + 'px';
    copy.style.zoom = z;
  }

  // a live copy of the card, stripped of its trigger role so it is just a picture
  function makeCopy(trigger){
    var c = trigger.cloneNode(true);
    ['id', 'role', 'tabindex', 'aria-haspopup', 'aria-label', 'data-lightbox', 'data-lightbox-alt'].forEach(function(a){ c.removeAttribute(a); });
    c.classList.remove('zoomable');
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', trigger.getAttribute('data-lightbox-alt') || '');
    return c;
  }

  function onKey(e){
    if (!current) return;
    if (e.repeat) { e.preventDefault(); return; } // a held Enter/Space must not re-toggle
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault(); e.stopPropagation(); // not also an ESC for the V2 Navigation
      close();
    } else if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation(); // nothing behind the overlay may react
      close();
    } else if (e.key === 'Tab') {
      e.preventDefault(); // the dialog is the only focus stop while open
    } else if (SCROLL_KEYS[e.key]) {
      e.preventDefault();
      if (e.key === ' ' || e.key === 'Spacebar') close(); // Space toggles it back, like a click
      else if (sheetScrolls()) { // an overflowing HTML sheet still scrolls by keyboard
        var step = { ArrowUp:-40, ArrowDown:40, PageUp:-sheet.clientHeight * 0.9, PageDown:sheet.clientHeight * 0.9, Home:-1e6, End:1e6 }[e.key];
        if (step) sheet.scrollTop += step;
      }
    }
  }

  function open(trigger){
    if (current) return;
    if (!box) build();
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    current = trigger;
    if (copy) { copy.remove(); copy = null; }
    if (trigger.getAttribute('data-lightbox') === 'html') {
      thumb = null;
      img.hidden = true;
      img.removeAttribute('src');
      copy = makeCopy(trigger);
      sheet.appendChild(copy);
      sheet.hidden = false;
      sheet.scrollTop = 0;
      box.setAttribute('aria-label', trigger.getAttribute('data-lightbox-alt') || '확대 보기');
      fit();
    } else {
      sheet.hidden = true;
      img.hidden = false;
      thumb = trigger.querySelector('img');
      img.alt = thumb ? thumb.alt : '';
      box.setAttribute('aria-label', (thumb && thumb.alt) || '확대 이미지');
      img.src = thumb.currentSrc || thumb.src;
      fit();
      hi = new Image();
      hi.onload = function(){ if (current === trigger) img.src = hi.src; };
      hi.src = trigger.getAttribute('data-lightbox');
    }

    box.hidden = false;
    void box.offsetWidth;
    box.classList.add('is-open');
    box.focus({ preventScroll:true });
    // the opening click is still bubbling: V2's outside-click handler may close an open
    // Navigation and focus its guide after this — take focus back once it has settled
    setTimeout(function(){ if (current === trigger) box.focus({ preventScroll:true }); }, 0);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', fit);
  }

  function close(){
    if (!current) return;
    var trigger = current;
    current = null;
    if (hi) { hi.onload = null; hi = null; }
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', fit);
    box.classList.remove('is-open');
    if (cursor) cursor.classList.remove('is-hover');
    hideTimer = setTimeout(function(){
      box.hidden = true; hideTimer = null;
      if (copy) { copy.remove(); copy = null; }
    }, reduced ? 0 : 200);
    trigger.focus({ preventScroll:true });
  }

  Array.prototype.forEach.call(triggers, function(t){
    t.addEventListener('click', function(){ open(t); });
    t.addEventListener('keydown', function(e){
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); open(t); }
    });
    t.addEventListener('mouseenter', function(){ if (cursor) cursor.classList.add('is-hover'); });
    t.addEventListener('mouseleave', function(){ if (cursor) cursor.classList.remove('is-hover'); });
  });
})();
