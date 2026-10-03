// Splash screen: a one-time "signal lock-on" reveal of the hero video,
// the cat-mark logo and the ViCamBachGiai wordmark, played once before the
// homepage underneath becomes visible. Matches the site's digital-billboard/
// mono-cyan identity (see banner-redesign-v1.css) — glitch-snap mark, a
// scanline that sweeps the wordmark into being (briefly filled with the
// live video before it crystallizes solid), then a typewriter tagline.
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var SEQUENCE_END = 2100; // ms — when the last reveal animation finishes
  var HOLD = 550;          // ms — tagline stays readable before fading out
  var FADE = reduceMotion ? 180 : 350;
  var HARD_FAILSAFE = 6000; // never let the splash block the real site

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
    overlay.innerHTML =
      '<video class="sp-bg" id="spBgVideo" muted loop playsinline autoplay preload="auto" poster="brand/hero-bg-poster.jpg">' +
        '<source src="brand/hero-bg.mp4" type="video/mp4">' +
      '</video>' +
      '<div class="sp-vignette"></div>' +
      '<div class="sp-grain"></div>' +
      '<div class="sp-tune"></div>' +
      '<div class="sp-brand">' +
        '<div class="sp-mark-wrap">' +
          '<div class="sp-mark-flash"></div>' +
          '<img class="sp-mark-img" src="brand/cat-mark.png" alt="">' +
        '</div>' +
        '<div class="sp-word-wrap">' +
          '<img class="sp-word-img" id="spWordImg" src="brand/word.png" alt="ViCamBachGiai">' +
          '<video class="sp-word-video" muted loop playsinline autoplay preload="auto">' +
            '<source src="brand/hero-bg.mp4" type="video/mp4">' +
          '</video>' +
          '<div class="sp-scanline"></div>' +
        '</div>' +
        '<p class="sp-tagline-row"><span class="sp-tagline-dot"></span><span class="sp-tagline-type">THƯ VIỆN BÁCH HỢP — ĐỌC CHẬM</span></p>' +
      '</div>';
    document.body.insertBefore(overlay, document.body.firstChild);

    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      window.clearTimeout(hardFailsafe);
      overlay.classList.add("is-leaving");
      window.setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, FADE + 60);
    }
    var hardFailsafe = window.setTimeout(finish, HARD_FAILSAFE);

    if (reduceMotion) {
      overlay.classList.add("is-playing");
      window.setTimeout(finish, 420);
      return;
    }

    var wordImg = document.getElementById("spWordImg");
    var taglineType = overlay.querySelector(".sp-tagline-type");

    function measureTagline() {
      var w = taglineType.scrollWidth;
      if (w > 0) document.documentElement.style.setProperty("--sp-tagline-w", w + "px");
    }

    function startOnce() {
      if (overlay.classList.contains("is-playing")) return;
      try {
        document.documentElement.style.setProperty("--sp-word-mask", "url(" + wordImg.src + ")");
      } catch (e) {}
      measureTagline();
      overlay.classList.add("is-playing");
      window.setTimeout(finish, SEQUENCE_END + HOLD);
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measureTagline).catch(function () {});
    }

    var video = document.getElementById("spBgVideo");
    var watchdog = window.setTimeout(startOnce, 900); // don't block the reveal on a slow video fetch
    if (video.readyState >= 2) {
      window.clearTimeout(watchdog);
      startOnce();
    } else {
      video.addEventListener("loadeddata", function () {
        window.clearTimeout(watchdog);
        startOnce();
      }, { once: true });
    }

    overlay.querySelectorAll("video").forEach(function (v) {
      try { v.play().catch(function () {}); } catch (e) {}
    });
  });
})();
