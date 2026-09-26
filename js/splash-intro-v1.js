// Màn hình chờ mở đầu: giữ hiển thị tối thiểu MIN_SHOW_MS rồi mờ dần và gỡ
// khỏi DOM, lộ ra trang chủ thật bên dưới (đã được render sẵn trong lúc chờ).
// Script này không phụ thuộc app.js/dữ liệu — chỉ đơn thuần hẹn giờ ẩn.
(function () {
  var MIN_SHOW_MS = 1900;
  var FADE_MS = 550;
  var start = Date.now();

  function hideSplash() {
    var el = document.getElementById("splashIntro");
    if (!el) return;
    el.classList.add("is-hidden");
    window.setTimeout(function () {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }, FADE_MS);
  }

  function scheduleHide() {
    var wait = Math.max(0, MIN_SHOW_MS - (Date.now() - start));
    window.setTimeout(hideSplash, wait);
  }

  scheduleHide();
})();
