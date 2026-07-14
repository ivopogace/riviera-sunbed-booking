import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';

import { installFakeStorage, removeFakeStorage } from '../../testing/fake-storage';
import { expectNoAxeViolations } from '../../testing/axe';
import { CustomerAuth } from '../core/customer-auth';
import { DeviceLocalBookings } from '../core/device-local-bookings';
import { BookingDetail, BookingStatus, MyBookingSummary } from './booking.model';
import { BookingService } from './booking.service';
import { MyBookings } from './my-bookings';

const KEY = 'riviera.bookings.v1';

function detail(
  code: string,
  status: BookingStatus,
  extra: Partial<BookingDetail> = {},
): BookingDetail {
  return {
    code,
    status,
    venueId: 1,
    venueName: 'Miramar Beach Club',
    rowLabel: 'Front row',
    positionNo: 7,
    bookingDate: '2026-12-01',
    amount: { minorUnits: 4500, currency: 'EUR' },
    cancellable: status === 'CONFIRMED',
    beforeCutoff: true,
    refundIfCancelledNow: { minorUnits: 4500, currency: 'EUR' },
    refundedAmount: null,
    requestExpiresAt: null,
    payment: null,
    ...extra,
  };
}

/** A BookingService whose getByCode dispatches by code to a detail or a thrown error. */
function stubService(
  byCode: Record<string, BookingDetail | { error: unknown }>,
): Partial<BookingService> {
  return {
    getByCode: (code: string) => {
      const r = byCode[code];
      if (r && 'error' in r) {
        return throwError(() => r.error) as Observable<BookingDetail>;
      }
      return of(r as BookingDetail);
    },
  };
}

/** A minimal {@link CustomerAuth}: the component only reads `restoring` + `signedIn` (both settled). */
function authStub(signedIn: boolean): CustomerAuth {
  return { restoring: signal(false), signedIn: signal(signedIn) } as unknown as CustomerAuth;
}

/** One `GET /api/me/bookings` server row (the {@link MyBookingSummary} subset). */
function summary(code: string, extra: Partial<MyBookingSummary> = {}): MyBookingSummary {
  return {
    code,
    status: 'CONFIRMED',
    venueId: 1,
    venueName: 'Miramar Beach Club',
    rowLabel: 'Front row',
    positionNo: 7,
    bookingDate: '2026-12-01',
    amount: { minorUnits: 4500, currency: 'EUR' },
    requestExpiresAt: null,
    ...extra,
  };
}

describe('MyBookings (device-local list, issue #139)', () => {
  let storage: Map<string, string>;

  beforeEach(() => (storage = installFakeStorage()));
  afterEach(() => removeFakeStorage());

  /** Seed the device's remembered codes (order preserved) before the component reads them. */
  function seedCodes(codes: string[]): void {
    storage.set(KEY, JSON.stringify(codes));
  }

  async function render(
    service: Partial<BookingService>,
    auth: CustomerAuth = authStub(false),
  ): Promise<ComponentFixture<MyBookings>> {
    await TestBed.configureTestingModule({
      imports: [MyBookings],
      providers: [
        provideRouter([]),
        { provide: BookingService, useValue: service },
        { provide: CustomerAuth, useValue: auth },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(MyBookings);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('renders a row per remembered code from the fetched server detail', async () => {
    seedCodes(['AAAA1111', 'BBBB2222']);
    const fixture = await render(
      stubService({
        AAAA1111: detail('AAAA1111', 'CONFIRMED'),
        BBBB2222: detail('BBBB2222', 'COMPLETED', { venueName: 'Sunset Bar' }),
      }),
    );
    const host = fixture.nativeElement as HTMLElement;

    const rows = host.querySelectorAll('[data-testid="booking-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Miramar Beach Club');
    expect(rows[0].textContent).toContain('Front row');
    expect(rows[0].textContent).toContain('spot 7');
    expect(rows[0].textContent).toContain('2026');
    expect(rows[0].textContent).toContain('AAAA1111');
    expect(rows[0].querySelector('[data-testid="row-status"]')?.textContent?.trim()).toBe(
      'Confirmed',
    );
    expect(rows[0].textContent).toContain('45'); // €45.00, minor units via shared/money
    expect(rows[0].getAttribute('href')).toBe('/booking/AAAA1111');
    expect(rows[1].textContent).toContain('Sunset Bar');
    await expectNoAxeViolations(host);
  });

  it.each<[BookingStatus, Partial<BookingDetail>, string]>([
    ['AWAITING_PAYMENT', {}, 'Payment needed'],
    ['PENDING_REQUEST', { requestExpiresAt: '2026-11-30T16:00:00Z' }, 'Awaiting host · by'],
    ['PENDING_REQUEST', { requestExpiresAt: null }, 'Awaiting host reply'],
    ['DECLINED', {}, 'Host could not accept'],
    ['EXPIRED', {}, 'Request expired unanswered'],
    ['CANCELLED', {}, 'Booking cancelled'],
    ['COMPLETED', {}, 'Enjoyed · thanks for visiting'],
    ['NO_SHOW', {}, 'Marked as no-show'],
  ])('renders the design sub-label for %s', async (status, extra, expected) => {
    seedCodes(['CODE0001']);
    const fixture = await render(stubService({ CODE0001: detail('CODE0001', status, extra) }));
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="row-subline"]')?.textContent).toContain(expected);
  });

  it('renders no sub-label for a CONFIRMED booking', async () => {
    seedCodes(['CODE0002']);
    const fixture = await render(stubService({ CODE0002: detail('CODE0002', 'CONFIRMED') }));
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="row-subline"]')).toBeNull();
  });

  it('renders the PENDING_REQUEST deadline in Europe/Tirane wall-clock (no client date math)', async () => {
    seedCodes(['PEND0001']);
    const fixture = await render(
      stubService({
        // 16:00Z on a CET (winter, UTC+1) date → 17:00 Europe/Tirane wall clock.
        PEND0001: detail('PEND0001', 'PENDING_REQUEST', { requestExpiresAt: '2026-11-30T16:00:00Z' }),
      }),
    );
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="row-subline"]')?.textContent).toContain('17:00');
  });

  it('drops a 404 row from view but keeps the code (invariant #7 — a 404 can be transient)', async () => {
    seedCodes(['GONE1234', 'LIVE5678']);
    const fixture = await render(
      stubService({
        GONE1234: { error: { status: 404 } },
        LIVE5678: detail('LIVE5678', 'CONFIRMED'),
      }),
    );
    const host = fixture.nativeElement as HTMLElement;

    const rows = host.querySelectorAll('[data-testid="booking-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('LIVE5678');
    expect(host.textContent).not.toContain('GONE1234');
    // The 404 code is NOT forgotten — it is the guest's only key and the 404 may be transient.
    expect(TestBed.inject(DeviceLocalBookings).codes()).toEqual(['GONE1234', 'LIVE5678']);
    await expectNoAxeViolations(host);
  });

  it.each<[BookingStatus, Partial<BookingDetail>, string]>([
    ['CONFIRMED', {}, 'Paid'],
    ['COMPLETED', {}, 'Paid'],
    ['CANCELLED', {}, 'Paid'],
    ['NO_SHOW', {}, 'Paid'],
    ['DECLINED', {}, 'Amount'],
    ['EXPIRED', {}, 'Amount'],
    ['AWAITING_PAYMENT', {}, 'Amount'],
    ['PENDING_REQUEST', { requestExpiresAt: '2026-11-30T16:00:00Z' }, 'Amount'],
  ])('labels the row amount for %s as "%s" (no-charge states not shown as Paid)', async (status, extra, label) => {
    seedCodes(['AMNT0001']);
    const fixture = await render(stubService({ AMNT0001: detail('AMNT0001', status, extra) }));
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="row-amount-label"]')?.textContent?.trim()).toBe(label);
  });

  it('keeps a transiently-failed code and retries it (never loses a valid booking)', async () => {
    seedCodes(['TRAN5678']);
    let calls = 0;
    const service: Partial<BookingService> = {
      getByCode: () =>
        (calls++ === 0
          ? throwError(() => ({ status: 500 }))
          : of(detail('TRAN5678', 'CONFIRMED'))) as Observable<BookingDetail>,
    };
    const fixture = await render(service);
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="booking-row-failed"]')).not.toBeNull();
    // The code is NOT forgotten on a transient failure.
    expect(TestBed.inject(DeviceLocalBookings).codes()).toEqual(['TRAN5678']);

    (host.querySelector('[data-testid="row-retry"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="booking-row-failed"]')).toBeNull();
    expect(host.querySelector('[data-testid="booking-row"]')?.textContent).toContain('TRAN5678');
  });

  it('shows the empty state with Browse beaches and no find-by-code button (T8 deferred)', async () => {
    seedCodes([]);
    const fixture = await render(stubService({}));
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="my-bookings-empty"]')).not.toBeNull();
    expect(host.textContent).toContain('No booking yet');
    expect(host.querySelector('[data-testid="browse-beaches"]')?.getAttribute('href')).toBe('/');
    expect(host.textContent).not.toContain('Find');
    await expectNoAxeViolations(host);
  });

  it('shows the empty state when every remembered code 404s, but retains the codes', async () => {
    seedCodes(['X0000001']);
    const fixture = await render(stubService({ X0000001: { error: { status: 404 } } }));
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="my-bookings-empty"]')).not.toBeNull();
    // Codes are kept (not forgotten) so a transient 404 self-heals on the next load.
    expect(TestBed.inject(DeviceLocalBookings).codes()).toEqual(['X0000001']);
  });

  it('shows a loading skeleton while a row is still fetching (a11y)', async () => {
    seedCodes(['LOAD0001']);
    const fixture = await render({
      getByCode: () => new Subject<BookingDetail>().asObservable(),
    });
    const host = fixture.nativeElement as HTMLElement;

    const loading = host.querySelector('[data-testid="booking-row-loading"]');
    expect(loading).not.toBeNull();
    expect(loading?.getAttribute('aria-busy')).toBe('true');
    await expectNoAxeViolations(host);
  });

  describe('signed in (S3 #114): merges the account list with device-local codes', () => {
    it('unions the account list with device-only codes, deduped by code', async () => {
      // DEVICE01 is a guest booking made only on this device; DUPE0001 is in BOTH (booked while
      // signed in, so it is device-local AND account-linked) → it must appear exactly once.
      seedCodes(['DEVICE01', 'DUPE0001']);
      const service: Partial<BookingService> = {
        ...stubService({ DEVICE01: detail('DEVICE01', 'CONFIRMED', { venueName: 'Device Bar' }) }),
        myBookings: () => of([summary('ACCT0001'), summary('DUPE0001')]),
      };
      const fixture = await render(service, authStub(true));
      const host = fixture.nativeElement as HTMLElement;

      const rows = host.querySelectorAll('[data-testid="booking-row"]');
      expect(rows).toHaveLength(3); // ACCT0001 + DUPE0001 (once) + DEVICE01
      const text = host.textContent ?? '';
      expect(text).toContain('ACCT0001');
      expect(text).toContain('DEVICE01');
      expect([...rows].filter((r) => r.textContent?.includes('DUPE0001'))).toHaveLength(1);
      await expectNoAxeViolations(host);
    });

    it('falls back to the device-local list when the account fetch fails', async () => {
      seedCodes(['DEVONLY1']);
      const service: Partial<BookingService> = {
        ...stubService({ DEVONLY1: detail('DEVONLY1', 'CONFIRMED') }),
        myBookings: () => throwError(() => ({ status: 500 })) as Observable<MyBookingSummary[]>,
      };
      const fixture = await render(service, authStub(true));
      const host = fixture.nativeElement as HTMLElement;

      const rows = host.querySelectorAll('[data-testid="booking-row"]');
      expect(rows).toHaveLength(1);
      expect(rows[0].textContent).toContain('DEVONLY1');
    });

    it('shows the account list when the device has no remembered codes', async () => {
      seedCodes([]);
      const service: Partial<BookingService> = {
        ...stubService({}),
        myBookings: () => of([summary('ACCTONLY1')]),
      };
      const fixture = await render(service, authStub(true));
      const host = fixture.nativeElement as HTMLElement;

      const rows = host.querySelectorAll('[data-testid="booking-row"]');
      expect(rows).toHaveLength(1);
      expect(rows[0].textContent).toContain('ACCTONLY1');
    });
  });
});
