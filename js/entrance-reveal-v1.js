// Makes headline text, section headers and card grids fade/rise into view on
// open and on scroll, so the page feels alive instead of a static newspaper
// layout. The app rewrites #app's innerHTML wholesale on every route change,
// so this re-scans on any DOM mutation rather than once at DOMContentLoaded.
(function () {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var GROUPS = [
    // The homepage hero — the very first thing seen when the site opens.
    { selector: ".signal-hero .sh-tags, .signal-hero .sh-overline, .signal-hero .sh-title, .signal-hero .sh-author, .signal-hero .sh-stats, .signal-hero .sh-ctas, .signal-hero .sh-trust", step: 70 },
    // Section headers and page titles across the site.
    { selector: ".rail-head, .medal-picks-head, .preview-station-head, .cm-wrap, h1.hero-title, .section > h2, .story-copy > *", step: 55 },
    // The Kệ Truyện shelf — tabs then carousel, same rise-from-below as the
    // banner. Not the hero-info panel underneath, since that panel is torn
    // down and rebuilt every time the front card changes (dragging the shelf
    // would otherwise re-trigger its entrance on every rotation).
    { selector: ".shelf-head, .shelf-stage", step: 70 },
    // The homepage "resonance" panel — its own pieces, sliding in from the right.
    { selector: ".reshome-card > *", step: 60, from: "right" },
    // Card grids and list rows — staggered per grid, capped so a long shelf doesn't crawl in.
    { selector: ".card-grid > *, .rail[data-rail] > *, .medal-picks-list > *, .preview-station-rail > *, .chapter-list > li", step: 55, cap: 8 },
    // Footer — reveals once scrolled to, sliding in from the left, on every page.
    { selector: ".foot2-body > *:not(.foot2-cols), .foot2-cols > .foot2-section, .foot2-copy", step: 60, from: "left" },
  ];

  function mark(el, delayMs, from) {
    if (el.dataset.reveal) return;
    el.dataset.reveal = "hidden";
    if (from) el.dataset.revealFrom = from;
    el.style.setProperty("--reveal-delay", (delayMs / 1000).toFixed(3) + "s");
  }

  function collect() {
    GROUPS.forEach(function (group) {
      var cap = group.cap || 24;
      var perParentIndex = new Map();
      document.querySelectorAll(group.selector).forEach(function (el) {
        var parent = el.parentElement;
        var i = perParentIndex.get(parent) || 0;
        perParentIndex.set(parent, i + 1);
        mark(el, Math.min(i, cap) * group.step, group.from);
      });
    });
  }

  var observer = ("IntersectionObserver" in window)
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.dataset.reveal = "visible";
          observer.unobserve(entry.target);
        });
      }, { rootMargin: "0px 0px -6% 0px", threshold: .12 })
    : null;

  function bind() {
    collect();
    var pending = document.querySelectorAll('[data-reveal="hidden"]');
    if (!observer) {
      pending.forEach(function (el) { el.dataset.reveal = "visible"; });
      return;
    }
    pending.forEach(function (el) { observer.observe(el); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { bind(); }, { once: true });
  } else {
    bind();
  }

  new MutationObserver(function (mutations) {
    if (mutations.some(function (m) { return m.addedNodes.length; })) bind();
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
