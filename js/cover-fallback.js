/* ViCamBachGiai — fallback only when the lightweight story-cover proxy fails.
   Normal covers still use the cached proxy; a failed image fetches only its own original cover_url. */
(function () {
  var inFlight = Object.create(null);
  var resolved = Object.create(null);

  function storyIdFrom(src) {
    try {
      var u = new URL(src, location.href);
      if (!/\/functions\/v1\/story-cover$/i.test(u.pathname)) return "";
      return u.searchParams.get("id") || "";
    } catch (_) {
      return "";
    }
  }

  function rawClient() {
    try {
      var make = window.__VCBG_ORIGINAL_SUPABASE_CREATE_CLIENT__;
      var cfg = window.VCBG_CONFIG || {};
      if (typeof make !== "function" || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
      return make(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
    } catch (_) {
      return null;
    }
  }

  function getOriginalCover(id) {
    if (resolved[id]) return Promise.resolve(resolved[id]);
    if (inFlight[id]) return inFlight[id];
    var sb = rawClient();
    if (!sb) return Promise.resolve("");
    inFlight[id] = Promise.resolve(
      sb.from("stories").select("cover_url").eq("id", id).maybeSingle()
    ).then(function (result) {
      var url = result && !result.error && result.data && result.data.cover_url ? String(result.data.cover_url) : "";
      if (url) resolved[id] = url;
      return url;
    }).catch(function () { return ""; }).finally(function () {
      delete inFlight[id];
    });
    return inFlight[id];
  }

  document.addEventListener("error", function (ev) {
    var img = ev.target;
    if (!img || img.tagName !== "IMG" || img.dataset.vcbgCoverFallback === "done") return;
    var id = storyIdFrom(img.currentSrc || img.src || "");
    if (!id) return;
    img.dataset.vcbgCoverFallback = "done";
    getOriginalCover(id).then(function (url) {
      if (url) img.src = url;
    });
  }, true);
})();
