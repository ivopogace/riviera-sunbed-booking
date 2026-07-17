import { Routes } from '@angular/router';

// The operator-console tab child routes (issue #170). Every tab has now graduated to its real
// component (O3 beach-map through O8 venue — no placeholders remain); `data.tab` identifies the
// section. A child reads `:venueId` from the PARENT route (child routes don't inherit it under the
// router's default `emptyOnly` strategy — the O1 finding).
const consoleTabRoutes: Routes = [
  {
    // O3 (#172): the real generate-grid + paint layout editor, replacing the beach-map placeholder.
    path: 'beach-map',
    loadComponent: () => import('./operator/layout-editor').then((m) => m.LayoutEditor),
    title: 'Beach map — Operator console',
    data: { tab: 'beach-map' },
  },
  {
    // O4 (#174): the real per-row pricing tab, replacing the pricing placeholder.
    path: 'pricing',
    loadComponent: () => import('./operator/pricing-tab').then((m) => m.PricingTab),
    title: 'Pricing — Operator console',
    data: { tab: 'pricing' },
  },
  {
    // O5 (#175): the real daily view (availability grid + date + arrivals), replacing the placeholder.
    path: 'daily',
    loadComponent: () => import('./operator/daily-view-tab').then((m) => m.DailyViewTab),
    title: 'Daily view — Operator console',
    data: { tab: 'daily' },
  },
  {
    // O6 (#176): the real Request-to-Book queue (accept/decline/expired-race), replacing the placeholder.
    path: 'requests',
    loadComponent: () => import('./operator/requests-tab').then((m) => m.RequestsTab),
    title: 'Requests — Operator console',
    data: { tab: 'requests' },
  },
  {
    // O7 (#173): the real payout ledger + statement + weather refund, replacing the placeholder.
    path: 'payouts',
    loadComponent: () => import('./operator/payouts-tab').then((m) => m.PayoutsTab),
    title: 'Payouts — Operator console',
    data: { tab: 'payouts' },
  },
  {
    // O8 (#177): the real Venue & commodities tab — details form + amenity toggle-chips + photo
    // placeholders — replacing the last placeholder. Closes epic #141 and retires the legacy
    // /venue-admin in-page editor (now onboarding-only).
    path: 'venue',
    loadComponent: () => import('./operator/venue-tab').then((m) => m.VenueTab),
    title: 'Venue & commodities — Operator console',
    data: { tab: 'venue' },
  },
];

// `legacySurface: true` = pre-redesign styling: the shell wraps the route in its opaque compat
// surface until that route's Liquid Glass slice lands (epic #133 / #141), which removes the flag
// (issue #134, AC-6 — pinned by app.spec.ts).
export const routes: Routes = [
  {
    // Restyled to Liquid Glass by T2 (#135) — no compat surface.
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
    title: 'Riviera — Sunbed Booking',
  },
  {
    // Device-local guest bookings list (T6 #139) — glass from the start, no compat surface.
    path: 'my-bookings',
    loadComponent: () => import('./booking/my-bookings').then((m) => m.MyBookings),
    title: 'My bookings — Riviera',
  },
  {
    // Customer sign-in (S2 #111, epic #108) — glass from the start. `account/*` literal segments,
    // no param collision. Guest checkout is unaffected; an account is optional.
    path: 'account/sign-in',
    loadComponent: () => import('./auth/sign-in').then((m) => m.SignIn),
    title: 'Sign in — Riviera',
  },
  {
    // Customer registration (S2 #111, epic #108).
    path: 'account/register',
    loadComponent: () => import('./auth/register').then((m) => m.Register),
    title: 'Create an account — Riviera',
  },
  {
    // Forgot password → request a reset link (S8 #113). `account/*` literal segment, no param collision.
    path: 'account/forgot',
    loadComponent: () => import('./auth/forgot-password').then((m) => m.ForgotPassword),
    title: 'Reset your password — Riviera',
  },
  {
    // Reset landing (emailed link carries ?token=…) — set a new password (S8 #113).
    path: 'account/reset',
    loadComponent: () => import('./auth/reset-password').then((m) => m.ResetPassword),
    title: 'Set a new password — Riviera',
  },
  {
    // Email-verification landing (emailed link carries ?token=…) — POST-verify on load (S8 #113).
    path: 'account/verify',
    loadComponent: () => import('./auth/verify-email').then((m) => m.VerifyEmail),
    title: 'Verify your email — Riviera',
  },
  {
    // Signed-in account page: set/change password + verification resend (S8 #113, closes S4 F-1).
    path: 'account/password',
    loadComponent: () => import('./auth/set-password').then((m) => m.SetPassword),
    title: 'Your account — Riviera',
  },
  {
    // Venue onboarding (create a venue), reached from the console header. O8 (#177) retired this
    // page's in-page editing — layout/pricing/details/commodities are console tabs now — so it is no
    // longer a legacy compat surface: the `legacySurface` flag is dropped (its self-styled form
    // renders on the bare themed background). Onboarding stays here, where O1 placed it.
    path: 'venue-admin',
    loadComponent: () => import('./venue-admin/venue-editor').then((m) => m.VenueEditor),
    title: 'Create a venue — Riviera',
  },
  {
    // O6 (#176): the retired /venue-admin/daily/:venueId StaffDaily page forwards to the console's
    // Daily-view tab (param preserved), so a bookmarked daily-ops link still lands somewhere live.
    path: 'venue-admin/daily/:venueId',
    redirectTo: 'operator/:venueId/daily',
    pathMatch: 'full',
  },
  {
    // Liquid Glass operator console (epic #141, foundation slice O1 #170). Chromeless: the tourist
    // shell (app.ts) suppresses its own header/footer here via `data.operatorConsole`, so the
    // console owns a full-bleed porcelain surface. Each tab is a child route; O3–O6 have swapped the
    // real tabs in, O7–O8 remain. The legacy /venue-admin editor above stays until O8.
    path: 'operator/:venueId',
    loadComponent: () => import('./operator/operator-console').then((m) => m.OperatorConsole),
    title: 'Operator console — Riviera',
    data: { operatorConsole: true },
    children: [{ path: '', pathMatch: 'full', redirectTo: 'beach-map' }, ...consoleTabRoutes],
  },
  {
    // Restyled to Liquid Glass by T3 (#136) — no compat surface.
    path: 'venues/:id',
    loadComponent: () => import('./venue/venue-map').then((m) => m.VenueMap),
    title: 'Beach map — Riviera',
  },
  {
    // Restyled to Liquid Glass by T4 (#137) — no compat surface.
    path: 'booking/confirmation',
    loadComponent: () =>
      import('./booking/booking-confirmation').then((m) => m.BookingConfirmation),
    title: 'Booking confirmed — Riviera',
  },
  {
    // Restyled to Liquid Glass by T4 (#137) — no compat surface.
    path: 'booking/pay',
    loadComponent: () => import('./booking/booking-pay').then((m) => m.BookingPay),
    title: 'Complete payment — Riviera',
  },
  {
    // Restyled to Liquid Glass by T4 (#137). Static segment — must stay above 'booking/:code'.
    path: 'booking/requested',
    loadComponent: () =>
      import('./booking/request-confirmation').then((m) => m.RequestConfirmation),
    title: 'Request sent — Riviera',
  },
  {
    // Restyled to Liquid Glass by T5 (#138) — no compat surface.
    path: 'booking/:code',
    loadComponent: () => import('./booking/booking-view').then((m) => m.BookingView),
    title: 'Your booking — Riviera',
  },
];
