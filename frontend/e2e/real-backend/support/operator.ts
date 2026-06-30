/**
 * The operator credential the real-backend e2e suite signs in with. The same value is fed to the
 * backend `webServer` as `RIVIERA_OPERATOR_PASSWORD` (see `playwright.config.ts`) so the
 * InMemoryUserDetailsManager in `SecurityConfig` accepts this exact login — keeping the launcher
 * and the tests in lock-step from one source. Local-only test data, never a real secret.
 */
export const OPERATOR_USERNAME = 'operator';
export const OPERATOR_PASSWORD = 'e2e-operator-secret';
