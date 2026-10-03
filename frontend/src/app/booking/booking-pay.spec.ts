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
  move: null,
  reviewPanel: { kind: 'NOT_COMPLETED' },
};

const CREATE_URL = `${environment.apiBaseUrl}/api/bookings`;
const STATUS_URL = `${environment.apiBaseUrl}/api/bookings/WXYZ345678`;

/** A fake gateway: no real Stripe.js. `confirmResult` drives success vs decline, `confirmRejects`
 *  a thrown confirm; `failMount` simulates a mount/config failure. `mountCalls` counts attempts. */
class FakeGateway extends StripePaymentGateway {
  confirmResult: { error?: string } = {};
  confirmRejects?: Error;
  failMount?: string;
  mounted = false;
  mountCalls = 0;

  override mountPaymentElement(host: HTMLElement): Promise<StripeCheckout> {
    this.mountCalls++;
    if (this.failMount) {
      return Promise.reject(new Error(this.failMount));
    }
    this.mounted = true;
    host.appendChild(document.createElement('div')); // stand-in for the Stripe iframe
    return Promise.resolve({
      confirm: () =>
        this.confirmRejects
          ? Promise.reject(this.confirmRejects)
          : Promise.resolve(this.confirmResult),
    });
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

/** A gateway whose first mount fails and whose later mounts resolve only when the test says so. */
class DeferredRemountGateway extends StripePaymentGateway {
  private resolveMount?: () => void;

  override mountPaymentElement(host: HTMLElement): Promise<StripeCheckout> {
    if (!this.resolveMount) {
      this.resolveMount = () => undefined;
      return Promise.reject(new Error('Stripe.js failed to load.'));
    }
    return new Promise<StripeCheckout>((resolve) => {
      this.resolveMount = () => {
        host.appendChild(document.createElement('div'));
        resolve({ confirm: () => Promise.resolve({}) });
      };
    });
  }

  finishMount(): void {
    this.resolveMount?.();
  }
}

/** Its confirm blurs the page as Stripe's 3DS modal does: mounted on `<body>`, focus gone on close. */
class ThreeDsOverlayGateway extends FakeGateway {
  override async mountPaymentElement(host: HTMLElement): Promise<StripeCheckout> {
    const checkout = await super.mountPaymentElement(host);
    return {
      confirm: () => {
        (document.activeElement as HTMLElement | null)?.blur();
        return checkout.confirm();
      },
    };
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

  it('Try again after a mount failure re-mounts the element and reaches ready (#1286)', async () => {
    const gateway = new FakeGateway();
    gateway.failMount = 'Stripe.js failed to load.';
    const { comp, fixture, httpMock } = await setup(gateway);
    httpMock.expectOne(STATUS_URL).flush(DETAIL); // still payable → retry in place
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const button = host.querySelector<HTMLButtonElement>('[data-testid="pay-button"]')!;
    expect(button.textContent).toContain('Try again');

    gateway.failMount = undefined; // the network came back
    button.click();
    await fixture.whenStable();

    expect(gateway.mountCalls).toBe(2);
    expect(comp.state()).toBe('ready');
    expect(comp.errorMessage()).toBeUndefined();
    // The same button stays in the DOM through the re-mount, so focus is never stranded.
    expect(host.querySelector('[data-testid="pay-button"]')).toBe(button);
    expect(button.textContent).toContain('Pay');
    httpMock.verify();
  });

  it('a re-mount that fails again returns to the retryable error state (#1286)', async () => {
    const gateway = new FakeGateway();
    gateway.failMount = 'Stripe.js failed to load.';
    const { comp, fixture, httpMock } = await setup(gateway);
    httpMock.expectOne(STATUS_URL).flush(DETAIL);
    fixture.detectChanges();

    gateway.failMount = 'Still offline.';
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="pay-button"]')!
      .click();
    await fixture.whenStable();

    expect(gateway.mountCalls).toBe(2);
    expect(comp.state()).toBe('error');
    expect(comp.errorMessage()).toBe('Still offline.');
    httpMock.expectOne(STATUS_URL).flush(DETAIL);
    expect(comp.terminalError()).toBe(false);
    httpMock.verify();
  });

  it('a rejected confirm clears the busy button and shows a retryable error (#1286)', async () => {
    const gateway = new FakeGateway();
    gateway.confirmRejects = new Error('IntegrationError: return_url is required.');
    const { comp, fixture, httpMock } = await setup(gateway);

    await comp.pay();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const button = host.querySelector<HTMLButtonElement>('[data-testid="pay-button"]')!;
    expect(button.getAttribute('aria-disabled')).toBeNull();
    expect(button.textContent).toContain('Try again');
    expect(comp.state()).toBe('error');
    expect(host.querySelector('[data-testid="pay-error"]')?.textContent).toMatch(
      /couldn.t be completed/i,
    );
    // One server re-check, never a poll: the client's failure is not the payment's verdict (#8).
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

  it('a late clean confirm cannot pull a page the re-check confirmed back to processing (#1380)', async () => {
    const gateway = new DeferredConfirmGateway();
    const { comp, httpMock } = await setup(gateway);
    vi.useFakeTimers();
    try {
      const firstPay = comp.pay();
      gateway.resolveNextConfirm({ error: 'Your card was declined.' });
      await firstPay; // error state; the re-check is now in flight

      const secondPay = comp.pay(); // Try again, e.g. a slow 3DS challenge
      httpMock.expectOne(STATUS_URL).flush({ ...DETAIL, status: 'CONFIRMED' });
      expect(comp.state()).toBe('confirmed');

      gateway.resolveNextConfirm({});
      await secondPay;
      await vi.advanceTimersByTimeAsync(0);

      expect(comp.state()).toBe('confirmed');
      httpMock.verify(); // no poll started
    } finally {
      freezeClock();
    }
  });

  it('a late clean confirm cannot revive a page the re-check made terminal (#1380)', async () => {
    const gateway = new DeferredConfirmGateway();
    const { comp, httpMock } = await setup(gateway);
    vi.useFakeTimers();
    try {
      const firstPay = comp.pay();
      gateway.resolveNextConfirm({ error: 'Your card was declined.' });
      await firstPay;

      const secondPay = comp.pay();
      httpMock.expectOne(STATUS_URL).flush({ ...DETAIL, status: 'CANCELLED' });
      expect(comp.terminalError()).toBe(true);

      gateway.resolveNextConfirm({});
      await secondPay;
      await vi.advanceTimersByTimeAsync(0);

      expect(comp.state()).toBe('error');
      expect(comp.terminalError()).toBe(true);
      httpMock.verify();
    } finally {
      freezeClock();
    }
  });

  it('a re-check CONFIRMED during a re-mount is adopted, and the late mount keeps it (#1380)', async () => {
    const gateway = new DeferredRemountGateway();
    const { comp, httpMock } = await setup(gateway); // mount failed; re-check in flight

    const retry = comp.pay(); // Try again re-mounts
    expect(comp.state()).toBe('mounting');
    httpMock.expectOne(STATUS_URL).flush({ ...DETAIL, status: 'CONFIRMED' });
    expect(comp.state()).toBe('confirmed');

    gateway.finishMount();
    await retry;

    expect(comp.state()).toBe('confirmed');
    expect(comp.errorMessage()).toBeUndefined();
    httpMock.verify();
  });

  it('a terminal re-check answer during a re-mount is adopted, and the late mount keeps it (#1380)', async () => {
    const gateway = new DeferredRemountGateway();
    const { comp, fixture, httpMock } = await setup(gateway);

    const retry = comp.pay();
    httpMock.expectOne(STATUS_URL).flush({ ...DETAIL, status: 'CANCELLED' });
    expect(comp.state()).toBe('error');
    expect(comp.terminalError()).toBe(true);

    gateway.finishMount();
    await retry;
    fixture.detectChanges();

    expect(comp.state()).toBe('error');
    expect(comp.terminalError()).toBe(true);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="pay-button"]')).toBeNull();
    expect(host.querySelector('[data-testid="booking-status-link"]')).not.toBeNull();
    httpMock.verify();
  });

  it('a thrown confirm makes no claim about the card (#1380)', async () => {
    const gateway = new FakeGateway();
    gateway.confirmRejects = new Error('IntegrationError: return_url is required.');
    const { comp, fixture, httpMock } = await setup(gateway);

    await comp.pay();
    httpMock.expectOne(STATUS_URL).flush(DETAIL);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).not.toContain('wasn’t charged');
    expect(text).toContain('We couldn’t finish the payment.');
    httpMock.verify();
  });

  it('a declined card still says the card was not charged (#1380)', async () => {
    const gateway = new FakeGateway();
    gateway.confirmResult = { error: 'Your card was declined.' };
    const { comp, fixture, httpMock } = await setup(gateway);

    await comp.pay();
    httpMock.expectOne(STATUS_URL).flush(DETAIL);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Your card wasn’t charged.',
    );
    httpMock.verify();
  });

  describe('focus after a transition that removes the focused control (#1410)', () => {
    function byTestId(fixture: ComponentFixture<BookingPay>, id: string): HTMLElement | null {
      return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
        `[data-testid="${id}"]`,
      );
    }

    async function render(fixture: ComponentFixture<BookingPay>): Promise<void> {
      fixture.detectChanges();
      await fixture.whenStable();
    }

    function expectFocusOnTitle(fixture: ComponentFixture<BookingPay>, text: string): void {
      const title = byTestId(fixture, 'pay-title');
      expect(title?.textContent).toContain(text);
      expect(document.activeElement).toBe(title);
    }

    /** Pay pressed on a declined card: the page sits in retry-in-place with Try again focused. */
    async function declinedWithTryAgainFocused(gateway: FakeGateway) {
      gateway.confirmResult = { error: 'Your card was declined.' };
      const ctx = await setup(gateway);
      byTestId(ctx.fixture, 'pay-button')!.focus();
      await ctx.comp.pay();
      await render(ctx.fixture);
      return ctx;
    }

    it('Pay → processing focuses the processing heading', async () => {
      const { comp, fixture } = await setup(new FakeGateway());
      byTestId(fixture, 'pay-button')!.focus();

      await comp.pay();
      await render(fixture);

      expect(byTestId(fixture, 'pay-button')).toBeNull();
      expectFocusOnTitle(fixture, 'Confirming your booking');
    });

    it('Pay → processing focuses the heading when a 3DS overlay left focus on the body', async () => {
      const { comp, fixture } = await setup(new ThreeDsOverlayGateway());
      await render(fixture); // the wrapped mount settles a turn later
      byTestId(fixture, 'pay-button')!.focus();

      await comp.pay();
      await render(fixture);

      expectFocusOnTitle(fixture, 'Confirming your booking');
    });

    it('Try again → processing focuses the processing heading', async () => {
      const gateway = new FakeGateway();
      const { comp, fixture, httpMock } = await declinedWithTryAgainFocused(gateway);
      httpMock.expectOne(STATUS_URL).flush(DETAIL);

      gateway.confirmResult = {};
      await comp.pay();
      await render(fixture);

      expectFocusOnTitle(fixture, 'Confirming your booking');
    });

    it('a retry-in-place error keeps focus on the surviving Try again button', async () => {
      const { fixture, httpMock } = await declinedWithTryAgainFocused(new FakeGateway());
      httpMock.expectOne(STATUS_URL).flush(DETAIL);
      await render(fixture);

      expect(document.activeElement).toBe(byTestId(fixture, 'pay-button'));
    });

    describe('poll legs', () => {
      afterEach(() => freezeClock());

      async function processing() {
        const ctx = await setup(new FakeGateway());
        byTestId(ctx.fixture, 'pay-button')!.focus();
        vi.useFakeTimers();
        await ctx.comp.pay();
        await render(ctx.fixture);
        await vi.advanceTimersByTimeAsync(0);
        return ctx;
      }

      it('poll CONFIRMED focuses the confirmed heading', async () => {
        const { fixture, httpMock } = await processing();

        httpMock.expectOne(STATUS_URL).flush({ ...DETAIL, status: 'CONFIRMED' });
        await render(fixture);

        expectFocusOnTitle(fixture, 'You’re booked.');
      });

      it('poll CANCELLED focuses the terminal heading', async () => {
        const { fixture, httpMock } = await processing();

        httpMock.expectOne(STATUS_URL).flush({ ...DETAIL, status: 'CANCELLED' });
        await render(fixture);

        expectFocusOnTitle(fixture, 'Payment couldn’t be completed');
      });

      it('the poll window lapsing focuses the awaiting heading', async () => {
        const { comp, fixture, httpMock } = await processing();

        while (comp.state() !== 'awaiting') {
          httpMock
            .match(STATUS_URL)
            .forEach((r) => r.flush({ ...DETAIL, status: 'AWAITING_PAYMENT' }));
          await vi.advanceTimersByTimeAsync(1500);
        }
        await render(fixture);

        expectFocusOnTitle(fixture, 'Payment received');
      });
    });

    it('a re-check CONFIRMED focuses the confirmed heading', async () => {
      const { fixture, httpMock } = await declinedWithTryAgainFocused(new FakeGateway());

      httpMock.expectOne(STATUS_URL).flush({ ...DETAIL, status: 'CONFIRMED' });
      await render(fixture);

      expectFocusOnTitle(fixture, 'You’re booked.');
    });

    it('a terminal re-check focuses the terminal heading', async () => {
      const { fixture, httpMock } = await declinedWithTryAgainFocused(new FakeGateway());

      httpMock.expectOne(STATUS_URL).flush({ ...DETAIL, status: 'CANCELLED' });
      await render(fixture);

      expect(byTestId(fixture, 'pay-button')).toBeNull();
      expectFocusOnTitle(fixture, 'Payment couldn’t be completed');
    });

    it('a terminal re-check leaves focus on the Cancel link it keeps', async () => {
      const { fixture, httpMock } = await declinedWithTryAgainFocused(new FakeGateway());
      const cancel = byTestId(fixture, 'pay-cancel')!;
      cancel.focus();

      httpMock.expectOne(STATUS_URL).flush({ ...DETAIL, status: 'CANCELLED' });
      await render(fixture);

      expect(document.activeElement).toBe(cancel);
    });
  });
});
