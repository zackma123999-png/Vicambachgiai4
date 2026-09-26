// KỆ TRUYỆN v2: hero cuộn toàn màn hình, 4 bước ứng với 4 hạng mục cũ.
// Ảnh nền + thẻ thông tin đổi theo tiến độ cuộn qua khoảng spacer riêng;
// bấm vào CTA giữ đúng chức năng gốc (Trạm Preview phát video tại chỗ,
// các hạng mục khác điều hướng thẳng tới trang truyện).
(function () {
  const esc = (value) => {
    const node = document.createElement("span");
    node.textContent = String(value == null ? "" : value);
    return node.innerHTML;
  };
  function cardHTML(item, label, index, total) {
    return {
      num: `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
      title: label,
      desc: `${item.title}${item.author ? " — " + item.author : ""}`,
      ctaLabel: item.post ? "Bấm để phát ▶" : "Xem chi tiết ›",
    };
  }

  function playHero(section, item) {
    const bg = section.querySelector("[data-sch-stage] .sch-bg");
    if (!bg || !item.post) return;
    bg.classList.add("is-playing");
    bg.innerHTML = `<div class="sch-video">
        <iframe title="Teaser TikTok ${esc(item.title)}" src="https://www.tiktok.com/player/v1/${item.post}?autoplay=1&muted=0&loop=0&controls=1&progress_bar=1&play_button=1&volume_control=1&fullscreen_button=1&description=0&music_info=0&rel=0&native_context_menu=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
      </div>
      <span class="sch-video-close" role="button" tabindex="0" aria-label="Đóng video">×</span>`;
  }

  function closeHeroVideo(section, currentCover) {
    const bg = section.querySelector("[data-sch-stage] .sch-bg");
    if (!bg) return;
    bg.classList.remove("is-playing");
    bg.innerHTML = `<img class="sch-bg-img sch-bg-a" src="${esc(currentCover)}" alt="">
      <img class="sch-bg-img sch-bg-b" alt="">
      <span class="sch-bg-scrim"></span>`;
  }

  function initHero(section) {
    if (!section || section.dataset.schBound === "true") return;
    section.dataset.schBound = "true";

    let steps = [];
    try {
      const script = section.querySelector("[data-sch-payload]");
      steps = script ? JSON.parse(script.textContent || "[]") : [];
    } catch (_) {
      steps = [];
    }
    if (!steps.length) return;

    const stage = section.querySelector("[data-sch-stage]");
    const spacer = section.querySelector("[data-sch-spacer]");
    const card = section.querySelector("[data-sch-card]");
    if (!stage || !spacer || !card) return;

    const SCROLL_VH = 130; // % chiều cao viewport cho mỗi bước
    spacer.style.height = `${steps.length * SCROLL_VH}vh`;

    let activeIdx = -1;
    let frontLayer = "a";
    let playing = false;

    function layers() {
      const bg = stage.querySelector(".sch-bg");
      return {
        bg,
        a: bg && bg.querySelector(".sch-bg-a"),
        b: bg && bg.querySelector(".sch-bg-b"),
      };
    }

    function setActive(idx, item) {
      if (idx === activeIdx || playing) return;
      activeIdx = idx;
      const { a, b } = layers();
      if (a && b) {
        const incoming = frontLayer === "a" ? b : a;
        const outgoing = frontLayer === "a" ? a : b;
        incoming.src = item.cover || "";
        incoming.classList.add("is-visible");
        outgoing.classList.remove("is-visible");
        frontLayer = frontLayer === "a" ? "b" : "a";
      }
      const info = cardHTML(item, steps[idx].label, idx, steps.length);
      const num = card.querySelector("[data-sch-num]");
      const title = card.querySelector("[data-sch-title]");
      const desc = card.querySelector("[data-sch-desc]");
      const cta = card.querySelector("[data-sch-cta]");
      if (num) num.textContent = info.num;
      if (title) title.textContent = info.title;
      if (desc) desc.textContent = info.desc;
      if (cta) {
        cta.textContent = info.ctaLabel;
        cta.setAttribute("href", "#/truyen/" + (item.slug || ""));
        cta.dataset.slug = item.slug || "";
        cta.dataset.title = item.title || "";
        cta.dataset.author = item.author || "";
        cta.dataset.cover = item.cover || "";
        cta.dataset.post = item.post || "";
      }
      section.querySelectorAll("[data-sch-tick]").forEach((tick, i) => {
        tick.classList.toggle("is-done", i < idx);
        tick.classList.toggle("is-current", i === idx);
      });
    }

    function onScroll() {
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const total = section.offsetHeight - vh;
      const scrolled = Math.min(Math.max(-rect.top, 0), Math.max(total, 1));
      const p = total > 0 ? scrolled / total : 0;
      const idx = Math.min(steps.length - 1, Math.max(0, Math.floor(p * steps.length)));
      setActive(idx, steps[idx].item);
      const fill = card.parentElement.querySelector("[data-sch-progress]");
      if (fill) fill.style.width = (p * 100).toFixed(1) + "%";
    }

    // Router toàn cục của trang (document click listener) tự điều hướng
    // MỌI thẻ <a href="#/..."> bất kể preventDefault() đã gọi hay chưa —
    // phải chặn cả việc lan truyền sự kiện thì mới không bị điều hướng.
    section.addEventListener("click", (e) => {
      const closeBtn = e.target.closest(".sch-video-close");
      if (closeBtn) {
        e.preventDefault();
        e.stopPropagation();
        closeHeroVideo(section, steps[activeIdx] ? steps[activeIdx].item.cover : "");
        return;
      }
      const cta = e.target.closest("[data-sch-cta]");
      if (cta && cta.dataset.post) {
        e.preventDefault();
        e.stopPropagation();
        playing = true;
        playHero(section, {
          title: cta.dataset.title,
          post: cta.dataset.post,
        });
      }
    });

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    onScroll();
  }

  function bindAll(root) {
    (root || document).querySelectorAll?.("[data-scrollhero]").forEach(initHero);
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
