/* ViCamBachGiai — social icon availability state */
(function () {

  function socialSettings() {
    try {
      const s = window.VCBG && typeof window.VCBG.settings === 'function' ? window.VCBG.settings() : null;
      return (s && s.social) || {};
    } catch (_) {
      return {};
    }
  }

  function syncSocialIcons() {
    const strip = document.querySelector('.social-strip');
    if (!strip) return;
    const so = socialSettings();
    const icons = Array.from(strip.querySelectorAll('.social-ico'));

    icons.forEach((el) => {
      const key = el.dataset.social;
      if (!key) return;
      const href = String(so[key] || '').trim();
      const active = /^https?:\/\//i.test(href);

      el.classList.toggle('is-disabled', !active);
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-disabled', active ? 'false' : 'true');
      el.tabIndex = active ? 0 : -1;

      if (active) {
        el.setAttribute('href', href);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      } else {
        el.removeAttribute('href');
        el.removeAttribute('target');
        el.removeAttribute('rel');
      }
    });
  }

  document.addEventListener('click', function (e) {
    const el = e.target.closest && e.target.closest('.social-strip .social-ico.is-disabled');
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  let queued = false;
  const requestSync = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      syncSocialIcons();
    });
  };

  window.addEventListener('load', requestSync);
  window.addEventListener('hashchange', requestSync);
  new MutationObserver(requestSync).observe(document.documentElement, { childList:true, subtree:true });
})();
