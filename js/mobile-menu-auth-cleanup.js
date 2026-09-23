/* ViCamBachGiai: keep auth actions in the header/login page, not duplicated in mobile menu. */
(function () {
  function cleanup() {
    var menu = document.getElementById("mobileMenu");
    if (!menu) return;
    menu.querySelectorAll('a[href="#/dang-nhap"], a[href="#/dang-ky"]').forEach(function (link) {
      link.remove();
    });
  }

  cleanup();

  var observer = new MutationObserver(function () {
    cleanup();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
