import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../environments/environment';
import { CreateBookingRequest } from './booking.model';
import { BookingConfirmation } from './booking-confirmation';
import { BookingService } from './booking.service';

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
};

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
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('renders the confirmed booking when the booking is CONFIRMED', () => {
    TestBed.inject(BookingService).createBooking(REQUEST).subscribe();
    httpMock
      .expectOne(CREATE_URL)
      .flush({ ...SUMMARY, status: 'CONFIRMED' }, { status: 201, statusText: 'Created' });

    const { host } = render();
    expect(host.querySelector('[data-testid="booking-code"]')?.textContent).toContain('ABCD234567');
    expect(host.querySelector('h1')?.textContent).toContain('Booking confirmed');
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
