import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { formatMoney } from '../shared/money';
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
            parent: { snapshot: { paramMap: convertToParamMap({ venueId: '1' }) } },
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
});
