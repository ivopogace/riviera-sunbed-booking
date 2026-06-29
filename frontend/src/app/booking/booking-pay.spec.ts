import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { environment } from '../../environments/environment';
import { AwaitingPayment, BookingDetail, CreateBookingRequest } from './booking.model';
import { BookingService } from './booking.service';
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
  beforeCutoff: true,
  refundIfCancelledNow: { minorUnits: 4500, currency: 'EUR' },
  refundedAmount: null,
};

const CREATE_URL = `${environment.apiBaseUrl}/api/bookings`;
const STATUS_URL = `${environment.apiBaseUrl}/api/bookings/WXYZ345678`;

/** A fake gateway: no real Stripe.js. `confirmResult` drives success vs decline; `failMount`
 *  simulates a mount/config failure. `mounted` records whether the element was mounted. */
class FakeGateway extends StripePaymentGateway {
  confirmResult: { error?: string } = {};
  failMount?: string;
  mounted = false;

  override async mountPaymentElement(host: HTMLElement): Promise<StripeCheckout> {
    if (this.failMount) {
      throw new Error(this.failMount);
    }
    this.mounted = true;
    host.appendChild(document.createElement('div')); // stand-in for the Stripe iframe
    return { confirm: async () => this.confirmResult };
  }
}

interface PayProbe {
  state(): string;
  errorMessage(): string | undefined;
  terminalError(): boolean;
  pay(): Promise<void>;
}

async function setup(
  gateway: FakeGateway,
  { prime = true }: { prime?: boolean } = {},
): Promise<{ fixture: ComponentFixture<BookingPay>; httpMock: HttpTestingController; comp: PayProbe }> {
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
    TestBed.inject(BookingService).createBooking(REQUEST).subscribe();
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

  it('mounts the Payment Element and becomes ready', async () => {
    const gateway = new FakeGateway();
    const { comp } = await setup(gateway);

    expect(gateway.mounted).toBe(true);
    expect(comp.state()).toBe('ready');
  });

  it('surfaces a mount/config failure as the error state', async () => {
    const gateway = new FakeGateway();
    gateway.failMount = 'Stripe publishable key is not configured.';
    const { comp } = await setup(gateway);

    expect(comp.state()).toBe('error');
    expect(comp.errorMessage()).toMatch(/publishable key/i);
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
      vi.useRealTimers();
    }
  });

  it('declined card → retry state, and never starts polling (no false confirm)', async () => {
    const gateway = new FakeGateway();
    gateway.confirmResult = { error: 'Your card was declined.' };
    const { comp, httpMock } = await setup(gateway);

    await comp.pay();

    expect(comp.state()).toBe('error');
    expect(comp.errorMessage()).toContain('declined');
    httpMock.expectNone(STATUS_URL); // the Stripe.js failure never triggers a status poll
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
      vi.useRealTimers();
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
        httpMock.match(STATUS_URL).forEach((r) => r.flush({ ...DETAIL, status: 'AWAITING_PAYMENT' }));
        if (comp.state() === 'awaiting') {
          break;
        }
      }

      expect(comp.state()).toBe('awaiting');
      expect(comp.state()).not.toBe('confirmed');
      httpMock.verify();
    } finally {
      vi.useRealTimers();
    }
  });
});
