// Prevent pinch-to-zoom across the whole site. The viewport meta tag
// already declares user-scalable=no, but iOS Safari (10+) deliberately
// ignores that for accessibility reasons — it always allows pinch-zoom
// regardless of what the page requests. The only thing that reliably still
// stops it is intercepting the gesture in JS: WebKit's non-standard `scale`
// property on touch events during an active pinch, and the `gesturestart`
// event WebKit fires right before native zoom kicks in.
(function () {
  document.addEventListener("touchmove", function (e) {
    if (e.scale !== undefined && e.scale !== 1) e.preventDefault();
  }, { passive: false });
  document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
  document.addEventListener("gesturechange", function (e) { e.preventDefault(); });
})();
