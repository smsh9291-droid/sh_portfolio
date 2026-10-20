/* ============================================================================
   PORTFOLIO WORKSPACE V2 — Desktop interaction controller (>= 1024px)
   ----------------------------------------------------------------------------
   Deliberately a SEPARATE file from js/main.js: nothing in here reads, writes or
   re-times any of the existing IIFEs (Hero opening sequence, custom cursor,
   MOMENTRIP title / OVERVIEW / PROBLEM, SELECTED WORKS mobile sequence, MIVY
   reveal). Those keep running untouched inside the Stage; this file only decides
   WHICH existing <section> is the current Main Stage state, and plays the Intro.

   FLOW (4th pass — line cleanup + composition + curved shell polish)
     AI PRESENCE     -> the dot (the actual Presence) settles in FIRST, then
                        one supporting line — a halo ring, drawn at a stable
                        2px stroke, not the fragmented multi-hairline look a
                        1px stroke + a second concentric ring used to give —
                        and the "AI" label follow a beat later. No sidebar/
                        rail exists yet — nothing else is on screen.
     MORPH           -> the point travels to the (already-elevated, centred)
                        Prompt frame; a hairline (invisible until this exact
                        moment, so it never reads as a stray line during the
                        static Presence hold) grows to the frame's own width;
                        the point becomes the Prompt caret. Presence -> Prompt
                        is one continuous object, not two unrelated scenes.
     PROMPT WRITING  -> the structured prompt types itself into the input.
     PROMPT DESCENDS -> typing finishes; applyRestPosition() measures the
                        Direction message and the frame together and moves
                        BOTH up, as one composition, to a position just below
                        the message — not the true viewport bottom.
     MESSAGE REVEAL  -> in that composition's own space, "DESIGN × CODE × AI"
                        reveals on one line at equal hierarchy, then the three
                        staggered process steps, directly above the frame.
     RUN (user)      -> appears only once the message has finished revealing,
                        inside the same frame the message sits just above —
                        nothing auto-advances past it, and the user's cursor
                        never has to travel to the viewport's bottom edge.
     WORKSPACE       -> Main Stage takes the full viewport; a reading-progress
                        hairline and a small curved left-edge tab are the only
                        persistent chrome. Project Navigation reveals
                        LEFT -> RIGHT from that tab into a large curved shell
                        (one ellipse, mostly off-screen left, only its right
                        boundary visible) — never a rectangular sidebar, never
                        a bottom pill, never a centred modal.

   Below 1024px the Desktop shell does nothing; only the MOBILE INTRO block
   (near the end) runs there, replaying the same intro sequence on #m-intro.
   ========================================================================== */
(function(){
  'use strict';

  var DESKTOP = window.matchMedia('(min-width:1024px)');
  var v2 = document.getElementById('v2');
  if (!v2) return;
  v2.classList.add('v2-js'); // proves the controller is alive (see css fallback note)

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- RELOAD = INTRO. A Stage hash in the URL is a deep link (both boots below
  //      enter that Stage directly) — but Mobile writes one on every Stage change,
  //      and Desktop keeps whichever one it was opened with, so F5 / Ctrl+R / a hard
  //      reload used to land straight in the workspace. When this document was
  //      loaded BY A RELOAD (Navigation Timing's own type, not a guess), the hash is
  //      dropped from the current history entry only, before either boot reads it:
  //      both intros then play from the start. A first visit / pasted link
  //      ('navigate') and Back/Forward into this page ('back_forward') keep it. ----
  (function(){
    var nav = window.performance && performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
    var isReload = nav ? nav.type === 'reload'
      : !!(window.performance && performance.navigation && performance.navigation.type === 1);
    if (!isReload || !window.location.hash || !window.history.replaceState) return;
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch (err) {}
  })();

  // ---- element refs -------------------------------------------------------
  var core        = document.getElementById('v2-core');
  var coreDot     = core && core.querySelector('.v2-core-dot');
  var coreLine    = core && core.querySelector('.v2-core-line');
  var coreLabel   = core && core.querySelector('.v2-core-label');
  var identity    = v2.querySelector('.v2-identity');
  var bgFx        = v2.querySelector('.v2-bg-fx');
  var convo       = v2.querySelector('.v2-convo');
  var convoMark   = v2.querySelector('.v2-convo-mark');
  var convoSteps  = v2.querySelector('.v2-convo-steps');
  var frame       = v2.querySelector('.v2-frame');
  var promptEl    = document.getElementById('v2-prompt');
  var caret       = promptEl && promptEl.querySelector('.v2-caret');
  var runBtn      = document.getElementById('v2-run');
  var skipBtn     = document.getElementById('v2-skip');
  var host        = document.getElementById('v2-host');
  var progressFill= document.getElementById('v2-progress-fill');
  var navGuide    = document.getElementById('v2-nav-guide');
  var navPanel    = document.getElementById('v2-nav-panel');
  var cursor      = document.getElementById('custom-cursor');

  // ---- Main Stage states: existing sections, mapped by id. Nothing is moved,
  //      renamed or rewritten — only shown/hidden. -------------------------
  var STAGES = {
    index:     { id:'works',            label:'SELECTED WORKS', num:'··' },
    momentrip: { id:'project-momentrip', label:'MOMENTRIP',      num:'01' },
    mivy:      { id:'project-mivy',      label:'MIVY',           num:'02' },
    // soon:true — in-progress Projects. Their sections stay in the DOM ([hidden]) but
    // setStage() never shows them, whatever asks: Navigation, an anchor, or a deep link
    // (#project-farmlink / #ws-farmlink land on SELECTED WORKS instead).
    farmlink:  { id:'project-farmlink',  label:'FARMLINK',       num:'03', soon:true },
    archive:   { id:'project-archive',   label:'DESIGN ARCHIVE', num:'04' },
    about:     { id:'about',             label:'ABOUT',          num:'··' },
    contact:   { id:'contact',           label:'CONTACT',        num:'··' }
  };
  // hash -> stage key, so every existing in-content <a href="#..."> keeps working
  var HASH_TO_STAGE = {};
  Object.keys(STAGES).forEach(function(k){ HASH_TO_STAGE['#' + STAGES[k].id] = k; });

  var currentStage = null;
  var ran = false;      // RUN has happened (workspace state reached)
  var started = false;  // intro sequence has been started once
  var introDone = false; // intro reached its written/armed state by ANY route
                         // (played out, fast-forwarded, or skipped straight to
                         // the workspace). runIntro() checks it after every
                         // await so a suspended run can never resume and type
                         // the prompt a second time.
  // Project Navigation state — 'closed' | 'opening' | 'pinned'. Hover (or a
  // click/keyboard activation on the guide) alone commits to opening; there
  // is no separate hover-preview tier any more, and nothing closes the nav
  // on mouseleave in ANY of these states — only an explicit action does
  // (ESC, outside click, or picking a project/ABOUT item). See openNav().
  var navState = 'closed';
  var navPinTimer = null;
  // 10th pass (morphing-surface nav) — OPEN runs two things in parallel:
  // the surface path's own .42s ease-out morph, and the menu items' 35ms-
  // apart stagger (see #v2.is-nav-open .v2-nav-item in
  // css/workspace-v2.css), whose last item (ABOUT) starts at 285ms and
  // runs 220ms -> settles at 505ms, the later of the two. +25ms so it
  // locks in just after that finishes, not mid-reveal.
  var NAV_PIN_DELAY = reduced ? 0 : 530;

  // ---- timing -------------------------------------------------------------
  var T = {
    presenceIn:  reduced ? 0   : 1300,  // dot -> halo -> label stagger in
                                        // (see .v2-core.is-on delays in CSS,
                                        // ~950ms to fully settle), then a
                                        // short hold — long enough to
                                        // register as one finished scene
                                        // before Morph starts
    morphA:      reduced ? 0   : 700,   // centre -> elevated frame centre, line grows to frame width
    morphB:      reduced ? 0   : 620,   // frame centre -> caret, point becomes the caret
    afterMorph:  reduced ? 0   : 420,
    charMs:      reduced ? 0   : 11,
    blockPause:  reduced ? 0   : 180,
    afterType:   reduced ? 0   : 260,   // pause before the Prompt Area descends
    descend:     reduced ? 0   : 640,   // must match .v2-frame's transform transition duration
    bgIn:        reduced ? 0   : 220,   // background atmosphere (noise + code fragments)
                                        // forms BEFORE the Hero mark, but only briefly —
                                        // see css/workspace-v2.css .v2-bg-fx
    markPause:   reduced ? 0   : 560,   // identity mark visible before steps stagger in
    stepsHold:   reduced ? 0   : 820    // long enough for the 3-item stagger to finish
  };

  // ---- the prompt ---------------------------------------------------------
  // Written as GOAL / KEEP / INTERACTION / CONSTRAINT direction, not "make me a
  // portfolio" — the intro's whole point is that the direction and the limits are
  // human. Label column is 13 monospace columns wide, so continuation lines align.
  var PROMPT = [
    ['k','TASK'],        ['','         Portfolio Workspace — interaction rebuild\n'],
    ['k','GOAL'],        ['','         Convert the long scrolling page into a single\n             viewport that behaves like a workspace.\n\n'],
    ['k','KEEP'],        ['','         Existing visual identity · typography · folder metaphor\n             MOMENTRIP · MIVY · FARMLINK · DESIGN ARCHIVE\n\n'],
    ['k','INTERACTION'], ['','  Click → Select · Scroll → Progress · Hover → Preview\n             Prompt → Execute\n\n'],
    ['k','CONSTRAINT'],  ['','   Do not replace the existing design system.\n             Human direction first. AI implements.']
  ];

  // ---- small helpers ------------------------------------------------------
  var timers = [];
  function wait(ms){
    return new Promise(function(res){ timers.push(setTimeout(res, ms)); });
  }
  function clearTimers(){ timers.forEach(clearTimeout); timers = []; }
  function canAnimate(el){ return el && typeof el.animate === 'function' && !reduced; }
  // Post-typing pauses collapse to ~0 once the user has asked to fast-forward,
  // same as the typing loop itself — "skip" should feel like skip, not just a
  // faster typewriter followed by the same slow reveals.
  function postWait(ms){ return wait(fastForward ? 0 : ms); }

  // ---- custom cursor: reuse the EXISTING #custom-cursor + .is-hover system
  //      from js/main.js. No new cursor asset, no second cursor implementation. --
  function wireCursor(el){
    if (!cursor || !el) return;
    el.addEventListener('mouseenter', function(){ cursor.classList.add('is-hover'); });
    el.addEventListener('mouseleave', function(){ cursor.classList.remove('is-hover'); });
  }

  /* ==========================================================================
     MAIN STAGE
     ======================================================================== */
  function setStage(key, opts){
    if (!STAGES[key]) return;
    var meta = STAGES[key];
    if (meta.soon) return;
    var section = document.getElementById(meta.id);
    if (!section) return;

    if (currentStage === key && !(opts && opts.force)) return;
    currentStage = key;
    exitPreview({ silent:true }, key); // never keep a live site running off-stage

    Object.keys(STAGES).forEach(function(k){
      var s = document.getElementById(STAGES[k].id);
      if (s) s.classList.toggle('is-stage', k === key);
    });

    v2.querySelectorAll('[data-stage-go]').forEach(function(btn){
      btn.setAttribute('aria-current', btn.getAttribute('data-stage-go') === key ? 'true' : 'false');
    });
    v2.querySelectorAll('[data-nav-go]').forEach(function(btn){
      btn.setAttribute('aria-current', btn.getAttribute('data-nav-go') === key ? 'true' : 'false');
    });

    if (host) host.scrollTop = 0;
    setProgress(0);
  }

  function setProgress(pct){
    if (progressFill) progressFill.style.width = Math.max(0, Math.min(100, pct)) + '%';
  }

  // SCROLL = PROGRESS. The Stage scrolls, not the page, so progress is read from
  // the host's own scroll box.
  var progressRaf = null;
  function onHostScroll(){
    if (progressRaf) return;
    progressRaf = requestAnimationFrame(function(){
      progressRaf = null;
      if (!host) return;
      var max = host.scrollHeight - host.clientHeight;
      setProgress(max > 4 ? (host.scrollTop / max) * 100 : 0);
      // The existing motion IIFEs in js/main.js listen on window 'scroll' for their
      // own reset-when-scrolled-away logic. Inside a scroll container that event
      // never reaches window, so forward it — those handlers all re-measure with
      // getBoundingClientRect(), which is correct in either scrolling model.
      window.dispatchEvent(new Event('scroll'));
    });
  }

  /* ==========================================================================
     PROJECT NAVIGATION — HOVER COMMITS, not hover-preview/click-pin.
     Hovering (or clicking/activating via keyboard) v2-nav-guide moves the
     nav straight to OPENING: the arc reveals one folder at a time, and the
     instant that sequence finishes it locks itself into PINNED with no
     separate click required. From the moment OPENING starts, mouseleave is
     never a close trigger in any state — the user can move anywhere
     (including back across the Main Stage) without losing it. Closing only
     ever happens by an explicit action: ESC, an outside click, or picking a
     project/ABOUT item. Closing always returns to 'closed', so re-hovering
     the guide starts a fresh OPENING sequence.
     ======================================================================== */
  function clearNavPinTimer(){
    if (navPinTimer) { clearTimeout(navPinTimer); navPinTimer = null; }
  }
  function openNav(){
    if (!ran) return;
    if (navState !== 'closed') return; // already opening or pinned — no-op
    navState = 'opening';
    v2.classList.add('is-nav-open');
    if (navPanel) navPanel.setAttribute('aria-hidden', 'false');
    if (navGuide) navGuide.setAttribute('aria-expanded', 'true');
    // Auto-pin once the reveal sequence has actually finished (see
    // NAV_PIN_DELAY above) — this is what removes the separate "click to
    // pin" step from the previous pass.
    clearNavPinTimer();
    navPinTimer = setTimeout(function(){
      if (navState !== 'opening') return; // closed early — don't resurrect it
      navState = 'pinned';
      v2.classList.add('is-nav-pinned');
    }, NAV_PIN_DELAY);
  }
  function closeNav(opts){
    clearNavPinTimer();
    if (navState === 'closed') return;
    navState = 'closed';
    v2.classList.remove('is-nav-open', 'is-nav-pinned');
    if (navPanel) navPanel.setAttribute('aria-hidden', 'true');
    if (navGuide) navGuide.setAttribute('aria-expanded', 'false');
    if (!(opts && opts.silent) && navGuide) navGuide.focus();
  }

  /* ==========================================================================
     INTRO SEQUENCE
     ======================================================================== */
  function centre(rect){ return { x:rect.left + rect.width/2, y:rect.top + rect.height/2 }; }
  function originPoint(){ return { x:window.innerWidth/2, y:window.innerHeight/2 }; }

  // Rise the Prompt frame to a central "hero" position — measured live against
  // the ACTUAL viewport, not guessed via a single vh value. A fixed vh guess
  // undershot badly on tall viewports (a short-ish window only rose to ~74%
  // down the screen, nowhere near "central" — the Prompt Area is meant to be
  // the whole screen's focus while typing). Must be called while the frame is
  // still in its normal (unelevated) resting position, so the measurement is
  // real. Clamped so the risen frame never crowds the identity bar above it.
  // The frame's natural (bottom-bar, untransformed) rect is cached here for
  // applyRestPosition() below — that function needs the SAME baseline rect
  // but runs later, after the frame is already elevated, so re-measuring it
  // there would read the wrong (already-transformed) position.
  var frameBarRect = null;
  function applyElevation(){
    if (!frame) return;
    var rest = frame.getBoundingClientRect();
    frameBarRect = rest;
    var restCenterY = rest.top + rest.height / 2;
    var minTargetY = identity ? identity.getBoundingClientRect().bottom + 90 : 140;
    var targetY = Math.max(minTargetY, window.innerHeight * 0.40);
    frame.style.setProperty('--v2-rise', Math.round(targetY - restCenterY) + 'px');
    frame.classList.add('is-elevated');
  }

  // 4th pass — computes where the WHOLE post-typing composition (Direction
  // message, then the Prompt frame directly below it) should sit, as one
  // unit, instead of the message centring itself alone while the frame
  // separately falls back to the true viewport-bottom bar position (the
  // actual cause of "message near centre, RUN near the floor"). Sets BOTH
  // --v2-convo-shift (moves the message up) and --v2-rest (the frame's own,
  // much shorter, "descend to just below the message" rise) so the two move
  // together. convo's mark/steps are already laid out in the DOM at this
  // point (only their opacity is still 0), so measuring convo's real height
  // here is accurate even though nothing is visible yet.
  function applyRestPosition(){
    if (!frame || !frameBarRect) return;
    var frameHeight = frameBarRect.height;
    var frameNaturalCenterY = frameBarRect.top + frameHeight / 2;
    var margin = 24;
    var maxFrameY = window.innerHeight - frameHeight / 2 - margin;

    if (!convo || !convoMark || !convoSteps) {
      // No Direction message to compose around — just keep the frame off
      // the true bottom edge by the same safety margin used elsewhere.
      var soloTargetY = Math.min(frameNaturalCenterY, maxFrameY);
      frame.style.setProperty('--v2-rest', Math.round(soloTargetY - frameNaturalCenterY) + 'px');
      return;
    }

    var stageTop = identity ? identity.getBoundingClientRect().bottom : 0;
    var stageHeight = window.innerHeight - stageTop;
    var gap = 40;
    // NOTE: .v2-convo itself is a flex box that STRETCHES to fill its whole
    // grid area (nearly the full stage height) — its own getBoundingClientRect
    // is that full stretched box, not the actual rendered size of the text
    // inside it. The real, visible content span is "top of the mark" to
    // "bottom of the steps list" — measuring those two children directly is
    // what actually reflects how tall the message reads on screen.
    var contentTop = convoMark.getBoundingClientRect().top;
    var contentBottom = convoSteps.getBoundingClientRect().bottom;
    var convoHeight = Math.max(0, contentBottom - contentTop);
    var totalHeight = convoHeight + gap + frameHeight;

    // The composition block's target TOP: centred as one unit inside the
    // stage, but never higher than a small top margin (clear of the identity
    // bar) and, when the combined block is taller than the stage itself,
    // settle near the top instead of pushing the frame off the bottom.
    var idealTop = stageTop + (stageHeight - totalHeight) / 2;
    var compTop = Math.max(stageTop + margin, idealTop);

    var convoNaturalCenterY = contentTop + convoHeight / 2;
    var convoTargetCenterY = compTop + convoHeight / 2;
    convo.style.setProperty('--v2-convo-shift', Math.round(convoTargetCenterY - convoNaturalCenterY) + 'px');

    var frameTargetCenterY = compTop + convoHeight + gap + frameHeight / 2;
    frameTargetCenterY = Math.min(frameTargetCenterY, maxFrameY);
    frame.style.setProperty('--v2-rest', Math.round(frameTargetCenterY - frameNaturalCenterY) + 'px');
  }

  // Sequencing is done with setTimeout (wait()), never with Animation.finished.
  // That promise is resolved off the animation frame loop, which Chrome stops
  // servicing while document.hidden is true — a state this page can end up in
  // simply by being in a background tab, and one js/main.js already documents
  // hitting. Waiting on it would leave the intro frozen mid-morph forever. The
  // animation still carries the visual; the clock is independent of it.
  function moveCore(to, ms, easing){
    var o = originPoint();
    var tf = 'translate(' + (to.x - o.x) + 'px,' + (to.y - o.y) + 'px)';
    if (!canAnimate(coreDot)) { if (coreDot) coreDot.style.transform = 'translate(-50%,-50%) ' + tf; return wait(ms); }
    var from = getComputedStyle(coreDot).transform;
    coreDot.animate(
      [{ transform:from }, { transform:'translate(-50%,-50%) ' + tf }],
      { duration:ms, easing:easing || 'cubic-bezier(.16,1,.3,1)', fill:'forwards' }
    );
    coreDot.style.transform = 'translate(-50%,-50%) ' + tf; // resting value once cancelled/ends
    return wait(ms);
  }

  var typing = false, fastForward = false;

  async function runIntro(){
    if (started) return;
    started = true;
    // If any intro element is missing the sequence has nothing to morph — land in
    // the written state rather than on a black canvas.
    if (!core || !frame || !promptEl || !caret) { finishIntroInstantly(); return; }

    // The Prompt frame starts life already in its ELEVATED (centred) position —
    // opacity is still 0 at this point, so there is no visible jump — so every
    // measurement below already targets where the frame will actually appear.
    applyElevation();

    // -- AI PRESENCE : full viewport, nothing else exists yet -------------
    if (core) core.classList.add('is-on');
    if (skipBtn) skipBtn.classList.add('is-in');
    await wait(T.presenceIn);
    if (ran || introDone) return;

    // -- MORPH A : point travels to the (elevated) Prompt frame's centre,
    //    hairline grows to the frame's own width. -------------------------
    if (core) core.classList.add('is-morphing');
    var frameRect = frame.getBoundingClientRect();
    var fc = centre(frameRect);
    if (coreLine && canAnimate(coreLine)) {
      // Start from whatever the Presence-phase CSS entrance already settled
      // the line to (a short static width, faded in — see .v2-core.is-on
      // .v2-core-line in workspace-v2.css), not a hardcoded 0px: the line
      // already exists on screen by this point, so growing it further to the
      // Prompt frame's width reads as ONE continuous line, not a fresh one
      // snapping in from nothing. Same "measure the live computed value"
      // technique moveCore() already uses for the dot's transform.
      var lineFromW = getComputedStyle(coreLine).width;
      var lineFromO = getComputedStyle(coreLine).opacity;
      coreLine.animate(
        [{ width:lineFromW, opacity:lineFromO }, { width:Math.round(frameRect.width) + 'px', opacity:.55 }],
        { duration:T.morphA, easing:'cubic-bezier(.16,1,.3,1)', fill:'forwards' }
      );
    } else if (coreLine) {
      coreLine.style.width = Math.round(frameRect.width) + 'px';
      coreLine.style.opacity = '.55';
    }
    await moveCore(fc, T.morphA);
    if (ran || introDone) return;

    // -- MORPH B : the frame materialises around that line, and the point walks
    //    on to the caret position while becoming the caret's own shape. -----
    if (frame) frame.classList.add('is-in');
    var caretRect = caret ? caret.getBoundingClientRect() : frameRect;
    var cc = centre(caretRect);
    if (coreLine && canAnimate(coreLine)) {
      coreLine.animate([{ opacity:.55 }, { opacity:0 }],
        { duration:T.morphB * .6, easing:'ease', fill:'forwards' });
    } else if (coreLine) { coreLine.style.opacity = '0'; }
    if (coreDot && canAnimate(coreDot)) {
      coreDot.animate(
        [{ width:'8px', height:'8px', borderRadius:'50%' },
         { width:'2px', height:Math.max(10, Math.round(caretRect.height)) + 'px', borderRadius:'0' }],
        { duration:T.morphB, easing:'cubic-bezier(.16,1,.3,1)', fill:'forwards' }
      );
    }
    await moveCore(cc, T.morphB);
    if (ran || introDone) return;

    // hand off from the travelling point to the real caret at the same coordinates
    if (core) core.classList.add('is-done');
    if (caret) caret.classList.add('is-on', 'is-blinking');

    // -- INTERFACE REVEAL : only the identity bar joins the Prompt frame —
    //    no rail, no Direction message yet. -------------------------------
    if (identity) identity.classList.add('is-in');
    await wait(T.afterMorph);
    if (ran || introDone) return;

    // -- PROMPT WRITING : the only thing competing for attention ----------
    await typePrompt();
    if (ran || introDone) return;

    // -- PROMPT DESCENDS : typing is done; the frame drops to a position
    //    just below where the Direction message will sit — NOT all the way
    //    to the true bottom of the viewport — so the whole composition
    //    (message + frame + RUN) settles as one unit near the centre rather
    //    than the frame drifting off toward the floor. ---------------------
    await postWait(T.afterType);
    if (ran || introDone) return;
    applyRestPosition();
    if (frame) { frame.classList.remove('is-elevated'); frame.classList.add('is-resting'); }
    await postWait(T.descend);
    if (ran || introDone) return;

    // -- BACKGROUND ATMOSPHERE : noise + dispersed code fragments form first,
    //    briefly, so the Hero mark below arrives ON TOP of an already-settling
    //    scene rather than alongside a simultaneous flip. -------------------
    if (bgFx) bgFx.classList.add('is-in');
    await postWait(T.bgIn);
    if (ran || introDone) return;

    // -- MESSAGE REVEAL : identity mark, then the three-step sequence -----
    if (convo) convo.classList.add('is-in');
    await postWait(T.markPause);
    if (ran || introDone) return;
    if (convoSteps) convoSteps.classList.add('is-in');
    await postWait(T.stepsHold);
    if (ran || introDone) return;

    // -- USER RUN : appears last; nothing auto-advances from here. --------
    armRun();
  }

  // ---- typing -------------------------------------------------------------
  function appendChunk(cls, text){
    var span = document.createElement('span');
    if (cls === 'k') span.className = 'v2-k';
    span.textContent = text;
    promptEl.insertBefore(span, caret);
    return span;
  }

  async function typePrompt(){
    if (!promptEl || !caret) return;
    typing = true;
    if (caret) caret.classList.remove('is-blinking'); // steady while actually typing

    for (var i = 0; i < PROMPT.length; i++) {
      var cls = PROMPT[i][0], text = PROMPT[i][1];
      if (fastForward || reduced) { appendChunk(cls, text); continue; }
      var span = appendChunk(cls, '');
      for (var c = 0; c < text.length; c++) {
        if (fastForward) { span.textContent = text; break; }
        span.textContent += text.charAt(c);
        await wait(T.charMs);
        if (ran || introDone) { typing = false; return; }
      }
      if (!fastForward && cls === 'k') await wait(T.blockPause);
      if (ran || introDone) { typing = false; return; }
    }
    typing = false;
    if (caret) caret.classList.add('is-blinking');
  }

  function armRun(){
    introDone = true;
    if (runBtn) {
      runBtn.classList.add('is-armed');
      runBtn.removeAttribute('aria-disabled');
    }
    if (skipBtn) skipBtn.classList.add('is-done');
  }

  // Click anywhere / Enter during the intro fast-forwards the WRITING only — it
  // never skips RUN itself, which stays the user's own action.
  function requestFastForward(){
    if (ran || introDone) return;
    if (!started) return;
    fastForward = true;
    // NOTE: deliberately no clearTimers() while typing is in flight — the typing
    // loop is awaiting one of those timers, and clearing it would suspend the
    // loop forever and RUN would never arm. The fastForward flag alone drains
    // the remaining characters on the very next tick (charMs is ~11ms), and the
    // post-typing pauses collapse to ~0 via postWait() from that point on.
    if (!typing) {
      // still in AI Presence / Morph — jump straight to the fully written state
      finishIntroInstantly();
    }
  }

  function finishIntroInstantly(){
    clearTimers();
    fastForward = true;
    if (core) core.classList.add('is-done');
    if (frame) {
      applyRestPosition();
      frame.classList.remove('is-elevated');
      frame.classList.add('is-in', 'is-resting');
    }
    if (identity) identity.classList.add('is-in');
    if (bgFx) bgFx.classList.add('is-in');
    if (convo) convo.classList.add('is-in');
    if (convoSteps) convoSteps.classList.add('is-in');
    if (caret) caret.classList.add('is-on', 'is-blinking');
    if (promptEl && caret) {
      // rebuild the prompt in one shot
      Array.prototype.slice.call(promptEl.children).forEach(function(ch){
        if (ch !== caret) promptEl.removeChild(ch);
      });
      PROMPT.forEach(function(tok){ appendChunk(tok[0], tok[1]); });
    }
    typing = false;
    armRun();
  }

  /* ==========================================================================
     RUN -> WORKSPACE
     ======================================================================== */
  function doRun(){
    if (ran) return; // introDone is EXPECTED here — RUN is only reachable after it
    ran = true;
    introDone = true;
    clearTimers();
    typing = false;
    if (skipBtn) skipBtn.classList.add('is-done');
    if (core) core.classList.add('is-done');
    if (caret) caret.classList.remove('is-blinking');
    // one class drives the whole transition (see css/workspace-v2.css): the
    // Prompt bar collapses away, the Direction message fades, the Main Stage
    // takes over the full viewport, and the minimal Workspace chrome
    // (progress hairline + left-edge Navigation handle) fades in.
    v2.classList.add('is-ws');
    v2.setAttribute('data-phase', 'workspace');
    setStage(currentStage || 'index', { force:true });
  }

  // Enter into the workspace with no intro at all — used by the >=1024px
  // breakpoint crossing and by the #ws deep link.
  function enterWorkspaceDirectly(stage){
    started = true; ran = true; introDone = true;
    clearTimers();
    if (core) core.classList.add('is-done');
    if (identity) identity.classList.add('is-in');
    if (frame) frame.classList.add('is-in');
    if (skipBtn) skipBtn.classList.add('is-done');
    v2.classList.add('is-ws');
    v2.setAttribute('data-phase', 'workspace');
    setStage(stage || 'index', { force:true });
  }

  /* ==========================================================================
     LIVE PREVIEW (MOMENTRIP + MIVY Chapter 01 OVERVIEW) — Desktop V2 only.
     STATIC (WebP, nothing requested from the deployed site) -> LAUNCH creates
     the iframe -> EXIT removes it again. The iframe is cross-origin, so the
     parent never reads or listens inside it; everything here is driven from
     the bar outside it. One controller per [data-ov-preview] box, built by
     makePreview() below — MOMENTRIP's instance keeps exactly the behaviour it
     had as the original single-instance code; MIVY's only adds the two
     options documented on it (cover, restoreScroll).
       minWidth   the embedded page is rendered at least this wide and scaled
                  down into a narrower box (MOMENTRIP switches to its tablet
                  layout under 1200px; MIVY to its bottom-nav layout under
                  1024px), so the live page matches the static capture.
       cover      element under the frame that must not stay reachable while
                  the frame covers it (MIVY's zoomable capture): made inert.
       restoreScroll  EXIT puts the Stage back where it was before LAUNCH's
                  auto-scroll, unless the user has scrolled it since. The
                  launch control was on screen at that position (it was just
                  used), so focus returning to it stays visible.
     ======================================================================== */
  function makePreview(cfg){
    var root = document.querySelector(cfg.selector);
    var launchBtn = root && root.querySelector('[data-preview-launch]');
    var exitBtn = root && root.querySelector('[data-preview-exit]');
    var statusEl = root && root.querySelector('[data-preview-status]');
    var slot = root && root.querySelector('[data-preview-frame]');
    if (!root || !launchBtn || !exitBtn || !slot) return null;
    var cover = cfg.cover ? root.querySelector(cfg.cover) : null;
    var frame = null, slowTimer = null, ro = null;
    var scrollBefore = null, scrollLanded = null;

    function setState(state, text){
      root.setAttribute('data-state', state);
      if (statusEl) statusEl.textContent = text;
    }
    function fit(){
      if (!frame) return;
      var w = slot.clientWidth, h = slot.clientHeight;
      if (!w || !h) return;
      var s = w < cfg.minWidth ? w / cfg.minWidth : 1;
      frame.style.width = (w / s) + 'px';
      frame.style.height = (h / s) + 'px';
      frame.style.transform = s === 1 ? '' : 'scale(' + s + ')';
    }
    function onLoad(){
      if (slowTimer) { clearTimeout(slowTimer); slowTimer = null; }
      // load = the embedded document finished its own load; it says nothing we
      // could verify about its images, so the label only claims "live".
      setState('live', 'LIVE PREVIEW');
    }
    function onCursorEnter(){ if (cursor) cursor.style.opacity = '0'; }
    function onCursorLeave(){ if (cursor) cursor.style.opacity = ''; }

    function launch(){
      if (frame || !DESKTOP.matches) return;
      // An open Navigation would sit over a page the user is now driving, and a
      // click inside the iframe can never reach the outside-click handler —
      // close it here, silently (focus goes to EXIT below, not the guide).
      closeNav({ silent:true });
      frame = document.createElement('iframe');
      frame.src = cfg.url;
      frame.title = cfg.title;
      frame.setAttribute('loading', 'eager');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.addEventListener('load', onLoad);
      // the site draws its own cursor inside the frame; hide the portfolio's one
      // so it doesn't freeze at the frame edge
      frame.addEventListener('mouseenter', onCursorEnter);
      frame.addEventListener('mouseleave', onCursorLeave);
      setState('loading', 'LOADING');
      slot.appendChild(frame);
      if (cover) cover.inert = true;
      fit();
      if ('ResizeObserver' in window) { ro = new ResizeObserver(fit); ro.observe(slot); }
      else window.addEventListener('resize', fit);
      slowTimer = setTimeout(function(){
        slowTimer = null;
        if (frame && root.getAttribute('data-state') === 'loading') setState('loading', cfg.slowText);
      }, 15000);

      launchBtn.hidden = true;
      exitBtn.hidden = false;
      exitBtn.focus({ preventScroll:true });
      // bring the whole preview (bar + frame) into the Stage viewport so EXIT and
      // the frame are both on screen before the user starts working inside it
      scrollBefore = scrollLanded = null;
      if (host) {
        var hr = host.getBoundingClientRect(), pr = root.getBoundingClientRect();
        scrollBefore = host.scrollTop;
        if (pr.top < hr.top || pr.bottom > hr.bottom) {
          scrollLanded = Math.round(host.scrollTop + (pr.top - hr.top) - 24);
          host.scrollTo({ top: scrollLanded, behavior: reduced ? 'auto' : 'smooth' });
        }
      }
    }

    function exit(opts){
      if (!frame) return;
      if (slowTimer) { clearTimeout(slowTimer); slowTimer = null; }
      if (ro) { ro.disconnect(); ro = null; }
      else window.removeEventListener('resize', fit);
      frame.removeEventListener('load', onLoad);
      frame.removeEventListener('mouseenter', onCursorEnter);
      frame.removeEventListener('mouseleave', onCursorLeave);
      frame.src = 'about:blank'; // stop any in-flight requests before removal
      frame.remove();
      frame = null;
      if (cover) cover.inert = false;
      onCursorLeave();
      setState('static', 'STATIC PREVIEW');
      exitBtn.hidden = true;
      launchBtn.hidden = false;
      var silent = opts && opts.silent;
      // only when the Stage is still exactly where LAUNCH put it (a user scroll
      // in between means they have moved on, so leave it alone)
      if (!silent && cfg.restoreScroll && host && scrollBefore !== null &&
          (scrollLanded === null || Math.abs(host.scrollTop - scrollLanded) <= 2)) {
        host.scrollTo({ top: scrollBefore, behavior: 'auto' });
      }
      scrollBefore = scrollLanded = null;
      // focus left inside the removed iframe would otherwise drop to <body>
      if (!silent) launchBtn.focus({ preventScroll:true });
    }

    // A click inside the cross-origin frame never reaches the outside-click
    // handler, so an open Navigation would stay up over a page the user is
    // using — focus moving into the frame closes it instead.
    window.addEventListener('blur', function(){
      if (frame && document.activeElement === frame && navState !== 'closed') closeNav({ silent:true });
    });

    launchBtn.hidden = false; // without this controller the static image + OPEN link remain
    wireCursor(launchBtn); wireCursor(exitBtn);
    wireCursor(root.querySelector('.ov-preview-btn[href]'));
    launchBtn.addEventListener('click', launch);
    exitBtn.addEventListener('click', function(){ exit(); });
    return { stage: cfg.stage, exit: exit };
  }

  var previews = [
    makePreview({
      selector: '#project-momentrip [data-ov-preview]', stage: 'momentrip',
      url: 'https://momentrip-phi.vercel.app/', minWidth: 1200,
      title: 'MOMENTRIP 라이브 프리뷰 — 실제 배포 사이트',
      slowText: 'STILL LOADING · OPEN SITE ↗ 로도 볼 수 있습니다'
    }),
    makePreview({
      selector: '#project-mivy [data-ov-preview]', stage: 'mivy',
      url: 'https://mivy.vercel.app/', minWidth: 1024,
      title: 'MIVY 라이브 프리뷰 — 실제 배포 앱',
      slowText: 'STILL LOADING · OPEN APP ↗ 으로도 볼 수 있습니다',
      cover: '.mivy-shot', restoreScroll: true
    })
  ].filter(Boolean);

  // Never keep a live site running off-stage (or below 1024px): exits every
  // preview, or every one except the given Stage's own.
  function exitPreview(opts, keepStage){
    previews.forEach(function(p){ if (p.stage !== keepStage) p.exit(opts); });
  }

  /* ==========================================================================
     WIRING
     ======================================================================== */
  // Identity links (ABOUT / CONTACT)
  v2.querySelectorAll('[data-stage-go]').forEach(function(btn){
    btn.addEventListener('click', function(){
      setStage(btn.getAttribute('data-stage-go'));
    });
    wireCursor(btn);
  });

  // Project Navigation: guide (hover OR click/keyboard commits to opening)
  // + each item + ESC/outside-click (wired further down). No mouseleave
  // listener exists anywhere in this block on purpose — see openNav()/
  // closeNav() above for why nothing here can close on its own any more.
  if (navGuide) {
    wireCursor(navGuide);
    // HOVER = OPEN (commits immediately, auto-pins on its own — see
    // openNav()). CLICK is wired to the same function purely so a keyboard
    // user (Tab to focus, Enter/Space to activate a native <button>) or a
    // touch user has an equivalent way in; openNav() is idempotent, so
    // hover-then-click never double-triggers anything.
    navGuide.addEventListener('mouseenter', openNav);
    navGuide.addEventListener('click', openNav);
  }
  // Click outside the guide/panel closes the navigation, from either the
  // OPENING or PINNED state — a click on a project/ABOUT item is INSIDE
  // navPanel so it's skipped here and closes instead via that item's own
  // handler below (closeNav() is idempotent, so there is no conflict).
  document.addEventListener('click', function(e){
    if (!DESKTOP.matches || navState === 'closed') return;
    var t = e.target;
    if (navGuide && navGuide.contains(t)) return;
    if (navPanel && navPanel.contains(t)) return;
    closeNav();
  });
  v2.querySelectorAll('.v2-nav-item[data-nav-go]').forEach(function(btn){
    var key = btn.getAttribute('data-nav-go');
    if (btn.getAttribute('aria-disabled') !== 'true') wireCursor(btn); // no 'clickable' cursor on SOON
    // SELECT = NAVIGATE + CLOSE. A SOON item does neither — the Navigation stays
    // open so its SOON state is what the user is left looking at.
    btn.addEventListener('click', function(){
      if (btn.getAttribute('aria-disabled') === 'true') return;
      setStage(key);
      closeNav({ silent:true });
    });
  });

  if (runBtn) { wireCursor(runBtn); runBtn.addEventListener('click', doRun); }
  if (skipBtn) { wireCursor(skipBtn); skipBtn.addEventListener('click', requestFastForward); }

  // Existing in-content anchors (#works .folder-item rows) become Stage
  // selection instead of page scroll — the markup itself is untouched, only
  // the click is intercepted, and only on Desktop V2. (.next "NEXT PROJECT"
  // links are hidden in V2 via CSS — see workspace-v2.css — so they simply
  // never receive this click; Mobile keeps them untouched and functional.)
  v2.addEventListener('click', function(e){
    if (!DESKTOP.matches || !ran) return;
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var key = HASH_TO_STAGE[a.getAttribute('href')];
    if (!key) return;
    e.preventDefault();
    setStage(key);
  });

  document.addEventListener('keydown', function(e){
    if (!DESKTOP.matches) return;
    if (e.key === 'Enter') {
      if (runBtn && runBtn.classList.contains('is-armed') && !ran) { doRun(); return; }
      if (!ran) requestFastForward();
    } else if (e.key === 'Escape') {
      if (ran && navState !== 'closed') closeNav();
    }
  });

  // Click anywhere on the intro canvas fast-forwards the writing (never RUN).
  v2.addEventListener('click', function(e){
    if (ran || !DESKTOP.matches) return;
    if (e.target.closest && e.target.closest('.v2-run')) return;
    requestFastForward();
  });

  if (host) host.addEventListener('scroll', onHostScroll, { passive:true });

  /* ==========================================================================
     MOBILE INTRO (< 1024px) — the SAME intro sequence, played on #m-intro.
     Reuses this file's own timing table (T), reduced-motion flag, centre(),
     canAnimate(), the moveCore() travel / dot->caret morph keyframes and
     easings, the appendChunk()-style typing loop (charMs, blockPause after
     each label), and the same state classes (is-on / is-morphing / is-done /
     is-elevated / is-in / is-resting / is-armed / is-blinking), styled with the
     same values in css/style.css "INTRO MOTION". Own clock and own flags, so
     the Desktop intro's clearTimers() can never strand it (and vice versa).
     Re-run policy = Desktop's: plays once per page load; a deep link or a
     breakpoint crossing mid-sequence lands in the written state instead; it
     never replays.

     MOBILE STAGES — Mobile uses Desktop's own Stage model, not a long document:
     #m-intro is the INTRO Stage, and every workspace Stage is shown through
     Desktop's setStage() inside #v2-host (made the fixed scroll box by
     css/style.css "STAGES"; html.m-ws = workspace entered). Navigation, NEXT,
     in-content links and RUN all go through mGo(); nothing scrolls the page.
     History: every Stage change is a pushState entry whose URL is that Stage's
     section hash (the same deep links Desktop boot() accepts), so Back/Forward
     and a pasted URL land on that Stage; the entry without a hash is the INTRO
     (shown written, never replayed). A reload always plays the intro from the
     start instead (see RELOAD = INTRO at the top of this file).
     ======================================================================== */
  var MOBILE = window.matchMedia('(max-width:1023px)');
  var mIntro = document.getElementById('m-intro');
  if (mIntro) (function(){
    var mCore  = mIntro.querySelector('.m-intro-core');
    var mDot   = mCore && mCore.querySelector('.m-intro-dot');
    var mLine  = mCore && mCore.querySelector('.m-intro-line');
    var mTop   = mIntro.querySelector('.m-intro-top');
    var mBg    = mIntro.querySelector('.m-intro-bg');
    var mMark  = mIntro.querySelector('.m-intro-mark');
    var mSteps = mIntro.querySelector('.m-intro-steps');
    var mFrame = mIntro.querySelector('.m-intro-frame');
    var mDl    = mIntro.querySelector('.m-intro-prompt');
    var mCaret = mIntro.querySelector('.m-caret');
    var mRun   = mIntro.querySelector('.m-intro-run');
    var mSkip  = mIntro.querySelector('.m-intro-skip');
    var works  = document.getElementById('works');

    var mTimers = [];
    function mWait(ms){ return new Promise(function(res){ mTimers.push(setTimeout(res, ms)); }); }
    function mClear(){ mTimers.forEach(clearTimeout); mTimers = []; }
    var mStarted = false, mDone = false, mTyping = false, mFast = false, mRunning = false;
    function mPost(ms){ return mWait(mFast ? 0 : ms); }

    // The prompt, read from the markup itself (the mobile wording stays exactly as
    // written): one chunk per <dt>/<dd>, <br> kept as '\n'. Same shape as PROMPT.
    var CHUNKS = [];
    if (mDl) Array.prototype.forEach.call(mDl.querySelectorAll('dt, dd'), function(el){
      var text = '';
      Array.prototype.forEach.call(el.childNodes, function(n){
        if (n.nodeType === 3) text += n.nodeValue;
        else if (n.nodeName === 'BR') text += '\n';
      });
      CHUNKS.push({ el:el, key:el.nodeName === 'DT', text:text });
    });
    function writeInto(el, text){ // text -> text nodes + <br>, kept in front of the caret
      text.split('\n').forEach(function(line, i){
        if (i) el.insertBefore(document.createElement('br'), mCaret.parentNode === el ? mCaret : null);
        el.insertBefore(document.createTextNode(line), mCaret.parentNode === el ? mCaret : null);
      });
    }
    function clearPrompt(){
      CHUNKS.forEach(function(c){
        Array.prototype.slice.call(c.el.childNodes).forEach(function(n){ if (n !== mCaret) c.el.removeChild(n); });
      });
    }
    function writeAll(){ // the full written state, caret back at the end of RULE
      clearPrompt();
      CHUNKS.forEach(function(c){
        if (c === CHUNKS[CHUNKS.length - 1]) c.el.appendChild(mCaret);
        writeInto(c.el, c.text);
      });
      if (mDl) mDl.style.minHeight = '';
    }

    async function mTypePrompt(){
      if (!mDl || !mCaret) return;
      mTyping = true;
      mCaret.classList.remove('is-blinking'); // steady while actually typing
      for (var i = 0; i < CHUNKS.length; i++) {
        var c = CHUNKS[i];
        c.el.appendChild(mCaret);
        if (mFast || reduced) { writeInto(c.el, c.text); continue; }
        var node = document.createTextNode('');
        c.el.insertBefore(node, mCaret);
        for (var k = 0; k < c.text.length; k++) {
          if (mFast) { // drain the rest of this chunk at once, like Desktop's fast-forward
            var rest = c.text.slice(k).split('\n');
            node.nodeValue += rest[0];
            if (rest.length > 1) writeInto(c.el, '\n' + rest.slice(1).join('\n'));
            break;
          }
          var ch = c.text.charAt(k);
          if (ch === '\n') { c.el.insertBefore(document.createElement('br'), mCaret); node = document.createTextNode(''); c.el.insertBefore(node, mCaret); }
          else node.nodeValue += ch;
          await mWait(T.charMs);
          if (mDone) { mTyping = false; return; }
        }
        if (!mFast && c.key) await mWait(T.blockPause);
        if (mDone) { mTyping = false; return; }
      }
      mTyping = false;
      mCaret.classList.add('is-blinking');
    }

    // Desktop applyElevation(): the frame starts life risen to a central position
    // (opacity 0, so no visible jump), measured live against the real viewport.
    function mElevate(){
      mFrame.classList.remove('is-elevated', 'is-resting');
      var rest = mFrame.getBoundingClientRect();
      var restCenterY = rest.top + rest.height / 2;
      var minTargetY = mTop ? mTop.getBoundingClientRect().bottom + 90 : 140;
      var targetY = Math.max(minTargetY, window.innerHeight * 0.40);
      mFrame.style.setProperty('--m-rise', Math.round(targetY - restCenterY) + 'px');
      mFrame.classList.add('is-elevated');
    }
    // Desktop moveCore(), for the mobile dot (fixed over the viewport centre too)
    function mMoveDot(to, ms){
      var tf = 'translate(' + (to.x - window.innerWidth / 2) + 'px,' + (to.y - window.innerHeight / 2) + 'px)';
      if (canAnimate(mDot)) {
        mDot.animate([{ transform:getComputedStyle(mDot).transform }, { transform:'translate(-50%,-50%) ' + tf }],
          { duration:ms, easing:'cubic-bezier(.16,1,.3,1)', fill:'forwards' });
      }
      mDot.style.transform = 'translate(-50%,-50%) ' + tf;
      return mWait(ms);
    }

    async function mRunIntro(){
      if (mStarted) return;
      mStarted = true;
      if (!mCore || !mDot || !mFrame || !mDl || !mCaret) { mFinish(); return; }
      if (mDl) mDl.style.minHeight = mDl.offsetHeight + 'px'; // no reflow while it types
      clearPrompt();
      CHUNKS[0].el.appendChild(mCaret);
      mElevate();

      // -- AI PRESENCE
      mCore.classList.add('is-on');
      if (mSkip) mSkip.classList.add('is-in');
      await mWait(T.presenceIn);
      if (mDone) return;

      // -- MORPH A : point travels to the risen frame's centre, line grows to its width
      mCore.classList.add('is-morphing');
      var frameRect = mFrame.getBoundingClientRect();
      if (mLine && canAnimate(mLine)) {
        mLine.animate([{ width:getComputedStyle(mLine).width, opacity:getComputedStyle(mLine).opacity },
                       { width:Math.round(frameRect.width) + 'px', opacity:.55 }],
          { duration:T.morphA, easing:'cubic-bezier(.16,1,.3,1)', fill:'forwards' });
      }
      await mMoveDot(centre(frameRect), T.morphA);
      if (mDone) return;

      // -- MORPH B : the frame materialises, the point walks on and becomes the caret
      mFrame.classList.add('is-in');
      var caretRect = mCaret.getBoundingClientRect();
      if (mLine && canAnimate(mLine)) {
        mLine.animate([{ opacity:.55 }, { opacity:0 }], { duration:T.morphB * .6, easing:'ease', fill:'forwards' });
      }
      if (canAnimate(mDot)) {
        mDot.animate([{ width:'9px', height:'9px', borderRadius:'50%' },
                      { width:'2px', height:Math.max(10, Math.round(caretRect.height)) + 'px', borderRadius:'0' }],
          { duration:T.morphB, easing:'cubic-bezier(.16,1,.3,1)', fill:'forwards' });
      }
      await mMoveDot(centre(caretRect), T.morphB);
      if (mDone) return;
      mCore.classList.add('is-done');
      mCaret.classList.add('is-on', 'is-blinking');

      // -- INTERFACE REVEAL
      if (mTop) mTop.classList.add('is-in');
      await mWait(T.afterMorph);
      if (mDone) return;

      // -- PROMPT WRITING
      await mTypePrompt();
      if (mDone) return;

      // -- PROMPT DESCENDS (into the document's own flow, under the message)
      await mPost(T.afterType);
      if (mDone) return;
      mFrame.classList.remove('is-elevated'); mFrame.classList.add('is-resting');
      await mPost(T.descend);
      if (mDone) return;

      // -- BACKGROUND ATMOSPHERE -> MESSAGE REVEAL
      if (mBg) mBg.classList.add('is-in');
      await mPost(T.bgIn);
      if (mDone) return;
      if (mMark) mMark.classList.add('is-in');
      await mPost(T.markPause);
      if (mDone) return;
      if (mSteps) mSteps.classList.add('is-in');
      await mPost(T.stepsHold);
      if (mDone) return;

      // -- USER RUN
      mArm();
    }

    function mArm(){
      mDone = true;
      if (mDl) mDl.style.minHeight = '';
      if (mRun) { mRun.classList.add('is-armed'); mRun.removeAttribute('tabindex'); mRun.removeAttribute('aria-disabled'); }
      if (mSkip) mSkip.classList.add('is-done');
      mIntro.classList.add('is-ready');               // Navigation fades in (css: #m-intro.is-ready)
    }
    // Desktop finishIntroInstantly(): land in the written, armed state in one step
    function mFinish(){
      mClear();
      mFast = true; mTyping = false; mStarted = true;
      if (mCore) mCore.classList.add('is-on', 'is-done');
      if (mFrame) { mFrame.classList.remove('is-elevated'); mFrame.classList.add('is-in', 'is-resting'); }
      [mTop, mBg, mMark, mSteps].forEach(function(el){ if (el) el.classList.add('is-in'); });
      if (mCaret) { writeAll(); mCaret.classList.add('is-on', 'is-blinking'); }
      mArm();
    }
    // Desktop requestFastForward(): drains the typing, never presses RUN itself
    function mFastForward(){
      if (!mStarted || mDone) return;
      mFast = true;
      if (!mTyping) mFinish();
    }

    /* ---- STAGES -------------------------------------------------------- */
    var root = document.documentElement;
    var mNav = document.getElementById('m-nav');
    var mFill = mNav && mNav.querySelector('.m-progress i');
    var mNavLinks = mNav ? Array.prototype.slice.call(mNav.querySelectorAll('a.m-nav-item[href^="#"]')) : [];
    var mInWs = false;
    root.classList.add('m-stage'); // css/style.css STAGES applies only once this exists

    // Desktop boot()'s deep-link forms (#ws, #ws-<key>, #<section id>); a SOON
    // or unknown Stage lands on SELECTED WORKS, as it does on Desktop.
    function stageFromHash(hash){
      var key = null;
      if (hash === '#ws' || hash === '#workspace') key = 'index';
      else if (hash.indexOf('#ws-') === 0) key = hash.slice(4);
      else if (HASH_TO_STAGE[hash]) key = HASH_TO_STAGE[hash];
      if (key === null) return null;
      return STAGES[key] && !STAGES[key].soon ? key : 'index';
    }
    function stageUrl(key){
      return window.location.pathname + window.location.search + (key ? '#' + STAGES[key].id : '');
    }
    function stageEl(key){ return document.getElementById(STAGES[key].id); }

    // SCROLL = PROGRESS of the current Stage's own scroll box (Desktop's onHostScroll)
    function mProgress(){
      if (!mFill) return;
      var max = mInWs && host ? host.scrollHeight - host.clientHeight : 0;
      mFill.style.transform = 'scaleX(' + (max > 4 ? Math.min(1, Math.max(0, host.scrollTop / max)) : 0) + ')';
    }
    function mMarkNav(){
      mNavLinks.forEach(function(a){
        if (mInWs && HASH_TO_STAGE[a.getAttribute('href')] === currentStage) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }
    function mFocus(el){
      if (!el) return;
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll:true });
    }
    // Where each history entry's Stage was scrolled to, for Back / Forward. By the
    // time popstate fires, history.state is already the NEW entry, so the entry
    // being left can't be written then — each entry carries an id (mId) and its
    // position is read from the Stage the moment it is left (mRemember), into
    // memory. history.state.mScroll (mSaveScroll) is only the copy that survives
    // leaving this document and coming back with Back / Forward.
    var mEntry = null, mScrollMem = {}, mSeq = Date.now();
    function mNewId(){ return (++mSeq).toString(36); }
    function mRemember(){ if (mInWs && mEntry && host) mScrollMem[mEntry] = host.scrollTop; }
    function mSaveScroll(){
      if (!window.history.replaceState) return;
      var st = window.history.state;
      st = st && typeof st === 'object' ? Object.assign({}, st) : {};
      st.mScroll = mInWs && host ? host.scrollTop : 0;
      try { window.history.replaceState(st, ''); } catch (err) {}
    }

    // One workspace Stage on screen: the INTRO goes, Desktop setStage() picks the
    // section (is-stage, Stage scroll reset), the Stage's own entrance plays.
    function mShow(key, opts){
      opts = opts || {};
      if (!mDone) mFinish();                        // never leave the intro half-built behind
      mIntro.classList.remove('is-run');
      mInWs = true;
      root.classList.add('m-ws');
      setStage(key, { force:true });
      if (host) host.scrollTop = opts.scroll || 0;
      mMarkNav();
      mProgress();
      if (opts.focus !== false) mFocus(stageEl(currentStage));
      clearTimeout(mSaveTimer); // a pending save belongs to the Stage just left
    }
    // Back to the entry without a hash: the INTRO, in its written, armed state
    function mShowIntro(opts){
      if (mStarted && !mDone) mFinish();
      mIntro.classList.remove('is-run');
      mInWs = false;
      root.classList.remove('m-ws');
      mIntro.scrollTop = 0;
      mMarkNav();
      mProgress();
      if (!(opts && opts.focus === false)) mFocus(mIntro);
    }
    // User navigation (Navigation, NEXT, in-content links, RUN): new history entry
    function mGo(key){
      key = STAGES[key] && !STAGES[key].soon ? key : null;
      if (!key) return;
      if (mInWs && key === currentStage) {          // already here: back to its top
        if (host) host.scrollTo({ top:0, behavior: reduced ? 'auto' : 'smooth' });
        mFocus(stageEl(key));
        return;
      }
      mRemember();
      mSaveScroll();
      mShow(key);
      mEntry = mNewId();
      if (window.history.pushState) window.history.pushState({ mStage:key, mId:mEntry }, '', stageUrl(key));
    }

    // RUN -> WORKSPACE: the scene fades as #v2.is-ws fades Desktop's prompt, then
    // SELECTED WORKS comes in as a Stage — a Stage change, not a scroll.
    function mDoRun(e){
      if (!MOBILE.matches || !works) return;           // >= 1024px: never reached (display:none)
      e.preventDefault();
      if (!mDone || mRunning) return;
      mRunning = true;
      mIntro.classList.add('is-run');
      setTimeout(function(){
        mRunning = false;
        if (MOBILE.matches && !mInWs) mGo('index');
        else mIntro.classList.remove('is-run');
      }, reduced ? 0 : 420);
    }

    if (mRun) {
      mRun.setAttribute('tabindex', '-1');                 // not reachable until armed
      mRun.setAttribute('aria-disabled', 'true');
      mRun.addEventListener('click', mDoRun);
    }
    if (mSkip) mSkip.addEventListener('click', function(e){ e.stopPropagation(); mFastForward(); });
    // tap anywhere on the scene fast-forwards the writing (never RUN)
    mIntro.addEventListener('click', function(e){
      if (e.target.closest && e.target.closest('.m-intro-run, .m-intro-skip')) return;
      mFastForward();
    });
    document.addEventListener('keydown', function(e){
      if (MOBILE.matches && e.key === 'Enter' && mStarted && !mDone) mFastForward();
    });
    var lastW = window.innerWidth;
    window.addEventListener('resize', function(){
      if (window.innerWidth !== lastW && mStarted && !mDone) mFinish(); // geometry changed mid-morph
      lastW = window.innerWidth;
      if (MOBILE.matches) mProgress();
    });
    window.addEventListener('pageshow', function(e){ if (e.persisted && mStarted && !mDone) mFinish(); });

    // Every in-page link that names a Stage (Navigation items, SELECTED WORKS rows,
    // NEXT, …) becomes a Stage change instead of an anchor jump — Desktop's own
    // HASH_TO_STAGE interception, for the whole document. RUN has its own handler
    // (it prevents the default first). SOON rows have no href, so never reach here;
    // the Navigation sheet closes itself on the same click (js/main.js).
    document.addEventListener('click', function(e){
      if (!MOBILE.matches || e.defaultPrevented) return;
      var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var key = HASH_TO_STAGE[a.getAttribute('href')];
      if (!key) return;
      e.preventDefault();
      mGo(key);
    });
    // progress per frame; the entry's saved position once scrolling settles (a
    // replaceState from pagehide is too late for a reload to see it)
    var mSaveTimer = null;
    if (host) host.addEventListener('scroll', function(){
      if (!MOBILE.matches || !mInWs) return;
      requestAnimationFrame(mProgress);
      clearTimeout(mSaveTimer);
      mSaveTimer = setTimeout(mSaveScroll, 250);
    }, { passive:true });

    // Back / Forward (and a hash typed into the address bar): the entry's hash is
    // its Stage; no hash = the INTRO.
    window.addEventListener('popstate', function(e){
      if (!MOBILE.matches) return;
      var key = stageFromHash(window.location.hash);
      var st = e.state && typeof e.state === 'object' ? e.state : {};
      mRemember();                                  // the entry being left
      mEntry = st.mId || null;
      var mem = mEntry && mScrollMem.hasOwnProperty(mEntry) ? mScrollMem[mEntry] : st.mScroll;
      if (key) mShow(key, { scroll:mem });
      else mShowIntro();
    });

    // Enter the workspace without the intro (deep link, reload of a Stage entry, or
    // arriving from Desktop's workspace). replaceState: the URL names the Stage now
    // shown, in its canonical form, without adding a history entry.
    // The browser's own fragment jump for the loaded URL's #id also lands in this
    // scroll box (caught mid stage-in rise, or over a restored position), so until
    // load the Stage's intended position is put back, unless the user has scrolled.
    var mBootScroll = null;
    function mClaimScroll(){ mBootScroll = null; }
    ['wheel', 'touchstart', 'keydown'].forEach(function(t){
      window.addEventListener(t, mClaimScroll, { passive:true, capture:true });
    });
    window.addEventListener('load', function(){
      setTimeout(function(){
        if (mBootScroll !== null && MOBILE.matches && mInWs && host) host.scrollTop = mBootScroll;
        mBootScroll = null;
      }, 0);
    });
    function mEnterDirectly(key, scroll){
      if (document.readyState !== 'complete') mBootScroll = scroll || 0;
      mShow(key, { focus:false, scroll:scroll });
      if (window.history.replaceState) {
        var st = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
        mEntry = st.mId || mNewId();
        try { window.history.replaceState(Object.assign({}, st, { mStage:currentStage, mId:mEntry }), '', stageUrl(currentStage)); } catch (err) {}
      }
    }

    function mBoot(){
      if (!MOBILE.matches) return;
      // Back / Forward between this page's own Stage entries: with 'auto' the
      // browser follows popstate with its own jump to the entry's #id — inside
      // the Stage box, onto the section mid stage-in rise — undoing the position
      // mShow() just restored. The document never scrolls and every Stage
      // position is restored above, so the browser's own restore has no job here.
      if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
      if (mStarted) {                               // back below 1024px after a crossing
        if (ran) mEnterDirectly(currentStage || 'index');
        else if (mInWs) mShow(currentStage || 'index', { focus:false });
        else mShowIntro({ focus:false });
        return;
      }
      // Desktop already ran RUN: its current Stage wins (Desktop never updates the hash)
      if (ran) { mEnterDirectly(currentStage || 'index'); return; }
      var key = stageFromHash(window.location.hash);
      if (key) {
        var st = window.history.state;
        mEnterDirectly(key, st && typeof st === 'object' ? st.mScroll : 0);
        return;
      }
      mRunIntro().catch(function(err){
        if (window.console) console.error('[v2] mobile intro failed:', err);
        if (!mDone) mFinish();
      });
    }
    function mOnBreakpoint(){
      if (!MOBILE.matches) { if (mStarted && !mDone) mFinish(); return; }
      mBoot();
    }
    if (MOBILE.addEventListener) MOBILE.addEventListener('change', mOnBreakpoint);
    else if (MOBILE.addListener) MOBILE.addListener(mOnBreakpoint);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mBoot);
    else mBoot();
  })();

  /* ==========================================================================
     BOOT
     ======================================================================== */
  function boot(){
    if (!DESKTOP.matches) return;      // Tablet/Mobile: existing page, untouched
    if (started) return;
    setStage('index', { force:true }); // stage state is prepared behind the intro
    var hash = window.location.hash;
    if (hash === '#ws' || hash === '#workspace') { enterWorkspaceDirectly('index'); return; }
    if (hash.indexOf('#ws-') === 0) { enterWorkspaceDirectly(hash.slice(4)); return; }
    if (HASH_TO_STAGE[hash]) { enterWorkspaceDirectly(HASH_TO_STAGE[hash]); return; }
    // never let an intro failure leave a black viewport
    runIntro().catch(function(err){
      if (window.console) console.error('[v2] intro failed:', err);
      if (!introDone) finishIntroInstantly();
    });
  }

  // Crossing INTO the V2 breakpoint after load lands directly in the workspace
  // rather than replaying an intro the user did not ask for. Crossing OUT of it
  // needs no teardown: every V2 rule lives inside the same media query, so the
  // original Tablet/Mobile page simply reappears.
  function onBreakpoint(){
    if (!DESKTOP.matches) exitPreview({ silent:true }); // < 1024px: static image only
    if (DESKTOP.matches && !started) { boot(); }
    else if (DESKTOP.matches && started && !ran) { enterWorkspaceDirectly(currentStage || 'index'); }
  }
  if (DESKTOP.addEventListener) DESKTOP.addEventListener('change', onBreakpoint);
  else if (DESKTOP.addListener) DESKTOP.addListener(onBreakpoint);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
