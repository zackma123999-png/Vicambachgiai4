// Homepage-only strip: black cards, white text, comments from the last 7 days
// scrolling sideways non-stop. Reads straight from the shared VCBG data layer
// (window.VCBG), so it works as a bolt-on next to app.js without touching it.
// The app rewrites #app wholesale on every route change, so this watches for
// the homepage hero (#signalHero) to reappear and (re)inserts itself then.
(function () {
  var WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  var MAX_CARDS = 18;
  var DISPLAY_MIN = 8;
  var SPEED_PX_S = 46;

  // Temporary, by request: pad out with placeholder comments whenever real
  // activity in the last 7 days falls short, so the strip isn't empty while
  // the site is still building up organic comments. Remove once real weekly
  // volume reliably clears DISPLAY_MIN on its own.
  var FALLBACK_POOL = [
    { name: "Minh Anh", body: "Đọc một mạch hết chương mới, cảm xúc dâng trào ghê!" },
    { name: "Thuỳ Trang", body: "Nữ chính xử lý tình huống này khéo quá, mê cách viết của tác giả." },
    { name: "Bảo Ngọc", body: "Chờ chương mới muốn xỉu, hy vọng cuối tuần có bản dịch mới." },
    { name: "Hải Yến", body: "Bìa truyện đẹp mà nội dung còn cuốn hơn, đọc không dứt ra được." },
    { name: "Lan Chi", body: "Đoạn cao trào chương này làm tim đập loạn nhịp thật sự." },
    { name: "Diệu Linh", body: "Giao diện web mới mượt ghê, đọc truyện đêm khuya sướng mắt hẳn." },
    { name: "Ngọc Hà", body: "Couple này ngọt xỉu, mong tác giả ra thêm chương vào cuối tuần." },
    { name: "Quỳnh Như", body: "Lâu lắm mới gặp truyện Bách Hợp hay vậy, cảm ơn team dịch nhiều." },
  ];

  function demoComments(count) {
    var stories = [];
    try { stories = (window.VCBG && window.VCBG.listStories && window.VCBG.listStories()) || []; } catch (e) {}
    return FALLBACK_POOL.slice(0, count).map(function (p, i) {
      var story = stories.length ? stories[i % stories.length] : null;
      return {
        user: { display_name: p.name, avatar: "" },
        body: p.body,
        created_at: Date.now() - (i + 1) * 3.1 * 3600 * 1000,
        story: story ? { title: story.title } : null,
        href: story ? "#/truyen/" + story.slug : "#/kham-pha",
      };
    });
  }

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
    // Send to "Nhật ký bình luận" (scrolled/highlighted to this exact
    // comment) instead of the story/chapter — that page is the actual
    // comment feed, so it's where a comment card's own click should land.
    var goto = "#/nhat-ky-binh-luan?highlight=" + encodeURIComponent(c.id);
    return (
      '<a class="cm-card" href="' + esc(goto) + '">' +
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

    var feed = [];
    if (window.VCBG && typeof window.VCBG.communityFeed === "function") {
      try { feed = window.VCBG.communityFeed({ sort: "latest" }) || []; } catch (e) { feed = []; }
    }
    var comments = (feed || [])
      .filter(function (c) { return Date.now() - Number(c.created_at || 0) < WEEK_MS; })
      .slice(0, MAX_CARDS);
    if (comments.length < DISPLAY_MIN) {
      comments = comments.concat(demoComments(DISPLAY_MIN - comments.length));
    }
    if (!comments.length) return;

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
