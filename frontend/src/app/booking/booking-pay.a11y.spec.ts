import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EMPTY } from 'rxjs';

import { expectNoAxeViolations } from '../../testing/axe';
import { AwaitingPayment } from './booking.model';
import { BookingService } from './booking.service';
import { BookingPay } from './booking-pay';
import { StripeCheckout, StripePaymentGateway } from './stripe-payment.gateway';

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

class FakeGateway extends StripePaymentGateway {
  override async mountPaymentElement(host: HTMLElement): Promise<StripeCheckout> {
    const input = document.createElement('input');
    input.setAttribute('aria-label', 'Card number (test)');
    host.appendChild(input);
    return { confirm: async () => ({}) };
  }
}

/** A BookingService stub: the component only reads `lastAwaitingPayment` and (when polling)
 *  `getByCode`. Polling is never triggered here — states are forced directly. */
function stubService(booking: AwaitingPayment | undefined): Partial<BookingService> {
  return {
    lastAwaitingPayment: (() => booking) as BookingService['lastAwaitingPayment'],
    getByCode: () => EMPTY,
  };
}

interface StateProbe {
  state: { set(value: string): void };
  errorMessage: { set(value: string | undefined): void };
}

async function renderInState(
  state: string,
  { booking = AWAITING, error }: { booking?: AwaitingPayment | undefined; error?: string } = {},
): Promise<HTMLElement> {
  await TestBed.configureTestingModule({
    imports: [BookingPay],
    providers: [
      provideRouter([]),
      { provide: BookingService, useValue: stubService(booking) },
      { provide: StripePaymentGateway, useValue: new FakeGateway() },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(BookingPay);
  await fixture.whenStable(); // run afterNextRender (mount) before forcing the target state
  const probe = fixture.componentInstance as unknown as StateProbe;
  probe.state.set(state);
  if (error !== undefined) {
    probe.errorMessage.set(error);
  }
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('BookingPay accessibility (axe)', () => {
  it('has no violations while mounting the payment form', async () => {
    await expectNoAxeViolations(await renderInState('mounting'));
  });

  it('has no violations in the ready (card entry) state', async () => {
    await expectNoAxeViolations(await renderInState('ready'));
  });

  it('has no violations in the processing state', async () => {
    await expectNoAxeViolations(await renderInState('processing'));
  });

  it('has no violations in the confirmed state', async () => {
    const host = await renderInState('confirmed');
    expect(host.querySelector('[data-testid="booking-code"]')?.textContent).toContain('WXYZ345678');
    await expectNoAxeViolations(host);
  });

  it('has no violations in the awaiting (webhook-lag) state', async () => {
    await expectNoAxeViolations(await renderInState('awaiting'));
  });

  it('has no violations in the error (retry) state', async () => {
    const host = await renderInState('error', { error: 'Your card was declined. Please try again.' });
    expect(host.querySelector('[data-testid="pay-error"]')?.textContent).toContain('declined');
    await expectNoAxeViolations(host);
  });

  it('has no violations in the start-over (missing) state', async () => {
    await expectNoAxeViolations(await renderInState('missing', { booking: undefined }));
  });
});
