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

   Below 1024px this file returns immediately and changes nothing.
   ========================================================================== */
(function(){
  'use strict';

  var DESKTOP = window.matchMedia('(min-width:1024px)');
  var v2 = document.getElementById('v2');
  if (!v2) return;
  v2.classList.add('v2-js'); // proves the controller is alive (see css fallback note)

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    farmlink:  { id:'project-farmlink',  label:'FARMLINK',       num:'03' },
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
    var section = document.getElementById(meta.id);
    if (!section) return;

    if (currentStage === key && !(opts && opts.force)) return;
    currentStage = key;
    if (key !== 'momentrip') exitPreview({ silent:true }); // never keep a live site running off-stage

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
     MOMENTRIP LIVE PREVIEW (Chapter 01 OVERVIEW) — Desktop V2 only.
     STATIC (WebP, nothing requested from the deployed site) -> LAUNCH creates
     the iframe -> EXIT removes it again. The iframe is cross-origin, so the
     parent never reads or listens inside it; everything here is driven from
     the bar outside it. The deployed site switches to its tablet layout under
     1200px, so a narrower box renders the page at 1200px and scales it down.
     ======================================================================== */
  var PREVIEW_URL = 'https://momentrip-phi.vercel.app/';
  var PREVIEW_MIN_W = 1200;
  var preview = document.querySelector('[data-ov-preview]');
  var pvLaunch = preview && preview.querySelector('[data-preview-launch]');
  var pvExit = preview && preview.querySelector('[data-preview-exit]');
  var pvStatus = preview && preview.querySelector('[data-preview-status]');
  var pvSlot = preview && preview.querySelector('[data-preview-frame]');
  var pvFrame = null, pvSlowTimer = null, pvResize = null;

  function pvSetState(state, text){
    preview.setAttribute('data-state', state);
    if (pvStatus) pvStatus.textContent = text;
  }
  function pvFit(){
    if (!pvFrame || !pvSlot) return;
    var w = pvSlot.clientWidth, h = pvSlot.clientHeight;
    if (!w || !h) return;
    var s = w < PREVIEW_MIN_W ? w / PREVIEW_MIN_W : 1;
    pvFrame.style.width = (w / s) + 'px';
    pvFrame.style.height = (h / s) + 'px';
    pvFrame.style.transform = s === 1 ? '' : 'scale(' + s + ')';
  }
  function pvOnLoad(){
    if (pvSlowTimer) { clearTimeout(pvSlowTimer); pvSlowTimer = null; }
    // load = the embedded document finished its own load; it says nothing we
    // could verify about its images, so the label only claims "live".
    pvSetState('live', 'LIVE PREVIEW');
  }
  function pvOnCursorEnter(){ if (cursor) cursor.style.opacity = '0'; }
  function pvOnCursorLeave(){ if (cursor) cursor.style.opacity = ''; }

  function launchPreview(){
    if (!preview || !pvSlot || pvFrame || !DESKTOP.matches) return;
    // An open Navigation would sit over a page the user is now driving, and a
    // click inside the iframe can never reach the outside-click handler —
    // close it here, silently (focus goes to EXIT below, not the guide).
    closeNav({ silent:true });
    pvFrame = document.createElement('iframe');
    pvFrame.src = PREVIEW_URL;
    pvFrame.title = 'MOMENTRIP 라이브 프리뷰 — 실제 배포 사이트';
    pvFrame.setAttribute('loading', 'eager');
    pvFrame.setAttribute('referrerpolicy', 'no-referrer');
    pvFrame.addEventListener('load', pvOnLoad);
    // the site draws its own cursor inside the frame; hide the portfolio's one
    // so it doesn't freeze at the frame edge
    pvFrame.addEventListener('mouseenter', pvOnCursorEnter);
    pvFrame.addEventListener('mouseleave', pvOnCursorLeave);
    pvSetState('loading', 'LOADING');
    pvSlot.appendChild(pvFrame);
    pvFit();
    if ('ResizeObserver' in window) { pvResize = new ResizeObserver(pvFit); pvResize.observe(pvSlot); }
    else window.addEventListener('resize', pvFit);
    pvSlowTimer = setTimeout(function(){
      pvSlowTimer = null;
      if (pvFrame && preview.getAttribute('data-state') === 'loading') pvSetState('loading', 'STILL LOADING · OPEN SITE ↗ 로도 볼 수 있습니다');
    }, 15000);

    pvLaunch.hidden = true;
    pvExit.hidden = false;
    pvExit.focus({ preventScroll:true });
    // bring the whole preview (bar + frame) into the Stage viewport so EXIT and
    // the frame are both on screen before the user starts working inside it
    if (host) {
      var hr = host.getBoundingClientRect(), pr = preview.getBoundingClientRect();
      if (pr.top < hr.top || pr.bottom > hr.bottom) {
        host.scrollTo({ top: host.scrollTop + (pr.top - hr.top) - 24, behavior: reduced ? 'auto' : 'smooth' });
      }
    }
  }

  function exitPreview(opts){
    if (!pvFrame) return;
    if (pvSlowTimer) { clearTimeout(pvSlowTimer); pvSlowTimer = null; }
    if (pvResize) { pvResize.disconnect(); pvResize = null; }
    else window.removeEventListener('resize', pvFit);
    pvFrame.removeEventListener('load', pvOnLoad);
    pvFrame.removeEventListener('mouseenter', pvOnCursorEnter);
    pvFrame.removeEventListener('mouseleave', pvOnCursorLeave);
    pvFrame.src = 'about:blank'; // stop any in-flight requests before removal
    pvFrame.remove();
    pvFrame = null;
    pvOnCursorLeave();
    pvSetState('static', 'STATIC PREVIEW');
    pvExit.hidden = true;
    pvLaunch.hidden = false;
    // focus left inside the removed iframe would otherwise drop to <body>
    if (!(opts && opts.silent)) pvLaunch.focus({ preventScroll:true });
  }

  if (preview && pvLaunch && pvExit && pvSlot) {
    pvLaunch.hidden = false; // without this controller the static image + OPEN SITE remain
    wireCursor(pvLaunch); wireCursor(pvExit);
    wireCursor(preview.querySelector('.ov-preview-btn[href]'));
    pvLaunch.addEventListener('click', launchPreview);
    pvExit.addEventListener('click', function(){ exitPreview(); });
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
    wireCursor(btn);
    // SELECT = NAVIGATE + CLOSE.
    btn.addEventListener('click', function(){
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
