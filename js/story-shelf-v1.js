// KỆ TRUYỆN (Trạm Preview): vòng bìa 3D xoay theo hành động CUỘN TRANG,
// giống hệt cơ chế demo vicambachgiai4-gallery-demo — cuộn xuống/lên thì
// vòng xoay theo, ngừng cuộn thì tự trôi rất chậm liên tục. Không còn nút
// mũi tên, không kéo tay, không tự nhảy theo hẹn giờ. Mỗi bìa vẫn là <a>
// dẫn tới trang truyện; panel thông tin bên dưới mang nút "Đọc truyện" /
// "Xem video" (phát tại chỗ trên bìa đang ở giữa, không điều hướng).
(function () {
  const esc = (value) => {
    const node = document.createElement("span");
    node.textContent = String(value == null ? "" : value);
    return node.innerHTML;
  };
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function dataFromCard(card) {
    return {
      slug: card.dataset.slug || "",
      title: card.dataset.title || "",
      author: card.dataset.author || "",
      cover: card.dataset.cover || "",
      status: card.dataset.status || "",
      genre: card.dataset.genre || "",
      post: card.dataset.post || "",
      teaser: card.dataset.teaser || "",
      readHref: card.dataset.readHref || "",
    };
  }

  // Covers are bare (no on-cover play icon) — the video trigger lives in the
  // info panel below instead.
  function faceInnerHTML(item) {
    return item.cover ? `<img src="${esc(item.cover)}" alt="Bìa ${esc(item.title)}" loading="lazy">` : `<b aria-hidden="true">V</b>`;
  }

  function cardFaceHTML(item) {
    return `<span class="shelf-card-face">${faceInnerHTML(item)}</span>`;
  }

  function cardAttrs(item) {
    return `data-slug="${esc(item.slug)}" data-title="${esc(item.title)}" data-author="${esc(item.author)}" data-cover="${esc(item.cover)}" data-status="${esc(item.status)}" data-genre="${esc(item.genre)}" data-post="${esc(item.post)}" data-teaser="${esc(item.teaser)}" data-read-href="${esc(item.readHref)}"`;
  }

  function cardHTML(item) {
    return `<a class="shelf-card" data-shelf-card href="#/truyen/${esc(item.slug)}" ${cardAttrs(item)} aria-label="Mở truyện ${esc(item.title)}">${cardFaceHTML(item)}</a>`;
  }

  const TEASER_LEN = 130;
  function teaserHTML(item) {
    const full = item.teaser || "Một câu chuyện mới đang được chuẩn bị tại ViCamBachGiai.";
    const truncated = full.length > TEASER_LEN;
    const shown = truncated ? full.slice(0, TEASER_LEN).trim() : full;
    return `${esc(shown)}${truncated ? `… <a class="shelf-hero-more" href="${esc(item.readHref)}">Xem tiếp</a>` : ""}`;
  }

  function heroHTML(item) {
    if (!item) return "";
    return `<div class="shelf-hero" data-shelf-hero>
      <h3>${esc(item.title)}</h3>
      <p class="shelf-hero-author">${esc(item.author || "Chưa cập nhật tác giả")}</p>
      <div class="shelf-hero-pills"><span>${esc(item.status)}</span>${item.genre ? `<span>${esc(item.genre)}</span>` : ""}</div>
      <p class="shelf-hero-teaser">${teaserHTML(item)}</p>
      <div class="shelf-hero-actions">
        ${item.post ? `<button type="button" class="shelf-hero-play" data-shelf-hero-play data-post="${esc(item.post)}" data-title="${esc(item.title)}" aria-label="Xem video ${esc(item.title)} ngay tại đây">▶ Xem video</button>` : ""}
        <a class="shelf-hero-cta" href="${esc(item.readHref)}">Đọc truyện ›</a>
      </div>
    </div>`;
  }

  function playOnCard(card, item) {
    if (!item.post) return;
    const face = card.querySelector(".shelf-card-face");
    if (!face) return;
    face.classList.add("is-playing");
    face.innerHTML = `<span class="shelf-card-close" role="button" tabindex="-1" aria-label="Đóng video">×</span>
      <div class="shelf-card-video">
        <iframe title="Teaser TikTok ${esc(item.title)}" src="https://www.tiktok.com/player/v1/${item.post}?autoplay=1&muted=0&loop=0&controls=1&progress_bar=1&play_button=1&volume_control=1&fullscreen_button=1&description=0&music_info=0&rel=0&native_context_menu=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
      </div>`;
  }

  function closeCardVideo(card, item) {
    const face = card.querySelector(".shelf-card-face");
    if (!face) return;
    face.classList.remove("is-playing");
    face.innerHTML = faceInnerHTML(item);
  }

  // Idle auto-drift speed — deliberately very slow (matches the reference
  // demo's 0.02deg/frame ≈ one full revolution every few minutes at 60fps):
  // it's just an ambient "still alive" cue, not the primary interaction.
  // Scrolling the page is what actually drives the ring around.
  const IDLE_DRIFT_DEG_PER_FRAME = 0.02;
  const SCROLL_IDLE_MS = 150;

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

    const carousel = section.querySelector("[data-shelf-carousel]");
    const ring = section.querySelector("[data-shelf-ring]");
    if (!carousel || !ring) return;

    const tabKey = carousel.dataset.activeTab || Object.keys(payload)[0] || "preview";
    const list = payload[tabKey] || [];
    let rotation = 0;
    let frontIndex = -1;
    let radius = 260;
    let isScrolling = false;
    let scrollIdleTimer = 0;
    let idleRaf = 0;

    function anglePerItem() {
      return list.length ? 360 / list.length : 0;
    }

    function measure() {
      const w = carousel.clientWidth || 320;
      const count = list.length || 1;
      const firstCard = ring.children[0];
      const cardW = (firstCard && firstCard.getBoundingClientRect().width) || Math.min(w * 0.58, 240);
      // Regular-polygon carousel formula: radius = (cardWidth/2) / tan(π/count)
      // is the distance at which adjacent card faces exactly touch edge to
      // edge without overlapping. The extra multiplier (and generous caps
      // below) push the ring well past that minimum on purpose — a big ring
      // whose side cards bleed toward/off the screen edges reads as a large,
      // sweeping carousel instead of a tight cluster of covers.
      const r = count <= 2 ? cardW * 0.8 : ((cardW / 2) / Math.tan(Math.PI / count)) * 1.42;
      radius = Math.round(Math.max(cardW * 0.75, Math.min(r, w * 1.0, 560)));
      carousel.style.setProperty("--shelf-radius", radius + "px");
    }

    // Opacity eases off gradually near the front (so a card reads clearly
    // well before it reaches dead centre), then drops away hard past a
    // moderate angle so a far/opposite card never bleeds through the one
    // that's supposed to be sharp and alone in the centre. Scale shrinks
    // noticeably the further a card turns away, for a near/far sense of
    // depth. Both derive from the same `rotation` used for the ring's own
    // transform every frame, so they can never fall out of sync.
    function paint() {
      const cards = Array.from(ring.children);
      const step = anglePerItem();
      let bestIndex = 0;
      let bestDelta = Infinity;
      cards.forEach((card, i) => {
        const raw = (i * step + rotation) % 360;
        const rel = Math.abs(raw > 180 ? 360 - raw : raw);
        const opacity = Math.max(0.04, 1 - Math.pow(rel / 140, 1.8));
        const scale = Math.max(0.5, 1 - rel / 130);
        card.style.transform = `rotateY(${i * step}deg) translateZ(${radius}px) scale(${scale.toFixed(3)})`;
        card.style.opacity = opacity.toFixed(3);
        card.style.zIndex = String(Math.round(1000 - rel));
        card.style.pointerEvents = rel > 100 ? "none" : "";
        card.classList.toggle("is-front", rel < step / 2 + 0.01);
        if (rel < bestDelta) { bestDelta = rel; bestIndex = i; }
      });
      ring.style.transform = `rotateY(${rotation}deg)`;
      if (bestIndex !== frontIndex || !cards[frontIndex]) {
        frontIndex = bestIndex;
        onFrontChange(cards[frontIndex]);
      }
    }

    function onFrontChange(card) {
      const cards = Array.from(ring.children);
      cards.forEach((c) => {
        c.setAttribute("aria-current", c === card ? "true" : "false");
        c.tabIndex = c === card ? 0 : -1;
      });
      if (!card) return;
      const hero = section.querySelector("[data-shelf-hero]");
      if (hero) hero.outerHTML = heroHTML(dataFromCard(card));
    }

    // The ring's rotation is a direct function of how far down the page has
    // been scrolled — exactly the reference demo's mechanism: rotation =
    // (scrollY / maxScrollY) * 360deg. Scrolling the page down turns the
    // ring one way, scrolling up turns it back.
    function scrollRotationDeg() {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
      return progress * 360;
    }

    function onScroll() {
      isScrolling = true;
      window.clearTimeout(scrollIdleTimer);
      rotation = scrollRotationDeg();
      paint();
      scrollIdleTimer = window.setTimeout(() => { isScrolling = false; }, SCROLL_IDLE_MS);
    }

    // While not actively scrolling (and nothing else needs stillness — an
    // open video, or the visitor's own reduced-motion preference), drift on
    // its own very slowly so the shelf still feels alive between scrolls.
    function idleDrift() {
      if (!isScrolling && !reduceMotion() && !ring.querySelector(".shelf-card-face.is-playing")) {
        rotation += IDLE_DRIFT_DEG_PER_FRAME;
        paint();
      }
      idleRaf = requestAnimationFrame(idleDrift);
    }

    function buildRing() {
      ring.innerHTML = list.map((item) => cardHTML(item)).join("");
      frontIndex = -1;
      measure();
      rotation = scrollRotationDeg();
      paint();
    }

    // iOS Safari ignores the page's user-scalable=no and, in practice, does
    // not reliably honor touch-action for the pinch gesture either — the
    // only thing that actually stops it here is preventDefault() on the
    // multi-touch move/gesture events themselves. Single-finger scrolling
    // (which is what now drives the ring) is untouched by this.
    carousel.addEventListener("touchmove", (e) => {
      if (e.touches && e.touches.length > 1) e.preventDefault();
    }, { passive: false });
    carousel.addEventListener("gesturestart", (e) => e.preventDefault());
    carousel.addEventListener("gesturechange", (e) => e.preventDefault());

    // A cover on the Trạm Preview tab never navigates on its own — reading
    // or watching the teaser both go through the explicit buttons in the
    // info panel instead, so a stray tap while scrolling can't yank the
    // visitor off the homepage. The site's global router is a document-level
    // click listener that reads any `a[href="#/..."]` click and navigates —
    // it never checks `defaultPrevented`, so `preventDefault()` alone does
    // NOT stop it; `stopPropagation()` is the only thing that keeps this
    // click from ever reaching that listener.
    ring.addEventListener("click", (e) => {
      const card = e.target.closest("[data-shelf-card]");
      if (!card) return;
      const closeIcon = e.target.closest(".shelf-card-close");
      if (closeIcon) {
        e.preventDefault();
        e.stopPropagation();
        closeCardVideo(card, dataFromCard(card));
        return;
      }
      const face = card.querySelector(".shelf-card-face");
      if (face && face.classList.contains("is-playing")) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (tabKey === "preview") {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    // The "Xem video" button lives in the info panel (not on the cover), and
    // always plays on whichever card is currently front-facing.
    section.addEventListener("click", (e) => {
      const playBtn = e.target.closest("[data-shelf-hero-play]");
      if (!playBtn) return;
      e.preventDefault();
      e.stopPropagation();
      const frontCard = ring.querySelector(".shelf-card.is-front");
      if (frontCard) playOnCard(frontCard, dataFromCard(frontCard));
    });

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", () => { measure(); paint(); }, { passive: true });
    idleRaf = requestAnimationFrame(idleDrift);

    buildRing();
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
