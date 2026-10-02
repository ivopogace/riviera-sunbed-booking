import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, NEVER, of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';

import { expectNoAxeViolations } from '../../testing/axe';
import {
  BookingDetail,
  BookingStatus,
  Cancellation,
  CancelReason,
  PaymentHandoff,
  SubmitReviewRequest,
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
  cancellationWindowAtBirth: 'FREE',
  move: null,
  reviewPanel: { kind: 'NOT_COMPLETED' },
};

const WITHDRAWAL: Withdrawal = { code: 'ABCD234567', status: 'WITHDRAWN' };

/** A delivered stay the server says may be rated — the panel, never the status, opens the form. */
const REVIEWABLE: BookingDetail = {
  ...DETAIL,
  status: 'COMPLETED',
  cancellable: false,
  reviewPanel: {
    kind: 'ELIGIBLE',
    windowClosesAt: '2026-09-29T16:00:00Z',
    nameSuggestion: 'Ana',
  },
};

/** The same stay once it carries the guest's own review, still inside the window. */
const REVIEWED: BookingDetail = {
  ...REVIEWABLE,
  reviewPanel: {
    kind: 'ALREADY_REVIEWED',
    review: { stars: 4, comment: 'Great sunbeds', displayName: 'Ana' },
    windowClosesAt: '2026-09-29T16:00:00Z',
  },
};

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

/** A confirmed booking a remodel re-seated, its free exit still open (13:00Z on a CET date → 14:00 Tirane). */
const MOVED: BookingDetail = {
  ...DETAIL,
  positionNo: 7,
  beforeCutoff: false,
  move: {
    fromRowLabel: 'Front row · Sea view',
    fromPositionNo: 2,
    rowsAway: 0,
    positionsAway: 5,
    movedAt: '2026-11-29T13:00:00Z',
    freeExitUntil: '2026-11-30T13:00:00Z',
  },
};

/**
 * A stitched stay whose second stop a remodel moved; its free exit runs until the stay opens
 * (23:00Z on a CET date → midnight Tirane).
 */
const STAY_MOVED: BookingDetail = {
  ...DETAIL,
  lastDate: '2026-12-07',
  amount: { minorUnits: 31500, currency: 'EUR' },
  refundIfCancelledNow: { minorUnits: 31500, currency: 'EUR' },
  stretches: [
    {
      setId: 11,
      rowLabel: 'Front row · Sea view',
      positionNo: 2,
      firstDate: '2026-12-01',
      lastDate: '2026-12-03',
      amount: { minorUnits: 13500, currency: 'EUR' },
      status: 'CONFIRMED',
      move: null,
    },
    {
      setId: 13,
      rowLabel: 'Front row · Sea view',
      positionNo: 7,
      firstDate: '2026-12-04',
      lastDate: '2026-12-07',
      amount: { minorUnits: 18000, currency: 'EUR' },
      status: 'CONFIRMED',
      move: {
        fromRowLabel: 'Front row · Sea view',
        fromPositionNo: 4,
        rowsAway: 0,
        positionsAway: 3,
        movedAt: '2026-11-20T13:00:00Z',
        freeExitUntil: '2026-11-30T23:00:00Z',
      },
    },
  ],
};

/**
 * A live three-stop stay around the frozen clock (Mon 15 Jun 2026): stop 1 has passed, stop 2 covers
 * today (its first day), stop 3 is the move to come.
 */
const STAY_TODAY: BookingDetail = {
  ...DETAIL,
  code: 'STAY234567',
  bookingDate: '2026-06-13',
  lastDate: '2026-06-18',
  amount: { minorUnits: 27000, currency: 'EUR' },
  cancellable: false,
  beforeCutoff: false,
  refundIfCancelledNow: { minorUnits: 0, currency: 'EUR' },
  stretches: [
    {
      setId: 11,
      rowLabel: 'Front row · Sea view',
      positionNo: 2,
      firstDate: '2026-06-13',
      lastDate: '2026-06-14',
      amount: { minorUnits: 9000, currency: 'EUR' },
      status: 'COMPLETED',
      move: null,
    },
    {
      setId: 15,
      rowLabel: 'Front row · Sea view',
      positionNo: 5,
      firstDate: '2026-06-15',
      lastDate: '2026-06-16',
      amount: { minorUnits: 9000, currency: 'EUR' },
      status: 'CONFIRMED',
      move: null,
    },
    {
      setId: 21,
      rowLabel: 'Second row',
      positionNo: 1,
      firstDate: '2026-06-17',
      lastDate: '2026-06-18',
      amount: { minorUnits: 9000, currency: 'EUR' },
      status: 'CONFIRMED',
      move: null,
    },
  ],
};

/** {@link STAY_TODAY} shifted one day earlier, so today is stop 2's last day and the move is tomorrow. */
const STAY_MOVES_TOMORROW: BookingDetail = {
  ...STAY_TODAY,
  bookingDate: '2026-06-12',
  lastDate: '2026-06-17',
  stretches: STAY_TODAY.stretches!.map((stretch, i) => ({
    ...stretch,
    firstDate: ['2026-06-12', '2026-06-14', '2026-06-16'][i],
    lastDate: ['2026-06-13', '2026-06-15', '2026-06-17'][i],
  })),
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
  /** Fails only the re-read after an action, so a spec can hold the first detail on screen. */
  refreshError?: unknown;
  cancel?: Cancellation;
  cancelError?: unknown;
  cancelCalls?: string[];
  /** Every getByCode, so a spec can assert the post-action re-read actually happened. */
  getCalls?: string[];
  withdrawCalls?: string[];
  withdrawError?: unknown;
  reviewCalls?: [string, SubmitReviewRequest][];
  updateCalls?: [string, SubmitReviewRequest][];
  deleteCalls?: string[];
  reviewError?: unknown;
  handoffs?: PaymentHandoff[];
  /** A primed detail (find-a-booking hand-off); consumed one-shot for the matching code. */
  prefetched?: BookingDetail;
}): Partial<BookingService> {
  let served = 0;
  let prefetched = opts.prefetched;
  return {
    getByCode: (code: string) => {
      opts.getCalls?.push(code);
      const first = served++ === 0;
      const detail = first ? opts.detail! : (opts.detailAfterCancel ?? opts.detail!);
      if (opts.getError || (!first && opts.refreshError)) {
        return throwError(() => opts.getError ?? opts.refreshError);
      }
      return of(detail);
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
    review: (code: string, review: SubmitReviewRequest) => {
      opts.reviewCalls?.push([code, review]);
      return opts.reviewError ? throwError(() => opts.reviewError) : of(undefined);
    },
    updateReview: (code: string, review: SubmitReviewRequest) => {
      opts.updateCalls?.push([code, review]);
      return opts.reviewError ? throwError(() => opts.reviewError) : of(undefined);
    },
    deleteReview: (code: string) => {
      opts.deleteCalls?.push(code);
      return opts.reviewError ? throwError(() => opts.reviewError) : of(undefined);
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

  it('lists a refunded day on a cancelled booking without claiming the spot is still held', async () => {
    const fixture = await render(
      stubService({
        detail: {
          ...DETAIL,
          status: 'CANCELLED',
          lastDate: '2026-12-03',
          amount: { minorUnits: 13500, currency: 'EUR' },
          refundedAmount: { minorUnits: 9000, currency: 'EUR' },
          refundedDays: [{ day: '2026-12-02', amount: { minorUnits: 4500, currency: 'EUR' } }],
        },
      }),
    );
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="view-refunded-days"]')?.textContent).toContain(
      '2 Dec',
    );
    expect(host.querySelector('[data-testid="view-refunded-days-note"]')).toBeNull();
  });

  it('lists the days a weather refund gave back while the booking went on (#1210)', async () => {
    const fixture = await render(
      stubService({
        detail: {
          ...DETAIL,
          lastDate: '2026-12-03',
          refundIfCancelledNow: { minorUnits: 9000, currency: 'EUR' },
          amount: { minorUnits: 13500, currency: 'EUR' },
          refundedDays: [{ day: '2026-12-02', amount: { minorUnits: 4500, currency: 'EUR' } }],
        },
      }),
    );
    const host = fixture.nativeElement as HTMLElement;
    const days = host.querySelector('[data-testid="view-refunded-days"]')!;
    expect(days.querySelectorAll('li')).toHaveLength(1);
    expect(days.textContent).toContain('2 Dec');
    expect(days.textContent).toContain('€45');
    expect(host.querySelector('[data-testid="view-refunded-days-note"]')?.textContent).toContain(
      'Your spot stays yours',
    );
    expect(host.querySelector('[data-testid="refunded-amount"]')).toBeNull();
  });

  it('lists the days the venue refunded on its own, apart from weather, and says the spot is no longer held (ADR-0027)', async () => {
    const fixture = await render(
      stubService({
        detail: {
          ...DETAIL,
          lastDate: '2026-12-05',
          refundIfCancelledNow: { minorUnits: 9000, currency: 'EUR' },
          amount: { minorUnits: 22500, currency: 'EUR' },
          refundedDays: [
            { day: '2026-12-02', amount: { minorUnits: 4500, currency: 'EUR' }, reason: 'WEATHER' },
            {
              day: '2026-12-03',
              amount: { minorUnits: 4500, currency: 'EUR' },
              reason: 'VENUE',
              released: true,
            },
            { day: '2026-12-01', amount: { minorUnits: 4500, currency: 'EUR' } },
          ],
        },
      }),
    );
    const host = fixture.nativeElement as HTMLElement;
    const weather = host.querySelector('[data-testid="view-refunded-days"]')!;
    expect(weather.querySelectorAll('li')).toHaveLength(2);
    expect(weather.textContent).toContain('2 Dec');
    expect(weather.textContent).toContain('1 Dec');
    const venue = host.querySelector('[data-testid="view-venue-refunded-days"]')!;
    expect(venue.querySelectorAll('li')).toHaveLength(1);
    expect(venue.textContent).toContain('3 Dec');
    expect(venue.textContent).toContain('€45');
    const note = host.querySelector('[data-testid="view-venue-refunded-days-note"]')?.textContent;
    expect(note).toContain('Miramar Beach Club refunded that day');
    expect(note).toContain('Your spot is no longer held for that day');
    expect(note).not.toMatch(/weather|because/i);
    expect(host.querySelector('[data-testid="view-refunded-days-note"]')?.textContent).toContain(
      'Your spot stays yours',
    );
    await expectNoAxeViolations(host);
  });

  it('a past venue-refunded day is refunded but the spot line is not claimed', async () => {
    const fixture = await render(
      stubService({
        detail: {
          ...DETAIL,
          lastDate: '2026-12-03',
          amount: { minorUnits: 13500, currency: 'EUR' },
          refundedDays: [
            {
              day: '2026-12-02',
              amount: { minorUnits: 4500, currency: 'EUR' },
              reason: 'VENUE',
              released: false,
            },
          ],
        },
      }),
    );
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="view-refunded-days"]')).toBeNull();
    const note = host.querySelector('[data-testid="view-venue-refunded-days-note"]')?.textContent;
    expect(note).toContain('refunded that day');
    expect(note).not.toContain('no longer held');
  });

  it('attributes a VENUE cancellation to the venue without a reason (ADR-0027)', async () => {
    const fixture = await render(stubService({ detail: cancelled('VENUE', 4500) }));
    const host = fixture.nativeElement as HTMLElement;
    const panel = host.querySelector('[data-testid="booking-cancelled"]');

    expect(panel?.textContent).toContain('Cancelled by the venue');
    expect(panel?.textContent).toContain('Miramar Beach Club refunded this booking.');
    expect(panel?.textContent).not.toContain('You cancelled');
    expect(panel?.textContent).not.toMatch(/weather/i);
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

  // ADR-0026 §7 (#1381): every day refunded reads as refunded, offers no cancel and promises no check-in.
  it('renders a NO_SHOW booking with nothing left as "Refunded", not "No-show"', async () => {
    const fixture = await render(
      stubService({
        detail: { ...DETAIL, status: 'NO_SHOW', cancellable: false, nothingLeft: true },
      }),
    );
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="booking-status"]')?.textContent?.trim()).toBe(
      'Refunded',
    );
    expect(host.querySelector('[data-testid="review-nothing-left-note"]')?.textContent).toContain(
      'nothing to review',
    );
  });

  it('renders a CONFIRMED booking with nothing left as "Refunded" with no cancel and no check-in promise', async () => {
    const fixture = await render(
      stubService({ detail: { ...DETAIL, cancellable: false, nothingLeft: true } }),
    );
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="booking-status"]')?.textContent?.trim()).toBe(
      'Refunded',
    );
    expect(host.querySelector('[data-testid="start-cancel"]')).toBeNull();
    expect(host.querySelector('[data-testid="review-not-completed-note"]')).toBeNull();
    expect(host.querySelector('[data-testid="review-nothing-left-note"]')).not.toBeNull();
  });

  // The last day can be refunded between render and confirm; the server then refuses with its own code.
  it('explains a refusal for nothing left and re-reads the booking', async () => {
    const refunded: BookingDetail = { ...DETAIL, cancellable: false, nothingLeft: true };
    const fixture = await render(
      stubService({
        detail: DETAIL,
        detailAfterCancel: refunded,
        cancelError: new HttpErrorResponse({ status: 409, error: { code: 'NOTHING_LEFT' } }),
      }),
    );
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLButtonElement>('[data-testid="start-cancel"]')!.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="confirm-cancel"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="cancel-result"]')?.textContent).toContain(
      'already been refunded',
    );
    expect(host.querySelector('[data-testid="cancel-result"]')?.textContent).not.toContain(
      'try again',
    );
    expect(host.querySelector('[data-testid="start-cancel"]')).toBeNull();
    expect(host.querySelector('[data-testid="booking-status"]')?.textContent?.trim()).toBe(
      'Refunded',
    );
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

  it('presents a CLOSED-born booking as a non-refundable last-minute booking (#795 AC-8/AC-11)', async () => {
    const fixture = await render(
      stubService({
        detail: {
          ...DETAIL,
          cancellable: false,
          beforeCutoff: false,
          refundIfCancelledNow: { minorUnits: 0, currency: 'EUR' },
          cancellationWindowAtBirth: 'CLOSED',
        },
      }),
    );
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="last-minute-note"]')?.textContent).toContain(
      'Non-refundable last-minute booking',
    );
    expect(host.querySelector('[data-testid="start-cancel"]')).toBeNull();
    expect(host.querySelector('[data-testid="refund-terms"]')).toBeNull();
  });

  it('renders no last-minute note for a CLOSED-born pending request — withdraw is the affordance (#795)', async () => {
    const fixture = await render(
      stubService({
        detail: {
          ...DETAIL,
          status: 'PENDING_REQUEST',
          cancellable: false,
          withdrawable: true,
          beforeCutoff: false,
          refundIfCancelledNow: { minorUnits: 0, currency: 'EUR' },
          cancellationWindowAtBirth: 'CLOSED',
        },
      }),
    );
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="last-minute-note"]')).toBeNull();
    expect(host.querySelector('[data-testid="withdraw-request"]')).not.toBeNull();
  });

  it('keeps the once-paid qualifier on the note while a CLOSED-born booking is unpaid (#795)', async () => {
    const fixture = await render(
      stubService({
        detail: {
          ...DETAIL,
          status: 'AWAITING_PAYMENT',
          cancellable: false,
          beforeCutoff: false,
          refundIfCancelledNow: { minorUnits: 0, currency: 'EUR' },
          cancellationWindowAtBirth: 'CLOSED',
        },
      }),
    );
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="last-minute-note"]')?.textContent).toContain(
      'can’t be cancelled once paid',
    );
  });

  it('keeps rendering nothing for an advance-born booking whose window has since closed (#795 parity)', async () => {
    const fixture = await render(
      stubService({
        detail: {
          ...DETAIL,
          cancellable: false,
          beforeCutoff: false,
          refundIfCancelledNow: { minorUnits: 0, currency: 'EUR' },
          cancellationWindowAtBirth: 'FREE',
        },
      }),
    );
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="last-minute-note"]')).toBeNull();
    expect(host.querySelector('[data-testid="start-cancel"]')).toBeNull();
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

  describe('moved booking (#1034)', () => {
    it('tells the guest the spot changed — where from, where to, how far — and names the free-exit deadline in Tirane time', async () => {
      const fixture = await render(stubService({ detail: MOVED }));
      const host = fixture.nativeElement as HTMLElement;
      const banner = host.querySelector('[data-testid="booking-moved"]')!;

      expect(banner.getAttribute('aria-labelledby')).toBe('booking-moved-title');
      expect(banner.textContent).toContain('Your spot changed');
      expect(banner.textContent).toContain(
        'Miramar Beach Club rearranged its beach map, so your set moved from Front row · Sea view · spot 2 to Front row · Sea view · spot 7 (5 positions along the row). Your booking code, price and date are unchanged.',
      );
      expect(host.querySelector('[data-testid="booking-free-exit"]')?.textContent).toMatch(
        /full refund until\s+Mon, 30 Nov, 14:00/,
      );
      expect(host.querySelector('[data-testid="refund-terms"]')?.textContent).toContain(
        'Because the venue moved your spot, you can cancel for a full refund until Mon, 30 Nov, 14:00 — you’ll be refunded €45 in full.',
      );
      expect(host.querySelector('[data-testid="start-cancel"]')).toBeTruthy();
      await expectNoAxeViolations(host);
    });

    it('renders a detail whose wire body carries no move field as never moved', async () => {
      const legacy = Object.fromEntries(
        Object.entries(DETAIL).filter(([key]) => key !== 'move'),
      ) as unknown as BookingDetail;
      const fixture = await render(stubService({ detail: legacy }));
      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('[data-testid="booking-moved"]')).toBeNull();
      expect(host.querySelector('[data-testid="start-cancel"]')).toBeTruthy();
      expect(host.querySelector('[data-testid="refund-terms"]')?.textContent).toContain('in full');
    });

    it('keeps the notice but drops the exit sentence once the deadline has passed, and the terms fall back to the tier', async () => {
      const fixture = await render(
        stubService({
          detail: {
            ...MOVED,
            move: { ...MOVED.move!, freeExitUntil: null },
            refundIfCancelledNow: { minorUnits: 2250, currency: 'EUR' },
          },
        }),
      );
      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('[data-testid="booking-moved"]')).toBeTruthy();
      expect(host.querySelector('[data-testid="booking-free-exit"]')).toBeNull();
      expect(host.querySelector('[data-testid="refund-terms"]')?.textContent).toContain(
        'The free-cancellation cutoff has passed — you’ll be refunded €22.50.',
      );
    });

    it('shows no exit sentence on a moved booking that can no longer be cancelled, and no notice once it is cancelled', async () => {
      const completed = await render(
        stubService({
          detail: { ...MOVED, status: 'COMPLETED', cancellable: false },
        }),
      );
      const completedHost = completed.nativeElement as HTMLElement;
      expect(completedHost.querySelector('[data-testid="booking-moved"]')).toBeTruthy();
      expect(completedHost.querySelector('[data-testid="booking-free-exit"]')).toBeNull();
      completed.destroy();
      TestBed.resetTestingModule();

      const cancelled = await render(
        stubService({
          detail: {
            ...MOVED,
            status: 'CANCELLED',
            cancellable: false,
            refundedAmount: { minorUnits: 4500, currency: 'EUR' },
            cancelReason: 'VENUE_CHANGE',
          },
        }),
      );
      const host = cancelled.nativeElement as HTMLElement;
      expect(host.querySelector('[data-testid="booking-moved"]')).toBeNull();
      const panel = host.querySelector('[data-testid="booking-cancelled"]');
      expect(panel?.textContent).toContain('Booking cancelled');
      expect(panel?.textContent).toContain(
        'You cancelled this booking after the venue moved your spot.',
      );
      expect(panel?.textContent).toContain('€45 will be refunded to your card.');
    });

    it('the free exit cancels through the same two-step cancel and reports the full refund', async () => {
      const cancelCalls: string[] = [];
      const fixture = await render(
        stubService({
          detail: MOVED,
          detailAfterCancel: {
            ...MOVED,
            status: 'CANCELLED',
            cancellable: false,
            refundedAmount: { minorUnits: 4500, currency: 'EUR' },
            cancelReason: 'VENUE_CHANGE',
          },
          cancelCalls,
        }),
      );
      const host = fixture.nativeElement as HTMLElement;
      host.querySelector<HTMLButtonElement>('[data-testid="start-cancel"]')!.click();
      fixture.detectChanges();
      host.querySelector<HTMLButtonElement>('[data-testid="confirm-cancel"]')!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(cancelCalls).toEqual(['ABCD234567']);
      expect(host.querySelector('[data-testid="cancel-result"]')?.textContent).toContain(
        '€45 will be refunded to your card.',
      );
      expect(host.querySelector('[data-testid="booking-moved"]')).toBeNull();
    });
  });

  describe('stitched stay with a moved stop (#1257)', () => {
    it('names the moved stop, its days, both spots and the distance, with the exit until the stay opens', async () => {
      const fixture = await render(stubService({ detail: STAY_MOVED }));
      const host = fixture.nativeElement as HTMLElement;
      const banner = host.querySelector('[data-testid="booking-moved"]')!;

      expect(banner.textContent).toContain('Your spot changed');
      expect(banner.textContent).toContain(
        'Miramar Beach Club rearranged its beach map, so your set for stop 2 (4 – 7 Dec · 4 days) moved from Front row · Sea view · spot 4 to Front row · Sea view · spot 7 (3 positions along the row).',
      );
      expect(banner.textContent).toContain('Your booking code, price and dates are unchanged.');
      expect(host.querySelector('[data-testid="booking-free-exit"]')?.textContent).toMatch(
        /cancel the stay below until\s+Tue, 1 Dec, 00:00\s*and stop 2 is refunded in full\./,
      );
      await expectNoAxeViolations(host);
    });

    it('marks the moved stop in the list and leaves the others as booked', async () => {
      const fixture = await render(stubService({ detail: STAY_MOVED }));
      const stops = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="view-stops"] li'),
      );

      expect(stops).toHaveLength(2);
      expect(stops[0].querySelector('[data-testid="view-stop-moved"]')).toBeNull();
      expect(stops[1].querySelector('[data-testid="view-stop-moved"]')?.textContent?.trim()).toBe(
        'moved from Front row · Sea view · spot 4',
      );
    });

    it('keeps the notice but promises no exit once the stay can no longer be cancelled', async () => {
      const fixture = await render(
        stubService({ detail: { ...STAY_MOVED, beforeCutoff: false, cancellable: false } }),
      );
      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('[data-testid="booking-moved"]')).toBeTruthy();
      expect(host.querySelector('[data-testid="booking-free-exit"]')).toBeNull();
    });

    it('shows no notice for a stay no remodel touched', async () => {
      const fixture = await render(
        stubService({
          detail: {
            ...STAY_MOVED,
            stretches: STAY_MOVED.stretches!.map((stretch) => ({ ...stretch, move: null })),
          },
        }),
      );
      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('[data-testid="booking-moved"]')).toBeNull();
      expect(host.querySelector('[data-testid="view-stop-moved"]')).toBeNull();
    });
  });

  describe('your spot today (#1209)', () => {
    const byId = (host: HTMLElement, id: string) => host.querySelector(`[data-testid="${id}"]`);
    const stops = (host: HTMLElement) =>
      Array.from(host.querySelectorAll<HTMLElement>('[data-testid="view-stops"] li'));

    it('leads with the stop covering today and says how long it lasts', async () => {
      const fixture = await render(stubService({ detail: STAY_TODAY }));
      const host = fixture.nativeElement as HTMLElement;

      expect(byId(host, 'booking-today')?.textContent).toContain('Your spot today');
      expect(byId(host, 'booking-today-spot')?.textContent?.trim()).toBe(
        'Front row · Sea view · spot 5',
      );
      expect(byId(host, 'booking-today-note')?.textContent?.trim()).toBe(
        'Mon, 15 Jun · stop 2, until Tue, 16 Jun.',
      );
      const title = host.querySelector('[data-testid="bv-title"]')!;
      expect(title.compareDocumentPosition(byId(host, 'booking-today')!)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(
        byId(host, 'booking-today')!.compareDocumentPosition(byId(host, 'booking-code')!),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      await expectNoAxeViolations(host);
    });

    it('dims the stops that have passed, marks today’s and the next move', async () => {
      const fixture = await render(stubService({ detail: STAY_TODAY }));
      const [past, today, next] = stops(fixture.nativeElement as HTMLElement);

      expect(past.dataset['stopState']).toBe('past');
      expect(past.classList.contains('text-riv-card-ink-faint')).toBe(true);
      expect(past.getAttribute('aria-current')).toBeNull();
      expect(today.dataset['stopState']).toBe('today');
      expect(today.getAttribute('aria-current')).toBe('true');
      expect(today.querySelector('[data-testid="view-stop-today"]')?.textContent).toBe('today');
      expect(next.dataset['stopState']).toBe('next');
      expect(next.querySelector('[data-testid="view-stop-next"]')?.textContent).toBe('next');
      expect(next.classList.contains('text-riv-card-ink-faint')).toBe(false);
    });

    it('on the last day of a stop, names tomorrow’s spot and marks that stop as tomorrow', async () => {
      const fixture = await render(stubService({ detail: STAY_MOVES_TOMORROW }));
      const host = fixture.nativeElement as HTMLElement;

      expect(byId(host, 'booking-today-spot')?.textContent?.trim()).toBe(
        'Front row · Sea view · spot 5',
      );
      expect(byId(host, 'booking-today-note')?.textContent?.trim()).toBe(
        'Mon, 15 Jun · stop 2. Tomorrow you move to Second row · spot 1.',
      );
      expect(stops(host)[2].querySelector('[data-testid="view-stop-next"]')?.textContent).toBe(
        'tomorrow',
      );
    });

    it('on the stay’s last day, says so', async () => {
      const lastDay: BookingDetail = {
        ...STAY_TODAY,
        bookingDate: '2026-06-10',
        lastDate: '2026-06-15',
        stretches: STAY_TODAY.stretches!.map((stretch, i) => ({
          ...stretch,
          firstDate: ['2026-06-10', '2026-06-12', '2026-06-14'][i],
          lastDate: ['2026-06-11', '2026-06-13', '2026-06-15'][i],
        })),
      };
      const fixture = await render(stubService({ detail: lastDay }));
      const host = fixture.nativeElement as HTMLElement;

      expect(byId(host, 'booking-today-spot')?.textContent?.trim()).toBe('Second row · spot 1');
      expect(byId(host, 'booking-today-note')?.textContent?.trim()).toBe(
        'Mon, 15 Jun · stop 3. Last day of your stay.',
      );
      expect(stops(host).map((li) => li.dataset['stopState'])).toEqual(['past', 'past', 'today']);
    });

    it('before the stay starts, leads with the first spot and its date, with no stop marked', async () => {
      const fixture = await render(stubService({ detail: STAY_MOVED }));
      const host = fixture.nativeElement as HTMLElement;

      expect(byId(host, 'booking-today')?.textContent).toContain('Your first spot');
      expect(byId(host, 'booking-today-spot')?.textContent?.trim()).toBe(
        'Front row · Sea view · spot 2',
      );
      expect(byId(host, 'booking-today-note')?.textContent?.trim()).toBe(
        'From Tue, 1 Dec — stop 1 of your stay.',
      );
      expect(stops(host).map((li) => li.dataset['stopState'])).toEqual(['later', 'later']);
      expect(byId(host, 'view-stop-next')).toBeNull();
    });

    const over: BookingDetail = {
      ...STAY_TODAY,
      status: 'COMPLETED',
      stretches: STAY_TODAY.stretches!.map((stretch) => ({
        ...stretch,
        firstDate: '2026-06-01',
        lastDate: '2026-06-02',
      })),
    };
    const cancelled: BookingDetail = { ...STAY_TODAY, status: 'CANCELLED', cancelReason: 'POLICY' };

    it.each([
      ['a lone booking', DETAIL],
      ['a cancelled stay', cancelled],
      ['a stay already over', over],
    ])('shows no lead for %s', async (_name, detail) => {
      const fixture = await render(stubService({ detail }));
      expect(byId(fixture.nativeElement as HTMLElement, 'booking-today')).toBeNull();
    });
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
    expect(panel?.textContent).toContain('payment deadline for this booking has passed');
    expect(panel?.textContent).toContain('can no longer be paid');
    // The trigger is the pay deadline, not the service day having started.
    expect(panel?.textContent).not.toContain('has already started');
    // Deadline-only flag: a payment may be in flight, so no "you weren't charged" claim.
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

  it('says the set went to another guest when a request was declined for that reason', async () => {
    const fixture = await render(
      stubService({
        detail: {
          ...DETAIL,
          status: 'DECLINED',
          cancellable: false,
          declineReason: 'ANOTHER_GUEST',
        },
      }),
    );
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="declined-reason"]')
        ?.textContent,
    ).toContain('gave this set to another guest');
  });

  it('says the set was no longer available when the accept could not claim it', async () => {
    const fixture = await render(
      stubService({
        detail: {
          ...DETAIL,
          status: 'DECLINED',
          cancellable: false,
          declineReason: 'SET_UNAVAILABLE',
        },
      }),
    );
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="declined-reason"]')
        ?.textContent,
    ).toContain('no longer available for that day');
  });

  it('tells a waiting guest of a stay that the venue answers the whole stay', async () => {
    const pending = await render(stubService({ detail: { ...PENDING, lastDate: '2026-12-03' } }));
    const panel = (pending.nativeElement as HTMLElement).querySelector(
      '[data-testid="request-pending"]',
    );
    expect(panel?.textContent).toContain('accept or decline your whole stay');
  });

  it('a pending stitched stay lists its stops, says the spots are not held, and can be withdrawn (#1267)', async () => {
    const pending = await render(
      stubService({
        detail: {
          ...STAY_MOVED,
          status: 'PENDING_REQUEST',
          cancellable: false,
          withdrawable: true,
          requestExpiresAt: '2026-11-30T16:00:00Z',
          stretches: STAY_MOVED.stretches!.map((stretch) => ({
            ...stretch,
            status: 'PENDING_REQUEST',
            move: null,
          })),
        },
      }),
    );
    const el = pending.nativeElement as HTMLElement;
    const panel = el.querySelector('[data-testid="request-pending"]')!;
    expect(panel.textContent).toContain('The spots aren’t held for you until then');
    expect(panel.textContent).toContain('accept or decline your whole stay');
    expect(panel.textContent).toContain('17:00');
    expect(el.querySelectorAll('[data-testid="view-stops"] li')).toHaveLength(2);
    expect(el.querySelector('[data-testid="withdraw-request"]')).not.toBeNull();
  });

  it('a declined stay names its days when the set was no longer available', async () => {
    const declined = await render(
      stubService({
        detail: {
          ...DETAIL,
          lastDate: '2026-12-03',
          status: 'DECLINED',
          cancellable: false,
          declineReason: 'SET_UNAVAILABLE',
        },
      }),
    );
    expect(
      (declined.nativeElement as HTMLElement).querySelector('[data-testid="declined-reason"]')
        ?.textContent,
    ).toContain('no longer available for those days');
  });

  it('tells a waiting guest the set is not held and others may request it', async () => {
    const fixture = await render(stubService({ detail: PENDING }));
    const panel = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="request-pending"]',
    );
    expect(panel?.textContent).toContain('isn’t held for you');
    expect(panel?.textContent).toContain('other guests can request it too');
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

    const mark = host.querySelector('[data-testid="request-accepted"] app-party-icon');
    expect(mark?.getAttribute('aria-hidden')).toBe('true');
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
    // The swap destroyed whatever held focus (WCAG 2.4.3) — the new booking's title takes it.
    expect(document.activeElement).toBe(host.querySelector('[data-testid="bv-title"]'));
  });

  it('parks focus on the failure card when the swapped-to booking fails to load', async () => {
    const paramMap$ = new BehaviorSubject(convertToParamMap({ code: 'AAAAAAAAAA' }));
    const service: Partial<BookingService> = {
      getByCode: (code: string) =>
        code === 'AAAAAAAAAA'
          ? of({ ...DETAIL, code: 'AAAAAAAAAA' })
          : throwError(() => new HttpErrorResponse({ status: 500 })),
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

    paramMap$.next(convertToParamMap({ code: 'BBBBBBBBBB' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.textContent).toContain('Couldn’t load your booking');
    expect(document.activeElement).toBe(host.querySelector('[data-testid="bv-title"]'));
  });

  it('parks focus on the not-found card when a swap arrives with no code', async () => {
    const paramMap$ = new BehaviorSubject(convertToParamMap({ code: 'AAAAAAAAAA' }));
    const service: Partial<BookingService> = {
      getByCode: () => of({ ...DETAIL, code: 'AAAAAAAAAA' }),
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

    paramMap$.next(convertToParamMap({}));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.textContent).toContain('Booking not found');
    expect(document.activeElement).toBe(host.querySelector('[data-testid="bv-title"]'));
  });

  // A reply for a code the route has since left must write nothing, or the page shows A while its actions target B.
  describe('superseded replies (#1289)', () => {
    const A: BookingDetail = { ...DETAIL, code: 'AAAAAAAAAA', venueName: 'Venue Alpha' };
    const B: BookingDetail = { ...DETAIL, code: 'BBBBBBBBBB', venueName: 'Venue Beta' };

    /** Every A request is held open on its subject; B is primed as find-a-booking does, then served from `of`. */
    function heldA() {
      const getA = new Subject<BookingDetail>();
      const cancelA = new Subject<Cancellation>();
      const withdrawA = new Subject<Withdrawal>();
      const reviewA = new Subject<void>();
      const getCalls: string[] = [];
      const cancelCalls: string[] = [];
      let prefetched: BookingDetail | undefined;
      const service: Partial<BookingService> = {
        getByCode: (code: string) => {
          getCalls.push(code);
          return code === A.code ? getA : of(B);
        },
        cancel: (code: string) => {
          cancelCalls.push(code);
          return code === A.code ? cancelA : of(CANCELLATION);
        },
        withdraw: (code: string) => (code === A.code ? withdrawA : of(WITHDRAWAL)),
        review: (code: string) => (code === A.code ? reviewA : of(undefined)),
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
      const prime = (d: BookingDetail) => (prefetched = d);
      return { service, getA, cancelA, withdrawA, reviewA, getCalls, cancelCalls, prime };
    }

    async function renderSwappable(service: Partial<BookingService>) {
      const paramMap$ = new BehaviorSubject(convertToParamMap({ code: A.code }));
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
      const settle = async () => {
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
      };
      await settle();
      const swapTo = async (code: string) => {
        paramMap$.next(convertToParamMap({ code }));
        await settle();
      };
      return { fixture, host: fixture.nativeElement as HTMLElement, settle, swapTo };
    }

    function text(host: HTMLElement, testId: string): string {
      return host.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? '';
    }

    it("keeps B on screen, and Cancel on B, when A's read lands after the swap", async () => {
      const held = heldA();
      const { host, settle, swapTo } = await renderSwappable(held.service);
      held.prime(B);
      await swapTo(B.code);

      held.getA.next(A);
      held.getA.complete();
      await settle();

      expect(text(host, 'booking-code')).toContain(B.code);
      expect(host.textContent).not.toContain('Venue Alpha');
      host.querySelector<HTMLButtonElement>('[data-testid="start-cancel"]')!.click();
      await settle();
      host.querySelector<HTMLButtonElement>('[data-testid="confirm-cancel"]')!.click();
      await settle();
      expect(held.cancelCalls).toEqual([B.code]);
    });

    it("drops A's first read after A→B→A, keeping the detail A's return rendered", async () => {
      const reads: Subject<BookingDetail>[] = [];
      let prefetched: BookingDetail | undefined;
      const service: Partial<BookingService> = {
        getByCode: () => {
          const read = new Subject<BookingDetail>();
          reads.push(read);
          return read;
        },
        takePrefetched: (code: string) => {
          const hit = prefetched?.code === code ? prefetched : undefined;
          prefetched = undefined;
          return hit;
        },
      };
      const { host, settle, swapTo } = await renderSwappable(service);
      prefetched = B;
      await swapTo(B.code);
      prefetched = A;
      await swapTo(A.code);

      reads[0].next({ ...A, venueName: 'Stale Alpha' });
      reads[0].complete();
      await settle();

      expect(reads).toHaveLength(1);
      expect(host.textContent).toContain('Venue Alpha');
      expect(host.textContent).not.toContain('Stale Alpha');
    });

    it.each([404, 500])(
      "keeps B's card when A's read fails with %i after the swap",
      async (status) => {
        const held = heldA();
        const { host, settle, swapTo } = await renderSwappable(held.service);
        held.prime(B);
        await swapTo(B.code);

        held.getA.error(new HttpErrorResponse({ status }));
        await settle();

        expect(text(host, 'booking-code')).toContain(B.code);
        expect(host.textContent).not.toContain('Booking not found');
        expect(host.textContent).not.toContain('Couldn’t load your booking');
      },
    );

    /** Loads A, presses Cancel and confirms, leaving A's cancel reply held open. */
    async function cancelOnA(held: ReturnType<typeof heldA>) {
      const rendered = await renderSwappable(held.service);
      held.getA.next(A);
      held.getA.complete();
      await rendered.settle();
      rendered.host.querySelector<HTMLButtonElement>('[data-testid="start-cancel"]')!.click();
      await rendered.settle();
      rendered.host.querySelector<HTMLButtonElement>('[data-testid="confirm-cancel"]')!.click();
      await rendered.settle();
      expect(held.cancelCalls).toEqual([A.code]);
      return rendered;
    }

    it("paints no cancellation on B, nor re-reads B, when A's cancel lands after the swap", async () => {
      const held = heldA();
      const { host, settle, swapTo } = await cancelOnA(held);
      held.prime(B);
      await swapTo(B.code);

      held.cancelA.next(CANCELLATION);
      held.cancelA.complete();
      await settle();

      expect(text(host, 'booking-code')).toContain(B.code);
      expect(text(host, 'cancel-result')).toBe('');
      expect(held.getCalls).toEqual([A.code]);
      expect(host.querySelector('[data-testid="start-cancel"]')).not.toBeNull();
    });

    it("paints no refusal on B, nor re-reads B, when A's cancel fails after the swap", async () => {
      const held = heldA();
      const { host, settle, swapTo } = await cancelOnA(held);
      held.prime(B);
      await swapTo(B.code);

      held.cancelA.error(new HttpErrorResponse({ status: 500 }));
      await settle();

      expect(text(host, 'cancel-result')).toBe('');
      expect(held.getCalls).toEqual([A.code]);
    });

    it("paints no withdrawal on B when A's withdraw lands after the swap", async () => {
      const held = heldA();
      const { host, settle, swapTo } = await renderSwappable(held.service);
      held.getA.next({ ...PENDING, code: A.code });
      held.getA.complete();
      await settle();
      host.querySelector<HTMLButtonElement>('[data-testid="withdraw-request"]')!.click();
      await settle();
      host.querySelector<HTMLButtonElement>('[data-testid="confirm-withdraw"]')!.click();
      await settle();
      held.prime(B);
      await swapTo(B.code);

      held.withdrawA.next(WITHDRAWAL);
      held.withdrawA.complete();
      await settle();

      expect(text(host, 'withdraw-result')).toBe('');
      expect(held.getCalls).toEqual([A.code]);
    });

    it("paints no review outcome on B when A's review lands after the swap", async () => {
      const held = heldA();
      const { host, settle, swapTo } = await renderSwappable(held.service);
      held.getA.next({ ...REVIEWABLE, code: A.code });
      held.getA.complete();
      await settle();
      host.querySelectorAll<HTMLElement>('[data-testid^="star-"]')[3].click();
      await settle();
      host.querySelector<HTMLButtonElement>('[data-testid="submit-review"]')!.click();
      await settle();
      held.prime({ ...REVIEWABLE, code: B.code });
      await swapTo(B.code);

      held.reviewA.next();
      held.reviewA.complete();
      await settle();

      expect(text(host, 'review-result')).toBe('');
      expect(held.getCalls).toEqual([A.code]);
    });
  });

  it('shows the loading card while the fetch is in flight', async () => {
    const fixture = await render({
      getByCode: () => NEVER,
      takePrefetched: () => undefined,
    });
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="bv-title"]')?.textContent).toContain(
      'Loading your booking',
    );
  });

  describe('review panel', () => {
    function stars(host: HTMLElement): HTMLElement[] {
      return [...host.querySelectorAll<HTMLElement>('[data-testid^="star-"]')];
    }

    it('offers the star radiogroup for a reviewable stay', async () => {
      const fixture = await render(stubService({ detail: REVIEWABLE }));
      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('[data-testid="review-panel"]')).not.toBeNull();
      expect(stars(host)).toHaveLength(5);
      await expectNoAxeViolations(host);
    });

    it('shows no review section at all for a stay that ended without a check-in', async () => {
      const fixture = await render(
        stubService({
          detail: { ...REVIEWABLE, status: 'CANCELLED', reviewPanel: { kind: 'NOT_COMPLETED' } },
        }),
      );
      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('[data-testid="review-panel"]')).toBeNull();
    });

    it('shows the inline star error, not the shared result region, when no star is picked', async () => {
      const reviewCalls: [string, SubmitReviewRequest][] = [];
      const fixture = await render(stubService({ detail: REVIEWABLE, reviewCalls }));
      const host = fixture.nativeElement as HTMLElement;

      host.querySelector<HTMLButtonElement>('[data-testid="submit-review"]')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(reviewCalls).toEqual([]);
      expect(host.querySelector('[data-testid="star-rating-error"]')?.textContent).toContain(
        'Pick a star rating.',
      );
      expect(host.querySelector('[data-testid="review-result"]')?.textContent?.trim()).toBe('');
    });

    it('submits the chosen rating and re-reads the booking', async () => {
      const reviewCalls: [string, SubmitReviewRequest][] = [];
      const getCalls: string[] = [];
      const fixture = await render(
        stubService({
          detail: REVIEWABLE,
          detailAfterCancel: REVIEWED,
          reviewCalls,
          getCalls,
        }),
      );
      const host = fixture.nativeElement as HTMLElement;

      stars(host)[3].click();
      fixture.detectChanges();
      host.querySelector<HTMLButtonElement>('[data-testid="submit-review"]')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(reviewCalls).toEqual([
        ['ABCD234567', { stars: 4, comment: null, displayName: 'Ana' }],
      ]);
      expect(getCalls).toHaveLength(2);
      expect(host.querySelector('[data-testid="own-review"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="review-result"]')?.textContent).toContain(
        'Thanks for reviewing your stay.',
      );
    });

    it('sends an edited review and narrates it in the result region', async () => {
      const updateCalls: [string, SubmitReviewRequest][] = [];
      const getCalls: string[] = [];
      const fixture = await render(stubService({ detail: REVIEWED, updateCalls, getCalls }));
      const host = fixture.nativeElement as HTMLElement;

      host.querySelector<HTMLButtonElement>('[data-testid="edit-review"]')!.click();
      fixture.detectChanges();
      stars(host)[1].click();
      fixture.detectChanges();
      host.querySelector<HTMLButtonElement>('[data-testid="submit-review"]')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(updateCalls).toEqual([
        ['ABCD234567', { stars: 2, comment: 'Great sunbeds', displayName: 'Ana' }],
      ]);
      expect(getCalls).toHaveLength(2);
      expect(host.querySelector('[data-testid="review-result"]')?.textContent).toContain(
        'Your review has been updated.',
      );
    });

    it('removes a review once confirmed, and narrates that too', async () => {
      const deleteCalls: string[] = [];
      const fixture = await render(
        stubService({ detail: REVIEWED, detailAfterCancel: REVIEWABLE, deleteCalls }),
      );
      const host = fixture.nativeElement as HTMLElement;

      host.querySelector<HTMLButtonElement>('[data-testid="start-delete-review"]')!.click();
      fixture.detectChanges();
      host.querySelector<HTMLButtonElement>('[data-testid="confirm-delete-review"]')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(deleteCalls).toEqual(['ABCD234567']);
      expect(host.querySelector('[data-testid="review-result"]')?.textContent).toContain(
        'Your review has been removed.',
      );
      expect(host.querySelector('[data-testid="review-panel"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="own-review"]')).toBeNull();
    });

    it('closes the delete confirmation even when the re-read after it fails', async () => {
      const deleteCalls: string[] = [];
      const fixture = await render(
        stubService({ detail: REVIEWED, deleteCalls, refreshError: { status: 500 } }),
      );
      const host = fixture.nativeElement as HTMLElement;

      host.querySelector<HTMLButtonElement>('[data-testid="start-delete-review"]')!.click();
      fixture.detectChanges();
      host.querySelector<HTMLButtonElement>('[data-testid="confirm-delete-review"]')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(deleteCalls).toEqual(['ABCD234567']);
      expect(host.querySelector('[data-testid="review-result"]')?.textContent).toContain(
        'Your review has been removed.',
      );
      // The stale detail stays on screen by design; a live "Yes, remove it" under it must not.
      expect(host.querySelector('[data-testid="confirm-delete-question"]')).toBeNull();
      expect(host.querySelector('[data-testid="confirm-delete-review"]')).toBeNull();
    });

    it('says so when the review an amend targets is already gone', async () => {
      const fixture = await render(
        stubService({
          detail: REVIEWED,
          reviewError: new HttpErrorResponse({ status: 404, error: { code: 'NO_SUCH_REVIEW' } }),
        }),
      );
      const host = fixture.nativeElement as HTMLElement;

      host.querySelector<HTMLButtonElement>('[data-testid="start-delete-review"]')!.click();
      fixture.detectChanges();
      host.querySelector<HTMLButtonElement>('[data-testid="confirm-delete-review"]')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(host.querySelector('[data-testid="review-result"]')?.textContent).toContain(
        'no longer carries a review',
      );
    });

    it('treats a vanished booking as a settled refusal, not a retry', async () => {
      const fixture = await render(
        stubService({
          detail: REVIEWED,
          reviewError: new HttpErrorResponse({ status: 404, error: { code: 'NO_SUCH_BOOKING' } }),
        }),
      );
      const host = fixture.nativeElement as HTMLElement;

      host.querySelector<HTMLButtonElement>('[data-testid="start-delete-review"]')!.click();
      fixture.detectChanges();
      host.querySelector<HTMLButtonElement>('[data-testid="confirm-delete-review"]')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(host.querySelector('[data-testid="review-result"]')?.textContent).toContain(
        'couldn’t find a booking',
      );
      // Settled, so the confirm pair is gone — not left open behind a "try again".
      expect(host.querySelector('[data-testid="confirm-delete-review"]')).toBeNull();
    });

    it('renders the frozen review read-only, with no form and no actions', async () => {
      const fixture = await render(
        stubService({
          detail: {
            ...REVIEWABLE,
            reviewPanel: {
              kind: 'FROZEN',
              review: { stars: 5, comment: 'Perfect day', displayName: 'Ana' },
            },
          },
        }),
      );
      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('[data-testid="own-review-comment"]')?.textContent).toContain(
        'Perfect day',
      );
      expect(host.querySelector('[data-testid="submit-review"]')).toBeNull();
      expect(host.querySelector('[data-testid="edit-review"]')).toBeNull();
    });

    it('says so when a rating this stay already carries is submitted again', async () => {
      const fixture = await render(
        stubService({
          detail: REVIEWABLE,
          reviewError: new HttpErrorResponse({
            status: 409,
            error: { code: 'REVIEW_ALREADY_SUBMITTED' },
          }),
        }),
      );
      const host = fixture.nativeElement as HTMLElement;

      stars(host)[4].click();
      fixture.detectChanges();
      host.querySelector<HTMLButtonElement>('[data-testid="submit-review"]')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(host.querySelector('[data-testid="review-result"]')?.textContent).toContain(
        'already been rated',
      );
    });

    it('replaces the thanks with the rejection when a second submit is refused', async () => {
      // A failed re-read leaves the panel up; the 409 that follows must outrank the stale thanks.
      const service = stubService({ detail: REVIEWABLE });
      let attempt = 0;
      service.review = () => {
        attempt += 1;
        return attempt === 1
          ? of(undefined)
          : throwError(
              () =>
                new HttpErrorResponse({
                  status: 409,
                  error: { code: 'REVIEW_ALREADY_SUBMITTED' },
                }),
            );
      };
      const fixture = await render(service);
      const host = fixture.nativeElement as HTMLElement;

      const submit = async () => {
        host.querySelector<HTMLButtonElement>('[data-testid="submit-review"]')!.click();
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
      };

      stars(host)[4].click();
      fixture.detectChanges();
      await submit();
      expect(host.querySelector('[data-testid="review-result"]')?.textContent).toContain('Thanks');
      expect(document.activeElement).toBe(host.querySelector('[data-testid="review-result"]'));

      stars(host)[4].click();
      fixture.detectChanges();
      await submit();

      const result = host.querySelector('[data-testid="review-result"]')?.textContent;
      expect(result).toContain('already been rated');
      expect(result).not.toContain('Thanks');
    });

    it('offers a retry after a transport failure', async () => {
      const fixture = await render(
        stubService({ detail: REVIEWABLE, reviewError: new HttpErrorResponse({ status: 0 }) }),
      );
      const host = fixture.nativeElement as HTMLElement;

      stars(host)[0].click();
      fixture.detectChanges();
      host.querySelector<HTMLButtonElement>('[data-testid="submit-review"]')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(host.querySelector('[data-testid="review-result"]')?.textContent).toContain(
        'Please try again',
      );
      expect(host.querySelector('[data-testid="review-panel"]')).not.toBeNull();
    });

    it('leaves focus on the confirm pair after a retryable delete failure', async () => {
      const fixture = await render(
        stubService({ detail: REVIEWED, reviewError: new HttpErrorResponse({ status: 500 }) }),
      );
      const host = fixture.nativeElement as HTMLElement;

      host.querySelector<HTMLButtonElement>('[data-testid="start-delete-review"]')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const confirm = host.querySelector<HTMLButtonElement>(
        '[data-testid="confirm-delete-review"]',
      )!;
      expect(document.activeElement).toBe(confirm);

      confirm.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(host.querySelector('[data-testid="review-result"]')?.textContent).toContain(
        'Please try again',
      );
      // Retryable, so the pair survives — and keeps focus rather than losing it to the live region.
      expect(host.querySelector('[data-testid="confirm-delete-review"]')).toBe(confirm);
      expect(document.activeElement).toBe(confirm);
    });
  });
});
