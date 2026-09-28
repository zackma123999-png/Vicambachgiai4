// Splash screen: the nav's own cat mark + wordmark PNGs materialise from
// scattered particles, hold briefly, then the overlay fades to reveal the
// homepage underneath. Ported from a React/canvas "vapour text" effect
// (vicambachgiai.com has no React or build step) — instead of sampling
// live-rendered text, this samples the actual logo PNGs, so the shape is
// pixel-identical to the header's own logo rather than an approximation
// in a web font.
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DURATION = 550; // particles converging — kept short by request
  var HOLD = 200;      // full logo held before fading
  var FADE = reduceMotion ? 150 : 320;

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
      overlay.classList.add("is-leaving");
      window.setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, FADE + 60);
    }
    // Images are same-origin (served with the page itself), so this never
    // hits a canvas tainted/CORS error — but if a asset request fails or
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
        window.setTimeout(finish, HOLD);
        return;
      }

      drawLogo();
      var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      var particles = [];
      var step = Math.max(1, Math.round(DPR));
      for (var y = 0; y < canvas.height; y += step) {
        for (var x = 0; x < canvas.width; x += step) {
          var i = (y * canvas.width + x) * 4;
          var a = data[i + 3];
          if (a > 10) {
            var angle = Math.random() * Math.PI * 2;
            var radius = (26 + Math.random() * 46) * DPR;
            particles.push({
              ox: x, oy: y,
              sx: x + Math.cos(angle) * radius,
              sy: y + Math.sin(angle) * radius,
              r: data[i], g: data[i + 1], b: data[i + 2], a: a / 255,
              // Small per-particle stagger (up to ~22% of the total
              // duration) so the materialise reads as an organic
              // convergence rather than every pixel snapping in lockstep.
              delay: Math.random() * 0.22,
            });
          }
        }
      }

      function easeOutCubic(p) { return 1 - Math.pow(1 - p, 3); }
      var t0 = null;
      function frame(ts) {
        if (t0 === null) t0 = ts;
        var elapsed = ts - t0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        var allDone = true;
        for (var k = 0; k < particles.length; k++) {
          var p = particles[k];
          var local = (elapsed / DURATION - p.delay) / (1 - p.delay);
          if (local < 1) allDone = false;
          var e = easeOutCubic(Math.max(0, Math.min(1, local)));
          var x = p.sx + (p.ox - p.sx) * e;
          var y = p.sy + (p.oy - p.sy) * e;
          ctx.fillStyle = "rgba(" + p.r + "," + p.g + "," + p.b + "," + (p.a * e) + ")";
          ctx.fillRect(x, y, step, step);
        }
        if (!allDone && elapsed < DURATION * 1.3) {
          requestAnimationFrame(frame);
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          drawLogo();
          window.setTimeout(finish, HOLD);
        }
      }
      requestAnimationFrame(frame);
    }
  });
})();
