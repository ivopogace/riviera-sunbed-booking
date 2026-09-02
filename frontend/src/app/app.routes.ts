import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';

import type { AdminTabRouteData } from './admin/admin-console';
import { operatorSessionGuard } from './core/operator-session.guard';

/**
 * The operator-console tab child routes. Every tab has graduated to its real component
 * (beach-map through venue — no placeholders remain); `data.tab` identifies the section.
 * A child reads `:venueId` from the PARENT route (child routes don't inherit it under the
 * router's default `emptyOnly` strategy).
 */
const consoleTabRoutes: Routes = [
  {
    // The generate-grid + paint layout editor.
    path: 'beach-map',
    loadComponent: () => import('./operator/layout-editor').then((m) => m.LayoutEditor),
    title: 'Beach map — Operator console',
    data: { tab: 'beach-map' },
  },
  {
    // The per-row pricing tab.
    path: 'pricing',
    loadComponent: () => import('./operator/pricing-tab').then((m) => m.PricingTab),
    title: 'Pricing — Operator console',
    data: { tab: 'pricing' },
  },
  {
    // The daily view (availability grid + date + arrivals).
    path: 'daily',
    loadComponent: () => import('./operator/daily-view-tab').then((m) => m.DailyViewTab),
    title: 'Daily view — Operator console',
    data: { tab: 'daily' },
  },
  {
    // The Request-to-Book queue (accept/decline/expired-race).
    path: 'requests',
    loadComponent: () => import('./operator/requests-tab').then((m) => m.RequestsTab),
    title: 'Requests — Operator console',
    data: { tab: 'requests' },
  },
  {
    // The payout ledger + statement + weather refund.
    path: 'payouts',
    loadComponent: () => import('./operator/payouts-tab').then((m) => m.PayoutsTab),
    title: 'Payouts — Operator console',
    data: { tab: 'payouts' },
  },
  {
    // The Venue & commodities tab — details form + amenity toggle-chips + photo placeholders.
    path: 'venue',
    loadComponent: () => import('./operator/venue-tab').then((m) => m.VenueTab),
    title: 'Venue & commodities — Operator console',
    data: { tab: 'venue' },
  },
];

/**
 * The admin-console tab child routes. Operators lives at the console's own `''` path (it is the
 * console's index tab, not a sub-path like the operator console's `beach-map`); every other tab
 * is a literal segment. Each carries `data.adminTab` — the title, its `id`, the section's
 * max-width, the sign-in copy, and the three gate test ids — which {@link AdminConsole} reads to
 * render itself around whichever tab is active, with no per-tab branching of its own.
 */
const adminTabRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./admin/admin-operators').then((m) => m.AdminOperators),
    title: 'Operators — Riviera',
    data: {
      adminTab: {
        title: 'Operators',
        titleId: 'admin-ops-title',
        maxWidthClass: 'max-w-[720px]',
        signInCopy: 'Sign in as an admin to review pending registrations.',
        restoringTestId: 'admin-ops-restoring',
        signedOutTestId: 'admin-ops-signed-out',
        forbiddenTestId: 'admin-ops-forbidden',
      } satisfies AdminTabRouteData,
    },
  },
  {
    path: 'commissions',
    loadComponent: () => import('./admin/admin-commissions').then((m) => m.AdminCommissions),
    title: 'Commissions — Riviera',
    data: {
      adminTab: {
        title: 'Commissions',
        titleId: 'admin-commissions-title',
        maxWidthClass: 'max-w-[860px]',
        signInCopy: 'Sign in as an admin to review and change venue commission rates.',
        restoringTestId: 'admin-commissions-restoring',
        signedOutTestId: 'admin-commissions-signed-out',
        forbiddenTestId: 'admin-commissions-forbidden',
      } satisfies AdminTabRouteData,
    },
  },
  {
    path: 'email',
    loadComponent: () => import('./admin/admin-mail-outbox').then((m) => m.AdminMailOutbox),
    title: 'Email — Riviera',
    data: {
      adminTab: {
        title: 'Email',
        titleId: 'admin-outbox-title',
        maxWidthClass: 'max-w-[720px]',
        signInCopy: 'Sign in as an admin to review undelivered mail.',
        restoringTestId: 'admin-outbox-restoring',
        signedOutTestId: 'admin-outbox-signed-out',
        forbiddenTestId: 'admin-outbox-forbidden',
      } satisfies AdminTabRouteData,
    },
  },
  {
    path: 'refunds',
    loadComponent: () => import('./admin/admin-refund-outbox').then((m) => m.AdminRefundOutbox),
    title: 'Refunds — Riviera',
    data: {
      adminTab: {
        title: 'Refunds',
        titleId: 'admin-refunds-title',
        maxWidthClass: 'max-w-[720px]',
        signInCopy: 'Sign in as an admin to review outstanding refunds.',
        restoringTestId: 'admin-refunds-restoring',
        signedOutTestId: 'admin-refunds-signed-out',
        forbiddenTestId: 'admin-refunds-forbidden',
      } satisfies AdminTabRouteData,
    },
  },
  {
    path: 'photos',
    loadComponent: () => import('./admin/admin-venue-photos').then((m) => m.AdminVenuePhotos),
    title: 'Photos — Riviera',
    data: {
      adminTab: {
        title: 'Photos',
        titleId: 'admin-photos-title',
        maxWidthClass: 'max-w-[860px]',
        signInCopy: 'Sign in as an admin to moderate venue photos.',
        restoringTestId: 'admin-photos-restoring',
        signedOutTestId: 'admin-photos-signed-out',
        forbiddenTestId: 'admin-photos-forbidden',
      } satisfies AdminTabRouteData,
    },
  },
  {
    path: 'reviews',
    loadComponent: () => import('./admin/admin-reviews').then((m) => m.AdminReviews),
    title: 'Reviews — Riviera',
    data: {
      adminTab: {
        title: 'Reviews',
        titleId: 'admin-reviews-title',
        maxWidthClass: 'max-w-[860px]',
        signInCopy: 'Sign in as an admin to moderate reviews.',
        restoringTestId: 'admin-reviews-restoring',
        signedOutTestId: 'admin-reviews-signed-out',
        forbiddenTestId: 'admin-reviews-forbidden',
      } satisfies AdminTabRouteData,
    },
  },
  {
    path: 'privacy',
    loadComponent: () => import('./admin/admin-privacy').then((m) => m.AdminPrivacy),
    title: 'Privacy — Riviera',
    data: {
      adminTab: {
        title: 'Privacy',
        titleId: 'admin-privacy-title',
        maxWidthClass: 'max-w-[880px]',
        signInCopy: 'Sign in as an admin to action a data-subject erasure request.',
        restoringTestId: 'admin-privacy-restoring',
        signedOutTestId: 'admin-privacy-signed-out',
        forbiddenTestId: 'admin-privacy-forbidden',
      } satisfies AdminTabRouteData,
    },
  },
  {
    path: 'audit',
    loadComponent: () => import('./admin/admin-audit').then((m) => m.AdminAudit),
    title: 'Audit — Riviera',
    data: {
      adminTab: {
        title: 'Audit',
        titleId: 'admin-audit-title',
        maxWidthClass: 'max-w-[860px]',
        signInCopy: 'Sign in as an admin to review recorded admin actions.',
        restoringTestId: 'admin-audit-restoring',
        signedOutTestId: 'admin-audit-signed-out',
        forbiddenTestId: 'admin-audit-forbidden',
      } satisfies AdminTabRouteData,
    },
  },
];

/**
 * `legacySurface: true` = pre-redesign styling: the shell wraps the route in its opaque compat
 * surface until the route is restyled to Liquid Glass, which removes the flag (pinned by
 * app.spec.ts). Every production route has been restyled — none carries the flag today.
 */
export const routes: Routes = [
  {
    // Restyled to Liquid Glass — no compat surface.
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
    title: 'Riviera — Sunbed Booking',
  },
  {
    // Device-local guest bookings list — glass from the start, no compat surface.
    path: 'my-bookings',
    loadComponent: () => import('./booking/my-bookings').then((m) => m.MyBookings),
    title: 'My bookings — Riviera',
  },
  {
    // The ONE auth card; ?audience=/?mode=/?returnUrl= preselect its state.
    path: 'account/sign-in',
    loadComponent: () => import('./auth/auth-page').then((m) => m.AuthPage),
    title: 'Sign in — Riviera',
  },
  {
    // Retired page → the card in register mode; kept one release for existing links.
    path: 'account/register',
    redirectTo: () => inject(Router).parseUrl('/account/sign-in?mode=register'),
    pathMatch: 'full',
  },
  {
    // Forgot password → request a reset link. `account/*` literal segment, no param collision.
    path: 'account/forgot',
    loadComponent: () => import('./auth/forgot-password').then((m) => m.ForgotPassword),
    title: 'Reset your password — Riviera',
  },
  {
    // Reset landing (emailed link carries ?token=…) — set a new password.
    path: 'account/reset',
    loadComponent: () => import('./auth/reset-password').then((m) => m.ResetPassword),
    title: 'Set a new password — Riviera',
  },
  {
    // Email-verification landing (emailed link carries ?token=…) — POST-verify on load.
    path: 'account/verify',
    loadComponent: () => import('./auth/verify-email').then((m) => m.VerifyEmail),
    title: 'Verify your email — Riviera',
  },
  {
    // Signed-in account page: set/change password + verification resend.
    path: 'account/password',
    loadComponent: () => import('./auth/set-password').then((m) => m.SetPassword),
    title: 'Your account — Riviera',
  },
  {
    // Operator credential rotation — a separate page from the customer account page above.
    path: 'account/operator-password',
    loadComponent: () => import('./auth/operator-password').then((m) => m.OperatorPassword),
    title: 'Change your password — Riviera',
    canActivate: [operatorSessionGuard],
    // Operator surface: the shared operator header/footer, never the tourist ones.
    data: { operatorChrome: true },
  },
  {
    // Draft privacy policy — checkout agreement + footer link target.
    path: 'legal/privacy',
    loadComponent: () => import('./pages/legal/privacy-policy').then((m) => m.PrivacyPolicy),
    title: 'Privacy policy — Riviera',
  },
  {
    // Draft terms of service — checkout agreement + footer link target.
    path: 'legal/terms',
    loadComponent: () => import('./pages/legal/terms-of-service').then((m) => m.TermsOfService),
    title: 'Terms of service — Riviera',
  },
  {
    // Retired onboarding → the operator home's create state; kept one release for old links.
    path: 'venue-admin',
    redirectTo: () => inject(Router).parseUrl('/operator?create=1'),
    pathMatch: 'full',
  },
  {
    // The retired /venue-admin/daily/:venueId StaffDaily page forwards to the console's
    // Daily-view tab (param preserved), so a bookmarked daily-ops link still lands somewhere live.
    path: 'venue-admin/daily/:venueId',
    redirectTo: 'operator/:venueId/daily',
    pathMatch: 'full',
  },
  {
    // Retired page → the card's operator tab. MUST stay above 'operator/:venueId'.
    path: 'operator/register',
    redirectTo: () => inject(Router).parseUrl('/account/sign-in?audience=operator&mode=register'),
    pathMatch: 'full',
  },
  {
    // The operator landing (0 venues → inline create, 1 → console, 2+ → picker). Above ':venueId'.
    path: 'operator',
    loadComponent: () => import('./operator/operator-home').then((m) => m.OperatorHome),
    title: 'Your venues — Riviera',
    canActivate: [operatorSessionGuard],
    // Operator surface: the shared operator header/footer, never the tourist ones.
    data: { operatorChrome: true },
  },
  {
    // The AdminConsole shell owns the tab strip + auth gate; tabs are children.
    path: 'admin',
    loadComponent: () => import('./admin/admin-console').then((m) => m.AdminConsole),
    title: 'Admin — Riviera',
    // Admin surface: the shared operator header/footer, never the tourist ones.
    data: { operatorChrome: true },
    children: adminTabRoutes,
  },
  {
    // Chromeless operator console: the shell suppresses its own chrome via `data.operatorConsole`; tabs are children.
    path: 'operator/:venueId',
    loadComponent: () => import('./operator/operator-console').then((m) => m.OperatorConsole),
    title: 'Operator console — Riviera',
    data: { operatorConsole: true },
    canActivate: [operatorSessionGuard],
    children: [{ path: '', pathMatch: 'full', redirectTo: 'beach-map' }, ...consoleTabRoutes],
  },
  {
    // Restyled to Liquid Glass — no compat surface.
    path: 'venues/:id',
    loadComponent: () => import('./venue/venue-map').then((m) => m.VenueMap),
    title: 'Beach map — Riviera',
  },
  {
    // Restyled to Liquid Glass — no compat surface.
    path: 'booking/confirmation',
    loadComponent: () =>
      import('./booking/booking-confirmation').then((m) => m.BookingConfirmation),
    title: 'Booking confirmed — Riviera',
  },
  {
    // Restyled to Liquid Glass — no compat surface.
    path: 'booking/pay',
    loadComponent: () => import('./booking/booking-pay').then((m) => m.BookingPay),
    title: 'Complete payment — Riviera',
  },
  {
    // Restyled to Liquid Glass. Static segment — must stay above 'booking/:code'.
    path: 'booking/requested',
    loadComponent: () =>
      import('./booking/request-confirmation').then((m) => m.RequestConfirmation),
    title: 'Request sent — Riviera',
  },
  {
    // Restyled to Liquid Glass — no compat surface.
    path: 'booking/:code',
    loadComponent: () => import('./booking/booking-view').then((m) => m.BookingView),
    title: 'Your booking — Riviera',
  },
];
