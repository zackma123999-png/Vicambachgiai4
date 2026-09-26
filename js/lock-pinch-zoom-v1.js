// Prevent pinch-to-zoom across the whole site. The viewport meta tag
// already declares user-scalable=no, but iOS Safari (10+) deliberately
// ignores that for accessibility reasons. The actual fix lives in CSS —
// `touch-action: manipulation` on html/body in styles.css, which IS
// respected by iOS Safari because it's a standard CSS property, not the
// meta-tag hack Apple blocks. `scale` only exists on gesturestart/
// gesturechange (WebKit's proprietary gesture events), never on touchmove,
// so this is just a harmless backstop, not the primary mechanism.
(function () {
  document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
  document.addEventListener("gesturechange", function (e) { e.preventDefault(); });
})();
