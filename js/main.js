(function(){
  var root = document.documentElement;
  var bigFolder = document.getElementById('big-folder');
  var miniFolder = document.getElementById('mini-folder');

  if (bigFolder) {
    bigFolder.addEventListener('click', function(){
      bigFolder.classList.remove('closing');
      bigFolder.classList.add('opening');
      root.classList.add('ws-open');
    });
    bigFolder.addEventListener('animationend', function(e){
      if (e.animationName === 'folder-collapse-away') bigFolder.classList.remove('opening');
      if (e.animationName === 'folder-collapse-return') bigFolder.classList.remove('closing');
    });
  }
  if (miniFolder) {
    miniFolder.addEventListener('click', function(){
      bigFolder.classList.remove('opening');
      bigFolder.classList.add('closing');
      root.classList.remove('ws-open');
    });
  }
})();

/* -- AI Collaboration Workspace: typed prompt -> send -> generating -> response -- */
(function(){
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initWorkspace(root){
    var typeEl = root.querySelector('[data-typewriter]');
    var sendEl = root.querySelector('[data-send]');
    var promptBlock = root.querySelector('.ai-prompt-block');
    var responseBlock = root.querySelector('[data-response]');
    var replayBtn = root.querySelector('[data-replay]');
    if (!typeEl || !sendEl || !promptBlock || !responseBlock) return;

    var fullText = typeEl.textContent;
    var fast = root.getAttribute('data-speed') === 'fast';
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

    function showFinalState(){
      typeEl.textContent = fullText;
      promptBlock.setAttribute('data-submitted', 'true');
      setSend('sent', 'SENT');
      responseBlock.setAttribute('data-state', 'done');
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
          });
        });
      });
    }

    function runSequence(){
      clearPending();

      if (reduced) { showFinalState(); return; }

      if (fast) {
        typeEl.textContent = fullText;
        afterTyping();
        return;
      }

      typeEl.textContent = '';
      var i = 0;
      var step = 2;
      var timer = setInterval(function(){
        i += step;
        typeEl.textContent = fullText.slice(0, i);
        if (i >= fullText.length) {
          clearInterval(timer);
          typeEl.textContent = fullText;
          afterTyping();
        }
      }, 22);
      pending.push(timer);
    }

    function playOnce(){
      if (played) return;
      played = true;
      runSequence();
    }

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

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if (entry.isIntersecting) { playOnce(); io.disconnect(); }
        });
      }, { threshold: 0.35 });
      io.observe(root);
    } else {
      playOnce();
    }
  }

  document.querySelectorAll('[data-ai-workspace]').forEach(initWorkspace);
})();
