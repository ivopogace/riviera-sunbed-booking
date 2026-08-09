import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { CameraQrScanner } from './operator/camera-qr-scanner';
import { FakeQrScanner } from './operator/fake-qr-scanner';
import { QrScanner } from './operator/qr-scanner';
import { apiSessionInterceptor } from './core/api-session.interceptor';
import { SsoRedirect, WindowSsoRedirect } from './core/sso-redirect';
import { ThemeService } from './core/theme';

import {
  FakeStripePaymentGateway,
  StripeJsPaymentGateway,
  StripePaymentGateway
} from './booking/stripe-payment.gateway';
import { routes } from './app.routes';

/**
 * Real Stripe.js in the browser. The Playwright a11y e2e sets `window.__RIVIERA_FAKE_STRIPE__`
 * to swap in a deterministic fake (no js.stripe.com) — never set in production. Component unit
 * specs override the {@link StripePaymentGateway} token directly.
 */
/**
 * Real camera scanning in the browser. The Playwright a11y e2e sets `window.__RIVIERA_FAKE_QR__`
 * (a queue of payloads) to swap in a deterministic fake — same shape as the Stripe swap below.
 */
function qrScannerFactory(): QrScanner {
  const armed =
    (globalThis as unknown as { __RIVIERA_FAKE_QR__?: string[] }).__RIVIERA_FAKE_QR__ !== undefined;
  return armed ? new FakeQrScanner() : new CameraQrScanner();
}

function stripeGatewayFactory(): StripePaymentGateway {
  // `globalThis` is always defined (browser/SSR/test); in a browser it is `window`, so the
  // Playwright-set flag is read the same way without a `window` reference.
  const useFake =
    (globalThis as unknown as { __RIVIERA_FAKE_STRIPE__?: boolean }).__RIVIERA_FAKE_STRIPE__ === true;
  return useFake ? new FakeStripePaymentGateway() : new StripeJsPaymentGateway();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // apiSessionInterceptor rides the operator session: withCredentials + CSRF header on API
    // calls (replaces the retired Basic-credential interceptor).
    provideHttpClient(withInterceptors([apiSessionInterceptor])),
    provideRouter(routes),
    // The stored/OS theme must apply at bootstrap regardless of which components render —
    // don't rely on the shell happening to inject ThemeService.
    provideAppInitializer(() => {
      inject(ThemeService);
    }),
    { provide: StripePaymentGateway, useFactory: stripeGatewayFactory },
    { provide: QrScanner, useFactory: qrScannerFactory },
    // SSO start is a full-page navigation out of the SPA; the seam lets unit specs record the
    // URL without a real navigation (mirrors the Stripe adapter swap). The e2e uses the real redirect and
    // intercepts the navigation with page.route.
    { provide: SsoRedirect, useClass: WindowSsoRedirect }
  ]
};
