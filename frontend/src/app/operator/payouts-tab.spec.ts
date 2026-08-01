import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { formatMoney } from '../shared/money';
import { formatCivilDate } from '../shared/booking-date';
import { PayoutLedgerEntryView, PayoutLedgerView } from './operator-console.model';
import { PayoutsTab } from './payouts-tab';

/**
 * The O7 Payouts tab (#173). Reads `:venueId` from the PARENT route (child routes don't inherit it —
 * O1 finding) and loads the venue's payout ledger. Renders: the "Owed to you" hero = the server's
 * `netOwedMinor` (never recomputed, invariant #5/#9); a ledger table (a `#<bookingId>` reference — NO
 * booking code or guest identity, invariants #7/#11 — gross/commission/net from integer minor units,
 * reversals as negative rows with a reason chip); a period-total row; the empty/loading/error states;
 * and the 403/401 owner-assert copy (invariant #13). Weather refund + statement are covered in
 * `payouts-tab.spec.ts` phase-2 blocks below.
 */
describe('PayoutsTab (#173) — ledger', () => {
  let fixture: ComponentFixture<PayoutsTab>;
  let http: HttpTestingController;
  let host: HTMLElement;

  function entry(over: Partial<PayoutLedgerEntryView> = {}): PayoutLedgerEntryView {
    return {
      type: 'ACCRUAL',
      bookingId: 11,
      grossMinor: 4500,
      commissionMinor: 675,
      netMinor: 3825,
      currency: 'EUR',
      reason: null,
      createdAt: '2026-07-01T09:00:00Z',
      runningNetMinor: 3825,
      ...over,
    };
  }

  function ledger(over: Partial<PayoutLedgerView> = {}): PayoutLedgerView {
    return {
      venueId: 1,
      currency: 'EUR',
      netOwedMinor: 3825,
      entries: [entry()],
      ...over,
    };
  }

  function configure(): void {
    TestBed.configureTestingModule({
      imports: [PayoutsTab],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({}) },
            parent: { snapshot: { paramMap: convertToParamMap({ venueId: '1' }) }, paramMap: of(convertToParamMap({ venueId: '1' })) },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(PayoutsTab);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    // OperatorAuth restores the session on construction — settle it signed-out (the shell gates access).
    http
      .expectOne((r) => r.url.includes('/api/auth/me'))
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
  }

  function flushLedger(body: PayoutLedgerView): void {
    http
      .expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/venues/1/payout-ledger'))
      .flush(body);
    fixture.detectChanges();
  }

  function render(body: PayoutLedgerView): void {
    configure();
    flushLedger(body);
    host = fixture.nativeElement as HTMLElement;
  }

  afterEach(() => http.verify());

  function byId(id: string): HTMLElement | null {
    return host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  }
  function rows(): HTMLElement[] {
    return Array.from(host.querySelectorAll<HTMLElement>('[data-testid="ledger-row"]'));
  }

  it('renders each ledger entry from integer minor units, with a #bookingId reference (no code/guest)', () => {
    render(
      ledger({
        netOwedMinor: 3825,
        entries: [entry({ bookingId: 42, grossMinor: 4500, commissionMinor: 675, netMinor: 3825 })],
      }),
    );
    expect(rows()).toHaveLength(1);
    const text = rows()[0].textContent ?? '';
    expect(text).toContain('#42'); // the non-credential booking reference
    expect(text).toContain(formatMoney({ minorUnits: 4500, currency: 'EUR' })); // gross €45
    expect(text).toContain(formatMoney({ minorUnits: 675, currency: 'EUR' })); // commission
    expect(text).toContain(formatMoney({ minorUnits: 3825, currency: 'EUR' })); // net
    // No bearer credential / no tourist identity anywhere in the payouts region (#7/#11).
    expect(host.querySelector('[data-testid="payouts-tab"] code')).toBeNull();
    expect(text).not.toMatch(/guest/i);
  });

  it('shows a reversal as a negative net with a reason chip; an accrual has no chip', () => {
    render(
      ledger({
        netOwedMinor: 1700,
        entries: [
          entry({ type: 'ACCRUAL', bookingId: 11, netMinor: 3825, runningNetMinor: 3825 }),
          entry({
            type: 'REVERSAL',
            bookingId: 12,
            grossMinor: 2500,
            commissionMinor: 375,
            netMinor: 2125,
            reason: 'WEATHER',
            createdAt: '2026-07-02T09:00:00Z',
            runningNetMinor: 1700,
          }),
        ],
      }),
    );
    const [accrual, reversal] = rows();
    expect(accrual.querySelector('[data-testid="ledger-reason"]')).toBeNull();
    // The reversal shows a negative net and a Weather reason chip.
    expect(reversal.querySelector('[data-testid="ledger-reason"]')?.textContent).toMatch(/weather/i);
    expect(reversal.textContent).toContain(formatMoney({ minorUnits: -2125, currency: 'EUR' }));
  });

  it('renders the "Owed to you" hero and period total from the SERVER netOwedMinor, never a client sum', () => {
    // The naive entry sum (3825 + 2125 = 5950) deliberately differs from netOwedMinor — the tab must
    // show the server figure, proving it never recomputes the owed total (invariant #5/#9, R-1).
    render(
      ledger({
        netOwedMinor: 1700,
        entries: [
          entry({ bookingId: 11, netMinor: 3825, runningNetMinor: 3825 }),
          entry({
            type: 'REVERSAL',
            bookingId: 12,
            netMinor: 2125,
            reason: 'WEATHER',
            runningNetMinor: 1700,
          }),
        ],
      }),
    );
    const owed = formatMoney({ minorUnits: 1700, currency: 'EUR' });
    expect(byId('payout-owed')?.textContent).toContain(owed);
    expect(byId('period-owed')?.textContent).toContain(owed);
    // Hero counts: 1 booking (accrual), 1 refund (reversal).
    const counts = byId('payout-counts')?.textContent ?? '';
    expect(counts).toContain('1 booking');
    expect(counts).toContain('1 refund');
    expect(counts.toLowerCase()).toContain('bank transfer');
  });

  it('renders the empty state (nothing owed) for an empty ledger', () => {
    render(ledger({ netOwedMinor: 0, entries: [] }));
    expect(byId('payouts-empty')).toBeTruthy();
    expect(rows()).toHaveLength(0);
    expect(byId('payout-owed')?.textContent).toContain(formatMoney({ minorUnits: 0, currency: 'EUR' }));
  });

  it('shows a load-error card (not a false empty state) when the ledger read fails', () => {
    configure();
    http
      .expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/venues/1/payout-ledger'))
      .flush({ code: 'INTERNAL' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
    expect(byId('payouts-load-error')).toBeTruthy();
    expect(byId('payouts-empty')).toBeNull();
  });

  it('shows the not-owner copy when the ledger read is 403 (invariant #13)', () => {
    configure();
    http
      .expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/venues/1/payout-ledger'))
      .flush({ code: 'NOT_VENUE_OWNER' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
    expect(byId('payouts-load-error')?.textContent?.toLowerCase()).toContain('manage');
  });

  it('surfaces the session-expiry copy when the ledger read returns 401', () => {
    configure();
    http
      .expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/venues/1/payout-ledger'))
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
    expect(byId('payouts-load-error')?.textContent?.toLowerCase()).toContain('session');
  });

  // ---- Phase 2: weather refund (per-date, confirm-gated) + statement modal ----

  function dateValue(): string {
    return host.querySelector<HTMLInputElement>('[data-testid="weather-date"]')!.value;
  }
  function expectWeatherPost(): ReturnType<HttpTestingController['expectOne']> {
    return http.expectOne(
      (r) => r.method === 'POST' && r.url.endsWith('/api/venues/1/weather-refund'),
    );
  }

  it('weather refund is confirm-gated and per-date: the confirm names the date, no call until confirmed', () => {
    render(ledger());
    const date = dateValue();
    expect(date).toBeTruthy(); // defaults to today Europe/Tirane

    byId('weather-trigger')!.click();
    fixture.detectChanges();
    expect(byId('weather-confirm')?.textContent).toContain(formatCivilDate(date));
    http.expectNone((r) => r.method === 'POST'); // opening the confirm sends nothing
  });

  it('“Cancel” dismisses the weather confirm without a call', () => {
    render(ledger());
    byId('weather-trigger')!.click();
    fixture.detectChanges();
    byId('weather-cancel-btn')!.click();
    fixture.detectChanges();
    expect(byId('weather-confirm')).toBeNull();
    http.expectNone((r) => r.method === 'POST');
  });

  it('confirming POSTs the selected date, reports the outcome, and re-reads the ledger for the reversal', () => {
    render(ledger({ netOwedMinor: 3825, entries: [entry({ bookingId: 11 })] }));
    const date = dateValue();

    byId('weather-trigger')!.click();
    fixture.detectChanges();
    byId('weather-confirm-btn')!.click();
    fixture.detectChanges();

    const req = expectWeatherPost();
    expect(req.request.params.get('date')).toBe(date);
    req.flush({ refundedCount: 1, totalRefundedMinor: 4500, currency: 'EUR' });
    fixture.detectChanges();

    // Success re-reads the ledger — the reversal (posted by the AFTER_COMMIT payout listener) now shows.
    flushLedger(
      ledger({
        netOwedMinor: 0,
        entries: [
          entry({ bookingId: 11 }),
          entry({
            type: 'REVERSAL',
            bookingId: 11,
            netMinor: 3825,
            reason: 'WEATHER',
            createdAt: '2026-07-05T09:00:00Z',
            runningNetMinor: 0,
          }),
        ],
      }),
    );

    expect(byId('payouts-notice')?.textContent?.toLowerCase()).toContain('refund issued');
    expect(host.querySelectorAll('[data-testid="ledger-reason"]')).toHaveLength(1);
    expect(byId('weather-confirm')).toBeNull(); // the confirm closed after the action
  });

  it('reports a no-op (still re-reads) when the weather refund finds no confirmed bookings that day', () => {
    render(ledger());
    byId('weather-trigger')!.click();
    fixture.detectChanges();
    byId('weather-confirm-btn')!.click();
    fixture.detectChanges();
    expectWeatherPost().flush({ refundedCount: 0, totalRefundedMinor: 0, currency: 'EUR' });
    fixture.detectChanges();
    flushLedger(ledger());
    expect(byId('payouts-notice')?.textContent?.toLowerCase()).toContain('no confirmed bookings');
  });

  it('shows the not-owner copy when the weather refund is 403 (invariant #13), keeping the view', () => {
    render(ledger());
    byId('weather-trigger')!.click();
    fixture.detectChanges();
    byId('weather-confirm-btn')!.click();
    fixture.detectChanges();
    expectWeatherPost().flush({ code: 'NOT_VENUE_OWNER' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(byId('payouts-notice')?.textContent?.toLowerCase()).toContain('manage');
    expect(byId('weather-confirm')).toBeNull(); // no re-read on failure; the confirm closed
  });

  it('drops the session when the weather refund returns 401', () => {
    render(ledger());
    byId('weather-trigger')!.click();
    fixture.detectChanges();
    byId('weather-confirm-btn')!.click();
    fixture.detectChanges();
    expectWeatherPost().flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    expect(byId('payouts-notice')?.textContent?.toLowerCase()).toContain('session');
  });

  it('opens a display-only statement modal (total due = server owed, placeholder transfer details) and closes it', () => {
    render(ledger({ netOwedMinor: 3825, entries: [entry({ bookingId: 11 })] }));
    expect(byId('payout-statement')).toBeNull();

    byId('statement-open')!.click();
    fixture.detectChanges();
    const modal = byId('payout-statement')!;
    expect(modal.textContent).toContain(formatMoney({ minorUnits: 3825, currency: 'EUR' })); // total due
    expect(modal.textContent).toContain('#11'); // the same booking reference as the ledger
    expect(modal.textContent?.toLowerCase()).toContain('assigned at settlement'); // IBAN/ref placeholder

    byId('statement-close')!.click();
    fixture.detectChanges();
    expect(byId('payout-statement')).toBeNull();
  });
});
