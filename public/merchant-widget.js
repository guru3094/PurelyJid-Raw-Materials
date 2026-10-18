// Google Merchant store widget: optional position and region use Google's defaults.
(function () {
  const script = document.getElementById('merchantWidgetScript');
  if (!script) return;
  script.addEventListener('load', function () {
    if (typeof window.merchantwidget?.start !== 'function') return;
    try {
      window.merchantwidget.start({ merchant_id: 5330628987 });
    } catch (error) {
      console.warn('Google Merchant widget could not start.', error);
    }
  }, { once: true });
})();
