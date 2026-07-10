import { Routes } from '@angular/router';

// The still-placeholder operator-console tab child routes (issue #170), built from one factory so the
// near-identical entries aren't duplicated. Each hosts the placeholder until its O3–O8 restyle slice
// swaps the component in; `data.tab` tells the placeholder which section it is. `beach-map` has
// graduated to its real editor (O3 #172) and is declared explicitly below.
const CONSOLE_TABS: readonly (readonly [string, string])[] = [
  ['payouts', 'Payouts'],
  ['venue', 'Venue & commodities'],
];

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
  ...CONSOLE_TABS.map(([path, label]) => ({
    path,
    loadComponent: () => import('./operator/console-placeholder').then((m) => m.ConsolePlaceholder),
    title: `${label} — Operator console`,
    data: { tab: path },
  })),
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
    // The last legacy operator surface: onboarding + venue editing (O8 restyles it as the console's
    // Venue & commodities tab). O6 (#176) retired the sibling StaffDaily page when the Requests +
    // Daily-view tabs replaced its last jobs.
    path: 'venue-admin',
    loadComponent: () => import('./venue-admin/venue-editor').then((m) => m.VenueEditor),
    title: 'Venue editor — Riviera',
    data: { legacySurface: true },
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
