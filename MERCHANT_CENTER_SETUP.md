# Google Merchant Center product feed

After deployment, use **https://www.pjresin.in/google-products.xml** as the product-file URL in Merchant Center (Add products from a file → Enter a link).

Choose India and English, and configure a scheduled fetch in Merchant Center. The default Google schedule is daily; you can adjust it in your account. No username/password or API key is needed for this public product feed. Existing server database environment variables are reused; no database migrations or new secrets are needed.

## Feed behaviour

- RSS 2.0 XML with Google's `g:` namespace.
- Uses current active products from the existing database, paginated in batches of 1,000.
- IDs remain the existing numeric product IDs; links match the canonical product pages.
- Includes title, factual catalogue description, INR price, actual product image, new condition and current availability. No customer/order data is queried.
- Availability follows the website: the product must be available and have positive stock, or null stock for untracked inventory.
- Excludes missing images, SVG placeholders, invalid prices, invalid IDs and titles longer than Google's 150-character limit. These products can enter the feed after their data is corrected.
- The tested API snapshot contained 362 products; 332 had usable images and were included. These counts are not hard-coded and will change with catalogue edits.
- No application/CDN cache is used, so each Google fetch reads current data. A database failure returns 503 with Retry-After rather than publishing a partial successful feed. HEAD and GET are supported.
- `/api/products`, SEO sitemap, storefront design, admin, order and stock workflows are unchanged.

## Merchant Center approval is a separate step

This creates a product data source, not an approval guarantee. Review the diagnostics after Google imports it.

- The catalogue currently has no manufacturer brand, GTIN or MPN fields. These are omitted. Internal item codes are not submitted as MPNs, and `identifier_exists=no` is not asserted without confirmation that manufacturer identifiers truly do not exist. Google may require accurate manufacturer identifiers for particular products.
- The feed's condition is `new`, matching the retail materials catalogue; used/refurbished products must not be included without adding real per-product condition data.
- Descriptions use only known name/category/unit information; product-specific specifications should be improved where available.
- Validate product image size/quality and crawlability. Do not use decorative/AI hero imagery as product images.
- Configure accurate shipping, returns/refunds, business details and website verification in Merchant Center. No shipping costs or policies have been invented in the feed.
- The current website saves order requests and confirms charges/payment afterwards. Google's online-store requirements include buying directly through the website and a conventional payment method (which can include invoicing or payment on delivery) through secure checkout. Review this flow and publish clear terms before expecting online Shopping approval; a working XML feed alone does not establish eligibility.

## Verification

- `npm test` covers feed encoding, availability, prices, pagination, failure handling, methods and public/Vercel routing, alongside existing order/stock/SEO tests.
- Parse a real fetched XML document and check item counts, unique IDs and landing pages after deployment.
- Check `/google-products.xml` returns HTTP 200 with `application/xml; charset=utf-8` and confirm existing `/sitemap.xml` still works.

References:
- https://support.google.com/merchants/answer/12158380
- https://support.google.com/merchants/answer/7052112
- https://support.google.com/merchants/answer/6324478
- https://support.google.com/merchants/answer/12160471
