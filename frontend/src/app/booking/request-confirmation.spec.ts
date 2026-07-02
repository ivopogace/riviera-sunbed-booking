import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../environments/environment';
import { expectNoAxeViolations } from '../../testing/axe';
import { CreateBookingRequest } from './booking.model';
import { RequestConfirmation } from './request-confirmation';
import { BookingService } from './booking.service';

const REQUEST: CreateBookingRequest = {
  setId: 2,
  bookingDate: '2026-12-01',
  contact: { email: 'a@b.com', fullName: 'Ana', phone: '+355600' },
};

const REQUESTED = {
  code: 'RQST234567',
  status: 'PENDING_REQUEST',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  setId: 2,
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  // 16:00Z on a CET (winter, UTC+1) date → 17:00 Europe/Tirane wall clock.
  requestExpiresAt: '2026-11-30T16:00:00Z',
};

const CREATE_URL = `${environment.apiBaseUrl}/api/bookings`;

function render(): { fixture: ComponentFixture<RequestConfirmation>; host: HTMLElement } {
  const fixture = TestBed.createComponent(RequestConfirmation);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement };
}

describe('RequestConfirmation', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('renders the pending request: code, Tirane-zone deadline, amount and status link', async () => {
    TestBed.inject(BookingService).createBooking(REQUEST).subscribe();
    httpMock.expectOne(CREATE_URL).flush(REQUESTED, { status: 202, statusText: 'Accepted' });

    const { host } = render();
    expect(host.querySelector('h1')?.textContent).toContain('Request sent');
    expect(host.querySelector('[data-testid="booking-code"]')?.textContent).toContain('RQST234567');
    expect(host.querySelector('[data-testid="request-deadline"]')?.textContent).toContain('17:00');
    expect(host.textContent).toContain('you’ll only pay if the venue accepts');
    expect(
      host.querySelector('[data-testid="status-link"]')?.getAttribute('href'),
    ).toContain('/booking/RQST234567');
    await expectNoAxeViolations(host);
  });

  it('does NOT render a non-pending hand-off as a sent request (belt-and-braces)', () => {
    TestBed.inject(BookingService).createBooking(REQUEST).subscribe();
    httpMock
      .expectOne(CREATE_URL)
      .flush({ ...REQUESTED, status: 'CONFIRMED' }, { status: 201, statusText: 'Created' });

    const { host } = render();
    expect(host.querySelector('[data-testid="booking-code"]')).toBeNull();
    expect(host.querySelector('h1')?.textContent).toContain('No request to show');
  });

  it('shows the start-over state on a cold load with no hand-off', async () => {
    const { host } = render();
    expect(host.querySelector('h1')?.textContent).toContain('No request to show');
    await expectNoAxeViolations(host);
  });
});
