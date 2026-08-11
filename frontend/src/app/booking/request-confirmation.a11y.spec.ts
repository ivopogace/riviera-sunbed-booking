import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { RequestedBooking } from './booking.model';
import { RequestConfirmation } from './request-confirmation';
import { BookingService } from './booking.service';

const REQUESTED: RequestedBooking = {
  code: 'RQST234567',
  status: 'PENDING_REQUEST',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  setId: 2,
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  requestExpiresAt: '2026-11-30T16:00:00Z',
};

/** A BookingService stub exposing a fixed last-requested (the component only reads that). */
function stubService(requested: RequestedBooking | undefined): Partial<BookingService> {
  return { lastRequested: (() => requested) as BookingService['lastRequested'] };
}

describe('RequestConfirmation accessibility (axe)', () => {
  async function render(
    requested: RequestedBooking | undefined,
  ): Promise<ComponentFixture<RequestConfirmation>> {
    await TestBed.configureTestingModule({
      imports: [RequestConfirmation],
      providers: [provideRouter([]), { provide: BookingService, useValue: stubService(requested) }],
    }).compileComponents();
    const fixture = TestBed.createComponent(RequestConfirmation);
    await fixture.whenStable();
    return fixture;
  }

  it('renders the request reference and has no violations', async () => {
    const fixture = await render(REQUESTED);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="booking-code"]')?.textContent).toContain('RQST234567');
    expect(host.querySelector('[data-testid="request-deadline"]')?.textContent).toContain('17:00');
    await expectNoAxeViolations(host);
  });

  it('has no violations in the empty (no-request) state', async () => {
    const fixture = await render(undefined);
    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });
});
