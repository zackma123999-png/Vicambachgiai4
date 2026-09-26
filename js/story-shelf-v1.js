// KỆ TRUYỆN (Trạm Preview): vòng bìa 3D xoay bằng cách VUỐT NGANG bằng tay
// (hoặc kéo chuột) — quét ngón tay qua trái/phải thì bìa trượt theo ngay,
// thả tay ra thì trượt tiếp theo đà rồi chậm dần, xoay vòng liên tục không
// giới hạn điểm đầu/cuối. Khi không ai chạm vào thì tự trôi chậm để vẫn
// cảm giác "sống". Mỗi bìa vẫn là <a> dẫn tới trang truyện; panel thông
// tin bên dưới mang nút "Đọc truyện" / "Xem video" (phát tại chỗ trên bìa
// đang ở giữa, không điều hướng).
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

  // Tuning for the swipe/momentum feel:
  const DRAG_TO_DEG = 0.5; // độ xoay trên mỗi px vuốt ngang
  const MOMENTUM_DECAY = 0.94; // mỗi khung hình giữ lại 94% vận tốc còn lại
  const MOMENTUM_MIN_DEG = 0.02; // dưới ngưỡng này coi như hết đà, nhường cho tự trôi
  const MOMENTUM_MAX_DEG = 6; // trần vận tốc mỗi khung hình, tránh trượt ảo quá nhanh
  const IDLE_DRIFT_DEG_PER_FRAME = 0.04; // tốc độ tự trôi khi không chạm/không còn đà

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
    let dragging = false;
    let dragStartX = 0;
    let dragStartRot = 0;
    let dragMoved = 0;
    let lastMoveX = 0;
    let lastMoveTime = 0;
    let momentum = 0; // độ/khung hình, áp dụng sau khi thả tay
    let dragWatchdog = 0;

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

    function buildRing() {
      ring.innerHTML = list.map((item) => cardHTML(item)).join("");
      frontIndex = -1;
      measure();
      paint();
    }

    // A single rAF loop drives everything the ring does on its own (never
    // while a finger/mouse is actively dragging it, since pointermove already
    // sets `rotation` directly then): first bleed off any swipe momentum,
    // then once that's spent, fall back to a slow ambient drift so the shelf
    // still feels alive when nobody is touching it. Playing a video, or the
    // visitor's own reduced-motion preference, pauses only the ambient
    // drift — never the momentum from their own swipe, since that's a direct
    // response to something they just did, not automatic motion.
    function tick() {
      if (!dragging) {
        if (Math.abs(momentum) > MOMENTUM_MIN_DEG) {
          rotation += momentum;
          momentum *= MOMENTUM_DECAY;
          paint();
        } else if (!reduceMotion() && !ring.querySelector(".shelf-card-face.is-playing")) {
          rotation += IDLE_DRIFT_DEG_PER_FRAME;
          paint();
        }
      }
      requestAnimationFrame(tick);
    }

    // iOS Safari ignores the page's user-scalable=no and, in practice, does
    // not reliably honor touch-action for the pinch gesture either — the
    // only thing that actually stops it here is preventDefault() on the
    // multi-touch move/gesture events themselves.
    carousel.addEventListener("touchmove", (e) => {
      if (e.touches && e.touches.length > 1) e.preventDefault();
    }, { passive: false });
    carousel.addEventListener("gesturestart", (e) => e.preventDefault());
    carousel.addEventListener("gesturechange", (e) => e.preventDefault());

    // pointermove/up listen on window rather than the carousel, and we never
    // call setPointerCapture: capturing the pointer on the carousel also
    // silently retargets the FOLLOWING click event's e.target to the
    // carousel itself (a real browser quirk) — so a tap on something inside
    // the ring (the video close button, a card) would never resolve to the
    // actual element that was tapped. Tracking via window avoids that trap
    // while still following the drag past the carousel's own edges.
    //
    // A device that starts a touch/pointer sequence but never delivers a
    // matching pointerup/pointercancel (a system gesture stealing it
    // mid-way, a dropped event on a flaky mobile browser) would otherwise
    // leave `dragging` stuck true forever, silently freezing the ring. This
    // watchdog is a hard ceiling: if no real pointerup shows up within 5s,
    // force the drag state closed so the ring can never wedge on it.
    carousel.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      dragging = true;
      momentum = 0;
      dragMoved = 0;
      dragStartX = e.clientX;
      dragStartRot = rotation;
      lastMoveX = e.clientX;
      lastMoveTime = performance.now();
      window.clearTimeout(dragWatchdog);
      dragWatchdog = window.setTimeout(() => { dragging = false; }, 5000);
    });
    window.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const now = performance.now();
      const dx = e.clientX - dragStartX;
      dragMoved = Math.max(dragMoved, Math.abs(dx));
      rotation = dragStartRot + dx * DRAG_TO_DEG;
      // Vận tốc tức thời trong khoảng di chuyển gần nhất — dùng để tính đà
      // trượt tiếp khi thả tay, mượt hơn nhiều so với chỉ nhìn tổng quãng
      // đường kéo từ lúc bắt đầu. dt được chặn dưới một sàn nhỏ: một số
      // thiết bị cảm ứng tần số cao (hoặc trình duyệt gộp sự kiện) có thể
      // bắn 2 pointermove cách nhau gần như 0ms, khiến phép chia ở đây vọt
      // lên giá trị ảo rất lớn nếu không chặn.
      const dt = Math.max(now - lastMoveTime, 8);
      momentum = Math.max(-MOMENTUM_MAX_DEG, Math.min(MOMENTUM_MAX_DEG,
        ((e.clientX - lastMoveX) * DRAG_TO_DEG / dt) * 16.6667));
      lastMoveX = e.clientX;
      lastMoveTime = now;
      paint();
    });
    function endDrag() {
      if (!dragging) return;
      window.clearTimeout(dragWatchdog);
      dragging = false;
      if (dragMoved > 6) {
        section.dataset.shelfJustDragged = "true";
        window.setTimeout(() => { delete section.dataset.shelfJustDragged; }, 0);
      } else {
        momentum = 0;
      }
    }
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);

    // A real drag must never fire the link/button underneath it. A cover on
    // the Trạm Preview tab also never navigates on its own even without a
    // drag — reading or watching the teaser both go through the explicit
    // buttons in the info panel instead. The site's global router is a
    // document-level click listener that reads any `a[href="#/..."]` click
    // and navigates — it never checks `defaultPrevented`, so
    // `preventDefault()` alone does NOT stop it; `stopPropagation()` is the
    // only thing that keeps a click from ever reaching that listener.
    ring.addEventListener("click", (e) => {
      if (section.dataset.shelfJustDragged === "true") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
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

    window.addEventListener("resize", () => { measure(); paint(); }, { passive: true });
    requestAnimationFrame(tick);

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
