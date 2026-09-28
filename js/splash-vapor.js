// Splash screen: the nav's own cat mark + wordmark PNGs appear, then
// dissolve away in a left-to-right "vaporize" wipe — pixels behind the
// wave scatter outward and fade while pixels ahead stay solid, exactly
// like the pasted 21st.dev VaporizeTextCycle reference (direction:
// "left-to-right", the vaporizing state's particle physics) — ported to
// vanilla JS/Canvas since this site has no React/build step. Once the
// wave has swept the whole logo away, the homepage underneath is revealed.
// Sampled from the actual logo PNGs (not re-rendered text), so the shape
// is pixel-identical to the header's own logo.
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var FADE_IN = 150;      // logo appearing, before it starts dissolving
  var HOLD = 90;           // brief hold once fully formed
  var VAPORIZE_SWEEP = 460; // time for the wave to cross the logo, left to right
  var TAIL_MAX = 700;      // hard cap on how long leftover drifting particles get
  var OVERLAY_FADE = reduceMotion ? 120 : 180;
  var DENSITY = 0.65;       // fraction of particles that drift+fade normally (rest fade quickly)

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  ready(function () {
    var overlay = document.createElement("div");
    overlay.id = "vcbgSplash";
    document.body.insertBefore(overlay, document.body.firstChild);

    var DPR = Math.min(window.devicePixelRatio || 1, 2);
    var SPREAD = 3 * DPR; // device-px scale for scatter velocity/distance
    var MARK = 72, GAP = 16, WORD_H = 54;
    var WORD_W = Math.round(WORD_H * (349 / 96)); // native word.png aspect
    var W = MARK + GAP + WORD_W, H = Math.max(MARK, WORD_H);
    var markY = (H - MARK) / 2, wordY = (H - WORD_H) / 2;

    var canvas = document.createElement("canvas");
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    overlay.appendChild(canvas);
    var ctx = canvas.getContext("2d");

    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      window.clearTimeout(failsafe);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      overlay.classList.add("is-leaving");
      window.setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, OVERLAY_FADE + 60);
    }
    // Images are same-origin (served with the page itself), so this never
    // hits a canvas tainted/CORS error — but if an asset request fails or
    // just takes too long on a slow connection, never leave the splash up
    // blocking the real site.
    var failsafe = window.setTimeout(finish, 2200);

    var drawLogo = function () {
      ctx.save();
      ctx.scale(DPR, DPR);
      ctx.drawImage(markImg, 0, markY, MARK, MARK);
      ctx.drawImage(wordImg, MARK + GAP, wordY, WORD_W, WORD_H);
      ctx.restore();
    };

    var markImg = new Image();
    var wordImg = new Image();
    var loaded = 0;
    function onImgReady() { loaded += 1; if (loaded === 2) start(); }
    markImg.onload = onImgReady;
    wordImg.onload = onImgReady;
    markImg.onerror = finish;
    wordImg.onerror = finish;
    markImg.src = "brand/cat-mark.png";
    wordImg.src = "brand/word.png";

    function start() {
      window.clearTimeout(failsafe);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      if (reduceMotion) {
        drawLogo();
        window.setTimeout(finish, FADE_IN + HOLD);
        return;
      }

      drawLogo();
      var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      var particles = [];
      var step = Math.max(1, Math.round(DPR));
      var left = Infinity, right = -Infinity;
      for (var y = 0; y < canvas.height; y += step) {
        for (var x = 0; x < canvas.width; x += step) {
          var i = (y * canvas.width + x) * 4;
          var a = data[i + 3];
          if (a > 10) {
            if (x < left) left = x;
            if (x > right) right = x;
            particles.push({
              x: x, y: y, ox: x, oy: y,
              r: data[i], g: data[i + 1], b: data[i + 2],
              alpha: a / 255, opacity: 0,
              vx: 0, vy: 0, speed: 0, quickFade: false,
            });
          }
        }
      }
      var boundsWidth = Math.max(1, right - left);

      function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (var k = 0; k < particles.length; k++) {
          var p = particles[k];
          if (p.opacity <= 0) continue;
          ctx.fillStyle = "rgba(" + p.r + "," + p.g + "," + p.b + "," + (p.alpha * p.opacity) + ")";
          ctx.fillRect(p.x, p.y, step, step);
        }
      }

      // Phase 1: fade the whole logo in at its natural position (fast).
      var t0 = null;
      function fadeInFrame(ts) {
        if (t0 === null) t0 = ts;
        var e = Math.min(1, (ts - t0) / FADE_IN);
        for (var k = 0; k < particles.length; k++) particles[k].opacity = e;
        render();
        if (e < 1) {
          requestAnimationFrame(fadeInFrame);
        } else {
          window.setTimeout(startVaporize, HOLD);
        }
      }
      requestAnimationFrame(fadeInFrame);

      // Phase 2: vaporize wave sweeps left to right; particles it reaches
      // scatter outward with damped random drift and fade out, exactly
      // matching the pasted reference's updateParticles() physics.
      function startVaporize() {
        var last = null;
        function frame(ts) {
          if (last === null) last = ts;
          var dt = Math.min(0.05, (ts - last) / 1000);
          last = ts;
          var elapsedSweep = ts - (t0 + FADE_IN + HOLD);
          var progress = Math.min(100, Math.max(0, elapsedSweep / VAPORIZE_SWEEP * 100));
          var vaporizeX = left + boundsWidth * progress / 100;
          var sweepDone = progress >= 100;

          var allDone = true;
          for (var k = 0; k < particles.length; k++) {
            var p = particles[k];
            var activated = p.ox <= vaporizeX;
            if (!activated) { allDone = false; continue; }
            if (p.opacity < 1) p.opacity = Math.min(1, p.opacity + dt * 20); // in case fade-in hadn't fully caught up

            if (p.speed === 0) {
              var angle = Math.random() * Math.PI * 2;
              p.speed = (Math.random() * 1 + 0.5) * SPREAD;
              p.vx = Math.cos(angle) * p.speed;
              p.vy = Math.sin(angle) * p.speed;
              p.quickFade = Math.random() > DENSITY;
            }

            if (p.quickFade) {
              p.opacity = Math.max(0, p.opacity - dt * (sweepDone ? 4 : 2.4));
            } else {
              var dx = p.ox - p.x, dy = p.oy - p.y;
              var dist = Math.sqrt(dx * dx + dy * dy);
              var damping = Math.max(0.95, 1 - dist / (100 * SPREAD));
              var rs = SPREAD * 3;
              p.vx = (p.vx + (Math.random() - 0.5) * rs + dx * 0.002) * damping;
              p.vy = (p.vy + (Math.random() - 0.5) * rs + dy * 0.002) * damping;
              var maxV = SPREAD * 2;
              var curV = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
              if (curV > maxV) { var s = maxV / curV; p.vx *= s; p.vy *= s; }
              p.x += p.vx * dt * 20;
              p.y += p.vy * dt * 10;
              var rate = sweepDone ? 3 : 0.25 * (2000 / VAPORIZE_SWEEP);
              p.opacity = Math.max(0, p.opacity - dt * rate);
            }
            if (p.opacity > 0.01) allDone = false;
          }
          render();

          if ((allDone && sweepDone) || elapsedSweep > VAPORIZE_SWEEP + TAIL_MAX) {
            finish();
          } else {
            requestAnimationFrame(frame);
          }
        }
        requestAnimationFrame(frame);
      }
    }
  });
})();
