// Live Resonance: các con số bắt đầu ở 0 và "nhảy" lên đúng số liệu (thật +
// hạt giống tạm thời, xem RESONANCE_SEED trong app.js) — nhưng CHỈ khi
// người dùng thật sự vuốt/cuộn tới khu vực này, không phải ngay khi vừa tải
// trang. Lý do trước đây nó nhảy quá sớm: ngay lúc trang vừa dựng xong,
// layout có thể còn ngắn hơn bản cuối (ảnh bìa truyện, video... chưa tải
// xong khiến trang chưa "cao" hết cỡ), nên IntersectionObserver coi khu vực
// này là "đã vào khung nhìn" dù người dùng chưa hề cuộn. Cách chắc chắn nhất
// để tránh việc đó: chỉ cho phép "nhảy số" sau khi đã ghi nhận một cử chỉ
// cuộn/vuốt thật sự (scroll/wheel/touchmove) — không suy đoán qua thời gian
// hay kích thước layout.
(function () {
  function fmtCount(n) {
    n = Math.round(Number(n) || 0);
    if (n >= 10000) return (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "") + "K";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n);
  }
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DURATION = 1200;

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

  // Chỉ tính là "người dùng đã cuộn/vuốt" khi thấy một cử chỉ thật, không
  // phải khi trang vừa tải xong.
  let userInteracted = false;
  const pendingCards = new Set();
  function onUserScrollLike() {
    if (userInteracted) return;
    userInteracted = true;
    pendingCards.forEach((card) => revealCard(card));
    pendingCards.clear();
  }
  ["scroll", "wheel", "touchmove", "keydown"].forEach((type) => {
    window.addEventListener(type, onUserScrollLike, { passive: true });
  });

  function revealCard(card) {
    if (!card || card.dataset.resRevealed === "true") return;
    card.dataset.resRevealed = "true";
    card.classList.add("is-counting");
    const nodes = card.querySelectorAll("[data-res]");
    let remaining = nodes.length;
    const done = () => {
      remaining -= 1;
      if (remaining <= 0) card.classList.remove("is-counting");
    };
    nodes.forEach((el) => {
      const target = Number(el.dataset.resTarget || 0);
      if (reduceMotion() || target === 0) { el.textContent = fmtCount(target); done(); return; }
      tweenNumber(0, target, (v) => {
        el.textContent = fmtCount(v);
        if (v >= target) done();
      });
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
    if (!("IntersectionObserver" in window)) {
      if (userInteracted) revealCard(card); else pendingCards.add(card);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) { pendingCards.delete(card); return; }
        if (userInteracted) {
          revealCard(card);
          io.disconnect();
        } else {
          // Đã vào khung nhìn về mặt kỹ thuật, nhưng chưa có cử chỉ cuộn
          // thật nào — chờ, và onUserScrollLike() sẽ giải phóng ngay khi có.
          pendingCards.add(card);
        }
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
