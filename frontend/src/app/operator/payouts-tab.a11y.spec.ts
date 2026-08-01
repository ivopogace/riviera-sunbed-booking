import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { expectNoAxeViolations } from '../../testing/axe';
import { PayoutLedgerView } from './operator-console.model';
import { PayoutsTab } from './payouts-tab';

/**
 * Structural a11y audit for the O7 Payouts tab (#173). The ledger is a semantic `<table>` (sr-only
 * caption, `scope="col"` headers); reversal state is conveyed by a text reason chip + the negative
 * amount (not colour alone); the weather-refund confirm/actions are labelled `<button>`s and the
 * statement is a `role="dialog"` + `aria-modal` with a focus trap. axe runs over the populated ledger,
 * the open weather confirm, the open statement modal, and the empty state. (Contrast is proven by
 * `payouts-tab.contrast.spec.ts` — axe can't measure it under jsdom.)
 */
describe('PayoutsTab a11y (#173)', () => {
  let fixture: ComponentFixture<PayoutsTab>;
  let http: HttpTestingController;

  const LEDGER: PayoutLedgerView = {
    venueId: 1,
    currency: 'EUR',
    netOwedMinor: 1700,
    entries: [
      {
        type: 'ACCRUAL',
        bookingId: 11,
        grossMinor: 4500,
        commissionMinor: 675,
        netMinor: 3825,
        currency: 'EUR',
        reason: null,
        createdAt: '2026-07-01T09:00:00Z',
        runningNetMinor: 3825,
      },
      {
        type: 'REVERSAL',
        bookingId: 12,
        grossMinor: 2500,
        commissionMinor: 375,
        netMinor: 2125,
        currency: 'EUR',
        reason: 'WEATHER',
        createdAt: '2026-07-02T09:00:00Z',
        runningNetMinor: 1700,
      },
    ],
  };

  function render(body: PayoutLedgerView = LEDGER): void {
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
    http
      .expectOne((r) => r.url.includes('/api/auth/me'))
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
    http
      .expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/venues/1/payout-ledger'))
      .flush(body);
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }
  function byId(id: string): HTMLElement {
    return host().querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
  }

  it('has no axe violations for the populated ledger (accrual + reversal)', async () => {
    render();
    await expectNoAxeViolations(host());
  });

  it('has no axe violations with the weather-refund confirm open', async () => {
    render();
    byId('weather-trigger').click();
    fixture.detectChanges();
    await expectNoAxeViolations(host());
  });

  it('has no axe violations with the statement modal open', async () => {
    render();
    byId('statement-open').click();
    fixture.detectChanges();
    await expectNoAxeViolations(host());
  });

  it('has no axe violations for the empty ledger', async () => {
    render({ venueId: 1, currency: 'EUR', netOwedMinor: 0, entries: [] });
    await expectNoAxeViolations(host());
  });
});
