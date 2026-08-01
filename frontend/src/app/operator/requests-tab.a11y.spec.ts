import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { expectNoAxeViolations } from '../../testing/axe';
import { MoneyView } from '../shared/money';
import { Pool, SetView, Tier } from '../shared/venue-views';
import { RequestsTab } from './requests-tab';

/**
 * Structural a11y audit for the O6 Requests tab (#176). Accept/Decline/Confirm-decline are labelled
 * `<button>`s (`aria-label` names the guest + set + date), the urgency chip carries its "time left"
 * as text (not colour alone) with the ⏰ glyph `aria-hidden`, and the expired-race notice is a
 * `role="status"` with the ⚠ glyph `aria-hidden`. axe runs over the populated queue, an open
 * decline-confirm, the expired-race card, and the empty state. (Contrast is proven by
 * `requests-tab.contrast.spec.ts` — axe can't measure it under jsdom.)
 */
describe('RequestsTab a11y (#176)', () => {
  let fixture: ComponentFixture<RequestsTab>;
  let http: HttpTestingController;

  const REQUESTS = [
    {
      bookingId: 11,
      setId: 1,
      bookingDate: '2026-07-03',
      guestName: 'Ana Guest',
      amount: { minorUnits: 4500, currency: 'EUR' } as MoneyView,
      requestedAt: '2026-07-01T09:00:00Z',
      requestExpiresAt: new Date(Date.now() + 3 * 3_600_000).toISOString(), // urgent → the chip renders
    },
  ];

  function render(requests: object[] = REQUESTS): void {
    TestBed.configureTestingModule({
      imports: [RequestsTab],
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
    fixture = TestBed.createComponent(RequestsTab);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url.includes('/api/auth/me'))
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
    http
      .expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/venues/1/booking-requests'))
      .flush(requests);
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1') && !r.url.includes('/booking-requests'))
      .flush({ id: 1, name: 'V', beach: 'Ksamil', region: 'Riviera', sets: [seat(1, 'A', 1, 'PREMIUM')] });
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function decline(): HTMLButtonElement {
    return Array.from(host().querySelectorAll('button')).find(
      (b) => (b.textContent ?? '').trim() === 'Decline',
    ) as HTMLButtonElement;
  }

  it('has no axe violations for the populated queue (with an urgent chip)', async () => {
    render();
    await expectNoAxeViolations(host());
  });

  it('has no axe violations with the inline decline confirm open', async () => {
    render();
    decline().click();
    fixture.detectChanges();
    await expectNoAxeViolations(host());
  });

  it('has no axe violations for the dismissible expired-race card', async () => {
    render();
    Array.from(host().querySelectorAll('button'))
      .find((b) => /Accept/.test(b.textContent ?? ''))!
      .click();
    fixture.detectChanges();
    http
      .expectOne((r) => r.method === 'POST' && r.url.endsWith('/booking-requests/11/accept'))
      .flush({ code: 'REQUEST_EXPIRED' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    await expectNoAxeViolations(host());
  });

  it('has no axe violations for the all-caught-up empty state', async () => {
    render([]);
    await expectNoAxeViolations(host());
  });
});

function seat(id: number, rowLabel: string, positionNo: number, tier: Tier): SetView {
  return {
    id,
    rowLabel,
    positionNo,
    tier,
    pool: 'ONLINE' as Pool,
    price: { minorUnits: 4500, currency: 'EUR' },
    gridX: positionNo,
    gridY: 1,
    availability: 'FREE',
  };
}
