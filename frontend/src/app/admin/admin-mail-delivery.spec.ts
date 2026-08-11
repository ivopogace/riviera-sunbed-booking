import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { AdminMailDelivery } from './admin-mail-delivery';
import { AdminMailDeliveryService } from './admin-mail-delivery.service';
import { MailDeliveryLookupView, MailResendResultView } from './admin.model';

const EMAIL = 'tourist@example.com';

const WITHHELD_THEN_RESENT: MailDeliveryLookupView = {
  bookings: [
    {
      bookingId: 42,
      venueName: 'Vala Beach',
      bookingDate: '2026-08-01',
      everConfirmed: true,
      attempts: [
        { source: 'ADMIN_RESEND', outcome: 'SENT', attemptedAt: '2026-07-30T09:31:00Z' },
        {
          source: 'AUTOMATIC',
          outcome: 'WITHHELD_SUPPRESSED',
          attemptedAt: '2026-07-29T14:02:11Z',
        },
      ],
    },
  ],
};

function serviceStub(lookup: MailDeliveryLookupView = { bookings: [] }): {
  lookup: ReturnType<typeof vi.fn>;
  resend: ReturnType<typeof vi.fn>;
} {
  return {
    lookup: vi.fn(async () => lookup),
    resend: vi.fn(async (): Promise<MailResendResultView> => ({ outcome: 'SENT' })),
  };
}

async function render(
  service: ReturnType<typeof serviceStub>,
): Promise<ComponentFixture<AdminMailDelivery>> {
  await TestBed.configureTestingModule({
    imports: [AdminMailDelivery],
    providers: [{ provide: AdminMailDeliveryService, useValue: service }],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminMailDelivery);
  fixture.detectChanges();
  return fixture;
}

function testId(fixture: ComponentFixture<AdminMailDelivery>, id: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);
}

async function lookUp(fixture: ComponentFixture<AdminMailDelivery>, email = EMAIL): Promise<void> {
  const input: HTMLInputElement = testId(fixture, 'admin-delivery-email') as HTMLInputElement;
  input.value = email;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  (testId(fixture, 'admin-delivery-lookup') as HTMLButtonElement).click();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('AdminMailDelivery', () => {
  it('lists each booking with its attempts, newest first (AC-1)', async () => {
    const service = serviceStub(WITHHELD_THEN_RESENT);
    const fixture = await render(service);

    await lookUp(fixture);

    expect(service.lookup).toHaveBeenCalledWith(EMAIL);
    const attempts = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="admin-delivery-attempts"] li',
    );
    expect(attempts).toHaveLength(2);
    expect(attempts[0].textContent).toContain('Resent by admin');
    expect(attempts[1].textContent).toContain('withheld (address suppressed)');
  });

  /** The whole reason the log exists: a withheld send must not read as a delivery. */
  it('names a withheld attempt as withheld, not sent (AC-2)', async () => {
    const fixture = await render(serviceStub(WITHHELD_THEN_RESENT));

    await lookUp(fixture);

    const attempts = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-testid="admin-delivery-attempts"]',
    )!;
    expect(attempts.textContent).toContain('withheld');
    expect(attempts.textContent).not.toContain('withheld (address suppressed) · delivered');
  });

  it('distinguishes "no confirmation was due" from "nothing recorded"', async () => {
    const neverConfirmed = serviceStub({
      bookings: [
        {
          bookingId: 7,
          venueName: 'Vala Beach',
          bookingDate: '2026-08-01',
          everConfirmed: false,
          attempts: [],
        },
      ],
    });
    const fixture = await render(neverConfirmed);
    await lookUp(fixture);

    expect(testId(fixture, 'admin-delivery-not-due')).not.toBeNull();
    expect(testId(fixture, 'admin-delivery-no-record')).toBeNull();
  });

  it('says nothing was recorded for a confirmed booking with no attempts', async () => {
    const fixture = await render(
      serviceStub({
        bookings: [
          {
            bookingId: 7,
            venueName: 'Vala Beach',
            bookingDate: '2026-08-01',
            everConfirmed: true,
            attempts: [],
          },
        ],
      }),
    );
    await lookUp(fixture);

    expect(testId(fixture, 'admin-delivery-no-record')).not.toBeNull();
  });

  it('reports an address with no bookings as an empty result, not an error (AC-7)', async () => {
    const fixture = await render(serviceStub({ bookings: [] }));

    await lookUp(fixture);

    expect(testId(fixture, 'admin-delivery-empty')).not.toBeNull();
    expect(testId(fixture, 'admin-delivery-error')).toBeNull();
  });

  it('resends and reports the outcome, then re-reads the history (AC-9)', async () => {
    const service = serviceStub(WITHHELD_THEN_RESENT);
    const fixture = await render(service);
    await lookUp(fixture);

    (testId(fixture, 'admin-delivery-resend-42') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(service.resend).toHaveBeenCalledWith(42);
    expect(testId(fixture, 'admin-delivery-notice')?.textContent).toContain('sent again');
    expect(service.lookup).toHaveBeenCalledTimes(2);
  });

  /**
   * A withheld resend is the most useful answer this card gives — it is usually why the first one never
   * arrived — so it must read as an explanation, not as a failure.
   */
  it('reports a withheld resend as an outcome rather than an error', async () => {
    const service = serviceStub(WITHHELD_THEN_RESENT);
    service.resend = vi.fn(async (): Promise<MailResendResultView> => ({
      outcome: 'WITHHELD_SUPPRESSED',
    }));
    const fixture = await render(service);
    await lookUp(fixture);

    (testId(fixture, 'admin-delivery-resend-42') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(testId(fixture, 'admin-delivery-notice')?.textContent).toContain('suppression list');
    expect(testId(fixture, 'admin-delivery-error')).toBeNull();
  });

  it('reports a refused resend of a never-confirmed booking', async () => {
    const service = serviceStub(WITHHELD_THEN_RESENT);
    service.resend = vi.fn(async (): Promise<MailResendResultView> => ({
      outcome: 'NOT_CONFIRMED',
    }));
    const fixture = await render(service);
    await lookUp(fixture);

    (testId(fixture, 'admin-delivery-resend-42') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(testId(fixture, 'admin-delivery-notice')?.textContent).toContain('never confirmed');
  });

  /**
   * The field is live, the results are not: an admin who starts typing the next address before
   * pressing Resend on the results still on screen must not have those results silently replaced by
   * someone else's — under a notice saying their mail was sent.
   */
  it('re-reads the address that was searched, not whatever is in the field now', async () => {
    const service = serviceStub(WITHHELD_THEN_RESENT);
    const fixture = await render(service);
    await lookUp(fixture);

    const input: HTMLInputElement = testId(fixture, 'admin-delivery-email') as HTMLInputElement;
    input.value = 'someone-else@example.com';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (testId(fixture, 'admin-delivery-resend-42') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(service.lookup).toHaveBeenLastCalledWith(EMAIL);
  });

  it('shows an error when the lookup itself fails', async () => {
    const service = serviceStub();
    service.lookup = vi.fn(async () => {
      throw new Error('boom');
    });
    const fixture = await render(service);

    await lookUp(fixture);

    expect(testId(fixture, 'admin-delivery-error')).not.toBeNull();
    expect(testId(fixture, 'admin-delivery-empty')).toBeNull();
  });

  it('does not look up a blank address', async () => {
    const service = serviceStub();
    const fixture = await render(service);

    await lookUp(fixture, '   ');

    expect(service.lookup).not.toHaveBeenCalled();
  });

  /** Invariant #7: the endpoint never returns the arrival code, and the card never invents a place for it. */
  it('renders no arrival code anywhere', async () => {
    const fixture = await render(serviceStub(WITHHELD_THEN_RESENT));

    await lookUp(fixture);

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('ABCD2345');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid*="code"]'),
    ).toBeNull();
  });
});
