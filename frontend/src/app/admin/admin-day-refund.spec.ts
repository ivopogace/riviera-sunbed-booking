import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { AdminDayRefund } from './admin-day-refund';
import { AdminDayRefundService } from './admin-day-refund.service';
import { AdminDayRefundResultView, GuestBookingLookupView } from './admin.model';

const EMAIL = 'tourist@example.com';

/** A 3-day stay with day 1 checked in and day 3 open, and a booking that never happened. */
const GUEST_BOOKINGS: GuestBookingLookupView = {
  bookings: [
    {
      bookingId: 42,
      venueName: 'Vala Beach',
      firstDate: '2026-08-01',
      lastDate: '2026-08-03',
      status: 'CONFIRMED',
      refundable: true,
      days: [
        { date: '2026-08-01', state: 'ATTENDED' },
        { date: '2026-08-02', state: 'RELEASED' },
        { date: '2026-08-03', state: 'OPEN' },
      ],
    },
    {
      bookingId: 43,
      venueName: 'Vala Beach',
      firstDate: '2026-07-04',
      lastDate: '2026-07-04',
      status: 'AWAITING_PAYMENT',
      refundable: false,
      days: [],
    },
  ],
};

const DAY_REFUNDED: AdminDayRefundResultView = {
  kind: 'DAY_REFUNDED',
  serviceDate: '2026-08-03',
  refundMinor: 4500,
  currency: 'EUR',
  released: true,
};

function serviceStub(lookup: GuestBookingLookupView = { bookings: [] }): {
  lookup: ReturnType<typeof vi.fn>;
  refund: ReturnType<typeof vi.fn>;
} {
  return {
    lookup: vi.fn(() => Promise.resolve(lookup)),
    refund: vi.fn((): Promise<AdminDayRefundResultView> => Promise.resolve(DAY_REFUNDED)),
  };
}

async function render(
  service: ReturnType<typeof serviceStub>,
): Promise<ComponentFixture<AdminDayRefund>> {
  await TestBed.configureTestingModule({
    imports: [AdminDayRefund],
    providers: [{ provide: AdminDayRefundService, useValue: service }],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminDayRefund);
  fixture.detectChanges();
  return fixture;
}

function testId(fixture: ComponentFixture<AdminDayRefund>, id: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);
}

async function lookUp(fixture: ComponentFixture<AdminDayRefund>, email = EMAIL): Promise<void> {
  const input: HTMLInputElement = testId(fixture, 'admin-day-refund-email') as HTMLInputElement;
  input.value = email;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  (testId(fixture, 'admin-day-refund-lookup') as HTMLButtonElement).click();
  await fixture.whenStable();
  fixture.detectChanges();
}

function openConfirm(fixture: ComponentFixture<AdminDayRefund>): void {
  (testId(fixture, 'admin-day-refund-open-42-2026-08-03') as HTMLButtonElement).click();
  fixture.detectChanges();
}

async function confirm(fixture: ComponentFixture<AdminDayRefund>, reason?: string): Promise<void> {
  if (reason !== undefined) {
    const field = testId(fixture, 'admin-day-refund-reason-42') as HTMLInputElement;
    field.value = reason;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }
  (testId(fixture, 'admin-day-refund-confirm-42') as HTMLButtonElement).click();
  // refund() → service.refund → refresh() → service.lookup: two awaits before the list settles.
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
}

function problem(status: number, code: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code } });
}

describe('AdminDayRefund', () => {
  it('lists each booking with its venue, span, status and days, offering a refund only on an open day (AC-6)', async () => {
    const service = serviceStub(GUEST_BOOKINGS);
    const fixture = await render(service);

    await lookUp(fixture);

    expect(service.lookup).toHaveBeenCalledWith(EMAIL);
    const stay = testId(fixture, 'admin-day-refund-booking-42')!;
    expect(stay.textContent).toContain('Vala Beach');
    expect(stay.textContent).toContain('Sat 1 Aug 2026 – Mon 3 Aug 2026');
    expect(stay.textContent).toContain('Confirmed');
    expect(testId(fixture, 'admin-day-refund-state-42-2026-08-01')?.textContent).toContain(
      'Checked in',
    );
    expect(testId(fixture, 'admin-day-refund-state-42-2026-08-02')?.textContent).toContain(
      'released',
    );
    expect(testId(fixture, 'admin-day-refund-open-42-2026-08-01')).toBeNull();
    expect(testId(fixture, 'admin-day-refund-open-42-2026-08-03')).not.toBeNull();
  });

  it('offers no day on a booking that never happened', async () => {
    const fixture = await render(serviceStub(GUEST_BOOKINGS));

    await lookUp(fixture);

    expect(testId(fixture, 'admin-day-refund-not-refundable-43')).not.toBeNull();
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        '[data-testid^="admin-day-refund-open-43"]',
      ),
    ).toHaveLength(0);
  });

  it('reports an address with no bookings as an empty result, not an error (AC-4)', async () => {
    const fixture = await render(serviceStub({ bookings: [] }));

    await lookUp(fixture);

    expect(testId(fixture, 'admin-day-refund-empty')).not.toBeNull();
    expect(testId(fixture, 'admin-day-refund-error')).toBeNull();
  });

  it('reports a rejected lookup as an error', async () => {
    const service = serviceStub();
    service.lookup.mockRejectedValue(new Error('boom'));
    const fixture = await render(service);

    await lookUp(fixture);

    expect(testId(fixture, 'admin-day-refund-error')).not.toBeNull();
    expect(testId(fixture, 'admin-day-refund-empty')).toBeNull();
  });

  it('refunds nothing until the two-step confirm is confirmed (AC-6)', async () => {
    const service = serviceStub(GUEST_BOOKINGS);
    const fixture = await render(service);
    await lookUp(fixture);

    openConfirm(fixture);

    expect(testId(fixture, 'admin-day-refund-confirm-panel-42')).not.toBeNull();
    expect(testId(fixture, 'admin-day-refund-confirm-prompt-42')?.textContent).toContain(
      'Mon 3 Aug 2026',
    );
    expect(service.refund).not.toHaveBeenCalled();

    (testId(fixture, 'admin-day-refund-cancel-42') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(testId(fixture, 'admin-day-refund-confirm-panel-42')).toBeNull();
    expect(service.refund).not.toHaveBeenCalled();
  });

  it('sends the chosen day with the typed grounds, reports the outcome and re-reads the guest (AC-6)', async () => {
    const service = serviceStub(GUEST_BOOKINGS);
    const fixture = await render(service);
    await lookUp(fixture);
    openConfirm(fixture);

    await confirm(fixture, 'pool closed for repair');

    expect(service.refund).toHaveBeenCalledWith(42, '2026-08-03', 'pool closed for repair');
    expect(testId(fixture, 'admin-day-refund-notice')?.textContent).toContain(
      'Mon 3 Aug 2026 refunded',
    );
    expect(testId(fixture, 'admin-day-refund-notice')?.textContent).toContain('€45');
    expect(testId(fixture, 'admin-day-refund-notice')?.textContent).toContain('free again');
    expect(testId(fixture, 'admin-day-refund-confirm-panel-42')).toBeNull();
    expect(service.lookup).toHaveBeenCalledTimes(2);
  });

  it('sends no grounds when the field is blank', async () => {
    const service = serviceStub(GUEST_BOOKINGS);
    const fixture = await render(service);
    await lookUp(fixture);
    openConfirm(fixture);

    await confirm(fixture, '   ');

    expect(service.refund).toHaveBeenCalledWith(42, '2026-08-03', undefined);
  });

  it('names a lone one-day booking cancelled whole', async () => {
    const service = serviceStub(GUEST_BOOKINGS);
    service.refund = vi.fn((): Promise<AdminDayRefundResultView> =>
      Promise.resolve({
        kind: 'BOOKING_CANCELLED',
        serviceDate: '2026-08-03',
        refundMinor: 9000,
        currency: 'EUR',
        released: true,
      }),
    );
    const fixture = await render(service);
    await lookUp(fixture);
    openConfirm(fixture);

    await confirm(fixture);

    expect(testId(fixture, 'admin-day-refund-notice')?.textContent).toContain('Booking cancelled');
    expect(testId(fixture, 'admin-day-refund-notice')?.textContent).toContain('€90');
  });

  it('says a past day keeps its set', async () => {
    const service = serviceStub(GUEST_BOOKINGS);
    service.refund = vi.fn((): Promise<AdminDayRefundResultView> =>
      Promise.resolve({ ...DAY_REFUNDED, released: false }),
    );
    const fixture = await render(service);
    await lookUp(fixture);
    openConfirm(fixture);

    await confirm(fixture);

    const notice = testId(fixture, 'admin-day-refund-notice')?.textContent ?? '';
    expect(notice).toContain('the stay goes on');
    expect(notice).not.toContain('free again');
  });

  it.each([
    [409, 'DAY_ATTENDED', 'checked in'],
    [409, 'DAY_ALREADY_REFUNDED', 'already refunded'],
    [404, 'BOOKING_NOT_FOUND', 'did not happen'],
    [401, undefined, 'session expired'],
    [500, undefined, 'Nothing was refunded'],
  ])('reports a %i %s refusal as an answer (AC-5)', async (status, code, copy) => {
    const service = serviceStub(GUEST_BOOKINGS);
    service.refund.mockRejectedValue(problem(status, code ?? ''));
    const fixture = await render(service);
    await lookUp(fixture);
    openConfirm(fixture);

    await confirm(fixture);

    expect(testId(fixture, 'admin-day-refund-notice')?.textContent).toContain(copy);
    expect(testId(fixture, 'admin-day-refund-confirm-panel-42')).toBeNull();
    expect(service.lookup).toHaveBeenCalledTimes(2);
  });

  /** Invariant #7: the card never renders an arrival code, and the contract carries none to render. */
  it('re-reads the address that was searched, not whatever is in the field now', async () => {
    const service = serviceStub(GUEST_BOOKINGS);
    const fixture = await render(service);
    await lookUp(fixture);
    const input: HTMLInputElement = testId(fixture, 'admin-day-refund-email') as HTMLInputElement;
    input.value = 'someone-else@example.com';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    openConfirm(fixture);

    await confirm(fixture);

    expect(service.lookup).toHaveBeenLastCalledWith(EMAIL);
  });
});
