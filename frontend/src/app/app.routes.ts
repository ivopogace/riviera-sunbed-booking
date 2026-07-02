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
    path: 'booking/:code',
    loadComponent: () => import('./booking/booking-view').then((m) => m.BookingView),
    title: 'Your booking — Riviera',
    data: { legacySurface: true },
  },
];
