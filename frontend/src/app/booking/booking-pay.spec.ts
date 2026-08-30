import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { environment } from '../../environments/environment';
import {
  AwaitingPayment,
  BookingDetail,
  CancellationTerms,
  CreateBookingRequest,
} from './booking.model';
import { BookingService } from './booking.service';
import { freezeClock } from '../../testing/freeze-clock';
import { BookingPay } from './booking-pay';
import { StripeCheckout, StripePaymentGateway } from './stripe-payment.gateway';

const REQUEST: CreateBookingRequest = {
  setId: 2,
  bookingDate: '2026-12-01',
  contact: { email: 'a@b.com', fullName: 'Ana', phone: '+355600' },
};

const AWAITING: AwaitingPayment = {
  code: 'WXYZ345678',
  status: 'AWAITING_PAYMENT',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  setId: 2,
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  clientSecret: 'pi_123_secret_abc',
  paymentIntentId: 'pi_123',
};

const DETAIL: BookingDetail = {
  code: 'WXYZ345678',
  status: 'AWAITING_PAYMENT',
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
  reviewPanel: { kind: 'NOT_COMPLETED' },
};

const CREATE_URL = `${environment.apiBaseUrl}/api/bookings`;
const STATUS_URL = `${environment.apiBaseUrl}/api/bookings/WXYZ345678`;

/** A fake gateway: no real Stripe.js. `confirmResult` drives success vs decline; `failMount`
 *  simulates a mount/config failure. `mounted` records whether the element was mounted. */
class FakeGateway extends StripePaymentGateway {
  confirmResult: { error?: string } = {};
  failMount?: string;
  mounted = false;

  override mountPaymentElement(host: HTMLElement): Promise<StripeCheckout> {
    if (this.failMount) {
      return Promise.reject(new Error(this.failMount));
    }
    this.mounted = true;
    host.appendChild(document.createElement('div')); // stand-in for the Stripe iframe
    return Promise.resolve({ confirm: () => Promise.resolve(this.confirmResult) });
  }
}

/** A gateway whose confirm promises resolve only when the test says so — for racing interleaves. */
class DeferredConfirmGateway extends StripePaymentGateway {
  private readonly resolvers: ((r: { error?: string }) => void)[] = [];

  override mountPaymentElement(host: HTMLElement): Promise<StripeCheckout> {
    host.appendChild(document.createElement('div'));
    return Promise.resolve({
      confirm: () => new Promise<{ error?: string }>((resolve) => this.resolvers.push(resolve)),
    });
  }

  resolveNextConfirm(result: { error?: string }): void {
    this.resolvers.shift()?.(result);
  }
}

interface PayProbe {
  state(): string;
  errorMessage(): string | undefined;
  terminalError(): boolean;
  pay(): Promise<void>;
}

async function setup(
  gateway: StripePaymentGateway,
  { prime = true, terms }: { prime?: boolean; terms?: CancellationTerms } = {},
): Promise<{
  fixture: ComponentFixture<BookingPay>;
  httpMock: HttpTestingController;
  comp: PayProbe;
}> {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: StripePaymentGateway, useValue: gateway },
    ],
  });
  const httpMock = TestBed.inject(HttpTestingController);
  if (prime) {
    // Prime the awaiting-payment hand-off exactly as a 202 booking-create would.
    TestBed.inject(BookingService).createBooking(REQUEST, terms).subscribe();
    httpMock.expectOne(CREATE_URL).flush(AWAITING, { status: 202, statusText: 'Accepted' });
  }
  const fixture = TestBed.createComponent(BookingPay);
  await fixture.whenStable(); // run afterNextRender → mount the Payment Element
  return { fixture, httpMock, comp: fixture.componentInstance as unknown as PayProbe };
}

describe('BookingPay', () => {
  it('shows the start-over state on a cold load with no hand-off (hard refresh)', async () => {
    const gateway = new FakeGateway();
    const { comp } = await setup(gateway, { prime: false });

    expect(comp.state()).toBe('missing');
    expect(gateway.mounted).toBe(false);
  });

  it('repeats the checkout-quoted terms beside the order summary (#795)', async () => {
    const { fixture } = await setup(new FakeGateway(), {
      terms: {
        window: 'CLOSED',
        freeCancellationEndsAt: '2026-11-30T17:00:00Z',
        lateCancelRefundBps: 0,
      },
    });
    const note = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="cancellation-terms-note"]',
    );
    expect(note?.textContent).toContain('Non-refundable last-minute booking');
  });

  it('renders no cancellation claim when the hand-off carries no terms (#795)', async () => {
    const { fixture } = await setup(new FakeGateway());
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="cancellation-terms-note"]',
      ),
    ).toBeNull();
  });

  it('mounts the Payment Element and becomes ready', async () => {
    const gateway = new FakeGateway();
    const { comp } = await setup(gateway);

    expect(gateway.mounted).toBe(true);
    expect(comp.state()).toBe('ready');
  });

  it('shows the legal agreement links with the pay action (#101 Slice 3)', async () => {
    const { fixture } = await setup(new FakeGateway());
    const el = fixture.nativeElement as HTMLElement;

    const notice = el.querySelector('[data-testid="legal-agreement"]');
    const terms = notice?.querySelector<HTMLAnchorElement>('[data-testid="legal-terms-link"]');
    const privacy = notice?.querySelector<HTMLAnchorElement>('[data-testid="legal-privacy-link"]');
    expect(terms?.getAttribute('href')).toBe('/legal/terms');
    expect(privacy?.getAttribute('href')).toBe('/legal/privacy');
    for (const link of [terms, privacy]) {
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toContain('noopener');
    }
  });

  it('surfaces a mount/config failure as the error state (still payable → retryable)', async () => {
    const gateway = new FakeGateway();
    gateway.failMount = 'Stripe publishable key is not configured.';
    const { comp, httpMock } = await setup(gateway);

    expect(comp.state()).toBe('error');
    expect(comp.errorMessage()).toMatch(/publishable key/i);
    // The failure triggers ONE status re-check; still AWAITING_PAYMENT → retry in place.
    httpMock.expectOne(STATUS_URL).flush(DETAIL);
    expect(comp.terminalError()).toBe(false);
    httpMock.verify();
  });

  it('mount failure on a booking the sweep cancelled → terminal, with a link back to the booking (#126)', async () => {
    const gateway = new FakeGateway();
    gateway.failMount = 'This PaymentIntent has been canceled.';
    const { comp, fixture, httpMock } = await setup(gateway);

    httpMock.expectOne(STATUS_URL).flush({ ...DETAIL, status: 'CANCELLED' });
    expect(comp.state()).toBe('error');
    expect(comp.terminalError()).toBe(true);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(
      host
        .querySelector<HTMLAnchorElement>('[data-testid="booking-status-link"]')
        ?.getAttribute('href'),
    ).toBe('/booking/WXYZ345678');
    httpMock.verify();
  });

  it('stays processing until the backend reports CONFIRMED, then shows confirmed', async () => {
    const gateway = new FakeGateway(); // confirm succeeds
    const { comp, httpMock } = await setup(gateway); // reach 'ready' on real timers
    vi.useFakeTimers();
    try {
      await comp.pay();
      expect(comp.state()).toBe('processing');

      // First poll → still AWAITING_PAYMENT: must NOT confirm (invariant #8).
      await vi.advanceTimersByTimeAsync(0);
      httpMock.expectOne(STATUS_URL).flush({ ...DETAIL, status: 'AWAITING_PAYMENT' });
      expect(comp.state()).toBe('processing');

      // Next poll → CONFIRMED (webhook landed) → confirmed view.
      await vi.advanceTimersByTimeAsync(1500);
      httpMock.expectOne(STATUS_URL).flush({ ...DETAIL, status: 'CONFIRMED' });
      expect(comp.state()).toBe('confirmed');

      httpMock.verify();
    } finally {
      freezeClock();
    }
  });

  it('shows the withheld-email notice once confirmed, and announces it (#390)', async () => {
    const gateway = new FakeGateway();
    const { comp, fixture, httpMock } = await setup(gateway);
    vi.useFakeTimers();
    try {
      await comp.pay();
      await vi.advanceTimersByTimeAsync(0);
      httpMock.expectOne(STATUS_URL).flush({ ...DETAIL, status: 'CONFIRMED', emailWithheld: true });
      expect(comp.state()).toBe('confirmed');
      fixture.detectChanges();

      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelector('[data-testid="email-withheld"]')?.textContent).toContain(
        'We couldn’t email you.',
      );
      // The page's ONE persistent live region carries it — a region created with the done panel
      // would never announce its initial text.
      expect(host.querySelector('[data-testid="pay-status"]')?.textContent).toContain(
        'save your booking code',
      );

      httpMock.verify();
    } finally {
      freezeClock();
    }
  });

  it('omits the withheld-email notice when the confirmation mail was sent', async () => {
    const gateway = new FakeGateway();
    const { comp, fixture, httpMock } = await setup(gateway);
    vi.useFakeTimers();
    try {
      await comp.pay();
      await vi.advanceTimersByTimeAsync(0);
      httpMock.expectOne(STATUS_URL).flush({ ...DETAIL, status: 'CONFIRMED' });
      fixture.detectChanges();

      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelector('[data-testid="email-withheld"]')).toBeNull();
      expect(host.querySelector('[data-testid="pay-status"]')?.textContent).toContain(
        'Your booking is confirmed.',
      );

      httpMock.verify();
    } finally {
      freezeClock();
    }
  });

  it('declined card → retry state after ONE status re-check, and never starts polling (no false confirm)', async () => {
    const gateway = new FakeGateway();
    gateway.confirmResult = { error: 'Your card was declined.' };
    const { comp, httpMock } = await setup(gateway);

    await comp.pay();

    expect(comp.state()).toBe('error');
    expect(comp.errorMessage()).toContain('declined');
    // The re-check is a single GET, not a poll; still AWAITING_PAYMENT → retry in place.
    httpMock.expectOne(STATUS_URL).flush(DETAIL);
    expect(comp.terminalError()).toBe(false);
    httpMock.verify(); // nothing further in flight — no poll loop began
  });

  it('confirm failure on a booking the sweep cancelled → terminal, no retry loop (#126)', async () => {
    const gateway = new FakeGateway();
    gateway.confirmResult = { error: 'This PaymentIntent has been canceled.' };
    const { comp, httpMock } = await setup(gateway);

    await comp.pay();

    httpMock.expectOne(STATUS_URL).flush({ ...DETAIL, status: 'CANCELLED' });
    expect(comp.state()).toBe('error');
    expect(comp.terminalError()).toBe(true);
    expect(comp.errorMessage()).toMatch(/no longer be paid/i);
    httpMock.verify();
  });

  it('confirm failure but the webhook already confirmed → adopts the confirmed state (#126)', async () => {
    const gateway = new FakeGateway();
    gateway.confirmResult = { error: 'Something went sideways client-side.' };
    const { comp, httpMock } = await setup(gateway);

    await comp.pay();

    // Server truth outranks the client error report (invariant #8) — the booking IS paid.
    httpMock.expectOne(STATUS_URL).flush({ ...DETAIL, status: 'CONFIRMED' });
    expect(comp.state()).toBe('confirmed');
    expect(comp.errorMessage()).toBeUndefined();
    httpMock.verify();
  });

  it('a late confirm error cannot downgrade a page the re-check already confirmed (#126)', async () => {
    const gateway = new DeferredConfirmGateway();
    const { comp, httpMock } = await setup(gateway);

    const firstPay = comp.pay();
    gateway.resolveNextConfirm({ error: 'Your card was declined.' });
    await firstPay; // error state; re-check A is now in flight

    const secondPay = comp.pay(); // the user retries while A is still unanswered
    httpMock.expectOne(STATUS_URL).flush({ ...DETAIL, status: 'CONFIRMED' }); // the webhook won
    expect(comp.state()).toBe('confirmed');

    // Stripe errors when confirming an already-succeeded intent — it must not write backwards.
    gateway.resolveNextConfirm({ error: 'This PaymentIntent has already succeeded.' });
    await secondPay;

    expect(comp.state()).toBe('confirmed');
    expect(comp.errorMessage()).toBeUndefined();
    httpMock.verify();
  });

  it('a failed re-check leaves the retry-in-place state untouched (#126)', async () => {
    const gateway = new FakeGateway();
    gateway.confirmResult = { error: 'Your card was declined.' };
    const { comp, httpMock } = await setup(gateway);

    await comp.pay();

    httpMock.expectOne(STATUS_URL).flush(null, { status: 500, statusText: 'Server Error' });
    expect(comp.state()).toBe('error');
    expect(comp.terminalError()).toBe(false);
    expect(comp.errorMessage()).toContain('declined');
    httpMock.verify();
  });

  it('a server-side CANCELLED (failed payment) → terminal error, never confirmed or awaiting', async () => {
    const gateway = new FakeGateway();
    const { comp, httpMock } = await setup(gateway);
    vi.useFakeTimers();
    try {
      await comp.pay();
      // The verified PaymentCanceled webhook flipped the booking to CANCELLED.
      await vi.advanceTimersByTimeAsync(0);
      httpMock.expectOne(STATUS_URL).flush({ ...DETAIL, status: 'CANCELLED' });

      expect(comp.state()).toBe('error');
      expect(comp.terminalError()).toBe(true);
      expect(comp.errorMessage()).toMatch(/cancelled/i);
      // It must NOT be misreported as confirmed or "payment received".
      expect(comp.state()).not.toBe('confirmed');
      expect(comp.state()).not.toBe('awaiting');
      httpMock.verify();
    } finally {
      freezeClock();
    }
  });

  it('webhook lag past the poll window → awaiting state, never confirmed', async () => {
    const gateway = new FakeGateway();
    const { comp, httpMock } = await setup(gateway); // reach 'ready' on real timers
    vi.useFakeTimers();
    try {
      await comp.pay();
      for (let t = 0; t <= 30_000; t += 1500) {
        await vi.advanceTimersByTimeAsync(t === 0 ? 0 : 1500);
        httpMock
          .match(STATUS_URL)
          .forEach((r) => r.flush({ ...DETAIL, status: 'AWAITING_PAYMENT' }));
        if (comp.state() === 'awaiting') {
          break;
        }
      }

      expect(comp.state()).toBe('awaiting');
      expect(comp.state()).not.toBe('confirmed');
      httpMock.verify();
    } finally {
      freezeClock();
    }
  });
});
