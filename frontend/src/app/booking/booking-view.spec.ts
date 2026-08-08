import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { expectNoAxeViolations } from '../../testing/axe';
import {
  BookingDetail,
  BookingStatus,
  Cancellation,
  PaymentHandoff,
  Withdrawal,
} from './booking.model';
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
  withdrawable: false,
  beforeCutoff: true,
  refundIfCancelledNow: { minorUnits: 4500, currency: 'EUR' },
  refundedAmount: null,
  requestExpiresAt: null,
  payment: null,
  emailWithheld: false,
};

const WITHDRAWAL: Withdrawal = { code: 'ABCD234567', status: 'WITHDRAWN' };

/** A PENDING_REQUEST detail the guest may still retract. */
const PENDING: BookingDetail = {
  ...DETAIL,
  status: 'PENDING_REQUEST',
  cancellable: false,
  withdrawable: true,
  // 16:00Z on a CET (winter, UTC+1) date -> 17:00 Europe/Tirane wall clock.
  requestExpiresAt: '2026-11-30T16:00:00Z',
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
  /** Served on the reload after a successful cancel (mirrors the backend returning CANCELLED). */
  detailAfterCancel?: BookingDetail;
  getError?: unknown;
  cancel?: Cancellation;
  cancelError?: unknown;
  cancelCalls?: string[];
  withdrawCalls?: string[];
  withdrawError?: unknown;
  handoffs?: PaymentHandoff[];
  /** A primed detail (find-a-booking hand-off); consumed one-shot for the matching code. */
  prefetched?: BookingDetail;
}): Partial<BookingService> {
  let served = 0;
  let prefetched = opts.prefetched;
  return {
    getByCode: () => {
      const detail = served++ === 0 ? opts.detail! : (opts.detailAfterCancel ?? opts.detail!);
      return (opts.getError ? throwError(() => opts.getError) : of(detail)) as Observable<BookingDetail>;
    },
    cancel: (code: string) => {
      opts.cancelCalls?.push(code);
      return (
        opts.cancelError ? throwError(() => opts.cancelError) : of(opts.cancel ?? CANCELLATION)
      ) as Observable<Cancellation>;
    },
    withdraw: (code: string) => {
      opts.withdrawCalls?.push(code);
      return (
        opts.withdrawError ? throwError(() => opts.withdrawError) : of(WITHDRAWAL)
      ) as Observable<Withdrawal>;
    },
    beginPayment: (handoff: PaymentHandoff) => {
      opts.handoffs?.push(handoff);
    },
    takePrefetched: (code: string) => {
      if (prefetched?.code === code) {
        const detail = prefetched;
        prefetched = undefined;
        return detail;
      }
      return undefined;
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
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap({ code }) },
          paramMap: of(convertToParamMap({ code })),
        },
      },
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

  it('moves focus to the destructive confirm button when the cancel prompt appears', async () => {
    // Twin of the withdraw focus test — the component claims this for BOTH prompts.
    const fixture = await render(stubService({ detail: DETAIL }));
    const host = fixture.nativeElement as HTMLElement;

    (host.querySelector('[data-testid="start-cancel"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.activeElement).toBe(host.querySelector('[data-testid="confirm-cancel"]'));
  });

  it('shows a not-found message for an unknown code', async () => {
    const fixture = await render(stubService({ getError: { status: 404 } }));
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).toContain('Booking not found');
    await expectNoAxeViolations(host);
  });

  it('shows the waiting state and the Tirane-zone deadline for a PENDING_REQUEST booking', async () => {
    const fixture = await render(stubService({ detail: PENDING }));
    const host = fixture.nativeElement as HTMLElement;

    const panel = host.querySelector('[data-testid="request-pending"]');
    expect(panel?.textContent).toContain('Waiting for the venue');
    expect(panel?.textContent).toContain('17:00');
    expect(host.querySelector('[data-testid="pay-now"]')).toBeNull();
    // Cancel is for a CONFIRMED booking; a pending request is retracted, not cancelled.
    expect(host.querySelector('[data-testid="start-cancel"]')).toBeNull();
    expect(host.querySelector('[data-testid="withdraw-request"]')).not.toBeNull();
    await expectNoAxeViolations(host);
  });

  it('withdraws a pending request after confirmation and flips the chip', async () => {
    const withdrawCalls: string[] = [];
    const fixture = await render(
      stubService({
        detail: PENDING,
        detailAfterCancel: { ...PENDING, status: 'WITHDRAWN', withdrawable: false },
        withdrawCalls,
      }),
    );
    const host = fixture.nativeElement as HTMLElement;

    (host.querySelector('[data-testid="withdraw-request"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (host.querySelector('[data-testid="confirm-withdraw"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(withdrawCalls).toEqual(['ABCD234567']);
    expect(host.querySelector('[data-testid="booking-status"]')?.textContent?.trim()).toBe(
      'Withdrawn',
    );
    await expectNoAxeViolations(host);
  });

  it('keeps the withdrawal confirmation visible after the status flips to WITHDRAWN', async () => {
    // The live region must survive the post-withdraw reload: the guest reads the outcome AFTER the
    // status changes, and an aria-live node that unmounts on success announces nothing durable.
    const fixture = await render(
      stubService({
        detail: PENDING,
        detailAfterCancel: { ...PENDING, status: 'WITHDRAWN', withdrawable: false },
      }),
    );
    const host = fixture.nativeElement as HTMLElement;

    (host.querySelector('[data-testid="withdraw-request"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (host.querySelector('[data-testid="confirm-withdraw"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="withdraw-result"]')?.textContent).toContain(
      'Request withdrawn',
    );
    // ...and the terminal state explains itself, like DECLINED and EXPIRED do.
    expect(host.querySelector('[data-testid="request-withdrawn"]')?.textContent).toContain(
      'haven’t been charged',
    );
    await expectNoAxeViolations(host);
  });

  it('moves focus to the destructive confirm button when the withdraw prompt appears', async () => {
    // The component claims this as an a11y behaviour; without a test the claim is unverified.
    const fixture = await render(stubService({ detail: PENDING }));
    const host = fixture.nativeElement as HTMLElement;

    (host.querySelector('[data-testid="withdraw-request"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.activeElement).toBe(host.querySelector('[data-testid="confirm-withdraw"]'));
  });

  it('asks before withdrawing, and "Keep request" backs out without calling the API', async () => {
    const withdrawCalls: string[] = [];
    const fixture = await render(stubService({ detail: PENDING, withdrawCalls }));
    const host = fixture.nativeElement as HTMLElement;

    (host.querySelector('[data-testid="withdraw-request"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.textContent).toContain('Withdraw this request?');

    const keep = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Keep request'),
    ) as HTMLButtonElement;
    keep.click();
    fixture.detectChanges();

    expect(withdrawCalls).toEqual([]);
    expect(host.querySelector('[data-testid="withdraw-request"]')).not.toBeNull();
  });

  it('keeps the request on screen and explains when the withdraw fails', async () => {
    const fixture = await render(
      stubService({ detail: PENDING, withdrawError: { status: 409 } }),
    );
    const host = fixture.nativeElement as HTMLElement;

    (host.querySelector('[data-testid="withdraw-request"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (host.querySelector('[data-testid="confirm-withdraw"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="withdraw-result"]')?.textContent).toContain(
      'couldn’t withdraw',
    );
    expect(host.querySelector('[data-testid="request-pending"]')).not.toBeNull();
  });

  it('renders no withdraw control when the server says the request is not withdrawable', async () => {
    // The server owns the rule — the template gates on `withdrawable`, never on the status.
    const fixture = await render(
      stubService({ detail: { ...PENDING, withdrawable: false } }),
    );
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="request-pending"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="withdraw-request"]')).toBeNull();
  });

  // The unified status chip renders the design label for the whole booking-status union — one header chip carrying `booking-status`, replacing the old dl "Status" row.
  it.each<[BookingStatus, string]>([
    ['CONFIRMED', 'Confirmed'],
    ['PENDING_REQUEST', 'Pending request'],
    ['AWAITING_PAYMENT', 'Awaiting payment'],
    ['DECLINED', 'Declined'],
    ['EXPIRED', 'Expired'],
    ['CANCELLED', 'Cancelled'],
    ['COMPLETED', 'Completed'],
    ['NO_SHOW', 'No-show'],
  ])('renders the %s status as the "%s" chip', async (status, label) => {
    const fixture = await render(
      stubService({ detail: { ...DETAIL, status, cancellable: false } }),
    );
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="booking-status"]')?.textContent?.trim()).toBe(label);
  });

  // The window can close between render and confirm; retrying then can never succeed.
  it('explains a closed window and withdraws the cancel affordance instead of inviting a retry', async () => {
    const closed: BookingDetail = {
      ...DETAIL,
      cancellable: false,
      beforeCutoff: false,
      refundIfCancelledNow: { minorUnits: 0, currency: 'EUR' },
    };
    const fixture = await render(
      stubService({
        detail: DETAIL,
        detailAfterCancel: closed,
        cancelError: new HttpErrorResponse({
          status: 409,
          error: { code: 'CANCELLATION_WINDOW_CLOSED' },
        }),
      }),
    );
    const host = fixture.nativeElement as HTMLElement;

    (host.querySelector('[data-testid="start-cancel"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (host.querySelector('[data-testid="confirm-cancel"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="cancel-result"]')?.textContent).toContain(
      'no longer be cancelled',
    );
    expect(host.querySelector('[data-testid="cancel-result"]')?.textContent).not.toContain(
      'try again',
    );
    expect(host.querySelector('[data-testid="start-cancel"]')).toBeNull();
  });

  // A CONFIRMED booking past its service day: the server closes the window, so the affordance goes.
  it('offers no cancel affordance when the server says a confirmed booking is not cancellable', async () => {
    const fixture = await render(
      stubService({
        detail: {
          ...DETAIL,
          cancellable: false,
          beforeCutoff: false,
          refundIfCancelledNow: { minorUnits: 0, currency: 'EUR' },
        },
      }),
    );
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="start-cancel"]')).toBeNull();
    expect(host.querySelector('[data-testid="refund-terms"]')).toBeNull();
    expect(host.querySelector('[data-testid="booking-status"]')?.textContent?.trim()).toBe(
      'Confirmed',
    );
  });

  it('flips the chip to Cancelled and shows the refunded row after cancelling (no reload)', async () => {
    // The post-cancel reload returns the backend's CANCELLED detail (refunded amount set).
    const cancelled: BookingDetail = {
      ...DETAIL,
      status: 'CANCELLED',
      cancellable: false,
      refundedAmount: { minorUnits: 4500, currency: 'EUR' },
    };
    const fixture = await render(stubService({ detail: DETAIL, detailAfterCancel: cancelled }));
    const host = fixture.nativeElement as HTMLElement;

    (host.querySelector('[data-testid="start-cancel"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (host.querySelector('[data-testid="confirm-cancel"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="booking-status"]')?.textContent?.trim()).toBe('Cancelled');
    expect(host.querySelector('[data-testid="refunded-amount"]')?.textContent).toContain('45');
    expect(host.querySelector('[data-testid="cancel-result"]')?.textContent).toContain('refunded');
    // The cancel action is gone once cancelled.
    expect(host.querySelector('[data-testid="start-cancel"]')).toBeNull();
  });

  it('shows the Refunded row for a CANCELLED booking the server reports a refund for', async () => {
    const fixture = await render(
      stubService({
        detail: {
          ...DETAIL,
          status: 'CANCELLED',
          cancellable: false,
          refundedAmount: { minorUnits: 4500, currency: 'EUR' },
        },
      }),
    );
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="refunded-amount"]')?.textContent).toContain('45');
    await expectNoAxeViolations(host);
  });

  it('omits the Refunded row when the server reports no refund', async () => {
    const fixture = await render(
      stubService({
        detail: { ...DETAIL, status: 'CANCELLED', cancellable: false, refundedAmount: null },
      }),
    );
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="refunded-amount"]')).toBeNull();
  });

  it('shows neutral resume copy for an unpaid instant booking (never "request accepted")', async () => {
    const fixture = await render(
      stubService({
        detail: {
          ...DETAIL,
          status: 'AWAITING_PAYMENT',
          cancellable: false,
          requestExpiresAt: null,
          payment: { clientSecret: 'pi_8_secret_y', paymentIntentId: 'pi_8' },
        },
      }),
    );
    const host = fixture.nativeElement as HTMLElement;

    const panel = host.querySelector('[data-testid="request-accepted"]');
    expect(panel?.textContent).toContain('Complete your payment');
    expect(panel?.textContent).not.toContain('accepted your booking request');
    expect(host.querySelector('[data-testid="pay-now"]')).not.toBeNull();
  });

  it('offers Pay now on an accepted request and hands the open intent to the pay route', async () => {
    const handoffs: PaymentHandoff[] = [];
    const fixture = await render(
      stubService({
        detail: {
          ...DETAIL,
          status: 'AWAITING_PAYMENT',
          cancellable: false,
          // A real accepted request carries its (historical) response deadline — the view uses
          // it to tell "request accepted" apart from an instant checkout being resumed.
          requestExpiresAt: '2026-11-30T16:00:00Z',
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

  // A status outside the booking-status union (FE deployed before a new backend lifecycle state) must degrade to a humanized label, not throw in the STATUS_META lookup.
  it('renders an unmapped status gracefully instead of crashing (FE/BE skew)', async () => {
    const fixture = await render(
      stubService({ detail: { ...DETAIL, status: 'ON_HOLD' as BookingStatus, cancellable: false } }),
    );
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="booking-status"]')?.textContent?.trim()).toBe('On hold');
    // Unknown status must not claim money moved: the amount row falls back to "Amount".
    expect(host.textContent).toContain('Amount');
  });

  // A failed post-cancel reload must NOT hide the confirmed cancellation.
  it('keeps the cancellation confirmation when the post-cancel reload fails', async () => {
    let calls = 0;
    const service: Partial<BookingService> = {
      getByCode: () =>
        (calls++ === 0 ? of(DETAIL) : throwError(() => ({ status: 500 }))) as Observable<BookingDetail>,
      cancel: () => of(CANCELLATION),
      beginPayment: () => undefined,
      takePrefetched: () => undefined,
    };
    const fixture = await render(service);
    const host = fixture.nativeElement as HTMLElement;

    (host.querySelector('[data-testid="start-cancel"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (host.querySelector('[data-testid="confirm-cancel"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="cancel-result"]')?.textContent).toContain('refunded');
    expect(host.textContent).not.toContain('Something went wrong');
    expect(host.textContent).not.toContain('Couldn’t load your booking');
  });

  // The status chip carries a programmatic "status" label (the old dl row's context).
  it('gives the status chip a visually-hidden "Booking status" label (a11y)', async () => {
    const fixture = await render(stubService({ detail: DETAIL }));
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).toContain('Booking status');
    // The chip's own text stays exactly the label (testid contract preserved).
    expect(host.querySelector('[data-testid="booking-status"]')?.textContent?.trim()).toBe('Confirmed');
  });

  // The celebratory emoji is decorative (aria-hidden), not part of the heading name.
  it('marks the celebratory emoji decorative in the accepted banner (a11y)', async () => {
    const fixture = await render(
      stubService({
        detail: {
          ...DETAIL,
          status: 'AWAITING_PAYMENT',
          cancellable: false,
          requestExpiresAt: '2026-11-30T16:00:00Z',
          payment: { clientSecret: 'pi_secret', paymentIntentId: 'pi_1' },
        },
      }),
    );
    const host = fixture.nativeElement as HTMLElement;

    const hidden = host.querySelector('[data-testid="request-accepted"] [aria-hidden="true"]');
    expect(hidden?.textContent).toContain('🎉');
    expect(host.querySelector('[data-testid="request-accepted"]')?.textContent).toContain('Request accepted');
    await expectNoAxeViolations(host);
  });

  // A find-a-booking hand-off primes the detail, so the initial load renders it WITHOUT a second GET /api/bookings/{code} (two GETs per success can approach the rate-limit ceiling).
  it('renders a prefetched detail for the matching code without fetching (#168)', async () => {
    const getByCode = vi.fn(() => of(DETAIL) as Observable<BookingDetail>);
    let prefetched: BookingDetail | undefined = DETAIL;
    const service: Partial<BookingService> = {
      getByCode,
      cancel: () => of(CANCELLATION),
      beginPayment: () => undefined,
      takePrefetched: (code: string) => {
        if (prefetched?.code === code) {
          const d = prefetched;
          prefetched = undefined;
          return d;
        }
        return undefined;
      },
    };
    const fixture = await render(service);
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="booking-code"]')?.textContent).toContain('ABCD234567');
    expect(getByCode).not.toHaveBeenCalled();
  });

  it('falls back to fetching when nothing is prefetched (deep-link / refresh, #168)', async () => {
    const getByCode = vi.fn(() => of(DETAIL) as Observable<BookingDetail>);
    const service: Partial<BookingService> = {
      getByCode,
      cancel: () => of(CANCELLATION),
      beginPayment: () => undefined,
      takePrefetched: () => undefined,
    };
    const fixture = await render(service);
    const host = fixture.nativeElement as HTMLElement;

    expect(getByCode).toHaveBeenCalledWith('ABCD234567');
    expect(host.querySelector('[data-testid="booking-code"]')?.textContent).toContain('ABCD234567');
  });

  // The find modal makes booking→booking navigation reachable; the view must reload on a route-code change, not reuse the instance and show the previous booking.
  it('reloads and re-renders when the route code changes (booking→booking, T8 finding [0])', async () => {
    const detailA: BookingDetail = { ...DETAIL, code: 'AAAAAAAAAA', venueName: 'Venue Alpha' };
    const detailB: BookingDetail = { ...DETAIL, code: 'BBBBBBBBBB', venueName: 'Venue Beta' };
    const paramMap$ = new BehaviorSubject(convertToParamMap({ code: 'AAAAAAAAAA' }));
    const service: Partial<BookingService> = {
      getByCode: (code: string) =>
        of(code === 'AAAAAAAAAA' ? detailA : detailB) as Observable<BookingDetail>,
      cancel: () => of(CANCELLATION),
      beginPayment: () => undefined,
      takePrefetched: () => undefined,
    };
    await TestBed.configureTestingModule({
      imports: [BookingView],
      providers: [
        provideRouter([]),
        { provide: BookingService, useValue: service },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: paramMap$.value }, paramMap: paramMap$ },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(BookingView);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="booking-code"]')?.textContent).toContain('AAAAAAAAAA');
    expect(host.textContent).toContain('Venue Alpha');

    // Reuse the instance, change only the param (what Angular's default RouteReuseStrategy does).
    paramMap$.next(convertToParamMap({ code: 'BBBBBBBBBB' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="booking-code"]')?.textContent).toContain('BBBBBBBBBB');
    expect(host.textContent).toContain('Venue Beta');
    expect(host.textContent).not.toContain('Venue Alpha');
  });
});
