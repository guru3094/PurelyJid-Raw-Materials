# PurelyJid Materials Store — stock on fulfilment + Excel import

Cream/green/gold storefront, staff admin, Node.js API and Supabase database. This package updates the supplied project; it has not been applied to your live database or deployed automatically.

## Upgrade an existing installation

1. Back up your Supabase database. Temporarily pause checkout/admin stock edits while running the SQL upgrade.
2. Run the complete `supabase/04_upgrade_completion_stock.sql` in Supabase SQL Editor as database owner. This moves deduction to COMPLETED and releases old pending reservations. It preserves completed deductions and leaves cancelled orders unchanged. The script is safe to rerun. If a pending legacy reservation now has NULL stock, the script aborts; reconcile those products first. If stock was manually overwritten while reservations existed, reconcile it against physical inventory before upgrading.
3. Run `supabase/05_catalogue_replacement.sql`. This installs the server-only import functions; running it does not change the catalogue. It is safe to rerun.
4. Deploy the updated project with `npm ci` (Vercel: Framework Other, no build command, no Output Directory override). Keep the existing environment variables. Do not run fresh schema or seed scripts on your existing database.
5. Open `/admin.html`, sign in and use **Import current stock from Excel**. Select your report, preview it, review all products, type **IMPORT CURRENT STOCK**, then save.
6. Test using a designated product: REQUESTED/CONFIRMED/READY/DISPATCHED must leave stock unchanged; COMPLETED deducts once; cancellation leaves stock unchanged. A retry of completion must not deduct again.

Normal Excel imports are allowed while orders are open. The temporary pause in step 1 is only for converting the old database behaviour, not a restriction on future imports.

## Stock behaviour

- `products.stock` stores current remaining stock. `orders` and `order_items` are separate tables; order items link to product IDs and save name/price snapshots.
- Adding to the bag does not change stock. Checkout creates a REQUESTED order, checks current availability/quantity and reads prices from the database, but does not reserve or deduct anything.
- Only COMPLETED deducts stock. Use this when goods are handed over for pickup or successfully delivered. CONFIRMED, READY and DISPATCHED do not deduct.
- Completion locks the order and product rows, checks every quantity, deducts and changes status in one transaction. If any item lacks stock, the entire completion fails with no partial deductions or status change.
- Repeated completion is idempotent. COMPLETED and CANCELLED are final. Cancellation before completion does not change stock.
- Blank/NULL stock means untracked; it is never automatically deducted. Completion uses the product's tracking setting at that time.
- Pending requests do not reserve inventory, so their combined quantities may exceed stock. No automatic reservation expiry or payment-dependent deduction exists.
- `stock_reserved` is retained for legacy conversion only. New orders set it false. `stock_deducted` marks lines that consumed tracked stock at completion.
- Use the admin status control, not direct table edits, to ensure the stock function runs.

## Excel import: current total, not stock addition

Supports the supplied Vyapar XLSX report: one worksheet, up to 1000 products, maximum file size 2 MB. Headers can appear in the first 30 rows. Required columns are `Item Name`, `Sale Price`, and the selected quantity column:

- **Stock Quantity** (default): current total from that column.
- **Available Quantity for Sale**: use this instead if you want Vyapar's available count.

Counts replace website counts: importing 50 sets stock to 50; it does not add 50. `Sale Price` replaces the current price, rounded to two decimals with no tax conversion. Purchase Price, Reserved Quantity and Stock Value are ignored. Check whether your exported prices include tax before publishing.

The file becomes the current storefront catalogue:

- Matching names retain the same product ID, keeping pending order links valid. Matching ignores case, repeated spaces and Unicode compatibility differences; it does not use fuzzy matching. Keep Item Name stable. Renaming a product in Excel creates a new identity instead of moving old pending orders to a guessed match.
- Existing matched products retain their category, unit and item code. Names, prices, stock and photo choices are updated; imported products are visible and available (zero stock still prevents new ordering).
- New names create products in category `Raw Materials`, unit `item`, blank code. Adjust these after import if needed.
- Products absent from the file disappear from the storefront. Unreferenced products are deleted. Products referenced by any order are retained hidden/unavailable with stock zero. Completing an outstanding order for such a missing item fails until that same product is restocked/reintroduced. Cancelling it does not change stock.
- Existing order items retain their saved names and prices even when catalogue prices change.
- The optional photo retention copies images only from unique, matching active product names. The report contains no images; all other products use the existing placeholder.

There is no open-order block. A transaction briefly serializes database writes during import. A catalogue revision check rejects a preview if a product changes before saving (for example another order completes). Preview a fresh report again instead of overwriting an unnoticed stock change.

All rows must validate: nonblank unique names, numeric prices, nonnegative whole-number stock. Blank separators and the Vyapar total footer are ignored. Formulas are rejected; export a values-only report. Duplicate existing active product names must be renamed before they can be matched safely. Nothing is written during preview, and any import error rolls back all changes.

**Keep the report current.** Importing an old total can overwrite website deductions made since that report was exported. This feature does not reconcile or automatically sync Vyapar. After a website order is fulfilled, record its invoice in Vyapar before exporting your next total; otherwise the imported count can put sold units back into website stock. Do not deduct pending orders from the report: they will be deducted here when completed.

If the network fails while saving, reload Products & stock to check the result before preparing another import. Reusing an old preview after a successful save is rejected.

## Fresh installation only

For a separate empty Supabase project:

1. Run `supabase/01_schema.sql`. It already includes completion-only stock and Excel import functions.
2. Optionally run `supabase/02_catalogue_seed.sql` for the original 332-product sample catalogue. Seed stock is untracked until accurate counts are imported or entered. Do not seed after importing real products.
3. Run read-only `supabase/03_verify.sql` to inspect access/security.
4. Configure the server and admin account below.

The existing project URL is `https://iexxsawubbmtopuwqjoz.supabase.co`. Never use another PurelyJid project's credentials accidentally.

## Environment and deployment

Node.js 22 or later. Dependencies are pinned with a lockfile; use `npm ci`. Production dependencies handle XLSX parsing. PGlite is a development-only test dependency. The uuid override patches an ExcelJS transitive dependency; retain it with the lockfile.

Copy `.env.example` to `.env` for local development. Never commit real keys.

| Variable | Purpose |
| --- | --- |
| SUPABASE_URL | Supabase API URL |
| SUPABASE_PUBLISHABLE_KEY | Publishable key (legacy anon supported) |
| SUPABASE_SECRET_KEY | Server-only secret (legacy service-role supported) |
| APP_ORIGIN | Exact website origin, e.g. https://your-store.example |
| RATE_LIMIT_SALT | Long random private string |
| TURNSTILE_SITE_KEY | Cloudflare Turnstile public widget key |
| TURNSTILE_SECRET_KEY | Matching server-only secret |
| ALLOW_UNPROTECTED_CHECKOUT | false in deployment; true only for local nonproduction testing |
| PORT | Local Node server port, default 3000 |

Locally run `npm ci`, `npm test`, then `npm start`. Use APP_ORIGIN=http://localhost:3000. Production checkout requires valid Turnstile configuration; the server verifies hostname and action=checkout. Configure the deployed hostname in Turnstile and redeploy after changing server environment variables.

Vercel serves public/ and api/handler.js with the existing vercel.json API rewrites. Import the repository with framework Other, no build command and no output-directory override. On another Node host, run npm start behind HTTPS. Never expose the Supabase secret in public JS or NEXT_PUBLIC variables.

## Admin account

Create/invite your staff account privately in Supabase Authentication > Users, then grant server-controlled app metadata in SQL Editor (replace the UUID):

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || '{"store_role":"admin"}'::jsonb
where id = 'YOUR_AUTH_USER_UUID'::uuid;
```

Sign in at /admin.html. The API validates the access token with Supabase Auth and checks app_metadata.store_role on every admin request. There is no public signup. Sessions stay in sessionStorage and require re-login after expiry. Sign out revokes the session and clears the token.

## API and data

| Table | Purpose |
| --- | --- |
| categories | Category master |
| products | Catalogue, price, remaining stock, visibility and availability |
| orders | Private customer details, reference, subtotal and status |
| order_items | Private item quantities, product links and price/name snapshots |
| checkout_rate_limits | Hashed client identifiers for checkout throttling |

GET /api/products returns current active products. POST /api/orders uses a unique request UUID and payload hash to prevent duplicate orders on retries. Checkout allows up to five new orders per hashed client address per ten minutes. Order amounts use database prices, never browser-submitted totals.

Admin routes support login/logout, product editing, the most recent 100 orders, status updates, POST /api/admin/catalogue/preview and POST /api/admin/catalogue/replace. Import routes require an authorized admin and the configured origin. The database functions are SECURITY INVOKER and executable by service_role only. All application tables have RLS; public clients cannot access private orders or invoke privileged functions.

## Verification and limits

Automated tests use disposable PGlite databases. Coverage includes completion deduction, repeated completion, cancellation, atomic insufficient-stock rollback, untracked stock, legacy conversion/rerun, XLSX validation, imports with pending orders, stable product IDs, missing-product protection, stale previews, historical snapshots and unauthorized access. The supplied report parsed as 362 products and 4258 units with no validation errors. A disposable integration test imports that report into the original seeded catalogue.

No live Supabase changes, real catalogue imports or deployment have been performed by generating this package. Hosted API/browser acceptance checks remain necessary after setup. There is no payment gateway, tax/delivery calculation, automatic WhatsApp sending, returns workflow, stock-movement ledger or automatic Vyapar sync. Product photos still use original external CDN URLs where retained. The frontend does not subscribe to live stock changes; checkout/completion always recheck the database.
