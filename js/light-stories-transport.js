/* ViCamBachGiai: keep large base64 covers out of normal public story queries.
   Only SELECT * on stories is rewritten; writes and every other table are untouched. */
(function () {
  if (!window.supabase || typeof window.supabase.createClient !== "function") return;

  var originalCreateClient = window.supabase.createClient.bind(window.supabase);
  window.__VCBG_ORIGINAL_SUPABASE_CREATE_CLIENT__ = originalCreateClient;

  function coverProxy(row) {
    if (!row || !row.id) return "";
    if (/^https?:\/\//i.test(String(row.cover_url || ""))) return String(row.cover_url);
    var base = (window.VCBG_CONFIG && window.VCBG_CONFIG.supabaseUrl) || "https://isawawkxjbnlbuxlhlnk.supabase.co";
    var v = row.updated_at || "";
    return base.replace(/\/$/, "") + "/functions/v1/story-cover?id=" + encodeURIComponent(row.id) + "&v=" + encodeURIComponent(v);
  }

  function wrapStoriesQuery(query) {
    if (!query || typeof Proxy === "undefined") return query;
    return new Proxy(query, {
      get: function (target, prop, receiver) {
        if (prop === "then") {
          return function (resolve, reject) {
            return target.then(function (result) {
              if (result && Array.isArray(result.data)) {
                result = Object.assign({}, result, {
                  data: result.data.map(function (row) {
                    return Object.assign({}, row, { cover_url: coverProxy(row) });
                  })
                });
              } else if (result && result.data && result.data.id) {
                result = Object.assign({}, result, {
                  data: Object.assign({}, result.data, { cover_url: coverProxy(result.data) })
                });
              }
              return resolve(result);
            }, reject);
          };
        }
        var value = Reflect.get(target, prop, receiver);
        if (typeof value === "function") {
          return function () {
            var out = value.apply(target, arguments);
            return out && typeof out === "object" ? wrapStoriesQuery(out) : out;
          };
        }
        return value;
      }
    });
  }

  window.supabase.createClient = function () {
    var client = originalCreateClient.apply(null, arguments);
    if (!client || typeof client.from !== "function") return client;

    var originalFrom = client.from.bind(client);
    client.from = function (table) {
      var builder = originalFrom(table);
      if (table !== "stories" || !builder || typeof builder.select !== "function") return builder;

      var originalSelect = builder.select.bind(builder);
      builder.select = function (columns, options) {
        var cols = columns;
        if (!cols || String(cols).trim() === "*") {
          cols = "id,slug,title,author,synopsis,status,featured,upcoming,home_priority,created_at,updated_at,editor,accent,published,description,cover_url,tiktok_intro_url";
        }
        return wrapStoriesQuery(originalSelect(cols, options));
      };
      return builder;
    };
    return client;
  };
})();
