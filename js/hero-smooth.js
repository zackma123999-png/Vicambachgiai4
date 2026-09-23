/* Reveal the initial five-card hero fan as one unit, never one cover at a time. */
(function () {
  function whenReady(img) {
    if (!img) return Promise.resolve();
    if (img.complete && img.naturalWidth > 0) {
      if (typeof img.decode === "function") return img.decode().catch(function () {});
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      var done = function () {
        img.removeEventListener("load", done);
        img.removeEventListener("error", done);
        if (typeof img.decode === "function") img.decode().catch(function () {}).then(resolve);
        else resolve();
      };
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    });
  }

  function arm(hero) {
    if (!hero || hero.dataset.smoothArmed === "1") return;
    hero.dataset.smoothArmed = "1";

    var imgs = Array.prototype.slice.call(
      hero.querySelectorAll('.stack-card[data-d="-2"] .stack-cover, .stack-card[data-d="-1"] .stack-cover, .stack-card[data-d="0"] .stack-cover, .stack-card[data-d="1"] .stack-cover, .stack-card[data-d="2"] .stack-cover')
    );

    imgs.forEach(function (img) {
      img.loading = "eager";
      try { img.fetchPriority = "high"; } catch (_) {}
    });

    var reveal = function () {
      if (hero.classList.contains("hero-fan-ready")) return;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          hero.classList.add("hero-fan-ready");
        });
      });
    };

    Promise.all(imgs.map(whenReady)).then(reveal);
    setTimeout(reveal, 2200);
  }

  function scan() {
    arm(document.getElementById("hero"));
  }

  var observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan);
  else scan();
})();
