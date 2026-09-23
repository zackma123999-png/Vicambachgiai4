/* ViCamBachGiai — fully non-blocking stale-while-revalidate startup. */
(function () {
  if (!window.VCBG || typeof window.VCBG.init !== "function") return;

  var HERO_KEY = "vicambachgiai.hero.v1";
  var CATALOG_KEY = "vicambachgiai.catalog.v1";
  var MODE_KEY = "vicambachgiai.mode.v1";
  var originalInit = window.VCBG.init.bind(window.VCBG);
  var originalListStories = window.VCBG.listStories.bind(window.VCBG);
  var started = false;
  var backgroundInit = null;
  var backgroundDone = false;

  function proxyCover(s) {
    if (!s || !s.id) return "";
    if (/^https?:\/\//i.test(String(s.cover || s.cover_url || "")) && !/\/functions\/v1\/story-cover/i.test(String(s.cover || s.cover_url || ""))) {
      return String(s.cover || s.cover_url);
    }
    var v = Number(s.updated_at || 0) || Date.now();
    return "https://isawawkxjbnlbuxlhlnk.supabase.co/functions/v1/story-cover?id=" + encodeURIComponent(s.id) + "&v=" + encodeURIComponent(v);
  }

  function normalizeFallback(s) {
    var copy = Object.assign({}, s || {});
    copy.genres = Array.isArray(copy.genres) ? copy.genres : [];
    copy.tags = Array.isArray(copy.tags) ? copy.tags : [];
    copy.stats = Object.assign(
      { views: 0, likes: 0, rating_avg: 0, rating_count: 0, chapter_count: 0, latest_chapter: null },
      copy.stats || {}
    );
    if (!copy.cover || /^data:image\//i.test(copy.cover)) copy.cover = proxyCover(copy);
    return copy;
  }

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (_) { return null; }
  }

  function readFallback() {
    var hero = readJson(HERO_KEY);
    if (hero && Array.isArray(hero.stories) && hero.stories.length) return hero.stories.map(normalizeFallback);
    var catalog = readJson(CATALOG_KEY);
    if (catalog && Array.isArray(catalog.stories) && catalog.stories.length) return catalog.stories.map(normalizeFallback);
    return (Array.isArray(window.VCBG_HERO_SNAPSHOT) ? window.VCBG_HERO_SNAPSHOT : []).map(normalizeFallback);
  }

  var fallbackStories = readFallback();

  function filterFallback(opts) {
    opts = opts || {};
    var list = fallbackStories.slice();
    if (opts.status) list = list.filter(function (s) { return s.status === opts.status; });
    if (opts.featured) list = list.filter(function (s) { return !!s.featured; });
    if (opts.upcoming) list = list.filter(function (s) { return !!s.upcoming; });
    if (opts.q) {
      var q = String(opts.q).toLowerCase();
      list = list.filter(function (s) {
        return String(s.title || "").toLowerCase().indexOf(q) >= 0 || String(s.author || "").toLowerCase().indexOf(q) >= 0;
      });
    }
    if (opts.sort === "updated") list.sort(function (a, b) { return Number(b.updated_at || 0) - Number(a.updated_at || 0); });
    else if (opts.sort === "az") list.sort(function (a, b) { return String(a.title || "").localeCompare(String(b.title || ""), "vi"); });
    return list;
  }

  window.VCBG.listStories = function instantListStories(opts) {
    var live = [];
    try { live = originalListStories(opts || {}); } catch (_) {}
    if (live && live.length) return live;
    return filterFallback(opts || {});
  };

  function saveLiveFallback() {
    try {
      var live = originalListStories({ sort: "updated" }) || [];
      if (!live.length) return;
      var slim = live.slice(0, 40).map(function (s) {
        return normalizeFallback({
          id: s.id,
          title: s.title,
          slug: s.slug,
          author: s.author,
          synopsis: String(s.synopsis || "").slice(0, 900),
          status: s.status,
          featured: !!s.featured,
          upcoming: !!s.upcoming,
          home_priority: Number(s.home_priority) > 0 ? Number(s.home_priority) : null,
          accent: s.accent || "#8a6a4a",
          updated_at: Number(s.updated_at || 0),
          cover: proxyCover(s),
          genres: (s.genres || []).slice(0, 3),
          tags: (s.tags || []).slice(0, 3),
          stats: s.stats || undefined
        });
      });
      fallbackStories = slim;
      localStorage.setItem(HERO_KEY, JSON.stringify({ at: Date.now(), stories: slim }));
    } catch (_) {}
  }

  /* Remembers the last confirmed site_mode so the instant-paint shortcut below
     can tell "known open" from "known under maintenance" from "never checked
     on this device" — it must never assume "normal" for the latter two. */
  function saveLiveMode() {
    try {
      var live = (window.VCBG.settings && window.VCBG.settings()) || null;
      var mode = live && ["normal", "readonly", "maintenance"].includes(live.site_mode) ? live.site_mode : "normal";
      localStorage.setItem(MODE_KEY, JSON.stringify({ at: Date.now(), mode: mode }));
    } catch (_) {}
  }

  window.VCBG.cachedSiteMode = function cachedSiteMode() {
    var m = readJson(MODE_KEY);
    return (m && m.mode) || null;
  };

  function startBackgroundRefresh() {
    if (started) return backgroundInit || Promise.resolve();
    started = true;
    try {
      backgroundInit = Promise.resolve(originalInit())
        .then(function () {
          backgroundDone = true;
          saveLiveFallback();
          saveLiveMode();
          try { window.dispatchEvent(new CustomEvent("vcbg:data-ready")); } catch (_) {}
        })
        .catch(function (err) {
          backgroundDone = true;
          console.error("[VCBG background init]", err);
          try { window.dispatchEvent(new CustomEvent("vcbg:data-ready")); } catch (_) {}
        });
    } catch (err) {
      backgroundDone = true;
      console.error("[VCBG background init]", err);
      backgroundInit = Promise.resolve();
    }
    return backgroundInit;
  }

  window.VCBG.init = function sessionSafeInit() {
    /* Cached story data remains available immediately, but routing and account
       controls must wait until the persisted Supabase session is restored. */
    return startBackgroundRefresh();
  };

  /* Auth guards must wait for this promise, not VCBG.whenReady(), whose bootPromise can
     already have been cleared by the time a mobile user taps the Admin menu. */
  window.VCBG.backgroundReady = function backgroundReady() {
    return startBackgroundRefresh();
  };
  window.VCBG.isBackgroundReady = function isBackgroundReady() {
    return backgroundDone;
  };

  startBackgroundRefresh();
})();
