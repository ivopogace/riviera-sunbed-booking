import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
    title: 'Riviera — Sunbed Booking',
  },
  {
    path: 'venue-admin',
    loadComponent: () => import('./venue-admin/venue-editor').then((m) => m.VenueEditor),
    title: 'Venue editor — Riviera',
  },
  {
    path: 'venue-admin/daily/:venueId',
    loadComponent: () => import('./staff/staff-daily').then((m) => m.StaffDaily),
    title: 'Daily view — Riviera',
  },
  {
    path: 'venues/:id',
    loadComponent: () => import('./venue/venue-map').then((m) => m.VenueMap),
    title: 'Beach map — Riviera',
  },
  {
    path: 'booking/confirmation',
    loadComponent: () =>
      import('./booking/booking-confirmation').then((m) => m.BookingConfirmation),
    title: 'Booking confirmed — Riviera',
  },
  {
    path: 'booking/pay',
    loadComponent: () => import('./booking/booking-pay').then((m) => m.BookingPay),
    title: 'Complete payment — Riviera',
  },
  {
    // Static segment — must stay above the 'booking/:code' catch-all.
    path: 'booking/requested',
    loadComponent: () =>
      import('./booking/request-confirmation').then((m) => m.RequestConfirmation),
    title: 'Request sent — Riviera',
  },
  {
    path: 'booking/:code',
    loadComponent: () => import('./booking/booking-view').then((m) => m.BookingView),
    title: 'Your booking — Riviera',
  },
];
