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
  CancelReason,
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
  refundOutstanding: false,
  requestExpiresAt: null,
  payment: null,
  emailWithheld: false,
  payWindowClosed: false,
  cancelReason: null,
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

/** A terminal CANCELLED detail as the guest arrives at it, with the refund the server stamped. */
function cancelled(reason: CancelReason | null, refundMinor: number): BookingDetail {
  return {
    ...DETAIL,
    status: 'CANCELLED',
    cancellable: false,
    refundedAmount: { minorUnits: refundMinor, currency: 'EUR' },
    cancelReason: reason,
  };
}

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
  /** Every getByCode, so a spec can assert the post-action re-read actually happened. */
  getCalls?: string[];
  withdrawCalls?: string[];
  withdrawError?: unknown;
  handoffs?: PaymentHandoff[];
  /** A primed detail (find-a-booking hand-off); consumed one-shot for the matching code. */
  prefetched?: BookingDetail;
}): Partial<BookingService> {
  let served = 0;
  let prefetched = opts.prefetched;
  return {
    getByCode: (code: string) => {
      opts.getCalls?.push(code);
      const detail = served++ === 0 ? opts.detail! : (opts.detailAfterCancel ?? opts.detail!);
      return opts.getError ? throwError(() => opts.getError) : of(detail);
    },
    cancel: (code: string) => {
      opts.cancelCalls?.push(code);
      return opts.cancelError
        ? throwError(() => opts.cancelError)
        : of(opts.cancel ?? CANCELLATION);
    },
    withdraw: (code: string) => {
      opts.withdrawCalls?.push(code);
      return opts.withdrawError ? throwError(() => opts.withdrawError) : of(WITHDRAWAL);
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

    host.querySelector<HTMLButtonElement>('[data-testid="start-cancel"]')!.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="confirm-cancel"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(cancelCalls).toEqual(['ABCD234567']);
    expect(host.querySelector('[data-testid="cancel-result"]')?.textContent).toContain('refunded');
  });

  it('parks focus on the result when a cancellation completes', async () => {
    const fixture = await render(stubService({ detail: DETAIL }));
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLButtonElement>('[data-testid="start-cancel"]')!.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="confirm-cancel"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    // The whole cancel section goes with the action, so the outcome is the only place left to land.
    expect(host.querySelector('[data-testid="start-cancel"]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('[data-testid="cancel-result"]'));
  });

  it('moves focus to the destructive confirm button when the cancel prompt appears', async () => {
    // Twin of the withdraw focus test — the component claims this for BOTH prompts.
    const fixture = await render(stubService({ detail: DETAIL }));
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLButtonElement>('[data-testid="start-cancel"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.activeElement).toBe(host.querySelector('[data-testid="confirm-cancel"]'));
  });

  it('returns focus to the cancel trigger when the guest keeps the booking', async () => {
    const fixture = await render(stubService({ detail: DETAIL }));
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLButtonElement>('[data-testid="start-cancel"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const keep = host.querySelector<HTMLButtonElement>('[data-testid="keep-booking"]')!;
    expect(keep.textContent?.trim()).toBe('Keep booking');
    keep.click();
    fixture.detectChanges();
    await fixture.whenStable();

    // Backing out destroys the confirm button focus was on; Cancel booking is what it replaced.
    expect(document.activeElement).toBe(host.querySelector('[data-testid="start-cancel"]'));
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

    host.querySelector<HTMLButtonElement>('[data-testid="withdraw-request"]')!.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="confirm-withdraw"]')!.click();
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

    host.querySelector<HTMLButtonElement>('[data-testid="withdraw-request"]')!.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="confirm-withdraw"]')!.click();
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

    host.querySelector<HTMLButtonElement>('[data-testid="withdraw-request"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.activeElement).toBe(host.querySelector('[data-testid="confirm-withdraw"]'));
  });

  it('returns focus to the withdraw trigger when the guest keeps the request', async () => {
    const fixture = await render(stubService({ detail: PENDING }));
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLButtonElement>('[data-testid="withdraw-request"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    host.querySelector<HTMLButtonElement>('[data-testid="keep-request"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(host.querySelector('[data-testid="withdraw-request"]'));
  });

  it('parks focus on the result when a withdrawal completes', async () => {
    const fixture = await render(stubService({ detail: PENDING }));
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLButtonElement>('[data-testid="withdraw-request"]')!.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="confirm-withdraw"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.querySelector('[data-testid="withdraw-request"]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('[data-testid="withdraw-result"]'));
  });

  it('asks before withdrawing, and "Keep request" backs out without calling the API', async () => {
    const withdrawCalls: string[] = [];
    const fixture = await render(stubService({ detail: PENDING, withdrawCalls }));
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLButtonElement>('[data-testid="withdraw-request"]')!.click();
    fixture.detectChanges();
    expect(host.textContent).toContain('Withdraw this request?');

    const keep = host.querySelector<HTMLButtonElement>('[data-testid="keep-request"]')!;
    // The escape from a destructive prompt must say what it does, not just carry a test hook.
    expect(keep.textContent?.trim()).toBe('Keep request');
    keep.click();
    fixture.detectChanges();

    expect(withdrawCalls).toEqual([]);
    expect(host.querySelector('[data-testid="withdraw-request"]')).not.toBeNull();
  });

  it('keeps the request on screen and explains when the withdraw fails', async () => {
    const fixture = await render(stubService({ detail: PENDING, withdrawError: { status: 409 } }));
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLButtonElement>('[data-testid="withdraw-request"]')!.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="confirm-withdraw"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="withdraw-result"]')?.textContent).toContain(
      'couldn’t withdraw',
    );
    expect(host.querySelector('[data-testid="request-pending"]')).not.toBeNull();
  });

  it('parks focus on the result when a withdrawal fails, and re-reads', async () => {
    const withdrawCalls: string[] = [];
    const getCalls: string[] = [];
    const fixture = await render(
      stubService({ detail: PENDING, withdrawCalls, getCalls, withdrawError: { status: 500 } }),
    );
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLButtonElement>('[data-testid="withdraw-request"]')!.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="confirm-withdraw"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(withdrawCalls).toEqual(['ABCD234567']);
    // The re-read is the point of the fix, so it is asserted rather than implied by the title.
    expect(getCalls).toEqual(['ABCD234567', 'ABCD234567']);
    expect(host.querySelector('[data-testid="confirm-withdraw"]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('[data-testid="withdraw-result"]'));
  });

  it('says the venue already answered instead of inviting a retry that cannot succeed', async () => {
    const answered: BookingDetail = { ...PENDING, status: 'DECLINED', withdrawable: false };
    const fixture = await render(
      stubService({
        detail: PENDING,
        detailAfterCancel: answered,
        withdrawError: new HttpErrorResponse({
          status: 409,
          error: { code: 'REQUEST_NOT_PENDING' },
        }),
      }),
    );
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLButtonElement>('[data-testid="withdraw-request"]')!.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="confirm-withdraw"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    const result = host.querySelector('[data-testid="withdraw-result"]')?.textContent;
    expect(result).toContain('no longer waiting for the venue');
    // The banner beside it now says DECLINED — "try again" there would contradict the page.
    expect(result).not.toContain('try again');
    expect(host.querySelector('[data-testid="request-declined"]')).not.toBeNull();
  });

  it('retires a failed withdrawal once the guest arms or abandons another', async () => {
    const fixture = await render(stubService({ detail: PENDING, withdrawError: { status: 500 } }));
    const host = fixture.nativeElement as HTMLElement;
    const result = () => host.querySelector('[data-testid="withdraw-result"]')?.textContent ?? '';

    host.querySelector<HTMLButtonElement>('[data-testid="withdraw-request"]')!.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="confirm-withdraw"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(result()).toContain('couldn’t withdraw');

    host.querySelector<HTMLButtonElement>('[data-testid="withdraw-request"]')!.click();
    fixture.detectChanges();
    expect(result()).not.toContain('couldn’t withdraw');

    host.querySelector<HTMLButtonElement>('[data-testid="keep-request"]')!.click();
    fixture.detectChanges();
    expect(result()).not.toContain('couldn’t withdraw');
  });

  it('renders no withdraw control when the server says the request is not withdrawable', async () => {
    // The server owns the rule — the template gates on `withdrawable`, never on the status.
    const fixture = await render(stubService({ detail: { ...PENDING, withdrawable: false } }));
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

    host.querySelector<HTMLButtonElement>('[data-testid="start-cancel"]')!.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="confirm-cancel"]')!.click();
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

  it('parks focus on the result when the cancel window has closed', async () => {
    const closed: BookingDetail = { ...DETAIL, cancellable: false, beforeCutoff: false };
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

    host.querySelector<HTMLButtonElement>('[data-testid="start-cancel"]')!.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="confirm-cancel"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    // The refusal withdraws the trigger too, so returning focus there would have stranded it.
    expect(host.querySelector('[data-testid="start-cancel"]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('[data-testid="cancel-result"]'));
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

    host.querySelector<HTMLButtonElement>('[data-testid="start-cancel"]')!.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="confirm-cancel"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="booking-status"]')?.textContent?.trim()).toBe(
      'Cancelled',
    );
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

  /**
   * A swept booking is the common arrival: the "payment window closed" state lasts only until the
   * next sweep run, so most affected guests land here, after the transition.
   */
  it('explains a CANCELLED booking that was never charged', async () => {
    const fixture = await render(
      stubService({
        detail: { ...DETAIL, status: 'CANCELLED', cancellable: false, refundedAmount: null },
      }),
    );
    const host = fixture.nativeElement as HTMLElement;
    const panel = host.querySelector('[data-testid="booking-cancelled"]');

    expect(panel?.textContent).toContain('payment');
    expect(panel?.textContent).toContain('haven’t been charged');
    await expectNoAxeViolations(host);
  });

  it('labels a never-charged cancellation Amount, not Paid', async () => {
    const fixture = await render(
      stubService({
        detail: { ...DETAIL, status: 'CANCELLED', cancellable: false, refundedAmount: null },
      }),
    );
    const host = fixture.nativeElement as HTMLElement;

    const labels = [...host.querySelectorAll('dt')].map((dt) => dt.textContent?.trim());
    expect(labels).toContain('Amount');
    expect(labels).not.toContain('Paid');
  });

  it('explains a POLICY cancellation with a refund', async () => {
    const fixture = await render(stubService({ detail: cancelled('POLICY', 4500) }));
    const host = fixture.nativeElement as HTMLElement;
    const panel = host.querySelector('[data-testid="booking-cancelled"]');

    expect(panel?.textContent).toContain('You cancelled this booking');
    expect(panel?.textContent).toContain('45');
  });

  it('explains a non-refundable POLICY cancellation', async () => {
    const fixture = await render(stubService({ detail: cancelled('POLICY', 0) }));
    const host = fixture.nativeElement as HTMLElement;
    const panel = host.querySelector('[data-testid="booking-cancelled"]');

    expect(panel?.textContent).toContain('You cancelled this booking');
    expect(panel?.textContent).toContain('No refund applies');
    expect(host.querySelector('[data-testid="refunded-amount"]')).toBeNull();
  });

  /** A storm the venue called is not the guest's doing — "you cancelled this" would be a lie. */
  it('attributes a WEATHER cancellation to the venue', async () => {
    const fixture = await render(stubService({ detail: cancelled('WEATHER', 4500) }));
    const host = fixture.nativeElement as HTMLElement;
    const panel = host.querySelector('[data-testid="booking-cancelled"]');

    expect(panel?.textContent).toContain('Miramar Beach Club');
    expect(panel?.textContent).toContain('weather');
    expect(panel?.textContent).not.toContain('You cancelled');
    await expectNoAxeViolations(host);
  });

  /** A zero refund is still a refund *decision* — but "€0.00 is on its way back" is not a sentence. */
  it.each<[CancelReason | null]>([['WEATHER'], ['POLICY'], [null]])(
    'never claims a zero refund is on its way (%s)',
    async (reason) => {
      const fixture = await render(stubService({ detail: cancelled(reason, 0) }));
      const panel = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="booking-cancelled"]',
      );

      expect(panel?.textContent).toContain('No refund applies');
      expect(panel?.textContent).not.toContain('on its way');
    },
  );

  /**
   * A refund can sit unaccepted in the refund outbox for as long as nobody re-drives it; the
   * panel persists indefinitely, so it must not keep telling the guest the money is in transit.
   */
  it('says a stuck refund is being processed, never on its way to the card', async () => {
    const fixture = await render(
      stubService({ detail: { ...cancelled('POLICY', 4500), refundOutstanding: true } }),
    );
    const host = fixture.nativeElement as HTMLElement;
    const panel = host.querySelector('[data-testid="booking-cancelled"]');

    expect(panel?.textContent).toContain('is being processed');
    expect(panel?.textContent).toContain('45');
    expect(panel?.textContent).not.toContain('on its way');
    expect(panel?.textContent).not.toContain('to your card');
    // The detail row must not contradict the banner: no past-tense "Refunded" while outstanding.
    const labels = [...host.querySelectorAll('dt')].map((dt) => dt.textContent?.trim());
    expect(labels).toContain('Refund');
    expect(labels).not.toContain('Refunded');
    await expectNoAxeViolations(host);
  });

  /**
   * The same claim, in-session: the aria-live cancel announcement must not tell a screen-reader
   * user the money is heading to their card while the panel beside it says it is still processing.
   */
  it('announces a still-processing refund after an in-session cancel, never "to your card"', async () => {
    const stuck: BookingDetail = {
      ...DETAIL,
      status: 'CANCELLED',
      cancellable: false,
      refundedAmount: { minorUnits: 4500, currency: 'EUR' },
      refundOutstanding: true,
      cancelReason: 'POLICY',
    };
    const fixture = await render(stubService({ detail: DETAIL, detailAfterCancel: stuck }));
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLButtonElement>('[data-testid="start-cancel"]')!.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="confirm-cancel"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const result = host.querySelector('[data-testid="cancel-result"]')?.textContent;
    expect(result).toContain('Booking cancelled.');
    expect(result).toContain('is being processed');
    expect(result).not.toContain('to your card');
  });

  it('keeps the usual copy once the gateway accepted the refund', async () => {
    const fixture = await render(stubService({ detail: cancelled('POLICY', 4500) }));
    const panel = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="booking-cancelled"]',
    );

    expect(panel?.textContent).toContain('will be refunded to your card');
    expect(panel?.textContent).not.toContain('is being processed');
  });

  /** A row cancelled before V14 carries a refund but no reason; CONFLICT is reserved and unused. */
  it('falls back to neutral copy for an unknown cancel reason', async () => {
    const fixture = await render(stubService({ detail: cancelled(null, 4500) }));
    const host = fixture.nativeElement as HTMLElement;
    const panel = host.querySelector('[data-testid="booking-cancelled"]');

    expect(panel?.textContent).toContain('This booking was cancelled');
    expect(panel?.textContent).not.toContain('You cancelled');
    expect(panel?.textContent).toContain('45');
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
    host.querySelector<HTMLButtonElement>('[data-testid="pay-now"]')!.click();

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
    expect(host.querySelector('[data-testid="pay-window-closed"]')).toBeNull();
  });

  it('shows the closed pay-window panel instead of Pay now', async () => {
    const fixture = await render(
      stubService({
        detail: {
          ...DETAIL,
          status: 'AWAITING_PAYMENT',
          cancellable: false,
          payment: null,
          payWindowClosed: true,
        },
      }),
    );
    const host = fixture.nativeElement as HTMLElement;

    const panel = host.querySelector('[data-testid="pay-window-closed"]');
    expect(panel?.textContent).toContain('Payment window closed');
    expect(panel?.textContent).toContain('can no longer be paid');
    // Calendar-only flag: a payment may be in flight, so no "you weren't charged" claim.
    expect(panel?.textContent).not.toContain('haven’t been charged');
    expect(host.querySelector('[data-testid="pay-now"]')).toBeNull();
    await expectNoAxeViolations(host);
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
      stubService({
        detail: { ...DETAIL, status: 'ON_HOLD' as BookingStatus, cancellable: false },
      }),
    );
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="booking-status"]')?.textContent?.trim()).toBe(
      'On hold',
    );
    // Unknown status must not claim money moved: the amount row falls back to "Amount".
    expect(host.textContent).toContain('Amount');
  });

  // A failed post-cancel reload must NOT hide the confirmed cancellation.
  it('keeps the cancellation confirmation when the post-cancel reload fails', async () => {
    let calls = 0;
    const service: Partial<BookingService> = {
      getByCode: () => (calls++ === 0 ? of(DETAIL) : throwError(() => ({ status: 500 }))),
      cancel: () => of(CANCELLATION),
      beginPayment: () => undefined,
      takePrefetched: () => undefined,
    };
    const fixture = await render(service);
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLButtonElement>('[data-testid="start-cancel"]')!.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="confirm-cancel"]')!.click();
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
    expect(host.querySelector('[data-testid="booking-status"]')?.textContent?.trim()).toBe(
      'Confirmed',
    );
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
    expect(host.querySelector('[data-testid="request-accepted"]')?.textContent).toContain(
      'Request accepted',
    );
    await expectNoAxeViolations(host);
  });

  // A find-a-booking hand-off primes the detail, so the initial load renders it WITHOUT a second GET /api/bookings/{code} (two GETs per success can approach the rate-limit ceiling).
  it('renders a prefetched detail for the matching code without fetching (#168)', async () => {
    const getByCode = vi.fn(() => of(DETAIL));
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
    const getByCode = vi.fn(() => of(DETAIL));
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
      getByCode: (code: string) => of(code === 'AAAAAAAAAA' ? detailA : detailB),
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
