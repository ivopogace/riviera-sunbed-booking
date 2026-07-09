/**
 * Production (non-prod/demo deploy) environment. Since #110 the Spring Boot backend serves this
 * app SAME-ORIGIN, so `apiBaseUrl` is '' — every call targets `/api/**` on the app's own origin,
 * which is what makes the S1 session + CSRF cookies first-party (design D-7 / slice S7). The
 * Docker image's Node build stage rewrites this file to inject the public Stripe publishable key
 * (both values are public, never secrets). See platform/Dockerfile + docs/deploy/cd-pipeline.md.
 */
export const environment = {
  production: true,
  // Same-origin: /api/** is served by the same backend that serves this app (#110). Relative,
  // so api-session.interceptor's `${apiBaseUrl}/api/` prefix resolves to '/api/' and still matches.
  apiBaseUrl: '',
  // Stripe publishable key (pk_…) — public, not a secret. Injected at image build from
  // STRIPE_PUBLISHABLE_KEY; empty here so a misconfigured deploy fails loudly in-app.
  stripePublishableKey: '',
};
