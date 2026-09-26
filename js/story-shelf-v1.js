// KỆ TRUYỆN: 3D rotating carousel merging Trạm Preview + the 3 status rails
// into one homepage area. Preview cards switch an inline hero + play the
// TikTok teaser (never navigate). Status-tab cards are real <a> links to the
// story page, exactly like the old rail()/storyCard() — dragging the shelf
// must never accidentally "click" one of those links.
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
    };
  }

  function faceInnerHTML(item, tabKey) {
    const isPreview = tabKey === "preview";
    return `${item.cover ? `<img src="${esc(item.cover)}" alt="Bìa ${esc(item.title)}" loading="lazy">` : `<b aria-hidden="true">V</b>`}
      ${isPreview && item.post ? `<span class="shelf-card-play" role="button" tabindex="-1" aria-label="Phát teaser ${esc(item.title)} ngay tại đây">▶</span>` : ""}`;
  }

  function cardFaceHTML(item, tabKey) {
    return `<span class="shelf-card-face">${faceInnerHTML(item, tabKey)}</span>`;
  }

  function cardAttrs(item) {
    return `data-slug="${esc(item.slug)}" data-title="${esc(item.title)}" data-author="${esc(item.author)}" data-cover="${esc(item.cover)}" data-status="${esc(item.status)}" data-genre="${esc(item.genre)}" data-post="${esc(item.post)}" data-teaser="${esc(item.teaser)}"`;
  }

  function cardHTML(item, tabKey) {
    return tabKey === "preview"
      ? `<button type="button" class="shelf-card" data-shelf-card ${cardAttrs(item)} aria-label="Chọn truyện ${esc(item.title)}">${cardFaceHTML(item, tabKey)}</button>`
      : `<a class="shelf-card" data-shelf-card href="#/truyen/${esc(item.slug)}" ${cardAttrs(item)} aria-label="Mở truyện ${esc(item.title)}">${cardFaceHTML(item, tabKey)}</a>`;
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

  function closeCardVideo(card, item, tabKey) {
    const face = card.querySelector(".shelf-card-face");
    if (!face) return;
    face.classList.remove("is-playing");
    face.innerHTML = faceInnerHTML(item, tabKey);
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

    const carousel = section.querySelector("[data-shelf-carousel]");
    const ring = section.querySelector("[data-shelf-ring]");
    if (!carousel || !ring) return;

    let tabKey = carousel.dataset.activeTab || Object.keys(payload)[0] || "preview";
    let list = payload[tabKey] || [];
    let rotation = 0;
    let frontIndex = -1;
    let dragging = false;
    let dragStartX = 0;
    let dragStartRot = 0;
    let dragMoved = 0;
    let dragStartTime = 0;
    let autoRaf = 0;
    let hoverPaused = false;
    let radius = 260;
    let rotAnimRaf = 0;
    let manualAnim = false;

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
      // edge without overlapping. A flat width-based guess (the old code)
      // ignores card size and item count entirely, so on narrow viewports
      // (small radius, but cards still near their max CSS width) neighbours
      // end up closer together than their own width and pile on top of
      // each other. 2 items sit at opposite sides of the ring regardless of
      // radius, so the formula (which blows up as count -> 2) doesn't apply.
      const r = count <= 2 ? cardW * 0.75 : ((cardW / 2) / Math.tan(Math.PI / count)) * 1.35;
      radius = Math.round(Math.max(cardW * 0.7, Math.min(r, w * 0.95, 520)));
      carousel.style.setProperty("--shelf-radius", radius + "px");
    }

    function layout() {
      paint();
    }

    // Opacity eases off gradually near the front (so a card reads clearly
    // well before it reaches dead centre, instead of only exactly in the
    // middle), then drops away hard for anything past a moderate angle. It
    // must not plateau at a visible floor all the way round: a card near
    // the far/opposite side sits at the same X/Y screen position as the
    // front card (only deeper in Z), so any lingering opacity there shows
    // as a translucent ghost bleeding through the card that's supposed to
    // be sharp and alone in the centre. Scale shrinks a little the further
    // a card turns away, for a sense of depth; both derive from the same
    // `rotation` used for the ring's own transform every frame, so they can
    // never fall out of sync mid-turn.
    function paint() {
      const cards = Array.from(ring.children);
      const step = anglePerItem();
      let bestIndex = 0;
      let bestDelta = Infinity;
      cards.forEach((card, i) => {
        const raw = (i * step + rotation) % 360;
        const rel = Math.abs(raw > 180 ? 360 - raw : raw);
        const opacity = Math.max(0.04, 1 - Math.pow(rel / 140, 1.8));
        const scale = Math.max(0.78, 1 - rel / 210);
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
      if (hero) hero.outerHTML = heroHTML(dataFromCard(card), tabKey);
    }

    // Rotation and each card's opacity/scale must update from the exact same
    // `rotation` value every single frame — driving the ring's turn via a CSS
    // transition while paint() (opacity/scale) jumps straight to the target
    // value makes cards flash to "front" brightness/size while still visually
    // off to the side mid-turn, which reads as sudden shrinking/overlap. So
    // the whole rotation is tweened here in JS, calling paint() each step.
    function cancelRotAnim() {
      if (rotAnimRaf) { cancelAnimationFrame(rotAnimRaf); rotAnimRaf = 0; }
      manualAnim = false;
    }

    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    function rotateTo(targetRotation, animate) {
      cancelRotAnim();
      if (animate && !reduceMotion()) {
        const from = rotation;
        const duration = 240;
        const start = performance.now();
        manualAnim = true;
        const tick = (now) => {
          const t = Math.min(1, (now - start) / duration);
          rotation = from + (targetRotation - from) * easeOutCubic(t);
          paint();
          if (t < 1) {
            rotAnimRaf = requestAnimationFrame(tick);
          } else {
            rotation = targetRotation;
            paint();
            cancelRotAnim();
          }
        };
        rotAnimRaf = requestAnimationFrame(tick);
      } else {
        rotation = targetRotation;
        paint();
      }
    }

    function stepBy(delta) {
      const step = anglePerItem();
      if (!step) return;
      const nearest = Math.round(rotation / step) * step;
      rotateTo(nearest - delta * step, true);
    }

    function selectIndex(index) {
      const step = anglePerItem();
      if (!step) return;
      rotateTo(-index * step, true);
    }

    function buildRing() {
      ring.innerHTML = list.map((item) => cardHTML(item, tabKey)).join("");
      rotation = 0;
      frontIndex = -1;
      const leadIdx = tabKey === "preview" ? Math.max(0, list.findIndex((it) => it.post)) : 0;
      measure();
      layout();
      if (leadIdx > 0) selectIndex(leadIdx);
    }

    function switchTab(nextKey) {
      if (nextKey === tabKey || !payload[nextKey]) return;
      tabKey = nextKey;
      list = payload[tabKey] || [];
      carousel.dataset.activeTab = tabKey;
      section.querySelectorAll("[data-shelf-tab]").forEach((btn) => {
        const active = btn.dataset.shelfTab === tabKey;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-selected", active ? "true" : "false");
      });
      buildRing();
    }

    section.querySelectorAll("[data-shelf-tab]").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.shelfTab));
    });

    const prevBtn = section.querySelector("[data-shelf-prev]");
    const nextBtn = section.querySelector("[data-shelf-next]");
    if (prevBtn) prevBtn.addEventListener("click", () => stepBy(-1));
    if (nextBtn) nextBtn.addEventListener("click", () => stepBy(1));

    // iOS Safari ignores the page's user-scalable=no and, in practice, does
    // not reliably honor touch-action: none for the pinch gesture either —
    // the only thing that actually stops it there is preventDefault() on the
    // multi-touch move/gesture events themselves.
    carousel.addEventListener("touchmove", (e) => {
      if (e.touches && e.touches.length > 1) e.preventDefault();
    }, { passive: false });
    carousel.addEventListener("gesturestart", (e) => e.preventDefault());
    carousel.addEventListener("gesturechange", (e) => e.preventDefault());

    carousel.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      cancelRotAnim();
      dragging = true;
      dragMoved = 0;
      dragStartX = e.clientX;
      dragStartRot = rotation;
      dragStartTime = Date.now();
      try { carousel.setPointerCapture(e.pointerId); } catch (_) {}
    });
    carousel.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - dragStartX;
      dragMoved = Math.max(dragMoved, Math.abs(dx));
      rotation = dragStartRot + dx * 0.35;
      paint();
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      try { carousel.releasePointerCapture(e.pointerId); } catch (_) {}
      const wasRealDrag = dragMoved > 6;
      if (wasRealDrag) {
        const step = anglePerItem();
        if (step) rotateTo(Math.round(rotation / step) * step, true);
        section.dataset.shelfJustDragged = "true";
        window.setTimeout(() => { delete section.dataset.shelfJustDragged; }, 0);
      }
    }
    carousel.addEventListener("pointerup", endDrag);
    carousel.addEventListener("pointercancel", endDrag);

    // A real drag must never fire the link/button underneath it.
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
        closeCardVideo(card, dataFromCard(card), tabKey);
        return;
      }
      const playIcon = e.target.closest(".shelf-card-play");
      if (playIcon && tabKey === "preview") {
        e.preventDefault();
        playOnCard(card, dataFromCard(card));
        return;
      }
      if (tabKey === "preview") {
        e.preventDefault();
        const cards = Array.from(ring.children);
        selectIndex(cards.indexOf(card));
      }
    }, true);

    carousel.addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      stepBy(e.key === "ArrowRight" ? 1 : -1);
    });

    carousel.addEventListener("pointerenter", () => { hoverPaused = true; });
    carousel.addEventListener("pointerleave", () => { hoverPaused = false; });

    // Auto-advance holds each card still and sharp, then makes one quick
    // snap to the next — it does NOT crawl continuously. A constant slow
    // rotation spends most of its time part-way between two cards, and with
    // few items (e.g. only 2 in Trạm Preview) that halfway point sits both
    // cards at the exact same, symmetric opacity: a lingering translucent
    // double-exposure. Snapping quickly (reusing the same eased rotateTo()
    // as the arrow buttons) means that ambiguous in-between state only ever
    // shows for one brief transition, not for seconds at a stretch.
    function scheduleAutoAdvance() {
      window.clearTimeout(autoRaf);
      if (reduceMotion()) return;
      autoRaf = window.setTimeout(() => {
        if (!dragging && !hoverPaused && !manualAnim && !ring.querySelector(".shelf-card-face.is-playing")) {
          stepBy(1);
        }
        scheduleAutoAdvance();
      }, 3200);
    }
    scheduleAutoAdvance();

    window.addEventListener("resize", () => { measure(); layout(); }, { passive: true });

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
