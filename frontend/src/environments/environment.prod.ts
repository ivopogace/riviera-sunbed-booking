/**
 * Production (non-prod/demo deploy): the backend serves this app SAME-ORIGIN, so `apiBaseUrl` is ''
 * and the session + CSRF cookies are first-party (ADR-0004). The Docker build injects the Stripe
 * publishable key (public, never a secret): platform/Dockerfile + docs/deploy/cd-pipeline.md.
 */
export const environment = {
  production: true,
  // Same-origin: /api/** is served by the same backend that serves this app. Relative,
  // so api-session.interceptor's `${apiBaseUrl}/api/` prefix resolves to '/api/' and still matches.
  apiBaseUrl: '',
  // Stripe publishable key (pk_…) — public, not a secret. Injected at image build from
  // STRIPE_PUBLISHABLE_KEY; empty here so a misconfigured deploy fails loudly in-app.
  stripePublishableKey: '',
};
