import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';

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
    withdrawable: status === 'PENDING_REQUEST',
    beforeCutoff: true,
    refundIfCancelledNow: { minorUnits: 4500, currency: 'EUR' },
    refundedAmount: null,
    refundOutstanding: false,
    requestExpiresAt: null,
    payment: null,
    emailWithheld: false,
    payWindowClosed: false,
    cancelReason: null,
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
        return throwError(() => r.error);
      }
      return of(r);
    },
  };
}

/**
 * A {@link BookingService} whose per-code lookups stay open until the spec resolves them, exposing
 * the order codes were actually asked for — the observable the fan-out bound is about.
 */
function pendingService(): Partial<BookingService> & {
  readonly inFlight: Map<string, Subject<BookingDetail>>;
  readonly asked: string[];
} {
  const inFlight = new Map<string, Subject<BookingDetail>>();
  const asked: string[] = [];
  return {
    inFlight,
    asked,
    getByCode: (code: string) => {
      asked.push(code);
      const subject = new Subject<BookingDetail>();
      inFlight.set(code, subject);
      return subject.asObservable();
    },
  };
}

/** Resolve one held per-code lookup with a CONFIRMED detail. */
function resolve(
  service: { readonly inFlight: Map<string, Subject<BookingDetail>> },
  code: string,
): void {
  const subject = service.inFlight.get(code);
  subject?.next(detail(code, 'CONFIRMED'));
  subject?.complete();
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
    refundedAmount: null,
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
        PEND0001: detail('PEND0001', 'PENDING_REQUEST', {
          requestExpiresAt: '2026-11-30T16:00:00Z',
        }),
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
    // A cancellation that refunded something did take money; one that never charged did not.
    ['CANCELLED', { refundedAmount: { minorUnits: 4500, currency: 'EUR' } }, 'Paid'],
    ['CANCELLED', {}, 'Amount'],
    ['NO_SHOW', {}, 'Paid'],
    ['DECLINED', {}, 'Amount'],
    ['EXPIRED', {}, 'Amount'],
    ['AWAITING_PAYMENT', {}, 'Amount'],
    ['PENDING_REQUEST', { requestExpiresAt: '2026-11-30T16:00:00Z' }, 'Amount'],
  ])(
    'labels the row amount for %s as "%s" (no-charge states not shown as Paid)',
    async (status, extra, label) => {
      seedCodes(['AMNT0001']);
      const fixture = await render(stubService({ AMNT0001: detail('AMNT0001', status, extra) }));
      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('[data-testid="row-amount-label"]')?.textContent?.trim()).toBe(
        label,
      );
    },
  );

  it('keeps a transiently-failed code and retries it (never loses a valid booking)', async () => {
    seedCodes(['TRAN5678']);
    let calls = 0;
    const service: Partial<BookingService> = {
      getByCode: () =>
        calls++ === 0 ? throwError(() => ({ status: 500 })) : of(detail('TRAN5678', 'CONFIRMED')),
    };
    const fixture = await render(service);
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="booking-row-failed"]')).not.toBeNull();
    // The code is NOT forgotten on a transient failure.
    expect(TestBed.inject(DeviceLocalBookings).codes()).toEqual(['TRAN5678']);

    host.querySelector<HTMLButtonElement>('[data-testid="row-retry"]')!.click();
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

  it('skeletons pulse on the shared track token, guarded for reduced motion (#739)', async () => {
    seedCodes(['LOAD0001']);
    const fixture = await render({
      getByCode: () => new Subject<BookingDetail>().asObservable(),
    });
    const host = fixture.nativeElement as HTMLElement;

    const lines = host.querySelectorAll('[data-testid="booking-row-loading"] .skeleton');
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line.classList.contains('animate-pulse')).toBe(true);
      expect(line.classList.contains('motion-reduce:animate-none')).toBe(true);
      expect(line.classList.contains('bg-(--riv-card-track)')).toBe(true);
    }
  });

  it('page-level loading is wholly decorative — the announcer owns the words (#739, #741)', async () => {
    const restoring = {
      restoring: signal(true),
      signedIn: signal(false),
    } as unknown as CustomerAuth;
    const fixture = await render(stubService({}), restoring);
    const host = fixture.nativeElement as HTMLElement;

    const loading = host.querySelector('[data-testid="my-bookings-loading"]')!;
    // Decoration now: it used to be the live region, born holding its text (#741).
    expect(loading.getAttribute('aria-live')).toBeNull();
    expect(loading.getAttribute('aria-hidden')).toBe('true');
    expect(loading.querySelectorAll('.skeleton')).toHaveLength(2);
    await expectNoAxeViolations(host);
  });

  it('announces through one region that survives loading → loaded (#741)', async () => {
    const restoring = {
      restoring: signal(true),
      signedIn: signal(false),
    } as unknown as CustomerAuth;
    const fixture = await render(stubService({}), restoring);
    const host = fixture.nativeElement as HTMLElement;

    const announcer = host.querySelector('[data-testid="load-announcer"]')!;
    expect(announcer.textContent?.trim()).toBe('Loading your bookings…');

    restoring.restoring.set(false);
    await fixture.whenStable();
    fixture.detectChanges();

    // Same node, mutated text: the mechanism that makes a live region speak.
    expect(host.querySelector('[data-testid="load-announcer"]')).toBe(announcer);
    expect(announcer.textContent?.trim()).toBe('Your bookings loaded.');
  });

  describe('fetch fan-out (#164)', () => {
    const many = (prefix: string): string[] =>
      Array.from({ length: 12 }, (_, i) => `${prefix}${String(i).padStart(4, '0')}`);

    it('bounds the per-code fetch fan-out to 5 in-flight requests', async () => {
      const codes = many('CODE');
      seedCodes(codes);
      const service = pendingService();
      const fixture = await render(service);

      // Only the first K go out; the rest are queued, not issued.
      expect(service.asked).toEqual(codes.slice(0, 5));

      // Resolving one frees exactly one slot, in order.
      resolve(service, codes[0]);
      await fixture.whenStable();
      expect(service.asked).toEqual(codes.slice(0, 6));

      for (const code of codes) {
        resolve(service, code);
        await fixture.whenStable();
      }

      // Every code is eventually asked for, exactly once.
      expect(service.asked).toEqual(codes);
    });

    it('re-sorts a device row into place when its date resolves, keeping undated rows last (F4 #246)', async () => {
      seedCodes(['SLOW0001', 'FAST0001']);
      const service = pendingService();
      const fixture = await render(service);
      const host = fixture.nativeElement as HTMLElement;

      // FAST resolves first: the still-loading SLOW row (date unknown) sits BELOW the dated row.
      const fast = service.inFlight.get('FAST0001')!;
      fast.next(detail('FAST0001', 'CONFIRMED', { bookingDate: '2026-11-15' }));
      fast.complete();
      await fixture.whenStable();
      fixture.detectChanges();
      const interim = [
        ...host.querySelectorAll(
          '[data-testid="booking-row"], [data-testid="booking-row-loading"]',
        ),
      ];
      expect(interim[0].getAttribute('data-testid')).toBe('booking-row');
      expect(interim[0].textContent).toContain('FAST0001');
      expect(interim[1].getAttribute('data-testid')).toBe('booking-row-loading');

      // SLOW then resolves with a NEWER date — it moves above FAST (re-sort on resolution).
      const slow = service.inFlight.get('SLOW0001')!;
      slow.next(detail('SLOW0001', 'CONFIRMED', { bookingDate: '2026-12-20' }));
      slow.complete();
      await fixture.whenStable();
      fixture.detectChanges();
      const codes = [...host.querySelectorAll('[data-testid="booking-row"] .code')].map((el) =>
        el.textContent?.trim(),
      );
      expect(codes).toEqual(['SLOW0001', 'FAST0001']);
    });

    it('keeps same-date rows in device-store order regardless of fetch completion order (F4 tie-break)', async () => {
      seedCodes(['TIEA0001', 'TIEB0001']);
      const service = pendingService();
      const fixture = await render(service);
      const host = fixture.nativeElement as HTMLElement;

      // B resolves BEFORE A with the same bookingDate — completion order must not win the tie.
      resolve(service, 'TIEB0001');
      await fixture.whenStable();
      resolve(service, 'TIEA0001');
      await fixture.whenStable();
      fixture.detectChanges();

      const codes = [...host.querySelectorAll('[data-testid="booking-row"] .code')].map((el) =>
        el.textContent?.trim(),
      );
      expect(codes).toEqual(['TIEA0001', 'TIEB0001']);
    });

    it('issues no further per-code fetches after destroy', async () => {
      const codes = many('GONE');
      seedCodes(codes);
      const service = pendingService();
      const fixture = await render(service);
      expect(service.asked).toHaveLength(5);

      fixture.destroy();
      // Completing an in-flight lookup must not pull the next one off a destroyed queue.
      resolve(service, codes[0]);
      await fixture.whenStable();

      expect(service.asked).toHaveLength(5);
    });
  });

  describe('signed in (S3 #114): merges the account list with device-local codes', () => {
    it('unions the account list with device-only codes, deduped by code', async () => {
      // DEVICE01 is a guest booking made only on this device; DUPE0001 is in BOTH (booked while
      // signed in) → it must appear exactly once. Device codes render per-code; the account list
      // adds only the codes this device does NOT have (ACCT0001).
      seedCodes(['DEVICE01', 'DUPE0001']);
      const service: Partial<BookingService> = {
        ...stubService({
          DEVICE01: detail('DEVICE01', 'CONFIRMED', { venueName: 'Device Bar' }),
          DUPE0001: detail('DUPE0001', 'CONFIRMED'),
        }),
        myBookings: () => of([summary('ACCT0001'), summary('DUPE0001')]),
      };
      const fixture = await render(service, authStub(true));
      const host = fixture.nativeElement as HTMLElement;

      const rows = host.querySelectorAll('[data-testid="booking-row"]');
      expect(rows).toHaveLength(3); // DEVICE01 + DUPE0001 (once) + ACCT0001
      const text = host.textContent ?? '';
      expect(text).toContain('ACCT0001');
      expect(text).toContain('DEVICE01');
      expect([...rows].filter((r) => r.textContent?.includes('DUPE0001'))).toHaveLength(1);
      await expectNoAxeViolations(host);
    });

    it('keeps the device rows and surfaces a retry when the account fetch fails (F1)', async () => {
      seedCodes(['DEVONLY1']);
      const service: Partial<BookingService> = {
        ...stubService({ DEVONLY1: detail('DEVONLY1', 'CONFIRMED') }),
        myBookings: () => throwError(() => ({ status: 500 })),
      };
      const fixture = await render(service, authStub(true));
      const host = fixture.nativeElement as HTMLElement;

      // The device booking still shows (never silently lost)…
      const rows = host.querySelectorAll('[data-testid="booking-row"]');
      expect(rows).toHaveLength(1);
      expect(rows[0].textContent).toContain('DEVONLY1');
      // …and the failed account list is surfaced with a retry, not hidden.
      expect(host.querySelector('[data-testid="account-error"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="account-retry"]')).not.toBeNull();
      // Silent: bookings made elsewhere may be missing, so "loaded" overstates it (#741 review).
      expect(host.querySelector('[data-testid="load-announcer"]')!.textContent?.trim()).toBe('');
    });

    it('stays silent while the account read is still in flight (#741 re-review)', async () => {
      // The device rows clear `loading` while the account list is still out (the gap #741's re-review found).
      seedCodes(['DEVONLY1']);
      const reads: Subject<MyBookingSummary[]>[] = [];
      const service = {
        ...stubService({ DEVONLY1: detail('DEVONLY1', 'CONFIRMED') }),
        myBookings: () => {
          const read = new Subject<MyBookingSummary[]>();
          reads.push(read);
          return read.asObservable();
        },
      };
      const fixture = await render(service, authStub(true));
      const host = fixture.nativeElement as HTMLElement;
      const announcer = host.querySelector('[data-testid="load-announcer"]')!;

      expect(announcer.textContent?.trim()).toBe('');

      reads[0].error({ status: 500 });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(announcer.textContent?.trim()).toBe('');
      expect(host.querySelector('[data-testid="account-error"]')).not.toBeNull();

      // Retry clears accountError at dispatch, reopening the same window.
      host.querySelector<HTMLButtonElement>('[data-testid="account-retry"]')!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(announcer.textContent?.trim()).toBe('');

      reads[1].next([]);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(announcer.textContent?.trim()).toBe('Your bookings loaded.');
    });

    it('stays silent while device rows are still resolving behind their skeletons', async () => {
      // A guest never touches the account list, so this window is the common path, not the rare one.
      seedCodes(['DEVONLY1']);
      const lookup = new Subject<BookingDetail>();
      const service = { ...stubService({}), getByCode: () => lookup.asObservable() };
      const fixture = await render(service);
      const host = fixture.nativeElement as HTMLElement;
      const announcer = host.querySelector('[data-testid="load-announcer"]')!;

      expect(announcer.textContent?.trim()).toBe('');

      lookup.next(detail('DEVONLY1', 'CONFIRMED'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(announcer.textContent?.trim()).toBe('Your bookings loaded.');
    });

    it('never flashes the empty card while a signed-in account read is in flight', async () => {
      // No device codes, so `loading` clears with zero rows — exactly when the card would flash.
      const account = new Subject<MyBookingSummary[]>();
      const service = { ...stubService({}), myBookings: () => account.asObservable() };
      const fixture = await render(service, authStub(true));
      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('[data-testid="my-bookings-empty"]')).toBeNull();
      // Absence is not the contract — asserting only that would have passed over a blank page.
      expect(host.querySelector('[data-testid="my-bookings-loading"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="load-announcer"]')!.textContent?.trim()).toBe(
        'Loading your bookings…',
      );

      account.next([]);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(host.querySelector('[data-testid="my-bookings-empty"]')).not.toBeNull();
    });

    it('says nothing when a device row failed — a retry card is not a loaded booking', async () => {
      seedCodes(['DEVONLY1']);
      const service = stubService({ DEVONLY1: { error: { status: 500 } } });
      const fixture = await render(service);
      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('[data-testid="load-announcer"]')!.textContent?.trim()).toBe('');
    });

    it('announces once, after a row retry succeeds — never before it', async () => {
      // The order is the contract: silence → "loaded", never "loaded" → silence → "loaded".
      seedCodes(['DEVONLY1']);
      let attempt = 0;
      const service = {
        ...stubService({}),
        getByCode: () => {
          attempt += 1;
          return attempt === 1
            ? throwError(() => ({ status: 500 }))
            : of(detail('DEVONLY1', 'CONFIRMED'));
        },
      };
      const fixture = await render(service);
      const host = fixture.nativeElement as HTMLElement;
      const announcer = host.querySelector('[data-testid="load-announcer"]')!;
      expect(announcer.textContent?.trim()).toBe('');

      host.querySelector<HTMLButtonElement>('[data-testid="row-retry"]')!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(announcer.textContent?.trim()).toBe('Your bookings loaded.');
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

    it('surfaces a retry (not a false "No booking yet") when the account fails and the device is empty (F1)', async () => {
      // A signed-in user on a new device whose /api/me/bookings fails must not see the empty state —
      // that reads as "your bookings are gone."
      seedCodes([]);
      const service: Partial<BookingService> = {
        ...stubService({}),
        myBookings: () => throwError(() => ({ status: 401 })),
      };
      const fixture = await render(service, authStub(true));
      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('[data-testid="account-error"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="my-bookings-empty"]')).toBeNull();
      await expectNoAxeViolations(host);
    });

    it('spends no per-code request on a code the account list already resolved', async () => {
      // 8 device codes, so the last one is still QUEUED (bound = 5) when the account list answers.
      const codes = Array.from({ length: 8 }, (_, i) => `DEV${String(i).padStart(5, '0')}`);
      const queued = codes[7];
      seedCodes(codes);
      const service = pendingService();
      const fixture = await render(
        { ...service, myBookings: () => of([summary(queued)]) },
        authStub(true),
      );

      for (const code of codes.slice(0, 7)) {
        resolve(service, code);
        await fixture.whenStable();
      }
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;

      // The account list already answered for it, so the queue must never ask.
      expect(service.asked).toEqual(codes.slice(0, 7));
      expect(service.asked).not.toContain(queued);
      // …and it still renders exactly once, from the account summary.
      const rows = host.querySelectorAll('[data-testid="booking-row"]');
      expect([...rows].filter((r) => r.textContent?.includes(queued))).toHaveLength(1);
    });

    it('renders device rows without waiting for the account list (F2)', async () => {
      seedCodes(['DEVONLY1']);
      const service: Partial<BookingService> = {
        ...stubService({ DEVONLY1: detail('DEVONLY1', 'CONFIRMED') }),
        // Never emits: the device rows must not be gated on it.
        myBookings: () => new Subject<MyBookingSummary[]>().asObservable(),
      };
      const fixture = await render(service, authStub(true));
      const host = fixture.nativeElement as HTMLElement;

      const rows = host.querySelectorAll('[data-testid="booking-row"]');
      expect(rows).toHaveLength(1);
      expect(rows[0].textContent).toContain('DEVONLY1');
      expect(host.querySelector('[data-testid="my-bookings-loading"]')).toBeNull();
    });

    it('restores a 404-dropped device row that the account list vouches for', async () => {
      // The per-code 404 may be transient (invariant #7); the account list says the booking exists.
      seedCodes(['FLAKY001']);
      const service: Partial<BookingService> = {
        ...stubService({ FLAKY001: { error: { status: 404 } } }),
        myBookings: () => of([summary('FLAKY001')]),
      };
      const fixture = await render(service, authStub(true));
      const host = fixture.nativeElement as HTMLElement;

      const rows = host.querySelectorAll('[data-testid="booking-row"]');
      expect(rows).toHaveLength(1);
      expect(rows[0].textContent).toContain('FLAKY001');
    });

    it.each<[string, unknown]>([
      ['404', { status: 404 }],
      ['transient failure', { status: 500 }],
    ])(
      'keeps an account-resolved row when the in-flight device lookup then ends in a %s',
      async (_label, error) => {
        // The account list answers while the per-code lookup is ALREADY in flight (it was inside the
        // concurrency bound, so the dequeue-time skip could not apply). Its late failure must not
        // undo a row the account vouched for.
        seedCodes(['INFLT001']);
        const service = pendingService();
        const fixture = await render(
          { ...service, myBookings: () => of([summary('INFLT001')]) },
          authStub(true),
        );
        expect(service.asked).toEqual(['INFLT001']);

        service.inFlight.get('INFLT001')!.error(error);
        await fixture.whenStable();
        fixture.detectChanges();
        const host = fixture.nativeElement as HTMLElement;

        const rows = host.querySelectorAll('[data-testid="booking-row"]');
        expect(rows).toHaveLength(1);
        expect(rows[0].textContent).toContain('INFLT001');
        expect(host.querySelector('[data-testid="booking-row-failed"]')).toBeNull();
      },
    );

    it('orders the merged list chronologically (newest booking date first), account and device rows interleaved (F4 #246)', async () => {
      seedCodes(['OLD00001', 'NEW00001']);
      const service: Partial<BookingService> = {
        ...stubService({
          OLD00001: detail('OLD00001', 'CONFIRMED', { bookingDate: '2026-11-01' }),
          NEW00001: detail('NEW00001', 'CONFIRMED', { bookingDate: '2026-12-10' }),
        }),
        myBookings: () => of([summary('MID00001', { bookingDate: '2026-12-01' })]),
      };
      const fixture = await render(service, authStub(true));
      const host = fixture.nativeElement as HTMLElement;

      // The account row sorts BETWEEN the device rows — global order, not device-then-account.
      const codes = [...host.querySelectorAll('[data-testid="booking-row"] .code')].map((el) =>
        el.textContent?.trim(),
      );
      expect(codes).toEqual(['NEW00001', 'MID00001', 'OLD00001']);
    });

    it('retry re-loads the account list after a failure', async () => {
      seedCodes([]);
      let calls = 0;
      const service: Partial<BookingService> = {
        ...stubService({}),
        myBookings: () =>
          calls++ === 0 ? throwError(() => ({ status: 500 })) : of([summary('ACCTLATER1')]),
      };
      const fixture = await render(service, authStub(true));
      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('[data-testid="account-error"]')).not.toBeNull();
      host.querySelector<HTMLButtonElement>('[data-testid="account-retry"]')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(host.querySelector('[data-testid="account-error"]')).toBeNull();
      expect(host.querySelector('[data-testid="booking-row"]')?.textContent).toContain(
        'ACCTLATER1',
      );
    });
  });
});
