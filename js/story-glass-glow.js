/* Touch/focus feedback for the transparent story rails. */
(function () {
  var timers = new WeakMap();

  function clearGlow(panel) {
    if (!panel) return;
    var oldTimer = timers.get(panel);
    if (oldTimer) window.clearTimeout(oldTimer);
    panel.classList.remove("is-glowing");
    panel.querySelectorAll(".wide-card.is-selected").forEach(function (card) {
      card.classList.remove("is-selected");
    });
  }

  function light(target, event) {
    var panel = target.closest && target.closest(".rail-panel");
    if (!panel) return;

    var card = target.closest(".wide-card");
    document.querySelectorAll(".rail-panel.is-glowing").forEach(function (otherPanel) {
      if (otherPanel !== panel) clearGlow(otherPanel);
    });
    clearGlow(panel);
    panel.classList.add("is-glowing");

    if (event && typeof event.clientX === "number") {
      var rect = panel.getBoundingClientRect();
      if (rect.width && rect.height) {
        panel.style.setProperty("--rail-glow-x", (((event.clientX - rect.left) / rect.width) * 100).toFixed(1) + "%");
        panel.style.setProperty("--rail-glow-y", (((event.clientY - rect.top) / rect.height) * 100).toFixed(1) + "%");
      }
    }

    if (card) card.classList.add("is-selected");

    timers.set(panel, window.setTimeout(function () {
      clearGlow(panel);
    }, 720));
  }

  document.addEventListener("pointerdown", function (event) {
    light(event.target, event);
  }, { passive: true });

  document.addEventListener("focusin", function (event) {
    if (event.target.closest && event.target.closest(".wide-card")) light(event.target);
  });

  document.addEventListener("focusout", function (event) {
    var panel = event.target.closest && event.target.closest(".rail-panel");
    if (!panel) return;
    window.setTimeout(function () {
      if (!panel.contains(document.activeElement)) clearGlow(panel);
    }, 0);
  });
})();
