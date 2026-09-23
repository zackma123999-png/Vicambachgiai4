(() => {
  const isHome = () => {
    const route = location.hash.slice(1).split("?")[0];
    return route === "" || route === "/";
  };

  const isLandscapeDesktop = () =>
    window.matchMedia("(min-width: 900px) and (orientation: landscape)").matches;

  function placePreviewAfterMedal(root) {
    const grid = root?.querySelector(".home-desktop-grid");
    const side = grid?.querySelector(".home-desktop-side");
    const medal = side?.querySelector(".medal-picks") || root?.querySelector(".medal-picks");
    const preview = root?.querySelector(".preview-station");
    if (!side || !medal || !preview) return;
    if (preview.parentElement !== side || preview.previousElementSibling !== medal) {
      medal.after(preview);
    }
  }

  function syncSidebarOffset() {
    const app = document.getElementById("app");
    const grid = app?.querySelector(".home-desktop-grid");
    const side = grid?.querySelector(".home-desktop-side");
    const firstRail = grid?.querySelector(".home-desktop-main .rail-panel");
    if (!grid || !side || !firstRail) return;

    placePreviewAfterMedal(app);

    if (!isLandscapeDesktop()) {
      side.style.removeProperty("--home-side-offset");
      return;
    }

    side.style.setProperty("--home-side-offset", "0px");
    const gridTop = grid.getBoundingClientRect().top;
    const railTop = firstRail.getBoundingClientRect().top;
    side.style.setProperty("--home-side-offset", `${Math.max(0, railTop - gridTop)}px`);
  }

  function mountHomeDesktopLayout() {
    const app = document.getElementById("app");
    if (!app || !isHome()) return false;

    const existing = app.querySelector(".home-desktop-grid");
    if (existing) {
      placePreviewAfterMedal(app);
      syncSidebarOffset();
      return false;
    }

    const direct = (selector) => Array.from(app.children).find((node) => node.matches(selector));
    const label = direct(".home-signal-label");
    const rails = direct(".rails");
    const medal = direct(".medal-picks");
    const preview = direct(".preview-station");
    const signal = direct("#tin-hieu");
    if (!label || !rails || !medal || !preview || !signal) return false;

    const grid = document.createElement("div");
    grid.className = "home-desktop-grid";
    const main = document.createElement("div");
    main.className = "home-desktop-main";
    const side = document.createElement("aside");
    side.className = "home-desktop-side";
    side.setAttribute("aria-label", "Thông tin thư viện");

    label.before(grid);
    grid.append(main, side);
    main.append(label, rails);
    side.append(medal, preview, signal);
    requestAnimationFrame(syncSidebarOffset);
    return true;
  }

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      mountHomeDesktopLayout();
    });
  };

  document.addEventListener("DOMContentLoaded", schedule, { once: true });
  window.addEventListener("hashchange", schedule);
  window.addEventListener("resize", schedule, { passive: true });
  window.addEventListener("orientationchange", schedule, { passive: true });

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  let attempts = 0;
  const retry = setInterval(() => {
    attempts += 1;
    if (mountHomeDesktopLayout() || attempts >= 20) clearInterval(retry);
  }, 250);

  schedule();
})();