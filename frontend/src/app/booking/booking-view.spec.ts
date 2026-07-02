import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { expectNoAxeViolations } from '../../testing/axe';
import { BookingDetail, Cancellation, PaymentHandoff } from './booking.model';
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
  requestExpiresAt: null,
  payment: null,
};

const CANCELLATION: Cancellation = {
  code: 'ABCD234567',
  status: 'CANCELLED',
  refund: { minorUnits: 4500, currency: 'EUR' },
  tier: 'FULL',
};

/** A BookingService stub with configurable getByCode / cancel / beginPayment and call spies. */
function stubService(opts: {
  detail?: BookingDetail;
  getError?: unknown;
  cancel?: Cancellation;
  cancelCalls?: string[];
  handoffs?: PaymentHandoff[];
}): Partial<BookingService> {
  return {
    getByCode: () =>
      (opts.getError ? throwError(() => opts.getError) : of(opts.detail!)) as Observable<BookingDetail>,
    cancel: (code: string) => {
      opts.cancelCalls?.push(code);
      return of(opts.cancel ?? CANCELLATION);
    },
    beginPayment: (handoff: PaymentHandoff) => {
      opts.handoffs?.push(handoff);
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

  it('shows the waiting state and the Tirane-zone deadline for a PENDING_REQUEST booking', async () => {
    const fixture = await render(
      stubService({
        detail: {
          ...DETAIL,
          status: 'PENDING_REQUEST',
          cancellable: false,
          // 16:00Z on a CET (winter, UTC+1) date → 17:00 Europe/Tirane wall clock.
          requestExpiresAt: '2026-11-30T16:00:00Z',
        },
      }),
    );
    const host = fixture.nativeElement as HTMLElement;

    const panel = host.querySelector('[data-testid="request-pending"]');
    expect(panel?.textContent).toContain('Waiting for the venue');
    expect(panel?.textContent).toContain('17:00');
    expect(host.querySelector('[data-testid="pay-now"]')).toBeNull();
    expect(host.querySelector('[data-testid="start-cancel"]')).toBeNull();
    await expectNoAxeViolations(host);
  });

  it('offers Pay now on an accepted request and hands the open intent to the pay route', async () => {
    const handoffs: PaymentHandoff[] = [];
    const fixture = await render(
      stubService({
        detail: {
          ...DETAIL,
          status: 'AWAITING_PAYMENT',
          cancellable: false,
          payment: { clientSecret: 'pi_9_secret_x', paymentIntentId: 'pi_9' },
        },
        handoffs,
      }),
    );
    const host = fixture.nativeElement as HTMLElement;
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    expect(host.querySelector('[data-testid="request-accepted"]')?.textContent).toContain(
      'Request accepted',
    );
    (host.querySelector('[data-testid="pay-now"]') as HTMLButtonElement).click();

    expect(handoffs).toEqual([
      {
        code: 'ABCD234567',
        venueName: 'Miramar Beach Club',
        rowLabel: 'Front row · Sea view',
        positionNo: 2,
        bookingDate: '2026-12-01',
        amount: { minorUnits: 4500, currency: 'EUR' },
        clientSecret: 'pi_9_secret_x',
        paymentIntentId: 'pi_9',
      },
    ]);
    expect(navigate).toHaveBeenCalledWith(['/booking/pay']);
    await expectNoAxeViolations(host);
  });

  it('does not offer Pay now while AWAITING_PAYMENT without open-intent credentials', async () => {
    const fixture = await render(
      stubService({ detail: { ...DETAIL, status: 'AWAITING_PAYMENT', cancellable: false } }),
    );
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="pay-now"]')).toBeNull();
    expect(host.querySelector('[data-testid="request-accepted"]')).toBeNull();
  });

  it('shows terminal no-charge copy for a DECLINED request', async () => {
    const fixture = await render(
      stubService({ detail: { ...DETAIL, status: 'DECLINED', cancellable: false } }),
    );
    const host = fixture.nativeElement as HTMLElement;

    const panel = host.querySelector('[data-testid="request-declined"]');
    expect(panel?.textContent).toContain('Request declined');
    expect(panel?.textContent).toContain('haven’t been charged');
    expect(host.querySelector('[data-testid="pay-now"]')).toBeNull();
    await expectNoAxeViolations(host);
  });

  it('shows terminal no-charge copy for an EXPIRED request', async () => {
    const fixture = await render(
      stubService({ detail: { ...DETAIL, status: 'EXPIRED', cancellable: false } }),
    );
    const host = fixture.nativeElement as HTMLElement;

    const panel = host.querySelector('[data-testid="request-expired"]');
    expect(panel?.textContent).toContain('Request expired');
    expect(panel?.textContent).toContain('haven’t been charged');
    await expectNoAxeViolations(host);
  });
});
