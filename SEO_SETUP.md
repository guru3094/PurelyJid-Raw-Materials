# Pune SEO update

Based on GitHub main commit 765b887. This update keeps the PurelyJid brand theme and existing checkout, admin, stock and Excel-import behaviour.

## Included

- Homepage title and description focused on resin art supplies in Pune, visible Pimple Gurav/PCMC copy, actual address/phone and pickup guidance.
- Canonical URLs fixed to https://www.pjresin.in (matching the configured www production domain); Open Graph/Twitter metadata and a 1200×630 share image.
- Store structured data with the known address, phone and social links. No fabricated ratings, review counts, coordinates or opening hours.
- /materials: server-rendered current active catalogue with ordinary crawlable product links.
- /products/{id}/{name}: server-rendered individual product pages with Product/Offer and breadcrumb structured data, current database price and availability, and a link back to the shop to order. Product name links in the storefront now open these pages; image buttons retain the quick-view dialog.
- /sitemap.xml: generated from current active products, plus the homepage and catalogue. It does not include admin or private order records.
- robots.txt and admin noindex in both page markup and HTTP header. Admin authentication remains required; noindex is not a security control.
- Genuine missing products return HTTP 404. Database failures return 503 with Retry-After, rather than serving an empty successful catalogue.

## Deploy

Upload all updated files, including lib/seo.mjs, public/assets/social-preview.png and vercel.json. Use the existing server environment variables. No new database tables, migrations or keys are needed. This package does not run SQL or publish to GitHub automatically.

Canonical domain is configured in lib/seo.mjs, the generated homepage head and public/robots.txt. If the production domain changes, update all three together. Keep pjresin.in redirecting to www.pjresin.in in Vercel. Keep APP_ORIGIN=https://www.pjresin.in and the matching Turnstile hostname for checkout/admin.

## After deployment

1. Confirm the production pages /, /materials, a product URL and /sitemap.xml return successfully. View source on a product page: product name, price and structured data should be present without running JavaScript.
2. Verify pjresin.in in Google Search Console with its DNS TXT token; keep existing DNS records. Submit https://www.pjresin.in/sitemap.xml.
3. Inspect the homepage, /materials and a few product URLs in Search Console. Request indexing if appropriate. Google decides when/if pages are indexed.
4. Test the homepage and a real product URL in Google's Rich Results Test. Browser and live Google validation were not available during packaging.
5. Keep business name, address and phone consistent across your existing Google Business Profile, main PurelyJid website and store. Add relevant product/store links on those channels; no fake reviews or duplicate location profiles.
6. Maintain accurate stock/prices, useful product names and original photographs. Add genuine descriptions/specifications over time. If exported prices exclude tax, review the displayed prices before promoting them.
7. Track Search Console queries, clicks and impressions for Pune/Pimple Gurav. Changes do not guarantee ranking or reach and can take time to be reflected.

The Store schema deliberately does not invent opening hours (only Monday closure is known), delivery times, discounts, ratings or customer reviews. Monday closure and team confirmation remain visible as ordinary copy. Structured data reflects requestable stock; the studio confirms final availability and fulfilment. There is no payment gateway or shipping/tax calculation added by this update.

## Validation

Node syntax checks and automated tests cover metadata consistency, sitemap entries, server-rendered product content, schema price/availability, escaping untrusted names, inactive/missing products, invalid IDs and temporary upstream failures, in addition to the existing inventory/order/import tests. The SQL schema is unchanged. A post-deployment production test and Search Console verification are still required.

References:
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- https://developers.google.com/search/docs/appearance/structured-data/local-business
- https://developers.google.com/search/docs/appearance/structured-data/product-snippet
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
