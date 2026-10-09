# DramaAI Studio — Stripe webhook recovery update

## Included
- Shared event processing in `src/lib/stripeWebhookProcessing.js`.
- Stripe-signature-verified normal webhook at `/api/billing/webhook`.
- Admin-only GET inspection and explicit POST retry at `/api/admin/stripe-recovery`.
- SQL migration adjusted so `pending` records can be claimed.
- Existing production/video routes, prices, and credit SQL functions were not modified.

## Required before using the endpoints
1. Back up your Supabase database. Review and apply `supabase/stripe-webhook-events.sql` once, in the correct Supabase project. This ZIP does NOT apply it.
2. Keep `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` server-only. Never commit `.env.local`.
3. Configure a Stripe webhook destination for `https://YOUR_DOMAIN/api/billing/webhook` in the appropriate Stripe test/live mode, subscribing to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `charge.refunded`. Use the destination's own signing secret; Stripe CLI signing secrets differ.
4. Test in Stripe test mode with a separate test account, not existing paid episodes or production credits. Verify payment, duplicate delivery, partial refund, full refund, unpaid async checkout and refund-before-purchase delivery. Tests have NOT been run against Supabase/Stripe.

## Administrator inspection/retry
Use an authenticated admin Supabase access token in the `Authorization: Bearer ...` header.
- `GET /api/admin/stripe-recovery` lists up to 50 failed, pending or processing events.
- `POST /api/admin/stripe-recovery` with JSON `{ "eventId": "evt_..." }` explicitly retries **one previously tracked** event. It fetches the original event from Stripe, then re-fetches the current checkout session or charge to avoid applying stale amounts. Stripe event retrieval is subject to Stripe's retention period. This route is not a scheduler and does not automatically replay failures.
- A retry of a refund whose purchase is still missing will fail and remain retryable. Process the purchase first, then retry the refund.
- A recent in-flight claim cannot be overridden for 10 minutes. Database purchase/refund RPCs provide final idempotency safeguards.

## Deployment checklist
- `npm install` (if needed), `npm run build`.
- Run static checks and test in sandbox before deployment. No live calls have been performed by this ZIP.
- Confirm webhook delivery status and inspect errors in Stripe and Supabase.
- This ZIP is a code update, not a guarantee of successful live payment processing.

## Important caveats
- This package was generated from the provided ZIP only, not from unshared local files.
- The migration uses `CREATE OR REPLACE` and changes the claim function's `pending` handling; review it against your live schema.
- Checkout session metadata must contain `user_id` and `pack_id`, and `client_reference_id` must match `user_id`. If your checkout creator does not set those, update it before use.
