import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../environments/environment';
import { CreateBookingRequest } from './booking.model';
import { BookingConfirmation } from './booking-confirmation';
import { BookingService } from './booking.service';
import { VenuePin } from './venue-pin';
import { VenueLocation } from '../shared/venue-views';

const REQUEST: CreateBookingRequest = {
  setId: 2,
  bookingDate: '2026-12-01',
  contact: { email: 'a@b.com', fullName: 'Ana', phone: '+355600' },
};

const SUMMARY = {
  code: 'ABCD234567',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  setId: 2,
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  confirmationMail: 'UNDISCLOSED',
};

/** The booked venue's pin the Directions row reads; none unless a test sets it. */
const venuePin = signal<VenueLocation | null>(null);

const CREATE_URL = `${environment.apiBaseUrl}/api/bookings`;

function render(): { fixture: ComponentFixture<BookingConfirmation>; host: HTMLElement } {
  const fixture = TestBed.createComponent(BookingConfirmation);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement };
}

describe('BookingConfirmation', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: VenuePin, useValue: { locationOf: () => venuePin.asReadonly() } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    venuePin.set(null);
  });

  describe('venue link and directions (#1738)', () => {
    function confirm(body: object = {}): HTMLElement {
      TestBed.inject(BookingService).createBooking(REQUEST).subscribe();
      httpMock
        .expectOne(CREATE_URL)
        .flush(
          { ...SUMMARY, status: 'CONFIRMED', ...body },
          { status: 201, statusText: 'Created' },
        );
      return render().host;
    }

    it('links the venue name to its beach map on the booked date, never carrying the code', () => {
      const venue = confirm().querySelector('[data-testid="venue-link"]');
      expect(venue?.textContent?.trim()).toBe('Miramar Beach Club');
      expect(venue?.getAttribute('href')).toBe('/venues/1?date=2026-12-01');
      expect(venue?.getAttribute('href')).not.toContain(SUMMARY.code);
    });

    it('opens a stay on its first day', () => {
      const host = confirm({ lastDate: '2026-12-03' });
      expect(host.querySelector('[data-testid="venue-link"]')?.getAttribute('href')).toBe(
        '/venues/1?date=2026-12-01',
      );
    });

    it('offers Directions to the pin in a new tab when the venue has one', () => {
      venuePin.set({ latitude: 39.774531, longitude: 19.998412 });
      const directions = confirm().querySelector('[data-testid="venue-directions"]');
      expect(directions?.getAttribute('href')).toBe(
        'https://www.google.com/maps/dir/?api=1&destination=39.774531,19.998412',
      );
      expect(directions?.getAttribute('target')).toBe('_blank');
      expect(directions?.getAttribute('href')).not.toContain(SUMMARY.code);
    });

    it('renders no Directions row for a venue with no pin', () => {
      expect(confirm().querySelector('[data-testid="directions-row"]')).toBeNull();
    });
  });

  it('renders the confirmed booking when the booking is CONFIRMED', () => {
    TestBed.inject(BookingService).createBooking(REQUEST).subscribe();
    httpMock
      .expectOne(CREATE_URL)
      .flush({ ...SUMMARY, status: 'CONFIRMED' }, { status: 201, statusText: 'Created' });

    const { host } = render();
    expect(host.querySelector('[data-testid="booking-code"]')?.textContent).toContain('ABCD234567');
    expect(host.querySelector('h1')?.textContent).toMatch(/You.re booked/); // confirmed card copy
  });

  it('reads a stay as its range with the day count', () => {
    const bookings = TestBed.inject(BookingService);
    bookings.createBooking(REQUEST).subscribe();
    httpMock.expectOne(CREATE_URL).flush(
      {
        ...SUMMARY,
        status: 'CONFIRMED',
        lastDate: '2026-12-03',
        amount: { minorUnits: 13500, currency: 'EUR' },
      },
      { status: 201, statusText: 'Created' },
    );
    const { host } = render();

    expect(host.textContent).toContain('3 days');
    expect(host.textContent).toContain('€135');
  });

  it('tells a reader who is not the verified owner only that a mail is on its way (#1748)', () => {
    TestBed.inject(BookingService).createBooking(REQUEST).subscribe();
    httpMock
      .expectOne(CREATE_URL)
      .flush({ ...SUMMARY, status: 'CONFIRMED' }, { status: 201, statusText: 'Created' });

    const { host } = render();
    const code = host.querySelector('[data-testid="booking-code"]');
    expect(code?.textContent).toContain('Keep this code in case it doesn’t arrive.');
    expect(code?.textContent).not.toContain('emailed it to you');
    expect(host.querySelector('[data-testid="email-withheld"]')).toBeNull();
  });

  it('keeps the emailed-it copy for the verified owner of a deliverable address', () => {
    TestBed.inject(BookingService).createBooking(REQUEST).subscribe();
    httpMock
      .expectOne(CREATE_URL)
      .flush(
        { ...SUMMARY, status: 'CONFIRMED', confirmationMail: 'EMAILED' },
        { status: 201, statusText: 'Created' },
      );

    const { host } = render();
    expect(host.querySelector('[data-testid="booking-code"]')?.textContent).toContain(
      'We’ve also emailed it to you.',
    );
    expect(host.querySelector('[data-testid="email-withheld"]')).toBeNull();
  });

  it('shows the withheld-email notice and drops the emailed-it claim (#390)', () => {
    TestBed.inject(BookingService).createBooking(REQUEST).subscribe();
    httpMock
      .expectOne(CREATE_URL)
      .flush(
        { ...SUMMARY, status: 'CONFIRMED', confirmationMail: 'WITHHELD' },
        { status: 201, statusText: 'Created' },
      );

    const { host } = render();
    const notice = host.querySelector('[data-testid="email-withheld"]');
    expect(notice?.textContent).toContain('We couldn’t email you.');
    // The page must not promise a mail that was never sent.
    expect(host.querySelector('[data-testid="booking-code"]')?.textContent).not.toContain(
      'emailed it to you',
    );
    // The code itself is still the point of the screen.
    expect(host.querySelector('[data-testid="booking-code"]')?.textContent).toContain('ABCD234567');
  });

  it('does NOT render an AWAITING_PAYMENT booking as paid (invariant #8 guard)', () => {
    // A non-CONFIRMED booking must never surface on the "Paid" confirmation screen.
    TestBed.inject(BookingService).createBooking(REQUEST).subscribe();
    httpMock
      .expectOne(CREATE_URL)
      .flush({ ...SUMMARY, status: 'AWAITING_PAYMENT' }, { status: 200, statusText: 'OK' });

    const { host } = render();
    expect(host.querySelector('[data-testid="booking-code"]')).toBeNull();
    expect(host.querySelector('h1')?.textContent).toContain('No booking to show');
  });
});
