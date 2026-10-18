// Loaded only by the storefront. Customer email stays in memory, not browser storage.
(function () {
  const offered = new Set();
  function deliveryDate(now = new Date()) {
    const local = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);
    const part = type => local.find(p => p.type === type).value;
    const date = new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`);
    let remaining = 4;
    while (remaining) {
      date.setUTCDate(date.getUTCDate() + 1);
      if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) remaining--;
    }
    return date.toISOString().slice(0, 10);
  }
  window.PurelyJidReviews = {
    deliveryDate,
    offer({ orderId, email }) {
      if (!orderId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || offered.has(orderId)) return;
      offered.add(orderId);
      const config = {
        merchant_id: 5330628987, order_id: String(orderId), email,
        delivery_country: 'IN', estimated_delivery_date: deliveryDate()
      };
      // Register callback before loading Google's async script to avoid a load race.
      window.renderOptIn = function () {
        try {
          window.gapi.load('surveyoptin', function () {
            try { window.gapi.surveyoptin.render(config); }
            catch (error) { console.warn('Google review invitation unavailable.', error); }
          });
        } catch (error) { console.warn('Google review invitation unavailable.', error); }
      };
      if (window.gapi?.load) window.renderOptIn();
      else {
        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/platform.js?onload=renderOptIn';
        script.async = true;
        script.defer = true;
        document.head.append(script);
      }
    }
  };
})();
