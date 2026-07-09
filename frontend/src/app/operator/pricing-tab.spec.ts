import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { formatMoney } from '../shared/money';
import { Pool, SetView, Tier } from '../venue/venue.model';
import { PricingTab } from './pricing-tab';

/**
 * The O4 Pricing tab (#174). Reads `:venueId` from the PARENT route (child routes don't inherit it —
 * O1 finding) and loads the venue map to build the per-row list. Drives: one row per label with its
 * tier description; the projected take summing ONLY online-pool sets from minor units; a per-row € edit
 * committing an integer-minor-unit reprice PUT and recomputing the projection; and the cross-venue
 * (403) failure copy.
 */
describe('PricingTab (#174)', () => {
  let fixture: ComponentFixture<PricingTab>;
  let http: HttpTestingController;
  let host: HTMLElement;

  // Row A: two ONLINE premium (3500) + one WALK_IN (3500); Row B: one ONLINE standard (2000).
  const SEED: SetView[] = [
    seat(1, 'A', 1, 'PREMIUM', 'ONLINE', 3500, 1, 1),
    seat(2, 'A', 2, 'PREMIUM', 'ONLINE', 3500, 2, 1),
    seat(3, 'A', 3, 'PREMIUM', 'WALK_IN', 3500, 3, 1),
    seat(4, 'B', 1, 'STANDARD', 'ONLINE', 2000, 1, 2),
  ];

  function render(sets: SetView[] = SEED): void {
    TestBed.configureTestingModule({
      imports: [PricingTab],
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
    fixture = TestBed.createComponent(PricingTab);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    // OperatorAuth restores the session on construction — settle it signed-out (the shell gates access).
    http
      .expectOne((r) => r.url.includes('/api/auth/me'))
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
    // The constructor loads the current layout — flush it so the rows build.
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'))
      .flush({ id: 1, name: 'V', sets });
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  }

  afterEach(() => http.verify());

  function byId(id: string): HTMLElement {
    return host.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
  }

  function rows(): HTMLElement[] {
    return Array.from(host.querySelectorAll<HTMLElement>('[data-testid="pricing-row"]'));
  }

  function input(label: string): HTMLInputElement {
    return byId(`pricing-input-${label}`) as HTMLInputElement;
  }

  function editRow(label: string, euros: string): void {
    const el = input(label);
    el.value = euros;
    el.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  it('lists one row per label with its tier description and current price', () => {
    render();

    expect(rows()).toHaveLength(2);
    // Row A: front-row (has premium sets), 3 sets, priced €35 (3500 minor / 100).
    expect(rows()[0].getAttribute('data-row')).toBe('A');
    expect(rows()[0].textContent).toContain('Front row');
    expect(rows()[0].textContent).toContain('3 sets');
    expect(input('A').value).toBe('35');
    // Row B: standard, 1 set, priced €20.
    expect(rows()[1].textContent).toContain('Standard');
    expect(input('B').value).toBe('20');
  });

  it('projects the full-day take from ONLY the online-pool sets, rendered from minor units', () => {
    render();
    // 3500 + 3500 (row A online) + 2000 (row B online) = 9000; the WALK_IN 3500 is excluded.
    expect(byId('pricing-projected').textContent).toContain(formatMoney({ minorUnits: 9000, currency: 'EUR' }));
  });

  it('commits a € edit as an integer-minor-unit reprice PUT and recomputes the projection', async () => {
    render();

    editRow('A', '42.5'); // €42.50 → 4250 minor (no float in state or on the wire)

    const req = http.expectOne(
      (r) => r.method === 'PUT' && r.url.includes('/api/venues/1/rows/A/price'),
    );
    expect(req.request.body).toEqual({ price: { minorUnits: 4250, currency: 'EUR' } });
    req.flush(null);
    await fixture.whenStable();
    fixture.detectChanges();

    // Both online A sets now 4250; projection = 4250 + 4250 + 2000 = 10500.
    expect(byId('pricing-projected').textContent).toContain(
      formatMoney({ minorUnits: 10500, currency: 'EUR' }),
    );
    expect(byId('pricing-saved-A')).toBeTruthy();
  });

  it('rounds a whole-euro edit to exact minor units', () => {
    render();
    editRow('B', '25');
    const req = http.expectOne((r) => r.method === 'PUT' && r.url.includes('/api/venues/1/rows/B/price'));
    expect(req.request.body.price.minorUnits).toBe(2500);
    req.flush(null);
  });

  it('shows the not-owner message and reverts the projection when the reprice is 403', async () => {
    render();
    editRow('A', '99');
    http
      .expectOne((r) => r.method === 'PUT' && r.url.includes('/api/venues/1/rows/A/price'))
      .flush({ code: 'NOT_VENUE_OWNER' }, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byId('pricing-error-A').textContent?.toLowerCase()).toContain('manage');
    // Reverted: the projection is back to the original 9000, not the optimistic 99×2 + 2000.
    expect(byId('pricing-projected').textContent).toContain(
      formatMoney({ minorUnits: 9000, currency: 'EUR' }),
    );
  });

  it('shows an empty state when the venue has no sets', () => {
    render([]);
    expect(byId('pricing-empty')).toBeTruthy();
    expect(rows()).toHaveLength(0);
  });
});

function seat(
  id: number,
  rowLabel: string,
  positionNo: number,
  tier: Tier,
  pool: Pool,
  minorUnits: number,
  gridX: number,
  gridY: number,
): SetView {
  return {
    id,
    rowLabel,
    positionNo,
    tier,
    pool,
    price: { minorUnits, currency: 'EUR' },
    gridX,
    gridY,
    availability: 'FREE',
  };
}
