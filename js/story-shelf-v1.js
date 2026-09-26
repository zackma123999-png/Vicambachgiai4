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

  function cardFaceHTML(item, tabKey) {
    const isPreview = tabKey === "preview";
    return `<span class="shelf-card-face">
      ${item.cover ? `<img src="${esc(item.cover)}" alt="Bìa ${esc(item.title)}" loading="lazy">` : `<b aria-hidden="true">V</b>`}
      <span class="shelf-card-shade"></span>
      <span class="shelf-card-status">${esc(item.status)}</span>
      ${isPreview && item.post ? `<span class="shelf-card-play" aria-hidden="true">▶</span>` : ""}
      <span class="shelf-card-title">${esc(item.title)}</span>
    </span>`;
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
    if (tabKey === "preview") {
      return `<div class="shelf-hero" data-shelf-hero>
        <div class="shelf-hero-media">
          ${item.cover ? `<img class="shelf-hero-cover" src="${esc(item.cover)}" alt="Bìa ${esc(item.title)}">` : `<span class="shelf-hero-no-cover" aria-hidden="true">V</span>`}
          ${item.post
            ? `<button type="button" class="shelf-hero-play" data-shelf-play aria-label="Phát teaser ${esc(item.title)} ngay tại đây"><span aria-hidden="true">▶</span><small>Phát tại đây</small></button>`
            : `<span class="shelf-hero-pending"><i aria-hidden="true"></i>Teaser đang chuẩn bị</span>`}
        </div>
        <div class="shelf-hero-copy">
          <span class="shelf-hero-now"><i aria-hidden="true"></i>${item.post ? "Sẵn sàng phát" : "Đang chuẩn bị"}</span>
          <h3>${esc(item.title)}</h3>
          <p class="shelf-hero-author">${esc(item.author || "Chưa cập nhật tác giả")}</p>
          <div class="shelf-hero-pills"><span>${esc(item.status)}</span>${item.genre ? `<span>${esc(item.genre)}</span>` : ""}</div>
          <p class="shelf-hero-teaser">${esc(item.teaser || "Một câu chuyện mới đang được chuẩn bị tại ViCamBachGiai.")}</p>
        </div>
      </div>`;
    }
    return `<div class="shelf-hero shelf-hero-simple" data-shelf-hero>
      <div class="shelf-hero-copy">
        <span class="shelf-hero-now">${esc(item.status)}</span>
        <h3>${esc(item.title)}</h3>
        <p class="shelf-hero-author">${esc(item.author || "—")}</p>
        <a class="shelf-hero-cta" href="#/truyen/${esc(item.slug)}">Xem chi tiết ›</a>
      </div>
    </div>`;
  }

  function playHero(section, item) {
    const hero = section.querySelector("[data-shelf-hero]");
    if (!hero || !item.post) return;
    hero.innerHTML = `<div class="shelf-hero-media shelf-hero-playing">
      <header class="shelf-hero-playing-head">
        <span><i aria-hidden="true"></i>Đang phát tại đây</span>
        <button type="button" class="shelf-hero-close" data-shelf-close aria-label="Đóng video">× <small>Đóng</small></button>
      </header>
      <div class="shelf-hero-video">
        <iframe title="Teaser TikTok ${esc(item.title)}" src="https://www.tiktok.com/player/v1/${item.post}?autoplay=1&muted=0&loop=0&controls=1&progress_bar=1&play_button=1&volume_control=1&fullscreen_button=1&description=0&music_info=0&rel=0&native_context_menu=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
      </div>
    </div>
    <div class="shelf-hero-copy">
      <h3>${esc(item.title)}</h3>
      <p class="shelf-hero-author">${esc(item.author || "")}</p>
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

    function anglePerItem() {
      return list.length ? 360 / list.length : 0;
    }

    function measure() {
      const w = carousel.clientWidth || 320;
      radius = Math.max(120, Math.min(300, Math.round(w * 0.36)));
      carousel.style.setProperty("--shelf-radius", radius + "px");
    }

    function layout() {
      const cards = Array.from(ring.children);
      const step = anglePerItem();
      cards.forEach((card, i) => {
        card.style.transform = `rotateY(${i * step}deg) translateZ(${radius}px)`;
      });
      paint();
    }

    function paint() {
      const cards = Array.from(ring.children);
      const step = anglePerItem();
      let bestIndex = 0;
      let bestDelta = Infinity;
      cards.forEach((card, i) => {
        const raw = (i * step + rotation) % 360;
        const rel = Math.abs(raw > 180 ? 360 - raw : raw);
        const opacity = Math.max(0.28, 1 - rel / 150);
        card.style.opacity = String(opacity);
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

    function rotateTo(targetRotation, animate) {
      rotation = targetRotation;
      if (animate && !reduceMotion()) {
        ring.classList.add("is-settling");
        window.setTimeout(() => ring.classList.remove("is-settling"), 420);
      }
      paint();
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

    carousel.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
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
      if (tabKey === "preview") {
        e.preventDefault();
        const cards = Array.from(ring.children);
        selectIndex(cards.indexOf(card));
      }
    }, true);

    section.addEventListener("click", (e) => {
      if (e.target.closest("[data-shelf-play]")) {
        e.preventDefault();
        const cards = Array.from(ring.children);
        const front = cards[frontIndex];
        if (front) playHero(section, dataFromCard(front));
      } else if (e.target.closest("[data-shelf-close]")) {
        e.preventDefault();
        const cards = Array.from(ring.children);
        const front = cards[frontIndex];
        if (front) onFrontChange(front);
      }
    });

    carousel.addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      stepBy(e.key === "ArrowRight" ? 1 : -1);
    });

    carousel.addEventListener("pointerenter", () => { hoverPaused = true; });
    carousel.addEventListener("pointerleave", () => { hoverPaused = false; });

    function autoTick() {
      if (!dragging && !hoverPaused && !reduceMotion() && !section.querySelector(".shelf-hero-playing")) {
        rotation += 0.03;
        paint();
      }
      autoRaf = requestAnimationFrame(autoTick);
    }
    if (!reduceMotion()) autoRaf = requestAnimationFrame(autoTick);

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
