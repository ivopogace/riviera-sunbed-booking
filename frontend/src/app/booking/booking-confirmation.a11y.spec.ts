import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { BookingConfirmation as Confirmation } from './booking.model';
import { BookingConfirmation } from './booking-confirmation';
import { BookingService } from './booking.service';

const CONFIRMATION: Confirmation = {
  code: 'ABCD234567',
  status: 'CONFIRMED',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  setId: 2,
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
};

/** A BookingService stub exposing a fixed last-confirmation (the component only reads that). */
function stubService(confirmation: Confirmation | undefined): Partial<BookingService> {
  return { lastConfirmation: (() => confirmation) as BookingService['lastConfirmation'] };
}

describe('BookingConfirmation accessibility (axe)', () => {
  async function render(confirmation: Confirmation | undefined): Promise<ComponentFixture<BookingConfirmation>> {
    await TestBed.configureTestingModule({
      imports: [BookingConfirmation],
      providers: [provideRouter([]), { provide: BookingService, useValue: stubService(confirmation) }],
    }).compileComponents();
    const fixture = TestBed.createComponent(BookingConfirmation);
    await fixture.whenStable();
    return fixture;
  }

  it('renders the code and has no violations', async () => {
    const fixture = await render(CONFIRMATION);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="booking-code"]')?.textContent).toContain('ABCD234567');
    await expectNoAxeViolations(host);
  });

  it('has no violations in the empty (no-confirmation) state', async () => {
    const fixture = await render(undefined);
    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });
});
