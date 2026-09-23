/* Safety bridge for the lightweight public story transport.
   If an admin edits an existing story whose displayed cover is the CDN proxy URL,
   fetch the original stored cover only for that one save so the database is never
   overwritten with a self-referencing proxy URL. */
(function () {
  if (!window.VCBG || typeof window.VCBG.upsertStory !== "function") return;
  var originalUpsertStory = window.VCBG.upsertStory.bind(window.VCBG);

  function isCoverProxy(value) {
    return /\/functions\/v1\/story-cover\?id=/i.test(String(value || ""));
  }

  async function fetchStoredCover(id) {
    var makeClient = window.__VCBG_ORIGINAL_SUPABASE_CREATE_CLIENT__;
    var cfg = window.VCBG_CONFIG || {};
    if (!id || typeof makeClient !== "function" || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
    var c = makeClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    var result = await c.from("stories").select("cover_url").eq("id", id).maybeSingle();
    if (result && !result.error && result.data && result.data.cover_url) return result.data.cover_url;
    return null;
  }

  window.VCBG.upsertStory = async function guardedUpsertStory(data) {
    var next = Object.assign({}, data || {});
    if (next.id && isCoverProxy(next.cover)) {
      var stored = await fetchStoredCover(next.id);
      if (!stored) throw new Error("Không đọc được bìa gốc. Vui lòng thử lại trước khi lưu truyện.");
      next.cover = stored;
    }
    return originalUpsertStory(next);
  };
})();
