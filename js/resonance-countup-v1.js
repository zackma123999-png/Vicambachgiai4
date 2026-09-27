// Live Resonance: các con số bắt đầu ở 0 và "nhảy" lên đúng số liệu (thật +
// hạt giống tạm thời, xem RESONANCE_SEED trong app.js) ngay khi khu vực này
// cuộn vào khung nhìn — dừng lại ở đúng số, không chạy vô hạn. Cập nhật số
// liệu thật định kỳ sau đó (từ watchResonanceStats trong app.js) chuyển êm
// sang số mới nếu khu vực đã hiển thị, hoặc chỉ âm thầm ghi nhớ đích nếu
// người dùng chưa cuộn tới.
(function () {
  function fmtCount(n) {
    n = Math.round(Number(n) || 0);
    if (n >= 10000) return (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "") + "K";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n);
  }
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DURATION = 1100;

  function tweenNumber(from, to, onFrame) {
    if (reduceMotion() || from === to) { onFrame(to); return; }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / DURATION);
      const eased = 1 - Math.pow(1 - t, 3);
      onFrame(from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function revealCard(card) {
    if (!card || card.dataset.resRevealed === "true") return;
    card.dataset.resRevealed = "true";
    card.querySelectorAll("[data-res]").forEach((el) => {
      const target = Number(el.dataset.resTarget || 0);
      tweenNumber(0, target, (v) => { el.textContent = fmtCount(v); });
    });
    const fill = card.querySelector(".res-ratio-fill");
    if (fill) {
      // CSS đã có `transition: width .4s ease` — chỉ cần đặt width thật,
      // trình duyệt tự chạy mượt từ 0% hiện tại lên đúng tỉ lệ.
      requestAnimationFrame(() => {
        fill.style.width = (Number(fill.dataset.ratioTarget || 0)) + "%";
      });
    }
  }

  function bind(card) {
    if (!card || card.dataset.resBound === "true") return;
    card.dataset.resBound = "true";
    if (!("IntersectionObserver" in window)) { revealCard(card); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { revealCard(card); io.disconnect(); }
      });
    }, { threshold: 0.35 });
    io.observe(card);
  }

  function bindAll(root) {
    (root || document).querySelectorAll?.(".reshome-card").forEach(bind);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => bindAll(document), { once: true });
  } else {
    bindAll(document);
  }
  new MutationObserver((mutations) => {
    if (mutations.some((item) => item.addedNodes.length)) bindAll(document);
  }).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener("vcbg:resonance-update", (e) => {
    const detail = e.detail || {};
    document.querySelectorAll(".reshome-card").forEach((card) => {
      const revealed = card.dataset.resRevealed === "true";
      card.querySelectorAll("[data-res]").forEach((el) => {
        const key = el.dataset.res;
        if (!(key in detail)) return;
        const next = Number(detail[key]) || 0;
        const prev = Number(el.dataset.resTarget || 0);
        el.dataset.resTarget = String(next);
        if (revealed && prev !== next) {
          tweenNumber(prev, next, (v) => { el.textContent = fmtCount(v); });
        }
      });
      const fill = card.querySelector(".res-ratio-fill");
      if (fill && Number.isFinite(detail.ratio)) {
        fill.dataset.ratioTarget = String(detail.ratio);
        if (revealed) fill.style.width = detail.ratio + "%";
      }
    });
  });
})();
