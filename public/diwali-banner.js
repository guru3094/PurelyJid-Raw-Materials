(() => {
  // Visible through 16 November 2026 in India, regardless of visitor timezone.
  const expiresAt = Date.parse('2026-11-17T00:00:00+05:30');
  const template = document.getElementById('diwali-banner-template');
  if (!template || Date.now() >= expiresAt) return;

  const banner = template.content.firstElementChild.cloneNode(true);
  template.before(banner);
  let timeout;
  function checkExpiry() {
    window.clearTimeout(timeout);
    if (Date.now() >= expiresAt) {
      banner.remove();
      document.removeEventListener('visibilitychange', checkExpiry);
      window.removeEventListener('pageshow', checkExpiry);
      return;
    }
    timeout = window.setTimeout(checkExpiry, Math.min(expiresAt - Date.now(), 2_147_483_647));
  }
  document.addEventListener('visibilitychange', checkExpiry);
  window.addEventListener('pageshow', checkExpiry);
  checkExpiry();
})();
