// KỆ TRUYỆN: a flip-card slideshow merging Trạm Preview + the 3 status
// rails into one homepage area. Only ever ONE cover is on screen — it flips
// (like a physical card turning over) to the next one on a timer, with no
// swipe/tap browsing control at all. This replaced an earlier 3D rotating
// ring design that kept several covers visible/overlapping at once no
// matter how the fade-out curve was tuned; a flip card is structurally
// immune to that since there are only ever two faces, front and back, and
// only the front-facing one is ever visible or interactive.
(function () {
  const esc = (value) => {
    const node = document.createElement("span");
    node.textContent = String(value == null ? "" : value);
    return node.innerHTML;
  };
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ADVANCE_MS = 4200;
  const FLIP_MS = 620;

  function faceInnerHTML(item, tabKey) {
    const isPreview = tabKey === "preview";
    return `${item.cover ? `<img src="${esc(item.cover)}" alt="Bìa ${esc(item.title)}" loading="lazy">` : `<b aria-hidden="true">V</b>`}
      ${isPreview && item.post ? `<span class="shelf-card-play" role="button" tabindex="-1" aria-label="Phát teaser ${esc(item.title)} ngay tại đây">▶</span>` : ""}`;
  }

  function heroHTML(item, tabKey) {
    if (!item) return "";
    const isPreview = tabKey === "preview";
    return `<div class="shelf-hero" data-shelf-hero>
      <span class="shelf-hero-now">${isPreview ? (item.post ? "Sẵn sàng phát — bấm ▶ trên bìa" : "Teaser đang chuẩn bị") : esc(item.status)}</span>
      <h3>${esc(item.title)}</h3>
      <p class="shelf-hero-author">${esc(item.author || "Chưa cập nhật tác giả")}</p>
      ${isPreview
        ? `<div class="shelf-hero-pills"><span>${esc(item.status)}</span>${item.genre ? `<span>${esc(item.genre)}</span>` : ""}</div>
           <p class="shelf-hero-teaser">${esc(item.teaser || "Một câu chuyện mới đang được chuẩn bị tại ViCamBachGiai.")}</p>`
        : `<a class="shelf-hero-cta" href="#/truyen/${esc(item.slug)}">Xem chi tiết ›</a>`}
    </div>`;
  }

  function initShelf(section) {
    if (!section || section.dataset.shelfBound === "true") return;
    section.dataset.shelfBound = "true";

    let payload = {};
    try {
      const script = section.querySelector("[data-shelf-payload]");
      payload = script ? JSON.parse(script.textContent || "{}") : {};
    } catch (_) {
      payload = {};
    }

    const stage = section.querySelector("[data-shelf-carousel]");
    const inner = section.querySelector("[data-shelf-ring]");
    if (!stage || !inner) return;

    let tabKey = stage.dataset.activeTab || Object.keys(payload)[0] || "preview";
    let list = payload[tabKey] || [];
    let index = 0;
    let flipCount = 0;
    let visibleFace = 0; // which of faces[0]/[1] currently points at the viewer
    let timer = 0;
    let playing = false;

    function faceItemData(face) {
      return {
        slug: face.dataset.slug || "",
        title: face.dataset.title || "",
        author: face.dataset.author || "",
        cover: face.dataset.cover || "",
        status: face.dataset.status || "",
        genre: face.dataset.genre || "",
        post: face.dataset.post || "",
        teaser: face.dataset.teaser || "",
      };
    }

    function setFaceContent(face, item) {
      const isPreview = tabKey === "preview";
      face.dataset.slug = item.slug;
      face.dataset.title = item.title;
      face.dataset.author = item.author || "";
      face.dataset.cover = item.cover || "";
      face.dataset.status = item.status || "";
      face.dataset.genre = item.genre || "";
      face.dataset.post = item.post || "";
      face.dataset.teaser = item.teaser || "";
      if (!isPreview) face.setAttribute("href", "#/truyen/" + item.slug);
      face.setAttribute("aria-label", isPreview ? "Chọn truyện " + item.title : "Mở truyện " + item.title);
      const inner2 = face.querySelector(".shelf-card-face");
      if (inner2) inner2.innerHTML = faceInnerHTML(item, tabKey);
    }

    function setFaceInteractive(face, on) {
      face.setAttribute("aria-hidden", on ? "false" : "true");
      face.tabIndex = on ? 0 : -1;
      face.style.pointerEvents = on ? "" : "none";
    }

    function faces() {
      return Array.from(inner.querySelectorAll("[data-shelf-face]"));
    }

    function refreshHero(item) {
      const hero = section.querySelector("[data-shelf-hero]");
      if (hero) hero.outerHTML = heroHTML(item, tabKey);
    }

    function goTo(nextIndex, animate) {
      if (!list.length) return;
      index = ((nextIndex % list.length) + list.length) % list.length;
      const item = list[index];
      const all = faces();
      const nextVisible = all[1 - visibleFace];
      const nextHidden = all[visibleFace];
      if (!nextVisible || !nextHidden) return;
      setFaceContent(nextVisible, item);
      if (animate && !reduceMotion()) {
        inner.classList.add("is-flipping");
        window.setTimeout(() => inner.classList.remove("is-flipping"), FLIP_MS);
      }
      flipCount += 1;
      inner.style.transform = `rotateY(${flipCount * 180}deg)`;
      visibleFace = 1 - visibleFace;
      setFaceInteractive(nextVisible, true);
      setFaceInteractive(nextHidden, false);
      refreshHero(item);
    }

    function buildFaces() {
      const tag = tabKey === "preview" ? "button" : "a";
      const typeAttr = tabKey === "preview" ? ' type="button"' : "";
      inner.innerHTML = `
        <${tag} class="shelf-card-face-wrap" data-shelf-face${typeAttr} aria-hidden="false"><span class="shelf-card-face"></span></${tag}>
        <${tag} class="shelf-card-face-wrap shelf-card-face-back" data-shelf-face${typeAttr} aria-hidden="true" style="pointer-events:none"><span class="shelf-card-face"></span></${tag}>`;
      flipCount = 0;
      visibleFace = 0;
      inner.style.transform = "rotateY(0deg)";
      index = -1;
      const leadIdx = tabKey === "preview" ? Math.max(0, list.findIndex((it) => it.post)) : 0;
      goTo(leadIdx, false);
    }

    function scheduleNext() {
      window.clearTimeout(timer);
      if (reduceMotion() || playing || !list.length || list.length < 2) return;
      timer = window.setTimeout(() => {
        goTo(index + 1, true);
        scheduleNext();
      }, ADVANCE_MS);
    }

    function switchTab(nextKey) {
      if (nextKey === tabKey || !payload[nextKey]) return;
      tabKey = nextKey;
      list = payload[tabKey] || [];
      stage.dataset.activeTab = tabKey;
      playing = false;
      section.querySelectorAll("[data-shelf-tab]").forEach((btn) => {
        const active = btn.dataset.shelfTab === tabKey;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-selected", active ? "true" : "false");
      });
      buildFaces();
      scheduleNext();
    }

    section.querySelectorAll("[data-shelf-tab]").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.shelfTab));
    });

    function playOnFace(face, item) {
      if (!item.post) return;
      playing = true;
      window.clearTimeout(timer);
      const inner2 = face.querySelector(".shelf-card-face");
      inner2.classList.add("is-playing");
      inner2.innerHTML = `<span class="shelf-card-close" role="button" tabindex="-1" aria-label="Đóng video">×</span>
        <div class="shelf-card-video">
          <iframe title="Teaser TikTok ${esc(item.title)}" src="https://www.tiktok.com/player/v1/${item.post}?autoplay=1&muted=0&loop=0&controls=1&progress_bar=1&play_button=1&volume_control=1&fullscreen_button=1&description=0&music_info=0&rel=0&native_context_menu=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
        </div>`;
    }

    function closeFaceVideo(face, item) {
      playing = false;
      const inner2 = face.querySelector(".shelf-card-face");
      inner2.classList.remove("is-playing");
      inner2.innerHTML = faceInnerHTML(item, tabKey);
      scheduleNext();
    }

    inner.addEventListener("click", (e) => {
      const face = e.target.closest("[data-shelf-face]");
      if (!face || face.getAttribute("aria-hidden") === "true") return;
      const closeIcon = e.target.closest(".shelf-card-close");
      if (closeIcon) {
        e.preventDefault();
        closeFaceVideo(face, faceItemData(face));
        return;
      }
      const playIcon = e.target.closest(".shelf-card-play");
      if (playIcon && tabKey === "preview") {
        e.preventDefault();
        playOnFace(face, faceItemData(face));
        return;
      }
      if (tabKey === "preview") e.preventDefault();
    });

    buildFaces();
    scheduleNext();
  }

  function bindAll(root) {
    (root || document).querySelectorAll?.("[data-shelf]").forEach(initShelf);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => bindAll(document), { once: true });
  } else {
    bindAll(document);
  }
  new MutationObserver((mutations) => {
    if (mutations.some((item) => item.addedNodes.length)) bindAll(document);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
