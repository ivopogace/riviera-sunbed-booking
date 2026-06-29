/**
 * Default (development) environment. Replaced at production build time by
 * `environment.prod.ts` via the `fileReplacements` in angular.json.
 */
export const environment = {
  production: false,
  // Local backend (Spring Boot default / docker-compose). See application.properties.
  apiBaseUrl: 'http://localhost:8080',
  // Stripe publishable key (pk_test_…) — NOT a secret, safe in the bundle. Empty by default;
  // set a pk_test_… here for local `stripe`-profile testing. Injected at deploy from the
  // STRIPE_PUBLISHABLE_KEY repo variable (see deploy.yml). An empty value surfaces a clear
  // config-error state rather than failing silently.
  stripePublishableKey: '',
};
