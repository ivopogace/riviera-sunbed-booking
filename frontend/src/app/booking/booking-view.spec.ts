import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { expectNoAxeViolations } from '../../testing/axe';
import { BookingDetail, Cancellation } from './booking.model';
import { BookingView } from './booking-view';
import { BookingService } from './booking.service';

const DETAIL: BookingDetail = {
  code: 'ABCD234567',
  status: 'CONFIRMED',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  cancellable: true,
  beforeCutoff: true,
  refundIfCancelledNow: { minorUnits: 4500, currency: 'EUR' },
  refundedAmount: null,
};

const CANCELLATION: Cancellation = {
  code: 'ABCD234567',
  status: 'CANCELLED',
  refund: { minorUnits: 4500, currency: 'EUR' },
  tier: 'FULL',
};

/** A BookingService stub with configurable getByCode / cancel and a call spy. */
function stubService(opts: {
  detail?: BookingDetail;
  getError?: unknown;
  cancel?: Cancellation;
  cancelCalls?: string[];
}): Partial<BookingService> {
  return {
    getByCode: () =>
      (opts.getError ? throwError(() => opts.getError) : of(opts.detail!)) as Observable<BookingDetail>,
    cancel: (code: string) => {
      opts.cancelCalls?.push(code);
      return of(opts.cancel ?? CANCELLATION);
    },
  };
}

async function render(
  service: Partial<BookingService>,
  code = 'ABCD234567',
): Promise<ComponentFixture<BookingView>> {
  await TestBed.configureTestingModule({
    imports: [BookingView],
    providers: [
      provideRouter([]),
      { provide: BookingService, useValue: service },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ code }) } } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(BookingView);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('BookingView', () => {
  it('shows details and the full-refund terms, and has no axe violations', async () => {
    const fixture = await render(stubService({ detail: DETAIL }));
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="booking-code"]')?.textContent).toContain('ABCD234567');
    expect(host.querySelector('[data-testid="refund-terms"]')?.textContent).toContain('in full');
    expect(host.querySelector('[data-testid="start-cancel"]')).not.toBeNull();
    await expectNoAxeViolations(host);
  });

  it('cancels after confirmation and shows the refund result', async () => {
    const cancelCalls: string[] = [];
    const fixture = await render(stubService({ detail: DETAIL, cancelCalls }));
    const host = fixture.nativeElement as HTMLElement;

    (host.querySelector('[data-testid="start-cancel"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (host.querySelector('[data-testid="confirm-cancel"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(cancelCalls).toEqual(['ABCD234567']);
    expect(host.querySelector('[data-testid="cancel-result"]')?.textContent).toContain('refunded');
  });

  it('shows a not-found message for an unknown code', async () => {
    const fixture = await render(stubService({ getError: { status: 404 } }));
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).toContain('Booking not found');
    await expectNoAxeViolations(host);
  });
});
