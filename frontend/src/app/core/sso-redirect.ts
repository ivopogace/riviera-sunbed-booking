/** The SSO providers a customer can start a sign-in with. */
export type SsoProviderId = 'google' | 'apple';

/**
 * Seam for the SSO start redirect. Starting SSO is a full-page navigation OUT of the SPA
 * to the backend authorize endpoint — the OIDC Authorization Code + PKCE flow completes server-side and
 * returns with the same session cookie as form login — so it cannot go through {@code HttpClient} / the
 * session interceptor. This abstract token isolates the `window.location` side-effect so it is swappable:
 * the real {@link WindowSsoRedirect} performs the navigation; unit specs override the token with a fake
 * that records the URL (the same adapter-swap pattern as {@code StripePaymentGateway}). Wired in
 * {@code app.config.ts}.
 */
export abstract class SsoRedirect {
  /** Navigate the browser to the SSO authorize URL (a real page load, leaving the SPA). */
  abstract go(url: string): void;
}

/** Production redirector: a real full-page navigation to the backend authorize endpoint. */
export class WindowSsoRedirect extends SsoRedirect {
  go(url: string): void {
    window.location.href = url;
  }
}
