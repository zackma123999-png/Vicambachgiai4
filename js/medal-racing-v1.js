(() => {
  let frame = 0;
  let boundList = null;

  function cards() {
    return Array.from(document.querySelectorAll("#app .medal-picks .medal-pick"));
  }

  function activate(target) {
    const previous = document.querySelector("#app .medal-picks .medal-pick.is-race-active");
    cards().forEach((card) => {
      const active = card === target;
      card.classList.toggle("is-race-active", active);
      card.setAttribute("aria-current", active ? "true" : "false");
    });
    if (target && target !== previous) {
      target.style.animation = "none";
      void target.offsetWidth;
      target.style.animation = "";
    }
  }

  function touchBounce(card) {
    if (!card) return;
    card.classList.remove("is-touch-bounce");
    const beam = card.querySelector(".medal-pick-border-beam");
    if (beam) beam.style.animation = "none";
    void card.offsetWidth;
    if (beam) beam.style.animation = "";
    card.classList.add("is-touch-bounce");
    window.setTimeout(() => card.classList.remove("is-touch-bounce"), 420);
  }

  function syncActiveCard() {
    frame = 0;
    const items = cards();
    if (!items.length) return;

    const viewportCenter = window.innerHeight * .52;
    const visible = items.filter((card) => {
      const rect = card.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    });
    if (!visible.length) return;

    const nearest = visible.reduce((best, card) => {
      const rect = card.getBoundingClientRect();
      const distance = Math.abs((rect.top + rect.bottom) / 2 - viewportCenter);
      return !best || distance < best.distance ? { card, distance } : best;
    }, null);
    activate(nearest.card);
  }

  function queueSync() {
    if (frame) return;
    frame = requestAnimationFrame(syncActiveCard);
  }

  function bind() {
    const list = document.querySelector("#app .medal-picks-list");
    if (!list || list === boundList) return;
    boundList = list;

    const items = cards();
    if (items.length) activate(items[0]);
    list.addEventListener("focusin", (event) => {
      const card = event.target.closest(".medal-pick");
      if (card) activate(card);
    });
    list.addEventListener("pointerdown", (event) => {
      const card = event.target.closest(".medal-pick");
      if (card) {
        activate(card);
        touchBounce(card);
      }
    }, { passive: true });
    queueSync();
  }

  window.addEventListener("scroll", queueSync, { passive: true });
  window.addEventListener("resize", queueSync, { passive: true });
  window.addEventListener("hashchange", bind);
  document.addEventListener("DOMContentLoaded", bind, { once: true });
  new MutationObserver(bind).observe(document.documentElement, { childList: true, subtree: true });
  bind();
})();
