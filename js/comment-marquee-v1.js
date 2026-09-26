// Homepage-only strip: black cards, white text, comments from the last 7 days
// scrolling sideways non-stop. Reads straight from the shared VCBG data layer
// (window.VCBG), so it works as a bolt-on next to app.js without touching it.
// The app rewrites #app wholesale on every route change, so this watches for
// the homepage hero (#signalHero) to reappear and (re)inserts itself then.
(function () {
  var WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  var MAX_CARDS = 18;
  var MIN_CARDS = 3;
  var SPEED_PX_S = 46;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function relTime(ts) {
    var d = Date.now() - Number(ts || 0);
    if (d < 60000) return "vừa xong";
    if (d < 3600000) return Math.floor(d / 60000) + " phút trước";
    if (d < 86400000) return Math.floor(d / 3600000) + " giờ trước";
    return Math.floor(d / 86400000) + " ngày trước";
  }

  function avatarHTML(user) {
    var name = (user && (user.display_name || user.email)) || "Ẩn danh";
    var letter = esc(String(name).trim().slice(0, 1).toUpperCase() || "?");
    var src = user && user.avatar ? String(user.avatar) : "";
    if (src && /^(https?:|data:|covers\/|brand\/)/i.test(src)) {
      return '<img src="' + esc(src) + '" alt="">';
    }
    return letter;
  }

  function cardHTML(c) {
    var name = (c.user && (c.user.display_name || c.user.email)) || "Độc giả ẩn danh";
    var storyTitle = c.story ? c.story.title : "";
    var body = String(c.body || "").replace(/\s+/g, " ").trim();
    return (
      '<a class="cm-card" href="' + esc(c.href || "#/") + '">' +
        '<div class="cm-card-head">' +
          '<span class="cm-avatar">' + avatarHTML(c.user) + "</span>" +
          '<div class="cm-who">' +
            "<b>" + esc(name) + "</b>" +
            "<span>" + relTime(c.created_at) + (storyTitle ? " · " + esc(storyTitle) : "") + "</span>" +
          "</div>" +
        "</div>" +
        '<p class="cm-body">' + esc(body) + "</p>" +
      "</a>"
    );
  }

  function buildSection(comments) {
    var cardsHtml = comments.map(cardHTML).join("");
    var section = document.createElement("section");
    section.className = "cm-wrap";
    section.setAttribute("aria-label", "Bình luận trong tuần");
    section.innerHTML =
      '<div class="cm-head"><span class="cm-kicker"><i aria-hidden="true"></i>Bình luận trong tuần</span></div>' +
      '<div class="cm-marquee">' +
        '<div class="cm-track" id="cmTrack">' +
          '<div class="cm-group">' + cardsHtml + "</div>" +
          '<div class="cm-group" data-cm-clone="true" aria-hidden="true">' + cardsHtml + "</div>" +
        "</div>" +
      "</div>";
    return section;
  }

  function bind() {
    var hero = document.querySelector("#signalHero");
    if (!hero || document.querySelector(".cm-wrap")) return;
    if (!window.VCBG || typeof window.VCBG.communityFeed !== "function") return;

    var feed;
    try {
      feed = window.VCBG.communityFeed({ sort: "latest" });
    } catch (e) {
      return;
    }
    var comments = (feed || [])
      .filter(function (c) { return Date.now() - Number(c.created_at || 0) < WEEK_MS; })
      .slice(0, MAX_CARDS);
    if (comments.length < MIN_CARDS) return;

    var section = buildSection(comments);
    hero.insertAdjacentElement("afterend", section);

    var track = section.querySelector("#cmTrack");
    var group = section.querySelector(".cm-group");
    var width = group ? group.getBoundingClientRect().width : 0;
    if (width > 0 && !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
      track.style.animationDuration = Math.max(12, width / SPEED_PX_S) + "s";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { bind(); }, { once: true });
  } else {
    bind();
  }

  new MutationObserver(function (mutations) {
    if (mutations.some(function (m) { return m.addedNodes.length; })) bind();
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
