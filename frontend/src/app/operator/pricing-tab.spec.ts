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
 * committing an integer-minor-unit reprice PUT and recomputing the projection; empty-input safety (no
 * €0 reprice); a scoped revert that survives a concurrent edit; the mixed-row and load-error states;
 * and the cross-venue (403) failure copy.
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

  function configure(): void {
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
  }

  function render(sets: SetView[] = SEED, setVersion = 0): void {
    configure();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'))
      .flush({ id: 1, name: 'V', sets, setVersion });
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  }

  function renderWithLoadError(): void {
    configure();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'))
      .flush({ code: 'INTERNAL' }, { status: 500, statusText: 'Server Error' });
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
    expect(rows()[0].getAttribute('data-row')).toBe('A');
    expect(rows()[0].textContent).toContain('Front row');
    expect(rows()[0].textContent).toContain('3 sets');
    expect(input('A').value).toBe('35');
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
    // #226: the body carries the price AND the loaded optimistic-concurrency token (0 for the fresh mock).
    expect(req.request.body).toEqual({
      price: { minorUnits: 4250, currency: 'EUR' },
      expectedVersion: 0,
    });
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

  it('ignores a cleared field instead of repricing the row to €0', () => {
    render();

    editRow('A', ''); // clear then blur — must NOT send a €0 reprice

    // No PUT is issued (afterEach http.verify() also asserts this), the input is restored, and the
    // projection is unchanged.
    http.expectNone((r) => r.method === 'PUT');
    expect(input('A').value).toBe('35');
    expect(byId('pricing-projected').textContent).toContain(formatMoney({ minorUnits: 9000, currency: 'EUR' }));
  });

  it('reverts the failing row on error without touching other rows (sequential edits)', async () => {
    render();

    // Edit A → €40; it fails (CONFLICT) and reverts to €35. A failed write does NOT advance the token.
    editRow('A', '40');
    const reqA = http.expectOne((r) => r.url.includes('/api/venues/1/rows/A/price'));
    reqA.flush({ code: 'CONFLICT' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();

    // Then edit B → €30; it succeeds. B carries the SAME token (A's failure did not advance it).
    editRow('B', '30');
    const reqB = http.expectOne((r) => r.url.includes('/api/venues/1/rows/B/price'));
    expect(reqB.request.body.expectedVersion).toBe(0);
    reqB.flush(null);
    await fixture.whenStable();
    fixture.detectChanges();

    // A reverted to €35 (3500 each), B keeps €30 (3000) — B is NOT clobbered by A's revert.
    // Projected online = 3500 + 3500 + 3000 = 10000.
    expect(input('A').value).toBe('35');
    expect(input('B').value).toBe('30');
    expect(byId('pricing-projected').textContent).toContain(
      formatMoney({ minorUnits: 10000, currency: 'EUR' }),
    );
  });

  it('serializes reprices: a second edit while one is in flight is ignored, not a concurrent PUT', async () => {
    // #226 review fix (#4): the single shared set_version token cannot admit two concurrent reprices, so a
    // save disables the inputs; a change that still slips through mid-flight is ignored (no overlap race).
    render(SEED, 5);

    // Start editing A — its PUT is in flight (not yet flushed).
    editRow('A', '40');
    const reqA = http.expectOne((r) => r.url.includes('/api/venues/1/rows/A/price'));
    expect(reqA.request.body.expectedVersion).toBe(5);

    // A second edit (row B) while A is in flight is ignored — no concurrent PUT, B's input is restored.
    editRow('B', '30');
    http.expectNone((r) => r.url.includes('/api/venues/1/rows/B/price'));
    expect(input('B').value).toBe('20');

    // A completes → token advances to 6; a subsequent B edit now sends the fresh token and succeeds.
    reqA.flush(null);
    await fixture.whenStable();
    fixture.detectChanges();
    editRow('B', '30');
    const reqB = http.expectOne((r) => r.url.includes('/api/venues/1/rows/B/price'));
    expect(reqB.request.body.expectedVersion).toBe(6);
    reqB.flush(null);
    await fixture.whenStable();
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
    expect(byId('pricing-projected').textContent).toContain(
      formatMoney({ minorUnits: 9000, currency: 'EUR' }),
    );
  });

  it('reverts the row, shows the stale banner, and Reload re-loads on a 409 STALE_WRITE', async () => {
    // #226, AC-9: a stale-write conflict reverts the row's optimistic value and shows the recover-and-
    // reload banner (a venue-level conflict, not the per-row inline error); Reload re-seeds from the server.
    render(SEED, 3); // loaded at set_version 3
    editRow('A', '99');
    http
      .expectOne((r) => r.method === 'PUT' && r.url.includes('/api/venues/1/rows/A/price'))
      .flush({ code: 'STALE_WRITE' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();

    // The optimistic €99 reverts to €35, the stale banner shows, and the inline per-row error does NOT.
    expect(input('A').value).toBe('35');
    expect(byId('pricing-stale-banner')).toBeTruthy();
    expect(host.querySelector('[data-testid="pricing-error-A"]')).toBeNull();

    // Reload pulls the latest server prices (row A now €50) + token and clears the banner.
    byId('pricing-stale-reload').click();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'))
      .flush({
        id: 1,
        name: 'V',
        sets: [seat(1, 'A', 1, 'PREMIUM', 'ONLINE', 5000, 1, 1)],
        setVersion: 4,
      });
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="pricing-stale-banner"]')).toBeNull();
    expect(input('A').value).toBe('50');
  });

  it('advances the token on a successful reprice so a second reprice is not falsely stale', async () => {
    // #226: the conditional write bumps set_version by one; the tab advances its token so a following
    // sequential row edit sends the new value, not the stale one.
    render(SEED, 5);
    editRow('A', '40');
    const first = http.expectOne((r) => r.method === 'PUT' && r.url.includes('/api/venues/1/rows/A/price'));
    expect(first.request.body.expectedVersion).toBe(5);
    first.flush(null);
    await fixture.whenStable();
    fixture.detectChanges();

    editRow('B', '30');
    const second = http.expectOne((r) => r.method === 'PUT' && r.url.includes('/api/venues/1/rows/B/price'));
    expect(second.request.body.expectedVersion).toBe(6); // advanced, not the stale 5
    second.flush(null);
    await fixture.whenStable();
  });

  it('marks a heterogeneous row as mixed with a blank input rather than a single price', () => {
    render([
      seat(1, 'A', 1, 'PREMIUM', 'ONLINE', 3500, 1, 1),
      seat(2, 'A', 2, 'PREMIUM', 'ONLINE', 4000, 2, 1), // same row, different price → mixed
    ]);

    expect(rows()[0].textContent).toContain('mixed prices');
    expect(input('A').value).toBe('');

    // Editing a mixed row unifies it: the reprice PUT carries the typed price for the whole row.
    editRow('A', '45');
    const req = http.expectOne((r) => r.method === 'PUT' && r.url.includes('/api/venues/1/rows/A/price'));
    expect(req.request.body.price.minorUnits).toBe(4500);
    req.flush(null);
  });

  it('shows a load-error message (not a false empty state) when the venue read fails', () => {
    renderWithLoadError();
    expect(byId('pricing-load-error')).toBeTruthy();
    expect(host.querySelector('[data-testid="pricing-empty"]')).toBeNull();
    expect(rows()).toHaveLength(0);
  });

  it('shows an empty state when the venue has no sets', () => {
    render([]);
    expect(byId('pricing-empty')).toBeTruthy();
    expect(host.querySelector('[data-testid="pricing-load-error"]')).toBeNull();
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
