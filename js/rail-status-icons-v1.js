// Pause decorative shelf animations when their section is off screen.
(function () {
  function bind(root) {
    const panels = Array.from((root || document).querySelectorAll?.(".rail-panel") || []);
    if (!panels.length) return;
    if (!("IntersectionObserver" in window)) {
      panels.forEach((panel) => panel.classList.add("is-icon-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle("is-icon-visible", entry.isIntersecting);
      });
    }, { rootMargin: "80px 0px", threshold: .08 });
    panels.forEach((panel) => {
      if (panel.dataset.railIconBound === "true") return;
      panel.dataset.railIconBound = "true";
      observer.observe(panel);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => bind(document), { once: true });
  } else {
    bind(document);
  }

  new MutationObserver((mutations) => {
    if (mutations.some((item) => item.addedNodes.length)) bind(document);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
