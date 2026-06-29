/**
 * Production (non-prod/demo deploy) environment. The committed `apiBaseUrl` is the
 * expected Render host; the CD workflow rewrites this file at build time from the
 * `BACKEND_API_URL` and `STRIPE_PUBLISHABLE_KEY` repo variables (both public, not secrets)
 * without a code edit. See docs/deploy/cd-pipeline.md.
 */
export const environment = {
  production: true,
  apiBaseUrl: 'https://riviera-sunbed-booking.onrender.com',
  // Stripe publishable key (pk_…) — public, not a secret. Injected at deploy from
  // STRIPE_PUBLISHABLE_KEY; empty here so a misconfigured deploy fails loudly in-app.
  stripePublishableKey: '',
};
