import { Routes } from '@angular/router';

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
    path: 'venue-admin',
    loadComponent: () => import('./venue-admin/venue-editor').then((m) => m.VenueEditor),
    title: 'Venue editor — Riviera',
    data: { legacySurface: true },
  },
  {
    path: 'venue-admin/daily/:venueId',
    loadComponent: () => import('./staff/staff-daily').then((m) => m.StaffDaily),
    title: 'Daily view — Riviera',
    data: { legacySurface: true },
  },
  {
    // Liquid Glass operator console (epic #141, foundation slice O1 #170). Chromeless: the tourist
    // shell (app.ts) suppresses its own header/footer here via `data.operatorConsole`, so the
    // console owns a full-bleed porcelain surface. Each tab is a child route; O1 ships placeholders
    // that the O3–O8 slices swap for the restyled tab. The legacy /venue-admin routes above stay.
    path: 'operator/:venueId',
    loadComponent: () => import('./operator/operator-console').then((m) => m.OperatorConsole),
    title: 'Operator console — Riviera',
    data: { operatorConsole: true },
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'beach-map' },
      {
        path: 'beach-map',
        loadComponent: () =>
          import('./operator/console-placeholder').then((m) => m.ConsolePlaceholder),
        title: 'Beach map — Operator console',
        data: { tab: 'beach-map' },
      },
      {
        path: 'pricing',
        loadComponent: () =>
          import('./operator/console-placeholder').then((m) => m.ConsolePlaceholder),
        title: 'Pricing — Operator console',
        data: { tab: 'pricing' },
      },
      {
        path: 'daily',
        loadComponent: () =>
          import('./operator/console-placeholder').then((m) => m.ConsolePlaceholder),
        title: 'Daily view — Operator console',
        data: { tab: 'daily' },
      },
      {
        path: 'requests',
        loadComponent: () =>
          import('./operator/console-placeholder').then((m) => m.ConsolePlaceholder),
        title: 'Requests — Operator console',
        data: { tab: 'requests' },
      },
      {
        path: 'payouts',
        loadComponent: () =>
          import('./operator/console-placeholder').then((m) => m.ConsolePlaceholder),
        title: 'Payouts — Operator console',
        data: { tab: 'payouts' },
      },
      {
        path: 'venue',
        loadComponent: () =>
          import('./operator/console-placeholder').then((m) => m.ConsolePlaceholder),
        title: 'Venue & commodities — Operator console',
        data: { tab: 'venue' },
      },
    ],
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
