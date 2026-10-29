# Send store orders to the existing PurelyJid Orders Sheet

Deploy the companion main tracker receiver described in its `BORZO_INTEGRATION.md` first.

1. Apply `supabase/migrations/20261029124744_store_sheet_outbox.sql` to the **Raw Materials store** Supabase project, after existing schema/stock upgrades. Do not apply this to the main tracker project.
2. Set `STORE_SYNC_SECRET` on this Vercel project and the main tracker to the same independent, random secret (at least 32 characters).
3. Set `CRON_SECRET` on this project for the authenticated retry route. Vercel's daily cron calls `/api/cron/sheet-sync` at 03:00 UTC / 08:30 IST. It processes up to ten oldest pending records per run. Immediate checkout delivery handles the normal case; use the admin retry button for pending batches. For frequent retry on a different scheduler, call the same endpoint with `Authorization: Bearer <CRON_SECRET>`; do not expose the secret in URLs.
4. Keep existing checkout security and database configuration. No Google key is needed on this project. Signed customer-order payloads are sent only to `https://www.purelyjid.in/api/integrations/pjresin`.
5. Test a sandbox/nonproduction checkout and verify the PJM reference appears once in the existing `Orders!A:S`. Repeated retries must not append another row. A pending sync message means the store order is saved; do not ask customers to place it again.

The SQL wrapper retains the existing checkout transaction, validation, rate limiting, idempotency and completion-only stock deduction. It queues actual database line-item prices rather than browser prices, captures email for the Sheet and preserves the original PJM order reference. Only new checkouts enter the outbox; historical orders are not backfilled. Existing order-status changes are not mirrored back into the Sheet by this creation-only integration. Continue to manage sales tracking through the main Orders Sheet and inventory completion through the store admin as before.

If a Google append times out after submission, the main receiver conservatively holds its receipt for reconciliation. It checks for an existing matching PJM row on retry but never blindly appends another. See the main repository guide for resolution. Outbox payloads contain customer contact/address data, remain service-role-only with RLS, and must not be exposed as public product data.

If more than ten orders accumulate, click the admin retry button repeatedly until cleared. No paid courier booking is triggered by syncing an order. Courier booking is a separate, explicit quote/confirmation flow on the main website.
