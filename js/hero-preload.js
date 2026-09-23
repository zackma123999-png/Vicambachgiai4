/* Preload the exact five covers visible in the initial fan before app render. */
(function () {
  try {
    var stories = Array.isArray(window.VCBG_HERO_SNAPSHOT) ? window.VCBG_HERO_SNAPSHOT.slice() : [];
    if (!stories.length) {
      var raw = localStorage.getItem("vicambachgiai.hero.v1") || localStorage.getItem("vicambachgiai.catalog.v1");
      if (raw) {
        var snap = JSON.parse(raw);
        stories = (snap && snap.stories) || [];
      }
    }
    if (!stories.length) return;

    var featured = stories.filter(function (s) { return !!s.featured; });
    var ongoing = stories.filter(function (s) { return s.status === "ongoing"; });
    var pool = featured.concat(ongoing, stories);
    var unique = [];
    var seenIds = {};
    pool.forEach(function (s) {
      if (!s) return;
      var key = s.id || s.slug || s.cover || s.cover_url;
      if (!key || seenIds[key]) return;
      seenIds[key] = true;
      unique.push(s);
    });
    if (!unique.length) return;

    /* Initial fan shows index 0 in the center, 1/2 on the right and n-1/n-2 on the left. */
    var n = unique.length;
    var wanted = [0, 1, 2, n - 1, n - 2];
    var seenSrc = {};
    wanted.forEach(function (idx, order) {
      if (idx < 0 || idx >= n) return;
      var s = unique[idx] || {};
      var src = s.cover || s.cover_url || "";
      if (!src || seenSrc[src]) return;
      seenSrc[src] = true;

      var link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = src;
      link.setAttribute("fetchpriority", "high");
      document.head.appendChild(link);

      var img = new Image();
      img.fetchPriority = "high";
      img.decoding = "async";
      img.src = src;
    });
  } catch (_) {}
})();
