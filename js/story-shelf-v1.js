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
  const TIKTOK_ICON = '<svg class="shelf-hero-play-icon" viewBox="0 0 448 512" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M448,209.91a210.06,210.06,0,0,1-122.77-39.25V349.38A162.55,162.55,0,1,1,185,188.31V278.2a74.62,74.62,0,1,0,52.23,71.18V0h88.91a121.43,121.43,0,0,0,1.86,22.17h0A122.18,122.18,0,0,0,381,102.39a121.43,121.43,0,0,0,67,20.14Z"/></svg>';

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
        ${item.post ? `<button type="button" class="shelf-hero-play" data-shelf-hero-play data-post="${esc(item.post)}" data-title="${esc(item.title)}" aria-label="Xem video ${esc(item.title)} ngay tại đây">${TIKTOK_ICON} Xem video</button>` : ""}
        <a class="shelf-hero-cta" href="${esc(item.readHref)}">Đọc truyện ›</a>
      </div>
    </div>`;
  }

  function playOnCard(card, item) {
    if (!item.post) return;
    const face = card.querySelector(".shelf-card-face");
    if (!face) return;
    face.classList.add("is-playing");
    face.innerHTML = `<span class="shelf-card-close" role="button" tabindex="-1" aria-label="Đóng video"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" d="M5 5l14 14M19 5L5 19"/></svg></span>
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
  const IDLE_DRIFT_DEG_PER_FRAME = 0.32; // tốc độ tự trôi khi không chạm/không còn đà
  const FRONT_SCALE = 0.97; // thu nhỏ bìa ở giữa để không che tiêu đề/tên truyện quanh nó

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
    let isPlaying = false; // một bìa đang phát video TikTok tại chỗ
    let centering = false; // đang tự xoay bìa được chọn về giữa trước khi phát

    function anglePerItem() {
      return list.length ? 360 / list.length : 0;
    }

    let lastMeasuredWidth = 0;
    function measure() {
      const w = carousel.clientWidth || 320;
      const count = list.length || 1;
      const firstCard = ring.children[0];
      const cardW = (firstCard && firstCard.getBoundingClientRect().width) || Math.min(w * 0.58, 340);
      // Regular-polygon carousel formula: radius = (cardWidth/2) / tan(π/count)
      // is the distance at which adjacent card faces exactly touch edge to
      // edge without overlapping. Keep the ring close to that minimum (small
      // multiplier, tighter caps) so side covers stay near the centre one
      // instead of swinging out toward the screen edges. The outer cap here
      // (was a fixed 420) just needs to stay ahead of how big cardW itself
      // can now get (its own CSS ceiling is 340px, up from 240px) so a wide
      // landscape/tablet/desktop screen isn't clipped back down to the old
      // mobile-sized ring.
      const r = count <= 2 ? cardW * 0.68 : ((cardW / 2) / Math.tan(Math.PI / count)) * 1.12;
      radius = Math.round(Math.max(cardW * 0.62, Math.min(r, w * 0.72, 700)));
      lastMeasuredWidth = w;
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
        // (% 360) alone can return a negative result here (JS % keeps the
        // dividend's sign, unlike true modulo) whenever `rotation` has
        // drifted deep negative from a hard reverse drag — the extra
        // "+ 360) % 360" always folds that back into [0, 360), or every
        // card behind the negative wrap point gets a bogus, too-large `rel`
        // below and fades to near-invisible even though it's still
        // squarely on screen.
        const raw = ((i * step + rotation) % 360 + 360) % 360;
        const rel = Math.abs(raw > 180 ? 360 - raw : raw);
        const opacity = Math.max(0.04, 1 - Math.pow(rel / 140, 1.8));
        // FRONT_SCALE keeps the centred cover a bit smaller than its full
        // CSS box so it never crowds the heading above/hero panel below.
        const scale = Math.max(0.5, 1 - rel / 130) * FRONT_SCALE;
        card.style.transform = `rotateY(${i * step}deg) translateZ(${radius}px) scale(${scale.toFixed(3)})`;
        card.style.opacity = opacity.toFixed(3);
        card.style.zIndex = String(Math.round(1000 - rel));
        card.style.pointerEvents = rel > 100 ? "none" : "";
        card.classList.toggle("is-front", rel < step / 2 + 0.01);
        if (rel < bestDelta) { bestDelta = rel; bestIndex = i; }
      });
      // Every card already pushes itself outward by `radius` via its own
      // translateZ — without recentring the ring by the same amount back
      // the other way, the whole circle sits shifted toward the viewer, so
      // the CSS `perspective` on `.shelf-carousel` blows up whichever card
      // is currently front-facing (translation composes with the ring's
      // own rotateY as a fixed offset, not a rotated one, so this constant
      // shift lands the front card back at z≈0 regardless of `rotation`).
      ring.style.transform = `translateZ(${-radius}px) rotateY(${rotation}deg)`;
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

    function startPlay(card, item) {
      playOnCard(card, item);
      isPlaying = true;
    }

    function stopPlay(card, item) {
      closeCardVideo(card, item);
      isPlaying = false;
    }

    // Đưa đúng bìa đang chọn về thẳng góc 0° (chính giữa, đối diện người xem)
    // rồi mới gắn iframe video vào — bấm "Xem video" trước đây phát ngay trên
    // bìa hiện tại dù nó có thể đang lệch vài độ (chưa kịp trôi hết về giữa),
    // nhìn xéo và mất thẩm mỹ. Khi lệch không đáng kể thì phát luôn, khỏi tốn
    // một khung hình animation vô ích.
    function centerFrontThenPlay(card, item) {
      const idx = Array.from(ring.children).indexOf(card);
      if (idx < 0) { startPlay(card, item); return; }
      const step = anglePerItem();
      let delta = (idx * step + rotation) % 360;
      if (delta > 180) delta -= 360;
      else if (delta <= -180) delta += 360;
      if (Math.abs(delta) < 0.5 || reduceMotion()) {
        rotation -= delta;
        paint();
        startPlay(card, item);
        return;
      }
      const startRotation = rotation;
      const targetRotation = rotation - delta;
      const startTime = performance.now();
      const DURATION = 260;
      centering = true;
      const step_ = () => {
        const t = Math.min(1, (performance.now() - startTime) / DURATION);
        const eased = 1 - Math.pow(1 - t, 3);
        rotation = startRotation + (targetRotation - startRotation) * eased;
        paint();
        if (t < 1) {
          requestAnimationFrame(step_);
        } else {
          centering = false;
          startPlay(card, item);
        }
      };
      requestAnimationFrame(step_);
    }

    // A single rAF loop drives everything the ring does on its own (never
    // while a finger/mouse is actively dragging it, since pointermove already
    // sets `rotation` directly then, or while the snap-to-centre tween above
    // owns `rotation` itself): first bleed off any swipe momentum, then once
    // that's spent, fall back to a slow ambient drift so the shelf still
    // feels alive when nobody is touching it. A card playing its video
    // freezes the ring completely (no momentum, no drift) — letting it keep
    // spinning a heavy TikTok iframe every frame is what caused the
    // lag/jank, on top of leaving the playing card visibly tilted instead of
    // squarely facing the viewer.
    function tick() {
      if (!dragging && !centering && !isPlaying) {
        if (Math.abs(momentum) > MOMENTUM_MIN_DEG) {
          rotation += momentum;
          momentum *= MOMENTUM_DECAY;
          paint();
        } else if (!reduceMotion()) {
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
      if (isPlaying || centering) return;
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
        stopPlay(card, dataFromCard(card));
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
    // always plays on whichever card is currently front-facing — snapped
    // squarely to centre first (see centerFrontThenPlay) rather than playing
    // wherever it happened to be mid-rotation.
    section.addEventListener("click", (e) => {
      const playBtn = e.target.closest("[data-shelf-hero-play]");
      if (!playBtn || isPlaying || centering) return;
      e.preventDefault();
      e.stopPropagation();
      const frontCard = ring.children[frontIndex] || ring.querySelector(".shelf-card.is-front");
      if (!frontCard) return;
      const item = dataFromCard(frontCard);
      if (!item.post) return;
      momentum = 0;
      dragging = false;
      centerFrontThenPlay(frontCard, item);
    });

    // Mobile browsers fire `resize` for things that aren't a real layout
    // change — the address bar hiding/showing as the page is touched or
    // scrolled being the main culprit. Recomputing the radius on every one
    // of those made the ring's spread suddenly collapse ("chụm lại gần")
    // right as someone touched it or right after the page finished loading.
    // Debounce, skip while a drag is in progress, and ignore width deltas
    // too small to be an actual resize so the ring only re-measures for a
    // real change in available space.
    let resizeSettle = 0;
    function remeasureIfChanged() {
      if (dragging) return;
      const w = carousel.clientWidth || 320;
      if (Math.abs(w - lastMeasuredWidth) < 8) return;
      measure();
      paint();
    }
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeSettle);
      resizeSettle = window.setTimeout(remeasureIfChanged, 150);
    }, { passive: true });
    // A real device rotation still needs to re-measure — the guard above
    // only skips address-bar-style false positives — but iOS/Android can
    // report a stale, too-small card width for a beat while the browser
    // chrome finishes animating right after `orientationchange`. Measuring
    // on that transient width is exactly what bakes a too-small radius into
    // the ring, which reads as covers suddenly overlapping post-rotation.
    // Re-measure once after the rotation itself typically settles, then
    // again once the viewport has fully finished (bypassing the width-delta
    // gate on this second pass so it always corrects a bad first read).
    window.addEventListener("orientationchange", () => {
      window.clearTimeout(resizeSettle);
      resizeSettle = window.setTimeout(remeasureIfChanged, 350);
      window.setTimeout(() => { if (!dragging) { measure(); paint(); } }, 700);
    }, { passive: true });
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
