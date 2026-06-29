import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { StripeJsPaymentGateway, StripePaymentGateway } from './booking/stripe-payment.gateway';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    provideRouter(routes),
    // Real Stripe.js adapter in the browser; specs/e2e override this token with a fake.
    { provide: StripePaymentGateway, useClass: StripeJsPaymentGateway }
  ]
};
